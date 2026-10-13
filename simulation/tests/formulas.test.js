import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateAlgorithmUpgradeDuration,
  calculateAlgorithmUpgradeRequirement,
  calculateAutoCalculatorCost,
  calculateAutoCalculatorSpeedMultiplier,
  calculateBlueprintResearchDuration,
  calculateCalculationMethodRequirement,
  calculateDeviceDurationMultiplier,
  calculateDeviceEfficiencyMultiplier,
  calculateEffectiveEnergyGain,
  calculateEffectiveProduction,
  calculateEnergyOverflowDecay,
  calculateEnergyRetention,
  calculateImprovementBonus,
  calculateRedundancyEliminationSpeedMultiplier,
  calculateProcessorImprovementSpeedMultiplier,
  calculateCrcExponentialMultiplier,
  calculateCrcProcessorBonusMultiplier,
  calculateScienceProductionMultiplier,
  calculateQuantumCalculationBonus,
  calculateQuantumSuperpositionRetention,
  calculateOverclockerCost,
  calculateOverclockerDrainPerSecond,
  calculateOverclockerSpeedMultiplier,
  calculateParticleSynthesizerCost,
  calculateSciencePointCost,
  calculateParticleSynthesizerProgress,
  calculateSciencePointReward,
  calculateQuarksGenerated,
  calculateQuarkCapacity,
  calculateQuarkCageCost,
  calculateQuarkDecay,
  calculatePowerCellCost,
  calculatePowerModuleCapacityMultiplier,
  calculatePowerModuleCost,
  calculatePowerModuleRequirement,
  calculateProductionBreakdown,
  calculateProcessorCost,
  calculateProduction,
  calculateSetupOptimizationRequirement,
  calculateStableEnergyCapacity,
  calculateStudyDuration,
  canAccessParticleLab,
  formatEnergy,
} from "../../js/formulas.js";
import { createInitialState } from "../../js/state.js";
import { big } from "../../js/numeric.js";
import { assertBigClose, assertBigEqual } from "./assertions.js";

const config = JSON.parse(
  await readFile(
    new URL("../../config/game-config.json", import.meta.url),
    "utf8",
  ),
);

test("the onboarding curve reaches the 5% baseline at Improvement 16", () => {
  assert.equal(calculateImprovementBonus(15, config), 0.05);
  assert.ok(calculateImprovementBonus(14, config) > 0.05);
  assert.ok(calculateImprovementBonus(16, config) < 0.05);
});

test("Algorithm Improvement bonus never drops below its configured floor", () => {
  assert.equal(
    calculateImprovementBonus(10_000, config),
    config.study.minimumBonus,
  );
});

test("the onboarding crosses approximately nine orders of magnitude", () => {
  const state = createInitialState(config);

  for (let completed = 0; completed < 15; completed += 1) {
    state.improvementMultiplier = state.improvementMultiplier.mul(
      1 + calculateImprovementBonus(completed, config),
    );
    state.improvements += 1;
  }

  const production = calculateProduction(state, config);
  assert.ok(production >= 1e-3);
  assert.ok(production < 2e-3);
});

test("Algorithm Upgrade requirement starts at 10 and rises by 5", () => {
  const state = createInitialState(config);
  assert.equal(calculateAlgorithmUpgradeRequirement(state, config), 10);
  state.upgrades = 3;
  assert.equal(calculateAlgorithmUpgradeRequirement(state, config), 25);
});

test("first Algorithm Upgrade duration is the configured base duration", () => {
  const state = createInitialState(config);
  assert.equal(calculateAlgorithmUpgradeDuration(state, config), 10);
});

test("reset layer requirements rise linearly by their configured increments", () => {
  const state = createInitialState(config);

  assert.deepEqual(
    [0, 1, 2, 3].map((upgrades) =>
      calculateAlgorithmUpgradeRequirement({ ...state, upgrades }, config),
    ),
    [10, 15, 20, 25],
  );

  assert.deepEqual(
    [0, 1, 2, 3].map((calculationMethods) =>
      calculateCalculationMethodRequirement(
        { ...state, calculationMethods },
        config,
      ),
    ),
    [5, 10, 15, 20],
  );

  assert.deepEqual(
    [0, 1, 2, 3].map((setupOptimizations) =>
      calculateSetupOptimizationRequirement(
        { ...state, setupOptimizations },
        config,
      ),
    ),
    [2, 4, 6, 8],
  );
});

test("each Algorithm Upgrade doubles production", () => {
  const state = createInitialState(config);
  const base = calculateProduction(state, config);
  state.upgrades = 4;
  assertBigEqual(calculateProduction(state, config), base.mul(16));
});

test("production supports very large finite values without an arbitrary cap", () => {
  const state = createInitialState(config);
  state.crcCount = 10;
  state.upgrades = 330;
  state.improvementMultiplier = 1e12;

  const production = calculateProduction(state, config);

  assert.ok(production.isFinite());
  assert.ok(production.gt(1e99));
});

test("production breakdown shows only active production contributors", () => {
  const state = createInitialState(config);
  assert.deepEqual(
    calculateProductionBreakdown(state, config).map((row) => row.id),
    ["crc-base"],
  );

  state.improvementMultiplier = 10;
  state.upgrades = 2;
  assert.deepEqual(
    calculateProductionBreakdown(state, config).map((row) => row.id),
    ["crc-base", "algorithm-improvements", "algorithm-upgrades"],
  );

  const total = calculateProductionBreakdown(state, config).reduce(
    (sum, row) => sum.add(row.value),
    big(0),
  );
  assertBigEqual(total, calculateProduction(state, config));
});

test("Calculation Method Upgrades reduce future Improvement penalty", () => {
  const base = calculateImprovementBonus(20, config, 0);
  const boosted = calculateImprovementBonus(20, config, 2);
  assert.ok(boosted > base);
});

test("Auto Calculators and Processors scale from owned counts", () => {
  const state = createInitialState(config);
  state.devices.autoCalculators = 2;
  state.devices.processors = 2;

  assert.ok(
    calculateAutoCalculatorCost(2, config).gt(
      calculateAutoCalculatorCost(1, config),
    ),
  );
  assert.ok(
    calculateProcessorCost(2, config).gt(calculateProcessorCost(1, config)),
  );
  assert.equal(
    calculateAutoCalculatorSpeedMultiplier(state, config),
    config.autoCalculator.firstSpeedMultiplier *
      config.autoCalculator.additionalSpeedMultiplier *
      config.processor.deviceEfficiencyMultiplier ** 2,
  );
  assert.equal(
    calculateDeviceDurationMultiplier(state, config),
    1 / config.processor.deviceEfficiencyMultiplier ** 2,
  );
});

test("Overclocker only accelerates Auto Calculators while active", () => {
  const state = createInitialState(config);
  state.devices.autoCalculators = 1;
  state.devices.overclockers = 1;

  assert.equal(calculateOverclockerSpeedMultiplier(state, config), 1);
  assertBigEqual(calculateOverclockerDrainPerSecond(state, config), 0);

  state.overclocker.active = true;
  assert.equal(
    calculateOverclockerSpeedMultiplier(state, config),
    config.overclocker.baseCalculatorSpeedMultiplier,
  );
  assertBigEqual(
    calculateOverclockerDrainPerSecond(state, config),
    config.overclocker.baseEnergyDrainPerSecond,
  );
  assert.equal(
    calculateAutoCalculatorSpeedMultiplier(state, config),
    config.autoCalculator.firstSpeedMultiplier *
      config.overclocker.baseCalculatorSpeedMultiplier,
  );

  state.devices.overclockers = 2;
  assert.equal(
    calculateOverclockerSpeedMultiplier(state, config),
    config.overclocker.baseCalculatorSpeedMultiplier *
      config.overclocker.additionalCalculatorSpeedMultiplier,
  );
  assertBigEqual(
    calculateOverclockerDrainPerSecond(state, config),
    config.overclocker.baseEnergyDrainPerSecond *
      config.overclocker.energyDrainGrowth,
  );

  state.devices.overclockers = 3;
  assertBigEqual(
    calculateOverclockerDrainPerSecond(state, config),
    config.overclocker.baseEnergyDrainPerSecond *
      config.overclocker.energyDrainGrowth ** 2,
  );

  state.devices.overclockers = 1;
  state.overclocker.activeSeconds = 10;
  assertBigEqual(
    calculateOverclockerDrainPerSecond(state, config),
    config.overclocker.baseEnergyDrainPerSecond *
      config.overclocker.runtimeDrainGrowthBase ** 10,
  );
});

test("Overclocker cost scales by owned routes", () => {
  assertBigEqual(
    calculateOverclockerCost(0, config),
    config.overclocker.baseCost,
  );
  assert.ok(
    calculateOverclockerCost(1, config).gt(calculateOverclockerCost(0, config)),
  );
  assert.ok(
    calculateOverclockerCost(2, config).gt(calculateOverclockerCost(1, config)),
  );
});

test("Power Cell capacity and cost scale from owned cells", () => {
  const state = createInitialState(config);
  state.powerCells = 3;

  assertBigEqual(
    calculateStableEnergyCapacity(state, config),
    config.energy.powerCellCapacity * 3,
  );
  assert.ok(
    calculatePowerCellCost(3, config).gt(calculatePowerCellCost(2, config)),
  );
});

test("Power Modules multiply effective Power Cell capacity without consuming cells", () => {
  const state = createInitialState(config);
  state.powerCells = config.powerModule.cellsPerModule;

  assert.equal(
    calculatePowerModuleRequirement(0, config),
    config.powerModule.cellsPerModule,
  );
  assertBigEqual(
    calculatePowerModuleCost(0, config),
    config.powerModule.baseCost,
  );

  state.powerModules = 1;
  assertBigEqual(
    calculatePowerModuleCapacityMultiplier(state, config),
    config.powerModule.capacityMultiplier,
  );
  assertBigEqual(
    calculateStableEnergyCapacity(state, config),
    state.powerCells *
      config.energy.powerCellCapacity *
      config.powerModule.capacityMultiplier,
  );
});

test("Particle Laboratory opens at 100 J peak and Synthesizer targets the next Science Point cost", () => {
  const state = createInitialState(config);
  state.peakEnergy = config.particleLab.doorEnergyRequired - 1;
  assert.equal(canAccessParticleLab(state, config), false);

  state.peakEnergy = config.particleLab.doorEnergyRequired;
  assert.equal(canAccessParticleLab(state, config), true);

  state.peakEnergy = 0;
  state.science.syntheses = 1;
  assert.equal(canAccessParticleLab(state, config), true);
  state.science.syntheses = 0;
  state.peakEnergy = config.particleLab.doorEnergyRequired;

  assertBigEqual(
    calculateParticleSynthesizerCost(state, config),
    config.particleLab.synthesizerEnergyRequired,
  );
  state.energy = calculateParticleSynthesizerCost(state, config).div(4);
  assert.equal(calculateParticleSynthesizerProgress(state, config), 0.25);

  state.science.totalScienceEarned = 1;
  assertBigEqual(
    calculateParticleSynthesizerCost(state, config),
    config.particleLab.synthesizerEnergyRequired,
  );
  assert.ok(
    calculateSciencePointCost(1, config).gt(calculateSciencePointCost(0, config)),
  );
  assert.equal(calculateSciencePointReward(1e11, 1, config), 0);
  assert.equal(
    calculateSciencePointReward(
      calculateSciencePointCost(1, config),
      1,
      config,
    ),
    1,
  );
});

test("Science Era quark formulas use synthesis energy, safe capacity, and overflow decay", () => {
  const state = createInitialState(config);

  assertBigEqual(calculateQuarksGenerated(100e9, config), 1);
  assertBigEqual(calculateQuarksGenerated(250e9, config), 2);
  assertBigEqual(calculateQuarkCapacity(state, config), 1);
  assertBigEqual(calculateQuarkCageCost(0, config), 100e9);

  state.quarks.available = 2;
  assert.ok(calculateQuarkDecay(state, config).gt(0));

  state.scienceDevices.quarkCages = 1;
  assertBigEqual(calculateQuarkCapacity(state, config), 10);
  assertBigEqual(calculateQuarkDecay(state, config), 0);

  state.scienceDevices.quarkCages = 2;
  assertBigEqual(calculateQuarkCapacity(state, config), 20);
  assertBigEqual(calculateQuarkDecay(state, config), 0);
});

test("CRC Blueprint research is a short reconstruction pass", () => {
  const state = createInitialState(config);

  assert.equal(calculateBlueprintResearchDuration(state, config), 60);
});

test("Power Cell cost scaling stays finite, monotonic, and uncapped", () => {
  const firstCost = calculatePowerCellCost(0, config);
  assertBigEqual(
    firstCost,
    config.energy.powerCellCapacity *
      config.powerCell.baseCapacityCostMultiplier,
  );

  let previousCost = firstCost;
  let previousMultiplier = config.powerCell.baseCapacityCostMultiplier;
  for (let owned = 1; owned <= 12; owned += 1) {
    const cost = calculatePowerCellCost(owned, config);
    const impliedMultiplier = cost.div(
      config.energy.powerCellCapacity * Math.max(1, owned),
    );

    assert.ok(cost.isFinite());
    assert.ok(cost.gte(previousCost));
    assert.ok(impliedMultiplier.gte(config.powerCell.baseCapacityCostMultiplier));
    assert.ok(impliedMultiplier.gte(previousMultiplier));

    previousCost = cost;
    previousMultiplier = impliedMultiplier;
  }

  const lateMultiplier = calculatePowerCellCost(100, config).div(
    config.energy.powerCellCapacity * 100,
  );
  assert.ok(lateMultiplier.gt(previousMultiplier));
});

test("Power Cell cost becomes slightly more aggressive after each full cell array", () => {
  const preArrayCost = calculatePowerCellCost(
    config.powerModule.cellsPerModule - 1,
    config,
  );
  const firstArrayCost = calculatePowerCellCost(
    config.powerModule.cellsPerModule,
    config,
  );
  const secondArrayCost = calculatePowerCellCost(
    config.powerModule.cellsPerModule * 2,
    config,
  );

  const preArrayMultiplier = preArrayCost.div(
    config.energy.powerCellCapacity * (config.powerModule.cellsPerModule - 1),
  );
  const firstArrayMultiplier = firstArrayCost.div(
    config.energy.powerCellCapacity * config.powerModule.cellsPerModule,
  );
  const secondArrayMultiplier = secondArrayCost.div(
    config.energy.powerCellCapacity * config.powerModule.cellsPerModule * 2,
  );

  assert.ok(firstArrayMultiplier.gt(preArrayMultiplier));
  assert.ok(secondArrayMultiplier.gt(firstArrayMultiplier));
});

test("energy overflow uses progressive retention instead of a hard cap", () => {
  const state = createInitialState(config);
  const capacity = calculateStableEnergyCapacity(state, config);

  state.energy = capacity.mul(2);
  assert.ok(calculateEnergyOverflowDecay(state, config).gt(0));
  assert.ok(calculateEnergyRetention(state, config) < 1);
  assert.ok(
    calculateEffectiveProduction(state, config).lt(
      calculateProduction(state, config),
    ),
  );

  state.energy = 0;
  const collected = calculateEffectiveEnergyGain(state, capacity.mul(2), config);
  assertBigEqual(collected, capacity.mul(2));
});

test("early Study duration scaling is lighter before returning to the base curve", () => {
  const state = createInitialState(config);
  state.improvements = 10;
  const earlyDuration = calculateStudyDuration(state, config);
  const oldCurveAtTen =
    config.study.baseDurationSeconds *
    (1 +
      config.study.durationGrowthCoefficient *
        10 ** config.study.durationGrowthPower);

  state.improvements = 15;
  const transitionDuration = calculateStudyDuration(state, config);
  const oldCurveAtFifteen =
    config.study.baseDurationSeconds *
    (1 +
      config.study.durationGrowthCoefficient *
        15 ** config.study.durationGrowthPower);

  assert.ok(earlyDuration < oldCurveAtTen);
  assert.equal(transitionDuration, oldCurveAtFifteen);
});

test("Setup Optimizations reduce effective Study load more at high cycles", () => {
  const state = createInitialState(config);
  state.improvements = 10;
  const lowBase = calculateStudyDuration(state, config);
  state.setupOptimizations = 1;
  const lowOptimized = calculateStudyDuration(state, config);

  state.improvements = 50;
  state.setupOptimizations = 0;
  const highBase = calculateStudyDuration(state, config);
  state.setupOptimizations = 2;
  const highOptimized = calculateStudyDuration(state, config);

  assert.ok(lowOptimized < lowBase);
  assert.ok(highOptimized < highBase);
  assert.ok(highOptimized / highBase < lowOptimized / lowBase);
});

test("Redundancy Elimination compounds Improvement research speed by upgrades and cycles", () => {
  const state = createInitialState(config);
  state.upgrades = 5;
  state.improvements = 25;
  const baseDuration = calculateStudyDuration(state, config);

  state.science.perks.redundancyElimination = true;
  const speed = calculateRedundancyEliminationSpeedMultiplier(state, config);
  const boostedDuration = calculateStudyDuration(state, config);

  assertBigClose(
    speed,
    (1 +
      config.science.redundancyElimination
        .researchSpeedBonusPerUpgradePerCycle) **
      (state.upgrades * state.improvements),
  );
  assert.ok(speed > 1);
  assert.ok(boostedDuration < baseDuration);
});

test("Processor study-speed perk applies the configured 1.07 exponent", () => {
  const state = createInitialState(config);
  state.devices.processors = 2;
  const baseDuration = calculateStudyDuration(state, config);
  state.science.perks.processorBonusAppliesAImprovementSpeed = true;
  const boostedDuration = calculateStudyDuration(state, config);

  assert.equal(
    calculateProcessorImprovementSpeedMultiplier(state, config),
    calculateDeviceEfficiencyMultiplier(state, config)
      .pow(config.science.studyPerks.processorBonusImprovementSpeedExponent)
      .toNumber(),
  );
  assert.ok(boostedDuration < baseDuration);
});

test("Energy perks apply their production multipliers and stack with existing CRC production", () => {
  const state = createInitialState(config);
  state.crcCount = 3;
  state.devices.processors = 2;
  state.science.totalScienceEarned = 4;
  state.science.perks.processorBonusAppliesCRC = true;
  state.science.perks.sciencePoweredEnergyProduction = true;
  state.science.perks.crcExponentialScaling = true;
  const processorBonus =
    config.processor.deviceEfficiencyMultiplier ** state.devices.processors;
  const expected =
    config.energy.baseProductionPerSecond *
    state.crcCount *
    processorBonus ** config.science.energyPerks.processorBonusExponentForCrc *
    state.science.totalScienceEarned *
    config.science.energyPerks.crcExponentialProductionPerCrc ** state.crcCount;

  assertBigEqual(
    calculateCrcProcessorBonusMultiplier(state, config),
    processorBonus ** config.science.energyPerks.processorBonusExponentForCrc,
  );
  assertBigEqual(calculateScienceProductionMultiplier(state), 4);
  assertBigEqual(
    calculateCrcExponentialMultiplier(state, config),
    config.science.energyPerks.crcExponentialProductionPerCrc ** 3,
  );
  const production = calculateProduction(state, config);
  const breakdownTotal = calculateProductionBreakdown(state, config).reduce(
    (sum, row) => sum.add(row.value),
    big(0),
  );
  assertBigClose(production, expected, 1e-14);
  assertBigClose(breakdownTotal, expected, 1e-14);
});

test("Power Modules scaling perk strengthens stable capacity only after ownership", () => {
  const state = createInitialState(config);
  state.powerModules = 3;
  const standard = calculatePowerModuleCapacityMultiplier(state, config);

  state.science.perks.powerModulesScaling = true;
  const scaled = calculatePowerModuleCapacityMultiplier(state, config);

  assertBigEqual(standard, config.powerModule.capacityMultiplier ** 3);
  assert.ok(scaled.gt(standard));
});

test("Quantum bonuses use Total Quarks with the specified softcap and hardcaps", () => {
  assert.equal(calculateQuantumCalculationBonus(0, config), 1);
  assert.ok(calculateQuantumCalculationBonus(100, config) > 1);
  assert.ok(
    Math.abs(calculateQuantumCalculationBonus(1e10 - 1, config) - 1.15) <
      1e-12,
  );
  assert.ok(
    Math.abs(calculateQuantumCalculationBonus(1e11 - 1, config) - 1.15375) <
      1e-12,
  );
  assert.ok(calculateQuantumCalculationBonus(1e30, config) <= 1.3);
  assert.equal(calculateQuantumCalculationBonus(1e100, config), 1.3);
  assert.ok(calculateQuantumSuperpositionRetention(1e100, config) <= 0.1);
  assert.equal(calculateQuantumSuperpositionRetention(0, config), 0);

  const state = createInitialState(config);
  state.quarks.totalEarned = big(1e30);
  state.quarks.available = big(0);
  state.science.perks.quantumCalculationPrinciples = true;
  state.science.perks.quantumSuperposition = true;
  const baseUpgradeDuration = calculateAlgorithmUpgradeDuration(state, config);
  state.science.perks.quantumCalculationPrinciples = false;
  const unboostedDuration = calculateAlgorithmUpgradeDuration(state, config);
  assert.ok(baseUpgradeDuration < unboostedDuration);
});

test("energy formatting uses engineering notation below 1 and above 999", () => {
  assert.equal(formatEnergy(1e-12), "1e-12 J");
  assert.equal(formatEnergy(0.0012), "1.2e-3 J");
  assert.equal(formatEnergy(999), "999 J");
  assert.equal(formatEnergy(1234.56), "1.235e3 J");
  assert.equal(formatEnergy(100e9), "100e9 J");
  assert.equal(formatEnergy("1e384051168456"), "e384.051e9 J");
});

test("Redundancy Elimination softcaps after 50 Improvements and hardcaps at 100", () => {
  const state = createInitialState(config);
  state.upgrades = 8;
  state.science.perks.redundancyElimination = true;

  state.improvements = 50;
  const atSoftcap = calculateRedundancyEliminationSpeedMultiplier(state, config);
  state.improvements = 75;
  const insideSoftcap = calculateRedundancyEliminationSpeedMultiplier(state, config);
  state.improvements = 100;
  const atHardcap = calculateRedundancyEliminationSpeedMultiplier(state, config);
  state.improvements = 500;
  const afterHardcap = calculateRedundancyEliminationSpeedMultiplier(state, config);

  assert.ok(insideSoftcap > atSoftcap);
  assert.ok(atHardcap > insideSoftcap);
  assert.equal(afterHardcap, atHardcap);
});
