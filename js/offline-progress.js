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
  const startAImp = state.algorithms?.AImp?.owned ?? 0;
  const startAUpg = state.algorithms?.AUpg?.owned ?? 0;
  const startARec = state.algorithms?.ARec?.owned ?? 0;
  const startTotalEnergy = big(state.stats?.totalEnergyProduced ?? 0);

  if (simulatedSeconds < 1 || stepSeconds <= 0 || maxSteps <= 0) {
    state.lastSavedAt = now;
    return {
      offlineSeconds,
      simulatedSeconds: 0,
      capped,
      startEnergy,
      endEnergy: startEnergy,
      netEnergy: big(0),
      totalEnergyProduced: big(0),
      studiesCompleted: {
        AImp: 0,
        AUpg: 0,
        ARec: 0,
      },
      algorithmImprovementsCompleted: 0,
      algorithmUpgradesCompleted: 0,
      algorithmRefactoringsCompleted: 0,
      energyProduced: big(0),
    };
  }

  const engine = new GameEngine({
    state,
    config,
    developmentMode,
    enableAutosave: false,
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
  const netEnergy = big(engine.state.energy ?? 0).sub(startEnergy);
  const totalEnergyProduced = big(engine.state.stats?.totalEnergyProduced ?? 0).sub(startTotalEnergy);
  const diffAImp = Math.max(0, (engine.state.algorithms?.AImp?.owned ?? 0) - startAImp);
  const diffAUpg = Math.max(0, (engine.state.algorithms?.AUpg?.owned ?? 0) - startAUpg);
  const diffARec = Math.max(0, (engine.state.algorithms?.ARec?.owned ?? 0) - startARec);

  // Sync chip timers back into state
  if (engine.state.devices?.chips) {
    if (!engine.state.devices.chips.timers) engine.state.devices.chips.timers = {};
    engine.state.devices.chips.timers.AImp = engine.chipTimers.AImp;
    engine.state.devices.chips.timers.AUpg = engine.chipTimers.AUpg;
    engine.state.devices.chips.timers.ARec = engine.chipTimers.ARec;
  }

  // Synchronize the simulated engine state into the persistent state object
  Object.assign(state, engine.state);
  state.lastSavedAt = now;

  const summary = {
    offlineSeconds,
    simulatedSeconds: actualSimulated,
    capped,
    startEnergy,
    endEnergy: state.energy,
    netEnergy,
    totalEnergyProduced,
    studiesCompleted: {
      AImp: diffAImp,
      AUpg: diffAUpg,
      ARec: diffARec,
    },
    algorithmImprovementsCompleted: diffAImp,
    algorithmUpgradesCompleted: diffAUpg,
    algorithmRefactoringsCompleted: diffARec,
    energyProduced: totalEnergyProduced,
  };
  state.lastOfflineSummary = summary;

  if (actualSimulated >= 1 && Array.isArray(state.log)) {
    const parts = [];
    if (diffAImp > 0) parts.push(`+${diffAImp} AImp`);
    if (diffAUpg > 0) parts.push(`+${diffAUpg} AUpg`);
    if (diffARec > 0) parts.push(`+${diffARec} ARec`);
    const studiesStr = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    state.log.unshift({
      id: `${now}-offline`,
      message: `Offline simulation: ${formatDuration(actualSimulated)} recovered, +${formatEnergy(netEnergy)} net energy${studiesStr}.`,
      tone: "discovery",
      at: state.stats?.runPlayTime ?? 0,
    });
    state.log = state.log.slice(0, 60);
  }

  return summary;
}
