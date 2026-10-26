/**
 * state.js
 * GameState — Single Source of Truth (SSoT) for The Eternal Simulation.
 * Rebuilt for the Energy Era, Algorithm Learning, Devices & Facility Optimization spec.
 */

import { big, BigNum } from "./numeric.js";

export const SAVE_VERSION = 4;

export function createInitialState(config = {}) {
  return {
    saveVersion: SAVE_VERSION,

    // Core Currencies
    energy: big(config.economy?.initialEnergy ?? 0),
    peakEnergy: big(config.economy?.initialEnergy ?? 0),
    powerCells: 0,
    powerCellCharge: big(0),

    // Progression & Prestiges
    computerLevel: config.economy?.initialComputerLevel ?? 1,
    facilityOptimizations: 0,

    // Exactly Three Algorithm Features
    algorithms: {
      AImp: { owned: 0, produced: 0 },
      AUpg: { owned: 0, produced: 0 },
      ARec: { owned: 0, produced: 0 },
    },

    // Study Execution State
    manualStudy: {
      target: null, // 'AImp' | 'AUpg' | 'ARec' | null
      elapsed: 0,
      active: false,
    },
    manualStudies: {
      AImp: { active: false, elapsed: 0 },
      AUpg: { active: false, elapsed: 0 },
      ARec: { active: false, elapsed: 0 },
    },
    studyQueues: {
      AImp: 0,
      AUpg: 0,
      ARec: 0,
    },
    reservedInputs: {
      AImp: 0,
      AUpg: 0,
    },

    // Study Improve (Section 1)
    studyImproves: {
      AImp: { completions: 0, claimed: 0 },
      AUpg: { completions: 0, claimed: 0 },
      ARec: { completions: 0, claimed: 0 },
    },

    // Devices & Infrastructure
    devices: {
      chips: {
        owned: 0,
        allocations: {
          AImp: 0,
          AUpg: 0,
          ARec: 0,
        },
        enabled: {
          AImp: true,
          AUpg: true,
          ARec: true,
        },
        timers: {
          AImp: 0,
          AUpg: 0,
          ARec: 0,
        },
      },
      transistorBoard: {
        owned: false,
      },
      transistorsPurchased: 0,
      transistorAllocations: {
        AImp: 0,
        AUpg: 0,
        ARec: 0,
      },
      microprocessor: {
        owned: 0,
        target: "AImp",
      },
      overclocker: {
        owned: 0,
        active: false,
        activeSeconds: 0,
        remainingDuration: 0,
        target: null,
        consumedTransistors: 0,
      },
      crcGadget: {
        owned: 0,
      },
      capacitors: 0,
      processors: 0,
      hardDisks: {
        owned: 0,
        state: "off", // 'active' | 'standby' | 'off'
        activeSeconds: 0,
        buffer: 0,
      },
    },

    // Technological Unlock Milestones
    unlocks: {
      AImp: true,
      AUpg: true,
      ARec: false,
      chips: false,
      transistorBoard: false,
      microprocessor: false,
      overclocker: false,
      crcGadget: true,
      capacitor: false,
      processor: false,
      hardDisk: false,
      powerCell: false,
    },

    // Statistics
    stats: {
      gameTime: 0,
      totalEnergyProduced: big(0),
      totalPurchases: 0,
      totalMachineLearnings: 0,
      totalFacilityOptimizations: 0,
    },

    // Timestamp & Persistence
    lastSavedAt: Date.now(),
    log: [],
    lastOfflineSummary: null,

    // UI View State
    ui: {
      activeTab: "energy",
      transistorBoardExpanded: true,
      narrativeDismissed: false,
      bulkMode: 1,
    },

    // User & Simulation Settings
    settings: {
      notation: "engineering", // 'engineering' | 'engineering_num' | 'alpha'
    },

    // Developer Sandbox
    devMode: false,
    gameSpeed: 1.0,
    auditLogs: [],
    quicksaveSnapshot: null,
  };
}

export function normalizeState(raw = {}, config = {}) {
  const initial = createInitialState(config);
  if (!raw || typeof raw !== "object") return initial;

  const state = {
    ...initial,
    saveVersion: SAVE_VERSION,
    energy: big(raw.energy ?? initial.energy),
    peakEnergy: big(raw.peakEnergy ?? initial.peakEnergy),
    powerCells: Number(raw.powerCells ?? initial.powerCells),
    powerCellCharge: big(raw.powerCellCharge ?? initial.powerCellCharge),
    computerLevel: Math.max(1, Number(raw.computerLevel ?? initial.computerLevel)),
    facilityOptimizations: Math.max(0, Number(raw.facilityOptimizations ?? initial.facilityOptimizations)),

    algorithms: {
      AImp: {
        owned: Math.max(0, Number(raw.algorithms?.AImp?.owned ?? raw.improvements ?? 0)),
        produced: Math.max(0, Number(raw.algorithms?.AImp?.produced ?? 0)),
      },
      AUpg: {
        owned: Math.max(0, Number(raw.algorithms?.AUpg?.owned ?? raw.upgrades ?? 0)),
        produced: Math.max(0, Number(raw.algorithms?.AUpg?.produced ?? 0)),
      },
      ARec: {
        owned: Math.max(0, Number(raw.algorithms?.ARec?.owned ?? 0)),
        produced: Math.max(0, Number(raw.algorithms?.ARec?.produced ?? 0)),
      },
    },

    manualStudy: {
      target: raw.manualStudy?.target ?? null,
      elapsed: Number(raw.manualStudy?.elapsed ?? 0),
      active: Boolean(raw.manualStudy?.active),
    },
    manualStudies: {
      AImp: {
        active: Boolean(raw.manualStudies?.AImp?.active ?? (raw.manualStudy?.target === "AImp" && raw.manualStudy?.active)),
        elapsed: Number(raw.manualStudies?.AImp?.elapsed ?? (raw.manualStudy?.target === "AImp" ? raw.manualStudy?.elapsed : 0)),
      },
      AUpg: {
        active: Boolean(raw.manualStudies?.AUpg?.active ?? (raw.manualStudy?.target === "AUpg" && raw.manualStudy?.active)),
        elapsed: Number(raw.manualStudies?.AUpg?.elapsed ?? (raw.manualStudy?.target === "AUpg" ? raw.manualStudy?.elapsed : 0)),
      },
      ARec: {
        active: Boolean(raw.manualStudies?.ARec?.active ?? (raw.manualStudy?.target === "ARec" && raw.manualStudy?.active)),
        elapsed: Number(raw.manualStudies?.ARec?.elapsed ?? (raw.manualStudy?.target === "ARec" ? raw.manualStudy?.elapsed : 0)),
      },
    },
    studyQueues: {
      AImp: Math.max(0, Number(raw.studyQueues?.AImp ?? 0)),
      AUpg: Math.max(0, Number(raw.studyQueues?.AUpg ?? 0)),
      ARec: Math.max(0, Number(raw.studyQueues?.ARec ?? 0)),
    },
    reservedInputs: {
      AImp: Math.max(0, Number(raw.reservedInputs?.AImp ?? 0)),
      AUpg: Math.max(0, Number(raw.reservedInputs?.AUpg ?? 0)),
    },

    studyImproves: {
      AImp: {
        completions: Math.max(0, Number(raw.studyImproves?.AImp?.completions ?? 0)),
        claimed: Math.max(0, Number(raw.studyImproves?.AImp?.claimed ?? 0)),
      },
      AUpg: {
        completions: Math.max(0, Number(raw.studyImproves?.AUpg?.completions ?? 0)),
        claimed: Math.max(0, Number(raw.studyImproves?.AUpg?.claimed ?? 0)),
      },
      ARec: {
        completions: Math.max(0, Number(raw.studyImproves?.ARec?.completions ?? 0)),
        claimed: Math.max(0, Number(raw.studyImproves?.ARec?.claimed ?? 0)),
      },
    },

    devices: {
      chips: {
        owned: Math.max(0, Number(raw.devices?.chips?.owned ?? raw.devices?.autoCalculators ?? 0)),
        allocations: {
          AImp: Math.max(0, Number(raw.devices?.chips?.allocations?.AImp ?? raw.devices?.autoCalculators ?? 0)),
          AUpg: Math.max(0, Number(raw.devices?.chips?.allocations?.AUpg ?? 0)),
          ARec: Math.max(0, Number(raw.devices?.chips?.allocations?.ARec ?? 0)),
        },
        enabled: {
          AImp: raw.devices?.chips?.enabled?.AImp !== false,
          AUpg: raw.devices?.chips?.enabled?.AUpg !== false,
          ARec: raw.devices?.chips?.enabled?.ARec !== false,
        },
        timers: {
          AImp: Math.max(0, Number(raw.devices?.chips?.timers?.AImp ?? 0)),
          AUpg: Math.max(0, Number(raw.devices?.chips?.timers?.AUpg ?? 0)),
          ARec: Math.max(0, Number(raw.devices?.chips?.timers?.ARec ?? 0)),
        },
      },
      transistorBoard: {
        owned: Boolean(raw.devices?.transistorBoard?.owned),
      },
      transistorsPurchased: Math.max(0, Number(raw.devices?.transistorsPurchased ?? 0)),
      transistorAllocations: {
        AImp: Math.max(0, Number(raw.devices?.transistorAllocations?.AImp ?? 0)),
        AUpg: Math.max(0, Number(raw.devices?.transistorAllocations?.AUpg ?? 0)),
        ARec: Math.max(0, Number(raw.devices?.transistorAllocations?.ARec ?? 0)),
      },
      microprocessor: {
        owned: Math.min(1, Math.max(0, Number(raw.devices?.microprocessor?.owned ?? 0))),
        target: raw.devices?.microprocessor?.target ?? "AImp",
      },
      overclocker: {
        owned: Math.max(0, Number(raw.devices?.overclocker?.owned ?? 0)),
        active: Boolean(raw.devices?.overclocker?.active),
        activeSeconds: Number(raw.devices?.overclocker?.activeSeconds ?? 0),
        remainingDuration: Number(raw.devices?.overclocker?.remainingDuration ?? 0),
        target: raw.devices?.overclocker?.target ?? null,
        consumedTransistors: Number(raw.devices?.overclocker?.consumedTransistors ?? 0),
      },
      crcGadget: {
        owned: Math.max(0, Number(raw.devices?.crcGadget?.owned ?? 0)),
      },
      capacitors: Math.max(0, Number(raw.devices?.capacitors ?? 0)),
      processors: Math.max(0, Number(raw.devices?.processors ?? 0)),
      hardDisks: {
        owned: Math.max(0, Number(raw.devices?.hardDisks?.owned ?? 0)),
        state: ["active", "standby", "off"].includes(raw.devices?.hardDisks?.state)
          ? raw.devices.hardDisks.state
          : "off",
        activeSeconds: Number(raw.devices?.hardDisks?.activeSeconds ?? 0),
        buffer: Math.max(0, Number(raw.devices?.hardDisks?.buffer ?? 0)),
      },
    },

    unlocks: {
      ...initial.unlocks,
      ...(raw.unlocks ?? {}),
    },

    stats: {
      gameTime: Number(raw.stats?.gameTime ?? 0),
      totalEnergyProduced: big(raw.stats?.totalEnergyProduced ?? 0),
      totalPurchases: Number(raw.stats?.totalPurchases ?? 0),
      totalMachineLearnings: Number(raw.stats?.totalMachineLearnings ?? 0),
      totalFacilityOptimizations: Number(raw.stats?.totalFacilityOptimizations ?? 0),
    },

    ui: {
      ...initial.ui,
      ...(raw.ui ?? {}),
    },

    settings: {
      notation: ["engineering", "engineering_num", "alpha"].includes(raw.settings?.notation)
        ? raw.settings.notation
        : ["engineering", "engineering_num", "alpha"].includes(raw.ui?.notation)
        ? raw.ui.notation
        : "engineering",
    },

    devMode: raw.devMode !== undefined ? Boolean(raw.devMode) : true,
    gameSpeed: Number(raw.gameSpeed ?? 1.0),
    auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : [],
    quicksaveSnapshot: raw.quicksaveSnapshot ?? null,
    lastSavedAt: Number.isFinite(Number(raw.lastSavedAt)) ? Number(raw.lastSavedAt) : Date.now(),
    log: Array.isArray(raw.log) ? raw.log : [],
    lastOfflineSummary: raw.lastOfflineSummary ?? null,
  };

  return state;
}

export function deserializeState(raw, config) {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  return normalizeState(raw, config);
}

export function serializeState(state) {
  return JSON.stringify(state, (key, value) => {
    if (value instanceof BigNum) {
      return value.toString();
    }
    return value;
  });
}
