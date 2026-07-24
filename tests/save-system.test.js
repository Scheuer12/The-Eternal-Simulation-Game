import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteAllStates,
  deleteState,
  getSaveKey,
  listSaveSlots,
  saveState
} from "../js/save-system.js";
import { SAVE_VERSION } from "../js/state.js";

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
    }
  };
}

test("save keys are versioned by mode", () => {
  assert.equal(getSaveKey(false), `the-eternal-simulation.save.v${SAVE_VERSION}`);
  assert.equal(
    getSaveKey(true),
    `the-eternal-simulation.development.v${SAVE_VERSION}`
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
    "{}"
  );
});

test("reset all removes normal and development saves", () => {
  globalThis.localStorage = createLocalStorageMock();

  localStorage.setItem("the-eternal-simulation.save.v2", "{}");
  localStorage.setItem("the-eternal-simulation.development.v2", "{}");

  deleteAllStates();

  assert.equal(localStorage.getItem("the-eternal-simulation.save.v2"), null);
  assert.equal(localStorage.getItem("the-eternal-simulation.development.v2"), null);
});

test("save writes to the current versioned key", () => {
  globalThis.localStorage = createLocalStorageMock();
  const state = { saveVersion: SAVE_VERSION, lastSavedAt: 0 };

  saveState(state, false);

  assert.ok(localStorage.getItem(getSaveKey(false)));
  assert.ok(state.lastSavedAt > 0);
});

test("save slots expose normal and development metadata", () => {
  globalThis.localStorage = createLocalStorageMock();
  localStorage.setItem(
    getSaveKey(false),
    JSON.stringify({
      lastSavedAt: 123,
      energy: 4,
      stats: { totalPlayTime: 56 }
    })
  );

  const slots = listSaveSlots();

  assert.equal(slots.length, 2);
  assert.equal(slots[0].id, "normal");
  assert.equal(slots[0].exists, true);
  assert.equal(slots[0].lastSavedAt, 123);
  assert.equal(slots[1].id, "development");
  assert.equal(slots[1].exists, false);
});
