export const COMPONENT_REGISTRY = {
  softDataDisplay: {
    id: "softDataDisplay",
    type: "device",
    tab: "devices",
    subcategory: "computational",
    label: "Soft Display",
    action: "buy-soft-display",
    ownedPath: "devices.softDataDisplay",
    ownedMode: "boolean",
    completedWhenOwned: true,
    cost: { kind: "config", path: "softDataDisplay.cost" },
    visibleWhen: [],
    enabledWhen: [
      { kind: "notOwned" },
      { kind: "resourceAtLeastCost", resource: "energy" }
    ]
  },
  t2SoftDataDisplay: {
    id: "t2SoftDataDisplay",
    type: "device",
    tab: "devices",
    subcategory: "computational",
    label: "T2 Soft Display",
    action: "buy-t2-soft-display",
    ownedPath: "devices.t2SoftDataDisplay",
    ownedMode: "boolean",
    completedWhenOwned: true,
    cost: { kind: "config", path: "t2SoftDataDisplay.cost" },
    visibleWhen: [{ kind: "truthy", path: "devices.softDataDisplay" }],
    enabledWhen: [
      { kind: "notOwned" },
      { kind: "resourceAtLeastCost", resource: "energy" }
    ]
  },
  autoCalculator: {
    id: "autoCalculator",
    type: "device",
    tab: "devices",
    subcategory: "computational",
    label: "Auto Calculator",
    action: "buy-auto",
    ownedPath: "devices.autoCalculators",
    ownedMode: "count",
    cost: { kind: "formula", name: "autoCalculatorCost" },
    visibleWhen: [],
    enabledWhen: [{ kind: "resourceAtLeastCost", resource: "energy" }]
  },
  processor: {
    id: "processor",
    type: "device",
    tab: "devices",
    subcategory: "computational",
    label: "Processor",
    action: "buy-processor",
    ownedPath: "devices.processors",
    ownedMode: "count",
    cost: { kind: "formula", name: "processorCost" },
    visibleWhen: [],
    enabledWhen: [{ kind: "resourceAtLeastCost", resource: "energy" }]
  },
  overclocker: {
    id: "overclocker",
    type: "device",
    tab: "devices",
    subcategory: "computational",
    label: "Overclocker",
    action: "buy-overclocker",
    ownedPath: "devices.overclockers",
    ownedMode: "count",
    cost: { kind: "formula", name: "overclockerCost" },
    visibleWhen: [
      { kind: "stateAtLeast", path: "devices.processors", configPath: "overclocker.processorsRequired" },
      { kind: "stateAtLeast", path: "powerCells", configPath: "overclocker.powerCellsRequired" }
    ],
    enabledWhen: [{ kind: "resourceAtLeastCost", resource: "energy" }]
  },
  powerCell: {
    id: "powerCell",
    type: "device",
    tab: "devices",
    subcategory: "energy",
    label: "Power Cell",
    action: "buy-power-cell",
    ownedPath: "powerCells",
    ownedMode: "count",
    cost: { kind: "formula", name: "powerCellCost" },
    visibleWhen: [
      { kind: "truthy", path: "devices.softDataDisplay" },
      { kind: "stateAtLeast", path: "upgrades", configPath: "powerCell.algorithmUpgradesRequired" }
    ],
    enabledWhen: [{ kind: "resourceAtLeastCost", resource: "energy" }]
  },
  powerModule: {
    id: "powerModule",
    type: "device",
    tab: "devices",
    subcategory: "energy",
    label: "Power Module",
    action: "buy-power-module",
    ownedPath: "powerModules",
    ownedMode: "count",
    cost: { kind: "formula", name: "powerModuleCost" },
    requirement: { kind: "formula", name: "powerModuleRequirement" },
    visibleWhen: [
      { kind: "stateAtLeastRequirement", path: "powerCells" }
    ],
    enabledWhen: [
      { kind: "stateAtLeastRequirement", path: "powerCells" },
      { kind: "resourceAtLeastCost", resource: "energy" }
    ]
  },
  particleSynthesizer: {
    id: "particleSynthesizer",
    type: "device",
    tab: "science",
    subcategory: "energy",
    label: "Particle Sintetizer",
    action: "activate-particle-synthesizer",
    ownedPath: "particleSynthesizer.activated",
    ownedMode: "boolean",
    completedWhenOwned: true,
    cost: { kind: "config", path: "particleLab.synthesizerEnergyRequired" },
    visibleWhen: [
      { kind: "stateAtLeast", path: "peakEnergy", configPath: "particleLab.doorEnergyRequired" }
    ],
    enabledWhen: [
      { kind: "notOwned" },
      { kind: "resourceAtLeastCost", resource: "energy" }
    ]
  },
  matrixMechanics: {
    id: "matrixMechanics",
    type: "science",
    tab: "science",
    label: "Matrix Mechanics",
    action: "buy-matrix-mechanics",
    ownedPath: "science.matrixMechanics",
    ownedMode: "boolean",
    completedWhenOwned: true,
    cost: { kind: "config", path: "science.matrixMechanics.cost" },
    visibleWhen: [
      { kind: "any", rules: [
        { kind: "stateAtLeast", path: "sciencePoints", value: 1 },
        { kind: "truthy", path: "science.matrixMechanics" }
      ] }
    ],
    enabledWhen: [
      { kind: "notOwned" },
      { kind: "resourceAtLeastCost", resource: "sciencePoints" }
    ]
  },
  crcBlueprint: {
    id: "crcBlueprint",
    type: "study",
    tab: "studies",
    label: "CRC Blueprint",
    action: "start-blueprint-research",
    ownedPath: "discoveries.crcBlueprint",
    ownedMode: "boolean",
    completedWhenOwned: true,
    cost: { kind: "none" },
    visibleWhen: [
      { kind: "any", rules: [
        { kind: "truthy", path: "discoveries.crcBlueprint" },
        { kind: "truthy", path: "blueprintStudy.active" },
        { kind: "stateAtLeast", path: "peakEnergy", configPath: "blueprint.revealAtPeakEnergy" }
      ] }
    ],
    enabledWhen: [
      { kind: "falsy", path: "discoveries.crcBlueprint" },
      { kind: "falsy", path: "blueprintStudy.active" },
      { kind: "stateAtLeast", path: "peakEnergy", configPath: "blueprint.revealAtPeakEnergy" }
    ]
  },
  crcConstruction: {
    id: "crcConstruction",
    type: "device",
    tab: "devices",
    subcategory: "energy",
    label: "Cosmic Radiation Condenser",
    action: "construct-crc",
    ownedPath: "crcCount",
    ownedMode: "count",
    cost: { kind: "formula", name: "crcCost" },
    visibleWhen: [{ kind: "truthy", path: "discoveries.crcBlueprint" }],
    enabledWhen: [
      { kind: "falsy", path: "construction.active" },
      { kind: "resourceAtLeastCost", resource: "energy" }
    ]
  },
  algorithmUpgrade: {
    id: "algorithmUpgrade",
    type: "study",
    tab: "studies",
    label: "Algorithm Upgrade",
    action: "start-algorithm-upgrade",
    ownedPath: "upgrades",
    ownedMode: "count",
    cost: { kind: "none" },
    requirement: { kind: "formula", name: "algorithmUpgradeRequirement" },
    visibleWhen: [
      { kind: "any", rules: [
        { kind: "stateAtLeast", path: "upgrades", value: 1 },
        { kind: "stateAtLeastRequirement", path: "improvements" }
      ] }
    ],
    enabledWhen: [
      { kind: "falsy", path: "algorithmUpgradeStudy.active" },
      { kind: "stateAtLeastRequirement", path: "improvements" }
    ]
  },
  calculationMethodUpgrade: {
    id: "calculationMethodUpgrade",
    type: "reset",
    tab: "studies",
    label: "Calculation Method Upgrade",
    action: "claim-method",
    ownedPath: "calculationMethods",
    ownedMode: "count",
    cost: { kind: "none" },
    requirement: { kind: "formula", name: "calculationMethodRequirement" },
    visibleWhen: [
      { kind: "any", rules: [
        { kind: "stateAtLeast", path: "upgrades", value: 1 },
        { kind: "stateAtLeast", path: "calculationMethods", value: 1 }
      ] }
    ],
    enabledWhen: [{ kind: "stateAtLeastRequirement", path: "upgrades" }]
  },
  setupOptimization: {
    id: "setupOptimization",
    type: "reset",
    tab: "devices",
    subcategory: "reset",
    label: "Setup Optimization",
    action: "claim-setup",
    ownedPath: "setupOptimizations",
    ownedMode: "count",
    cost: { kind: "none" },
    requirement: { kind: "formula", name: "setupOptimizationRequirement" },
    visibleWhen: [
      { kind: "any", rules: [
        { kind: "stateAtLeast", path: "upgrades", value: 1 },
        { kind: "stateAtLeast", path: "calculationMethods", value: 1 },
        { kind: "stateAtLeast", path: "setupOptimizations", value: 1 }
      ] }
    ],
    enabledWhen: [{ kind: "stateAtLeastRequirement", path: "calculationMethods" }]
  }
};
