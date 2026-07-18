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
  return engine;
}

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

test("Blueprint discovery is guaranteed at its Improvement threshold", () => {
  const engine = createEngine();

  for (
    let index = 0;
    index < config.blueprint.guaranteedAtImprovements;
    index += 1
  ) {
    engine.startStudy();
    engine.completeStudy();
  }

  assert.equal(engine.state.discoveries.crcBlueprint, true);
  assert.equal(engine.state.discoveries.blueprintSource, "threshold");
});

test("Processor requires the second CRC and sufficient energy", () => {
  const engine = createEngine();
  engine.state.crcCount = 2;
  engine.state.energy = config.processor.cost;
  assert.equal(engine.purchaseProcessor(), true);
  assert.equal(engine.state.prototypeComplete, true);
});

