import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateSciencePerk,
  SCIENCE_PERKS,
  SCIENCE_PERK_BRANCHES,
} from "../../js/science-perks.js";
import {
  createInitialState,
  normalizeState,
  SAVE_VERSION,
} from "../../js/state.js";

const config = JSON.parse(
  await readFile(
    new URL("../../config/game-config.json", import.meta.url),
    "utf8",
  ),
);

test("every Science perk is assigned to a visible branch with valid prerequisites", () => {
  const perkIds = new Set(SCIENCE_PERKS.map((perk) => perk.id));
  const laneIds = SCIENCE_PERK_BRANCHES.flatMap((branch) =>
    branch.tiers.flat(),
  );
  const rootIds = [
    "redundancyElimination",
    "quantumCalculationPrinciples",
    "quantumSuperposition",
    "particleGenerator",
  ];
  const treeIds = [...rootIds, ...laneIds];

  assert.equal(perkIds.size, SCIENCE_PERKS.length);
  assert.equal(treeIds.length, SCIENCE_PERKS.length);
  assert.equal(new Set(treeIds).size, treeIds.length);
  for (const perk of SCIENCE_PERKS) {
    assert.ok(treeIds.includes(perk.id), `${perk.id} is missing from the tree`);
    for (const prerequisiteId of perk.requires) {
      assert.ok(perkIds.has(prerequisiteId), `${prerequisiteId} is undefined`);
    }
  }
});

test("legacy Matrix Mechanics ownership migrates to Redundancy Elimination without changing SP", () => {
  const state = normalizeState(
    {
      saveVersion: SAVE_VERSION,
      sciencePoints: 2,
      science: {
        matrixMechanics: true,
        totalScienceEarned: 1,
      },
    },
    config,
  );

  assert.equal(state.sciencePoints, 2);
  assert.equal(state.science.perks.redundancyElimination, true);
  assert.equal("matrixMechanics" in state.science, false);
  assert.equal(
    evaluateSciencePerk("redundancyElimination", state, config).owned,
    true,
  );
});

test("save normalization persists energy-revealed perk discoveries using Stored Energy", () => {
  const energy =
    config.science.automationPerks.motherboardModuleStoredEnergyRequired;
  const state = normalizeState(
    {
      saveVersion: SAVE_VERSION,
      energy,
      peakEnergy: energy * 5,
      science: { totalScienceEarned: 0 },
    },
    config,
  );

  assert.equal(state.science.revealedPerks.motherboardModuleAutoCrafter, true);
  assert.equal(state.science.revealedPerks.particleGenerator, false);
});

test("a dependent Science perk stays locked until its prerequisite is acquired", () => {
  const state = createInitialState(config);
  state.sciencePoints = 5;

  const locked = evaluateSciencePerk("fiftyGCalculator", state, config);
  assert.equal(locked.canPurchase, false);
  assert.deepEqual(locked.missingPrerequisites, ["redundancyElimination"]);

  state.science.perks.redundancyElimination = true;
  const ready = evaluateSciencePerk("fiftyGCalculator", state, config);
  assert.equal(ready.canPurchase, true);
  assert.equal(ready.cost, 1);
});

test("Energy perks have the supplied costs and prerequisite chains", () => {
  const expected = [
    ["processorBonusAppliesCRC", 1, ["redundancyElimination"]],
    ["powerModulesScaling", 1, ["processorBonusAppliesCRC"]],
    ["powerCellResonance", 2, ["powerModulesScaling"]],
    ["sciencePoweredEnergyProduction", 2, ["processorBonusAppliesCRC"]],
    ["crcExponentialScaling", 3, ["sciencePoweredEnergyProduction"]],
  ];

  for (const [id, cost, requires] of expected) {
    const perk = SCIENCE_PERKS.find((item) => item.id === id);
    assert.ok(perk, `${id} is defined`);
    assert.equal(perk.cost, cost);
    assert.deepEqual(perk.requires, requires);
    assert.ok(
      SCIENCE_PERK_BRANCHES.some(
        (branch) => branch.id === "energy" && branch.tiers.flat().includes(id),
      ),
    );
  }
});

test("Quantum perks reveal at 3 SP spent; Particle Generator needs current Stored Energy", () => {
  const state = createInitialState(config);
  state.sciencePoints = 1;
  state.science.totalScienceEarned = 3;
  state.science.perks.redundancyElimination = true;

  assert.equal(
    evaluateSciencePerk("quantumCalculationPrinciples", state, config).revealed,
    false,
  );
  state.science.totalScienceEarned = 4;
  assert.equal(
    evaluateSciencePerk("quantumCalculationPrinciples", state, config).revealed,
    true,
  );

  state.science.perks.quantumCalculationPrinciples = true;
  state.science.perks.quantumSuperposition = true;
  assert.equal(
    evaluateSciencePerk("particleGenerator", state, config).revealed,
    false,
  );
  state.peakEnergy =
    config.science.quantumPerks.particleGeneratorStoredEnergyRequired;
  assert.equal(
    evaluateSciencePerk("particleGenerator", state, config).revealed,
    false,
    "Peak Energy alone must not reveal the perk",
  );
  state.energy =
    config.science.quantumPerks.particleGeneratorStoredEnergyRequired;
  const generator = evaluateSciencePerk("particleGenerator", state, config);
  assert.equal(generator.revealed, true);
  assert.equal(generator.canPurchase, true);
});

test("Motherboard and module-crafter nodes obey their reveal conditions independently of purchase dependencies", () => {
  const state = createInitialState(config);
  state.science.perks.redundancyElimination = true;
  state.science.perks.powerCellsAutoCrafter = true;
  const motherboard = "motherboardModuleAutoCrafter";
  const modulePerk = "powerCellsModuleAutoCrafter";

  assert.equal(evaluateSciencePerk(motherboard, state, config).revealed, false);
  assert.equal(evaluateSciencePerk(modulePerk, state, config).revealed, false);

  state.peakEnergy =
    config.science.automationPerks.motherboardModuleStoredEnergyRequired;
  assert.equal(evaluateSciencePerk(motherboard, state, config).revealed, false);
  assert.equal(evaluateSciencePerk(modulePerk, state, config).revealed, false);

  state.energy =
    config.science.automationPerks.motherboardModuleStoredEnergyRequired;
  assert.equal(evaluateSciencePerk(motherboard, state, config).revealed, true);
  assert.equal(evaluateSciencePerk(modulePerk, state, config).revealed, false);

  state.science.perks[motherboard] = true;
  assert.equal(evaluateSciencePerk(modulePerk, state, config).revealed, true);
});
