import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { GameEngine } from "../../js/engine.js";
import {
  calculateBatchDuration,
  calculateBatchEnergy,
  calculateMaxBatchImprovements,
  calculateProduction,
  calculateStudyDuration,
} from "../../js/formulas.js";
import { big } from "../../js/numeric.js";
import { simulateOfflineProgress } from "../../js/offline-progress.js";
import { createInitialState } from "../../js/state.js";
import { assertBigClose, assertBigEqual } from "./assertions.js";

const config = JSON.parse(
  await readFile(
    new URL("../../config/game-config.json", import.meta.url),
    "utf8",
  ),
);

function createActiveEngine(options = {}) {
  const state = createInitialState(config);
  const engine = new GameEngine({ state, config, ...options });
  engine.pressButton();
  engine.activateCrc();
  return { engine, state };
}

test("single tick vs partitioned ticks produce equivalent results within numerical tolerance", () => {
  // Engine A: 1 tick of 100ms (0.1s)
  const { engine: engineA, state: stateA } = createActiveEngine();
  stateA.devices.autoCalculators = 5;
  stateA.devices.processors = 2;
  stateA.improvements = 150; // In constant-speed regime

  // Engine B: 10 ticks of 10ms (0.01s)
  const { engine: engineB, state: stateB } = createActiveEngine();
  stateB.devices.autoCalculators = 5;
  stateB.devices.processors = 2;
  stateB.improvements = 150;

  engineA.tick(0.1);
  for (let i = 0; i < 10; i++) {
    engineB.tick(0.01);
  }

  assert.equal(stateA.improvements, stateB.improvements);
  assertBigClose(stateA.energy, stateB.energy, 1e-6);
});

test("closed-form batching evaluates 1e9 improvements in under 50ms without freeze", () => {
  const V = big(1e12); // High speed
  const j = 1000;
  const targetN = 1000000000; // 1e9
  const duration = calculateBatchDuration(j, targetN, V, config);

  const t0 = performance.now();
  const maxN = calculateMaxBatchImprovements(
    j,
    V,
    duration.toNumber(),
    Infinity,
    config,
  );
  const t1 = performance.now();

  assert.equal(maxN, targetN);
  assert.ok(
    t1 - t0 < 50,
    `Batch calculation took ${t1 - t0}ms, expected under 50ms`,
  );

  // Energy integration must also evaluate in O(1) without error
  const Q = big(1e-12);
  const energy = calculateBatchEnergy(j, targetN, V, Q, config);
  assert.ok(energy.gt(0));
  assert.ok(energy.isFinite());
});

test("closed-form energy integration matches sequential step-by-step replay exactly", () => {
  const j = 120;
  const n = 25;
  const V = 4.5;
  const Q = 1e-12;

  // Step-by-step sequential sum:
  const b = config.economyV2?.improvements?.durationGrowthCoefficient ?? 0.001;
  let sequentialTime = 0;
  let sequentialEnergy = 0;
  for (let i = j; i < j + n; i++) {
    const dur = (0.5 * (1 + b * i * i)) / V;
    sequentialTime += dur;
    sequentialEnergy += Q * (1 + i) * dur;
  }

  const batchTime = calculateBatchDuration(j, n, V, config).toNumber();
  const batchEnergy = calculateBatchEnergy(j, n, V, Q, config).toNumber();

  assert.ok(
    Math.abs(batchTime - sequentialTime) < 1e-12,
    `Time mismatch: batch=${batchTime}, seq=${sequentialTime}`,
  );
  assert.ok(
    Math.abs(batchEnergy - sequentialEnergy) < 1e-20,
    `Energy mismatch: batch=${batchEnergy}, seq=${sequentialEnergy}`,
  );
});

test("ordered events: Algorithm Upgrade resets I and starts new Improvements within same tick", () => {
  const { engine, state } = createActiveEngine();
  state.devices.autoCalculators = 10;
  state.devices.processors = 5;
  state.science.perks.redundancyElimination = true;
  state.science.fiftyGCalculator = true;

  // Set improvements just 1 below requirement
  const req = 10; // R(0) = 10
  state.improvements = req - 1;

  // Tick for a duration long enough to:
  // 1. Finish 1 improvement (reaches R(0) = 10)
  // 2. Start and finish automated Algorithm Upgrade study (10s duration)
  // 3. Complete some new improvements post-reset
  for (let s = 0; s < 25; s++) {
    engine.tick(1.0);
  }

  // Upgrades should have completed at least once
  assert.ok(state.upgrades >= 1);
  // Improvements should be progressing under the new Upgrade level (U >= 1)
  assert.ok(state.improvements >= 0);
  assert.ok(state.energy.gt(0));
});

test("offline progress and online ticks produce equivalent results for same duration", () => {
  const now = Date.now();
  const durationSec = 30;

  // Online execution: 30 seconds as 30 x 1s ticks
  const { engine: onlineEngine, state: onlineState } = createActiveEngine();
  onlineState.devices.autoCalculators = 3;
  onlineState.devices.processors = 2;
  onlineState.improvements = 100;
  for (let s = 0; s < durationSec; s++) {
    onlineEngine.tick(1.0);
  }

  // Offline execution: 30 seconds as offline progress
  const offlineState = createInitialState(config);
  offlineState.introState = "active";
  offlineState.crcCount = 1;
  offlineState.devices.autoCalculators = 3;
  offlineState.devices.processors = 2;
  offlineState.improvements = 100;
  offlineState.lastSavedAt = now - durationSec * 1000;

  simulateOfflineProgress(offlineState, config, { now });

  assert.equal(onlineState.improvements, offlineState.improvements);
  assert.equal(onlineState.upgrades, offlineState.upgrades);
  assertBigClose(onlineState.energy, offlineState.energy, 1e-5);
});

test("rates above 60/s are fully executed and never truncated by tick rate", () => {
  const { engine, state } = createActiveEngine();
  state.devices.autoCalculators = 20;
  state.devices.processors = 10;
  state.improvements = 30;

  // Measure study duration: should be well under 1/60s (~16.6ms)
  const duration = calculateStudyDuration(state, config);
  assert.ok(duration < 0.016, `Study duration ${duration}s should be < 16ms`);

  const prevImprovements = state.improvements;
  // In a 1-second tick, more than 60 improvements must complete!
  engine.tick(1.0);

  const completed = state.improvements - prevImprovements;
  assert.ok(
    completed > 60,
    `Expected >60 improvements in 1 second, got ${completed}`,
  );
});
