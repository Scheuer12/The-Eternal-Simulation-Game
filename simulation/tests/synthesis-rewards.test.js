import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { GameEngine } from "../../js/engine.js";
import {
  calculateQuarksGenerated,
  calculateSciencePointCost,
} from "../../js/formulas.js";
import { big } from "../../js/numeric.js";
import { createInitialState } from "../../js/state.js";
import { assertBigEqual } from "./assertions.js";

const config = JSON.parse(
  await readFile(new URL("../../config/game-config.json", import.meta.url), "utf8"),
);

function createActiveEngine() {
  const state = createInitialState(config);
  state.introState = "active";
  return new GameEngine({ state, config });
}

test("synthesis rewards use stored energy at activation, not lifetime production", () => {
  const engine = createActiveEngine();
  const storedEnergy = big(250e9);

  engine.state.energy = storedEnergy;
  engine.state.peakEnergy = storedEnergy;
  engine.state.stats.totalEnergyCollected = big("1e100");

  assert.equal(engine.activateParticleSynthesizer(), true);
  assertBigEqual(engine.state.sciencePoints, 1);
  assertBigEqual(engine.state.quarks.lastSynthesis, 2);
});

test("lifetime production cannot satisfy the next Science Point threshold", () => {
  const engine = createActiveEngine();

  engine.state.science.syntheses = 1;
  engine.state.science.totalScienceEarned = 1;
  engine.state.energy = big(config.particleLab.synthesizerEnergyRequired);
  engine.state.peakEnergy = engine.state.energy;
  engine.state.stats.totalEnergyCollected = big("1e100");

  assert.equal(engine.activateParticleSynthesizer(), true);
  assertBigEqual(engine.state.sciencePoints, 0);
  assertBigEqual(engine.state.science.totalScienceEarned, 1);
});

test("stored energy at the next threshold grants the next Science Point", () => {
  const engine = createActiveEngine();
  const storedEnergy = calculateSciencePointCost(1, config);

  engine.state.science.syntheses = 1;
  engine.state.science.totalScienceEarned = 1;
  engine.state.energy = storedEnergy;
  engine.state.peakEnergy = storedEnergy;
  engine.state.stats.totalEnergyCollected = big(0);

  assert.equal(engine.activateParticleSynthesizer(), true);
  assertBigEqual(engine.state.sciencePoints, 1);
  assertBigEqual(engine.state.science.totalScienceEarned, 2);
  assertBigEqual(
    engine.state.quarks.lastSynthesis,
    calculateQuarksGenerated(storedEnergy, config),
  );
});
