import test from "node:test";
import assert from "node:assert/strict";
import {
  big,
  bigFloor,
  bigCeil,
  bigFloorDiv,
  bigMax,
  bigMin,
  bigClamp,
} from "../../js/numeric.js";
import { EffectRegistry } from "../../js/effect-registry.js";
import { EffectEngine } from "../../js/effect-engine.js";
import {
  StatResolver,
  MANDATORY_STAT_IDS,
} from "../../js/stat-resolver.js";

test("NumericAdapter provides precision-safe division and floor", () => {
  const d = big(100e9);
  const unit = big(100e9);
  // Break_eternity standard div can result in 0.9999999999999999
  const result = bigFloorDiv(d, unit);
  assert.equal(result.toString(), "1");

  assert.equal(bigFloor(0.9999999999999999).toString(), "1");
  assert.equal(bigFloor(2.0000000000000004).toString(), "2");
  assert.equal(bigFloor(2.99).toString(), "2");
  assert.equal(bigCeil(1.0000000000000002).toString(), "1");
  assert.equal(bigCeil(1.01).toString(), "2");

  assert.equal(bigMax(10, 20).toString(), "20");
  assert.equal(bigMin(10, 20).toString(), "10");
  assert.equal(bigClamp(25, 0, 20).toString(), "20");
  assert.equal(bigClamp(-5, 0, 20).toString(), "0");
});

test("EffectRegistry indexes effects by targetStatId", () => {
  const registry = new EffectRegistry();

  registry.register({
    id: "eff-1",
    targetStatId: "devices.crc.productionRate",
    operation: "multiply",
    value: 2,
  });

  registry.register({
    id: "eff-2",
    targetStatId: "devices.crc.productionRate",
    operation: "add",
    value: 5,
  });

  registry.register({
    id: "eff-3",
    targetStatId: "devices.autoCalculator.unitBonus",
    operation: "multiply",
    value: 1.5,
  });

  const crcEffects = registry.getEffectsForTarget("devices.crc.productionRate");
  assert.equal(crcEffects.length, 2);

  const calcEffects = registry.getEffectsForTarget("devices.autoCalculator.unitBonus");
  assert.equal(calcEffects.length, 1);

  registry.unregister("eff-1");
  assert.equal(registry.getEffectsForTarget("devices.crc.productionRate").length, 1);

  registry.clear();
  assert.equal(registry.getAllEffects().length, 0);
});

test("EffectEngine applies explicit pipeline order: base -> add -> mult -> pow -> cap", () => {
  const engine = new EffectEngine();

  const effects = [
    { id: "e-pow", operation: "power", value: 2 },
    { id: "e-mult", operation: "multiply", value: 3 },
    { id: "e-add", operation: "add", value: 4 },
    { id: "e-base", operation: "base", value: 10 },
    { id: "e-cap", operation: "cap", value: 1000 },
  ];

  // Pipeline order:
  // 1. base: 10
  // 2. add 4: 14
  // 3. mult 3: 42
  // 4. pow 2: 42^2 = 1764
  // 5. cap 1000: 1000
  const result = engine.compute({ baseValue: 1, effects });
  assert.equal(result.value.toString(), "1000");

  assert.equal(result.trace.length, 5);
  assert.equal(result.trace[0].operation, "base");
  assert.equal(result.trace[1].operation, "add");
  assert.equal(result.trace[2].operation, "multiply");
  assert.equal(result.trace[3].operation, "power");
  assert.equal(result.trace[4].operation, "cap");
});

test("EffectEngine handles conditions and dynamic operands", () => {
  const engine = new EffectEngine();

  const effects = [
    {
      id: "eff-conditional",
      operation: "multiply",
      condition: (ctx) => ctx.enabled === true,
      value: (ctx) => ctx.multiplier,
    },
  ];

  const disabledResult = engine.compute({
    baseValue: 10,
    effects,
    context: { enabled: false, multiplier: 5 },
  });
  assert.equal(disabledResult.value.toString(), "10");

  const enabledResult = engine.compute({
    baseValue: 10,
    effects,
    context: { enabled: true, multiplier: 5 },
  });
  assert.equal(enabledResult.value.toString(), "50");
});

test("StatResolver resolves DAG dependencies and detects cycles", () => {
  const registry = new EffectRegistry();
  const engine = new EffectEngine();
  const resolver = new StatResolver({ registry, engine });

  resolver.registerStat("statA", { baseValue: 10 });
  resolver.registerStat("statB", { baseValue: 5 });

  // statA multiplies by statB
  registry.register({
    id: "a-from-b",
    targetStatId: "statA",
    operation: "multiply",
    value: (ctx) => ctx.resolve("statB"),
  });

  const valA = resolver.resolve("statA");
  assert.equal(valA.toString(), "50");

  // Create a cyclic dependency: statB depends on statA
  registry.register({
    id: "b-from-a",
    targetStatId: "statB",
    operation: "multiply",
    value: (ctx) => ctx.resolve("statA"),
  });

  resolver.invalidateCache();
  assert.throws(
    () => resolver.resolve("statA"),
    /Cyclic dependency detected/,
  );
});

test("Mandatory stat IDs are defined in contracts", () => {
  const expected = [
    "devices.crc.productionRate",
    "devices.crc.improvementFactor",
    "devices.crc.upgradeFactor",
    "devices.processor.unitBonus",
    "devices.processor.calculatorAmplification",
    "devices.autoCalculator.unitBonus",
    "devices.autoCalculator.researchSpeed",
    "studies.algorithmImprovement.speedMultiplier",
    "setup.devicePerformance",
  ];

  const defined = Object.values(MANDATORY_STAT_IDS);
  for (const id of expected) {
    assert.ok(defined.includes(id), `Missing mandatory statId: ${id}`);
  }
});
