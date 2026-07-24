import { GameEngine } from "./engine.js";
import { formatDuration, formatEnergy } from "./formulas.js";

const DEFAULT_MAX_OFFLINE_SECONDS = 8 * 60 * 60;
const DEFAULT_STEP_SECONDS = 0.25;
const DEFAULT_MAX_STEPS = 120000;

function createSummary(offlineSeconds, simulatedSeconds, capped) {
  return {
    offlineSeconds,
    simulatedSeconds,
    capped,
    energyProduced: 0,
    energyDecayed: 0,
    overclockerEnergySpent: 0,
    netEnergy: 0,
    algorithmImprovementsCompleted: 0,
    algorithmUpgradesCompleted: 0,
    blueprintResearchCompleted: 0,
    constructionsCompleted: 0,
    purchases: {},
    events: 0
  };
}

function collectEvents(summary, events) {
  summary.events += events.length;

  for (const event of events) {
    if (event.type === "energy-collected") {
      summary.energyProduced += event.amount;
    }

    if (event.type === "energy-decayed") {
      summary.energyDecayed += event.amount;
    }

    if (event.type === "overclocker-drained") {
      summary.overclockerEnergySpent += event.amount;
    }

    if (event.type === "algorithm-improvement-completed") {
      summary.algorithmImprovementsCompleted += 1;
    }

    if (event.type === "algorithm-upgrade-completed") {
      summary.algorithmUpgradesCompleted += 1;
    }

    if (event.type === "blueprint-research-completed") {
      summary.blueprintResearchCompleted += 1;
    }

    if (event.type === "construction-completed") {
      summary.constructionsCompleted += 1;
    }

    if (event.type === "particle-synthesizer-activated") {
      summary.particleSynthesizerActivated = true;
    }

    if (event.type === "device-purchased") {
      summary.purchases[event.device] =
        (summary.purchases[event.device] ?? 0) + 1;
    }
  }
}

function applyCurrentOfflineAutomation(engine) {
  // Continuous systems belong in GameEngine.tick whenever possible. This hook is
  // where future unlocked automations should be mirrored for offline progress.
  if (
    engine.state.devices.autoCalculators > 0 &&
    !engine.state.study.active &&
    engine.state.introState === "active"
  ) {
    engine.startStudy(true);
  }
}

function writeOfflineLog(state, summary) {
  if (summary.simulatedSeconds < 1 || summary.events <= 0) return;

  const parts = [
    `${formatDuration(summary.simulatedSeconds)} recovered`,
    `+${formatEnergy(summary.netEnergy)} net`
  ];

  if (summary.algorithmImprovementsCompleted > 0) {
    parts.push(`${summary.algorithmImprovementsCompleted} Improvements`);
  }

  if (summary.algorithmUpgradesCompleted > 0) {
    parts.push(`${summary.algorithmUpgradesCompleted} Algorithm Upgrades`);
  }

  if (summary.blueprintResearchCompleted > 0) {
    parts.push("Blueprint reconstructed");
  }

  if (summary.constructionsCompleted > 0) {
    parts.push(`${summary.constructionsCompleted} CRCs completed`);
  }

  const message = `Offline recovery: ${parts.join(", ")}.`;
  state.log.unshift({
    id: `${Date.now()}-offline`,
    message,
    tone: "discovery",
    at: state.stats.runPlayTime
  });
  state.log = state.log.slice(0, 60);
}

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
  const maxOfflineSeconds =
    settings.maxOfflineSeconds ?? DEFAULT_MAX_OFFLINE_SECONDS;
  const stepSeconds = settings.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const maxSteps = settings.maxSteps ?? DEFAULT_MAX_STEPS;
  const simulatedSeconds = Math.min(offlineSeconds, maxOfflineSeconds);
  const capped = offlineSeconds > simulatedSeconds;
  const startEnergy = state.energy;
  const summary = createSummary(offlineSeconds, simulatedSeconds, capped);

  if (
    simulatedSeconds < 1 ||
    state.introState !== "active" ||
    stepSeconds <= 0 ||
    maxSteps <= 0
  ) {
    state.lastSavedAt = now;
    return summary;
  }

  const engine = new GameEngine({
    state,
    config,
    developmentMode,
    collectEvents: true,
    suppressLogs: true
  });

  let remaining = simulatedSeconds;
  let steps = 0;

  while (remaining > 0 && steps < maxSteps) {
    applyCurrentOfflineAutomation(engine);
    const delta = Math.min(stepSeconds, remaining);
    engine.tick(delta);
    collectEvents(summary, engine.consumeEvents());
    remaining -= delta;
    steps += 1;
  }

  summary.simulatedSeconds -= remaining;
  summary.netEnergy = state.energy - startEnergy;
  state.lastSavedAt = now;
  writeOfflineLog(state, summary);

  return summary;
}
