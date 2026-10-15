/**
 * EffectEngine
 * Deterministically applies and composes effects following the explicit pipeline:
 * base -> add -> multiply -> power -> log -> cap/floor -> override
 * Resolves operands using context, with tie-breaking by priority (descending) and effectId.
 */

import { big, bigMax, bigMin } from "./numeric.js";

export const PIPELINE_ORDER = [
  "base",
  "add",
  "multiply",
  "power",
  "log",
  "cap",
  "floor",
  "override",
];

const OPERATION_ALIASES = {
  mult: "multiply",
  pow: "power",
  hardcap: "cap",
  softcap: "cap",
};

export function normalizeOperation(op) {
  const lower = String(op).toLowerCase();
  return OPERATION_ALIASES[lower] ?? lower;
}

export class EffectEngine {
  constructor({ customOperations = {} } = {}) {
    this.customOperations = customOperations;
  }

  /**
   * Sorts effects according to pipeline order, then priority (descending), then effectId (lexicographical).
   */
  sortEffects(effects) {
    return [...effects].sort((a, b) => {
      const opA = normalizeOperation(a.operation);
      const opB = normalizeOperation(b.operation);

      const phaseA = PIPELINE_ORDER.indexOf(opA);
      const phaseB = PIPELINE_ORDER.indexOf(opB);

      const rankA = phaseA === -1 ? 999 : phaseA;
      const rankB = phaseB === -1 ? 999 : phaseB;

      if (rankA !== rankB) return rankA - rankB;

      const priorityA = Number(a.priority ?? 0);
      const priorityB = Number(b.priority ?? 0);
      if (priorityA !== priorityB) return priorityB - priorityA;

      return String(a.id).localeCompare(String(b.id));
    });
  }

  /**
   * Resolves the operand value from an effect definition in the given context.
   */
  resolveOperand(effect, context) {
    if (typeof effect.value === "function") {
      return effect.value(context);
    }
    return effect.value;
  }

  /**
   * Evaluates if an effect should be active in the given context.
   */
  isEffectActive(effect, context) {
    if (effect.condition === undefined) return true;
    if (typeof effect.condition === "function") {
      return Boolean(effect.condition(context));
    }
    return Boolean(effect.condition);
  }

  /**
   * Computes the final stat value from a list of effects and an optional starting base value.
   * Produces a structured trace of all steps.
   */
  compute({ baseValue = 1, effects = [], context = {} } = {}) {
    const sorted = this.sortEffects(effects);
    let current = big(baseValue);
    const trace = [];

    for (const effect of sorted) {
      const active = this.isEffectActive(effect, context);
      if (!active) {
        trace.push({
          effectId: effect.id,
          label: effect.label ?? effect.id,
          source: effect.source,
          operation: effect.operation,
          active: false,
          valueBefore: current,
          valueAfter: current,
        });
        continue;
      }

      const op = normalizeOperation(effect.operation);
      const rawOperand = this.resolveOperand(effect, context);
      const before = current;

      switch (op) {
        case "base": {
          current = big(rawOperand);
          break;
        }
        case "add": {
          current = current.add(big(rawOperand));
          break;
        }
        case "multiply": {
          current = current.mul(big(rawOperand));
          break;
        }
        case "power": {
          current = current.pow(big(rawOperand));
          break;
        }
        case "log": {
          const base = effect.logBase ? big(effect.logBase).toNumber() : 10;
          if (base === 10) {
            current = current.gt(0) ? current.log10() : big(0);
          } else if (base === Math.E) {
            current = current.gt(0) ? current.ln() : big(0);
          } else {
            current = current.gt(0) ? current.log(base) : big(0);
          }
          break;
        }
        case "cap": {
          current = bigMin(current, big(rawOperand));
          break;
        }
        case "floor": {
          current = bigMax(current, big(rawOperand));
          break;
        }
        case "override": {
          current = big(rawOperand);
          break;
        }
        default: {
          if (this.customOperations[op]) {
            current = this.customOperations[op](current, rawOperand, context);
          } else {
            throw new Error(`Unknown effect operation: "${effect.operation}"`);
          }
          break;
        }
      }

      trace.push({
        effectId: effect.id,
        label: effect.label ?? effect.id,
        source: effect.source,
        operation: op,
        operand: rawOperand,
        active: true,
        valueBefore: before,
        valueAfter: current,
      });
    }

    return {
      value: current,
      trace,
    };
  }
}

export const defaultEffectEngine = new EffectEngine();
