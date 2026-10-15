import { GameEngine } from "./engine.js";
import {
  deleteAllStates,
  deleteState,
  listSaveSlots,
  loadState,
  saveState,
} from "./save-system.js";
import { simulateOfflineProgress } from "./offline-progress.js";
import { createRenderer, markTabComponentsSeen } from "./ui.js";

async function loadConfig() {
  if (globalThis.__TES_GAME_CONFIG__) {
    return globalThis.__TES_GAME_CONFIG__;
  }

  const response = await fetch("config/game-config.json");
  if (!response.ok) throw new Error("Game configuration could not be loaded.");
  return response.json();
}

function bindActions(app, engine, saveActions, config) {
  app.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target.closest?.('[data-action="set-tab"]');
      if (!target || target.disabled) return;

      // Change sections at pointer-down: auto-studies may trigger a structural
      // redraw before the browser dispatches click on the released button.
      engine.state.ui.activeTab = target.dataset.tab || "devices";
      markTabComponentsSeen(engine.state, config, engine.state.ui.activeTab);
      engine.notify();
    },
    true,
  );

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;

    const actions = {
      "press-button": () => engine.pressButton(),
      "activate-crc": () => engine.activateCrc(),
      "leave-room": () => engine.leaveRoom(),
      "return-to-room": () => engine.returnToRoom(),
      "start-study": () => engine.startStudy(false),
      "start-algorithm-upgrade": () => engine.startAlgorithmUpgradeStudy(),
      "start-blueprint-research": () => engine.startBlueprintResearch(),
      "start-overclocker-blueprint-research": () =>
        engine.startOverclockerBlueprintResearch(),
      "buy-power-cell": () =>
        engine.purchasePowerCells(engine.state.ui.buyMode ?? 1),
      "buy-max-power-cells": () => engine.purchaseMaxPowerCells(),
      "buy-power-module": () =>
        engine.purchasePowerModules(engine.state.ui.buyMode ?? 1),
      "buy-soft-display": () => engine.purchaseSoftDataDisplay(),
      "buy-t2-soft-display": () => engine.purchaseT2SoftDataDisplay(),
      "buy-overclocker": () =>
        engine.purchaseOverclockers(engine.state.ui.buyMode ?? 1),
      "toggle-overclocker": () => engine.toggleOverclocker(),
      "toggle-automation": () =>
        engine.toggleAutomation(target.dataset.automationId),
      "buy-auto": () =>
        engine.purchaseAutoCalculators(engine.state.ui.buyMode ?? 1),
      "construct-crc": () => engine.startCrcConstruction(),
      "buy-processor": () =>
        engine.purchaseProcessors(engine.state.ui.buyMode ?? 1),
      "open-particle-synthesis": () =>
        engine.openParticleSynthesisConfirmation(),
      "cancel-particle-synthesis": () => engine.closeParticleSynthesisModal(),
      "confirm-particle-synthesis": () => engine.confirmParticleSynthesis(),
      "close-particle-synthesis-narrative": () =>
        engine.closeParticleSynthesisModal(),
      "cancel-reset-modal": () => engine.closeResetModal(),
      "confirm-reset-modal": () => {
        if (engine.state.ui.resetModal === "cmu") {
          engine.confirmCalculationMethodUpgrade();
        } else if (engine.state.ui.resetModal === "setup") {
          engine.confirmSetupOptimization();
        } else if (
          engine.state.ui.resetModal === "synthesis" ||
          engine.state.ui.particleSynthesisModal === "confirm"
        ) {
          engine.confirmParticleSynthesis();
        }
      },
      "buy-quark-cage": () =>
        engine.purchaseQuarkCages(engine.state.ui.buyMode ?? 1),
      "buy-fifty-g-calculator": () => engine.purchaseFiftyGCalculator(),
      "buy-science-perk": () =>
        engine.purchaseSciencePerk(target.dataset.perkId),
      "select-science-perk": () => {
        engine.state.ui.selectedSciencePerkId = target.dataset.perkId;
        engine.notify();
      },
      "zoom-in-tree": () => {
        engine.state.ui.treeZoom = Math.min(
          1.6,
          (engine.state.ui.treeZoom || 1) + 0.15,
        );
        engine.notify();
      },
      "zoom-out-tree": () => {
        engine.state.ui.treeZoom = Math.max(
          0.6,
          (engine.state.ui.treeZoom || 1) - 0.15,
        );
        engine.notify();
      },
      "reset-tree-zoom": () => {
        engine.state.ui.treeZoom = 1.0;
        engine.notify();
      },
      "set-buy-mode": () => {
        engine.state.ui.buyMode =
          target.dataset.buyMode || target.dataset.mode || "1";
        engine.notify();
      },
      "set-history-filter": () => {
        engine.state.ui.historyFilter = target.dataset.filter || "all";
        engine.notify();
      },
      "open-history-entry": () => {
        engine.openHistoryEntry(
          target.dataset.historyId || target.dataset.entryId,
        );
      },
      "close-history-modal": () => {
        engine.closeHistoryModal();
      },
      "reset-science-points": () => {
        const confirmed = window.confirm(
          "Return every allocated Science Point and clear all purchased Science perks?",
        );
        if (confirmed) engine.resetSciencePointAllocation();
      },
      "claim-method": () => engine.openCalculationMethodUpgradeConfirmation(),
      "confirm-method-upgrade": () => engine.confirmCalculationMethodUpgrade(),
      "claim-setup": () => engine.openSetupOptimizationConfirmation(),
      "confirm-setup-optimization": () => engine.confirmSetupOptimization(),
      "set-tab": () => {
        engine.state.ui.activeTab = target.dataset.tab || "energy";
        markTabComponentsSeen(engine.state, config, engine.state.ui.activeTab);
        engine.notify();
      },
      "set-science-subtab": () => {
        engine.state.ui.activeScienceSubtab =
          target.dataset.scienceSubtab || "tree";
        markTabComponentsSeen(engine.state, config, "science");
        engine.notify();
      },
      "toggle-hide-completed": () => {
        engine.state.ui.hideCompletedPurchases =
          !engine.state.ui.hideCompletedPurchases;
        engine.notify();
      },
      "enter-dev-mode": () => {
        const url = new URL(window.location.href);
        url.searchParams.set("dev", "1");
        window.location.href = url.toString();
      },
      "exit-dev-mode": () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("dev");
        window.location.href = url.toString();
      },
      "dev-add-energy": () => engine.developmentAddEnergy(),
      "dev-add-large-energy": () => engine.developmentAddLargeEnergy(),
      "dev-complete-study": () => engine.developmentCompleteStudy(),
      "dev-complete-upgrade": () =>
        engine.developmentCompleteAlgorithmUpgrade(),
      "dev-force-blueprint": () => engine.developmentForceBlueprint(),
      "dev-cycle-production": () =>
        engine.developmentCycleProductionMultiplier(),
      "dev-cycle-duration": () => engine.developmentCycleDurationMultiplier(),
      "save-now": () => saveActions.saveNow(),
      "reset-save": () => saveActions.resetCurrent(),
      "reset-current-save": () => saveActions.resetCurrent(),
      "reset-normal-save": () => saveActions.resetMode(false),
      "reset-development-save": () => saveActions.resetMode(true),
      "reset-all-saves": () => saveActions.resetAll(),
    };

    actions[target.dataset.action]?.();
  });
}

async function start() {
  const app = document.querySelector("#app");
  const query = new URLSearchParams(window.location.search);
  const developmentMode = query.get("dev") === "1";

  try {
    const config = await loadConfig();
    const state = loadState(config, developmentMode);
    simulateOfflineProgress(state, config, { developmentMode });
    const engine = new GameEngine({ state, config, developmentMode });
    const render = createRenderer(app, config, developmentMode, listSaveSlots);
    let saveSuppressed = false;

    window.clearTimeout(window.__TES_BOOT_TIMEOUT__);

    const reloadWithoutSaving = () => {
      saveSuppressed = true;
      window.location.reload();
    };

    const resetMode = (mode) => {
      const label = mode ? "development" : "normal";
      const confirmed = window.confirm(
        `Delete ${label} mode progress? This cannot be undone.`,
      );
      if (!confirmed) return;
      deleteState(mode);
      if (mode === developmentMode) {
        reloadWithoutSaving();
        return;
      }
      render(state);
    };

    const resetAll = () => {
      const confirmed = window.confirm(
        "Delete normal and development progress? This cannot be undone.",
      );
      if (!confirmed) return;
      deleteAllStates();
      reloadWithoutSaving();
    };

    const saveNow = () => {
      if (saveSuppressed) return;
      saveState(state, developmentMode);
      engine.addLog(
        "Simulation memory saved. Offline recovery anchor updated.",
        "device",
      );
      engine.notify();
    };

    markTabComponentsSeen(state, config);

    bindActions(
      app,
      engine,
      {
        saveNow,
        resetCurrent: () => resetMode(developmentMode),
        resetMode,
        resetAll,
      },
      config,
    );
    engine.subscribe(render);
    render(state);

    let previousTime = performance.now();
    let previousRender = previousTime;
    let previousSave = previousTime;

    function frame(now) {
      const deltaSeconds = (now - previousTime) / 1000;
      previousTime = now;
      engine.tick(deltaSeconds);

      if (now - previousRender >= config.timing.renderIntervalMs) {
        render(state);
        previousRender = now;
      }

      if (now - previousSave >= config.timing.autosaveIntervalMs) {
        if (!saveSuppressed) saveState(state, developmentMode);
        previousSave = now;
      }

      window.requestAnimationFrame(frame);
    }

    window.addEventListener("beforeunload", () => {
      if (!saveSuppressed) saveState(state, developmentMode);
    });

    window.requestAnimationFrame(frame);
  } catch (error) {
    window.clearTimeout(window.__TES_BOOT_TIMEOUT__);
    console.error(error);
    app.innerHTML = `
      <section class="screen screen--centered">
        <div class="panel panel--narrative">
          <p class="eyebrow eyebrow--warning">BOOT FAILURE</p>
          <h1>The facility did not respond.</h1>
          <p>Run the prototype through a local web server and reload the page.</p>
        </div>
      </section>
    `;
  }
}

start();
