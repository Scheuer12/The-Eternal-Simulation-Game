import { TEXT } from "../content/texts.js";
import {
  calculateDoorProgress,
  calculateImprovementBonus,
  calculateProduction,
  calculateStudyDuration,
  calculateUpgradeChance,
  clamp,
  formatDuration,
  formatEnergy,
  formatPercent,
  formatRate
} from "./formulas.js";

function button(label, action, options = {}) {
  const {
    disabled = false,
    variant = "primary",
    detail = "",
    className = ""
  } = options;

  return `
    <button
      class="button button--${variant} ${className}"
      data-action="${action}"
      ${disabled ? "disabled" : ""}
    >
      <span>${label}</span>
      ${detail ? `<small>${detail}</small>` : ""}
    </button>
  `;
}

function progressBar(value, label, tone = "energy", key = "") {
  const percentage = clamp(value, 0, 1) * 100;
  return `
    <div class="progress" ${key ? `data-progress="${key}"` : ""} role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage.toFixed(1)}">
      <div class="progress__fill progress__fill--${tone}" style="width:${percentage}%"></div>
    </div>
  `;
}

function helpNote(text) {
  return `
    <details class="help-note">
      <summary aria-label="More information">?</summary>
      <p>${text}</p>
    </details>
  `;
}

function renderTelemetry(state, config, developmentMode) {
  const production = calculateProduction(state, config, developmentMode);
  const remainingCapacity = Math.max(
    0,
    config.energy.powerCellCapacity - state.energy
  );
  const fillTime =
    production > 0 && remainingCapacity > 0
      ? formatDuration(remainingCapacity / production)
      : "FULL";

  if (!state.devices.softDataDisplay) return "";

  return `
    <div class="telemetry-grid">
      <div>
        <span>Production</span>
        <strong data-field="energy-rate">${formatRate(production)}</strong>
      </div>
      <div>
        <span>Cell fill estimate</span>
        <strong data-field="fill-time">${fillTime}</strong>
      </div>
      <div>
        <span>Total condensed</span>
        <strong data-field="total-energy">${formatEnergy(state.stats.totalEnergyCollected)}</strong>
      </div>
    </div>
  `;
}

function renderIntro() {
  return `
    <section class="screen intro-screen">
      <div class="intro-atmosphere" aria-hidden="true"></div>
      <div class="intro-copy panel panel--narrative">
        <p class="eyebrow">${TEXT.intro.eyebrow}</p>
        <h1>${TEXT.intro.title}</h1>
        ${TEXT.intro.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}
        <div class="button-row button-row--intro">
          ${button(TEXT.intro.press, "press-button", { variant: "glow" })}
          ${button(TEXT.intro.leave, "leave-room", { variant: "ghost" })}
        </div>
      </div>
    </section>
  `;
}

function renderEnding() {
  return `
    <section class="screen screen--centered">
      <div class="panel panel--narrative ending-card">
        <p class="eyebrow eyebrow--warning">${TEXT.ending.eyebrow}</p>
        <h1>${TEXT.ending.title}</h1>
        <p>${TEXT.ending.body}</p>
        ${button(TEXT.ending.restart, "return-to-room", { variant: "ghost" })}
      </div>
    </section>
  `;
}

function renderCrcBriefing() {
  return `
    <section class="screen screen--centered">
      <div class="panel panel--narrative system-briefing">
        <p class="eyebrow">${TEXT.crcBriefing.eyebrow}</p>
        <h1>${TEXT.crcBriefing.title}</h1>
        ${TEXT.crcBriefing.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}
        <div class="briefing-note">
          <span>CRC</span>
          <p>A condenser is passive infrastructure: once online, it gathers energy continuously.</p>
        </div>
        <div class="button-row button-row--intro">
          ${button(TEXT.crcBriefing.continue, "activate-crc", { variant: "glow" })}
        </div>
      </div>
    </section>
  `;
}

function renderHeader(state, developmentMode) {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">THE ETERNAL SIMULATION</p>
        <h1>Facility Control</h1>
      </div>
      <div class="topbar__actions">
        ${developmentMode ? '<span class="badge badge--dev">DEVELOPMENT</span>' : ""}
        ${button("Reset save", "reset-save", { variant: "text" })}
      </div>
    </header>
  `;
}

function renderRecord() {
  return `
    <article class="ambient-record">
      <p class="panel__label">BEST SIMULATION RECORD</p>
      <strong>${TEXT.record}</strong>
      <span>ORIGIN // UNKNOWN</span>
      <p>The number repeats in recovered logs. It is not a task yet.</p>
    </article>
  `;
}

function renderEnergy(state, config, developmentMode) {
  const production = calculateProduction(state, config, developmentMode);
  const capacityProgress = state.energy / config.energy.powerCellCapacity;
  const displayTelemetry = state.devices.softDataDisplay;

  return `
    <article class="panel energy-panel">
      <div class="panel__heading">
        <div>
          <p class="panel__label">STORED ENERGY</p>
        <strong class="energy-readout" data-field="energy">${formatEnergy(state.energy)}</strong>
        </div>
        <span class="status status--online">CELL STABLE</span>
      </div>
      ${progressBar(capacityProgress, "Power Cell charge", "energy", "energy")}
      ${helpNote("Stored Energy is the usable charge held by the current Power Cell. Devices spend it to restore parts of the facility.")}
      <div class="metric-row">
        <span>Power Cell capacity</span>
        <strong>${formatEnergy(config.energy.powerCellCapacity)}</strong>
      </div>
      <div class="metric-row">
        <span>Power Cells installed</span>
        <strong>1</strong>
      </div>
      <div class="metric-row">
        <span>Energy production</span>
        <strong>${
          displayTelemetry ? formatRate(production) : "UNREADABLE"
        }</strong>
      </div>
      <div class="metric-row">
        <span>Condensers online</span>
        <strong>${state.crcCount}</strong>
      </div>
      ${renderTelemetry(state, config, developmentMode)}
    </article>
  `;
}

function renderCrcDevice(state, config, developmentMode) {
  const production = calculateProduction(state, config, developmentMode);

  return `
    <article class="panel device-card condenser-card device-card--online">
      <div class="panel__heading">
        <div>
          <p class="panel__label">DEVICE // ONLINE</p>
          <h2>Cosmic Radiation Condenser</h2>
        </div>
        <span class="count-chip">${state.crcCount}</span>
      </div>
      <p class="muted">The CRC listens to cosmic background radiation and compresses trace signals into charge the Power Cell can hold.</p>
      ${helpNote("Each active condenser adds passive energy production. Improvements and Upgrades modify every CRC at once.")}
      <div class="metric-row">
        <span>Current output</span>
        <strong>${
          state.devices.softDataDisplay ? formatRate(production) : "UNREADABLE"
        }</strong>
      </div>
    </article>
  `;
}

function renderSoftDataDisplay(state, config) {
  const affordable = state.energy >= config.softDataDisplay.cost;

  return `
    <article class="panel device-card ${state.devices.softDataDisplay ? "device-card--online" : ""}">
      <div class="panel__heading">
        <div>
          <p class="panel__label">DEVICE</p>
          <h2>Soft Data Display</h2>
        </div>
        <span class="status ${state.devices.softDataDisplay ? "status--online" : "status--locked"}">
          ${state.devices.softDataDisplay ? "ONLINE" : affordable ? "AVAILABLE" : "UNPOWERED"}
        </span>
      </div>
      <p class="muted">A dim diagnostic surface that translates condenser noise into readable production telemetry.</p>
      ${helpNote("This display does not increase production. It reveals energy per second, fill estimates, and related soft data so the facility's progress becomes legible.")}
      ${
        state.devices.softDataDisplay
          ? '<p class="effect-line">TELEMETRY READABLE // ENERGY FLOW EXPOSED</p>'
          : button("Restore Soft Data Display", "buy-soft-display", {
              disabled: !affordable,
              detail: `Cost: ${formatEnergy(config.softDataDisplay.cost)}`,
              variant: affordable ? "primary" : "ghost"
            })
      }
    </article>
  `;
}

function renderStudy(state, config, developmentMode) {
  const nextBonus = calculateImprovementBonus(state.improvements, config);
  const upgradeChance = calculateUpgradeChance(state.upgrades, config);
  const previewDuration = calculateStudyDuration(
    state,
    config,
    developmentMode
  );
  const studyProgress = state.study.active
    ? state.study.elapsed / state.study.duration
    : 0;

  return `
    <article class="panel study-panel">
      <div class="panel__heading">
        <div>
          <p class="panel__label">STUDY</p>
          <h2>Algorithm Improvement</h2>
        </div>
        <span class="count-chip">${state.improvements}</span>
      </div>
      <p class="muted">Study is the facility's first control loop: it improves how the CRC converts background radiation into Stored Energy.</p>
      ${helpNote("Algorithm Improvements always complete. Algorithm Upgrades are rare discoveries that can appear after a Study and double energy production.")}
      <div class="study-metrics">
        <div><span>Next efficiency gain</span><strong>+${formatPercent(nextBonus)}</strong></div>
        <div><span>Upgrade probability</span><strong>${formatPercent(upgradeChance, upgradeChance < 0.001 ? 4 : 2)}</strong></div>
        <div><span>Estimated duration</span><strong>${formatDuration(previewDuration)}</strong></div>
      </div>
      ${progressBar(studyProgress, "Algorithm Improvement progress", "study", "study")}
      <div class="progress-caption">
        <span data-field="study-status">${state.study.active ? (state.study.automated ? "AUTO CALCULATION" : "CALCULATION IN PROGRESS") : "READY"}</span>
        <span data-field="study-remaining">${state.study.active ? formatDuration(Math.max(0, state.study.duration - state.study.elapsed)) : ""}</span>
      </div>
      ${button(
        state.study.active ? "Study in progress" : "Start Improvement",
        "start-study",
        {
          disabled: state.study.active || state.devices.autoCalculator,
          variant: state.devices.autoCalculator ? "ghost" : "primary"
        }
      )}
    </article>
  `;
}

function renderAutoCalculator(state, config) {
  const affordable = state.energy >= config.autoCalculator.cost;

  return `
    <article class="panel device-card ${state.devices.autoCalculator ? "device-card--online" : ""}">
      <div class="panel__heading">
        <div>
          <p class="panel__label">DEVICE</p>
          <h2>Auto Calculator</h2>
        </div>
        <span class="status ${state.devices.autoCalculator ? "status--online" : "status--locked"}">
          ${state.devices.autoCalculator ? "ONLINE" : affordable ? "AVAILABLE" : "UNPOWERED"}
        </span>
      </div>
      <p class="muted">A recovered calculation unit. It runs Studies without manual input and completes them twice as fast.</p>
      ${helpNote("The Auto Calculator costs Stored Energy to reactivate. Once online, it starts the next Study automatically.")}
      ${
        state.devices.autoCalculator
          ? '<p class="effect-line">AUTOMATION ACTIVE // ×2 STUDY SPEED</p>'
          : button("Activate Auto Calculator", "buy-auto", {
              disabled: !affordable,
              detail: `Cost: ${formatEnergy(config.autoCalculator.cost)}`,
              variant: affordable ? "primary" : "ghost"
            })
      }
    </article>
  `;
}

function renderBlueprint(state, config) {
  if (!state.discoveries.crcBlueprint) return "";

  const complete = state.crcCount >= config.crcConstruction.maximumCrcs;
  const progress = state.construction.active
    ? state.construction.elapsed / state.construction.duration
    : complete
      ? 1
      : 0;

  return `
    <article class="panel discovery-card">
      <div class="panel__heading">
        <div>
          <p class="panel__label">TECHNOLOGY RECOVERED</p>
          <h2>CRC Blueprint</h2>
        </div>
        <span class="status status--discovery">RESOLVED</span>
      </div>
      <p class="muted">A recovered structural plan for the CRC. It lets the facility analyze the condenser directly and build a second unit.</p>
      ${helpNote("This structural plan was not listed in the facility index. It appears only after discovery.")}
      <p class="effect-line">STUDY TIME ×0.65</p>
      ${state.construction.active ? progressBar(progress, "CRC construction", "discovery", "construction") : ""}
      <div class="progress-caption">
        <span data-field="construction-status">${state.construction.active ? "CRC CONSTRUCTION" : complete ? "SECOND CRC ONLINE" : "FABRICATION READY"}</span>
        <span data-field="construction-remaining">${state.construction.active ? formatDuration(Math.max(0, state.construction.duration - state.construction.elapsed)) : ""}</span>
      </div>
      ${
        complete
          ? ""
          : button("Construct another CRC", "construct-crc", {
              disabled:
                state.construction.active ||
                state.energy < config.crcConstruction.cost,
              detail: `Cost: ${formatEnergy(config.crcConstruction.cost)}`,
              variant: "primary"
            })
      }
    </article>
  `;
}

function renderProcessor(state, config) {
  const affordable = state.energy >= config.processor.cost;

  return `
    <article class="panel device-card ${state.devices.processor ? "device-card--online" : ""}">
      <div class="panel__heading">
        <div>
          <p class="panel__label">DEVICE</p>
          <h2>Processor</h2>
        </div>
        <span class="status ${state.devices.processor ? "status--online" : "status--locked"}">
          ${state.devices.processor ? "ONLINE" : affordable ? "AVAILABLE" : "UNPOWERED"}
        </span>
      </div>
      <p class="muted">A generic processing core. Once installed, connected devices respond faster and the MVP-0 facility loop is complete.</p>
      ${helpNote("The Processor is the first major restoration target. It only needs enough Stored Energy to reactivate.")}
      ${
        state.devices.processor
          ? '<p class="effect-line">DEVICE EXECUTION TIME ×0.90</p>'
          : button("Install Processor", "buy-processor", {
              disabled: !affordable,
              detail: `Cost: ${formatEnergy(config.processor.cost)}`,
              variant: affordable ? "primary" : "ghost"
            })
      }
    </article>
  `;
}

function renderDoor(state, config) {
  const progress = calculateDoorProgress(state, config);
  let status = "LOW POWER";
  if (progress > 0.75) status = "AUXILIARY CURRENT DETECTED";
  else if (progress > 0.45) status = "SYSTEM RESPONSE DETECTED";
  else if (progress > 0.2) status = "TRACE CURRENT";

  return `
    <article class="ambient-door">
      <p class="panel__label">UNOPENED ROUTE</p>
      <div class="ambient-door__heading">
        <h2>Particle Laboratory</h2>
        <strong class="door-status">${status}</strong>
      </div>
      ${progressBar(progress, "Particle Laboratory power response", "door", "door")}
      <p class="muted">A dead line on the facility map mentions particle synthesis. The route stays quiet, reacting only to rising power.</p>
    </article>
  `;
}

function renderLog(state) {
  const entries = state.log.length
    ? state.log
        .slice(0, 12)
        .map(
          (entry) => `
            <li class="log-entry log-entry--${entry.tone}">
              <time>${formatDuration(entry.at)}</time>
              <span>${entry.message}</span>
            </li>
          `
        )
        .join("")
    : '<li class="log-entry"><time>0.0s</time><span>No system events recorded.</span></li>';

  return `
    <article class="panel log-panel">
      <p class="panel__label">FACILITY LOG</p>
      <ol class="log-list">${entries}</ol>
    </article>
  `;
}

function renderDevelopmentPanel() {
  return `
    <article class="panel dev-panel">
      <p class="panel__label">DEVELOPMENT CONTROLS</p>
      <div class="dev-actions">
        ${button("Add 0.25 J", "dev-add-energy", { variant: "ghost" })}
        ${button("Complete Study", "dev-complete-study", { variant: "ghost" })}
        ${button("Force Blueprint", "dev-force-blueprint", { variant: "ghost" })}
      </div>
    </article>
  `;
}

function renderCompletion() {
  return `
    <article class="panel completion-panel">
      <p class="eyebrow">MILESTONE REACHED</p>
      <h2>PROCESSING NETWORK ONLINE</h2>
      <p>${TEXT.processorComplete}</p>
      <p class="completion-panel__note">END OF MVP-0 // SAVE PRESERVED</p>
    </article>
  `;
}

function renderSection(title, label, note, content, className = "") {
  return `
    <section class="layer-section ${className}">
      <div class="section-heading">
        <div>
          <p class="panel__label">${label}</p>
          <h2>${title}</h2>
        </div>
        <p>${note}</p>
      </div>
      ${content}
    </section>
  `;
}

function setField(app, key, value) {
  const element = app.querySelector(`[data-field="${key}"]`);
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function setProgress(app, key, value) {
  const percentage = clamp(value, 0, 1) * 100;
  const progress = app.querySelector(`[data-progress="${key}"]`);
  const fill = progress?.querySelector(".progress__fill");

  if (!progress || !fill) return;

  progress.setAttribute("aria-valuenow", percentage.toFixed(1));
  fill.style.width = `${percentage}%`;
}

function createRenderSignature(state, config, developmentMode) {
  if (state.introState !== "active") {
    return JSON.stringify({
      introState: state.introState
    });
  }

  const autoCalculatorAffordable =
    state.energy >= config.autoCalculator.cost;
  const softDataDisplayAffordable =
    state.energy >= config.softDataDisplay.cost;
  const crcComplete =
    state.crcCount >= config.crcConstruction.maximumCrcs;
  const crcAffordable =
    state.energy >= config.crcConstruction.cost;
  const processorAffordable =
    state.energy >= config.processor.cost;

  return JSON.stringify({
    introState: state.introState,
    developmentMode,
    improvements: state.improvements,
    upgrades: state.upgrades,
    crcCount: state.crcCount,
    softDataDisplay: state.devices.softDataDisplay,
    softDataDisplayAffordable,
    autoCalculator: state.devices.autoCalculator,
    autoCalculatorAffordable,
    processor: state.devices.processor,
    processorAffordable,
    crcBlueprint: state.discoveries.crcBlueprint,
    crcComplete,
    crcAffordable,
    studyActive: state.study.active,
    studyAutomated: state.study.automated,
    constructionActive: state.construction.active,
    prototypeComplete: state.prototypeComplete,
    latestLogId: state.log[0]?.id ?? ""
  });
}

function updateDynamicFields(app, state, config, developmentMode) {
  if (state.introState !== "active") return;

  setField(app, "energy", formatEnergy(state.energy));
  setProgress(app, "energy", state.energy / config.energy.powerCellCapacity);
  setProgress(app, "door", calculateDoorProgress(state, config));

  if (state.devices.softDataDisplay) {
    const production = calculateProduction(state, config, developmentMode);
    const remainingCapacity = Math.max(
      0,
      config.energy.powerCellCapacity - state.energy
    );
    const fillTime =
      production > 0 && remainingCapacity > 0
        ? formatDuration(remainingCapacity / production)
        : "FULL";

    setField(app, "energy-rate", formatRate(production));
    setField(app, "fill-time", fillTime);
    setField(app, "total-energy", formatEnergy(state.stats.totalEnergyCollected));
  }

  if (state.study.active) {
    setProgress(app, "study", state.study.elapsed / state.study.duration);
    setField(
      app,
      "study-remaining",
      formatDuration(Math.max(0, state.study.duration - state.study.elapsed))
    );
  }

  if (state.construction.active) {
    setProgress(
      app,
      "construction",
      state.construction.elapsed / state.construction.duration
    );
    setField(
      app,
      "construction-remaining",
      formatDuration(
        Math.max(0, state.construction.duration - state.construction.elapsed)
      )
    );
  }
}

function renderGame(state, config, developmentMode) {
  return `
    ${renderHeader(state, developmentMode)}
    ${state.prototypeComplete ? renderCompletion() : ""}
    <section class="dashboard-grid">
      <div class="dashboard-main">
        ${renderSection(
          "Energy Layer",
          "LAYER 1 // CONDENSATION",
          "The facility converts a faint cosmic signal into Stored Energy and keeps it inside the first Power Cell.",
          `<div class="energy-layout">
            ${renderEnergy(state, config, developmentMode)}
            ${renderCrcDevice(state, config, developmentMode)}
          </div>`,
          "layer-section--energy"
        )}
        ${renderSection(
          "Algorithm Study",
          "ANALYSIS LOOP",
          "Every completed study sharpens the condenser behavior; rare structural jumps are logged as discoveries.",
          renderStudy(state, config, developmentMode),
          "layer-section--study"
        )}
        ${renderSection(
          "Recovered Devices",
          "INFRASTRUCTURE",
          "Recovered hardware appears only when the current layer can support it.",
          `<div class="section-stack" aria-label="Devices and discoveries">
            ${renderSoftDataDisplay(state, config)}
            ${renderAutoCalculator(state, config)}
            ${renderBlueprint(state, config)}
            ${renderProcessor(state, config)}
          </div>`,
          "layer-section--devices"
        )}
        ${developmentMode ? renderDevelopmentPanel() : ""}
      </div>
      <aside class="dashboard-aside">
        <section class="ambient-signals" aria-label="Ambient signals">
          ${renderRecord()}
          ${renderDoor(state, config)}
        </section>
        ${renderLog(state)}
      </aside>
    </section>
  `;
}

export function createRenderer(app, config, developmentMode) {
  let lastRenderSignature = "";

  return function render(state) {
    const signature = createRenderSignature(state, config, developmentMode);

    if (signature === lastRenderSignature) {
      updateDynamicFields(app, state, config, developmentMode);
      return;
    }

    lastRenderSignature = signature;

    if (state.introState === "choice") {
      app.innerHTML = renderIntro();
      return;
    }

    if (state.introState === "left") {
      app.innerHTML = renderEnding();
      return;
    }

    if (state.introState === "crc-briefing") {
      app.innerHTML = renderCrcBriefing();
      return;
    }

    app.innerHTML = renderGame(state, config, developmentMode);
    updateDynamicFields(app, state, config, developmentMode);
  };
}
