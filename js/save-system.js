import { normalizeState, SAVE_VERSION } from "./state.js";
import { isValidBig } from "./numeric.js";

const NORMAL_SAVE_PREFIX = "the-eternal-simulation.save";
const DEVELOPMENT_SAVE_PREFIX = "the-eternal-simulation.development";

const SAVE_MODES = [
  { id: "normal", label: "Normal", developmentMode: false },
  { id: "development", label: "Development", developmentMode: true },
];

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

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }

  return keys;
}

export function loadState(config, developmentMode) {
  const saveKey = getSaveKey(developmentMode);
  try {
    const primaryRaw = localStorage.getItem(saveKey);
    const backupRaw = localStorage.getItem(getSaveBackupKey(developmentMode));
    let primaryCandidate = null;
    try {
      primaryCandidate = primaryRaw ? JSON.parse(primaryRaw) : null;
    } catch {
      // The backup is tried first when the primary JSON cannot be parsed.
    }
    const primaryNeedsRecovery =
      primaryCandidate?.saveVersion === SAVE_VERSION &&
      (!isValidBig(primaryCandidate.energy) ||
        !isValidBig(primaryCandidate.improvementMultiplier, {
          positive: true,
        }) ||
        !isValidBig(primaryCandidate.stats?.totalEnergyCollected));
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
        if (candidate?.saveVersion !== SAVE_VERSION) continue;

        const state = normalizeState(candidate, config);
        if (isBackup) {
          // Restore the known-good snapshot before any later autosave can run.
          localStorage.setItem(saveKey, JSON.stringify(state));
        }
        if (candidate?.science?.matrixMechanics) {
          saveState(state, developmentMode);
        }
        return state;
      } catch (error) {
        console.warn(
          isBackup
            ? "The backup save could not be loaded."
            : "The save could not be loaded; trying its backup.",
          error,
        );
      }
    }

    return normalizeState(null, config);
  } catch (error) {
    console.warn("The save could not be accessed.", error);
    return normalizeState(null, config);
  }
}

export function saveState(state, developmentMode) {
  try {
    state.lastSavedAt = Date.now();
    const saveKey = getSaveKey(developmentMode);
    const serialized = JSON.stringify(state);
    const previous = localStorage.getItem(saveKey);
    if (previous) {
      try {
        localStorage.setItem(getSaveBackupKey(developmentMode), previous);
      } catch (error) {
        console.warn("The previous save could not be backed up.", error);
      }
    }
    localStorage.setItem(saveKey, serialized);
  } catch (error) {
    console.warn("The save could not be written.", error);
  }
}

export function deleteState(developmentMode) {
  try {
    for (const key of getSaveKeysForMode(developmentMode)) {
      localStorage.removeItem(key);
    }
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
  return SAVE_MODES.map((mode) => {
    const key = getSaveKey(mode.developmentMode);
    const raw = localStorage.getItem(key);
    let parsed = null;

    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {
      parsed = null;
    }

    return {
      ...mode,
      key,
      exists: Boolean(raw),
      lastSavedAt: parsed?.lastSavedAt ?? null,
      totalPlayTime: parsed?.stats?.totalPlayTime ?? null,
      energy: parsed?.energy ?? null,
    };
  });
}
