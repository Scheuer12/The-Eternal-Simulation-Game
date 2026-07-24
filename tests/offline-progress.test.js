import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { GameEngine } from "../js/engine.js";
import { calculateAlgorithmUpgradeRequirement } from "../js/formulas.js";
import { simulateOfflineProgress } from "../js/offline-progress.js";
import { createInitialState } from "../js/state.js";

const config = JSON.parse(
  await readFile(new URL("../config/game-config.json", import.meta.url), "utf8")
);

function createActiveState() {
  const state = createInitialState(config);
  const engine = new GameEngine({ state, config });
  engine.pressButton();
  engine.activateCrc();
  return state;
}

test("offline progress continues Auto Calculator Improvement cycles", () => {
  const now = Date.now();
  const state = createActiveState();
  state.devices.autoCalculators = 1;
  state.lastSavedAt = now - 120000;

  const summary = simulateOfflineProgress(state, config, { now });

  assert.ok(summary.algorithmImprovementsCompleted > 0);
  assert.equal(summary.algorithmUpgradesCompleted, 0);
  assert.ok(summary.energyProduced > 0);
  assert.ok(state.improvements > 0);
  assert.equal(state.lastSavedAt, now);
});

test("offline progress completes active Algorithm Upgrade studies", () => {
  const now = Date.now();
  const state = createActiveState();
  const engine = new GameEngine({ state, config });
  state.improvements = calculateAlgorithmUpgradeRequirement(state, config);

  assert.equal(engine.startAlgorithmUpgradeStudy(), true);
  state.lastSavedAt = now - 60000;

  const summary = simulateOfflineProgress(state, config, { now });

  assert.equal(summary.algorithmUpgradesCompleted, 1);
  assert.equal(state.upgrades, 1);
  assert.equal(state.improvements, 0);
});

test("offline progress summarizes overflow decay and suppresses event spam logs", () => {
  const now = Date.now();
  const state = createActiveState();
  state.energy = config.energy.powerCellCapacity * 2;
  state.lastSavedAt = now - 10000;

  const summary = simulateOfflineProgress(state, config, { now });

  assert.ok(summary.energyDecayed > 0);
  assert.equal(state.log[0].message.startsWith("Offline recovery:"), true);
  assert.equal(
    state.log.some((entry) => entry.message.includes("Algorithm Improvement")),
    false
  );
});
