import { GameEngine } from "./engine.js";
import {
  deleteAllStates,
  deleteState,
  listSaveSlots,
  loadState,
  saveState
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
      "buy-power-cell": () => engine.purchasePowerCell(),
      "buy-max-power-cells": () => engine.purchaseMaxPowerCells(),
      "buy-power-module": () => engine.purchasePowerModule(),
      "buy-soft-display": () => engine.purchaseSoftDataDisplay(),
      "buy-t2-soft-display": () => engine.purchaseT2SoftDataDisplay(),
      "buy-overclocker": () => engine.purchaseOverclocker(),
      "toggle-overclocker": () => engine.toggleOverclocker(),
      "buy-auto": () => engine.purchaseAutoCalculator(),
      "construct-crc": () => engine.startCrcConstruction(),
      "buy-processor": () => engine.purchaseProcessor(),
      "activate-particle-synthesizer": () => engine.activateParticleSynthesizer(),
      "buy-matrix-mechanics": () => engine.purchaseMatrixMechanics(),
      "claim-method": () => engine.claimCalculationMethodUpgrade(),
      "claim-setup": () => engine.claimSetupOptimization(),
      "set-tab": () => {
        engine.state.ui.activeTab = target.dataset.tab || "devices";
        markTabComponentsSeen(engine.state, config, engine.state.ui.activeTab);
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
      "dev-complete-upgrade": () => engine.developmentCompleteAlgorithmUpgrade(),
      "dev-force-blueprint": () => engine.developmentForceBlueprint(),
      "dev-cycle-production": () => engine.developmentCycleProductionMultiplier(),
      "dev-cycle-duration": () => engine.developmentCycleDurationMultiplier(),
      "save-now": () => saveActions.saveNow(),
      "reset-save": () => saveActions.resetCurrent(),
      "reset-current-save": () => saveActions.resetCurrent(),
      "reset-normal-save": () => saveActions.resetMode(false),
      "reset-development-save": () => saveActions.resetMode(true),
      "reset-all-saves": () => saveActions.resetAll()
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
        `Delete ${label} mode progress? This cannot be undone.`
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
        "Delete normal and development progress? This cannot be undone."
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
        "device"
      );
      engine.notify();
    };

    markTabComponentsSeen(state, config);

    bindActions(app, engine, {
      saveNow,
      resetCurrent: () => resetMode(developmentMode),
      resetMode,
      resetAll
    }, config);
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
