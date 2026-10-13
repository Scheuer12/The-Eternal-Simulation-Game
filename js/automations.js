export const AUTOMATION_DEFINITIONS = [
  {
    id: "autoCalculator",
    name: "Auto Calculator",
    description:
      "Automatically runs Algorithm Improvements. Owned Calculators still grant their study-speed bonus while this is paused.",
    isAcquired: (state) => (state.devices?.autoCalculators ?? 0) > 0,
  },
  {
    id: "fiftyGCalculator",
    name: "50G Calculator",
    description:
      "Extends Auto Calculator routing to timed Algorithm Upgrades when their requirements are met.",
    isAcquired: (state) => Boolean(state.science?.fiftyGCalculator),
  },
  {
    id: "aiCalculationSupport",
    name: "AI Calculation Support",
    description:
      "Lets Auto Calculator claim Calculation Method Upgrades as soon as they are ready.",
    isAcquired: (state) =>
      Boolean(state.science?.perks?.aiCalculationSupport),
  },
];

const AUTOMATIONS_BY_ID = new Map(
  AUTOMATION_DEFINITIONS.map((automation) => [automation.id, automation]),
);

export function getAutomation(id) {
  return AUTOMATIONS_BY_ID.get(id) ?? null;
}

export function createAutomationState() {
  return {
    unlocked: {},
    enabled: {},
  };
}

export function ensureAutomationState(state) {
  if (!state.automations) {
    state.automations = createAutomationState();
  }
  if (!state.automations.unlocked) state.automations.unlocked = {};
  if (!state.automations.enabled) state.automations.enabled = {};
  return state.automations;
}

export function isAutomationUnlocked(state, id) {
  const automation = getAutomation(id);
  if (!automation) return false;
  return (
    Boolean(state.automations?.unlocked?.[id]) || automation.isAcquired(state)
  );
}

export function isAutomationEnabled(state, id) {
  return state.automations?.enabled?.[id] !== false;
}

export function listUnlockedAutomations(state) {
  return AUTOMATION_DEFINITIONS.filter((automation) =>
    isAutomationUnlocked(state, automation.id),
  );
}

export function hasUnlockedAutomations(state) {
  return listUnlockedAutomations(state).length > 0;
}

export function unlockAutomation(state, id) {
  if (!getAutomation(id)) return false;
  const automations = ensureAutomationState(state);
  automations.unlocked[id] = true;
  if (automations.enabled[id] === undefined) {
    automations.enabled[id] = true;
  }
  return true;
}

export function setAutomationEnabled(state, id, enabled) {
  if (!isAutomationUnlocked(state, id)) return false;
  const automations = ensureAutomationState(state);
  automations.unlocked[id] = true;
  automations.enabled[id] = Boolean(enabled);
  return true;
}

export function isAutoCalculatorAutomationActive(state) {
  return (
    (state.devices?.autoCalculators ?? 0) > 0 &&
    isAutomationEnabled(state, "autoCalculator")
  );
}

export function isFiftyGCalculatorAutomationActive(state) {
  return (
    Boolean(state.science?.fiftyGCalculator) &&
    isAutomationEnabled(state, "fiftyGCalculator") &&
    isAutoCalculatorAutomationActive(state)
  );
}

export function isAiCalculationSupportAutomationActive(state) {
  return (
    Boolean(state.science?.perks?.aiCalculationSupport) &&
    isAutomationEnabled(state, "aiCalculationSupport") &&
    isAutoCalculatorAutomationActive(state)
  );
}

export function inferUnlockedAutomations(state) {
  const unlocked = { ...(state.automations?.unlocked ?? {}) };
  for (const automation of AUTOMATION_DEFINITIONS) {
    if (unlocked[automation.id] || automation.isAcquired(state)) {
      unlocked[automation.id] = true;
    }
  }
  return unlocked;
}
