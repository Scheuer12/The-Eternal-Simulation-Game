import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateAlgorithmUpgradeRequirement,
  calculateAutoCalculatorCost,
  calculateAutoCalculatorSpeedMultiplier,
  calculateBlueprintResearchDuration,
  calculateCalculationMethodRequirement,
  calculateDeviceDurationMultiplier,
  calculateEffectiveEnergyGain,
  calculateEffectiveProduction,
  calculateEnergyOverflowDecay,
  calculateEnergyRetention,
  calculateImprovementBonus,
  calculateMatrixMechanicsSpeedMultiplier,
  calculateOverclockerCost,
  calculateOverclockerDrainPerSecond,
  calculateOverclockerSpeedMultiplier,
  calculateParticleSynthesizerProgress,
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
  formatEnergy
} from "../js/formulas.js";
import { createInitialState } from "../js/state.js";

const config = JSON.parse(
  await readFile(new URL("../config/game-config.json", import.meta.url), "utf8")
);

test("the onboarding curve reaches the 5% baseline at Improvement 16", () => {
  assert.equal(calculateImprovementBonus(15, config), 0.05);
  assert.ok(calculateImprovementBonus(14, config) > 0.05);
  assert.ok(calculateImprovementBonus(16, config) < 0.05);
});

test("Algorithm Improvement bonus never drops below its configured floor", () => {
  assert.equal(calculateImprovementBonus(10_000, config), config.study.minimumBonus);
});

test("the onboarding crosses approximately nine orders of magnitude", () => {
  const state = createInitialState(config);

  for (let completed = 0; completed < 15; completed += 1) {
    state.improvementMultiplier *=
      1 + calculateImprovementBonus(completed, config);
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

test("reset layer requirements rise linearly by their configured increments", () => {
  const state = createInitialState(config);

  assert.deepEqual(
    [0, 1, 2, 3].map((upgrades) =>
      calculateAlgorithmUpgradeRequirement({ ...state, upgrades }, config)
    ),
    [10, 15, 20, 25]
  );

  assert.deepEqual(
    [0, 1, 2, 3].map((calculationMethods) =>
      calculateCalculationMethodRequirement(
        { ...state, calculationMethods },
        config
      )
    ),
    [5, 10, 15, 20]
  );

  assert.deepEqual(
    [0, 1, 2, 3].map((setupOptimizations) =>
      calculateSetupOptimizationRequirement(
        { ...state, setupOptimizations },
        config
      )
    ),
    [2, 4, 6, 8]
  );
});

test("each Algorithm Upgrade doubles production", () => {
  const state = createInitialState(config);
  const base = calculateProduction(state, config);
  state.upgrades = 4;
  assert.equal(calculateProduction(state, config), base * 16);
});

test("production breakdown shows only active production contributors", () => {
  const state = createInitialState(config);
  assert.deepEqual(
    calculateProductionBreakdown(state, config).map((row) => row.id),
    ["crc-base"]
  );

  state.improvementMultiplier = 10;
  state.upgrades = 2;
  assert.deepEqual(
    calculateProductionBreakdown(state, config).map((row) => row.id),
    ["crc-base", "algorithm-improvements", "algorithm-upgrades"]
  );

  const total = calculateProductionBreakdown(state, config)
    .reduce((sum, row) => sum + row.value, 0);
  assert.equal(total, calculateProduction(state, config));
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

  assert.ok(calculateAutoCalculatorCost(2, config) > calculateAutoCalculatorCost(1, config));
  assert.ok(calculateProcessorCost(2, config) > calculateProcessorCost(1, config));
  assert.equal(
    calculateAutoCalculatorSpeedMultiplier(state, config),
    config.autoCalculator.firstSpeedMultiplier *
      config.autoCalculator.additionalSpeedMultiplier *
      config.processor.deviceEfficiencyMultiplier ** 2
  );
  assert.equal(
    calculateDeviceDurationMultiplier(state, config),
    1 / config.processor.deviceEfficiencyMultiplier ** 2
  );
});

test("Overclocker only accelerates Auto Calculators while active", () => {
  const state = createInitialState(config);
  state.devices.autoCalculators = 1;
  state.devices.overclockers = 1;

  assert.equal(calculateOverclockerSpeedMultiplier(state, config), 1);
  assert.equal(calculateOverclockerDrainPerSecond(state, config), 0);

  state.overclocker.active = true;
  assert.equal(
    calculateOverclockerSpeedMultiplier(state, config),
    config.overclocker.baseCalculatorSpeedMultiplier
  );
  assert.equal(
    calculateOverclockerDrainPerSecond(state, config),
    config.overclocker.baseEnergyDrainPerSecond
  );
  assert.equal(
    calculateAutoCalculatorSpeedMultiplier(state, config),
    config.autoCalculator.firstSpeedMultiplier *
      config.overclocker.baseCalculatorSpeedMultiplier
  );

  state.devices.overclockers = 2;
  assert.equal(
    calculateOverclockerSpeedMultiplier(state, config),
    config.overclocker.baseCalculatorSpeedMultiplier *
      config.overclocker.additionalCalculatorSpeedMultiplier
  );
  assert.equal(
    calculateOverclockerDrainPerSecond(state, config),
    config.overclocker.baseEnergyDrainPerSecond *
      config.overclocker.energyDrainGrowth
  );

  state.devices.overclockers = 3;
  assert.equal(
    calculateOverclockerDrainPerSecond(state, config),
    config.overclocker.baseEnergyDrainPerSecond *
      config.overclocker.energyDrainGrowth ** 2
  );

  state.devices.overclockers = 1;
  state.overclocker.activeSeconds = 10;
  assert.equal(
    calculateOverclockerDrainPerSecond(state, config),
    config.overclocker.baseEnergyDrainPerSecond *
      config.overclocker.runtimeDrainGrowthBase ** 10
  );
});

test("Overclocker cost scales by owned routes", () => {
  assert.equal(calculateOverclockerCost(0, config), config.overclocker.baseCost);
  assert.ok(calculateOverclockerCost(1, config) > calculateOverclockerCost(0, config));
  assert.ok(calculateOverclockerCost(2, config) > calculateOverclockerCost(1, config));
});

test("Power Cell capacity and cost scale from owned cells", () => {
  const state = createInitialState(config);
  state.powerCells = 3;

  assert.equal(
    calculateStableEnergyCapacity(state, config),
    config.energy.powerCellCapacity * 3
  );
  assert.ok(calculatePowerCellCost(3, config) > calculatePowerCellCost(2, config));
});

test("Power Modules multiply effective Power Cell capacity without consuming cells", () => {
  const state = createInitialState(config);
  state.powerCells = config.powerModule.cellsPerModule;

  assert.equal(calculatePowerModuleRequirement(0, config), config.powerModule.cellsPerModule);
  assert.equal(calculatePowerModuleCost(0, config), config.powerModule.baseCost);

  state.powerModules = 1;
  assert.equal(
    calculatePowerModuleCapacityMultiplier(state, config),
    config.powerModule.capacityMultiplier
  );
  assert.equal(
    calculateStableEnergyCapacity(state, config),
    state.powerCells *
      config.energy.powerCellCapacity *
      config.powerModule.capacityMultiplier
  );
});

test("Particle Laboratory opens at 100 J peak and Synthesizer targets 100 GJ", () => {
  const state = createInitialState(config);
  state.peakEnergy = config.particleLab.doorEnergyRequired - 1;
  assert.equal(canAccessParticleLab(state, config), false);

  state.peakEnergy = config.particleLab.doorEnergyRequired;
  assert.equal(canAccessParticleLab(state, config), true);

  state.energy = config.particleLab.synthesizerEnergyRequired / 4;
  assert.equal(calculateParticleSynthesizerProgress(state, config), 0.25);
});

test("CRC Blueprint research is a short reconstruction pass", () => {
  const state = createInitialState(config);

  assert.equal(calculateBlueprintResearchDuration(state, config), 60);
});

test("Power Cell cost scaling stays finite, monotonic, and uncapped", () => {
  const firstCost = calculatePowerCellCost(0, config);
  assert.equal(
    firstCost,
    config.energy.powerCellCapacity *
      config.powerCell.baseCapacityCostMultiplier
  );

  let previousCost = firstCost;
  let previousMultiplier = config.powerCell.baseCapacityCostMultiplier;
  for (let owned = 1; owned <= 12; owned += 1) {
    const cost = calculatePowerCellCost(owned, config);
    const impliedMultiplier =
      cost / (config.energy.powerCellCapacity * Math.max(1, owned));

    assert.ok(Number.isFinite(cost));
    assert.ok(cost >= previousCost);
    assert.ok(impliedMultiplier >= config.powerCell.baseCapacityCostMultiplier);
    assert.ok(impliedMultiplier >= previousMultiplier);

    previousCost = cost;
    previousMultiplier = impliedMultiplier;
  }

  const lateMultiplier =
    calculatePowerCellCost(100, config) /
    (config.energy.powerCellCapacity * 100);
  assert.ok(lateMultiplier > previousMultiplier);
});

test("energy overflow uses progressive retention instead of a hard cap", () => {
  const state = createInitialState(config);
  const capacity = calculateStableEnergyCapacity(state, config);

  state.energy = capacity * 2;
  assert.ok(calculateEnergyOverflowDecay(state, config) > 0);
  assert.ok(calculateEnergyRetention(state, config) < 1);
  assert.ok(calculateEffectiveProduction(state, config) < calculateProduction(state, config));

  state.energy = 0;
  const collected = calculateEffectiveEnergyGain(state, capacity * 2, config);
  assert.equal(collected, capacity * 2);
});

test("early Study duration scaling is lighter before returning to the base curve", () => {
  const state = createInitialState(config);
  state.improvements = 10;
  const earlyDuration = calculateStudyDuration(state, config);
  const oldCurveAtTen =
    config.study.baseDurationSeconds *
    (1 + config.study.durationGrowthCoefficient * 10 ** config.study.durationGrowthPower);

  state.improvements = 15;
  const transitionDuration = calculateStudyDuration(state, config);
  const oldCurveAtFifteen =
    config.study.baseDurationSeconds *
    (1 + config.study.durationGrowthCoefficient * 15 ** config.study.durationGrowthPower);

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

test("Matrix Mechanics compounds Improvement study speed by upgrades and current improvements", () => {
  const state = createInitialState(config);
  state.upgrades = 5;
  state.improvements = 25;
  const baseDuration = calculateStudyDuration(state, config);

  state.science.matrixMechanics = true;
  const speed = calculateMatrixMechanicsSpeedMultiplier(state, config);
  const boostedDuration = calculateStudyDuration(state, config);

  assert.equal(
    speed,
    (1 + config.science.matrixMechanics.improvementSpeedBonusPerUpgradePerImprovement) **
      (state.upgrades * state.improvements)
  );
  assert.ok(speed > 1);
  assert.ok(boostedDuration < baseDuration);
});

test("energy formatting uses engineering notation below 1 and above 999", () => {
  assert.equal(formatEnergy(1e-12), "1e-12 J");
  assert.equal(formatEnergy(0.0012), "1.2e-3 J");
  assert.equal(formatEnergy(999), "999 J");
  assert.equal(formatEnergy(1234.56), "1.235e3 J");
  assert.equal(formatEnergy(100e9), "100e9 J");
});
