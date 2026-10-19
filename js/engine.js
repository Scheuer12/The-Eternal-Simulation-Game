/**
 * engine.js
 * GameEngine / CommandEngine for The Eternal Simulation (Rebuild specification).
 * Deterministic simulation runner, event dispatch, action execution, and audit logging.
 */

import { big, bigMax, bigMin, toFiniteNumber } from "./numeric.js";
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
  calculateEffectiveStudyDuration,
  calculateEffectiveStudySpeed,
  calculateAvailableData,
  calculateRequiredDataForNextComputerLevel,
  calculateFacilityOptimizationRequirement,
  calculateOverclockDuration,
  calculateHardDiskEnergyDrain,
  calculateHardDiskXpRate,
  calculatePowerCellCapacity,
} from "./formulas.js";

export class GameEngine {
  constructor({
    state = null,
    config = {},
    statResolver = defaultStatResolver,
    effectRegistry = defaultEffectRegistry,
    developmentMode = true,
  } = {}) {
    this.config = config;
    this.statResolver = statResolver;
    this.effectRegistry = effectRegistry;
    this.developmentMode = developmentMode;

    // Register standard effects
    registerStandardEffects(this.effectRegistry, this.config);

    this.state = state ? normalizeState(state, this.config) : createInitialState(this.config);
    if (developmentMode !== undefined) {
      this.state.devMode = Boolean(developmentMode);
    }
    this.listeners = new Set();
    this.autoSaveTimer = 0;
    this.chipTimers = {
      AImp: 0,
      AUpg: 0,
      ARec: 0,
    };
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

    // 1. Energy Production & Overflow Decay
    const stableCap = calculatePowerCellCapacity(this.state.powerCells ?? 0, this.state, this.config, this.statResolver);
    const production = calculateEnergyProduction(this.state, this.config, this.statResolver);
    const decay = calculateEnergyOverflowDecay(this.state.energy, stableCap, this.config);

    const netRate = production.sub(decay);
    const netEnergyDelta = netRate.mul(delta);
    this.state.energy = bigMax(0, big(this.state.energy).add(netEnergyDelta));

    if (production.gt(0)) {
      this.state.stats.totalEnergyProduced = big(this.state.stats.totalEnergyProduced).add(production.mul(delta));
    }
    if (this.state.energy.gt(this.state.peakEnergy)) {
      this.state.peakEnergy = this.state.energy;
    }

    // 2. Hard Disk Operation
    const hardDisks = this.state.devices?.hardDisks;
    if (hardDisks && hardDisks.owned > 0) {
      if (hardDisks.state === "active") {
        const drainPerSec = calculateHardDiskEnergyDrain(hardDisks.owned, hardDisks.activeSeconds, this.config);
        const energyRequired = drainPerSec.mul(delta);

        if (this.state.energy.gte(energyRequired)) {
          this.state.energy = this.state.energy.sub(energyRequired);
          hardDisks.activeSeconds += delta;
          const xpRate = calculateHardDiskXpRate(hardDisks.owned, this.state, this.config, this.statResolver);
          hardDisks.buffer = (hardDisks.buffer ?? 0) + xpRate * delta;
        } else {
          // Insufficient energy -> enter standby! (preserves buffer, stops consumption)
          hardDisks.state = "standby";
        }
      } else if (hardDisks.state === "standby") {
        // Check if sufficient energy exists to resume
        const drainPerSec = calculateHardDiskEnergyDrain(hardDisks.owned, hardDisks.activeSeconds, this.config);
        if (this.state.energy.gte(drainPerSec.mul(delta))) {
          hardDisks.state = "active";
        }
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
      }
    }

    // 4. Study Workers: Manual Study
    this._tickManualStudy(delta);

    // 5. Study Workers: AutoCalculator Chips
    this._tickAutoChips(delta);

    // 6. Check Technological Unlock Milestones
    this._evaluateUnlocks();

    // 7. Auto-save every 5 seconds
    this.autoSaveTimer += delta;
    if (this.autoSaveTimer >= 5.0) {
      this.autoSaveTimer = 0;
      this.save();
    }

    this.notify();
  }

  _tickManualStudy(delta) {
    const study = this.state.manualStudy;
    if (!study || !study.active || !study.target) return;

    const target = study.target;
    study.elapsed += delta;
    const effectiveDur = calculateEffectiveStudyDuration(target, this.state, this.config, this.statResolver);

    while (study.elapsed >= effectiveDur) {
      const success = this._executeSingleStudyCompletion(target);
      if (success) {
        study.elapsed -= effectiveDur;
        if (this.state.studyQueues[target] > 0) {
          this.state.studyQueues[target] -= 1;
        }
        if (this.state.studyQueues[target] <= 0) {
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

  _tickAutoChips(delta) {
    const chips = this.state.devices?.chips;
    if (!chips || chips.owned <= 0) return;

    for (const target of ["AImp", "AUpg", "ARec"]) {
      const workerCount = chips.allocations?.[target] ?? 0;
      if (workerCount <= 0) continue;
      if (target === "AUpg" && !this.state.unlocks.AUpg) continue;
      if (target === "ARec" && !this.state.unlocks.ARec) continue;

      const effectiveDur = calculateEffectiveStudyDuration(target, this.state, this.config, this.statResolver);
      if (effectiveDur <= 0) continue;

      this.chipTimers[target] = (this.chipTimers[target] ?? 0) + delta;

      if (this.chipTimers[target] >= effectiveDur) {
        const fullCycles = Math.floor(this.chipTimers[target] / effectiveDur);
        const desiredUnits = fullCycles * workerCount;

        if (target === "AImp") {
          this.state.algorithms.AImp.owned += desiredUnits;
          this.state.algorithms.AImp.produced += desiredUnits;
          this.chipTimers[target] -= fullCycles * effectiveDur;
        } else if (target === "AUpg") {
          const factor = this.config.economy?.algorithmConversionFactor ?? 12;
          const availableAImp = this.state.algorithms.AImp.owned;
          const maxAffordable = Math.min(desiredUnits, Math.floor(availableAImp / factor));

          if (maxAffordable > 0) {
            this.state.algorithms.AImp.owned -= maxAffordable * factor;
            this.state.algorithms.AUpg.owned += maxAffordable;
            this.state.algorithms.AUpg.produced += maxAffordable;
            const executedCycles = Math.min(fullCycles, Math.ceil(maxAffordable / workerCount));
            this.chipTimers[target] -= executedCycles * effectiveDur;
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
            const executedCycles = Math.min(fullCycles, Math.ceil(maxAffordable / workerCount));
            this.chipTimers[target] -= executedCycles * effectiveDur;
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
      return true;
    }

    if (target === "AUpg") {
      if (this.state.algorithms.AImp.owned >= factor) {
        this.state.algorithms.AImp.owned -= factor;
        this.state.algorithms.AUpg.owned += 1;
        this.state.algorithms.AUpg.produced += 1;
        return true;
      }
      return false;
    }

    if (target === "ARec") {
      if (this.state.algorithms.AUpg.owned >= factor) {
        this.state.algorithms.AUpg.owned -= factor;
        this.state.algorithms.ARec.owned += 1;
        this.state.algorithms.ARec.produced += 1;
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

    // Microprocessor reveals after Board + 4 Transistors
    if (!u.microprocessor && d.transistorBoard?.owned && (d.transistorsPurchased ?? 0) >= 4) {
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

    // Processor and Hard Disk unlock after 1st Facility Optimization
    if (!u.processor && (this.state.facilityOptimizations ?? 0) >= 1) {
      u.processor = true;
    }
    if (!u.hardDisk && (this.state.facilityOptimizations ?? 0) >= 1) {
      u.hardDisk = true;
    }
    if (!u.ARec && (this.state.facilityOptimizations ?? 0) >= 1) {
      u.ARec = true;
    }
  }

  // ==========================================================================
  // COMMANDS & USER ACTIONS
  // ==========================================================================

  startManualStudy(target, count = 1) {
    if (!["AImp", "AUpg", "ARec"].includes(target)) return false;
    if (target === "AUpg" && !this.state.unlocks.AUpg) return false;
    if (target === "ARec" && !this.state.unlocks.ARec) return false;

    const k = Math.max(1, Math.floor(count ?? 1));
    this.state.studyQueues[target] = (this.state.studyQueues[target] ?? 0) + k;
    this.state.manualStudy.target = target;
    this.state.manualStudy.active = true;
    this.notify();
    return true;
  }

  pauseManualStudy() {
    this.state.manualStudy.active = false;
    this.notify();
  }

  reassignChip(fromTarget, toTarget, count = 1) {
    const allocations = this.state.devices?.chips?.allocations;
    if (!allocations) return false;
    if (!["AImp", "AUpg", "ARec"].includes(fromTarget)) return false;
    if (!["AImp", "AUpg", "ARec"].includes(toTarget)) return false;
    if (toTarget === "ARec" && !this.state.unlocks.ARec) return false;

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
    if (!["AImp", "AUpg", "ARec"].includes(fromTarget)) return false;
    if (!["AImp", "AUpg", "ARec"].includes(toTarget)) return false;
    if (toTarget === "ARec" && !this.state.unlocks.ARec) return false;

    const available = allocations[fromTarget] ?? 0;
    const moveCount = Math.min(available, Math.max(1, Math.floor(count ?? 1)));
    if (moveCount <= 0) return false;

    allocations[fromTarget] -= moveCount;
    allocations[toTarget] = (allocations[toTarget] ?? 0) + moveCount;
    this.notify();
    return true;
  }

  setMicroprocessorTarget(target) {
    if (!["AImp", "AUpg", "ARec"].includes(target)) return false;
    if (target === "ARec" && !this.state.unlocks.ARec) return false;
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

  purchaseElement(elementId, count = 1, isForced = false) {
    const element = getElement(elementId);
    if (!element) {
      console.warn(`Element '${elementId}' not found in registry.`);
      return false;
    }

    const k = Math.max(1, Math.floor(count ?? 1));
    const evalResult = evaluateElement(element, this.state, this.config, k);

    if (!evalResult.canClick && !isForced && !this.state.devMode) {
      console.warn(`Purchase blocked for '${elementId}'.`);
      return false;
    }

    const energyBefore = big(this.state.energy);
    const nominalCost = evalResult.cost;
    const canAfford = evalResult.canAfford;

    const forceApply = isForced || (this.state.devMode && !evalResult.naturallyEligible);
    const { newCount, cost } = element.applyPurchase(this.state, this.config, {
      count: k,
      isForced: forceApply,
    });
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
    if (!["AImp", "AUpg", "ARec"].includes(featureId)) return;
    const k = Math.max(1, Math.floor(count ?? 1));
    this.state.algorithms[featureId].owned += k;
    this.state.algorithms[featureId].produced += k;
    this.notify();
  }

  addComputerLevel(count = 1) {
    this.state.computerLevel = Math.max(1, (this.state.computerLevel ?? 1) + count);
    this.notify();
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
    saveState(this.state, this.developmentMode);
  }

  exportAuditLogsJSON() {
    return exportAuditLogsAsJSON(this.state);
  }

  exportAuditLogsCSV() {
    return exportAuditLogsAsCSV(this.state);
  }
}
