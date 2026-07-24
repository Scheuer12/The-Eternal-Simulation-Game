export const SAVE_VERSION = 2;

export function createInitialState(config) {
  return {
    saveVersion: SAVE_VERSION,
    introState: "choice",
    energy: 0,
    peakEnergy: 0,
    powerCells: config.energy.initialPowerCells,
    improvements: 0,
    improvementMultiplier: 1,
    upgrades: 0,
    calculationMethods: 0,
    setupOptimizations: 0,
    sciencePoints: 0,
    science: {
      matrixMechanics: false,
      syntheses: 0
    },
    crcCount: config.energy.initialCrcCount,
    powerModules: 0,
    particleSynthesizer: {
      activated: false
    },
    ui: {
      activeTab: "devices",
      hideCompletedPurchases: false,
      seenComponents: {}
    },
    devices: {
      softDataDisplay: false,
      t2SoftDataDisplay: false,
      autoCalculators: 0,
      processors: 0,
      overclockers: 0
    },
    overclocker: {
      active: false,
      activeSeconds: 0
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
    algorithmUpgradeStudy: {
      active: false,
      elapsed: 0,
      duration: 0
    },
    blueprintStudy: {
      active: false,
      elapsed: 0,
      duration: 0
    },
    construction: {
      active: false,
      elapsed: 0,
      duration: 0
    },
    devSettings: {
      productionMultiplier: config.development.productionMultiplier,
      durationMultiplier: config.development.durationMultiplier
    },
    prototypeComplete: false,
    stats: {
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

  const devices = {
    ...initial.devices,
    ...candidate.devices,
    autoCalculators:
      candidate.devices?.autoCalculators ??
      (candidate.devices?.autoCalculator ? 1 : 0),
    processors:
      candidate.devices?.processors ??
      (candidate.devices?.processor ? 1 : 0),
    overclockers:
      candidate.devices?.overclockers ??
      (candidate.devices?.overclocker ? 1 : 0)
  };

  delete devices.autoCalculator;
  delete devices.processor;
  delete devices.overclocker;

  return {
    ...initial,
    ...candidate,
    powerCells: Math.max(
      initial.powerCells,
      Number.isFinite(candidate.powerCells) ? candidate.powerCells : initial.powerCells
    ),
    powerModules:
      Number.isFinite(candidate.powerModules) ? candidate.powerModules : 0,
    particleSynthesizer: {
      ...initial.particleSynthesizer,
      ...candidate.particleSynthesizer
    },
    ui: {
      ...initial.ui,
      ...candidate.ui,
      seenComponents: {
        ...initial.ui.seenComponents,
        ...candidate.ui?.seenComponents
      }
    },
    setupOptimizations:
      candidate.setupOptimizations ?? candidate.compressionProtocols ?? 0,
    sciencePoints:
      Number.isFinite(candidate.sciencePoints) ? candidate.sciencePoints : 0,
    science: {
      ...initial.science,
      ...candidate.science
    },
    devices,
    discoveries: { ...initial.discoveries, ...candidate.discoveries },
    study: { ...initial.study, ...candidate.study },
    algorithmUpgradeStudy: {
      ...initial.algorithmUpgradeStudy,
      ...candidate.algorithmUpgradeStudy
    },
    blueprintStudy: { ...initial.blueprintStudy, ...candidate.blueprintStudy },
    construction: { ...initial.construction, ...candidate.construction },
    overclocker: { ...initial.overclocker, ...candidate.overclocker },
    devSettings: { ...initial.devSettings, ...candidate.devSettings },
    stats: { ...initial.stats, ...candidate.stats },
    log: Array.isArray(candidate.log) ? candidate.log.slice(0, 60) : []
  };
}
