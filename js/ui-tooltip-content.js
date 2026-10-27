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
  calculateBackpropagatorMultiplier,
} from "./formulas.js";

const INFO_FOOTER = `<div style="margin-top: 6px; font-size: 11px; color: var(--tes-text-tertiary); font-style: italic;">Read more on Info Section</div>`;

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
    case "energy-summary":
    case "stored_energy": {
      const stableCap = calculatePowerCellCapacity(state.powerCells ?? 0, state, config, resolver);
      const decayRate = config.decay?.overflowDecayRate ?? 0.009;
      const decayPower = config.decay?.overflowDecayPower ?? 1.35;

      return {
        title: "Energy Dynamics & Overflow Decay",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; line-height: 1.45;">
            <div><strong style="color: var(--tes-cyan);">⚡ Gross Production:</strong> Cosmic radiation condensed into Energy per second.</div>
            <div><strong style="color: var(--tes-teal);">🛡️ Stable Capacity:</strong> ${formatEnergy(stableCap)} (safe threshold provided by Power Cells; energy below never decays).</div>
            <div><strong style="color: var(--tes-danger);">🔥 Overflow Decay:</strong> Excess energy decays superlinearly (${decayRate} × ΔE<sup>${decayPower}</sup> J/s).</div>
            <div><strong style="color: #60a5fa;">📊 Net Production:</strong> Gross Production - Overflow Decay.</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 2. Cosmic Radiation Condenser (CRC)
    // ------------------------------------------------------------------------
    case "crc":
    case "crc_production": {
      const hasGadget = (state.devices?.crcGadget?.owned ?? 0) > 0;
      const baseMult = config.devices?.crcGadget?.productionMultiplier ?? 2.0;
      const crcMult = calculateCrcMultiplier(state, config, deviceMult);
      const hasPrestigeBonus = deviceMult > 1.0001;

      return {
        title: "Cosmic Radiation Condenser",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Harvests background cosmic radiation, converting Algorithm Performance (AP) directly into Energy.</div>
            <div><strong>Active AP:</strong> Sum of owned algorithm feature contributions.</div>
            <div><strong>Production Multiplier:</strong> ${hasGadget ? `${crcMult.toFixed(2)}x (CRC Gadget active${hasPrestigeBonus ? ` · ${deviceMult.toFixed(2)}x SO bonus` : ""})` : "1.00x (Standard)"}</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 3. Algorithm Features (AImp, AUpg, ARec, ARed)
    // ------------------------------------------------------------------------
    case "aimp":
    case "algorithmImprovement":
    case "aimp_study": {
      const owned = state.algorithms?.AImp?.owned ?? 0;
      const unitStrength = strengths.AImp;
      const totalContrib = big(unitStrength).mul(owned);

      return {
        title: "Algorithm Improvement (A.Imp)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>First-tier computational study generating baseline Energy and Data. Free to study.</div>
            <div><strong>Unit Strength:</strong> ${formatEnergy(unitStrength)}/s per unit (Base: ${formatEnergy(baseStrengths.AImp)}/s)</div>
            ${caps > 0 ? `<div><strong>Capacitor Bonus:</strong> +${((capacitorMult - 1) * 100).toFixed(foMult > 1.0001 ? 1 : 0)}% (${capacitorMult.toFixed(2)}x${foMult > 1.0001 ? ` · ${foMult.toFixed(2)}x SO bonus` : ""})</div>` : ""}
            <div><strong>Owned Units:</strong> ${formatInteger(owned)} (${formatEnergy(totalContrib)}/s · 1 Data/unit)</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    case "aupg":
    case "algorithmUpgrade":
    case "aupg_study": {
      const owned = state.algorithms?.AUpg?.owned ?? 0;
      const unitStrength = strengths.AUpg;
      const conversionRatio = compLevel + 1;
      const totalContrib = big(unitStrength).mul(owned);

      return {
        title: "Algorithm Upgrade (A.Upg)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Second-tier study converting lower-order algorithms into higher efficiency.</div>
            <div><strong>Conversion Cost:</strong> Consumes ${conversionFactor} A.Imp units per study.</div>
            <div><strong>Unit Strength:</strong> ${formatEnergy(unitStrength)}/s (${conversionRatio}x conversion efficiency)</div>
            ${caps > 0 ? `<div><strong>Capacitor Cascade:</strong> +${((capacitorMult - 1) * 100).toFixed(foMult > 1.0001 ? 1 : 0)}% (${capacitorMult.toFixed(2)}x inherited${foMult > 1.0001 ? ` · ${foMult.toFixed(2)}x SO bonus` : ""})</div>` : ""}
            <div><strong>Owned Units:</strong> ${formatInteger(owned)} (${formatEnergy(totalContrib)}/s · 9 Data/unit)</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    case "arec":
    case "algorithmRecalculation":
    case "arec_study": {
      const owned = state.algorithms?.ARec?.owned ?? 0;
      const unitStrength = strengths.ARec;
      const conversionRatio = compLevel + 1;
      const totalContrib = big(unitStrength).mul(owned);

      return {
        title: "Algorithm Recalculation (A.Rec)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Third-tier masterwork computation unlocked in Setup Optimization 1.</div>
            <div><strong>Conversion Cost:</strong> Consumes ${conversionFactor} A.Upg units per study.</div>
            <div><strong>Unit Strength:</strong> ${formatEnergy(unitStrength)}/s (${conversionRatio}x conversion efficiency)</div>
            ${caps > 0 ? `<div><strong>Capacitor Cascade:</strong> +${((capacitorMult - 1) * 100).toFixed(foMult > 1.0001 ? 1 : 0)}% (${capacitorMult.toFixed(2)}x inherited${foMult > 1.0001 ? ` · ${foMult.toFixed(2)}x SO bonus` : ""})</div>` : ""}
            <div><strong>Owned Units:</strong> ${formatInteger(owned)} (${formatEnergy(totalContrib)}/s · 81 Data/unit)</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    case "ared":
    case "algorithmRedesign":
    case "ared_study": {
      const owned = state.algorithms?.ARed?.owned ?? 0;
      const unitStrength = strengths.ARed ?? 0;
      const conversionRatio = compLevel + 1;
      const totalContrib = big(unitStrength).mul(owned);

      return {
        title: "Algorithm Redesign (A.Red)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Fourth-tier masterwork computation unlocked in Setup Optimization 2.</div>
            <div><strong>Conversion Cost:</strong> Consumes ${conversionFactor} A.Rec units per study.</div>
            <div><strong>Unit Strength:</strong> ${formatEnergy(unitStrength)}/s (${conversionRatio}x conversion efficiency)</div>
            ${caps > 0 ? `<div><strong>Capacitor Cascade:</strong> +${((capacitorMult - 1) * 100).toFixed(foMult > 1.0001 ? 1 : 0)}% (${capacitorMult.toFixed(2)}x inherited${foMult > 1.0001 ? ` · ${foMult.toFixed(2)}x SO bonus` : ""})</div>` : ""}
            <div><strong>Owned Units:</strong> ${formatInteger(owned)} (${formatEnergy(totalContrib)}/s · ${config.dataXP?.aRedData ?? 729} Data/unit)</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 4. Machine Learning (Soft Reset)
    // ------------------------------------------------------------------------
    case "ml":
    case "machineLearning":
    case "machine_learning": {
      const currentData = calculateEffectiveAvailableData(state, config);
      const reqData = calculateRequiredDataForNextComputerLevel(compLevel, config);

      return {
        title: "Machine Learning (Soft Reset)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Advances Computer Level to increase algorithmic strength and conversion efficiency.</div>
            <div><strong>Progress:</strong> ${formatInteger(currentData)} / ${formatInteger(reqData)} Available Data (XP)</div>
            <div><strong>Conversion Yield:</strong> Scales conversion yield to ${(compLevel + 2)}x per tier.</div>
            <div><strong>Preservation:</strong> Retains all hardware devices, Power Cells, and Stored Energy.</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 4B. Facility Optimization / Setup Optimization Tooltip
    // ------------------------------------------------------------------------
    case "fo":
    case "facilityOptimization":
    case "setupOptimization":
    case "facility_level": {
      const foCount = state.facilityOptimizations ?? 0;
      const reqLevel = calculateFacilityOptimizationRequirement(foCount, config);
      const curBonus = calculateFacilityDeviceMultiplier(foCount, config);
      const nextBonus = calculateFacilityDeviceMultiplier(foCount + 1, config);
      const curLevel = state.computerLevel ?? 1;
      const isEligible = curLevel >= reqLevel;

      return {
        title: "Setup Optimization (Facility Restructure)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px; line-height: 1.4;">
            <div>High-order prestige restructuring the facility for scalable throughput.</div>
            <div><strong>Requirement:</strong> Computer Level ${reqLevel} (Current: Level ${curLevel} · ${isEligible ? "<span style='color: #c084fc; font-weight: bold;'>Ready</span>" : "Locked"})</div>
            <div><strong>Logarithmic SO Bonus:</strong> ${curBonus.toFixed(2)}× &rarr; Next: <strong style="color: #c084fc;">${nextBonus.toFixed(2)}×</strong> on eligible devices.</div>
            <div><strong>Preserves:</strong> Computer Level, Power Cells, and Permanent Multipliers.</div>
            <div><strong>Milestone Unlocks:</strong> SO1 &rarr; A.Rec · SO2 &rarr; A.Red · SO3 &rarr; Backpropagator.</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 4C. Study Improve Tooltips
    // ------------------------------------------------------------------------
    case "study-improve-aimp":
    case "study-improve-aupg":
    case "study-improve-arec":
    case "study-improve-ared": {
      const featureId = topic.endsWith("aimp") ? "AImp" : topic.endsWith("aupg") ? "AUpg" : topic.endsWith("arec") ? "ARec" : "ARed";
      const name = featureId === "AImp" ? "Algorithm Improvement" : featureId === "AUpg" ? "Algorithm Upgrade" : featureId === "ARec" ? "Algorithm Recalculation" : "Algorithm Redesign";
      const cur = state.studyImproves?.[featureId] ?? { completions: 0, claimed: 0 };
      const curLevel = cur.claimed;
      const curMult = calculateStudyImproveMultiplier(curLevel, config);
      const nextMilestone = calculateStudyImproveMilestone(curLevel, config);
      const nextMult = calculateStudyImproveMultiplier(curLevel + 1, config);
      const isEligible = cur.completions >= nextMilestone;

      return {
        title: `Study Improve — ${name}`,
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Milestone study completions grant cumulative speed multipliers to ${name}.</div>
            <div><strong>Level:</strong> Level ${curLevel} (${curMult.toFixed(3)}x speed multiplier)</div>
            <div><strong>Progress:</strong> ${formatInteger(cur.completions)} / ${formatInteger(nextMilestone)} completions ${isEligible ? "(<span style='color: var(--tes-cyan); font-weight: bold;'>Ready to claim!</span>)" : ""}</div>
            <div><strong>Next Tier:</strong> ${nextMult.toFixed(3)}x speed multiplier (free to claim).</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 4D. Install Transistor Tooltips
    // ------------------------------------------------------------------------
    case "install-transistor-aimp":
    case "install-transistor-aupg":
    case "install-transistor-arec":
    case "install-transistor-ared": {
      const featureId = topic.endsWith("aimp") ? "AImp" : topic.endsWith("aupg") ? "AUpg" : topic.endsWith("arec") ? "ARec" : "ARed";
      const name = featureId === "AImp" ? "Algorithm Improvement" : featureId === "AUpg" ? "Algorithm Upgrade" : featureId === "ARec" ? "Algorithm Recalculation" : "Algorithm Redesign";
      const totalT = state.devices?.transistorsPurchased ?? 0;
      const allocatedT = state.devices?.transistorAllocations?.[featureId] ?? 0;
      const cost = calculateBulkDeviceCost("transistor", totalT, 1, config);
      const speedMult = calculateEffectiveStudySpeed(featureId, state, config, resolver);

      return {
        title: `Install Transistor — ${name}`,
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Purchases and allocates one Transistor directly to ${name}.</div>
            <div><strong>Unit Cost:</strong> ${formatEnergy(cost)} (shared global pricing)</div>
            <div><strong>Allocated on ${name}:</strong> ${formatInteger(allocatedT)} units (Speed: ${speedMult.toFixed(2)}x)</div>
            <div><strong>Global Total:</strong> ${formatInteger(totalT)} purchased across all studies.</div>
            ${INFO_FOOTER}
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
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Automates Algorithm Improvement studies continuously in parallel.</div>
            <div><strong>Cycle Duration:</strong> ${dur.toFixed(2)}s per cycle</div>
            <div><strong>Output:</strong> Produces 1 A.Imp unit upon each completion.</div>
            ${INFO_FOOTER}
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
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Automates Algorithm Upgrade studies continuously in parallel.</div>
            <div><strong>Cycle Duration:</strong> ${dur.toFixed(2)}s per cycle</div>
            <div><strong>Conversion:</strong> Consumes ${conversionFactor} A.Imp &rarr; Produces 1 A.Upg.</div>
            ${INFO_FOOTER}
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
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Automates Algorithm Recalculation studies continuously in parallel.</div>
            <div><strong>Cycle Duration:</strong> ${dur.toFixed(2)}s per cycle</div>
            <div><strong>Conversion:</strong> Consumes ${conversionFactor} A.Upg &rarr; Produces 1 A.Rec.</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    case "device-chip-ared":
    case "autoCalculator_ARed": {
      const dur = calculateEffectiveStudyDuration("ARed", state, config, resolver);
      return {
        title: "AutoCalculator — Redesigns",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Automates Algorithm Redesign studies continuously in parallel.</div>
            <div><strong>Cycle Duration:</strong> ${dur.toFixed(2)}s per cycle</div>
            <div><strong>Conversion:</strong> Consumes ${conversionFactor} A.Rec &rarr; Produces 1 A.Red.</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    case "chip": {
      return {
        title: "AutoCalculator Chip",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Dedicated parallel calculation worker for algorithm studies.</div>
            <div><strong>Automation:</strong> Conducts hands-free study cycles in the background.</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 6. Computation Devices: Transistor Board, Transistors
    // ------------------------------------------------------------------------
    case "device-board":
    case "transistorBoard":
    case "transistor_board":
    case "transistor": {
      const totalT = state.devices?.transistorsPurchased ?? 0;
      const baseBonusPercent = (config.devices?.transistor?.speedBonusPerUnit ?? 0.05) * 100;
      const effectiveBonusPercent = baseBonusPercent * studySpeedMult;
      const nextCost = calculateDeviceCost("transistor", totalT, config);
      const hasPrestigeBonus = studySpeedMult > 1.0001;

      return {
        title: "Transistor Board",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Manages and distributes computational Transistors across study targets.</div>
            <div><strong>Purchased Transistors:</strong> ${formatInteger(totalT)} total units</div>
            ${hasPrestigeBonus ? `
              <div><strong>Effective Speed Bonus:</strong> +${effectiveBonusPercent.toFixed(2)}% per Transistor (+${baseBonusPercent.toFixed(1)}% base × ${studySpeedMult.toFixed(2)}x prestige bonus)</div>
            ` : `
              <div><strong>Base Speed Bonus:</strong> +${baseBonusPercent.toFixed(1)}% Study Speed per allocated Transistor</div>
            `}
            <div><strong>Next Transistor Cost:</strong> ${formatEnergy(nextCost)}</div>
            ${INFO_FOOTER}
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
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Unique hardware providing exponential speed scaling on the targeted study.</div>
            <div><strong>Status:</strong> ${isOwned ? `<span style="color: var(--tes-teal); font-weight: 600;">Installed (1 of 1)</span>` : `Uninstalled (Cost: ${formatEnergy(cost)})`}</div>
            <div><strong>Selected Target:</strong> ${target} (${formatInteger(allocatedT)} Transistors)</div>
            ${isOwned ? (hasPrestigeBonus ? `
              <div><strong>Base Multiplier:</strong> ${rawMult.toFixed(2)}x (${multiplierBase.toFixed(2)}<sup>${allocatedT}</sup>)</div>
              <div><strong>Prestige Multiplier:</strong> ${studySpeedMult.toFixed(2)}x (${foMult > 1.0001 ? `${foMult.toFixed(2)}x SO` : ""}${foMult > 1.0001 && procMult > 1.0001 ? " × " : ""}${procMult > 1.0001 ? `${procMult.toFixed(2)}x Processor` : ""})</div>
              <div><strong>Effective Microprocessor Multiplier:</strong> <span style="color: var(--tes-teal); font-weight: 600;">${effectiveMicroMult.toFixed(2)}x</span></div>
            ` : `
              <div><strong>Speed Multiplier:</strong> ${rawMult.toFixed(2)}x (${multiplierBase.toFixed(2)}<sup>${allocatedT}</sup>)</div>
              <div style="margin-top: 2px; font-family: monospace; font-size: 11px;">Multiplier = (${multiplierBase.toFixed(2)})<sup>T</sup></div>
            `) : `
              <div><strong>Speed Multiplier:</strong> Inactive (Requires Installation)</div>
            `}
            <div><strong>Effective Target Study Speed:</strong> ${speedMult.toFixed(2)}x</div>
            ${INFO_FOOTER}
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
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>High-tier hardware revealed at 1 µJ, accelerating all study speed-efficiency devices.</div>
            <div><strong>Owned Units:</strong> ${formatInteger(owned)}</div>
            <div><strong>Study Speed-Efficiency Bonus:</strong> +${bonusPerUnit.toFixed(1)}% per unit (+${totalBonus.toFixed(1)}% total · ${procMult.toFixed(2)}x multiplier)</div>
            <div><strong>Affects:</strong> Transistors, Microprocessor, and Overclocker.</div>
            ${INFO_FOOTER}
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
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Unique device that temporarily supercharges the Microprocessor target.</div>
            <div><strong>Status:</strong> ${isOwned ? "Installed" : "Uninstalled"}</div>
            <div><strong>Activation Requirement:</strong> Requires ≥ ${minT} Transistors on target (currently ${formatInteger(allocatedT)} T on ${target}).</div>
            <div><strong>Boost:</strong> Multiplies speed by (1 + T/${bonusDiv.toFixed(0)}) for ln(T)/ln(${durBase.toFixed(1)})s.${hasPrestigeBonus ? ` (${studySpeedMult.toFixed(2)}x prestige boost)` : ""}</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 10. CRC Gadget
    // ------------------------------------------------------------------------
    case "device-crc-gadget":
    case "crcGadget":
    case "crc_gadget": {
      const isOwned = (state.devices?.crcGadget?.owned ?? 0) >= 1;
      const baseMult = config.devices?.crcGadget?.productionMultiplier ?? 2.0;
      const crcMult = calculateCrcMultiplier(state, config, deviceMult);
      const hasPrestigeBonus = deviceMult > 1.0001;

      return {
        title: "CRC Gadget (Unique Device)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Unique device permanently amplifying Cosmic Radiation Condenser output.</div>
            <div><strong>Status:</strong> ${isOwned ? "Installed" : "Available"}</div>
            ${hasPrestigeBonus ? `
              <div><strong>Production Multiplier:</strong> ${crcMult.toFixed(2)}x (${baseMult.toFixed(2)}x base × ${deviceMult.toFixed(2)}x SO bonus)</div>
            ` : `
              <div><strong>Production Multiplier:</strong> ${baseMult.toFixed(2)}x global energy production boost.</div>
            `}
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 10b. Backpropagator (Unique Device)
    // ------------------------------------------------------------------------
    case "device-backpropagator":
    case "backpropagator": {
      const isOwned = (state.devices?.backpropagator?.owned ?? state.devices?.backpropagator ?? 0) >= 1;
      const rOwned = state.algorithms?.ARed?.owned ?? 0;
      const devConfig = config.devices?.backpropagator ?? {};
      const q = devConfig.resonanceBase ?? 8.5;
      const rSoft = devConfig.softcapStart ?? 100;
      const rHard = devConfig.hardcapStart ?? 1000;
      const cost = devConfig.initialCost ?? 1;
      const resMult = calculateBackpropagatorMultiplier(state, config, resolver);

      return {
        title: "Backpropagator (Unique Device)",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Unique device scaling global Energy production based on owned Algorithm Redesigns.</div>
            <div><strong>Status:</strong> ${isOwned ? `<span style="color: var(--tes-teal); font-weight: 600;">Installed (1 of 1)</span>` : `Uninstalled (Cost: ${formatEnergy(cost)})`}</div>
            <div><strong>Scaling:</strong> q = ${q} across ${formatInteger(rOwned)} A.Red (Softcap: ${formatInteger(rSoft)}, Hardcap: ${formatInteger(rHard)})</div>
            <div><strong>Active Resonance Multiplier:</strong> <span style="color: var(--tes-teal); font-weight: 600;">${isOwned ? `${formatNumber(resMult, 2)}x` : "1.00x (Requires Installation)"}</span></div>
            ${INFO_FOOTER}
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
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Amplifies Algorithm Improvement energy strength, cascading across all tiers.</div>
            <div><strong>Owned Units:</strong> ${formatInteger(owned)}</div>
            ${hasPrestigeBonus ? `
              <div><strong>Unit Cascade Bonus:</strong> +${effectivePerUnit.toFixed(1)}% per unit (+${basePerUnit.toFixed(0)}% base × ${deviceMult.toFixed(2)}x SO bonus)</div>
            ` : `
              <div><strong>Unit Cascade Bonus:</strong> +${basePerUnit.toFixed(0)}% per unit</div>
            `}
            <div><strong>Effective Multiplier:</strong> ${capacitorMult.toFixed(2)}x (+${totalBonusPct}% total cascade bonus across all tiers)</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 12. Power Cell
    // ------------------------------------------------------------------------
    case "device-powercell":
    case "powerCell":
    case "power_cell": {
      const owned = state.powerCells ?? 0;
      const baseCap = config.devices?.powerCell?.baseCapacity ?? 1e-3;
      const totalCap = calculatePowerCellCapacity(owned, state, config, resolver);

      return {
        title: "Power Cell",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Expands loss-free Stable Capacity to shield stored energy from Overflow Decay.</div>
            <div><strong>Base Capacity:</strong> ${formatEnergy(baseCap)} per cell (${formatEnergy(totalCap)} total stable storage)</div>
            <div><strong>Prestige Multiplier:</strong> 1.00x (Exempt from Setup Optimization and Processor bonuses)</div>
            <div><strong>Persistence:</strong> Owned Power Cells persist across all resets.</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // ------------------------------------------------------------------------
    // 13. Hard Disk
    // ------------------------------------------------------------------------
    case "device-harddisk":
    case "hardDisk":
    case "hard_disk": {
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
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Consumes energy to continuously generate temporary Data (XP) into a buffer.</div>
            <div><strong>Status:</strong> <span style="text-transform: uppercase; font-weight: 600;">${status}</span> (${formatInteger(owned)} disks)</div>
            ${hasPrestigeBonus ? `
              <div><strong>Generation Rate:</strong> +${formatNumber(totalXpRate, 1)} Data/s (+${effectiveRatePerDisk.toFixed(2)}/s per active disk · ${dataRate.toFixed(1)}/s base × ${deviceMult.toFixed(2)}x SO bonus)</div>
            ` : `
              <div><strong>Generation Rate:</strong> +${formatNumber(totalXpRate, 1)} Data/s (+${dataRate.toFixed(1)}/s base per active disk)</div>
            `}
            <div><strong>Buffered Data:</strong> +${formatInteger(buffer)} Available Data (standby protection active)</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }

    // Default fallback
    default: {
      return {
        title: "Telemetry Information",
        body: `
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
            <div>Operational metrics and status overview for ${topic}.</div>
            ${INFO_FOOTER}
          </div>
        `,
      };
    }
  }
}
