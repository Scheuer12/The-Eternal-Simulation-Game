export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateImprovementBonus(completedImprovements, config) {
  const study = config.study;

  if (completedImprovements < study.onboardingImprovements) {
    const remaining =
      1 - completedImprovements / study.onboardingImprovements;

    return (
      study.baselineBonus +
      (study.onboardingInitialBonus - study.baselineBonus) *
        remaining ** study.onboardingDecayShape
    );
  }

  const lateImprovements =
    completedImprovements - study.onboardingImprovements;

  return (
    study.baselineBonus /
    (1 + lateImprovements / study.lateDecayScale) ** study.lateDecayPower
  );
}

export function calculateUpgradeChance(upgradeCount, config) {
  const upgrade = config.upgrade;
  let chance =
    upgrade.initialChance /
    (1 + upgrade.decayCoefficient * upgradeCount) ** upgrade.decayPower;

  if (chance < upgrade.softcap) {
    chance =
      upgrade.softcap *
      (chance / upgrade.softcap) ** upgrade.softcapPower;
  }

  if (chance < upgrade.hardcap) {
    chance =
      upgrade.hardcap *
      (chance / upgrade.hardcap) ** upgrade.hardcapPower;
  }

  return Math.max(upgrade.minimumChance, chance);
}

export function calculateStudyDuration(state, config, developmentMode = false) {
  const study = config.study;
  let duration =
    study.baseDurationSeconds *
    (1 +
      study.durationGrowthCoefficient *
        state.improvements ** study.durationGrowthPower);

  if (state.devices.autoCalculator) {
    duration /= config.autoCalculator.speedMultiplier;
  }

  if (state.discoveries.crcBlueprint) {
    duration *= config.blueprint.studyDurationMultiplier;
  }

  if (state.devices.processor) {
    duration *= config.processor.deviceDurationMultiplier;
  }

  if (developmentMode) {
    duration *= config.development.durationMultiplier;
  }

  return duration;
}

export function calculateProduction(state, config, developmentMode = false) {
  let production =
    config.energy.baseProductionPerSecond *
    state.crcCount *
    state.improvementMultiplier *
    config.upgrade.productionMultiplier ** state.upgrades;

  if (developmentMode) {
    production *= config.development.productionMultiplier;
  }

  return production;
}

export function calculateDoorProgress(state, config) {
  const production = calculateProduction(state, config, false);
  const start = Math.log10(config.energy.baseProductionPerSecond);
  const target = Math.log10(config.processor.cost);
  const current = Math.log10(Math.max(production, config.energy.baseProductionPerSecond));

  return clamp((current - start) / (target - start), 0, 1);
}

export function formatEnergy(value) {
  if (!Number.isFinite(value)) return "SIGNAL ERROR";
  if (value === 0) return "0 J";

  return `${value.toExponential(3).replace("e+", "e")} J`;
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

