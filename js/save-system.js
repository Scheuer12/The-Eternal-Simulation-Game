import { normalizeState } from "./state.js";

const NORMAL_SAVE_KEY = "the-eternal-simulation.save.v1";
const DEVELOPMENT_SAVE_KEY = "the-eternal-simulation.development.v1";

export function getSaveKey(developmentMode) {
  return developmentMode ? DEVELOPMENT_SAVE_KEY : NORMAL_SAVE_KEY;
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
    localStorage.removeItem(getSaveKey(developmentMode));
  } catch (error) {
    console.warn("The save could not be deleted.", error);
  }
}
