import { COMPONENT_REGISTRY } from "./component-registry.js";
import {
  calculateAlgorithmUpgradeRequirement,
  calculateAutoCalculatorCost,
  calculateCalculationMethodRequirement,
  calculateCrcCost,
  calculateOverclockerCost,
  calculatePowerCellCost,
  calculatePowerModuleCost,
  calculatePowerModuleRequirement,
  calculateProcessorCost,
  calculateSetupOptimizationRequirement,
  formatEnergy
} from "./formulas.js";

function readPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function readConfigValue(config, rule) {
  if (rule.configPath) return readPath(config, rule.configPath);
  return rule.value;
}

function calculateRequirement(spec, state, config) {
  if (!spec.requirement) return null;

  const formulas = {
    algorithmUpgradeRequirement: () =>
      calculateAlgorithmUpgradeRequirement(state, config),
    calculationMethodRequirement: () =>
      calculateCalculationMethodRequirement(state, config),
    setupOptimizationRequirement: () =>
      calculateSetupOptimizationRequirement(state, config),
    powerModuleRequirement: () =>
      calculatePowerModuleRequirement(state.powerModules, config)
  };

  return formulas[spec.requirement.name]?.() ?? null;
}

export function calculateComponentCost(componentId, state, config) {
  const spec = COMPONENT_REGISTRY[componentId];
  if (!spec || !spec.cost || spec.cost.kind === "none") return 0;

  if (spec.cost.kind === "config") {
    return readPath(config, spec.cost.path);
  }

  const formulas = {
    autoCalculatorCost: () =>
      calculateAutoCalculatorCost(state.devices.autoCalculators, config),
    processorCost: () =>
      calculateProcessorCost(state.devices.processors, config),
    overclockerCost: () =>
      calculateOverclockerCost(state.devices.overclockers, config),
    powerCellCost: () => calculatePowerCellCost(state.powerCells, config),
    powerModuleCost: () => calculatePowerModuleCost(state.powerModules, config),
    crcCost: () => calculateCrcCost(state, config)
  };

  return formulas[spec.cost.name]?.() ?? 0;
}

function getOwnedCount(spec, state) {
  if (!spec.ownedPath) return 0;
  const value = readPath(state, spec.ownedPath);
  if (spec.ownedMode === "boolean") return value ? 1 : 0;
  return Number.isFinite(value) ? value : 0;
}

function evaluateRule(rule, spec, state, config, cost, requirement) {
  if (rule.kind === "any") {
    return rule.rules.some((child) =>
      evaluateRule(child, spec, state, config, cost, requirement)
    );
  }

  if (rule.kind === "truthy") return Boolean(readPath(state, rule.path));
  if (rule.kind === "falsy") return !readPath(state, rule.path);
  if (rule.kind === "notOwned") return getOwnedCount(spec, state) <= 0;

  if (rule.kind === "resourceAtLeastCost") {
    return readPath(state, rule.resource) >= cost;
  }

  if (rule.kind === "stateAtLeast") {
    return readPath(state, rule.path) >= readConfigValue(config, rule);
  }

  if (rule.kind === "stateAtLeastRequirement") {
    return readPath(state, rule.path) >= requirement;
  }

  return false;
}

function describeBlockedRule(rule, state, config, cost, requirement) {
  if (rule.kind === "resourceAtLeastCost") {
    return `Needs ${formatEnergy(cost)}`;
  }

  if (rule.kind === "stateAtLeastRequirement") {
    return `Needs ${requirement}`;
  }

  if (rule.kind === "stateAtLeast") {
    return `Needs ${readConfigValue(config, rule)}`;
  }

  if (rule.kind === "notOwned") return "Already restored";
  if (rule.kind === "falsy") return "Busy";
  return "Locked";
}

export function evaluateComponent(componentId, state, config) {
  const spec = COMPONENT_REGISTRY[componentId];
  if (!spec) throw new Error(`Unknown component: ${componentId}`);

  const cost = calculateComponentCost(componentId, state, config);
  const requirement = calculateRequirement(spec, state, config);
  const visible = spec.visibleWhen.every((rule) =>
    evaluateRule(rule, spec, state, config, cost, requirement)
  );
  const blockedRule = spec.enabledWhen.find(
    (rule) => !evaluateRule(rule, spec, state, config, cost, requirement)
  );

  return {
    id: spec.id,
    label: spec.label,
    type: spec.type,
    action: spec.action,
    visible,
    enabled: visible && !blockedRule,
    affordable: cost === 0 || state.energy >= cost,
    cost,
    requirement,
    owned: getOwnedCount(spec, state),
    completed: Boolean(spec.completedWhenOwned && getOwnedCount(spec, state) > 0),
    reason: blockedRule
      ? describeBlockedRule(blockedRule, state, config, cost, requirement)
      : ""
  };
}

export function buildAvailabilitySnapshot(state, config) {
  return Object.fromEntries(
    Object.keys(COMPONENT_REGISTRY).map((componentId) => [
      componentId,
      evaluateComponent(componentId, state, config)
    ])
  );
}
