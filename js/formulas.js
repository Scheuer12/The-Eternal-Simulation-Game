/**
 * formulas.js
 * Pure mathematical formulas for The Eternal Simulation (Rebuild specification).
 * Strictly decoupled from state mutation and UI.
 * Registers formulas in FormulaRegistry.
 */

import { big, bigMax, bigMin, BigNum } from "./numeric.js";
import { defaultFormulaRegistry } from "./formula-registry.js";

// ============================================================================
// 1. ALGORITHM STRENGTHS & PERFORMANCE
// ============================================================================

export function calculateAlgorithmBaseStrengths(config = {}) {
  const base = config.economy?.algorithmBaseStrength ?? 1e-15;
  const factor = config.economy?.algorithmConversionFactor ?? 12;
  const ratio = config.economy?.conversionPerformanceRatio ?? 2;

  const aImp = base;
  const aUpg = aImp * factor * ratio; // 1e-15 * 12 * 2 = 24e-15
  const aRec = aUpg * factor * ratio; // 24e-15 * 12 * 2 = 576e-15

  return {
    AImp: aImp,
    AUpg: aUpg,
    ARec: aRec,
  };
}

export function calculateComputerPerformanceMultiplier(computerLevel = 1, config = {}) {
  const L = Math.max(1, Math.floor(computerLevel ?? 1));
  const base = config.economy?.computerPerformanceBase ?? 1.5;
  return base ** (L - 1);
}

export function calculateCapacitorMultiplier(capacitorsOwned = 0, config = {}, deviceMultiplier = 1) {
  const c = Math.max(0, Math.floor(capacitorsOwned ?? 0));
  const bonusPerUnit = config.devices?.capacitor?.bonusPerUnit ?? 0.5;
  return 1 + bonusPerUnit * c * deviceMultiplier;
}

export function calculateAlgorithmPerformance(state = {}, config = {}, statResolver = null) {
  const strengths = calculateAlgorithmBaseStrengths(config);
  const aImpOwned = state.algorithms?.AImp?.owned ?? 0;
  const aUpgOwned = state.algorithms?.AUpg?.owned ?? 0;
  const aRecOwned = state.algorithms?.ARec?.owned ?? 0;

  const deviceMultiplier = statResolver
    ? statResolver.resolve("devices.globalMultiplier", { state, config })
    : calculateTotalDeviceMultiplier(state, config);

  const capacitorMult = statResolver
    ? statResolver.resolve("algorithms.AImp.capacitorMultiplier", { state, config })
    : calculateCapacitorMultiplier(state.devices?.capacitors ?? 0, config, deviceMultiplier);

  const aImpContrib = big(strengths.AImp).mul(aImpOwned).mul(capacitorMult);
  const aUpgContrib = big(strengths.AUpg).mul(aUpgOwned);
  const aRecContrib = big(strengths.ARec).mul(aRecOwned);

  return aImpContrib.add(aUpgContrib).add(aRecContrib);
}

export function calculateCrcMultiplier(state = {}, config = {}, deviceMultiplier = 1) {
  const hasGadget = (state.devices?.crcGadget?.owned ?? 0) > 0;
  if (!hasGadget) return 1.0;
  const baseMult = config.devices?.crcGadget?.productionMultiplier ?? 2.0;
  return 1.0 + (baseMult - 1.0) * deviceMultiplier;
}

export function calculateEnergyProduction(state = {}, config = {}, statResolver = null) {
  const ap = calculateAlgorithmPerformance(state, config, statResolver);
  if (ap.lte(0)) return big(0);

  const compMult = calculateComputerPerformanceMultiplier(state.computerLevel ?? 1, config);
  const deviceMultiplier = statResolver
    ? statResolver.resolve("devices.globalMultiplier", { state, config })
    : calculateTotalDeviceMultiplier(state, config);

  const crcMult = statResolver
    ? statResolver.resolve("devices.crc.multiplier", { state, config })
    : calculateCrcMultiplier(state, config, deviceMultiplier);

  return ap.mul(compMult).mul(crcMult);
}

export function calculateEnergyOverflowDecay(storedEnergy = 0, stableCapacity = 0, config = {}) {
  const energy = big(storedEnergy);
  const cap = big(stableCapacity);
  const overflow = bigMax(0, energy.sub(cap));
  if (overflow.lte(0)) return big(0);

  const rate = config.decay?.overflowDecayRate ?? 0.009;
  const power = config.decay?.overflowDecayPower ?? 1.35;
  return big(rate).mul(overflow.pow(power));
}

// ============================================================================
// 2. DATA (XP) & COMPUTER LEVEL PROGRESSION
// ============================================================================

export function calculateDataFromAlgorithms(state = {}, config = {}) {
  const aImpVal = config.dataXP?.aImpData ?? 1;
  const aUpgVal = config.dataXP?.aUpgData ?? 9;
  const aRecVal = config.dataXP?.aRecData ?? 81;

  const aImpOwned = state.algorithms?.AImp?.owned ?? 0;
  const aUpgOwned = state.algorithms?.AUpg?.owned ?? 0;
  const aRecOwned = state.algorithms?.ARec?.owned ?? 0;

  return aImpOwned * aImpVal + aUpgOwned * aUpgVal + aRecOwned * aRecVal;
}

export function calculateAvailableData(state = {}, config = {}) {
  const fromAlgorithms = calculateDataFromAlgorithms(state, config);
  const fromHardDisk = state.devices?.hardDisks?.buffer ?? state.hardDiskBuffer ?? 0;
  return fromAlgorithms + fromHardDisk;
}

export function calculateRequiredDataForNextComputerLevel(currentLevel = 1, config = {}) {
  const k = Math.max(1, Math.floor(currentLevel ?? 1));
  const base = config.dataXP?.machineLearning?.baseRequirement ?? 693;
  const scale = config.dataXP?.machineLearning?.scaleMultiplier ?? 2304;
  const exp = config.dataXP?.machineLearning?.powerExponent ?? 1.6643485138;
  return Math.ceil(base + scale * ((k - 1) ** exp));
}

// ============================================================================
// 3. FACILITY OPTIMIZATION & DEVICE AMPLIFIERS
// ============================================================================

export function calculateFacilityOptimizationRequirement(completedCount = 0, config = {}) {
  const H = Math.max(0, Math.floor(completedCount ?? 0));
  const initial = config.facilityOptimization?.initialLevelRequired ?? 9;
  const step = config.facilityOptimization?.levelIncrement ?? 3;
  return initial + step * H;
}

export function calculateFacilityDeviceMultiplier(completedCount = 0, config = {}) {
  const H = Math.max(0, Math.floor(completedCount ?? 0));
  const base = config.facilityOptimization?.deviceMultiplierBase ?? 1.09;
  return base ** H;
}

export function calculateProcessorDeviceMultiplier(processorsOwned = 0, config = {}) {
  const P = Math.max(0, Math.floor(processorsOwned ?? 0));
  const bonusPerUnit = config.devices?.processor?.bonusPerUnit ?? 0.03;
  return 1 + bonusPerUnit * P;
}

export function calculateTotalDeviceMultiplier(state = {}, config = {}) {
  const facilityMult = calculateFacilityDeviceMultiplier(state.facilityOptimizations ?? 0, config);
  const procMult = calculateProcessorDeviceMultiplier(state.devices?.processors ?? 0, config);
  return facilityMult * procMult;
}

// ============================================================================
// 4. STUDY SPEED, TRANSISTORS, MICROPROCESSOR & OVERCLOCK
// ============================================================================

export function calculateTransistorStudySpeedMultiplier(transistorsAllocated = 0, config = {}, deviceMultiplier = 1) {
  const T = Math.max(0, Math.floor(transistorsAllocated ?? 0));
  const rate = config.devices?.transistor?.speedBonusPerUnit ?? 0.05;
  return 1 + rate * T * deviceMultiplier;
}

export function calculateMicroprocessorStudyMultiplier(transistorsAllocated = 0, config = {}, deviceMultiplier = 1) {
  const T = Math.max(0, Math.floor(transistorsAllocated ?? 0));
  const base = config.devices?.microprocessor?.multiplierBase ?? 1.12;
  const rawBonus = base ** T - 1;
  return 1 + rawBonus * deviceMultiplier;
}

export function calculateOverclockDuration(transistorsConsumed = 2, config = {}) {
  const T = Math.max(2, Math.floor(transistorsConsumed ?? 2));
  const base = config.devices?.overclocker?.durationBase ?? 1.5;
  return Math.log(T) / Math.log(base);
}

export function calculateOverclockBonusMultiplier(transistorsConsumed = 2, config = {}) {
  const T = Math.max(2, Math.floor(transistorsConsumed ?? 2));
  const div = config.devices?.overclocker?.bonusDivisor ?? 3.0;
  return 1 + T / div;
}

export function calculateEffectiveStudySpeed(featureId = "AImp", state = {}, config = {}, statResolver = null) {
  const deviceMultiplier = statResolver
    ? statResolver.resolve("devices.globalMultiplier", { state, config })
    : calculateTotalDeviceMultiplier(state, config);

  const T = state.devices?.transistorAllocations?.[featureId] ?? 0;
  const transistorSpeed = calculateTransistorStudySpeedMultiplier(T, config, deviceMultiplier);

  let microMult = 1.0;
  const microTarget = state.devices?.microprocessor?.target ?? "AImp";
  const hasMicro = (state.devices?.microprocessor?.owned ?? 0) > 0;

  if (hasMicro && microTarget === featureId) {
    const overclock = state.devices?.overclocker;
    if (overclock?.active && overclock.target === featureId) {
      const consumedT = overclock.consumedTransistors ?? 2;
      const baseMicroBonus = (config.devices?.microprocessor?.multiplierBase ?? 1.12) ** consumedT - 1;
      const ocBonus = calculateOverclockBonusMultiplier(consumedT, config);
      microMult = 1 + baseMicroBonus * ocBonus * deviceMultiplier;
    } else {
      microMult = calculateMicroprocessorStudyMultiplier(T, config, deviceMultiplier);
    }
  }

  return Math.max(0.01, transistorSpeed * microMult);
}

export function calculateEffectiveStudyDuration(featureId = "AImp", state = {}, config = {}, statResolver = null) {
  const baseDuration = config.economy?.baseStudyDurationSeconds ?? 0.5;
  const speed = calculateEffectiveStudySpeed(featureId, state, config, statResolver);
  return speed > 0 ? baseDuration / speed : baseDuration;
}

// ============================================================================
// 5. POWER CELLS & OPERATIONAL CAPACITY
// ============================================================================

export function calculatePowerCellCost(ownedCount = 0, config = {}) {
  const N = Math.max(0, Math.floor(ownedCount ?? 0));
  if (N === 0) return big(config.devices?.powerCell?.initialCost ?? 1.0);
  const base = config.devices?.powerCell?.initialCost ?? 1.0;
  const mult = config.devices?.powerCell?.costMultiplier ?? 2.25;
  return big(base).mul(big(mult).pow(N));
}

export function calculatePowerCellCapacity(ownedCount = 0, state = {}, config = {}, statResolver = null) {
  const count = Math.max(0, Math.floor(ownedCount ?? 0));
  const baseCap = config.devices?.powerCell?.baseCapacity ?? 1e-3;
  const deviceMultiplier = statResolver
    ? statResolver.resolve("devices.globalMultiplier", { state, config })
    : calculateTotalDeviceMultiplier(state, config);
  return big(count).mul(baseCap).mul(deviceMultiplier);
}

// ============================================================================
// 6. HARD DISK DRAIN & DATA GENERATION
// ============================================================================

export function calculateHardDiskXpRate(activeDisks = 0, state = {}, config = {}, statResolver = null) {
  const disks = Math.max(0, Math.floor(activeDisks ?? 0));
  const baseRate = config.devices?.hardDisk?.dataRatePerDisk ?? 3.0;
  const deviceMultiplier = statResolver
    ? statResolver.resolve("devices.globalMultiplier", { state, config })
    : calculateTotalDeviceMultiplier(state, config);
  return disks * baseRate * deviceMultiplier;
}

export function calculateHardDiskEnergyDrain(activeDisks = 0, activeSeconds = 0, config = {}) {
  const disks = Math.max(0, Math.floor(activeDisks ?? 0));
  if (disks <= 0) return big(0);
  const baseDrain = config.devices?.hardDisk?.baseEnergyDrainPerSecond ?? 1e-10;
  const timeConstant = config.devices?.hardDisk?.drainTimeConstant ?? 60.0;
  const growth = 1 + activeSeconds / timeConstant;
  return big(baseDrain).mul(disks).mul(growth);
}

// ============================================================================
// 7. GENERIC DEVICE PRICING & BULK CALCULATIONS
// ============================================================================

export function calculateGeometricCost(initialCost, multiplier, currentOwned) {
  const N = Math.max(0, Math.floor(currentOwned ?? 0));
  return big(initialCost).mul(big(multiplier).pow(N));
}

export function calculateBulkGeometricCost(initialCost, multiplier, currentOwned, count = 1) {
  const k = Math.max(1, Math.floor(count ?? 1));
  const N = Math.max(0, Math.floor(currentOwned ?? 0));

  if (k === 1) {
    return calculateGeometricCost(initialCost, multiplier, N);
  }

  // Exact summation with BigNum
  const r = big(multiplier);
  if (r.eq(1)) {
    return big(initialCost).mul(k);
  }

  // Cost(N) = C0 * r^N * (r^k - 1) / (r - 1)
  const c0 = big(initialCost);
  const rPowN = r.pow(N);
  const rPowK = r.pow(k);
  const numerator = rPowK.sub(1);
  const denominator = r.sub(1);

  return c0.mul(rPowN).mul(numerator).div(denominator);
}

export function calculateDeviceCost(type, owned = 0, config = {}) {
  switch (type) {
    case "chip": {
      const init = config.devices?.chip?.initialCost ?? 3e-11;
      const mult = config.devices?.chip?.costMultiplier ?? 4.0;
      return calculateGeometricCost(init, mult, owned);
    }
    case "transistorBoard": {
      return big(config.devices?.transistorBoard?.initialCost ?? 2e-10);
    }
    case "transistor": {
      const init = config.devices?.transistor?.initialCost ?? 3e-11;
      const mult = config.devices?.transistor?.costMultiplier ?? 1.4;
      return calculateGeometricCost(init, mult, owned);
    }
    case "microprocessor": {
      return big(config.devices?.microprocessor?.initialCost ?? 3e-9);
    }
    case "overclocker": {
      return big(config.devices?.overclocker?.initialCost ?? 9e-8);
    }
    case "crcGadget": {
      return big(config.devices?.crcGadget?.initialCost ?? 1e-8);
    }
    case "capacitor": {
      const init = config.devices?.capacitor?.initialCost ?? 1e-8;
      const mult = config.devices?.capacitor?.costMultiplier ?? 5.0;
      return calculateGeometricCost(init, mult, owned);
    }
    case "processor": {
      const init = config.devices?.processor?.initialCost ?? 1e-4;
      const mult = config.devices?.processor?.costMultiplier ?? 2.0;
      return calculateGeometricCost(init, mult, owned);
    }
    case "hardDisk": {
      const init = config.devices?.hardDisk?.initialCost ?? 1e-5;
      const mult = config.devices?.hardDisk?.costMultiplier ?? 9.0;
      return calculateGeometricCost(init, mult, owned);
    }
    case "powerCell": {
      return calculatePowerCellCost(owned, config);
    }
    default:
      return big(0);
  }
}

export function calculateBulkDeviceCost(type, currentOwned = 0, count = 1, config = {}) {
  const kCount = Math.max(1, Math.floor(count ?? 1));

  switch (type) {
    case "chip": {
      const init = config.devices?.chip?.initialCost ?? 3e-11;
      const mult = config.devices?.chip?.costMultiplier ?? 4.0;
      return calculateBulkGeometricCost(init, mult, currentOwned, kCount);
    }
    case "transistorBoard":
    case "microprocessor":
    case "overclocker":
    case "crcGadget": {
      return calculateDeviceCost(type, currentOwned, config);
    }
    case "transistor": {
      const init = config.devices?.transistor?.initialCost ?? 3e-11;
      const mult = config.devices?.transistor?.costMultiplier ?? 1.4;
      return calculateBulkGeometricCost(init, mult, currentOwned, kCount);
    }
    case "capacitor": {
      const init = config.devices?.capacitor?.initialCost ?? 1e-8;
      const mult = config.devices?.capacitor?.costMultiplier ?? 5.0;
      return calculateBulkGeometricCost(init, mult, currentOwned, kCount);
    }
    case "processor": {
      const init = config.devices?.processor?.initialCost ?? 1e-4;
      const mult = config.devices?.processor?.costMultiplier ?? 2.0;
      return calculateBulkGeometricCost(init, mult, currentOwned, kCount);
    }
    case "hardDisk": {
      const init = config.devices?.hardDisk?.initialCost ?? 1e-5;
      const mult = config.devices?.hardDisk?.costMultiplier ?? 9.0;
      return calculateBulkGeometricCost(init, mult, currentOwned, kCount);
    }
    case "powerCell": {
      let total = big(0);
      for (let i = 0; i < kCount; i++) {
        total = total.add(calculatePowerCellCost(currentOwned + i, config));
      }
      return total;
    }
    default:
      return big(0);
  }
}

// ============================================================================
// REGISTER FORMULAS IN DEFAULT FORMULA REGISTRY
// ============================================================================

defaultFormulaRegistry.register("algorithmBaseStrengths", calculateAlgorithmBaseStrengths);
defaultFormulaRegistry.register("computerPerformanceMultiplier", calculateComputerPerformanceMultiplier);
defaultFormulaRegistry.register("capacitorMultiplier", calculateCapacitorMultiplier);
defaultFormulaRegistry.register("algorithmPerformance", calculateAlgorithmPerformance);
defaultFormulaRegistry.register("crcMultiplier", calculateCrcMultiplier);
defaultFormulaRegistry.register("energyProduction", calculateEnergyProduction);
defaultFormulaRegistry.register("energyOverflowDecay", calculateEnergyOverflowDecay);
defaultFormulaRegistry.register("dataFromAlgorithms", calculateDataFromAlgorithms);
defaultFormulaRegistry.register("availableData", calculateAvailableData);
defaultFormulaRegistry.register("requiredDataForNextComputerLevel", calculateRequiredDataForNextComputerLevel);
defaultFormulaRegistry.register("facilityOptimizationRequirement", calculateFacilityOptimizationRequirement);
defaultFormulaRegistry.register("facilityDeviceMultiplier", calculateFacilityDeviceMultiplier);
defaultFormulaRegistry.register("processorDeviceMultiplier", calculateProcessorDeviceMultiplier);
defaultFormulaRegistry.register("totalDeviceMultiplier", calculateTotalDeviceMultiplier);
defaultFormulaRegistry.register("transistorStudySpeedMultiplier", calculateTransistorStudySpeedMultiplier);
defaultFormulaRegistry.register("microprocessorStudyMultiplier", calculateMicroprocessorStudyMultiplier);
defaultFormulaRegistry.register("overclockDuration", calculateOverclockDuration);
defaultFormulaRegistry.register("overclockBonusMultiplier", calculateOverclockBonusMultiplier);
defaultFormulaRegistry.register("effectiveStudySpeed", calculateEffectiveStudySpeed);
defaultFormulaRegistry.register("effectiveStudyDuration", calculateEffectiveStudyDuration);
defaultFormulaRegistry.register("powerCellCost", calculatePowerCellCost);
defaultFormulaRegistry.register("powerCellCapacity", calculatePowerCellCapacity);
defaultFormulaRegistry.register("hardDiskXpRate", calculateHardDiskXpRate);
defaultFormulaRegistry.register("hardDiskEnergyDrain", calculateHardDiskEnergyDrain);
defaultFormulaRegistry.register("deviceCost", calculateDeviceCost);
defaultFormulaRegistry.register("bulkDeviceCost", calculateBulkDeviceCost);

// Compatibility aliases
export const calculateProduction = calculateEnergyProduction;


