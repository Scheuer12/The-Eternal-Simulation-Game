import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameEngine } from "../../js/engine.js";
import { createInitialState } from "../../js/state.js";
import { createRenderer } from "../../js/ui.js";
import { big } from "../../js/numeric.js";

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

test("Particle Synthesizer: awakening triggers narrative modal when stored energy reaches threshold", () => {
  const state = createInitialState(config);
  state.introState = "active";
  const engine = new GameEngine({ state, config, developmentMode: false });

  // Initially dormant
  assert.equal(state.particleSynthesizer.awakened, false);
  assert.equal(state.ui.synthesizerAwakenedModal, false);

  // Add energy up to 100 GJ (config.particleLab.synthesizerEnergyRequired)
  engine.addEnergy(100e9);

  // Awakening must have triggered
  assert.equal(state.particleSynthesizer.awakened, true);
  assert.equal(state.ui.synthesizerAwakenedModal, true);

  // Facility history must contain the narrative event
  const narrativeEntry = state.history.find(
    (e) => e.eventId === "narrative-synthesizer-awakening",
  );
  assert.ok(narrativeEntry, "Narrative history entry must exist");
  assert.equal(narrativeEntry.kind, "Narrative");
  assert.ok(narrativeEntry.title.includes("Particle Synthesizer"));

  // Log contains milestone
  assert.ok(state.log.some((l) => l.message?.includes("adjacent chamber has awakened")));
});

test("Particle Synthesizer: enterSynthesizerChamber navigates directly to Science Devices", () => {
  const state = createInitialState(config);
  state.introState = "active";
  const engine = new GameEngine({ state, config, developmentMode: false });

  // Trigger awakening
  engine.addEnergy(100e9);
  assert.equal(state.ui.synthesizerAwakenedModal, true);

  // Enter chamber action
  engine.enterSynthesizerChamber();
  assert.equal(state.ui.synthesizerAwakenedModal, false);
  assert.equal(state.ui.activeTab, "science");
  assert.equal(state.ui.activeScienceSubtab, "devices");
});

test("Particle Synthesizer: card is rendered in Science tab with active button on Run 1", () => {
  const container = new MockElement("div");
  const render = createRenderer(container, config, false);

  const state = createInitialState(config);
  state.introState = "active";
  state.energy = big("100e9");
  state.peakEnergy = big("100e9");
  state.particleSynthesizer.awakened = true;
  state.ui.activeTab = "science";
  state.ui.activeScienceSubtab = "devices";

  render(state);

  // The Science Devices tab must render the Particle Synthesizer card
  assert.ok(container.innerHTML.includes("Particle Sintetizer"), "Must display Particle Sintetizer card");
  assert.ok(container.innerHTML.includes("CHAMBER APPARATUS"), "Must render Chamber Apparatus label");
  assert.ok(container.innerHTML.includes("open-particle-synthesis"), "Must render open-particle-synthesis action");
  assert.ok(!container.innerHTML.includes("disabled"), "Activation button must be enabled when energy >= 100 GJ");
});

test("Particle Synthesizer: Energy tab displays Adjacent Chamber portal pointing to Science tab", () => {
  const container = new MockElement("div");
  const render = createRenderer(container, config, false);

  const state = createInitialState(config);
  state.introState = "active";
  state.energy = big("100e9");
  state.peakEnergy = big("100e9");
  state.particleSynthesizer.awakened = true;
  state.ui.activeTab = "energy";

  render(state);

  // Energy tab must have Adjacent Chamber card pointing to Science Tab
  assert.ok(container.innerHTML.includes("Adjacent Chamber"));
  assert.ok(container.innerHTML.includes("Access in Science Tab →"));
  assert.ok(container.innerHTML.includes('data-action="set-tab" data-tab="science"'));
});

test("Particle Synthesizer: end-to-end synthesis reset from Science tab awards SP and Quarks", () => {
  const state = createInitialState(config);
  state.introState = "active";
  const engine = new GameEngine({ state, config, developmentMode: false });

  // Accumulate 132e12 J (e12 energy, as in user's scenario)
  engine.addEnergy(132e12);
  assert.equal(state.particleSynthesizer.awakened, true);
  engine.enterSynthesizerChamber();

  // Open confirmation
  const opened = engine.openParticleSynthesisConfirmation();
  assert.equal(opened, true);
  assert.equal(state.ui.particleSynthesisModal, "confirm");

  // Confirm synthesis
  const confirmed = engine.confirmParticleSynthesis();
  assert.equal(confirmed, true);

  // Verify post-synthesis state
  assert.equal(state.science.syntheses, 1);
  assert.ok(state.sciencePoints > 0, "Science Points must be granted");
  assert.ok(big(state.quarks.available).gt(0), "Quarks must be earned");
  assert.equal(state.particleSynthesizer.awakened, true, "Synthesizer remains awakened in Science Era");
  assert.equal(state.ui.activeTab, "science", "Directs player to science tab");
  assert.equal(state.ui.activeScienceSubtab, "devices");
});
