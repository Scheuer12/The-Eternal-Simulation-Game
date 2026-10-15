import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameEngine } from "../../js/engine.js";
import { createInitialState } from "../../js/state.js";
import { createRenderer } from "../../js/ui.js";
import { calculateCalculationMethodRequirement } from "../../js/formulas.js";

const config = JSON.parse(
  readFileSync(new URL("../../config/game-config.json", import.meta.url), "utf8"),
);

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.innerHTML = "";
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all[0] ?? null;
  }

  querySelectorAll(selector) {
    const results = [];
    // Very simple regex-based selector matching for mock testing
    if (selector.startsWith("[data-field=")) {
      const field = selector.slice(13, -2);
      const regex = new RegExp(`data-field="${field}"[^>]*>([^<]*)<`, "g");
      let match;
      while ((match = regex.exec(this.innerHTML)) !== null) {
        results.push({
          textContent: match[1],
          dataset: { field },
        });
      }
    }
    return results;
  }
}

test("UI: Functional tabs render without throwing and map legacy tabs correctly", () => {
  const container = new MockElement("div");
  const render = createRenderer(container, config, false);

  const state = createInitialState(config);
  state.introState = "active";

  // Tab 1: Energy
  state.ui.activeTab = "energy";
  render(state);
  assert.ok(container.innerHTML.includes("ENERGY STORAGE"));
  assert.ok(container.innerHTML.includes("ENERGY PRODUCTION CASCADE"));
  assert.ok(container.innerHTML.includes("BREAKTHROUGHS & RESET ROUTES"));

  // Legacy tab: 'devices' maps to 'energy'
  state.ui.activeTab = "devices";
  render(state);
  assert.ok(container.innerHTML.includes("ENERGY PRODUCTION CASCADE"));

  // Tab 2: Automation
  state.ui.activeTab = "automation";
  render(state);
  assert.ok(container.innerHTML.includes("COMPUTATIONAL FLEET"));
  assert.ok(container.innerHTML.includes("COMPUTATIONAL HARDWARE"));
  assert.ok(container.innerHTML.includes("INSTRUMENTATION & DISPLAYS"));

  // Legacy tab: 'measure' maps to 'automation'
  state.ui.activeTab = "measure";
  render(state);
  assert.ok(container.innerHTML.includes("COMPUTATIONAL HARDWARE"));

  // Tab 3: History
  state.ui.activeTab = "history";
  render(state);
  assert.ok(container.innerHTML.includes("Facility History & Narrative Log"));

  // Tab 4: Science (visible when unlocked or SP > 0)
  state.sciencePoints = 5;
  state.ui.activeTab = "science";
  render(state);
  assert.ok(container.innerHTML.includes("Science Tree"));
  assert.ok(container.innerHTML.includes("PERK SPECIFICATION"));
});

test("UI: Buy mode gating requires Soft Display for Buy 10 and T2 Soft Display for Buy Max", () => {
  const state = createInitialState(config);
  state.introState = "active";
  state.ui.activeTab = "energy";
  state.energy = "1000";

  const container = new MockElement("div");
  const render = createRenderer(container, config, false);

  // Baseline: no displays owned -> no buy mode selector rendered
  render(state);
  assert.strictEqual(container.innerHTML.includes("buy-mode-selector"), false);

  // Install Soft Data Display -> Buy 1 and Buy 10 available, but NOT Buy Max
  state.devices.softDataDisplay = true;
  render(state);
  assert.ok(container.innerHTML.includes("buy-mode-selector"));
  assert.ok(container.innerHTML.includes('data-mode="1"'));
  assert.ok(container.innerHTML.includes('data-mode="10"'));
  assert.strictEqual(container.innerHTML.includes('data-mode="max"'), false);

  // Install T2 Soft Data Display -> Buy Max unlocked
  state.devices.t2SoftDataDisplay = true;
  render(state);
  assert.ok(container.innerHTML.includes('data-mode="max"'));
});

test("UI: Reset confirmation modal behavior - CMU, Setup, and Synthesis open modal; Algorithm Upgrade executes instantly", () => {
  const state = createInitialState(config);
  state.introState = "active";
  const engine = new GameEngine({ state, config, developmentMode: false });

  // 1. Algorithm Upgrade executes instantly without modal
  state.improvements = 50;
  engine.startAlgorithmUpgrade();
  assert.strictEqual(state.ui.resetModal, null);
  assert.strictEqual(state.upgrades, 1);
  assert.strictEqual(state.improvements, 0);

  // 2. CMU opens confirmation modal when requirement is met
  state.upgrades = calculateCalculationMethodRequirement(state, config);
  engine.openCalculationMethodUpgradeConfirmation();
  assert.strictEqual(state.ui.resetModal, "cmu");

  // Canceling closes modal without reset
  engine.closeResetModal();
  assert.strictEqual(state.ui.resetModal, null);
  assert.strictEqual(state.calculationMethods, 0);

  // Confirming CMU executes reset
  engine.openCalculationMethodUpgradeConfirmation();
  engine.confirmCalculationMethodUpgrade();
  assert.strictEqual(state.ui.resetModal, null);
  assert.strictEqual(state.calculationMethods, 1);

  // 3. Setup Optimization opens confirmation modal when requirement is met
  state.calculationMethods = 10;
  engine.openSetupOptimizationConfirmation();
  assert.strictEqual(state.ui.resetModal, "setup");

  engine.closeResetModal();
  assert.strictEqual(state.ui.resetModal, null);

  // 4. Synthesis opens confirmation modal when laboratory threshold is met
  state.energy = "100e9";
  state.peakEnergy = "100e9";
  engine.openParticleSynthesisConfirmation();
  assert.strictEqual(state.ui.resetModal, "synthesis");

  engine.closeResetModal();
  assert.strictEqual(state.ui.resetModal, null);
});

test("UI: Science Tree hides unrevealed perks with '???' and zero spoiler information", () => {
  const container = new MockElement("div");
  const render = createRenderer(container, config, false);

  const state = createInitialState(config);
  state.introState = "active";
  state.sciencePoints = 5;
  state.ui.activeTab = "science";
  state.ui.activeScienceSubtab = "tree";

  render(state);

  // Unrevealed perks (like quantumSuperposition, particleGenerator) must render '???'
  assert.ok(container.innerHTML.includes("???"));
  assert.ok(container.innerHTML.includes("Undiscovered technology"));

  // Check that secret formula/names for unrevealed perks are NOT leaked into the tree tooltip or node
  assert.strictEqual(container.innerHTML.includes("Quantum Superposition"), false);
  assert.strictEqual(container.innerHTML.includes("Particle Generator"), false);

  // Selecting a perk updates ui.selectedSciencePerkId
  const engine = new GameEngine({ state, config, developmentMode: false });
  engine.selectSciencePerk("redundancyElimination");
  assert.strictEqual(state.ui.selectedSciencePerkId, "redundancyElimination");

  render(state);
  assert.ok(container.innerHTML.includes("Redundancy Elimination"));
  assert.ok(container.innerHTML.includes("science-tree__node-wrap--selected"));

  // Buying redundancy elimination shows CAPPED
  engine.buySciencePerk("redundancyElimination");
  render(state);
  assert.ok(container.innerHTML.includes("CAPPED"));
});

test("UI: History tab records discoveries and opens read-only modal", () => {
  const state = createInitialState(config);
  state.introState = "active";
  const engine = new GameEngine({ state, config, developmentMode: false });

  // Record a discovery entry
  engine.recordHistory({
    title: "Quantum Breakthrough",
    summary: "Discovered anomalous condensation signature.",
    body: "Full operational report from laboratory sensors during initial cosmic capture.",
    kind: "Discoveries",
  });

  assert.strictEqual(state.history.length, 1);
  assert.strictEqual(state.history[0].title, "Quantum Breakthrough");
  assert.strictEqual(state.history[0].kind, "Discoveries");

  // Open history entry
  const entryId = state.history[0].id;
  engine.openHistoryEntry(entryId);
  assert.ok(state.ui.historyModalEntry);
  assert.strictEqual(state.ui.historyModalEntry.title, "Quantum Breakthrough");

  // Render modal
  const container = new MockElement("div");
  const render = createRenderer(container, config, false);
  render(state);
  assert.ok(container.innerHTML.includes("ARCHIVE RECORD // DISCOVERIES"));
  assert.ok(container.innerHTML.includes("Full operational report from laboratory sensors"));

  // Close history modal
  engine.closeHistoryModal();
  assert.strictEqual(state.ui.historyModalEntry, null);
});

test("UI: CRC device card displays base output per CRC, algorithm multiplier logic, and cascade conduit", () => {
  const container = new MockElement("div");
  const render = createRenderer(container, config, false);

  const state = createInitialState(config);
  state.introState = "active";
  state.ui.activeTab = "energy";
  state.crcCount = 2;
  state.improvements = 3; // factor should be 1 + 3 = 4
  state.upgrades = 2;     // 2^2 = 4

  // With Soft Display active
  state.devices.softDataDisplay = true;
  render(state);

  const html = container.innerHTML;
  assert.ok(html.includes("Base rate per CRC"), "Should display Base rate per CRC");
  assert.ok(html.includes("Algorithm Multiplier (1 + I)"), "Should display Algorithm Multiplier (1 + I)");
  assert.ok(html.includes("x4"), "Should display x4 for 3 improvements");
  assert.ok(html.includes("(+1 base / imp)"), "Should indicate (+1 base / imp) in CRC card");
  assert.ok(!html.includes("Upgrade Multiplier (2ᵁ)"), "CRC card should NOT contain Upgrade Multiplier spoiler");
  assert.ok(html.includes("ALGORITHM INJECTION"), "Should render ALGORITHM INJECTION conduit");
  assert.ok(
    html.includes("Algorithm Improvements add +1 base output per CRC each cycle (Active factor: x4)"),
    "Conduit should explain +1 base output per CRC",
  );
  assert.ok(
    html.includes("x4 (+1.0 / cycle)"),
    "Study card should show multiplier and (+1.0 / cycle)",
  );
  assert.ok(
    html.includes("Active Upgrade Multiplier"),
    "Upgrade card should display Active Upgrade Multiplier",
  );
});

