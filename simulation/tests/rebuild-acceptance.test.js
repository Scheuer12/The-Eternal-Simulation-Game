import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { big } from "../../js/numeric.js";
import {
  calculateAlgorithmBaseStrengths,
  calculateAlgorithmPerformance,
  calculateComputerPerformanceMultiplier,
  calculateEnergyProduction,
  calculateEffectiveStudyDuration,
  calculateEffectiveStudySpeed,
  calculateAvailableData,
  calculateRequiredDataForNextComputerLevel,
  calculateFacilityOptimizationRequirement,
  calculateFacilityDeviceMultiplier,
  calculateProcessorDeviceMultiplier,
  calculateTotalDeviceMultiplier,
  calculateDeviceCost,
  calculateBulkDeviceCost,
  calculateMicroprocessorStudyMultiplier,
  calculateBulkGeometricCost,
  calculatePowerCellCapacity,
  calculateHardDiskEnergyDrain,
  calculateOverclockDuration,
  calculateOverclockBonusMultiplier,
} from "../../js/formulas.js";
import { GameEngine } from "../../js/engine.js";
import { createInitialState } from "../../js/state.js";
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

test("§24.6: Computer Level multiplier is applied once globally: P = AP * 1.5^(L-1) * crcGadgetMult", () => {
  const state = createInitialState(config);
  state.algorithms.AImp.owned = 100;
  state.computerLevel = 4; // multiplier = 1.5^(4-1) = 1.5^3 = 3.375
  state.devices.crcGadget.owned = 1; // 2.0x

  const mult = calculateComputerPerformanceMultiplier(4, config);
  assert.equal(mult, 3.375);

  const ap = calculateAlgorithmPerformance(state, config);
  const prod = calculateEnergyProduction(state, config);
  // prod = ap * 3.375 * 2.0 = ap * 6.75
  assertBigClose(prod, ap.mul(6.75), 1e-9);
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
  engine.state.computerLevel = 8;

  const res = engine.performFacilityOptimization();
  assert.equal(res, false);
  assert.equal(engine.state.facilityOptimizations, 0);
});

test("§26.2: Facility Optimization at Level >= 9 increments H and grants +9% compounding multiplier", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 9;

  const res = engine.performFacilityOptimization();
  assert.equal(res, true);
  assert.equal(engine.state.facilityOptimizations, 1);

  const mult = calculateFacilityDeviceMultiplier(1, config);
  assert.equal(mult, 1.09);

  const mult2 = calculateFacilityDeviceMultiplier(2, config);
  assertClose(mult2, 1.09 ** 2);
});

test("§26.3: Facility Optimization preserves Computer Level & Power Cells, unlocks ARec and Processor, resets conventional hardware", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.computerLevel = 10;
  engine.state.powerCells = 3;
  engine.state.devices.chips.owned = 10;
  engine.state.devices.transistorsPurchased = 50;
  engine.state.energy = big("50e-6");

  const res = engine.performFacilityOptimization();
  assert.equal(res, true);

  // Preserved
  assert.equal(engine.state.computerLevel, 10);
  assert.equal(engine.state.powerCells, 3);
  assert.equal(engine.state.unlocks.ARec, true);
  assert.equal(engine.state.unlocks.processor, true);

  // Conventional hardware reset
  assert.equal(engine.state.devices.chips.owned, 0);
  assert.equal(engine.state.devices.transistorsPurchased, 0);
  assert.equal(engine.state.devices.transistorBoard.owned, false);
  assert.equal(engine.state.energy.toNumber(), 0);
});

test("§26.4: Next Facility Optimization requires Computer Level 12 (9 + 3*1)", () => {
  const req1 = calculateFacilityOptimizationRequirement(0, config);
  assert.equal(req1, 9);

  const req2 = calculateFacilityOptimizationRequirement(1, config);
  assert.equal(req2, 12);

  const req3 = calculateFacilityOptimizationRequirement(2, config);
  assert.equal(req3, 15);
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

test("§27.3: Microprocessor applies 1.12^T single target speed multiplier", () => {
  const state = createInitialState(config);
  state.devices.microprocessor.owned = 1;
  state.devices.microprocessor.target = "AImp";
  state.devices.transistorAllocations.AImp = 10;
  state.devices.transistorAllocations.AUpg = 5;

  // AImp: base speed * (1 + 0.05 * 10) * (1.12^10)
  // AUpg: base speed * (1 + 0.05 * 5)
  const speedAImp = calculateEffectiveStudySpeed("AImp", state, config);
  const speedAUpg = calculateEffectiveStudySpeed("AUpg", state, config);

  const expectedAImp = 1.0 * (1 + 0.5) * (1.12 ** 10);
  const expectedAUpg = 1.0 * (1 + 0.25);

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

  // Amplified microprocessor study speed: 1 + (1.12^15 - 1) * 6.0 = 27.841...
  const speed = calculateEffectiveStudySpeed("AImp", engine.state, config);
  assertClose(speed, 1 + (1.12 ** 15 - 1) * 6.0);
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

test("§27.6: Power Cell capacity N * 1 mJ * deviceMult and cost 1 * 2.25^N", () => {
  const state = createInitialState(config);
  state.powerCells = 3;
  state.facilityOptimizations = 1; // 1.09x device multiplier

  const cap = calculatePowerCellCapacity(3, state, config);
  // 3 * 0.001 * 1.09 = 0.00327 J
  assertBigClose(cap, big("3.27e-3"), 1e-6);

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

test("§28.2: Microprocessor cost scales geometrically C(N) = C0 * r^N and supports bulk purchases", () => {
  const engine = new GameEngine({ config, developmentMode: false });
  engine.state.devices.transistorBoard.owned = true;
  engine.state.devices.transistorsPurchased = 4;
  engine.state.energy = big("1e-6"); // 1 µJ

  const cost0 = calculateDeviceCost("microprocessor", 0, config);
  assertBigClose(cost0, big("3e-9"), 1e-12); // 3 nJ

  const res1 = engine.purchaseElement("microprocessor", 1);
  assert.equal(res1, true);
  assert.equal(engine.state.devices.microprocessor.owned, 1);

  // Cost of 2nd unit: 3e-9 * 1.25 = 3.75 nJ
  const cost1 = calculateDeviceCost("microprocessor", 1, config);
  assertBigClose(cost1, big("3.75e-9"), 1e-12);

  const res2 = engine.purchaseElement("microprocessor", 1);
  assert.equal(res2, true);
  assert.equal(engine.state.devices.microprocessor.owned, 2);

  // Bulk purchase +10 microprocessors
  const bulk10Cost = calculateBulkDeviceCost("microprocessor", 2, 10, config);
  assert.ok(bulk10Cost.gt(big("3.75e-9")));
  const resBulk = engine.purchaseElement("microprocessor", 10);
  assert.equal(resBulk, true);
  assert.equal(engine.state.devices.microprocessor.owned, 12);
});

test("§28.3: Microprocessor speed bonus scales with owned units", () => {
  const state = createInitialState(config);
  state.devices.transistorAllocations.AImp = 4;
  state.devices.microprocessor.owned = 1;
  state.devices.microprocessor.target = "AImp";

  // 1 Microprocessor: 1 + (1.12^4 - 1) * 1 ≈ 1 + 0.573519 = 1.573519x
  const speed1 = calculateMicroprocessorStudyMultiplier(4, config, 1.0, 1);
  assertClose(speed1, 1 + (1.12 ** 4 - 1) * 1);

  // 2 Microprocessors: 1 + (1.12^4 - 1) * 2 ≈ 1 + 1.147038 = 2.147038x
  const speed2 = calculateMicroprocessorStudyMultiplier(4, config, 1.0, 2);
  assertClose(speed2, 1 + (1.12 ** 4 - 1) * 2);
  assert.ok(speed2 > speed1);
});

function assertClose(actual, expected, tolerance = 1e-7) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be close to ${expected} (diff: ${Math.abs(actual - expected)})`
  );
}
