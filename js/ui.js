/**
 * ui.js
 * Clean, modern two-tab UI for The Eternal Simulation (Rebuild specification).
 * Renders Energy and Efficiency & Automation tabs, sticky status bar, and Dev Sandbox controls.
 */

import { formatEnergy, formatRate, formatInteger, big } from "./numeric.js";
import { getElement, evaluateElement } from "./component-registry.js";
import {
  calculateAvailableData,
  calculateDataFromAlgorithms,
  calculateRequiredDataForNextComputerLevel,
  calculateFacilityOptimizationRequirement,
  calculateFacilityDeviceMultiplier,
  calculateProcessorDeviceMultiplier,
  calculateTotalDeviceMultiplier,
  calculateAlgorithmBaseStrengths,
  calculateAlgorithmPerformance,
  calculateComputerPerformanceMultiplier,
  calculateEnergyProduction,
  calculateEnergyOverflowDecay,
  calculateEffectiveStudyDuration,
  calculateEffectiveStudySpeed,
  calculatePowerCellCapacity,
} from "./formulas.js";

export function createRenderer(container, engine) {
  let isMounted = false;

  function render() {
    if (!isMounted) {
      mountStructure();
    }
    updateDynamicValues(engine.state);
  }

  function mountStructure() {
    container.innerHTML = `
      <div class="sandbox-shell">
        <!-- Persistent Sticky Status Bar (§17) -->
        <header class="sticky-status-bar" id="sticky-hud">
          <div class="status-pills">
            <div class="status-pill">
              <span class="status-pill__label">Stored Energy</span>
              <span class="status-pill__value status-pill__value--energy" data-field="hud-energy">0.00 pJ</span>
            </div>
            <div class="status-pill">
              <span class="status-pill__label">Energy Production</span>
              <span class="status-pill__value status-pill__value--rate" data-field="hud-production">+0.00 pJ/s</span>
            </div>
            <div class="status-pill" title="Also known as XP. Apparently, scientists still need experience points.">
              <span class="status-pill__label">Available Data (XP)</span>
              <span class="status-pill__value status-pill__value--data" data-field="hud-data">0</span>
            </div>
            <div class="status-pill">
              <span class="status-pill__label">Computer Level</span>
              <span class="status-pill__value status-pill__value--level" data-field="hud-level">1</span>
            </div>
            <div class="status-pill">
              <span class="status-pill__label">Facility Optimizations</span>
              <span class="status-pill__value" data-field="hud-optimizations" style="color: var(--cyan);">0</span>
            </div>
          </div>

          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn btn--sm btn--dev" data-action="toggle-dev-mode" data-field="dev-mode-btn">
              DEV MODE: ON
            </button>
          </div>
        </header>

        <!-- Developer Mode Toolbar (§21) -->
        <nav class="dev-toolbar" id="dev-toolbar" style="display: flex;">
          <span class="dev-toolbar__label">DEV CHEATS:</span>
          <button class="btn btn--sm btn--dev" data-action="add-energy" data-amount="1e-9">+1 nJ</button>
          <button class="btn btn--sm btn--dev" data-action="add-energy" data-amount="1e-6">+1 µJ</button>
          <button class="btn btn--sm btn--dev" data-action="add-energy" data-amount="1e-3">+1 mJ</button>
          <button class="btn btn--sm btn--dev" data-action="add-energy" data-amount="1">+1 J</button>
          <button class="btn btn--sm btn--dev btn--danger" data-action="zero-energy">Zero J</button>

          <span class="dev-toolbar__divider"></span>

          <span class="dev-toolbar__label">ALGORITHMS:</span>
          <button class="btn btn--sm btn--dev" data-action="add-afeature" data-target="AImp" data-count="12">+12 AImp</button>
          <button class="btn btn--sm btn--dev" data-action="add-afeature" data-target="AUpg" data-count="12">+12 AUpg</button>
          <button class="btn btn--sm btn--dev" data-action="add-afeature" data-target="ARec" data-count="12">+12 ARec</button>
          <button class="btn btn--sm btn--dev btn--warning" data-action="add-comp-level">+1 Level</button>

          <span class="dev-toolbar__divider"></span>

          <span class="dev-toolbar__label">SPEED:</span>
          <button class="btn btn--sm btn--dev" data-action="set-speed" data-speed="1">1x</button>
          <button class="btn btn--sm btn--dev" data-action="set-speed" data-speed="5">5x</button>
          <button class="btn btn--sm btn--dev" data-action="set-speed" data-speed="20">20x</button>

          <span class="dev-toolbar__divider"></span>

          <span class="dev-toolbar__label">STATE:</span>
          <button class="btn btn--sm btn--dev btn--primary" data-action="quicksave">Quicksave</button>
          <button class="btn btn--sm btn--dev" data-action="restore-quicksave" data-field="restore-qs-btn">Quick Restore</button>
          <button class="btn btn--sm btn--dev btn--danger" data-action="reset-all">Reset All</button>
        </nav>

        <!-- Two Main Navigation Tabs (§17) -->
        <nav class="tab-nav">
          <button class="tab-btn tab-btn--active" data-action="set-tab" data-tab="energy">
            1. Energy
          </button>
          <button class="tab-btn" data-action="set-tab" data-tab="efficiency">
            2. Efficiency & Automation
          </button>
        </nav>

        <!-- TAB 1: ENERGY -->
        <main class="tab-content" id="tab-energy">
          <!-- A. Introductory Narrative (§18.A) -->
          <div class="panel" id="narrative-card" style="margin-bottom: 20px; border-left: 3px solid var(--blue);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <span class="eyebrow">SYSTEM ACTIVATION</span>
                <p class="muted" style="margin: 0; max-width: 800px;">
                  You have activated an experimental computational system capable of improving its own algorithms
                  and extracting usable Energy from cosmic radiation. Study algorithms to generate performance, produce
                  energy, and build computational infrastructure.
                </p>
              </div>
              <button class="btn btn--sm" data-action="dismiss-narrative" style="align-self: center;">Dismiss</button>
            </div>
          </div>

          <!-- B. Cosmic Radiation Condenser (CRC) (§18.B) -->
          <div class="panel" style="margin-bottom: 20px;">
            <div class="element-card__header">
              <div>
                <span class="element-card__category">Energy Generator</span>
                <h3 class="element-card__title">Cosmic Radiation Condenser (CRC)</h3>
              </div>
              <span class="badge badge--success" data-field="crc-status-badge">PRODUCING</span>
            </div>
            <p class="element-card__desc">
              Converts total Algorithm Performance (AP) into pure Energy. Modifiers apply globally.
            </p>
            <div class="element-card__metrics">
              <div class="metric-row">
                <span class="metric-row__label">Total Algorithm Performance (AP):</span>
                <span class="metric-row__val" data-field="crc-ap" style="color: var(--blue-bright);">0.00 pJ/s</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Computer Level Multiplier (1.5^(L-1)):</span>
                <span class="metric-row__val" data-field="crc-comp-mult">1.00x</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">CRC Gadget Multiplier:</span>
                <span class="metric-row__val" data-field="crc-gadget-mult">1.00x</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Effective Energy Production:</span>
                <span class="metric-row__val" data-field="crc-prod-rate" style="color: var(--cyan); font-size: 1.1rem;">+0.00 pJ/s</span>
              </div>
              <div class="metric-row" data-field="crc-decay-row" style="display: none;">
                <span class="metric-row__label" style="color: var(--red);">Overflow Decay:</span>
                <span class="metric-row__val" data-field="crc-decay-rate" style="color: var(--red);">-0.00 pJ/s</span>
              </div>
            </div>
          </div>

          <!-- C. Algorithm Features (§18.C) -->
          <div class="panel" style="margin-bottom: 20px;">
            <div class="element-card__header">
              <div>
                <span class="element-card__category">Algorithm Learning</span>
                <h3 class="element-card__title">Algorithm Features</h3>
              </div>
              <span class="muted" style="font-size: 0.8rem;">Conversion factor: 12 units</span>
            </div>

            <div class="rebuild-grid" style="margin-top: 14px;">
              <!-- 1. Algorithm Improvement (AImp) -->
              <article class="element-card">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">Base Feature</span>
                    <h4 class="element-card__title">Algorithm Improvement (AImp)</h4>
                  </div>
                  <span class="badge badge--success" data-field="aimp-study-badge">READY</span>
                </div>
                <p class="element-card__desc">
                  Primary study. Free to study. Base strength: <strong>1e-15 J/s</strong>.
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Owned / Produced (Cycle):</span>
                    <span class="metric-row__val" data-field="aimp-owned">0 / 0</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Strength per unit:</span>
                    <span class="metric-row__val" data-field="aimp-unit-strength">1.00 fJ/s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Total Contribution:</span>
                    <span class="metric-row__val" data-field="aimp-contribution" style="color: var(--cyan);">0.00 pJ/s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Study Duration:</span>
                    <span class="metric-row__val" data-field="aimp-duration">0.50s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Auto Chips Assigned:</span>
                    <span class="metric-row__val" data-field="aimp-workers">0</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--primary" data-action="study-feature" data-target="AImp" data-count="1" data-field="aimp-study-btn">
                    STUDY 1 A.IMP
                  </button>
                  <div class="btn-group--bulk">
                    <button class="btn btn--sm btn--dev" data-action="study-feature" data-target="AImp" data-count="10">+10</button>
                    <button class="btn btn--sm btn--dev" data-action="study-feature" data-target="AImp" data-count="100">+100</button>
                    <button class="btn btn--sm btn--dev" data-action="study-feature" data-target="AImp" data-count="1000">+1000</button>
                  </div>
                </div>
              </article>

              <!-- 2. Algorithm Upgrade (AUpg) -->
              <article class="element-card">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">Advanced Feature</span>
                    <h4 class="element-card__title">Algorithm Upgrade (AUpg)</h4>
                  </div>
                  <span class="badge" data-field="aupg-badge">VISIBLE</span>
                </div>
                <p class="element-card__desc">
                  Requires and consumes <strong>12 AImp</strong>. Base strength: <strong>24e-15 J/s</strong> (doubles Energy; trade-off: Data falls 12 → 9).
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Owned / Produced (Cycle):</span>
                    <span class="metric-row__val" data-field="aupg-owned">0 / 0</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Strength per unit:</span>
                    <span class="metric-row__val" data-field="aupg-unit-strength">24.00 fJ/s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Total Contribution:</span>
                    <span class="metric-row__val" data-field="aupg-contribution" style="color: var(--cyan);">0.00 pJ/s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Study Duration:</span>
                    <span class="metric-row__val" data-field="aupg-duration">0.50s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Auto Chips Assigned:</span>
                    <span class="metric-row__val" data-field="aupg-workers">0</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--eligible" data-action="study-feature" data-target="AUpg" data-count="1" data-field="aupg-study-btn">
                    STUDY 1 A.UPG (12 AImp)
                  </button>
                  <div class="btn-group--bulk">
                    <button class="btn btn--sm btn--dev" data-action="study-feature" data-target="AUpg" data-count="10">+10</button>
                    <button class="btn btn--sm btn--dev" data-action="study-feature" data-target="AUpg" data-count="100">+100</button>
                    <button class="btn btn--sm btn--dev" data-action="study-feature" data-target="AUpg" data-count="1000">+1000</button>
                  </div>
                </div>
              </article>

              <!-- 3. Algorithm Recalculation (ARec) -->
              <article class="element-card" id="card-arec" style="display: none;">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">Facility Masterwork</span>
                    <h4 class="element-card__title">Algorithm Recalculation (ARec)</h4>
                  </div>
                  <span class="badge badge--success">UNLOCKED</span>
                </div>
                <p class="element-card__desc">
                  Requires and consumes <strong>12 AUpg</strong>. Base strength: <strong>576e-15 J/s</strong> (doubles Energy; trade-off: Data falls 108 → 81).
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Owned / Produced (Cycle):</span>
                    <span class="metric-row__val" data-field="arec-owned">0 / 0</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Strength per unit:</span>
                    <span class="metric-row__val" data-field="arec-unit-strength">576.00 fJ/s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Total Contribution:</span>
                    <span class="metric-row__val" data-field="arec-contribution" style="color: var(--cyan);">0.00 pJ/s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Study Duration:</span>
                    <span class="metric-row__val" data-field="arec-duration">0.50s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Auto Chips Assigned:</span>
                    <span class="metric-row__val" data-field="arec-workers">0</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--eligible" data-action="study-feature" data-target="ARec" data-count="1" data-field="arec-study-btn">
                    STUDY 1 A.REC (12 AUpg)
                  </button>
                  <div class="btn-group--bulk">
                    <button class="btn btn--sm btn--dev" data-action="study-feature" data-target="ARec" data-count="10">+10</button>
                    <button class="btn btn--sm btn--dev" data-action="study-feature" data-target="ARec" data-count="100">+100</button>
                    <button class="btn btn--sm btn--dev" data-action="study-feature" data-target="ARec" data-count="1000">+1000</button>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <!-- D. Direct Energy Devices (§18.D) -->
          <div class="panel">
            <div class="element-card__header">
              <div>
                <span class="element-card__category">Infrastructure</span>
                <h3 class="element-card__title">Direct Energy Devices</h3>
              </div>
            </div>

            <div class="rebuild-grid" style="margin-top: 14px;">
              <!-- CRC Gadget -->
              <article class="element-card">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">Production Boost</span>
                    <h4 class="element-card__title">CRC Gadget</h4>
                  </div>
                  <span class="badge" data-field="crc-gadget-badge">AVAILABLE</span>
                </div>
                <p class="element-card__desc">
                  Permanently doubles CRC Energy Production rate (<strong>2x</strong>).
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Owned:</span>
                    <span class="metric-row__val" data-field="crc-gadget-owned">0 / 1</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Cost:</span>
                    <span class="metric-row__val" data-field="crc-gadget-cost">10.00 nJ</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--eligible" data-action="buy-element" data-element-id="crcGadget" data-count="1" data-field="crc-gadget-btn">
                    BUY CRC GADGET — 10.00 nJ
                  </button>
                </div>
              </article>

              <!-- Capacitor -->
              <article class="element-card" id="card-capacitor">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">AImp Amplification</span>
                    <h4 class="element-card__title">Capacitor</h4>
                  </div>
                  <span class="badge" data-field="capacitor-badge">LOCKED</span>
                </div>
                <p class="element-card__desc">
                  Increases A.Improvement Energy contribution by <strong>+50%</strong> per unit. Unlocks after 1st Machine Learning.
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Owned:</span>
                    <span class="metric-row__val" data-field="capacitor-owned">0</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">AImp Multiplier:</span>
                    <span class="metric-row__val" data-field="capacitor-mult" style="color: var(--cyan);">1.00x</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Next Cost:</span>
                    <span class="metric-row__val" data-field="capacitor-next-cost">10.00 nJ</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--eligible" data-action="buy-element" data-element-id="capacitor" data-count="1" data-field="capacitor-btn">
                    BUY CAPACITOR
                  </button>
                  <div class="btn-group--bulk">
                    <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="capacitor" data-count="10">+10</button>
                    <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="capacitor" data-count="100">+100</button>
                    <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="capacitor" data-count="1000">+1000</button>
                  </div>
                </div>
              </article>

              <!-- Power Cells -->
              <article class="element-card" id="card-powercell">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">Storage Buffer</span>
                    <h4 class="element-card__title">Power Cell</h4>
                  </div>
                  <span class="badge badge--success">STORAGE</span>
                </div>
                <p class="element-card__desc">
                  Provides operational Energy capacity (1 mJ/cell). Main Stored Energy wallet is unconstrained. Persists across Facility Optimization.
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Owned Cells:</span>
                    <span class="metric-row__val" data-field="powercell-owned">0</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Operational Capacity:</span>
                    <span class="metric-row__val" data-field="powercell-capacity" style="color: var(--cyan);">0.00 pJ</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Next Cost:</span>
                    <span class="metric-row__val" data-field="powercell-next-cost">1.00 J</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--eligible" data-action="buy-element" data-element-id="powerCell" data-count="1" data-field="powercell-btn">
                    BUY POWER CELL — 1.00 J
                  </button>
                  <div class="btn-group--bulk">
                    <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="powerCell" data-count="10">+10</button>
                    <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="powerCell" data-count="100">+100</button>
                    <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="powerCell" data-count="1000">+1000</button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </main>

        <!-- TAB 2: EFFICIENCY & AUTOMATION -->
        <main class="tab-content" id="tab-efficiency" style="display: none;">
          <!-- A. Computer Learning (Soft Reset) (§19.A) -->
          <div class="panel" style="margin-bottom: 20px;">
            <div class="element-card__header">
              <div>
                <span class="element-card__category">Computer Learning</span>
                <h3 class="element-card__title">Machine Learning (Soft Reset)</h3>
              </div>
              <span class="badge badge--warning" data-field="ml-badge">THRESHOLD</span>
            </div>
            <p class="element-card__desc">
              Advance global Computer Level to multiply overall Algorithm Performance by <strong>1.5^(L-1)</strong>.
              Uses Available Data (XP). Resets algorithm inventories; preserves hardware and stored energy.
            </p>
            <div class="element-card__metrics">
              <div class="metric-row">
                <span class="metric-row__label">Current Computer Level:</span>
                <span class="metric-row__val" data-field="ml-current-level" style="color: var(--amber); font-size: 1.1rem;">1</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Current AP Multiplier:</span>
                <span class="metric-row__val" data-field="ml-multiplier" style="color: var(--cyan);">1.00x</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Available Data (XP):</span>
                <span class="metric-row__val" data-field="ml-available-data" style="color: var(--violet);">0 / 693</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Data from Algorithms / Buffer:</span>
                <span class="metric-row__val" data-field="ml-data-breakdown">0 / 0</span>
              </div>
            </div>
            <div class="element-card__actions" style="margin-top: 10px;">
              <button class="btn btn--block btn--eligible" data-action="run-machine-learning" data-field="ml-btn">
                RUN MACHINE LEARNING (Req 693 Data)
              </button>
            </div>
          </div>

          <!-- B. AutoCalculator Chips (§19.B) -->
          <div class="panel" style="margin-bottom: 20px;" id="panel-chips">
            <div class="element-card__header">
              <div>
                <span class="element-card__category">Study Automation</span>
                <h3 class="element-card__title">AutoCalculator Chips</h3>
              </div>
              <span class="badge" data-field="chip-badge">LOCKED</span>
            </div>
            <p class="element-card__desc">
              Independent study workers. Assignable to any unlocked A-Feature. Respects study durations and input requirements.
            </p>
            <div class="element-card__metrics">
              <div class="metric-row">
                <span class="metric-row__label">Chips Owned:</span>
                <span class="metric-row__val" data-field="chips-owned">0</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Next Cost (3e-11 * 4^N):</span>
                <span class="metric-row__val" data-field="chips-next-cost">30.00 pJ</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Allocations (AImp / AUpg / ARec):</span>
                <span class="metric-row__val" data-field="chips-allocation-label">0 / 0 / 0</span>
              </div>
            </div>
            <div class="element-card__actions">
              <button class="btn btn--block btn--eligible" data-action="buy-element" data-element-id="chip" data-count="1" data-field="chip-btn">
                BUY CHIP — 30.00 pJ
              </button>
              <div class="btn-group--bulk">
                <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="chip" data-count="10">+10</button>
                <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="chip" data-count="100">+100</button>
                <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="chip" data-count="1000">+1000</button>
              </div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 10px; align-items: center;">
              <span style="font-size: 0.8rem; color: var(--muted);">Reassign Chips:</span>
              <button class="btn btn--sm" data-action="reassign-chip" data-from="AImp" data-to="AUpg">Move AImp → AUpg</button>
              <button class="btn btn--sm" data-action="reassign-chip" data-from="AUpg" data-to="AImp">Move AUpg → AImp</button>
              <button class="btn btn--sm" data-action="reassign-chip" data-from="AImp" data-to="ARec" data-field="chip-arec-btn" style="display: none;">Move AImp → ARec</button>
            </div>
          </div>

          <!-- C. Transistor Board (§19.C) -->
          <div class="panel" style="margin-bottom: 20px;" id="panel-transistor-board">
            <div class="element-card__header">
              <div>
                <span class="element-card__category">Study Fleet Infrastructure</span>
                <h3 class="element-card__title">Transistor Board & Transistor Allocation</h3>
              </div>
              <span class="badge" data-field="board-badge">LOCKED</span>
            </div>
            <p class="element-card__desc">
              Purchased once to enable Transistor acquisition and distribution. Each allocated Transistor adds <strong>+5% Study Speed</strong> to its target.
            </p>

            <div id="board-purchase-box">
              <button class="btn btn--block btn--eligible" data-action="buy-element" data-element-id="transistorBoard" data-field="buy-board-btn">
                BUY TRANSISTOR BOARD — 200.00 pJ
              </button>
            </div>

            <div id="board-active-content" style="display: none; margin-top: 12px;">
              <div class="element-card__metrics" style="margin-bottom: 12px;">
                <div class="metric-row">
                  <span class="metric-row__label">Total Transistors Purchased:</span>
                  <span class="metric-row__val" data-field="transistor-total">0</span>
                </div>
                <div class="metric-row">
                  <span class="metric-row__label">Next Transistor Cost (3e-11 * 1.4^N):</span>
                  <span class="metric-row__val" data-field="transistor-cost">30.00 pJ</span>
                </div>
              </div>

              <div style="margin-bottom: 14px;">
                <button class="btn btn--eligible" data-action="buy-element" data-element-id="transistor" data-count="1" data-field="buy-transistor-btn">
                  BUY TRANSISTOR (+1)
                </button>
                <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="transistor" data-count="10">+10</button>
                <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="transistor" data-count="100">+100</button>
                <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="transistor" data-count="1000">+1000</button>
              </div>

              <table class="transistor-table">
                <thead>
                  <tr>
                    <th>Study Target</th>
                    <th>Allocated Transistors</th>
                    <th>Effective Duration</th>
                    <th>Speed Multiplier</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Algorithm Improvement (AImp)</strong></td>
                    <td data-field="transistor-aimp-count">0</td>
                    <td data-field="transistor-aimp-dur">0.50s</td>
                    <td data-field="transistor-aimp-speed" style="color: var(--cyan);">1.00x</td>
                    <td>
                      <button class="btn btn--sm" data-action="reassign-transistor" data-from="AUpg" data-to="AImp">+1 from AUpg</button>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Algorithm Upgrade (AUpg)</strong></td>
                    <td data-field="transistor-aupg-count">0</td>
                    <td data-field="transistor-aupg-dur">0.50s</td>
                    <td data-field="transistor-aupg-speed" style="color: var(--cyan);">1.00x</td>
                    <td>
                      <button class="btn btn--sm" data-action="reassign-transistor" data-from="AImp" data-to="AUpg">+1 from AImp</button>
                    </td>
                  </tr>
                  <tr id="transistor-row-arec" style="display: none;">
                    <td><strong>Algorithm Recalculation (ARec)</strong></td>
                    <td data-field="transistor-arec-count">0</td>
                    <td data-field="transistor-arec-dur">0.50s</td>
                    <td data-field="transistor-arec-speed" style="color: var(--cyan);">1.00x</td>
                    <td>
                      <button class="btn btn--sm" data-action="reassign-transistor" data-from="AImp" data-to="ARec">+1 from AImp</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- D. Computing Devices (§19.D) -->
          <div class="panel" style="margin-bottom: 20px;">
            <div class="element-card__header">
              <div>
                <span class="element-card__category">Hardware Synergies</span>
                <h3 class="element-card__title">Computing Devices</h3>
              </div>
            </div>

            <div class="rebuild-grid" style="margin-top: 14px;">
              <!-- Microprocessor -->
              <article class="element-card" id="card-microprocessor">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">Exponential Multiplier</span>
                    <h4 class="element-card__title">Microprocessor</h4>
                  </div>
                  <span class="badge" data-field="micro-badge">LOCKED</span>
                </div>
                <p class="element-card__desc">
                  Geometrically amplifies the study speed of its selected target: <strong>1.12^T</strong> (where T is allocated Transistors).
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Target:</span>
                    <span class="metric-row__val" data-field="micro-target" style="color: var(--blue-bright);">AImp</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Study Speed Bonus:</span>
                    <span class="metric-row__val" data-field="micro-bonus" style="color: var(--cyan);">1.00x</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Cost:</span>
                    <span class="metric-row__val">3.00 nJ</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--eligible" data-action="buy-element" data-element-id="microprocessor" data-field="micro-btn">
                    BUY MICROPROCESSOR — 3.00 nJ
                  </button>
                  <div style="display: flex; gap: 6px; margin-top: 6px;">
                    <button class="btn btn--sm" data-action="set-micro-target" data-target="AImp">Target AImp</button>
                    <button class="btn btn--sm" data-action="set-micro-target" data-target="AUpg">Target AUpg</button>
                    <button class="btn btn--sm" data-action="set-micro-target" data-target="ARec" data-field="micro-arec-btn" style="display: none;">Target ARec</button>
                  </div>
                </div>
              </article>

              <!-- Overclocker -->
              <article class="element-card" id="card-overclocker">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">Sacrificial Burn</span>
                    <h4 class="element-card__title">Overclocker</h4>
                  </div>
                  <span class="badge" data-field="overclock-badge">LOCKED</span>
                </div>
                <p class="element-card__desc">
                  Consumes all allocated Transistors on target (min 2) to amplify Microprocessor bonus by <strong>(1 + T/3)</strong> for log(T)/log(1.5)s.
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Status:</span>
                    <span class="metric-row__val" data-field="overclock-status" style="color: var(--amber);">INACTIVE</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Active Duration / Time Left:</span>
                    <span class="metric-row__val" data-field="overclock-timer">0.0s / 0.0s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Cost:</span>
                    <span class="metric-row__val">90.00 nJ</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--eligible" data-action="buy-element" data-element-id="overclocker" data-field="overclock-buy-btn">
                    BUY OVERCLOCKER — 90.00 nJ
                  </button>
                  <button class="btn btn--block btn--danger" data-action="activate-overclock" data-field="overclock-burn-btn" style="margin-top: 6px;">
                    BURN TRANSISTORS & OVERCLOCK
                  </button>
                </div>
              </article>

              <!-- Processor -->
              <article class="element-card" id="card-processor">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">Device Efficiency</span>
                    <h4 class="element-card__title">Processor</h4>
                  </div>
                  <span class="badge" data-field="processor-badge">LOCKED (FACILITY OPT)</span>
                </div>
                <p class="element-card__desc">
                  Improves the performance of all other eligible Devices by <strong>+3%</strong> per unit. Unlocks after 1st Facility Optimization.
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Owned:</span>
                    <span class="metric-row__val" data-field="processor-owned">0</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Device Bonus (1 + 0.03*P):</span>
                    <span class="metric-row__val" data-field="processor-bonus" style="color: var(--cyan);">1.00x</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Next Cost:</span>
                    <span class="metric-row__val" data-field="processor-cost">100.00 µJ</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--eligible" data-action="buy-element" data-element-id="processor" data-count="1" data-field="processor-btn">
                    BUY PROCESSOR — 100.00 µJ
                  </button>
                  <div class="btn-group--bulk">
                    <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="processor" data-count="10">+10</button>
                    <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="processor" data-count="100">+100</button>
                    <button class="btn btn--sm btn--dev" data-action="buy-element" data-element-id="processor" data-count="1000">+1000</button>
                  </div>
                </div>
              </article>

              <!-- Hard Disk -->
              <article class="element-card" id="card-harddisk">
                <div class="element-card__header">
                  <div>
                    <span class="element-card__category">Active Data Generation</span>
                    <h4 class="element-card__title">Hard Disk</h4>
                  </div>
                  <span class="badge" data-field="harddisk-badge">LOCKED (FACILITY OPT)</span>
                </div>
                <p class="element-card__desc">
                  Continuously consumes Energy to generate <strong>+3 Data/s</strong> per active Disk. Energy drain grows with running time.
                </p>
                <div class="element-card__metrics">
                  <div class="metric-row">
                    <span class="metric-row__label">Owned / State:</span>
                    <span class="metric-row__val" data-field="harddisk-state">0 / OFF</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Data Production Rate:</span>
                    <span class="metric-row__val" data-field="harddisk-rate" style="color: var(--violet);">0 Data/s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Energy Drain:</span>
                    <span class="metric-row__val" data-field="harddisk-drain" style="color: var(--red);">-0.00 pJ/s</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row__label">Buffer Content:</span>
                    <span class="metric-row__val" data-field="harddisk-buffer">0 Data</span>
                  </div>
                </div>
                <div class="element-card__actions">
                  <button class="btn btn--block btn--eligible" data-action="buy-element" data-element-id="hardDisk" data-count="1" data-field="harddisk-btn">
                    BUY HARD DISK — 10.00 µJ
                  </button>
                  <div style="display: flex; gap: 6px; margin-top: 6px;">
                    <button class="btn btn--sm" data-action="set-harddisk-state" data-state="active">Active (On)</button>
                    <button class="btn btn--sm btn--danger" data-action="set-harddisk-state" data-state="off">Turn Off (Wipe Buffer)</button>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <!-- E. Facility Optimization (Hard Reset) (§19.E) -->
          <div class="panel" style="margin-bottom: 20px;" id="panel-facility-opt">
            <div class="element-card__header">
              <div>
                <span class="element-card__category">Facility Prestige</span>
                <h3 class="element-card__title">Facility Optimization (Hard Reset)</h3>
              </div>
              <span class="badge badge--warning" data-field="facility-opt-badge">REQUIREMENT</span>
            </div>
            <p class="element-card__desc">
              Slightly improves the performance of all operational devices by <strong>1.09^H</strong> (+9% compounding per optimization).
              <strong>Preserves Computer Level and Power Cells</strong>. Resets conventional hardware and energy. Unlocks ARec and Processor!
            </p>
            <div class="element-card__metrics">
              <div class="metric-row">
                <span class="metric-row__label">Completed Optimizations (H):</span>
                <span class="metric-row__val" data-field="facility-opt-count" style="color: var(--cyan); font-size: 1.1rem;">0</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Required Computer Level (9 + 3*H):</span>
                <span class="metric-row__val" data-field="facility-opt-req">Level 9</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Permanent Device Multiplier:</span>
                <span class="metric-row__val" data-field="facility-opt-mult" style="color: var(--amber);">1.00x</span>
              </div>
            </div>
            <div class="element-card__actions" style="margin-top: 10px;">
              <button class="btn btn--block btn--danger" data-action="perform-facility-optimization" data-field="facility-opt-btn">
                PERFORM FACILITY OPTIMIZATION
              </button>
            </div>
          </div>
        </main>

        <!-- AUDIT LOG & DATA EXPORT PANEL (§22) -->
        <div class="panel" style="margin-top: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div>
              <h3 style="margin: 0;">Purchase & Action Audit Log</h3>
              <span class="muted" data-field="audit-count">0 event(s) recorded</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn--sm" data-action="export-csv">Export CSV</button>
              <button class="btn btn--sm" data-action="export-json">Export JSON</button>
              <button class="btn btn--sm btn--danger" data-action="clear-audit">Clear</button>
            </div>
          </div>
          <div class="audit-container">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Cost</th>
                  <th>Status</th>
                  <th>Energy After</th>
                </tr>
              </thead>
              <tbody id="audit-tbody">
                <tr>
                  <td colspan="7" style="text-align: center; color: var(--muted); padding: 18px;">
                    No transactions recorded yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    isMounted = true;
  }

  function updateDynamicValues(state) {
    const config = engine.config;

    const setText = (field, val) => {
      const el = container.querySelector(`[data-field="${field}"]`);
      if (el && el.textContent !== String(val)) el.textContent = String(val);
    };

    // 1. Sticky HUD Values
    setText("hud-energy", formatEnergy(state.energy));
    const prod = calculateEnergyProduction(state, config, engine.statResolver);
    setText("hud-production", formatRate(prod));
    const data = calculateAvailableData(state, config);
    setText("hud-data", formatInteger(data));
    setText("hud-level", formatInteger(state.computerLevel ?? 1));
    setText("hud-optimizations", formatInteger(state.facilityOptimizations ?? 0));

    // Active Tab Display
    const activeTab = state.ui?.activeTab || "energy";
    const tabEnergy = container.querySelector("#tab-energy");
    const tabEff = container.querySelector("#tab-efficiency");
    if (tabEnergy) tabEnergy.style.display = activeTab === "energy" ? "block" : "none";
    if (tabEff) tabEff.style.display = activeTab === "efficiency" ? "block" : "none";
    const tabBtns = container.querySelectorAll(".tab-btn");
    tabBtns.forEach((btn) => {
      btn.classList.toggle("tab-btn--active", btn.dataset.tab === activeTab);
    });

    // Quicksave button state
    const qsBtn = container.querySelector('[data-field="restore-qs-btn"]');
    if (qsBtn && engine.hasQuicksave) {
      qsBtn.disabled = !engine.hasQuicksave();
    }

    // Dev Mode Button
    const devBtn = container.querySelector('[data-field="dev-mode-btn"]');
    if (devBtn) {
      devBtn.textContent = state.devMode ? "DEV MODE: ON (FORCE ACTIVE)" : "DEV MODE: OFF (STRICT)";
      devBtn.className = `btn btn--sm ${state.devMode ? "btn--bypass" : "btn--muted"}`;
    }

    // 2. CRC Card
    const ap = calculateAlgorithmPerformance(state, config, engine.statResolver);
    setText("crc-ap", formatEnergy(ap) + "/s");
    const compMult = calculateComputerPerformanceMultiplier(state.computerLevel ?? 1, config);
    setText("crc-comp-mult", compMult.toFixed(2) + "x");
    const hasGadget = (state.devices?.crcGadget?.owned ?? 0) > 0;
    setText("crc-gadget-mult", hasGadget ? "2.00x" : "1.00x");
    setText("crc-prod-rate", formatRate(prod));

    const stableCap = calculatePowerCellCapacity(state.powerCells ?? 0, state, config, engine.statResolver);
    const decay = calculateEnergyOverflowDecay(state.energy, stableCap, config);
    const decayRow = container.querySelector('[data-field="crc-decay-row"]');
    if (decayRow) {
      if (decay.gt(0)) {
        decayRow.style.display = "flex";
        setText("crc-decay-rate", "-" + formatEnergy(decay) + "/s");
      } else {
        decayRow.style.display = "none";
      }
    }

    // 3. Algorithm Features
    const strengths = calculateAlgorithmBaseStrengths(config);
    // AImp
    const aImpOwned = state.algorithms?.AImp?.owned ?? 0;
    const aImpProd = state.algorithms?.AImp?.produced ?? 0;
    setText("aimp-owned", `${formatInteger(aImpOwned)} / ${formatInteger(aImpProd)}`);
    const devMult = calculateTotalDeviceMultiplier(state, config);
    const capMult = (state.devices?.capacitors ?? 0) > 0 ? (1 + 0.5 * state.devices.capacitors * devMult) : 1.0;
    setText("aimp-unit-strength", formatEnergy(strengths.AImp * capMult) + "/s");
    setText("aimp-contribution", formatEnergy(big(strengths.AImp).mul(aImpOwned).mul(capMult)) + "/s");
    const aImpDur = calculateEffectiveStudyDuration("AImp", state, config, engine.statResolver);
    setText("aimp-duration", aImpDur.toFixed(2) + "s");
    setText("aimp-workers", formatInteger(state.devices?.chips?.allocations?.AImp ?? 0));

    // AUpg
    const aUpgOwned = state.algorithms?.AUpg?.owned ?? 0;
    const aUpgProd = state.algorithms?.AUpg?.produced ?? 0;
    setText("aupg-owned", `${formatInteger(aUpgOwned)} / ${formatInteger(aUpgProd)}`);
    setText("aupg-unit-strength", formatEnergy(strengths.AUpg) + "/s");
    setText("aupg-contribution", formatEnergy(big(strengths.AUpg).mul(aUpgOwned)) + "/s");
    const aUpgDur = calculateEffectiveStudyDuration("AUpg", state, config, engine.statResolver);
    setText("aupg-duration", aUpgDur.toFixed(2) + "s");
    setText("aupg-workers", formatInteger(state.devices?.chips?.allocations?.AUpg ?? 0));
    const aupgCanAfford = (state.algorithms?.AImp?.owned ?? 0) >= 12;
    const aupgBtn = container.querySelector('[data-field="aupg-study-btn"]');
    if (aupgBtn) {
      aupgBtn.className = `btn btn--block ${aupgCanAfford ? "btn--eligible" : "btn--bypass"}`;
      aupgBtn.disabled = !aupgCanAfford && !state.devMode;
    }

    // ARec
    const cardARec = container.querySelector("#card-arec");
    if (cardARec) {
      if (state.unlocks?.ARec) {
        cardARec.style.display = "flex";
        const aRecOwned = state.algorithms?.ARec?.owned ?? 0;
        const aRecProd = state.algorithms?.ARec?.produced ?? 0;
        setText("arec-owned", `${formatInteger(aRecOwned)} / ${formatInteger(aRecProd)}`);
        setText("arec-unit-strength", formatEnergy(strengths.ARec) + "/s");
        setText("arec-contribution", formatEnergy(big(strengths.ARec).mul(aRecOwned)) + "/s");
        const aRecDur = calculateEffectiveStudyDuration("ARec", state, config, engine.statResolver);
        setText("arec-duration", aRecDur.toFixed(2) + "s");
        setText("arec-workers", formatInteger(state.devices?.chips?.allocations?.ARec ?? 0));
        const arecCanAfford = (state.algorithms?.AUpg?.owned ?? 0) >= 12;
        const arecBtn = container.querySelector('[data-field="arec-study-btn"]');
        if (arecBtn) {
          arecBtn.className = `btn btn--block ${arecCanAfford ? "btn--eligible" : "btn--bypass"}`;
          arecBtn.disabled = !arecCanAfford && !state.devMode;
        }
      } else {
        cardARec.style.display = "none";
      }
    }

    // Direct Devices
    // CRC Gadget
    setText("crc-gadget-owned", (state.devices?.crcGadget?.owned ?? 0) + " / 1");
    const crcGadgetBtn = container.querySelector('[data-field="crc-gadget-btn"]');
    if (crcGadgetBtn) {
      const owned = (state.devices?.crcGadget?.owned ?? 0) > 0;
      crcGadgetBtn.disabled = owned;
      crcGadgetBtn.className = `btn btn--block ${owned ? "btn--muted" : "btn--eligible"}`;
      crcGadgetBtn.textContent = owned ? "ALREADY OWNED" : "BUY CRC GADGET — 10.00 nJ";
    }

    // Capacitor
    const caps = state.devices?.capacitors ?? 0;
    setText("capacitor-owned", formatInteger(caps));
    setText("capacitor-mult", capMult.toFixed(2) + "x");
    const capCost = config.devices?.capacitor?.initialCost ? big(config.devices.capacitor.initialCost).mul(big(5).pow(caps)) : big(1e-8);
    setText("capacitor-next-cost", formatEnergy(capCost));

    // Power Cells
    const pCells = state.powerCells ?? 0;
    setText("powercell-owned", formatInteger(pCells));
    setText("powercell-capacity", formatEnergy(stableCap));
    const cellCost = pCells === 0 ? big(1.0) : big(1.0).mul(big(2.25).pow(pCells));
    setText("powercell-next-cost", formatEnergy(cellCost));

    // 4. Efficiency Tab: Machine Learning (Soft Reset)
    const currentData = calculateAvailableData(state, config);
    const reqData = calculateRequiredDataForNextComputerLevel(state.computerLevel ?? 1, config);
    setText("ml-current-level", state.computerLevel ?? 1);
    setText("ml-multiplier", compMult.toFixed(2) + "x");
    setText("ml-available-data", `${formatInteger(currentData)} / ${formatInteger(reqData)}`);
    const dataFromAlgo = calculateDataFromAlgorithms(state, config);
    const dataFromHD = state.devices?.hardDisks?.buffer ?? 0;
    setText("ml-data-breakdown", `${formatInteger(dataFromAlgo)} from Algorithms / ${formatInteger(dataFromHD)} from HD Buffer`);
    const mlBtn = container.querySelector('[data-field="ml-btn"]');
    if (mlBtn) {
      const canML = currentData >= reqData;
      mlBtn.className = `btn btn--block ${canML ? "btn--eligible" : "btn--bypass"}`;
      mlBtn.disabled = !canML && !state.devMode;
      mlBtn.textContent = canML
        ? `RUN MACHINE LEARNING (Adv to Level ${(state.computerLevel ?? 1) + 1})`
        : `RUN MACHINE LEARNING (Need ${formatInteger(reqData)} Data)`;
    }

    // Chips
    const chipsOwned = state.devices?.chips?.owned ?? 0;
    setText("chips-owned", formatInteger(chipsOwned));
    const chipCost = big(3e-11).mul(big(4).pow(chipsOwned));
    setText("chips-next-cost", formatEnergy(chipCost));
    setText(
      "chips-allocation-label",
      `${state.devices?.chips?.allocations?.AImp ?? 0} AImp / ${state.devices?.chips?.allocations?.AUpg ?? 0} AUpg / ${state.devices?.chips?.allocations?.ARec ?? 0} ARec`
    );

    // Transistor Board
    const hasBoard = Boolean(state.devices?.transistorBoard?.owned);
    const boardPurchaseBox = container.querySelector("#board-purchase-box");
    const boardActiveContent = container.querySelector("#board-active-content");
    if (boardPurchaseBox && boardActiveContent) {
      if (hasBoard) {
        boardPurchaseBox.style.display = "none";
        boardActiveContent.style.display = "block";
      } else {
        boardPurchaseBox.style.display = "block";
        boardActiveContent.style.display = "none";
      }
    }
    const tPurchased = state.devices?.transistorsPurchased ?? 0;
    setText("transistor-total", formatInteger(tPurchased));
    const tCost = big(3e-11).mul(big(1.4).pow(tPurchased));
    setText("transistor-cost", formatEnergy(tCost));

    // Transistor table rows
    const tAImp = state.devices?.transistorAllocations?.AImp ?? 0;
    const tAUpg = state.devices?.transistorAllocations?.AUpg ?? 0;
    const tARec = state.devices?.transistorAllocations?.ARec ?? 0;
    setText("transistor-aimp-count", formatInteger(tAImp));
    setText("transistor-aupg-count", formatInteger(tAUpg));
    setText("transistor-arec-count", formatInteger(tARec));
    setText("transistor-aimp-dur", aImpDur.toFixed(2) + "s");
    setText("transistor-aupg-dur", aUpgDur.toFixed(2) + "s");
    const aRecDur = calculateEffectiveStudyDuration("ARec", state, config, engine.statResolver);
    setText("transistor-arec-dur", aRecDur.toFixed(2) + "s");
    setText("transistor-aimp-speed", calculateEffectiveStudySpeed("AImp", state, config, engine.statResolver).toFixed(2) + "x");
    setText("transistor-aupg-speed", calculateEffectiveStudySpeed("AUpg", state, config, engine.statResolver).toFixed(2) + "x");
    setText("transistor-arec-speed", calculateEffectiveStudySpeed("ARec", state, config, engine.statResolver).toFixed(2) + "x");

    // Microprocessor
    setText("micro-target", state.devices?.microprocessor?.target ?? "AImp");
    const microT = state.devices?.transistorAllocations?.[state.devices?.microprocessor?.target ?? "AImp"] ?? 0;
    const microMultVal = (state.devices?.microprocessor?.owned ?? 0) > 0 ? (1.12 ** microT).toFixed(2) + "x" : "1.00x";
    setText("micro-bonus", microMultVal);

    // Overclocker
    const oc = state.devices?.overclocker;
    if (oc) {
      setText("overclock-status", oc.active ? "ACTIVE" : "INACTIVE");
      setText("overclock-timer", `${oc.activeSeconds.toFixed(1)}s / ${Math.max(0, oc.remainingDuration).toFixed(1)}s`);
    }

    // Processor
    const procs = state.devices?.processors ?? 0;
    setText("processor-owned", formatInteger(procs));
    setText("processor-bonus", (1 + 0.03 * procs).toFixed(2) + "x");
    const procCost = big(1e-4).mul(big(2).pow(procs));
    setText("processor-cost", formatEnergy(procCost));

    // Hard Disk
    const hds = state.devices?.hardDisks?.owned ?? 0;
    const hdState = state.devices?.hardDisks?.state ?? "off";
    setText("harddisk-state", `${hds} / ${hdState.toUpperCase()}`);
    const hdRate = hdState === "active" ? calculateHardDiskXpRate(hds, state, config, engine.statResolver) : 0;
    setText("harddisk-rate", `${hdRate.toFixed(1)} Data/s`);
    const hdDrain = hdState === "active" ? calculateHardDiskEnergyDrain(hds, state.devices?.hardDisks?.activeSeconds ?? 0, config) : big(0);
    setText("harddisk-drain", "-" + formatEnergy(hdDrain) + "/s");
    setText("harddisk-buffer", formatInteger(state.devices?.hardDisks?.buffer ?? 0) + " Data");

    // Facility Optimization
    const reqLevel = calculateFacilityOptimizationRequirement(state.facilityOptimizations ?? 0, config);
    setText("facility-opt-count", formatInteger(state.facilityOptimizations ?? 0));
    setText("facility-opt-req", `Level ${reqLevel}`);
    const facMult = calculateFacilityDeviceMultiplier(state.facilityOptimizations ?? 0, config);
    setText("facility-opt-mult", facMult.toFixed(2) + "x");
    const facBtn = container.querySelector('[data-field="facility-opt-btn"]');
    if (facBtn) {
      const canFO = (state.computerLevel ?? 1) >= reqLevel;
      facBtn.className = `btn btn--block ${canFO ? "btn--danger" : "btn--muted"}`;
      facBtn.disabled = !canFO && !state.devMode;
      facBtn.textContent = canFO
        ? `PERFORM FACILITY OPTIMIZATION (H = ${(state.facilityOptimizations ?? 0) + 1})`
        : `LOCKED (Req Computer Level ${reqLevel})`;
    }

    // Audit logs update
    setText("audit-count", `${state.auditLogs?.length ?? 0} event(s) recorded`);
    const tbody = container.querySelector("#audit-tbody");
    if (tbody && state.auditLogs && state.auditLogs.length > 0) {
      const recent = state.auditLogs.slice(-15).reverse();
      tbody.innerHTML = recent.map((log) => `
        <tr>
          <td>${log.timestamp}</td>
          <td><strong>${log.actionType}</strong></td>
          <td>${log.itemName}</td>
          <td>${log.purchasedQuantity}</td>
          <td>${log.nominalCostFormatted}</td>
          <td><span class="badge ${log.ruleStatus === 'RULE_ELIGIBLE' ? 'badge--success' : 'badge--warning'}">${log.ruleStatus}</span></td>
          <td>${log.energyAfterFormatted}</td>
        </tr>
      `).join("");
    }
  }

  render.render = render;
  return render;
}
