/**
 * component-registry.js
 * Component Registry for The Eternal Simulation (Rebuild specification).
 * Declarative definitions for Devices, Storage, and Prestige Resets.
 */

import { big } from "./numeric.js";
import {
  calculateDeviceCost,
  calculateBulkDeviceCost,
  calculateAvailableData,
  calculateRequiredDataForNextComputerLevel,
  calculateFacilityOptimizationRequirement,
} from "./formulas.js";

export const ELEMENT_REGISTRY = new Map();

export function registerElement(definition) {
  if (!definition.id) throw new Error("Element must have an id");
  ELEMENT_REGISTRY.set(definition.id, definition);
}

export function getElement(id) {
  return ELEMENT_REGISTRY.get(id) ?? null;
}

export function getAllElements() {
  return Array.from(ELEMENT_REGISTRY.values());
}

// ----------------------------------------------------------------------------
// 1. AutoCalculator Chip
// ----------------------------------------------------------------------------
registerElement({
  id: "chip",
  name: "AutoCalculator Chip",
  category: "automation",
  description: "Automates studies of one selected A-Feature. Independent worker respecting conversion costs and duration.",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("chip", state.devices?.chips?.owned ?? 0, count, config),
  getOwned: (state) => state.devices?.chips?.owned ?? 0,
  isUnlocked: (state, config) => {
    if (state.unlocks?.chips) return true;
    const aupgDone = (state.algorithms?.AUpg?.produced ?? 0) > 0 || (state.algorithms?.AUpg?.owned ?? 0) > 0;
    return aupgDone;
  },
  isEligible: (state, config, count = 1) => {
    const strictUnlocked = (state.unlocks?.chips) ||
      (state.algorithms?.AUpg?.produced ?? 0) > 0 ||
      (state.algorithms?.AUpg?.owned ?? 0) > 0;
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateBulkDeviceCost("chip", state.devices?.chips?.owned ?? 0, count, config);
    const canAfford = big(state.energy).gte(cost);
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires completing your first A.Upgrade study");
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: unlocked && canAfford,
      isUnlocked: unlocked,
      strictUnlocked,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { count = 1, isForced = false } = {}) => {
    const k = Math.max(1, Math.floor(count ?? 1));
    const cost = calculateBulkDeviceCost("chip", state.devices?.chips?.owned ?? 0, k, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.chips.owned = (state.devices.chips.owned ?? 0) + k;
    // Newly acquired chips default to AImp
    state.devices.chips.allocations.AImp = (state.devices.chips.allocations.AImp ?? 0) + k;
    state.unlocks.chips = true;
    state.unlocks.transistorBoard = true; // Purchasing first chip reveals Transistor Board
    return { newCount: state.devices.chips.owned, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 2. Transistor Board
// ----------------------------------------------------------------------------
registerElement({
  id: "transistorBoard",
  name: "Transistor Board",
  category: "efficiency",
  description: "Provides infrastructure to purchase and allocate Transistors among study types.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("transistorBoard", 0, config),
  getOwned: (state) => (state.devices?.transistorBoard?.owned ? 1 : 0),
  isUnlocked: (state, config) => {
    if (state.unlocks?.transistorBoard) return true;
    return (state.devices?.chips?.owned ?? 0) >= 1;
  },
  isEligible: (state, config) => {
    const strictUnlocked = (state.unlocks?.transistorBoard) || (state.devices?.chips?.owned ?? 0) >= 1;
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateDeviceCost("transistorBoard", 0, config);
    const canAfford = big(state.energy).gte(cost);
    const notOwned = !state.devices?.transistorBoard?.owned;
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires purchasing at least 1 AutoCalculator Chip");
    if (!notOwned) reasons.push("Already owned (unique)");
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: unlocked && canAfford && notOwned,
      isUnlocked: unlocked,
      strictUnlocked,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { isForced = false } = {}) => {
    const cost = calculateDeviceCost("transistorBoard", 0, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.transistorBoard.owned = true;
    state.unlocks.transistorBoard = true;
    return { newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 3. Transistor
// ----------------------------------------------------------------------------
registerElement({
  id: "transistor",
  name: "Transistor",
  category: "efficiency",
  description: "Adds +5% Study Speed per unit allocated to an A-Feature. Shared global purchase cost.",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("transistor", state.devices?.transistorsPurchased ?? 0, count, config),
  getOwned: (state) => state.devices?.transistorsPurchased ?? 0,
  isUnlocked: (state, config) => Boolean(state.devices?.transistorBoard?.owned),
  isEligible: (state, config, count = 1) => {
    const strictUnlocked = Boolean(state.devices?.transistorBoard?.owned);
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateBulkDeviceCost("transistor", state.devices?.transistorsPurchased ?? 0, count, config);
    const canAfford = big(state.energy).gte(cost);
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires Transistor Board");
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: unlocked && canAfford,
      isUnlocked: unlocked,
      strictUnlocked,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { count = 1, isForced = false, target = "AImp" } = {}) => {
    const k = Math.max(1, Math.floor(count ?? 1));
    const cost = calculateBulkDeviceCost("transistor", state.devices?.transistorsPurchased ?? 0, k, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.transistorsPurchased = (state.devices.transistorsPurchased ?? 0) + k;
    const dest = ["AImp", "AUpg", "ARec"].includes(target) ? target : "AImp";
    state.devices.transistorAllocations[dest] = (state.devices.transistorAllocations[dest] ?? 0) + k;

    // Check Microprocessor unlock: Board + 4 Transistors
    if (state.devices.transistorBoard.owned && state.devices.transistorsPurchased >= 4) {
      state.unlocks.microprocessor = true;
    }

    return { newCount: state.devices.transistorsPurchased, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 4. Microprocessor
// ----------------------------------------------------------------------------
registerElement({
  id: "microprocessor",
  name: "Microprocessor",
  category: "efficiency",
  description: "Geometrically amplifies the study speed of one selected A-Feature: 1.12^T (where T is allocated Transistors).",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("microprocessor", 0, config),
  getOwned: (state) => state.devices?.microprocessor?.owned ?? 0,
  isUnlocked: (state, config) => {
    if (state.unlocks?.microprocessor) return true;
    return Boolean(state.devices?.transistorBoard?.owned) && (state.devices?.transistorsPurchased ?? 0) >= 4;
  },
  isEligible: (state, config) => {
    const strictUnlocked = (state.unlocks?.microprocessor) ||
      (Boolean(state.devices?.transistorBoard?.owned) && (state.devices?.transistorsPurchased ?? 0) >= 4);
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateDeviceCost("microprocessor", 0, config);
    const canAfford = big(state.energy).gte(cost);
    const notOwned = (state.devices?.microprocessor?.owned ?? 0) === 0;
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires Transistor Board and at least 4 Transistors");
    if (!notOwned) reasons.push("Already owned (unique)");
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: unlocked && canAfford && notOwned,
      isUnlocked: unlocked,
      strictUnlocked,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { isForced = false } = {}) => {
    const cost = calculateDeviceCost("microprocessor", 0, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.microprocessor.owned = 1;
    state.unlocks.microprocessor = true;
    return { newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 5. Overclocker
// ----------------------------------------------------------------------------
registerElement({
  id: "overclocker",
  name: "Overclocker",
  category: "efficiency",
  description: "Sacrifices Transistors to temporarily amplify Microprocessor bonus: (1 + T/3) for log(T)/log(1.5) seconds.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("overclocker", 0, config),
  getOwned: (state) => state.devices?.overclocker?.owned ?? 0,
  isUnlocked: (state, config) => {
    if (state.unlocks?.overclocker) return true;
    const microOwned = (state.devices?.microprocessor?.owned ?? 0) > 0;
    const target = state.devices?.microprocessor?.target ?? "AImp";
    const tCount = state.devices?.transistorAllocations?.[target] ?? 0;
    return microOwned && tCount >= 2;
  },
  isEligible: (state, config) => {
    const microOwned = (state.devices?.microprocessor?.owned ?? 0) > 0;
    const target = state.devices?.microprocessor?.target ?? "AImp";
    const tCount = state.devices?.transistorAllocations?.[target] ?? 0;
    const strictUnlocked = (state.unlocks?.overclocker) || (microOwned && tCount >= 2);
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateDeviceCost("overclocker", 0, config);
    const canAfford = big(state.energy).gte(cost);
    const notOwned = (state.devices?.overclocker?.owned ?? 0) === 0;
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires Microprocessor and at least 2 Transistors allocated to its target");
    if (!notOwned) reasons.push("Already owned (unique)");
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: unlocked && canAfford && notOwned,
      isUnlocked: unlocked,
      strictUnlocked,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { isForced = false } = {}) => {
    const cost = calculateDeviceCost("overclocker", 0, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.overclocker.owned = 1;
    state.unlocks.overclocker = true;
    return { newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 6. CRC Gadget
// ----------------------------------------------------------------------------
registerElement({
  id: "crcGadget",
  name: "CRC Gadget",
  category: "energy",
  description: "Multiplies total CRC Energy Production by 2x.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("crcGadget", 0, config),
  getOwned: (state) => state.devices?.crcGadget?.owned ?? 0,
  isUnlocked: () => true,
  isEligible: (state, config) => {
    const cost = calculateDeviceCost("crcGadget", 0, config);
    const canAfford = big(state.energy).gte(cost);
    const notOwned = (state.devices?.crcGadget?.owned ?? 0) === 0;
    const reasons = [];
    if (!notOwned) reasons.push("Already owned (unique)");
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: canAfford && notOwned,
      isUnlocked: true,
      strictUnlocked: true,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { isForced = false } = {}) => {
    const cost = calculateDeviceCost("crcGadget", 0, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.crcGadget.owned = 1;
    return { newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 7. Capacitor
// ----------------------------------------------------------------------------
registerElement({
  id: "capacitor",
  name: "Capacitor",
  category: "energy",
  description: "Increases the Energy contribution of A.Improvements by +50% per unit (1 + 0.5 * C).",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("capacitor", state.devices?.capacitors ?? 0, count, config),
  getOwned: (state) => state.devices?.capacitors ?? 0,
  isUnlocked: (state, config) => {
    if (state.unlocks?.capacitor) return true;
    return (state.computerLevel ?? 1) >= 2;
  },
  isEligible: (state, config, count = 1) => {
    const strictUnlocked = (state.unlocks?.capacitor) || (state.computerLevel ?? 1) >= 2;
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateBulkDeviceCost("capacitor", state.devices?.capacitors ?? 0, count, config);
    const canAfford = big(state.energy).gte(cost);
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires completing your first Machine Learning operation (Computer Level 2)");
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: unlocked && canAfford,
      isUnlocked: unlocked,
      strictUnlocked,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { count = 1, isForced = false } = {}) => {
    const k = Math.max(1, Math.floor(count ?? 1));
    const cost = calculateBulkDeviceCost("capacitor", state.devices?.capacitors ?? 0, k, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.capacitors = (state.devices.capacitors ?? 0) + k;
    state.unlocks.capacitor = true;
    return { newCount: state.devices.capacitors, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 8. Processor
// ----------------------------------------------------------------------------
registerElement({
  id: "processor",
  name: "Processor",
  category: "efficiency",
  description: "Slightly improves the performance of other eligible Devices by +3% per unit (1 + 0.03 * P).",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("processor", state.devices?.processors ?? 0, count, config),
  getOwned: (state) => state.devices?.processors ?? 0,
  isUnlocked: (state, config) => {
    if (state.unlocks?.processor) return true;
    return (state.facilityOptimizations ?? 0) >= 1;
  },
  isEligible: (state, config, count = 1) => {
    const strictUnlocked = (state.unlocks?.processor) || (state.facilityOptimizations ?? 0) >= 1;
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateBulkDeviceCost("processor", state.devices?.processors ?? 0, count, config);
    const canAfford = big(state.energy).gte(cost);
    const reasons = [];
    if (!strictUnlocked) reasons.push("Unlocked only after the first Facility Optimization");
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: unlocked && canAfford,
      isUnlocked: unlocked,
      strictUnlocked,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { count = 1, isForced = false } = {}) => {
    const k = Math.max(1, Math.floor(count ?? 1));
    const cost = calculateBulkDeviceCost("processor", state.devices?.processors ?? 0, k, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.processors = (state.devices.processors ?? 0) + k;
    state.unlocks.processor = true;
    return { newCount: state.devices.processors, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 9. Hard Disk
// ----------------------------------------------------------------------------
registerElement({
  id: "hardDisk",
  name: "Hard Disk",
  category: "learning",
  description: "Consumes Energy continuously to produce +3 Data/s per active Disk into a temporary buffer.",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("hardDisk", state.devices?.hardDisks?.owned ?? 0, count, config),
  getOwned: (state) => state.devices?.hardDisks?.owned ?? 0,
  isUnlocked: (state, config) => {
    if (state.unlocks?.hardDisk) return true;
    return (state.facilityOptimizations ?? 0) >= 1;
  },
  isEligible: (state, config, count = 1) => {
    const strictUnlocked = (state.unlocks?.hardDisk) || (state.facilityOptimizations ?? 0) >= 1;
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateBulkDeviceCost("hardDisk", state.devices?.hardDisks?.owned ?? 0, count, config);
    const canAfford = big(state.energy).gte(cost);
    const reasons = [];
    if (!strictUnlocked) reasons.push("Unlocked only after the first Facility Optimization");
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: unlocked && canAfford,
      isUnlocked: unlocked,
      strictUnlocked,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { count = 1, isForced = false } = {}) => {
    const k = Math.max(1, Math.floor(count ?? 1));
    const cost = calculateBulkDeviceCost("hardDisk", state.devices?.hardDisks?.owned ?? 0, k, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.hardDisks.owned = (state.devices.hardDisks.owned ?? 0) + k;
    if (state.devices.hardDisks.state === "off") {
      state.devices.hardDisks.state = "active";
    }
    state.unlocks.hardDisk = true;
    return { newCount: state.devices.hardDisks.owned, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 10. Power Cell
// ----------------------------------------------------------------------------
registerElement({
  id: "powerCell",
  name: "Power Cell",
  category: "storage",
  description: "Provides operational Energy capacity (1 mJ/cell). Persists through Facility Optimization.",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("powerCell", state.powerCells ?? 0, count, config),
  getOwned: (state) => state.powerCells ?? 0,
  isUnlocked: () => true,
  isEligible: (state, config, count = 1) => {
    const cost = calculateBulkDeviceCost("powerCell", state.powerCells ?? 0, count, config);
    const canAfford = big(state.energy).gte(cost);
    const reasons = [];
    if (!canAfford) reasons.push("Insufficient energy");
    return {
      eligible: canAfford,
      isUnlocked: true,
      strictUnlocked: true,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { count = 1, isForced = false } = {}) => {
    const k = Math.max(1, Math.floor(count ?? 1));
    const cost = calculateBulkDeviceCost("powerCell", state.powerCells ?? 0, k, config);
    if (!isForced || big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.powerCells = (state.powerCells ?? 0) + k;
    state.unlocks.powerCell = true;
    return { newCount: state.powerCells, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 11. Run Machine Learning (Soft Reset)
// ----------------------------------------------------------------------------
registerElement({
  id: "machineLearning",
  name: "Run Machine Learning",
  category: "reset",
  description: "Advances global Computer Level (+50% AP per level). Clears A-Feature inventories; keeps hardware and energy.",
  unique: false,
  getCost: () => null,
  getOwned: (state) => state.computerLevel ?? 1,
  isUnlocked: () => true,
  isEligible: (state, config) => {
    const currentData = calculateAvailableData(state, config);
    const requiredData = calculateRequiredDataForNextComputerLevel(state.computerLevel ?? 1, config);
    const naturallyEligible = currentData >= requiredData;
    const eligible = naturallyEligible || Boolean(state.devMode);
    const reasons = [];
    if (!naturallyEligible) {
      reasons.push(`Requires ${requiredData} Available Data (have ${currentData})`);
    }
    return {
      eligible,
      isUnlocked: true,
      strictUnlocked: naturallyEligible,
      canAfford: true,
      cost: null,
      reasons,
      meta: { currentData, requiredData },
    };
  },
  applyPurchase: (state, config) => {
    state.computerLevel = (state.computerLevel ?? 1) + 1;
    // Reset algorithm inventories and cycle stats
    state.algorithms.AImp.owned = 0;
    state.algorithms.AImp.produced = 0;
    state.algorithms.AUpg.owned = 0;
    state.algorithms.AUpg.produced = 0;
    state.algorithms.ARec.owned = 0;
    state.algorithms.ARec.produced = 0;

    // Clear study queues and pending worker reservations
    state.studyQueues.AImp = 0;
    state.studyQueues.AUpg = 0;
    state.studyQueues.ARec = 0;
    state.reservedInputs.AImp = 0;
    state.reservedInputs.AUpg = 0;
    state.manualStudy.active = false;
    state.manualStudy.elapsed = 0;

    // Clear accumulated Hard Disk data buffer
    state.devices.hardDisks.buffer = 0;

    // Cancel temporary overclocker
    state.devices.overclocker.active = false;
    state.devices.overclocker.remainingDuration = 0;

    // Check unlocks (e.g. Capacitor unlocks after 1st ML)
    if (state.computerLevel >= 2) {
      state.unlocks.capacitor = true;
    }

    state.stats.totalMachineLearnings = (state.stats.totalMachineLearnings ?? 0) + 1;

    return { newCount: state.computerLevel, cost: null, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 12. Facility Optimization (Hard Reset)
// ----------------------------------------------------------------------------
registerElement({
  id: "facilityOptimization",
  name: "Facility Optimization",
  category: "reset",
  description: "Improves all operational Devices by +9% permanent compounding multiplier (1.09^H). Preserves Computer Level & Power Cells.",
  unique: false,
  getCost: () => null,
  getOwned: (state) => state.facilityOptimizations ?? 0,
  isUnlocked: (state, config) => {
    return (state.computerLevel ?? 1) >= calculateFacilityOptimizationRequirement(state.facilityOptimizations ?? 0, config);
  },
  isEligible: (state, config) => {
    const requiredLevel = calculateFacilityOptimizationRequirement(state.facilityOptimizations ?? 0, config);
    const currentLevel = state.computerLevel ?? 1;
    const naturallyEligible = currentLevel >= requiredLevel;
    const eligible = naturallyEligible || Boolean(state.devMode);
    const reasons = [];
    if (!naturallyEligible) {
      reasons.push(`Requires Computer Level ${requiredLevel} (current Level: ${currentLevel})`);
    }
    return {
      eligible,
      isUnlocked: eligible,
      strictUnlocked: naturallyEligible,
      canAfford: true,
      cost: null,
      reasons,
      meta: { currentLevel, requiredLevel },
    };
  },
  applyPurchase: (state, config) => {
    state.facilityOptimizations = (state.facilityOptimizations ?? 0) + 1;

    // 1. Reset A-Feature inventories
    state.algorithms.AImp.owned = 0;
    state.algorithms.AImp.produced = 0;
    state.algorithms.AUpg.owned = 0;
    state.algorithms.AUpg.produced = 0;
    state.algorithms.ARec.owned = 0;
    state.algorithms.ARec.produced = 0;

    // 2. Clear pending studies and reservations
    state.studyQueues.AImp = 0;
    state.studyQueues.AUpg = 0;
    state.studyQueues.ARec = 0;
    state.reservedInputs.AImp = 0;
    state.reservedInputs.AUpg = 0;
    state.manualStudy.active = false;
    state.manualStudy.elapsed = 0;

    // 3. Reset Stored Energy to zero
    state.energy = big(0);

    // 4. Reset Hard Disk buffer
    state.devices.hardDisks.buffer = 0;

    // 5. Remove conventional purchased hardware
    state.devices.chips.owned = 0;
    state.devices.chips.allocations = { AImp: 0, AUpg: 0, ARec: 0 };
    state.devices.transistorBoard.owned = false;
    state.devices.transistorsPurchased = 0;
    state.devices.transistorAllocations = { AImp: 0, AUpg: 0, ARec: 0 };
    state.devices.microprocessor.owned = 0;
    state.devices.microprocessor.target = "AImp";
    state.devices.overclocker.owned = 0;
    state.devices.overclocker.active = false;
    state.devices.overclocker.remainingDuration = 0;
    state.devices.overclocker.consumedTransistors = 0;
    state.devices.crcGadget.owned = 0;
    state.devices.capacitors = 0;
    state.devices.processors = 0;
    state.devices.hardDisks.owned = 0;
    state.devices.hardDisks.state = "off";
    state.devices.hardDisks.activeSeconds = 0;

    // 6. Reset Power Cell charge to zero (owned cells are preserved!)
    state.powerCellCharge = big(0);

    // 7. Tech unlocks: Unlock ARec and Processor permanently!
    state.unlocks.ARec = true;
    state.unlocks.processor = true;
    state.unlocks.hardDisk = true;
    // Chips and Board need to be rebought, but tech unlock flags for ARec/Processor stay permanent

    state.stats.totalFacilityOptimizations = (state.stats.totalFacilityOptimizations ?? 0) + 1;

    return { newCount: state.facilityOptimizations, cost: null, count: 1 };
  },
});

export function evaluateElement(element, state, config, count = 1) {
  const k = Math.max(1, Math.floor(count ?? 1));
  const check = element.isEligible(state, config, k);
  const cost = element.getCost ? element.getCost(state, config, k) : null;
  const owned = element.getOwned ? element.getOwned(state) : 0;

  const naturallyEligible = Boolean(check.strictUnlocked && check.canAfford);
  const isDevMode = Boolean(state.devMode);

  let visualStatus = "eligible";
  let canClick = naturallyEligible;

  if (naturallyEligible) {
    visualStatus = "eligible";
    canClick = true;
  } else if (isDevMode) {
    visualStatus = "dev-bypass";
    canClick = true;
  } else {
    visualStatus = "locked";
    canClick = false;
  }

  return {
    element,
    id: element.id,
    name: element.name,
    category: element.category,
    description: element.description,
    unique: element.unique ?? false,
    owned,
    cost,
    count: k,
    isUnlocked: check.isUnlocked,
    strictUnlocked: check.strictUnlocked,
    canAfford: check.canAfford,
    naturallyEligible,
    visualStatus,
    canClick,
    reasons: check.reasons ?? [],
    meta: check.meta ?? {},
  };
}
