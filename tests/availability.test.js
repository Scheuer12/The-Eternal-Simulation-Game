import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAvailabilitySnapshot,
  evaluateComponent
} from "../js/availability.js";
import { calculateAutoCalculatorCost } from "../js/formulas.js";
import { createInitialState } from "../js/state.js";

const config = JSON.parse(
  await readFile(new URL("../config/game-config.json", import.meta.url), "utf8")
);

test("component availability exposes cost, enabled state, and blocked reason", () => {
  const state = createInitialState(config);
  const locked = evaluateComponent("autoCalculator", state, config);

  assert.equal(locked.visible, true);
  assert.equal(locked.enabled, false);
  assert.equal(locked.cost, calculateAutoCalculatorCost(0, config));
  assert.match(locked.reason, /Needs/);

  state.energy = locked.cost;
  const enabled = evaluateComponent("autoCalculator", state, config);
  assert.equal(enabled.enabled, true);
});

test("availability snapshot evaluates all registered components", () => {
  const state = createInitialState(config);
  const snapshot = buildAvailabilitySnapshot(state, config);

  assert.ok(snapshot.softDataDisplay);
  assert.ok(snapshot.t2SoftDataDisplay);
  assert.ok(snapshot.autoCalculator);
  assert.ok(snapshot.processor);
  assert.ok(snapshot.overclocker);
  assert.equal(snapshot.powerCell.visible, false);
  assert.equal(snapshot.overclocker.visible, false);
});

test("T2 Soft Display is visible after Soft Display and costs stored energy", () => {
  const state = createInitialState(config);
  assert.equal(evaluateComponent("t2SoftDataDisplay", state, config).visible, false);

  state.devices.softDataDisplay = true;
  const locked = evaluateComponent("t2SoftDataDisplay", state, config);
  assert.equal(locked.visible, true);
  assert.equal(locked.enabled, false);
  assert.equal(locked.cost, config.t2SoftDataDisplay.cost);

  state.energy = config.t2SoftDataDisplay.cost;
  assert.equal(evaluateComponent("t2SoftDataDisplay", state, config).enabled, true);
});

test("Power Cell visibility unlocks after Soft Display and three Algorithm Upgrades", () => {
  const state = createInitialState(config);
  state.devices.softDataDisplay = true;
  state.upgrades = config.powerCell.algorithmUpgradesRequired - 1;
  assert.equal(evaluateComponent("powerCell", state, config).visible, false);

  state.upgrades = config.powerCell.algorithmUpgradesRequired;
  assert.equal(evaluateComponent("powerCell", state, config).visible, true);
});

test("Overclocker visibility unlocks after three Processors and three Power Cells", () => {
  const state = createInitialState(config);
  state.devices.processors = config.overclocker.processorsRequired;
  state.powerCells = config.overclocker.powerCellsRequired - 1;
  assert.equal(evaluateComponent("overclocker", state, config).visible, false);

  state.powerCells = config.overclocker.powerCellsRequired;
  const visible = evaluateComponent("overclocker", state, config);
  assert.equal(visible.visible, true);
  assert.equal(visible.enabled, false);

  state.energy = config.overclocker.baseCost;
  assert.equal(evaluateComponent("overclocker", state, config).enabled, true);
});

test("Power Module visibility scales by each full group of one hundred Power Cells", () => {
  const state = createInitialState(config);
  state.powerCells = config.powerModule.cellsPerModule - 1;
  assert.equal(evaluateComponent("powerModule", state, config).visible, false);

  state.powerCells = config.powerModule.cellsPerModule;
  const first = evaluateComponent("powerModule", state, config);
  assert.equal(first.visible, true);
  assert.equal(first.enabled, false);

  state.energy = first.cost;
  assert.equal(evaluateComponent("powerModule", state, config).enabled, true);

  state.powerModules = 1;
  assert.equal(evaluateComponent("powerModule", state, config).visible, false);

  state.powerCells = config.powerModule.cellsPerModule * 2;
  assert.equal(evaluateComponent("powerModule", state, config).visible, true);
});

test("Particle Synthesizer appears after the laboratory door threshold", () => {
  const state = createInitialState(config);
  state.peakEnergy = config.particleLab.doorEnergyRequired - 1;
  assert.equal(evaluateComponent("particleSynthesizer", state, config).visible, false);

  state.peakEnergy = config.particleLab.doorEnergyRequired;
  const visible = evaluateComponent("particleSynthesizer", state, config);
  assert.equal(visible.visible, true);
  assert.equal(visible.enabled, false);

  state.energy = config.particleLab.synthesizerEnergyRequired;
  assert.equal(evaluateComponent("particleSynthesizer", state, config).enabled, true);
});

test("Matrix Mechanics appears when Science Points exist and costs SP", () => {
  const state = createInitialState(config);
  assert.equal(evaluateComponent("matrixMechanics", state, config).visible, false);

  state.sciencePoints = 1;
  const available = evaluateComponent("matrixMechanics", state, config);
  assert.equal(available.visible, true);
  assert.equal(available.enabled, true);
  assert.equal(available.cost, config.science.matrixMechanics.cost);

  state.sciencePoints = 0;
  state.science.matrixMechanics = true;
  const owned = evaluateComponent("matrixMechanics", state, config);
  assert.equal(owned.visible, true);
  assert.equal(owned.completed, true);
});
