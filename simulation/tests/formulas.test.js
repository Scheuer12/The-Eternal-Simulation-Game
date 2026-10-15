import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateAlgorithmUpgradeDuration,
  calculateAlgorithmUpgradeRequirement,
  calculateAutoCalculatorCost,
  calculateAutoCalculatorSpeedMultiplier,
  calculateBlueprintResearchDuration,
  calculateOverclockerBlueprintDuration,
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
  calculateQuantumSuperpositionSpeedMultiplier,
  calculatePowerCellResonanceMultiplier,
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
  calculateProcessorBonusUnit,
  calculateProcessorEfficiencyMultiplier,
  calculateProduction,
  calculateSetupOptimizationRequirement,
  calculateSetupDevicePerformance,
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

test("I=0, 1, 10, 100: CRC produces proportionally to 1+I without hidden compounding", () => {
  const state = createInitialState(config);
  state.crcCount = 1;
  state.upgrades = 0;
  state.setupOptimizations = 0;

  state.improvements = 0;
  assertBigClose(calculateProduction(state, config), 1e-12);

  state.improvements = 1;
  assertBigClose(calculateProduction(state, config), 2e-12);

  state.improvements = 10;
  assertBigClose(calculateProduction(state, config), 11e-12);

  state.improvements = 100;
  assertBigClose(calculateProduction(state, config), 101e-12);
});

test("Algorithm Upgrade requirement follows R(U) = ceil(10 + 5U + 0.125 U(U-1))", () => {
  const state = createInitialState(config);

  assert.equal(calculateAlgorithmUpgradeRequirement({ ...state, upgrades: 0 }, config), 10);
  assert.equal(calculateAlgorithmUpgradeRequirement({ ...state, upgrades: 1 }, config), 15);
  assert.equal(calculateAlgorithmUpgradeRequirement({ ...state, upgrades: 2 }, config), 21);
  assert.equal(calculateAlgorithmUpgradeRequirement({ ...state, upgrades: 3 }, config), 26);
  assert.equal(calculateAlgorithmUpgradeRequirement({ ...state, upgrades: 4 }, config), 32);
});

test("first Algorithm Upgrade duration is the configured base duration", () => {
  const state = createInitialState(config);
  assert.equal(calculateAlgorithmUpgradeDuration(state, config), 10);
});

test("reset layer requirements rise as configured", () => {
  const state = createInitialState(config);

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

test("each Algorithm Upgrade doubles production (2^U)", () => {
  const state = createInitialState(config);
  const base = calculateProduction(state, config);
  state.upgrades = 4;
  assertBigEqual(calculateProduction(state, config), base.mul(16));
});

test("production supports very large finite values without an arbitrary cap", () => {
  const state = createInitialState(config);
  state.crcCount = 10;
  state.upgrades = 360;
  state.improvements = 1000;

  const production = calculateProduction(state, config);
  assert.ok(production.isFinite());
  assert.ok(production.gt(1e99));
});

test("production breakdown shows active production contributors matching total", () => {
  const state = createInitialState(config);
  assert.deepEqual(
    calculateProductionBreakdown(state, config).map((row) => row.id),
    ["crc-base"],
  );

  state.improvements = 10;
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

test("Setup Optimization device performance D(S) = 1 + 2 ln(1+S)", () => {
  assert.equal(calculateSetupDevicePerformance(0, config), 1);
  assert.ok(Math.abs(calculateSetupDevicePerformance(1, config) - 2.38629) < 0.001);
  assert.ok(Math.abs(calculateSetupDevicePerformance(2, config) - 3.19722) < 0.001);
  assert.ok(Math.abs(calculateSetupDevicePerformance(5, config) - 4.58351) < 0.001);
  assert.ok(Math.abs(calculateSetupDevicePerformance(10, config) - 5.79579) < 0.001);

  // Setup performance increases CRC base production
  const state = createInitialState(config);
  state.setupOptimizations = 1;
  const d1 = calculateSetupDevicePerformance(1, config);
  assertBigEqual(calculateProduction(state, config), big(1e-12).mul(d1));
});

test("CMU exclusively scales Processor unit bonus by 1.2^M", () => {
  const state = createInitialState(config);
  state.devices.processors = 1;

  const unitBonus0 = calculateProcessorBonusUnit(state, config);
  assert.equal(unitBonus0, 0.15);

  state.calculationMethods = 1;
  const unitBonus1 = calculateProcessorBonusUnit(state, config);
  assertBigClose(unitBonus1, 0.15 * 1.2, 1e-12);

  state.calculationMethods = 2;
  const unitBonus2 = calculateProcessorBonusUnit(state, config);
  assertBigClose(unitBonus2, 0.15 * 1.44, 1e-12);

  // When P=0, CMU has zero effect on Auto Calculator speed
  state.devices.processors = 0;
  state.devices.autoCalculators = 1;
  assert.equal(calculateAutoCalculatorSpeedMultiplier(state, config), 1.5);
});

test("Processor aggregated effectiveness E_P = (1 + unitBonus)^P compounds into each Calculator", () => {
  const state = createInitialState(config);
  state.devices.processors = 2;
  state.devices.autoCalculators = 2;

  const unitBonus = 0.15;
  const ep = (1 + unitBonus) ** 2; // 1.15^2 = 1.3225
  assertBigClose(calculateProcessorEfficiencyMultiplier(state, config), ep, 1e-12);

  // Each calculator has baseUnitBonus = 0.5. With EP, unit bonus is 0.5 * EP.
  // Fleet speed = (1 + 0.5 * EP)^2
  const expectedFleetSpeed = (1 + 0.5 * ep) ** 2;
  assertBigClose(calculateAutoCalculatorSpeedMultiplier(state, config), expectedFleetSpeed, 1e-12);

  // Crucial test from spec §11.1: verify difference between compounding E_P into each calculator vs multiplying at the end
  const wrongMultiplyAtEnd = ((1 + 0.5) ** 2) * ep;
  assert.notEqual(expectedFleetSpeed, wrongMultiplyAtEnd);
});

test("Overclocker acts on Processor bonus while active, not directly on fleet speed", () => {
  const state = createInitialState(config);
  state.devices.processors = 1;
  state.devices.autoCalculators = 1;
  state.devices.overclockers = 1;

  // Inactive
  assert.equal(calculateOverclockerSpeedMultiplier(state, config), 1);
  assertBigEqual(calculateOverclockerDrainPerSecond(state, config), 0);
  assert.equal(calculateProcessorBonusUnit(state, config), 0.15);

  // Active: O_0(1) = 5
  state.overclocker.active = true;
  assert.equal(calculateOverclockerSpeedMultiplier(state, config), 5);
  assertBigEqual(
    calculateOverclockerDrainPerSecond(state, config),
    config.overclocker.baseEnergyDrainPerSecond,
  );
  // Processor unit bonus becomes 0.15 * 5 = 0.75
  assert.equal(calculateProcessorBonusUnit(state, config), 0.75);

  // 2 Overclockers: O_0(2) = 5 * 1.5 = 7.5
  state.devices.overclockers = 2;
  assert.equal(calculateOverclockerSpeedMultiplier(state, config), 7.5);

  // Overclocker excess synergy with Setup: O_eff = 1 + (O_0 - 1) * D(S)
  state.setupOptimizations = 1;
  const ds = calculateSetupDevicePerformance(1, config);
  const expectedOeff = 1 + (7.5 - 1) * ds;
  assertBigClose(calculateOverclockerSpeedMultiplier(state, config), expectedOeff, 1e-12);
});

test("Overclocker runtime drain scales with active duration", () => {
  const state = createInitialState(config);
  state.devices.overclockers = 1;
  state.overclocker.active = true;
  state.overclocker.activeSeconds = 10;

  const expected =
    config.overclocker.baseEnergyDrainPerSecond *
    config.overclocker.runtimeDrainGrowthBase ** 10;
  assertBigClose(
    calculateOverclockerDrainPerSecond(state, config),
    expected,
    1e-10,
  );
});

test("Overclocker Blueprint research duration is 45 seconds base", () => {
  const state = createInitialState(config);
  assert.equal(calculateOverclockerBlueprintDuration(state, config), 45);
});

test("Overclocker cost scales by owned count", () => {
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

test("Power Cell capacity and cost scale from owned cells and Setup", () => {
  const state = createInitialState(config);
  state.powerCells = 3;

  assertBigEqual(
    calculateStableEnergyCapacity(state, config),
    config.energy.powerCellCapacity * 3,
  );
  assert.ok(
    calculatePowerCellCost(3, config).gt(calculatePowerCellCost(2, config)),
  );

  state.setupOptimizations = 1;
  const ds = calculateSetupDevicePerformance(1, config);
  assertBigEqual(
    calculateStableEnergyCapacity(state, config),
    big(config.energy.powerCellCapacity * 3).mul(ds),
  );
});

test("Power Modules multiply effective Power Cell capacity", () => {
  const state = createInitialState(config);
  state.powerCells = config.powerModule.cellsPerModule;
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

test("Particle Laboratory access and Synthesizer progress", () => {
  const state = createInitialState(config);
  state.peakEnergy = config.particleLab.doorEnergyRequired - 1;
  assert.equal(canAccessParticleLab(state, config), false);

  state.peakEnergy = config.particleLab.doorEnergyRequired;
  assert.equal(canAccessParticleLab(state, config), true);

  state.energy = calculateParticleSynthesizerCost(state, config).div(4);
  assert.ok(Math.abs(calculateParticleSynthesizerProgress(state, config) - 0.25) < 1e-9);
});

test("Science Points threshold inversion satisfies mandatory regression test", () => {
  // Regression test from spec §8: E = 1.904e33 J, H = 2 => SP_gained = 12, final H = 14
  const gained = calculateSciencePointReward("1.904e33", 2, config);
  assert.equal(gained, 12);

  // Boundary conditions
  assert.equal(calculateSciencePointReward(1e11, 0, config), 1);
  assert.equal(calculateSciencePointReward(1e11, 1, config), 0);
  assert.equal(calculateSciencePointReward(1e10, 0, config), 0);

  // Exact threshold costs
  const cost0 = calculateSciencePointCost(0, config);
  assertBigEqual(cost0, 1e11);
  assert.equal(calculateSciencePointReward(cost0, 0, config), 1);

  const cost5 = calculateSciencePointCost(5, config);
  assert.equal(calculateSciencePointReward(cost5, 0, config), 6);
  assert.equal(calculateSciencePointReward(cost5, 5, config), 1);
});

test("Science Era quark formulas use synthesis energy, safe capacity, and overflow decay", () => {
  const state = createInitialState(config);

  assertBigEqual(calculateQuarksGenerated(100e9, config), 1);
  assertBigEqual(calculateQuarksGenerated(250e9, config), 2);
  assertBigEqual(calculateQuarksGenerated(50e9, config), 0);
  assertBigEqual(calculateQuarkCapacity(state, config), 1);
  assertBigEqual(calculateQuarkCageCost(0, config), 100e9);

  state.quarks.available = 2;
  assert.ok(calculateQuarkDecay(state, config).gt(0));

  state.scienceDevices.quarkCages = 1;
  assertBigEqual(calculateQuarkCapacity(state, config), 10);
  assertBigEqual(calculateQuarkDecay(state, config), 0);
});

test("Algorithm Improvement duration follows quadratic curve T_I(I) = 0.5*(1 + 0.015*I^2)/V", () => {
  const state = createInitialState(config);

  state.improvements = 0;
  assert.equal(calculateStudyDuration(state, config), 0.5);

  state.improvements = 10;
  // 0.5 * (1 + 0.015 * 100) = 0.5 * 2.5 = 1.25
  assert.equal(calculateStudyDuration(state, config), 1.25);

  state.improvements = 20;
  // 0.5 * (1 + 0.015 * 400) = 0.5 * 7 = 3.5
  assert.equal(calculateStudyDuration(state, config), 3.5);
});

test("Redundancy Elimination softcaps at 50 and hardcaps at 100", () => {
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

test("Processor study-speed perk applies direct V_direct = E_P^1.07 exponent", () => {
  const state = createInitialState(config);
  state.devices.processors = 2;
  const baseDuration = calculateStudyDuration(state, config);

  state.science.perks.processorBonusAppliesAImprovementSpeed = true;
  const ep = calculateProcessorEfficiencyMultiplier(state, config);
  const expectedVdirect = ep ** 1.07;
  assertBigClose(
    calculateProcessorImprovementSpeedMultiplier(state, config),
    expectedVdirect,
    1e-12,
  );

  const boostedDuration = calculateStudyDuration(state, config);
  assertBigClose(boostedDuration, baseDuration / expectedVdirect, 1e-12);
});

test("Science perks apply production multipliers: SciencePoints (1+SP), CRC exponential (1.005^C), Processor bonus (E_P^0.15)", () => {
  const state = createInitialState(config);
  state.crcCount = 3;
  state.devices.processors = 2;
  state.science.totalScienceEarned = 4;
  state.science.perks.processorBonusAppliesCRC = true;
  state.science.perks.sciencePoweredEnergyProduction = true;
  state.science.perks.crcExponentialScaling = true;

  const ep = calculateProcessorEfficiencyMultiplier(state, config);
  const expectedEpBonus = ep ** 0.15;
  assertBigClose(calculateCrcProcessorBonusMultiplier(state, config), expectedEpBonus, 1e-12);

  // 1 + totalScienceEarned = 1 + 4 = 5
  assertBigEqual(calculateScienceProductionMultiplier(state), 5);
  assertBigEqual(calculateCrcExponentialMultiplier(state, config), 1.005 ** 3);

  const expectedProduction =
    1e-12 * 3 * (1 + 0) * (2 ** 0) * 1 * (1.005 ** 3) * expectedEpBonus * 5;
  assertBigClose(calculateProduction(state, config), expectedProduction, 1e-14);
});

test("Quantum Superposition accelerates Improvements by log10(1+quarks) without retention", () => {
  const state = createInitialState(config);
  state.quarks.totalEarned = big(99); // log10(100) = 2 -> 1 + 0.02 * 2 = 1.04
  state.science.perks.quantumSuperposition = true;

  const speed = calculateQuantumSuperpositionSpeedMultiplier(state.quarks.totalEarned, config);
  assert.equal(speed, 1.04);

  const duration = calculateStudyDuration(state, config);
  assert.equal(duration, 0.5 / 1.04);

  // Retention is removed (0)
  assert.equal(calculateQuantumSuperpositionRetention(100, config), 0);
});

test("Power Cell Resonance perk increases cell capacity by 1 + 0.02*log10(1+cells)", () => {
  const state = createInitialState(config);
  state.powerCells = 99; // log10(100) = 2 -> 1 + 0.02 * 2 = 1.04
  state.science.perks.powerCellResonance = true;

  const resonance = calculatePowerCellResonanceMultiplier(state.powerCells, config);
  assert.equal(resonance, 1.04);

  const capacity = calculateStableEnergyCapacity(state, config);
  assertBigEqual(capacity, big(99).mul(config.energy.powerCellCapacity).mul(1.04));
});
