/**
 * FormulaRegistry
 * Maintains named, pure mathematical formulas accessible by ID.
 * Follows the architectural contract: pure mathematical functions without mutating state.
 */

export class FormulaRegistry {
  constructor() {
    this.formulas = new Map();
  }

  register(formulaId, formulaFn) {
    if (typeof formulaId !== "string" || !formulaId) {
      throw new Error("Formula ID must be a non-empty string");
    }
    if (typeof formulaFn !== "function") {
      throw new Error(`Formula for "${formulaId}" must be a function`);
    }
    this.formulas.set(formulaId, formulaFn);
  }

  get(formulaId) {
    return this.formulas.get(formulaId) ?? null;
  }

  has(formulaId) {
    return this.formulas.has(formulaId);
  }

  execute(formulaId, ...args) {
    const fn = this.get(formulaId);
    if (!fn) {
      throw new Error(`Formula "${formulaId}" not registered`);
    }
    return fn(...args);
  }

  getAllFormulaIds() {
    return Array.from(this.formulas.keys());
  }

  clear() {
    this.formulas.clear();
  }
}

export const defaultFormulaRegistry = new FormulaRegistry();
