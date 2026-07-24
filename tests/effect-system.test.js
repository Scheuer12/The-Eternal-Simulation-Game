import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyProductionEffects,
  getProductionEffects
} from "../js/effect-system.js";
import { calculateProduction } from "../js/formulas.js";
import { createInitialState } from "../js/state.js";

const config = JSON.parse(
  await readFile(new URL("../config/game-config.json", import.meta.url), "utf8")
);

test("production effects reproduce the current production formula", () => {
  const state = createInitialState(config);
  state.crcCount = 3;
  state.improvementMultiplier = 12;
  state.upgrades = 2;

  const effects = getProductionEffects(state, config);

  assert.equal(
    applyProductionEffects(effects),
    calculateProduction(state, config)
  );
  assert.deepEqual(
    effects.map((effect) => effect.id),
    [
      "base-crc-production",
      "crc-count",
      "algorithm-improvements",
      "algorithm-upgrades"
    ]
  );
});
