import { big } from "./numeric.js";

export const SCIENCE_PERKS = [
  {
    id: "redundancyElimination",
    name: "Redundancy Elimination",
    branch: "layer",
    cost: 1,
    requires: [],
    effect:
      "Algorithm Upgrades compound Algorithm Improvement research speed across successive cycles. The bonus applies fully through 50 Improvements, weakens sharply after that, and stops growing at 100 Improvements. Opens the main Science Tree branches.",
    summary:
      "Compounds A. Improvement research speed, softcapped at 50 and hardcapped at 100 Improvements.",
  },
  {
    id: "particleGenerator",
    name: "Particle Generator",
    branch: "layer",
    cost: 1,
    requires: [
      "redundancyElimination",
      "quantumCalculationPrinciples",
      "quantumSuperposition",
    ],
    effect:
      "Unlocks the Particle Generator and begins the transition to the Particles Era, with new particle manipulation systems.",
    revealHint: "Reach 100e60 J Stored Energy to reveal this technology.",
    storedEnergyRequiredConfigPath:
      "science.quantumPerks.particleGeneratorStoredEnergyRequired",
    summary: "Opens particle generation and the Particles Era.",
  },
  {
    id: "quantumCalculationPrinciples",
    name: "Quantum Calculation Principles",
    branch: "quantum",
    cost: 1,
    requires: ["redundancyElimination"],
    revealedAtAllocatedSciencePointsConfigPath:
      "science.quantumPerks.revealAtAllocatedSciencePoints",
    revealHint: "Allocate 3 Science Points to reveal this technology.",
    effect:
      "Algorithm Upgrade execution becomes faster based on Total Quarks Earned, with a logarithmic bonus, softcap and hardcap.",
    summary: "Quarks provide a capped A. Upgrade speed bonus.",
  },
  {
    id: "quantumSuperposition",
    name: "Quantum Superposition",
    branch: "quantum",
    cost: 1,
    requires: ["redundancyElimination"],
    revealedAtAllocatedSciencePointsConfigPath:
      "science.quantumPerks.revealAtAllocatedSciencePoints",
    revealHint: "Allocate 3 Science Points to reveal this technology.",
    effect:
      "Quarks accelerate Algorithm Improvement research directly by a logarithmic curve (V_quantum = 1 + 0.02 * log10(1 + Quarks)).",
    summary: "Quarks accelerate Algorithm Improvement research.",
  },
  {
    id: "processorBonusAppliesCRC",
    name: "Processor Bonus applies to CRC",
    branch: "energy",
    cost: 1,
    requires: ["redundancyElimination"],
    effect:
      "Applies the Processor bonus to CRC production at reduced strength: the total Processor bonus raised to the 0.15 power.",
    summary: "Adds a reduced Processor bonus to CRC output.",
  },
  {
    id: "powerModulesScaling",
    name: "Power Modules Scaling",
    branch: "energy",
    cost: 1,
    requires: ["processorBonusAppliesCRC"],
    effect: "Power Modules become slightly stronger as you own more of them.",
    summary: "Each Power Module scales the next ones slightly.",
  },
  {
    id: "powerCellResonance",
    name: "Power Cell Resonance",
    branch: "energy",
    cost: 2,
    requires: ["powerModulesScaling"],
    effect:
      "Power Cell capacity is multiplied by 1 + 0.02 * log10(1 + Power Cells owned).",
    summary: "Expands Power Cell capacity based on owned cells.",
  },
  {
    id: "sciencePoweredEnergyProduction",
    name: "Science-Powered Energy Production",
    branch: "energy",
    cost: 2,
    requires: ["processorBonusAppliesCRC"],
    effect:
      "Multiplies Energy production by the total number of Science Points ever earned.",
    summary: "More lifetime Science Points mean more Energy.",
  },
  {
    id: "crcExponentialScaling",
    name: "CRC Exponential Scaling",
    branch: "energy",
    cost: 3,
    requires: ["sciencePoweredEnergyProduction"],
    effect:
      "Each CRC adds a small 1.005 exponential multiplier to base Energy production.",
    summary: "More CRCs slightly amplify base production.",
  },
  {
    id: "fiftyGCalculator",
    name: "50G Calculator",
    branch: "automation",
    costPath: "science.fiftyGCalculator.cost",
    requires: ["redundancyElimination"],
    effect:
      "Automates Algorithm Upgrades using timed research and applicable study-speed bonuses. Manual Algorithm Upgrades remain instant.",
    summary: "Automates A. Upgrades through timed research.",
  },
  {
    id: "aiCalculationSupport",
    name: "AI Calculation Support",
    branch: "automation",
    cost: 1,
    requires: ["fiftyGCalculator"],
    effect:
      "Allows the Calculator to automate Calculation Method Upgrades (CMUs).",
    summary: "Automates Calculation Method Upgrades.",
  },
  {
    id: "roboticArms",
    name: "Robotic Arms",
    branch: "automation",
    cost: 1,
    requires: ["fiftyGCalculator"],
    effect: "Unlocks the Power Cells Auto Installer.",
    summary: "Installs Power Cells automatically.",
  },
  {
    id: "roboticPinch",
    name: "Robotic Pinch",
    branch: "automation",
    cost: 1,
    requires: ["roboticArms"],
    effect: "Unlocks the Processor Auto Installer.",
    summary: "Installs Processors automatically.",
  },
  {
    id: "roboticArmT2",
    name: "Robotic Arm T2",
    branch: "automation",
    cost: 1,
    requires: ["roboticPinch"],
    effect: "Unlocks the Calculator Auto Installer.",
    summary: "Installs Calculators automatically.",
  },
  {
    id: "roboticArmT3",
    name: "Robotic Arm T3",
    branch: "automation",
    cost: 1,
    requires: ["roboticArmT2"],
    effect: "Unlocks the Power Module Auto Installer.",
    summary: "Installs Power Modules automatically.",
  },
  {
    id: "assemblyLine",
    name: "Assembly Line",
    branch: "automation",
    cost: 3,
    requires: ["roboticArmT3"],
    effect:
      "Unlocks the Assembly Line tab and Assembly Units for automated device fabrication. Also unlocks the CRC Auto Installer and enables Auto Crafter perks.",
    summary: "Opens Assembly Units and device fabrication.",
  },
  {
    id: "powerCellsAutoCrafter",
    name: "Power Cells Auto Crafter",
    branch: "automation",
    cost: 1,
    requires: ["assemblyLine"],
    effect:
      "Unlocks the Power Cells Auto Crafter, Power Cells module crafting, and the CRC Auto Installer motherboard module.",
    summary: "Unlocks Power Cell and CRC module crafting.",
  },
  {
    id: "processorAutoCrafter",
    name: "Processor Auto Crafter",
    branch: "automation",
    cost: 1,
    requires: ["assemblyLine"],
    effect: "Unlocks the Processor Auto Crafter and its module crafting.",
    summary: "Unlocks Processor crafting.",
  },
  {
    id: "calculatorAutoCrafter",
    name: "Calculator Auto Crafter",
    branch: "automation",
    cost: 1,
    requires: ["assemblyLine"],
    effect: "Unlocks the Calculator Auto Crafter and its module crafting.",
    summary: "Unlocks Calculator crafting.",
  },
  {
    id: "motherboardModuleAutoCrafter",
    name: "Motherboard Module Autocrafter for CRC Auto Installer",
    branch: "automation",
    cost: 1,
    requires: ["powerCellsAutoCrafter"],
    revealHint: "Reach 100e21 J Stored Energy to reveal this technology.",
    storedEnergyRequiredConfigPath:
      "science.automationPerks.motherboardModuleStoredEnergyRequired",
    effect: "Enables motherboard-module crafting for the CRC Auto Installer.",
    summary: "Crafts CRC installer motherboard modules.",
  },
  {
    id: "powerCellsModuleAutoCrafter",
    name: "Power Cells Module Auto Crafter",
    branch: "automation",
    cost: 1,
    requires: ["powerCellsAutoCrafter"],
    revealWhenPerkOwned: ["motherboardModuleAutoCrafter"],
    revealHint: "Acquire the Motherboard Module Autocrafter first.",
    effect: "Enables Power Cells module crafting.",
    summary: "Crafts Power Cell modules.",
  },
  {
    id: "processorModuleAutoCrafter",
    name: "Processor Module Auto Crafter",
    branch: "automation",
    cost: 1,
    requires: ["processorAutoCrafter"],
    revealWhenPerkOwned: ["motherboardModuleAutoCrafter"],
    revealHint: "Acquire the Motherboard Module Autocrafter first.",
    effect: "Enables Processor module crafting.",
    summary: "Crafts Processor modules.",
  },
  {
    id: "calculatorModuleAutoCrafter",
    name: "Calculator Module Auto Crafter",
    branch: "automation",
    cost: 1,
    requires: ["calculatorAutoCrafter"],
    revealWhenPerkOwned: ["motherboardModuleAutoCrafter"],
    revealHint: "Acquire the Motherboard Module Autocrafter first.",
    effect: "Enables Calculator module crafting.",
    summary: "Crafts Calculator modules.",
  },
  {
    id: "calculatorBonusAppliesAUpgrades",
    name: "Calculator Bonus applies to A. Upgrades",
    branch: "studies",
    cost: 1,
    requires: ["redundancyElimination"],
    effect: "Accelerates automated Algorithm Upgrades by 1 + 0.2 * log10(1 + V_A).",
    summary: "Scales Calculator fleet speed to accelerate A. Upgrades.",
  },
  {
    id: "calculatorBonusX2ToX22",
    name: "Calculator Bonus +50% → +70%",
    branch: "studies",
    cost: 2,
    requires: ["calculatorBonusAppliesAUpgrades"],
    effect: "Increases the Auto Calculator base unit bonus from +50% to +70%.",
    summary: "Raises Calculator unit bonus from +50% to +70%.",
  },
  {
    id: "processorBonusAppliesAImprovementSpeed",
    name: "Processor Bonus applies to A. Improvements speed",
    branch: "studies",
    cost: 2,
    requires: ["calculatorBonusX2ToX22", "redundancyElimination"],
    effect:
      "Applies the Processor bonus to Algorithm Improvement research speed, raised to the 1.07 power.",
    summary: "Boosts A. Improvement research speed.",
  },
];

export const SCIENCE_PERK_BRANCHES = [
  {
    id: "energy",
    title: "Energy",
    tone: "energy",
    tiers: [
      ["processorBonusAppliesCRC"],
      ["powerModulesScaling", "sciencePoweredEnergyProduction"],
      ["powerCellResonance", "crcExponentialScaling"],
    ],
  },
  {
    id: "automation",
    title: "Automation & Life Quality",
    tone: "automation",
    tiers: [
      ["fiftyGCalculator"],
      ["aiCalculationSupport", "roboticArms"],
      ["roboticPinch"],
      ["roboticArmT2"],
      ["roboticArmT3"],
      ["assemblyLine"],
      [
        "powerCellsAutoCrafter",
        "processorAutoCrafter",
        "calculatorAutoCrafter",
      ],
      [
        "motherboardModuleAutoCrafter",
        "powerCellsModuleAutoCrafter",
        "processorModuleAutoCrafter",
        "calculatorModuleAutoCrafter",
      ],
    ],
  },
  {
    id: "studies",
    title: "Studies",
    tone: "studies",
    tiers: [
      ["calculatorBonusAppliesAUpgrades"],
      ["calculatorBonusX2ToX22"],
      ["processorBonusAppliesAImprovementSpeed"],
    ],
  },
];

const SCIENCE_PERKS_BY_ID = new Map(
  SCIENCE_PERKS.map((perk) => [perk.id, perk]),
);

function readConfigPath(config, path) {
  return path.split(".").reduce((value, key) => value?.[key], config);
}

export function getSciencePerk(id) {
  return SCIENCE_PERKS_BY_ID.get(id) ?? null;
}

export function getSciencePerkCost(perk, config) {
  if (perk.costPath) return readConfigPath(config, perk.costPath);
  return perk.cost;
}

export function getSciencePerkStoredEnergyRequirement(perk, config) {
  if (!perk.storedEnergyRequiredConfigPath) {
    return perk.storedEnergyRequired ?? 0;
  }
  return readConfigPath(config, perk.storedEnergyRequiredConfigPath) ?? 0;
}

export function isSciencePerkOwned(state, id) {
  if (id === "fiftyGCalculator") {
    return Boolean(state.science?.[id]);
  }
  return Boolean(state.science?.perks?.[id]);
}

export function getAllocatedSciencePoints(state) {
  return Math.max(
    0,
    (state.science?.totalScienceEarned ?? 0) - (state.sciencePoints ?? 0),
  );
}

export function isSciencePerkRevealed(perk, state, config) {
  if (isSciencePerkOwned(state, perk.id)) return true;
  const allocatedSciencePointRequirement =
    perk.revealedAtAllocatedSciencePointsConfigPath
      ? readConfigPath(config, perk.revealedAtAllocatedSciencePointsConfigPath)
      : perk.revealedAtAllocatedSciencePoints;
  if (
    allocatedSciencePointRequirement &&
    getAllocatedSciencePoints(state) < allocatedSciencePointRequirement
  ) {
    return false;
  }
  const storedEnergyRequired = getSciencePerkStoredEnergyRequirement(
    perk,
    config,
  );
  if (storedEnergyRequired) {
    const hasReachedStoredEnergy =
      Boolean(state.science?.revealedPerks?.[perk.id]) ||
      big(state.energy).gte(storedEnergyRequired);
    if (!hasReachedStoredEnergy) return false;
  }
  return (perk.revealWhenPerkOwned ?? []).every((requiredPerkId) =>
    isSciencePerkOwned(state, requiredPerkId),
  );
}

export function evaluateSciencePerk(id, state, config) {
  const perk = getSciencePerk(id);
  if (!perk) return null;

  const missingPrerequisites = perk.requires.filter(
    (prerequisiteId) => !isSciencePerkOwned(state, prerequisiteId),
  );
  const owned = isSciencePerkOwned(state, id);
  const cost = getSciencePerkCost(perk, config);
  const hasEnoughScience = state.sciencePoints >= cost;
  const storedEnergyRequirement = getSciencePerkStoredEnergyRequirement(
    perk,
    config,
  );
  const energyRequirementMet =
    (!perk.peakEnergyRequired ||
      big(state.peakEnergy).gte(perk.peakEnergyRequired)) &&
    (!storedEnergyRequirement ||
      Boolean(state.science?.revealedPerks?.[perk.id]) ||
      big(state.energy).gte(storedEnergyRequirement));
  const revealed = isSciencePerkRevealed(perk, state, config);

  return {
    perk,
    cost,
    owned,
    revealed,
    missingPrerequisites,
    hasEnoughScience,
    energyRequirementMet,
    canPurchase:
      !owned &&
      revealed &&
      missingPrerequisites.length === 0 &&
      hasEnoughScience &&
      energyRequirementMet,
  };
}
