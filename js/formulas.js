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

export function calculateAlgorithmStrengths(computerLevel = 1, config = {}, capacitorMultiplier = 1.0) {
  const L = Math.max(1, Math.floor(computerLevel ?? 1));
  const B = config.economy?.algorithmBaseStrength ?? 1e-15;
  const F = config.economy?.algorithmConversionFactor ?? 12;
  const C = Number.isFinite(Number(capacitorMultiplier)) && Number(capacitorMultiplier) >= 0
    ? Number(capacitorMultiplier)
    : 1.0;

  // Step 1: Base AImp strength amplified by Computer Level and Capacitor multiplier
  const aImp = B * L * C;
  // Step 2: AUpg inherits Capacitor-amplified AImp strength
  const aUpg = aImp * F * (L + 1);
  // Step 3: ARec inherits Capacitor-amplified AUpg strength
  const aRec = aUpg * F * (L + 1);
  // Step 4: ARed inherits Capacitor-amplified ARec strength
  const aRed = aRec * F * (L + 1);

  return {
    AImp: aImp,
    AUpg: aUpg,
    ARec: aRec,
    ARed: aRed,
  };
}

export function calculateAlgorithmBaseStrengths(config = {}) {
  return calculateAlgorithmStrengths(1, config, 1.0);
}

export function calculateComputerPerformanceMultiplier(computerLevel = 1, config = {}) {
  // Obsolete global multiplier: Computer Level is now integrated directly into
  // individual algorithm feature strengths (AImp: B*L, AUpg: B*F*L*(L+1), ARec: B*F^2*L*(L+1)^2).
  // Returns 1.0 to prevent any double-application of Computer Level.
  return 1.0;
}

export function calculateCapacitorMultiplier(capacitorsOwned = 0, config = {}, deviceMultiplier = 1) {
  const c = Math.max(0, Math.floor(capacitorsOwned ?? 0));
  const bonusPerUnit = config.devices?.capacitor?.bonusPerUnit ?? 0.5;
  return 1 + bonusPerUnit * c * deviceMultiplier;
}

export function calculateAlgorithmPerformance(state = {}, config = {}, statResolver = null) {
  const compLevel = state.computerLevel ?? 1;
  const aImpOwned = state.algorithms?.AImp?.owned ?? 0;
  const aUpgOwned = state.algorithms?.AUpg?.owned ?? 0;
  const aRecOwned = state.algorithms?.ARec?.owned ?? 0;
  const aRedOwned = state.algorithms?.ARed?.owned ?? 0;

  const deviceMultiplier = statResolver
    ? statResolver.resolve("devices.globalMultiplier", { state, config })
    : calculateTotalDeviceMultiplier(state, config);

  const capacitorMult = statResolver
    ? statResolver.resolve("algorithms.AImp.capacitorMultiplier", { state, config })
    : calculateCapacitorMultiplier(state.devices?.capacitors ?? 0, config, deviceMultiplier);

  // Capacitors cascade into the entire Algorithm Feature chain through AImp
  const strengths = calculateAlgorithmStrengths(compLevel, config, capacitorMult);

  const aImpContrib = big(strengths.AImp).mul(aImpOwned);
  const aUpgContrib = big(strengths.AUpg).mul(aUpgOwned);
  const aRecContrib = big(strengths.ARec).mul(aRecOwned);
  const aRedContrib = big(strengths.ARed ?? 0).mul(aRedOwned);

  return aImpContrib.add(aUpgContrib).add(aRecContrib).add(aRedContrib);
}

export function calculateCrcMultiplier(state = {}, config = {}, deviceMultiplier = 1) {
  const hasGadget = (state.devices?.crcGadget?.owned ?? 0) > 0;
  if (!hasGadget) return 1.0;
  const baseMult = config.devices?.crcGadget?.productionMultiplier ?? 2.0;
  return 1.0 + (baseMult - 1.0) * deviceMultiplier;
}

export function calculateBackpropagatorMultiplier(stateOrCount = 0, config = {}, isOwnedOrResolver = null) {
  let owned = false;
  let R = 0;

  if (typeof stateOrCount === "object" && stateOrCount !== null) {
    const state = stateOrCount;
    owned = (state.devices?.backpropagator?.owned ?? state.devices?.backpropagator ?? 0) > 0;
    R = Math.max(0, Math.floor(state.algorithms?.ARed?.owned ?? 0));
  } else {
    // Direct numerical call: calculateBackpropagatorMultiplier(ownedARed, config, isOwned)
    R = Math.max(0, Math.floor(Number(stateOrCount) || 0));
    owned = isOwnedOrResolver === false ? false : true;
  }

  if (!owned || R <= 0) {
    return big(1.0);
  }

  const devConfig = config.devices?.backpropagator ?? {};

  const q = Number(devConfig.resonanceBase ?? 8.5);
  const Rsoft = Number(devConfig.softcapStart ?? 100);
  const Rhard = Number(devConfig.hardcapStart ?? 1000);
  const s = Number(devConfig.softcapScale ?? 100);

  const Rbounded = Math.min(R, Rhard);

  let effectiveR = Rbounded;
  if (Rbounded > Rsoft) {
    effectiveR = Rsoft + s * Math.log1p((Rbounded - Rsoft) / s);
  }

  const exponent = Math.sqrt(effectiveR);
  return big(q).pow(exponent);
}

export function calculateEnergyProduction(state = {}, config = {}, statResolver = null) {
  const ap = calculateAlgorithmPerformance(state, config, statResolver);
  if (ap.lte(0)) return big(0);

  const deviceMultiplier = statResolver
    ? statResolver.resolve("devices.globalMultiplier", { state, config })
    : calculateTotalDeviceMultiplier(state, config);

  const crcMult = statResolver
    ? statResolver.resolve("devices.crc.multiplier", { state, config })
    : calculateCrcMultiplier(state, config, deviceMultiplier);

  const backpropagatorMult = calculateBackpropagatorMultiplier(state, config, statResolver);

  return ap.mul(crcMult).mul(backpropagatorMult);
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

export function calculateEnergyEraProgress(storedEnergy = 0, config = {}) {
  const eVal = big(storedEnergy);
  const targetVal = big(config.energyEraProgress?.targetStoredEnergy ?? 100000000000);
  const scaleVal = big(config.energyEraProgress?.logScale ?? 1e-12);

  if (eVal.lte(0) || targetVal.lte(0) || scaleVal.lte(0)) {
    return 0;
  }
  if (eVal.gte(targetVal)) {
    return 1.0;
  }

  const clampedE = bigMin(eVal, targetVal);
  const ratioE = clampedE.div(scaleVal);
  const ratioT = targetVal.div(scaleVal);

  let num;
  if (ratioE.lt(1e-4)) {
    num = Math.log1p(ratioE.toNumber());
  } else {
    num = ratioE.add(1).ln().toNumber();
  }

  const den = ratioT.add(1).ln().toNumber();
  if (den <= 0 || !Number.isFinite(den)) return 0;

  const progress = num / den;
  return Math.min(1.0, Math.max(0, Number.isFinite(progress) ? progress : 0));
}

export function calculateEnergyEraPercent(storedEnergy = 0, config = {}) {
  const progress = calculateEnergyEraProgress(storedEnergy, config);
  if (progress >= 1.0) return 100.0;
  return Math.floor(progress * 1000) / 10;
}

// ============================================================================
// 2. DATA (XP) & COMPUTER LEVEL PROGRESSION
// ============================================================================

export function calculateDataFromAlgorithms(state = {}, config = {}) {
  const aImpVal = config.dataXP?.aImpData ?? 1;
  const aUpgVal = config.dataXP?.aUpgData ?? 9;
  const aRecVal = config.dataXP?.aRecData ?? 81;
  const aRedVal = config.dataXP?.aRedData ?? 0;

  const aImpOwned = state.algorithms?.AImp?.owned ?? 0;
  const aUpgOwned = state.algorithms?.AUpg?.owned ?? 0;
  const aRecOwned = state.algorithms?.ARec?.owned ?? 0;
  const aRedOwned = state.algorithms?.ARed?.owned ?? 0;

  return aImpOwned * aImpVal + aUpgOwned * aUpgVal + aRecOwned * aRecVal + aRedOwned * aRedVal;
}

export function calculateAvailableData(state = {}, config = {}) {
  const fromAlgorithms = calculateDataFromAlgorithms(state, config);
  const fromHardDisk = state.devices?.hardDisks?.buffer ?? state.hardDiskBuffer ?? 0;
  return fromAlgorithms + fromHardDisk;
}

export function calculateEffectiveAvailableData(state = {}, config = {}) {
  const raw = calculateAvailableData(state, config);
  const required = calculateRequiredDataForNextComputerLevel(state.computerLevel ?? 1, config);
  return Math.min(Math.max(0, raw), required);
}

export function calculateUsefulHardDiskCapacity(state = {}, config = {}) {
  const required = calculateRequiredDataForNextComputerLevel(state.computerLevel ?? 1, config);
  const fromAlgorithms = calculateDataFromAlgorithms(state, config);
  const fromHardDisk = state.devices?.hardDisks?.buffer ?? state.hardDiskBuffer ?? 0;
  return Math.max(0, required - fromAlgorithms - fromHardDisk);
}

export function calculatePolynomialDataRequirement(level = 1, config = {}) {
  const k = Math.max(1, Math.floor(level ?? 1));
  const base = config.dataXP?.machineLearning?.baseRequirement ?? 693;
  const scale = config.dataXP?.machineLearning?.scaleMultiplier ?? 2304;
  const exp = config.dataXP?.machineLearning?.powerExponent ?? 1.6643485138;
  return Math.ceil(base + scale * ((k - 1) ** exp));
}

export function calculateRequiredDataForNextComputerLevel(currentLevel = 1, config = {}) {
  const L = Math.max(1, Math.floor(currentLevel ?? 1));

  const rawAnchor = config.dataXP?.machineLearning?.xpExponentialStartLevel
    ?? config.dataXP?.xpExponentialStartLevel
    ?? config.xpExponentialStartLevel
    ?? 5;
  const A = Number.isFinite(rawAnchor) && rawAnchor >= 1 ? Math.floor(rawAnchor) : 5;

  const rawGrowth = config.dataXP?.machineLearning?.xpGrowthFactor
    ?? config.dataXP?.xpGrowthFactor
    ?? config.xpGrowthFactor
    ?? 1.45;
  const G = Number.isFinite(rawGrowth) && rawGrowth > 1 ? rawGrowth : 1.45;

  let baseXp = 0;
  // For L <= A: retain exact existing early-game polynomial progression
  if (L <= A) {
    baseXp = calculatePolynomialDataRequirement(L, config);
  } else {
    // For L > A: exponential progression anchored at Level A: ceil(XP_A * G^(L - A))
    const xpA = calculatePolynomialDataRequirement(A, config);
    const power = L - A;
    const mult = G ** power;

    if (!Number.isFinite(mult)) {
      try {
        baseXp = big(xpA).mul(big(G).pow(power)).ceil();
      } catch {
        baseXp = big(Number.MAX_SAFE_INTEGER);
      }
    } else {
      baseXp = Math.ceil(xpA * mult);
    }
  }

  // Phase 6.2: Machine Learning late-XP pressure for Computer Levels > latePressureStartLevel (12)
  const lateStart = config.dataXP?.machineLearning?.latePressureStartLevel ?? 12;
  const lateFactor = config.dataXP?.machineLearning?.latePressureFactor ?? 1;

  if (L > lateStart && lateFactor > 1) {
    const latePower = L - lateStart;
    try {
      const finalVal = big(baseXp).mul(big(lateFactor).pow(latePower)).ceil();
      if (finalVal.gt(1e300)) {
        return 1e300 * (1 + L * 1e-14);
      }
      return finalVal.toNumber();
    } catch {
      return 1e300 * (1 + L * 1e-14);
    }
  }

  return typeof baseXp === "number" ? baseXp : (baseXp.toNumber ? baseXp.toNumber() : Number(baseXp));
}

// ============================================================================
// 3. FACILITY OPTIMIZATION & DEVICE AMPLIFIERS
// ============================================================================

export function calculateFacilityOptimizationRequirement(completedCount = 0, config = {}) {
  const H = Math.max(0, Math.floor(completedCount ?? 0));
  const fo = config.facilityOptimization || config.setupOptimization || {};
  const initial = fo.initialLevelRequired ?? fo.requiredLevel ?? 6;
  const step = fo.levelIncrement ?? fo.levelStep ?? 3;
  return initial + step * H;
}

export const calculateSetupOptimizationRequirement = calculateFacilityOptimizationRequirement;

export function calculateFacilityDeviceMultiplier(completedCount = 0, config = {}) {
  const S = Math.max(0, Math.floor(completedCount ?? 0));
  const fo = config.facilityOptimization || config.setupOptimization || {};
  const mode = fo.curveMode ?? (fo.deviceEffectCoefficient !== undefined ? "logarithmic" : "exponential");

  if (mode === "exponential") {
    const base = fo.deviceMultiplierBase ?? fo.multiplierBase ?? 1.09;
    return base ** S;
  }

  // Authoritative logarithmic curve: D(S) = 1 + alpha * Math.log1p(S)
  const alpha = fo.deviceEffectCoefficient ?? 1.35;
  return 1 + alpha * Math.log1p(S);
}

export const calculateSetupDeviceMultiplier = calculateFacilityDeviceMultiplier;

export function calculateProcessorDeviceMultiplier(processorsOwned = 0, config = {}) {
  const P = Math.max(0, Math.floor(processorsOwned ?? 0));
  const bonusPerUnit = config.devices?.processor?.bonusPerUnit ?? 0.05;
  return 1 + bonusPerUnit * P;
}

export function calculateStudySpeedDeviceMultiplier(state = {}, config = {}) {
  const facilityMult = calculateFacilityDeviceMultiplier(state.facilityOptimizations ?? 0, config);
  const procMult = calculateProcessorDeviceMultiplier(state.devices?.processors ?? 0, config);
  return facilityMult * procMult;
}

export function calculateTotalDeviceMultiplier(state = {}, config = {}) {
  // Facility Optimization multiplier affects operational devices (except Power Cells)
  return calculateFacilityDeviceMultiplier(state.facilityOptimizations ?? 0, config);
}

// ============================================================================
// 4. STUDY SPEED, TRANSISTORS, MICROPROCESSOR & OVERCLOCK
// ============================================================================

export function calculateTransistorStudySpeedMultiplier(transistorsAllocated = 0, config = {}, deviceMultiplier = 1) {
  const T = Math.max(0, Math.floor(transistorsAllocated ?? 0));
  const rate = config.devices?.transistor?.speedBonusPerUnit ?? 0.05;
  return 1 + rate * T * deviceMultiplier;
}

export function calculateMicroprocessorStudyMultiplier(transistorsAllocated = 0, config = {}, deviceMultiplier = 1, microprocessorsOwned = 1) {
  const T = Math.max(0, Math.floor(transistorsAllocated ?? 0));
  const M = Math.max(0, Math.floor(microprocessorsOwned ?? 1));
  const base = config.devices?.microprocessor?.multiplierBase ?? 1.12;
  const rawBonus = (base ** T - 1) * M;
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

export function calculateStudyImproveMilestone(claimedCount = 0, config = {}) {
  const k = Math.max(0, Math.floor(claimedCount ?? 0));
  const initial = config.studyImprove?.initialMilestones ?? [33, 66, 188];
  const growth = config.studyImprove?.milestoneGrowthFactor ?? 2;

  const level = k + 1; // The next improve level aiming for
  if (level <= initial.length) {
    return initial[level - 1] ?? 33;
  }

  // threshold(k) = ceil(threshold(3) * milestoneGrowthFactor^(k - 3)) for level >= 4
  const anchor = initial[initial.length - 1] ?? 188;
  const power = level - initial.length;
  return Math.ceil(anchor * (growth ** power));
}

export function calculateStudyImproveMultiplier(claimedCount = 0, config = {}) {
  const k = Math.max(0, Math.floor(claimedCount ?? 0));
  const A = config.studyImprove?.speedCoefficient ?? 0.5;
  return 1 + A * Math.log2(k + 1);
}

export function calculateEffectiveStudySpeed(featureId = "AImp", state = {}, config = {}, statResolver = null) {
  const deviceMultiplier = statResolver
    ? statResolver.resolve("devices.studySpeedMultiplier", { state, config })
    : calculateStudySpeedDeviceMultiplier(state, config);

  const T = state.devices?.transistorAllocations?.[featureId] ?? 0;
  const transistorSpeed = calculateTransistorStudySpeedMultiplier(T, config, deviceMultiplier);

  let microMult = 1.0;
  const microTarget = state.devices?.microprocessor?.target ?? "AImp";
  const microOwned = state.devices?.microprocessor?.owned ?? 0;
  const hasMicro = microOwned > 0;

  if (hasMicro && microTarget === featureId) {
    const overclock = state.devices?.overclocker;
    if (overclock?.active && overclock.target === featureId) {
      const consumedT = overclock.consumedTransistors ?? 2;
      const baseMicroBonus = ((config.devices?.microprocessor?.multiplierBase ?? 1.12) ** consumedT - 1) * microOwned;
      const ocBonus = calculateOverclockBonusMultiplier(consumedT, config);
      microMult = 1 + baseMicroBonus * ocBonus * deviceMultiplier;
    } else {
      microMult = calculateMicroprocessorStudyMultiplier(T, config, deviceMultiplier, microOwned);
    }
  }

  // 1. Hardware-resolved study speed (Transistors, Microprocessor, Overclocker)
  const baseHardwareSpeed = Math.max(0.01, transistorSpeed * microMult);

  // 2. Study Improvement multiplier applies directly over the final production time/rate
  const claimed = state.studyImproves?.[featureId]?.claimed ?? 0;
  const improveMult = calculateStudyImproveMultiplier(claimed, config);

  return baseHardwareSpeed * improveMult;
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
  // Power Cells are exempt from both Facility Optimization multiplier and Processor bonus
  return big(count).mul(baseCap);
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
      const init = config.devices?.transistor?.initialCost ?? 250e-12;
      const mult = config.devices?.transistor?.costMultiplier ?? 1.6;
      const N = Math.max(0, Math.floor(owned ?? 0));
      const baseCost = calculateGeometricCost(init, mult, N);

      // Phase 6.1: Transistor late-price pressure for purchases beyond N0 (24)
      const N0 = config.devices?.transistor?.latePressureStart ?? 24;
      const kappa = config.devices?.transistor?.latePressureKappa ?? 0.18;

      if (N > N0 && kappa > 0) {
        const excess = N - N0;
        const pressure = Math.exp(kappa * Math.pow(excess, 1.5));
        return baseCost.mul(pressure);
      }
      return baseCost;
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
    case "microprocessor":
    case "transistorBoard":
    case "overclocker":
    case "crcGadget": {
      return calculateDeviceCost(type, currentOwned, config);
    }
    case "transistor": {
      const init = config.devices?.transistor?.initialCost ?? 250e-12;
      const mult = config.devices?.transistor?.costMultiplier ?? 1.6;
      const N0 = config.devices?.transistor?.latePressureStart ?? 24;
      const kappa = config.devices?.transistor?.latePressureKappa ?? 0.18;

      if (kappa <= 0 || (currentOwned + kCount) <= N0) {
        return calculateBulkGeometricCost(init, mult, currentOwned, kCount);
      }

      let total = big(0);
      let i = 0;
      if (currentOwned < N0) {
        const geomCount = N0 - currentOwned;
        total = total.add(calculateBulkGeometricCost(init, mult, currentOwned, geomCount));
        i = geomCount;
      }
      for (; i < kCount; i++) {
        total = total.add(calculateDeviceCost("transistor", currentOwned + i, config));
      }
      return total;
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

export function integrateEnergyStep(currentEnergy, production, stableCap, delta, config = {}) {
  const e0 = big(currentEnergy);
  const p = big(production);
  const cap = big(stableCap);
  const dt = big(delta);

  // If production is zero or negative, decay only drains towards capacity
  if (p.lte(0)) {
    const decay = calculateEnergyOverflowDecay(e0, cap, config);
    return bigMax(0, e0.sub(decay.mul(dt)));
  }

  // Fast path: if tentative energy without decay is <= capacity, decay is strictly 0
  const rhs = e0.add(p.mul(dt));
  if (rhs.lte(cap)) {
    return bigMax(0, rhs);
  }

  // Bounded monotonic implicit solver: E1 + dt * D(E1) = E0 + dt * P
  // D(E) is strictly monotonic non-decreasing, so E1 in [cap, rhs]
  let low = cap;
  let high = rhs;

  for (let iter = 0; iter < 35; iter++) {
    const mid = low.add(high).div(2);
    const d = calculateEnergyOverflowDecay(mid, cap, config);
    const g = mid.add(d.mul(dt));
    if (g.lt(rhs)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low.add(high).div(2);
}

// ============================================================================
// REGISTER FORMULAS IN DEFAULT FORMULA REGISTRY
// ============================================================================

defaultFormulaRegistry.register("algorithmBaseStrengths", calculateAlgorithmBaseStrengths);
defaultFormulaRegistry.register("algorithmStrengths", calculateAlgorithmStrengths);
defaultFormulaRegistry.register("computerPerformanceMultiplier", calculateComputerPerformanceMultiplier);
defaultFormulaRegistry.register("capacitorMultiplier", calculateCapacitorMultiplier);
defaultFormulaRegistry.register("algorithmPerformance", calculateAlgorithmPerformance);
defaultFormulaRegistry.register("crcMultiplier", calculateCrcMultiplier);
defaultFormulaRegistry.register("backpropagatorMultiplier", calculateBackpropagatorMultiplier);
defaultFormulaRegistry.register("energyProduction", calculateEnergyProduction);
defaultFormulaRegistry.register("energyOverflowDecay", calculateEnergyOverflowDecay);
defaultFormulaRegistry.register("integrateEnergyStep", integrateEnergyStep);
defaultFormulaRegistry.register("energyEraProgress", calculateEnergyEraProgress);
defaultFormulaRegistry.register("energyEraPercent", calculateEnergyEraPercent);
defaultFormulaRegistry.register("dataFromAlgorithms", calculateDataFromAlgorithms);
defaultFormulaRegistry.register("availableData", calculateAvailableData);
defaultFormulaRegistry.register("effectiveAvailableData", calculateEffectiveAvailableData);
defaultFormulaRegistry.register("usefulHardDiskCapacity", calculateUsefulHardDiskCapacity);
defaultFormulaRegistry.register("polynomialDataRequirement", calculatePolynomialDataRequirement);
defaultFormulaRegistry.register("requiredDataForNextComputerLevel", calculateRequiredDataForNextComputerLevel);
defaultFormulaRegistry.register("facilityOptimizationRequirement", calculateFacilityOptimizationRequirement);
defaultFormulaRegistry.register("setupOptimizationRequirement", calculateFacilityOptimizationRequirement);
defaultFormulaRegistry.register("facilityDeviceMultiplier", calculateFacilityDeviceMultiplier);
defaultFormulaRegistry.register("setupDeviceMultiplier", calculateFacilityDeviceMultiplier);
defaultFormulaRegistry.register("processorDeviceMultiplier", calculateProcessorDeviceMultiplier);
defaultFormulaRegistry.register("studySpeedDeviceMultiplier", calculateStudySpeedDeviceMultiplier);
defaultFormulaRegistry.register("totalDeviceMultiplier", calculateTotalDeviceMultiplier);
defaultFormulaRegistry.register("transistorStudySpeedMultiplier", calculateTransistorStudySpeedMultiplier);
defaultFormulaRegistry.register("microprocessorStudyMultiplier", calculateMicroprocessorStudyMultiplier);
defaultFormulaRegistry.register("overclockDuration", calculateOverclockDuration);
defaultFormulaRegistry.register("overclockBonusMultiplier", calculateOverclockBonusMultiplier);
defaultFormulaRegistry.register("studyImproveMilestone", calculateStudyImproveMilestone);
defaultFormulaRegistry.register("studyImproveMultiplier", calculateStudyImproveMultiplier);
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


