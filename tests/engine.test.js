import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { GameEngine } from "../js/engine.js";
import {
  calculateAlgorithmUpgradeRequirement,
  calculateAutoCalculatorCost,
  calculateCalculationMethodRequirement,
  calculatePowerCellCost,
  calculateProcessorCost,
  calculateStableEnergyCapacity,
  calculateStudyDuration,
  calculateSetupOptimizationRequirement
} from "../js/formulas.js";
import { createInitialState } from "../js/state.js";

const config = JSON.parse(
  await readFile(new URL("../config/game-config.json", import.meta.url), "utf8")
);

function createEngine() {
  const state = createInitialState(config);
  const engine = new GameEngine({ state, config });
  engine.pressButton();
  engine.activateCrc();
  return engine;
}

test("pressing the first button opens the CRC briefing before active play", () => {
  const state = createInitialState(config);
  const engine = new GameEngine({ state, config });

  engine.pressButton();
  assert.equal(engine.state.introState, "crc-briefing");

  engine.activateCrc();
  assert.equal(engine.state.introState, "active");
});

test("energy above stable Power Cell capacity decays over time", () => {
  const engine = createEngine();
  engine.addEnergy(config.energy.powerCellCapacity * 2);
  const beforeDecay = engine.state.energy;

  engine.decayOverflowEnergy(1);

  assert.ok(engine.state.energy > config.energy.powerCellCapacity);
  assert.ok(engine.state.energy < beforeDecay);
});

test("Power Cells require Soft Display and three Algorithm Upgrades", () => {
  const engine = createEngine();
  engine.state.energy = calculatePowerCellCost(engine.state.powerCells, config);
  assert.equal(engine.purchasePowerCell(), false);

  engine.state.devices.softDataDisplay = true;
  engine.state.upgrades = 2;
  assert.equal(engine.purchasePowerCell(), false);

  engine.state.upgrades = config.powerCell.algorithmUpgradesRequired;
  assert.equal(engine.purchasePowerCell(), true);
  assert.equal(engine.state.powerCells, 2);
});

test("Power Cell Buy Max purchases every affordable cell in one action", () => {
  const engine = createEngine();
  engine.state.devices.softDataDisplay = true;
  engine.state.upgrades = config.powerCell.algorithmUpgradesRequired;
  engine.state.energy =
    calculatePowerCellCost(1, config) +
    calculatePowerCellCost(2, config) +
    calculatePowerCellCost(3, config) +
    calculatePowerCellCost(4, config) / 2;

  assert.equal(engine.purchaseMaxPowerCells(), 3);
  assert.equal(engine.state.powerCells, 4);
  assert.ok(engine.state.energy < calculatePowerCellCost(4, config));
});

test("Power Modules require cell groups and increase stable capacity", () => {
  const engine = createEngine();
  engine.state.powerCells = config.powerModule.cellsPerModule;
  engine.state.energy = config.powerModule.baseCost;
  const baseCapacity = calculateStableEnergyCapacity(engine.state, config);

  assert.equal(engine.purchasePowerModule(), true);
  assert.equal(engine.state.powerModules, 1);
  assert.equal(engine.state.powerCells, config.powerModule.cellsPerModule);
  assert.ok(calculateStableEnergyCapacity(engine.state, config) > baseCapacity);
});

test("Particle Synthesizer grants Science and resets the Energy Layer", () => {
  const engine = createEngine();
  engine.state.peakEnergy = config.particleLab.doorEnergyRequired;
  engine.state.energy = config.particleLab.synthesizerEnergyRequired;
  engine.state.powerCells = 10;
  engine.state.devices.autoCalculators = 1;
  engine.state.upgrades = 4;

  assert.equal(engine.activateParticleSynthesizer(), true);
  assert.equal(engine.state.sciencePoints, 1);
  assert.equal(engine.state.science.syntheses, 1);
  assert.equal(engine.state.particleSynthesizer.activated, false);
  assert.equal(engine.state.energy, 0);
  assert.equal(engine.state.peakEnergy, 0);
  assert.equal(engine.state.powerCells, config.energy.initialPowerCells);
  assert.equal(engine.state.devices.autoCalculators, 0);
  assert.equal(engine.state.upgrades, 0);
  assert.equal(engine.state.ui.activeTab, "science");
});

test("a completed Algorithm Improvement applies its next marginal multiplier", () => {
  const engine = createEngine();
  engine.startStudy();
  engine.completeStudy();
  assert.equal(engine.state.improvements, 1);
  assert.equal(engine.state.improvementMultiplier, 10);
});

test("Blueprint becomes researchable at 10 J peak and unlocks CRC construction after research", () => {
  const engine = createEngine();

  engine.state.peakEnergy = config.blueprint.revealAtPeakEnergy;
  engine.checkBlueprintGuarantee();
  assert.equal(engine.state.discoveries.crcBlueprint, false);
  assert.equal(engine.state.discoveries.blueprintSource, "research-available");

  assert.equal(engine.startBlueprintResearch(), true);
  engine.state.blueprintStudy.elapsed = engine.state.blueprintStudy.duration;
  engine.tickBlueprintStudy(0);
  assert.equal(engine.state.discoveries.crcBlueprint, true);
});

test("Auto Calculator requires only sufficient energy", () => {
  const engine = createEngine();
  engine.state.energy = calculateAutoCalculatorCost(0, config);
  assert.equal(engine.purchaseAutoCalculator(), true);
  assert.equal(engine.state.devices.autoCalculators, 1);
});

test("active Algorithm Improvement duration retimes when study speed improves", () => {
  const engine = createEngine();
  engine.startStudy(false);
  engine.state.study.elapsed = engine.state.study.duration / 2;
  const originalDuration = engine.state.study.duration;

  engine.state.energy = calculateAutoCalculatorCost(0, config);
  assert.equal(engine.purchaseAutoCalculator(), true);

  const expectedDuration = calculateStudyDuration(engine.state, config);
  assert.ok(engine.state.study.duration < originalDuration);
  assert.equal(engine.state.study.duration, expectedDuration);
  assert.equal(
    engine.state.study.elapsed / engine.state.study.duration,
    0.5
  );
  assert.equal(engine.state.study.automated, true);
});

test("Matrix Mechanics costs Science Points and retimes active Improvements", () => {
  const engine = createEngine();
  engine.state.sciencePoints = config.science.matrixMechanics.cost;
  engine.state.upgrades = 5;
  engine.state.improvements = 25;
  engine.startStudy(false);
  engine.state.study.elapsed = engine.state.study.duration / 2;
  const originalDuration = engine.state.study.duration;

  assert.equal(engine.purchaseMatrixMechanics(), true);
  assert.equal(engine.state.sciencePoints, 0);
  assert.equal(engine.state.science.matrixMechanics, true);
  assert.ok(engine.state.study.duration < originalDuration);
  assert.equal(engine.state.study.duration, calculateStudyDuration(engine.state, config));
  assert.equal(engine.state.study.elapsed / engine.state.study.duration, 0.5);
});

test("Soft Data Display requires only sufficient energy", () => {
  const engine = createEngine();
  engine.state.energy = config.softDataDisplay.cost;
  assert.equal(engine.purchaseSoftDataDisplay(), true);
  assert.equal(engine.state.devices.softDataDisplay, true);
});

test("T2 Soft Display requires Soft Display and stored energy", () => {
  const engine = createEngine();
  engine.state.energy = config.t2SoftDataDisplay.cost;
  assert.equal(engine.purchaseT2SoftDataDisplay(), false);

  engine.state.devices.softDataDisplay = true;
  assert.equal(engine.purchaseT2SoftDataDisplay(), true);
  assert.equal(engine.state.devices.t2SoftDataDisplay, true);
});

test("Processor requires only sufficient energy", () => {
  const engine = createEngine();
  engine.state.energy = calculateProcessorCost(0, config);
  assert.equal(engine.purchaseProcessor(), true);
  assert.equal(engine.state.devices.processors, 1);
  assert.equal(engine.state.prototypeComplete, true);
});

test("Overclocker requires three Processors, three Power Cells and stored energy", () => {
  const engine = createEngine();
  engine.state.energy = config.overclocker.baseCost;
  engine.state.devices.processors = config.overclocker.processorsRequired;
  engine.state.powerCells = config.overclocker.powerCellsRequired - 1;
  assert.equal(engine.purchaseOverclocker(), false);

  engine.state.powerCells = config.overclocker.powerCellsRequired;
  assert.equal(engine.purchaseOverclocker(), true);
  assert.equal(engine.state.devices.overclockers, 1);
  assert.equal(engine.state.overclocker.active, false);

  engine.state.energy = Infinity;
  assert.equal(engine.purchaseOverclocker(), true);
  assert.equal(engine.state.devices.overclockers, 2);
});

test("active Overclocker drains energy and retimes Algorithm Improvement", () => {
  const engine = createEngine();
  engine.state.devices.autoCalculators = 1;
  engine.state.devices.overclockers = 1;
  const capacity = calculateStableEnergyCapacity(engine.state, config);
  engine.state.energy = capacity + config.overclocker.baseEnergyDrainPerSecond / 2;
  engine.startStudy(true);
  const baseDuration = engine.state.study.duration;

  assert.equal(engine.toggleOverclocker(), true);
  assert.ok(engine.state.study.duration < baseDuration);
  assert.equal(engine.state.overclocker.active, true);

  engine.drainOverclocker(1);
  assert.equal(engine.state.energy, capacity);
  assert.equal(engine.state.overclocker.active, false);
  assert.equal(engine.state.overclocker.activeSeconds, 0);
  assert.equal(engine.state.study.duration, calculateStudyDuration(engine.state, config));
});

test("Overclocker drain rises while the same activation stays active", () => {
  const engine = createEngine();
  engine.state.devices.autoCalculators = 1;
  engine.state.devices.overclockers = 1;
  engine.state.energy = calculateStableEnergyCapacity(engine.state, config) + 10;

  assert.equal(engine.toggleOverclocker(), true);
  const firstDrain = engine.drainOverclocker(1);
  assert.equal(engine.state.overclocker.active, true);
  assert.equal(engine.state.overclocker.activeSeconds, 1);

  const secondDrain = engine.drainOverclocker(1);
  assert.ok(secondDrain > firstDrain);
  assert.equal(engine.state.overclocker.activeSeconds, 2);
});

test("Overclocker cooling prevents start-stop heat reset bypass", () => {
  const engine = createEngine();
  engine.state.devices.autoCalculators = 1;
  engine.state.devices.overclockers = 1;
  engine.state.energy = calculateStableEnergyCapacity(engine.state, config) + 10;

  assert.equal(engine.toggleOverclocker(), true);
  engine.drainOverclocker(4);
  assert.equal(engine.state.overclocker.activeSeconds, 4);

  assert.equal(engine.toggleOverclocker(), true);
  assert.equal(engine.state.overclocker.active, false);
  assert.equal(engine.state.overclocker.activeSeconds, 4);

  const cooled = engine.coolOverclocker(2);
  assert.equal(cooled, 1);
  assert.equal(engine.state.overclocker.activeSeconds, 3);

  assert.equal(engine.toggleOverclocker(), true);
  assert.equal(engine.state.overclocker.active, true);
  assert.equal(engine.state.overclocker.activeSeconds, 3);
});

test("Algorithm Upgrade is manual and resets Improvements", () => {
  const engine = createEngine();
  engine.state.improvements = calculateAlgorithmUpgradeRequirement(
    engine.state,
    config
  );
  engine.state.improvementMultiplier = 100;

  assert.equal(engine.startAlgorithmUpgradeStudy(), true);
  engine.completeAlgorithmUpgrade();
  assert.equal(engine.state.upgrades, 1);
  assert.equal(engine.state.improvements, 0);
  assert.equal(engine.state.improvementMultiplier, 1);
});

test("Calculation Method Upgrade requires Algorithm Upgrades and resets studies", () => {
  const engine = createEngine();
  engine.state.upgrades = calculateCalculationMethodRequirement(
    engine.state,
    config
  );
  engine.state.improvements = 12;

  assert.equal(engine.claimCalculationMethodUpgrade(), true);
  assert.equal(engine.state.calculationMethods, 1);
  assert.equal(engine.state.upgrades, 0);
  assert.equal(engine.state.improvements, 0);
});

test("Setup Optimization replaces Compression and resets hardware except Power Cells", () => {
  const engine = createEngine();
  engine.state.powerCells = 3;
  engine.state.energy = 1;
  engine.state.calculationMethods = calculateSetupOptimizationRequirement(
    engine.state,
    config
  );
  engine.state.devices.softDataDisplay = true;
  engine.state.devices.t2SoftDataDisplay = true;
  engine.state.devices.autoCalculators = 1;
  engine.state.devices.processors = 1;
  engine.state.devices.overclockers = 1;
  engine.state.overclocker.active = true;
  engine.state.overclocker.activeSeconds = 12;

  assert.equal(engine.claimSetupOptimization(), true);
  assert.equal(engine.state.setupOptimizations, 1);
  assert.equal(engine.state.powerCells, 3);
  assert.equal(engine.state.energy, 0);
  assert.equal(engine.state.calculationMethods, 0);
  assert.equal(engine.state.devices.softDataDisplay, false);
  assert.equal(engine.state.devices.t2SoftDataDisplay, false);
  assert.equal(engine.state.devices.autoCalculators, 0);
  assert.equal(engine.state.devices.processors, 0);
  assert.equal(engine.state.devices.overclockers, 0);
  assert.equal(engine.state.overclocker.active, false);
  assert.equal(engine.state.overclocker.activeSeconds, 0);
});
