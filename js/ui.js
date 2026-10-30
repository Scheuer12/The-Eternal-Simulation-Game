/**
 * ui.js
 * The Eternal Simulation — Modern Sci-Fi Frontend Implementation
 * Adheres to Antigravity_TES_UI_Frontend_Prompt.md:
 * - Reduced element density, intentional empty spaces, dark sci-fi aesthetic
 * - Persistent sticky Facility Level & Currency Rail across all tabs
 * - Compact horizontal CRC and A-Feature study rows (64-74px)
 * - Two independent columns on Devices screen with section headers
 * - Slide-out drawers and contextual popovers
 */

import { formatEnergy, formatRate, formatInteger, formatNumber, formatDuration, formatStudyDuration, getEnergyEquivalenceText, big } from "./numeric.js";
import { getTooltipContent } from "./ui-tooltip-content.js";
import {
  getElement,
  evaluateElement,
  getAllElements,
} from "./component-registry.js";
import {
  calculateAvailableData,
  calculateEffectiveAvailableData,
  calculateDataFromAlgorithms,
  calculateRequiredDataForNextComputerLevel,
  calculateFacilityOptimizationRequirement,
  calculateFacilityDeviceMultiplier,
  calculateProcessorDeviceMultiplier,
  calculateStudySpeedDeviceMultiplier,
  calculateTotalDeviceMultiplier,
  calculateCapacitorMultiplier,
  calculateCrcMultiplier,
  calculateMicroprocessorStudyMultiplier,
  calculateAlgorithmBaseStrengths,
  calculateAlgorithmPerformance,
  calculateComputerPerformanceMultiplier,
  calculateEnergyProduction,
  calculateBackpropagatorMultiplier,
  calculateEnergyOverflowDecay,
  calculateEffectiveStudyDuration,
  calculateEffectiveStudySpeed,
  calculatePowerCellCapacity,
  calculateBulkDeviceCost,
  calculateHardDiskXpRate,
  calculateHardDiskEnergyDrain,
  calculateOverclockDuration,
  calculateOverclockBonusMultiplier,
  calculateStudyImproveMilestone,
  calculateStudyImproveMultiplier,
  calculateEnergyEraProgress,
  calculateEnergyEraPercent,
} from "./formulas.js";

export const TES_ICON_ROOT = "icons/";
export const tesIconPath = (name) => `${TES_ICON_ROOT}${name}.png`;

class CrcGrowthTracker {
  constructor() {
    this.history = [];
    this.lastMlCount = null;
    this.lastSoCount = null;
  }

  reset() {
    this.history = [];
  }

  update(prodRate, nowMs, mlCount = 0, soCount = 0) {
    if (this.lastMlCount !== null && (this.lastMlCount !== mlCount || this.lastSoCount !== soCount)) {
      this.reset();
    }
    this.lastMlCount = mlCount;
    this.lastSoCount = soCount;

    const rate = big(prodRate || 0);
    this.history.push({ time: nowMs, rate });

    const cutoff = nowMs - 2500;
    while (this.history.length > 2 && this.history[0].time < cutoff) {
      this.history.shift();
    }

    const targetTime = nowMs - 1000;
    let closest = null;
    let minDiff = Infinity;

    for (const entry of this.history) {
      const diff = Math.abs(entry.time - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry;
      }
    }

    if (!closest) {
      return { text: "(+0.00%/sec)", percentage: 0, isNegative: false };
    }

    const dt = (nowMs - closest.time) / 1000;
    if (dt < 0.4) {
      return { text: "(+0.00%/sec)", percentage: 0, isNegative: false };
    }

    const pastRate = closest.rate;
    if (pastRate.eq(0)) {
      if (rate.eq(0)) {
        return { text: "(+0.00%/sec)", percentage: 0, isNegative: false };
      }
      return { text: "(---/sec)", percentage: 0, isNegative: false };
    }

    if (rate.eq(pastRate)) {
      return { text: "(+0.00%/sec)", percentage: 0, isNegative: false };
    }

    let percentNum;
    try {
      const ratio = rate.div(pastRate);
      const change = ratio.minus(1);
      percentNum = change.div(dt).mul(100).toNumber();
    } catch {
      percentNum = 0;
    }

    if (!Number.isFinite(percentNum) || Number.isNaN(percentNum)) {
      return { text: "(+0.00%/sec)", percentage: 0, isNegative: false };
    }

    if (Math.abs(percentNum) < 0.005) {
      return { text: "(+0.00%/sec)", percentage: 0, isNegative: false };
    }

    const isNegative = percentNum < 0;
    const sign = isNegative ? "" : "+";
    const formatted = `${sign}${percentNum.toFixed(2)}%/sec`;
    return { text: `(${formatted})`, percentage: percentNum, isNegative };
  }
}

export function createRenderer(container, engine) {
  let isMounted = false;
  let activeDrawer = null; // 'dev' | 'transistor' | 'microprocessor' | 'harddisk' | 'settings' | 'stats' | 'overclock'
  let activePopover = null; // { title, content, x, y }
  let newsIndex = 0;
  let newsTimer = null;
  let isNewsPaused = false;
  let batchPopoverTarget = null; // target feature id or device id for batch menu
  const crcGrowthTracker = new CrcGrowthTracker();
  let activeNarrativeMilestone = null;
  let isNarrativePreview = false;

  // Default news items if __TES_NEWS__ is missing or empty
  const defaultNews = [
    "The universe keeps expanding, and somehow apartments on big cities keeps getting smaller...",
    "PROCESSING NETWORK ONLINE // Additional computing cores detected in facility sub-grid.",
    "A muon at rest lives only about 2.2 microseconds on average before decaying.",
    "Cosmic radiation flux within expected parameters across all sectors.",
    "Relativistic effects make satellite clocks run slightly faster before corrections.",
  ];

  function getNewsList() {
    if (
      globalThis.__TES_NEWS__ &&
      Array.isArray(globalThis.__TES_NEWS__) &&
      globalThis.__TES_NEWS__.length > 0
    ) {
      return globalThis.__TES_NEWS__.map((item) =>
        typeof item === "string" ? item : item.text,
      );
    }
    return defaultNews;
  }

  function startNewsCarousel() {
    if (newsTimer) clearInterval(newsTimer);
    newsTimer = setInterval(() => {
      if (!isNewsPaused) {
        const list = getNewsList();
        newsIndex = (newsIndex + 1) % list.length;
        updateNewsDisplay();
      }
    }, 10000);
  }

  const setText = (field, val) => {
    const el = container.querySelector(`[data-field="${field}"]`);
    if (el && el.textContent !== String(val)) el.textContent = String(val);
  };

  function updateNewsDisplay() {
    const el = container.querySelector('[data-field="news-content"]');
    if (el) {
      const list = getNewsList();
      el.textContent = list[newsIndex % list.length] || list[0];
    }
  }

  function isNarrativeModalOpen() {
    return Boolean(activeNarrativeMilestone);
  }

  function showNarrativeModal(milestone, isPreview = false) {
    if (activeNarrativeMilestone && !isPreview) return;
    activeNarrativeMilestone = milestone;
    isNarrativePreview = isPreview;

    const overlay = dom?.narrativeOverlay || container.querySelector("#narrative-overlay");
    const titleEl = dom?.narrativeTitle || container.querySelector("#narrative-title");
    const bodyEl = dom?.narrativeBody || container.querySelector("#narrative-body");
    const actionsEl = dom?.narrativeActions || container.querySelector("#narrative-actions");
    if (!overlay || !titleEl || !bodyEl || !actionsEl) return;

    switch (milestone) {
      case "intro": {
        titleEl.textContent = "FACILITY AWAKENING";
        bodyEl.innerHTML = `
          <p>You can't remember how you got here.</p>
          <p>You're lying on a strange bed, in a room you don't recognize.</p>
          <p>Across the room, a dim blue panel casts the only light, its glow catching the dust drifting through the air.</p>
          <p>As you approach, a handful of unfamiliar devices blink with the same warning:</p>
          <p><strong style="color: var(--tes-danger); letter-spacing: 1px;">LOW POWER</strong></p>
          <p>At the center of the largest screen, a single button pulses quietly.</p>
          <p>Almost as if it has been waiting for you.</p>
        `;
        actionsEl.innerHTML = `
          <button class="btn-primary tes-pulse-btn" data-action="close-narrative" data-milestone="intro">Start Simulation</button>
        `;
        break;
      }
      case "so1": {
        titleEl.textContent = "TRANSMISSION RECEIVED";
        bodyEl.innerHTML = `
          <p>Out of nowhere, a gentle, strangely captivating voice fills the silence.</p>
          <p>"Congratulations.</p>
          <p>It seems you're making progress.</p>
          <p>You've already gone further than a few others. But there's still a very long way to go.</p>
          <p>Current record:</p>
          <p><strong style="color: var(--tes-cyan); letter-spacing: 1px;">333.33 billion years.</strong></p>
          <p>Good luck."</p>
          <p>The voice disappears as suddenly as it arrived.</p>
        `;
        actionsEl.innerHTML = `
          <button class="btn-primary" data-action="close-narrative" data-milestone="so1">Continue</button>
        `;
        break;
      }
      case "so2": {
        titleEl.textContent = "FACILITY SECTOR UNLOCKED";
        bodyEl.innerHTML = `
          <p>A dry click sounds somewhere behind you.</p>
          <p>You turn.</p>
          <p>A heavy iron double door, previously hidden in the darkness, begins to glow faintly around its edges.</p>
          <p>Above it, an old display flickers to life:</p>
          <p><strong style="color: var(--tes-cyan); letter-spacing: 1px;">PARTICLE SYNTHESIZER</strong></p>
          <p><strong style="color: var(--tes-danger); letter-spacing: 1px;">LOW POWER</strong></p>
          <p>The doors remain shut.</p>
          <p>For now.</p>
        `;
        actionsEl.innerHTML = `
          <button class="btn-primary" data-action="close-narrative" data-milestone="so2">Continue</button>
        `;
        break;
      }
      case "energy100e9": {
        titleEl.textContent = "CAPACITY ACHIEVED";
        bodyEl.innerHTML = `
          <p>An oddly familiar startup chime fills the room as the Stored Energy indicator reaches 100%.</p>
          <p>Behind you, the iron double doors begin to open.</p>
          <p>The sound of ancient machinery echoes through the facility.</p>
          <p>A new section illuminates on the control panel.</p>
          <p>In the Devices interface, a new control pulses softly.</p>
          <p>Its design looks promising.</p>
          <p>And just a little dangerous.</p>
        `;
        actionsEl.innerHTML = `
          <button class="btn-primary tes-pulse-btn" data-action="transition-narrative-coming-soon">Activate</button>
        `;
        break;
      }
      case "coming-soon": {
        titleEl.textContent = "COMING SOON...";
        bodyEl.innerHTML = `
          <p>The Particle Synthesizer is responding.</p>
          <p>But the next experiment is not ready.</p>
          <p>The simulation will continue.</p>
        `;
        actionsEl.innerHTML = `
          <button class="btn-primary" data-action="close-narrative" data-milestone="coming-soon">Close</button>
        `;
        break;
      }
    }

    overlay.classList.add("tes-narrative-overlay--active");
    overlay.setAttribute("aria-hidden", "false");
    const primaryBtn = actionsEl.querySelector("button");
    if (primaryBtn) primaryBtn.focus();
  }

  function transitionNarrativeComingSoon() {
    const titleEl = dom?.narrativeTitle || container.querySelector("#narrative-title");
    const bodyEl = dom?.narrativeBody || container.querySelector("#narrative-body");
    const actionsEl = dom?.narrativeActions || container.querySelector("#narrative-actions");
    if (!titleEl || !bodyEl || !actionsEl) return;

    if (!isNarrativePreview && engine.state.narrative) {
      engine.state.narrative.energy100e9Completed = true;
      engine.state.narrative.synthTeaserUnlocked = true;
    }

    titleEl.textContent = "COMING SOON...";
    bodyEl.innerHTML = `
      <p>The Particle Synthesizer is responding.</p>
      <p>But the next experiment is not ready.</p>
      <p>The simulation will continue.</p>
    `;
    actionsEl.innerHTML = `
      <button class="btn-primary" data-action="close-narrative" data-milestone="energy100e9">Close</button>
    `;
    const btn = actionsEl.querySelector("button");
    if (btn) btn.focus();
  }

  function closeNarrativeModal(milestone) {
    const targetMilestone = milestone || activeNarrativeMilestone;
    const overlay = dom?.narrativeOverlay || container.querySelector("#narrative-overlay");
    if (overlay) {
      overlay.classList.remove("tes-narrative-overlay--active");
      overlay.setAttribute("aria-hidden", "true");
    }

    if (!isNarrativePreview && engine.state.narrative) {
      if (targetMilestone === "intro") engine.state.narrative.introCompleted = true;
      else if (targetMilestone === "so1") engine.state.narrative.so1Completed = true;
      else if (targetMilestone === "so2") engine.state.narrative.so2Completed = true;
      else if (targetMilestone === "energy100e9" || targetMilestone === "coming-soon") {
        engine.state.narrative.energy100e9Completed = true;
        engine.state.narrative.synthTeaserUnlocked = true;
      }
    }

    activeNarrativeMilestone = null;
    isNarrativePreview = false;
  }

  function checkNarrativeTriggers(state) {
    if (activeNarrativeMilestone) return;
    if (!state.narrative) return;

    if (!state.narrative.introCompleted) {
      showNarrativeModal("intro");
      return;
    }
    if ((state.facilityOptimizations ?? 0) === 1 && !state.narrative.so1Completed) {
      showNarrativeModal("so1");
      return;
    }
    if ((state.facilityOptimizations ?? 0) >= 2 && !state.narrative.so2Completed) {
      showNarrativeModal("so2");
      return;
    }
    if (big(state.energy ?? 0).gte(100e9) && !state.narrative.energy100e9Completed) {
      showNarrativeModal("energy100e9");
      return;
    }
  }

  function render() {
    if (!isMounted) {
      mountStructure();
      startNewsCarousel();
    }
    updateDynamicValues(engine.state);
  }

  function mountStructure() {
    const boardOwned = Boolean(engine.state.devices?.transistorBoard?.owned || engine.state.devMode);
    container.innerHTML = `
      <div class="tes-shell">
        <!-- TOP HEADER (Section 4) -->
        <header class="tes-header">
          <div class="tes-top-bar">
            <!-- Brand -->
            <div class="tes-brand">
              <img src="${tesIconPath("brand-orbit")}" alt="" class="tes-brand-icon" aria-hidden="true" onerror="this.style.display='none'" />
              <span class="tes-brand-title">The Eternal Simulation</span>
              <span class="tes-beta-tag">(BETA V0)</span>
            </div>

            <!-- Utility Controls -->
            <div class="tes-utilities">
              <button class="btn-utility btn-utility--active" data-action="open-drawer" data-drawer="dev" data-field="dev-mode-btn" title="Developer SandBox & Cheats">
                <img src="${tesIconPath("icon-settings")}" alt="" class="btn-utility-icon" aria-hidden="true" />
                <span data-field="dev-btn-label">DEV MODE</span>
              </button>
              <button class="btn-utility" data-action="open-drawer" data-drawer="measure" title="Telemetry & Measurement">
                <img src="${tesIconPath("icon-measure")}" alt="" class="btn-utility-icon" aria-hidden="true" />
                <span>Measure</span>
              </button>
              <button class="btn-utility" id="btn-stats" data-action="open-drawer" data-drawer="stats" title="Simulation Statistics">
                <img src="${tesIconPath("icon-statistics")}" alt="" class="btn-utility-icon" aria-hidden="true" />
                <span>Stats</span>
              </button>
              <button class="btn-utility" data-action="open-drawer" data-drawer="settings" title="System Settings">
                <img src="${tesIconPath("icon-power")}" alt="" class="btn-utility-icon" aria-hidden="true" />
                <span>Config</span>
              </button>
            </div>
          </div>

          <!-- News Sub-Bar (Part 1.1) -->
          <div class="tes-news-bar" id="news-bar">
            <div class="tes-news-ticker" id="news-ticker" title="Galactic Newsfeed">
              <img src="${tesIconPath("news")}" alt="" class="tes-news-icon" aria-hidden="true" onerror="this.style.display='none'" />
              <span class="tes-news-content" data-field="news-content">
                The universe keeps expanding, and somehow apartments on big cities keeps getting smaller...
              </span>
            </div>
          </div>

          <!-- Layer Navigation Bar (Section 4) -->
          <nav class="tes-nav-bar" aria-label="Layer Navigation">
            <button class="tes-nav-tab tes-nav-tab--active" data-action="set-tab" data-tab="energy">
              <img src="${tesIconPath("nav-energy")}" alt="" class="tes-nav-icon" aria-hidden="true" />
              <span>Energy</span>
            </button>
            <button class="tes-nav-tab" data-action="set-tab" data-tab="devices">
              <img src="${tesIconPath("nav-devices")}" alt="" class="tes-nav-icon" aria-hidden="true" />
              <span>Devices</span>
            </button>
            <button class="tes-nav-tab tes-nav-tab--disabled" disabled aria-label="Unknown locked system" title="Locked">
              <img src="${tesIconPath("nav-science")}" alt="" class="tes-nav-icon" aria-hidden="true" />
              <span>???</span>
            </button>
            <button class="tes-nav-tab tes-nav-tab--disabled" disabled aria-label="Unknown locked system" title="Locked">
              <img src="${tesIconPath("nav-particles")}" alt="" class="tes-nav-icon" aria-hidden="true" />
              <span>???</span>
            </button>
            <button class="tes-nav-tab" data-action="open-drawer" data-drawer="settings" title="More Options">
              <img src="${tesIconPath("nav-more")}" alt="" class="tes-nav-icon" aria-hidden="true" />
              <span>...</span>
            </button>
          </nav>
        </header>

        <!-- MAIN SHELL: Sticky Rail + Content (Section 5) -->
        <main class="tes-main-layout">
          <!-- 1. PERSISTENT STICKY FACILITY & CURRENCY RAIL (Section 5) -->
          <aside class="tes-rail" id="facility-rail" aria-label="Facility Status Rail">
            <!-- Facility Level -->
            <div class="tes-rail-header">
              <img src="${tesIconPath("facility-level")}" alt="" class="tes-rail-level-icon" aria-hidden="true" />
              <div>
                <span class="eyebrow">FACILITY LEVEL</span>
                <div class="tes-rail-level-title" data-field="rail-facility-level">Level 1</div>
              </div>
            </div>

            <!-- Machine Learning Progress -->
            <div class="tes-rail-progress-section">
              <div class="tes-rail-progress-label">
                <span>Data (XP)</span>
                <span data-field="rail-data-fraction">0 / 693</span>
              </div>
              <div class="tes-rail-progress-bar">
                <div class="tes-rail-progress-fill" data-field="rail-data-bar" style="width: 0%;"></div>
              </div>
            </div>

            <div class="tes-rail-divider"></div>

            <!-- Currencies Stack -->
            <div class="tes-rail-currencies">
              <div class="tes-rail-currency-item">
                <img src="${tesIconPath("resource-energy")}" alt="" class="tes-rail-currency-icon" aria-hidden="true" />
                <div class="tes-rail-currency-details">
                  <span class="tes-rail-currency-label">Stored Energy</span>
                  <span class="tes-rail-currency-val" data-field="rail-energy">0.00 pJ</span>
                </div>
              </div>
              <!-- Optional additional unlocked currencies -->
              <div class="tes-rail-currency-item" id="rail-row-sp" style="display: none;">
                <img src="${tesIconPath("resource-science-points")}" alt="" class="tes-rail-currency-icon" aria-hidden="true" />
                <div class="tes-rail-currency-details">
                  <span class="tes-rail-currency-label">Science Points</span>
                  <span class="tes-rail-currency-val" data-field="rail-sp" style="color: var(--tes-purple-light);">0 SP</span>
                </div>
              </div>
            </div>
          </aside>

          <!-- 2. ACTIVE TAB CONTAINER -->
          <div class="tes-tab-viewport">
            <!-- TAB 1: ENERGY (Section 6) -->
            <section class="tes-energy-tab" id="tab-energy">
              <!-- A. Stored Energy Central Card (Section 6.1) -->
              <article class="tes-stored-energy-card">
                <div class="tes-card-top-row">
                  <div class="tes-card-category-label">
                    <img src="${tesIconPath("stored-energy")}" alt="" class="tes-card-icon-mini" aria-hidden="true" />
                    <span>Stored Energy</span>
                  </div>
                  <button class="btn-icon-only" data-action="show-info" data-topic="energy-summary" aria-label="Energy Telemetry details" title="Energy Dynamics: Learn about Stable Capacity, Overflow Decay, and Net Production">
                    <img src="${tesIconPath("icon-info")}" alt="" />
                  </button>
                </div>

                <div class="tes-big-energy-val tabular" data-field="stored-energy-main">0.00 pJ</div>

                <!-- Telemetry Row: Net, Capacity, Overflow Decay -->
                <div class="tes-energy-telemetry-row">
                  <div class="telemetry-item" id="energy-net-item" data-action="show-info" data-topic="energy-summary" style="cursor: pointer;" title="Net Production = Gross Production (CRC) - Overflow Decay. Click or hover for details.">
                    <span class="telemetry-label">Net:</span>
                    <span class="telemetry-val--net tabular" data-field="energy-net">+0.00 pJ/s</span>
                  </div>
                  <div class="telemetry-item" id="energy-capacity-item" data-action="show-info" data-topic="device-powercell" style="cursor: pointer;" title="Stable Capacity provided by Power Cells. Energy below this threshold never decays. Click for details.">
                    <span class="telemetry-label">Capacity:</span>
                    <span class="telemetry-val--cap tabular" data-field="energy-capacity">0.00 pJ</span>
                  </div>
                  <div class="telemetry-item" id="energy-decay-item" style="display: none; cursor: pointer;" data-action="show-info" data-topic="energy-summary" title="Overflow Decay: Energy dissipating per second due to exceeding Stable Capacity. Click for details.">
                    <span class="telemetry-label">Decay:</span>
                    <span class="telemetry-val--decay tabular" data-field="energy-decay">-0.00 pJ/s</span>
                  </div>
                </div>

                <!-- Energy Era Progression Bar (Section 5) -->
                <div class="tes-energy-era-section">
                  <div class="tes-energy-era-header">
                    <span class="tes-energy-era-label">Total Stored Energy Required</span>
                    <span class="tes-energy-era-percent tabular" data-field="energy-era-percent">0.0%</span>
                  </div>
                  <div class="tes-energy-era-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Total Stored Energy Required">
                    <div class="tes-energy-era-fill" data-field="energy-era-fill" style="width: 0%;"></div>
                  </div>
                </div>
              </article>

              <!-- B. Cosmic Radiation Condenser (CRC) Row (Section 6.2) -->
              <article class="tes-crc-row">
                <div class="tes-crc-left">
                  <img src="${tesIconPath("crc")}" alt="" class="tes-crc-icon" aria-hidden="true" />
                  <div class="tes-crc-meta">
                    <span class="eyebrow">ACTIVE DEVICE</span>
                    <h3 class="tes-crc-title">Cosmic Radiation Condenser</h3>
                    <span class="tes-crc-desc" style="font-size: 11px; color: var(--tes-text-secondary);">Converts algorithmic performance into Energy.</span>
                  </div>
                </div>

                <div class="tes-crc-right">
                  <div class="tes-crc-rate-container" style="display: flex; align-items: baseline; gap: 8px;">
                    <div class="tes-crc-production" data-field="crc-rate">+0.00 pJ/s</div>
                    <span class="tes-crc-growth" data-field="crc-growth" title="Measures the percentage change in gross Energy production per second.">(+0.00%/sec)</span>
                  </div>
                  <span class="badge-status badge-status--active" data-field="crc-level-mult">Level 1</span>
                  <button class="btn-icon-only" data-action="show-info" data-topic="crc" aria-label="CRC Breakdown details">
                    <img src="${tesIconPath("icon-info")}" alt="" />
                  </button>
                </div>
              </article>

              <!-- C. Algorithm Features Compact Stack (Section 6.3) -->
              <div class="tes-studies-stack">
                <!-- 1. Algorithm Improvement (AImp) -->
                <div class="tes-study-unit" id="study-unit-aimp">
                  <article class="tes-study-row" id="study-row-aimp">
                    <div class="tes-study-left">
                      <img src="${tesIconPath("algorithm-improvement")}" alt="" class="tes-study-icon" aria-hidden="true" />
                      <div class="tes-study-info">
                        <span class="eyebrow">BASE STUDY</span>
                        <div class="tes-study-title-line">
                          <div class="tes-study-name" data-field="aimp-title">Algorithm Improvement (0)</div>
                          <button class="btn-study-improve btn-study-improve--disabled" data-action="claim-study-improve" data-target="AImp" data-field="aimp-improve-btn" aria-disabled="true" aria-label="Improve Algorithm Improvement study speed" title="Study Improve: Accelerate study speed">
                            <span class="improve-arrow">▲</span>
                            <span class="improve-level-badge" data-field="aimp-improve-badge" style="display: none;">0</span>
                            <span class="improve-milestone-hint tabular" data-field="aimp-improve-milestone">0/33</span>
                          </button>
                        </div>
                        <span class="tes-study-desc" style="font-size: 11px; color: var(--tes-text-secondary);">Generates Energy through computational improvements.</span>
                      </div>
                    </div>

                    <div class="tes-study-center">
                      <span class="tes-study-duration" data-field="aimp-dur">0.50s</span>
                      <div class="tes-progress-circle-wrap" title="Study Progress">
                        <svg class="tes-progress-svg" width="22" height="22" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.12)" stroke-width="2.5" fill="none"></circle>
                          <circle cx="12" cy="12" r="9" stroke="var(--tes-cyan)" stroke-width="2.5" fill="none"
                            stroke-dasharray="56.5" stroke-dashoffset="56.5" data-field="aimp-progress-ring"></circle>
                        </svg>
                      </div>
                    </div>

                    <div class="tes-study-right">
                      <button class="btn-primary" data-action="study-feature" data-target="AImp" data-count="1" data-field="aimp-study-btn" title="Study Algorithm Improvement (Hotkey: A)">
                        Study <kbd class="tes-hotkey-hint">A</kbd>
                      </button>
                      <!-- Auto Toggle -->
                      <div class="badge-auto" data-action="toggle-auto-study" data-target="AImp" data-field="aimp-auto-badge">
                        Auto: Locked
                      </div>
                      <button class="btn-icon-only" data-action="show-info" data-topic="aimp" aria-label="A.Imp info">
                        <img src="${tesIconPath("icon-info")}" alt="" />
                      </button>
                    </div>
                  </article>

                  <!-- Install Transistor Card (Section 3) -->
                  <button class="tes-install-transistor-card" data-action="install-transistor" data-target="AImp" data-field="aimp-install-transistor" style="${boardOwned ? '' : 'display: none;'}" aria-label="Install Transistor into Algorithm Improvement" title="Install Transistor into Algorithm Improvement (Hotkey: T)">
                    <span class="tes-install-transistor-label">Install Transistor <kbd class="tes-hotkey-hint">T</kbd></span>
                    <span class="tes-install-transistor-cost tabular" data-field="aimp-transistor-cost">250 pJ</span>
                  </button>
                </div>

                <!-- 2. Algorithm Upgrade (AUpg) -->
                <div class="tes-study-unit" id="study-unit-aupg">
                  <article class="tes-study-row" id="study-row-aupg">
                    <div class="tes-study-left">
                      <img src="${tesIconPath("algorithm-upgrade")}" alt="" class="tes-study-icon" aria-hidden="true" />
                      <div class="tes-study-info">
                        <span class="eyebrow">UPGRADE STUDY</span>
                        <div class="tes-study-title-line">
                          <div class="tes-study-name" data-field="aupg-title">Algorithm Upgrade (0)</div>
                          <button class="btn-study-improve btn-study-improve--disabled" data-action="claim-study-improve" data-target="AUpg" data-field="aupg-improve-btn" aria-disabled="true" aria-label="Improve Algorithm Upgrade study speed" title="Study Improve: Accelerate study speed">
                            <span class="improve-arrow">▲</span>
                            <span class="improve-level-badge" data-field="aupg-improve-badge" style="display: none;">0</span>
                            <span class="improve-milestone-hint tabular" data-field="aupg-improve-milestone">0/33</span>
                          </button>
                        </div>
                        <span class="tes-study-desc" style="font-size: 11px; color: var(--tes-text-secondary);">Converts lower-order algorithms into more efficient computations.</span>
                        <span class="tes-study-cost-hint">Req 12 A.Imp</span>
                      </div>
                    </div>

                    <div class="tes-study-center">
                      <span class="tes-study-duration" data-field="aupg-dur">0.50s</span>
                      <div class="tes-progress-circle-wrap" title="Study Progress">
                        <svg class="tes-progress-svg" width="22" height="22" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.12)" stroke-width="2.5" fill="none"></circle>
                          <circle cx="12" cy="12" r="9" stroke="var(--tes-purple-light)" stroke-width="2.5" fill="none"
                            stroke-dasharray="56.5" stroke-dashoffset="56.5" data-field="aupg-progress-ring"></circle>
                        </svg>
                      </div>
                    </div>

                    <div class="tes-study-right">
                      <button class="btn-primary" data-action="study-feature" data-target="AUpg" data-count="1" data-field="aupg-study-btn" title="Study Algorithm Upgrade (Hotkey: U)">
                        Study <kbd class="tes-hotkey-hint">U</kbd>
                      </button>
                      <div class="badge-auto" data-action="toggle-auto-study" data-target="AUpg" data-field="aupg-auto-badge">
                        Auto: Locked
                      </div>
                      <button class="btn-icon-only" data-action="show-info" data-topic="aupg" aria-label="A.Upg info">
                        <img src="${tesIconPath("icon-info")}" alt="" />
                      </button>
                    </div>
                  </article>

                  <!-- Install Transistor Card (Section 3) -->
                  <button class="tes-install-transistor-card" data-action="install-transistor" data-target="AUpg" data-field="aupg-install-transistor" style="${boardOwned ? '' : 'display: none;'}" aria-label="Install Transistor into Algorithm Upgrade">
                    <span class="tes-install-transistor-label">Install Transistor</span>
                    <span class="tes-install-transistor-cost tabular" data-field="aupg-transistor-cost">250 pJ</span>
                  </button>
                </div>

                <!-- 3. Algorithm Recalculation (ARec) - Revealed only if unlocks.ARec -->
                <div class="tes-study-unit" id="study-unit-arec" style="display: none;">
                  <article class="tes-study-row" id="study-row-arec">
                    <div class="tes-study-left">
                      <img src="${tesIconPath("algorithm-recalculation")}" alt="" class="tes-study-icon" aria-hidden="true" />
                      <div class="tes-study-info">
                        <span class="eyebrow">RECALCULATION STUDY</span>
                        <div class="tes-study-title-line">
                          <div class="tes-study-name" data-field="arec-title">Algorithm Recalculation (0)</div>
                          <button class="btn-study-improve btn-study-improve--disabled" data-action="claim-study-improve" data-target="ARec" data-field="arec-improve-btn" aria-disabled="true" aria-label="Improve Algorithm Recalculation study speed" title="Study Improve: Accelerate study speed">
                            <span class="improve-arrow">▲</span>
                            <span class="improve-level-badge" data-field="arec-improve-badge" style="display: none;">0</span>
                            <span class="improve-milestone-hint tabular" data-field="arec-improve-milestone">0/33</span>
                          </button>
                        </div>
                        <span class="tes-study-desc" style="font-size: 11px; color: var(--tes-text-secondary);">Converts upgrades into higher-order computational structures.</span>
                        <span class="tes-study-cost-hint">Req 12 A.Upg</span>
                      </div>
                    </div>

                    <div class="tes-study-center">
                      <span class="tes-study-duration" data-field="arec-dur">0.50s</span>
                      <div class="tes-progress-circle-wrap" title="Study Progress">
                        <svg class="tes-progress-svg" width="22" height="22" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.12)" stroke-width="2.5" fill="none"></circle>
                          <circle cx="12" cy="12" r="9" stroke="var(--tes-teal)" stroke-width="2.5" fill="none"
                            stroke-dasharray="56.5" stroke-dashoffset="56.5" data-field="arec-progress-ring"></circle>
                        </svg>
                      </div>
                    </div>

                    <div class="tes-study-right">
                      <button class="btn-primary" data-action="study-feature" data-target="ARec" data-count="1" data-field="arec-study-btn" title="Study Algorithm Recalculation (Hotkey: R)">
                        Study <kbd class="tes-hotkey-hint">R</kbd>
                      </button>
                      <div class="badge-auto" data-action="toggle-auto-study" data-target="ARec" data-field="arec-auto-badge">
                        Auto: Locked
                      </div>
                      <button class="btn-icon-only" data-action="show-info" data-topic="arec" aria-label="A.Rec info">
                        <img src="${tesIconPath("icon-info")}" alt="" />
                      </button>
                    </div>
                  </article>

                  <!-- Install Transistor Card (Section 3) -->
                  <button class="tes-install-transistor-card" data-action="install-transistor" data-target="ARec" data-field="arec-install-transistor" style="${boardOwned ? '' : 'display: none;'}" aria-label="Install Transistor into Algorithm Recalculation">
                    <span class="tes-install-transistor-label">Install Transistor</span>
                    <span class="tes-install-transistor-cost tabular" data-field="arec-transistor-cost">250 pJ</span>
                  </button>
                </div>

                <!-- 4. Algorithm Redesign (ARed) - Revealed only if unlocks.ARed -->
                <div class="tes-study-unit" id="study-unit-ared" style="display: none;">
                  <article class="tes-study-row" id="study-row-ared">
                    <div class="tes-study-left">
                      <img src="${tesIconPath("algorithm-redesign")}" alt="" class="tes-study-icon" aria-hidden="true" />
                      <div class="tes-study-info">
                        <span class="eyebrow">REDESIGN STUDY</span>
                        <div class="tes-study-title-line">
                          <div class="tes-study-name" data-field="ared-title">Algorithm Redesign (0)</div>
                          <button class="btn-study-improve btn-study-improve--disabled" data-action="claim-study-improve" data-target="ARed" data-field="ared-improve-btn" aria-disabled="true" aria-label="Improve Algorithm Redesign study speed" title="Study Improve: Accelerate study speed">
                            <span class="improve-arrow">▲</span>
                            <span class="improve-level-badge" data-field="ared-improve-badge" style="display: none;">0</span>
                            <span class="improve-milestone-hint tabular" data-field="ared-improve-milestone">0/33</span>
                          </button>
                        </div>
                        <span class="tes-study-desc" style="font-size: 11px; color: var(--tes-text-secondary);">Synthesizes recalculations into architectural redesigns.</span>
                        <span class="tes-study-cost-hint">Req 12 A.Rec</span>
                      </div>
                    </div>

                    <div class="tes-study-center">
                      <span class="tes-study-duration" data-field="ared-dur">0.50s</span>
                      <div class="tes-progress-circle-wrap" title="Study Progress">
                        <svg class="tes-progress-svg" width="22" height="22" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.12)" stroke-width="2.5" fill="none"></circle>
                          <circle cx="12" cy="12" r="9" stroke="var(--tes-teal)" stroke-width="2.5" fill="none"
                            stroke-dasharray="56.5" stroke-dashoffset="56.5" data-field="ared-progress-ring"></circle>
                        </svg>
                      </div>
                    </div>

                    <div class="tes-study-right">
                      <button class="btn-primary" data-action="study-feature" data-target="ARed" data-count="1" data-field="ared-study-btn" title="Study Algorithm Redesign (Hotkey: G)">
                        Study <kbd class="tes-hotkey-hint">G</kbd>
                      </button>
                      <div class="badge-auto" data-action="toggle-auto-study" data-target="ARed" data-field="ared-auto-badge">
                        Auto: Locked
                      </div>
                      <button class="btn-icon-only" data-action="show-info" data-topic="ared" aria-label="A.Red info">
                        <img src="${tesIconPath("icon-info")}" alt="" />
                      </button>
                    </div>
                  </article>

                  <!-- Install Transistor Card (Section 3) -->
                  <button class="tes-install-transistor-card" data-action="install-transistor" data-target="ARed" data-field="ared-install-transistor" style="${boardOwned ? '' : 'display: none;'}" aria-label="Install Transistor into Algorithm Redesign">
                    <span class="tes-install-transistor-label">Install Transistor</span>
                    <span class="tes-install-transistor-cost tabular" data-field="ared-transistor-cost">250 pJ</span>
                  </button>
                </div>
              </div>

              <!-- Prestige Actions Row (Side-by-Side: Machine Learning & Setup Optimization) -->
              <div class="tes-prestige-row">
                <!-- D. Machine Learning (Computer Learning) Card (Section 6.4) -->
                <article class="tes-ml-card">
                  <div class="tes-ml-header">
                    <div class="tes-ml-title-group">
                      <img src="${tesIconPath("run-machine-learning")}" alt="" class="tes-ml-icon" aria-hidden="true" />
                      <div>
                        <span class="eyebrow">COMPUTER LEARNING</span>
                        <h4 class="tes-ml-title">Machine Learning (Soft Reset)</h4>
                      </div>
                    </div>
                    <button class="btn-icon-only" data-action="show-info" data-topic="ml" aria-label="Machine Learning info">
                      <img src="${tesIconPath("icon-info")}" alt="" />
                    </button>
                  </div>

                  <div class="tes-rail-progress-section">
                    <div class="tes-rail-progress-label">
                      <span>Available Data (XP)</span>
                      <span data-field="ml-progress-text">0 / 693 Data</span>
                    </div>
                    <div class="tes-rail-progress-bar">
                      <div class="tes-rail-progress-fill" data-field="ml-progress-bar" style="width: 0%;"></div>
                    </div>
                  </div>

                  <button class="btn-primary" data-action="run-machine-learning" data-field="ml-action-btn" title="Run Machine Learning (Hotkey: M)">
                    Run Machine Learning (Adv to Level 2) <kbd class="tes-hotkey-hint">M</kbd>
                  </button>
                </article>

                <!-- E. Setup Optimization / Facility Optimization Card -->
                <article class="tes-fo-card" id="fo-card" style="display: none;">
                  <div class="tes-fo-header">
                    <div class="tes-fo-title-group">
                      <img src="${tesIconPath("facility-optimization")}" alt="" class="tes-fo-icon" aria-hidden="true" />
                      <div>
                        <span class="eyebrow eyebrow--purple">FACILITY PRESTIGE</span>
                        <h4 class="tes-fo-title" data-field="fo-title">Setup Optimization (Hard Reset)</h4>
                      </div>
                    </div>
                    <button class="btn-icon-only" data-action="show-info" data-topic="fo" aria-label="Setup Optimization info">
                      <img src="${tesIconPath("icon-info")}" alt="" />
                    </button>
                  </div>

                  <div class="tes-rail-progress-section">
                    <div class="tes-rail-progress-label">
                      <span>Facility Level</span>
                      <span data-field="fo-progress-text">Level 1 / 6</span>
                    </div>
                    <div class="tes-rail-progress-bar">
                      <div class="tes-rail-progress-fill tes-rail-progress-fill--purple" data-field="fo-progress-bar" style="width: 0%;"></div>
                    </div>
                  </div>

                  <button class="btn-primary btn-primary--purple" data-action="open-modal" data-modal="fo-confirm" data-field="fo-action-btn" title="Perform Setup Optimization">
                    Perform Setup Optimization (Lv. 6)
                  </button>
                </article>
              </div>
            </section>

            <!-- TAB 2: DEVICES (Section 7) -->
            <section class="tes-devices-tab" id="tab-devices" style="display: none;">
              <!-- Particle Synthesizer Teaser (Revealed after reaching 100e9 J) -->
              <div class="tes-synth-teaser-card" id="synth-teaser-card" style="display: none;">
                <div class="tes-synth-teaser-left">
                  <img src="${tesIconPath("nav-particles")}" alt="" class="tes-device-icon" aria-hidden="true" />
                  <div class="tes-synth-teaser-info">
                    <div class="tes-synth-teaser-title">PARTICLE SYNTHESIZER</div>
                    <div class="tes-synth-teaser-desc">The heavy iron doors have unlocked. High-voltage chambers hum with unknown potential.</div>
                  </div>
                </div>
                <button class="btn-primary tes-pulse-btn" data-action="activate-synth-teaser" id="btn-activate-synth">
                  Activate
                </button>
              </div>

              <!-- Filter Bar (Section 7.3) -->
              <div class="tes-filter-bar">
                <div class="tes-category-pills">
                  <button class="tes-filter-pill tes-filter-pill--active" data-action="set-device-filter" data-filter="all" data-field="filter-all-btn">
                    All (11)
                  </button>
                  <button class="tes-filter-pill" data-action="set-device-filter" data-filter="automation" data-field="filter-automation-btn">
                    Automation (3)
                  </button>
                  <button class="tes-filter-pill" data-action="set-device-filter" data-filter="computation" data-field="filter-computation-btn">
                    Computation (4)
                  </button>
                  <button class="tes-filter-pill" data-action="set-device-filter" data-filter="energy" data-field="filter-energy-btn">
                    Energy (3)
                  </button>
                  <button class="tes-filter-pill" data-action="set-device-filter" data-filter="learning" data-field="filter-learning-btn">
                    Learning (1)
                  </button>
                </div>

                <div class="tes-filter-toggles">
                  <label class="tes-checkbox-label">
                    <input type="checkbox" data-action="toggle-filter-added" checked id="toggle-show-added" />
                    <span>Show Added</span>
                  </label>
                  <label class="tes-checkbox-label">
                    <input type="checkbox" data-action="toggle-filter-unavailable" checked id="toggle-show-unavailable" />
                    <span>Show Unavailable</span>
                  </label>
                </div>
              </div>

              <!-- Two Independent Columns (Section 7.1 & 7.2) -->
              <div class="tes-devices-two-column">
                <!-- COLUMN 1: Efficiency & Automation -->
                <div class="tes-device-column" id="col-efficiency">
                  <!-- Section 1: AUTOMATION -->
                  <div class="tes-device-group" id="group-automation">
                    <div class="tes-section-header">
                      <span class="tes-section-title">AUTOMATION</span>
                      <div class="tes-section-line"></div>
                    </div>

                    <!-- AutoCalculator AImp -->
                    <article class="tes-device-row" data-device-id="autoCalculator_AImp">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("auto-calculator-imp")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">AutoCalculator — Improvements</span>
                            <span class="badge-status badge-status--off" data-field="chip-aimp-badge">30.00 pJ</span>
                          </div>
                          <span class="tes-device-desc">Automatically performs studies of its assigned type.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="autoCalculator_AImp" data-field="chip-aimp-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-chip-aimp" aria-label="AutoCalculator AImp info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- AutoCalculator AUpg -->
                    <article class="tes-device-row" data-device-id="autoCalculator_AUpg">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("auto-calculator-upg")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">AutoCalculator — Upgrades</span>
                            <span class="badge-status badge-status--off" data-field="chip-aupg-badge">120.00 pJ</span>
                          </div>
                          <span class="tes-device-desc">Automatically performs studies of its assigned type.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="autoCalculator_AUpg" data-field="chip-aupg-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-chip-aupg" aria-label="AutoCalculator AUpg info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- AutoCalculator ARec (Revealed only if unlocks.ARec) -->
                    <article class="tes-device-row" data-device-id="autoCalculator_ARec" id="device-row-chip-arec" style="display: none;">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("auto-calculator-rec")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">AutoCalculator — Recalculations</span>
                            <span class="badge-status badge-status--off" data-field="chip-arec-badge">480.00 pJ</span>
                          </div>
                          <span class="tes-device-desc">Automatically performs studies of its assigned type.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="autoCalculator_ARec" data-field="chip-arec-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-chip-arec" aria-label="AutoCalculator ARec info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- AutoCalculator ARed (Revealed only if unlocks.ARed) -->
                    <article class="tes-device-row" data-device-id="autoCalculator_ARed" id="device-row-chip-ared" style="display: none;">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("auto-calculator-red")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">AutoCalculator — Redesigns</span>
                            <span class="badge-status badge-status--off" data-field="chip-ared-badge">${formatEnergy(1.92e-9)}</span>
                          </div>
                          <span class="tes-device-desc">Automatically performs studies of its assigned type.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="autoCalculator_ARed" data-field="chip-ared-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-chip-ared" aria-label="AutoCalculator ARed info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>
                  </div>

                  <!-- Section 2: COMPUTATION & EFFICIENCY -->
                  <div class="tes-device-group" id="group-computation">
                    <div class="tes-section-header">
                      <span class="tes-section-title">COMPUTATION & EFFICIENCY</span>
                      <div class="tes-section-line"></div>
                    </div>

                    <!-- Transistor Board -->
                    <article class="tes-device-row" data-device-id="transistorBoard">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("transistor-board")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">Transistor Board</span>
                            <span class="badge-status badge-status--off" data-field="board-badge">${formatEnergy(2e-10)}</span>
                          </div>
                          <span class="tes-device-desc">Distributes computational resources between studies.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="transistorBoard" data-field="board-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-board" aria-label="Transistor Board info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- Microprocessor -->
                    <article class="tes-device-row" data-device-id="microprocessor">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("microprocessor")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">Microprocessor</span>
                            <span class="tes-device-data-pill" data-field="micro-data-pill">Target: AImp</span>
                          </div>
                          <span class="tes-device-desc">Amplifies the speed of the selected study.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="microprocessor" data-count="1" data-field="micro-action-btn">
                          Add
                        </button>
                        <button class="btn-secondary" data-action="open-drawer" data-drawer="microprocessor" data-field="micro-configure-btn" title="Configure target & preview bonuses">
                          Configure
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-micro" aria-label="Microprocessor info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- Processor (Revealed only if unlocks.processor) -->
                    <article class="tes-device-row" data-device-id="processor" id="device-row-processor" style="display: none;">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("processor")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">Processor</span>
                            <span class="tes-device-data-pill" data-field="processor-data-pill">+5.0% Study Speed/ea</span>
                          </div>
                          <span class="tes-device-desc">Improves the effectiveness of connected devices.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="processor" data-count="1" data-field="processor-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-processor" aria-label="Processor info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- Overclocker -->
                    <article class="tes-device-row" data-device-id="overclocker" id="device-row-overclocker">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("overclocker")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">Overclocker</span>
                            <span class="badge-status badge-status--off" data-field="overclock-badge">Ready</span>
                          </div>
                          <span class="tes-device-desc">Temporarily accelerates the selected computation.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="overclocker" data-field="overclock-buy-btn">
                          Add
                        </button>
                        <button class="btn-danger" data-action="open-modal" data-modal="overclock" data-field="overclock-activate-btn" style="display: none;">
                          Activate
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-overclocker" aria-label="Overclocker info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>
                  </div>
                </div>

                <!-- COLUMN 2: Resource Devices -->
                <div class="tes-device-column" id="col-resources">
                  <!-- Section 1: ENERGY DEVICES -->
                  <div class="tes-device-group" id="group-energy">
                    <div class="tes-section-header">
                      <span class="tes-section-title">ENERGY DEVICES</span>
                      <div class="tes-section-line"></div>
                    </div>

                    <!-- CRC Gadget -->
                    <article class="tes-device-row" data-device-id="crcGadget">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("crc-gadget")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">CRC Gadget</span>
                            <span class="badge-status badge-status--off" data-field="crc-gadget-badge">${formatEnergy(1e-8)}</span>
                          </div>
                          <span class="tes-device-desc">Amplifies Cosmic Radiation Condenser energy output.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="crcGadget" data-field="crc-gadget-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-crc-gadget" aria-label="CRC Gadget info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- Backpropagator (Unique Device, revealed at SO3 when currentRunPeakEnergy >= energytoUnlock) -->
                    <article class="tes-device-row" data-device-id="backpropagator" id="device-row-backpropagator" style="display: none;">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("backpropagator")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">Backpropagator</span>
                            <span class="badge-status badge-status--off" data-field="backpropagator-badge">${formatEnergy(1)}</span>
                          </div>
                          <span class="tes-device-desc">Improves global Energy production based on the amount of Algorithm Redesigns owned.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="backpropagator" data-field="backpropagator-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-backpropagator" aria-label="Backpropagator info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- Capacitor -->
                    <article class="tes-device-row" data-device-id="capacitor" id="device-row-capacitor">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("capacitor")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">Capacitor</span>
                            <span class="tes-device-data-pill" data-field="capacitor-data-pill">+50%/ea (0 owned)</span>
                          </div>
                          <span class="tes-device-desc">Amplifies the energy contribution of the entire Algorithm Feature chain.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="capacitor" data-count="1" data-field="capacitor-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-capacitor" aria-label="Capacitor info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- Power Cell -->
                    <article class="tes-device-row" data-device-id="powerCell">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("power-cell")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">Power Cell</span>
                            <span class="tes-device-data-pill" data-field="powercell-data-pill">0.00 pJ Cap</span>
                          </div>
                          <span class="tes-device-desc">Expands the facility's operational energy capacity.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="powerCell" data-count="1" data-field="powercell-action-btn">
                          Add
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-powercell" aria-label="Power Cell info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>
                  </div>

                  <!-- Section 2: LEARNING INFRASTRUCTURE -->
                  <div class="tes-device-group" id="group-learning">
                    <div class="tes-section-header">
                      <span class="tes-section-title">LEARNING INFRASTRUCTURE</span>
                      <div class="tes-section-line"></div>
                    </div>

                    <!-- Hard Disk (Revealed only if unlocks.hardDisk) -->
                    <article class="tes-device-row" data-device-id="hardDisk" id="device-row-harddisk" style="display: none;">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("hard-disk")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">Hard Disk</span>
                            <span class="badge-status badge-status--off" data-field="harddisk-status-badge">Off</span>
                          </div>
                          <span class="tes-device-desc">Consumes Energy to generate temporary Data.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="hardDisk" data-count="1" data-field="harddisk-action-btn">
                          Add
                        </button>
                        <button class="btn-secondary" data-action="open-drawer" data-drawer="harddisk" data-field="harddisk-manage-btn">
                          Manage
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-harddisk" aria-label="Hard Disk info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>

                    <!-- Statistics Display -->
                    <article class="tes-device-row" data-device-id="statisticsDisplay" id="device-row-statistics-display">
                      <div class="tes-device-row-left">
                        <img src="${tesIconPath("icon-statistics")}" alt="" class="tes-device-icon" aria-hidden="true" />
                        <div class="tes-device-main-info">
                          <div class="tes-device-title-line">
                            <span class="tes-device-name">Statistics Display</span>
                            <span class="badge-status badge-status--off" data-field="statistics-display-badge">${formatEnergy(1e-7)}</span>
                          </div>
                          <span class="tes-device-desc">Unlocks advanced facility statistics and energy production records.</span>
                        </div>
                      </div>
                      <div class="tes-device-row-right">
                        <button class="btn-primary" data-action="buy-element" data-element-id="statisticsDisplay" data-field="statistics-display-action-btn">
                          Add (${formatEnergy(1e-7)})
                        </button>
                        <button class="btn-icon-only" data-action="show-info" data-topic="device-statistics-display" aria-label="Statistics Display info">
                          <img src="${tesIconPath("icon-info")}" alt="" />
                        </button>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>

        <!-- DRAWERS & MODALS CONTAINER -->
        <div id="tes-drawers-container"></div>
        <div id="tes-popover-container"></div>

        <!-- NARRATIVE MILESTONE MODAL OVERLAY -->
        <div class="tes-narrative-overlay" id="narrative-overlay" aria-hidden="true" role="dialog" aria-modal="true">
          <div class="tes-narrative-modal" id="narrative-modal">
            <h3 class="tes-narrative-title" id="narrative-title"></h3>
            <div class="tes-narrative-body" id="narrative-body"></div>
            <div class="tes-narrative-actions" id="narrative-actions"></div>
          </div>
        </div>
      </div>
    `;

    // Bind local listeners for News hover pause
    const newsBox = container.querySelector("#news-ticker");
    if (newsBox) {
      newsBox.addEventListener("mouseenter", () => {
        isNewsPaused = true;
      });
      newsBox.addEventListener("mouseleave", () => {
        isNewsPaused = false;
      });
      newsBox.addEventListener("focusin", () => {
        isNewsPaused = true;
      });
      newsBox.addEventListener("focusout", () => {
        isNewsPaused = false;
      });
    }

    // Bind hover listeners for Energy Dynamics tooltip / popover
    const netItem = container.querySelector("#energy-net-item");
    const energyInfoBtn = container.querySelector(
      '[data-action="show-info"][data-topic="energy-summary"]',
    );
    let energyHoverTimer = null;

    const handleEnergyHoverEnter = (e) => {
      clearTimeout(energyHoverTimer);
      showInfoPopover("energy-summary", e.currentTarget, true);
    };

    const handleEnergyHoverLeave = () => {
      energyHoverTimer = setTimeout(() => {
        closeHoverPopover();
      }, 200);
    };

    if (netItem) {
      netItem.addEventListener("mouseenter", handleEnergyHoverEnter);
      netItem.addEventListener("mouseleave", handleEnergyHoverLeave);
    }
    if (energyInfoBtn) {
      energyInfoBtn.addEventListener("mouseenter", handleEnergyHoverEnter);
      energyInfoBtn.addEventListener("mouseleave", handleEnergyHoverLeave);
    }

    cacheDomElements();
    isMounted = true;
  }

  let dom = null;
  let lastActiveDrawer = null;

  function setElText(el, val) {
    if (el && el.textContent !== String(val)) {
      el.textContent = String(val);
    }
  }

  function cacheDomElements() {
    dom = {
      navTabs: Array.from(container.querySelectorAll(".tes-nav-tab")),
      tabEnergy: container.querySelector("#tab-energy"),
      tabDevices: container.querySelector("#tab-devices"),

      railFacilityLevel: container.querySelector(
        '[data-field="rail-facility-level"]',
      ),
      railDataFraction: container.querySelector(
        '[data-field="rail-data-fraction"]',
      ),
      railDataBar: container.querySelector('[data-field="rail-data-bar"]'),
      railEnergy: container.querySelector('[data-field="rail-energy"]'),
      railSpRow: container.querySelector("#rail-row-sp"),
      railSp: container.querySelector('[data-field="rail-sp"]'),

      devBtn: container.querySelector('[data-field="dev-mode-btn"]'),
      devBtnLabel: container.querySelector('[data-field="dev-btn-label"]'),
      newsTicker: container.querySelector("#news-ticker"),
      newsContent: container.querySelector('[data-field="news-content"]'),

      storedEnergyMain: container.querySelector(
        '[data-field="stored-energy-main"]',
      ),
      energyNetItem: container.querySelector("#energy-net-item"),
      energyNet: container.querySelector('[data-field="energy-net"]'),
      energyCapacityItem: container.querySelector("#energy-capacity-item"),
      energyCapacity: container.querySelector('[data-field="energy-capacity"]'),
      energyDecayItem: container.querySelector("#energy-decay-item"),
      energyDecay: container.querySelector('[data-field="energy-decay"]'),
      crcRate: container.querySelector('[data-field="crc-rate"]'),
      crcGrowth: container.querySelector('[data-field="crc-growth"]'),
      crcLevelMult: container.querySelector('[data-field="crc-level-mult"]'),
      btnStats: container.querySelector("#btn-stats"),
      synthTeaserCard: container.querySelector("#synth-teaser-card"),
      narrativeOverlay: container.querySelector("#narrative-overlay"),
      narrativeTitle: container.querySelector("#narrative-title"),
      narrativeBody: container.querySelector("#narrative-body"),
      narrativeActions: container.querySelector("#narrative-actions"),

      energyEraPercent: container.querySelector('[data-field="energy-era-percent"]'),
      energyEraFill: container.querySelector('[data-field="energy-era-fill"]'),
      energyEraTrack: container.querySelector('.tes-energy-era-track'),

      aimpTitle: container.querySelector('[data-field="aimp-title"]'),
      aimpDur: container.querySelector('[data-field="aimp-dur"]'),
      aimpRing: container.querySelector('[data-field="aimp-progress-ring"]'),
      aimpAutoBadge: container.querySelector('[data-field="aimp-auto-badge"]'),
      aimpImproveBtn: container.querySelector('[data-field="aimp-improve-btn"]'),
      aimpImproveBadge: container.querySelector('[data-field="aimp-improve-badge"]'),
      aimpImproveMilestone: container.querySelector('[data-field="aimp-improve-milestone"]'),
      aimpInstallTransistor: container.querySelector('[data-field="aimp-install-transistor"]'),
      aimpTransistorCost: container.querySelector('[data-field="aimp-transistor-cost"]'),

      aupgTitle: container.querySelector('[data-field="aupg-title"]'),
      aupgDur: container.querySelector('[data-field="aupg-dur"]'),
      aupgRing: container.querySelector('[data-field="aupg-progress-ring"]'),
      aupgAutoBadge: container.querySelector('[data-field="aupg-auto-badge"]'),
      aupgBtn: container.querySelector('[data-field="aupg-study-btn"]'),
      aupgImproveBtn: container.querySelector('[data-field="aupg-improve-btn"]'),
      aupgImproveBadge: container.querySelector('[data-field="aupg-improve-badge"]'),
      aupgImproveMilestone: container.querySelector('[data-field="aupg-improve-milestone"]'),
      aupgInstallTransistor: container.querySelector('[data-field="aupg-install-transistor"]'),
      aupgTransistorCost: container.querySelector('[data-field="aupg-transistor-cost"]'),

      arecUnit: container.querySelector('#study-unit-arec'),
      arecRow: container.querySelector("#study-row-arec"),
      arecTitle: container.querySelector('[data-field="arec-title"]'),
      arecDur: container.querySelector('[data-field="arec-dur"]'),
      arecRing: container.querySelector('[data-field="arec-progress-ring"]'),
      arecAutoBadge: container.querySelector('[data-field="arec-auto-badge"]'),
      arecBtn: container.querySelector('[data-field="arec-study-btn"]'),
      arecImproveBtn: container.querySelector('[data-field="arec-improve-btn"]'),
      arecImproveBadge: container.querySelector('[data-field="arec-improve-badge"]'),
      arecImproveMilestone: container.querySelector('[data-field="arec-improve-milestone"]'),
      arecInstallTransistor: container.querySelector('[data-field="arec-install-transistor"]'),
      arecTransistorCost: container.querySelector('[data-field="arec-transistor-cost"]'),

      aredUnit: container.querySelector('#study-unit-ared'),
      aredRow: container.querySelector("#study-row-ared"),
      aredTitle: container.querySelector('[data-field="ared-title"]'),
      aredDur: container.querySelector('[data-field="ared-dur"]'),
      aredRing: container.querySelector('[data-field="ared-progress-ring"]'),
      aredAutoBadge: container.querySelector('[data-field="ared-auto-badge"]'),
      aredBtn: container.querySelector('[data-field="ared-study-btn"]'),
      aredImproveBtn: container.querySelector('[data-field="ared-improve-btn"]'),
      aredImproveBadge: container.querySelector('[data-field="ared-improve-badge"]'),
      aredImproveMilestone: container.querySelector('[data-field="ared-improve-milestone"]'),
      aredInstallTransistor: container.querySelector('[data-field="ared-install-transistor"]'),
      aredTransistorCost: container.querySelector('[data-field="ared-transistor-cost"]'),

      mlProgressText: container.querySelector(
        '[data-field="ml-progress-text"]',
      ),
      mlProgressBar: container.querySelector('[data-field="ml-progress-bar"]'),
      mlBtn: container.querySelector('[data-field="ml-action-btn"]'),

      foCard: container.querySelector("#fo-card"),
      foTitle: container.querySelector('[data-field="fo-title"]'),
      foProgressText: container.querySelector('[data-field="fo-progress-text"]'),
      foProgressBar: container.querySelector('[data-field="fo-progress-bar"]'),
      foReqLevel: container.querySelector('[data-field="fo-req-level"]'),
      foCurBonus: container.querySelector('[data-field="fo-cur-bonus"]'),
      foNextBonus: container.querySelector('[data-field="fo-next-bonus"]'),
      foBtn: container.querySelector('[data-field="fo-action-btn"]'),

      filterPills: Array.from(container.querySelectorAll(".tes-filter-pill")),
      toggleShowAdded: container.querySelector("#toggle-show-added"),
      toggleShowUnavailable: container.querySelector(
        "#toggle-show-unavailable",
      ),
      filterCounts: {
        all: container.querySelector('[data-field="filter-all-btn"]'),
        automation: container.querySelector(
          '[data-field="filter-automation-btn"]',
        ),
        computation: container.querySelector(
          '[data-field="filter-computation-btn"]',
        ),
        energy: container.querySelector('[data-field="filter-energy-btn"]'),
        learning: container.querySelector('[data-field="filter-learning-btn"]'),
      },

      groups: {
        automation: container.querySelector("#group-automation"),
        computation: container.querySelector("#group-computation"),
        energy: container.querySelector("#group-energy"),
        learning: container.querySelector("#group-learning"),
      },

      deviceRows: {},
      deviceControls: {},

      drawersContainer: container.querySelector("#tes-drawers-container"),
      popoverContainer: container.querySelector("#tes-popover-container"),
    };

    const deviceIds = [
      "autoCalculator_AImp",
      "autoCalculator_AUpg",
      "autoCalculator_ARec",
      "autoCalculator_ARed",
      "transistorBoard",
      "microprocessor",
      "processor",
      "overclocker",
      "crcGadget",
      "capacitor",
      "powerCell",
      "hardDisk",
      "backpropagator",
      "statisticsDisplay",
    ];

    deviceIds.forEach((id) => {
      const row = container.querySelector(`[data-device-id="${id}"]`);
      if (row) {
        dom.deviceRows[id] = row;
        switch (id) {
          case "autoCalculator_AImp":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="chip-aimp-badge"]'),
              actionBtn: row.querySelector(
                '[data-field="chip-aimp-action-btn"]',
              ),
            };
            break;
          case "autoCalculator_AUpg":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="chip-aupg-badge"]'),
              actionBtn: row.querySelector(
                '[data-field="chip-aupg-action-btn"]',
              ),
            };
            break;
          case "autoCalculator_ARec":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="chip-arec-badge"]'),
              actionBtn: row.querySelector(
                '[data-field="chip-arec-action-btn"]',
              ),
            };
            break;
          case "autoCalculator_ARed":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="chip-ared-badge"]'),
              actionBtn: row.querySelector(
                '[data-field="chip-ared-action-btn"]',
              ),
            };
            break;
          case "transistorBoard":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="board-badge"]'),
              actionBtn: row.querySelector('[data-field="board-action-btn"]'),
            };
            break;
          case "microprocessor":
            dom.deviceControls[id] = {
              pill: row.querySelector('[data-field="micro-data-pill"]'),
              actionBtn: row.querySelector('[data-field="micro-action-btn"]'),
            };
            break;
          case "processor":
            dom.deviceControls[id] = {
              pill: row.querySelector('[data-field="processor-data-pill"]'),
              actionBtn: row.querySelector(
                '[data-field="processor-action-btn"]',
              ),
            };
            break;
          case "overclocker":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="overclock-badge"]'),
              buyBtn: row.querySelector('[data-field="overclock-buy-btn"]'),
              actBtn: row.querySelector(
                '[data-field="overclock-activate-btn"]',
              ),
            };
            break;
          case "crcGadget":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="crc-gadget-badge"]'),
              actionBtn: row.querySelector(
                '[data-field="crc-gadget-action-btn"]',
              ),
            };
            break;
          case "capacitor":
            dom.deviceControls[id] = {
              pill: row.querySelector('[data-field="capacitor-data-pill"]'),
              actionBtn: row.querySelector(
                '[data-field="capacitor-action-btn"]',
              ),
            };
            break;
          case "powerCell":
            dom.deviceControls[id] = {
              pill: row.querySelector('[data-field="powercell-data-pill"]'),
              actionBtn: row.querySelector(
                '[data-field="powercell-action-btn"]',
              ),
            };
            break;
          case "hardDisk":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="harddisk-status-badge"]'),
              actionBtn: row.querySelector(
                '[data-field="harddisk-action-btn"]',
              ),
            };
            break;
          case "backpropagator":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="backpropagator-badge"]'),
              actionBtn: row.querySelector(
                '[data-field="backpropagator-action-btn"]',
              ),
            };
            break;
          case "statisticsDisplay":
            dom.deviceControls[id] = {
              badge: row.querySelector('[data-field="statistics-display-badge"]'),
              actionBtn: row.querySelector(
                '[data-field="statistics-display-action-btn"]',
              ),
            };
            break;
        }
      }
    });
  }

  function updateDynamicValues(state) {
    if (!dom) cacheDomElements();
    const config = engine.config;

    // 1. Facility Rail Values (Always visible on all screens)
    const compLevel = state.computerLevel ?? 1;
    setElText(dom.railFacilityLevel, `Level ${compLevel}`);
    const currentData = calculateEffectiveAvailableData(state, config);
    const reqData = calculateRequiredDataForNextComputerLevel(
      compLevel,
      config,
    );
    setElText(
      dom.railDataFraction,
      `${formatInteger(currentData)} / ${formatInteger(reqData)}`,
    );
    const dataRatio = Math.min(100, Math.max(0, (currentData / reqData) * 100));
    if (dom.railDataBar) {
      const ratioStr = `${dataRatio.toFixed(1)}%`;
      if (dom.railDataBar.style.width !== ratioStr)
        dom.railDataBar.style.width = ratioStr;
    }
    setElText(dom.railEnergy, formatEnergy(state.energy));

    // Science Points rail row if unlocked
    if (dom.railSpRow) {
      if ((state.sciencePoints ?? 0) > 0 || state.unlocks?.science) {
        if (dom.railSpRow.style.display !== "flex")
          dom.railSpRow.style.display = "flex";
        setElText(dom.railSp, `${formatInteger(state.sciencePoints ?? 0)} SP`);
      } else if (dom.railSpRow.style.display !== "none") {
        dom.railSpRow.style.display = "none";
      }
    }

    // Dev Mode Button & Cheats Indicator
    if (dom.devBtn && dom.devBtnLabel) {
      const targetTxt = state.devMode ? "DEV: ON (FORCE)" : "DEV MODE";
      setElText(dom.devBtnLabel, targetTxt);
      dom.devBtn.classList.toggle(
        "btn-utility--active",
        Boolean(state.devMode),
      );
    }

    // Statistics Utility Button Availability (Part 3.1)
    if (dom.btnStats) {
      const statsUnlocked = Boolean(state.devices?.statisticsDisplay?.owned || state.devMode);
      if (statsUnlocked) {
        dom.btnStats.disabled = false;
        dom.btnStats.title = "Simulation Statistics";
        dom.btnStats.classList.remove("btn-utility--disabled");
      } else {
        dom.btnStats.disabled = true;
        dom.btnStats.title = "Requires Statistics Display";
        dom.btnStats.classList.add("btn-utility--disabled");
      }
    }

    // Narrative Milestone Triggers Check (Part 2)
    checkNarrativeTriggers(state);

    // Tab Switching Display
    const activeTab = state.ui?.activeTab || "energy";
    if (dom.tabEnergy) {
      const showEnergy = activeTab === "energy";
      const curDisplay = dom.tabEnergy.style.display;
      if (showEnergy && curDisplay !== "flex")
        dom.tabEnergy.style.display = "flex";
      else if (!showEnergy && curDisplay !== "none")
        dom.tabEnergy.style.display = "none";
    }
    if (dom.tabDevices) {
      const showDevices = activeTab === "devices";
      const curDisplay = dom.tabDevices.style.display;
      if (showDevices && curDisplay !== "flex")
        dom.tabDevices.style.display = "flex";
      else if (!showDevices && curDisplay !== "none")
        dom.tabDevices.style.display = "none";
    }
    dom.navTabs.forEach((tabBtn) => {
      tabBtn.classList.toggle(
        "tes-nav-tab--active",
        tabBtn.dataset.tab === activeTab,
      );
    });

    // 2. Tab-Conditional Execution: Only update active tab to prevent lag!
    if (activeTab === "energy") {
      updateEnergyTab(
        state,
        config,
        compLevel,
        currentData,
        reqData,
        dataRatio,
      );
    } else if (activeTab === "devices") {
      updateDevicesFilterAndRows(state, config);
    }

    // 3. Render Active Drawers / Modals (only if open or closed)
    renderDrawersAndModals(state, config);
  }

  function updateEnergyTab(
    state,
    config,
    compLevel,
    currentData,
    reqData,
    dataRatio,
  ) {
    // Central Energy Summary Card
    setElText(dom.storedEnergyMain, formatEnergy(state.energy));
    const prodRate = calculateEnergyProduction(
      state,
      config,
      engine.statResolver,
    );
    const stableCap = calculatePowerCellCapacity(
      state.powerCells ?? 0,
      state,
      config,
      engine.statResolver,
    );
    setElText(dom.energyCapacity, formatEnergy(stableCap));
    const overflowDecay = calculateEnergyOverflowDecay(
      state.energy,
      stableCap,
      config,
    );
    if (dom.energyDecayItem) {
      if (overflowDecay.gt(0)) {
        if (dom.energyDecayItem.style.display !== "flex")
          dom.energyDecayItem.style.display = "flex";
        setElText(dom.energyDecay, `-${formatEnergy(overflowDecay)}/s`);
      } else if (dom.energyDecayItem.style.display !== "none") {
        dom.energyDecayItem.style.display = "none";
      }
    }

    // Cosmic Radiation Condenser (CRC) displays GROSS Production
    setElText(dom.crcRate, formatRate(prodRate));
    setElText(dom.crcLevelMult, `Level ${compLevel}`);

    // CRC Growth Indicator (Part 4)
    if (dom.crcGrowth) {
      const growth = crcGrowthTracker.update(
        prodRate,
        performance.now(),
        state.stats?.totalMachineLearnings ?? 0,
        state.facilityOptimizations ?? 0,
      );
      if (dom.crcGrowth.textContent !== growth.text) {
        dom.crcGrowth.textContent = growth.text;
      }
      if (growth.isNegative) {
        dom.crcGrowth.classList.add("tes-crc-growth--negative");
      } else {
        dom.crcGrowth.classList.remove("tes-crc-growth--negative");
      }
    }

    // Stored Energy displays NET Production: Gross - Decay (and any active device drain)
    let totalDrain = overflowDecay;
    const hardDisks = state.devices?.hardDisks;
    if (hardDisks && hardDisks.owned > 0 && hardDisks.state === "active" && !hardDisks.dataPaused) {
      const hdDrain = calculateHardDiskEnergyDrain(
        hardDisks.owned,
        hardDisks.activeSeconds,
        config,
      );
      totalDrain = totalDrain.add(hdDrain);
    }
    const netRate = prodRate.sub(totalDrain);
    setElText(dom.energyNet, formatRate(netRate));

    if (dom.energyNet) {
      if (netRate.lt(0)) {
        dom.energyNet.style.color = "var(--tes-danger)";
      } else if (netRate.eq(0)) {
        dom.energyNet.style.color = "var(--tes-text-tertiary)";
      } else {
        dom.energyNet.style.color = "var(--tes-teal)";
      }
    }

    // Energy Era Progression Bar (Section 5)
    if (dom.energyEraPercent) {
      const eraProgress = calculateEnergyEraProgress(state.energy, config);
      const eraPercent = calculateEnergyEraPercent(state.energy, config);
      setElText(dom.energyEraPercent, `${eraPercent.toFixed(1)}%`);
      if (dom.energyEraFill) {
        const fillWidth = `${(eraProgress * 100).toFixed(1)}%`;
        if (dom.energyEraFill.style.width !== fillWidth) {
          dom.energyEraFill.style.width = fillWidth;
        }
      }
      if (dom.energyEraTrack) {
        dom.energyEraTrack.setAttribute("aria-valuenow", eraPercent.toFixed(1));
      }
    }

    const updateStudyExtraControls = (target, btnImprove, badgeImprove, milestoneImprove, cardInstall, costInstall) => {
      // 1. Study Improve (Section 1)
      const curImprove = state.studyImproves?.[target] ?? { completions: 0, claimed: 0 };
      const nextMilestone = calculateStudyImproveMilestone(curImprove.claimed, config);
      const currentStudies = state.algorithms?.[target]?.owned ?? 0;
      const canImprove = currentStudies >= nextMilestone;
      if (btnImprove) {
        btnImprove.disabled = !canImprove;
        btnImprove.setAttribute("aria-disabled", String(!canImprove));
        btnImprove.classList.toggle("btn-study-improve--available", canImprove);
        btnImprove.classList.toggle("btn-study-improve--disabled", !canImprove);
        btnImprove.title = canImprove
          ? `Click to claim Level ${curImprove.claimed + 1} Improve (${calculateStudyImproveMultiplier(curImprove.claimed + 1, config).toFixed(3)}x study speed)`
          : `Study Improve: ${curImprove.claimed > 0 ? `Level ${curImprove.claimed} | ` : ""}${formatInteger(currentStudies)} / ${formatInteger(nextMilestone)} current studies`;
      }
      if (milestoneImprove) {
        setElText(milestoneImprove, `${formatInteger(currentStudies)}/${formatInteger(nextMilestone)}`);
      }
      if (badgeImprove) {
        if (curImprove.claimed > 0) {
          if (badgeImprove.style.display !== "inline") badgeImprove.style.display = "inline";
          setElText(badgeImprove, `L${curImprove.claimed}`);
        } else if (badgeImprove.style.display !== "none") {
          badgeImprove.style.display = "none";
        }
      }

      // 2. Install Transistor (Section 3)
      const totalT = state.devices?.transistorsPurchased ?? 0;
      const tCost = calculateBulkDeviceCost("transistor", totalT, 1, config);
      const boardOwned = Boolean(state.devices?.transistorBoard?.owned || state.devMode);
      const studyUnlocked = target === "AImp" || Boolean(state.unlocks?.[target]);
      const canAfford = big(state.energy).gte(tCost);
      const isEligible = studyUnlocked && boardOwned && canAfford;

      if (costInstall) {
        setElText(costInstall, formatEnergy(tCost));
      }
      if (cardInstall) {
        // Install transistor card must NOT be visible until Transistor Board is owned
        const shouldShow = boardOwned && studyUnlocked;
        const desiredDisplay = shouldShow ? "flex" : "none";
        if (cardInstall.style.display !== desiredDisplay) {
          cardInstall.style.display = desiredDisplay;
        }

        cardInstall.disabled = !isEligible;
        cardInstall.classList.toggle("tes-install-transistor-card--available", isEligible);
        cardInstall.classList.toggle("tes-install-transistor-card--disabled", !isEligible);
        if (!boardOwned) {
          cardInstall.title = "Requires Transistor Board";
        } else if (!studyUnlocked) {
          cardInstall.title = "Study locked";
        } else if (!canAfford) {
          cardInstall.title = `Insufficient Energy (${formatEnergy(tCost)} required)`;
        } else {
          const alloc = state.devices?.transistorAllocations?.[target] ?? 0;
          cardInstall.title = `Install 1 Transistor into ${target} (currently ${alloc} installed)`;
        }
      }
    };

    updateStudyExtraControls("AImp", dom.aimpImproveBtn, dom.aimpImproveBadge, dom.aimpImproveMilestone, dom.aimpInstallTransistor, dom.aimpTransistorCost);
    updateStudyExtraControls("AUpg", dom.aupgImproveBtn, dom.aupgImproveBadge, dom.aupgImproveMilestone, dom.aupgInstallTransistor, dom.aupgTransistorCost);
    updateStudyExtraControls("ARec", dom.arecImproveBtn, dom.arecImproveBadge, dom.arecImproveMilestone, dom.arecInstallTransistor, dom.arecTransistorCost);
    updateStudyExtraControls("ARed", dom.aredImproveBtn, dom.aredImproveBadge, dom.aredImproveMilestone, dom.aredInstallTransistor, dom.aredTransistorCost);

    // Algorithm Improvement
    const aImpOwned = state.algorithms?.AImp?.owned ?? 0;
    setElText(
      dom.aimpTitle,
      `Algorithm Improvement (${formatInteger(aImpOwned)})`,
    );
    const aImpDur = calculateEffectiveStudyDuration(
      "AImp",
      state,
      config,
      engine.statResolver,
    );
    setElText(dom.aimpDur, formatStudyDuration(aImpDur));
    if (dom.aimpRing) {
      const aImpStudy = state.manualStudies?.AImp ?? (state.manualStudy?.target === "AImp" ? state.manualStudy : null);
      const isAImpActive = Boolean(aImpStudy?.active);
      if (isAImpActive && aImpDur > 0) {
        if (aImpDur < 0.05) {
          // At sub-0.05s continuous rate, illuminate ring completely
          dom.aimpRing.setAttribute("stroke-dashoffset", "0");
        } else {
          const progress = Math.min(
            1,
            (aImpStudy?.elapsed ?? 0) / aImpDur,
          );
          const offset = (56.5 * (1 - progress)).toFixed(1);
          if (dom.aimpRing.getAttribute("stroke-dashoffset") !== offset) {
            dom.aimpRing.setAttribute("stroke-dashoffset", offset);
          }
        }
      } else if (dom.aimpRing.getAttribute("stroke-dashoffset") !== "56.5") {
        dom.aimpRing.setAttribute("stroke-dashoffset", "56.5");
      }
    }
    if (dom.aimpAutoBadge) {
      const hasChip = (state.devices?.chips?.allocations?.AImp ?? 0) > 0;
      if (!hasChip) {
        if (dom.aimpAutoBadge.className !== "badge-auto badge-auto--locked") {
          dom.aimpAutoBadge.className = "badge-auto badge-auto--locked";
          dom.aimpAutoBadge.textContent = "Auto: Locked";
          dom.aimpAutoBadge.title = "Requires AutoCalculator — Improvements";
        }
      } else {
        const isEnabled = state.devices?.chips?.enabled?.AImp !== false;
        const targetClass = `badge-auto ${isEnabled ? "badge-auto--on" : "badge-auto--off"}`;
        const targetText = isEnabled ? "Auto: ON" : "Auto: OFF";
        if (dom.aimpAutoBadge.className !== targetClass) {
          dom.aimpAutoBadge.className = targetClass;
          dom.aimpAutoBadge.textContent = targetText;
          dom.aimpAutoBadge.title = "Click to toggle automated studying";
        }
      }
    }

    // Algorithm Upgrade
    const aUpgOwned = state.algorithms?.AUpg?.owned ?? 0;
    setElText(dom.aupgTitle, `Algorithm Upgrade (${formatInteger(aUpgOwned)})`);
    const aUpgDur = calculateEffectiveStudyDuration(
      "AUpg",
      state,
      config,
      engine.statResolver,
    );
    setElText(dom.aupgDur, formatStudyDuration(aUpgDur));
    const aUpgCanAfford = (state.algorithms?.AImp?.owned ?? 0) >= 12;
    if (dom.aupgBtn) {
      const disabled = !aUpgCanAfford && !state.devMode;
      if (dom.aupgBtn.disabled !== disabled) dom.aupgBtn.disabled = disabled;
    }
    if (dom.aupgRing) {
      const aUpgStudy = state.manualStudies?.AUpg ?? (state.manualStudy?.target === "AUpg" ? state.manualStudy : null);
      const isAUpgActive = Boolean(aUpgStudy?.active);
      if (isAUpgActive && aUpgDur > 0) {
        if (aUpgDur < 0.05) {
          dom.aupgRing.setAttribute("stroke-dashoffset", "0");
        } else {
          const progress = Math.min(
            1,
            (aUpgStudy?.elapsed ?? 0) / aUpgDur,
          );
          const offset = (56.5 * (1 - progress)).toFixed(1);
          if (dom.aupgRing.getAttribute("stroke-dashoffset") !== offset) {
            dom.aupgRing.setAttribute("stroke-dashoffset", offset);
          }
        }
      } else if (dom.aupgRing.getAttribute("stroke-dashoffset") !== "56.5") {
        dom.aupgRing.setAttribute("stroke-dashoffset", "56.5");
      }
    }
    if (dom.aupgAutoBadge) {
      const hasChip = (state.devices?.chips?.allocations?.AUpg ?? 0) > 0;
      if (!hasChip) {
        if (dom.aupgAutoBadge.className !== "badge-auto badge-auto--locked") {
          dom.aupgAutoBadge.className = "badge-auto badge-auto--locked";
          dom.aupgAutoBadge.textContent = "Auto: Locked";
        }
      } else {
        const isEnabled = state.devices?.chips?.enabled?.AUpg !== false;
        const targetClass = `badge-auto ${isEnabled ? "badge-auto--on" : "badge-auto--off"}`;
        const targetText = isEnabled ? "Auto: ON" : "Auto: OFF";
        if (dom.aupgAutoBadge.className !== targetClass) {
          dom.aupgAutoBadge.className = targetClass;
          dom.aupgAutoBadge.textContent = targetText;
        }
      }
    }

    // Algorithm Recalculation
    if (dom.arecRow) {
      if (state.unlocks?.ARec) {
        if (dom.arecUnit && dom.arecUnit.style.display !== "flex")
          dom.arecUnit.style.display = "flex";
        if (dom.arecRow.style.display !== "flex")
          dom.arecRow.style.display = "flex";
        const aRecOwned = state.algorithms?.ARec?.owned ?? 0;
        setElText(
          dom.arecTitle,
          `Algorithm Recalculation (${formatInteger(aRecOwned)})`,
        );
        const aRecDur = calculateEffectiveStudyDuration(
          "ARec",
          state,
          config,
          engine.statResolver,
        );
        setElText(dom.arecDur, formatStudyDuration(aRecDur));
        const aRecCanAfford = (state.algorithms?.AUpg?.owned ?? 0) >= 12;
        if (dom.arecBtn) {
          const disabled = !aRecCanAfford && !state.devMode;
          if (dom.arecBtn.disabled !== disabled)
            dom.arecBtn.disabled = disabled;
        }
        if (dom.arecRing) {
          const aRecStudy = state.manualStudies?.ARec ?? (state.manualStudy?.target === "ARec" ? state.manualStudy : null);
          const isARecActive = Boolean(aRecStudy?.active);
          if (isARecActive && aRecDur > 0) {
            if (aRecDur < 0.05) {
              dom.arecRing.setAttribute("stroke-dashoffset", "0");
            } else {
              const progress = Math.min(
                1,
                (aRecStudy?.elapsed ?? 0) / aRecDur,
              );
              const offset = (56.5 * (1 - progress)).toFixed(1);
              if (dom.arecRing.getAttribute("stroke-dashoffset") !== offset) {
                dom.arecRing.setAttribute("stroke-dashoffset", offset);
              }
            }
          } else if (dom.arecRing.getAttribute("stroke-dashoffset") !== "56.5") {
            dom.arecRing.setAttribute("stroke-dashoffset", "56.5");
          }
        }
        if (dom.arecAutoBadge) {
          const hasChip = (state.devices?.chips?.allocations?.ARec ?? 0) > 0;
          if (!hasChip) {
            if (
              dom.arecAutoBadge.className !== "badge-auto badge-auto--locked"
            ) {
              dom.arecAutoBadge.className = "badge-auto badge-auto--locked";
              dom.arecAutoBadge.textContent = "Auto: Locked";
            }
          } else {
            const isEnabled = state.devices?.chips?.enabled?.ARec !== false;
            const targetClass = `badge-auto ${isEnabled ? "badge-auto--on" : "badge-auto--off"}`;
            const targetText = isEnabled ? "Auto: ON" : "Auto: OFF";
            if (dom.arecAutoBadge.className !== targetClass) {
              dom.arecAutoBadge.className = targetClass;
              dom.arecAutoBadge.textContent = targetText;
            }
          }
        }
      } else {
        if (dom.arecUnit && dom.arecUnit.style.display !== "none") {
          dom.arecUnit.style.display = "none";
        }
        if (dom.arecRow.style.display !== "none") {
          dom.arecRow.style.display = "none";
        }
      }
    }

    // Algorithm Redesign
    if (dom.aredRow) {
      if (state.unlocks?.ARed) {
        if (dom.aredUnit && dom.aredUnit.style.display !== "flex")
          dom.aredUnit.style.display = "flex";
        if (dom.aredRow.style.display !== "flex")
          dom.aredRow.style.display = "flex";
        const aRedOwned = state.algorithms?.ARed?.owned ?? 0;
        setElText(
          dom.aredTitle,
          `Algorithm Redesign (${formatInteger(aRedOwned)})`,
        );
        const aRedDur = calculateEffectiveStudyDuration(
          "ARed",
          state,
          config,
          engine.statResolver,
        );
        setElText(dom.aredDur, formatStudyDuration(aRedDur));
        const aRedCanAfford = (state.algorithms?.ARec?.owned ?? 0) >= 12;
        if (dom.aredBtn) {
          const disabled = !aRedCanAfford && !state.devMode;
          if (dom.aredBtn.disabled !== disabled)
            dom.aredBtn.disabled = disabled;
        }
        if (dom.aredRing) {
          const aRedStudy = state.manualStudies?.ARed ?? (state.manualStudy?.target === "ARed" ? state.manualStudy : null);
          const isARedActive = Boolean(aRedStudy?.active);
          if (isARedActive && aRedDur > 0) {
            if (aRedDur < 0.05) {
              dom.aredRing.setAttribute("stroke-dashoffset", "0");
            } else {
              const progress = Math.min(
                1,
                (aRedStudy?.elapsed ?? 0) / aRedDur,
              );
              const offset = (56.5 * (1 - progress)).toFixed(1);
              if (dom.aredRing.getAttribute("stroke-dashoffset") !== offset) {
                dom.aredRing.setAttribute("stroke-dashoffset", offset);
              }
            }
          } else if (dom.aredRing.getAttribute("stroke-dashoffset") !== "56.5") {
            dom.aredRing.setAttribute("stroke-dashoffset", "56.5");
          }
        }
        if (dom.aredAutoBadge) {
          const hasChip = (state.devices?.chips?.allocations?.ARed ?? 0) > 0;
          if (!hasChip) {
            if (
              dom.aredAutoBadge.className !== "badge-auto badge-auto--locked"
            ) {
              dom.aredAutoBadge.className = "badge-auto badge-auto--locked";
              dom.aredAutoBadge.textContent = "Auto: Locked";
            }
          } else {
            const isEnabled = state.devices?.chips?.enabled?.ARed !== false;
            const targetClass = `badge-auto ${isEnabled ? "badge-auto--on" : "badge-auto--off"}`;
            const targetText = isEnabled ? "Auto: ON" : "Auto: OFF";
            if (dom.aredAutoBadge.className !== targetClass) {
              dom.aredAutoBadge.className = targetClass;
              dom.aredAutoBadge.textContent = targetText;
            }
          }
        }
      } else {
        if (dom.aredUnit && dom.aredUnit.style.display !== "none") {
          dom.aredUnit.style.display = "none";
        }
        if (dom.aredRow.style.display !== "none") {
          dom.aredRow.style.display = "none";
        }
      }
    }

    // Machine Learning Card
    setElText(
      dom.mlProgressText,
      `${formatInteger(currentData)} / ${formatInteger(reqData)} Data`,
    );
    if (dom.mlProgressBar) {
      const ratioStr = `${dataRatio.toFixed(1)}%`;
      if (dom.mlProgressBar.style.width !== ratioStr)
        dom.mlProgressBar.style.width = ratioStr;
    }
    if (dom.mlBtn) {
      const canML = currentData >= reqData;
      if (canML) {
        if (dom.mlBtn.disabled) dom.mlBtn.disabled = false;
        if (dom.mlBtn.className !== "btn-primary")
          dom.mlBtn.className = "btn-primary";
        dom.mlBtn.innerHTML = `Run Machine Learning (Adv to Level ${compLevel + 1}) <kbd class="tes-hotkey-hint">M</kbd>`;
      } else if (state.devMode) {
        if (dom.mlBtn.disabled) dom.mlBtn.disabled = false;
        if (dom.mlBtn.className !== "btn-primary btn-utility--active")
          dom.mlBtn.className = "btn-primary btn-utility--active";
        dom.mlBtn.innerHTML = `[DEV BYPASS] Advance to Level ${compLevel + 1} <kbd class="tes-hotkey-hint">M</kbd>`;
      } else {
        if (!dom.mlBtn.disabled) dom.mlBtn.disabled = true;
        if (dom.mlBtn.className !== "btn-primary")
          dom.mlBtn.className = "btn-primary";
        dom.mlBtn.innerHTML = `Need ${formatInteger(reqData)} Data <kbd class="tes-hotkey-hint">M</kbd>`;
      }
    }

    // Facility Optimization / Setup Optimization Prestige Card
    if (dom.foCard) {
      const foCount = state.facilityOptimizations ?? 0;
      const reqFoLevel = calculateFacilityOptimizationRequirement(foCount, config);
      const curLevel = state.computerLevel ?? 1;
      const curBonus = calculateFacilityDeviceMultiplier(foCount, config);
      const nextBonus = calculateFacilityDeviceMultiplier(foCount + 1, config);

      // Trigger condition: show when at or above required level, or 1 level prior, or already completed, or devMode
      const isFoVisible = curLevel >= reqFoLevel - 1 || foCount > 0 || Boolean(state.devMode);
      const foDisplay = isFoVisible ? "flex" : "none";
      if (dom.foCard && dom.foCard.style.display !== foDisplay) {
        dom.foCard.style.display = foDisplay;
      }

      if (isFoVisible && dom.foCard) {
        const isEligible = curLevel >= reqFoLevel || Boolean(state.devMode);
        dom.foCard.classList.toggle("tes-fo-card--eligible", isEligible);

        const levelPct = Math.min(100, Math.max(0, (curLevel / reqFoLevel) * 100));
        setElText(dom.foProgressText, `Level ${curLevel} / ${reqFoLevel}`);
        if (dom.foProgressBar) {
          dom.foProgressBar.style.width = `${levelPct.toFixed(1)}%`;
        }

        if (dom.foReqLevel) setElText(dom.foReqLevel, `Level ${reqFoLevel}`);
        if (dom.foCurBonus) setElText(dom.foCurBonus, `${curBonus.toFixed(2)}×`);
        if (dom.foNextBonus) setElText(dom.foNextBonus, `${nextBonus.toFixed(2)}×`);

        if (dom.foBtn) {
          if (isEligible) {
            dom.foBtn.disabled = false;
            dom.foBtn.innerHTML = `Perform Setup Optimization (Lv. ${curLevel})`;
          } else {
            dom.foBtn.disabled = true;
            dom.foBtn.innerHTML = `Requires Computer Level ${reqFoLevel} (Current: Lv. ${curLevel})`;
          }
        }
      }
    }
  }

  function updateDevicesFilterAndRows(state, config) {
    const filter = state.ui?.deviceCategoryFilter || "all";
    const showAdded = state.ui?.showAdded !== false;
    const showUnavailable = state.ui?.showUnavailable !== false;

    // Particle Synthesizer Teaser Visibility (Part 2.5)
    if (dom.synthTeaserCard) {
      const showTeaser = Boolean(state.narrative?.synthTeaserUnlocked);
      dom.synthTeaserCard.style.display = showTeaser ? "flex" : "none";
    }

    // Checkbox synchronization
    if (dom.toggleShowAdded && dom.toggleShowAdded.checked !== showAdded) {
      dom.toggleShowAdded.checked = showAdded;
    }
    if (
      dom.toggleShowUnavailable &&
      dom.toggleShowUnavailable.checked !== showUnavailable
    ) {
      dom.toggleShowUnavailable.checked = showUnavailable;
    }

    // Category button active states
    dom.filterPills.forEach((pill) => {
      pill.classList.toggle(
        "tes-filter-pill--active",
        pill.dataset.filter === filter,
      );
    });

    const devicesList = [
      "autoCalculator_AImp",
      "autoCalculator_AUpg",
      "autoCalculator_ARec",
      "autoCalculator_ARed",
      "transistorBoard",
      "microprocessor",
      "processor",
      "overclocker",
      "crcGadget",
      "capacitor",
      "powerCell",
      "hardDisk",
      "backpropagator",
    ];

    let counts = {
      all: 0,
      automation: 0,
      computation: 0,
      energy: 0,
      learning: 0,
    };
    let visibleInGroup = {
      automation: 0,
      computation: 0,
      energy: 0,
      learning: 0,
    };

    devicesList.forEach((id) => {
      const element = getElement(id);
      if (!element) return;
      const row = dom.deviceRows[id];
      if (!row) return;

      const evalResult = evaluateElement(element, state, config, 1);
      const isRevealed = evalResult.isRevealed;
      const isOwned = evalResult.owned > 0;
      const isUnlocked = evalResult.strictUnlocked;

      // Count only revealed devices
      if (isRevealed) {
        counts.all++;
        if (counts[element.category] !== undefined) counts[element.category]++;
      }

      // Check visibility rules
      let visible = isRevealed;
      if (filter !== "all" && element.category !== filter) visible = false;
      if (!showAdded && evalResult.unique && isOwned) visible = false;
      if (!showUnavailable && !isUnlocked) visible = false;

      const displayVal = visible ? "flex" : "none";
      if (row.style.display !== displayVal) {
        row.style.display = displayVal;
      }

      if (visible) {
        if (visibleInGroup[element.category] !== undefined)
          visibleInGroup[element.category]++;
        updateDeviceRowUI(
          id,
          evalResult,
          state,
          config,
          row,
          dom.deviceControls[id],
        );
      }
    });

    // Update filter pill counts
    setElText(dom.filterCounts.all, `All (${counts.all})`);
    setElText(dom.filterCounts.automation, `Automation (${counts.automation})`);
    setElText(
      dom.filterCounts.computation,
      `Computation (${counts.computation})`,
    );
    setElText(dom.filterCounts.energy, `Energy (${counts.energy})`);
    setElText(dom.filterCounts.learning, `Learning (${counts.learning})`);

    // Hide section headers if all rows in that group are hidden
    for (const cat of ["automation", "computation", "energy", "learning"]) {
      const group = dom.groups[cat];
      if (group) {
        const showGrp = (visibleInGroup[cat] ?? 0) > 0;
        const grpVal = showGrp ? "flex" : "none";
        if (group.style.display !== grpVal) {
          group.style.display = grpVal;
        }
      }
    }
  }

  function updateDeviceRowUI(
    id,
    evalResult,
    state,
    config,
    row,
    controls = {},
  ) {
    const { owned, cost, unique, strictUnlocked, visualStatus, canClick } =
      evalResult;

    switch (id) {
      case "autoCalculator_AImp": {
        const badge =
          controls?.badge ||
          row.querySelector('[data-field="chip-aimp-badge"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="chip-aimp-action-btn"]');
        const hasAImp = (state.devices?.chips?.allocations?.AImp ?? 0) > 0;
        if (hasAImp) {
          const isEnabled = state.devices?.chips?.enabled?.AImp !== false;
          if (badge) {
            const cls = `badge-status ${isEnabled ? "badge-status--active" : "badge-status--off"}`;
            const txt = isEnabled ? "Active" : "Paused";
            if (badge.className !== cls) badge.className = cls;
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-secondary")
              btn.className = "btn-secondary";
            const txt = isEnabled ? "Pause" : "Resume";
            if (btn.textContent !== txt) btn.textContent = txt;
            if (btn.dataset.action !== "toggle-auto-study")
              btn.dataset.action = "toggle-auto-study";
            if (btn.dataset.target !== "AImp") btn.dataset.target = "AImp";
            if (btn.dataset.elementId) delete btn.dataset.elementId;
            if (btn.disabled) btn.disabled = false;
          }
        } else {
          if (badge) {
            if (badge.className !== "badge-status badge-status--off")
              badge.className = "badge-status badge-status--off";
            const txt = cost ? formatEnergy(cost) : "Locked";
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-primary") btn.className = "btn-primary";
            if (btn.textContent !== "Add") btn.textContent = "Add";
            if (btn.dataset.action !== "buy-element")
              btn.dataset.action = "buy-element";
            if (btn.dataset.elementId !== "autoCalculator_AImp")
              btn.dataset.elementId = "autoCalculator_AImp";
            const disabled = !canClick;
            if (btn.disabled !== disabled) btn.disabled = disabled;
          }
        }
        break;
      }

      case "autoCalculator_AUpg": {
        const badge =
          controls?.badge ||
          row.querySelector('[data-field="chip-aupg-badge"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="chip-aupg-action-btn"]');
        const hasAUpg = (state.devices?.chips?.allocations?.AUpg ?? 0) > 0;
        if (hasAUpg) {
          const isEnabled = state.devices?.chips?.enabled?.AUpg !== false;
          if (badge) {
            const cls = `badge-status ${isEnabled ? "badge-status--active" : "badge-status--off"}`;
            const txt = isEnabled ? "Active" : "Paused";
            if (badge.className !== cls) badge.className = cls;
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-secondary")
              btn.className = "btn-secondary";
            const txt = isEnabled ? "Pause" : "Resume";
            if (btn.textContent !== txt) btn.textContent = txt;
            if (btn.dataset.action !== "toggle-auto-study")
              btn.dataset.action = "toggle-auto-study";
            if (btn.dataset.target !== "AUpg") btn.dataset.target = "AUpg";
            if (btn.dataset.elementId) delete btn.dataset.elementId;
            if (btn.disabled) btn.disabled = false;
          }
        } else {
          if (badge) {
            if (badge.className !== "badge-status badge-status--off")
              badge.className = "badge-status badge-status--off";
            const txt = cost ? formatEnergy(cost) : "Locked";
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-primary") btn.className = "btn-primary";
            if (btn.textContent !== "Add") btn.textContent = "Add";
            if (btn.dataset.action !== "buy-element")
              btn.dataset.action = "buy-element";
            if (btn.dataset.elementId !== "autoCalculator_AUpg")
              btn.dataset.elementId = "autoCalculator_AUpg";
            const disabled = !canClick;
            if (btn.disabled !== disabled) btn.disabled = disabled;
          }
        }
        break;
      }

      case "autoCalculator_ARec": {
        const badge =
          controls?.badge ||
          row.querySelector('[data-field="chip-arec-badge"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="chip-arec-action-btn"]');
        const hasARec = (state.devices?.chips?.allocations?.ARec ?? 0) > 0;
        if (hasARec) {
          const isEnabled = state.devices?.chips?.enabled?.ARec !== false;
          if (badge) {
            const cls = `badge-status ${isEnabled ? "badge-status--active" : "badge-status--off"}`;
            const txt = isEnabled ? "Active" : "Paused";
            if (badge.className !== cls) badge.className = cls;
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-secondary")
              btn.className = "btn-secondary";
            const txt = isEnabled ? "Pause" : "Resume";
            if (btn.textContent !== txt) btn.textContent = txt;
            if (btn.dataset.action !== "toggle-auto-study")
              btn.dataset.action = "toggle-auto-study";
            if (btn.dataset.target !== "ARec") btn.dataset.target = "ARec";
            if (btn.dataset.elementId) delete btn.dataset.elementId;
            if (btn.disabled) btn.disabled = false;
          }
        } else {
          if (badge) {
            if (badge.className !== "badge-status badge-status--off")
              badge.className = "badge-status badge-status--off";
            const txt = cost ? formatEnergy(cost) : "Locked";
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-primary") btn.className = "btn-primary";
            if (btn.textContent !== "Add") btn.textContent = "Add";
            if (btn.dataset.action !== "buy-element")
              btn.dataset.action = "buy-element";
            if (btn.dataset.elementId !== "autoCalculator_ARec")
              btn.dataset.elementId = "autoCalculator_ARec";
            const disabled = !canClick;
            if (btn.disabled !== disabled) btn.disabled = disabled;
          }
        }
        break;
      }

      case "autoCalculator_ARed": {
        const badge =
          controls?.badge ||
          row.querySelector('[data-field="chip-ared-badge"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="chip-ared-action-btn"]');
        const hasARed = (state.devices?.chips?.allocations?.ARed ?? 0) > 0;
        if (hasARed) {
          const isEnabled = state.devices?.chips?.enabled?.ARed !== false;
          if (badge) {
            const cls = `badge-status ${isEnabled ? "badge-status--active" : "badge-status--off"}`;
            const txt = isEnabled ? "Active" : "Paused";
            if (badge.className !== cls) badge.className = cls;
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-secondary")
              btn.className = "btn-secondary";
            const txt = isEnabled ? "Pause" : "Resume";
            if (btn.textContent !== txt) btn.textContent = txt;
            if (btn.dataset.action !== "toggle-auto-study")
              btn.dataset.action = "toggle-auto-study";
            if (btn.dataset.target !== "ARed") btn.dataset.target = "ARed";
            if (btn.dataset.elementId) delete btn.dataset.elementId;
            if (btn.disabled) btn.disabled = false;
          }
        } else {
          if (badge) {
            if (badge.className !== "badge-status badge-status--off")
              badge.className = "badge-status badge-status--off";
            const txt = cost ? formatEnergy(cost) : "Locked";
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-primary") btn.className = "btn-primary";
            if (btn.textContent !== "Add") btn.textContent = "Add";
            if (btn.dataset.action !== "buy-element")
              btn.dataset.action = "buy-element";
            if (btn.dataset.elementId !== "autoCalculator_ARed")
              btn.dataset.elementId = "autoCalculator_ARed";
            const disabled = !canClick;
            if (btn.disabled !== disabled) btn.disabled = disabled;
          }
        }
        break;
      }

      case "transistorBoard": {
        const badge =
          controls?.badge || row.querySelector('[data-field="board-badge"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="board-action-btn"]');
        const hasBoard = Boolean(state.devices?.transistorBoard?.owned);
        if (hasBoard) {
          if (badge) {
            if (badge.className !== "badge-status badge-status--active")
              badge.className = "badge-status badge-status--active";
            const totalT = state.devices?.transistorsPurchased ?? 0;
            const studySpeedMult = engine?.statResolver
              ? engine.statResolver.resolve("devices.studySpeedMultiplier", { state, config })
              : calculateStudySpeedDeviceMultiplier(state, config);
            const effBonus = (config.devices?.transistor?.speedBonusPerUnit ?? 0.05) * 100 * studySpeedMult;
            const txt = studySpeedMult > 1.0001
              ? `${formatInteger(totalT)} Transistors (+${effBonus.toFixed(1)}%/ea)`
              : `${formatInteger(totalT)} Transistors`;
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-secondary")
              btn.className = "btn-secondary";
            if (btn.textContent !== "Allocate") btn.textContent = "Allocate";
            if (btn.dataset.action !== "open-drawer")
              btn.dataset.action = "open-drawer";
            if (btn.dataset.drawer !== "transistor")
              btn.dataset.drawer = "transistor";
            if (btn.dataset.elementId) delete btn.dataset.elementId;
            if (btn.disabled) btn.disabled = false;
          }
        } else {
          if (badge) {
            if (badge.className !== "badge-status badge-status--off")
              badge.className = "badge-status badge-status--off";
            const txt = cost ? formatEnergy(cost) : formatEnergy(config.devices?.transistorBoard?.initialCost ?? 2e-10);
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.className !== "btn-primary") btn.className = "btn-primary";
            if (btn.textContent !== "Add") btn.textContent = "Add";
            if (btn.dataset.action !== "buy-element")
              btn.dataset.action = "buy-element";
            if (btn.dataset.elementId !== "transistorBoard")
              btn.dataset.elementId = "transistorBoard";
            const disabled = !canClick;
            if (btn.disabled !== disabled) btn.disabled = disabled;
          }
        }
        break;
      }

      case "microprocessor": {
        const pill =
          controls?.pill || row.querySelector('[data-field="micro-data-pill"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="micro-action-btn"]');
        const mTarget = state.devices?.microprocessor?.target ?? "AImp";
        const mOwned = state.devices?.microprocessor?.owned ?? 0;
        const studySpeedMult = engine?.statResolver
          ? engine.statResolver.resolve("devices.studySpeedMultiplier", { state, config })
          : calculateStudySpeedDeviceMultiplier(state, config);
        const allocatedT = state.devices?.transistorAllocations?.[mTarget] ?? 0;
        const microMult = calculateMicroprocessorStudyMultiplier(
          allocatedT,
          config,
          studySpeedMult,
          mOwned,
        );
        if (pill) {
          const txt = mOwned >= 1
            ? `Target: ${mTarget} (${microMult.toFixed(2)}x)`
            : `Target: ${mTarget}`;
          if (pill.textContent !== txt) pill.textContent = txt;
        }
        if (btn) {
          if (mOwned >= 1) {
            const txt = "Installed";
            if (btn.textContent !== txt) btn.textContent = txt;
            if (btn.disabled !== true) btn.disabled = true;
            btn.removeAttribute("title");
          } else if (!strictUnlocked) {
            const txt = "Locked";
            if (btn.textContent !== txt) btn.textContent = txt;
            if (btn.disabled !== true) btn.disabled = true;
            btn.title = evalResult.reasons.join(". ");
          } else {
            const txt = cost ? `Install (${formatEnergy(cost)})` : "Install";
            if (btn.textContent !== txt) btn.textContent = txt;
            const disabled = !canClick;
            if (btn.disabled !== disabled) btn.disabled = disabled;
            if (disabled && evalResult.reasons.length > 0) {
              btn.title = evalResult.reasons.join(". ");
            } else {
              btn.title = `Install Microprocessor for ${formatEnergy(cost)}`;
            }
          }
        }
        break;
      }

      case "processor": {
        const pill =
          controls?.pill ||
          row.querySelector('[data-field="processor-data-pill"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="processor-action-btn"]');
        const pOwned = state.devices?.processors ?? 0;
        const pBonusUnit = (config.devices?.processor?.bonusPerUnit ?? 0.05) * 100;
        if (pill) {
          const txt = pOwned > 0
            ? `+${(pOwned * pBonusUnit).toFixed(1)}% Study Speed (${formatInteger(pOwned)} owned)`
            : `+${pBonusUnit.toFixed(1)}% Study Speed/ea (0 owned)`;
          if (pill.textContent !== txt) pill.textContent = txt;
        }
        if (btn) {
          const txt = cost ? `Add (${formatEnergy(cost)})` : "Add";
          if (btn.textContent !== txt) btn.textContent = txt;
          const disabled = !canClick;
          if (btn.disabled !== disabled) btn.disabled = disabled;
        }
        break;
      }

      case "overclocker": {
        const badge =
          controls?.badge ||
          row.querySelector('[data-field="overclock-badge"]');
        const buyBtn =
          controls?.buyBtn ||
          row.querySelector('[data-field="overclock-buy-btn"]');
        const actBtn =
          controls?.actBtn ||
          row.querySelector('[data-field="overclock-activate-btn"]');
        const oc = state.devices?.overclocker;
        const ocOwned = (oc?.owned ?? 0) > 0;
        const mTarget = state.devices?.microprocessor?.target ?? "AImp";
        const tOnTarget = state.devices?.transistorAllocations?.[mTarget] ?? 0;

        if (!ocOwned) {
          if (badge) {
            if (badge.className !== "badge-status badge-status--off")
              badge.className = "badge-status badge-status--off";
            const ocCost = cost ? formatEnergy(cost) : formatEnergy(config.devices?.overclocker?.initialCost ?? 9e-8);
            if (badge.textContent !== ocCost)
              badge.textContent = ocCost;
          }
          if (buyBtn) {
            if (buyBtn.style.display !== "inline-flex")
              buyBtn.style.display = "inline-flex";
            const disabled = !canClick;
            if (buyBtn.disabled !== disabled) buyBtn.disabled = disabled;
          }
          if (actBtn && actBtn.style.display !== "none")
            actBtn.style.display = "none";
        } else {
          if (buyBtn && buyBtn.style.display !== "none")
            buyBtn.style.display = "none";
          if (actBtn && actBtn.style.display !== "inline-flex")
            actBtn.style.display = "inline-flex";

          if (oc?.active) {
            if (badge) {
              if (badge.className !== "badge-status badge-status--standby")
                badge.className = "badge-status badge-status--standby";
              const txt = `Active (${Math.max(0, oc.remainingDuration).toFixed(1)}s)`;
              if (badge.textContent !== txt) badge.textContent = txt;
            }
            if (actBtn) {
              if (!actBtn.disabled) actBtn.disabled = true;
              if (actBtn.textContent !== "Active")
                actBtn.textContent = "Active";
            }
          } else if (tOnTarget >= 2) {
            if (badge) {
              if (badge.className !== "badge-status badge-status--active")
                badge.className = "badge-status badge-status--active";
              if (badge.textContent !== "Ready") badge.textContent = "Ready";
            }
            if (actBtn) {
              if (actBtn.disabled) actBtn.disabled = false;
              const txt = `Activate (${formatInteger(tOnTarget)} T)`;
              if (actBtn.textContent !== txt) actBtn.textContent = txt;
            }
          } else {
            if (badge) {
              if (badge.className !== "badge-status badge-status--off")
                badge.className = "badge-status badge-status--off";
              const txt = `Need 2+ T on ${mTarget}`;
              if (badge.textContent !== txt) badge.textContent = txt;
            }
            if (actBtn) {
              const disabled = !state.devMode;
              if (actBtn.disabled !== disabled) actBtn.disabled = disabled;
              const txt = state.devMode ? "[Bypass] Activate" : "Needs 2+ T";
              if (actBtn.textContent !== txt) actBtn.textContent = txt;
            }
          }
        }
        break;
      }

      case "crcGadget": {
        const badge =
          controls?.badge ||
          row.querySelector('[data-field="crc-gadget-badge"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="crc-gadget-action-btn"]');
        const hasGadget = (state.devices?.crcGadget?.owned ?? 0) > 0;
        const deviceMultiplier = engine?.statResolver
          ? engine.statResolver.resolve("devices.globalMultiplier", { state, config })
          : calculateTotalDeviceMultiplier(state, config);
        const crcMult = calculateCrcMultiplier(state, config, deviceMultiplier);
        if (hasGadget) {
          if (badge) {
            if (badge.className !== "badge-status badge-status--active")
              badge.className = "badge-status badge-status--active";
            const txt = `Active (${crcMult.toFixed(2)}x)`;
            if (badge.textContent !== txt)
              badge.textContent = txt;
          }
          if (btn) {
            if (!btn.disabled) btn.disabled = true;
            if (btn.className !== "btn-secondary")
              btn.className = "btn-secondary";
            if (btn.textContent !== "Owned") btn.textContent = "Owned";
          }
        } else {
          if (badge) {
            if (badge.className !== "badge-status badge-status--off")
              badge.className = "badge-status badge-status--off";
            const txt = cost ? formatEnergy(cost) : formatEnergy(config.devices?.crcGadget?.initialCost ?? 1e-8);
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            const disabled = !canClick;
            if (btn.disabled !== disabled) btn.disabled = disabled;
            if (btn.className !== "btn-primary") btn.className = "btn-primary";
            if (btn.textContent !== "Add") btn.textContent = "Add";
          }
        }
        break;
      }

      case "capacitor": {
        const pill =
          controls?.pill ||
          row.querySelector('[data-field="capacitor-data-pill"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="capacitor-action-btn"]');
        const cOwned = state.devices?.capacitors ?? 0;
        const baseBonusPerUnit = (config.devices?.capacitor?.bonusPerUnit ?? 0.5) * 100;
        const deviceMultiplier = engine?.statResolver
          ? engine.statResolver.resolve("devices.globalMultiplier", { state, config })
          : calculateTotalDeviceMultiplier(state, config);
        const capMult = calculateCapacitorMultiplier(cOwned, config, deviceMultiplier);
        const hasPrestigeBonus = deviceMultiplier > 1.0001;
        const effBonusPerUnit = baseBonusPerUnit * deviceMultiplier;
        if (pill) {
          let txt = "";
          if (cOwned > 0) {
            txt = `+${((capMult - 1) * 100).toFixed(hasPrestigeBonus ? 1 : 0)}% Cascade (${formatInteger(cOwned)} owned)`;
          } else {
            txt = `+${(hasPrestigeBonus ? effBonusPerUnit : baseBonusPerUnit).toFixed(hasPrestigeBonus ? 1 : 0)}%/ea (0 owned)`;
          }
          if (pill.textContent !== txt) pill.textContent = txt;
        }
        if (btn) {
          const txt = cost ? `Add (${formatEnergy(cost)})` : "Add";
          if (btn.textContent !== txt) btn.textContent = txt;
          const disabled = !canClick;
          if (btn.disabled !== disabled) btn.disabled = disabled;
        }
        break;
      }

      case "powerCell": {
        const pill =
          controls?.pill ||
          row.querySelector('[data-field="powercell-data-pill"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="powercell-action-btn"]');
        const pCells = state.powerCells ?? 0;
        const cap = calculatePowerCellCapacity(
          pCells,
          state,
          config,
          engine.statResolver,
        );
        if (pill) {
          const txt = `${formatEnergy(cap)} Cap (${formatInteger(pCells)} owned)`;
          if (pill.textContent !== txt) pill.textContent = txt;
        }
        if (btn) {
          const txt = cost ? `Add (${formatEnergy(cost)})` : "Add";
          if (btn.textContent !== txt) btn.textContent = txt;
          const disabled = !canClick;
          if (btn.disabled !== disabled) btn.disabled = disabled;
        }
        break;
      }

      case "hardDisk": {
        const badge =
          controls?.badge ||
          row.querySelector('[data-field="harddisk-status-badge"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="harddisk-action-btn"]');
        const hds = state.devices?.hardDisks?.owned ?? 0;
        const hdState = state.devices?.hardDisks?.state ?? "off";
        const isDataPaused = Boolean(state.devices?.hardDisks?.dataPaused);
        const totalXpRate = calculateHardDiskXpRate(
          hds,
          state,
          config,
          engine.statResolver,
        );
        if (badge) {
          const cls = `badge-status badge-status--${hdState === "active" ? (isDataPaused ? "standby" : "active") : hdState === "standby" ? "standby" : "off"}`;
          if (badge.className !== cls) badge.className = cls;
          let txt = `${hdState.toUpperCase()} (${formatInteger(hds)} owned)`;
          if (isDataPaused && hdState === "active") {
            txt = `PAUSED (DATA LIMIT) (${formatInteger(hds)} owned)`;
          } else if (hdState === "active" && hds > 0) {
            txt = `ACTIVE (${formatInteger(hds)} owned · +${formatNumber(totalXpRate, 1)} Data/s)`;
          }
          if (badge.textContent !== txt) badge.textContent = txt;
        }
        if (btn) {
          const txt = cost ? `Add (${formatEnergy(cost)})` : "Add";
          if (btn.textContent !== txt) btn.textContent = txt;
          const disabled = !canClick;
          if (btn.disabled !== disabled) btn.disabled = disabled;
        }
        break;
      }

      case "backpropagator": {
        const badge =
          controls?.badge ||
          row.querySelector('[data-field="backpropagator-badge"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="backpropagator-action-btn"]');
        const hasDevice = (owned ?? 0) > 0;

        if (hasDevice) {
          if (badge) {
            const cls = "badge-status badge-status--active";
            if (badge.className !== cls) badge.className = cls;
            const mult = calculateBackpropagatorMultiplier(state, config, engine.statResolver);
            const txt = mult.gt(1) ? `${formatNumber(mult, 1)}x` : "Active";
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            if (btn.disabled !== true) btn.disabled = true;
            if (btn.textContent !== "Owned") btn.textContent = "Owned";
            if (btn.className !== "btn-secondary") btn.className = "btn-secondary";
          }
        } else {
          if (badge) {
            const cls = "badge-status badge-status--off";
            if (badge.className !== cls) badge.className = cls;
            const txt = cost ? formatEnergy(cost) : "Locked";
            if (badge.textContent !== txt) badge.textContent = txt;
          }
          if (btn) {
            const disabled = !canClick;
            if (btn.disabled !== disabled) btn.disabled = disabled;
            if (btn.textContent !== "Add") btn.textContent = "Add";
            const btnCls = canClick ? "btn-primary" : "btn-secondary";
            if (btn.className !== btnCls) btn.className = btnCls;
          }
        }
        break;
      }

      case "statisticsDisplay": {
        const badge =
          controls?.badge ||
          row.querySelector('[data-field="statistics-display-badge"]');
        const btn =
          controls?.actionBtn ||
          row.querySelector('[data-field="statistics-display-action-btn"]');
        const isOwned = (state.devices?.statisticsDisplay?.owned ?? 0) >= 1;

        if (isOwned) {
          if (badge) {
            const cls = "badge-status badge-status--active";
            if (badge.className !== cls) badge.className = cls;
            setElText(badge, "Installed");
          }
          if (btn) {
            setElText(btn, "Installed");
            btn.disabled = true;
            if (btn.className !== "btn-secondary") btn.className = "btn-secondary";
          }
        } else {
          if (badge) {
            const cls = "badge-status badge-status--off";
            if (badge.className !== cls) badge.className = cls;
            setElText(badge, cost ? formatEnergy(cost) : formatEnergy(1e-7));
          }
          if (btn) {
            setElText(btn, cost ? `Add (${formatEnergy(cost)})` : "Add");
            btn.disabled = !canClick;
            const btnCls = canClick ? "btn-primary" : "btn-secondary";
            if (btn.className !== btnCls) btn.className = btnCls;
          }
        }
        break;
      }
    }
  }

  function updateActiveDrawerValues(drawerId, state, config, containerEl) {
    switch (drawerId) {
      case "transistor": {
        const hasARecInDom = Boolean(
          containerEl.querySelector('[data-field="drawer-t-arec"]'),
        );
        const isARecUnlocked = Boolean(state.unlocks?.ARec);
        const hasARedInDom = Boolean(
          containerEl.querySelector('[data-field="drawer-t-ared"]'),
        );
        const isARedUnlocked = Boolean(state.unlocks?.ARed);
        if (hasARecInDom !== isARecUnlocked || hasARedInDom !== isARedUnlocked) {
          lastActiveDrawer = null;
          renderDrawersAndModals(state, config);
          return;
        }

        const tTotal = state.devices?.transistorsPurchased ?? 0;
        const nextCost = calculateBulkDeviceCost(
          "transistor",
          tTotal,
          1,
          config,
        );
        const tAImp = state.devices?.transistorAllocations?.AImp ?? 0;
        const tAUpg = state.devices?.transistorAllocations?.AUpg ?? 0;
        const tARec = state.devices?.transistorAllocations?.ARec ?? 0;
        const tARed = state.devices?.transistorAllocations?.ARed ?? 0;
        const speedAImp = calculateEffectiveStudySpeed(
          "AImp",
          state,
          config,
          engine.statResolver,
        );
        const speedAUpg = calculateEffectiveStudySpeed(
          "AUpg",
          state,
          config,
          engine.statResolver,
        );
        const speedARec = calculateEffectiveStudySpeed(
          "ARec",
          state,
          config,
          engine.statResolver,
        );
        const speedARed = calculateEffectiveStudySpeed(
          "ARed",
          state,
          config,
          engine.statResolver,
        );
        const durAImp = calculateEffectiveStudyDuration(
          "AImp",
          state,
          config,
          engine.statResolver,
        );
        const durAUpg = calculateEffectiveStudyDuration(
          "AUpg",
          state,
          config,
          engine.statResolver,
        );
        const durARec = calculateEffectiveStudyDuration(
          "ARec",
          state,
          config,
          engine.statResolver,
        );
        const durARed = calculateEffectiveStudyDuration(
          "ARed",
          state,
          config,
          engine.statResolver,
        );

        setElText(
          containerEl.querySelector('[data-field="drawer-t-total"]'),
          `${formatInteger(tTotal)} Transistors`,
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-t-cost"]'),
          formatEnergy(nextCost),
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-t-aimp"]'),
          formatInteger(tAImp),
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-dur-aimp"]'),
          formatStudyDuration(durAImp),
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-speed-aimp"]'),
          `${speedAImp.toFixed(2)}x`,
        );

        const cost1 = calculateBulkDeviceCost("transistor", tTotal, 1, config);
        const cost10 = calculateBulkDeviceCost(
          "transistor",
          tTotal,
          10,
          config,
        );
        const cost100 = calculateBulkDeviceCost(
          "transistor",
          tTotal,
          100,
          config,
        );
        const cost1000 = calculateBulkDeviceCost(
          "transistor",
          tTotal,
          1000,
          config,
        );

        const btnBuy1 = containerEl.querySelector(
          '[data-field="drawer-buy-t-1"]',
        );
        const btnBuy10 = containerEl.querySelector(
          '[data-field="drawer-buy-t-10"]',
        );
        const btnBuy100 = containerEl.querySelector(
          '[data-field="drawer-buy-t-100"]',
        );
        const btnBuy1000 = containerEl.querySelector(
          '[data-field="drawer-buy-t-1000"]',
        );
        if (btnBuy1)
          btnBuy1.disabled = !state.energy.gte(cost1) && !state.devMode;
        if (btnBuy10)
          btnBuy10.disabled = !state.energy.gte(cost10) && !state.devMode;
        if (btnBuy100)
          btnBuy100.disabled = !state.energy.gte(cost100) && !state.devMode;
        if (btnBuy1000)
          btnBuy1000.disabled = !state.energy.gte(cost1000) && !state.devMode;

        const btnRebalance = containerEl.querySelector(
          '[data-field="drawer-rebalance-btn"]',
        );
        if (btnRebalance) btnRebalance.disabled = tTotal <= 0;

        const btnUpgToImp = containerEl.querySelector(
          '[data-field="drawer-reassign-aupg-aimp"]',
        );
        if (btnUpgToImp) btnUpgToImp.disabled = tAUpg <= 0;
        const btnRecToImp = containerEl.querySelector(
          '[data-field="drawer-reassign-arec-aimp"]',
        );
        if (btnRecToImp) btnRecToImp.disabled = tARec <= 0;

        setElText(
          containerEl.querySelector('[data-field="drawer-t-aupg"]'),
          formatInteger(tAUpg),
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-dur-aupg"]'),
          formatStudyDuration(durAUpg),
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-speed-aupg"]'),
          `${speedAUpg.toFixed(2)}x`,
        );
        const btnImpToUpg = containerEl.querySelector(
          '[data-field="drawer-reassign-aimp-aupg"]',
        );
        if (btnImpToUpg) btnImpToUpg.disabled = tAImp <= 0;
        const btnRecToUpg = containerEl.querySelector(
          '[data-field="drawer-reassign-arec-aupg"]',
        );
        if (btnRecToUpg) btnRecToUpg.disabled = tARec <= 0;

        const rowARec = containerEl.querySelector(
          '[data-field="drawer-row-arec"]',
        );
        if (rowARec) {
          setElText(
            containerEl.querySelector('[data-field="drawer-t-arec"]'),
            formatInteger(tARec),
          );
          setElText(
            containerEl.querySelector('[data-field="drawer-dur-arec"]'),
            formatStudyDuration(durARec),
          );
          setElText(
            containerEl.querySelector('[data-field="drawer-speed-arec"]'),
            `${speedARec.toFixed(2)}x`,
          );
          const btnImpToRec = containerEl.querySelector(
            '[data-field="drawer-reassign-aimp-arec"]',
          );
          if (btnImpToRec) btnImpToRec.disabled = tAImp <= 0;
          const btnUpgToRec = containerEl.querySelector(
            '[data-field="drawer-reassign-aupg-arec"]',
          );
          if (btnUpgToRec) btnUpgToRec.disabled = tAUpg <= 0;
        }

        const btnRedToImp = containerEl.querySelector(
          '[data-field="drawer-reassign-ared-aimp"]',
        );
        if (btnRedToImp) btnRedToImp.disabled = tARed <= 0;
        const btnRedToUpg = containerEl.querySelector(
          '[data-field="drawer-reassign-ared-aupg"]',
        );
        if (btnRedToUpg) btnRedToUpg.disabled = tARed <= 0;
        const btnRedToRec = containerEl.querySelector(
          '[data-field="drawer-reassign-ared-arec"]',
        );
        if (btnRedToRec) btnRedToRec.disabled = tARed <= 0;

        const rowARed = containerEl.querySelector(
          '[data-field="drawer-row-ared"]',
        );
        if (rowARed) {
          setElText(
            containerEl.querySelector('[data-field="drawer-t-ared"]'),
            formatInteger(tARed),
          );
          setElText(
            containerEl.querySelector('[data-field="drawer-dur-ared"]'),
            formatStudyDuration(durARed),
          );
          setElText(
            containerEl.querySelector('[data-field="drawer-speed-ared"]'),
            `${speedARed.toFixed(2)}x`,
          );
          const btnImpToRed = containerEl.querySelector(
            '[data-field="drawer-reassign-aimp-ared"]',
          );
          if (btnImpToRed) btnImpToRed.disabled = tAImp <= 0;
          const btnUpgToRed = containerEl.querySelector(
            '[data-field="drawer-reassign-aupg-ared"]',
          );
          if (btnUpgToRed) btnUpgToRed.disabled = tAUpg <= 0;
          const btnRecToRed = containerEl.querySelector(
            '[data-field="drawer-reassign-arec-ared"]',
          );
          if (btnRecToRed) btnRecToRed.disabled = tARec <= 0;
        }
        break;
      }

      case "microprocessor": {
        const hasARecBtn = Boolean(
          containerEl.querySelector('[data-micro-target-btn="ARec"]'),
        );
        const isARecUnlocked = Boolean(state.unlocks?.ARec);
        const hasARedBtn = Boolean(
          containerEl.querySelector('[data-micro-target-btn="ARed"]'),
        );
        const isARedUnlocked = Boolean(state.unlocks?.ARed);
        if (hasARecBtn !== isARecUnlocked || hasARedBtn !== isARedUnlocked) {
          lastActiveDrawer = null;
          renderDrawersAndModals(state, config);
          return;
        }

        const mTarget = state.devices?.microprocessor?.target ?? "AImp";
        const mOwned = state.devices?.microprocessor?.owned ?? 0;
        const nextCost = calculateBulkDeviceCost(
          "microprocessor",
          mOwned,
          1,
          config,
        );
        const tCount = state.devices?.transistorAllocations?.[mTarget] ?? 0;
        const studySpeedMult = engine?.statResolver
          ? engine.statResolver.resolve("devices.studySpeedMultiplier", { state, config })
          : calculateStudySpeedDeviceMultiplier(state, config);
        const microMult = calculateMicroprocessorStudyMultiplier(
          tCount,
          config,
          studySpeedMult,
          mOwned,
        );
        const currentSpeedMult = calculateEffectiveStudySpeed(
          mTarget,
          state,
          config,
          engine.statResolver,
        );

        const evalResult = engine.evaluateElement("microprocessor", 1);
        setElText(
          containerEl.querySelector('[data-field="drawer-micro-owned"]'),
          mOwned >= 1 ? "1 (Installed)" : "Not Installed",
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-micro-cost"]'),
          formatEnergy(nextCost),
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-micro-t"]'),
          `${tCount} T`,
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-micro-target"]'),
          mTarget,
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-micro-direct-mult"]'),
          `${microMult.toFixed(2)}x`,
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-micro-mult"]'),
          `${currentSpeedMult.toFixed(2)}x`,
        );

        const installBtn = containerEl.querySelector(
          '[data-field="drawer-micro-install-btn"]',
        );
        const reasonsEl = containerEl.querySelector(
          '[data-field="drawer-micro-reasons"]',
        );
        const installContainer = containerEl.querySelector(
          '[data-field="drawer-micro-install-container"]',
        );

        if (mOwned >= 1) {
          if (installContainer && !installContainer.querySelector(".badge-status--active")) {
            installContainer.innerHTML = `<span class="badge-status badge-status--active" style="display: inline-block; padding: 6px 14px; font-weight: 600;">Installed (Unique Device)</span>`;
          }
        } else {
          if (installBtn) {
            installBtn.disabled = !evalResult.canClick;
          }
          if (reasonsEl) {
            if (!evalResult.canClick && evalResult.reasons.length > 0) {
              reasonsEl.style.display = "flex";
              reasonsEl.innerHTML = `<span aria-hidden="true">⚠️</span><span>${evalResult.reasons.join(". ")}</span>`;
            } else {
              reasonsEl.style.display = "none";
            }
          }
        }

        containerEl
          .querySelectorAll("[data-micro-target-btn]")
          .forEach((btn) => {
            const isTarget = btn.dataset.microTargetBtn === mTarget;
            btn.className = isTarget ? "btn-primary" : "btn-secondary";
          });
        break;
      }

      case "overclock": {
        const mTarget = state.devices?.microprocessor?.target ?? "AImp";
        const tCount = state.devices?.transistorAllocations?.[mTarget] ?? 0;
        const dur = calculateOverclockDuration(tCount, config);
        const bonus = calculateOverclockBonusMultiplier(tCount, config);

        setElText(
          containerEl.querySelector('[data-field="modal-overclock-target"]'),
          mTarget,
        );
        setElText(
          containerEl.querySelector('[data-field="modal-overclock-burn"]'),
          `${tCount} T`,
        );
        setElText(
          containerEl.querySelector('[data-field="modal-overclock-dur"]'),
          `${dur.toFixed(1)}s`,
        );
        setElText(
          containerEl.querySelector('[data-field="modal-overclock-bonus"]'),
          `${bonus.toFixed(2)}x`,
        );
        break;
      }

      case "harddisk": {
        const hds = state.devices?.hardDisks?.owned ?? 0;
        const hdState = state.devices?.hardDisks?.state ?? "off";
        const buf = state.devices?.hardDisks?.buffer ?? 0;
        const isDataPaused = Boolean(state.devices?.hardDisks?.dataPaused);
        const rate =
          hdState === "active" && !isDataPaused
            ? calculateHardDiskXpRate(hds, state, config, engine.statResolver)
            : 0;
        const drain =
          hdState === "active" && !isDataPaused
            ? calculateHardDiskEnergyDrain(
                hds,
                state.devices?.hardDisks?.activeSeconds ?? 0,
                config,
              )
            : big(0);

        setElText(
          containerEl.querySelector('[data-field="drawer-hd-buf"]'),
          `${formatInteger(buf)} Data`,
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-hd-rate"]'),
          `${formatNumber(rate, 1)} Data/s`,
        );
        setElText(
          containerEl.querySelector('[data-field="drawer-hd-drain"]'),
          drain.gt(0) ? `-${formatEnergy(drain)}/s` : "0.00 J/s",
        );

        const btnActive = containerEl.querySelector('[data-hd-btn="active"]');
        const btnStandby = containerEl.querySelector('[data-hd-btn="standby"]');
        const btnOff = containerEl.querySelector('[data-hd-btn="off"]');
        if (btnActive)
          btnActive.className =
            hdState === "active" ? "btn-primary" : "btn-secondary";
        if (btnStandby)
          btnStandby.className =
            hdState === "standby" ? "btn-primary" : "btn-secondary";
        if (btnOff)
          btnOff.className = hdState === "off" ? "btn-danger" : "btn-secondary";
        break;
      }

      case "dev": {
        const btnDev = containerEl.querySelector(
          '[data-action="toggle-dev-mode"]',
        );
        if (btnDev) {
          const cls = `btn-secondary ${state.devMode ? "btn-utility--active" : ""}`;
          if (btnDev.className !== cls) btnDev.className = cls;
          setElText(btnDev, state.devMode ? "DEV MODE: ON" : "DEV MODE: OFF");
        }
        const btnRestore = containerEl.querySelector(
          '[data-action="restore-quicksave"]',
        );
        if (btnRestore) {
          btnRestore.disabled = engine.hasQuicksave && !engine.hasQuicksave();
        }
        setElText(
          containerEl.querySelector('[data-field="dev-audit-count"]'),
          `AUDIT LOG (${state.auditLogs?.length ?? 0})`,
        );
        const tbody = containerEl.querySelector(
          '[data-field="dev-audit-tbody"]',
        );
        if (tbody) {
          const curLen = parseInt(tbody.dataset.logCount || "0", 10);
          const newLen = state.auditLogs?.length ?? 0;
          if (curLen !== newLen) {
            tbody.dataset.logCount = String(newLen);
            tbody.innerHTML =
              (state.auditLogs ?? [])
                .slice(-10)
                .reverse()
                .map(
                  (l) => `
              <tr>
                <td>${l.timestamp?.split("T")[1]?.split(".")[0] ?? ""}</td>
                <td><strong>${l.itemName}</strong></td>
                <td>${l.purchasedQuantity}</td>
                <td>${l.nominalCostFormatted}</td>
                <td><span class="badge-status ${l.ruleStatus === "RULE_ELIGIBLE" ? "badge-status--active" : "badge-status--standby"}">${l.ruleStatus}</span></td>
              </tr>
            `,
                )
                .join("") ||
              '<tr><td colspan="5" style="text-align:center;">No logs recorded</td></tr>';
          }
        }
        break;
      }

      case "stats": {
        const totalEnergyProducedEra = state.stats?.totalEnergyProducedEra ?? state.stats?.totalEnergyProduced ?? 0;
        setElText(
          containerEl.querySelector('[data-field="stat-era-energy"]'),
          formatEnergy(totalEnergyProducedEra),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-equivalence"]'),
          getEnergyEquivalenceText(totalEnergyProducedEra),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-total-playtime"]'),
          formatDuration(state.stats?.gameTime ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-era-time"]'),
          formatDuration(state.stats?.timeInCurrentEra ?? state.stats?.gameTime ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-so-time"]'),
          formatDuration(state.stats?.timeSinceLastSO ?? state.stats?.gameTime ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-comp-level"]'),
          state.stats?.highestComputerLevel ?? state.computerLevel ?? 1,
        );
        setElText(
          containerEl.querySelector('[data-field="stat-mls"]'),
          formatInteger(state.stats?.totalMachineLearnings ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-fos"]'),
          formatInteger(state.facilityOptimizations ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-purchases"]'),
          formatInteger(state.stats?.totalPurchases ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-energy"]'),
          formatEnergy(state.stats?.highestStoredEnergy ?? state.energy ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-studies-aimp"]'),
          formatInteger(state.stats?.studiesCompleted?.AImp ?? state.algorithms?.AImp?.produced ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-studies-aupg"]'),
          formatInteger(state.stats?.studiesCompleted?.AUpg ?? state.algorithms?.AUpg?.produced ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-studies-arec"]'),
          formatInteger(state.stats?.studiesCompleted?.ARec ?? state.algorithms?.ARec?.produced ?? 0),
        );
        setElText(
          containerEl.querySelector('[data-field="stat-studies-ared"]'),
          formatInteger(state.stats?.studiesCompleted?.ARed ?? state.algorithms?.ARed?.produced ?? 0),
        );
        break;
      }

      case "measure": {
        const compLevel = state.computerLevel ?? 1;
        const ap = calculateAlgorithmPerformance(
          state,
          config,
          engine.statResolver,
        );
        const hasGadget = (state.devices?.crcGadget?.owned ?? 0) > 0;
        const totalProd = calculateEnergyProduction(
          state,
          config,
          engine.statResolver,
        );

        setElText(
          containerEl.querySelector('[data-field="measure-ap"]'),
          `${formatEnergy(ap)}/s`,
        );
        setElText(
          containerEl.querySelector('[data-field="measure-level-mult"]'),
          `Level ${compLevel}`,
        );
        setElText(
          containerEl.querySelector('[data-field="measure-gadget-mult"]'),
          hasGadget ? "2.00x" : "1.00x",
        );
        setElText(
          containerEl.querySelector('[data-field="measure-total-prod"]'),
          formatRate(totalProd),
        );
        break;
      }
    }
  }

  function renderDrawersAndModals(state, config) {
    const containerEl =
      dom?.drawersContainer ||
      container.querySelector("#tes-drawers-container");
    if (!containerEl) return;

    if (!activeDrawer) {
      if (lastActiveDrawer !== null) {
        containerEl.innerHTML = "";
        lastActiveDrawer = null;
      }
      return;
    }

    if (activeDrawer === lastActiveDrawer) {
      updateActiveDrawerValues(activeDrawer, state, config, containerEl);
      return;
    }
    lastActiveDrawer = activeDrawer;

    switch (activeDrawer) {
      // 1. Transistor Allocation Drawer (Section 7.6)
      case "transistor": {
        const tTotal = state.devices?.transistorsPurchased ?? 0;
        const nextCost = calculateBulkDeviceCost(
          "transistor",
          tTotal,
          1,
          config,
        );
        const tAImp = state.devices?.transistorAllocations?.AImp ?? 0;
        const tAUpg = state.devices?.transistorAllocations?.AUpg ?? 0;
        const tARec = state.devices?.transistorAllocations?.ARec ?? 0;
        const tARed = state.devices?.transistorAllocations?.ARed ?? 0;
        const speedAImp = calculateEffectiveStudySpeed(
          "AImp",
          state,
          config,
          engine.statResolver,
        );
        const speedAUpg = calculateEffectiveStudySpeed(
          "AUpg",
          state,
          config,
          engine.statResolver,
        );
        const speedARec = calculateEffectiveStudySpeed(
          "ARec",
          state,
          config,
          engine.statResolver,
        );
        const speedARed = calculateEffectiveStudySpeed(
          "ARed",
          state,
          config,
          engine.statResolver,
        );
        const durAImp = calculateEffectiveStudyDuration(
          "AImp",
          state,
          config,
          engine.statResolver,
        );
        const durAUpg = calculateEffectiveStudyDuration(
          "AUpg",
          state,
          config,
          engine.statResolver,
        );
        const durARec = calculateEffectiveStudyDuration(
          "ARec",
          state,
          config,
          engine.statResolver,
        );
        const durARed = calculateEffectiveStudyDuration(
          "ARed",
          state,
          config,
          engine.statResolver,
        );

        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <aside class="tes-drawer">
              <div class="tes-modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img src="${tesIconPath("transistor-board")}" alt="" style="width: 24px; height: 24px;" />
                  <h3 class="tes-modal-title">Transistor Fleet Management</h3>
                </div>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close drawer">&times;</button>
              </div>

              <div>
                <p class="muted" style="margin-bottom: 12px;">
                  Each allocated Transistor provides <strong>+2.5% Study Speed</strong> to its target algorithm.
                  Purchasing increments a shared global geometric price.
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                  <div>
                    <span class="eyebrow">TOTAL PURCHASED</span>
                    <div data-field="drawer-t-total" style="font-size: 18px; font-weight: 700; color: var(--tes-cyan);">${formatInteger(tTotal)} Transistors</div>
                  </div>
                  <div>
                    <span class="eyebrow">NEXT COST</span>
                    <div data-field="drawer-t-cost" style="font-size: 15px; font-weight: 700; color: var(--tes-text);">${formatEnergy(nextCost)}</div>
                  </div>
                </div>

                <!-- Purchase Buttons -->
                <div style="display: flex; gap: 6px; margin-bottom: 18px;">
                  <button class="btn-primary" data-field="drawer-buy-t-1" data-action="buy-element" data-element-id="transistor" data-count="1">+1 Transistor</button>
                  <button class="btn-secondary" data-field="drawer-buy-t-10" data-action="buy-element" data-element-id="transistor" data-count="10">+10</button>
                  <button class="btn-secondary" data-field="drawer-buy-t-100" data-action="buy-element" data-element-id="transistor" data-count="100">+100</button>
                  <button class="btn-secondary" data-field="drawer-buy-t-1000" data-action="buy-element" data-element-id="transistor" data-count="1000">+1000</button>
                </div>

                <div class="tes-section-header" style="display: flex; justify-content: space-between; align-items: center;">
                  <span class="tes-section-title">ALLOCATION DISTRIBUTION</span>
                  <button class="btn-secondary" style="font-size: 11px; padding: 4px 10px;" data-action="rebalance-transistors" data-field="drawer-rebalance-btn">Distribute Evenly</button>
                </div>

                <table class="tes-table">
                  <thead>
                    <tr>
                      <th>Algorithm</th>
                      <th>Allocated</th>
                      <th>Duration</th>
                      <th>Speed</th>
                      <th>Reassign</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>A.Improvement</strong></td>
                      <td data-field="drawer-t-aimp" style="color: var(--tes-cyan); font-weight: 600;">${formatInteger(tAImp)}</td>
                      <td data-field="drawer-dur-aimp">${formatStudyDuration(durAImp)}</td>
                      <td data-field="drawer-speed-aimp">${speedAImp.toFixed(2)}x</td>
                      <td>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                          <button data-field="drawer-reassign-aupg-aimp" class="btn-secondary" data-action="reassign-transistor" data-from="AUpg" data-to="AImp" data-count="1" ${tAUpg <= 0 ? "disabled" : ""}>+1 from AUpg</button>
                          ${state.unlocks?.ARec ? `<button data-field="drawer-reassign-arec-aimp" class="btn-secondary" data-action="reassign-transistor" data-from="ARec" data-to="AImp" data-count="1" ${tARec <= 0 ? "disabled" : ""}>+1 from ARec</button>` : ""}
                          ${state.unlocks?.ARed ? `<button data-field="drawer-reassign-ared-aimp" class="btn-secondary" data-action="reassign-transistor" data-from="ARed" data-to="AImp" data-count="1" ${tARed <= 0 ? "disabled" : ""}>+1 from ARed</button>` : ""}
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>A.Upgrade</strong></td>
                      <td data-field="drawer-t-aupg" style="color: var(--tes-cyan); font-weight: 600;">${formatInteger(tAUpg)}</td>
                      <td data-field="drawer-dur-aupg">${formatStudyDuration(durAUpg)}</td>
                      <td data-field="drawer-speed-aupg">${speedAUpg.toFixed(2)}x</td>
                      <td>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                          <button data-field="drawer-reassign-aimp-aupg" class="btn-secondary" data-action="reassign-transistor" data-from="AImp" data-to="AUpg" data-count="1" ${tAImp <= 0 ? "disabled" : ""}>+1 from AImp</button>
                          ${state.unlocks?.ARec ? `<button data-field="drawer-reassign-arec-aupg" class="btn-secondary" data-action="reassign-transistor" data-from="ARec" data-to="AUpg" data-count="1" ${tARec <= 0 ? "disabled" : ""}>+1 from ARec</button>` : ""}
                          ${state.unlocks?.ARed ? `<button data-field="drawer-reassign-ared-aupg" class="btn-secondary" data-action="reassign-transistor" data-from="ARed" data-to="AUpg" data-count="1" ${tARed <= 0 ? "disabled" : ""}>+1 from ARed</button>` : ""}
                        </div>
                      </td>
                    </tr>
                    ${
                      state.unlocks?.ARec
                        ? `
                    <tr data-field="drawer-row-arec">
                      <td><strong>A.Recalculation</strong></td>
                      <td data-field="drawer-t-arec" style="color: var(--tes-cyan); font-weight: 600;">${formatInteger(tARec)}</td>
                      <td data-field="drawer-dur-arec">${formatStudyDuration(durARec)}</td>
                      <td data-field="drawer-speed-arec">${speedARec.toFixed(2)}x</td>
                      <td>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                          <button data-field="drawer-reassign-aimp-arec" class="btn-secondary" data-action="reassign-transistor" data-from="AImp" data-to="ARec" data-count="1" ${tAImp <= 0 ? "disabled" : ""}>+1 from AImp</button>
                          <button data-field="drawer-reassign-aupg-arec" class="btn-secondary" data-action="reassign-transistor" data-from="AUpg" data-to="ARec" data-count="1" ${tAUpg <= 0 ? "disabled" : ""}>+1 from AUpg</button>
                          ${state.unlocks?.ARed ? `<button data-field="drawer-reassign-ared-arec" class="btn-secondary" data-action="reassign-transistor" data-from="ARed" data-to="ARec" data-count="1" ${tARed <= 0 ? "disabled" : ""}>+1 from ARed</button>` : ""}
                        </div>
                      </td>
                    </tr>
                    `
                        : ""
                    }
                    ${
                      state.unlocks?.ARed
                        ? `
                    <tr data-field="drawer-row-ared">
                      <td><strong>A.Redesign</strong></td>
                      <td data-field="drawer-t-ared" style="color: var(--tes-cyan); font-weight: 600;">${formatInteger(tARed)}</td>
                      <td data-field="drawer-dur-ared">${formatStudyDuration(durARed)}</td>
                      <td data-field="drawer-speed-ared">${speedARed.toFixed(2)}x</td>
                      <td>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                          <button data-field="drawer-reassign-aimp-ared" class="btn-secondary" data-action="reassign-transistor" data-from="AImp" data-to="ARed" data-count="1" ${tAImp <= 0 ? "disabled" : ""}>+1 from AImp</button>
                          <button data-field="drawer-reassign-aupg-ared" class="btn-secondary" data-action="reassign-transistor" data-from="AUpg" data-to="ARed" data-count="1" ${tAUpg <= 0 ? "disabled" : ""}>+1 from AUpg</button>
                          <button data-field="drawer-reassign-arec-ared" class="btn-secondary" data-action="reassign-transistor" data-from="ARec" data-to="ARed" data-count="1" ${tARec <= 0 ? "disabled" : ""}>+1 from ARec</button>
                        </div>
                      </td>
                    </tr>
                    `
                        : ""
                    }
                  </tbody>
                </table>
              </div>
            </aside>
          </div>
        `;
        break;
      }

      // 2. Microprocessor Configuration Drawer (Section 7.7)
      case "microprocessor": {
        const mTarget = state.devices?.microprocessor?.target ?? "AImp";
        const mOwned = state.devices?.microprocessor?.owned ?? 0;
        const evalResult = engine.evaluateElement("microprocessor", 1);
        const nextCost = evalResult.cost ?? calculateBulkDeviceCost(
          "microprocessor",
          mOwned,
          1,
          config,
        );
        const tCount = state.devices?.transistorAllocations?.[mTarget] ?? 0;
        const currentSpeedMult = calculateEffectiveStudySpeed(
          mTarget,
          state,
          config,
          engine.statResolver,
        );
        const studySpeedMult = engine?.statResolver
          ? engine.statResolver.resolve("devices.studySpeedMultiplier", { state, config })
          : calculateStudySpeedDeviceMultiplier(state, config);
        const microMult = calculateMicroprocessorStudyMultiplier(
          tCount,
          config,
          studySpeedMult,
          mOwned,
        );

        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <aside class="tes-drawer">
              <div class="tes-modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img src="${tesIconPath("microprocessor")}" alt="" style="width: 24px; height: 24px;" />
                  <h3 class="tes-modal-title">Microprocessor Configuration</h3>
                </div>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close drawer">&times;</button>
              </div>

              <div>
                <p class="muted" style="margin-bottom: 14px;">
                  Amplifies study speed on the selected algorithm based on allocated Transistors.
                </p>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <div>
                    <span class="eyebrow">INSTALLATION</span>
                    <div data-field="drawer-micro-owned" style="font-size: 16px; font-weight: 700; color: var(--tes-cyan);">${mOwned >= 1 ? "1 (Installed)" : "Not Installed"}</div>
                  </div>
                  <div>
                    <span class="eyebrow">UNIT COST</span>
                    <div data-field="drawer-micro-cost" style="font-size: 15px; font-weight: 700; color: var(--tes-text);">${formatEnergy(nextCost)}</div>
                  </div>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title">TARGET ALGORITHM</span>
                  <div class="tes-section-line"></div>
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                  <button data-micro-target-btn="AImp" class="${mTarget === "AImp" ? "btn-primary" : "btn-secondary"}" data-action="set-micro-target" data-target="AImp">Target A.Imp</button>
                  <button data-micro-target-btn="AUpg" class="${mTarget === "AUpg" ? "btn-primary" : "btn-secondary"}" data-action="set-micro-target" data-target="AUpg">Target A.Upg</button>
                  ${state.unlocks?.ARec ? `<button data-micro-target-btn="ARec" class="${mTarget === "ARec" ? "btn-primary" : "btn-secondary"}" data-action="set-micro-target" data-target="ARec">Target A.Rec</button>` : ""}
                  ${state.unlocks?.ARed ? `<button data-micro-target-btn="ARed" class="${mTarget === "ARed" ? "btn-primary" : "btn-secondary"}" data-action="set-micro-target" data-target="ARed">Target A.Red</button>` : ""}
                </div>

                <div class="tes-stored-energy-card" style="max-width: 100%; padding: 14px 18px; margin-bottom: 16px;">
                  <span class="eyebrow">ACTIVE EFFECT PREVIEW</span>
                  <div style="font-size: 13.5px; margin-top: 6px; line-height: 1.5;">
                    Allocated Transistors: <strong data-field="drawer-micro-t">${tCount} T</strong> on <span data-field="drawer-micro-target">${mTarget}</span><br />
                    Microprocessor Boost: <strong data-field="drawer-micro-direct-mult" style="color: var(--tes-teal);">${microMult.toFixed(2)}x</strong>${studySpeedMult > 1.0001 ? ` <span style="font-size: 11px; color: var(--tes-text-tertiary);">(${studySpeedMult.toFixed(2)}x prestige bonus)</span>` : ""}<br />
                    Effective Target Speed: <strong data-field="drawer-micro-mult" style="color: var(--tes-cyan);">${currentSpeedMult.toFixed(2)}x</strong>
                  </div>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title">INSTALLATION STATUS</span>
                  <div class="tes-section-line"></div>
                </div>

                <div data-field="drawer-micro-install-container">
                  ${mOwned >= 1
                    ? `<span class="badge-status badge-status--active" style="display: inline-block; padding: 6px 14px; font-weight: 600;">Installed (Unique Device)</span>`
                    : `
                      <button class="btn-primary" data-field="drawer-micro-install-btn" data-action="buy-element" data-element-id="microprocessor" data-count="1" ${!evalResult.canClick ? "disabled" : ""}>
                        Install Microprocessor (${formatEnergy(nextCost)})
                      </button>
                      ${!evalResult.canClick && evalResult.reasons.length > 0 ? `
                        <div data-field="drawer-micro-reasons" class="tes-warning-banner" style="margin-top: 8px; font-size: 13px; color: var(--tes-amber); display: flex; align-items: center; gap: 6px;">
                          <span aria-hidden="true">⚠️</span>
                          <span>${evalResult.reasons.join(". ")}</span>
                        </div>
                      ` : `<div data-field="drawer-micro-reasons" style="display:none;"></div>`}
                    `
                  }
                </div>
              </div>
            </aside>
          </div>
        `;
        break;
      }

      // 3. Overclock Modal (Section 7.9)
      case "overclock": {
        const mTarget = state.devices?.microprocessor?.target ?? "AImp";
        const tCount = state.devices?.transistorAllocations?.[mTarget] ?? 0;
        const dur = calculateOverclockDuration(tCount, config);
        const bonus = calculateOverclockBonusMultiplier(tCount, config);

        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <div class="tes-modal">
              <div class="tes-modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img src="${tesIconPath("overclocker")}" alt="" style="width: 24px; height: 24px;" />
                  <h3 class="tes-modal-title" style="color: var(--tes-danger);">Activate Overclocker</h3>
                </div>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close modal">&times;</button>
              </div>

              <div>
                <p style="margin-bottom: 14px;">
                  <strong style="color: var(--tes-danger);">Warning:</strong> This operation will permanently <strong>burn all ${formatInteger(tCount)} Transistors</strong> allocated to <strong>${mTarget}</strong> to supercharge Microprocessor performance temporarily!
                </p>

                <div style="background: rgba(255,105,139,0.1); border: 1px solid rgba(255,105,139,0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                  <div>Target Algorithm: <strong data-field="modal-overclock-target">${mTarget}</strong></div>
                  <div>Transistors to Burn: <strong data-field="modal-overclock-burn" style="color: var(--tes-danger);">${formatInteger(tCount)} T</strong></div>
                  <div>Active Boost Duration: <strong data-field="modal-overclock-dur">${dur.toFixed(1)}s</strong></div>
                  <div>Microprocessor Bonus: <strong data-field="modal-overclock-bonus" style="color: var(--tes-teal);">${bonus.toFixed(2)}x</strong></div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 8px;">
                  <button class="btn-secondary" data-action="close-drawer">Cancel</button>
                  <button class="btn-danger" data-action="activate-overclock">Burn Transistors & Overclock</button>
                </div>
              </div>
            </div>
          </div>
        `;
        break;
      }

      // 4. Hard Disk Drawer (Section 7.13)
      case "harddisk": {
        const hds = state.devices?.hardDisks?.owned ?? 0;
        const hdState = state.devices?.hardDisks?.state ?? "off";
        const buf = state.devices?.hardDisks?.buffer ?? 0;
        const isDataPaused = Boolean(state.devices?.hardDisks?.dataPaused);
        const rate =
          hdState === "active" && !isDataPaused
            ? calculateHardDiskXpRate(hds, state, config, engine.statResolver)
            : 0;
        const drain =
          hdState === "active" && !isDataPaused
            ? calculateHardDiskEnergyDrain(
                hds,
                state.devices?.hardDisks?.activeSeconds ?? 0,
                config,
              )
            : big(0);

        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <aside class="tes-drawer">
              <div class="tes-modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img src="${tesIconPath("hard-disk")}" alt="" style="width: 24px; height: 24px;" />
                  <h3 class="tes-modal-title">Hard Disk Buffer Management</h3>
                </div>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close drawer">&times;</button>
              </div>

              <div>
                <p class="muted" style="margin-bottom: 14px;">
                  Hard Disks continuously generate Available Data (XP) by consuming Stored Energy. Energy drain grows with uptime.
                </p>

                <div class="tes-stored-energy-card" style="max-width: 100%; padding: 14px 18px; margin-bottom: 16px;">
                  <div>Accumulated Buffer: <strong data-field="drawer-hd-buf" style="color: var(--tes-purple-light); font-size: 16px;">${formatInteger(buf)} Data</strong></div>
                  <div>Data Generation Rate: <strong data-field="drawer-hd-rate" style="color: var(--tes-teal);">${formatNumber(rate, 1)} Data/s</strong></div>
                  <div>Energy Drain: <strong data-field="drawer-hd-drain" style="color: var(--tes-danger);">${drain.gt(0) ? `-${formatEnergy(drain)}/s` : "0.00 J/s"}</strong></div>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title">OPERATIONAL STATE</span>
                  <div class="tes-section-line"></div>
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                  <button data-hd-btn="active" class="${hdState === "active" ? "btn-primary" : "btn-secondary"}" data-action="set-harddisk-state" data-state="active">Active (On)</button>
                  <button data-hd-btn="standby" class="${hdState === "standby" ? "btn-primary" : "btn-secondary"}" data-action="set-harddisk-state" data-state="standby">Standby</button>
                  <button data-hd-btn="off" class="${hdState === "off" ? "btn-danger" : "btn-secondary"}" data-action="set-harddisk-state" data-state="off">Turn Off (Wipes Buffer)</button>
                </div>
              </div>
            </aside>
          </div>
        `;
        break;
      }

      // 5. Developer Tools Drawer (Section 8.5)
      case "dev": {
        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <aside class="tes-drawer" style="width: min(600px, 95vw);">
              <div class="tes-modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img src="${tesIconPath("icon-settings")}" alt="" style="width: 24px; height: 24px;" />
                  <h3 class="tes-modal-title">Developer Mode & Cheats</h3>
                </div>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close drawer">&times;</button>
              </div>

              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                  <span>Dev Mode (Force Active):</span>
                  <button class="btn-secondary ${state.devMode ? "btn-utility--active" : ""}" data-action="toggle-dev-mode">
                    ${state.devMode ? "DEV MODE: ON" : "DEV MODE: OFF"}
                  </button>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title">ENERGY INJECTION</span>
                  <div class="tes-section-line"></div>
                </div>
                <div class="tes-cheats-grid" style="margin-bottom: 14px;">
                  <button class="btn-secondary" data-action="add-energy" data-amount="1e-9">+1 nJ</button>
                  <button class="btn-secondary" data-action="add-energy" data-amount="1e-6">+1 µJ</button>
                  <button class="btn-secondary" data-action="add-energy" data-amount="1e-3">+1 mJ</button>
                  <button class="btn-secondary" data-action="add-energy" data-amount="1">+1 J</button>
                  <button class="btn-danger" data-action="zero-energy">Zero J</button>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title">ALGORITHMS & LEVEL</span>
                  <div class="tes-section-line"></div>
                </div>
                <div class="tes-cheats-grid" style="margin-bottom: 14px;">
                  <button class="btn-secondary" data-action="add-afeature" data-target="AImp" data-count="12">+12 AImp</button>
                  <button class="btn-secondary" data-action="add-afeature" data-target="AUpg" data-count="12">+12 AUpg</button>
                  <button class="btn-secondary" data-action="add-afeature" data-target="ARec" data-count="12">+12 ARec</button>
                  <button class="btn-secondary" data-action="add-comp-level">+1 Level</button>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title">SIMULATION SPEED</span>
                  <div class="tes-section-line"></div>
                </div>
                <div style="display: flex; gap: 8px; margin-bottom: 14px;">
                  <button class="btn-secondary" data-action="set-speed" data-speed="1">1x</button>
                  <button class="btn-secondary" data-action="set-speed" data-speed="5">5x</button>
                  <button class="btn-secondary" data-action="set-speed" data-speed="20">20x</button>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title">STATE MILESTONES</span>
                  <div class="tes-section-line"></div>
                </div>
                <div style="display: flex; gap: 8px; margin-bottom: 18px;">
                  <button class="btn-primary" data-action="quicksave">Quicksave</button>
                  <button class="btn-secondary" data-action="restore-quicksave" ${engine.hasQuicksave && !engine.hasQuicksave() ? "disabled" : ""}>Restore Quicksave</button>
                  <button class="btn-danger" data-action="reset-all">Reset All</button>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title">NARRATIVE MILESTONE PREVIEWS</span>
                  <div class="tes-section-line"></div>
                </div>
                <div class="tes-cheats-grid" style="margin-bottom: 18px;">
                  <button class="btn-secondary" data-action="preview-narrative" data-milestone="intro">Preview Intro</button>
                  <button class="btn-secondary" data-action="preview-narrative" data-milestone="so1">Preview SO1</button>
                  <button class="btn-secondary" data-action="preview-narrative" data-milestone="so2">Preview SO2</button>
                  <button class="btn-secondary" data-action="preview-narrative" data-milestone="energy100e9">Preview 100e9 J</button>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title" data-field="dev-audit-count">AUDIT LOG (${state.auditLogs?.length ?? 0})</span>
                  <div class="tes-section-line"></div>
                </div>
                <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                  <button class="btn-secondary" data-action="export-csv">Export CSV</button>
                  <button class="btn-secondary" data-action="export-json">Export JSON</button>
                  <button class="btn-secondary" data-action="clear-audit">Clear</button>
                </div>

                <div style="max-height: 180px; overflow-y: auto; border: 1px solid var(--tes-border); border-radius: 6px;">
                  <table class="tes-table" style="font-size: 11px;">
                    <thead>
                      <tr><th>Time</th><th>Item</th><th>Qty</th><th>Cost</th><th>Status</th></tr>
                    </thead>
                    <tbody data-field="dev-audit-tbody" data-log-count="${state.auditLogs?.length ?? 0}">
                      ${
                        (state.auditLogs ?? [])
                          .slice(-10)
                          .reverse()
                          .map(
                            (l) => `
                        <tr>
                          <td>${l.timestamp?.split("T")[1]?.split(".")[0] ?? ""}</td>
                          <td><strong>${l.itemName}</strong></td>
                          <td>${l.purchasedQuantity}</td>
                          <td>${l.nominalCostFormatted}</td>
                          <td><span class="badge-status ${l.ruleStatus === "RULE_ELIGIBLE" ? "badge-status--active" : "badge-status--standby"}">${l.ruleStatus}</span></td>
                        </tr>
                      `,
                          )
                          .join("") ||
                        '<tr><td colspan="5" style="text-align:center;">No logs recorded</td></tr>'
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </aside>
          </div>
        `;
        break;
      }

      // 6. Settings Modal
      case "settings": {
        const curNotation = state.settings?.notation || "engineering";
        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <div class="tes-modal" style="max-width: 520px; width: 100%;">
              <div class="tes-modal-header">
                <h3 class="tes-modal-title">System Settings</h3>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close modal">&times;</button>
              </div>
              <div style="display: flex; flex-direction: column; gap: 16px;">
                <p class="muted" style="margin: 0; font-size: 13px;">Configure simulation visual formatting, notation, and data storage.</p>

                <!-- Number Notation Setting -->
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  <span style="font-size: 13px; font-weight: 600; color: var(--tes-text); text-transform: uppercase; letter-spacing: 0.5px;">Notação de Engenharia</span>
                  <div style="display: flex; flex-direction: column; gap: 8px;" role="radiogroup" aria-label="Notação de Engenharia">
                    
                    <label class="tes-setting-option" style="display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s ease; background: ${curNotation === 'engineering' ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)'}; border: 1px solid ${curNotation === 'engineering' ? 'var(--tes-cyan)' : 'var(--tes-border)'};">
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="radio" name="tes-notation" value="engineering" data-action="set-notation" ${curNotation === 'engineering' ? 'checked' : ''} style="cursor: pointer; accent-color: var(--tes-cyan);" />
                        <span style="font-size: 14px; font-weight: 600; color: ${curNotation === 'engineering' ? 'var(--tes-cyan)' : 'var(--tes-text)'};">Engenharia (m, u, n, p, K, M, G, T)</span>
                      </div>
                      <div style="font-size: 11px; color: var(--tes-text-dim); padding-left: 24px;">Exemplo: 30.00 pJ · 4.00 nJ · 1.50 J · 2.50 KJ · 10.00 MJ</div>
                    </label>

                    <label class="tes-setting-option" style="display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s ease; background: ${curNotation === 'engineering_num' ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)'}; border: 1px solid ${curNotation === 'engineering_num' ? 'var(--tes-cyan)' : 'var(--tes-border)'};">
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="radio" name="tes-notation" value="engineering_num" data-action="set-notation" ${curNotation === 'engineering_num' ? 'checked' : ''} style="cursor: pointer; accent-color: var(--tes-cyan);" />
                        <span style="font-size: 14px; font-weight: 600; color: ${curNotation === 'engineering_num' ? 'var(--tes-cyan)' : 'var(--tes-text)'};">Engenharia Num (-3, -6, -9, ...)</span>
                      </div>
                      <div style="font-size: 11px; color: var(--tes-text-dim); padding-left: 24px;">Exemplo: 30.00e-12 J · 4.00e-9 J · 1.50 J · 2.50e3 J · 10.00e6 J</div>
                    </label>

                    <label class="tes-setting-option" style="display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s ease; background: ${curNotation === 'alpha' ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)'}; border: 1px solid ${curNotation === 'alpha' ? 'var(--tes-cyan)' : 'var(--tes-border)'};">
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="radio" name="tes-notation" value="alpha" data-action="set-notation" ${curNotation === 'alpha' ? 'checked' : ''} style="cursor: pointer; accent-color: var(--tes-cyan);" />
                        <span style="font-size: 14px; font-weight: 600; color: ${curNotation === 'alpha' ? 'var(--tes-cyan)' : 'var(--tes-text)'};">Alpha (c, b, a, A, B, C)</span>
                      </div>
                      <div style="font-size: 11px; color: var(--tes-text-dim); padding-left: 24px;">Exemplo: 30.00 dJ · 4.00 cJ · 1.50 J · 2.50 AJ · 10.00 BJ</div>
                    </label>

                  </div>
                </div>

                <div class="tes-rail-divider"></div>

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                  <span class="muted">Autosave Frequency:</span>
                  <span style="font-weight: 600; color: var(--tes-cyan);">5.0 seconds</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                  <span class="muted">Theme:</span>
                  <span style="font-weight: 600; color: var(--tes-purple-light);">Dark Minimal Sci-Fi</span>
                </div>

                <div class="tes-rail-divider"></div>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <button class="btn-danger" data-action="reset-all" style="font-size: 12px; padding: 6px 12px;">Wipe Simulation Progress</button>
                  <button class="btn-primary" data-action="close-drawer">Done</button>
                </div>
              </div>
            </div>
          </div>
        `;
        break;
      }

      // 7. Statistics Modal (Revamped Instrumentation)
      case "stats": {
        const totalEnergyProducedEra = state.stats?.totalEnergyProducedEra ?? state.stats?.totalEnergyProduced ?? 0;
        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <div class="tes-modal" style="width: min(640px, 95vw); max-height: 85vh; overflow-y: auto;">
              <div class="tes-modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img src="${tesIconPath("icon-statistics")}" alt="" style="width: 22px; height: 22px;" />
                  <h3 class="tes-modal-title">Facility Instrumentation & Records</h3>
                </div>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close modal">&times;</button>
              </div>

              <!-- SECTION: CORE STATISTICS -->
              <div class="tes-stats-section" style="margin-bottom: 16px;">
                <div class="tes-section-header">
                  <span class="tes-section-title">CORE ENERGY ERA METRICS</span>
                  <div class="tes-section-line"></div>
                </div>

                <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 14px; margin-bottom: 12px;">
                  <span class="eyebrow" style="color: var(--tes-cyan);">TOTAL ENERGY PRODUCED — CURRENT ENERGY ERA</span>
                  <div style="font-size: 20px; font-weight: 700; color: #fff; margin: 4px 0 8px 0;" data-field="stat-era-energy">
                    ${formatEnergy(totalEnergyProducedEra)}
                  </div>
                  <div style="font-size: 13px; font-style: italic; color: #94a3b8; line-height: 1.45;" data-field="stat-equivalence">
                    ${getEnergyEquivalenceText(totalEnergyProducedEra)}
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                  <div class="tes-stat-box">
                    <span class="muted">Total Playtime:</span>
                    <strong data-field="stat-total-playtime">${formatDuration(state.stats?.gameTime ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Time in Current Era:</span>
                    <strong data-field="stat-era-time">${formatDuration(state.stats?.timeInCurrentEra ?? state.stats?.gameTime ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Time Since Last Setup Optimization:</span>
                    <strong data-field="stat-so-time">${formatDuration(state.stats?.timeSinceLastSO ?? state.stats?.gameTime ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Fastest 100e9 J Run:</span>
                    <strong data-field="stat-fastest-100e9">${state.stats?.fastest100e9Time != null ? formatDuration(state.stats.fastest100e9Time) : "Not recorded"}</strong>
                  </div>
                </div>
              </div>

              <!-- SECTION: PROGRESSION RECORDS -->
              <div class="tes-stats-section" style="margin-bottom: 16px;">
                <div class="tes-section-header">
                  <span class="tes-section-title">PROGRESSION RECORDS</span>
                  <div class="tes-section-line"></div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                  <div class="tes-stat-box">
                    <span class="muted">Highest Computer Level:</span>
                    <strong data-field="stat-comp-level" style="color: var(--tes-cyan);">${state.stats?.highestComputerLevel ?? state.computerLevel ?? 1}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Highest Stored Energy:</span>
                    <strong data-field="stat-energy" style="color: #60a5fa;">${formatEnergy(state.stats?.highestStoredEnergy ?? state.energy ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Peak Gross Production Rate:</span>
                    <strong style="color: var(--tes-teal);">${formatRate(state.stats?.highestGrossEnergyRate ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Total Hardware Purchases:</span>
                    <strong data-field="stat-purchases">${formatInteger(state.stats?.totalPurchases ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Total Machine Learnings:</span>
                    <strong data-field="stat-mls">${formatInteger(state.stats?.totalMachineLearnings ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Total Setup Optimizations:</span>
                    <strong data-field="stat-fos">${formatInteger(state.facilityOptimizations ?? 0)}</strong>
                  </div>
                </div>
              </div>

              <!-- SECTION: COMPLETED ALGORITHM STUDIES -->
              <div class="tes-stats-section">
                <div class="tes-section-header">
                  <span class="tes-section-title">COMPLETED ALGORITHM STUDIES</span>
                  <div class="tes-section-line"></div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                  <div class="tes-stat-box">
                    <span class="muted">Improvements (AImp):</span>
                    <strong data-field="stat-studies-aimp">${formatInteger(state.stats?.studiesCompleted?.AImp ?? state.algorithms?.AImp?.produced ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Upgrades (AUpg):</span>
                    <strong data-field="stat-studies-aupg">${formatInteger(state.stats?.studiesCompleted?.AUpg ?? state.algorithms?.AUpg?.produced ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Recalculations (ARec):</span>
                    <strong data-field="stat-studies-arec">${formatInteger(state.stats?.studiesCompleted?.ARec ?? state.algorithms?.ARec?.produced ?? 0)}</strong>
                  </div>
                  <div class="tes-stat-box">
                    <span class="muted">Redesigns (ARed):</span>
                    <strong data-field="stat-studies-ared">${formatInteger(state.stats?.studiesCompleted?.ARed ?? state.algorithms?.ARed?.produced ?? 0)}</strong>
                  </div>
                </div>
              </div>

              <div class="tes-rail-divider" style="margin: 16px 0;"></div>
              <div style="display: flex; justify-content: flex-end;">
                <button class="btn-primary" data-action="close-drawer">Close</button>
              </div>
            </div>
          </div>
        `;
        break;
      }

      // 8. Measurement / Telemetry Modal
      case "measure": {
        const compLevel = state.computerLevel ?? 1;
        const ap = calculateAlgorithmPerformance(
          state,
          config,
          engine.statResolver,
        );
        const hasGadget = (state.devices?.crcGadget?.owned ?? 0) > 0;
        const totalProd = calculateEnergyProduction(
          state,
          config,
          engine.statResolver,
        );

        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <div class="tes-modal">
              <div class="tes-modal-header">
                <h3 class="tes-modal-title">Energy Telemetry & Metrics</h3>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close modal">&times;</button>
              </div>
              <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
                <div style="display: flex; justify-content: space-between;">
                  <span class="muted">Algorithm Performance (AP):</span>
                  <strong data-field="measure-ap">${formatEnergy(ap)}/s</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span class="muted">Computer Level:</span>
                  <strong data-field="measure-level-mult" style="color: var(--tes-cyan);">Level ${compLevel}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span class="muted">CRC Gadget Multiplier:</span>
                  <strong data-field="measure-gadget-mult" style="color: var(--tes-teal);">${hasGadget ? "2.00x" : "1.00x"}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span class="muted">Gross Production Rate:</span>
                  <strong data-field="measure-total-prod" style="color: var(--tes-cyan); font-size: 15px;">${formatRate(totalProd)}</strong>
                </div>
                <div class="tes-rail-divider"></div>
                <div style="display: flex; justify-content: flex-end;">
                  <button class="btn-primary" data-action="close-drawer">Close</button>
                </div>
              </div>
            </div>
          </div>
        `;
        break;
      }

      // 9. Offline Recovery Modal
      case "offline": {
        const summary = state.lastOfflineSummary ?? {
          offlineSeconds: 0,
          simulatedSeconds: 0,
          capped: false,
          netEnergy: big(0),
          totalEnergyProduced: big(0),
          studiesCompleted: { AImp: 0, AUpg: 0, ARec: 0 },
        };
        const awayStr = formatDuration(summary.offlineSeconds ?? 0);
        const simStr = formatDuration(summary.simulatedSeconds ?? 0);
        const netEn = big(summary.netEnergy ?? 0);
        const netEnStr = formatEnergy(netEn);
        const isNetPositive = netEn.gte(0);
        const aImpDiff = summary.studiesCompleted?.AImp ?? summary.algorithmImprovementsCompleted ?? 0;
        const aUpgDiff = summary.studiesCompleted?.AUpg ?? summary.algorithmUpgradesCompleted ?? 0;
        const aRecDiff = summary.studiesCompleted?.ARec ?? summary.algorithmRefactoringsCompleted ?? 0;

        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <div class="tes-modal" style="max-width: 520px; width: 100%;">
              <div class="tes-modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img src="${tesIconPath("auto-calculator")}" alt="" style="width: 24px; height: 24px;" />
                  <h3 class="tes-modal-title">Facility Offline Recovery</h3>
                </div>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close modal">&times;</button>
              </div>
              <div style="display: flex; flex-direction: column; gap: 16px;">
                <p class="muted" style="margin: 0; font-size: 13px;">
                  Autonomous facility systems simulated operations across your absence.
                </p>

                <div class="tes-stored-energy-card" style="max-width: 100%; padding: 14px 18px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span class="muted">Time Away:</span>
                    <strong style="color: var(--tes-text);">${awayStr}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span class="muted">Simulated Duration:</span>
                    <strong style="color: var(--tes-cyan);">${simStr}${summary.capped ? " (Capped)" : ""}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span class="muted">Net Energy Stored:</span>
                    <strong style="color: ${isNetPositive ? "var(--tes-green)" : "var(--tes-danger)"}; font-size: 15px;">${isNetPositive ? "+" : ""}${netEnStr}</strong>
                  </div>
                </div>

                <div class="tes-section-header">
                  <span class="tes-section-title">AUTONOMOUS COMPUTATION</span>
                  <div class="tes-section-line"></div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
                  <div style="display: flex; justify-content: space-between; padding: 6px 10px; background: rgba(255, 255, 255, 0.02); border-radius: 4px; border: 1px solid var(--tes-border);">
                    <span style="color: var(--tes-text);">Algorithm Improvements (A.Imp):</span>
                    <strong style="color: var(--tes-cyan);">+${formatInteger(aImpDiff)}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; padding: 6px 10px; background: rgba(255, 255, 255, 0.02); border-radius: 4px; border: 1px solid var(--tes-border);">
                    <span style="color: var(--tes-text);">Algorithm Upgrades (A.Upg):</span>
                    <strong style="color: var(--tes-purple-light);">+${formatInteger(aUpgDiff)}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; padding: 6px 10px; background: rgba(255, 255, 255, 0.02); border-radius: 4px; border: 1px solid var(--tes-border);">
                    <span style="color: var(--tes-text);">Algorithm Refactorings (A.Rec):</span>
                    <strong style="color: var(--tes-yellow);">+${formatInteger(aRecDiff)}</strong>
                  </div>
                </div>

                <div class="tes-rail-divider"></div>

                <div style="display: flex; justify-content: flex-end;">
                  <button class="btn-primary" data-action="close-drawer" style="padding: 8px 24px;">Resume Simulation</button>
                </div>
              </div>
            </div>
          </div>
        `;
        break;
      }

      // 10. Setup Optimization / Facility Restructure Disclaimer Modal
      case "fo-confirm": {
        const foCount = state.facilityOptimizations ?? 0;
        const curLevel = state.computerLevel ?? 1;
        const curBonus = calculateFacilityDeviceMultiplier(foCount, config);
        const nextBonus = calculateFacilityDeviceMultiplier(foCount + 1, config);
        const isFirstTime = foCount === 0;
        const isSecondTime = foCount === 1;
        const isThirdTime = foCount === 2;

        containerEl.innerHTML = `
          <div class="tes-modal-overlay" data-action="close-drawer">
            <div class="tes-modal" style="max-width: 540px; width: 100%;">
              <div class="tes-modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img src="${tesIconPath("facility-optimization")}" alt="" style="width: 24px; height: 24px;" />
                  <h3 class="tes-modal-title" style="color: #c084fc;">Setup Optimization Disclaimer</h3>
                </div>
                <button class="btn-icon-only" data-action="close-drawer" aria-label="Close modal">&times;</button>
              </div>

              <div style="display: flex; flex-direction: column; gap: 14px;">
                ${
                  isFirstTime
                    ? `
                  <div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: rgba(168, 85, 247, 0.12); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 8px;">
                    <img src="${tesIconPath("algorithm-recalculation")}" alt="" style="width: 28px; height: 28px;" />
                    <div style="font-size: 13px; line-height: 1.4;">
                      <strong style="color: #e9d5ff; display: block; margin-bottom: 2px;">Nova Descoberta Científica (SO1)!</strong>
                      <span style="color: #f3e8ff;">Uma nova forma de melhoria de algoritmo foi descoberta: <strong>Algorithm Recalculation (ARec)</strong>!</span>
                    </div>
                  </div>
                `
                    : isSecondTime
                    ? `
                  <div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 8px;">
                    <img src="${tesIconPath("algorithm-redesign")}" alt="" style="width: 28px; height: 28px;" />
                    <div style="font-size: 13px; line-height: 1.4;">
                      <strong style="color: #bae6fd; display: block; margin-bottom: 2px;">Nova Descoberta Científica (SO2)!</strong>
                      <span style="color: #f0f9ff;">O quarto nível de computação será desbloqueado: <strong>Algorithm Redesign (ARed)</strong>!</span>
                    </div>
                  </div>
                `
                    : isThirdTime
                    ? `
                  <div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.4); border-radius: 8px;">
                    <img src="${tesIconPath("backpropagator")}" alt="" style="width: 28px; height: 28px;" />
                    <div style="font-size: 13px; line-height: 1.4;">
                      <strong style="color: #fde047; display: block; margin-bottom: 2px;">Marco Computacional Superior (SO3)!</strong>
                      <span style="color: #fef08a;">Novo dispositivo quântico disponível após atingir energia suficiente: <strong>Backpropagator</strong>!</span>
                    </div>
                  </div>
                `
                    : ""
                }

                <p style="margin: 0; font-size: 13px; line-height: 1.45; color: var(--tes-text-secondary);">
                  Executar o <strong>Setup Optimization</strong> realiza uma reestruturação profunda da infraestrutura computacional (<strong>HARD RESET na camada de Energy</strong>).
                </p>

                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12.5px;">
                  <div style="padding: 10px 12px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 6px;">
                    <strong style="color: #fca5a5; display: block; margin-bottom: 4px;">⚠ O que será reiniciado (HARD RESET):</strong>
                    <ul style="margin: 0; padding-left: 18px; color: var(--tes-text-secondary); line-height: 1.5;">
                      <li><strong>Stored Energy:</strong> Zerada completamente.</li>
                      <li><strong>Study Improvements:</strong> Todas as melhorias e milestones de estudos são zerados.</li>
                      <li><strong>Algoritmos & Inventários:</strong> AImp, AUpg, ARec e ARed zerados.</li>
                      <li><strong>Hardware Convencional:</strong> Chips, Transistores, Microprocessor, Capacitores, Processors, Hard Disks e Backpropagator removidos.</li>
                    </ul>
                  </div>

                  <div style="padding: 10px 12px; background: rgba(52, 211, 153, 0.08); border: 1px solid rgba(52, 211, 153, 0.25); border-radius: 6px;">
                    <strong style="color: #6ee7b7; display: block; margin-bottom: 4px;">✓ O que é PRESERVADO:</strong>
                    <ul style="margin: 0; padding-left: 18px; color: var(--tes-text-secondary); line-height: 1.5;">
                      <li><strong>Computer Level & MLs:</strong> <span style="color: #a7f3d0; font-weight: 600;">Preservados</span> (não são reiniciados).</li>
                      <li><strong>Power Cells:</strong> <span style="color: #a7f3d0; font-weight: 600;">Preservadas intactas</span> (única exceção de hardware!).</li>
                      <li><strong>Multiplicador Permanente:</strong> Bônus logarítmico (de ${(curBonus).toFixed(2)}× para <strong style="color: #c084fc;">${(nextBonus).toFixed(2)}×</strong>) em hardware operacional.</li>
                      <li><strong>Algorithm Recalculation (ARec):</strong> Desbloqueado permanentemente.</li>
                      ${foCount >= 1 ? `<li><strong>Algorithm Redesign (ARed):</strong> Desbloqueado permanentemente.</li>` : ""}
                      ${foCount >= 2 ? `<li><strong>Backpropagator:</strong> Apto para descoberta no SO3.</li>` : ""}
                    </ul>
                  </div>
                </div>

                <div class="tes-rail-divider"></div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                  <button class="btn-secondary" data-action="close-drawer">Cancelar</button>
                  <button class="btn-primary btn-primary--purple" data-action="perform-facility-optimization">
                    Confirmar Restruturação (Lv. ${curLevel})
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        break;
      }
    }
  }

  function closeHoverPopover() {
    const popoverContainer = container.querySelector("#tes-popover-container");
    if (popoverContainer && activePopover?.isHover) {
      activePopover = null;
      popoverContainer.innerHTML = "";
    }
  }

  // Popover info handler
  function showInfoPopover(topic, triggerEl, isHover = false) {
    const popoverContainer = container.querySelector("#tes-popover-container");
    if (!popoverContainer) return;

    if (!isHover && activePopover?.topic === topic && !activePopover.isHover) {
      activePopover = null;
      popoverContainer.innerHTML = "";
      return;
    }

    if (isHover && activePopover && !activePopover.isHover) {
      // Don't override a locked popover opened by click
      return;
    }

    const config = engine?.config || globalThis.__TES_GAME_CONFIG__ || {};
    const rect = triggerEl ? triggerEl.getBoundingClientRect() : { bottom: 100, left: 100 };
    const data = getTooltipContent(topic, {
      state: engine.state,
      config,
      engine,
      statResolver: engine.statResolver,
    });
    activePopover = { topic, isHover, ...data };

    const popoverWidth = 380;
    const top = Math.min(
      window.innerHeight - 280,
      Math.max(10, rect.bottom + 6),
    );
    const left = Math.min(
      Math.max(10, window.innerWidth - popoverWidth - 20),
      Math.max(10, rect.left - 100),
    );

    popoverContainer.innerHTML = `
      <div class="tes-popover" style="top: ${top}px; left: ${left}px;">
        <div style="font-weight: 700; color: var(--tes-text); margin-bottom: 4px;">${data.title}</div>
        <div class="tes-popover-body">${data.body}</div>
      </div>
    `;

    const popoverEl = popoverContainer.querySelector(".tes-popover");
    if (popoverEl && isHover) {
      popoverEl.addEventListener("mouseleave", () => {
        closeHoverPopover();
      });
    }

    const closeHandler = (e) => {
      if (
        !e.target.closest(".tes-popover") &&
        !e.target.closest('[data-action="show-info"]') &&
        !e.target.closest("#energy-net-item")
      ) {
        activePopover = null;
        popoverContainer.innerHTML = "";
        window.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => window.addEventListener("click", closeHandler), 10);
  }

  // Public methods on renderer
  render.render = render;
  render.getActiveDrawer = () => activeDrawer;
  render.openDrawer = (drawerName) => {
    if (activeDrawer !== drawerName) {
      activeDrawer = drawerName;
      lastActiveDrawer = null;
      render();
    }
  };
  render.closeDrawer = () => {
    if (activeDrawer !== null) {
      activeDrawer = null;
      render();
    }
  };
  render.refreshDrawer = () => {
    lastActiveDrawer = null;
    render();
  };
  render.showInfo = showInfoPopover;
  render.isNarrativeModalOpen = isNarrativeModalOpen;
  render.getActiveNarrativeMilestone = () => activeNarrativeMilestone;
  render.showNarrativeModal = showNarrativeModal;
  render.transitionNarrativeComingSoon = transitionNarrativeComingSoon;
  render.closeNarrativeModal = closeNarrativeModal;
  render.nextNews = () => {
    const list = getNewsList();
    newsIndex = (newsIndex + 1) % list.length;
    updateNewsDisplay();
  };
  render.prevNews = () => {
    const list = getNewsList();
    newsIndex = (newsIndex - 1 + list.length) % list.length;
    updateNewsDisplay();
  };

  return render;
}
