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

function bindHotkeys(engine, renderer) {
  if (typeof window === "undefined") return;

  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target && typeof event.target.matches === "function" && (event.target.matches("input, textarea, select") || event.target.isContentEditable)) {
      return;
    }

    const key = event.key.toUpperCase();
    if (["A", "U", "R", "G", "T", "M"].includes(key)) {
      event.preventDefault();
      engine.setHotkeyState(key, true);
      if (renderer?.render) renderer.render();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toUpperCase();
    if (["A", "U", "R", "G", "T", "M"].includes(key)) {
      engine.setHotkeyState(key, false);
      if (renderer?.render) renderer.render();
    }
  });

  window.addEventListener("blur", () => {
    engine.clearAllHotkeys();
    if (renderer?.render) renderer.render();
  });
}

function bindActions(app, engine, saveActions, config, renderer) {
  // Handle click actions
  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;

    const action = target.dataset.action;

    switch (action) {
      // 1. Navigation / Tabs
      case "set-tab": {
        const tab = target.dataset.tab || "energy";
        if (engine.state.ui.activeTab !== tab) {
          engine.state.ui.activeTab = tab;
          try {
            renderer.render();
          } catch (err) {
            console.error("[Main] Error during tab switch render:", err);
          }
        }
        break;
      }

      // 2. Drawer & Modal Management
      case "open-drawer": {
        if (renderer?.openDrawer) renderer.openDrawer(target.dataset.drawer);
        break;
      }
      case "close-drawer": {
        if (target.classList.contains("tes-modal-overlay") && event.target !== target) break;
        if (renderer?.closeDrawer) renderer.closeDrawer();
        break;
      }
      case "open-modal": {
        if (renderer?.openDrawer) renderer.openDrawer(target.dataset.modal);
        break;
      }
      case "close-modal": {
        if (target.classList.contains("tes-modal-overlay") && event.target !== target) break;
        if (renderer?.closeDrawer) renderer.closeDrawer();
        break;
      }

      // 3. News Carousel Navigation
      case "news-prev": {
        if (renderer?.prevNews) renderer.prevNews();
        break;
      }
      case "news-next": {
        if (renderer?.nextNews) renderer.nextNews();
        break;
      }

      // 4. Info Popovers
      case "show-info": {
        if (renderer?.showInfo) renderer.showInfo(target.dataset.topic, target);
        break;
      }

      // 5. Algorithm Studies & Automation Toggles
      case "study-feature": {
        const feat = target.dataset.target;
        const count = parseInt(target.dataset.count || "1", 10);
        engine.startManualStudy(feat, count);
        break;
      }
      case "toggle-auto-study": {
        const feat = target.dataset.target;
        if (feat && engine.toggleAutoStudy) {
          engine.toggleAutoStudy(feat);
        }
        break;
      }
      case "claim-study-improve": {
        const feat = target.dataset.target;
        if (feat && engine.claimStudyImprove) {
          const success = engine.claimStudyImprove(feat);
          if (success) {
            const row = document.querySelector(`#study-row-${feat.toLowerCase()}`);
            if (row) {
              row.classList.remove("tes-study-row--improved");
              void row.offsetWidth;
              row.classList.add("tes-study-row--improved");
            }
            if (renderer?.render) renderer.render();
          }
        }
        break;
      }
      case "install-transistor": {
        const feat = target.dataset.target;
        if (feat && engine.installTransistor) {
          const success = engine.installTransistor(feat);
          if (success && renderer?.render) {
            renderer.render();
          }
        }
        break;
      }

      // 6. Device Category Filters
      case "set-device-filter": {
        const filter = target.dataset.filter || "all";
        engine.state.ui.deviceCategoryFilter = filter;
        engine.notify();
        break;
      }

      // 7. Element Purchases (General)
      case "buy-element": {
        const elementId = target.dataset.elementId;
        const count = parseInt(target.dataset.count || "1", 10);
        const success = engine.purchaseElement(elementId, count);
        if (!success) {
          const evalResult = engine.evaluateElement(elementId, count);
          if (evalResult?.reasons?.length > 0) {
            console.warn(`[UI] Purchase blocked for '${elementId}':`, evalResult.reasons.join(". "));
          }
        }
        break;
      }

      // 8. Machine Learning (Soft Reset)
      case "run-machine-learning": {
        engine.runMachineLearning();
        break;
      }

      // 9. Chips Reassignment
      case "reassign-chip": {
        const from = target.dataset.from;
        const to = target.dataset.to;
        const count = parseInt(target.dataset.count || "1", 10);
        engine.reassignChip(from, to, count);
        break;
      }

      // 10. Transistors Reassignment
      case "reassign-transistor": {
        const from = target.dataset.from;
        const to = target.dataset.to;
        const count = parseInt(target.dataset.count || "1", 10);
        engine.reassignTransistors(from, to, count);
        break;
      }

      // 11. Microprocessor Target
      case "rebalance-transistors": {
        if (engine.rebalanceTransistors) engine.rebalanceTransistors();
        break;
      }
      case "set-micro-target": {
        const microTarget = target.dataset.target;
        engine.setMicroprocessorTarget(microTarget);
        break;
      }

      // 12. Overclocker Activation
      case "activate-overclock": {
        engine.activateOverclocker();
        if (renderer?.closeDrawer) renderer.closeDrawer();
        break;
      }

      // 13. Hard Disk State
      case "set-harddisk-state": {
        const state = target.dataset.state;
        engine.setHardDiskState(state);
        break;
      }

      // 14. Facility Optimization / Setup Optimization (Hard Reset)
      case "perform-facility-optimization": {
        const success = engine.performFacilityOptimization();
        if (success) {
          if (renderer?.closeDrawer) renderer.closeDrawer();
          if (renderer?.render) renderer.render();
        }
        break;
      }

      // 15. Dev Mode & Cheats
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
      case "set-notation": {
        const notation = target.dataset.notation || target.value;
        if (notation) {
          engine.setNotation(notation);
          if (renderer?.refreshDrawer) renderer.refreshDrawer();
          renderer.render();
        }
        break;
      }
      case "reset-all": {
        const confirmed = window.confirm(
          "Delete all simulation progress? This cannot be undone."
        );
        if (confirmed) {
          engine.resetAllProgress();
          if (renderer?.closeDrawer) renderer.closeDrawer();
        }
        break;
      }

      // 16. Audit Log Data Export
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
        if (renderer?.refreshDrawer) renderer.refreshDrawer();
        engine.notify();
        break;
      }
    }
  });

  // Handle change actions (checkboxes)
  app.addEventListener("change", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;
    if (action === "toggle-filter-added") {
      engine.state.ui.showAdded = target.checked;
      engine.notify();
    } else if (action === "toggle-filter-unavailable") {
      engine.state.ui.showUnavailable = target.checked;
      engine.notify();
    } else if (action === "set-notation") {
      const notation = target.value;
      if (notation) {
        engine.setNotation(notation);
        if (renderer?.refreshDrawer) renderer.refreshDrawer();
        renderer.render();
      }
    }
  });
}

async function start() {
  const app = document.querySelector("#app");
  const query = new URLSearchParams(window.location.search);
  const developmentMode = query.get("dev") === "1";
  const initialTab = query.get("tab");
  const initialDrawer = query.get("drawer");

  try {
    const config = await loadConfig();
    const state = loadState(config, developmentMode);
    if (initialTab && ["energy", "devices", "science", "particles"].includes(initialTab)) {
      state.ui.activeTab = initialTab;
    }

    let saveSuppressed = false;
    if (query.get("demo") === "1") {
      saveSuppressed = true;
      state.energy = big("125.4e-6");
      state.peakEnergy = big("125.4e-6");
      state.computerLevel = 3;
      state.algorithms.AImp = { owned: 48, produced: 120 };
      state.algorithms.AUpg = { owned: 4, produced: 6 };
      state.devices.capacitors = 2;
      state.devices.chips.owned = 1;
      state.devices.chips.allocations = { AImp: 1, AUpg: 0, ARec: 0 };
      state.devices.chips.enabled = { AImp: true, AUpg: true, ARec: true };
      state.devices.microprocessor.owned = 0;
      state.devices.crcGadget.owned = 1;
      state.devices.transistorBoard.owned = true;
      state.devices.transistorsPurchased = 4;
      state.devices.transistorAllocations = { AImp: 2, AUpg: 2, ARec: 0 };
      state.devices.overclocker.owned = 1;
      state.powerCells = 2;
      state.powerCellCharge = big("1.8e-3");
      state.unlocks.chips = true;
      state.unlocks.transistorBoard = true;
      state.unlocks.crcGadget = true;
      state.unlocks.microprocessor = true;
      state.unlocks.overclocker = true;
      state.unlocks.capacitor = true;
      state.unlocks.powerCell = true;

      // Study Improves initial demo state
      state.studyImproves = {
        AImp: { completions: 40, claimed: 0 },
        AUpg: { completions: 0, claimed: 0 },
        ARec: { completions: 0, claimed: 0 },
      };

      const scenario = query.get("scenario");
      if (scenario === "improve-unavailable") {
        state.algorithms.AImp.owned = 10;
        state.studyImproves.AImp = { completions: 10, claimed: 0 };
      } else if (scenario === "transistor-disabled") {
        state.energy = big("0");
      } else if (scenario === "data-cap") {
        state.algorithms.AImp = { owned: 10000, produced: 10000 };
        state.devices.hardDisks = { owned: 1, active: true, buffer: 25, dataPaused: true };
        state.unlocks.hardDisk = true;
      } else if (scenario === "energy-advanced") {
        state.energy = big("50e9");
        state.peakEnergy = big("50e9");
      } else if (scenario === "so-card") {
        state.computerLevel = 6;
      } else if (scenario === "so-modal") {
        state.computerLevel = 6;
        setTimeout(() => {
          if (renderer?.openDrawer) renderer.openDrawer("fo-confirm");
        }, 80);
      }
    }

    window.clearTimeout(window.__TES_BOOT_TIMEOUT__);

    const offlineSummary = simulateOfflineProgress(state, config, { developmentMode });
    const engine = new GameEngine({ state, config, developmentMode });
    const renderer = createRenderer(app, engine);
    if (typeof window !== "undefined") {
      window.__TES_ENGINE__ = engine;
      window.__TES_RENDERER__ = renderer;
    }

    bindActions(
      app,
      engine,
      {
        saveNow: () => engine.save(),
        resetAll: () => engine.resetAllProgress(),
      },
      config,
      renderer
    );

    bindHotkeys(engine, renderer);

    engine.subscribe(() => {
      try {
        renderer.render();
      } catch (err) {
        console.error("[Main] Error in engine subscription render:", err);
      }
    });
    try {
      renderer.render();
    } catch (err) {
      console.error("[Main] Error during initial render:", err);
    }

    if (initialDrawer && renderer?.openDrawer) {
      renderer.openDrawer(initialDrawer);
    } else if (offlineSummary && offlineSummary.simulatedSeconds >= 5 && renderer?.openDrawer) {
      renderer.openDrawer("offline");
    }

    let previousTime = performance.now();
    let previousRender = previousTime;
    let previousSave = previousTime;

    function frame(now) {
      const rawDelta = (now - previousTime) / 1000;
      previousTime = now;

      if (rawDelta > 3.0) {
        const bgSummary = simulateOfflineProgress(engine.state, config, { developmentMode, now: Date.now() });
        if (bgSummary && bgSummary.simulatedSeconds >= 5 && !renderer.getActiveDrawer?.()) {
          renderer.openDrawer("offline");
        }
        try {
          renderer.render();
        } catch (err) {
          console.error("[Main] Error during offline progress render:", err);
        }
        if (!saveSuppressed) saveState(engine.state, developmentMode);
      } else {
        const deltaSeconds = Math.min(rawDelta, config.timing?.maximumTickSeconds ?? 1.0);
        engine.tick(deltaSeconds);
      }

      if (now - previousRender >= (config.timing?.renderIntervalMs ?? 50)) {
        try {
          renderer.render();
        } catch (err) {
          console.error("[Main] Error during tick render:", err);
        }
        previousRender = now;
      }

      if (now - previousSave >= (config.timing?.autosaveIntervalMs ?? 5000)) {
        if (!saveSuppressed) saveState(engine.state, developmentMode);
        previousSave = now;
      }

      window.requestAnimationFrame(frame);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        engine.state.lastSavedAt = Date.now();
        if (!saveSuppressed) saveState(engine.state, developmentMode);
      } else {
        const now = Date.now();
        const elapsed = (now - (engine.state.lastSavedAt ?? now)) / 1000;
        if (elapsed >= 3.0) {
          const bgSummary = simulateOfflineProgress(engine.state, config, { developmentMode, now });
          previousTime = performance.now();
          if (bgSummary && bgSummary.simulatedSeconds >= 5 && !renderer.getActiveDrawer?.()) {
            renderer.openDrawer("offline");
          }
          renderer.render();
          if (!saveSuppressed) saveState(engine.state, developmentMode);
        } else {
          previousTime = performance.now();
        }
      }
    });

    window.addEventListener("pagehide", () => {
      engine.state.lastSavedAt = Date.now();
      if (!saveSuppressed) saveState(engine.state, developmentMode);
    });

    window.addEventListener("beforeunload", () => {
      engine.state.lastSavedAt = Date.now();
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
            <pre>${error.stack || ""}</pre>
          </div>
        </section>
      `;
    }
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  start();
}
