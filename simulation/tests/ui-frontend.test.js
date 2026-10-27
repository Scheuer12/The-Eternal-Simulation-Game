import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "../../js/state.js";
import { GameEngine } from "../../js/engine.js";
import { big } from "../../js/numeric.js";
import { getElement, evaluateElement } from "../../js/component-registry.js";
import {
  calculateAvailableData,
  calculateRequiredDataForNextComputerLevel,
  calculateEffectiveStudySpeed,
  calculateEffectiveStudyDuration,
  calculateTotalDeviceMultiplier,
  calculateBulkDeviceCost,
} from "../../js/formulas.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = JSON.parse(await readFile(path.join(root, "config/game-config.json"), "utf8"));

test("§UI.1: All 11 devices exist with correct categories, lanes, and icons", () => {
  const devices = [
    { id: "autoCalculator_AImp", cat: "automation", lane: "efficiency", icon: "auto-calculator-imp", unique: true },
    { id: "autoCalculator_AUpg", cat: "automation", lane: "efficiency", icon: "auto-calculator-upg", unique: true },
    { id: "autoCalculator_ARec", cat: "automation", lane: "efficiency", icon: "auto-calculator-rec", unique: true },
    { id: "transistorBoard", cat: "computation", lane: "efficiency", icon: "transistor-board", unique: true },
    { id: "microprocessor", cat: "computation", lane: "efficiency", icon: "microprocessor", unique: true },
    { id: "processor", cat: "computation", lane: "efficiency", icon: "processor", unique: false },
    { id: "overclocker", cat: "computation", lane: "efficiency", icon: "overclocker", unique: true },
    { id: "crcGadget", cat: "energy", lane: "resources", icon: "crc-gadget", unique: true },
    { id: "capacitor", cat: "energy", lane: "resources", icon: "capacitor", unique: false },
    { id: "powerCell", cat: "energy", lane: "resources", icon: "power-cell", unique: false },
    { id: "hardDisk", cat: "learning", lane: "resources", icon: "hard-disk", unique: false },
  ];

  for (const d of devices) {
    const el = getElement(d.id);
    assert.ok(el, `Device '${d.id}' must be registered in ELEMENT_REGISTRY`);
    assert.equal(el.category, d.cat, `Device '${d.id}' category mismatch`);
    assert.equal(el.lane, d.lane, `Device '${d.id}' lane mismatch`);
    assert.equal(el.icon, d.icon, `Device '${d.id}' icon mismatch`);
    assert.equal(el.unique, d.unique, `Device '${d.id}' unique mismatch`);
  }
});

test("§UI.2: Revealed vs Hidden states for prestige-locked devices", () => {
  const state = createInitialState(config);

  // Initial state: Processor, Hard Disk, ARec AutoCalculator, and ARed AutoCalculator must NOT be revealed
  const procEval1 = evaluateElement(getElement("processor"), state, config);
  assert.equal(procEval1.isRevealed, false, "Processor must be hidden initially");

  const hdEval1 = evaluateElement(getElement("hardDisk"), state, config);
  assert.equal(hdEval1.isRevealed, false, "Hard Disk must be hidden initially");

  const arecAutoEval1 = evaluateElement(getElement("autoCalculator_ARec"), state, config);
  assert.equal(arecAutoEval1.isRevealed, false, "ARec AutoCalculator must be hidden initially");

  const aredAutoEval1 = evaluateElement(getElement("autoCalculator_ARed"), state, config);
  assert.equal(aredAutoEval1.isRevealed, false, "ARed AutoCalculator must be hidden initially");

  // Perform 1st Facility Optimization (SO1)
  state.facilityOptimizations = 1;
  state.unlocks.processor = true;
  state.unlocks.hardDisk = true;
  state.unlocks.ARec = true;

  // After 1st Facility Optimization: SO1 devices revealed, but ARed AutoCalculator must remain hidden!
  const procEval2 = evaluateElement(getElement("processor"), state, config);
  assert.equal(procEval2.isRevealed, true, "Processor must be revealed after Facility Optimization 1");

  const hdEval2 = evaluateElement(getElement("hardDisk"), state, config);
  assert.equal(hdEval2.isRevealed, true, "Hard Disk must be revealed after Facility Optimization 1");

  const arecAutoEval2 = evaluateElement(getElement("autoCalculator_ARec"), state, config);
  assert.equal(arecAutoEval2.isRevealed, true, "ARec AutoCalculator must be revealed after Facility Optimization 1");

  const aredAutoEval2 = evaluateElement(getElement("autoCalculator_ARed"), state, config);
  assert.equal(aredAutoEval2.isRevealed, false, "ARed AutoCalculator must remain hidden after SO1");

  // Perform 2nd Facility Optimization (SO2)
  state.facilityOptimizations = 2;
  state.unlocks.ARed = true;

  // After 2nd Facility Optimization: ARed AutoCalculator must now be revealed!
  const aredAutoEval3 = evaluateElement(getElement("autoCalculator_ARed"), state, config);
  assert.equal(aredAutoEval3.isRevealed, true, "ARed AutoCalculator must be revealed after Facility Optimization 2 and unlocking ARed");
});

test("§UI.3: AutoCalculator purchase allocates worker and supports toggleAutoStudy", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.energy = big(1e-6); // plenty of energy
  engine.state.unlocks.chips = true;

  // Purchase AutoCalculator — Improvements
  const boughtAImp = engine.purchaseElement("autoCalculator_AImp", 1);
  assert.ok(boughtAImp, "Must successfully purchase autoCalculator_AImp");
  assert.equal(engine.state.devices.chips.allocations.AImp, 1, "Must allocate 1 chip worker to AImp");
  assert.equal(engine.state.devices.chips.enabled?.AImp, true, "Default enabled must be true");

  // Toggle Auto Study off
  engine.toggleAutoStudy("AImp");
  assert.equal(engine.state.devices.chips.enabled?.AImp, false, "Auto study on AImp must be toggled off");

  // When toggled off, ticking should not produce units
  const initialAImp = engine.state.algorithms.AImp.owned;
  engine.tick(1.0);
  assert.equal(engine.state.algorithms.AImp.owned, initialAImp, "Paused worker must not produce units");

  // Toggle Auto Study back on
  engine.toggleAutoStudy("AImp");
  assert.equal(engine.state.devices.chips.enabled?.AImp, true, "Auto study on AImp must be toggled on");
  engine.tick(1.0);
  assert.ok(engine.state.algorithms.AImp.owned > initialAImp, "Active worker must produce units");
});

test("§UI.4: Machine Learning progress ratio and required data display values", () => {
  const state = createInitialState(config);
  state.algorithms.AImp.owned = 120; // 120 * 1 = 120 Data
  state.algorithms.AUpg.owned = 10;  // 10 * 9 = 90 Data

  const currentData = calculateAvailableData(state, config);
  assert.equal(currentData, 210);

  const reqLevel1to2 = calculateRequiredDataForNextComputerLevel(1, config);
  assert.equal(reqLevel1to2, 693);

  const ratio = (currentData / reqLevel1to2) * 100;
  assert.ok(ratio > 30 && ratio < 31, "Progress ratio should be ~30.3%");
});

test("§UI.5: Filter bar category grouping logic", () => {
  const categories = {
    all: ["autoCalculator_AImp", "autoCalculator_AUpg", "transistorBoard", "microprocessor", "overclocker", "crcGadget", "capacitor", "powerCell"],
    automation: ["autoCalculator_AImp", "autoCalculator_AUpg"],
    computation: ["transistorBoard", "microprocessor", "overclocker"],
    energy: ["crcGadget", "capacitor", "powerCell"],
    learning: [],
  };

  const state = createInitialState(config);
  state.unlocks.chips = true;
  state.devices.transistorBoard.owned = true;
  state.devices.microprocessor.owned = 1;

  for (const [cat, expectedIds] of Object.entries(categories)) {
    for (const id of expectedIds) {
      const el = getElement(id);
      assert.ok(el, `Element ${id} must exist`);
      if (cat !== "all") {
        assert.equal(el.category, cat, `Element ${id} should belong to ${cat}`);
      }
    }
  }
});

test("§UI.6: Setup Optimization / Facility Optimization trigger dynamically responds to config", () => {
  const customConfig1 = { facilityOptimization: { initialLevelRequired: 6, levelIncrement: 3 } };
  const customConfig2 = { facilityOptimization: { initialLevelRequired: 4, levelIncrement: 2 } };
  const customConfig3 = { setupOptimization: { initialLevelRequired: 5, levelIncrement: 3 } };

  // Dynamic formula verification
  assert.equal(getElement("facilityOptimization").isUnlocked({ computerLevel: 5 }, customConfig1), false);
  assert.equal(getElement("facilityOptimization").isUnlocked({ computerLevel: 6 }, customConfig1), true);

  // Changing config to Level 4 immediately lowers trigger
  assert.equal(getElement("facilityOptimization").isUnlocked({ computerLevel: 4 }, customConfig2), true);
  assert.equal(getElement("facilityOptimization").isUnlocked({ computerLevel: 3 }, customConfig2), false);

  // Alias setupOptimization in config works identically
  assert.equal(getElement("facilityOptimization").isUnlocked({ computerLevel: 5 }, customConfig3), true);
  assert.equal(getElement("facilityOptimization").isUnlocked({ computerLevel: 4 }, customConfig3), false);
});

test("§UI.7: Algorithm Redesign (ARed) template markup and components present in UI bundle", async () => {
  const uiSource = await readFile(path.join(root, "js/ui.js"), "utf8");

  // ARed study unit, row, title, dur, ring, study button, hotkey G, improve button, and transistor card
  assert.ok(uiSource.includes('id="study-unit-ared"'), "Must contain study-unit-ared");
  assert.ok(uiSource.includes('id="study-row-ared"'), "Must contain study-row-ared");
  assert.ok(uiSource.includes('data-field="ared-title"'), "Must contain ared-title");
  assert.ok(uiSource.includes('data-field="ared-dur"'), "Must contain ared-dur");
  assert.ok(uiSource.includes('data-field="ared-progress-ring"'), "Must contain ared-progress-ring");
  assert.ok(uiSource.includes('data-field="ared-study-btn"'), "Must contain ared-study-btn");
  assert.ok(uiSource.includes('data-field="ared-improve-btn"'), "Must contain ared-improve-btn");
  assert.ok(uiSource.includes('data-field="ared-install-transistor"'), "Must contain ared-install-transistor");
  assert.ok(uiSource.includes('data-field="ared-auto-badge"'), "Must contain ared-auto-badge");

  // Transistor drawer ARed row & reassign buttons
  assert.ok(uiSource.includes('data-field="drawer-row-ared"'), "Must contain drawer-row-ared in transistor drawer");
  assert.ok(uiSource.includes('data-field="drawer-t-ared"'), "Must contain drawer-t-ared in transistor drawer");
  assert.ok(uiSource.includes('data-micro-target-btn="ARed"'), "Must contain Target A.Red button in microprocessor drawer");
});

test("§UI.8: formatNumber handles options objects, integer bounds, and prevents Devices tab crashes", async () => {
  const { formatNumber, formatEnergy } = await import("../../js/numeric.js");
  const { getTooltipContent } = await import("../../js/ui-tooltip-content.js");

  // formatNumber contract safety
  assert.equal(formatNumber(8.5, 1), "8.5");
  assert.equal(formatNumber(8.5, { maxDecimals: 1 }), "8.5");
  assert.equal(formatNumber(8.5, { maxDecimals: 2 }), "8.50");
  assert.equal(formatNumber(99999, { maxDecimals: 1 }), "99,999.0");
  assert.equal(formatNumber(100000, { maxDecimals: 1 }), "100 K");

  // Tooltip content generation for backpropagator does not throw with or without ownership
  const engine = new GameEngine({ config });
  engine.state.facilityOptimizations = 3;
  engine.state.unlocks.backpropagator = true;
  engine.state.algorithms.ARed = { owned: 5 };

  // Not owned
  const tooltipUnowned = getTooltipContent("device-backpropagator", { state: engine.state, config, statResolver: engine.statResolver });
  assert.ok(tooltipUnowned.title.includes("Backpropagator"));

  // Owned
  engine.state.devices.backpropagator = { owned: 1 };
  const tooltipOwned = getTooltipContent("device-backpropagator", { state: engine.state, config, statResolver: engine.statResolver });
  assert.ok(tooltipOwned.title.includes("Backpropagator"));
  assert.ok(tooltipOwned.body.includes("Installed (1 of 1)"));
});
