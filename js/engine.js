/**
 * engine.js
 * GameEngine / CommandEngine for The Eternal Simulation (Rebuild specification).
 * Deterministic simulation runner, event dispatch, action execution, and audit logging.
 */

import { big, bigMax, bigMin, toFiniteNumber, setGlobalNotation } from "./numeric.js";
import { createInitialState, normalizeState, serializeState } from "./state.js";
import { getElement, evaluateElement } from "./component-registry.js";
import { defaultStatResolver } from "./stat-resolver.js";
import { defaultEffectRegistry } from "./effect-registry.js";
import { registerStandardEffects } from "./effect-system.js";
import { recordPurchaseAudit, exportAuditLogsAsJSON, exportAuditLogsAsCSV } from "./audit-logger.js";
import { quicksaveState, loadQuicksaveState, hasQuicksaveState, saveState } from "./save-system.js";
import {
  calculateEnergyProduction,
  calculateEnergyOverflowDecay,
  integrateEnergyStep,
  calculateEffectiveStudyDuration,
  calculateEffectiveStudySpeed,
  calculateAvailableData,
  calculateDataFromAlgorithms,
  calculateRequiredDataForNextComputerLevel,
  calculateFacilityOptimizationRequirement,
  calculateOverclockDuration,
  calculateHardDiskEnergyDrain,
  calculateHardDiskXpRate,
  calculatePowerCellCapacity,
  calculateStudyImproveMilestone,
  calculateStudyImproveMultiplier,
  calculateBulkDeviceCost,
} from "./formulas.js";

export class GameEngine {
  constructor({
    state = null,
    config = {},
    statResolver = defaultStatResolver,
    effectRegistry = defaultEffectRegistry,
    developmentMode = false,
    enableAutosave = true,
  } = {}) {
    this.config = config;
    this.statResolver = statResolver;
    this.effectRegistry = effectRegistry;
    this.developmentMode = developmentMode;
    this.enableAutosave = Boolean(enableAutosave);

    // Register standard effects
    registerStandardEffects(this.effectRegistry, this.config);

    this.state = state ? normalizeState(state, this.config) : createInitialState(this.config);
    if (developmentMode !== undefined) {
      this.state.devMode = Boolean(developmentMode);
    }
    setGlobalNotation(this.state.settings?.notation ?? "engineering");
    this.statResolver.invalidateCache();
    this.listeners = new Set();
    this.autoSaveTimer = 0;
    this.heldHotkeys = new Set();
    this.continuousStudyTargets = new Set();
    this.chipTimers = {
      AImp: Number(this.state.devices?.chips?.timers?.AImp ?? 0),
      AUpg: Number(this.state.devices?.chips?.timers?.AUpg ?? 0),
      ARec: Number(this.state.devices?.chips?.timers?.ARec ?? 0),
      ARed: Number(this.state.devices?.chips?.timers?.ARed ?? 0),
    };
  }

  get continuousStudyTarget() {
    if (!this.continuousStudyTargets || this.continuousStudyTargets.size === 0) return null;
    return Array.from(this.continuousStudyTargets)[0];
  }

  set continuousStudyTarget(val) {
    if (!this.continuousStudyTargets) this.continuousStudyTargets = new Set();
    this.continuousStudyTargets.clear();
    if (val) this.continuousStudyTargets.add(val);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.statResolver.invalidateCache();
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error("Error in GameEngine listener:", err);
      }
    }
  }

  // ==========================================================================
  // TICK / SIMULATION RUNNER
  // ==========================================================================

  tick(deltaSeconds = 0.05) {
    const delta = Math.max(0, deltaSeconds * (this.state.gameSpeed ?? 1.0));
    if (delta <= 0) return;

    this.state.stats.gameTime = (this.state.stats.gameTime ?? 0) + delta;

    // 1. Energy Production & Overflow Decay (Bounded Monotonic Implicit Integration)
    const stableCap = calculatePowerCellCapacity(this.state.powerCells ?? 0, this.state, this.config, this.statResolver);
    const production = calculateEnergyProduction(this.state, this.config, this.statResolver);
    const decay = calculateEnergyOverflowDecay(this.state.energy, stableCap, this.config);

    this.state.energy = integrateEnergyStep(this.state.energy, production, stableCap, delta, this.config);

    if (production.gt(0)) {
      this.state.stats.totalEnergyProduced = big(this.state.stats.totalEnergyProduced).add(production.mul(delta));
    }
    if (this.state.energy.gt(this.state.peakEnergy)) {
      this.state.peakEnergy = this.state.energy;
    }

    // 2. Hard Disk Operation (Section 4.6 Available Data Cap integration)
    const hardDisks = this.state.devices?.hardDisks;
    if (hardDisks && hardDisks.owned > 0) {
      if (hardDisks.state === "active") {
        const xpRequired = calculateRequiredDataForNextComputerLevel(this.state.computerLevel ?? 1, this.config);
        const dataFromAlgorithms = calculateDataFromAlgorithms(this.state, this.config);
        const currentBuffer = hardDisks.buffer ?? 0;
        const usefulCapacity = Math.max(0, xpRequired - dataFromAlgorithms - currentBuffer);

        if (usefulCapacity <= 0) {
          // Data limit reached: pause generation and energy drain without clearing buffer
          hardDisks.dataPaused = true;
        } else {
          hardDisks.dataPaused = false;
          const xpRate = calculateHardDiskXpRate(hardDisks.owned, this.state, this.config, this.statResolver);
          const potentialData = xpRate * delta;
          const actualData = Math.min(potentialData, usefulCapacity);
          const effectiveFraction = potentialData > 0 ? (actualData / potentialData) : 1.0;
          const activeDelta = delta * effectiveFraction;

          const drainPerSec = calculateHardDiskEnergyDrain(hardDisks.owned, hardDisks.activeSeconds, this.config);
          const energyRequired = drainPerSec.mul(activeDelta);

          if (this.state.energy.gte(energyRequired)) {
            this.state.energy = this.state.energy.sub(energyRequired);
            hardDisks.activeSeconds += activeDelta;
            hardDisks.buffer = currentBuffer + actualData;
            if (actualData >= usefulCapacity) {
              hardDisks.dataPaused = true;
            }
          } else {
            // Insufficient energy -> enter standby! (preserves buffer, stops consumption)
            hardDisks.state = "standby";
            hardDisks.dataPaused = false;
          }
        }
      } else if (hardDisks.state === "standby") {
        hardDisks.dataPaused = false;
        // Check if sufficient energy exists to resume
        const drainPerSec = calculateHardDiskEnergyDrain(hardDisks.owned, hardDisks.activeSeconds, this.config);
        if (this.state.energy.gte(drainPerSec.mul(delta))) {
          hardDisks.state = "active";
        }
      } else {
        hardDisks.dataPaused = false;
      }
    }

    // 3. Overclocker Timer
    const overclock = this.state.devices?.overclocker;
    if (overclock && overclock.active) {
      overclock.remainingDuration -= delta;
      overclock.activeSeconds += delta;
      if (overclock.remainingDuration <= 0) {
        overclock.active = false;
        overclock.remainingDuration = 0;
        overclock.target = null;
        this.statResolver.invalidateCache();
      }
    }

    // 4. Hotkeys Continuous Execution (Held Keys)
    this._tickHotkeys(delta);

    // 5. Study Workers: Manual Study
    this._tickManualStudy(delta);

    // 6. Study Workers: AutoCalculator Chips
    this._tickAutoChips(delta);

    // 7. Check Technological Unlock Milestones
    this._evaluateUnlocks();

    // 8. Auto-save every 5 seconds (when autosave is enabled)
    if (this.enableAutosave) {
      this.autoSaveTimer += delta;
      if (this.autoSaveTimer >= 5.0) {
        this.autoSaveTimer = 0;
        this.save();
      }
    }
  }

  _tickManualStudy(delta) {
    if (!this.state.manualStudies) {
      this.state.manualStudies = {
        AImp: { active: false, elapsed: 0 },
        AUpg: { active: false, elapsed: 0 },
        ARec: { active: false, elapsed: 0 },
        ARed: { active: false, elapsed: 0 },
      };
      if (this.state.manualStudy?.target && this.state.manualStudy.active) {
        this.state.manualStudies[this.state.manualStudy.target].active = true;
        this.state.manualStudies[this.state.manualStudy.target].elapsed = this.state.manualStudy.elapsed;
      }
    }

    const targets = ["AImp", "AUpg", "ARec", "ARed"];
    let lastActiveTarget = this.state.manualStudy?.target || null;

    for (const target of targets) {
      const study = this.state.manualStudies[target];
      if (!study || !study.active) continue;

      if (target === "AUpg" && !this.state.unlocks?.AUpg) {
        study.active = false;
        continue;
      }
      if (target === "ARec" && !this.state.unlocks?.ARec) {
        study.active = false;
        continue;
      }
      if (target === "ARed" && !this.state.unlocks?.ARed) {
        study.active = false;
        continue;
      }

      study.elapsed += delta;
      const effectiveDur = calculateEffectiveStudyDuration(target, this.state, this.config, this.statResolver);
      const isContinuous = this.continuousStudyTargets.has(target);

      if (effectiveDur <= 0) {
        study.elapsed = 0;
        continue;
      }

      while (study.elapsed >= effectiveDur) {
        const success = this._executeSingleStudyCompletion(target);
        if (success) {
          study.elapsed -= effectiveDur;
          if (this.state.studyQueues[target] > 0) {
            this.state.studyQueues[target] -= 1;
          }
          if (!isContinuous && (this.state.studyQueues[target] ?? 0) <= 0) {
            study.active = false;
            study.elapsed = 0;
            break;
          }
        } else {
          // Waits for required units at 100% progress
          study.elapsed = effectiveDur;
          break;
        }
      }
    }

    const anyActive = targets.some((t) => this.state.manualStudies[t]?.active);
    this.state.manualStudy.active = anyActive;
    if (anyActive) {
      const activeTarget = targets.find((t) => this.state.manualStudies[t]?.active);
      if (!this.state.manualStudies[this.state.manualStudy?.target]?.active) {
        this.state.manualStudy.target = activeTarget || null;
      }
      if (this.state.manualStudy.target) {
        this.state.manualStudy.elapsed = this.state.manualStudies[this.state.manualStudy.target]?.elapsed ?? 0;
      }
    } else {
      this.state.manualStudy.elapsed = 0;
    }
  }

  _tickAutoChips(delta) {
    const chips = this.state.devices?.chips;
    if (!chips || chips.owned <= 0) return;

    for (const target of ["AImp", "AUpg", "ARec", "ARed"]) {
      if (chips.enabled && chips.enabled[target] === false) continue;
      const workerCount = chips.allocations?.[target] ?? 0;
      if (workerCount <= 0) continue;
      if (target === "AUpg" && !this.state.unlocks.AUpg) continue;
      if (target === "ARec" && !this.state.unlocks.ARec) continue;
      if (target === "ARed" && !this.state.unlocks.ARed) continue;

      const effectiveDur = calculateEffectiveStudyDuration(target, this.state, this.config, this.statResolver);
      if (effectiveDur <= 0) continue;

      this.chipTimers[target] = (this.chipTimers[target] ?? 0) + delta;

      if (this.chipTimers[target] >= effectiveDur) {
        const fullCycles = Math.floor(this.chipTimers[target] / effectiveDur);
        const desiredUnits = fullCycles * workerCount;

        if (target === "AImp") {
          this.state.algorithms.AImp.owned += desiredUnits;
          this.state.algorithms.AImp.produced += desiredUnits;
          if (this.state.studyImproves?.AImp) {
            this.state.studyImproves.AImp.completions += desiredUnits;
          }
          this.chipTimers[target] -= fullCycles * effectiveDur;
          this.statResolver.invalidateCache();
        } else if (target === "AUpg") {
          const factor = this.config.economy?.algorithmConversionFactor ?? 12;
          const availableAImp = this.state.algorithms.AImp.owned;
          const maxAffordable = Math.min(desiredUnits, Math.floor(availableAImp / factor));

          if (maxAffordable > 0) {
            this.state.algorithms.AImp.owned -= maxAffordable * factor;
            this.state.algorithms.AUpg.owned += maxAffordable;
            this.state.algorithms.AUpg.produced += maxAffordable;
            if (this.state.studyImproves?.AUpg) {
              this.state.studyImproves.AUpg.completions += maxAffordable;
            }
            const executedCycles = Math.min(fullCycles, Math.ceil(maxAffordable / workerCount));
            this.chipTimers[target] -= executedCycles * effectiveDur;
            this.statResolver.invalidateCache();
          } else {
            // Insufficient input units: worker waits without consuming or losing timer
            this.chipTimers[target] = Math.min(this.chipTimers[target], effectiveDur);
          }
        } else if (target === "ARec") {
          const factor = this.config.economy?.algorithmConversionFactor ?? 12;
          const availableAUpg = this.state.algorithms.AUpg.owned;
          const maxAffordable = Math.min(desiredUnits, Math.floor(availableAUpg / factor));

          if (maxAffordable > 0) {
            this.state.algorithms.AUpg.owned -= maxAffordable * factor;
            this.state.algorithms.ARec.owned += maxAffordable;
            this.state.algorithms.ARec.produced += maxAffordable;
            if (this.state.studyImproves?.ARec) {
              this.state.studyImproves.ARec.completions += maxAffordable;
            }
            const executedCycles = Math.min(fullCycles, Math.ceil(maxAffordable / workerCount));
            this.chipTimers[target] -= executedCycles * effectiveDur;
            this.statResolver.invalidateCache();
          } else {
            this.chipTimers[target] = Math.min(this.chipTimers[target], effectiveDur);
          }
        } else if (target === "ARed") {
          const factor = this.config.economy?.algorithmConversionFactor ?? 12;
          const availableARec = this.state.algorithms.ARec.owned;
          const maxAffordable = Math.min(desiredUnits, Math.floor(availableARec / factor));

          if (maxAffordable > 0) {
            this.state.algorithms.ARec.owned -= maxAffordable * factor;
            this.state.algorithms.ARed.owned += maxAffordable;
            this.state.algorithms.ARed.produced += maxAffordable;
            if (this.state.studyImproves?.ARed) {
              this.state.studyImproves.ARed.completions += maxAffordable;
            }
            const executedCycles = Math.min(fullCycles, Math.ceil(maxAffordable / workerCount));
            this.chipTimers[target] -= executedCycles * effectiveDur;
            this.statResolver.invalidateCache();
          } else {
            this.chipTimers[target] = Math.min(this.chipTimers[target], effectiveDur);
          }
        }
      }
    }
  }

  _executeSingleStudyCompletion(target) {
    const factor = this.config.economy?.algorithmConversionFactor ?? 12;

    if (target === "AImp") {
      this.state.algorithms.AImp.owned += 1;
      this.state.algorithms.AImp.produced += 1;
      if (this.state.studyImproves?.AImp) {
        this.state.studyImproves.AImp.completions += 1;
      }
      this.statResolver.invalidateCache();
      return true;
    }

    if (target === "AUpg") {
      if (this.state.algorithms.AImp.owned >= factor) {
        this.state.algorithms.AImp.owned -= factor;
        this.state.algorithms.AUpg.owned += 1;
        this.state.algorithms.AUpg.produced += 1;
        if (this.state.studyImproves?.AUpg) {
          this.state.studyImproves.AUpg.completions += 1;
        }
        this.statResolver.invalidateCache();
        return true;
      }
      return false;
    }

    if (target === "ARec") {
      if (this.state.algorithms.AUpg.owned >= factor) {
        this.state.algorithms.AUpg.owned -= factor;
        this.state.algorithms.ARec.owned += 1;
        this.state.algorithms.ARec.produced += 1;
        if (this.state.studyImproves?.ARec) {
          this.state.studyImproves.ARec.completions += 1;
        }
        this.statResolver.invalidateCache();
        return true;
      }
      return false;
    }

    if (target === "ARed") {
      if (this.state.algorithms.ARec.owned >= factor) {
        this.state.algorithms.ARec.owned -= factor;
        this.state.algorithms.ARed.owned += 1;
        this.state.algorithms.ARed.produced += 1;
        if (this.state.studyImproves?.ARed) {
          this.state.studyImproves.ARed.completions += 1;
        }
        this.statResolver.invalidateCache();
        return true;
      }
      return false;
    }

    return false;
  }

  _evaluateUnlocks() {
    const a = this.state.algorithms;
    const d = this.state.devices;
    const u = this.state.unlocks;

    // AutoCalculator Chips reveal after first completed AUpg
    if (!u.chips && ((a.AUpg?.produced ?? 0) > 0 || (a.AUpg?.owned ?? 0) > 0)) {
      u.chips = true;
    }

    // Transistor Board reveals after first Chip
    if (!u.transistorBoard && (d.chips?.owned ?? 0) > 0) {
      u.transistorBoard = true;
    }

    // Microprocessor reveals after Board + required Transistors
    const reqT = this.config.devices?.microprocessor?.transistorsRequiredToUnlock ?? 0;
    if (!u.microprocessor && d.transistorBoard?.owned && (d.transistorsPurchased ?? 0) >= reqT) {
      u.microprocessor = true;
    }

    // Overclocker reveals when Microprocessor exists + 2 Transistors allocated on target
    const microTarget = d.microprocessor?.target ?? "AImp";
    const tOnTarget = d.transistorAllocations?.[microTarget] ?? 0;
    if (!u.overclocker && (d.microprocessor?.owned ?? 0) > 0 && tOnTarget >= 2) {
      u.overclocker = true;
    }

    // Capacitor unlocks after 1st Machine Learning
    if (!u.capacitor && (this.state.computerLevel ?? 1) >= 2) {
      u.capacitor = true;
    }

    // Processor reveals only when player reaches 1e-6 J (1 uJ) stored energy
    if (!u.processor && (big(this.state.energy).gte(1e-6) || big(this.state.peakEnergy ?? 0).gte(1e-6))) {
      u.processor = true;
    }
    if (!u.hardDisk && (this.state.facilityOptimizations ?? 0) >= 1) {
      u.hardDisk = true;
    }
    if (!u.ARec && (this.state.facilityOptimizations ?? 0) >= 1) {
      u.ARec = true;
    }
    if (!u.ARed && (this.state.facilityOptimizations ?? 0) >= 2) {
      u.ARed = true;
    }
    const bThreshold = Number(this.config.devices?.backpropagator?.energytoUnlock ?? 1);
    if (!u.backpropagator && (this.state.facilityOptimizations ?? 0) >= 3 && Number.isFinite(bThreshold) && bThreshold >= 0) {
      if (big(this.state.energy).gte(bThreshold) || big(this.state.peakEnergy ?? 0).gte(bThreshold)) {
        u.backpropagator = true;
      }
    }
  }

  // ==========================================================================
  // COMMANDS & USER ACTIONS
  // ==========================================================================

  startManualStudy(target, count = 1) {
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(target)) return false;
    if (target === "AUpg" && !this.state.unlocks.AUpg) return false;
    if (target === "ARec" && !this.state.unlocks.ARec) return false;
    if (target === "ARed" && !this.state.unlocks.ARed) return false;

    const k = Math.max(1, Math.floor(count ?? 1));
    this.state.studyQueues[target] = (this.state.studyQueues[target] ?? 0) + k;
    if (!this.state.manualStudies) {
      this.state.manualStudies = {
        AImp: { active: false, elapsed: 0 },
        AUpg: { active: false, elapsed: 0 },
        ARec: { active: false, elapsed: 0 },
        ARed: { active: false, elapsed: 0 },
      };
    }
    if (!this.state.manualStudies[target]) {
      this.state.manualStudies[target] = { active: false, elapsed: 0 };
    }
    this.state.manualStudies[target].active = true;
    this.state.manualStudy.target = target;
    this.state.manualStudy.active = true;
    this.notify();
    return true;
  }

  pauseManualStudy(target = null) {
    if (target) {
      if (this.state.manualStudies?.[target]) {
        this.state.manualStudies[target].active = false;
      }
      this.continuousStudyTargets.delete(target);
      const anyActive = Object.values(this.state.manualStudies ?? {}).some((s) => s.active);
      this.state.manualStudy.active = anyActive;
    } else {
      if (this.state.manualStudies) {
        for (const t of ["AImp", "AUpg", "ARec", "ARed"]) {
          if (this.state.manualStudies[t]) {
            this.state.manualStudies[t].active = false;
          }
        }
      }
      this.state.manualStudy.active = false;
      this.continuousStudyTargets.clear();
    }
    this.notify();
  }

  startContinuousStudy(target) {
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(target)) return false;
    if (target === "AUpg" && !this.state.unlocks?.AUpg) return false;
    if (target === "ARec" && !this.state.unlocks?.ARec) return false;
    if (target === "ARed" && !this.state.unlocks?.ARed) return false;

    this.continuousStudyTargets.add(target);
    if (!this.state.manualStudies) {
      this.state.manualStudies = {
        AImp: { active: false, elapsed: 0 },
        AUpg: { active: false, elapsed: 0 },
        ARec: { active: false, elapsed: 0 },
        ARed: { active: false, elapsed: 0 },
      };
    }
    if (!this.state.manualStudies[target]) {
      this.state.manualStudies[target] = { active: false, elapsed: 0 };
    }
    this.state.manualStudies[target].active = true;
    this.state.manualStudy.target = target;
    this.state.manualStudy.active = true;
    this.notify();
    return true;
  }

  stopContinuousStudy(target = null) {
    const targets = target ? [target] : Array.from(this.continuousStudyTargets);
    for (const t of targets) {
      this.continuousStudyTargets.delete(t);
      if ((this.state.studyQueues[t] ?? 0) <= 0) {
        if (this.state.manualStudies?.[t]) {
          this.state.manualStudies[t].active = false;
          this.state.manualStudies[t].elapsed = 0;
        }
      }
    }
    const anyActive = Object.values(this.state.manualStudies ?? {}).some((s) => s.active);
    this.state.manualStudy.active = anyActive;
    if (!anyActive) {
      this.state.manualStudy.elapsed = 0;
    }
  }

  setHotkeyState(key, isHeld) {
    const k = String(key).toUpperCase();
    if (isHeld) {
      this.heldHotkeys.add(k);
      this._handleHotkeyPress(k);
    } else {
      this.heldHotkeys.delete(k);
      this._handleHotkeyRelease(k);
    }
  }

  clearAllHotkeys() {
    this.heldHotkeys.clear();
    this.stopContinuousStudy();
  }

  _handleHotkeyPress(k) {
    if (k === "A") {
      this.startContinuousStudy("AImp");
    } else if (k === "U") {
      if (this.state.unlocks?.AUpg) {
        this.startContinuousStudy("AUpg");
      }
    } else if (k === "R") {
      if (this.state.unlocks?.ARec) {
        this.startContinuousStudy("ARec");
      }
    } else if (k === "G") {
      if (this.state.unlocks?.ARed) {
        this.startContinuousStudy("ARed");
      }
    } else if (k === "T") {
      this.installTransistor("AImp");
    } else if (k === "M") {
      this.runMachineLearning();
    }
  }

  _handleHotkeyRelease(k) {
    if (k === "A") {
      this.stopContinuousStudy("AImp");
    } else if (k === "U") {
      this.stopContinuousStudy("AUpg");
    } else if (k === "R") {
      this.stopContinuousStudy("ARec");
    } else if (k === "G") {
      this.stopContinuousStudy("ARed");
    }
  }

  _tickHotkeys(delta) {
    if (this.heldHotkeys.has("T")) {
      this.installTransistor("AImp");
    }
    if (this.heldHotkeys.has("M")) {
      this.runMachineLearning();
    }
    // Maintain all held study hotkeys in continuous parallel execution
    if (this.heldHotkeys.has("A")) {
      if (!this.continuousStudyTargets.has("AImp")) this.startContinuousStudy("AImp");
    }
    if (this.heldHotkeys.has("U") && this.state.unlocks?.AUpg) {
      if (!this.continuousStudyTargets.has("AUpg")) this.startContinuousStudy("AUpg");
    }
    if (this.heldHotkeys.has("R") && this.state.unlocks?.ARec) {
      if (!this.continuousStudyTargets.has("ARec")) this.startContinuousStudy("ARec");
    }
    if (this.heldHotkeys.has("G") && this.state.unlocks?.ARed) {
      if (!this.continuousStudyTargets.has("ARed")) this.startContinuousStudy("ARed");
    }
  }

  toggleAutoStudy(target) {
    if (!this.state.devices?.chips) return false;
    if (!this.state.devices.chips.enabled) {
      this.state.devices.chips.enabled = { AImp: true, AUpg: true, ARec: true, ARed: true };
    }
    const current = this.state.devices.chips.enabled[target] !== false;
    this.state.devices.chips.enabled[target] = !current;
    this.notify();
    return true;
  }

  reassignChip(fromTarget, toTarget, count = 1) {
    const allocations = this.state.devices?.chips?.allocations;
    if (!allocations) return false;
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(fromTarget)) return false;
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(toTarget)) return false;
    if (toTarget === "ARec" && !this.state.unlocks.ARec) return false;
    if (toTarget === "ARed" && !this.state.unlocks.ARed) return false;

    const available = allocations[fromTarget] ?? 0;
    const moveCount = Math.min(available, Math.max(1, Math.floor(count ?? 1)));
    if (moveCount <= 0) return false;

    allocations[fromTarget] -= moveCount;
    allocations[toTarget] = (allocations[toTarget] ?? 0) + moveCount;
    this.notify();
    return true;
  }

  reassignTransistors(fromTarget, toTarget, count = 1) {
    const allocations = this.state.devices?.transistorAllocations;
    if (!allocations) return false;
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(fromTarget)) return false;
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(toTarget)) return false;
    if (toTarget === "ARec" && !this.state.unlocks.ARec) return false;
    if (toTarget === "ARed" && !this.state.unlocks.ARed) return false;

    const available = allocations[fromTarget] ?? 0;
    const moveCount = Math.min(available, Math.max(1, Math.floor(count ?? 1)));
    if (moveCount <= 0) return false;

    allocations[fromTarget] -= moveCount;
    allocations[toTarget] = (allocations[toTarget] ?? 0) + moveCount;
    this.notify();
    return true;
  }

  rebalanceTransistors() {
    const allocations = this.state.devices?.transistorAllocations;
    if (!allocations) return false;
    const targets = ["AImp", "AUpg"];
    if (this.state.unlocks?.ARec) targets.push("ARec");
    if (this.state.unlocks?.ARed) targets.push("ARed");

    const total = this.state.devices.transistorsPurchased ?? 0;
    if (total <= 0) return false;

    const countPerTarget = Math.floor(total / targets.length);
    let remainder = total % targets.length;

    for (const t of targets) {
      allocations[t] = countPerTarget;
    }
    const preferred = this.state.devices?.microprocessor?.target || "AImp";
    if (targets.includes(preferred)) {
      allocations[preferred] += remainder;
    } else {
      allocations["AImp"] += remainder;
    }
    this.notify();
    return true;
  }

  setMicroprocessorTarget(target) {
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(target)) return false;
    if (target === "ARec" && !this.state.unlocks.ARec) return false;
    if (target === "ARed" && !this.state.unlocks.ARed) return false;
    this.state.devices.microprocessor.target = target;
    this.notify();
    return true;
  }

  activateOverclocker(target = null) {
    const selectedTarget = target || this.state.devices?.microprocessor?.target || "AImp";
    const microOwned = (this.state.devices?.microprocessor?.owned ?? 0) > 0;
    const overclockerOwned = (this.state.devices?.overclocker?.owned ?? 0) > 0;
    if (!microOwned || !overclockerOwned) return false;

    const T = this.state.devices?.transistorAllocations?.[selectedTarget] ?? 0;
    if (T < 2 && !this.state.devMode) return false;

    const consumedT = Math.max(2, T);
    // Atomically consume all T transistors allocated to selected study
    this.state.devices.transistorAllocations[selectedTarget] = 0;
    this.state.devices.transistorsPurchased = Math.max(0, (this.state.devices.transistorsPurchased ?? 0) - consumedT);

    const duration = calculateOverclockDuration(consumedT, this.config);
    this.state.devices.overclocker.active = true;
    this.state.devices.overclocker.remainingDuration = duration;
    this.state.devices.overclocker.activeSeconds = 0;
    this.state.devices.overclocker.target = selectedTarget;
    this.state.devices.overclocker.consumedTransistors = consumedT;

    this.notify();
    return true;
  }

  setHardDiskState(newState) {
    if (!["active", "standby", "off"].includes(newState)) return false;
    const hd = this.state.devices?.hardDisks;
    if (!hd || hd.owned <= 0) return false;

    if (newState === "off") {
      hd.state = "off";
      hd.buffer = 0; // Explicitly turning off loses accumulated buffer!
      hd.activeSeconds = 0;
    } else {
      hd.state = newState;
    }

    this.notify();
    return true;
  }

  evaluateElement(elementId, count = 1) {
    const element = getElement(elementId);
    if (!element) return null;
    const k = Math.max(1, Math.floor(count ?? 1));
    return evaluateElement(element, this.state, this.config, k);
  }

  purchaseElement(elementId, count = 1, isForced = false, options = {}) {
    const element = getElement(elementId);
    if (!element) {
      console.warn(`Element '${elementId}' not found in registry.`);
      return false;
    }

    const k = Math.max(1, Math.floor(count ?? 1));
    const evalResult = evaluateElement(element, this.state, this.config, k);

    // Unless explicitly forced by an admin cheat tool, currency and validity are mandatory!
    if (!isForced) {
      if (!evalResult.canAfford) {
        console.warn(`Purchase blocked for '${elementId}': Insufficient currency.`);
        return false;
      }
      if (!evalResult.canClick) {
        console.warn(`Purchase blocked for '${elementId}': Requirements not met.`);
        return false;
      }
    }

    const energyBefore = big(this.state.energy);
    const nominalCost = evalResult.cost;

    const forceApply = Boolean(isForced || (this.state.devMode && !evalResult.strictUnlocked && evalResult.canAfford));
    const result = element.applyPurchase(this.state, this.config, {
      count: k,
      isForced: forceApply,
      ...options,
    });

    if (result && result.success === false) {
      console.warn(`Purchase failed for '${elementId}'.`);
      return false;
    }

    const energyAfter = big(this.state.energy);
    const debited = energyBefore.sub(energyAfter);
    this.state.stats.totalPurchases = (this.state.stats.totalPurchases ?? 0) + k;

    // Log the transaction
    recordPurchaseAudit(this.state, this.config, {
      actionType: "PURCHASE",
      itemKey: element.id,
      itemName: element.name,
      requestedQuantity: k,
      purchasedQuantity: k,
      nominalCost,
      currencyDebited: debited,
      isForced: forceApply,
      isBypassed: forceApply,
      energyBefore,
      energyAfter,
      metadata: evalResult.meta ?? {},
    });

    this.save();
    this.notify();
    return true;
  }

  runMachineLearning() {
    const element = getElement("machineLearning");
    return this.purchaseElement("machineLearning", 1);
  }

  performFacilityOptimization() {
    const element = getElement("facilityOptimization");
    return this.purchaseElement("facilityOptimization", 1);
  }

  claimStudyImprove(target) {
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(target)) return false;
    if (target === "AUpg" && !this.state.unlocks?.AUpg) return false;
    if (target === "ARec" && !this.state.unlocks?.ARec) return false;
    if (target === "ARed" && !this.state.unlocks?.ARed) return false;
    if (this.config.studyImprove?.enabled === false) return false;

    if (!this.state.studyImproves) {
      this.state.studyImproves = {
        AImp: { completions: 0, claimed: 0 },
        AUpg: { completions: 0, claimed: 0 },
        ARec: { completions: 0, claimed: 0 },
        ARed: { completions: 0, claimed: 0 },
      };
    }
    if (!this.state.studyImproves[target]) {
      this.state.studyImproves[target] = { completions: 0, claimed: 0 };
    }

    const current = this.state.studyImproves[target];
    const nextMilestone = calculateStudyImproveMilestone(current.claimed, this.config);
    const currentStudies = this.state.algorithms?.[target]?.owned ?? 0;

    if (currentStudies < nextMilestone) {
      return false;
    }

    current.claimed += 1;
    this.statResolver.invalidateCache();
    this.save();
    this.notify();
    return true;
  }

  installTransistor(target) {
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(target)) return false;
    if (target === "AUpg" && !this.state.unlocks?.AUpg) return false;
    if (target === "ARec" && !this.state.unlocks?.ARec) return false;
    if (target === "ARed" && !this.state.unlocks?.ARed) return false;

    const boardOwned = Boolean(this.state.devices?.transistorBoard?.owned);
    if (!boardOwned && !this.state.devMode) {
      console.warn(`Install Transistor blocked for '${target}': Transistor Board not owned.`);
      return false;
    }

    const cost = calculateBulkDeviceCost("transistor", this.state.devices?.transistorsPurchased ?? 0, 1, this.config);
    if (!big(this.state.energy).gte(cost) && !this.state.devMode) {
      console.warn(`Install Transistor blocked for '${target}': Insufficient energy.`);
      return false;
    }

    return this.purchaseElement("transistor", 1, false, { target });
  }

  // ==========================================================================
  // DEVELOPER CONTROLS & UTILITIES
  // ==========================================================================

  toggleDevMode() {
    this.state.devMode = !this.state.devMode;
    this.notify();
  }

  setGameSpeed(speed = 1.0) {
    this.state.gameSpeed = Math.max(0.1, Math.min(100.0, speed));
    this.notify();
  }

  addEnergy(amount) {
    const val = big(amount);
    this.state.energy = big(this.state.energy).add(val);
    if (this.state.energy.gt(this.state.peakEnergy)) {
      this.state.peakEnergy = this.state.energy;
    }
    this.notify();
  }

  setEnergy(amount) {
    this.state.energy = big(amount);
    if (this.state.energy.gt(this.state.peakEnergy)) {
      this.state.peakEnergy = this.state.energy;
    }
    this.notify();
  }

  addAFeature(featureId, count = 1) {
    if (!["AImp", "AUpg", "ARec", "ARed"].includes(featureId)) return;
    const k = Math.max(1, Math.floor(count ?? 1));
    this.state.algorithms[featureId].owned += k;
    this.state.algorithms[featureId].produced += k;
    this.notify();
  }

  addComputerLevel(count = 1) {
    this.state.computerLevel = Math.max(1, (this.state.computerLevel ?? 1) + count);
    this.notify();
  }

  setNotation(notation) {
    if (!["engineering", "engineering_num", "alpha"].includes(notation)) return false;
    if (!this.state.settings) this.state.settings = {};
    this.state.settings.notation = notation;
    if (this.state.ui) this.state.ui.notation = notation;
    setGlobalNotation(notation);
    this.save();
    this.notify();
    return true;
  }

  getNotation() {
    return this.state.settings?.notation ?? "engineering";
  }

  quicksave() {
    return quicksaveState(this.state);
  }

  restoreQuicksave() {
    const restored = loadQuicksaveState(this.config);
    if (!restored) return false;
    this.state = restored;
    this.save();
    this.notify();
    return true;
  }

  hasQuicksave() {
    return hasQuicksaveState();
  }

  resetCurrentRun() {
    const initial = createInitialState(this.config);
    // Preserves completed Facility Optimizations and Tech Unlocks
    initial.facilityOptimizations = this.state.facilityOptimizations;
    initial.computerLevel = this.state.computerLevel;
    initial.powerCells = this.state.powerCells;
    initial.unlocks = { ...this.state.unlocks };
    this.state = initial;
    this.save();
    this.notify();
  }

  resetAllProgress() {
    this.state = createInitialState(this.config);
    this.save();
    this.notify();
  }

  save() {
    if (this.state.devices?.chips) {
      if (!this.state.devices.chips.timers) this.state.devices.chips.timers = {};
      this.state.devices.chips.timers.AImp = this.chipTimers.AImp;
      this.state.devices.chips.timers.AUpg = this.chipTimers.AUpg;
      this.state.devices.chips.timers.ARec = this.chipTimers.ARec;
      this.state.devices.chips.timers.ARed = this.chipTimers.ARed;
    }
    saveState(this.state, this.developmentMode);
  }

  exportAuditLogsJSON() {
    return exportAuditLogsAsJSON(this.state);
  }

  exportAuditLogsCSV() {
    return exportAuditLogsAsCSV(this.state);
  }
}
