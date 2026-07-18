export const SAVE_VERSION = 1;

export function createInitialState(config) {
  return {
    saveVersion: SAVE_VERSION,
    introState: "choice",
    energy: 0,
    peakEnergy: 0,
    improvements: 0,
    improvementMultiplier: 1,
    upgrades: 0,
    crcCount: config.energy.initialCrcCount,
    devices: {
      autoCalculator: false,
      processor: false
    },
    discoveries: {
      crcBlueprint: false,
      blueprintSource: null
    },
    study: {
      active: false,
      elapsed: 0,
      duration: 0,
      automated: false
    },
    construction: {
      active: false,
      elapsed: 0,
      duration: 0
    },
    prototypeComplete: false,
    stats: {
      manualCondensingCount: 0,
      totalEnergyCollected: 0,
      totalPlayTime: 0,
      runPlayTime: 0
    },
    log: [],
    lastSavedAt: Date.now()
  };
}

export function normalizeState(candidate, config) {
  const initial = createInitialState(config);

  if (!candidate || candidate.saveVersion !== SAVE_VERSION) {
    return initial;
  }

  return {
    ...initial,
    ...candidate,
    devices: { ...initial.devices, ...candidate.devices },
    discoveries: { ...initial.discoveries, ...candidate.discoveries },
    study: { ...initial.study, ...candidate.study },
    construction: { ...initial.construction, ...candidate.construction },
    stats: { ...initial.stats, ...candidate.stats },
    log: Array.isArray(candidate.log) ? candidate.log.slice(0, 60) : []
  };
}

