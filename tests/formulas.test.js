import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateImprovementBonus,
  calculateProduction,
  calculateUpgradeChance
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

test("upgrade probability respects its absolute minimum", () => {
  assert.equal(calculateUpgradeChance(1e12, config), 0.0001);
  assert.equal(calculateUpgradeChance(0, config), 0.1);
});

test("each Algorithm Upgrade doubles production", () => {
  const state = createInitialState(config);
  const base = calculateProduction(state, config);
  state.upgrades = 4;
  assert.equal(calculateProduction(state, config), base * 16);
});

