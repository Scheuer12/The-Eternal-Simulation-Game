import {
  big,
  bigClamp,
  bigMax,
  bigMin,
  formatEngineering,
  toFiniteNumber,
} from "./numeric.js";

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateImprovementBonus(
  completedImprovements,
  config,
  calculationMethodUpgrades = 0,
) {
  const study = config.study;
  const effectiveImprovements =
    completedImprovements *
    study.effectPenaltyMultiplierPerMethod ** calculationMethodUpgrades;
  let bonus;

  if (effectiveImprovements < study.onboardingImprovements) {
    const remaining = 1 - effectiveImprovements / study.onboardingImprovements;

    bonus =
      study.baselineBonus +
      (study.onboardingInitialBonus - study.baselineBonus) *
        remaining ** study.onboardingDecayShape;
  } else {
    const lateImprovements =
      effectiveImprovements - study.onboardingImprovements;

    bonus =
      study.baselineBonus /
      (1 + lateImprovements / study.lateDecayScale) ** study.lateDecayPower;
  }

  return Math.max(study.minimumBonus ?? 0, bonus);
}

function calculateEscalatingCost(baseCost, growth, exponent, ownedCount) {
  if (ownedCount <= 0) return big(baseCost);
  return big(baseCost).mul(big(growth).pow(ownedCount ** exponent));
}

export function calculateAutoCalculatorCost(ownedCalculators, config) {
  return calculateEscalatingCost(
    config.autoCalculator.baseCost,
    config.autoCalculator.costGrowth,
    config.autoCalculator.costGrowthExponent,
    ownedCalculators,
  );
}

export function calculateProcessorCost(ownedProcessors, config) {
  return calculateEscalatingCost(
    config.processor.baseCost,
    config.processor.costGrowth,
    config.processor.costGrowthExponent,
    ownedProcessors,
  );
}

export function calculateOverclockerCost(ownedOverclockers, config) {
  return calculateEscalatingCost(
    config.overclocker.baseCost,
    config.overclocker.costGrowth,
    config.overclocker.costGrowthExponent,
    ownedOverclockers,
  );
}

export function calculateCrcCost(state, config) {
  const purchasedCrcs = Math.max(
    0,
    state.crcCount - config.energy.initialCrcCount,
  );

  return calculateEscalatingCost(
    config.crcConstruction.baseCost,
    config.crcConstruction.costGrowth,
    config.crcConstruction.costGrowthExponent,
    purchasedCrcs,
  );
}

export function calculatePowerCellCost(ownedPowerCells, config) {
  const owned = Math.max(1, ownedPowerCells);
  const currentCapacity = config.energy.powerCellCapacity * owned;
  const completedArrays = Math.floor(owned / config.powerModule.cellsPerModule);
  const arrayPressure =
    (config.powerCell.arrayCostGrowthMultiplier ?? 1) ** completedArrays;
  const multiplier =
    config.powerCell.baseCapacityCostMultiplier *
    (1 + (owned - 1) / config.powerCell.costGrowthScale) **
      config.powerCell.costGrowthPower *
    arrayPressure;

  return big(currentCapacity).mul(multiplier);
}

export function calculatePowerModuleRequirement(ownedPowerModules, config) {
  return (ownedPowerModules + 1) * config.powerModule.cellsPerModule;
}

export function calculatePowerModuleCost(ownedPowerModules, config) {
  return calculateEscalatingCost(
    config.powerModule.baseCost,
    config.powerModule.costGrowth,
    config.powerModule.costGrowthExponent,
    ownedPowerModules,
  );
}

export function calculatePowerModuleCapacityMultiplier(state, config) {
  const modules = Math.max(0, state.powerModules);
  let effectiveModuleCount = modules;
  if (hasSciencePerk(state, "powerModulesScaling")) {
    const scaling =
      config.science?.energyPerks?.powerModuleScalingPerOwnedModule ?? 0.01;
    effectiveModuleCount += ((modules * (modules - 1)) / 2) * scaling;
  }
  return big(config.powerModule.capacityMultiplier).pow(effectiveModuleCount);
}

export function calculateStableEnergyCapacity(state, config) {
  return big(config.energy.powerCellCapacity)
    .mul(Math.max(1, state.powerCells))
    .mul(calculatePowerModuleCapacityMultiplier(state, config));
}

export function calculateEnergyOverflowDecay(state, config) {
  const capacity = calculateStableEnergyCapacity(state, config);
  const energy = big(state.energy);
  if (capacity.lte(0) || energy.lte(capacity)) return big(0);

  const overflowRatio = energy.sub(capacity).div(capacity);
  return capacity
    .mul(config.energy.overflowDecayRate)
    .mul(overflowRatio.pow(config.energy.overflowDecayPower));
}

export function calculateEnergyRetention(
  state,
  config,
  developmentMode = false,
) {
  const production = calculateProduction(state, config, developmentMode);
  if (production.lte(0))
    return big(state.energy).gt(calculateStableEnergyCapacity(state, config))
      ? 0
      : 1;

  return clamp(
    production
      .sub(calculateEnergyOverflowDecay(state, config))
      .div(production)
      .toNumber(),
    0,
    1,
  );
}

export function calculateAutoCalculatorSpeedMultiplier(state, config) {
  const calculators = state.devices.autoCalculators;
  if (calculators <= 0) return 1;

  const calculatorSpeed =
    config.autoCalculator.firstSpeedMultiplier *
    config.autoCalculator.additionalSpeedMultiplier ** (calculators - 1);

  return toFiniteNumber(
    big(calculatorSpeed)
      .mul(calculateDeviceEfficiencyMultiplier(state, config))
      .mul(calculateOverclockerSpeedMultiplier(state, config)),
    Number.MAX_VALUE,
  );
}

export function calculateRedundancyEffectiveCycles(improvements, config) {
  const settings = config.science?.redundancyElimination ?? {};
  const softcapStart = settings.softcapStartsAtImprovements ?? 50;
  const hardcapStart = settings.hardcapStartsAtImprovements ?? 100;
  const postSoftcapRate = settings.postSoftcapCycleRate ?? 0.08;
  const extraCap = settings.postSoftcapMaximumExtraCycles ?? 4;
  const cycles = Math.max(0, improvements);

  if (cycles <= softcapStart) return cycles;

  const counted = Math.min(cycles, hardcapStart);
  const extra = (counted - softcapStart) * postSoftcapRate;
  return softcapStart + Math.min(extra, extraCap);
}

export function calculateRedundancyEliminationSpeedMultiplier(state, config) {
  if (!state.science?.perks?.redundancyElimination) return 1;

  const bonus =
    config.science?.redundancyElimination
      ?.researchSpeedBonusPerUpgradePerCycle ?? 0;
  const effectiveCycles = calculateRedundancyEffectiveCycles(
    state.improvements,
    config,
  );

  return toFiniteNumber(
    big(1 + bonus).pow(state.upgrades * effectiveCycles),
    Number.MAX_VALUE,
  );
}

export function calculateProcessorImprovementSpeedMultiplier(state, config) {
  if (!hasSciencePerk(state, "processorBonusAppliesAImprovementSpeed")) {
    return 1;
  }
  const exponent =
    config.science?.studyPerks?.processorBonusImprovementSpeedExponent ?? 1.07;
  return toFiniteNumber(
    calculateDeviceEfficiencyMultiplier(state, config).pow(exponent),
    Number.MAX_VALUE,
  );
}

export function calculateOverclockerSpeedMultiplier(state, config) {
  const overclockers = state.devices.overclockers;
  if (overclockers <= 0 || !state.overclocker.active) return 1;

  return (
    config.overclocker.baseCalculatorSpeedMultiplier *
    config.overclocker.additionalCalculatorSpeedMultiplier ** (overclockers - 1)
  );
}

export function calculateOverclockerDrainPerSecond(state, config) {
  const overclockers = state.devices.overclockers;
  if (overclockers <= 0 || !state.overclocker.active) return big(0);
  const activeSeconds = Math.max(0, state.overclocker.activeSeconds ?? 0);
  const runtimeMultiplier = config.overclocker.runtimeDrainGrowthBase
    ? big(config.overclocker.runtimeDrainGrowthBase).pow(activeSeconds)
    : big(1).add(
        big(config.overclocker.runtimeDrainGrowthCoefficient).mul(
          activeSeconds ** config.overclocker.runtimeDrainGrowthPower,
        ),
      );

  return big(config.overclocker.baseEnergyDrainPerSecond)
    .mul(big(config.overclocker.energyDrainGrowth).pow(overclockers - 1))
    .mul(runtimeMultiplier);
}

export function calculateDeviceEfficiencyMultiplier(state, config) {
  return big(config.processor.deviceEfficiencyMultiplier).pow(
    state.devices.processors,
  );
}

export function hasSciencePerk(state, perkId) {
  return Boolean(state.science?.perks?.[perkId]);
}

export function calculateCrcProcessorBonusMultiplier(state, config) {
  if (!hasSciencePerk(state, "processorBonusAppliesCRC")) return big(1);
  const exponent =
    config.science?.energyPerks?.processorBonusExponentForCrc ?? 0.15;
  return calculateDeviceEfficiencyMultiplier(state, config).pow(exponent);
}

export function calculateScienceProductionMultiplier(state) {
  if (!hasSciencePerk(state, "sciencePoweredEnergyProduction")) return big(1);
  return bigMax(1, state.science?.totalScienceEarned ?? 0);
}

export function calculateCrcExponentialMultiplier(state, config) {
  if (!hasSciencePerk(state, "crcExponentialScaling")) return big(1);
  const perCrc =
    config.science?.energyPerks?.crcExponentialProductionPerCrc ?? 1.005;
  return big(perCrc).pow(Math.max(0, state.crcCount));
}

export function calculateQuantumCalculationBonus(totalQuarks, config) {
  const settings = config.science?.quantumPerks ?? {};
  const raw = bigMax(0, totalQuarks)
    .add(1)
    .log10()
    .mul(settings.calculationSpeedLogCoefficient ?? 0.015);
  const softcap = settings.calculationSpeedSoftcapRaw ?? 0.15;
  const slope = settings.calculationSpeedPostSoftcapSlope ?? 0.25;
  const maximum = settings.calculationSpeedMaximumBonus ?? 0.3;
  const effective = raw.lte(softcap)
    ? raw
    : big(softcap).add(raw.sub(softcap).mul(slope));
  return 1 + bigMin(maximum, effective).toNumber();
}

export function calculateQuantumSuperpositionRetention(totalQuarks, config) {
  const settings = config.science?.quantumPerks ?? {};
  const raw = bigMax(0, totalQuarks)
    .add(1)
    .log10()
    .mul(settings.superpositionRetentionLogCoefficient ?? 0.01);
  return bigMin(
    settings.superpositionMaximumRetention ?? 0.1,
    bigMax(0, raw),
  ).toNumber();
}

export function calculateDeviceDurationMultiplier(state, config) {
  return toFiniteNumber(
    big(1).div(calculateDeviceEfficiencyMultiplier(state, config)),
    0,
  );
}

export function calculateAlgorithmUpgradeRequirement(state, config) {
  return (
    config.algorithmUpgrade.initialImprovementsRequired +
    config.algorithmUpgrade.improvementsRequiredGrowth * state.upgrades
  );
}

export function calculateAlgorithmUpgradeDuration(
  state,
  config,
  developmentMode = false,
) {
  let duration =
    config.algorithmUpgrade.baseDurationSeconds *
    (1 +
      config.algorithmUpgrade.durationGrowthCoefficient *
        state.upgrades ** config.algorithmUpgrade.durationGrowthPower);

  if (hasSciencePerk(state, "quantumCalculationPrinciples")) {
    duration /= calculateQuantumCalculationBonus(
      state.quarks?.totalEarned ?? 0,
      config,
    );
  }

  if (developmentMode) {
    duration *= getDevelopmentDurationMultiplier(state, config);
  }

  return duration;
}

export function calculateCalculationMethodRequirement(state, config) {
  return (
    config.calculationMethodUpgrade.initialAlgorithmUpgradesRequired +
    config.calculationMethodUpgrade.algorithmUpgradesRequiredGrowth *
      state.calculationMethods
  );
}

export function calculateSetupOptimizationRequirement(state, config) {
  return (
    config.setupOptimization.initialMethodUpgradesRequired +
    config.setupOptimization.methodUpgradesRequiredGrowth *
      state.setupOptimizations
  );
}

export function calculateBlueprintResearchDuration(
  state,
  config,
  developmentMode = false,
) {
  let duration = config.blueprint.researchDurationSeconds;
  if (developmentMode) {
    duration *= getDevelopmentDurationMultiplier(state, config);
  }

  return duration;
}

export function canResearchBlueprint(state, config) {
  return (
    !state.discoveries.crcBlueprint &&
    big(state.peakEnergy).gte(config.blueprint.revealAtPeakEnergy)
  );
}

export function canPurchasePowerCell(state, config) {
  const requiredAlgorithmUpgrades =
    config?.powerCell?.algorithmUpgradesRequired ?? 3;
  return (
    state.devices.softDataDisplay && state.upgrades >= requiredAlgorithmUpgrades
  );
}

export function canAccessParticleLab(state, config) {
  return (
    big(state.peakEnergy).gte(config.particleLab.doorEnergyRequired) ||
    (state.science?.syntheses ?? 0) > 0
  );
}

export function calculateSciencePointCost(totalScienceEarned, config) {
  const settings = config.science?.sciencePointCost ?? {};
  const earned = Math.max(0, totalScienceEarned ?? 0);
  const exponent =
    (settings.baseExponent ?? 11) +
    (settings.linearExponentGrowth ?? 0.9) * earned +
    (settings.quadraticExponentGrowth ?? 0.055) * earned ** 2;

  return big(10).pow(exponent);
}

export function calculateParticleSynthesizerCost(state, config) {
  return big(config.particleLab.synthesizerEnergyRequired);
}

export function calculateParticleSynthesizerProgress(state, config) {
  return big(state.energy)
    .div(calculateParticleSynthesizerCost(state, config))
    .toNumber();
}

export function calculateSciencePointReward(
  energy,
  totalScienceEarned,
  config,
) {
  return big(energy).gte(calculateSciencePointCost(totalScienceEarned, config))
    ? 1
    : 0;
}

export function calculateQuarksGenerated(energy, config) {
  const unit = config.science?.quarks?.energyPerQuark ?? 100000000000;
  const available = big(energy);
  if (available.lt(unit)) return big(0);
  return available.div(unit).floor();
}

export function calculateQuarkCageCapacity(ownedCages, config) {
  const capacityPerCage = config.science?.quarkCage?.capacityPerCage ?? 10;
  const owned = Math.max(0, ownedCages ?? 0);
  return owned > 0 ? capacityPerCage * owned : 1;
}

export function calculateQuarkCapacity(state, config) {
  return big(
    calculateQuarkCageCapacity(
      state.scienceDevices?.quarkCages ?? 0,
      config,
    ),
  );
}

export function calculateQuarkCageCost(ownedCages, config) {
  const settings = config.science?.quarkCage ?? {};
  const baseExponent = settings.baseCostExponent ?? 11;
  const exponentGrowth = settings.costExponentGrowth ?? 1;
  return big(10).pow(
    baseExponent + exponentGrowth * Math.max(0, ownedCages ?? 0),
  );
}

export function calculateQuarkDecay(state, config) {
  const available = big(state.quarks?.available ?? 0);
  const capacity = calculateQuarkCapacity(state, config);
  if (capacity.lte(0) || available.lte(capacity)) return big(0);

  const settings = config.science?.quarks ?? {};
  const overflowRatio = available.sub(capacity).div(capacity);
  return capacity
    .mul(settings.decayRate ?? 0.12)
    .mul(overflowRatio.pow(settings.decayPower ?? 1.7));
}

export function getDevelopmentDurationMultiplier(state, config) {
  return (
    state.devSettings?.durationMultiplier ??
    config.development.durationMultiplier
  );
}

export function getDevelopmentProductionMultiplier(state, config) {
  return (
    state.devSettings?.productionMultiplier ??
    config.development.productionMultiplier
  );
}

export function calculateStudyDuration(state, config, developmentMode = false) {
  const study = config.study;
  const effectiveLoad = calculateStudyDurationLoad(
    state.improvements,
    state.setupOptimizations,
    config,
  );
  let duration =
    study.baseDurationSeconds *
    (1 +
      study.durationGrowthCoefficient *
        effectiveLoad ** study.durationGrowthPower);

  duration /= calculateAutoCalculatorSpeedMultiplier(state, config);
  duration /= calculateRedundancyEliminationSpeedMultiplier(state, config);
  duration /= calculateProcessorImprovementSpeedMultiplier(state, config);

  if (developmentMode) {
    duration *= getDevelopmentDurationMultiplier(state, config);
  }

  return duration;
}

export function calculateStudyDurationLoad(
  completedImprovements,
  setupOptimizations,
  config,
) {
  const study = config.study;
  const earlyUntil = study.durationEarlyLoadUntil;
  const fullAt = study.durationFullLoadAt;
  const earlyLoad = completedImprovements * study.durationEarlyLoadMultiplier;
  let baseLoad = completedImprovements;

  if (completedImprovements <= earlyUntil) {
    baseLoad = earlyLoad;
  } else if (completedImprovements < fullAt) {
    const progress =
      (completedImprovements - earlyUntil) / (fullAt - earlyUntil);
    const easedProgress = progress * progress * (3 - 2 * progress);
    baseLoad = earlyLoad + (completedImprovements - earlyLoad) * easedProgress;
  }

  return baseLoad * study.durationLoadMultiplierPerSetup ** setupOptimizations;
}

export function calculateProduction(state, config, developmentMode = false) {
  let production = big(config.energy.baseProductionPerSecond).mul(
    state.crcCount,
  );
  production = production.mul(calculateCrcExponentialMultiplier(state, config));
  production = production.mul(calculateCrcProcessorBonusMultiplier(state, config));
  production = production.mul(calculateScienceProductionMultiplier(state));
  production = production.mul(state.improvementMultiplier);
  production = production.mul(
    big(config.algorithmUpgrade.productionMultiplier).pow(state.upgrades),
  );

  if (developmentMode) {
    production = production.mul(
      getDevelopmentProductionMultiplier(state, config),
    );
  }

  return production.lt(0) || !production.isFinite() ? big(0) : production;
}

export function calculateProductionBreakdown(
  state,
  config,
  developmentMode = false,
) {
  const rows = [];
  const baseFromCrcs = big(config.energy.baseProductionPerSecond).mul(
    state.crcCount,
  );
  let running = baseFromCrcs;

  rows.push({
    id: "crc-base",
    label: "Total base from CRCs",
    detail: `${state.crcCount} active CRC${state.crcCount === 1 ? "" : "s"} at ${formatRate(config.energy.baseProductionPerSecond)} each`,
    multiplierLabel: `x${state.crcCount}`,
    value: baseFromCrcs,
    output: baseFromCrcs,
  });

  const crcExponentialMultiplier = calculateCrcExponentialMultiplier(
    state,
    config,
  );
  if (crcExponentialMultiplier.gt(1)) {
    const scaled = running.mul(crcExponentialMultiplier);
    rows.push({
      id: "crc-exponential-scaling",
      label: "From CRC exponential scaling",
      detail: "Permanent Science scaling applied per active CRC",
      multiplierLabel: `x${formatEngineering(crcExponentialMultiplier)}`,
      value: scaled.sub(running),
      output: scaled,
    });
    running = scaled;
  }

  const processorBonusMultiplier = calculateCrcProcessorBonusMultiplier(
    state,
    config,
  );
  if (processorBonusMultiplier.gt(1)) {
    const boosted = running.mul(processorBonusMultiplier);
    rows.push({
      id: "processor-crc-bonus",
      label: "From Processor bonus",
      detail: "Reduced Processor efficiency exponent applied to CRC output",
      multiplierLabel: `x${formatEngineering(processorBonusMultiplier)}`,
      value: boosted.sub(running),
      output: boosted,
    });
    running = boosted;
  }

  const scienceMultiplier = calculateScienceProductionMultiplier(state);
  if (scienceMultiplier.gt(1)) {
    const boosted = running.mul(scienceMultiplier);
    rows.push({
      id: "science-powered-production",
      label: "From Science Points",
      detail: "Total Science earned converted into an energy multiplier",
      multiplierLabel: `x${formatEngineering(scienceMultiplier)}`,
      value: boosted.sub(running),
      output: boosted,
    });
    running = boosted;
  }

  if (big(state.improvementMultiplier).gt(1)) {
    const improved = running.mul(state.improvementMultiplier);
    rows.push({
      id: "algorithm-improvements",
      label: "From Algorithm Improvements",
      detail: `${state.improvements} Improvements retained in the current cycle`,
      multiplierLabel: `x${formatEngineering(state.improvementMultiplier)}`,
      value: improved.sub(running),
      output: improved,
    });
    running = improved;
  }

  const upgradeMultiplier = big(
    config.algorithmUpgrade.productionMultiplier,
  ).pow(state.upgrades);
  if (upgradeMultiplier.gt(1)) {
    const upgraded = running.mul(upgradeMultiplier);
    rows.push({
      id: "algorithm-upgrades",
      label: "From Algorithm Upgrades",
      detail: `${state.upgrades} completed Upgrade${state.upgrades === 1 ? "" : "s"}`,
      multiplierLabel: `x${formatEngineering(upgradeMultiplier)}`,
      value: upgraded.sub(running),
      output: upgraded,
    });
    running = upgraded;
  }

  if (developmentMode) {
    const developmentMultiplier = getDevelopmentProductionMultiplier(
      state,
      config,
    );
    if (developmentMultiplier !== 1) {
      const developed = running.mul(developmentMultiplier);
      rows.push({
        id: "development-production",
        label: "From Development mode",
        detail: "Global development production override",
        multiplierLabel: `x${formatEngineering(developmentMultiplier)}`,
        value: developed.sub(running),
        output: developed,
      });
    }
  }

  return rows;
}

export function calculateEffectiveProduction(
  state,
  config,
  developmentMode = false,
) {
  return calculateProduction(state, config, developmentMode).sub(
    calculateEnergyOverflowDecay(state, config),
  );
}

export function calculateEffectiveEnergyGain(state, rawGain, config) {
  const gain = big(rawGain);
  if (gain.lte(0)) return big(0);
  return gain;
}

export function calculateDoorProgress(state, config) {
  return bigClamp(
    big(state.peakEnergy).div(config.particleLab.doorEnergyRequired),
    0,
    1,
  ).toNumber();
}

export function formatEnergy(value) {
  return formatEngineering(value, " J");
}

export function formatRate(value) {
  return `${formatEnergy(value).replace(" J", "")} J/s`;
}

export function formatPercent(value, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDuration(seconds) {
  seconds = toFiniteNumber(seconds, Number.MAX_VALUE);
  if (seconds === Number.MAX_VALUE) return "ETERNAL";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}
