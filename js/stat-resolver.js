/**
 * StatResolver
 * Resolves stat values by querying EffectRegistry and computing via EffectEngine.
 * Implements DAG dependency tracking, cycle detection, trace production,
 * and optional revision-based caching.
 */

import { big } from "./numeric.js";
import { defaultEffectRegistry } from "./effect-registry.js";
import { defaultEffectEngine } from "./effect-engine.js";

export const MANDATORY_STAT_IDS = Object.freeze({
  ALGORITHM_PERFORMANCE: "algorithms.performance",
  CRC_PRODUCTION_RATE: "devices.crc.productionRate",
  CRC_MULTIPLIER: "devices.crc.multiplier",
  AIMP_CAPACITOR_MULTIPLIER: "algorithms.AImp.capacitorMultiplier",
  GLOBAL_DEVICE_MULTIPLIER: "devices.globalMultiplier",
  FACILITY_DEVICE_MULTIPLIER: "facility.deviceMultiplier",
  PROCESSOR_DEVICE_MULTIPLIER: "devices.processor.deviceMultiplier",
  STUDY_SPEED_AIMP: "studies.AImp.speed",
  STUDY_SPEED_AUPG: "studies.AUpg.speed",
  STUDY_SPEED_AREC: "studies.ARec.speed",
  POWER_CELL_CAPACITY: "devices.powerCell.capacity",

  // Architecture contract compatibility keys
  CRC_IMPROVEMENT_FACTOR: "devices.crc.improvementFactor",
  CRC_UPGRADE_FACTOR: "devices.crc.upgradeFactor",
  PROCESSOR_UNIT_BONUS: "devices.processor.unitBonus",
  PROCESSOR_CALC_AMPLIFICATION: "devices.processor.calculatorAmplification",
  AUTOCALC_UNIT_BONUS: "devices.autoCalculator.unitBonus",
  AUTOCALC_RESEARCH_SPEED: "devices.autoCalculator.researchSpeed",
  ALGO_IMP_SPEED_MULT: "studies.algorithmImprovement.speedMultiplier",
  SETUP_DEVICE_PERFORMANCE: "setup.devicePerformance",
});

export class StatResolver {
  constructor({
    registry = defaultEffectRegistry,
    engine = defaultEffectEngine,
  } = {}) {
    this.registry = registry;
    this.engine = engine;
    this.statDefinitions = new Map();
    this.cache = new Map();
    this.revision = 0;
  }

  registerStat(statId, { baseValue = 1, baseFormula = null, description = "" } = {}) {
    this.statDefinitions.set(statId, {
      id: statId,
      baseValue,
      baseFormula,
      description,
    });
  }

  invalidateCache() {
    this.cache.clear();
    this.revision += 1;
  }

  resolve(statId, context = {}, { trace = false } = {}) {
    const callStack = new Set();
    return this._resolveInternal(statId, context, callStack, trace);
  }

  _resolveInternal(statId, context, callStack, traceEnabled) {
    if (callStack.has(statId)) {
      const chain = Array.from(callStack).join(" -> ") + " -> " + statId;
      throw new Error(`Cyclic dependency detected: ${chain}`);
    }

    if (!traceEnabled && this.cache.has(statId)) {
      return this.cache.get(statId);
    }

    callStack.add(statId);

    const statDef = this.statDefinitions.get(statId);
    let baseValue = statDef?.baseValue ?? 1;
    if (statDef?.baseFormula && typeof statDef.baseFormula === "function") {
      baseValue = statDef.baseFormula(context);
    }

    const effects = this.registry.getEffectsForTarget(statId);

    const nestedContext = {
      ...context,
      resolve: (depStatId, options = {}) =>
        this._resolveInternal(
          depStatId,
          nestedContext,
          callStack,
          options.trace ?? false,
        ),
      statId,
    };

    const result = this.engine.compute({
      baseValue,
      effects,
      context: nestedContext,
    });

    callStack.delete(statId);

    if (!traceEnabled) {
      this.cache.set(statId, result.value);
      return result.value;
    }

    return result;
  }

  getTrace(statId, context = {}) {
    return this.resolve(statId, context, { trace: true });
  }
}

export const defaultStatResolver = new StatResolver();
