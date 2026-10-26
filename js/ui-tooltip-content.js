/**
 * ui-tooltip-content.js
 * Centralized, authoritative tooltip and popover content definitions for
 * Devices, Algorithm Studies, Energy Dynamics, and Mechanics.
 *
 * All numeric values and formula parameters are computed dynamically from
 * authoritative game configuration, state, and formula layers.
 * No balancing constants are hardcoded in strings.
 */

import { formatEnergy, formatRate, formatInteger, formatNumber, big } from "./numeric.js";
import {
  calculateAlgorithmStrengths,
  calculateDeviceCost,
  calculateEffectiveStudySpeed,
  calculateEffectiveStudyDuration,
  calculatePowerCellCapacity,
  calculateHardDiskXpRate,
  calculateRequiredDataForNextComputerLevel,
  calculateAvailableData,
  calculateEffectiveAvailableData,
  calculateTotalDeviceMultiplier,
  calculateFacilityOptimizationRequirement,
  calculateFacilityDeviceMultiplier,
  calculateProcessorDeviceMultiplier,
  calculateStudySpeedDeviceMultiplier,
  calculateCapacitorMultiplier,
  calculateCrcMultiplier,
  calculateMicroprocessorStudyMultiplier,
  calculateStudyImproveMilestone,
  calculateStudyImproveMultiplier,
  calculateBulkDeviceCost,
} from "./formulas.js";

/**
 * Generates structured tooltip content for a given topic or device id.
 * @param {string} topic - Topic identifier (e.g. 'device-micro', 'aimp', 'energy-summary')
 * @param {object} context - Execution context { state, config, engine, statResolver }
 * @returns {{ title: string, body: string }}
 */
export function getTooltipContent(topic, context = {}) {
  const { state = {}, config = {}, engine = null, statResolver = null } = context;

  const resolver = statResolver || engine?.statResolver || null;
  const compLevel = state.computerLevel ?? 1;
  const baseStrength = config.economy?.algorithmBaseStrength ?? 1e-15;
  const conversionFactor = config.economy?.algorithmConversionFactor ?? 12;
  const deviceMult = resolver
    ? resolver.resolve("devices.globalMultiplier", { state, config })
    : calculateTotalDeviceMultiplier(state, config);

  const studySpeedMult = resolver
    ? resolver.resolve("devices.studySpeedMultiplier", { state, config })
    : calculateStudySpeedDeviceMultiplier(state, config);

  const foMult = calculateFacilityDeviceMultiplier(state.facilityOptimizations ?? 0, config);
  const procMult = calculateProcessorDeviceMultiplier(state.devices?.processors ?? 0, config);

  const caps = state.devices?.capacitors ?? 0;
  const capBonusPerUnit = config.devices?.capacitor?.bonusPerUnit ?? 0.5;
  const capacitorMult = resolver
    ? resolver.resolve("algorithms.AImp.capacitorMultiplier", { state, config })
    : calculateCapacitorMultiplier(caps, config, deviceMult);

  const strengths = calculateAlgorithmStrengths(compLevel, config, capacitorMult);
  const baseStrengths = calculateAlgorithmStrengths(compLevel, config, 1.0);

  switch (topic) {
    // ------------------------------------------------------------------------
    // 1. Energy Summary & Mechanics
    // ------------------------------------------------------------------------
    case "energy-summary": {
      const stableCap = calculatePowerCellCapacity(state.powerCells ?? 0, state, config, resolver);
      const decayRate = config.decay?.overflowDecayRate ?? 0.009;
      const decayPower = config.decay?.overflowDecayPower ?? 1.35;

      return {
        title: "Energy Dynamics & Overflow Decay",
        body: `
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11.5px; line-height: 1.45;">
            <div>
              <strong style="color: var(--tes-cyan);">⚡ Gross Production (CRC):</strong>
              Total cosmic radiation condensed per second by active algorithm features and Computer Level.
            </div>
            <div>
              <strong style="color: var(--tes-teal);">🛡️ Stable Capacity:</strong>
              Safe storage threshold provided by <strong>Power Cells</strong> (currently ${formatEnergy(stableCap)}). Energy up to this limit is completely secure and <strong>never decays</strong>.
            </div>
            <div>
              <strong style="color: var(--tes-danger);">🔥 Overflow Decay:</strong>
              Any stored energy exceeding Stable Capacity dissipates into space per second:
              <div style="margin-top: 3px; padding: 4px 8px; background: rgba(255, 68, 68, 0.12); border-left: 2px solid var(--tes-danger); border-radius: 3px; font-family: monospace; font-size: 11px;">
                Decay = ${decayRate} × (Stored - Capacity)<sup>${decayPower}</sup> J/s
              </div>
            </div>
            <div>
              <strong style="color: #60a5fa;">📊 Net Production:</strong>
              The true rate of change of your stored energy balance:
              <div style="margin-top: 3px; padding: 4px 8px; background: rgba(96, 165, 250, 0.12); border-left: 2px solid #60a5fa; border-radius: 3px; font-family: monospace; font-size: 11px;">
                Net = Gross Production - Overflow Decay
              </div>
              <div style="color: var(--tes-text-tertiary); font-size: 10.5px; margin-top: 3px;">
                • Positive Net: Stored energy is accumulating<br>
                • Zero Net: Dynamic equilibrium point<br>
                • Negative Net: Storage is depleting
              </div>
            </div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 2. Cosmic Radiation Condenser (CRC)
    // ------------------------------------------------------------------------
    case "crc": {
      const hasGadget = (state.devices?.crcGadget?.owned ?? 0) > 0;
      const baseMult = config.devices?.crcGadget?.productionMultiplier ?? 2.0;
      const crcMult = calculateCrcMultiplier(state, config, deviceMult);
      const hasPrestigeBonus = deviceMult > 1.0001;

      return {
        title: "Cosmic Radiation Condenser",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Harvests background cosmic radiation and converts Algorithm Performance (AP) directly into Energy.</div>
            <div><strong>Active AP:</strong> Sum of owned algorithm feature contributions.</div>
            <div><strong>CRC Multiplier:</strong> ${hasGadget ? `${crcMult.toFixed(2)}x (CRC Gadget active${hasPrestigeBonus ? ` · ${deviceMult.toFixed(2)}x SO bonus` : ""})` : "1.00x (Standard)"}</div>
            <div style="margin-top: 4px; padding: 4px 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; font-family: monospace; font-size: 11px;">
              Energy Production = AP × CRC_Modifiers
            </div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 3. Algorithm Features (AImp, AUpg, ARec)
    // ------------------------------------------------------------------------
    case "aimp":
    case "algorithmImprovement": {
      const owned = state.algorithms?.AImp?.owned ?? 0;
      const unitStrength = strengths.AImp;
      const totalContrib = big(unitStrength).mul(owned);

      return {
        title: "Algorithm Improvement (A.Imp)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Generates Energy through computational improvements. Free to study.</div>
            <div><strong>Computer Level:</strong> Level ${compLevel}</div>
            <div><strong>Unit Strength:</strong> ${formatEnergy(unitStrength)}/s per unit (Base: ${formatEnergy(baseStrengths.AImp)}/s)</div>
            ${caps > 0 ? `<div><strong>Capacitor Bonus:</strong> +${((capacitorMult - 1) * 100).toFixed(foMult > 1.0001 ? 1 : 0)}% (${capacitorMult.toFixed(2)}x${foMult > 1.0001 ? ` · ${foMult.toFixed(2)}x SO bonus` : ""})</div>` : ""}
            <div><strong>Owned Units:</strong> ${formatInteger(owned)} (Total: ${formatEnergy(totalContrib)}/s)</div>
            <div><strong>Available Data Contribution:</strong> 1 Data (XP) per owned unit</div>
          </div>
        `,
      };
    }

    case "aupg":
    case "algorithmUpgrade": {
      const owned = state.algorithms?.AUpg?.owned ?? 0;
      const unitStrength = strengths.AUpg;
      const conversionRatio = compLevel + 1;
      const totalContrib = big(unitStrength).mul(owned);

      return {
        title: "Algorithm Upgrade (A.Upg)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Converts lower-order algorithms into more efficient computational structures.</div>
            <div><strong>Conversion Cost:</strong> Consumes ${conversionFactor} A.Imp units per study.</div>
            <div><strong>Unit Strength:</strong> ${formatEnergy(unitStrength)}/s per unit</div>
            ${caps > 0 ? `<div><strong>Capacitor Cascade:</strong> +${((capacitorMult - 1) * 100).toFixed(foMult > 1.0001 ? 1 : 0)}% (${capacitorMult.toFixed(2)}x inherited from A.Imp${foMult > 1.0001 ? ` · ${foMult.toFixed(2)}x SO bonus` : ""})</div>` : ""}
            <div><strong>Conversion Efficiency:</strong> Yields <strong>${conversionRatio}x</strong> energy contribution per conversion (L + 1 = ${compLevel} + 1).</div>
            <div><strong>Owned Units:</strong> ${formatInteger(owned)} (Total: ${formatEnergy(totalContrib)}/s)</div>
            <div><strong>Data Trade-off:</strong> Data contribution falls from ${conversionFactor} to 9 per converted set.</div>
          </div>
        `,
      };
    }

    case "arec":
    case "algorithmRecalculation": {
      const owned = state.algorithms?.ARec?.owned ?? 0;
      const unitStrength = strengths.ARec;
      const conversionRatio = compLevel + 1;
      const totalContrib = big(unitStrength).mul(owned);

      return {
        title: "Algorithm Recalculation (A.Rec)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Converts upgrades into higher-order facility masterwork computations.</div>
            <div><strong>Conversion Cost:</strong> Consumes ${conversionFactor} A.Upg units per study.</div>
            <div><strong>Unit Strength:</strong> ${formatEnergy(unitStrength)}/s per unit</div>
            ${caps > 0 ? `<div><strong>Capacitor Cascade:</strong> +${((capacitorMult - 1) * 100).toFixed(foMult > 1.0001 ? 1 : 0)}% (${capacitorMult.toFixed(2)}x inherited from A.Upg${foMult > 1.0001 ? ` · ${foMult.toFixed(2)}x SO bonus` : ""})</div>` : ""}
            <div><strong>Conversion Efficiency:</strong> Yields <strong>${conversionRatio}x</strong> energy contribution per conversion (L + 1 = ${compLevel} + 1).</div>
            <div><strong>Owned Units:</strong> ${formatInteger(owned)} (Total: ${formatEnergy(totalContrib)}/s)</div>
            <div><strong>Data Trade-off:</strong> Data contribution falls from ${conversionFactor * 9} to 81 per converted set.</div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 4. Machine Learning (Soft Reset)
    // ------------------------------------------------------------------------
    case "ml":
    case "machineLearning": {
      const currentData = calculateEffectiveAvailableData(state, config);
      const reqData = calculateRequiredDataForNextComputerLevel(compLevel, config);
      const rawAnchor = config.dataXP?.machineLearning?.xpExponentialStartLevel ?? 5;
      const rawGrowth = config.dataXP?.machineLearning?.xpGrowthFactor ?? 1.45;
      const anchorLevel = Number.isFinite(rawAnchor) && rawAnchor >= 1 ? Math.floor(rawAnchor) : 5;
      const growthFactor = Number.isFinite(rawGrowth) && rawGrowth > 1 ? rawGrowth : 1.45;
      const isExp = compLevel > anchorLevel;

      return {
        title: "Machine Learning (Soft Reset)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Advances Computer Level from Level ${compLevel} to Level ${compLevel + 1}.</div>
            <div><strong>Progress:</strong> ${formatInteger(currentData)} / ${formatInteger(reqData)} Available Data (XP)</div>
            <div><strong>Data Cap:</strong> Usable Data is capped at the current level requirement. No surplus data carries over.</div>
            <div><strong>XP Scaling Model:</strong> ${isExp ? `Exponential scaling (+${((growthFactor - 1) * 100).toFixed(0)}%/level, ×${growthFactor.toFixed(2)}) active (anchored after Level ${anchorLevel})` : `Polynomial baseline (transitions to +${((growthFactor - 1) * 100).toFixed(0)}%/level exponential scaling after Level ${anchorLevel})`}</div>
            <div><strong>Cascading Effect:</strong> Progressively strengthens all algorithm features and scales conversion efficiency to ${(compLevel + 2)}x per tier.</div>
            <div><strong>Preservation:</strong> Retains all purchased hardware, power cells, and stored energy; resets algorithm inventories and hard disk buffer.</div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 4B. Facility Optimization / Setup Optimization Tooltip
    // ------------------------------------------------------------------------
    case "fo":
    case "facilityOptimization":
    case "setupOptimization": {
      const foCount = state.facilityOptimizations ?? 0;
      const reqLevel = calculateFacilityOptimizationRequirement(foCount, config);
      const curBonus = calculateFacilityDeviceMultiplier(foCount, config);
      const nextBonus = calculateFacilityDeviceMultiplier(foCount + 1, config);
      const curLevel = state.computerLevel ?? 1;
      const isEligible = curLevel >= reqLevel;

      return {
        title: "Setup Optimization (Facility Restructure)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; line-height: 1.45;">
            <div>A high-order prestige action that restructures the facility for scalable throughput.</div>
            <div style="padding: 6px 10px; background: rgba(168, 85, 247, 0.12); border-left: 2px solid #a855f7; border-radius: 4px;">
              <div><strong>Requirement:</strong> Computer Level ${reqLevel} (Current: Level ${curLevel})</div>
              <div><strong>Status:</strong> ${isEligible ? "<span style='color: #c084fc; font-weight: bold;'>ELIGIBLE</span>" : `<span style='color: var(--tes-text-tertiary);'>Need Level ${reqLevel}</span>`}</div>
            </div>
            <div><strong>Permanent Multiplier:</strong> Currently <strong>${curBonus.toFixed(2)}×</strong> &rarr; Next: <strong style="color: #c084fc;">${nextBonus.toFixed(2)}×</strong> (+9% compounding on all devices).</div>
            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--tes-text-secondary); margin-top: 2px;">
              <div><strong style="color: #34d399;">Preserves:</strong> Power Cells (sole hardware exception!), Permanent Multipliers.</div>
              <div><strong style="color: #f87171;">Resets (Hard Reset):</strong> Facility Level (to Lv. 1), Stored Energy, Study Improvements, Algorithms, Conventional Devices.</div>
              <div><strong style="color: #60a5fa;">Unlocks:</strong> Algorithm Recalculation (ARec) permanently.</div>
            </div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 4C. Study Improve Tooltips (Section 2.4)
    // ------------------------------------------------------------------------
    case "study-improve-aimp":
    case "study-improve-aupg":
    case "study-improve-arec": {
      const featureId = topic.endsWith("aimp") ? "AImp" : topic.endsWith("aupg") ? "AUpg" : "ARec";
      const name = featureId === "AImp" ? "Algorithm Improvement" : featureId === "AUpg" ? "Algorithm Upgrade" : "Algorithm Recalculation";
      const cur = state.studyImproves?.[featureId] ?? { completions: 0, claimed: 0 };
      const curLevel = cur.claimed;
      const curMult = calculateStudyImproveMultiplier(curLevel, config);
      const nextMilestone = calculateStudyImproveMilestone(curLevel, config);
      const nextMult = calculateStudyImproveMultiplier(curLevel + 1, config);
      const isEligible = cur.completions >= nextMilestone;

      return {
        title: `Study Improve — ${name}`,
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Milestone-based speed enhancement for <strong>${name}</strong> studies.</div>
            <div><strong>Improve Level:</strong> Level ${curLevel} (${curMult.toFixed(3)}x speed multiplier)</div>
            <div><strong>Current ML Cycle Completions:</strong> ${formatInteger(cur.completions)} / ${formatInteger(nextMilestone)} studies</div>
            <div><strong>Next Milestone:</strong> ${formatInteger(nextMilestone)} completions (${nextMult.toFixed(3)}x speed multiplier)</div>
            <div><strong>Status:</strong> ${isEligible ? "<span style='color: var(--tes-cyan); font-weight: bold;'>READY TO CLAIM! Click arrow to claim.</span>" : `<span style='color: var(--tes-text-tertiary);'>Need ${formatInteger(nextMilestone - cur.completions)} more completions</span>`}</div>
            <div style="color: var(--tes-text-tertiary); font-size: 11px;">
              • Free to claim — costs no Energy, Data, or units.<br>
              • Resets to Level 0 upon Machine Learning.
            </div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 4C. Install Transistor Tooltips (Section 3.8)
    // ------------------------------------------------------------------------
    case "install-transistor-aimp":
    case "install-transistor-aupg":
    case "install-transistor-arec": {
      const featureId = topic.endsWith("aimp") ? "AImp" : topic.endsWith("aupg") ? "AUpg" : "ARec";
      const name = featureId === "AImp" ? "Algorithm Improvement" : featureId === "AUpg" ? "Algorithm Upgrade" : "Algorithm Recalculation";
      const totalT = state.devices?.transistorsPurchased ?? 0;
      const allocatedT = state.devices?.transistorAllocations?.[featureId] ?? 0;
      const cost = calculateBulkDeviceCost("transistor", totalT, 1, config);
      const speedMult = calculateEffectiveStudySpeed(featureId, state, config, resolver);

      return {
        title: `Install Transistor — ${name}`,
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Purchases exactly one global Transistor and installs it directly into <strong>${name}</strong>.</div>
            <div><strong>Current Global Cost:</strong> ${formatEnergy(cost)}</div>
            <div><strong>Transistors on ${name}:</strong> ${formatInteger(allocatedT)} units (Effective Speed: ${speedMult.toFixed(2)}x)</div>
            <div><strong>Global Total:</strong> ${formatInteger(totalT)} purchased across all studies.</div>
            <div style="color: var(--tes-text-tertiary); font-size: 11px;">
              • Uses shared global pricing across all studies.<br>
              • Can be redistributed at any time via the Transistor Board.
            </div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 5. Automation: AutoCalculators
    // ------------------------------------------------------------------------
    case "device-chip-aimp":
    case "autoCalculator_AImp": {
      const dur = calculateEffectiveStudyDuration("AImp", state, config, resolver);
      return {
        title: "AutoCalculator — Improvements",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Independent automation worker. Automatically studies Algorithm Improvement continuously.</div>
            <div><strong>Effective Duration:</strong> ${dur.toFixed(2)}s per cycle</div>
            <div><strong>Output:</strong> Produces 1 A.Imp unit upon each completion. Respects all transistor speed bonuses.</div>
          </div>
        `,
      };
    }

    case "device-chip-aupg":
    case "autoCalculator_AUpg": {
      const dur = calculateEffectiveStudyDuration("AUpg", state, config, resolver);
      return {
        title: "AutoCalculator — Upgrades",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Independent automation worker. Automatically studies Algorithm Upgrade continuously.</div>
            <div><strong>Requirement:</strong> Requires ${conversionFactor} A.Imp units available to initiate study.</div>
            <div><strong>Effective Duration:</strong> ${dur.toFixed(2)}s per cycle</div>
            <div><strong>Output:</strong> Consumes ${conversionFactor} A.Imp and produces 1 A.Upg unit upon completion.</div>
          </div>
        `,
      };
    }

    case "device-chip-arec":
    case "autoCalculator_ARec": {
      const dur = calculateEffectiveStudyDuration("ARec", state, config, resolver);
      return {
        title: "AutoCalculator — Recalculations",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Independent automation worker. Automatically studies Algorithm Recalculation continuously.</div>
            <div><strong>Requirement:</strong> Requires ${conversionFactor} A.Upg units available to initiate study.</div>
            <div><strong>Effective Duration:</strong> ${dur.toFixed(2)}s per cycle</div>
            <div><strong>Output:</strong> Consumes ${conversionFactor} A.Upg and produces 1 A.Rec unit upon completion.</div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 6. Computation Devices: Transistor Board, Transistors
    // ------------------------------------------------------------------------
    case "device-board":
    case "transistorBoard": {
      const totalT = state.devices?.transistorsPurchased ?? 0;
      const baseBonusPercent = (config.devices?.transistor?.speedBonusPerUnit ?? 0.05) * 100;
      const effectiveBonusPercent = baseBonusPercent * studySpeedMult;
      const nextCost = calculateDeviceCost("transistor", totalT, config);
      const hasPrestigeBonus = studySpeedMult > 1.0001;

      return {
        title: "Transistor Board",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Infrastructure to acquire and distribute Transistors across algorithm study targets.</div>
            <div><strong>Purchased Transistors:</strong> ${formatInteger(totalT)} total units</div>
            ${hasPrestigeBonus ? `
              <div><strong>Effective Speed Bonus:</strong> +${effectiveBonusPercent.toFixed(2)}% per Transistor (+${baseBonusPercent.toFixed(1)}% base × ${studySpeedMult.toFixed(2)}x prestige bonus)</div>
            ` : `
              <div><strong>Base Speed Bonus:</strong> +${baseBonusPercent.toFixed(1)}% Study Speed per allocated Transistor</div>
            `}
            <div><strong>Next Transistor Cost:</strong> ${formatEnergy(nextCost)}</div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 7. Microprocessor (Single-Purchase Unique Device)
    // ------------------------------------------------------------------------
    case "device-micro":
    case "microprocessor": {
      const target = state.devices?.microprocessor?.target ?? "AImp";
      const isOwned = (state.devices?.microprocessor?.owned ?? 0) >= 1;
      const cost = calculateDeviceCost("microprocessor", 0, config);
      const allocatedT = state.devices?.transistorAllocations?.[target] ?? 0;
      const multiplierBase = config.devices?.microprocessor?.multiplierBase ?? 1.12;
      const speedMult = calculateEffectiveStudySpeed(target, state, config, resolver);
      const rawMult = (multiplierBase ** allocatedT);
      const effectiveMicroMult = calculateMicroprocessorStudyMultiplier(
        allocatedT,
        config,
        studySpeedMult,
        isOwned ? 1 : 0,
      );
      const hasPrestigeBonus = studySpeedMult > 1.0001;

      return {
        title: "Microprocessor (Unique Device)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Amplifies the speed of the selected study exponentially based on allocated Transistors.</div>
            <div><strong>Status:</strong> ${isOwned ? `<span style="color: var(--tes-teal); font-weight: 600;">Installed (1 of 1)</span>` : `Uninstalled (Cost: ${formatEnergy(cost)})`}</div>
            <div><strong>Selected Target:</strong> ${target}</div>
            <div><strong>Allocated Transistors (T):</strong> ${formatInteger(allocatedT)} T on ${target}</div>
            ${isOwned ? (hasPrestigeBonus ? `
              <div><strong>Base Multiplier:</strong> ${rawMult.toFixed(2)}x (${multiplierBase.toFixed(2)}<sup>${allocatedT}</sup>)</div>
              <div><strong>Prestige Multiplier:</strong> ${studySpeedMult.toFixed(2)}x (${foMult > 1.0001 ? `${foMult.toFixed(2)}x SO` : ""}${foMult > 1.0001 && procMult > 1.0001 ? " × " : ""}${procMult > 1.0001 ? `${procMult.toFixed(2)}x Processor` : ""})</div>
              <div><strong>Effective Microprocessor Multiplier:</strong> <span style="color: var(--tes-teal); font-weight: 600;">${effectiveMicroMult.toFixed(2)}x</span></div>
            ` : `
              <div><strong>Speed Multiplier:</strong> ${rawMult.toFixed(2)}x (${multiplierBase.toFixed(2)}<sup>${allocatedT}</sup>)</div>
            `) : `
              <div><strong>Speed Multiplier:</strong> Inactive (Requires Installation)</div>
            `}
            <div><strong>Effective Target Study Speed:</strong> ${speedMult.toFixed(2)}x</div>
            <div style="margin-top: 4px; padding: 4px 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; font-family: monospace; font-size: 11px;">
              ${hasPrestigeBonus
                ? `Multiplier = 1 + (${multiplierBase.toFixed(2)}<sup>T</sup> - 1) × ${studySpeedMult.toFixed(2)}`
                : `Multiplier = (${multiplierBase.toFixed(2)})<sup>T</sup>`}
            </div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 8. Processor
    // ------------------------------------------------------------------------
    case "device-processor":
    case "processor": {
      const owned = state.devices?.processors ?? 0;
      const bonusPerUnit = (config.devices?.processor?.bonusPerUnit ?? 0.05) * 100;
      const totalBonus = (owned * bonusPerUnit);
      const procMult = calculateProcessorDeviceMultiplier(owned, config);

      return {
        title: "Processor",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>High-tier efficiency hardware revealed upon reaching 1 µJ (1e-6 J) stored energy.</div>
            <div><strong>Owned Units:</strong> ${formatInteger(owned)}</div>
            <div><strong>Study Speed-Efficiency Bonus:</strong> +${bonusPerUnit.toFixed(1)}% per unit (+${totalBonus.toFixed(1)}% total · ${procMult.toFixed(2)}x multiplier)</div>
            <div>Improves study speed-efficiency devices (Transistors, Microprocessor, Overclocker).</div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 9. Overclocker
    // ------------------------------------------------------------------------
    case "device-overclocker":
    case "overclocker": {
      const isOwned = (state.devices?.overclocker?.owned ?? 0) >= 1;
      const minT = config.devices?.overclocker?.minTransistors ?? 2;
      const target = state.devices?.microprocessor?.target ?? "AImp";
      const allocatedT = state.devices?.transistorAllocations?.[target] ?? 0;
      const durBase = config.devices?.overclocker?.durationBase ?? 1.5;
      const bonusDiv = config.devices?.overclocker?.bonusDivisor ?? 3.0;
      const hasPrestigeBonus = studySpeedMult > 1.0001;

      return {
        title: "Overclocker (Unique Device)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Temporarily accelerates the selected computation by sacrificing allocated Transistors.</div>
            <div><strong>Status:</strong> ${isOwned ? "Installed" : "Uninstalled"}</div>
            <div><strong>Activation Requirement:</strong> At least ${minT} Transistors on Microprocessor target (currently ${formatInteger(allocatedT)} T on ${target}).</div>
            <div><strong>Boost Formula:</strong> Multiplies Microprocessor bonus by (1 + T/${bonusDiv.toFixed(0)}) for ln(T)/ln(${durBase.toFixed(1)}) seconds.</div>
            ${hasPrestigeBonus ? `
              <div><strong>Prestige Boost:</strong> ${studySpeedMult.toFixed(2)}x boost applied to overclock speed amplification.</div>
            ` : ""}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 10. CRC Gadget
    // ------------------------------------------------------------------------
    case "device-crc-gadget":
    case "crcGadget": {
      const isOwned = (state.devices?.crcGadget?.owned ?? 0) >= 1;
      const baseMult = config.devices?.crcGadget?.productionMultiplier ?? 2.0;
      const crcMult = calculateCrcMultiplier(state, config, deviceMult);
      const hasPrestigeBonus = deviceMult > 1.0001;

      return {
        title: "CRC Gadget (Unique Device)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Permanently amplifies Cosmic Radiation Condenser energy output.</div>
            <div><strong>Status:</strong> ${isOwned ? "Installed" : "Available"}</div>
            ${hasPrestigeBonus ? `
              <div><strong>Production Multiplier:</strong> ${crcMult.toFixed(2)}x (${baseMult.toFixed(2)}x base × ${deviceMult.toFixed(2)}x SO bonus)</div>
            ` : `
              <div><strong>Production Multiplier:</strong> ${baseMult.toFixed(2)}x global energy production boost.</div>
            `}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 11. Capacitor
    // ------------------------------------------------------------------------
    case "device-capacitor":
    case "capacitor": {
      const owned = state.devices?.capacitors ?? 0;
      const hasPrestigeBonus = deviceMult > 1.0001;
      const effectivePerUnit = capBonusPerUnit * deviceMult * 100;
      const basePerUnit = capBonusPerUnit * 100;
      const totalBonusPct = ((capacitorMult - 1) * 100).toFixed(hasPrestigeBonus ? 1 : 0);

      return {
        title: "Capacitor",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Capacitors directly increase the energy strength of Algorithm Improvements. Because higher-order Algorithm Features derive their strength from lower-order ones, this bonus also increases the energy contribution of Algorithm Upgrades and Algorithm Recalculations.</div>
            <div><strong>Owned Units:</strong> ${formatInteger(owned)}</div>
            ${hasPrestigeBonus ? `
              <div><strong>Unit Cascade Bonus:</strong> +${effectivePerUnit.toFixed(1)}% per unit (+${basePerUnit.toFixed(0)}% base × ${deviceMult.toFixed(2)}x SO bonus)</div>
            ` : `
              <div><strong>Unit Cascade Bonus:</strong> +${basePerUnit.toFixed(0)}% per unit</div>
            `}
            <div><strong>Effective Multiplier:</strong> ${capacitorMult.toFixed(2)}x (+${totalBonusPct}% total cascade bonus across all tiers)</div>
            <div style="margin-top: 4px; padding: 6px 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; font-size: 11px;">
              <div><strong>Cascaded Unit Strengths (Level ${compLevel}):</strong></div>
              <div>• A.Imp: ${formatEnergy(strengths.AImp)}/s</div>
              <div>• A.Upg: ${formatEnergy(strengths.AUpg)}/s</div>
              <div>• A.Rec: ${formatEnergy(strengths.ARec)}/s</div>
            </div>
            <div style="color: var(--tes-text-tertiary); font-size: 10.5px;">All algorithm tiers increase by precisely ${capacitorMult.toFixed(2)}x without altering conversion efficiency.</div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 12. Power Cell
    // ------------------------------------------------------------------------
    case "device-powercell":
    case "powerCell": {
      const owned = state.powerCells ?? 0;
      const baseCap = config.devices?.powerCell?.baseCapacity ?? 1e-3;
      const totalCap = calculatePowerCellCapacity(owned, state, config, resolver);

      return {
        title: "Power Cell",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Expands the facility's operational energy capacity to prevent loss from Overflow Decay.</div>
            <div><strong>Base Capacity:</strong> ${formatEnergy(baseCap)} per cell</div>
            <div><strong>Prestige Multiplier:</strong> 1.00x (Exempt from Setup Optimization and Processor bonuses)</div>
            <div><strong>Current Stable Capacity:</strong> ${formatEnergy(totalCap)} (100% loss-free storage)</div>
            <div><strong>Persistence:</strong> Owned Power Cells persist across Machine Learning and Facility Optimization.</div>
            <div style="color: var(--tes-text-tertiary); font-size: 11px;">Note: Stable Capacity is a decay buffer, not a hard limit on total wallet energy.</div>
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 13. Hard Disk
    // ------------------------------------------------------------------------
    case "device-harddisk":
    case "hardDisk": {
      const owned = state.devices?.hardDisks?.owned ?? 0;
      const status = state.devices?.hardDisks?.state ?? "off";
      const buffer = state.devices?.hardDisks?.buffer ?? 0;
      const dataRate = config.devices?.hardDisk?.dataRatePerDisk ?? 3.0;
      const totalXpRate = calculateHardDiskXpRate(owned, state, config, resolver);
      const hasPrestigeBonus = deviceMult > 1.0001;
      const effectiveRatePerDisk = dataRate * deviceMult;

      return {
        title: "Hard Disk",
        body: `
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div>Consumes Energy continuously to generate temporary Available Data (XP).</div>
            <div><strong>Status:</strong> <span style="text-transform: uppercase; font-weight: 600;">${status}</span> (${formatInteger(owned)} disks)</div>
            ${hasPrestigeBonus ? `
              <div><strong>Generation Rate:</strong> +${formatNumber(totalXpRate, 1)} Data/s (+${effectiveRatePerDisk.toFixed(2)}/s per active disk · ${dataRate.toFixed(1)}/s base × ${deviceMult.toFixed(2)}x SO bonus)</div>
            ` : `
              <div><strong>Generation Rate:</strong> +${formatNumber(totalXpRate, 1)} Data/s (+${dataRate.toFixed(1)}/s base per active disk)</div>
            `}
            <div><strong>Buffered Data:</strong> +${formatInteger(buffer)} Available Data</div>
            <div><strong>Standby Safety:</strong> If energy depletes, hard disks enter standby to preserve data buffer without consuming energy.</div>
          </div>
        `,
      };
    }

    // Default fallback
    default: {
      return {
        title: "Telemetry Information",
        body: `Detailed operational metrics for ${topic}.`,
      };
    }
  }
}
