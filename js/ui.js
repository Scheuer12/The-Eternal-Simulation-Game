import { TEXT } from "../content/texts.js";
import { big, bigMax, formatEngineering } from "./numeric.js";
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
  calculateImprovementRatePerSecond,
  calculateOverclockerDrainPerSecond,
  calculateOverclockerSpeedMultiplier,
  calculateParticleSynthesizerProgress,
  calculateParticleSynthesizerCost,
  calculateQuarksGenerated,
  calculateSciencePointCost,
  calculateSciencePointReward,
  calculateQuarkCapacity,
  calculateQuarkDecay,
  calculatePowerModuleCapacityMultiplier,
  calculateProcessorEfficiencyMultiplier,
  calculateProductionBreakdown,
  calculateProduction,
  calculateSetupDevicePerformance,
  calculateSetupOptimizationRequirement,
  calculateStableEnergyCapacity,
  calculateStudyDuration,
  canAccessParticleLab,
  canResearchBlueprint,
  clamp,
  formatDuration,
  formatEnergy,
  formatPercent,
  formatRate,
} from "./formulas.js";
import {
  buildAvailabilitySnapshot,
  evaluateComponent,
} from "./availability.js";
import { COMPONENT_REGISTRY } from "./component-registry.js";
import {
  evaluateSciencePerk,
  getSciencePerk,
  SCIENCE_PERK_BRANCHES,
} from "./science-perks.js";
import {
  hasUnlockedAutomations,
  isAutoCalculatorAutomationActive,
  isAutomationEnabled,
  listUnlockedAutomations,
} from "./automations.js";

function button(label, action, options = {}) {
  const {
    disabled = false,
    variant = "primary",
    detail = "",
    className = "",
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
    variant = "primary",
  } = options;
  const countLabel = count === null ? "" : ` (${count})`;

  return `
    <div class="panel__action">
      ${cost !== null ? `<small>${costLabel}</small>` : ""}
      ${button(`${label}${countLabel}`, action, {
        disabled,
        variant,
        className: "button--compact",
      })}
    </div>
  `;
}

function statusPill(text, tone = "") {
  return `<span class="status ${tone ? `status--${tone}` : ""}">${text}</span>`;
}

function renderCardTags(type, extra = null) {
  const typeLabel = type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
  const extraClass = extra ? extra.toLowerCase().replace(/\s+/g, "-") : "";
  return `
    <div class="card-tags">
      <span class="card-tag card-tag--${(type || "device").toLowerCase()}">${typeLabel}</span>
      ${extra ? `<span class="card-tag card-tag--${extraClass}">${extra}</span>` : ""}
    </div>
  `;
}

function getEffectiveBuyMode(state) {
  const mode = state.ui?.buyMode ?? "1";
  if (mode === "max") {
    return state.devices.t2SoftDataDisplay ? "max" : "1";
  }
  if (mode === "10") {
    return state.devices.softDataDisplay ? "10" : "1";
  }
  return "1";
}

function renderBuyModeSelector(state) {
  const buyMode = state.ui?.buyMode ?? "1";
  const hasSoft = Boolean(state.devices.softDataDisplay);
  const hasT2 = Boolean(state.devices.t2SoftDataDisplay);
  if (!hasSoft && !hasT2) return "";
  return `
    <div class="buy-mode-selector" role="group" aria-label="Purchase quantity">
      <button class="buy-mode-btn ${buyMode === "1" ? "buy-mode-btn--active" : ""}" data-action="set-buy-mode" data-mode="1" type="button">Buy 1</button>
      ${hasSoft ? `<button class="buy-mode-btn ${buyMode === "10" ? "buy-mode-btn--active" : ""}" data-action="set-buy-mode" data-mode="10" type="button">Buy 10</button>` : ""}
      ${hasT2 ? `<button class="buy-mode-btn ${buyMode === "max" ? "buy-mode-btn--active" : ""}" data-action="set-buy-mode" data-mode="max" type="button">Buy Max</button>` : ""}
    </div>
  `;
}

const TAB_DEFINITIONS = [
  { id: "energy", label: "Energy Production" },
  { id: "automation", label: "Automation and Efficiency" },
  {
    id: "science",
    label: "Science",
    visible: (state, config) =>
      canAccessParticleLab(state, config) ||
      state.sciencePoints > 0 ||
      (state.science?.syntheses ?? 0) > 0,
  },
  { id: "history", label: "History" },
];

function isTabVisible(tab, state, config) {
  return tab.visible ? tab.visible(state, config) : true;
}

function getActiveTab(state, config) {
  let requested = state.ui?.activeTab ?? "energy";
  if (requested === "devices" || requested === "studies") requested = "energy";
  if (
    requested === "automations" ||
    requested === "measure" ||
    requested === "statistics" ||
    requested === "save"
  ) {
    requested = "automation";
  }
  return TAB_DEFINITIONS.some(
    (tab) => tab.id === requested && isTabVisible(tab, state, config),
  )
    ? requested
    : "energy";
}

function getComponentsForTab(tabId) {
  return Object.values(COMPONENT_REGISTRY).filter((spec) => {
    if (tabId === "energy") {
      return (
        spec.functionalTab === "energy" ||
        spec.tab === "energy" ||
        spec.tab === "devices" ||
        spec.tab === "studies"
      );
    }
    if (tabId === "automation") {
      return (
        spec.functionalTab === "automation" ||
        spec.tab === "automation" ||
        spec.tab === "automations" ||
        spec.tab === "measure"
      );
    }
    if (tabId === "science") {
      return spec.functionalTab === "science" || spec.tab === "science";
    }
    return spec.functionalTab === tabId || spec.tab === tabId;
  });
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
  for (const componentId of getVisibleComponentIdsForTab(
    activeTab,
    state,
    config,
  )) {
    seen[componentId] = true;
  }
  state.ui.seenComponents = seen;
}

function getTabIndicators(tabId, state, config) {
  const seen = state.ui?.seenComponents ?? {};
  const availability = getComponentsForTab(tabId).map((spec) =>
    evaluateComponent(spec.id, state, config),
  );

  return {
    ready: availability.filter(
      (item) => item.visible && item.enabled && !item.completed,
    ).length,
    newlyVisible: availability.filter((item) => item.visible && !seen[item.id])
      .length,
  };
}

function renderTabBar(state, config) {
  const activeTab = getActiveTab(state, config);

  return `
    <nav class="tabbar" aria-label="Facility sections">
      ${TAB_DEFINITIONS.filter((tab) => isTabVisible(tab, state, config))
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
    developmentMode,
  );
  const capacity = calculateStableEnergyCapacity(state, config);
  const overflowDecay = calculateEnergyOverflowDecay(state, config);
  const remainingCapacity = bigMax(0, capacity.sub(state.energy));
  const fillTime =
    production.gt(0) && remainingCapacity.gt(0)
      ? formatDuration(remainingCapacity.div(production))
      : big(state.energy).gt(capacity)
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

function calculateNextMilestone(state, config) {
  if (
    state.crcCount === 1 &&
    !state.discoveries.crcBlueprint &&
    !state.blueprintStudy.active
  ) {
    const cost = config.blueprint?.revealAtPeakEnergy ?? 10;
    return {
      title: "CRC Blueprint Research",
      requirement: `Reach ${formatEnergy(cost)} peak energy to reveal blueprint`,
      progress: clamp(state.peakEnergy / cost, 0, 1),
      tab: "energy",
      tabLabel: "Energy",
    };
  }

  if (state.blueprintStudy?.active) {
    const elapsed = state.blueprintStudy.elapsed;
    const dur = state.blueprintStudy.duration;
    return {
      title: "Blueprint Reconstruction",
      requirement: `Active research in progress (${formatDuration(Math.max(0, dur - elapsed))})`,
      progress: dur > 0 ? clamp(elapsed / dur, 0, 1) : 0,
      tab: "energy",
      tabLabel: "Energy",
    };
  }

  if (state.discoveries.crcBlueprint && state.crcCount === 1) {
    const cost = calculateCrcCost(state.crcCount, config);
    return {
      title: "Fabricate 2nd CRC",
      requirement: `Cost: ${formatEnergy(cost)} Stored Energy`,
      progress: clamp(big(state.energy).div(cost).toNumber(), 0, 1),
      tab: "energy",
      tabLabel: "Energy",
    };
  }

  if (!state.devices.softDataDisplay) {
    const cost = config.softDataDisplay.cost;
    return {
      title: "Restore Soft Display",
      requirement: `Cost: ${formatEnergy(cost)} Stored Energy`,
      progress: clamp(big(state.energy).div(cost).toNumber(), 0, 1),
      tab: "automation",
      tabLabel: "Automation",
    };
  }

  if (state.devices.autoCalculators === 0) {
    const cost = config.autoCalculator.baseCost;
    return {
      title: "Activate Auto Calculator",
      requirement: `Cost: ${formatEnergy(cost)} Stored Energy`,
      progress: clamp(big(state.energy).div(cost).toNumber(), 0, 1),
      tab: "automation",
      tabLabel: "Automation",
    };
  }

  const reqUpgrade = calculateAlgorithmUpgradeRequirement(state, config);
  if (state.upgrades === 0 && state.improvements < reqUpgrade) {
    return {
      title: "Algorithm Upgrade 1",
      requirement: `${state.improvements} / ${reqUpgrade} Improvements completed`,
      progress: clamp(state.improvements / reqUpgrade, 0, 1),
      tab: "energy",
      tabLabel: "Energy",
    };
  }

  if (state.devices.processors === 0) {
    const cost = config.processor.baseCost;
    return {
      title: "Install Processor",
      requirement: `Cost: ${formatEnergy(cost)} Stored Energy`,
      progress: clamp(big(state.energy).div(cost).toNumber(), 0, 1),
      tab: "automation",
      tabLabel: "Automation",
    };
  }

  const reqCMU = calculateCalculationMethodRequirement(state, config);
  if (state.calculationMethods === 0 && state.upgrades < reqCMU) {
    return {
      title: "Calculation Method Upgrade 1",
      requirement: `${state.upgrades} / ${reqCMU} Algorithm Upgrades`,
      progress: clamp(state.upgrades / reqCMU, 0, 1),
      tab: "energy",
      tabLabel: "Energy",
    };
  }

  if (state.calculationMethods < 2) {
    return {
      title: "Calculation Method Upgrade 2",
      requirement: `${state.upgrades} / ${reqCMU} Algorithm Upgrades`,
      progress: clamp(state.upgrades / reqCMU, 0, 1),
      tab: "energy",
      tabLabel: "Energy",
    };
  }

  if (!state.devices.t2SoftDataDisplay) {
    const cost = config.t2SoftDataDisplay.cost;
    return {
      title: "Restore T2 Soft Display",
      requirement: `Cost: ${formatEnergy(cost)} Stored Energy`,
      progress: clamp(big(state.energy).div(cost).toNumber(), 0, 1),
      tab: "automation",
      tabLabel: "Automation",
    };
  }

  if (
    !state.discoveries.overclockerBlueprint &&
    !state.overclockerBlueprintStudy?.active &&
    state.devices.processors >= 3
  ) {
    return {
      title: "Overclocker Blueprint",
      requirement: "Transistor overclocking blueprint ready for research",
      progress: 1,
      tab: "automation",
      tabLabel: "Automation",
    };
  }

  if (state.overclockerBlueprintStudy?.active) {
    const elapsed = state.overclockerBlueprintStudy.elapsed;
    const dur = state.overclockerBlueprintStudy.duration;
    return {
      title: "Overclocker Blueprint Research",
      requirement: `Active research (${formatDuration(Math.max(0, dur - elapsed))})`,
      progress: dur > 0 ? clamp(elapsed / dur, 0, 1) : 0,
      tab: "automation",
      tabLabel: "Automation",
    };
  }

  if (
    state.discoveries.overclockerBlueprint &&
    state.devices.overclockers === 0
  ) {
    const cost = config.overclocker.baseCost;
    return {
      title: "Install Overclocker",
      requirement: `Cost: ${formatEnergy(cost)} Stored Energy`,
      progress: clamp(big(state.energy).div(cost).toNumber(), 0, 1),
      tab: "automation",
      tabLabel: "Automation",
    };
  }

  const reqSetup = calculateSetupOptimizationRequirement(state, config);
  if (
    state.setupOptimizations === 0 &&
    state.calculationMethods >= 1 &&
    state.calculationMethods < reqSetup
  ) {
    return {
      title: "Setup Optimization 1",
      requirement: `${state.calculationMethods} / ${reqSetup} Method Upgrades`,
      progress: clamp(state.calculationMethods / reqSetup, 0, 1),
      tab: "energy",
      tabLabel: "Energy",
    };
  }

  if (!canAccessParticleLab(state, config)) {
    const doorReq = config.particleLab.doorEnergyRequired;
    return {
      title: "Particle Laboratory Access",
      requirement: `Charge to ${formatEnergy(doorReq)} Stored Energy`,
      progress: calculateDoorProgress(state, config),
      tab: "energy",
      tabLabel: "Energy",
    };
  }

  if ((state.science?.syntheses ?? 0) === 0) {
    const synthCost = calculateParticleSynthesizerCost(state, config);
    return {
      title: "First Particle Synthesis",
      requirement: `Synthesizer needs ${formatEnergy(synthCost)} Stored Energy`,
      progress: clamp(big(state.energy).div(synthCost).toNumber(), 0, 1),
      tab: "energy",
      tabLabel: "Energy",
    };
  }

  // Science Era
  const spCost = calculateSciencePointCost(
    state.science?.totalScienceEarned ?? 0,
    config,
  );
  return {
    title: "Next Science Point Threshold",
    requirement: `Threshold: ${formatEnergy(spCost)} Stored Energy`,
    progress: clamp(big(state.energy).div(spCost).toNumber(), 0, 1),
    tab: "science",
    tabLabel: "Science",
  };
}

function getLastDiscovery(state) {
  if (state.history?.length) {
    const last = state.history.find(
      (h) => h.kind === "Discoveries" || h.kind === "Milestones",
    );
    if (last) return last.title;
  }
  if (state.discoveries?.crcBlueprint) return "CRC Blueprint";
  if (state.devices?.softDataDisplay) return "Soft Data Display";
  return "Cosmic Radiation Condenser";
}

function getResetPreviewData(state, config, resetType) {
  if (resetType === "cmu") {
    const nextCMU = state.calculationMethods + 1;
    const studyRunning = Boolean(
      state.study?.active ||
        state.algorithmUpgradeStudy?.active ||
        state.blueprintStudy?.active ||
        state.overclockerBlueprintStudy?.active,
    );
    const eligible = evaluateComponent(
      "calculationMethodUpgrade",
      state,
      config,
    ).enabled;
    return {
      type: "cmu",
      title: "Confirm Calculation Method Upgrade",
      gain: `Calculation Method Upgrade ${state.calculationMethods} → ${nextCMU} (Processor unit bonus × 1.2)`,
      lost: "Resets Algorithm Improvements (I → 0), Algorithm Upgrades (U → 0), active studies, and blueprint research.",
      preserved:
        "Preserves Power Cells, Power Modules, CRCs, Auto Calculators, Processors, Overclockers, and Stored Energy.",
      warnings: studyRunning
        ? "Warning: A research study or blueprint reconstruction is currently active and will be aborted!"
        : null,
      isEligible: eligible,
    };
  }

  if (resetType === "setup") {
    const nextSetup = state.setupOptimizations + 1;
    const currentD = 1 + 2 * Math.log(1 + state.setupOptimizations);
    const nextD = 1 + 2 * Math.log(1 + nextSetup);
    const eligible = evaluateComponent(
      "setupOptimization",
      state,
      config,
    ).enabled;
    return {
      type: "setup",
      title: "Confirm Setup Optimization",
      gain: `Setup Optimization ${state.setupOptimizations} → ${nextSetup} (Device performance D(S): ${currentD.toFixed(2)} → ${nextD.toFixed(2)})`,
      lost: "HARD RESET: Stored Energy resets to 0. Resets CRCs to 1, Auto Calculators to 0, Processors to 0, Overclockers to 0, studies, and CMUs to 0.",
      preserved:
        "Preserves Power Cells, Science Points, Quarks, Science Perks, and History.",
      warnings:
        "High-impact Hard Reset! Lower Energy Layer machinery and accumulated Stored Energy will be cleared.",
      isEligible: eligible,
    };
  }

  if (resetType === "synthesis") {
    const activationCost = calculateParticleSynthesizerCost(state, config);
    const spReward = calculateSciencePointReward(
      state.energy,
      state.science?.totalScienceEarned ?? 0,
      config,
    );
    const quarksReward = calculateQuarksGenerated(state.energy, config);
    const eligible = evaluateComponent(
      "particleSynthesizer",
      state,
      config,
    ).enabled;
    return {
      type: "synthesis",
      title: "Confirm Particle Synthesis",
      gain: `+${spReward} Science Point${spReward === 1 ? "" : "s"} and +${quarksReward} Quarks`,
      lost: "FULL RESET of the Energy Layer: Stored Energy, Power Cells, Power Modules, CRCs, Auto Calculators, Processors, Overclockers, studies, CMUs, and Setup Optimizations.",
      preserved:
        "Preserves Science Points, Quarks, Science Perks, and History.",
      warnings:
        "Complete reset of all physical devices, power cells, and stored energy.",
      isEligible: eligible,
      activationCost,
      spReward,
      quarksReward,
    };
  }

  return null;
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
    minute: "2-digit",
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
            `,
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

function renderGlobalHUD(state, config, developmentMode) {
  const production = calculateProduction(state, config, developmentMode);
  const netProduction = calculateEffectiveProduction(
    state,
    config,
    developmentMode,
  );
  const capacity = calculateStableEnergyCapacity(state, config);
  const overflowDecay = calculateEnergyOverflowDecay(state, config);
  const capacityProgress = big(state.energy).div(capacity).toNumber();
  const displayTelemetry = Boolean(state.devices.softDataDisplay);
  const overflowing = big(state.energy).gt(capacity);
  const milestone = calculateNextMilestone(state, config);
  const phase =
    (state.science?.syntheses ?? 0) > 0
      ? "Science Era // Particle Synthesis"
      : "Energy Era // Cosmic Condensation";
  const lastDiscovery = getLastDiscovery(state);

  return `
    <section class="global-hud" aria-label="Global status and next milestone">
      <div class="global-hud__grid">
        <article class="panel global-hud__primary">
          <div class="panel__heading">
            <div>
              <p class="panel__label">STORED ENERGY</p>
              <strong class="energy-readout" data-field="energy">${formatEnergy(state.energy)}</strong>
            </div>
            <div class="hud-rate-box">
              <span class="panel__label">ENERGY / SECOND</span>
              <strong class="rate-readout" data-field="energy-rate">${
                displayTelemetry ? formatRate(production) : "UNREADABLE"
              }</strong>
            </div>
          </div>
          ${progressBar(capacityProgress, "Stable Power Cell charge", "energy", "energy")}
          <div class="hud-telemetry-row">
            <div>
              <span>Stable capacity:</span>
              <strong data-field="stable-capacity">${
                displayTelemetry ? formatEnergy(capacity) : "UNREADABLE"
              }</strong>
            </div>
            <div>
              <span>Net flow:</span>
              <strong data-field="retained-rate-main">${
                displayTelemetry ? formatRate(netProduction) : "UNREADABLE"
              }</strong>
            </div>
            <div>
              <span>Status:</span>
              <strong class="${overflowing ? "text--warning" : "text--online"}">${
                overflowing
                  ? displayTelemetry
                    ? `EXCESS DECAY (${formatRate(overflowDecay)})`
                    : "EXCESS UNSTABLE"
                  : "CELL STABLE"
              }</strong>
            </div>
          </div>
        </article>

        <article class="panel global-hud__milestone">
          <div class="panel__heading">
            <div>
              <p class="panel__label">NEXT MILESTONE</p>
              <h2 class="milestone-title">${milestone.title}</h2>
            </div>
            <button class="button button--compact button--ghost" data-action="set-tab" data-tab="${milestone.tab}" type="button">
              <span>Go to ${milestone.tabLabel}</span>
            </button>
          </div>
          <p class="muted milestone-req">${milestone.requirement}</p>
          ${milestone.progress !== null ? progressBar(milestone.progress, milestone.title, "discovery", "milestone") : ""}
        </article>
      </div>

      <div class="global-hud__subbar">
        <span><strong>Phase:</strong> ${phase}</span>
        <span><strong>Last discovery:</strong> ${lastDiscovery}</span>
      </div>
    </section>
  `;
}

function renderCrcDevice(state, config, developmentMode) {
  const production = calculateProduction(state, config, developmentMode);
  const baseRate =
    config?.economyV2?.crc?.baseProductionPerSecond ??
    config?.energy?.baseProductionPerSecond ??
    1e-12;
  const crcCount = Math.max(0, state.crcCount ?? 0);
  const improvements = Math.max(0, state.improvements ?? 0);
  const algorithmFactor = 1 + improvements;
  const isSoftUnlocked = Boolean(state.devices?.softDataDisplay);

  return `
    <article class="panel device-card condenser-card device-card--online">
      ${helpNote("Each active condenser collects cosmic radiation at a base rate of 1e-12 J/s. Each completed Algorithm Improvement adds +1 base output to every active condenser simultaneously.")}
      <div class="panel__header-row">
        ${renderCardTags("Device", "Stage 1")}
        ${statusPill(`${crcCount} ONLINE`, "online")}
      </div>
      <div class="panel__heading">
        <div>
          <h2>Cosmic Radiation Condenser</h2>
        </div>
      </div>
      <p class="muted">Collects cosmic radiation at a base rate of ${isSoftUnlocked ? formatRate(baseRate) : "1e-12 J/s"} per CRC. Each Algorithm Improvement adds +1 base production to every active condenser via the (1 + I) multiplier.</p>
      <div class="study-metrics crc-metrics">
        <div>
          <span>Base rate per CRC</span>
          <strong>${isSoftUnlocked ? formatRate(baseRate) + " / unit" : "UNREADABLE"}</strong>
        </div>
        <div>
          <span>Algorithm Multiplier (1 + I)</span>
          <strong>x${algorithmFactor} <small style="font-size: 0.72rem; color: var(--muted); font-weight: normal; margin-left: 4px;">(+1 base / imp)</small></strong>
        </div>
      </div>
      <div class="metric-row">
        <span>Current total output</span>
        <strong>${
          isSoftUnlocked ? formatRate(production) : "UNREADABLE"
        }</strong>
      </div>
    </article>
  `;
}

function renderPowerCellArray(state, config) {
  const availability = evaluateComponent("powerCell", state, config);
  if (!availability.visible) return "";

  const effectiveMode = getEffectiveBuyMode(state);
  const actionLabel =
    effectiveMode === "max" ? "Buy Max" : `Add (${effectiveMode})`;
  const cost = availability.cost;
  const capacity = calculateStableEnergyCapacity(state, config);
  const nextCapacity = calculateStableEnergyCapacity(
    { ...state, powerCells: state.powerCells + 1 },
    config,
  );
  const moduleMultiplier = calculatePowerModuleCapacityMultiplier(
    state,
    config,
  );

  return `
    <article class="panel device-card power-cell-card">
      ${helpNote("Buying a Power Cell expands stable capacity. It does not increase raw production, but it raises the point where overflow decay starts pushing back against Stored Energy.")}
      <div class="panel__header-row">
        ${renderCardTags("Device", "Storage")}
        <span class="card-subsystem">Stable Capacity</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Power Cell Array</h2>
        </div>
        <div class="panel__action-group">
          ${headingAction(actionLabel, "buy-power-cell", {
            cost,
            count: state.powerCells,
            disabled: !availability.enabled,
            variant: availability.enabled ? "primary" : "ghost",
          })}
        </div>
      </div>
      <p class="muted">Stable cells give condensed energy somewhere to stay. Storage hardware does not produce energy.</p>
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
        <strong>${state.powerModules} / x${formatEngineering(moduleMultiplier)}</strong>
      </div>
    </article>
  `;
}

function renderPowerModule(state, config) {
  const availability = evaluateComponent("powerModule", state, config);
  if (!availability.visible) return "";

  const effectiveMode = getEffectiveBuyMode(state);
  const actionLabel = `Install (${effectiveMode === "max" ? "Max" : effectiveMode})`;
  const requirement = availability.requirement;
  const currentMultiplier = calculatePowerModuleCapacityMultiplier(
    state,
    config,
  );
  const nextMultiplier = calculatePowerModuleCapacityMultiplier(
    { ...state, powerModules: state.powerModules + 1 },
    config,
  );

  return `
    <article class="panel device-card power-module-card">
      ${helpNote("Power Modules do not consume Power Cells. They activate capture and conduction circuits around each full group of 100 cells, increasing effective stable capacity.")}
      <div class="panel__header-row">
        ${renderCardTags("Device", "Amplification")}
        <span class="card-subsystem">Group Multiplier</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Power Module</h2>
        </div>
        ${headingAction(actionLabel, "buy-power-module", {
          cost: availability.cost,
          count: state.powerModules,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost",
        })}
      </div>
      <p class="muted">Activates capture and conduction circuits that organize Power Cells into a stronger storage route.</p>
      <div class="metric-row">
        <span>Cell requirement</span>
        <strong>${Math.min(state.powerCells, requirement)} / ${requirement}</strong>
      </div>
      <div class="metric-row">
        <span>Capacity route</span>
        <strong>x${formatEngineering(currentMultiplier)} -> x${formatEngineering(nextMultiplier)}</strong>
      </div>
    </article>
  `;
}

function renderSoftDataDisplay(state, config) {
  const availability = evaluateComponent("softDataDisplay", state, config);

  return `
    <article class="panel device-card ${state.devices.softDataDisplay ? "device-card--online" : ""}">
      ${helpNote("Soft Display reveals usable energy production rate, Power Cell capacity, capacity occupation, and the current decay rate of unstable overflow energy.")}
      <div class="panel__header-row">
        ${renderCardTags("Device", "Display")}
        <span class="card-subsystem">Telemetry Unit</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Soft Display</h2>
        </div>
        ${
          state.devices.softDataDisplay
            ? statusPill("ONLINE", "online")
            : headingAction("Restore", "buy-soft-display", {
                cost: availability.cost,
                disabled: !availability.enabled,
                variant: availability.enabled ? "primary" : "ghost",
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
      <div class="panel__header-row">
        ${renderCardTags("Device", "Spectrometry")}
        <span class="card-subsystem">Diagnostic Spectrometry</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>T2 Soft Display</h2>
        </div>
        ${
          state.devices.t2SoftDataDisplay
            ? statusPill("ONLINE", "online")
            : headingAction("Restore", "buy-t2-soft-display", {
                cost: availability.cost,
                disabled: !availability.enabled,
                variant: availability.enabled ? "primary" : "ghost",
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
  const currentFactor = 1 + (state.improvements ?? 0);
  const previewDuration = calculateStudyDuration(
    state,
    config,
    developmentMode,
  );
  const studyProgress = state.study.active
    ? state.study.elapsed / state.study.duration
    : 0;
  const rate = previewDuration > 0 ? 1 / previewDuration : 0;
  const rateDisplay =
    rate >= 10
      ? `${rate.toFixed(1)} Improvements/s`
      : formatDuration(previewDuration);

  return `
    <article class="panel study-panel">
      ${helpNote("Algorithm Improvements always complete. Each cycle adds +1 base production unit to every CRC via the (1 + I) multiplier: P = 10⁻¹² · C · (1 + I) · 2ᵁ · D(S). After enough Improvements, an Algorithm Upgrade study can be run manually to double structural production and reset Improvements.")}
      <div class="panel__header-row">
        ${renderCardTags("Study", "Stage 2")}
        <span class="card-subsystem">Continuous Optimization</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Algorithm Improvement</h2>
        </div>
        ${headingAction(
          state.study.active ? "Running" : "Start Study",
          "start-study",
          {
            count: state.improvements,
            disabled:
              state.study.active || isAutoCalculatorAutomationActive(state),
            variant: isAutoCalculatorAutomationActive(state)
              ? "ghost"
              : "primary",
          },
        )}
      </div>
      <p class="muted">Refines the Theseus algorithm. Each cycle adds +1 base production to every CRC via the (1 + I) multiplier.</p>
      <div class="study-metrics">
        <div><span>Algorithm Multiplier (1 + I)</span><strong>x${currentFactor} (+1.0 / cycle)</strong></div>
        <div><span>${rate >= 10 ? "Improvement speed" : "Estimated duration"}</span><strong>${rateDisplay}</strong></div>
      </div>
      ${progressBar(studyProgress, "Algorithm Improvement progress", "study", "study")}
      <div class="progress-caption">
        <span data-field="study-status">${state.study.active ? (state.study.automated ? "AUTO CALCULATION" : "CALCULATION IN PROGRESS") : "READY"}</span>
        <span data-field="study-remaining">${state.study.active ? formatDuration(Math.max(0, state.study.duration - state.study.elapsed)) : ""}</span>
      </div>
    </article>
  `;
}

function renderAlgorithmUpgrade(state, config) {
  const requirement = calculateAlgorithmUpgradeRequirement(state, config);
  const visible = state.upgrades > 0 || state.improvements >= requirement;
  if (!visible) return "";

  const ready = state.improvements >= requirement;
  const availability = evaluateComponent("algorithmUpgrade", state, config);
  const progress = state.algorithmUpgradeStudy.active
    ? state.algorithmUpgradeStudy.elapsed / state.algorithmUpgradeStudy.duration
    : state.improvements / requirement;

  const currentMultiplier = 2 ** state.upgrades;
  const nextMultiplier = 2 ** (state.upgrades + 1);

  return `
    <article class="panel study-panel panel--upgrade ${ready ? "panel--upgrade-ready" : ""}">
      ${helpNote("Manual Algorithm Upgrades complete instantly and reset Improvements. Each completed Upgrade permanently doubles production (x2 multiplier).")}
      <div class="panel__header-row">
        ${renderCardTags("Study", "Stage 3")}
        <span class="card-subsystem text--warning">Resets Improvements</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Algorithm Upgrade</h2>
        </div>
        ${headingAction(
          state.algorithmUpgradeStudy.active ? "Running" : "Upgrade",
          "start-algorithm-upgrade",
          {
            count: state.upgrades,
            disabled: !availability.enabled,
            variant: availability.enabled ? "primary" : "ghost",
          },
        )}
      </div>
      <p class="muted">Rebuild the Theseus algorithm into a stronger version. Each completed upgrade doubles production. <strong class="text--warning">Resets Improvements.</strong></p>
      <div class="study-metrics">
        <div>
          <span>Active Upgrade Multiplier</span>
          <strong>x${currentMultiplier}</strong>
        </div>
        <div>
          <span>Next Upgrade Multiplier</span>
          <strong>x${nextMultiplier} (2x)</strong>
        </div>
      </div>
      ${progressBar(progress, "Algorithm Upgrade readiness", "discovery", "algorithm-upgrade")}
      <div class="progress-caption">
        <span data-field="algorithm-upgrade-status">${
          state.algorithmUpgradeStudy.active
            ? "UPGRADE STUDY"
            : ready
              ? "READY // MANUAL EXECUTION IS INSTANT (RESETS IMPROVEMENTS)"
              : `${state.improvements} / ${requirement} Improvements`
        }</span>
        <span data-field="algorithm-upgrade-remaining">${
          state.algorithmUpgradeStudy.active
            ? formatDuration(
                Math.max(
                  0,
                  state.algorithmUpgradeStudy.duration -
                    state.algorithmUpgradeStudy.elapsed,
                ),
              )
            : "INSTANT"
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
    (state.devices.autoCalculators > 0 && big(state.energy).gt(stableCapacity));
  const previewState = {
    ...state,
    overclocker: {
      ...state.overclocker,
      active: true,
    },
  };
  const speed = calculateOverclockerSpeedMultiplier(previewState, config);
  const drain = calculateOverclockerDrainPerSecond(previewState, config);

  return `
    <article class="panel study-panel study-overclock-card ${overclockActive ? "device-card--overclocking" : ""}">
      ${helpNote("Overclock burns unstable energy above stable Power Cell capacity to accelerate Auto Calculator-driven Algorithm Improvements. The energy draw rises while active.")}
      <div class="panel__header-row">
        ${renderCardTags("System", "Control")}
        <span class="card-subsystem">Thermal Acceleration</span>
      </div>
      <div class="panel__heading">
        <div>
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
  const effectiveMode = getEffectiveBuyMode(state);
  const actionLabel = owned > 0 ? `Add (${effectiveMode})` : "Activate";
  const cost = availability.cost;
  const speedMultiplier = calculateAutoCalculatorSpeedMultiplier(state, config);

  return `
    <article class="panel device-card ${owned > 0 ? "device-card--online" : ""}">
      ${helpNote("The first Auto Calculator automates Algorithm Improvements and runs them 2x faster than manual runs. Each additional calculator doubles Algorithm Improvement speed again.")}
      <div class="panel__header-row">
        ${renderCardTags("Device", "Automation")}
        <span class="card-subsystem">Autonomous Processing</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Auto Calculator</h2>
        </div>
        ${headingAction(actionLabel, "buy-auto", {
          cost,
          count: owned,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost",
        })}
      </div>
      <p class="muted">${
        owned > 0
          ? "Glows softly while automatically calculating better condensing methods."
          : "Fadingly glows and then goes dark every time the CRC collects energy."
      }</p>
      ${
        owned > 0
          ? `<p class="effect-line">${
              isAutoCalculatorAutomationActive(state)
                ? "AUTOMATION ACTIVE"
                : "AUTOMATION PAUSED"
            } // STUDY SPEED x${speedMultiplier.toFixed(2)}</p>`
          : ""
      }
    </article>
  `;
}

function renderOverclocker(state, config) {
  const availability = evaluateComponent("overclocker", state, config);
  if (!availability.visible) return "";

  const owned = state.devices.overclockers;
  const effectiveMode = getEffectiveBuyMode(state);
  const actionLabel = owned > 0 ? `Upgrade (${effectiveMode})` : "Install";
  const active = owned > 0 && state.overclocker.active;
  const cooling = owned > 0 && !active && state.overclocker.activeSeconds > 0;
  const stableCapacity = calculateStableEnergyCapacity(state, config);
  const canToggle =
    owned > 0 &&
    (active ||
      (state.devices.autoCalculators > 0 &&
        big(state.energy).gt(stableCapacity)));
  const previewState = {
    ...state,
    devices: {
      ...state.devices,
      overclockers: Math.max(1, owned),
    },
    overclocker: { ...state.overclocker, active: true },
  };
  const speedMultiplier =
    owned > 0
      ? calculateOverclockerSpeedMultiplier(previewState, config)
      : config.overclocker.baseCalculatorSpeedMultiplier;
  const drain =
    owned > 0
      ? calculateOverclockerDrainPerSecond(previewState, config)
      : config.overclocker.baseEnergyDrainPerSecond;

  return `
    <article class="panel device-card ${owned > 0 ? "device-card--online" : ""} ${active ? "device-card--overclocking" : ""}">
      ${helpNote("The Overclocker expands the Processor control loop. Each unit increases Auto Calculator acceleration, but the energy draw scales faster than the speed gain. Single On/Off switch with no slider or heat gauge.")}
      <div class="panel__header-row">
        ${renderCardTags("Device", "Acceleration")}
        <span class="card-subsystem">Thermal Governor</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Overclocker</h2>
        </div>
        <div class="panel__action-group">
          ${headingAction(actionLabel, "buy-overclocker", {
            cost: availability.cost,
            count: owned,
            disabled: !availability.enabled,
            variant: availability.enabled ? "primary" : "ghost",
          })}
          ${
            owned > 0
              ? button(
                  active ? "Stop Overclock" : "Overclock",
                  "toggle-overclocker",
                  {
                    disabled: !canToggle,
                    variant: active ? "ghost" : "primary",
                    className: "button--compact",
                  },
                )
              : ""
          }
        </div>
      </div>
      <p class="muted">${
        owned > 0
          ? "Additional overclock routes push calculators harder, with sharply worsening energy efficiency."
          : "The processors and stable cells can now support a controlled calculator overload."
      }</p>
      <div class="metric-row">
        <span>Overclock multiplier & drain</span>
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
      ${owned > 0 ? `<p class="effect-line" data-field="overclock-effect">${active ? "OVERCLOCK ACTIVE" : cooling ? "COOLING" : "OVERCLOCK ROUTE EXPANDED"}</p>` : ""}
    </article>
  `;
}

function renderOverclockerBlueprint(state, config, developmentMode) {
  const availability = evaluateComponent("overclockerBlueprint", state, config);
  if (!availability.visible && !state.overclockerBlueprintStudy?.active) {
    return "";
  }

  const progress = state.overclockerBlueprintStudy?.active
    ? state.overclockerBlueprintStudy.elapsed /
      state.overclockerBlueprintStudy.duration
    : state.discoveries.overclockerBlueprint
      ? 1
      : 0;

  return `
    <article class="panel discovery-card">
      <div class="panel__header-row">
        ${renderCardTags("Study", "Schematic")}
        <span class="card-subsystem">${state.discoveries.overclockerBlueprint ? "Technology Recovered" : "Research Signal"}</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Overclocker Blueprint</h2>
        </div>
        ${
          state.discoveries.overclockerBlueprint
            ? statusPill("RECOVERED", "discovery")
            : headingAction("Research", "start-overclocker-blueprint-research", {
                disabled: !availability.enabled,
                variant: availability.enabled ? "primary" : "ghost",
              })
        }
      </div>
      <p class="muted">A theoretical architecture for driving calculation arrays beyond nominal thermal limits.</p>
      ${state.overclockerBlueprintStudy?.active ? progressBar(progress, "Overclocker Blueprint progress", "discovery", "overclocker-blueprint") : ""}
      <div class="progress-caption">
        <span data-field="overclocker-blueprint-status">${
          state.overclockerBlueprintStudy?.active
            ? "BLUEPRINT RESEARCH"
            : state.discoveries.overclockerBlueprint
              ? "FABRICATION READY"
              : "RESEARCH READY"
        }</span>
        <span data-field="overclocker-blueprint-remaining">${
          state.overclockerBlueprintStudy?.active
            ? formatDuration(
                Math.max(
                  0,
                  state.overclockerBlueprintStudy.duration -
                    state.overclockerBlueprintStudy.elapsed,
                ),
              )
            : state.discoveries.overclockerBlueprint
              ? "Overclocker fabrication unlocked"
              : formatDuration(45)
        }</span>
      </div>
    </article>
  `;
}

function renderBlueprint(state, config, developmentMode) {
  const available = canResearchBlueprint(state, config);
  if (
    !state.discoveries.crcBlueprint &&
    !available &&
    !state.blueprintStudy.active
  ) {
    return "";
  }

  const researchDuration = calculateBlueprintResearchDuration(
    state,
    config,
    developmentMode,
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
      <div class="panel__header-row">
        ${renderCardTags("Study", "Schematic")}
        <span class="card-subsystem">${state.discoveries.crcBlueprint ? "Technology Recovered" : "Research Signal"}</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>CRC Blueprint</h2>
        </div>
        ${
          state.discoveries.crcBlueprint
            ? statusPill("RECOVERED", "discovery")
            : headingAction("Research", "start-blueprint-research", {
                count: 0,
                disabled: !researchAvailability.enabled,
                variant: researchAvailability.enabled ? "primary" : "ghost",
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
            ? formatDuration(
                Math.max(
                  0,
                  state.blueprintStudy.duration - state.blueprintStudy.elapsed,
                ),
              )
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
      <div class="panel__header-row">
        ${renderCardTags("Device", "Fabrication")}
        <span class="card-subsystem">Hardware Assembly</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Cosmic Radiation Condenser Fabrication</h2>
        </div>
        ${headingAction(
          state.construction.active ? "Building" : "Construct",
          "construct-crc",
          {
            cost: availability.cost,
            count: state.crcCount,
            disabled: !availability.enabled,
            variant: availability.enabled ? "primary" : "ghost",
          },
        )}
      </div>
      <p class="muted">Uses the recovered condenser plan to add another passive radiation collection point.</p>
      ${state.construction.active ? progressBar(progress, "CRC construction progress", "discovery", "construction") : ""}
      <div class="progress-caption">
        <span data-field="construction-status">${state.construction.active ? "CRC CONSTRUCTION" : "FABRICATION READY"}</span>
        <span data-field="construction-remaining">${
          state.construction.active
            ? formatDuration(
                Math.max(
                  0,
                  state.construction.duration - state.construction.elapsed,
                ),
              )
            : `Cost: ${formatEnergy(availability.cost)}`
        }</span>
      </div>
    </article>
  `;
}

function renderProcessor(state, config) {
  const owned = state.devices.processors;
  const availability = evaluateComponent("processor", state, config);
  const effectiveMode = getEffectiveBuyMode(state);
  const actionLabel = owned > 0 ? `Add (${effectiveMode})` : "Install";
  const cost = availability.cost;
  const efficiencyMultiplier = calculateDeviceEfficiencyMultiplier(
    state,
    config,
  );
  const overclockers = state.devices.overclockers;
  const overclockActive = overclockers > 0 && state.overclocker.active;
  const stableCapacity = calculateStableEnergyCapacity(state, config);
  const canToggleOverclock =
    overclockers > 0 &&
    (overclockActive ||
      (state.devices.autoCalculators > 0 &&
        big(state.energy).gt(stableCapacity)));
  const overclockSpeed = calculateOverclockerSpeedMultiplier(state, config);
  const overclockDrain =
    overclockers > 0
      ? calculateOverclockerDrainPerSecond(
          { ...state, overclocker: { ...state.overclocker, active: true } },
          config,
        )
      : 0;

  return `
    <article class="panel device-card ${owned > 0 ? "device-card--online" : ""}">
      ${helpNote("Each Processor adds multiplicative efficiency to computational and fabrication systems. Amplified by CMU.")}
      <div class="panel__header-row">
        ${renderCardTags("Device", "Hardware")}
        <span class="card-subsystem">Processing Core</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Processor</h2>
        </div>
        ${headingAction(actionLabel, "buy-processor", {
          cost,
          count: owned,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost",
        })}
      </div>
      <p class="muted">${
        owned > 0
          ? "Improves calculator throughput and fabrication control with transistor-based processment."
          : "Seems like a better technology for devices control."
      }</p>
      ${owned > 0 ? `<p class="effect-line">COMPUTE / FABRICATION EFFICIENCY x${formatEngineering(efficiencyMultiplier)}</p>` : ""}
      ${
        overclockers > 0
          ? `<div class="device-inline-actions">
              ${button(
                overclockActive ? "Stop Overclock" : "Overclock",
                "toggle-overclocker",
                {
                  disabled: !canToggleOverclock,
                  variant: overclockActive ? "ghost" : "primary",
                  className: "button--compact",
                },
              )}
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
  const availability = evaluateComponent(
    "calculationMethodUpgrade",
    state,
    config,
  );
  const progress = state.upgrades / required;

  return `
    <article class="panel method-card ${ready ? "method-card--ready" : ""}">
      ${helpNote("A Calculation Method Upgrade requires Algorithm Upgrades. Completing one resets studies, keeps hardware, and amplifies Processor unit bonus by 1.2^M.")}
      <div class="panel__header-row">
        ${renderCardTags("Study", "Soft Reset")}
        <span class="card-subsystem text--amber">Tier 1 Reset</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Calculation Method Upgrade</h2>
        </div>
        ${headingAction("Perform CMU", "claim-method", {
          count: state.calculationMethods,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost",
        })}
      </div>
      <p class="muted">A whole new method. Starts studies over, but amplifies Processor effectiveness by 1.2^M.</p>
      ${progressBar(progress, "Calculation Method Upgrade readiness", "study")}
      <div class="progress-caption">
        <span>${ready ? "METHOD UPGRADE READY" : `${Math.min(state.upgrades, required)} / ${required} Algorithm Upgrades`}</span>
        <span>Scaling multiplier ×${(1.2 ** state.calculationMethods).toFixed(2)}</span>
      </div>
    </article>
  `;
}

function renderSetupOptimization(state, config) {
  const visible =
    state.upgrades > 0 ||
    state.calculationMethods > 0 ||
    state.setupOptimizations > 0;
  if (!visible) return "";

  const required = calculateSetupOptimizationRequirement(state, config);
  const ready = state.calculationMethods >= required;
  const availability = evaluateComponent("setupOptimization", state, config);
  const progress = state.calculationMethods / required;
  const currentD = 1 + 2 * Math.log(1 + state.setupOptimizations);

  return `
    <article class="panel method-card panel--hard-reset ${ready ? "method-card--ready" : ""}">
      ${helpNote("Setup Optimization costs no energy, but resets energy to 0, studies, CRCs and hardware except Power Cells. It permanently scales device performance D(S) = 1 + 2 ln(1+S).")}
      <div class="panel__header-row">
        ${renderCardTags("Study", "Hard Reset")}
        <span class="card-subsystem text--danger">Facility Reconfiguration</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Setup Optimization</h2>
        </div>
        ${headingAction("Optimize Setup", "claim-setup", {
          count: state.setupOptimizations,
          disabled: !availability.enabled,
          variant: availability.enabled ? "danger" : "ghost",
        })}
      </div>
      <p class="muted">A whole new setup. Discards lower hardware and stored energy, but permanently amplifies device performance.</p>
      ${progressBar(progress, "Setup Optimization readiness", "discovery")}
      <div class="progress-caption">
        <span>${ready ? "SETUP READY" : `${Math.min(state.calculationMethods, required)} / ${required} Method Upgrades`}</span>
        <span>Device scale D(S): ${currentD.toFixed(2)}</span>
      </div>
    </article>
  `;
}
function renderDoor(state, config) {
  const progress = calculateDoorProgress(state, config);
  const labOpen = canAccessParticleLab(state, config);

  if (labOpen) {
    if ((state.science?.syntheses ?? 0) > 0) {
      return `
        <article class="ambient-door ambient-door--open">
          <p class="panel__label">PARTICLE LABORATORY</p>
          <div class="ambient-door__heading">
            <h2>Particle Sintetizer</h2>
            <strong class="door-status">CONTROLS RELOCATED</strong>
          </div>
          <p class="muted">The laboratory remains open. Further synthesis controls are now available under Science Devices.</p>
        </article>
      `;
    }

    const availability = evaluateComponent(
      "particleSynthesizer",
      state,
      config,
    );
    const synthesizerProgress = calculateParticleSynthesizerProgress(
      state,
      config,
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
        <p class="muted">Inside the laboratory, dormant machines surround a weak central panel. It shows the scheme of an immense structure and waits for ${formatEnergy(availability.cost)}.</p>
        ${headingAction(
          state.particleSynthesizer.activated ? "Activated" : "Activate",
          "open-particle-synthesis",
          {
            cost: availability.cost,
            disabled: !availability.enabled,
            variant: availability.enabled ? "primary" : "ghost",
          },
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
  const sciencePointCost = calculateSciencePointCost(
    state.science?.totalScienceEarned ?? 0,
    config,
  );
  const projectedSciencePoints = calculateSciencePointReward(
    state.energy,
    state.science?.totalScienceEarned ?? 0,
    config,
  );

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
      <p class="muted">The central panel shows an immense structure. Most lines are still dark, waiting for a complete activation charge.</p>
      <div class="metric-row">
        <span>Activation charge (fixed)</span>
        <strong>${formatPercent(progress)}</strong>
      </div>
      <div class="metric-row">
        <span>Next Science Point threshold</span>
        <strong><span data-field="science-point-cost">${formatEnergy(sciencePointCost)}</span> · projected <span data-field="science-sp-on-synthesis">${projectedSciencePoints}</span> SP</strong>
      </div>
      ${progressBar(big(state.energy).div(sciencePointCost).toNumber(), "Next Science Point energy threshold", "science", "science-point")}
      <div class="metric-row">
        <span>Stored Energy</span>
        <strong>${formatEnergy(state.energy)}</strong>
      </div>
    </article>
  `;
}

function renderScienceStatus(state, config) {
  const hasSynthesized = (state.science?.syntheses ?? 0) > 0;
  const availableQuarks = formatEngineering(state.quarks?.available ?? 0);

  if (!hasSynthesized) {
    return `
      <article class="panel science-panel">
        <div class="panel__heading">
          <div>
            <p class="panel__label">SCIENCE</p>
            <h2>Preserved Knowledge</h2>
          </div>
          ${statusPill(`${state.sciencePoints} SP`, "locked")}
        </div>
        <div class="metric-row">
          <span>Science Points</span>
          <strong>${state.sciencePoints}</strong>
        </div>
        <div class="metric-row">
          <span>Total Quarks</span>
          <strong>${availableQuarks}</strong>
        </div>
      </article>
    `;
  }

  const quarkCapacity = calculateQuarkCapacity(state, config);
  const quarkDecay = calculateQuarkDecay(state, config);
  const quarksOnSynthesis = calculateQuarksGenerated(state.energy, config);
  const sciencePointsOnSynthesis = calculateSciencePointReward(
    state.energy,
    state.science?.totalScienceEarned ?? 0,
    config,
  );
  const nextSciencePointCost = calculateSciencePointCost(
    state.science?.totalScienceEarned ?? 0,
    config,
  );

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
        <span>Total Quarks</span>
        <strong>${availableQuarks} / ${formatEngineering(quarkCapacity)} stable</strong>
      </div>
      <div class="metric-row">
        <span>SP gained on Sintetization</span>
        <strong data-field="science-sp-on-synthesis">${sciencePointsOnSynthesis}</strong>
      </div>
      <div class="metric-row">
        <span>Energy threshold for next SP</span>
        <strong data-field="science-point-cost">${formatEnergy(nextSciencePointCost)}</strong>
      </div>
      <div class="metric-row">
        <span>Quarks gained on Sintetization</span>
        <strong data-field="science-quarks-on-synthesis">${quarksOnSynthesis}</strong>
      </div>
      <div class="metric-row">
        <span>Total Quarks Earned</span>
        <strong>${state.quarks?.totalEarned ?? 0}</strong>
      </div>
      <div class="metric-row">
        <span>Quark decay</span>
        <strong>${formatEngineering(quarkDecay)} q/s</strong>
      </div>
    </article>
  `;
}

function renderScienceTreeNode(id, state, config, tone, extraClass = "") {
  const perk = getSciencePerk(id);
  const evaluation = evaluateSciencePerk(id, state, config);
  const revealed = evaluation.revealed;
  const isSelected = state.ui?.selectedSciencePerkId === perk.id;
  const isCapped = evaluation.owned && perk.id === "redundancyElimination";
  const visibleName = revealed ? perk.name : "???";
  const visibleSummary = revealed ? perk.summary : "???";
  const effect = revealed ? perk.effect : "Undiscovered technology";
  const prerequisiteNames = revealed
    ? perk.requires.map((prerequisiteId) => getSciencePerk(prerequisiteId).name)
    : [];
  const status = !revealed
    ? "UNDISCOVERED"
    : isCapped
      ? "CAPPED"
      : evaluation.owned
        ? "ACQUIRED"
        : evaluation.missingPrerequisites.length ||
            !evaluation.energyRequirementMet
          ? "LOCKED"
          : !evaluation.hasEnoughScience
            ? `Need ${evaluation.cost} SP`
            : "Ready";
  const classes = [
    "science-tree__node-wrap",
    `science-tree__node-wrap--${tone}`,
    extraClass,
    !revealed && "science-tree__node-wrap--hidden",
    revealed && "science-tree__node-wrap--revealed",
    evaluation.owned && "science-tree__node-wrap--owned",
    evaluation.canPurchase && "science-tree__node-wrap--ready",
    !evaluation.owned &&
      !evaluation.canPurchase &&
      "science-tree__node-wrap--locked",
    isSelected && "science-tree__node-wrap--selected",
  ]
    .filter(Boolean)
    .join(" ");
  const accessibleLabel = revealed
    ? `${visibleName}. ${status}. Costs ${evaluation.cost} Science Point${evaluation.cost === 1 ? "" : "s"}. Effect: ${effect}`
    : "Undiscovered technology";

  return `
    <div class="${classes}" tabindex="0" role="group" aria-label="${accessibleLabel}">
      <button
        class="science-tree__node ${evaluation.owned ? "science-tree__node--owned" : ""} ${!evaluation.owned && !evaluation.canPurchase ? "science-tree__node--locked" : ""} ${isSelected ? "science-tree__node--selected" : ""}"
        type="button"
        data-action="select-science-perk"
        data-perk-id="${perk.id}"
        aria-describedby="science-tooltip-${perk.id}"
        aria-label="${accessibleLabel}"
      >
        <span class="science-tree__node-name">${visibleName}</span>
        <span class="science-tree__node-meta">${!revealed ? "???" : isCapped ? "Capped" : evaluation.owned ? "Acquired" : `${evaluation.cost} SP`}</span>
      </button>
      <span class="science-tree__tooltip" id="science-tooltip-${perk.id}" role="tooltip">
        <strong>${visibleName}</strong>
        <span>${revealed ? effect : "Undiscovered technology"}</span>
        ${revealed && perk.requirement ? `<small>Unlock condition: ${perk.requirement}</small>` : ""}
        ${revealed ? `<small>${prerequisiteNames.length ? `Requires: ${prerequisiteNames.join(" + ")} · ` : "No perk prerequisite · "}Cost: ${evaluation.cost} SP</small>` : ""}
      </span>
      <span class="science-tree__node-summary">${visibleSummary}</span>
      <span class="science-tree__node-state">${status}</span>
    </div>
  `;
}

function renderSciencePerkDrawer(state, config) {
  const selectedId = state.ui?.selectedSciencePerkId;
  if (!selectedId) {
    return `
      <aside class="science-drawer science-drawer--empty panel">
        <p class="panel__label">PERK SPECIFICATION</p>
        <p class="muted">Select a perk in the science tree to inspect technical parameters, prerequisites, and unlock controls.</p>
      </aside>
    `;
  }

  const perk = getSciencePerk(selectedId);
  if (!perk) return "";

  const evaluation = evaluateSciencePerk(selectedId, state, config);
  const revealed = evaluation.revealed;

  if (!revealed) {
    return `
      <aside class="science-drawer panel science-panel">
        <div class="panel__heading">
          <div>
            <p class="panel__label">SCIENCE PERK // CLASSIFIED</p>
            <h2>???</h2>
          </div>
          ${statusPill("UNDISCOVERED", "locked")}
        </div>
        <p class="muted">This principle is currently unmapped. Complete prerequisite research and expand facility energy thresholds to reveal.</p>
        <div class="metric-row">
          <span>Cost</span>
          <strong>??? SP</strong>
        </div>
        <div class="metric-row">
          <span>Requirements</span>
          <strong>Undiscovered</strong>
        </div>
        <div class="panel__action" style="margin-top: 1rem;">
          <button class="button button--ghost" disabled type="button">Locked</button>
        </div>
      </aside>
    `;
  }

  const isCapped = evaluation.owned && perk.id === "redundancyElimination";
  const prerequisiteNames = perk.requires.map(
    (reqId) => getSciencePerk(reqId)?.name || reqId,
  );

  return `
    <aside class="science-drawer panel science-panel">
      <div class="panel__heading">
        <div>
          <p class="panel__label">SCIENCE PERK</p>
          <h2>${perk.name}</h2>
        </div>
        ${
          isCapped
            ? statusPill("CAPPED", "online")
            : evaluation.owned
              ? statusPill("ACQUIRED", "online")
              : evaluation.canPurchase
                ? statusPill("READY", "discovery")
                : statusPill("LOCKED", "locked")
        }
      </div>
      <p class="muted">${perk.summary}</p>
      <div class="metric-row">
        <span>Effect</span>
        <strong>${perk.effect}</strong>
      </div>
      <div class="metric-row">
        <span>Cost</span>
        <strong>${evaluation.cost} SP</strong>
      </div>
      ${
        prerequisiteNames.length
          ? `
        <div class="metric-row">
          <span>Prerequisites</span>
          <strong>${prerequisiteNames.join(" + ")}</strong>
        </div>
      `
          : ""
      }
      ${
        perk.requirement
          ? `
        <div class="metric-row">
          <span>Requirement</span>
          <strong>${perk.requirement}</strong>
        </div>
      `
          : ""
      }
      <div class="panel__action" style="margin-top: 1rem;">
        ${
          isCapped
            ? '<button class="button button--ghost" disabled type="button">Capped</button>'
            : evaluation.owned
              ? '<button class="button button--ghost" disabled type="button">Acquired</button>'
              : `<button
                  class="button button--primary"
                  type="button"
                  data-action="buy-science-perk"
                  data-perk-id="${perk.id}"
                  ${evaluation.canPurchase ? "" : "disabled"}
                >
                  <span>Unlock ${perk.name} (${evaluation.cost} SP)</span>
                </button>`
        }
      </div>
    </aside>
  `;
}

function renderScienceBranch(branch, state, config) {
  return `
    <section class="science-tree__branch science-tree__branch--${branch.tone}" aria-label="${branch.title}">
      <h3 class="science-tree__branch-title">${branch.title}</h3>
      <div class="science-tree__branch-track" aria-label="${branch.title} perk progression">
        ${branch.tiers
          .map(
            (tier, tierIndex) => `
          ${tierIndex > 0 ? '<span class="science-tree__connector" aria-hidden="true">↓</span>' : ""}
          <div class="science-tree__tier">
            ${tier.map((perkId) => renderScienceTreeNode(perkId, state, config, branch.tone)).join("")}
          </div>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderScienceTree(state, config) {
  const allocatedSciencePoints = Math.max(
    0,
    (state.science?.totalScienceEarned ?? 0) - state.sciencePoints,
  );
  const zoom = state.ui?.treeZoom ?? 1.0;
  return `
    <section class="science-tree" aria-label="Science perks skill tree">
      <div class="science-tree__heading">
        <span>Click a perk to inspect or unlock · Branches grow from Redundancy Elimination</span>
        <div class="science-tree__heading-actions">
          <div class="tree-zoom-toolbar" role="group" aria-label="Tree zoom controls">
            <button type="button" class="btn btn--ghost btn--small" data-action="zoom-tree-in" aria-label="Zoom in">+</button>
            <button type="button" class="btn btn--ghost btn--small" data-action="zoom-tree-out" aria-label="Zoom out">-</button>
            <button type="button" class="btn btn--ghost btn--small" data-action="reset-tree-zoom" aria-label="Reset zoom">Fit</button>
            <span class="tree-zoom-level">${Math.round(zoom * 100)}%</span>
          </div>
          <span>${state.sciencePoints} SP available</span>
          ${button("Reset SP allocation", "reset-science-points", {
            disabled: allocatedSciencePoints <= 0,
            variant: "ghost",
          })}
        </div>
      </div>
      <div class="science-tree-viewport" style="transform: scale(${zoom}); transform-origin: top left; transition: transform 0.15s ease-out;">
        <div class="science-tree__lateral-scroll">
          <div class="science-tree__lateral" aria-label="Quantum and Layer Perks progression">
            <svg class="science-tree__lateral-connectors" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
              <path d="M295 110 H370 M370 54 V166 M370 68 H405 M370 152 H405 M675 68 H766 M675 152 H766 M766 68 V152 M766 110 H790 M160 145 V194 H500 V220" />
            </svg>
            <div class="science-tree__lateral-root">
              ${renderScienceTreeNode("redundancyElimination", state, config, "root", "science-tree__node-wrap--root")}
            </div>
            <div class="science-tree__quantum-nodes" aria-label="Quark perks">
              <span class="science-tree__layer-perks-label">QUANTUM PRINCIPLES</span>
              <div class="science-tree__quantum-node">
                ${renderScienceTreeNode("quantumCalculationPrinciples", state, config, "quantum")}
              </div>
              <div class="science-tree__quantum-node">
                ${renderScienceTreeNode("quantumSuperposition", state, config, "quantum")}
              </div>
            </div>
            <div class="science-tree__lateral-generator">
              ${renderScienceTreeNode("particleGenerator", state, config, "layer", "science-tree__node-wrap--root")}
            </div>
          </div>
        </div>
        <span class="science-tree__trunk" aria-hidden="true"></span>
        <div class="science-tree__splitter" aria-hidden="true"><span></span><i></i><span></span></div>
        <div class="science-tree__branches">
          ${SCIENCE_PERK_BRANCHES.map((branch) => renderScienceBranch(branch, state, config)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderParticleSynthesizerDevice(state, config) {
  if ((state.science?.syntheses ?? 0) <= 0) return "";

  const availability = evaluateComponent("particleSynthesizer", state, config);
  const progress = calculateParticleSynthesizerProgress(state, config);
  const nextSciencePointCost = calculateSciencePointCost(
    state.science?.totalScienceEarned ?? 0,
    config,
  );
  const projectedSciencePoints = calculateSciencePointReward(
    state.energy,
    state.science?.totalScienceEarned ?? 0,
    config,
  );
  const projectedQuarks = calculateQuarksGenerated(state.energy, config);

  return `
    <article class="panel science-panel">
      ${helpNote("Activation always spends 100 GJ. Science Points and quarks are calculated from the Stored Energy held at activation.")}
      <div class="panel__header-row">
        ${renderCardTags("Science", "Hardware")}
        <span class="card-subsystem">Synthesis Core</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Particle Sintetizer</h2>
        </div>
        ${headingAction("Activate", "open-particle-synthesis", {
          cost: availability.cost,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost",
        })}
      </div>
      <p class="muted">The laboratory control route is stable enough to initiate another full-energy synthesis.</p>
      ${progressBar(progress, "Particle Sintetizer activation charge", "door", "particle-synthesizer-device")}
      ${progressBar(big(state.energy).div(nextSciencePointCost).toNumber(), "Next Science Point energy threshold", "science", "science-point")}
      <div class="metric-row">
        <span>Fixed activation cost</span>
        <strong>${formatEnergy(calculateParticleSynthesizerCost(state, config))}</strong>
      </div>
      <div class="metric-row">
        <span>SP gained on Sintetization</span>
        <strong data-field="science-sp-on-synthesis">${projectedSciencePoints}</strong>
      </div>
      <div class="metric-row">
        <span>Energy threshold for next SP</span>
        <strong>${formatEnergy(nextSciencePointCost)}</strong>
      </div>
      <div class="metric-row">
        <span>Quarks gained on Sintetization</span>
        <strong data-field="device-quarks-on-synthesis">${projectedQuarks}</strong>
      </div>
    </article>
  `;
}

function renderParticleSynthesisModal(state, config) {
  const modal = state.ui?.particleSynthesisModal;
  if (!modal) return "";

  if (modal === "narrative") {
    return `
      <div class="modal-backdrop">
        <section class="synthesis-modal" role="dialog" aria-modal="true" aria-labelledby="synthesis-narrative-title">
          <p class="panel__label">PARTICLE SYNTHESIS // FIRST ACTIVATION</p>
          <h2 id="synthesis-narrative-title">The structure answers.</h2>
          <div class="synthesis-modal__narrative">
            <p>The laboratory rings ignite in sequence. For a fraction of a second, the entire facility feeds one impossible concentration of energy into the central chamber.</p>
            <p>A new signature appears on the display. Then the Sintetizer overloads. Protection circuits sever every route at once, and the facility falls dark.</p>
            <p>When the first condenser returns, something survived the collapse: preserved scientific knowledge and the quarks formed during synthesis.</p>
          </div>
          <div class="synthesis-modal__era">
            <h3>Science Era</h3>
            <p>Science Points survive synthesis and unlock permanent principles in the Science Tree. Quarks are produced from the Stored Energy held at activation; quarks beyond safe Cage capacity decay over time.</p>
            <p>The Particle Sintetizer is now located in <strong>Science Devices</strong>. Future activations will confirm their rewards before resetting the Energy Era again.</p>
          </div>
          <div class="synthesis-modal__actions">
            ${button("Enter Science Era", "close-particle-synthesis-narrative", { variant: "primary" })}
          </div>
        </section>
      </div>
    `;
  }

  const activationCost = calculateParticleSynthesizerCost(state, config);
  const scienceGained = calculateSciencePointReward(
    state.energy,
    state.science?.totalScienceEarned ?? 0,
    config,
  );
  const sciencePointCost = calculateSciencePointCost(
    state.science?.totalScienceEarned ?? 0,
    config,
  );
  const quarksGained = calculateQuarksGenerated(state.energy, config);

  return `
    <div class="modal-backdrop">
      <section class="synthesis-modal" role="dialog" aria-modal="true" aria-labelledby="synthesis-confirm-title">
        <p class="panel__label">IRREVERSIBLE SYNTHESIS</p>
        <h2 id="synthesis-confirm-title">Activate Particle Sintetizer?</h2>
        <p class="muted">This spends ${formatEnergy(activationCost)} and resets all Energy Era progress. Rewards use the Stored Energy held at activation.</p>
        <div class="synthesis-modal__rewards">
          <div>
            <span>Science Points gained (${formatEnergy(sciencePointCost)} threshold)</span>
            <strong>${scienceGained}</strong>
          </div>
          <div>
            <span>Quarks gained</span>
            <strong>${quarksGained}</strong>
          </div>
        </div>
        <div class="synthesis-modal__actions">
          ${button("Cancel", "cancel-particle-synthesis", { variant: "ghost" })}
          ${button("Activate", "confirm-particle-synthesis", { variant: "primary" })}
        </div>
      </section>
    </div>
  `;
}

function renderQuarkCage(state, config) {
  const availability = evaluateComponent("quarkCage", state, config);
  if (!availability.visible) return "";

  const currentCapacity = calculateQuarkCapacity(state, config);
  const nextCapacity = calculateQuarkCapacity(
    {
      ...state,
      scienceDevices: {
        ...state.scienceDevices,
        quarkCages: state.scienceDevices.quarkCages + 1,
      },
    },
    config,
  );

  return `
    <article class="panel science-panel">
      ${helpNote("Quarks outside safe containment decay continuously. Quarks Cages are run hardware: synthesis resets cages, but the base containment of 1 quark remains.")}
      <div class="panel__header-row">
        ${renderCardTags("Science", "Hardware")}
        <span class="card-subsystem">Containment Unit</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>Quarks Cage</h2>
        </div>
        ${headingAction("Install", "buy-quark-cage", {
          cost: availability.cost,
          count: state.scienceDevices.quarkCages,
          disabled: !availability.enabled,
          variant: availability.enabled ? "primary" : "ghost",
        })}
      </div>
      <p class="muted">A high-energy containment chamber capable of stabilizing synthesized quarks and preventing their natural decay.</p>
      <div class="metric-row">
        <span>Safe containment</span>
        <strong>${currentCapacity} -> ${nextCapacity} quarks</strong>
      </div>
      <div class="metric-row">
        <span>Available Quarks</span>
        <strong>${formatEngineering(state.quarks?.available ?? 0)}</strong>
      </div>
    </article>
  `;
}

function renderFiftyGCalculator(state, config) {
  const availability = evaluateComponent("fiftyGCalculator", state, config);
  if (!availability.visible) return "";

  const nextDuration = calculateAlgorithmUpgradeDuration(state, config, false);

  return `
    <article class="panel science-panel ${state.science.fiftyGCalculator ? "device-card--online" : ""}">
      ${helpNote("Extends Auto Calculator routing to Algorithm Upgrades. Manual Upgrades remain instant; automated Upgrades use their growing execution time.")}
      <div class="panel__header-row">
        ${renderCardTags("Science", "Automation")}
        <span class="card-subsystem">Upgrade Pipeline</span>
      </div>
      <div class="panel__heading">
        <div>
          <h2>50G Calculator</h2>
        </div>
        ${
          state.science.fiftyGCalculator
            ? statusPill("ACTIVE", "online")
            : headingAction("Study", "buy-fifty-g-calculator", {
                cost: availability.cost,
                costLabel: `${availability.cost} SP`,
                disabled: !availability.enabled,
                variant: availability.enabled ? "primary" : "ghost",
              })
        }
      </div>
      <p class="muted">Routes completed improvement sets into an automated algorithm reconstruction.</p>
      <div class="metric-row">
        <span>Effect</span>
        <strong>Automates A. Upgrades with growing execution time</strong>
      </div>
      <div class="metric-row">
        <span>Current automated duration</span>
        <strong>${formatDuration(nextDuration)}</strong>
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
          `,
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

function renderEnergyTab(state, config, developmentMode) {
  const storageDevices = `
    <div class="energy-storage-section">
      <div class="energy-storage-header">
        <span class="muted">Expand facility capacity to avoid overflow decay.</span>
        ${renderBuyModeSelector(state)}
      </div>
      <div class="energy-storage-grid">
        ${renderComponent("powerCell", state, config, () => renderPowerCellArray(state, config))}
        ${renderComponent("powerModule", state, config, () => renderPowerModule(state, config))}
      </div>
    </div>
  `;

  const upgradeRendered = renderAlgorithmUpgrade(state, config);
  const currentBonus = calculateImprovementBonus(
    state.improvements,
    config,
    state.calculationMethods,
  );
  const upgradeBonus = 2 ** state.upgrades;

  const cascadeContent = `
    <div class="cascade-flow">
      <div class="cascade-stage cascade-stage--crc">
        ${renderCrcDevice(state, config, developmentMode)}
        ${renderComponent("crcBlueprint", state, config, () => renderBlueprint(state, config, developmentMode))}
        ${renderComponent("crcConstruction", state, config, () => renderCrcConstruction(state, config))}
      </div>

      <div class="cascade-conduit" aria-hidden="true">
        <div class="cascade-conduit__line"></div>
        <div class="cascade-conduit__node">
          <span class="cascade-conduit__icon">▼</span>
          <span class="cascade-conduit__label">ALGORITHM INJECTION</span>
          <span class="cascade-conduit__sub">Algorithm Improvements add +1 base output per CRC each cycle (Active factor: x${1 + state.improvements})</span>
        </div>
        <div class="cascade-conduit__line"></div>
      </div>

      <div class="cascade-stage cascade-stage--study">
        ${renderStudy(state, config, developmentMode)}
      </div>

      ${
        upgradeRendered.trim()
          ? `
        <div class="cascade-conduit cascade-conduit--upgrade" aria-hidden="true">
          <div class="cascade-conduit__line"></div>
          <div class="cascade-conduit__node">
            <span class="cascade-conduit__icon">▼</span>
            <span class="cascade-conduit__label">PARADIGM COMPILATION</span>
            <span class="cascade-conduit__sub">Algorithm Upgrades restructure architecture (2<sup>${state.upgrades}</sup> = x${upgradeBonus} multiplier · Resets Improvements)</span>
          </div>
          <div class="cascade-conduit__line"></div>
        </div>

        <div class="cascade-stage cascade-stage--upgrade">
          ${upgradeRendered}
        </div>
      `
          : ""
      }
    </div>
  `;

  const resetCards = `
    <div class="reset-routes-grid">
      ${renderCalculationMethod(state, config)}
      ${renderSetupOptimization(state, config)}
    </div>
  `;

  const labReadable = canAccessParticleLab(state, config);
  const labContent = labReadable
    ? `
      <section class="energy-section energy-section--lab" aria-label="Particle Laboratory Access">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">PARTICLE LABORATORY</p>
            <h2>Laboratory Threshold</h2>
          </div>
          <p>The high-energy bridge to particle synthesis and scientific breakthroughs.</p>
        </div>
        <div class="section-stack">
          ${renderParticleLabDetails(state, config)}
        </div>
      </section>
    `
    : "";

  return `
    ${renderTabTools(state)}
    <div class="tab-grid energy-tab-layout">
      <section class="tab-main-column">
        <section class="energy-section" aria-label="Energy Storage">
          <div class="device-group__heading">
            <div>
              <p class="panel__label">ENERGY STORAGE</p>
              <h2>Containment & Capacity</h2>
            </div>
            <p>Power Cells preserve energy across Setup Optimizations; Power Modules scale bulk capacity.</p>
          </div>
          <div class="section-stack">${storageDevices}</div>
        </section>

        <section class="energy-section" aria-label="Energy Production Cascade">
          <div class="device-group__heading">
            <div>
              <p class="panel__label">ENERGY PRODUCTION CASCADE</p>
              <h2>Condensation & Algorithms</h2>
            </div>
            <p>CRCs harvest cosmic radiation, amplified by refined calculation algorithms.</p>
          </div>
          <div class="section-stack">${cascadeContent}</div>
        </section>

        <section class="energy-section" aria-label="Breakthroughs and Reset Routes">
          <div class="device-group__heading">
            <div>
              <p class="panel__label">BREAKTHROUGHS & RESET ROUTES</p>
              <h2>Strategic Progression</h2>
            </div>
            <p>Soft and hard resets that reconfigure facility architecture for long-term growth.</p>
          </div>
          <div class="section-stack">${resetCards}</div>
        </section>

        ${labContent}
      </section>
    </div>
  `;
}

function renderAutomationTab(state, config, developmentMode, saveSlots) {
  const impRate =
    state.devices.autoCalculators > 0
      ? calculateImprovementRatePerSecond(state, config, developmentMode)
      : 0;
  const fleetSummary = `
    <article class="panel fleet-summary-panel">
      <p class="panel__label">COMPUTATIONAL FLEET</p>
      <div class="panel__heading">
        <div>
          <h2>Automation Fleet Telemetry</h2>
        </div>
        ${statusPill(impRate > 0 ? `${formatRate(impRate).replace("/s", "")} imp/s` : "IDLE", impRate > 0 ? "online" : "")}
      </div>
      <div class="metric-row">
        <span>Auto Calculators</span>
        <strong>${state.devices.autoCalculators} units</strong>
      </div>
      <div class="metric-row">
        <span>Processors (Amplification)</span>
        <strong>${state.devices.processors} units (x${calculateProcessorEfficiencyMultiplier(state, config).toFixed(2)})</strong>
      </div>
      <div class="metric-row">
        <span>Overclocker status</span>
        <strong>${
          state.devices.overclockers > 0
            ? state.overclocker?.active
              ? `ONLINE (x${calculateOverclockerSpeedMultiplier(state, config).toFixed(2)})`
              : state.overclocker?.activeSeconds > 0
                ? "COOLING"
                : "READY"
            : "NOT INSTALLED"
        }</strong>
      </div>
    </article>
  `;

  const computationalDevices = `
    <div class="computational-devices-stack">
      ${renderComponent("autoCalculator", state, config, () => renderAutoCalculator(state, config))}
      ${renderComponent("processor", state, config, () => renderProcessor(state, config))}
      ${renderComponent("overclockerBlueprint", state, config, () => renderOverclockerBlueprint(state, config, developmentMode))}
      ${renderComponent("overclocker", state, config, () => renderOverclocker(state, config))}
    </div>
  `;

  const instrumentationDevices = `
    <div class="instrumentation-stack">
      ${renderComponent("softDataDisplay", state, config, () => renderSoftDataDisplay(state, config))}
      ${renderComponent("t2SoftDataDisplay", state, config, () => renderT2SoftDataDisplay(state, config))}
    </div>
  `;

  const unlockedAutomations = listUnlockedAutomations(state);
  const automationsContent = `
    <div class="automations-stack">
      ${renderFiftyGCalculator(state, config)}
      ${
        unlockedAutomations.length
          ? `
        <article class="panel automations-panel">
          <div class="panel__heading">
            <div>
              <p class="panel__label">CONTROL LOOP</p>
              <h2>Automation Toggles</h2>
            </div>
            ${statusPill(`${unlockedAutomations.length} UNLOCKED`, "online")}
          </div>
          <div class="automation-list">
            ${unlockedAutomations
              .map((automation) => {
                const enabled = isAutomationEnabled(state, automation.id);
                const acquired = automation.isAcquired(state);
                return `
                  <div class="automation-row ${enabled ? "automation-row--on" : ""}">
                    <div>
                      <strong>${automation.name}</strong>
                      <p class="muted">${automation.description}</p>
                      <small>${
                        acquired
                          ? enabled
                            ? "ONLINE"
                            : "PAUSED"
                          : "UNLOCKED // CURRENTLY OFFLINE"
                      }</small>
                    </div>
                    <button
                      class="toggle-control ${enabled ? "toggle-control--on" : ""}"
                      data-action="toggle-automation"
                      data-automation-id="${automation.id}"
                      type="button"
                      role="switch"
                      aria-checked="${enabled}"
                    >
                      <span aria-hidden="true"></span>
                      <strong>${enabled ? "Enabled" : "Disabled"}</strong>
                    </button>
                  </div>
                `;
              })
              .join("")}
          </div>
        </article>
      `
          : ""
      }
    </div>
  `;

  const diagnosticsAndSaves = `
    <div class="diagnostics-stack">
      ${state.devices.t2SoftDataDisplay ? renderMeasureTab(state, config, developmentMode) : ""}
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
      ${renderLog(state)}
      ${renderSaveManagement(saveSlots, developmentMode)}
    </div>
  `;

  return `
    ${renderTabTools(state)}
    <div class="tab-grid">
      <section class="tab-main-column">
        ${fleetSummary}
        <section class="device-group" aria-label="Computational Devices">
          <div class="device-group__heading">
            <div>
              <p class="panel__label">COMPUTATIONAL HARDWARE</p>
              <h2>Processing & Automation</h2>
            </div>
            <p>Calculators and processors accelerate study throughput and automate routine operations.</p>
          </div>
          <div class="section-stack">${computationalDevices}</div>
        </section>

        <section class="device-group" aria-label="Instrumentation & Displays">
          <div class="device-group__heading">
            <div>
              <p class="panel__label">INSTRUMENTATION & DISPLAYS</p>
              <h2>Telemetry & Data Feeds</h2>
            </div>
            <p>Diagnostic modules that unlock purchase controls and detailed energy telemetry.</p>
          </div>
          <div class="section-stack">${instrumentationDevices}</div>
        </section>

        <section class="device-group" aria-label="Automations">
          <div class="device-group__heading">
            <div>
              <p class="panel__label">AUTOMATIONS</p>
              <h2>Automated Routing</h2>
            </div>
            <p>Background routines unlocked through study and scientific advancement.</p>
          </div>
          <div class="section-stack">${automationsContent}</div>
        </section>
      </section>

      <aside class="tab-side-column">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">DIAGNOSTICS & SYSTEM</p>
            <h2>Facility Telemetry & Storage</h2>
          </div>
          <p>Real-time telemetry breakdown and local persistence slots.</p>
        </div>
        <div class="section-stack">${diagnosticsAndSaves}</div>
      </aside>
    </div>
  `;
}

function renderDevicesTab(state, config, developmentMode) {
  return renderEnergyTab(state, config, developmentMode);
}

function renderStudiesTab(state, config, developmentMode) {
  return renderEnergyTab(state, config, developmentMode);
}

function renderScienceSubtabs(state) {
  const active = state.ui?.activeScienceSubtab ?? "tree";
  return `
    <nav class="tabbar tabbar--nested" aria-label="Science sections">
      <button class="tabbar__button ${active === "tree" ? "tabbar__button--active" : ""}" data-action="set-science-subtab" data-science-subtab="tree" type="button">Science Tree</button>
      <button class="tabbar__button ${active === "devices" ? "tabbar__button--active" : ""}" data-action="set-science-subtab" data-science-subtab="devices" type="button">Science Devices</button>
    </nav>
  `;
}

function renderScienceTab(state, config) {
  const labReadable = canAccessParticleLab(state, config);
  const activeSubtab = state.ui?.activeScienceSubtab ?? "tree";
  const treeContent = `
    <div class="device-group__heading">
      <div>
        <p class="panel__label">SCIENCE</p>
        <h2>Science Tree</h2>
      </div>
      <p>Preserved principles survive particle synthesis and change how the next Energy Layer behaves.</p>
    </div>
    <div class="science-tree-layout-v2">
      <div class="science-tree-layout-v2__main">
        ${renderScienceStatus(state, config)}
        ${renderScienceTree(state, config)}
      </div>
      <div class="science-tree-layout-v2__drawer">
        ${renderSciencePerkDrawer(state, config)}
      </div>
    </div>
  `;
  const devicesContent = `
    <div class="device-group__heading">
      <div>
        <p class="panel__label">SCIENCE DEVICES</p>
        <h2>Laboratory Hardware</h2>
      </div>
      <p>Hardware for particle synthesis and safe quark containment.</p>
    </div>
    <div class="section-stack">
      ${renderScienceStatus(state, config)}
      ${renderParticleSynthesizerDevice(state, config)}
      ${renderComponent("quarkCage", state, config, () => renderQuarkCage(state, config)) || '<p class="empty-note">No science device is readable yet.</p>'}
    </div>
  `;

  return `
    ${renderTabTools(state)}
    ${renderScienceSubtabs(state)}
    ${
      activeSubtab === "tree"
        ? `
      <div class="tab-grid tab-grid--single science-tree-layout">
        <section class="tab-main-column">${treeContent}</section>
      </div>
    `
        : `
    <div class="tab-grid">
      <section class="tab-main-column">${devicesContent}</section>
      <aside class="tab-side-column">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">LAB</p>
            <h2>Particle Laboratory</h2>
          </div>
          <p>The central panel remains the bridge into the next reset.</p>
        </div>
        <div class="section-stack">
          ${
            !labReadable
              ? '<p class="empty-note">Particle Laboratory signal is not readable in this run yet.</p>'
              : (state.science?.syntheses ?? 0) > 0
                ? '<p class="empty-note">The laboratory remains open. Particle Sintetizer controls have moved to Science Devices.</p>'
                : renderComponent("particleSynthesizer", state, config, () =>
                    renderParticleLabDetails(state, config),
                  )
          }
        </div>
      </aside>
    </div>
    `
    }
  `;
}

function renderHistoryTab(state) {
  const activeFilter = state.ui?.historyFilter ?? "all";
  const history = state.history || [];

  const filteredHistory = history.filter((entry) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "narrative") return entry.kind === "Narrative";
    if (activeFilter === "discoveries") return entry.kind === "Discoveries";
    if (activeFilter === "milestones") return entry.kind === "Milestones";
    return true;
  });

  const sortedHistory = [...filteredHistory].reverse();

  return `
    ${renderTabTools(state)}
    <div class="history-view">
      <div class="device-group__heading">
        <div>
          <p class="panel__label">ARCHIVE</p>
          <h2>Facility History & Narrative Log</h2>
        </div>
        <p>A persistent chronicle of facility breakthroughs, anomalies, and milestone discoveries.</p>
      </div>

      <div class="history-filter-bar" role="group" aria-label="History categories">
        <button
          type="button"
          class="btn btn--ghost btn--small ${activeFilter === "all" ? "btn--active" : ""}"
          data-action="set-history-filter"
          data-filter="all"
        >
          All (${history.length})
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--small ${activeFilter === "narrative" ? "btn--active" : ""}"
          data-action="set-history-filter"
          data-filter="narrative"
        >
          Narrative (${history.filter((h) => h.kind === "Narrative").length})
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--small ${activeFilter === "discoveries" ? "btn--active" : ""}"
          data-action="set-history-filter"
          data-filter="discoveries"
        >
          Discoveries (${history.filter((h) => h.kind === "Discoveries").length})
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--small ${activeFilter === "milestones" ? "btn--active" : ""}"
          data-action="set-history-filter"
          data-filter="milestones"
        >
          Milestones (${history.filter((h) => h.kind === "Milestones").length})
        </button>
      </div>

      <div class="history-list" role="feed" aria-label="History entries">
        ${
          sortedHistory.length === 0
            ? '<p class="empty-note">No historical records in this archive category yet.</p>'
            : sortedHistory
                .map((entry) => `
                  <article class="panel history-entry-card" tabindex="0">
                    <div class="panel__heading">
                      <div>
                        <span class="card-tag card-tag--${entry.kind.toLowerCase()}">${entry.kind}</span>
                        <h3>${entry.title}</h3>
                      </div>
                      <time class="muted">${formatDuration(entry.at)}</time>
                    </div>
                    <p class="history-snippet">${entry.summary || (entry.body ? entry.body.slice(0, 140) + "..." : "")}</p>
                    <div class="panel__action">
                      <button
                        type="button"
                        class="button button--ghost button--compact"
                        data-action="open-history-entry"
                        data-history-id="${entry.id}"
                      >
                        Read Full Record
                      </button>
                    </div>
                  </article>
                `)
                .join("")
        }
      </div>
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

function renderAutomationsTab(state) {
  const rows = listUnlockedAutomations(state);

  return `
    <div class="tab-grid tab-grid--single">
      <section class="tab-main-column">
        <div class="device-group__heading">
          <div>
            <p class="panel__label">AUTOMATIONS</p>
            <h2>Active Routing Controls</h2>
          </div>
          <p>Pause or resume every automation this run has enabled. Unlocks stay listed after prestige resets.</p>
        </div>
        <article class="panel automations-panel">
          ${helpNote("These switches only stop automatic actions. Owned devices and purchased Science perks keep their other bonuses.")}
          <div class="panel__heading">
            <div>
              <p class="panel__label">CONTROL LOOP</p>
              <h2>Automation Toggles</h2>
            </div>
            ${statusPill(`${rows.length} UNLOCKED`, "online")}
          </div>
          <div class="automation-list">
            ${rows
              .map((automation) => {
                const enabled = isAutomationEnabled(state, automation.id);
                const acquired = automation.isAcquired(state);
                return `
                  <div class="automation-row ${enabled ? "automation-row--on" : ""}">
                    <div>
                      <strong>${automation.name}</strong>
                      <p class="muted">${automation.description}</p>
                      <small>${
                        acquired
                          ? enabled
                            ? "ONLINE"
                            : "PAUSED"
                          : "UNLOCKED // CURRENTLY OFFLINE"
                      }</small>
                    </div>
                    <button
                      class="toggle-control ${enabled ? "toggle-control--on" : ""}"
                      data-action="toggle-automation"
                      data-automation-id="${automation.id}"
                      type="button"
                      role="switch"
                      aria-checked="${enabled}"
                    >
                      <span aria-hidden="true"></span>
                      <strong>${enabled ? "Enabled" : "Disabled"}</strong>
                    </button>
                  </div>
                `;
              })
              .join("")}
          </div>
        </article>
      </section>
    </div>
  `;
}

function renderMeasureTab(state, config, developmentMode) {
  const production = calculateProduction(state, config, developmentMode);
  const breakdown = calculateProductionBreakdown(
    state,
    config,
    developmentMode,
  );

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
              <span>Factor</span>
              <span>Multiplier</span>
              <span>Added output</span>
              <span>Running output</span>
              <span>Share</span>
            </div>
            ${breakdown
              .map((row) => {
                const share = production.gt(0)
                  ? row.value.div(production).toNumber()
                  : 0;
                return `
                  <div class="measure-table__row" role="row">
                    <span><strong>${row.label}</strong><small>${row.detail}</small></span>
                    <strong>${row.multiplierLabel}</strong>
                    <strong>${formatRate(row.value)}</strong>
                    <strong>${formatRate(row.output)}</strong>
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

function renderTabContent(
  activeTab,
  state,
  config,
  developmentMode,
  saveSlots,
) {
  if (
    activeTab === "automation" ||
    activeTab === "automations" ||
    activeTab === "measure" ||
    activeTab === "statistics" ||
    activeTab === "save"
  ) {
    return renderAutomationTab(state, config, developmentMode, saveSlots);
  }
  if (activeTab === "science") return renderScienceTab(state, config);
  if (activeTab === "history") return renderHistoryTab(state);
  return renderEnergyTab(state, config, developmentMode);
}

function renderResetConfirmationModal(state, config) {
  const modalType = state.ui?.resetModal;
  if (!modalType) return "";

  const preview = getResetPreviewData(state, config, modalType);
  if (!preview) return "";

  const isHard = modalType === "setup" || modalType === "synthesis";

  return `
    <div class="modal-backdrop">
      <section
        class="reset-modal ${isHard ? "reset-modal--hard" : ""}"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-modal-title"
      >
        <p class="panel__label">${isHard ? "IRREVERSIBLE LAYER RESET" : "CALCULATION RESTRUCTURING"}</p>
        <h2 id="reset-modal-title">${preview.title}</h2>

        <div class="reset-modal__section reset-modal__section--gain">
          <strong class="reset-modal__label">Gained:</strong>
          <p>${preview.gain}</p>
        </div>

        <div class="reset-modal__section reset-modal__section--lost">
          <strong class="reset-modal__label">Reset / Discarded:</strong>
          <p>${preview.lost}</p>
        </div>

        <div class="reset-modal__section reset-modal__section--preserved">
          <strong class="reset-modal__label">Preserved:</strong>
          <p>${preview.preserved}</p>
        </div>

        ${
          preview.warnings
            ? `
          <div class="reset-modal__section reset-modal__section--warning">
            <strong class="reset-modal__label">Warning:</strong>
            <p>${preview.warnings}</p>
          </div>
        `
            : ""
        }

        <div class="reset-modal__actions">
          <button
            type="button"
            class="button button--ghost"
            data-action="cancel-reset-modal"
            autofocus
          >
            Cancel
          </button>
          <button
            type="button"
            class="button ${isHard ? "button--danger" : "button--primary"}"
            data-action="confirm-reset-modal"
            ${preview.isEligible ? "" : "disabled"}
          >
            Confirm ${preview.type === "cmu" ? "Upgrade" : preview.type === "setup" ? "Optimization" : "Synthesis"}
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderHistoryReadingModal(state) {
  const entry = state.ui?.historyModalEntry;
  if (!entry) return "";

  return `
    <div class="modal-backdrop">
      <section
        class="history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
      >
        <div class="panel__heading">
          <div>
            <p class="panel__label">ARCHIVE RECORD // ${entry.kind.toUpperCase()}</p>
            <h2 id="history-modal-title">${entry.title}</h2>
          </div>
          <time class="muted">${formatDuration(entry.at)}</time>
        </div>

        <div class="history-modal__body">
          <p>${entry.body.replace(/\n\n/g, "</p><p>")}</p>
        </div>

        <div class="history-modal__actions">
          <button
            type="button"
            class="button button--ghost"
            data-action="close-history-modal"
            autofocus
          >
            Close Archive Record
          </button>
        </div>
      </section>
    </div>
  `;
}

function setField(app, key, value) {
  for (const element of app.querySelectorAll(`[data-field="${key}"]`)) {
    if (element.textContent !== value) element.textContent = value;
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
      saveSlots,
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
    buyMode: state.ui?.buyMode ?? "1",
    resetModal: state.ui?.resetModal ?? null,
    historyModalEntry: state.ui?.historyModalEntry?.id ?? null,
    historyFilter: state.ui?.historyFilter ?? "all",
    historyLength: state.history?.length ?? 0,
    treeZoom: state.ui?.treeZoom ?? 1.0,
    selectedSciencePerkId: state.ui?.selectedSciencePerkId ?? null,
    improvements: state.improvements,
    upgrades: state.upgrades,
    crcCount: state.crcCount,
    powerCells: state.powerCells,
    powerModules: state.powerModules,
    sciencePoints: state.sciencePoints,
    totalScienceEarned: state.science?.totalScienceEarned ?? 0,
    availableQuarks: state.quarks?.available ?? 0,
    totalQuarksEarned: state.quarks?.totalEarned ?? 0,
    lastQuarks: state.quarks?.lastSynthesis ?? 0,
    quarkCages: state.scienceDevices?.quarkCages ?? 0,
    scienceSubtab: state.ui?.activeScienceSubtab ?? "tree",
    particleSynthesisModal: state.ui?.particleSynthesisModal ?? null,
    redundancyElimination: state.science?.perks ?? {},
    revealedPerks: state.science?.revealedPerks ?? {},
    preservedImprovementLog: state.preservedImprovementLog ?? 0,
    fiftyGCalculator: state.science?.fiftyGCalculator ?? false,
    automations: state.automations ?? {},
    syntheses: state.science?.syntheses ?? 0,
    particleSynthesizerActivated: state.particleSynthesizer.activated,
    calculationMethods: state.calculationMethods,
    setupOptimizations: state.setupOptimizations,
    softDataDisplay: state.devices.softDataDisplay,
    t2SoftDataDisplay: state.devices.t2SoftDataDisplay,
    overclockers: state.devices.overclockers,
    overclockerActive: state.overclocker.active,
    availability,
    overflowingEnergy: big(state.energy).gt(stableCapacity),
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
    latestLogId: state.log[0]?.id ?? "",
  });
}

function updateDynamicFields(app, state, config, developmentMode) {
  if (state.introState !== "active") return;

  const stableCapacity = calculateStableEnergyCapacity(state, config);
  setField(app, "energy", formatEnergy(state.energy));
  setProgress(app, "energy", big(state.energy).div(stableCapacity).toNumber());

  const milestone = calculateNextMilestone(state, config);
  setField(app, "milestone-title", milestone.title);
  setField(app, "milestone-req", milestone.requirement);
  setProgress(app, "milestone", milestone.progress);

  if (canAccessParticleLab(state, config)) {
    setProgress(
      app,
      "particle-synthesizer",
      calculateParticleSynthesizerProgress(state, config),
    );
    setProgress(
      app,
      "particle-synthesizer-device",
      calculateParticleSynthesizerProgress(state, config),
    );
    const nextSciencePointCost = calculateSciencePointCost(
      state.science?.totalScienceEarned ?? 0,
      config,
    );
    setProgress(
      app,
      "science-point",
      big(state.energy).div(nextSciencePointCost).toNumber(),
    );
    setField(
      app,
      "science-sp-on-synthesis",
      calculateSciencePointReward(
        state.energy,
        state.science?.totalScienceEarned ?? 0,
        config,
      ).toString(),
    );
    setField(app, "science-point-cost", formatEnergy(nextSciencePointCost));
    const projectedQuarks = calculateQuarksGenerated(
      state.energy,
      config,
    ).toString();
    setField(app, "science-quarks-on-synthesis", projectedQuarks);
    setField(app, "device-quarks-on-synthesis", projectedQuarks);
  } else {
    setProgress(app, "door", calculateDoorProgress(state, config));
  }

  if (state.devices.softDataDisplay) {
    const production = calculateProduction(state, config, developmentMode);
    const netProduction = calculateEffectiveProduction(
      state,
      config,
      developmentMode,
    );
    const overflowDecay = calculateEnergyOverflowDecay(state, config);
    const remainingCapacity = bigMax(
      0,
      stableCapacity.sub(state.energy),
    );
    const fillTime =
      production.gt(0) && remainingCapacity.gt(0)
        ? formatDuration(remainingCapacity.div(production))
        : big(state.energy).gt(stableCapacity)
          ? "EQUILIBRATING"
          : "FULL";

    setField(app, "energy-rate", formatRate(production));
    setField(app, "retained-rate-main", formatRate(netProduction));
    setField(app, "retained-rate", formatRate(netProduction));
    setField(app, "energy-retention-main", formatRate(overflowDecay));
    setField(app, "fill-time", fillTime);
    setField(app, "energy-retention", formatRate(overflowDecay));
    setField(
      app,
      "total-energy",
      formatEnergy(state.stats.totalEnergyCollected),
    );
  }

  if (state.devices.overclockers > 0) {
    const activePreview = {
      ...state,
      overclocker: {
        ...state.overclocker,
        active: true,
      },
    };
    const speed = calculateOverclockerSpeedMultiplier(activePreview, config);
    const drain = calculateOverclockerDrainPerSecond(activePreview, config);
    const status = state.overclocker.active
      ? `x${speed.toFixed(2)} active // ${formatRate(drain)}`
      : `x${speed.toFixed(2)} ${state.overclocker.activeSeconds > 0 ? "cooling" : "ready"} // ${formatRate(drain)}`;
    setField(app, "overclock-inline", status);
    setField(
      app,
      "study-overclock-button-detail",
      `x${speed.toFixed(2)} // ${formatRate(drain)}`,
    );
    setField(
      app,
      "overclock-current",
      `x${speed.toFixed(2)} / ${formatRate(drain)}`,
    );
    setField(
      app,
      "study-overclock-status",
      state.overclocker.active
        ? "The calculator route is running hot."
        : state.overclocker.activeSeconds > 0
          ? "Cooling. Re-engaging now resumes from the current thermal load."
          : "Available while Auto Calculator is online and excess Stored Energy exists.",
    );
    setField(
      app,
      "overclock-effect",
      state.overclocker.active
        ? "OVERCLOCK ACTIVE"
        : state.overclocker.activeSeconds > 0
          ? "COOLING"
          : "OVERCLOCK ROUTE EXPANDED",
    );
    setField(
      app,
      "overclock-runtime",
      state.overclocker.active
        ? `HOT ${formatDuration(state.overclocker.activeSeconds)}`
        : state.overclocker.activeSeconds > 0
          ? `COOLING ${formatDuration(state.overclocker.activeSeconds)}`
          : "STANDBY",
    );
  }

  if (state.study.active) {
    setProgress(app, "study", state.study.elapsed / state.study.duration);
    setField(
      app,
      "study-remaining",
      formatDuration(Math.max(0, state.study.duration - state.study.elapsed)),
    );
  }

  if (state.algorithmUpgradeStudy.active) {
    setProgress(
      app,
      "algorithm-upgrade",
      state.algorithmUpgradeStudy.elapsed /
        state.algorithmUpgradeStudy.duration,
    );
    setField(
      app,
      "algorithm-upgrade-remaining",
      formatDuration(
        Math.max(
          0,
          state.algorithmUpgradeStudy.duration -
            state.algorithmUpgradeStudy.elapsed,
        ),
      ),
    );
  }

  if (state.blueprintStudy.active) {
    setProgress(
      app,
      "blueprint",
      state.blueprintStudy.elapsed / state.blueprintStudy.duration,
    );
    setField(
      app,
      "blueprint-remaining",
      formatDuration(
        Math.max(
          0,
          state.blueprintStudy.duration - state.blueprintStudy.elapsed,
        ),
      ),
    );
  }

  if (state.construction.active) {
    setProgress(
      app,
      "construction",
      state.construction.elapsed / state.construction.duration,
    );
    setField(
      app,
      "construction-remaining",
      formatDuration(
        Math.max(0, state.construction.duration - state.construction.elapsed),
      ),
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
      ${renderGlobalHUD(state, config, developmentMode)}
    </section>
    <section class="tab-content tab-content--${activeTab}" aria-label="${activeTab}">
      ${renderTabContent(activeTab, state, config, developmentMode, saveSlots)}
      ${developmentMode ? renderDevelopmentPanel(state) : ""}
    </section>
    ${renderResetConfirmationModal(state, config)}
    ${renderHistoryReadingModal(state)}
    ${renderParticleSynthesisModal(state, config)}
  `;
}

const renderEnergy = renderGlobalHUD;

export function createRenderer(
  app,
  config,
  developmentMode,
  getSaveSlots = () => [],
) {
  let lastRenderSignature = "";
  let pointerIsDown = false;
  let deferredRender = false;

  app.addEventListener(
    "pointerdown",
    () => {
      pointerIsDown = true;
    },
    true,
  );

  const finishPointerInteraction = () => {
    pointerIsDown = false;
    if (!deferredRender) return;

    window.setTimeout(() => {
      if (!pointerIsDown && deferredRender) render(deferredRender.state);
    }, 120);
  };

  app.addEventListener("pointerup", finishPointerInteraction, true);
  app.addEventListener("pointercancel", finishPointerInteraction, true);

  return function render(state) {
    const saveSlots = getSaveSlots();
    const signature = createRenderSignature(
      state,
      config,
      developmentMode,
      saveSlots,
    );

    if (signature === lastRenderSignature) {
      updateDynamicFields(app, state, config, developmentMode);
      return;
    }

    if (pointerIsDown) {
      deferredRender = { state };
      updateDynamicFields(app, state, config, developmentMode);
      return;
    }

    lastRenderSignature = signature;
    deferredRender = false;

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
