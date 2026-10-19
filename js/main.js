import { GameEngine } from "./engine.js";
import {
  deleteAllStates,
  deleteState,
  listSaveSlots,
  loadState,
  saveState,
} from "./save-system.js";
import { simulateOfflineProgress } from "./offline-progress.js";
import { createRenderer } from "./ui.js";

async function loadConfig() {
  if (globalThis.__TES_GAME_CONFIG__) {
    return globalThis.__TES_GAME_CONFIG__;
  }

  const response = await fetch("config/game-config.json");
  if (!response.ok) throw new Error("Game configuration could not be loaded.");
  return response.json();
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function bindActions(app, engine, saveActions, config) {
  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;

    const action = target.dataset.action;

    switch (action) {
      // 1. Navigation / Tabs
      case "set-tab": {
        const tab = target.dataset.tab || "energy";
        engine.state.ui.activeTab = tab;
        engine.notify();
        break;
      }

      // 2. Narrative
      case "dismiss-narrative": {
        const card = target.closest("#narrative-card") || target.closest(".panel");
        if (card) card.style.display = "none";
        break;
      }

      // 3. Algorithm Studies
      case "study-feature": {
        const feat = target.dataset.target;
        const count = parseInt(target.dataset.count || "1", 10);
        engine.startManualStudy(feat, count);
        break;
      }

      // 4. Element Purchases (General)
      case "buy-element": {
        const elementId = target.dataset.elementId;
        const count = parseInt(target.dataset.count || "1", 10);
        engine.purchaseElement(elementId, count);
        break;
      }

      // 5. Machine Learning (Soft Reset)
      case "run-machine-learning": {
        engine.runMachineLearning();
        break;
      }

      // 6. Chips Reassignment
      case "reassign-chip": {
        const from = target.dataset.from;
        const to = target.dataset.to;
        const count = parseInt(target.dataset.count || "1", 10);
        engine.reassignChip(from, to, count);
        break;
      }

      // 7. Transistors Reassignment
      case "reassign-transistor": {
        const from = target.dataset.from;
        const to = target.dataset.to;
        const count = parseInt(target.dataset.count || "1", 10);
        engine.reassignTransistors(from, to, count);
        break;
      }

      // 8. Microprocessor Target
      case "set-micro-target": {
        const microTarget = target.dataset.target;
        engine.setMicroprocessorTarget(microTarget);
        break;
      }

      // 9. Overclocker Activation
      case "activate-overclock": {
        engine.activateOverclocker();
        break;
      }

      // 10. Hard Disk State
      case "set-harddisk-state": {
        const state = target.dataset.state;
        engine.setHardDiskState(state);
        break;
      }

      // 11. Facility Optimization (Hard Reset)
      case "perform-facility-optimization": {
        const confirmed = window.confirm(
          "Perform Facility Optimization? This will reset energy and conventional hardware, but preserve Computer Level, Power Cells, and grant a permanent +9% compounding bonus."
        );
        if (confirmed) {
          engine.performFacilityOptimization();
        }
        break;
      }

      // 12. Dev Mode & Cheats
      case "toggle-dev-mode": {
        engine.toggleDevMode();
        break;
      }
      case "add-energy": {
        const amount = parseFloat(target.dataset.amount || "1e-9");
        engine.addEnergy(amount);
        break;
      }
      case "zero-energy": {
        engine.setEnergy(0);
        break;
      }
      case "add-afeature": {
        const feat = target.dataset.target;
        const count = parseInt(target.dataset.count || "12", 10);
        engine.addAFeature(feat, count);
        break;
      }
      case "add-comp-level": {
        engine.addComputerLevel(1);
        break;
      }
      case "set-speed": {
        const speed = parseFloat(target.dataset.speed || "1");
        engine.setGameSpeed(speed);
        break;
      }
      case "quicksave": {
        engine.quicksave();
        break;
      }
      case "restore-quicksave": {
        engine.restoreQuicksave();
        break;
      }
      case "reset-all": {
        const confirmed = window.confirm(
          "Delete all simulation progress? This cannot be undone."
        );
        if (confirmed) {
          engine.resetAllProgress();
        }
        break;
      }

      // 13. Audit Log Data Export
      case "export-csv": {
        const csv = engine.exportAuditLogsCSV();
        downloadFile(csv, `tes-audit-${Date.now()}.csv`, "text/csv");
        break;
      }
      case "export-json": {
        const json = engine.exportAuditLogsJSON();
        downloadFile(json, `tes-audit-${Date.now()}.json`, "application/json");
        break;
      }
      case "clear-audit": {
        engine.state.auditLogs = [];
        engine.notify();
        break;
      }
    }
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
    const renderer = createRenderer(app, engine);

    window.clearTimeout(window.__TES_BOOT_TIMEOUT__);

    let saveSuppressed = false;

    bindActions(
      app,
      engine,
      {
        saveNow: () => engine.save(),
        resetAll: () => engine.resetAllProgress(),
      },
      config
    );

    engine.subscribe(() => renderer.render());
    renderer.render();

    let previousTime = performance.now();
    let previousRender = previousTime;
    let previousSave = previousTime;

    function frame(now) {
      const deltaSeconds = (now - previousTime) / 1000;
      previousTime = now;
      engine.tick(deltaSeconds);

      if (now - previousRender >= (config.timing?.renderIntervalMs ?? 50)) {
        renderer.render();
        previousRender = now;
      }

      if (now - previousSave >= (config.timing?.autosaveIntervalMs ?? 5000)) {
        if (!saveSuppressed) saveState(engine.state, developmentMode);
        previousSave = now;
      }

      window.requestAnimationFrame(frame);
    }

    window.addEventListener("beforeunload", () => {
      if (!saveSuppressed) saveState(engine.state, developmentMode);
    });

    window.requestAnimationFrame(frame);
  } catch (error) {
    window.clearTimeout(window.__TES_BOOT_TIMEOUT__);
    console.error(error);
    if (app) {
      app.innerHTML = `
        <section class="screen screen--centered">
          <div class="panel panel--narrative">
            <p class="eyebrow eyebrow--warning">BOOT FAILURE</p>
            <h1>The facility did not respond.</h1>
            <p>${error.message || "An error occurred while loading the game."}</p>
          </div>
        </section>
      `;
    }
  }
}

start();
