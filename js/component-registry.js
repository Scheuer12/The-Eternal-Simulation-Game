/**
 * component-registry.js
 * Component Registry for The Eternal Simulation (Rebuild specification).
 * Declarative definitions for Devices, Storage, and Prestige Resets.
 */

import { big, formatEnergy } from "./numeric.js";
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
// 1. AutoCalculator Chip (Base Generic & Specific Targets)
// ----------------------------------------------------------------------------
registerElement({
  id: "chip",
  name: "AutoCalculator Chip",
  category: "automation",
  lane: "efficiency",
  icon: "auto-calculator",
  description: "Automates studies of one selected A-Feature. Independent worker respecting conversion costs and duration.",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("chip", state.devices?.chips?.owned ?? 0, count, config),
  getOwned: (state) => state.devices?.chips?.owned ?? 0,
  isRevealed: (state) => Boolean(state.unlocks?.chips) || (state.algorithms?.AUpg?.produced ?? 0) > 0 || (state.algorithms?.AUpg?.owned ?? 0) > 0,
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
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: state.devices?.chips?.owned ?? 0, cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.chips.owned = (state.devices.chips.owned ?? 0) + k;
    // Newly acquired chips default to AImp
    state.devices.chips.allocations.AImp = (state.devices.chips.allocations.AImp ?? 0) + k;
    state.unlocks.chips = true;
    state.unlocks.transistorBoard = true; // Purchasing first chip reveals Transistor Board
    return { success: true, newCount: state.devices.chips.owned, cost, count: k };
  },
});

// AutoCalculator — Improvements
registerElement({
  id: "autoCalculator_AImp",
  name: "AutoCalculator — Improvements",
  category: "automation",
  lane: "efficiency",
  icon: "auto-calculator-imp",
  description: "Automates Algorithm Improvement studies continuously.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config),
  getOwned: (state) => (state.devices?.chips?.allocations?.AImp > 0 ? 1 : 0),
  isRevealed: (state) => Boolean(state.unlocks?.chips) || (state.algorithms?.AUpg?.produced ?? 0) > 0 || (state.algorithms?.AUpg?.owned ?? 0) > 0,
  isUnlocked: (state) => Boolean(state.unlocks?.chips) || (state.algorithms?.AUpg?.produced ?? 0) > 0 || (state.algorithms?.AUpg?.owned ?? 0) > 0,
  isEligible: (state, config) => {
    const strictUnlocked = Boolean(state.unlocks?.chips) || (state.algorithms?.AUpg?.produced ?? 0) > 0 || (state.algorithms?.AUpg?.owned ?? 0) > 0;
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config);
    const canAfford = big(state.energy).gte(cost);
    const notOwned = (state.devices?.chips?.allocations?.AImp ?? 0) === 0;
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires completing your first A.Upgrade study");
    if (!notOwned) reasons.push("Already installed (1/1)");
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
    const cost = calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config);
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: (state.devices?.chips?.allocations?.AImp ?? 0), cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.chips.owned = (state.devices.chips.owned ?? 0) + 1;
    state.devices.chips.allocations.AImp = (state.devices.chips.allocations.AImp ?? 0) + 1;
    if (!state.devices.chips.enabled) state.devices.chips.enabled = { AImp: true, AUpg: true, ARec: true };
    state.devices.chips.enabled.AImp = true;
    state.unlocks.chips = true;
    state.unlocks.transistorBoard = true;
    return { success: true, newCount: 1, cost, count: 1 };
  },
});

// AutoCalculator — Upgrades
registerElement({
  id: "autoCalculator_AUpg",
  name: "AutoCalculator — Upgrades",
  category: "automation",
  lane: "efficiency",
  icon: "auto-calculator-upg",
  description: "Automates Algorithm Upgrade studies continuously.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config),
  getOwned: (state) => (state.devices?.chips?.allocations?.AUpg > 0 ? 1 : 0),
  isRevealed: (state) => Boolean(state.unlocks?.chips) || (state.algorithms?.AUpg?.produced ?? 0) > 0 || (state.algorithms?.AUpg?.owned ?? 0) > 0,
  isUnlocked: (state) => Boolean(state.unlocks?.chips) || (state.algorithms?.AUpg?.produced ?? 0) > 0 || (state.algorithms?.AUpg?.owned ?? 0) > 0,
  isEligible: (state, config) => {
    const strictUnlocked = Boolean(state.unlocks?.chips) || (state.algorithms?.AUpg?.produced ?? 0) > 0 || (state.algorithms?.AUpg?.owned ?? 0) > 0;
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config);
    const canAfford = big(state.energy).gte(cost);
    const notOwned = (state.devices?.chips?.allocations?.AUpg ?? 0) === 0;
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires completing your first A.Upgrade study");
    if (!notOwned) reasons.push("Already installed (1/1)");
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
    const cost = calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config);
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: (state.devices?.chips?.allocations?.AUpg ?? 0), cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.chips.owned = (state.devices.chips.owned ?? 0) + 1;
    state.devices.chips.allocations.AUpg = (state.devices.chips.allocations.AUpg ?? 0) + 1;
    if (!state.devices.chips.enabled) state.devices.chips.enabled = { AImp: true, AUpg: true, ARec: true };
    state.devices.chips.enabled.AUpg = true;
    state.unlocks.chips = true;
    state.unlocks.transistorBoard = true;
    return { success: true, newCount: 1, cost, count: 1 };
  },
});

// AutoCalculator — Recalculations
registerElement({
  id: "autoCalculator_ARec",
  name: "AutoCalculator — Recalculations",
  category: "automation",
  lane: "efficiency",
  icon: "auto-calculator-rec",
  description: "Automates Algorithm Recalculation studies continuously.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config),
  getOwned: (state) => (state.devices?.chips?.allocations?.ARec > 0 ? 1 : 0),
  isRevealed: (state) => Boolean(state.unlocks?.ARec),
  isUnlocked: (state) => Boolean(state.unlocks?.ARec),
  isEligible: (state, config) => {
    const strictUnlocked = Boolean(state.unlocks?.ARec);
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config);
    const canAfford = big(state.energy).gte(cost);
    const notOwned = (state.devices?.chips?.allocations?.ARec ?? 0) === 0;
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires unlocking Algorithm Recalculation via Facility Optimization");
    if (!notOwned) reasons.push("Already installed (1/1)");
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
    const cost = calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config);
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: (state.devices?.chips?.allocations?.ARec ?? 0), cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.chips.owned = (state.devices.chips.owned ?? 0) + 1;
    state.devices.chips.allocations.ARec = (state.devices.chips.allocations.ARec ?? 0) + 1;
    if (!state.devices.chips.enabled) state.devices.chips.enabled = { AImp: true, AUpg: true, ARec: true };
    state.devices.chips.enabled.ARec = true;
    state.unlocks.chips = true;
    return { success: true, newCount: 1, cost, count: 1 };
  },
});

// AutoCalculator — Redesigns
registerElement({
  id: "autoCalculator_ARed",
  name: "AutoCalculator — Redesigns",
  category: "automation",
  lane: "efficiency",
  icon: "auto-calculator-red",
  description: "Automates Algorithm Redesign studies continuously.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config),
  getOwned: (state) => (state.devices?.chips?.allocations?.ARed > 0 ? 1 : 0),
  isRevealed: (state) => Boolean(state.unlocks?.ARed && (state.facilityOptimizations ?? 0) >= 2),
  isUnlocked: (state) => Boolean(state.unlocks?.ARed && (state.facilityOptimizations ?? 0) >= 2),
  isEligible: (state, config) => {
    const strictUnlocked = Boolean(state.unlocks?.ARed && (state.facilityOptimizations ?? 0) >= 2);
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config);
    const canAfford = big(state.energy).gte(cost);
    const notOwned = (state.devices?.chips?.allocations?.ARed ?? 0) === 0;
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires unlocking Algorithm Redesign via Setup Optimization 2");
    if (!notOwned) reasons.push("Already installed (1/1)");
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
    const cost = calculateDeviceCost("chip", state.devices?.chips?.owned ?? 0, config);
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: (state.devices?.chips?.allocations?.ARed ?? 0), cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.chips.owned = (state.devices.chips.owned ?? 0) + 1;
    if (!state.devices.chips.allocations) state.devices.chips.allocations = { AImp: 0, AUpg: 0, ARec: 0, ARed: 0 };
    state.devices.chips.allocations.ARed = (state.devices.chips.allocations.ARed ?? 0) + 1;
    if (!state.devices.chips.enabled) state.devices.chips.enabled = { AImp: true, AUpg: true, ARec: true, ARed: true };
    state.devices.chips.enabled.ARed = true;
    state.unlocks.chips = true;
    return { success: true, newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 2. Transistor Board
// ----------------------------------------------------------------------------
registerElement({
  id: "transistorBoard",
  name: "Transistor Board",
  category: "computation",
  lane: "efficiency",
  icon: "transistor-board",
  description: "Distributes computational resources between studies.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("transistorBoard", 0, config),
  getOwned: (state) => (state.devices?.transistorBoard?.owned ? 1 : 0),
  isRevealed: (state) => Boolean(state.unlocks?.transistorBoard) || (state.devices?.chips?.owned ?? 0) >= 1,
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
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: 0, cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.transistorBoard.owned = true;
    state.unlocks.transistorBoard = true;
    const reqT = config.devices?.microprocessor?.transistorsRequiredToUnlock ?? 0;
    if ((state.devices.transistorsPurchased ?? 0) >= reqT) {
      state.unlocks.microprocessor = true;
    }
    return { success: true, newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 3. Transistor
// ----------------------------------------------------------------------------
registerElement({
  id: "transistor",
  name: "Transistor",
  category: "computation",
  lane: "efficiency",
  icon: "transistor",
  description: "Accelerates study speed when allocated.",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("transistor", state.devices?.transistorsPurchased ?? 0, count, config),
  getOwned: (state) => state.devices?.transistorsPurchased ?? 0,
  isRevealed: (state) => Boolean(state.devices?.transistorBoard?.owned),
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
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: state.devices?.transistorsPurchased ?? 0, cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.transistorsPurchased = (state.devices.transistorsPurchased ?? 0) + k;
    const dest = ["AImp", "AUpg", "ARec"].includes(target) ? target : "AImp";
    state.devices.transistorAllocations[dest] = (state.devices.transistorAllocations[dest] ?? 0) + k;

    // Check Microprocessor unlock: Board + required Transistors
    const reqT = config.devices?.microprocessor?.transistorsRequiredToUnlock ?? 0;
    if (state.devices.transistorBoard.owned && (state.devices.transistorsPurchased ?? 0) >= reqT) {
      state.unlocks.microprocessor = true;
    }

    return { success: true, newCount: state.devices.transistorsPurchased, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 4. Microprocessor
// ----------------------------------------------------------------------------
registerElement({
  id: "microprocessor",
  name: "Microprocessor",
  category: "computation",
  lane: "efficiency",
  icon: "microprocessor",
  description: "Amplifies the speed of the selected study.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("microprocessor", 0, config),
  getOwned: (state) => state.devices?.microprocessor?.owned ?? 0,
  isRevealed: (state, config) => Boolean(state.devices?.transistorBoard?.owned),
  isUnlocked: (state, config) => {
    if (state.unlocks?.microprocessor) return true;
    const reqT = config.devices?.microprocessor?.transistorsRequiredToUnlock ?? 0;
    return Boolean(state.devices?.transistorBoard?.owned) && (state.devices?.transistorsPurchased ?? 0) >= reqT;
  },
  isEligible: (state, config, count = 1) => {
    const isOwned = (state.devices?.microprocessor?.owned ?? 0) >= 1;
    const reqT = config.devices?.microprocessor?.transistorsRequiredToUnlock ?? 0;
    const hasBoard = Boolean(state.devices?.transistorBoard?.owned);
    const hasTransistors = (state.devices?.transistorsPurchased ?? 0) >= reqT;
    const strictUnlocked = (state.unlocks?.microprocessor) || (hasBoard && hasTransistors);
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateDeviceCost("microprocessor", 0, config);
    const canAfford = big(state.energy).gte(cost);
    const reasons = [];
    if (isOwned) reasons.push("Microprocessor is already installed (Unique device)");
    if (!hasBoard) reasons.push("Requires Transistor Board");
    if (!hasTransistors && reqT > 0) reasons.push(`Requires at least ${reqT} Transistors (have ${state.devices?.transistorsPurchased ?? 0})`);
    if (!canAfford) reasons.push(`Insufficient energy (needs ${formatEnergy(cost)})`);
    return {
      eligible: unlocked && canAfford && !isOwned,
      isUnlocked: unlocked,
      strictUnlocked,
      canAfford,
      cost,
      reasons,
    };
  },
  applyPurchase: (state, config, { count = 1, isForced = false } = {}) => {
    const isOwned = (state.devices?.microprocessor?.owned ?? 0) >= 1;
    if (isOwned && !isForced) {
      return { success: false, newCount: 1, cost: big(0), count: 0 };
    }
    const cost = calculateDeviceCost("microprocessor", 0, config);
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: state.devices?.microprocessor?.owned ?? 0, cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.microprocessor.owned = 1;
    state.unlocks.microprocessor = true;
    return { success: true, newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 5. Overclocker
// ----------------------------------------------------------------------------
registerElement({
  id: "overclocker",
  name: "Overclocker",
  category: "computation",
  lane: "efficiency",
  icon: "overclocker",
  description: "Temporarily accelerates the selected computation.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("overclocker", 0, config),
  getOwned: (state) => state.devices?.overclocker?.owned ?? 0,
  isRevealed: (state) => (state.devices?.microprocessor?.owned ?? 0) > 0 || Boolean(state.unlocks?.overclocker),
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
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: 0, cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.overclocker.owned = 1;
    state.unlocks.overclocker = true;
    return { success: true, newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 6. CRC Gadget
// ----------------------------------------------------------------------------
registerElement({
  id: "crcGadget",
  name: "CRC Gadget",
  category: "energy",
  lane: "resources",
  icon: "crc-gadget",
  description: "Amplifies Cosmic Radiation Condenser energy output.",
  unique: true,
  getCost: (state, config) => calculateDeviceCost("crcGadget", 0, config),
  getOwned: (state) => state.devices?.crcGadget?.owned ?? 0,
  isRevealed: () => true,
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
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: 0, cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.crcGadget.owned = 1;
    return { success: true, newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 7. Capacitor
// ----------------------------------------------------------------------------
registerElement({
  id: "capacitor",
  name: "Capacitor",
  category: "energy",
  lane: "resources",
  icon: "capacitor",
  description: "Amplifies the energy contribution of the entire Algorithm Feature chain.",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("capacitor", state.devices?.capacitors ?? 0, count, config),
  getOwned: (state) => state.devices?.capacitors ?? 0,
  isRevealed: (state) => (state.computerLevel ?? 1) >= 2 || Boolean(state.unlocks?.capacitor),
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
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: (state.devices?.capacitors ?? 0), cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.capacitors = (state.devices.capacitors ?? 0) + k;
    state.unlocks.capacitor = true;
    return { success: true, newCount: state.devices.capacitors, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 8. Processor
// ----------------------------------------------------------------------------
registerElement({
  id: "processor",
  name: "Processor",
  category: "computation",
  lane: "efficiency",
  icon: "processor",
  description: "Improves the effectiveness of study speed-efficiency devices (+5% per unit).",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("processor", state.devices?.processors ?? 0, count, config),
  getOwned: (state) => state.devices?.processors ?? 0,
  isRevealed: (state) => Boolean(state.unlocks?.processor) || big(state.energy).gte(1e-6) || big(state.peakEnergy ?? 0).gte(1e-6),
  isUnlocked: (state, config) => Boolean(state.unlocks?.processor) || big(state.energy).gte(1e-6) || big(state.peakEnergy ?? 0).gte(1e-6),
  isEligible: (state, config, count = 1) => {
    const strictUnlocked = Boolean(state.unlocks?.processor) || big(state.energy).gte(1e-6) || big(state.peakEnergy ?? 0).gte(1e-6);
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = calculateBulkDeviceCost("processor", state.devices?.processors ?? 0, count, config);
    const canAfford = big(state.energy).gte(cost);
    const reasons = [];
    if (!strictUnlocked) reasons.push("Requires reaching 1 µJ (1e-6 J) stored energy");
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
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: (state.devices?.processors ?? 0), cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.processors = (state.devices.processors ?? 0) + k;
    state.unlocks.processor = true;
    return { success: true, newCount: state.devices.processors, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 9. Hard Disk
// ----------------------------------------------------------------------------
registerElement({
  id: "hardDisk",
  name: "Hard Disk",
  category: "learning",
  lane: "resources",
  icon: "hard-disk",
  description: "Consumes Energy to generate temporary Data.",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("hardDisk", state.devices?.hardDisks?.owned ?? 0, count, config),
  getOwned: (state) => state.devices?.hardDisks?.owned ?? 0,
  isRevealed: (state) => Boolean(state.unlocks?.hardDisk),
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
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: (state.devices?.hardDisks?.owned ?? 0), cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.devices.hardDisks.owned = (state.devices.hardDisks.owned ?? 0) + k;
    if (state.devices.hardDisks.state === "off") {
      state.devices.hardDisks.state = "active";
    }
    state.unlocks.hardDisk = true;
    return { success: true, newCount: state.devices.hardDisks.owned, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 10. Power Cell
// ----------------------------------------------------------------------------
registerElement({
  id: "powerCell",
  name: "Power Cell",
  category: "energy",
  lane: "resources",
  icon: "power-cell",
  description: "Expands the facility's operational energy capacity.",
  unique: false,
  getCost: (state, config, count = 1) =>
    calculateBulkDeviceCost("powerCell", state.powerCells ?? 0, count, config),
  getOwned: (state) => state.powerCells ?? 0,
  isRevealed: () => true,
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
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: (state.powerCells ?? 0), cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    state.powerCells = (state.powerCells ?? 0) + k;
    state.unlocks.powerCell = true;
    return { success: true, newCount: state.powerCells, cost, count: k };
  },
});

// ----------------------------------------------------------------------------
// 10b. Backpropagator (Unique Energy Device, unlocked at SO3)
// ----------------------------------------------------------------------------
registerElement({
  id: "backpropagator",
  name: "Backpropagator",
  category: "energy",
  lane: "resources",
  icon: "backpropagator",
  description: "Improves global Energy production based on the amount of Algorithm Redesigns owned.",
  unique: true,
  getCost: (state, config) => {
    const cost = config.devices?.backpropagator?.initialCost ?? 1;
    return big(cost);
  },
  getOwned: (state) => {
    const val = state.devices?.backpropagator?.owned ?? state.devices?.backpropagator ?? 0;
    return val > 0 ? 1 : 0;
  },
  isRevealed: (state, config) => {
    if ((state.facilityOptimizations ?? 0) < 3) return false;
    const threshold = config.devices?.backpropagator?.energytoUnlock ?? 1;
    const numThreshold = Number(threshold);
    if (!Number.isFinite(numThreshold) || numThreshold < 0) return false;
    const peak = big(state.peakEnergy ?? 0);
    const cur = big(state.energy ?? 0);
    const owned = (state.devices?.backpropagator?.owned ?? state.devices?.backpropagator ?? 0) > 0;
    return Boolean(state.unlocks?.backpropagator) 
      || owned 
      || cur.gte(numThreshold) 
      || peak.gte(numThreshold);
  },
  isUnlocked: (state, config) => {
    if ((state.facilityOptimizations ?? 0) < 3) return false;
    const threshold = config.devices?.backpropagator?.energytoUnlock ?? 1;
    const numThreshold = Number(threshold);
    if (!Number.isFinite(numThreshold) || numThreshold < 0) return false;
    const peak = big(state.peakEnergy ?? 0);
    const cur = big(state.energy ?? 0);
    const owned = (state.devices?.backpropagator?.owned ?? state.devices?.backpropagator ?? 0) > 0;
    return Boolean(state.unlocks?.backpropagator) 
      || owned 
      || cur.gte(numThreshold) 
      || peak.gte(numThreshold);
  },
  isEligible: (state, config) => {
    const soEligible = (state.facilityOptimizations ?? 0) >= 3;
    const threshold = config.devices?.backpropagator?.energytoUnlock ?? 1;
    const numThreshold = Number(threshold);
    const validThreshold = Number.isFinite(numThreshold) && numThreshold >= 0;
    const peak = big(state.peakEnergy ?? 0);
    const cur = big(state.energy ?? 0);
    const owned = (state.devices?.backpropagator?.owned ?? state.devices?.backpropagator ?? 0) > 0;
    const discovered = validThreshold && (cur.gte(numThreshold) || peak.gte(numThreshold) || owned || Boolean(state.unlocks?.backpropagator));
    const strictUnlocked = soEligible && discovered;
    const unlocked = strictUnlocked || Boolean(state.devMode);
    const cost = big(config.devices?.backpropagator?.initialCost ?? 1);
    const canAfford = big(state.energy).gte(cost);
    const notOwned = !owned;
    const reasons = [];
    if (!soEligible) reasons.push("Requires Setup Optimization 3");
    else if (!discovered) reasons.push(`Requires reaching ${numThreshold} stored energy`);
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
    const cost = big(config.devices?.backpropagator?.initialCost ?? 1);
    if (!big(state.energy).gte(cost) && !isForced) {
      return { success: false, newCount: 0, cost: big(0), count: 0 };
    }
    if (big(state.energy).gte(cost)) {
      state.energy = big(state.energy).sub(cost);
    }
    if (typeof state.devices.backpropagator === "object" && state.devices.backpropagator !== null) {
      state.devices.backpropagator.owned = 1;
    } else {
      state.devices.backpropagator = { owned: 1 };
    }
    state.unlocks.backpropagator = true;
    return { success: true, newCount: 1, cost, count: 1 };
  },
});

// ----------------------------------------------------------------------------
// 11. Run Machine Learning (Soft Reset)
// ----------------------------------------------------------------------------
registerElement({
  id: "machineLearning",
  name: "Run Machine Learning",
  category: "reset",
  description: "Advances Computer Level, strengthening Algorithm Features and conversion efficiency.",
  unique: false,
  getCost: () => null,
  getOwned: (state) => state.computerLevel ?? 1,
  isUnlocked: () => true,
  isEligible: (state, config) => {
    const rawData = calculateAvailableData(state, config);
    const requiredData = calculateRequiredDataForNextComputerLevel(state.computerLevel ?? 1, config);
    const currentData = Math.min(Math.max(0, rawData), requiredData);
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
      meta: { currentData, rawData, requiredData },
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
    if (state.algorithms.ARed) {
      state.algorithms.ARed.owned = 0;
      state.algorithms.ARed.produced = 0;
    }

    // Reset study improve milestones & multipliers on Machine Learning (Section 1.8)
    if (state.studyImproves) {
      state.studyImproves.AImp = { completions: 0, claimed: 0 };
      state.studyImproves.AUpg = { completions: 0, claimed: 0 };
      state.studyImproves.ARec = { completions: 0, claimed: 0 };
      state.studyImproves.ARed = { completions: 0, claimed: 0 };
    }

    // Clear study queues and pending worker reservations
    state.studyQueues.AImp = 0;
    state.studyQueues.AUpg = 0;
    state.studyQueues.ARec = 0;
    state.studyQueues.ARed = 0;
    state.reservedInputs.AImp = 0;
    state.reservedInputs.AUpg = 0;
    state.reservedInputs.ARec = 0;
    state.manualStudy.active = false;
    state.manualStudy.elapsed = 0;
    if (state.manualStudies) {
      for (const t of ["AImp", "AUpg", "ARec", "ARed"]) {
        if (state.manualStudies[t]) {
          state.manualStudies[t].active = false;
          state.manualStudies[t].elapsed = 0;
        }
      }
    }

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
  description: "Permanently improves operational device effectiveness across future cycles.",
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

    // Reset all Study Improvements
    state.studyImproves = {
      AImp: { completions: 0, claimed: 0 },
      AUpg: { completions: 0, claimed: 0 },
      ARec: { completions: 0, claimed: 0 },
      ARed: { completions: 0, claimed: 0 },
    };

    // 1. Reset A-Feature inventories
    state.algorithms.AImp.owned = 0;
    state.algorithms.AImp.produced = 0;
    state.algorithms.AUpg.owned = 0;
    state.algorithms.AUpg.produced = 0;
    state.algorithms.ARec.owned = 0;
    state.algorithms.ARec.produced = 0;
    if (state.algorithms.ARed) {
      state.algorithms.ARed.owned = 0;
      state.algorithms.ARed.produced = 0;
    }

    // 2. Clear pending studies and reservations
    state.studyQueues.AImp = 0;
    state.studyQueues.AUpg = 0;
    state.studyQueues.ARec = 0;
    state.studyQueues.ARed = 0;
    state.reservedInputs.AImp = 0;
    state.reservedInputs.AUpg = 0;
    state.reservedInputs.ARec = 0;
    state.manualStudy.active = false;
    state.manualStudy.elapsed = 0;
    if (state.manualStudies) {
      for (const t of ["AImp", "AUpg", "ARec", "ARed"]) {
        if (state.manualStudies[t]) {
          state.manualStudies[t].active = false;
          state.manualStudies[t].elapsed = 0;
        }
      }
    }

    // 3. Reset Stored Energy and Peak Energy to zero
    state.energy = big(0);
    state.peakEnergy = big(0);

    // 4. Reset Hard Disk buffer
    state.devices.hardDisks.buffer = 0;

    // 5. Remove conventional purchased hardware
    state.devices.chips.owned = 0;
    state.devices.chips.allocations = { AImp: 0, AUpg: 0, ARec: 0, ARed: 0 };
    state.devices.transistorBoard.owned = false;
    state.devices.transistorsPurchased = 0;
    state.devices.transistorAllocations = { AImp: 0, AUpg: 0, ARec: 0, ARed: 0 };
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
    state.devices.backpropagator = { owned: 0 };

    // 6. Reset Power Cell charge to zero (owned Power Cells are PRESERVED as the sole exception!)
    state.powerCellCharge = big(0);

    // 7. Tech unlocks:
    // ARec is unlocked permanently across facility optimizations!
    state.unlocks.ARec = true;
    state.unlocks.hardDisk = true;
    if (state.facilityOptimizations >= 2) {
      state.unlocks.ARed = true;
    }
    state.unlocks.backpropagator = false;
    state.unlocks.processor = false; // Only appears when 1e-6 J is reached
    state.unlocks.transistorBoard = false;
    state.unlocks.microprocessor = false;
    state.unlocks.overclocker = false;
    state.unlocks.capacitor = false;
    state.unlocks.chips = false;

    state.stats.totalFacilityOptimizations = (state.stats.totalFacilityOptimizations ?? 0) + 1;

    return { newCount: state.facilityOptimizations, cost: null, count: 1 };
  },
});

export function evaluateElement(element, state, config, count = 1) {
  const k = Math.max(1, Math.floor(count ?? 1));
  const check = element.isEligible(state, config, k);
  const cost = element.getCost ? element.getCost(state, config, k) : null;
  const owned = element.getOwned ? element.getOwned(state) : 0;
  const isRevealed = element.isRevealed ? element.isRevealed(state, config) : (check.isUnlocked || check.strictUnlocked);

  const strictUnlocked = Boolean(check.strictUnlocked);
  const canAfford = Boolean(check.canAfford);
  const isDevMode = Boolean(state.devMode);

  // Eligible naturally: unlocked + affordable + eligible (e.g. unique not owned)
  const naturallyEligible = Boolean(strictUnlocked && canAfford && check.eligible);

  // In devMode, player can bypass tech milestone locks, but MUST ALWAYS AFFORD THE COST!
  const devBypassUnlocked = Boolean(isDevMode && !strictUnlocked && canAfford && check.eligible);

  let visualStatus = "locked";
  let canClick = false;

  if (naturallyEligible) {
    visualStatus = "eligible";
    canClick = true;
  } else if (devBypassUnlocked) {
    visualStatus = "dev-bypass";
    canClick = true;
  } else if (!canAfford) {
    visualStatus = "unaffordable";
    canClick = false;
  } else {
    visualStatus = "locked";
    canClick = false;
  }

  return {
    element,
    id: element.id,
    name: element.name,
    category: element.category,
    lane: element.lane ?? "efficiency",
    icon: element.icon ?? "auto-calculator",
    description: element.description,
    unique: element.unique ?? false,
    owned,
    cost,
    count: k,
    isRevealed,
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
