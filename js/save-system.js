import { normalizeState, SAVE_VERSION } from "./state.js";

const NORMAL_SAVE_PREFIX = "the-eternal-simulation.save";
const DEVELOPMENT_SAVE_PREFIX = "the-eternal-simulation.development";

const SAVE_MODES = [
  { id: "normal", label: "Normal", developmentMode: false },
  { id: "development", label: "Development", developmentMode: true }
];

function getSavePrefix(developmentMode) {
  return developmentMode ? DEVELOPMENT_SAVE_PREFIX : NORMAL_SAVE_PREFIX;
}

export function getSaveKey(developmentMode) {
  return `${getSavePrefix(developmentMode)}.v${SAVE_VERSION}`;
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
  try {
    const raw = localStorage.getItem(getSaveKey(developmentMode));
    return normalizeState(raw ? JSON.parse(raw) : null, config);
  } catch (error) {
    console.warn("The save could not be loaded.", error);
    return normalizeState(null, config);
  }
}

export function saveState(state, developmentMode) {
  try {
    state.lastSavedAt = Date.now();
    localStorage.setItem(getSaveKey(developmentMode), JSON.stringify(state));
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
      energy: parsed?.energy ?? null
    };
  });
}
