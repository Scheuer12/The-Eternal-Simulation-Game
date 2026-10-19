import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { GameEngine } from "../../js/engine.js";
import {
  calculateAlgorithmUpgradeRequirement,
  calculateAutoCalculatorCost,
  calculateCalculationMethodRequirement,
  calculateParticleSynthesizerCost,
  calculateSciencePointCost,
  calculatePowerCellCost,
  calculateProcessorCost,
  calculateQuarkCageCost,
  calculateQuarkCapacity,
  calculateStableEnergyCapacity,
  calculateStudyDuration,
  calculateSetupOptimizationRequirement,
} from "../../js/formulas.js";
import { createInitialState } from "../../js/state.js";
import { big } from "../../js/numeric.js";
import { assertBigEqual } from "./assertions.js";

const config = JSON.parse(
  await readFile(
    new URL("../../config/game-config.json", import.meta.url),
    "utf8",
  ),
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

  assert.ok(engine.state.energy.gt(config.energy.powerCellCapacity));
  assert.ok(engine.state.energy.lt(beforeDecay));
});

test("clearing enormous overflow preserves stable capacity instead of rounding energy to zero", () => {
  const engine = createEngine();
  const capacity = calculateStableEnergyCapacity(engine.state, config);
  engine.state.energy = 1e99;

  engine.decayOverflowEnergy(1);

  assertBigEqual(engine.state.energy, capacity);
});

test("high production reaches a finite stored-energy equilibrium instead of draining to capacity each frame", () => {
  const engine = createEngine();
  engine.state.crcCount = 10;
  engine.state.improvements = 40;
  engine.state.improvementMultiplier = 1e6;
  engine.state.upgrades = 165;
  engine.state.powerCells = 161;
  engine.state.powerModules = 1;

  engine.tick(0.1);

  assert.ok(engine.state.energy.isFinite());
  assert.ok(
    engine.state.energy.gt(calculateStableEnergyCapacity(engine.state, config)),
  );
  assert.ok(engine.state.peakEnergy.isFinite());
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
  engine.state.energy = calculatePowerCellCost(1, config)
    .add(calculatePowerCellCost(2, config))
    .add(calculatePowerCellCost(3, config))
    .add(calculatePowerCellCost(4, config).div(2));

  assert.equal(engine.purchaseMaxPowerCells(), 3);
  assert.equal(engine.state.powerCells, 4);
  assert.ok(engine.state.energy.lt(calculatePowerCellCost(4, config)));
});

test("Power Modules require cell groups and increase stable capacity", () => {
  const engine = createEngine();
  engine.state.powerCells = config.powerModule.cellsPerModule;
  engine.state.energy = config.powerModule.baseCost;
  const baseCapacity = calculateStableEnergyCapacity(engine.state, config);

  assert.equal(engine.purchasePowerModule(), true);
  assert.equal(engine.state.powerModules, 1);
  assert.equal(engine.state.powerCells, config.powerModule.cellsPerModule);
  assert.ok(calculateStableEnergyCapacity(engine.state, config).gt(baseCapacity));
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
  assert.equal(engine.state.science.totalScienceEarned, 1);
  assertBigEqual(engine.state.quarks.available, 1);
  assertBigEqual(engine.state.quarks.totalEarned, 1);
  assertBigEqual(engine.state.quarks.lastSynthesis, 1);
  assert.equal(engine.state.scienceDevices.quarkCages, 1);
  assertBigEqual(calculateQuarkCapacity(engine.state, config), 10);
  assert.equal(engine.state.particleSynthesizer.activated, false);
  assertBigEqual(engine.state.energy, 0);
  assertBigEqual(engine.state.peakEnergy, 0);
  assert.equal(engine.state.powerCells, config.energy.initialPowerCells);
  assert.equal(engine.state.devices.autoCalculators, 0);
  assert.equal(engine.state.upgrades, 0);
  assert.equal(engine.state.ui.activeTab, "science");
  assert.equal(engine.state.ui.activeScienceSubtab, "devices");
});

test("Particle Synthesizer confirmation becomes first-synthesis narrative", () => {
  const engine = createEngine();
  engine.state.peakEnergy = config.particleLab.doorEnergyRequired;
  engine.state.energy = config.particleLab.synthesizerEnergyRequired;

  assert.equal(engine.openParticleSynthesisConfirmation(), true);
  assert.equal(engine.state.ui.particleSynthesisModal, "confirm");
  const playTimeBeforeConfirmation = engine.state.stats.runPlayTime;
  engine.tick(1);
  assert.equal(engine.state.stats.runPlayTime, playTimeBeforeConfirmation);
  assert.equal(engine.state.science.syntheses, 0);
  assert.equal(engine.confirmParticleSynthesis(), true);
  assert.equal(engine.state.ui.particleSynthesisModal, "narrative");
  assert.equal(engine.state.science.syntheses, 1);

  assert.equal(engine.closeParticleSynthesisModal(), true);
  assert.equal(engine.state.ui.particleSynthesisModal, null);
});

test("Particle Synthesizer always costs 100e9 J and grants SP only at the rising SP threshold", () => {
  const engine = createEngine();
  engine.state.science.syntheses = 1;
  engine.state.science.totalScienceEarned = 1;
  engine.state.sciencePoints = 1;
  engine.state.peakEnergy = config.particleLab.doorEnergyRequired;
  const activationCost = calculateParticleSynthesizerCost(engine.state, config);
  const nextSpCost = calculateSciencePointCost(1, config);

  assertBigEqual(activationCost, 100e9);
  assert.ok(nextSpCost.gt(activationCost));
  engine.state.energy = activationCost.sub(1);

  assert.equal(engine.canActivateParticleSynthesizer(), false);
  assert.equal(engine.activateParticleSynthesizer(), false);
  assert.equal(engine.state.sciencePoints, 1);
  assert.equal(engine.state.science.syntheses, 1);
  assertBigEqual(engine.state.energy, activationCost.sub(1));

  engine.state.energy = activationCost;
  assert.equal(engine.activateParticleSynthesizer(), true);
  assert.equal(engine.state.sciencePoints, 1);
  assert.equal(engine.state.science.totalScienceEarned, 1);
  assert.equal(engine.state.science.syntheses, 2);
  assert.equal(engine.state.scienceDevices.quarkCages, 1);

  engine.state.peakEnergy = config.particleLab.doorEnergyRequired;
  engine.state.energy = nextSpCost;
  assert.equal(engine.activateParticleSynthesizer(), true);
  assert.equal(engine.state.sciencePoints, 2);
  assert.equal(engine.state.science.totalScienceEarned, 2);
});

test("a completed Algorithm Improvement applies its next marginal multiplier", () => {
  const engine = createEngine();
  engine.startStudy();
  engine.completeStudy();
  assert.equal(engine.state.improvements, 1);
  assertBigEqual(engine.state.improvementMultiplier, 2);
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
  assert.equal(engine.state.study.elapsed / engine.state.study.duration, 0.5);
  assert.equal(engine.state.study.automated, true);
});

test("Redundancy Elimination costs Science Points and retimes active Improvements", () => {
  const engine = createEngine();
  engine.state.sciencePoints = 1;
  engine.state.upgrades = 5;
  engine.state.improvements = 25;
  engine.startStudy(false);
  engine.state.study.elapsed = engine.state.study.duration / 2;
  const originalDuration = engine.state.study.duration;

  assert.equal(engine.purchaseSciencePerk("redundancyElimination"), true);
  assert.equal(engine.state.sciencePoints, 0);
  assert.equal(engine.state.science.perks.redundancyElimination, true);
  assert.ok(engine.state.study.duration < originalDuration);
  assert.equal(
    engine.state.study.duration,
    calculateStudyDuration(engine.state, config),
  );
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

test("Overclocker requires three Processors, three Power Cells, stored energy and Overclocker Blueprint", () => {
  const engine = createEngine();
  engine.state.energy = config.overclocker.baseCost;
  engine.state.devices.processors = config.overclocker.processorsRequired;
  engine.state.powerCells = config.overclocker.powerCellsRequired;
  assert.equal(engine.purchaseOverclocker(), false);

  engine.state.discoveries.overclockerBlueprint = true;
  assert.equal(engine.purchaseOverclocker(), true);
  assert.equal(engine.state.devices.overclockers, 1);
  assert.equal(engine.state.overclocker.active, false);

  engine.state.energy = big("1e1000");
  assert.equal(engine.purchaseOverclocker(), true);
  assert.equal(engine.state.devices.overclockers, 2);
});

test("active Overclocker drains energy and retimes Algorithm Improvement", () => {
  const engine = createEngine();
  engine.state.devices.autoCalculators = 1;
  engine.state.devices.processors = 3;
  engine.state.devices.overclockers = 1;
  const capacity = calculateStableEnergyCapacity(engine.state, config);
  engine.state.energy = capacity.add(
    config.overclocker.baseEnergyDrainPerSecond / 2,
  );
  engine.startStudy(true);
  const baseDuration = engine.state.study.duration;

  assert.equal(engine.toggleOverclocker(), true);
  assert.ok(engine.state.study.duration < baseDuration);
  assert.equal(engine.state.overclocker.active, true);

  engine.drainOverclocker(1);
  assertBigEqual(engine.state.energy, capacity);
  assert.equal(engine.state.overclocker.active, false);
  assert.equal(engine.state.overclocker.activeSeconds, 0);
  assert.equal(
    engine.state.study.duration,
    calculateStudyDuration(engine.state, config),
  );
});

test("Overclocker drain rises while the same activation stays active", () => {
  const engine = createEngine();
  engine.state.devices.autoCalculators = 1;
  engine.state.devices.overclockers = 1;
  engine.state.energy =
    calculateStableEnergyCapacity(engine.state, config) + 10;

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
  engine.state.energy =
    calculateStableEnergyCapacity(engine.state, config) + 10;

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
    config,
  );
  engine.state.improvementMultiplier = 100;

  assert.equal(engine.startAlgorithmUpgradeStudy(), true);
  assert.equal(engine.state.algorithmUpgradeStudy.active, false);
  assert.equal(engine.state.upgrades, 1);
  assert.equal(engine.state.improvements, 0);
  assertBigEqual(engine.state.improvementMultiplier, 1);
});

test("Quantum Superposition provides energy boost based on Quarks without retaining improvements on Algorithm Upgrade", () => {
  const engine = createEngine();
  engine.state.science.perks.quantumSuperposition = true;
  engine.state.quarks.totalEarned = 1e30;
  engine.state.improvements = 10;
  engine.state.improvementMultiplier = big(11);

  engine.completeAlgorithmUpgrade();
  assert.equal(engine.state.improvements, 0);
  assertBigEqual(engine.state.improvementMultiplier, 1);
});

test("Particle Generator reveal is permanently recorded once Stored Energy reaches its target", () => {
  const engine = createEngine();
  const target =
    config.science.quantumPerks.particleGeneratorStoredEnergyRequired;
  engine.addEnergy(target);

  assert.equal(engine.state.science.revealedPerks.particleGenerator, true);
  engine.state.energy = 0;
  assert.equal(engine.state.science.revealedPerks.particleGenerator, true);
});

test("automated Algorithm Upgrade keeps its research duration", () => {
  const engine = createEngine();
  engine.state.improvements = calculateAlgorithmUpgradeRequirement(
    engine.state,
    config,
  );

  assert.equal(engine.startAlgorithmUpgradeStudy({ automated: true }), true);
  assert.equal(engine.state.algorithmUpgradeStudy.active, true);
  assert.ok(engine.state.algorithmUpgradeStudy.duration > 0);
});

test("legacy manual Algorithm Upgrade studies complete on the next tick", () => {
  const engine = createEngine();
  engine.state.improvements = calculateAlgorithmUpgradeRequirement(
    engine.state,
    config,
  );
  engine.state.algorithmUpgradeStudy = {
    active: true,
    elapsed: 1,
    duration: 30,
  };

  engine.tick(0.1);

  assert.equal(engine.state.algorithmUpgradeStudy.active, false);
  assert.equal(engine.state.upgrades, 1);
  assert.equal(engine.state.improvements, 0);
});

test("50G Calculator automates Algorithm Upgrades with growing timed execution", () => {
  const engine = createEngine();
  engine.state.devices.autoCalculators = 1;
  engine.state.science.perks.redundancyElimination = true;
  engine.state.science.fiftyGCalculator = true;
  engine.state.upgrades = 3;
  engine.state.improvements = calculateAlgorithmUpgradeRequirement(
    engine.state,
    config,
  );

  engine.tick(0.1);

  assert.equal(engine.state.study.active, false);
  assert.equal(engine.state.algorithmUpgradeStudy.active, true);
  assert.equal(engine.state.algorithmUpgradeStudy.automated, true);
  assert.ok(
    engine.state.algorithmUpgradeStudy.duration >
      config.algorithmUpgrade.baseDurationSeconds,
  );
});

test("50G Calculator costs one Science Point and requires Redundancy Elimination", () => {
  const engine = createEngine();
  engine.state.sciencePoints = 2;

  assert.equal(engine.purchaseFiftyGCalculator(), false);

  assert.equal(engine.purchaseSciencePerk("redundancyElimination"), true);
  assert.equal(engine.purchaseFiftyGCalculator(), true);
  assert.equal(engine.state.science.fiftyGCalculator, true);
  assert.equal(engine.state.sciencePoints, 0);
});

test("Science perk purchases enforce prerequisite chains and costs", () => {
  const engine = createEngine();
  engine.state.sciencePoints = 4;

  assert.equal(engine.purchaseSciencePerk("roboticArms"), false);
  assert.equal(engine.purchaseSciencePerk("redundancyElimination"), true);
  assert.equal(engine.purchaseSciencePerk("fiftyGCalculator"), true);
  assert.equal(engine.purchaseSciencePerk("roboticArms"), true);
  assert.equal(engine.purchaseSciencePerk("roboticPinch"), true);
  assert.equal(engine.state.science.perks.roboticPinch, true);
  assert.equal(engine.state.sciencePoints, 0);
});

test("Particle Generator purchase requires both Quantum perks and the Stored Energy discovery", () => {
  const engine = createEngine();
  engine.state.sciencePoints = 6;
  engine.state.science.totalScienceEarned = 6;
  engine.purchaseSciencePerk("redundancyElimination");
  engine.purchaseSciencePerk("processorBonusAppliesCRC");
  engine.purchaseSciencePerk("fiftyGCalculator");
  assert.equal(
    engine.purchaseSciencePerk("quantumCalculationPrinciples"),
    true,
  );
  assert.equal(engine.purchaseSciencePerk("quantumSuperposition"), true);

  assert.equal(engine.purchaseSciencePerk("particleGenerator"), false);
  engine.state.energy =
    config.science.quantumPerks.particleGeneratorStoredEnergyRequired;
  assert.equal(engine.purchaseSciencePerk("particleGenerator"), true);
});

test("Quarks Cage uses Stored Energy and increases safe containment", () => {
  const engine = createEngine();
  engine.state.science.syntheses = 1;
  engine.state.quarks.available = 2;
  engine.state.quarks.totalEarned = 2;
  engine.state.energy = calculateQuarkCageCost(0, config);
  const before = calculateQuarkCapacity(engine.state, config);

  assert.equal(engine.purchaseQuarkCage(), true);
  assert.equal(engine.state.scienceDevices.quarkCages, 1);
  assert.ok(calculateQuarkCapacity(engine.state, config) > before);
});

test("Calculation Method Upgrade requires Algorithm Upgrades and resets studies", () => {
  const engine = createEngine();
  engine.state.upgrades = calculateCalculationMethodRequirement(
    engine.state,
    config,
  );
  engine.state.improvements = 12;

  assert.equal(engine.claimCalculationMethodUpgrade(), true);
  assert.equal(engine.state.calculationMethods, 1);
  assert.equal(engine.state.upgrades, 0);
  assert.equal(engine.state.improvements, 0);
});

test("Setup Optimization replaces Compression and resets hardware except Power Cells, Power Arrays and CRCs", () => {
  const engine = createEngine();
  engine.state.powerCells = 3;
  engine.state.powerModules = 2;
  engine.state.crcCount = 5;
  engine.state.discoveries.crcBlueprint = true;
  engine.state.energy = 1;
  engine.state.calculationMethods = calculateSetupOptimizationRequirement(
    engine.state,
    config,
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
  assert.equal(engine.state.powerModules, 2);
  assert.equal(engine.state.crcCount, 5);
  assert.equal(engine.state.discoveries.crcBlueprint, true);
  assertBigEqual(engine.state.energy, 0);
  assert.equal(engine.state.calculationMethods, 0);
  assert.equal(engine.state.devices.softDataDisplay, false);
  assert.equal(engine.state.devices.t2SoftDataDisplay, false);
  assert.equal(engine.state.devices.autoCalculators, 0);
  assert.equal(engine.state.devices.processors, 0);
  assert.equal(engine.state.devices.overclockers, 0);
  assert.equal(engine.state.overclocker.active, false);
  assert.equal(engine.state.overclocker.activeSeconds, 0);
});

test("Setup Optimization hard resets energy to 0 and preserves Power Cells, Power Modules, and CRCs", () => {
  const engine = createEngine();
  engine.state.energy = 123;
  engine.state.powerCells = 5;
  engine.state.powerModules = 1;
  engine.state.crcCount = 4;
  engine.resetHardwareForSetupOptimization();
  assertBigEqual(engine.state.energy, 0);
  assert.equal(engine.state.powerCells, 5);
  assert.equal(engine.state.powerModules, 1);
  assert.equal(engine.state.crcCount, 4);

  engine.state.energy = 456;
  engine.state.powerCells = 8;
  engine.state.powerModules = 3;
  engine.state.crcCount = 10;
  engine.state.science.perks.powerCellResonance = true;
  engine.resetHardwareForSetupOptimization();
  assertBigEqual(engine.state.energy, 0);
  assert.equal(engine.state.powerCells, 8);
  assert.equal(engine.state.powerModules, 3);
  assert.equal(engine.state.crcCount, 10);
});
