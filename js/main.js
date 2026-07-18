import { GameEngine } from "./engine.js";
import { deleteState, loadState, saveState } from "./save-system.js";
import { createRenderer } from "./ui.js";

async function loadConfig() {
  if (globalThis.__TES_GAME_CONFIG__) {
    return globalThis.__TES_GAME_CONFIG__;
  }

  const response = await fetch("config/game-config.json");
  if (!response.ok) throw new Error("Game configuration could not be loaded.");
  return response.json();
}

function bindActions(app, engine, resetSave) {
  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;

    const actions = {
      "press-button": () => engine.pressButton(),
      "leave-room": () => engine.leaveRoom(),
      "return-to-room": () => engine.returnToRoom(),
      "manual-condense": () => engine.manualCondense(),
      "start-study": () => engine.startStudy(false),
      "buy-auto": () => engine.purchaseAutoCalculator(),
      "construct-crc": () => engine.startCrcConstruction(),
      "buy-processor": () => engine.purchaseProcessor(),
      "dev-add-energy": () => engine.developmentAddEnergy(),
      "dev-complete-study": () => engine.developmentCompleteStudy(),
      "dev-force-blueprint": () => engine.developmentForceBlueprint(),
      "reset-save": resetSave
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
    const engine = new GameEngine({ state, config, developmentMode });
    const render = createRenderer(app, config, developmentMode);

    window.clearTimeout(window.__TES_BOOT_TIMEOUT__);

    const resetSave = () => {
      const confirmed = window.confirm(
        "Delete all progress for this mode? This cannot be undone."
      );
      if (!confirmed) return;
      deleteState(developmentMode);
      window.location.reload();
    };

    bindActions(app, engine, resetSave);
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
        saveState(state, developmentMode);
        previousSave = now;
      }

      window.requestAnimationFrame(frame);
    }

    window.addEventListener("beforeunload", () => {
      saveState(state, developmentMode);
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
