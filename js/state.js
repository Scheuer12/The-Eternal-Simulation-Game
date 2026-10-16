import {
  getSciencePerkStoredEnergyRequirement,
  SCIENCE_PERKS,
} from "./science-perks.js";
import {
  createAutomationState,
  inferUnlockedAutomations,
} from "./automations.js";
import { calculateImprovementBonus, calculateStudyDuration } from "./formulas.js";
import { big } from "./numeric.js";

export const SAVE_VERSION = 3;

export function createInitialState(config) {
  return {
    saveVersion: SAVE_VERSION,
    introState: "choice",
    energy: big(0),
    peakEnergy: big(0),
    powerCells: config.energy.initialPowerCells,
    improvements: 0,
    improvementMultiplier: big(1),
    preservedImprovementLog: big(0),
    upgrades: 0,
    calculationMethods: 0,
    setupOptimizations: 0,
    sciencePoints: 0,
    science: {
      fiftyGCalculator: false,
      perks: {},
      revealedPerks: Object.fromEntries(
        SCIENCE_PERKS.filter(
          (perk) => getSciencePerkStoredEnergyRequirement(perk, config) > 0,
        ).map((perk) => [perk.id, false]),
      ),
      syntheses: 0,
      totalScienceEarned: 0,
    },
    quarks: {
      available: big(0),
      totalEarned: big(0),
      lastSynthesis: big(0),
    },
    scienceDevices: {
      quarkCages: 0,
    },
    crcCount: config.energy.initialCrcCount,
    powerModules: 0,
    particleSynthesizer: {
      activated: false,
      awakened: false,
    },
    ui: {
      activeTab: "energy",
      activeScienceSubtab: "tree",
      buyMode: "1",
      historyFilter: "all",
      treeZoom: 1.0,
      selectedSciencePerkId: null,
      resetModal: null,
      historyModalEntry: null,
      particleSynthesisModal: null,
      synthesizerAwakenedModal: false,
      hideCompletedPurchases: false,
      seenComponents: {},
      newsDismissed: false,
      currentNewsId: null,
      newsTimer: 0,
      newsHovered: false,
    },
    devices: {
      softDataDisplay: false,
      t2SoftDataDisplay: false,
      autoCalculators: 0,
      processors: 0,
      overclockers: 0,
    },
    overclocker: {
      active: false,
      activeSeconds: 0,
    },
    automations: createAutomationState(),
    discoveries: {
      crcBlueprint: false,
      blueprintSource: null,
      overclockerBlueprint: false,
    },
    study: {
      active: false,
      elapsed: 0,
      duration: 0,
      automated: false,
      completedAt: null,
    },
    algorithmUpgradeStudy: {
      active: false,
      elapsed: 0,
      duration: 0,
      automated: false,
    },
    blueprintStudy: {
      active: false,
      elapsed: 0,
      duration: 0,
    },
    overclockerBlueprintStudy: {
      active: false,
      elapsed: 0,
      duration: 0,
    },
    construction: {
      active: false,
      elapsed: 0,
      duration: 0,
    },
    devSettings: {
      productionMultiplier: config.development.productionMultiplier,
      durationMultiplier: config.development.durationMultiplier,
    },
    prototypeComplete: false,
    stats: {
      totalEnergyCollected: big(0),
      totalPlayTime: 0,
      runPlayTime: 0,
    },
    log: [],
    history: [],
    lastSavedAt: Date.now(),
  };
}

export function migrateSaveV2ToV3(candidate, config) {
  if (!candidate) return createInitialState(config);

  const initial = createInitialState(config);
  const migrated = { ...candidate };
  migrated.saveVersion = SAVE_VERSION;

  // 1. Improvements and linear multiplier
  const improvements = Math.max(
    0,
    Number.isFinite(candidate.improvements) ? candidate.improvements : 0,
  );
  migrated.improvements = improvements;
  migrated.improvementMultiplier = big(1 + improvements);
  delete migrated.preservedImprovementLog;

  // 2. Science perks: storedEnergyPreservation -> powerCellResonance, matrixMechanics -> redundancyElimination
  const candidateScience = candidate.science ? { ...candidate.science } : {};
  const perks = candidateScience.perks ? { ...candidateScience.perks } : {};
  if (perks.storedEnergyPreservation) {
    perks.powerCellResonance = true;
    delete perks.storedEnergyPreservation;
  }
  if (candidateScience.matrixMechanics) {
    perks.redundancyElimination = true;
    delete candidateScience.matrixMechanics;
  }
  candidateScience.perks = perks;
  migrated.science = candidateScience;

  // 3. Active studies: migrate by percentage completed
  if (candidate.study?.active && candidate.study?.duration > 0) {
    const elapsed = Math.max(0, candidate.study.elapsed ?? 0);
    const pct = Math.min(1, elapsed / candidate.study.duration);
    const tempState = { ...migrated, ...candidate };
    const newDuration = calculateStudyDuration(tempState, config);
    migrated.study = {
      ...candidate.study,
      duration: newDuration,
      elapsed: pct * newDuration,
    };
  }

  // 4. Tab mapping
  const tabMapping = {
    hardware: "energy",
    devices: "energy",
    studies: "energy",
    energy: "energy",
    automation: "automation",
    automations: "automation",
    measure: "automation",
    statistics: "automation",
    science: "science",
    history: "history",
  };
  const activeTab = candidate.ui?.activeTab;
  migrated.ui = {
    ...initial.ui,
    ...candidate.ui,
    activeTab: tabMapping[activeTab] ?? "energy",
  };

  migrated.history = Array.isArray(candidate.history)
    ? [...candidate.history]
    : [];

  // 5. Discoveries
  migrated.discoveries = {
    ...initial.discoveries,
    ...candidate.discoveries,
    overclockerBlueprint: Boolean(candidate.discoveries?.overclockerBlueprint),
  };
  migrated.overclockerBlueprintStudy = {
    ...initial.overclockerBlueprintStudy,
    ...candidate.overclockerBlueprintStudy,
  };

  return migrated;
}

export function normalizeState(candidate, config) {
  const initial = createInitialState(config);

  if (!candidate) {
    return initial;
  }

  if (candidate.saveVersion && candidate.saveVersion < SAVE_VERSION) {
    candidate = migrateSaveV2ToV3(candidate, config);
  } else if (candidate.saveVersion !== SAVE_VERSION) {
    return initial;
  }

  const tabMapping = {
    hardware: "energy",
    devices: "energy",
    studies: "energy",
    energy: "energy",
    automation: "automation",
    automations: "automation",
    measure: "automation",
    statistics: "automation",
    science: "science",
    history: "history",
  };

  const devices = {
    ...initial.devices,
    ...candidate.devices,
    autoCalculators:
      candidate.devices?.autoCalculators ??
      (candidate.devices?.autoCalculator ? 1 : 0),
    processors:
      candidate.devices?.processors ?? (candidate.devices?.processor ? 1 : 0),
    overclockers:
      candidate.devices?.overclockers ??
      (candidate.devices?.overclocker ? 1 : 0),
  };

  delete devices.autoCalculator;
  delete devices.processor;
  delete devices.overclocker;

  let improvementMultiplier = big(candidate.improvementMultiplier);
  if (improvementMultiplier.lte(0)) {
    const completedImprovements = Number.isSafeInteger(candidate.improvements)
      ? Math.max(0, candidate.improvements)
      : 0;
    improvementMultiplier = big(1 + completedImprovements);
  }

  const { matrixMechanics: legacyMatrixMechanics, ...candidateScience } =
    candidate.science ?? {};
  const candidatePerks = candidateScience.perks ?? {};
  const revealedPerks = {
    ...initial.science.revealedPerks,
    ...candidateScience.revealedPerks,
  };
  for (const perk of SCIENCE_PERKS) {
    const threshold = getSciencePerkStoredEnergyRequirement(perk, config);
    if (threshold > 0 && big(candidate.energy).gte(threshold)) {
      revealedPerks[perk.id] = true;
    }
  }

  return {
    ...initial,
    ...candidate,
    energy: big(candidate.energy).gte(0) ? big(candidate.energy) : big(0),
    peakEnergy: big(candidate.peakEnergy).gte(0)
      ? big(candidate.peakEnergy)
      : big(0),
    improvementMultiplier,
    powerCells: Math.max(
      initial.powerCells,
      Number.isFinite(candidate.powerCells)
        ? candidate.powerCells
        : initial.powerCells,
    ),
    powerModules: Number.isFinite(candidate.powerModules)
      ? candidate.powerModules
      : 0,
    particleSynthesizer: {
      ...initial.particleSynthesizer,
      ...candidate.particleSynthesizer,
      awakened: Boolean(
        candidate.particleSynthesizer?.awakened ||
          (candidate.science?.syntheses ?? 0) > 0,
      ),
    },
    history: Array.isArray(candidate.history)
      ? [...candidate.history]
      : initial.history,
    ui: {
      ...initial.ui,
      ...candidate.ui,
      activeTab: tabMapping[candidate.ui?.activeTab] ?? initial.ui.activeTab,
      particleSynthesisModal: null,
      synthesizerAwakenedModal: false,
      resetModal: null,
      historyModalEntry: null,
      buyMode: candidate.ui?.buyMode ?? initial.ui.buyMode,
      historyFilter: candidate.ui?.historyFilter ?? initial.ui.historyFilter,
      treeZoom:
        typeof candidate.ui?.treeZoom === "number"
          ? candidate.ui.treeZoom
          : initial.ui.treeZoom,
      selectedSciencePerkId: candidate.ui?.selectedSciencePerkId ?? null,
      seenComponents: {
        ...initial.ui.seenComponents,
        ...candidate.ui?.seenComponents,
      },
      newsDismissed: Boolean(candidate.ui?.newsDismissed),
      currentNewsId: candidate.ui?.currentNewsId ?? null,
      newsTimer:
        typeof candidate.ui?.newsTimer === "number"
          ? candidate.ui.newsTimer
          : 0,
      newsHovered: false,
    },
    setupOptimizations:
      candidate.setupOptimizations ?? candidate.compressionProtocols ?? 0,
    sciencePoints: Number.isFinite(candidate.sciencePoints)
      ? candidate.sciencePoints
      : 0,
    preservedImprovementLog: big(candidate.preservedImprovementLog).gte(0)
      ? big(candidate.preservedImprovementLog)
      : big(0),
    science: {
      ...initial.science,
      ...candidateScience,
      perks: {
        ...initial.science.perks,
        ...candidatePerks,
        redundancyElimination:
          Boolean(candidatePerks.redundancyElimination) ||
          Boolean(legacyMatrixMechanics),
        powerCellResonance:
          Boolean(candidatePerks.powerCellResonance) ||
          Boolean(candidatePerks.storedEnergyPreservation),
      },
      revealedPerks,
      totalScienceEarned: Number.isFinite(candidate.science?.totalScienceEarned)
        ? candidate.science.totalScienceEarned
        : Number.isFinite(candidate.sciencePoints)
          ? candidate.sciencePoints
          : 0,
    },
    quarks: {
      ...initial.quarks,
      ...candidate.quarks,
      available: big(candidate.quarks?.available),
      totalEarned: big(candidate.quarks?.totalEarned),
      lastSynthesis: big(candidate.quarks?.lastSynthesis),
    },
    scienceDevices: {
      ...initial.scienceDevices,
      ...candidate.scienceDevices,
      quarkCages:
        (candidate.science?.syntheses ?? 0) > 0
          ? Math.max(
              config.science.quarkCage.startingCagesAfterSynthesis ?? 1,
              candidate.scienceDevices?.quarkCages ?? 0,
            )
          : (candidate.scienceDevices?.quarkCages ?? 0),
    },
    devices,
    discoveries: { ...initial.discoveries, ...candidate.discoveries },
    study: { ...initial.study, ...candidate.study },
    algorithmUpgradeStudy: {
      ...initial.algorithmUpgradeStudy,
      ...candidate.algorithmUpgradeStudy,
    },
    blueprintStudy: { ...initial.blueprintStudy, ...candidate.blueprintStudy },
    overclockerBlueprintStudy: {
      ...initial.overclockerBlueprintStudy,
      ...candidate.overclockerBlueprintStudy,
    },
    construction: { ...initial.construction, ...candidate.construction },
    overclocker: { ...initial.overclocker, ...candidate.overclocker },
    automations: {
      unlocked: inferUnlockedAutomations({
        ...candidate,
        devices,
        science: {
          ...initial.science,
          ...candidateScience,
          perks: {
            ...initial.science.perks,
            ...candidatePerks,
          },
        },
        automations: candidate.automations,
      }),
      enabled: {
        ...initial.automations.enabled,
        ...candidate.automations?.enabled,
      },
    },
    devSettings: { ...initial.devSettings, ...candidate.devSettings },
    stats: {
      totalEnergyCollected: big(candidate.stats?.totalEnergyCollected).gte(0)
        ? big(candidate.stats?.totalEnergyCollected)
        : big(0),
      totalPlayTime: Number.isFinite(candidate.stats?.totalPlayTime)
        ? Math.max(0, candidate.stats.totalPlayTime)
        : 0,
      runPlayTime: Number.isFinite(candidate.stats?.runPlayTime)
        ? Math.max(0, candidate.stats.runPlayTime)
        : 0,
    },
    log: Array.isArray(candidate.log) ? candidate.log.slice(0, 60) : [],
  };
}
