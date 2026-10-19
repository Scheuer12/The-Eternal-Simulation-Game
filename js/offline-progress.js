import { GameEngine } from "./engine.js";
import { formatDuration, formatEnergy } from "./numeric.js";
import { big } from "./numeric.js";

const DEFAULT_MAX_OFFLINE_SECONDS = 8 * 60 * 60;
const DEFAULT_STEP_SECONDS = 0.25;
const DEFAULT_MAX_STEPS = 120000;

export function simulateOfflineProgress(
  state,
  config,
  { developmentMode = false, now = Date.now() } = {}
) {
  const lastSavedAt = Number(state.lastSavedAt);
  const offlineSeconds = Number.isFinite(lastSavedAt)
    ? Math.max(0, (now - lastSavedAt) / 1000)
    : 0;

  const settings = config.offlineProgress ?? {};
  const maxOfflineSeconds = settings.maxOfflineSeconds ?? DEFAULT_MAX_OFFLINE_SECONDS;
  const stepSeconds = settings.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const maxSteps = settings.maxSteps ?? DEFAULT_MAX_STEPS;
  const simulatedSeconds = Math.min(offlineSeconds, maxOfflineSeconds);
  const capped = offlineSeconds > simulatedSeconds;
  const startEnergy = big(state.energy ?? 0);

  if (simulatedSeconds < 1 || stepSeconds <= 0 || maxSteps <= 0) {
    state.lastSavedAt = now;
    return {
      offlineSeconds,
      simulatedSeconds: 0,
      capped,
      netEnergy: big(0),
    };
  }

  const engine = new GameEngine({
    state,
    config,
    developmentMode,
  });

  let remaining = simulatedSeconds;
  let steps = 0;

  while (remaining > 0 && steps < maxSteps) {
    const delta = Math.min(stepSeconds, remaining);
    engine.tick(delta);
    remaining -= delta;
    steps += 1;
  }

  const actualSimulated = simulatedSeconds - remaining;
  const netEnergy = big(state.energy ?? 0).sub(startEnergy);
  state.lastSavedAt = now;

  if (actualSimulated >= 1 && Array.isArray(state.log)) {
    state.log.unshift({
      id: `${Date.now()}-offline`,
      message: `Offline recovery: ${formatDuration(actualSimulated)} recovered, +${formatEnergy(netEnergy)} net.`,
      tone: "discovery",
      at: state.stats?.runPlayTime ?? 0,
    });
    state.log = state.log.slice(0, 60);
  }

  return {
    offlineSeconds,
    simulatedSeconds: actualSimulated,
    capped,
    netEnergy,
  };
}
