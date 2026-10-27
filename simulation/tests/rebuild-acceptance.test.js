import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { big, formatEnergy, formatRate, formatInteger, formatNumber, formatStudyDuration, setGlobalNotation, getGlobalNotation } from "../../js/numeric.js";
import {
  calculateAlgorithmStrengths,
  calculateAlgorithmBaseStrengths,
  calculateAlgorithmPerformance,
  calculateComputerPerformanceMultiplier,
  calculateCapacitorMultiplier,
  calculateEnergyProduction,
  calculateEffectiveStudyDuration,
  calculateEffectiveStudySpeed,
  calculateAvailableData,
  calculateRequiredDataForNextComputerLevel,
  calculateFacilityOptimizationRequirement,
  calculateFacilityDeviceMultiplier,
  calculateProcessorDeviceMultiplier,
  calculateStudySpeedDeviceMultiplier,
  calculateTotalDeviceMultiplier,
  calculateCrcMultiplier,
  calculateHardDiskXpRate,
  calculateDeviceCost,
  calculateBulkDeviceCost,
  calculateTransistorStudySpeedMultiplier,
  calculateMicroprocessorStudyMultiplier,
  calculateBulkGeometricCost,
  calculatePowerCellCapacity,
  calculateEnergyOverflowDecay,
  calculateHardDiskEnergyDrain,
  calculateOverclockDuration,
  calculateOverclockBonusMultiplier,
  calculateEffectiveAvailableData,
  calculateUsefulHardDiskCapacity,
  calculateStudyImproveMilestone,
  calculateStudyImproveMultiplier,
  calculateEnergyEraProgress,
  calculateEnergyEraPercent,
  integrateEnergyStep,
  calculateBackpropagatorMultiplier,
} from "../../js/formulas.js";
import { GameEngine } from "../../js/engine.js";
import { createInitialState, normalizeState, deserializeState } from "../../js/state.js";
import { simulateOfflineProgress } from "../../js/offline-progress.js";
import { saveState, loadState } from "../../js/save-system.js";
import { getTooltipContent } from "../../js/ui-tooltip-content.js";
import { getElement } from "../../js/component-registry.js";
import { assertBigEqual, assertBigClose } from "./assertions.js";

const config = JSON.parse(
  await readFile(new URL("../../config/game-config.json", import.meta.url), "utf8")
);

// -------------------------------------------------------------
// §24: CORE ALGORITHM & CONVERSIONS ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§24.1: Manual study on AImp with 0.5s duration produces 1 AImp unit", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  assert.equal(engine.state.algorithms.AImp.owned, 0);

  engine.startManualStudy("AImp", 1);
  assert.equal(engine.state.manualStudy.active, true);
  assert.equal(engine.state.manualStudy.target, "AImp");

  // Step 0.25s: not yet finished
  engine.tick(0.25);
  assert.equal(engine.state.algorithms.AImp.owned, 0);

  // Step 0.26s: total 0.51s >= 0.5s -> completes
  engine.tick(0.26);
  assert.equal(engine.state.algorithms.AImp.owned, 1);
  assert.equal(engine.state.algorithms.AImp.produced, 1);
  assert.equal(engine.state.manualStudy.active, false);
});

test("§24.2: Manual study on AUpg with 12 AImp available consumes 12 AImp and produces 1 AUpg", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.algorithms.AImp.owned = 15;
  engine.state.algorithms.AImp.produced = 15;

  engine.startManualStudy("AUpg", 1);
  engine.tick(0.55);

  assert.equal(engine.state.algorithms.AUpg.owned, 1);
  assert.equal(engine.state.algorithms.AUpg.produced, 1);
  // 15 - 12 = 3
  assert.equal(engine.state.algorithms.AImp.owned, 3);
});

test("§24.3: Manual study on AUpg with < 12 AImp holds progress at 100% without consuming or producing negative units", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.algorithms.AImp.owned = 5;

  engine.startManualStudy("AUpg", 1);
  // Tick past 0.5s
  engine.tick(0.6);

  // Cannot finish due to insufficient inputs
  assert.equal(engine.state.algorithms.AUpg.owned, 0);
  assert.equal(engine.state.algorithms.AImp.owned, 5);
  assert.equal(engine.state.manualStudy.active, true);
  assert.ok(engine.state.manualStudy.elapsed >= 0.5);

  // Now provide the remaining 7 AImp
  engine.state.algorithms.AImp.owned += 7; // now 12
  engine.tick(0.05);

  // Completed atomically
  assert.equal(engine.state.algorithms.AUpg.owned, 1);
  assert.equal(engine.state.algorithms.AImp.owned, 0);
});

test("§24.4: Manual study on ARec with 12 AUpg available consumes 12 AUpg and produces 1 ARec", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.algorithms.AUpg.owned = 14;
  engine.state.unlocks.ARec = true;

  engine.startManualStudy("ARec", 1);
  engine.tick(0.55);

  assert.equal(engine.state.algorithms.ARec.owned, 1);
  assert.equal(engine.state.algorithms.ARec.produced, 1);
  // 14 - 12 = 2
  assert.equal(engine.state.algorithms.AUpg.owned, 2);
});

test("§24.5: Algorithm Performance AP base strengths and sum", () => {
  const strengths = calculateAlgorithmBaseStrengths(config);
  assert.equal(strengths.AImp, 1e-15);
  assertClose(strengths.AUpg, 24e-15);
  assertClose(strengths.ARec, 576e-15);

  const state = createInitialState(config);
  state.algorithms.AImp.owned = 10;
  state.algorithms.AUpg.owned = 5;
  state.algorithms.ARec.owned = 2;

  // Expected AP = 10 * 1e-15 + 5 * 24e-15 + 2 * 576e-15
  // = 10e-15 + 120e-15 + 1152e-15 = 1282e-15 J/s
  const expectedAP = big("1282e-15");
  const ap = calculateAlgorithmPerformance(state, config);
  assertBigClose(ap, expectedAP, 1e-9);
});

test("§24.6: Computer Level cascading strengths applied to features and global multiplier eliminated", () => {
  const state = createInitialState(config);
  state.algorithms.AImp.owned = 100;
  state.computerLevel = 4;
  state.devices.crcGadget.owned = 1; // 2.0x

  // Obsolete global multiplier must be neutralized to 1.0 to prevent double-scaling
  const mult = calculateComputerPerformanceMultiplier(4, config);
  assert.equal(mult, 1.0);

  // Cascading strengths at level 4:
  // AImp = B * 4 = 4e-15
  // AUpg = 4e-15 * 12 * 5 = 240e-15
  // ARec = 240e-15 * 12 * 5 = 14400e-15
  const strengths = calculateAlgorithmStrengths(4, config);
  assertBigClose(strengths.AImp, big("4e-15"), 1e-20);
  assertBigClose(strengths.AUpg, big("240e-15"), 1e-20);
  assertBigClose(strengths.ARec, big("14400e-15"), 1e-20);

  const ap = calculateAlgorithmPerformance(state, config);
  // ap = 100 * 4e-15 = 400e-15 J/s
  assertBigClose(ap, big("400e-15"), 1e-20);

  const prod = calculateEnergyProduction(state, config);
  // prod = ap * crcGadgetMult (2.0) = 800e-15 J/s
  assertBigClose(prod, big("800e-15"), 1e-20);
});

// -------------------------------------------------------------
// §25: DATA & MACHINE LEARNING ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§25.1: 12 AImp units convert to 1 AUpg, reducing available data from 12 to 9", () => {
  const state = createInitialState(config);
  state.algorithms.AImp.owned = 12;
  const dataBefore = calculateAvailableData(state, config);
  assert.equal(dataBefore, 12); // 12 * 1

  // Perform conversion: 12 AImp -> 1 AUpg
  state.algorithms.AImp.owned -= 12;
  state.algorithms.AUpg.owned += 1;
  const dataAfter = calculateAvailableData(state, config);
  assert.equal(dataAfter, 9); // 1 * 9
});

test("§25.2: 12 AUpg units convert to 1 ARec, reducing available data from 108 to 81", () => {
  const state = createInitialState(config);
  state.algorithms.AUpg.owned = 12;
  const dataBefore = calculateAvailableData(state, config);
  assert.equal(dataBefore, 108); // 12 * 9

  // Perform conversion: 12 AUpg -> 1 ARec
  state.algorithms.AUpg.owned -= 12;
  state.algorithms.ARec.owned += 1;
  const dataAfter = calculateAvailableData(state, config);
  assert.equal(dataAfter, 81); // 1 * 81
});

test("§25.3: Data thresholds for Computer Level: 693, 2997, 7996/7997", () => {
  const req1 = calculateRequiredDataForNextComputerLevel(1, config);
  assert.equal(req1, 693);

  const req2 = calculateRequiredDataForNextComputerLevel(2, config);
  assert.equal(req2, 2997);

  const req3 = calculateRequiredDataForNextComputerLevel(3, config);
  assert.ok(req3 === 7996 || req3 === 7997, `Expected 7996 or 7997, got ${req3}`);
});

test("§25.4: Machine Learning increments level, resets algorithm inventories, preserves hardware", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.algorithms.AImp.owned = 700; // >= 693 Data
  engine.state.devices.chips.owned = 5;
  engine.state.devices.transistorsPurchased = 20;
  engine.state.devices.microprocessor.owned = 1;
  engine.state.devices.overclocker.owned = 1;
  engine.state.powerCells = 2;

  const result = engine.runMachineLearning();
  assert.equal(result, true);
  assert.equal(engine.state.computerLevel, 2);

  // Algorithms reset
  assert.equal(engine.state.algorithms.AImp.owned, 0);
  assert.equal(engine.state.algorithms.AUpg.owned, 0);
  assert.equal(engine.state.algorithms.ARec.owned, 0);

  // Hardware preserved
  assert.equal(engine.state.devices.chips.owned, 5);
  assert.equal(engine.state.devices.transistorsPurchased, 20);
  assert.equal(engine.state.devices.microprocessor.owned, 1);
  assert.equal(engine.state.devices.overclocker.owned, 1);
  assert.equal(engine.state.powerCells, 2);
});

// -------------------------------------------------------------
// §26: FACILITY OPTIMIZATION ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§26.1: Attempting Facility Optimization below Level 9 fails", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  const req = calculateFacilityOptimizationRequirement(0, config);
  engine.state.computerLevel = req - 1;

  const res = engine.performFacilityOptimization();
  assert.equal(res, false);
  assert.equal(engine.state.facilityOptimizations, 0);
});

test("§26.2: Facility Optimization at Level >= 9 increments H and grants logarithmic multiplier D(S) = 1 + alpha * ln(1 + S)", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 9;

  const res = engine.performFacilityOptimization();
  assert.equal(res, true);
  assert.equal(engine.state.facilityOptimizations, 1);

  // Logarithmic curve verification (alpha = 1.35)
  // S=0 -> 1.000, S=1 -> 1.936, S=2 -> 2.483, S=3 -> 2.871
  const mult0 = calculateFacilityDeviceMultiplier(0, config);
  assertClose(mult0, 1.000, 1e-4);

  const mult1 = calculateFacilityDeviceMultiplier(1, config);
  assertClose(mult1, 1.9358, 1e-3);

  const mult2 = calculateFacilityDeviceMultiplier(2, config);
  assertClose(mult2, 2.4831, 1e-3);

  const mult3 = calculateFacilityDeviceMultiplier(3, config);
  assertClose(mult3, 2.8715, 1e-3);

  // Backward compatibility: exponential mode
  const expConfig = {
    ...config,
    facilityOptimization: {
      ...config.facilityOptimization,
      curveMode: "exponential",
      deviceMultiplierBase: 1.09,
    },
  };
  assertClose(calculateFacilityDeviceMultiplier(1, expConfig), 1.09, 1e-4);
  assertClose(calculateFacilityDeviceMultiplier(2, expConfig), 1.09 ** 2, 1e-4);
});

test("§26.3: Facility Optimization preserves Computer Level & MLs, resets energy & study improves, preserves Power Cells, unlocks ARec", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 10;
  engine.state.stats.totalMachineLearnings = 5;
  engine.state.powerCells = 3;
  engine.state.studyImproves.AImp = { completions: 100, claimed: 2 };
  engine.state.devices.chips.owned = 10;
  engine.state.devices.transistorsPurchased = 50;
  engine.state.energy = big("50e-6");

  const res = engine.performFacilityOptimization();
  assert.equal(res, true);

  // Setup Optimization preserves Computer Level and ML count
  assert.equal(engine.state.computerLevel, 10);
  assert.equal(engine.state.stats.totalMachineLearnings, 5);

  // Study Improves reset to 0
  assert.equal(engine.state.studyImproves.AImp.claimed, 0);
  assert.equal(engine.state.studyImproves.AImp.completions, 0);

  // Power Cells PRESERVED as the sole hardware exception
  assert.equal(engine.state.powerCells, 3);

  // ARec unlocked permanently
  assert.equal(engine.state.unlocks.ARec, true);

  // Processor locked until 1e-6 J is reached
  assert.equal(engine.state.unlocks.processor, false);

  // Conventional hardware reset
  assert.equal(engine.state.devices.chips.owned, 0);
  assert.equal(engine.state.devices.transistorsPurchased, 0);
  assert.equal(engine.state.devices.transistorBoard.owned, false);
  assert.equal(engine.state.energy.toNumber(), 0);
});

test("§26.4: Next Facility Optimization requires Computer Level 12 (9 + 3*1)", () => {
  const baseReq = config.facilityOptimization?.initialLevelRequired ?? 9;
  const inc = config.facilityOptimization?.levelIncrement ?? 3;
  const req1 = calculateFacilityOptimizationRequirement(0, config);
  assert.equal(req1, baseReq);

  const req2 = calculateFacilityOptimizationRequirement(1, config);
  assert.equal(req2, baseReq + inc);

  const req3 = calculateFacilityOptimizationRequirement(2, config);
  assert.equal(req3, baseReq + inc * 2);
});

// -------------------------------------------------------------
// §27: DEVICES & UI ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§27.1: AutoCalculator Chips run in parallel with effective duration", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.chips.owned = 4;
  engine.state.devices.chips.allocations.AImp = 4;

  // With 4 chips allocated to AImp, every 0.5s it should produce 4 AImp units
  engine.tick(0.55);
  assert.equal(engine.state.algorithms.AImp.owned, 4);

  engine.tick(0.5);
  assert.equal(engine.state.algorithms.AImp.owned, 8);
});

test("§27.2: Shared transistor pricing C0 * r^N based on total purchased transistors", () => {
  const state = createInitialState(config);
  state.devices.transistorsPurchased = 0;
  state.devices.transistorAllocations.AImp = 0;
  state.devices.transistorAllocations.AUpg = 0;

  // Single cost at N=0: 30 pJ
  const cost0 = calculateBulkGeometricCost(3e-11, 1.4, 0, 1);
  assertBigClose(cost0, big("30e-12"), 1e-9);

  // Purchase 5 on AImp
  state.devices.transistorsPurchased = 5;
  state.devices.transistorAllocations.AImp = 5;

  // Next transistor for AUpg should use N=5
  const costNext = calculateBulkGeometricCost(3e-11, 1.4, 5, 1);
  const expected5 = big(3e-11).mul(big(1.4).pow(5));
  assertBigClose(costNext, expected5, 1e-9);
});

test("§27.3: Microprocessor applies single target speed multiplier based on allocated transistors", () => {
  const state = createInitialState(config);
  state.devices.microprocessor.owned = 1;
  state.devices.microprocessor.target = "AImp";
  state.devices.transistorAllocations.AImp = 10;
  state.devices.transistorAllocations.AUpg = 5;

  const speedAImp = calculateEffectiveStudySpeed("AImp", state, config);
  const speedAUpg = calculateEffectiveStudySpeed("AUpg", state, config);

  const bonusPerT = config.devices?.transistor?.speedBonusPerUnit ?? 0.05;
  const baseMicroMultiplier = config.devices?.microprocessor?.multiplierBase ?? 1.12;
  const expectedAImp = 1.0 * (1 + bonusPerT * 10) * (baseMicroMultiplier ** 10);
  const expectedAUpg = 1.0 * (1 + bonusPerT * 5);

  assertClose(speedAImp, expectedAImp);
  assertClose(speedAUpg, expectedAUpg);
});

test("§27.4: Overclocker burns target transistors, activates for T/ln(1.5), speed bonus 1 + T/3", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.microprocessor.owned = 1;
  engine.state.devices.overclocker.owned = 1;
  engine.state.devices.transistorAllocations.AImp = 15;
  engine.state.devices.transistorsPurchased = 15;

  const duration = calculateOverclockDuration(15);
  // duration = ln(15) / ln(1.5) = 2.708 / 0.405465... = 6.6788...
  assert.ok(duration > 6.6 && duration < 6.8, `Expected ~6.68s, got ${duration}`);

  const res = engine.activateOverclocker("AImp");
  assert.equal(res, true);
  assert.equal(engine.state.devices.overclocker.active, true);
  assert.equal(engine.state.devices.overclocker.consumedTransistors, 15);
  // Transistors consumed
  assert.equal(engine.state.devices.transistorAllocations.AImp, 0);
  assert.equal(engine.state.devices.transistorsPurchased, 0);

  // Overclock speed bonus multiplier: 1 + 15 / 3 = 6.0x
  const bonusMult = calculateOverclockBonusMultiplier(15, config);
  assert.equal(bonusMult, 6.0);

  const baseMicroMultiplier = config.devices?.microprocessor?.multiplierBase ?? 1.12;
  const speed = calculateEffectiveStudySpeed("AImp", engine.state, config);
  assertClose(speed, 1 + (baseMicroMultiplier ** 15 - 1) * 6.0);
});

test("§27.5: Hard Disk active, standby, and off states", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.hardDisks.owned = 1;
  engine.state.powerCells = 1; // 1 mJ stable capacity prevents overflow decay on 1 µJ
  engine.state.energy = big("1e-6");

  // 1. Active: produces +3 Data/s, drains energy
  engine.setHardDiskState("active");
  assert.equal(engine.state.devices.hardDisks.state, "active");

  engine.tick(2.0); // 2 seconds
  assert.equal(engine.state.devices.hardDisks.buffer, 6); // 2s * 3 Data/s = 6
  assert.ok(engine.state.energy.lt("1e-6")); // energy was drained

  // 2. Standby: holds buffer, 0 production, 0 drain
  const energyBeforeStandby = big(engine.state.energy);
  engine.setHardDiskState("standby");
  engine.tick(5.0);
  assert.equal(engine.state.devices.hardDisks.buffer, 6); // held
  assertBigEqual(engine.state.energy, energyBeforeStandby); // no drain

  // 3. Off: wipes buffer
  engine.setHardDiskState("off");
  assert.equal(engine.state.devices.hardDisks.buffer, 0);
});

test("§27.6: Power Cell capacity N * 1 mJ (exempt from SO multiplier) and cost 1 * 2.25^N", () => {
  const state = createInitialState(config);
  state.powerCells = 3;
  state.facilityOptimizations = 1; // 1.09x device multiplier

  const cap = calculatePowerCellCapacity(3, state, config);
  const baseCap = config.devices?.powerCell?.baseCapacity ?? 0.001;
  assertBigClose(cap, big(3 * baseCap), 1e-6);

  const cost3 = calculateBulkGeometricCost(1.0, 2.25, 3, 1);
  const expectedCost = big(1.0).mul(big(2.25).pow(3));
  assertBigClose(cost3, expectedCost, 1e-9);
});

test("§27.7: Bulk purchases (1, 10, 100, 1000) compute exact geometric sum", () => {
  // Geometric series sum: C0 * (r^N) * (r^k - 1) / (r - 1)
  const single = calculateBulkGeometricCost(10, 1.5, 0, 1);
  assertBigClose(single, big(10), 1e-9);

  const bulk10 = calculateBulkGeometricCost(10, 1.5, 0, 10);
  const expected10 = big(10).mul(big(1.5).pow(10).sub(1)).div(0.5);
  assertBigClose(bulk10, expected10, 1e-9);

  const bulk100 = calculateBulkGeometricCost(10, 1.5, 0, 100);
  const expected100 = big(10).mul(big(1.5).pow(100).sub(1)).div(0.5);
  assertBigClose(bulk100, expected100, 1e-9);
});

test("§27.8: Audit Logger records purchases with nominal cost, rule status, and energy after", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.energy = big("1e-6"); // 1 µJ
  engine.state.unlocks.transistorBoard = true;

  const result = engine.purchaseElement("transistorBoard", 1);
  assert.equal(result, true);

  assert.equal(engine.state.auditLogs.length, 1);
  const entry = engine.state.auditLogs[0];
  assert.equal(entry.actionType, "PURCHASE");
  assert.equal(entry.itemKey, "transistorBoard");
  assert.equal(entry.itemName, "Transistor Board");
  assert.equal(entry.purchasedQuantity, 1);
  assert.equal(entry.ruleStatus, "RULE_ELIGIBLE");
  assert.ok(entry.nominalCostFormatted.includes("pJ"));
  assert.ok(entry.energyAfterFormatted.includes("nJ") || entry.energyAfterFormatted.includes("pJ") || entry.energyAfterFormatted.includes("µJ"));
});

test("§27.9: Quicksave and Restore Quicksave", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.energy = big("123e-9");
  engine.state.computerLevel = 5;

  assert.equal(engine.quicksave(), true);
  assert.equal(engine.hasQuicksave(), true);

  // Alter state
  engine.state.energy = big("0");
  engine.state.computerLevel = 1;

  // Restore
  assert.equal(engine.restoreQuicksave(), true);
  assertBigEqual(engine.state.energy, big("123e-9"));
  assert.equal(engine.state.computerLevel, 5);
});

test("§28.1: Capacitor purchase: strictly requires Computer Level 2, succeeds in Dev Mode, debits energy and scales cost", () => {
  // 1. Strict mode at Level 1 should fail
  const engineStrict = new GameEngine({ config, developmentMode: false });
  engineStrict.state.energy = big("1e-7"); // 100 nJ (Capacitor costs 10 nJ)
  engineStrict.state.computerLevel = 1;
  const failResult = engineStrict.purchaseElement("capacitor", 1);
  assert.equal(failResult, false);
  assert.equal(engineStrict.state.devices.capacitors, 0);

  // 2. Strict mode at Level 2 should succeed
  engineStrict.state.computerLevel = 2;
  const successResult = engineStrict.purchaseElement("capacitor", 1);
  assert.equal(successResult, true);
  assert.equal(engineStrict.state.devices.capacitors, 1);
  assertBigClose(engineStrict.state.energy, big("9e-8"), 1e-12); // 100 nJ - 10 nJ = 90 nJ

  // 3. Dev Mode at Level 1 bypasses lock and allows purchasing
  const engineDev = new GameEngine({ config, developmentMode: true });
  engineDev.state.computerLevel = 1;
  engineDev.state.energy = big("1e-7");
  const devResult = engineDev.purchaseElement("capacitor", 1);
  assert.equal(devResult, true);
  assert.equal(engineDev.state.devices.capacitors, 1);
});

test("§28.2: Microprocessor is a unique device with fixed cost, rejecting duplicate or bulk purchases", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.devices.transistorsPurchased = 4;
  engine.state.energy = big("1e-6"); // 1 µJ

  const fixedCost = config.devices?.microprocessor?.initialCost ?? 3e-9;
  const cost0 = calculateDeviceCost("microprocessor", 0, config);
  assertBigClose(cost0, big(fixedCost), 1e-12);

  const cost1 = calculateDeviceCost("microprocessor", 1, config);
  assertBigClose(cost1, big(fixedCost), 1e-12);

  // 1. First purchase succeeds
  const res1 = engine.purchaseElement("microprocessor", 1);
  assert.equal(res1, true);
  assert.equal(engine.state.devices.microprocessor.owned, 1);
  assertBigClose(engine.state.energy, big("1e-6").sub(fixedCost), 1e-12);

  // 2. Second purchase is strictly rejected
  const res2 = engine.purchaseElement("microprocessor", 1);
  assert.equal(res2, false);
  assert.equal(engine.state.devices.microprocessor.owned, 1);

  // 3. Bulk purchase attempt is strictly rejected
  const resBulk = engine.purchaseElement("microprocessor", 10);
  assert.equal(resBulk, false);
  assert.equal(engine.state.devices.microprocessor.owned, 1);
});

test("§28.3: Microprocessor speed bonus applies for the single owned unit", () => {
  const state = createInitialState(config);
  state.devices.transistorAllocations.AImp = 4;
  state.devices.microprocessor.owned = 1;
  state.devices.microprocessor.target = "AImp";

  const baseMult = config.devices?.microprocessor?.multiplierBase ?? 1.12;
  const speed1 = calculateMicroprocessorStudyMultiplier(4, config, 1.0, 1);
  assertClose(speed1, 1 + (baseMult ** 4 - 1));

  // When not owned, bonus is 1.0
  const speed0 = calculateMicroprocessorStudyMultiplier(4, config, 1.0, 0);
  assertClose(speed0, 1.0);
});

test("§28.4: Player with Transistor Board and 6 nJ can install Microprocessor with 0 transistors", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.devices.transistorsPurchased = 0;
  engine.state.energy = big("6e-9"); // 6 nJ

  const evalResult = engine.evaluateElement("microprocessor", 1);
  assert.equal(evalResult.strictUnlocked, true, "Must be unlocked with Transistor Board");
  assert.equal(evalResult.canAfford, true, "Must be affordable with 6 nJ");
  assert.equal(evalResult.canClick, true, "Must be clickable");

  const success = engine.purchaseElement("microprocessor", 1);
  assert.equal(success, true, "Purchase must succeed");
  assert.equal(engine.state.devices.microprocessor.owned, 1);
  assertBigClose(engine.state.energy, big("3e-9"), 1e-12);
});

function assertClose(actual, expected, tolerance = 1e-7) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be close to ${expected} (diff: ${Math.abs(actual - expected)})`
  );
}

// -------------------------------------------------------------
// §29: NOTATION MODES (Engineering, Engineering Num, Alpha)
// -------------------------------------------------------------
test("§29.1: Number formatting complies with the three notation options", () => {
  // 1. Engineering (m, u, n, p, K, M, G, T)
  setGlobalNotation("engineering");
  assert.equal(formatEnergy(0), "0.00 pJ");
  assert.equal(formatEnergy("3e-11"), "30.00 pJ");
  assert.equal(formatEnergy("4e-9"), "4.00 nJ");
  assert.equal(formatEnergy("2e-6"), "2.00 uJ");
  assert.equal(formatEnergy("1.5e-3"), "1.50 mJ");
  assert.equal(formatEnergy(1.5), "1.50 J");
  assert.equal(formatEnergy(2500), "2.50 KJ");
  assert.equal(formatEnergy(1e7), "10.00 MJ");
  assert.equal(formatEnergy(1e9), "1.00 GJ");
  assert.equal(formatEnergy(5e13), "50.00 TJ");
  assert.equal(formatRate("3e-11"), "+30.00 pJ/s");
  assert.equal(formatRate("-1.5e-3"), "-1.50 mJ/s");

  // 2. Engineering Num (-3, -6, -9, ...)
  setGlobalNotation("engineering_num");
  assert.equal(formatEnergy(0), "0.00e-12 J");
  assert.equal(formatEnergy("3e-11"), "30.00e-12 J");
  assert.equal(formatEnergy("4e-9"), "4.00e-9 J");
  assert.equal(formatEnergy("2e-6"), "2.00e-6 J");
  assert.equal(formatEnergy("1.5e-3"), "1.50e-3 J");
  assert.equal(formatEnergy(1.5), "1.50 J");
  assert.equal(formatEnergy(2500), "2.50e3 J");
  assert.equal(formatEnergy(1e7), "10.00e6 J");
  assert.equal(formatEnergy(1e9), "1.00e9 J");
  assert.equal(formatEnergy(5e13), "50.00e12 J");
  assert.equal(formatRate("3e-11"), "+30.00e-12 J/s");
  assert.equal(formatRate("-1.5e-3"), "-1.50e-3 J/s");

  // 3. Alpha (c, b, a, A, B, C)
  setGlobalNotation("alpha");
  assert.equal(formatEnergy(0), "0.00 dJ");
  assert.equal(formatEnergy("3e-11"), "30.00 dJ");
  assert.equal(formatEnergy("4e-9"), "4.00 cJ");
  assert.equal(formatEnergy("2e-6"), "2.00 bJ");
  assert.equal(formatEnergy("1.5e-3"), "1.50 aJ");
  assert.equal(formatEnergy(1.5), "1.50 J");
  assert.equal(formatEnergy(2500), "2.50 AJ");
  assert.equal(formatEnergy(1e7), "10.00 BJ");
  assert.equal(formatEnergy(1e9), "1.00 CJ");
  assert.equal(formatEnergy(5e13), "50.00 DJ");
  assert.equal(formatRate("3e-11"), "+30.00 dJ/s");
  assert.equal(formatRate("-1.5e-3"), "-1.50 aJ/s");

  // Reset to default
  setGlobalNotation("engineering");
});

test("§29.2: GameEngine setNotation persists setting in state and updates global notation", () => {
  const engine = new GameEngine({ config });
  assert.equal(engine.getNotation(), "engineering");
  assert.equal(formatEnergy("3e-11"), "30.00 pJ");

  const ok1 = engine.setNotation("engineering_num");
  assert.equal(ok1, true);
  assert.equal(engine.getNotation(), "engineering_num");
  assert.equal(engine.state.settings.notation, "engineering_num");
  assert.equal(formatEnergy("3e-11"), "30.00e-12 J");

  const ok2 = engine.setNotation("alpha");
  assert.equal(ok2, true);
  assert.equal(engine.getNotation(), "alpha");
  assert.equal(engine.state.settings.notation, "alpha");
  assert.equal(formatEnergy("3e-11"), "30.00 dJ");

  // Invalid notation rejected
  assert.equal(engine.setNotation("invalid_mode"), false);
  assert.equal(engine.getNotation(), "alpha");

  // Reset to engineering
  engine.setNotation("engineering");
  assert.equal(engine.getNotation(), "engineering");
});

test("§29.3: Numbers > 99999 strictly transition to configured notation, while <= 99999 preserve standard representation", () => {
  // 1. Engineering notation
  setGlobalNotation("engineering");

  // Numbers <= 99999 preserve comma separation
  assert.equal(formatInteger(0), "0");
  assert.equal(formatInteger(693), "693");
  assert.equal(formatInteger(12345), "12,345");
  assert.equal(formatInteger(99999), "99,999");
  assert.equal(formatInteger(-5000), "-5,000");

  // Numbers > 99999 transition to Engineering notation
  assert.equal(formatInteger(100000), "100 K");
  assert.equal(formatInteger(123456), "123.456 K");
  assert.equal(formatInteger(1500000), "1.5 M");
  assert.equal(formatInteger(1000000000), "1 G");
  assert.equal(formatInteger(big("1e12")), "1 T");

  // formatNumber (with decimals)
  assert.equal(formatNumber(12.5, 1), "12.5");
  assert.equal(formatNumber(99999, 1), "99,999.0");
  assert.equal(formatNumber(100000, 1), "100 K");
  assert.equal(formatNumber(250000, 1), "250 K");

  // High-speed study duration rate > 99999/s
  assert.equal(formatStudyDuration(0.001), "1.0k/s"); // rate 1000 <= 99999
  assert.equal(formatStudyDuration(0.00001), "100 K/s"); // rate 100000 > 99999
  assert.equal(formatStudyDuration(0.000004), "250 K/s"); // rate 250000 > 99999

  // 2. Engineering Num notation
  setGlobalNotation("engineering_num");

  assert.equal(formatInteger(0), "0");
  assert.equal(formatInteger(99999), "99,999");
  assert.equal(formatInteger(100000), "100e3");
  assert.equal(formatInteger(123456), "123.456e3");
  assert.equal(formatInteger(1500000), "1.5e6");
  assert.equal(formatInteger(1000000000), "1e9");

  assert.equal(formatNumber(12.5, 1), "12.5");
  assert.equal(formatNumber(100000, 1), "100e3");
  assert.equal(formatStudyDuration(0.00001), "100e3/s");

  // 3. Alpha notation
  setGlobalNotation("alpha");

  assert.equal(formatInteger(0), "0");
  assert.equal(formatInteger(99999), "99,999");
  assert.equal(formatInteger(100000), "100 A");
  assert.equal(formatInteger(123456), "123.456 A");
  assert.equal(formatInteger(1500000), "1.5 B");
  assert.equal(formatInteger(1000000000), "1 C");

  assert.equal(formatNumber(12.5, 1), "12.5");
  assert.equal(formatNumber(100000, 1), "100 A");
  assert.equal(formatStudyDuration(0.00001), "100 A/s");

  // Reset to engineering
  setGlobalNotation("engineering");
});

// -------------------------------------------------------------
// §30: STRICT CURRENCY AFFORDABILITY ENFORCEMENT
// -------------------------------------------------------------
test("§30.1: Device purchase strictly blocked when player has insufficient energy", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.algorithms.AUpg.produced = 1;
  engine.state.unlocks.chips = true;

  // Chip cost is 30 pJ (3e-11). Give player only 10 pJ.
  engine.state.energy = big("1e-11");
  assert.equal(engine.state.devices.chips.allocations.AUpg, 0);

  // Attempting to purchase AutoCalculator for AUpg without enough currency MUST FAIL
  const failResult = engine.purchaseElement("autoCalculator_AUpg", 1);
  assert.equal(failResult, false);
  assert.equal(engine.state.devices.chips.allocations.AUpg, 0);
  assertBigEqual(engine.state.energy, big("1e-11")); // Energy untouched!

  // Now even in Dev Mode, insufficient currency MUST STILL FAIL
  engine.state.devMode = true;
  const devFailResult = engine.purchaseElement("autoCalculator_AUpg", 1);
  assert.equal(devFailResult, false);
  assert.equal(engine.state.devices.chips.allocations.AUpg, 0);
  assertBigEqual(engine.state.energy, big("1e-11"));

  // Once energy >= cost (e.g. 50 pJ), purchase succeeds and deducts 30 pJ
  engine.state.energy = big("5e-11");
  const successResult = engine.purchaseElement("autoCalculator_AUpg", 1);
  assert.equal(successResult, true);
  assert.equal(engine.state.devices.chips.allocations.AUpg, 1);
  assertBigClose(engine.state.energy, big("2e-11"), 1e-13);
});

// -------------------------------------------------------------
// §31: ENERGY DECAY & NET RATE SPECIFICATION
// -------------------------------------------------------------
test("§31.1: Overflow Decay is 0 below stable capacity, and scales superlinearly based on config above", () => {
  // 1. With 0 Power Cells, stable capacity is 0 J
  const stableCap0 = calculatePowerCellCapacity(0, {}, config);
  assertBigEqual(stableCap0, big(0));

  // Energy <= stable capacity => decay is strictly 0
  assertBigEqual(calculateEnergyOverflowDecay(0, stableCap0, config), big(0));

  const decayRate = config.decay?.overflowDecayRate ?? 0.009;
  const decayExponent = config.decay?.overflowDecayPower ?? 1.35;

  // Stored energy = 1 J, capacity = 0 J => overflow = 1 J
  // Decay = rate * 1^power
  const decay1 = calculateEnergyOverflowDecay(1, 0, config);
  assertBigClose(decay1, big(decayRate), 1e-9);

  // Stored energy = 10 J, capacity = 0 J => overflow = 10 J
  // Decay = rate * 10^power
  const decay10 = calculateEnergyOverflowDecay(10, 0, config);
  assertBigClose(decay10, big(decayRate).mul(big(10).pow(decayExponent)), 1e-6);

  // 2. With 2 Power Cells, capacity = 2 * baseCapacity
  const baseCap = config.devices?.powerCell?.baseCapacity ?? 0.001;
  const stableCap2 = calculatePowerCellCapacity(2, {}, config);
  assertBigClose(stableCap2, big(2 * baseCap), 1e-9);

  // Stored energy <= capacity => Decay MUST BE 0!
  const decayUnderCap = calculateEnergyOverflowDecay(1.5 * baseCap, stableCap2, config);
  assertBigEqual(decayUnderCap, big(0));

  // Stored energy > capacity => Overflow = 1 * baseCap
  // Decay = rate * (baseCap)^power
  const decayAboveCap = calculateEnergyOverflowDecay(3 * baseCap, stableCap2, config);
  const expectedDecay = big(decayRate).mul(big(baseCap).pow(decayExponent));
  assertBigClose(decayAboveCap, expectedDecay, 1e-12);
});

test("§31.2: Engine tick updates energy by Net Rate via implicit integration step", () => {
  const engine = new GameEngine({ config });
  engine.state.algorithms.AImp.owned = 1000; // Produces energy: 1000 * 1e-15 = 1e-12 J/s (1 pJ/s)
  const prod = calculateEnergyProduction(engine.state, config);
  assertBigClose(prod, big("1e-12"), 1e-15);

  // 1. With energy = 0 and 0 capacity, decay is 0 => net rate is +1 pJ/s
  engine.state.energy = big(0);
  engine.tick(1.0); // 1 second
  assertBigClose(engine.state.energy, big("1e-12"), 1e-15);

  // 2. When stored energy has an excess with decay > production:
  // e.g. energy = 1 J, capacity = 0 => decay >> 1e-12 J/s
  engine.state.energy = big(1.0);
  const decayBefore = calculateEnergyOverflowDecay(engine.state.energy, 0, config);
  const netRate = prod.sub(decayBefore);
  assert.ok(netRate.lt(0)); // Net is negative!

  engine.tick(0.1); // Tick 0.1s
  // Energy must match stable implicit solver integration
  const expectedEnergy = integrateEnergyStep(1.0, prod, 0, 0.1, config);
  assertBigClose(engine.state.energy, expectedEnergy, 1e-9);
  assert.ok(engine.state.energy.lt(1.0), "Energy must decrease due to overflow decay");
});

// -------------------------------------------------------------
// §32: MICROPROCESSOR SINGLE-PURCHASE & MIGRATION SPECIFICATION
// -------------------------------------------------------------
test("§32.1: Microprocessor purchase is strictly capped at 1 and rejects any subsequent purchases", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.devices.transistorsPurchased = 10;
  engine.state.energy = big("1e-6");

  assert.equal(engine.state.devices.microprocessor.owned, 0);

  // First purchase: succeeds
  const buy1 = engine.purchaseElement("microprocessor", 1);
  assert.equal(buy1, true);
  assert.equal(engine.state.devices.microprocessor.owned, 1);

  // Attempt duplicate purchase (single, 10, 100, 1000): all rejected
  assert.equal(engine.purchaseElement("microprocessor", 1), false);
  assert.equal(engine.purchaseElement("microprocessor", 10), false);
  assert.equal(engine.purchaseElement("microprocessor", 100), false);
  assert.equal(engine.purchaseElement("microprocessor", 1000), false);
  assert.equal(engine.state.devices.microprocessor.owned, 1);
});

test("§32.2: Save migration deterministically caps legacy Microprocessor count at 1 without data loss", () => {
  const legacySerializedState = {
    version: 1,
    computerLevel: 3,
    energy: "1e-8",
    devices: {
      microprocessor: {
        owned: 5, // Legacy save had 5 units
        target: "AUpg",
      },
      transistorAllocations: {
        AImp: 0,
        AUpg: 8,
        ARec: 0,
      },
    },
  };

  const loadedState = deserializeState(legacySerializedState, config);
  assert.equal(loadedState.devices.microprocessor.owned, 1, "Legacy microprocessor count > 1 must be capped at 1");
  assert.equal(loadedState.devices.microprocessor.target, "AUpg", "Target selection must be preserved");
  assert.equal(loadedState.devices.transistorAllocations.AUpg, 8, "Transistor allocations must be preserved");
});

// -------------------------------------------------------------
// §33: COMPUTER LEVEL CASCADING STRENGTHS VERIFICATION TABLE
// -------------------------------------------------------------
test("§33.1: Algorithm feature strengths cascade correctly across Computer Level reference points", () => {
  // Verification table from Section 2.4:
  // L=1:  AImp = 1e-15,  AUpg = 24e-15,      ARec = 576e-15
  // L=2:  AImp = 2e-15,  AUpg = 72e-15,      ARec = 2592e-15
  // L=5:  AImp = 5e-15,  AUpg = 360e-15,     ARec = 25920e-15
  // L=9:  AImp = 9e-15,  AUpg = 1080e-15,    ARec = 129600e-15
  // L=20: AImp = 20e-15, AUpg = 5040e-15,    ARec = 1270080e-15

  const testConfig = {
    economy: {
      algorithmBaseStrength: 1e-15,
      algorithmConversionFactor: 12,
    },
  };

  const s1 = calculateAlgorithmStrengths(1, testConfig);
  assertBigClose(s1.AImp, big("1e-15"), 1e-18);
  assertBigClose(s1.AUpg, big("24e-15"), 1e-18);
  assertBigClose(s1.ARec, big("576e-15"), 1e-18);

  const s2 = calculateAlgorithmStrengths(2, testConfig);
  assertBigClose(s2.AImp, big("2e-15"), 1e-18);
  assertBigClose(s2.AUpg, big("72e-15"), 1e-18);
  assertBigClose(s2.ARec, big("2592e-15"), 1e-18);

  const s5 = calculateAlgorithmStrengths(5, testConfig);
  assertBigClose(s5.AImp, big("5e-15"), 1e-18);
  assertBigClose(s5.AUpg, big("360e-15"), 1e-18);
  assertBigClose(s5.ARec, big("25920e-15"), 1e-18);

  const s9 = calculateAlgorithmStrengths(9, testConfig);
  assertBigClose(s9.AImp, big("9e-15"), 1e-18);
  assertBigClose(s9.AUpg, big("1080e-15"), 1e-18);
  assertBigClose(s9.ARec, big("129600e-15"), 1e-18);

  const s20 = calculateAlgorithmStrengths(20, testConfig);
  assertBigClose(s20.AImp, big("20e-15"), 1e-18);
  assertBigClose(s20.AUpg, big("5040e-15"), 1e-18);
  assertBigClose(s20.ARec, big("1270080e-15"), 1e-18);
});

// -------------------------------------------------------------
// §34: ALGORITHM PERFORMANCE USING OWNED INVENTORIES WITHOUT GLOBAL MULTIPLIER
// -------------------------------------------------------------
test("§34.1: AP is the sum of feature contributions at current Computer Level without double scaling", () => {
  const state = createInitialState(config);
  state.computerLevel = 5;
  state.algorithms.AImp.owned = 100;
  state.algorithms.AUpg.owned = 10;
  state.algorithms.ARec.owned = 1;
  state.devices.capacitors = 0; // 1.0x

  // At Level 5:
  // AImp: 100 * 5e-15 = 500e-15
  // AUpg: 10 * 360e-15 = 3600e-15
  // ARec: 1 * 25920e-15 = 25920e-15
  // Total expected AP = 30020e-15 J/s
  const expectedAP = big("30020e-15");
  const ap = calculateAlgorithmPerformance(state, config);
  assertBigClose(ap, expectedAP, 1e-20);

  // Production with no CRC Gadget = AP * 1.0 = 30020e-15 J/s
  const prod = calculateEnergyProduction(state, config);
  assertBigClose(prod, expectedAP, 1e-20);
});

// -------------------------------------------------------------
// §35: CENTRALIZED TOOLTIP SYSTEM ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§35.1: Centralized tooltip content module returns rich content for all expected topics", () => {
  const state = createInitialState(config);
  state.computerLevel = 3;
  state.energy = big("5e-9");
  state.powerCells = 2;

  const topics = [
    "stored_energy",
    "crc_production",
    "facility_level",
    "machine_learning",
    "aimp_study",
    "aupg_study",
    "arec_study",
    "ared_study",
    "microprocessor",
    "transistor_board",
    "transistor",
    "capacitor",
    "power_cell",
    "hard_disk",
    "overclocker",
    "processor",
    "crc_gadget",
    "backpropagator",
    "chip",
    "autoCalculator_AImp",
    "autoCalculator_AUpg",
    "autoCalculator_ARec",
    "autoCalculator_ARed",
  ];

  for (const topic of topics) {
    const content = getTooltipContent(topic, { state, config });
    assert.ok(content, `Tooltip content for '${topic}' must be non-null`);
    assert.ok(content.title, `Tooltip '${topic}' must have a title`);
    assert.ok(content.body, `Tooltip '${topic}' must have a body`);
    assert.ok(content.body.length > 20, `Tooltip '${topic}' body should be informative`);
    assert.ok(content.body.includes("Read more on Info Section"), `Tooltip '${topic}' must end with 'Read more on Info Section'`);
  }
});

// -------------------------------------------------------------
// §36: EXPONENTIAL XP PROGRESSION ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§36.1: Early-game XP requirements (L <= 5) and anchor value match baseline", () => {
  assert.equal(calculateRequiredDataForNextComputerLevel(1, config), 693);
  assert.equal(calculateRequiredDataForNextComputerLevel(2, config), 2997);
  const req3 = calculateRequiredDataForNextComputerLevel(3, config);
  assert.ok(req3 === 7996 || req3 === 7997);
  assert.equal(calculateRequiredDataForNextComputerLevel(4, config), 15034);
  // Anchor level A = 5
  assert.equal(calculateRequiredDataForNextComputerLevel(5, config), 23842);
});

test("§36.2: Exponential XP scaling applies for L > 5 with configured factor G = 1.45", () => {
  const testBaseConfig = {
    ...config,
    dataXP: {
      ...config.dataXP,
      machineLearning: {
        ...config.dataXP.machineLearning,
        xpExponentialStartLevel: 5,
        xpGrowthFactor: 1.45,
      },
    },
  };
  // Configured factor G = 1.45, Anchor A = 5, XP_A = 23842
  assert.equal(calculateRequiredDataForNextComputerLevel(6, testBaseConfig), 34571);
  assert.equal(calculateRequiredDataForNextComputerLevel(7, testBaseConfig), 50128);
  assert.equal(calculateRequiredDataForNextComputerLevel(8, testBaseConfig), 72686);
  assert.equal(calculateRequiredDataForNextComputerLevel(9, testBaseConfig), 105394);
  assert.equal(calculateRequiredDataForNextComputerLevel(10, testBaseConfig), 152821);
  assert.equal(calculateRequiredDataForNextComputerLevel(11, testBaseConfig), 221591);
  assert.equal(calculateRequiredDataForNextComputerLevel(12, testBaseConfig), 321306);
});

test("§36.3: Changing xpGrowthFactor dynamically scales requirements without modifying game logic", () => {
  const customConfig30 = {
    ...config,
    dataXP: {
      ...config.dataXP,
      machineLearning: {
        ...config.dataXP.machineLearning,
        xpExponentialStartLevel: 5,
        xpGrowthFactor: 1.30,
      },
    },
  };
  // Level 6 with +30%: ceil(23842 * 1.30) = 30995
  assert.equal(calculateRequiredDataForNextComputerLevel(6, customConfig30), 30995);

  const customConfig60 = {
    ...config,
    dataXP: {
      ...config.dataXP,
      machineLearning: {
        ...config.dataXP.machineLearning,
        xpExponentialStartLevel: 5,
        xpGrowthFactor: 1.60,
      },
    },
  };
  // Level 6 with +60%: ceil(23842 * 1.60) = 38148
  assert.equal(calculateRequiredDataForNextComputerLevel(6, customConfig60), 38148);

  const customConfigDoubling = {
    ...config,
    dataXP: {
      ...config.dataXP,
      machineLearning: {
        ...config.dataXP.machineLearning,
        xpExponentialStartLevel: 5,
        xpGrowthFactor: 2.00,
      },
    },
  };
  // Level 6 with doubling: ceil(23842 * 2.0) = 47684
  assert.equal(calculateRequiredDataForNextComputerLevel(6, customConfigDoubling), 47684);

  // Verification: higher growth factor produces strictly higher requirements
  const testBaseConfig = {
    ...config,
    dataXP: {
      ...config.dataXP,
      machineLearning: {
        ...config.dataXP.machineLearning,
        xpExponentialStartLevel: 5,
        xpGrowthFactor: 1.45,
      },
    },
  };
  const reqL9_30 = calculateRequiredDataForNextComputerLevel(9, customConfig30);
  const reqL9_45 = calculateRequiredDataForNextComputerLevel(9, testBaseConfig);
  const reqL9_60 = calculateRequiredDataForNextComputerLevel(9, customConfig60);
  assert.ok(reqL9_30 < reqL9_45, "1.30 growth should be less than 1.45");
  assert.ok(reqL9_45 < reqL9_60, "1.45 growth should be less than 1.60");
});

test("§36.4: Machine Learning eligibility & execution uses new exponential requirements", () => {
  const testBaseConfig = {
    ...config,
    dataXP: {
      ...config.dataXP,
      machineLearning: {
        ...config.dataXP.machineLearning,
        xpExponentialStartLevel: 5,
        xpGrowthFactor: 1.45,
      },
    },
  };
  const engine = new GameEngine({ config: testBaseConfig, developmentMode: false });
  engine.state.computerLevel = 6;
  // Level 6 requires 34571 Data to advance to Level 7
  const reqForL7 = calculateRequiredDataForNextComputerLevel(6, testBaseConfig);
  assert.equal(reqForL7, 34571);

  // 1. Below threshold: strictly blocked
  engine.state.algorithms.AImp.owned = 34570;
  assert.equal(engine.runMachineLearning(), false);
  assert.equal(engine.state.computerLevel, 6);

  // 2. At or above threshold: succeeds
  engine.state.algorithms.AImp.owned = 34571;
  assert.equal(engine.runMachineLearning(), true);
  assert.equal(engine.state.computerLevel, 7);
  assert.equal(engine.state.algorithms.AImp.owned, 0); // Algorithm inventory reset
});

test("§36.5: XP progression remains strictly increasing and large numbers do not produce NaN or Infinity", () => {
  let prev = 0;
  for (let L = 1; L <= 50; L++) {
    const req = calculateRequiredDataForNextComputerLevel(L, config);
    assert.ok(Number.isFinite(req), `Level ${L} requirement must be finite`);
    assert.ok(req > prev, `Level ${L} requirement (${req}) must be greater than Level ${L - 1} (${prev})`);
    prev = req;
  }

  // Large level verification
  const reqL500 = calculateRequiredDataForNextComputerLevel(500, config);
  assert.ok(Number.isFinite(reqL500) && !Number.isNaN(reqL500), "Level 500 should be a valid number");
});

test("§36.6: Available Data calculation is completely unaffected by Capacitors", () => {
  const state = createInitialState(config);
  state.algorithms.AImp.owned = 100;
  state.algorithms.AUpg.owned = 10;
  state.algorithms.ARec.owned = 2;
  state.devices.hardDisks.buffer = 50;

  // Expected: 100*1 + 10*9 + 2*81 + 50 = 100 + 90 + 162 + 50 = 402 Data
  const dataBefore = calculateAvailableData(state, config);
  assert.equal(dataBefore, 402);

  // Adding 5 capacitors must NOT change Available Data in any way!
  state.devices.capacitors = 5;
  const dataAfter = calculateAvailableData(state, config);
  assert.equal(dataAfter, 402);
});

// -------------------------------------------------------------
// §37: CAPACITOR CASCADE & INVARIANT ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§37.1: Capacitor multiplier scales effective AImp strength and cascades into AUpg and ARec", () => {
  // Test Level 9 with configured B = 1e-15, F = 12
  const strengths0Caps = calculateAlgorithmStrengths(9, config, 1.0);
  assertBigClose(strengths0Caps.AImp, big("9e-15"), 1e-20);
  assertBigClose(strengths0Caps.AUpg, big("1080e-15"), 1e-20);
  assertBigClose(strengths0Caps.ARec, big("129600e-15"), 1e-20);

  // 1 Capacitor (+50% -> C = 1.5)
  const mult1 = calculateCapacitorMultiplier(1, config);
  assert.equal(mult1, 1.5);
  const strengths1Cap = calculateAlgorithmStrengths(9, config, mult1);
  assertBigClose(strengths1Cap.AImp, big("13.5e-15"), 1e-20);
  assertBigClose(strengths1Cap.AUpg, big("1620e-15"), 1e-20);
  assertBigClose(strengths1Cap.ARec, big("194400e-15"), 1e-20);

  // 2 Capacitors (+100% -> C = 2.0)
  const mult2 = calculateCapacitorMultiplier(2, config);
  assert.equal(mult2, 2.0);
  const strengths2Caps = calculateAlgorithmStrengths(9, config, mult2);
  assertBigClose(strengths2Caps.AImp, big("18e-15"), 1e-20);
  assertBigClose(strengths2Caps.AUpg, big("2160e-15"), 1e-20);
  assertBigClose(strengths2Caps.ARec, big("259200e-15"), 1e-20);
});

test("§37.2: Critical Invariant: Ratio C2 / C1 applies identically across AImp, AUpg, and ARec", () => {
  const levels = [1, 5, 9, 20];
  const C1 = 1.5; // 1 Capacitor
  const C2 = 3.0; // 4 Capacitors: 1 + 4*0.5 = 3.0
  const expectedRatio = C2 / C1; // 2.0

  for (const L of levels) {
    const s1 = calculateAlgorithmStrengths(L, config, C1);
    const s2 = calculateAlgorithmStrengths(L, config, C2);

    const ratioImp = s2.AImp / s1.AImp;
    const ratioUpg = s2.AUpg / s1.AUpg;
    const ratioRec = s2.ARec / s1.ARec;

    assertClose(ratioImp, expectedRatio, 1e-9);
    assertClose(ratioUpg, expectedRatio, 1e-9);
    assertClose(ratioRec, expectedRatio, 1e-9);
  }
});

test("§37.3: Adjacent-tier conversion efficiency is completely independent of Capacitors", () => {
  const levels = [1, 5, 9, 20];
  const F = config.economy?.algorithmConversionFactor ?? 12;

  for (const L of levels) {
    const expectedRatio = F * (L + 1);

    // Test with 0, 1, 2, and 10 capacitors
    for (const c of [0, 1, 2, 10]) {
      const mult = calculateCapacitorMultiplier(c, config);
      const s = calculateAlgorithmStrengths(L, config, mult);

      const upgToImpRatio = s.AUpg / s.AImp;
      const recToUpgRatio = s.ARec / s.AUpg;

      assertClose(upgToImpRatio, expectedRatio, 1e-9);
      assertClose(recToUpgRatio, expectedRatio, 1e-9);
    }
  }
});

test("§37.4: Algorithm Performance AP incorporates cascaded strengths without double multiplication", () => {
  const state = createInitialState(config);
  state.computerLevel = 2;
  state.devices.capacitors = 1; // 1.5x
  state.algorithms.AImp.owned = 10;
  state.algorithms.AUpg.owned = 5;
  state.algorithms.ARec.owned = 1;

  // Level 2, C = 1.5:
  // AImp: 2e-15 * 1.5 = 3e-15 -> 10 owned = 30e-15 J/s
  // AUpg: 3e-15 * 12 * 3 = 108e-15 -> 5 owned = 540e-15 J/s
  // ARec: 108e-15 * 12 * 3 = 3888e-15 -> 1 owned = 3888e-15 J/s
  // Total expected AP = 30 + 540 + 3888 = 4458e-15 J/s
  const expectedAP = big("4458e-15");
  const ap = calculateAlgorithmPerformance(state, config);
  assertBigClose(ap, expectedAP, 1e-20);

  // Production with no CRC Gadget = AP = 4458e-15 J/s
  const prod = calculateEnergyProduction(state, config);
  assertBigClose(prod, expectedAP, 1e-20);
});

test("§37.5: Capacitor cascade preserves reset persistence and device multipliers", () => {
  const state = createInitialState(config);
  state.computerLevel = 9;
  state.devices.capacitors = 2; // Base bonus: 2 * 0.5 = +100%
  state.facilityOptimizations = 1; // Facility mult = 1.09x

  // Total device multiplier = 1.09x
  // Capacitor multiplier = 1 + 0.5 * 2 * 1.09 = 1 + 1.09 = 2.09x
  const mult = calculateCapacitorMultiplier(2, config, 1.09);
  assertClose(mult, 2.09, 1e-9);

  const strengths = calculateAlgorithmStrengths(9, config, mult);
  // Base AImp at Level 9 = 9e-15 -> with 2.09x = 18.81e-15
  assertBigClose(strengths.AImp, big("18.81e-15"), 1e-20);
  // Base AUpg at Level 9 = 1080e-15 -> with 2.09x = 2257.2e-15
  assertBigClose(strengths.AUpg, big("2257.2e-15"), 1e-20);
  // Base ARec at Level 9 = 129600e-15 -> with 2.09x = 270864e-15
  assertBigClose(strengths.ARec, big("270864e-15"), 1e-20);
});

// -------------------------------------------------------------
// §38: SAVE PERSISTENCE & OFFLINE PROGRESS ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§38.1: normalizeState and saveState/loadState preserve lastSavedAt, chip toggles, and chip timers", () => {
  const state = createInitialState(config);
  const testTimestamp = Date.now() - 3600000; // 1 hour ago
  state.lastSavedAt = testTimestamp;
  state.devices.chips.owned = 3;
  state.devices.chips.allocations = { AImp: 2, AUpg: 1, ARec: 0 };
  state.devices.chips.enabled = { AImp: true, AUpg: false, ARec: true };
  state.devices.chips.timers = { AImp: 0.75, AUpg: 1.25, ARec: 0.0 };

  // 1. Direct normalization preserves fields
  const normalized = normalizeState(state, config);
  assert.equal(normalized.lastSavedAt, testTimestamp);
  assert.equal(normalized.devices.chips.enabled.AUpg, false);
  assert.equal(normalized.devices.chips.timers.AImp, 0.75);
  assert.equal(normalized.devices.chips.timers.AUpg, 1.25);

  // 2. Storage roundtrip
  saveState(state, true);
  const loaded = loadState(config, true);
  assert.equal(loaded.devices.chips.enabled.AUpg, false);
  assert.ok(loaded.lastSavedAt >= testTimestamp);
});

test("§38.2: 8-hour offline simulation updates state in place with energy and algorithm production", () => {
  const state = createInitialState(config);
  state.energy = big("1e-9"); // 1 nJ
  state.computerLevel = 1;
  state.devices.chips.owned = 3;
  state.devices.chips.allocations = { AImp: 2, AUpg: 1, ARec: 0 };
  state.unlocks.chips = true;
  state.unlocks.AUpg = true;

  const eightHoursAgo = Date.now() - 8 * 3600 * 1000;
  state.lastSavedAt = eightHoursAgo;

  const now = Date.now();
  const summary = simulateOfflineProgress(state, config, { developmentMode: false, now });

  // 1. Check summary results
  assert.equal(summary.simulatedSeconds, 8 * 3600);
  assert.equal(summary.capped, false);
  assert.ok(summary.studiesCompleted.AUpg > 0, "AUpg should have been produced by AutoCalculators");
  assert.ok(big(summary.netEnergy).gt(0), "Net energy should be positive");

  // 2. Check state in-place mutation
  assert.equal(state.lastSavedAt, now);
  assert.ok(state.algorithms.AUpg.owned > 0, "AUpg owned in state should be > 0");
  assert.ok(big(state.energy).gt(big("1e-9")), "Energy in state should have grown");
  assert.ok(state.stats.totalEnergyProduced.gt(0));

  // 3. Check summary and log stored in state
  assert.ok(state.lastOfflineSummary !== null);
  assert.equal(state.lastOfflineSummary.simulatedSeconds, 8 * 3600);
  assert.ok(state.log.length > 0);
  assert.ok(state.log[0].message.includes("Offline simulation:"));
});

test("§38.3: Offline simulation with 0 elapsed seconds is a deterministic no-op", () => {
  const state = createInitialState(config);
  const now = Date.now();
  state.lastSavedAt = now;
  const initialEnergy = big(state.energy);

  const summary = simulateOfflineProgress(state, config, { now });
  assert.equal(summary.simulatedSeconds, 0);
  assertBigEqual(summary.netEnergy, big(0));
  assertBigEqual(state.energy, initialEnergy);
});

test("§38.4: Subtick integration prevents Euler overflow decay blowup", () => {
  const state = createInitialState(config);
  state.energy = big("100e-9"); // 100 nJ (well above default stable capacity of ~0 J)
  state.computerLevel = 1;
  state.algorithms.AImp.owned = 50;

  const now = Date.now();
  state.lastSavedAt = now - 3600 * 1000; // 1 hour ago

  // If a single Euler step with delta=3600 were run, energy would drop to 0 due to 100nJ * 0.012/s * 3600 = -4320nJ.
  // With 0.25s substeps, energy decays gracefully following exponential decay towards equilibrium.
  simulateOfflineProgress(state, config, { now });

  assert.ok(big(state.energy).gt(0), "Subtick decay simulation must keep energy positive without Euler overshoot");
});

// -------------------------------------------------------------
// §39: HIGH-SPEED STUDY FORMATTING (0.05s THRESHOLD)
// -------------------------------------------------------------
test("§39.1: formatStudyDuration converts durations < 0.05s to rate (/s) and preserves seconds >= 0.05s", () => {
  // 1. Standard durations (>= 0.05s) format in seconds with 2 decimals
  assert.equal(formatStudyDuration(2.0), "2.00s");
  assert.equal(formatStudyDuration(0.5), "0.50s");
  assert.equal(formatStudyDuration(0.12), "0.12s");
  assert.equal(formatStudyDuration(0.05), "0.05s");

  // 2. High-speed durations (< 0.05s) convert automatically to rate per second
  assert.equal(formatStudyDuration(0.04), "25.0/s");
  assert.equal(formatStudyDuration(0.02), "50.0/s");
  assert.equal(formatStudyDuration(0.01), "100.0/s");
  assert.equal(formatStudyDuration(0.005), "200.0/s");
  assert.equal(formatStudyDuration(0.001), "1.0k/s");
  assert.equal(formatStudyDuration(0.0002), "5.0k/s");
  assert.equal(formatStudyDuration(0), "∞/s");
});

// -------------------------------------------------------------
// §40: STUDY IMPROVE ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§40.1: Milestone thresholds match configuration (33, 66, 188, 376, 752, 1504, 3008, 6016)", () => {
  const testConfig = {
    studyImprove: {
      initialMilestones: [33, 66, 188],
      milestoneGrowthFactor: 2,
      speedCoefficient: 0.5,
    },
  };
  // Claimed = 0 -> Level 1 target
  assert.equal(calculateStudyImproveMilestone(0, testConfig), 33);
  // Claimed = 1 -> Level 2 target
  assert.equal(calculateStudyImproveMilestone(1, testConfig), 66);
  // Claimed = 2 -> Level 3 target
  assert.equal(calculateStudyImproveMilestone(2, testConfig), 188);
  // Claimed = 3 -> Level 4 target (188 * 2^1 = 376)
  assert.equal(calculateStudyImproveMilestone(3, testConfig), 376);
  // Claimed = 4 -> Level 5 target (188 * 2^2 = 752)
  assert.equal(calculateStudyImproveMilestone(4, testConfig), 752);
  // Claimed = 5 -> Level 6 target (188 * 2^3 = 1504)
  assert.equal(calculateStudyImproveMilestone(5, testConfig), 1504);
  // Claimed = 6 -> Level 7 target (188 * 2^4 = 3008)
  assert.equal(calculateStudyImproveMilestone(6, testConfig), 3008);
  // Claimed = 7 -> Level 8 target (188 * 2^5 = 6016)
  assert.equal(calculateStudyImproveMilestone(7, testConfig), 6016);
});

test("§40.2: Study improve speed multiplier follows formula 1 + 0.5 * log2(k + 1)", () => {
  const testConfig = {
    studyImprove: {
      speedCoefficient: 0.5,
    },
  };
  // k = 0 -> 1.000x
  assert.equal(calculateStudyImproveMultiplier(0, testConfig), 1.0);
  // k = 1 -> 1 + 0.5 * log2(2) = 1.500x
  assert.equal(calculateStudyImproveMultiplier(1, testConfig), 1.5);
  // k = 2 -> 1 + 0.5 * log2(3) = 1.79248...
  assert.ok(Math.abs(calculateStudyImproveMultiplier(2, testConfig) - 1.79248) < 1e-4);
  // k = 3 -> 1 + 0.5 * log2(4) = 2.000x
  assert.equal(calculateStudyImproveMultiplier(3, testConfig), 2.0);
  // k = 4 -> 1 + 0.5 * log2(5) = 2.16096...
  assert.ok(Math.abs(calculateStudyImproveMultiplier(4, testConfig) - 2.16096) < 1e-4);
  // k = 5 -> 1 + 0.5 * log2(6) = 2.29248...
  assert.ok(Math.abs(calculateStudyImproveMultiplier(5, testConfig) - 2.29248) < 1e-4);
  // k = 10 -> 1 + 0.5 * log2(11) = 2.7297...
  assert.ok(Math.abs(calculateStudyImproveMultiplier(10, testConfig) - 2.7297) < 1e-3);
});

test("§40.3: Manual study completion increments completion counter for active feature", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  assert.equal(engine.state.studyImproves.AImp.completions, 0);

  // Run 1 manual study on AImp (0.5s duration)
  engine.startManualStudy("AImp", 1);
  engine.tick(0.5);

  assert.equal(engine.state.algorithms.AImp.owned, 1);
  assert.equal(engine.state.studyImproves.AImp.completions, 1);
  assert.equal(engine.state.studyImproves.AUpg.completions, 0);
  assert.equal(engine.state.studyImproves.ARec.completions, 0);
});

test("§40.4: AutoCalculator study completions increment completion counter by actual full units", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.chips.owned = 1;
  engine.state.devices.chips.allocations.AImp = 1;
  engine.state.devices.chips.enabled.AImp = true;

  // Tick for 5.0 seconds (10 full cycles at 0.5s each)
  engine.tick(5.0);

  assert.equal(engine.state.algorithms.AImp.owned, 10);
  assert.equal(engine.state.studyImproves.AImp.completions, 10);
});

test("§40.5: Conversion does NOT decrease or erase completion counters", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  // Manually give 66 completions to AImp
  engine.state.studyImproves.AImp.completions = 66;
  engine.state.algorithms.AImp.owned = 24;

  // Run AUpg study (consumes 12 AImp)
  engine.startManualStudy("AUpg", 1);
  engine.tick(0.5);

  assert.equal(engine.state.algorithms.AImp.owned, 12);
  assert.equal(engine.state.algorithms.AUpg.owned, 1);
  // AImp completions must remain 66!
  assert.equal(engine.state.studyImproves.AImp.completions, 66);
  // AUpg completed 1 study
  assert.equal(engine.state.studyImproves.AUpg.completions, 1);
});

test("§40.6: Claiming improve is free (no energy/data/units deducted) and increases study speed", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.energy = big("500e-12");
  engine.state.algorithms.AImp.owned = 100;
  engine.state.studyImproves.AImp.completions = 33; // Level 1 threshold
  engine.state.studyImproves.AImp.claimed = 0;

  const energyBefore = big(engine.state.energy);
  const durBefore = calculateEffectiveStudyDuration("AImp", engine.state, config, engine.statResolver);
  assert.equal(durBefore, 0.5); // 0.50s base

  const claimed = engine.claimStudyImprove("AImp");
  assert.equal(claimed, true);
  assert.equal(engine.state.studyImproves.AImp.claimed, 1);

  // Verify no resources were consumed
  assertBigEqual(engine.state.energy, energyBefore);
  assert.equal(engine.state.algorithms.AImp.owned, 100);

  // Speed increases by improve multiplier
  const mult = calculateStudyImproveMultiplier(1, config);
  const durAfter = calculateEffectiveStudyDuration("AImp", engine.state, config, engine.statResolver);
  assert.ok(Math.abs(durAfter - (0.5 / mult)) < 1e-4);
});

test("§40.7: Sequential multiple claims when player crosses multiple milestones", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  const m1 = calculateStudyImproveMilestone(0, config);
  const m2 = calculateStudyImproveMilestone(1, config);
  const m3 = calculateStudyImproveMilestone(2, config);

  // Player has exactly m3 current owned studies with 0 claims
  engine.state.algorithms.AImp.owned = m3;
  engine.state.studyImproves.AImp.completions = m3;
  engine.state.studyImproves.AImp.claimed = 0;

  // Claim 1: m1 threshold -> Level 1 (claimed = 1)
  assert.equal(engine.claimStudyImprove("AImp"), true);
  assert.equal(engine.state.studyImproves.AImp.claimed, 1);

  // Claim 2: m2 threshold -> Level 2 (claimed = 2)
  assert.equal(engine.claimStudyImprove("AImp"), true);
  assert.equal(engine.state.studyImproves.AImp.claimed, 2);

  // Claim 3: m3 threshold -> Level 3 (claimed = 3)
  assert.equal(engine.claimStudyImprove("AImp"), true);
  assert.equal(engine.state.studyImproves.AImp.claimed, 3);

  // Claim 4: Next is m4, but player only has m3 (< m4) -> must return false
  assert.equal(engine.claimStudyImprove("AImp"), false);
  assert.equal(engine.state.studyImproves.AImp.claimed, 3);
});

test("§40.8: Repeated claims blocked when threshold not reached", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.algorithms.AImp.owned = 20; // Below 33
  engine.state.studyImproves.AImp.completions = 20;

  assert.equal(engine.claimStudyImprove("AImp"), false);
  assert.equal(engine.state.studyImproves.AImp.claimed, 0);
});

test("§40.9: Independent tracking across AImp, AUpg, and ARec", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.studyImproves.AImp.completions = 50;
  engine.state.studyImproves.AImp.claimed = 1;
  engine.state.studyImproves.AUpg.completions = 10;
  engine.state.studyImproves.AUpg.claimed = 0;
  engine.state.studyImproves.ARec.completions = 0;
  engine.state.studyImproves.ARec.claimed = 0;

  const multAImp = calculateStudyImproveMultiplier(engine.state.studyImproves.AImp.claimed, config);
  const multAUpg = calculateStudyImproveMultiplier(engine.state.studyImproves.AUpg.claimed, config);
  const multARec = calculateStudyImproveMultiplier(engine.state.studyImproves.ARec.claimed, config);

  assert.equal(multAImp, calculateStudyImproveMultiplier(1, config));
  assert.equal(multAUpg, 1.0);
  assert.equal(multARec, 1.0);
});

test("§40.10: Machine Learning resets completions to 0 and claimed to 0", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 1;
  engine.state.studyImproves.AImp.completions = 150;
  engine.state.studyImproves.AImp.claimed = 2;
  engine.state.studyImproves.AUpg.completions = 40;
  engine.state.studyImproves.AUpg.claimed = 1;

  // Set data to meet Level 1 ML requirement (693 Data)
  engine.state.algorithms.AImp.owned = 700;
  assert.equal(engine.runMachineLearning(), true);
  assert.equal(engine.state.computerLevel, 2);

  // All study improve completions and claimed must be reset to 0
  assert.equal(engine.state.studyImproves.AImp.completions, 0);
  assert.equal(engine.state.studyImproves.AImp.claimed, 0);
  assert.equal(engine.state.studyImproves.AUpg.completions, 0);
  assert.equal(engine.state.studyImproves.AUpg.claimed, 0);
  assert.equal(engine.state.studyImproves.ARec.completions, 0);
  assert.equal(engine.state.studyImproves.ARec.claimed, 0);
});

test("§40.11: Legacy saves initialize studyImproves safely", () => {
  const legacyRaw = {
    saveVersion: 4,
    computerLevel: 1,
    energy: "100",
    algorithms: { AImp: { owned: 5, produced: 5 } },
    // Missing studyImproves entirely
  };

  const normalized = normalizeState(legacyRaw, config);
  assert.ok(normalized.studyImproves, "studyImproves must exist on normalized state");
  assert.equal(normalized.studyImproves.AImp.completions, 0);
  assert.equal(normalized.studyImproves.AImp.claimed, 0);
  assert.equal(normalized.studyImproves.AUpg.completions, 0);
  assert.equal(normalized.studyImproves.AUpg.claimed, 0);
  assert.equal(normalized.studyImproves.ARec.completions, 0);
  assert.equal(normalized.studyImproves.ARec.claimed, 0);
});

test("§40.12: Offline simulation accurately records completions to studyImproves", () => {
  const state = createInitialState(config);
  state.devices.chips.owned = 1;
  state.devices.chips.allocations.AImp = 1;
  state.devices.chips.enabled.AImp = true;

  const now = Date.now();
  state.lastSavedAt = now - 100 * 1000; // 100 seconds offline
  // At 0.5s per cycle, 100 seconds yields ~200 completions

  simulateOfflineProgress(state, config, { now });

  assert.ok(state.studyImproves.AImp.completions >= 199, "Offline progress must record full completions in studyImproves");
});

test("§40.13: Logarithmic Study Improve multiplier regression and integration suite", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  const A = config.studyImprove?.speedCoefficient ?? 0.5;

  // 1. Zero improves produce 1x multiplier
  assert.equal(calculateStudyImproveMultiplier(0, config), 1.0);
  assert.equal(calculateEffectiveStudySpeed("AImp", engine.state, config), 1.0);

  // 2. Each improve scales study speed via 1 + A * log2(k + 1)
  assertClose(calculateStudyImproveMultiplier(1, config), 1 + A * Math.log2(2));
  assertClose(calculateStudyImproveMultiplier(2, config), 1 + A * Math.log2(3));
  assertClose(calculateStudyImproveMultiplier(3, config), 1 + A * Math.log2(4));
  assertClose(calculateStudyImproveMultiplier(4, config), 1 + A * Math.log2(5));
  assertClose(calculateStudyImproveMultiplier(5, config), 1 + A * Math.log2(6));

  // 3. Independent progression per Algorithm Feature:
  // 3 AImp -> 1 + A * log2(4)x
  // 2 AUpg -> 1 + A * log2(3)x
  // 0 ARec -> 1.0x
  engine.state.studyImproves.AImp.claimed = 3;
  engine.state.studyImproves.AUpg.claimed = 2;
  engine.state.studyImproves.ARec.claimed = 0;

  const mult3 = 1 + A * Math.log2(4);
  const mult2 = 1 + A * Math.log2(3);
  const speedAImp = calculateEffectiveStudySpeed("AImp", engine.state, config);
  const speedAUpg = calculateEffectiveStudySpeed("AUpg", engine.state, config);
  const speedARec = calculateEffectiveStudySpeed("ARec", engine.state, config);

  assertClose(speedAImp, mult3);
  assertClose(speedAUpg, mult2);
  assertClose(speedARec, 1.0);

  // 4. Effective duration is inversely proportional to Improve multiplier
  const baseDur = config.economy?.baseStudyDurationSeconds ?? 0.5;
  const durAImp = calculateEffectiveStudyDuration("AImp", engine.state, config);
  const durAUpg = calculateEffectiveStudyDuration("AUpg", engine.state, config);
  const durARec = calculateEffectiveStudyDuration("ARec", engine.state, config);

  assertClose(durAImp, baseDur / mult3);
  assertClose(durAUpg, baseDur / mult2);
  assertClose(durARec, baseDur / 1.0);

  // 5. Applied exactly once alongside other speed modifiers:
  // Add Transistors and Microprocessor to AImp
  engine.state.devices.transistorAllocations.AImp = 4;
  engine.state.devices.microprocessor.owned = 1;
  engine.state.devices.microprocessor.target = "AImp";

  const tSpeed = calculateTransistorStudySpeedMultiplier(4, config, 1.0);
  const mSpeed = calculateMicroprocessorStudyMultiplier(4, config, 1.0, 1);
  const hardwareSpeed = tSpeed * mSpeed;
  const combinedSpeed = calculateEffectiveStudySpeed("AImp", engine.state, config);

  // Combined speed must be exactly hardwareSpeed * improveMultiplier
  assertClose(combinedSpeed, hardwareSpeed * mult3);

  // 6. Machine Learning resets Improve multipliers back to 1.0x
  engine.state.computerLevel = 1;
  engine.state.algorithms.AImp.owned = 700; // Meet XP threshold
  engine.runMachineLearning();

  assert.equal(engine.state.studyImproves.AImp.claimed, 0);
  assert.equal(engine.state.studyImproves.AUpg.claimed, 0);
  assert.equal(engine.state.studyImproves.ARec.claimed, 0);
  assert.equal(calculateStudyImproveMultiplier(engine.state.studyImproves.AImp.claimed, config), 1.0);

  // 7. Changing configured coefficient alters the logarithmic result dynamically
  const customConfig = { ...config, studyImprove: { ...config.studyImprove, speedCoefficient: 0.2 } };
  assertClose(calculateStudyImproveMultiplier(1, customConfig), 1.2);
  assertClose(calculateStudyImproveMultiplier(3, customConfig), 1.4);
  assertClose(calculateStudyImproveMultiplier(7, customConfig), 1.6);
});

// -------------------------------------------------------------
// §41: INSTALL TRANSISTOR ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§41.1: Install Transistor purchases exactly 1 transistor and immediately allocates to target study", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.energy = big("500e-12"); // Plenty of energy
  assert.equal(engine.state.devices.transistorsPurchased, 0);
  assert.equal(engine.state.devices.transistorAllocations.AUpg, 0);

  const cost = calculateBulkDeviceCost("transistor", 0, 1, config);
  const success = engine.installTransistor("AUpg");
  assert.equal(success, true);

  // Exactly 1 transistor purchased and allocated to AUpg
  assert.equal(engine.state.devices.transistorsPurchased, 1);
  assert.equal(engine.state.devices.transistorAllocations.AUpg, 1);
  assert.equal(engine.state.devices.transistorAllocations.AImp, 0);
  assert.equal(engine.state.devices.transistorAllocations.ARec, 0);

  // Energy debited exactly once
  assertBigEqual(engine.state.energy, big("500e-12").sub(cost));
});

test("§41.2: Global price is shared across all study install actions", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.energy = big("10e-9");

  // Buy transistor via AImp
  engine.installTransistor("AImp");
  assert.equal(engine.state.devices.transistorsPurchased, 1);

  // Next cost for AUpg and ARec must reflect N=1 global transistors purchased
  const nextCostGlobal = calculateBulkDeviceCost("transistor", 1, 1, config);
  const c0 = config.devices.transistor.initialCost;
  const mult = config.devices.transistor.costMultiplier;
  const expectedNextCost = big(c0).mul(mult); // C0 * r^1

  assertBigEqual(nextCostGlobal, expectedNextCost);
});

test("§41.3: Purchasing on AUpg increases the price for AImp and ARec", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.energy = big("10e-9");

  const costBefore = calculateBulkDeviceCost("transistor", engine.state.devices.transistorsPurchased, 1, config);
  engine.installTransistor("AUpg");
  const costAfter = calculateBulkDeviceCost("transistor", engine.state.devices.transistorsPurchased, 1, config);

  assert.ok(costAfter.gt(costBefore), "Next transistor cost must be strictly higher");
});

test("§41.4: Install Transistor strictly blocked when energy is insufficient", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.energy = big(0); // 0 energy

  const success = engine.installTransistor("AImp");
  assert.equal(success, false);
  assert.equal(engine.state.devices.transistorsPurchased, 0);
  assert.equal(engine.state.devices.transistorAllocations.AImp, 0);
});

test("§41.5: Install Transistor respects Transistor Board unlock requirement", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = false; // Board locked
  engine.state.energy = big("10e-9");

  const success = engine.installTransistor("AImp");
  assert.equal(success, false);
  assert.equal(engine.state.devices.transistorsPurchased, 0);
});

test("§41.6: Transistor Board redistribution remains functional and sees installed transistors", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.energy = big("10e-9");

  // Install 3 transistors into AImp
  engine.installTransistor("AImp");
  engine.installTransistor("AImp");
  engine.installTransistor("AImp");
  assert.equal(engine.state.devices.transistorsPurchased, 3);
  assert.equal(engine.state.devices.transistorAllocations.AImp, 3);

  // Move 1 to AUpg via Transistor Board reassign action
  engine.reassignTransistors("AImp", "AUpg", 1);
  assert.equal(engine.state.devices.transistorAllocations.AImp, 2);
  assert.equal(engine.state.devices.transistorAllocations.AUpg, 1);
  assert.equal(engine.state.devices.transistorsPurchased, 3); // Total intact
});

// -------------------------------------------------------------
// §42: AVAILABLE DATA CAP ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§42.1: Available Data is capped at XP requirement for next Computer Level", () => {
  const state = createInitialState(config);
  state.computerLevel = 1; // Req = 693
  const req = calculateRequiredDataForNextComputerLevel(1, config);
  assert.equal(req, 693);

  // 1. Below threshold: effective equals raw
  state.algorithms.AImp.owned = 300;
  assert.equal(calculateAvailableData(state, config), 300);
  assert.equal(calculateEffectiveAvailableData(state, config), 300);

  // 2. Exactly at threshold
  state.algorithms.AImp.owned = 693;
  assert.equal(calculateAvailableData(state, config), 693);
  assert.equal(calculateEffectiveAvailableData(state, config), 693);

  // 3. Above threshold: effective clamped to 693
  state.algorithms.AImp.owned = 1500;
  assert.equal(calculateAvailableData(state, config), 1500); // Raw is 1500
  assert.equal(calculateEffectiveAvailableData(state, config), 693); // Effective is 693
});

test("§42.2: Studies and Energy production continue normally when at Data cap", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.algorithms.AImp.owned = 1000; // Well above 693 cap

  // Perform manual study on AImp
  engine.startManualStudy("AImp", 1);
  engine.tick(0.5);

  assert.equal(engine.state.algorithms.AImp.owned, 1001);
  assert.ok(big(engine.state.energy).gt(0), "Energy must continue producing normally at data cap");
});

test("§42.3: No Data overflow carries forward into next Computer Level after Machine Learning", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 1; // Req = 693
  engine.state.algorithms.AImp.owned = 5000; // 5000 Data (massive surplus over 693)

  assert.equal(calculateEffectiveAvailableData(engine.state, config), 693);
  assert.equal(engine.runMachineLearning(), true);

  assert.equal(engine.state.computerLevel, 2);
  // Algorithms and buffer reset -> Available Data starts at exactly 0 for Level 2
  assert.equal(calculateAvailableData(engine.state, config), 0);
  assert.equal(calculateEffectiveAvailableData(engine.state, config), 0);
});

test("§42.4: Hard Disk pauses production and energy consumption when data cap is reached", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 1; // Req = 693
  engine.state.algorithms.AImp.owned = 693; // Cap already satisfied by algorithms
  engine.state.devices.hardDisks.owned = 2;
  engine.state.devices.hardDisks.state = "active";
  engine.state.devices.hardDisks.activeSeconds = 10;
  engine.state.devices.hardDisks.buffer = 0;
  engine.state.energy = big("10e-9");

  const energyBefore = big(engine.state.energy);
  // Tick for 5 seconds
  engine.tick(5.0);

  // Hard Disk should be dataPaused: 0 buffer added, 0 activeSeconds added
  assert.equal(engine.state.devices.hardDisks.dataPaused, true);
  assert.equal(engine.state.devices.hardDisks.buffer, 0);
  assert.equal(engine.state.devices.hardDisks.activeSeconds, 10);
});

test("§42.5: Hard Disk buffer is preserved when paused at Data cap", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 1; // Req = 693
  engine.state.algorithms.AImp.owned = 600;
  engine.state.devices.hardDisks.owned = 1;
  engine.state.devices.hardDisks.state = "active";
  engine.state.devices.hardDisks.buffer = 93; // 600 + 93 = 693 (cap reached)
  engine.state.energy = big("10e-9");

  engine.tick(2.0);

  assert.equal(engine.state.devices.hardDisks.buffer, 93);
  assert.equal(engine.state.devices.hardDisks.dataPaused, true);
});

test("§42.6: Hard Disk resumes production when capacity opens up (e.g. converting AImp to AUpg)", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 1; // Req = 693
  engine.state.algorithms.AImp.owned = 693; // Cap met
  engine.state.devices.hardDisks.owned = 1;
  engine.state.devices.hardDisks.state = "active";
  engine.state.devices.hardDisks.buffer = 0;
  engine.state.energy = big("10e-9");

  engine.tick(1.0);
  assert.equal(engine.state.devices.hardDisks.dataPaused, true);

  // Convert 12 AImp into 1 AUpg (reducing Data from 12 to 9, net -3 Data)
  // Run 1 AUpg study:
  engine.startManualStudy("AUpg", 1);
  engine.tick(0.5); // AUpg study finishes, reducing AImp from 693 to 681

  // Next tick detects opened capacity (3 Data) and resumes Hard Disk!
  engine.tick(0.05);
  assert.equal(engine.state.devices.hardDisks.dataPaused, false);
  assert.ok(engine.state.devices.hardDisks.buffer > 0, "Hard disk resumed generating data");
});

test("§42.7: Mid-tick generation is clamped to remaining capacity and charges proportional energy", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 1; // Req = 693
  engine.state.algorithms.AImp.owned = 690; // Exactly 3 Data needed
  engine.state.devices.hardDisks.owned = 1; // Generates 3 Data/sec
  engine.state.devices.hardDisks.state = "active";
  engine.state.devices.hardDisks.buffer = 0;
  engine.state.devices.hardDisks.activeSeconds = 0;
  engine.state.energy = big("10e-9");

  // In 2.0s, at 3 Data/s, disk would normally produce 6 Data.
  // But useful capacity is only 3 Data!
  // Disk should produce exactly 3 Data in 1.0s and pause for the remaining 1.0s!
  engine.tick(2.0);

  assert.equal(engine.state.devices.hardDisks.buffer, 3);
  assert.equal(engine.state.devices.hardDisks.dataPaused, true);
  // activeSeconds advanced by 1.0s, not 2.0s
  assert.equal(engine.state.devices.hardDisks.activeSeconds, 1.0);
});

// -------------------------------------------------------------
// §43: ENERGY ERA PROGRESS BAR ACCEPTANCE TESTS
// -------------------------------------------------------------
test("§43.1: Zero energy gives 0.0% progress", () => {
  assert.equal(calculateEnergyEraProgress(0, config), 0);
  assert.equal(calculateEnergyEraPercent(0, config), 0.0);
});

test("§43.2: At scale S = 1 pJ, progress is positive and matches logarithmic curve (~1.3%)", () => {
  const p = calculateEnergyEraProgress(1e-12, config);
  const pct = calculateEnergyEraPercent(1e-12, config);
  assert.ok(p > 0.012 && p < 0.014, `Progress at 1 pJ should be ~1.3% (got ${p})`);
  assert.equal(pct, 1.3);
});

test("§43.3: Representative intermediate values display expected logarithmic progression", () => {
  // 1 nJ -> ~13.0%
  const pct1nJ = calculateEnergyEraPercent(1e-9, config);
  assert.ok(pct1nJ >= 12.8 && pct1nJ <= 13.2, `1 nJ should be ~13.0% (got ${pct1nJ}%)`);

  // 1 uJ -> ~26.0%
  const pct1uJ = calculateEnergyEraPercent(1e-6, config);
  assert.ok(pct1uJ >= 25.8 && pct1uJ <= 26.3, `1 uJ should be ~26.0% (got ${pct1uJ}%)`);

  // 1 mJ -> ~39.1%
  const pct1mJ = calculateEnergyEraPercent(1e-3, config);
  assert.ok(pct1mJ >= 38.9 && pct1mJ <= 39.3, `1 mJ should be ~39.1% (got ${pct1mJ}%)`);

  // 1 J -> ~52.1%
  const pct1J = calculateEnergyEraPercent(1.0, config);
  assert.ok(pct1J >= 51.9 && pct1J <= 52.3, `1 J should be ~52.1% (got ${pct1J}%)`);

  // 1 GJ -> ~91.3%
  const pct1GJ = calculateEnergyEraPercent(1e9, config);
  assert.ok(pct1GJ >= 91.0 && pct1GJ <= 91.5, `1 GJ should be ~91.3% (got ${pct1GJ}%)`);
});

test("§43.4: Curve is strictly concave: marginal visual percentage decreases as stored energy increases", () => {
  const p0 = calculateEnergyEraProgress(0, config);
  const p1 = calculateEnergyEraProgress(1e-9, config);   // delta = 1 nJ
  const p2 = calculateEnergyEraProgress(2e-9, config);   // delta = 1 nJ

  const gain1 = p1 - p0;
  const gain2 = p2 - p1;
  assert.ok(gain1 > gain2, "First 1 nJ must provide greater visual gain than second 1 nJ (concavity)");
});

test("§43.5: Exactly 100.0% is achieved at 100e9 J", () => {
  const pTarget = calculateEnergyEraProgress(100e9, config);
  const pctTarget = calculateEnergyEraPercent(100e9, config);

  assert.equal(pTarget, 1.0);
  assert.equal(pctTarget, 100.0);
});

test("§43.6: Truncation prevents premature 100.0% display below target (e.g. at 99.99e9 J)", () => {
  const pNear = calculateEnergyEraProgress(99.99e9, config);
  const pctNear = calculateEnergyEraPercent(99.99e9, config);

  assert.ok(pNear < 1.0, "Progress below target must be strictly less than 1.0");
  assert.equal(pctNear, 99.9); // Never rounds to 100.0% prematurely
});

test("§43.7: Above 100e9 J, progress is clamped to 100.0%", () => {
  const pAbove = calculateEnergyEraProgress(200e9, config);
  const pctAbove = calculateEnergyEraPercent(200e9, config);

  assert.equal(pAbove, 1.0);
  assert.equal(pctAbove, 100.0);
});

test("§43.8: Spending energy reduces displayed progress", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.energy = big("1e-9"); // 1 nJ

  const pBefore = calculateEnergyEraProgress(engine.state.energy, config);
  const pctBefore = calculateEnergyEraPercent(engine.state.energy, config);

  // Spend energy buying a transistor (cost = 250 pJ)
  engine.installTransistor("AImp");

  const pAfter = calculateEnergyEraProgress(engine.state.energy, config);
  const pctAfter = calculateEnergyEraPercent(engine.state.energy, config);

  assert.ok(pAfter < pBefore, "Normalized progress must strictly decrease when energy is spent");
  assert.ok(pctAfter < pctBefore, "Displayed percentage decreases when energy is spent");
});

test("§43.9: Changing logScale changes visual percentage without altering energy economy", () => {
  const customConfig = {
    ...config,
    energyEraProgress: {
      ...config.energyEraProgress,
      logScale: 1e-9, // Larger S delays visible progress
    },
  };

  const pStandard = calculateEnergyEraProgress(1e-10, config);
  const pCustom = calculateEnergyEraProgress(1e-10, customConfig);

  assert.ok(pCustom < pStandard, "Larger logScale S delays visible progression");
});

test("§43.10: Target remains internal and is not exposed in tooltips or UI", () => {
  const tooltipSummary = getTooltipContent("energy-summary", { state: {}, config });
  assert.ok(!tooltipSummary.body.includes("100e9"), "Tooltip must not reveal 100e9 J milestone");
  assert.ok(!tooltipSummary.body.includes("Particle Synthesizer"), "Tooltip must not reveal Particle Synthesizer");
});

// ---------------------------------------------------------------------------
// §44: HOTKEYS & PRODUCTION RATE ADJUSTMENTS
// ---------------------------------------------------------------------------

test("§44.1: Hotkey 'A' triggers AImp study and holding 'A' keeps producing AImp across ticks", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  assert.equal(engine.state.algorithms.AImp.owned, 0);

  // Press 'A'
  engine.setHotkeyState("A", true);
  assert.equal(engine.continuousStudyTarget, "AImp");
  assert.equal(engine.state.manualStudy.active, true);
  assert.equal(engine.state.manualStudy.target, "AImp");

  // Tick 0.5s (1 base cycle)
  engine.tick(0.5);
  assert.equal(engine.state.algorithms.AImp.owned, 1);
  assert.equal(engine.state.manualStudy.active, true, "Study remains active while held");

  // Tick another 1.0s (2 more cycles)
  engine.tick(1.0);
  assert.equal(engine.state.algorithms.AImp.owned, 3);

  // Release 'A'
  engine.setHotkeyState("A", false);
  assert.equal(engine.continuousStudyTarget, null);
});

test("§44.2: Hotkey 'U' triggers AUpg study when unlocked and converts 12 AImp -> 1 AUpg", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.unlocks.AUpg = true;
  engine.state.algorithms.AImp.owned = 36; // Enough for 3 AUpg

  engine.setHotkeyState("U", true);
  assert.equal(engine.continuousStudyTarget, "AUpg");

  // Tick 0.5s -> completes 1 AUpg, consumes 12 AImp
  engine.tick(0.5);
  assert.equal(engine.state.algorithms.AUpg.owned, 1);
  assert.equal(engine.state.algorithms.AImp.owned, 24);

  // Tick another 0.5s -> completes second AUpg
  engine.tick(0.5);
  assert.equal(engine.state.algorithms.AUpg.owned, 2);
  assert.equal(engine.state.algorithms.AImp.owned, 12);

  engine.setHotkeyState("U", false);
});

test("§44.3: Hotkey 'U' blocked when AUpg is locked", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.unlocks.AUpg = false;

  engine.setHotkeyState("U", true);
  assert.notEqual(engine.continuousStudyTarget, "AUpg");
  engine.setHotkeyState("U", false);
});

test("§44.4: Hotkey 'R' triggers ARec study when unlocked and converts 12 AUpg -> 1 ARec", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.unlocks.ARec = true;
  engine.state.algorithms.AUpg.owned = 24;

  engine.setHotkeyState("R", true);
  assert.equal(engine.continuousStudyTarget, "ARec");

  engine.tick(0.5);
  assert.equal(engine.state.algorithms.ARec.owned, 1);
  assert.equal(engine.state.algorithms.AUpg.owned, 12);

  engine.setHotkeyState("R", false);
});

test("§44.5: Hotkey 'R' blocked when ARec is locked", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.unlocks.ARec = false;

  engine.setHotkeyState("R", true);
  assert.notEqual(engine.continuousStudyTarget, "ARec");
  engine.setHotkeyState("R", false);
});

test("§44.6: Hotkey 'T' installs transistor into AImp and continuous holding purchases as energy permits", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  // Give enough energy for 3 transistors (250 pJ, 450 pJ, 810 pJ -> total 1510 pJ)
  engine.state.energy = big("2000e-12");

  assert.equal(engine.state.devices.transistorsPurchased, 0);
  assert.equal(engine.state.devices.transistorAllocations.AImp, 0);

  // Press 'T' (initial press installs 1)
  engine.setHotkeyState("T", true);
  assert.equal(engine.state.devices.transistorsPurchased, 1);
  assert.equal(engine.state.devices.transistorAllocations.AImp, 1);

  // Tick while held -> installs next transistor
  engine.tick(0.05);
  assert.equal(engine.state.devices.transistorsPurchased, 2);
  assert.equal(engine.state.devices.transistorAllocations.AImp, 2);

  // Tick again -> installs 3rd
  engine.tick(0.05);
  assert.equal(engine.state.devices.transistorsPurchased, 3);
  assert.equal(engine.state.devices.transistorAllocations.AImp, 3);

  // Now remaining energy is ~490 pJ, but 4th transistor costs ~1458 pJ -> tick does not purchase
  engine.tick(0.05);
  assert.equal(engine.state.devices.transistorsPurchased, 3);

  engine.setHotkeyState("T", false);
});

test("§44.7: Hotkey 'T' blocked when Transistor Board is not owned", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = false;
  engine.state.energy = big("100e-6");

  engine.setHotkeyState("T", true);
  assert.equal(engine.state.devices.transistorsPurchased, 0);
  engine.setHotkeyState("T", false);
});

test("§44.8: Hotkey 'M' triggers Machine Learning when eligible", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 1; // Requires 693 data
  engine.state.algorithms.AImp.owned = 700;

  engine.setHotkeyState("M", true);
  assert.equal(engine.state.computerLevel, 2, "Machine Learning advances Computer Level");
  assert.equal(engine.state.algorithms.AImp.owned, 0, "Inventories reset upon ML");
  engine.setHotkeyState("M", false);
});

test("§44.9: Hotkey 'M' blocked when Machine Learning requirement is not met", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 1;
  engine.state.algorithms.AImp.owned = 100; // Below 693

  engine.setHotkeyState("M", true);
  assert.equal(engine.state.computerLevel, 1, "Level does not advance when ineligible");
  engine.setHotkeyState("M", false);
});

test("§44.10: Releasing a hotkey stops continuous study cleanly", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.setHotkeyState("A", true);
  engine.tick(0.5);
  assert.equal(engine.state.algorithms.AImp.owned, 1);

  // Release hotkey
  engine.setHotkeyState("A", false);
  assert.equal(engine.continuousStudyTarget, null);

  // After finishing residual study, further ticks do not produce more
  engine.tick(0.5);
  engine.tick(0.5);
  assert.equal(engine.state.algorithms.AImp.owned, 1, "No further studies produced after key release");
  assert.equal(engine.state.manualStudy.active, false);
});

test("§44.11: Study improve multiplier applies over final production time/rate multiplicatively", () => {
  const state = createInitialState(config);
  state.devices.transistorAllocations.AImp = 2; // +5% speed (1.05x)
  const durBefore = calculateEffectiveStudyDuration("AImp", state, config);
  const speedBefore = calculateEffectiveStudySpeed("AImp", state, config);

  // Claim improve level 1 (1.5x speed)
  state.studyImproves.AImp.claimed = 1;
  const durAfter = calculateEffectiveStudyDuration("AImp", state, config);
  const speedAfter = calculateEffectiveStudySpeed("AImp", state, config);

  const mult = calculateStudyImproveMultiplier(1, config);
  // Final speed must be speedBefore * mult
  assert.ok(Math.abs(speedAfter - speedBefore * mult) < 1e-6);
  // Final duration must be durBefore / mult
  assert.ok(Math.abs(durAfter - durBefore / mult) < 1e-6);
});

test("§44.12: Improve unlock counts current owned studies rather than produced", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.algorithms.AImp.produced = 100; // Produced 100 lifetime
  engine.state.algorithms.AImp.owned = 15;     // But only owns 15 now (e.g. converted to AUpg)

  // Level 1 milestone is 33. Since owned (15) < 33, claiming must fail!
  assert.equal(engine.claimStudyImprove("AImp"), false);
  assert.equal(engine.state.studyImproves.AImp.claimed, 0);

  // Now player reaches 33 owned AImp
  engine.state.algorithms.AImp.owned = 33;
  assert.equal(engine.claimStudyImprove("AImp"), true);
  assert.equal(engine.state.studyImproves.AImp.claimed, 1);
});

test("§44.13: Multiple manual studies run in parallel simultaneously (AImp, AUpg)", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.algorithms.AImp.owned = 12; // Enough for 1 AUpg

  // Start both studies simultaneously
  engine.startManualStudy("AImp", 1);
  engine.startManualStudy("AUpg", 1);

  assert.equal(engine.state.manualStudies.AImp.active, true);
  assert.equal(engine.state.manualStudies.AUpg.active, true);
  assert.equal(engine.state.manualStudy.active, true);

  // Tick 0.5s: both should finish in parallel
  engine.tick(0.5);

  assert.equal(engine.state.algorithms.AImp.owned, 1, "AImp produced 1 and 12 was consumed by AUpg");
  assert.equal(engine.state.algorithms.AImp.produced, 1);
  assert.equal(engine.state.algorithms.AUpg.owned, 1, "AUpg produced 1");
  assert.equal(engine.state.algorithms.AUpg.produced, 1);

  assert.equal(engine.state.manualStudies.AImp.active, false);
  assert.equal(engine.state.manualStudies.AUpg.active, false);
  assert.equal(engine.state.manualStudy.active, false);
});

test("§44.14: Simultaneous hotkeys ('A' and 'U') run both studies continuously in parallel", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.unlocks.AUpg = true;
  engine.state.algorithms.AImp.owned = 24; // Enough for 2 AUpg

  // Press both hotkeys
  engine.setHotkeyState("A", true);
  engine.setHotkeyState("U", true);

  assert.ok(engine.continuousStudyTargets.has("AImp"));
  assert.ok(engine.continuousStudyTargets.has("AUpg"));
  assert.equal(engine.state.manualStudies.AImp.active, true);
  assert.equal(engine.state.manualStudies.AUpg.active, true);

  // Tick 0.5s: 1 AImp produced (25), 1 AUpg produced (consumes 12 -> 13 left)
  engine.tick(0.5);
  assert.equal(engine.state.algorithms.AUpg.owned, 1);
  assert.equal(engine.state.algorithms.AImp.owned, 13);

  // Tick another 0.5s: 1 AImp produced (14), 1 AUpg produced (consumes 12 -> 2 left)
  engine.tick(0.5);
  assert.equal(engine.state.algorithms.AUpg.owned, 2);
  assert.equal(engine.state.algorithms.AImp.owned, 2);

  // Release 'A' hotkey while 'U' is still held
  engine.setHotkeyState("A", false);
  assert.ok(!engine.continuousStudyTargets.has("AImp"));
  assert.ok(engine.continuousStudyTargets.has("AUpg"));
  assert.equal(engine.state.manualStudies.AImp.active, false);
  assert.equal(engine.state.manualStudies.AUpg.active, true);

  // Release 'U' hotkey
  engine.setHotkeyState("U", false);
  assert.ok(!engine.continuousStudyTargets.has("AUpg"));
  assert.equal(engine.state.manualStudies.AUpg.active, false);
  assert.equal(engine.state.manualStudy.active, false);
});

test("§44.15: Three simultaneous hotkeys ('A', 'U', 'R') run all 3 studies in parallel", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.unlocks.AUpg = true;
  engine.state.unlocks.ARec = true;

  engine.setHotkeyState("A", true);
  engine.setHotkeyState("U", true);
  engine.setHotkeyState("R", true);

  assert.ok(engine.continuousStudyTargets.has("AImp"));
  assert.ok(engine.continuousStudyTargets.has("AUpg"));
  assert.ok(engine.continuousStudyTargets.has("ARec"));
  assert.equal(engine.state.manualStudies.AImp.active, true);
  assert.equal(engine.state.manualStudies.AUpg.active, true);
  assert.equal(engine.state.manualStudies.ARec.active, true);

  engine.clearAllHotkeys();
  assert.equal(engine.continuousStudyTargets.size, 0);
  assert.equal(engine.state.manualStudies.AImp.active, false);
  assert.equal(engine.state.manualStudies.AUpg.active, false);
  assert.equal(engine.state.manualStudies.ARec.active, false);
});

test("§44.16: PauseManualStudy with specific target pauses only that target", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.startManualStudy("AImp", 5);
  engine.startManualStudy("AUpg", 5);

  assert.equal(engine.state.manualStudies.AImp.active, true);
  assert.equal(engine.state.manualStudies.AUpg.active, true);

  // Pause only AUpg
  engine.pauseManualStudy("AUpg");
  assert.equal(engine.state.manualStudies.AImp.active, true);
  assert.equal(engine.state.manualStudies.AUpg.active, false);

  // Pause all
  engine.pauseManualStudy();
  assert.equal(engine.state.manualStudies.AImp.active, false);
  assert.equal(engine.state.manualStudies.AUpg.active, false);
});

test("§45.1: Processor reveals ONLY when player reaches 1e-6 J stored energy", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  const processorElem = getElement("processor");

  // At 0 energy, processor is not revealed
  engine.state.energy = big("0");
  engine.state.peakEnergy = big("0");
  engine.state.unlocks.processor = false;
  assert.equal(processorElem.isRevealed(engine.state), false);

  // At 500 nJ (< 1 uJ), still not revealed
  engine.state.energy = big("500e-9");
  engine.state.peakEnergy = big("500e-9");
  assert.equal(processorElem.isRevealed(engine.state), false);

  // Reaching 1 uJ (1e-6 J) triggers reveal
  engine.state.energy = big("1e-6");
  engine.state.peakEnergy = big("1e-6");
  assert.equal(processorElem.isRevealed(engine.state), true);
  engine._evaluateUnlocks();
  assert.equal(engine.state.unlocks.processor, true);
});

test("§45.2: Processor applies +5% bonus per unit strictly to study speed-efficiency devices", () => {
  const state = createInitialState(config);
  state.devices.processors = 2; // +10% bonus

  // 1. Processor multiplier formula
  const procMult = calculateProcessorDeviceMultiplier(state.devices.processors, config);
  assert.equal(procMult, 1.10); // 1 + 0.05 * 2 = 1.10

  // 2. Study speed device multiplier inherits processor bonus
  const studyMult = calculateStudySpeedDeviceMultiplier(state, config);
  assert.equal(studyMult, 1.10);

  // 3. Transistor speed bonus scales with processor multiplier
  state.devices.transistorAllocations.AImp = 10;
  const transistorRate = config.devices.transistor.speedBonusPerUnit ?? 0.025;
  const speed = calculateTransistorStudySpeedMultiplier(10, config, studyMult);
  // 1 + 0.025 * 10 * 1.10 = 1.275
  assert.equal(speed, 1 + transistorRate * 10 * 1.10);

  // 4. Power Cells are exempt from processor and SO bonus
  state.powerCells = 5;
  const powerCellCap = calculatePowerCellCapacity(5, state, config);
  const baseCap = config.devices?.powerCell?.baseCapacity ?? 0.001;
  assertBigEqual(powerCellCap, big(5 * baseCap));

  // 5. Capacitors are exempt from processor bonus (only receive facilityMult)
  const capMult = calculateCapacitorMultiplier(2, config, 1.0);
  assert.equal(capMult, 1 + 0.5 * 2 * 1.0);
});

test("§45.3: Exhaustive verification of Setup Optimization and Processor multipliers across all devices", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  // Set 2 Setup Optimizations: H = 2 -> D(2) = 1 + 1.35 * ln(3) = 2.4831
  engine.state.facilityOptimizations = 2;
  const expectedFoMult = calculateFacilityDeviceMultiplier(2, config);
  assertClose(expectedFoMult, 2.4831, 1e-3);

  // Set 4 Processors: P = 4 -> 1 + 0.05 * 4 = 1.20
  engine.state.devices.processors = 4;
  const expectedProcMult = 1.20;
  assert.equal(calculateProcessorDeviceMultiplier(4, config), expectedProcMult);

  // 1. Devices that get BOTH SO and Processor multipliers (Study Speed-Efficiency):
  const combinedStudyMult = calculateStudySpeedDeviceMultiplier(engine.state, config);
  assertClose(combinedStudyMult, expectedFoMult * expectedProcMult);

  // Transistors
  engine.state.devices.transistorAllocations.AImp = 10;
  const tBonusRate = config.devices.transistor.speedBonusPerUnit ?? 0.025;
  const tSpeed = calculateTransistorStudySpeedMultiplier(10, config, combinedStudyMult);
  assertClose(tSpeed, 1 + tBonusRate * 10 * combinedStudyMult);

  // Microprocessor
  engine.state.devices.microprocessor.owned = 1;
  engine.state.devices.microprocessor.target = "AImp";
  const microBase = config.devices.microprocessor.multiplierBase ?? 1.12;
  const expectedMicroRaw = (microBase ** 10 - 1) * 1;
  const microMult = calculateMicroprocessorStudyMultiplier(10, config, combinedStudyMult, 1);
  assertClose(microMult, 1 + expectedMicroRaw * combinedStudyMult);

  // AutoCalculator Duration (inherits effective study duration from combined multiplier)
  const baseDur = config.economy.baseStudyDurationSeconds ?? 0.5;
  const effSpeed = calculateEffectiveStudySpeed("AImp", engine.state, config, engine.statResolver);
  const effDur = calculateEffectiveStudyDuration("AImp", engine.state, config, engine.statResolver);
  assertClose(effDur, baseDur / effSpeed);

  // 2. Devices that get ONLY SO multiplier (NOT Processor multiplier):
  // Capacitors
  engine.state.devices.capacitors = 4;
  const capMult = calculateCapacitorMultiplier(4, config, expectedFoMult);
  assertClose(capMult, 1 + 0.5 * 4 * expectedFoMult);

  // CRC Gadget
  engine.state.devices.crcGadget.owned = 1;
  const crcMult = calculateCrcMultiplier(engine.state, config, expectedFoMult);
  assertClose(crcMult, 1 + (2.0 - 1.0) * expectedFoMult);

  // Hard Disk Data/XP generation rate
  engine.state.devices.hardDisks.owned = 3;
  const hdRate = calculateHardDiskXpRate(3, engine.state, config, engine.statResolver);
  assertClose(hdRate, 3 * 3.0 * expectedFoMult);

  // 3. Devices EXEMPT from BOTH SO and Processor multipliers:
  // Power Cells
  engine.state.powerCells = 8;
  const pcCap = calculatePowerCellCapacity(8, engine.state, config, engine.statResolver);
  const pcBaseCap = config.devices?.powerCell?.baseCapacity ?? 0.001;
  assertBigEqual(pcCap, big(8 * pcBaseCap)); // exactly 8 * baseCap, no SO and no Processor mult!
});

test("§45.4: Devices and tooltips dynamically display post-bonus metrics when SO and Processor bonuses exist", async () => {
  const config = JSON.parse(await readFile(new URL("../../config/game-config.json", import.meta.url), "utf-8"));
  const engine = new GameEngine(config);

  // 1. BASE STATE (H=0, P=0):
  engine.state.facilityOptimizations = 0;
  engine.state.devices.processors = 0;
  engine.state.devices.capacitors = 0;
  engine.state.devices.transistorAllocations.AImp = 2;
  engine.state.devices.microprocessor.owned = 1;
  engine.state.devices.microprocessor.target = "AImp";
  engine.state.devices.crcGadget.owned = 1;
  engine.state.devices.hardDisks.owned = 2;
  engine.statResolver.invalidateCache();

  // Capacitor base tooltip
  const capBaseTooltip = getTooltipContent("capacitor", { state: engine.state, config, engine });
  assert.ok(capBaseTooltip.body.includes("Unit Cascade Bonus:</strong> +50% per unit"));
  assert.ok(capBaseTooltip.body.includes("Effective Multiplier:</strong> 1.00x (+0% total cascade bonus across all tiers)"));
  assert.ok(!capBaseTooltip.body.includes("SO bonus"));

  // Microprocessor base tooltip
  const microBaseTooltip = getTooltipContent("microprocessor", { state: engine.state, config, engine });
  assert.ok(microBaseTooltip.body.includes("Speed Multiplier:</strong> 1.25x (1.12<sup>2</sup>)"));
  assert.ok(!microBaseTooltip.body.includes("Prestige Multiplier"));
  assert.ok(microBaseTooltip.body.includes("Multiplier = (1.12)<sup>T</sup>"));

  // Transistor Board base tooltip
  const boardBaseTooltip = getTooltipContent("transistorBoard", { state: engine.state, config, engine });
  assert.ok(boardBaseTooltip.body.includes("Base Speed Bonus:</strong> +6.9% Study Speed per allocated Transistor"));
  assert.ok(!boardBaseTooltip.body.includes("prestige bonus"));

  // CRC Gadget base tooltip
  const crcBaseTooltip = getTooltipContent("crcGadget", { state: engine.state, config, engine });
  assert.ok(crcBaseTooltip.body.includes("Production Multiplier:</strong> 2.00x global energy production boost."));
  assert.ok(!crcBaseTooltip.body.includes("SO bonus"));

  // Hard Disk base tooltip
  const hdBaseTooltip = getTooltipContent("hardDisk", { state: engine.state, config, engine });
  assert.ok(hdBaseTooltip.body.includes("+3.0/s base per active disk"));
  assert.ok(!hdBaseTooltip.body.includes("SO bonus"));

  // Power Cell tooltip always explicitly marks exemption
  const pcTooltip = getTooltipContent("powerCell", { state: engine.state, config, engine });
  assert.ok(pcTooltip.body.includes("Prestige Multiplier:</strong> 1.00x (Exempt from Setup Optimization and Processor bonuses)"));

  // 2. POST-BONUS STATE (H=1 => 1.94x SO bonus, P=1 => 1.05x Processor bonus):
  engine.state.facilityOptimizations = 1;
  engine.state.devices.processors = 1;   // 1.05x Processor
  engine.state.devices.capacitors = 1;   // 1 capacitor owned
  engine.statResolver.invalidateCache();

  const foMult = calculateFacilityDeviceMultiplier(1, config);
  const foStr = foMult.toFixed(2);
  const procMult = calculateProcessorDeviceMultiplier(1, config);
  const combinedMult = (foMult * procMult).toFixed(2);

  // Capacitor tooltip with SO bonus
  const capBoostedTooltip = getTooltipContent("capacitor", { state: engine.state, config, engine });
  assert.ok(capBoostedTooltip.body.includes(`${foStr}x SO bonus`));

  // Microprocessor tooltip with SO and Processor bonuses
  const microBoostedTooltip = getTooltipContent("microprocessor", { state: engine.state, config, engine });
  assert.ok(microBoostedTooltip.body.includes("Base Multiplier:</strong> 1.25x (1.12<sup>2</sup>)"));
  assert.ok(microBoostedTooltip.body.includes(`Prestige Multiplier:</strong> ${combinedMult}x (${foStr}x SO × ${procMult.toFixed(2)}x Processor)`));

  // Transistor Board tooltip with combined prestige bonus
  const boardBoostedTooltip = getTooltipContent("transistorBoard", { state: engine.state, config, engine });
  assert.ok(boardBoostedTooltip.body.includes(`${combinedMult}x prestige bonus`));

  // CRC Gadget tooltip with SO bonus
  const crcBoostedTooltip = getTooltipContent("crcGadget", { state: engine.state, config, engine });
  assert.ok(crcBoostedTooltip.body.includes(`${foStr}x SO bonus`));

  // Hard Disk tooltip with SO bonus
  const hdBoostedTooltip = getTooltipContent("hardDisk", { state: engine.state, config, engine });
  assert.ok(hdBoostedTooltip.body.includes(`${foStr}x SO bonus`));

  // AImp tooltip with capacitor and SO cascade
  const aImpBoostedTooltip = getTooltipContent("aimp", { state: engine.state, config, engine });
  assert.ok(aImpBoostedTooltip.body.includes(`${foStr}x SO bonus`));
});

// -------------------------------------------------------------
// §46: ALGORITHM REDESIGN (ARED) FEATURE SPECIFICATION
// -------------------------------------------------------------
test("§46.1: Algorithm Redesign is unlocked when facilityOptimizations >= 2 (SO2)", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  assert.equal(Boolean(engine.state.unlocks?.ARed), false);

  engine.state.facilityOptimizations = 1;
  engine.state.computerLevel = 12;
  // Completing SO2 (going from 1 to 2) unlocks ARed
  const res = engine.performFacilityOptimization();
  assert.equal(res, true);
  assert.equal(engine.state.facilityOptimizations, 2);
  assert.equal(engine.state.unlocks.ARed, true);
});

test("§46.2: 12 ARec units convert to 1 ARed study", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.unlocks.ARed = true;
  engine.state.algorithms.ARec.owned = 25;
  engine.state.algorithms.ARed.owned = 0;

  engine.startManualStudy("ARed", 1);
  const dur = calculateEffectiveStudyDuration("ARed", engine.state, config, engine.statResolver);
  engine.tick(dur + 0.01);

  assert.equal(engine.state.algorithms.ARed.owned, 1);
  assert.equal(engine.state.algorithms.ARec.owned, 13); // 25 - 12 = 13
});

test("§46.3: ARed study holds progress at 100% when ARec < 12 without negative inventory", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.unlocks.ARed = true;
  engine.state.algorithms.ARec.owned = 5; // < 12
  engine.state.algorithms.ARed.owned = 0;

  engine.startManualStudy("ARed", 1);
  const dur = calculateEffectiveStudyDuration("ARed", engine.state, config, engine.statResolver);
  engine.tick(dur + 0.05);

  assert.equal(engine.state.algorithms.ARed.owned, 0);
  assert.equal(engine.state.algorithms.ARec.owned, 5); // NOT consumed
  assert.equal(engine.state.manualStudies.ARed.active, true);
  assert.ok(engine.state.manualStudies.ARed.elapsed >= dur); // Held at complete!

  // Add remaining required ARec to complete
  engine.state.algorithms.ARec.owned += 7; // now 12
  engine.tick(0.01);
  assert.equal(engine.state.algorithms.ARed.owned, 1);
  assert.equal(engine.state.algorithms.ARec.owned, 0);
});

test("§46.4: Strength cascade: ARedStrength = ARecStrength * F * (L + 1)", () => {
  const F = config.economy?.algorithmConversionFactor ?? 12;
  for (const L of [1, 2, 5, 9, 12, 15]) {
    const s = calculateAlgorithmStrengths(L, config);
    const expectedARed = big(s.ARec).mul(F).mul(L + 1);
    assertBigEqual(s.ARed, expectedARed);
  }
});

test("§46.5: ARed contributes 729 Available Data, preserving 25% data loss per conversion", () => {
  const state = createInitialState(config);
  state.algorithms.AImp.owned = 12; // 12 Data
  assert.equal(calculateAvailableData(state, config), 12);

  // 12 AImp convert to 1 AUpg (9 Data -> 25% loss)
  state.algorithms.AImp.owned = 0;
  state.algorithms.AUpg.owned = 1;
  assert.equal(calculateAvailableData(state, config), 9);

  // 12 AUpg convert to 1 ARec (12 * 9 = 108 -> 81 Data -> 25% loss)
  state.algorithms.AUpg.owned = 0;
  state.algorithms.ARec.owned = 1;
  assert.equal(calculateAvailableData(state, config), 81);

  // 12 ARec convert to 1 ARed (12 * 81 = 972 -> 729 Data -> 25% loss)
  state.algorithms.ARec.owned = 0;
  state.algorithms.ARed.owned = 1;
  assert.equal(calculateAvailableData(state, config), 729);
});

test("§46.6: Backpropagator discovery at SO3 with energytoUnlock threshold", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  const bpElement = getElement("backpropagator");
  assert.ok(bpElement);

  // At SO0, SO1, SO2: never revealed regardless of energy
  for (const so of [0, 1, 2]) {
    engine.state.facilityOptimizations = so;
    engine.state.energy = big(1e12);
    engine.state.peakEnergy = big(1e12);
    assert.equal(bpElement.isRevealed(engine.state, config), false);
    assert.equal(bpElement.isUnlocked(engine.state, config), false);
  }

  // At SO3: hidden until energy threshold is reached
  engine.state.facilityOptimizations = 3;
  const threshold = config.devices?.backpropagator?.energytoUnlock ?? 1;
  engine.state.energy = big(threshold).mul(0.5);
  engine.state.peakEnergy = big(threshold).mul(0.5);
  assert.equal(bpElement.isRevealed(engine.state, config), false);

  // Meets threshold -> revealed and unlocked
  engine.state.energy = big(threshold);
  engine.state.peakEnergy = big(threshold);
  assert.equal(bpElement.isRevealed(engine.state, config), true);
  assert.equal(bpElement.isUnlocked(engine.state, config), true);

  // Spends energy below threshold -> remains revealed because peakEnergy preserves discovery!
  engine.state.energy = big(0.1);
  assert.equal(bpElement.isRevealed(engine.state, config), true);

  // Purchase Backpropagator
  engine.state.energy = big(10);
  const buyRes = engine.purchaseElement("backpropagator", 1);
  assert.equal(buyRes, true);
  assert.equal(bpElement.getOwned(engine.state), 1);

  // Enforces unique device: cannot buy a second time
  const buySecond = engine.purchaseElement("backpropagator", 1);
  assert.equal(buySecond, false);
});

test("§46.7: Backpropagator Resonance Multiplier softcap and hardcap, unowned = 1, R=0 = 1", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.facilityOptimizations = 3;
  const devConfig = config.devices?.backpropagator ?? {};
  const q = Number(devConfig.resonanceBase ?? 8.5);
  const Rsoft = Number(devConfig.softcapStart ?? 100);
  const Rhard = Number(devConfig.hardcapStart ?? 1000);

  // 1. Unowned device gives no bonus
  engine.state.devices.backpropagator = { owned: 0 };
  engine.state.algorithms.ARed.owned = 50;
  assert.equal(Number(calculateBackpropagatorMultiplier(engine.state, config)), 1.0);

  // 2. Owned device with 0 ARed gives no bonus
  engine.state.devices.backpropagator = { owned: 1 };
  engine.state.algorithms.ARed.owned = 0;
  assert.equal(Number(calculateBackpropagatorMultiplier(engine.state, config)), 1.0);

  // 3. Normal curve up to softcap R = Rsoft
  engine.state.algorithms.ARed.owned = 1;
  assertClose(Number(calculateBackpropagatorMultiplier(engine.state, config)), q ** 1, 1e-4);

  engine.state.algorithms.ARed.owned = Rsoft;
  const expectedSoft = q ** Math.sqrt(Rsoft);
  assertClose(Number(calculateBackpropagatorMultiplier(engine.state, config)), expectedSoft, 1e2);

  // 4. Softcap above Rsoft with diminishing returns
  engine.state.algorithms.ARed.owned = Rsoft + 200;
  const multAbove = calculateBackpropagatorMultiplier(engine.state, config);
  assert.ok(multAbove.gt(expectedSoft));

  // 5. Hardcap at Rhard: mult(Rhard + 1) === mult(Rhard)
  engine.state.algorithms.ARed.owned = Rhard;
  const multHard = calculateBackpropagatorMultiplier(engine.state, config);

  engine.state.algorithms.ARed.owned = Rhard + 1;
  const multHardPlus1 = calculateBackpropagatorMultiplier(engine.state, config);
  assertBigEqual(multHardPlus1, multHard);

  engine.state.algorithms.ARed.owned = Rhard + 4000;
  const multFarAbove = calculateBackpropagatorMultiplier(engine.state, config);
  assertBigEqual(multFarAbove, multHard);

  // 6. Ordinary ARed AP continues increasing beyond Rhard
  const s = calculateAlgorithmStrengths(engine.state.computerLevel, config);
  engine.state.algorithms.ARed.owned = Rhard;
  const apHard = calculateAlgorithmPerformance(engine.state, config);
  engine.state.algorithms.ARed.owned = Rhard + 1;
  const apHardPlus1 = calculateAlgorithmPerformance(engine.state, config);
  assertBigClose(apHardPlus1.sub(apHard), s.ARed, 1e-18);
});

test("§46.8: Hotkey 'G' triggers ARed study when unlocked, blocked when locked", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.unlocks.ARed = false;
  engine.setHotkeyState("G", true);
  assert.equal(engine.continuousStudyTargets.has("ARed"), false);

  engine.state.unlocks.ARed = true;
  engine.setHotkeyState("G", true);
  assert.equal(engine.continuousStudyTargets.has("ARed"), true);
  engine.setHotkeyState("G", false);
  assert.equal(engine.continuousStudyTargets.has("ARed"), false);
});

// -------------------------------------------------------------
// §47: NUMERICAL STABILITY OF ENERGY DECAY
// -------------------------------------------------------------
test("§47.1: Implicit ODE step is unconditionally stable with zero oscillation at 1e13 J/s", () => {
  const E0 = big("1e15");
  const P = big("1e13");
  const delta = 1.0;
  const cap = big(0);

  const E1 = integrateEnergyStep(E0, P, cap, delta, config);
  assert.ok(big(E1).gte(0), "Energy must never become negative");
  assert.ok(big(E1).lt(E0), "At 1e15 J, decay overwhelmingly exceeds production");

  // Run 10 successive large steps and ensure strict monotonic convergence without oscillation
  let prev = E0;
  for (let step = 0; step < 10; step++) {
    const next = integrateEnergyStep(prev, P, cap, delta, config);
    assert.ok(big(next).lte(prev), `Step ${step}: must decrease monotonically`);
    assert.ok(big(next).gte(0), `Step ${step}: must remain non-negative`);
    prev = next;
  }
});

// -------------------------------------------------------------
// §48: LATE-GAME PROGRESSION PROTECTION
// -------------------------------------------------------------
test("§48.1: Transistor late pricing applies for N > 24 with kappa = 0.18", () => {
  const baseCost = config.devices.transistor.baseCost ?? 2.5e-10;
  const mult = config.devices.transistor.costMultiplier ?? 1.6;

  // At N = 24: purely geometric
  const cost24 = calculateDeviceCost("transistor", 24, config);
  const expected24 = big(baseCost).mul(big(mult).pow(24));
  assertBigClose(cost24, expected24, 1e-12);

  // At N = 25: geometric * exp(0.18 * 1^1.5) = geometric * exp(0.18) ~ 1.1972x
  const cost25 = calculateDeviceCost("transistor", 25, config);
  const expected25 = big(baseCost).mul(big(mult).pow(25)).mul(Math.exp(0.18 * (1 ** 1.5)));
  assertBigClose(cost25, expected25, 1e-12);

  // At N = 28: geometric * exp(0.18 * 4^1.5) = geometric * exp(0.18 * 8) = geometric * exp(1.44) ~ 4.22x
  const cost28 = calculateDeviceCost("transistor", 28, config);
  const expected28 = big(baseCost).mul(big(mult).pow(28)).mul(Math.exp(0.18 * (4 ** 1.5)));
  assertBigClose(cost28, expected28, 1e-12);
});

test("§48.2: Bulk transistor purchasing computes exact sum with late pricing", () => {
  const bulkCost = calculateBulkDeviceCost("transistor", 23, 3, config);
  const c23 = calculateDeviceCost("transistor", 23, config);
  const c24 = calculateDeviceCost("transistor", 24, config);
  const c25 = calculateDeviceCost("transistor", 25, config);
  const expectedSum = big(c23).add(c24).add(c25);
  assertBigClose(bulkCost, expectedSum, 1e-12);
});

test("§48.3: Machine Learning late-XP pressure multiplies by 400^(L - 12) for L > 12", () => {
  const xp12 = calculateRequiredDataForNextComputerLevel(12, config);
  const xp13 = calculateRequiredDataForNextComputerLevel(13, config);
  const xp14 = calculateRequiredDataForNextComputerLevel(14, config);
  const xp15 = calculateRequiredDataForNextComputerLevel(15, config);

  assert.ok(xp13 > 1e9, "Level 13 requires billions of Data");
  assert.ok(xp14 > 1e11, "Level 14 requires hundreds of billions of Data");
  assert.ok(xp15 > 1e14, "Level 15 requires hundreds of trillions of Data");
});

// -------------------------------------------------------------
// §49: SETUP OPTIMIZATION LOGARITHMIC CURVE
// -------------------------------------------------------------
test("§49.1: SO multiplier matches reference logarithmic curve D(S) = 1 + 1.35 * ln(1 + S)", () => {
  const expected = [
    { S: 0, mult: 1.000 },
    { S: 1, mult: 1.936 },
    { S: 2, mult: 2.483 },
    { S: 3, mult: 2.871 },
    { S: 4, mult: 3.173 },
    { S: 5, mult: 3.419 },
  ];

  for (const item of expected) {
    const actual = calculateFacilityDeviceMultiplier(item.S, config);
    assertClose(actual, item.mult, 1e-3);
  }
});

test("§49.2: SO logarithmic curve is strictly increasing and strictly concave", () => {
  let prevVal = 1.0;
  let prevDiff = Infinity;
  for (let S = 1; S <= 20; S++) {
    const val = calculateFacilityDeviceMultiplier(S, config);
    const diff = val - prevVal;
    assert.ok(val > prevVal, `SO ${S} must be strictly greater than SO ${S - 1}`);
    assert.ok(diff < prevDiff, `SO ${S} marginal gain must be strictly less than SO ${S - 1} marginal gain`);
    prevVal = val;
    prevDiff = diff;
  }
});
