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
    <article class="panel record-panel">
      <p class="panel__label">SIMULATION RECORD</p>
      <strong>${TEXT.record}</strong>
      <span>ORIGIN // UNKNOWN</span>
    </article>
  `;
}

function renderEnergy(state, config, developmentMode) {
  const production = calculateProduction(state, config, developmentMode);
  const capacityProgress = state.energy / config.energy.powerCellCapacity;

  return `
    <article class="panel energy-panel">
      <div class="panel__heading">
        <div>
          <p class="panel__label">STORED ENERGY</p>
        <strong class="energy-readout" data-field="energy">${formatEnergy(state.energy)}</strong>
        </div>
        <span class="status status--online">CRC ONLINE</span>
      </div>
      ${progressBar(capacityProgress, "Power Cell charge", "energy", "energy")}
      <div class="metric-row">
        <span>Power Cell capacity</span>
        <strong>${formatEnergy(config.energy.powerCellCapacity)}</strong>
      </div>
      <div class="metric-row">
        <span>Energy production</span>
        <strong>${
          state.devices.autoCalculator ? formatRate(production) : "UNMEASURED"
        }</strong>
      </div>
      <div class="metric-row">
        <span>Condensers online</span>
        <strong>${state.crcCount}</strong>
      </div>
      ${button("Manual Condensing", "manual-condense", {
        detail: `+${formatEnergy(config.energy.manualCondensingGain)}`,
        variant: "energy"
      })}
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
      <p class="muted">Refine the condensation algorithm through repeated calculation and observation.</p>
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
  const revealed =
    state.devices.autoCalculator ||
    state.improvements >= config.autoCalculator.revealAtImprovements;

  if (!revealed) return "";

  const unlocked =
    state.improvements >= config.autoCalculator.unlockAtImprovements;
  const affordable = state.energy >= config.autoCalculator.cost;

  return `
    <article class="panel device-card ${state.devices.autoCalculator ? "device-card--online" : ""}">
      <div class="panel__heading">
        <div>
          <p class="panel__label">DEVICE</p>
          <h2>Auto Calculator</h2>
        </div>
        <span class="status ${state.devices.autoCalculator ? "status--online" : "status--locked"}">
          ${state.devices.autoCalculator ? "ONLINE" : unlocked ? "AVAILABLE" : "ANALYZING"}
        </span>
      </div>
      <p class="muted">Automates Algorithm Improvements and completes them twice as fast.</p>
      ${
        state.devices.autoCalculator
          ? '<p class="effect-line">AUTOMATION ACTIVE // ×2 STUDY SPEED</p>'
          : button("Activate Auto Calculator", "buy-auto", {
              disabled: !unlocked || !affordable,
              detail: unlocked
                ? `Cost: ${formatEnergy(config.autoCalculator.cost)}`
                : `Requires ${config.autoCalculator.unlockAtImprovements} Improvements`,
              variant: unlocked ? "primary" : "ghost"
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
      <p class="muted">The condenser can now be studied directly and reconstructed from local materials.</p>
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
  if (
    !state.discoveries.crcBlueprint &&
    state.crcCount < config.crcConstruction.maximumCrcs
  ) {
    return "";
  }

  const unlocked = state.crcCount >= config.crcConstruction.maximumCrcs;

  return `
    <article class="panel device-card ${state.devices.processor ? "device-card--online" : ""}">
      <div class="panel__heading">
        <div>
          <p class="panel__label">DEVICE</p>
          <h2>Processor</h2>
        </div>
        <span class="status ${state.devices.processor ? "status--online" : "status--locked"}">
          ${state.devices.processor ? "ONLINE" : unlocked ? "AVAILABLE" : "NO HOST NETWORK"}
        </span>
      </div>
      <p class="muted">A generic processing core capable of accelerating every connected device.</p>
      ${
        state.devices.processor
          ? '<p class="effect-line">DEVICE EXECUTION TIME ×0.90</p>'
          : button("Install Processor", "buy-processor", {
              disabled: !unlocked || state.energy < config.processor.cost,
              detail: unlocked
                ? `Cost: ${formatEnergy(config.processor.cost)}`
                : "Requires two active CRCs",
              variant: unlocked ? "primary" : "ghost"
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
    <article class="panel door-panel">
      <div class="door-mark" aria-hidden="true"><span></span></div>
      <p class="panel__label">RESTRICTED ACCESS</p>
      <h2>Particle Laboratory</h2>
      <strong class="door-status">${status}</strong>
      ${progressBar(progress, "Particle Laboratory power response", "door", "door")}
      <p class="muted">The locking system does not respond. Additional infrastructure is required.</p>
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

  const autoCalculatorRevealed =
    state.devices.autoCalculator ||
    state.improvements >= config.autoCalculator.revealAtImprovements;
  const autoCalculatorUnlocked =
    state.improvements >= config.autoCalculator.unlockAtImprovements;
  const autoCalculatorAffordable =
    state.energy >= config.autoCalculator.cost;
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
    autoCalculator: state.devices.autoCalculator,
    autoCalculatorRevealed,
    autoCalculatorUnlocked,
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
        <div class="overview-grid">
          ${renderRecord()}
          ${renderEnergy(state, config, developmentMode)}
        </div>
        ${renderStudy(state, config, developmentMode)}
        <section class="section-stack" aria-label="Devices and discoveries">
          ${renderAutoCalculator(state, config)}
          ${renderBlueprint(state, config)}
          ${renderProcessor(state, config)}
        </section>
        ${developmentMode ? renderDevelopmentPanel() : ""}
      </div>
      <aside class="dashboard-aside">
        ${renderDoor(state, config)}
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

    app.innerHTML = renderGame(state, config, developmentMode);
    updateDynamicFields(app, state, config, developmentMode);
  };
}
