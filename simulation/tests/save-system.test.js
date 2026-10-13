import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteAllStates,
  deleteState,
  getSaveBackupKey,
  getSaveKey,
  loadState,
  listSaveSlots,
  saveState,
} from "../../js/save-system.js";
import { calculateProduction } from "../../js/formulas.js";
import { SAVE_VERSION } from "../../js/state.js";
import { readFile } from "node:fs/promises";
import { assertBigEqual } from "./assertions.js";

const config = JSON.parse(
  await readFile(
    new URL("../../config/game-config.json", import.meta.url),
    "utf8",
  ),
);

function createLocalStorageMock() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

test("save keys are versioned by mode", () => {
  assert.equal(
    getSaveKey(false),
    `the-eternal-simulation.save.v${SAVE_VERSION}`,
  );
  assert.equal(
    getSaveKey(true),
    `the-eternal-simulation.development.v${SAVE_VERSION}`,
  );
});

test("reset removes all saves for the current mode only", () => {
  globalThis.localStorage = createLocalStorageMock();

  localStorage.setItem("the-eternal-simulation.save.v1", "{}");
  localStorage.setItem("the-eternal-simulation.save.v2", "{}");
  localStorage.setItem("the-eternal-simulation.development.v1", "{}");

  deleteState(false);

  assert.equal(localStorage.getItem("the-eternal-simulation.save.v1"), null);
  assert.equal(localStorage.getItem("the-eternal-simulation.save.v2"), null);
  assert.equal(
    localStorage.getItem("the-eternal-simulation.development.v1"),
    "{}",
  );
});

test("reset all removes normal and development saves", () => {
  globalThis.localStorage = createLocalStorageMock();

  localStorage.setItem("the-eternal-simulation.save.v2", "{}");
  localStorage.setItem("the-eternal-simulation.development.v2", "{}");

  deleteAllStates();

  assert.equal(localStorage.getItem("the-eternal-simulation.save.v2"), null);
  assert.equal(
    localStorage.getItem("the-eternal-simulation.development.v2"),
    null,
  );
});

test("save writes to the current versioned key", () => {
  globalThis.localStorage = createLocalStorageMock();
  const state = { saveVersion: SAVE_VERSION, lastSavedAt: 0 };

  saveState(state, false);

  assert.ok(localStorage.getItem(getSaveKey(false)));
  assert.ok(state.lastSavedAt > 0);
});

test("saving preserves the previous snapshot as a recoverable backup", () => {
  globalThis.localStorage = createLocalStorageMock();
  const previous = JSON.stringify({
    saveVersion: SAVE_VERSION,
    introState: "active",
    energy: 42,
  });
  localStorage.setItem(getSaveKey(false), previous);

  saveState({ saveVersion: SAVE_VERSION, energy: 43 }, false);

  assert.equal(localStorage.getItem(getSaveBackupKey(false)), previous);
  assert.equal(JSON.parse(localStorage.getItem(getSaveKey(false))).energy, 43);
});

test("loading restores a valid backup when the current save is malformed", () => {
  globalThis.localStorage = createLocalStorageMock();
  const backup = JSON.stringify({
    saveVersion: SAVE_VERSION,
    introState: "active",
    energy: 42,
    improvements: 7,
  });
  localStorage.setItem(getSaveKey(false), "{invalid json");
  localStorage.setItem(getSaveBackupKey(false), backup);

  const state = loadState(config, false);

  assert.equal(state.introState, "active");
  assertBigEqual(state.energy, 42);
  assert.equal(state.improvements, 7);
  const restored = JSON.parse(localStorage.getItem(getSaveKey(false)));
  assert.equal(restored.energy, "42");
  assert.equal(restored.improvements, 7);
  assert.equal(localStorage.getItem(getSaveBackupKey(false)), backup);
});

test("loading reconstructs a null Improvement multiplier instead of freezing production", () => {
  globalThis.localStorage = createLocalStorageMock();
  localStorage.setItem(
    getSaveKey(false),
    JSON.stringify({
      saveVersion: SAVE_VERSION,
      introState: "active",
      energy: 0,
      crcCount: 10,
      improvements: 40,
      improvementMultiplier: null,
    }),
  );

  const state = loadState(config, false);

  assert.ok(state.improvementMultiplier.gt(1));
  assert.ok(calculateProduction(state, config).gt(0));
});

test("loading rolls back non-finite production state while retaining large-number production", () => {
  globalThis.localStorage = createLocalStorageMock();
  const backup = JSON.stringify({
    saveVersion: SAVE_VERSION,
    introState: "active",
    energy: 0,
    crcCount: 10,
    improvements: 40,
    improvementMultiplier: null,
    upgrades: 350,
    devices: { autoCalculators: 4, processors: 7 },
  });
  localStorage.setItem(
    getSaveKey(false),
    JSON.stringify({
      saveVersion: SAVE_VERSION,
      introState: "active",
      energy: null,
      crcCount: 10,
      improvements: 40,
      improvementMultiplier: Number.MAX_VALUE,
      stats: { totalEnergyCollected: null },
    }),
  );
  localStorage.setItem(getSaveBackupKey(false), backup);

  const state = loadState(config, false);
  const restored = JSON.parse(localStorage.getItem(getSaveKey(false)));

  assertBigEqual(state.energy, 0);
  assert.equal(state.devices.autoCalculators, 4);
  assert.equal(state.devices.processors, 7);
  assert.ok(state.improvementMultiplier.gt(1));
  assert.ok(state.improvementMultiplier.isFinite());
  assert.ok(calculateProduction(state, config).isFinite());
  assert.ok(calculateProduction(state, config).gt(1e99));
  assert.equal(restored.energy, "0");
  assert.equal(localStorage.getItem(getSaveBackupKey(false)), backup);
});

test("loading a legacy Matrix Mechanics save persists Redundancy ownership without refunding SP", () => {
  globalThis.localStorage = createLocalStorageMock();
  localStorage.setItem(
    getSaveKey(false),
    JSON.stringify({
      saveVersion: SAVE_VERSION,
      sciencePoints: 0,
      science: { matrixMechanics: true, totalScienceEarned: 1 },
    }),
  );

  const state = loadState(config, false);
  const persisted = JSON.parse(localStorage.getItem(getSaveKey(false)));

  assert.equal(state.sciencePoints, 0);
  assert.equal(state.science.perks.redundancyElimination, true);
  assert.equal(persisted.sciencePoints, 0);
  assert.equal(persisted.science.perks.redundancyElimination, true);
  assert.equal("matrixMechanics" in persisted.science, false);
});

test("save slots expose normal and development metadata", () => {
  globalThis.localStorage = createLocalStorageMock();
  localStorage.setItem(
    getSaveKey(false),
    JSON.stringify({
      lastSavedAt: 123,
      energy: 4,
      stats: { totalPlayTime: 56 },
    }),
  );

  const slots = listSaveSlots();

  assert.equal(slots.length, 2);
  assert.equal(slots[0].id, "normal");
  assert.equal(slots[0].exists, true);
  assert.equal(slots[0].lastSavedAt, 123);
  assert.equal(slots[1].id, "development");
  assert.equal(slots[1].exists, false);
});

