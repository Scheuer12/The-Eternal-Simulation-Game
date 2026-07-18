import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { GameEngine } from "../js/engine.js";
import { createInitialState } from "../js/state.js";

const config = JSON.parse(
  await readFile(new URL("../config/game-config.json", import.meta.url), "utf8")
);

function createEngine(random = () => 1) {
  const state = createInitialState(config);
  const engine = new GameEngine({ state, config, random });
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

test("energy production is limited by Power Cell capacity", () => {
  const engine = createEngine();
  engine.addEnergy(config.energy.powerCellCapacity * 2);
  assert.equal(engine.state.energy, config.energy.powerCellCapacity);
});

test("a completed Study applies its next marginal multiplier", () => {
  const engine = createEngine();
  engine.startStudy();
  engine.completeStudy();
  assert.equal(engine.state.improvements, 1);
  assert.equal(engine.state.improvementMultiplier, 10);
});

test("Blueprint discovery stays hidden until its energy threshold", () => {
  const engine = createEngine();

  engine.state.improvements = 100;
  engine.state.upgrades = 100;
  engine.checkBlueprintGuarantee();
  assert.equal(engine.state.discoveries.crcBlueprint, false);

  engine.state.peakEnergy = config.blueprint.revealAtPeakEnergy;
  engine.checkBlueprintGuarantee();
  assert.equal(engine.state.discoveries.crcBlueprint, true);
  assert.equal(engine.state.discoveries.blueprintSource, "energy-threshold");
});

test("Auto Calculator requires only sufficient energy", () => {
  const engine = createEngine();
  engine.state.energy = config.autoCalculator.cost;
  assert.equal(engine.purchaseAutoCalculator(), true);
  assert.equal(engine.state.devices.autoCalculator, true);
});

test("Soft Data Display requires only sufficient energy", () => {
  const engine = createEngine();
  engine.state.energy = config.softDataDisplay.cost;
  assert.equal(engine.purchaseSoftDataDisplay(), true);
  assert.equal(engine.state.devices.softDataDisplay, true);
});

test("Processor requires only sufficient energy", () => {
  const engine = createEngine();
  engine.state.crcCount = 1;
  engine.state.energy = config.processor.cost;
  assert.equal(engine.purchaseProcessor(), true);
  assert.equal(engine.state.prototypeComplete, true);
});
