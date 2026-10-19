/**
 * save-system.js
 * Robust persistence and snapshot facilities for The Eternal Simulation.
 * Supports primary saves, automatic backups, recovery, Quicksave / Quick Restore.
 */

import { normalizeState, serializeState, SAVE_VERSION } from "./state.js";
import { isValidBig } from "./numeric.js";

const NORMAL_SAVE_PREFIX = "the-eternal-simulation.save";
const DEVELOPMENT_SAVE_PREFIX = "the-eternal-simulation.development";
const QUICKSAVE_KEY = "the-eternal-simulation.quicksave";

const SAVE_MODES = [
  { id: "normal", label: "Normal", developmentMode: false },
  { id: "development", label: "Development", developmentMode: true },
];

const memoryStorage = new Map();
export function getStorage() {
  if (typeof localStorage !== "undefined") return localStorage;
  return {
    getItem: (key) => memoryStorage.get(key) ?? null,
    setItem: (key, val) => memoryStorage.set(key, String(val)),
    removeItem: (key) => memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
    key: (index) => Array.from(memoryStorage.keys())[index] ?? null,
    get length() {
      return memoryStorage.size;
    },
  };
}

function getSavePrefix(developmentMode) {
  return developmentMode ? DEVELOPMENT_SAVE_PREFIX : NORMAL_SAVE_PREFIX;
}

export function getSaveKey(developmentMode) {
  return `${getSavePrefix(developmentMode)}.v${SAVE_VERSION}`;
}

export function getSaveBackupKey(developmentMode) {
  return `${getSaveKey(developmentMode)}.backup`;
}

function getSaveKeysForMode(developmentMode) {
  const prefix = `${getSavePrefix(developmentMode)}.v`;
  const keys = [];
  const storage = getStorage();

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }

  return keys;
}

export function loadState(config, developmentMode) {
  const storage = getStorage();
  const saveKey = getSaveKey(developmentMode);
  try {
    const primaryRaw = storage.getItem(saveKey);
    const backupRaw = storage.getItem(getSaveBackupKey(developmentMode));
    let primaryCandidate = null;
    try {
      primaryCandidate = primaryRaw ? JSON.parse(primaryRaw) : null;
    } catch {
      // The backup is tried first when the primary JSON cannot be parsed.
    }

    const primaryNeedsRecovery =
      primaryCandidate?.saveVersion === SAVE_VERSION &&
      !isValidBig(primaryCandidate.energy);

    const candidates = primaryNeedsRecovery
      ? [
          [backupRaw, true],
          [primaryRaw, false],
        ]
      : [
          [primaryRaw, false],
          [backupRaw, true],
        ];

    for (const [raw, isBackup] of candidates) {
      if (!raw) continue;

      try {
        const candidate = JSON.parse(raw);
        if (candidate?.saveVersion === SAVE_VERSION) {
          const state = normalizeState(candidate, config);
          if (isBackup) {
            storage.setItem(saveKey, serializeState(state));
          }
          return state;
        }
      } catch (error) {
        console.warn(
          isBackup
            ? "The backup save could not be loaded."
            : "The save could not be loaded; trying its backup.",
          error,
        );
      }
    }

    // Check for previous save versions and migrate seamlessly
    for (let v = SAVE_VERSION - 1; v >= 1; v -= 1) {
      const legacyKey = `${getSavePrefix(developmentMode)}.v${v}`;
      const legacyBackupKey = `${legacyKey}.backup`;
      for (const key of [legacyKey, legacyBackupKey]) {
        const raw = storage.getItem(key);
        if (!raw) continue;
        try {
          const candidate = JSON.parse(raw);
          if (candidate?.saveVersion && candidate.saveVersion < SAVE_VERSION) {
            const state = normalizeState(candidate, config);
            storage.setItem(saveKey, serializeState(state));
            return state;
          }
        } catch (error) {
          console.warn(`Legacy save ${key} could not be parsed.`, error);
        }
      }
    }

    return normalizeState(null, config);
  } catch (error) {
    console.warn("The save could not be accessed.", error);
    return normalizeState(null, config);
  }
}

export function saveState(state, developmentMode) {
  const storage = getStorage();
  try {
    if (!state.stats) state.stats = {};
    state.lastSavedAt = Date.now();
    const saveKey = getSaveKey(developmentMode);
    const serialized = serializeState(state);
    const previous = storage.getItem(saveKey);
    if (previous) {
      try {
        storage.setItem(getSaveBackupKey(developmentMode), previous);
      } catch (error) {
        console.warn("The previous save could not be backed up.", error);
      }
    }
    storage.setItem(saveKey, serialized);
  } catch (error) {
    console.warn("The save could not be written.", error);
  }
}

export function deleteState(developmentMode) {
  const storage = getStorage();
  try {
    for (const key of getSaveKeysForMode(developmentMode)) {
      storage.removeItem(key);
    }
    storage.removeItem(getSaveBackupKey(developmentMode));
  } catch (error) {
    console.warn("The save could not be deleted.", error);
  }
}

export function deleteAllStates() {
  for (const mode of SAVE_MODES) {
    deleteState(mode.developmentMode);
  }
}

export function listSaveSlots() {
  const storage = getStorage();
  return SAVE_MODES.map((mode) => {
    const key = getSaveKey(mode.developmentMode);
    const raw = storage.getItem(key);
    let parsed = null;

    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    return {
      ...mode,
      key,
      exists: Boolean(raw),
      lastSavedAt: parsed?.lastSavedAt ?? null,
      totalPlayTime: parsed?.stats?.gameTime ?? null,
      energy: parsed?.energy ?? null,
    };
  });
}

// ----------------------------------------------------------------------------
// Quicksave & Quick Restore
// ----------------------------------------------------------------------------

export function quicksaveState(state) {
  if (!state) return false;
  const storage = getStorage();
  try {
    const serialized = serializeState(state);
    storage.setItem(QUICKSAVE_KEY, serialized);
    return true;
  } catch (err) {
    console.error("Quicksave failed:", err);
    return false;
  }
}

export function loadQuicksaveState(config) {
  const storage = getStorage();
  try {
    const raw = storage.getItem(QUICKSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeState(parsed, config);
  } catch (err) {
    console.error("Quick Restore failed:", err);
    return null;
  }
}

export function hasQuicksaveState() {
  const storage = getStorage();
  return Boolean(storage.getItem(QUICKSAVE_KEY));
}
