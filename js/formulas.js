export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateImprovementBonus(
  completedImprovements,
  config,
  calculationMethodUpgrades = 0
) {
  const study = config.study;
  const effectiveImprovements =
    completedImprovements *
    study.effectPenaltyMultiplierPerMethod ** calculationMethodUpgrades;
  let bonus;

  if (effectiveImprovements < study.onboardingImprovements) {
    const remaining =
      1 - effectiveImprovements / study.onboardingImprovements;

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
  if (ownedCount <= 0) return baseCost;
  return baseCost * growth ** (ownedCount ** exponent);
}

export function calculateAutoCalculatorCost(ownedCalculators, config) {
  return calculateEscalatingCost(
    config.autoCalculator.baseCost,
    config.autoCalculator.costGrowth,
    config.autoCalculator.costGrowthExponent,
    ownedCalculators
  );
}

export function calculateProcessorCost(ownedProcessors, config) {
  return calculateEscalatingCost(
    config.processor.baseCost,
    config.processor.costGrowth,
    config.processor.costGrowthExponent,
    ownedProcessors
  );
}

export function calculateOverclockerCost(ownedOverclockers, config) {
  return calculateEscalatingCost(
    config.overclocker.baseCost,
    config.overclocker.costGrowth,
    config.overclocker.costGrowthExponent,
    ownedOverclockers
  );
}

export function calculateCrcCost(state, config) {
  const purchasedCrcs = Math.max(
    0,
    state.crcCount - config.energy.initialCrcCount
  );

  return calculateEscalatingCost(
    config.crcConstruction.baseCost,
    config.crcConstruction.costGrowth,
    config.crcConstruction.costGrowthExponent,
    purchasedCrcs
  );
}

export function calculatePowerCellCost(ownedPowerCells, config) {
  const owned = Math.max(1, ownedPowerCells);
  const currentCapacity = config.energy.powerCellCapacity * owned;
  const multiplier =
    config.powerCell.baseCapacityCostMultiplier *
    (1 + (owned - 1) / config.powerCell.costGrowthScale) **
      config.powerCell.costGrowthPower;

  return (
    currentCapacity *
    multiplier
  );
}

export function calculatePowerModuleRequirement(ownedPowerModules, config) {
  return (ownedPowerModules + 1) * config.powerModule.cellsPerModule;
}

export function calculatePowerModuleCost(ownedPowerModules, config) {
  return calculateEscalatingCost(
    config.powerModule.baseCost,
    config.powerModule.costGrowth,
    config.powerModule.costGrowthExponent,
    ownedPowerModules
  );
}

export function calculatePowerModuleCapacityMultiplier(state, config) {
  return config.powerModule.capacityMultiplier ** state.powerModules;
}

export function calculateStableEnergyCapacity(state, config) {
  return (
    config.energy.powerCellCapacity *
    Math.max(1, state.powerCells) *
    calculatePowerModuleCapacityMultiplier(state, config)
  );
}

export function calculateEnergyOverflowDecay(state, config) {
  const capacity = calculateStableEnergyCapacity(state, config);
  if (capacity <= 0 || state.energy <= capacity) return 0;

  const overflowRatio = (state.energy - capacity) / capacity;
  return (
    capacity *
    config.energy.overflowDecayRate *
    overflowRatio ** config.energy.overflowDecayPower
  );
}

export function calculateEnergyRetention(state, config, developmentMode = false) {
  const production = calculateProduction(state, config, developmentMode);
  if (production <= 0) return state.energy > calculateStableEnergyCapacity(state, config) ? 0 : 1;

  return clamp(
    (production - calculateEnergyOverflowDecay(state, config)) / production,
    0,
    1
  );
}

export function calculateAutoCalculatorSpeedMultiplier(state, config) {
  const calculators = state.devices.autoCalculators;
  if (calculators <= 0) return 1;

  const calculatorSpeed =
    config.autoCalculator.firstSpeedMultiplier *
    config.autoCalculator.additionalSpeedMultiplier ** (calculators - 1);

  return (
    calculatorSpeed *
    calculateDeviceEfficiencyMultiplier(state, config) *
    calculateOverclockerSpeedMultiplier(state, config)
  );
}

export function calculateMatrixMechanicsSpeedMultiplier(state, config) {
  if (!state.science?.matrixMechanics) return 1;

  const bonus =
    config.science?.matrixMechanics
      ?.improvementSpeedBonusPerUpgradePerImprovement ?? 0;

  return (1 + bonus) ** (state.upgrades * state.improvements);
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
  if (overclockers <= 0 || !state.overclocker.active) return 0;
  const activeSeconds = Math.max(0, state.overclocker.activeSeconds ?? 0);
  const runtimeMultiplier = config.overclocker.runtimeDrainGrowthBase
    ? config.overclocker.runtimeDrainGrowthBase ** activeSeconds
    : 1 +
      config.overclocker.runtimeDrainGrowthCoefficient *
        activeSeconds ** config.overclocker.runtimeDrainGrowthPower;

  return (
    config.overclocker.baseEnergyDrainPerSecond *
    config.overclocker.energyDrainGrowth ** (overclockers - 1) *
    runtimeMultiplier
  );
}

export function calculateDeviceEfficiencyMultiplier(state, config) {
  return config.processor.deviceEfficiencyMultiplier ** state.devices.processors;
}

export function calculateDeviceDurationMultiplier(state, config) {
  return 1 / calculateDeviceEfficiencyMultiplier(state, config);
}

export function calculateAlgorithmUpgradeRequirement(state, config) {
  return (
    config.algorithmUpgrade.initialImprovementsRequired +
    config.algorithmUpgrade.improvementsRequiredGrowth * state.upgrades
  );
}

export function calculateAlgorithmUpgradeDuration(state, config, developmentMode = false) {
  let duration =
    config.algorithmUpgrade.baseDurationSeconds *
    (1 +
      config.algorithmUpgrade.durationGrowthCoefficient *
        state.upgrades ** config.algorithmUpgrade.durationGrowthPower);

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

export function calculateBlueprintResearchDuration(state, config, developmentMode = false) {
  let duration = config.blueprint.researchDurationSeconds;
  if (developmentMode) {
    duration *= getDevelopmentDurationMultiplier(state, config);
  }

  return duration;
}

export function canResearchBlueprint(state, config) {
  return (
    !state.discoveries.crcBlueprint &&
    state.peakEnergy >= config.blueprint.revealAtPeakEnergy
  );
}

export function canPurchasePowerCell(state, config) {
  const requiredAlgorithmUpgrades = config?.powerCell?.algorithmUpgradesRequired ?? 3;
  return state.devices.softDataDisplay && state.upgrades >= requiredAlgorithmUpgrades;
}

export function canAccessParticleLab(state, config) {
  return state.peakEnergy >= config.particleLab.doorEnergyRequired;
}

export function calculateParticleSynthesizerProgress(state, config) {
  return state.energy / config.particleLab.synthesizerEnergyRequired;
}

export function getDevelopmentDurationMultiplier(state, config) {
  return state.devSettings?.durationMultiplier ?? config.development.durationMultiplier;
}

export function getDevelopmentProductionMultiplier(state, config) {
  return state.devSettings?.productionMultiplier ?? config.development.productionMultiplier;
}

export function calculateStudyDuration(state, config, developmentMode = false) {
  const study = config.study;
  const effectiveLoad =
    calculateStudyDurationLoad(state.improvements, state.setupOptimizations, config);
  let duration =
    study.baseDurationSeconds *
    (1 + study.durationGrowthCoefficient * effectiveLoad ** study.durationGrowthPower);

  duration /= calculateAutoCalculatorSpeedMultiplier(state, config);
  duration /= calculateMatrixMechanicsSpeedMultiplier(state, config);

  if (developmentMode) {
    duration *= getDevelopmentDurationMultiplier(state, config);
  }

  return duration;
}

export function calculateStudyDurationLoad(completedImprovements, setupOptimizations, config) {
  const study = config.study;
  const earlyUntil = study.durationEarlyLoadUntil;
  const fullAt = study.durationFullLoadAt;
  const earlyLoad = completedImprovements * study.durationEarlyLoadMultiplier;
  let baseLoad = completedImprovements;

  if (completedImprovements <= earlyUntil) {
    baseLoad = earlyLoad;
  } else if (completedImprovements < fullAt) {
    const progress = (completedImprovements - earlyUntil) / (fullAt - earlyUntil);
    const easedProgress = progress * progress * (3 - 2 * progress);
    baseLoad = earlyLoad + (completedImprovements - earlyLoad) * easedProgress;
  }

  return baseLoad * study.durationLoadMultiplierPerSetup ** setupOptimizations;
}

export function calculateProduction(state, config, developmentMode = false) {
  let production =
    config.energy.baseProductionPerSecond *
    state.crcCount *
    state.improvementMultiplier *
    config.algorithmUpgrade.productionMultiplier ** state.upgrades;

  if (developmentMode) {
    production *= getDevelopmentProductionMultiplier(state, config);
  }

  return production;
}

export function calculateProductionBreakdown(state, config, developmentMode = false) {
  const rows = [];
  const baseFromCrcs = config.energy.baseProductionPerSecond * state.crcCount;
  let running = baseFromCrcs;

  rows.push({
    id: "crc-base",
    label: "Total base from CRCs",
    value: baseFromCrcs
  });

  if (state.improvementMultiplier > 1) {
    const improved = running * state.improvementMultiplier;
    rows.push({
      id: "algorithm-improvements",
      label: "From Algorithm Improvements",
      value: improved - running
    });
    running = improved;
  }

  const upgradeMultiplier =
    config.algorithmUpgrade.productionMultiplier ** state.upgrades;
  if (upgradeMultiplier > 1) {
    const upgraded = running * upgradeMultiplier;
    rows.push({
      id: "algorithm-upgrades",
      label: "From Algorithm Upgrades",
      value: upgraded - running
    });
    running = upgraded;
  }

  if (developmentMode) {
    const developmentMultiplier = getDevelopmentProductionMultiplier(state, config);
    if (developmentMultiplier !== 1) {
      const developed = running * developmentMultiplier;
      rows.push({
        id: "development-production",
        label: "From Development mode",
        value: developed - running
      });
    }
  }

  return rows;
}

export function calculateEffectiveProduction(state, config, developmentMode = false) {
  return calculateProduction(state, config, developmentMode) -
    calculateEnergyOverflowDecay(state, config);
}

export function calculateEffectiveEnergyGain(state, rawGain, config) {
  if (rawGain <= 0) return 0;
  return rawGain;
}

export function calculateDoorProgress(state, config) {
  return clamp(state.peakEnergy / config.particleLab.doorEnergyRequired, 0, 1);
}

export function formatEnergy(value) {
  if (!Number.isFinite(value)) return "SIGNAL ERROR";
  if (value === 0) return "0 J";

  const absolute = Math.abs(value);
  if (absolute >= 1 && absolute <= 999) {
    const digits = absolute < 10 ? 3 : absolute < 100 ? 2 : 1;
    return `${Number(value.toFixed(digits)).toString()} J`;
  }

  const exponent = Math.floor(Math.log10(absolute) / 3) * 3;
  const mantissa = value / 10 ** exponent;
  const exponentLabel = exponent >= 0 ? `e${exponent}` : `e${exponent}`;
  const readableMantissa = Number(mantissa.toFixed(3)).toString();

  return `${readableMantissa}${exponentLabel} J`;
}

export function formatRate(value) {
  return `${formatEnergy(value).replace(" J", "")} J/s`;
}

export function formatPercent(value, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}
