import { TEXT } from "../content/texts.js";
import {
  calculateAlgorithmUpgradeDuration,
  calculateAlgorithmUpgradeRequirement,
  calculateAutoCalculatorSpeedMultiplier,
  calculateBlueprintResearchDuration,
  calculateCalculationMethodRequirement,
  calculateCrcCost,
  calculateDeviceEfficiencyMultiplier,
  calculateDoorProgress,
  calculateEffectiveProduction,
  calculateEnergyOverflowDecay,
  calculateImprovementBonus,
  calculateMatrixMechanicsSpeedMultiplier,
  calculateOverclockerDrainPerSecond,
  calculateOverclockerSpeedMultiplier,
  calculateParticleSynthesizerProgress,
  calculatePowerModuleCapacityMultiplier,
  calculateProductionBreakdown,
  calculateProduction,
  calculateSetupOptimizationRequirement,
  calculateStableEnergyCapacity,
  calculateStudyDuration,
  canAccessParticleLab,
  canResearchBlueprint,
  clamp,
  formatDuration,
  formatEnergy,
  formatPercent,
  formatRate
} from "./formulas.js";
import {
  buildAvailabilitySnapshot,
  evaluateComponent
} from "./availability.js";
import { COMPONENT_REGISTRY } from "./component-registry.js";

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
    <div class="help-note" tabindex="0" aria-label="${text}">
      <span>?</span>
      <p role="tooltip">${text}</p>
    </div>
  `;
}

function headingAction(label, action, options = {}) {
  const {
    cost = null,
    costLabel = cost !== null ? formatEnergy(cost) : "",
    count = null,
    disabled = false,
    variant = "primary"
  } = options;
  const countLabel = count === null ? "" : ` (${count})`;

  return `
    <div class="panel__action">
      ${cost !== null ? `<small>${costLabel}</small>` : ""}
      ${button(`${label}${countLabel}`, action, {
        disabled,
        variant,
        className: "button--compact"
      })}
    </div>
  `;
}

function statusPill(text, tone = "") {
  return `<span class="status ${tone ? `status--${tone}` : ""}">${text}</span>`;
}

const TAB_DEFINITIONS = [
  { id: "devices", label: "Devices" },
  { id: "studies", label: "Studies" },
  { id: "measure", label: "Measure", visible: (state) => state.devices.t2SoftDataDisplay },
  { id: "science", label: "Science", visible: (state, config) => canAccessParticleLab(state, config) || state.sciencePoints > 0 || state.science?.syntheses > 0 },
  { id: "statistics", label: "Statistics" },
  { id: "save", label: "Save" }
];

const DEVICE_GROUPS = [
  {
    id: "energy",
    label: "Energy Devices",
    note: "Hardware that collects, stores, routes, or spends Stored Energy."
  },
  {
    id: "computational",
    label: "Computational Devices",
    note: "Hardware that exposes information or accelerates study systems."
  }
];

function isTabVisible(tab, state, config) {
  return tab.visible ? tab.visible(state, config) : true;
}

function getActiveTab(state, config) {
  const requested = state.ui?.activeTab ?? "devices";
  return TAB_DEFINITIONS.some(
    (tab) => tab.id === requested && isTabVisible(tab, state, config)
  )
    ? requested
    : "devices";
}

function getComponentsForTab(tabId) {
  return Object.values(COMPONENT_REGISTRY).filter((spec) => spec.tab === tabId);
}

export function getVisibleComponentIdsForTab(tabId, state, config) {
  return getComponentsForTab(tabId)
    .filter((spec) => evaluateComponent(spec.id, state, config).visible)
    .map((spec) => spec.id);
}

export function markTabComponentsSeen(state, config, tabId = null) {
  const activeTab = tabId ?? getActiveTab(state, config);
  if (!state.ui) return;

  const seen = { ...state.ui.seenComponents };
  for (const componentId of getVisibleComponentIdsForTab(activeTab, state, config)) {
    seen[componentId] = true;
  }
  state.ui.seenComponents = seen;
}

function getTabIndicators(tabId, state, config) {
  const seen = state.ui?.seenComponents ?? {};
  const availability = getComponentsForTab(tabId).map((spec) =>
    evaluateComponent(spec.id, state, config)
  );

  return {
    ready: availability.filter((item) => item.visible && item.enabled && !item.completed).length,
    newlyVisible: availability.filter((item) => item.visible && !seen[item.id]).length
  };
}

function renderTabBar(state, config) {
  const activeTab = getActiveTab(state, config);

  return `
    <nav class="tabbar" aria-label="Facility sections">
      ${TAB_DEFINITIONS
        .filter((tab) => isTabVisible(tab, state, config))
        .map((tab) => {
          const indicators = getTabIndicators(tab.id, state, config);
          return `
            <button
              class="tabbar__button ${tab.id === activeTab ? "tabbar__button--active" : ""}"
              data-action="set-tab"
              data-tab="${tab.id}"
              type="button"
            >
              <span>${tab.label}</span>
              ${indicators.ready > 0 ? `<strong class="tab-alert tab-alert--ready">${indicators.ready}</strong>` : ""}
              ${indicators.newlyVisible > 0 ? '<strong class="tab-alert tab-alert--new">NEW</strong>' : ""}
            </button>
          `;
        })
        .join("")}
    </nav>
  `;
}

function renderTabTools(state) {
  const hidden = Boolean(state.ui?.hideCompletedPurchases);

  return `
    <div class="tab-tools">
      <button
        class="toggle-control ${hidden ? "toggle-control--on" : ""}"
        data-action="toggle-hide-completed"
        type="button"
        role="switch"
        aria-checked="${hidden}"
      >
        <span aria-hidden="true"></span>
        <strong>${hidden ? "Show completed" : "Hide completed"}</strong>
      </button>
    </div>
  `;
}

function shouldHideCompletedComponent(componentId, state, config) {
  if (!state.ui?.hideCompletedPurchases) return false;
  const availability = evaluateComponent(componentId, state, config);
  return availability.completed;
}

function renderComponent(componentId, state, config, render) {
  return shouldHideCompletedComponent(componentId, state, config)
    ? ""
    : render();
}

function renderTelemetry(state, config, developmentMode) {
  const production = calculateProduction(state, config, developmentMode);
  const netProduction = calculateEffectiveProduction(
    state,
    config,
    developmentMode
  );
  const capacity = calculateStableEnergyCapacity(state, config);
  const overflowDecay = calculateEnergyOverflowDecay(state, config);
  const remainingCapacity = Math.max(
    0,
    capacity - state.energy
  );
  const fillTime =
    production > 0 && remainingCapacity > 0
      ? formatDuration(remainingCapacity / Math.max(production, Number.EPSILON))
      : state.energy > capacity
        ? "EQUILIBRATING"
        : "FULL";

  if (!state.devices.softDataDisplay) return "";

  return `
    <div class="telemetry-grid">
      <div>
        <span>Raw production</span>
        <strong data-field="energy-rate">${formatRate(production)}</strong>
      </div>
      <div>
        <span>Net flow</span>
        <strong data-field="retained-rate">${formatRate(netProduction)}</strong>
      </div>
      <div>
        <span>Stable fill estimate</span>
        <strong data-field="fill-time">${fillTime}</strong>
      </div>
      <div>
        <span>Overflow decay</span>
        <strong data-field="energy-retention">${formatRate(overflowDecay)}</strong>
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
        ${
          developmentMode
            ? button("Exit dev", "exit-dev-mode", { variant: "text" })
            : button("Dev mode", "enter-dev-mode", { variant: "text" })
        }
        ${button("Save now", "save-now", { variant: "text" })}
        ${button("Reset current", "reset-current-save", { variant: "text" })}
      </div>
    </header>
  `;
}

function formatSaveTime(timestamp) {
  if (!timestamp) return "EMPTY";
  const savedAt = new Date(timestamp);
  if (Number.isNaN(savedAt.getTime())) return "CORRUPT";
  return savedAt.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderSaveManagement(saveSlots, developmentMode) {
  const slots = saveSlots?.length ? saveSlots : [];

  return `
    <article class="panel save-panel">
      <div class="panel__heading">
        <div>
          <p class="panel__label">SAVE MANAGEMENT</p>
          <h2>Simulation Memory</h2>
        </div>
      </div>
      <div class="save-slots">
        ${slots
          .map(
            (slot) => `
              <div class="save-slot ${slot.developmentMode === developmentMode ? "save-slot--current" : ""}">
                <span>${slot.label}</span>
                <strong>${formatSaveTime(slot.lastSavedAt)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="dev-actions save-actions">
        ${button("Save now", "save-now", { variant: "secondary" })}
        ${button("Reset current", "reset-current-save", { variant: "ghost" })}
        ${button("Reset normal", "reset-normal-save", { variant: "ghost" })}
        ${button("Reset dev", "reset-development-save", { variant: "ghost" })}
        ${button("Reset all", "reset-all-saves", { variant: "ghost" })}
      </div>
    </article>
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
  const netProduction = calculateEffectiveProduction(
    state,
    config,
    developmentMode
  );
  const capacity = calculateStableEnergyCapacity(state, config);
  const overflowDecay = calculateEnergyOverflowDecay(state, config);
  const capacityProgress = state.energy / capacity;
  const displayTelemetry = state.devices.softDataDisplay;
  const overflowing = state.energy > capacity;

  return `
    <article class="panel energy-panel">
      <div class="panel__heading">
        <div>
          <p class="panel__label">STORED ENERGY</p>
        <strong class="energy-readout" data-field="energy">${formatEnergy(state.energy)}</strong>
        </div>
        <span class="status ${overflowing ? "status--warning" : "status--online"}">
          ${overflowing ? "EXCESS UNSTABLE" : "CELL STABLE"}
        </span>
      </div>
      ${progressBar(capacityProgress, "Stable Power Cell charge", "energy", "energy")}
      ${helpNote("Power Cells define stable capacity. Energy above that capacity is still usable, but unstable excess leaks back into background noise every second. More excess means faster decay.")}
      <div class="metric-row">
        <span>Stable capacity</span>
        <strong data-field="stable-capacity">${formatEnergy(capacity)}</strong>
      </div>
      <div class="metric-row">
        <span>Power Cells installed</span>
        <strong data-field="power-cells">${state.powerCells}</strong>
      </div>
      <div class="metric-row">
        <span>Net flow</span>
        <strong data-field="retained-rate-main">${
          displayTelemetry ? formatRate(netProduction) : "UNREADABLE"
        }</strong>
      </div>
      <div class="metric-row">
        <span>Overflow decay</span>
        <strong data-field="energy-retention-main">${displayTelemetry ? formatRate(overflowDecay) : "UNREADABLE"}</strong>
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
      ${helpNote("Each active condenser adds passive energy production. Improvements and Upgrades modify every CRC at once.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">ENERGY DEVICE // ONLINE</p>
          <h2>Cosmic Radiation Condenser</h2>
        </div>
        ${statusPill(`${state.crcCount} ONLINE`, "online")}
      </div>
      <p class="muted">Collects cosmic radiation and condenses it into usable energy.</p>
      <div class="metric-row">
        <span>Current output</span>
        <strong>${
          state.devices.softDataDisplay ? formatRate(production) : "UNREADABLE"
        }</strong>
      </div>
    </article>
  `;
}

function renderPowerCellArray(state, config) {
  const availability = evaluateComponent("powerCell", state, config);
  if (!availability.visible) return "";

  const cost = availability.cost;
  const capacity = calculateStableEnergyCapacity(state, config);
  const nextCapacity = calculateStableEnergyCapacity(
    { ...state, powerCells: state.powerCells + 1 },
    config
  );
  const moduleMultiplier = calculatePowerModuleCapacityMultiplier(state, config);

  return `
    <article class="panel device-card power-cell-card">
      ${helpNote("Buying a Power Cell expands stable capacity. It does not increase raw production, but it raises the point where overflow decay starts pushing back against Stored Energy.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">ENERGY DEVICE</p>
          <h2>Power Cell Array</h2>
        </div>
        <div class="panel__action-group">
          ${headingAction("Add Cell", "buy-power-cell", {
            cost,
            count: state.powerCells,
            disabled: !availability.enabled,
            variant: availability.enabled ? "primary" : "ghost"
          })}
          ${headingAction("Buy Max", "buy-max-power-cells", {
            disabled: !availability.enabled,
            variant: availability.enabled ? "secondary" : "ghost"
          })}
        </div>
      </div>
      <p class="muted">Stable cells give condensed energy somewhere to stay.</p>
      <div class="metric-row">
        <span>Current stable capacity</span>
        <strong>${formatEnergy(capacity)}</strong>
      </div>
      <div class="metric-row">
        <span>Next stable capacity</span>
        <strong>${formatEnergy(nextCapacity)}</strong>
      </div>
      <div class="metric-row">
        <span>Module routing</span>
        <strong>${state.powerModules} / x${moduleMultiplier.toFixed(2)}</strong>
      </div>
    </article>
  `;
}

function renderPowerModule(state, config) {
  const availability = evaluateComponent("powerModule", state, config);
  if (!availability.visible) return "";

  const requirement = availability.requirement;
  const currentMultiplier = calculatePowerModuleCapacityMultiplier(state, config);
  const nextMultiplier = calculatePowerModuleCapacityMultiplier(
    { ...state, powerModules: state.powerModules + 1 },
    config
  );

  return `
    <article class="panel device-card">
      ${helpNote("Power Modules do not consume Power Cells. They activate capture and conduction circuits around each full group of 100 cells, increasing effective stable capacity.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">ENERGY DEVICE</p>
          <h2>Power Module</h2>
        </div>
        ${headingAction("Install", "buy-power-module", {
          cost: availability.cost,
          count: state.powerModules,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost"
        })}
      </div>
      <p class="muted">Activates capture and conduction circuits that organize Power Cells into a stronger storage route.</p>
      <div class="metric-row">
        <span>Cell requirement</span>
        <strong>${Math.min(state.powerCells, requirement)} / ${requirement}</strong>
      </div>
      <div class="metric-row">
        <span>Capacity route</span>
        <strong>x${currentMultiplier.toFixed(2)} -> x${nextMultiplier.toFixed(2)}</strong>
      </div>
    </article>
  `;
}

function renderSoftDataDisplay(state, config) {
  const availability = evaluateComponent("softDataDisplay", state, config);

  return `
    <article class="panel device-card ${state.devices.softDataDisplay ? "device-card--online" : ""}">
      ${helpNote("Soft Display reveals usable energy production rate, Power Cell capacity, capacity occupation, and the current decay rate of unstable overflow energy.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">COMPUTATIONAL DEVICE</p>
          <h2>Soft Display</h2>
        </div>
        ${
          state.devices.softDataDisplay
            ? statusPill("ONLINE", "online")
            : headingAction("Restore", "buy-soft-display", {
                cost: availability.cost,
                disabled: !availability.enabled,
                variant: availability.enabled ? "primary" : "ghost"
              })
        }
      </div>
      <p class="muted">${
        state.devices.softDataDisplay
          ? "Shows basic useful information."
          : "Seems like with enough power this display could show some useful information."
      }</p>
      ${
        state.devices.softDataDisplay
          ? '<p class="effect-line">TELEMETRY READABLE // ENERGY FLOW EXPOSED</p>'
          : ""
      }
    </article>
  `;
}

function renderT2SoftDataDisplay(state, config) {
  const availability = evaluateComponent("t2SoftDataDisplay", state, config);
  if (!availability.visible) return "";

  return `
    <article class="panel device-card ${state.devices.t2SoftDataDisplay ? "device-card--online" : ""}">
      ${helpNote("T2 Soft Display unlocks the Measure tab, separating current output into base condenser signal and active production bonuses. It does not change production by itself.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">COMPUTATIONAL DEVICE</p>
          <h2>T2 Soft Display</h2>
        </div>
        ${
          state.devices.t2SoftDataDisplay
            ? statusPill("ONLINE", "online")
            : headingAction("Restore", "buy-t2-soft-display", {
                cost: availability.cost,
                disabled: !availability.enabled,
                variant: availability.enabled ? "primary" : "ghost"
              })
        }
      </div>
      <p class="muted">${
        state.devices.t2SoftDataDisplay
          ? "The Measure tab now separates condenser output into readable source layers."
          : "A dim second layer under the Soft Display waits for enough stored power to decode output composition."
      }</p>
      ${
        state.devices.t2SoftDataDisplay
          ? '<p class="effect-line">OUTPUT COMPOSITION READABLE</p>'
          : ""
      }
    </article>
  `;
}

function renderStudy(state, config, developmentMode) {
  const nextBonus = calculateImprovementBonus(
    state.improvements,
    config,
    state.calculationMethods
  );
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
      ${helpNote("Algorithm Improvements always complete. After enough Improvements, an Algorithm Upgrade study can be run manually. It doubles CRC production and resets Improvements.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">STUDY</p>
          <h2>Algorithm Improvement</h2>
        </div>
        ${headingAction(
          state.study.active ? "Running" : "Start",
          "start-study",
          {
            count: state.improvements,
            disabled: state.study.active || state.devices.autoCalculators > 0,
            variant: state.devices.autoCalculators > 0 ? "ghost" : "primary"
          }
        )}
      </div>
      <p class="muted">Improves how the CRC converts background radiation into Stored Energy.</p>
      <div class="study-metrics">
        <div><span>Next efficiency gain</span><strong>+${formatPercent(nextBonus)}</strong></div>
        <div><span>Estimated duration</span><strong>${formatDuration(previewDuration)}</strong></div>
      </div>
      ${progressBar(studyProgress, "Algorithm Improvement progress", "study", "study")}
      <div class="progress-caption">
        <span data-field="study-status">${state.study.active ? (state.study.automated ? "AUTO CALCULATION" : "CALCULATION IN PROGRESS") : "READY"}</span>
        <span data-field="study-remaining">${state.study.active ? formatDuration(Math.max(0, state.study.duration - state.study.elapsed)) : ""}</span>
      </div>
    </article>
  `;
}

function renderAlgorithmUpgrade(state, config, developmentMode) {
  const requirement = calculateAlgorithmUpgradeRequirement(state, config);
  const visible = state.upgrades > 0 || state.improvements >= requirement;
  if (!visible) return "";

  const ready = state.improvements >= requirement;
  const availability = evaluateComponent("algorithmUpgrade", state, config);
  const duration = calculateAlgorithmUpgradeDuration(
    state,
    config,
    developmentMode
  );
  const progress = state.algorithmUpgradeStudy.active
    ? state.algorithmUpgradeStudy.elapsed / state.algorithmUpgradeStudy.duration
    : state.improvements / requirement;

  return `
    <article class="panel study-panel">
      ${helpNote("Algorithm Upgrades double CRC production. Completing one resets Algorithm Improvements, and the next Upgrade requires more Improvements.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">STUDY</p>
          <h2>Algorithm Upgrade</h2>
        </div>
        ${headingAction(
          state.algorithmUpgradeStudy.active ? "Running" : "Upgrade",
          "start-algorithm-upgrade",
          {
            count: state.upgrades,
            disabled: !availability.enabled,
            variant: availability.enabled ? "primary" : "ghost"
          }
        )}
      </div>
      <p class="muted">Rebuild the Theseus algorithm into a stronger version.</p>
      ${progressBar(progress, "Algorithm Upgrade readiness", "discovery", "algorithm-upgrade")}
      <div class="progress-caption">
        <span data-field="algorithm-upgrade-status">${
          state.algorithmUpgradeStudy.active
            ? "UPGRADE STUDY"
            : ready
              ? "READY"
              : `${state.improvements} / ${requirement} Improvements`
        }</span>
        <span data-field="algorithm-upgrade-remaining">${
          state.algorithmUpgradeStudy.active
            ? formatDuration(Math.max(0, state.algorithmUpgradeStudy.duration - state.algorithmUpgradeStudy.elapsed))
            : formatDuration(duration)
        }</span>
      </div>
    </article>
  `;
}

function renderStudyOverclockControl(state, config) {
  const overclockers = state.devices.overclockers;
  if (overclockers <= 0) return "";

  const overclockActive = state.overclocker.active;
  const cooling = !overclockActive && state.overclocker.activeSeconds > 0;
  const stableCapacity = calculateStableEnergyCapacity(state, config);
  const canToggleOverclock =
    overclockActive ||
    (state.devices.autoCalculators > 0 && state.energy > stableCapacity);
  const previewState = {
    ...state,
    overclocker: {
      ...state.overclocker,
      active: true
    }
  };
  const speed = calculateOverclockerSpeedMultiplier(previewState, config);
  const drain = calculateOverclockerDrainPerSecond(previewState, config);

  return `
    <article class="panel study-panel study-overclock-card ${overclockActive ? "device-card--overclocking" : ""}">
      ${helpNote("Overclock burns unstable energy above stable Power Cell capacity to accelerate Auto Calculator-driven Algorithm Improvements. The energy draw rises while active.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">STUDY ACCELERATION</p>
          <h2>Processor Overclock</h2>
        </div>
      </div>
      <button
        class="button button--${overclockActive ? "ghost" : "primary"} study-overclock-button"
        data-action="toggle-overclocker"
        ${!canToggleOverclock ? "disabled" : ""}
      >
        <span>${overclockActive ? "Stop Overclock" : "Overclock"}</span>
        <small data-field="study-overclock-button-detail">x${speed.toFixed(2)} // ${formatRate(drain)}</small>
      </button>
      <p class="muted" data-field="study-overclock-status">${
        overclockActive
          ? "The calculator route is running hot."
          : cooling
            ? "Cooling. Re-engaging now resumes from the current thermal load."
            : "Available while Auto Calculator is online and excess Stored Energy exists."
      }</p>
    </article>
  `;
}

function renderAutoCalculator(state, config) {
  const owned = state.devices.autoCalculators;
  const availability = evaluateComponent("autoCalculator", state, config);
  const cost = availability.cost;
  const speedMultiplier = calculateAutoCalculatorSpeedMultiplier(state, config);

  return `
    <article class="panel device-card ${owned > 0 ? "device-card--online" : ""}">
      ${helpNote("The first Auto Calculator automates Algorithm Improvements and runs them 2x faster than manual runs. Each additional calculator doubles Algorithm Improvement speed again.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">COMPUTATIONAL DEVICE</p>
          <h2>Auto Calculator</h2>
        </div>
        ${headingAction(owned > 0 ? "Add" : "Activate", "buy-auto", {
          cost,
          count: owned,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost"
        })}
      </div>
      <p class="muted">${
        owned > 0
          ? "Glows softly while automatically calculating better condensing methods."
          : "Fadingly glows and then goes dark every time the CRC collects energy."
      }</p>
      ${owned > 0 ? `<p class="effect-line">AUTOMATION ACTIVE // STUDY SPEED x${speedMultiplier.toFixed(2)}</p>` : ""}
    </article>
  `;
}

function renderOverclocker(state, config) {
  const availability = evaluateComponent("overclocker", state, config);
  if (!availability.visible) return "";

  const owned = state.devices.overclockers;
  const active = owned > 0 && state.overclocker.active;
  const cooling = owned > 0 && !active && state.overclocker.activeSeconds > 0;
  const previewState = {
    ...state,
    devices: {
      ...state.devices,
      overclockers: Math.max(1, owned)
    },
    overclocker: { ...state.overclocker, active: true }
  };
  const speedMultiplier = owned > 0
    ? calculateOverclockerSpeedMultiplier(previewState, config)
    : config.overclocker.baseCalculatorSpeedMultiplier;
  const drain = owned > 0
    ? calculateOverclockerDrainPerSecond(
        previewState,
        config
      )
    : config.overclocker.baseEnergyDrainPerSecond;
  const nextSpeed = calculateOverclockerSpeedMultiplier(
    {
      ...state,
      devices: { ...state.devices, overclockers: owned + 1 },
      overclocker: { ...state.overclocker, active: true }
    },
    config
  );
  const nextDrain = calculateOverclockerDrainPerSecond(
    {
      ...state,
      devices: { ...state.devices, overclockers: owned + 1 },
      overclocker: { ...state.overclocker, active: true }
    },
    config
  );

  return `
    <article class="panel device-card ${owned > 0 ? "device-card--online" : ""} ${active ? "device-card--overclocking" : ""}">
      ${helpNote("The Overclocker expands the Processor control loop. Each unit increases Auto Calculator acceleration, but the energy draw scales faster than the speed gain.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">COMPUTATIONAL DEVICE</p>
          <h2>Overclocker</h2>
        </div>
        ${headingAction(owned > 0 ? "Upgrade" : "Install", "buy-overclocker", {
          cost: availability.cost,
          count: owned,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost"
        })}
      </div>
      <p class="muted">${
        owned > 0
          ? "Additional overclock routes push calculators harder, with sharply worsening energy efficiency."
          : "The processors and stable cells can now support a controlled calculator overload."
      }</p>
      <div class="metric-row">
        <span>${owned > 0 ? "Current overclock" : "Initial overclock"}</span>
        <strong data-field="overclock-current">x${speedMultiplier.toFixed(2)} / ${formatRate(drain)}</strong>
      </div>
      <div class="metric-row">
        <span>Thermal state</span>
        <strong data-field="overclock-runtime">${
          active
            ? `HOT ${formatDuration(state.overclocker.activeSeconds)}`
            : cooling
              ? `COOLING ${formatDuration(state.overclocker.activeSeconds)}`
              : "STANDBY"
        }</strong>
      </div>
      <div class="metric-row">
        <span>Next overclock</span>
        <strong>x${nextSpeed.toFixed(2)} / ${formatRate(nextDrain)}</strong>
      </div>
      ${owned > 0 ? `<p class="effect-line" data-field="overclock-effect">${active ? "OVERCLOCK ACTIVE" : cooling ? "COOLING" : "OVERCLOCK ROUTE EXPANDED"}</p>` : ""}
    </article>
  `;
}

function renderBlueprint(state, config, developmentMode) {
  const available = canResearchBlueprint(state, config);
  if (!state.discoveries.crcBlueprint && !available && !state.blueprintStudy.active) {
    return "";
  }

  const researchDuration = calculateBlueprintResearchDuration(
    state,
    config,
    developmentMode
  );
  const progress = state.blueprintStudy.active
      ? state.blueprintStudy.elapsed / state.blueprintStudy.duration
      : state.discoveries.crcBlueprint
        ? 1
        : 0;
  const researchAvailability = evaluateComponent("crcBlueprint", state, config);

  return `
    <article class="panel discovery-card">
      ${helpNote("Blueprint research reconstructs the fabrication plan for additional CRCs. Once completed, each new CRC costs Stored Energy and increases base condensation.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">${state.discoveries.crcBlueprint ? "TECHNOLOGY RECOVERED" : "RESEARCH SIGNAL"}</p>
          <h2>CRC Blueprint</h2>
        </div>
        ${
          state.discoveries.crcBlueprint
            ? statusPill("RECOVERED", "discovery")
            : headingAction("Research", "start-blueprint-research", {
                count: 0,
                disabled: !researchAvailability.enabled,
                variant: researchAvailability.enabled ? "primary" : "ghost"
              })
        }
      </div>
      <p class="muted">A structural plan for fabricating additional Cosmic Radiation Condensers.</p>
      ${state.blueprintStudy.active ? progressBar(progress, "CRC Blueprint progress", "discovery", "blueprint") : ""}
      <div class="progress-caption">
        <span data-field="blueprint-status">${
          state.blueprintStudy.active
            ? "BLUEPRINT RESEARCH"
            : state.discoveries.crcBlueprint
                ? "FABRICATION READY"
                : "RESEARCH READY"
        }</span>
        <span data-field="blueprint-remaining">${
          state.blueprintStudy.active
            ? formatDuration(Math.max(0, state.blueprintStudy.duration - state.blueprintStudy.elapsed))
            : state.discoveries.crcBlueprint
                ? "Device fabrication unlocked"
                : formatDuration(researchDuration)
        }</span>
      </div>
    </article>
  `;
}

function renderCrcConstruction(state, config) {
  const availability = evaluateComponent("crcConstruction", state, config);
  if (!availability.visible && !state.construction.active) return "";

  const progress = state.construction.active
    ? state.construction.elapsed / state.construction.duration
    : 0;

  return `
    <article class="panel device-card">
      ${helpNote("CRC fabrication uses the recovered Blueprint to build another Cosmic Radiation Condenser. Each completed condenser adds another base energy source.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">ENERGY DEVICE</p>
          <h2>Cosmic Radiation Condenser Fabrication</h2>
        </div>
        ${headingAction(
          state.construction.active ? "Building" : "Construct",
          "construct-crc",
          {
            cost: availability.cost,
            count: state.crcCount,
            disabled: !availability.enabled,
            variant: availability.enabled ? "primary" : "ghost"
          }
        )}
      </div>
      <p class="muted">Uses the recovered condenser plan to add another passive radiation collection point.</p>
      ${state.construction.active ? progressBar(progress, "CRC construction progress", "discovery", "construction") : ""}
      <div class="progress-caption">
        <span data-field="construction-status">${state.construction.active ? "CRC CONSTRUCTION" : "FABRICATION READY"}</span>
        <span data-field="construction-remaining">${
          state.construction.active
            ? formatDuration(Math.max(0, state.construction.duration - state.construction.elapsed))
            : `Cost: ${formatEnergy(availability.cost)}`
        }</span>
      </div>
    </article>
  `;
}
function renderProcessor(state, config) {
  const owned = state.devices.processors;
  const availability = evaluateComponent("processor", state, config);
  const cost = availability.cost;
  const efficiencyMultiplier = calculateDeviceEfficiencyMultiplier(state, config);
  const overclockers = state.devices.overclockers;
  const overclockActive = overclockers > 0 && state.overclocker.active;
  const stableCapacity = calculateStableEnergyCapacity(state, config);
  const canToggleOverclock =
    overclockers > 0 &&
    (overclockActive ||
      (state.devices.autoCalculators > 0 && state.energy > stableCapacity));
  const overclockSpeed = calculateOverclockerSpeedMultiplier(state, config);
  const overclockDrain = overclockers > 0
    ? calculateOverclockerDrainPerSecond(
        { ...state, overclocker: { ...state.overclocker, active: true } },
        config
      )
    : 0;

  return `
    <article class="panel device-card ${owned > 0 ? "device-card--online" : ""}">
      ${helpNote("Each Processor adds 15% multiplicative efficiency to computational and fabrication systems. It improves Auto Calculators and CRC construction speed, but does not increase CRC energy production.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">COMPUTATIONAL DEVICE</p>
          <h2>Processor</h2>
        </div>
        ${headingAction(owned > 0 ? "Add" : "Install", "buy-processor", {
          cost,
          count: owned,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost"
        })}
      </div>
      <p class="muted">${
        owned > 0
          ? "Improves calculator throughput and fabrication control with transistor-based processment."
          : "Seems like a better technology for devices control."
      }</p>
      ${owned > 0 ? `<p class="effect-line">COMPUTE / FABRICATION EFFICIENCY x${efficiencyMultiplier.toFixed(2)}</p>` : ""}
      ${
        overclockers > 0
          ? `<div class="device-inline-actions">
              ${button(overclockActive ? "Stop Overclock" : "Overclock", "toggle-overclocker", {
                disabled: !canToggleOverclock,
                variant: overclockActive ? "ghost" : "primary",
                className: "button--compact"
              })}
              <span data-field="overclock-inline">${overclockActive ? `x${overclockSpeed.toFixed(2)} active` : `x${calculateOverclockerSpeedMultiplier({ ...state, overclocker: { ...state.overclocker, active: true } }, config).toFixed(2)} ${state.overclocker.activeSeconds > 0 ? "cooling" : "ready"}`} // ${formatRate(overclockDrain)}</span>
            </div>`
          : ""
      }
    </article>
  `;
}

function renderCalculationMethod(state, config) {
  const visible = state.upgrades > 0 || state.calculationMethods > 0;
  if (!visible) return "";

  const required = calculateCalculationMethodRequirement(state, config);
  const ready = state.upgrades >= required;
  const availability = evaluateComponent("calculationMethodUpgrade", state, config);
  const progress = state.upgrades / required;
  const penaltyScale =
    config.study.effectPenaltyMultiplierPerMethod ** state.calculationMethods;

  return `
    <article class="panel method-card ${ready ? "method-card--ready" : ""}">
      ${helpNote("A Calculation Method Upgrade requires Algorithm Upgrades. Completing one resets studies, keeps hardware, and makes future Algorithm Improvement effects decay more slowly.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">STUDY RESET</p>
          <h2>Calculation Method Upgrade</h2>
        </div>
        ${headingAction("Upgrade", "claim-method", {
          count: state.calculationMethods,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost"
        })}
      </div>
      <p class="muted">A whole new method. Starts studies over, but improves future Improvement effects.</p>
      ${progressBar(progress, "Calculation Method Upgrade readiness", "study")}
      <div class="progress-caption">
        <span>${ready ? "METHOD UPGRADE READY" : `${Math.min(state.upgrades, required)} / ${required} Algorithm Upgrades`}</span>
        <span>Penalty scale x${penaltyScale.toFixed(2)}</span>
      </div>
    </article>
  `;
}

function renderSetupOptimization(state, config) {
  const visible = state.upgrades > 0 || state.calculationMethods > 0 || state.setupOptimizations > 0;
  if (!visible) return "";

  const required = calculateSetupOptimizationRequirement(state, config);
  const ready = state.calculationMethods >= required;
  const availability = evaluateComponent("setupOptimization", state, config);
  const progress = state.calculationMethods / required;
  const loadScale =
    config.study.durationLoadMultiplierPerSetup ** state.setupOptimizations;
  const penaltyScale = loadScale ** config.study.durationGrowthPower;

  return `
    <article class="panel method-card ${ready ? "method-card--ready" : ""}">
      ${helpNote("Setup Optimization costs no energy, but resets energy, studies, CRCs and hardware except Power Cells. It permanently reduces the time penalty growth of Algorithm Improvements.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">HARD RESET</p>
          <h2>Setup Optimization</h2>
        </div>
        ${headingAction("Optimize", "claim-setup", {
          count: state.setupOptimizations,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost"
        })}
      </div>
      <p class="muted">A whole new setup. Discards most hardware, but improves research time scaling.</p>
      ${progressBar(progress, "Setup Optimization readiness", "discovery")}
      <div class="progress-caption">
        <span>${ready ? "SETUP READY" : `${Math.min(state.calculationMethods, required)} / ${required} Method Upgrades`}</span>
        <span>Penalty curve x${penaltyScale.toFixed(2)}</span>
      </div>
    </article>
  `;
}
function renderDoor(state, config) {
  const progress = calculateDoorProgress(state, config);
  const labOpen = canAccessParticleLab(state, config);

  if (labOpen) {
    const availability = evaluateComponent("particleSynthesizer", state, config);
    const synthesizerProgress = calculateParticleSynthesizerProgress(
      state,
      config
    );

    return `
      <article class="ambient-door ambient-door--open">
        <p class="panel__label">PARTICLE LABORATORY</p>
        <div class="ambient-door__heading">
          <h2>Particle Sintetizer</h2>
          <strong class="door-status">${
            state.particleSynthesizer.activated ? "ACTIVE" : "DORMANT"
          }</strong>
        </div>
        ${progressBar(synthesizerProgress, "Activate Particle Sintetizer", "door", "particle-synthesizer")}
        <p class="muted">Inside the laboratory, dormant machines surround a weak central panel. It shows the scheme of an immense structure and waits for ${formatEnergy(config.particleLab.synthesizerEnergyRequired)}.</p>
        ${headingAction(
          state.particleSynthesizer.activated ? "Activated" : "Activate",
          "activate-particle-synthesizer",
          {
            cost: availability.cost,
            disabled: !availability.enabled,
            variant: availability.enabled ? "primary" : "ghost"
          }
        )}
      </article>
    `;
  }

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
      <p class="muted">A dead line on the facility map mentions particle synthesis. It should open once the facility has proven it can hold ${formatEnergy(config.particleLab.doorEnergyRequired)}.</p>
    </article>
  `;
}

function renderParticleLabDetails(state, config) {
  const progress = calculateParticleSynthesizerProgress(state, config);

  return `
    <article class="panel science-panel">
      ${helpNote("The Particle Sintetizer is the next layer bridge. At full charge it will become the reset point into particle synthesis and Science Points.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">PARTICLE LABORATORY</p>
          <h2>Particle Sintetizer</h2>
        </div>
        ${statusPill(state.particleSynthesizer.activated ? "ACTIVE" : "DORMANT", state.particleSynthesizer.activated ? "online" : "locked")}
      </div>
      <p class="muted">The central panel shows an immense structure. Most lines are still dark; the readable route asks for ${formatEnergy(config.particleLab.synthesizerEnergyRequired)}.</p>
      <div class="metric-row">
        <span>Activation charge</span>
        <strong>${formatPercent(progress)}</strong>
      </div>
      <div class="metric-row">
        <span>Stored Energy</span>
        <strong>${formatEnergy(state.energy)}</strong>
      </div>
    </article>
  `;
}

function renderScienceStatus(state) {
  return `
    <article class="panel science-panel">
      <div class="panel__heading">
        <div>
          <p class="panel__label">SCIENCE</p>
          <h2>Preserved Knowledge</h2>
        </div>
        ${statusPill(`${state.sciencePoints} SP`, state.sciencePoints > 0 ? "discovery" : "locked")}
      </div>
      <div class="metric-row">
        <span>Science Points</span>
        <strong>${state.sciencePoints}</strong>
      </div>
      <div class="metric-row">
        <span>Particle Sintetizations</span>
        <strong>${state.science?.syntheses ?? 0}</strong>
      </div>
    </article>
  `;
}

function renderMatrixMechanics(state, config) {
  const availability = evaluateComponent("matrixMechanics", state, config);
  if (!availability.visible) return "";

  const bonus =
    config.science.matrixMechanics.improvementSpeedBonusPerUpgradePerImprovement;
  const currentSpeed = calculateMatrixMechanicsSpeedMultiplier(state, config);

  return `
    <article class="panel science-panel ${state.science.matrixMechanics ? "device-card--online" : ""}">
      ${helpNote("Matrix Mechanics compounds a small calculation speed correction across each Algorithm Improvement cycle. It scales with current Algorithm Upgrades and current Improvements.")}
      <div class="panel__heading">
        <div>
          <p class="panel__label">CENTRAL PRINCIPLE</p>
          <h2>Matrix Mechanics</h2>
        </div>
        ${
          state.science.matrixMechanics
            ? statusPill("ACTIVE", "online")
            : headingAction("Study", "buy-matrix-mechanics", {
                cost: availability.cost,
                costLabel: `${availability.cost} SP`,
                disabled: !availability.enabled,
                variant: availability.enabled ? "primary" : "ghost"
              })
        }
      </div>
      <p class="muted">Reframes repeated condenser calculations as discrete matrix states.</p>
      <div class="metric-row">
        <span>Effect</span>
        <strong>x${(1 + bonus).toFixed(4)}^(A.Upgrades x A.Improvements)</strong>
      </div>
      <div class="metric-row">
        <span>Current study speed</span>
        <strong>x${currentSpeed.toFixed(2)}</strong>
      </div>
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

function renderDevelopmentPanel(state) {
  return `
    <article class="panel dev-panel">
      <p class="panel__label">DEVELOPMENT CONTROLS</p>
      <div class="metric-row">
        <span>Production multiplier</span>
        <strong>x${state.devSettings.productionMultiplier}</strong>
      </div>
      <div class="metric-row">
        <span>Duration multiplier</span>
        <strong>x${state.devSettings.durationMultiplier}</strong>
      </div>
      <div class="dev-actions">
        ${button("Add 0.25 J", "dev-add-energy", { variant: "ghost" })}
        ${button("Double Energy", "dev-add-large-energy", { variant: "ghost" })}
        ${button("Complete Study", "dev-complete-study", { variant: "ghost" })}
        ${button("Complete Upgrade", "dev-complete-upgrade", { variant: "ghost" })}
        ${button("Force Blueprint", "dev-force-blueprint", { variant: "ghost" })}
        ${button("Cycle Production", "dev-cycle-production", { variant: "ghost" })}
        ${button("Cycle Duration", "dev-cycle-duration", { variant: "ghost" })}
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
      <p class="completion-panel__note">MVP-0 COMPLETE // LAYER CONTINUES</p>
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

function renderDeviceGroup(group, content) {
  const cleanContent = content.trim();
  if (!cleanContent) return "";

  return `
    <section class="device-group" aria-label="${group.label}">
      <div class="device-group__heading">
        <div>
          <p class="panel__label">${group.label.toUpperCase()}</p>
          <h2>${group.label}</h2>
        </div>
        <p>${group.note}</p>
      </div>
      <div class="section-stack">${cleanContent}</div>
    </section>
  `;
}

function renderDevicesTab(state, config, developmentMode) {
  const energyDevices = `
    ${renderCrcDevice(state, config, developmentMode)}
    ${renderComponent("crcConstruction", state, config, () => renderCrcConstruction(state, config))}
    ${renderComponent("powerCell", state, config, () => renderPowerCellArray(state, config))}
    ${renderComponent("powerModule", state, config, () => renderPowerModule(state, config))}
  `;
  const computationalDevices = `
    ${renderComponent("softDataDisplay", state, config, () => renderSoftDataDisplay(state, config))}
    ${renderComponent("t2SoftDataDisplay", state, config, () => renderT2SoftDataDisplay(state, config))}
    ${renderComponent("autoCalculator", state, config, () => renderAutoCalculator(state, config))}
    ${renderComponent("processor", state, config, () => renderProcessor(state, config))}
    ${renderComponent("overclocker", state, config, () => renderOverclocker(state, config))}
  `;
  const deviceResets = `
    ${renderSetupOptimization(state, config)}
  `;

  return `
    ${renderTabTools(state)}
    <div class="tab-grid">
      <section class="tab-main-column">
        ${renderDeviceGroup(DEVICE_GROUPS[0], energyDevices)}
        ${renderDeviceGroup(DEVICE_GROUPS[1], computationalDevices)}
      </section>
      <aside class="tab-side-column">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">DEVICE RESET</p>
            <h2>Setup Layer</h2>
          </div>
          <p>Routes that replace the physical setup and discard most local hardware.</p>
        </div>
        <div class="section-stack">${deviceResets.trim() || '<p class="empty-note">No setup reset is readable yet.</p>'}</div>
      </aside>
    </div>
  `;
}

function renderStudiesTab(state, config, developmentMode) {
  const studyCards = `
    ${renderStudy(state, config, developmentMode)}
    ${renderAlgorithmUpgrade(state, config, developmentMode)}
    ${renderComponent("crcBlueprint", state, config, () => renderBlueprint(state, config, developmentMode))}
  `;
  const resetCards = `
    ${renderStudyOverclockControl(state, config)}
    ${renderCalculationMethod(state, config)}
  `;

  return `
    ${renderTabTools(state)}
    <div class="tab-grid">
      <section class="tab-main-column">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">STUDIES</p>
            <h2>Study Routes</h2>
          </div>
          <p>Methods, calculations, and research routes that change how the facility understands the condenser.</p>
        </div>
        <div class="section-stack">${studyCards}</div>
      </section>
      <aside class="tab-side-column">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">METHOD RESET</p>
            <h2>Method Layer</h2>
          </div>
          <p>Routes that discard study progress to improve long-term method scaling.</p>
        </div>
        <div class="section-stack">${resetCards.trim() || '<p class="empty-note">No method reset is readable yet.</p>'}</div>
      </aside>
    </div>
  `;
}

function renderScienceTab(state, config) {
  const labReadable = canAccessParticleLab(state, config);

  return `
    ${renderTabTools(state)}
    <div class="tab-grid">
      <section class="tab-main-column">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">SCIENCE</p>
            <h2>Science Tree</h2>
          </div>
          <p>Preserved principles survive particle synthesis and change how the next Energy Layer behaves.</p>
        </div>
        <div class="section-stack">
          ${renderScienceStatus(state)}
          ${renderComponent("matrixMechanics", state, config, () => renderMatrixMechanics(state, config))}
        </div>
      </section>
      <aside class="tab-side-column">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">LAB</p>
            <h2>Particle Laboratory</h2>
          </div>
          <p>The central panel remains the bridge into the next reset.</p>
        </div>
        <div class="section-stack">
          ${labReadable ? renderComponent("particleSynthesizer", state, config, () => renderParticleLabDetails(state, config)) : '<p class="empty-note">Particle Laboratory signal is not readable in this run yet.</p>'}
        </div>
      </aside>
    </div>
  `;
}

function renderStatisticsTab(state) {
  return `
    <div class="tab-grid">
      <section class="tab-main-column">
        ${renderRecord()}
        ${renderLog(state)}
      </section>
      <aside class="tab-side-column">
        <article class="panel">
          <p class="panel__label">RUN DATA</p>
          <div class="metric-row">
            <span>Total play time</span>
            <strong>${formatDuration(state.stats.totalPlayTime)}</strong>
          </div>
          <div class="metric-row">
            <span>Current run time</span>
            <strong>${formatDuration(state.stats.runPlayTime)}</strong>
          </div>
          <div class="metric-row">
            <span>Total condensed</span>
            <strong>${formatEnergy(state.stats.totalEnergyCollected)}</strong>
          </div>
          <div class="metric-row">
            <span>Peak stored</span>
            <strong>${formatEnergy(state.peakEnergy)}</strong>
          </div>
        </article>
      </aside>
    </div>
  `;
}

function renderMeasureTab(state, config, developmentMode) {
  const production = calculateProduction(state, config, developmentMode);
  const breakdown = calculateProductionBreakdown(state, config, developmentMode);

  return `
    <div class="tab-grid tab-grid--single">
      <section class="tab-main-column">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">MEASURE</p>
            <h2>Energy Production Composition</h2>
          </div>
          <p>T2 Soft Display reads the live condenser route and separates the current output into source layers.</p>
        </div>
        <article class="panel measure-panel">
          ${helpNote("This panel shows raw energy production before overflow decay. Percentages represent each component's share of current production.")}
          <div class="panel__heading">
            <div>
              <p class="panel__label">T2 SOFT DISPLAY // ONLINE</p>
              <h2>Current Output</h2>
            </div>
            ${statusPill(formatRate(production), "online")}
          </div>
          <div class="measure-table" role="table" aria-label="Energy production composition">
            <div class="measure-table__row measure-table__row--head" role="row">
              <span>Component</span>
              <span>Contribution</span>
              <span>Share</span>
            </div>
            ${breakdown
              .map((row) => {
                const share = production > 0 ? row.value / production : 0;
                return `
                  <div class="measure-table__row" role="row">
                    <span>${row.label}</span>
                    <strong>${formatRate(row.value)}</strong>
                    <strong>${formatPercent(share)}</strong>
                  </div>
                `;
              })
              .join("")}
          </div>
          <div class="metric-row measure-total">
            <span>Total raw production</span>
            <strong>${formatRate(production)}</strong>
          </div>
        </article>
      </section>
    </div>
  `;
}

function renderSaveTab(saveSlots, developmentMode) {
  return `
    <div class="tab-grid tab-grid--single">
      ${renderSaveManagement(saveSlots, developmentMode)}
    </div>
  `;
}

function renderTabContent(activeTab, state, config, developmentMode, saveSlots) {
  if (activeTab === "studies") return renderStudiesTab(state, config, developmentMode);
  if (activeTab === "measure") return renderMeasureTab(state, config, developmentMode);
  if (activeTab === "science") return renderScienceTab(state, config);
  if (activeTab === "statistics") return renderStatisticsTab(state);
  if (activeTab === "save") return renderSaveTab(saveSlots, developmentMode);
  return renderDevicesTab(state, config, developmentMode);
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

function createRenderSignature(state, config, developmentMode, saveSlots = []) {
  if (state.introState !== "active") {
    return JSON.stringify({
      introState: state.introState,
      developmentMode,
      saveSlots
    });
  }

  const availability = buildAvailabilitySnapshot(state, config);
  const stableCapacity = calculateStableEnergyCapacity(state, config);

  return JSON.stringify({
    introState: state.introState,
    developmentMode,
    activeTab: getActiveTab(state, config),
    hideCompletedPurchases: state.ui?.hideCompletedPurchases ?? false,
    seenComponents: state.ui?.seenComponents ?? {},
    improvements: state.improvements,
    upgrades: state.upgrades,
    crcCount: state.crcCount,
    powerCells: state.powerCells,
    powerModules: state.powerModules,
    sciencePoints: state.sciencePoints,
    matrixMechanics: state.science?.matrixMechanics ?? false,
    syntheses: state.science?.syntheses ?? 0,
    particleSynthesizerActivated: state.particleSynthesizer.activated,
    calculationMethods: state.calculationMethods,
    setupOptimizations: state.setupOptimizations,
    softDataDisplay: state.devices.softDataDisplay,
    t2SoftDataDisplay: state.devices.t2SoftDataDisplay,
    overclockers: state.devices.overclockers,
    overclockerActive: state.overclocker.active,
    availability,
    overflowingEnergy: state.energy > stableCapacity,
    autoCalculators: state.devices.autoCalculators,
    processors: state.devices.processors,
    crcBlueprint: state.discoveries.crcBlueprint,
    blueprintResearchAvailable: canResearchBlueprint(state, config),
    studyActive: state.study.active,
    studyAutomated: state.study.automated,
    algorithmUpgradeActive: state.algorithmUpgradeStudy.active,
    blueprintStudyActive: state.blueprintStudy.active,
    constructionActive: state.construction.active,
    prototypeComplete: state.prototypeComplete,
    devProductionMultiplier: state.devSettings.productionMultiplier,
    devDurationMultiplier: state.devSettings.durationMultiplier,
    saveSlots,
    latestLogId: state.log[0]?.id ?? ""
  });
}

function updateDynamicFields(app, state, config, developmentMode) {
  if (state.introState !== "active") return;

  const stableCapacity = calculateStableEnergyCapacity(state, config);
  setField(app, "energy", formatEnergy(state.energy));
  setProgress(app, "energy", state.energy / stableCapacity);
  if (canAccessParticleLab(state, config)) {
    setProgress(
      app,
      "particle-synthesizer",
      calculateParticleSynthesizerProgress(state, config)
    );
  } else {
    setProgress(app, "door", calculateDoorProgress(state, config));
  }

  if (state.devices.softDataDisplay) {
    const production = calculateProduction(state, config, developmentMode);
    const netProduction = calculateEffectiveProduction(
      state,
      config,
      developmentMode
    );
    const overflowDecay = calculateEnergyOverflowDecay(state, config);
    const remainingCapacity = Math.max(
      0,
      stableCapacity - state.energy
    );
    const fillTime =
      production > 0 && remainingCapacity > 0
        ? formatDuration(remainingCapacity / Math.max(production, Number.EPSILON))
        : state.energy > stableCapacity
          ? "EQUILIBRATING"
          : "FULL";

    setField(app, "energy-rate", formatRate(production));
    setField(app, "retained-rate-main", formatRate(netProduction));
    setField(app, "retained-rate", formatRate(netProduction));
    setField(app, "energy-retention-main", formatRate(overflowDecay));
    setField(app, "fill-time", fillTime);
    setField(app, "energy-retention", formatRate(overflowDecay));
    setField(app, "total-energy", formatEnergy(state.stats.totalEnergyCollected));
  }

  if (state.devices.overclockers > 0) {
    const activePreview = {
      ...state,
      overclocker: {
        ...state.overclocker,
        active: true
      }
    };
    const speed = calculateOverclockerSpeedMultiplier(activePreview, config);
    const drain = calculateOverclockerDrainPerSecond(activePreview, config);
    const status = state.overclocker.active
      ? `x${speed.toFixed(2)} active // ${formatRate(drain)}`
      : `x${speed.toFixed(2)} ${state.overclocker.activeSeconds > 0 ? "cooling" : "ready"} // ${formatRate(drain)}`;
    setField(app, "overclock-inline", status);
    setField(app, "study-overclock-button-detail", `x${speed.toFixed(2)} // ${formatRate(drain)}`);
    setField(app, "overclock-current", `x${speed.toFixed(2)} / ${formatRate(drain)}`);
    setField(
      app,
      "study-overclock-status",
      state.overclocker.active
        ? "The calculator route is running hot."
        : state.overclocker.activeSeconds > 0
          ? "Cooling. Re-engaging now resumes from the current thermal load."
          : "Available while Auto Calculator is online and excess Stored Energy exists."
    );
    setField(
      app,
      "overclock-effect",
      state.overclocker.active
        ? "OVERCLOCK ACTIVE"
        : state.overclocker.activeSeconds > 0
          ? "COOLING"
          : "OVERCLOCK ROUTE EXPANDED"
    );
    setField(
      app,
      "overclock-runtime",
      state.overclocker.active
        ? `HOT ${formatDuration(state.overclocker.activeSeconds)}`
        : state.overclocker.activeSeconds > 0
          ? `COOLING ${formatDuration(state.overclocker.activeSeconds)}`
          : "STANDBY"
    );
  }

  if (state.study.active) {
    setProgress(app, "study", state.study.elapsed / state.study.duration);
    setField(
      app,
      "study-remaining",
      formatDuration(Math.max(0, state.study.duration - state.study.elapsed))
    );
  }

  if (state.algorithmUpgradeStudy.active) {
    setProgress(
      app,
      "algorithm-upgrade",
      state.algorithmUpgradeStudy.elapsed / state.algorithmUpgradeStudy.duration
    );
    setField(
      app,
      "algorithm-upgrade-remaining",
      formatDuration(
        Math.max(
          0,
          state.algorithmUpgradeStudy.duration -
            state.algorithmUpgradeStudy.elapsed
        )
      )
    );
  }

  if (state.blueprintStudy.active) {
    setProgress(
      app,
      "blueprint",
      state.blueprintStudy.elapsed / state.blueprintStudy.duration
    );
    setField(app, "blueprint-remaining", formatDuration(Math.max(0, state.blueprintStudy.duration - state.blueprintStudy.elapsed)));
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

function renderGame(state, config, developmentMode, saveSlots) {
  const activeTab = getActiveTab(state, config);

  return `
    ${renderHeader(state, developmentMode)}
    ${state.prototypeComplete ? renderCompletion() : ""}
    ${renderTabBar(state, config)}
    <section class="operation-focus" aria-label="Power and production focus">
      ${renderEnergy(state, config, developmentMode)}
    </section>
    <section class="next-tier-focus" aria-label="Next tier progress">
      ${renderDoor(state, config)}
    </section>
    <section class="tab-content tab-content--${activeTab}" aria-label="${activeTab}">
      ${renderTabContent(activeTab, state, config, developmentMode, saveSlots)}
      ${developmentMode ? renderDevelopmentPanel(state) : ""}
    </section>
  `;
}

export function createRenderer(app, config, developmentMode, getSaveSlots = () => []) {
  let lastRenderSignature = "";

  return function render(state) {
    const saveSlots = getSaveSlots();
    const signature = createRenderSignature(
      state,
      config,
      developmentMode,
      saveSlots
    );

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

    app.innerHTML = renderGame(state, config, developmentMode, saveSlots);
    updateDynamicFields(app, state, config, developmentMode);
  };
}
