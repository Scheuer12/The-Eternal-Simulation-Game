"""Monte Carlo balance runner for the MVP-0 progression.

The browser is the canonical game runtime. This standard-library simulator mirrors
the relevant formulas so balance can be explored quickly without rendering a UI.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "game-config.json"


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def improvement_bonus(completed: int, config: dict) -> float:
    study = config["study"]
    onboarding = study["onboardingImprovements"]
    if completed < onboarding:
        remaining = 1 - completed / onboarding
        return study["baselineBonus"] + (
            study["onboardingInitialBonus"] - study["baselineBonus"]
        ) * remaining ** study["onboardingDecayShape"]

    late = completed - onboarding
    return study["baselineBonus"] / (
        1 + late / study["lateDecayScale"]
    ) ** study["lateDecayPower"]


def upgrade_chance(upgrades: int, config: dict) -> float:
    settings = config["upgrade"]
    chance = settings["initialChance"] / (
        1 + settings["decayCoefficient"] * upgrades
    ) ** settings["decayPower"]

    if chance < settings["softcap"]:
        chance = settings["softcap"] * (
            chance / settings["softcap"]
        ) ** settings["softcapPower"]

    if chance < settings["hardcap"]:
        chance = settings["hardcap"] * (
            chance / settings["hardcap"]
        ) ** settings["hardcapPower"]

    return max(settings["minimumChance"], chance)


@dataclass
class Run:
    energy: float = 0.0
    production_multiplier: float = 1.0
    improvements: int = 0
    upgrades: int = 0
    crc_count: int = 1
    soft_data_display: bool = False
    auto_calculator: bool = False
    blueprint: bool = False
    construction_remaining: float | None = None
    study_remaining: float | None = None
    elapsed: float = 0.0


def production(run: Run, config: dict) -> float:
    return (
        config["energy"]["baseProductionPerSecond"]
        * run.crc_count
        * run.production_multiplier
        * config["upgrade"]["productionMultiplier"] ** run.upgrades
    )


def study_duration(run: Run, config: dict) -> float:
    study = config["study"]
    duration = study["baseDurationSeconds"] * (
        1
        + study["durationGrowthCoefficient"]
        * run.improvements ** study["durationGrowthPower"]
    )
    if run.auto_calculator:
        duration /= config["autoCalculator"]["speedMultiplier"]
    if run.blueprint:
        duration *= config["blueprint"]["studyDurationMultiplier"]
    return duration


def complete_study(run: Run, config: dict, rng: random.Random) -> None:
    run.production_multiplier *= 1 + improvement_bonus(run.improvements, config)
    run.improvements += 1

    if rng.random() < upgrade_chance(run.upgrades, config):
        run.upgrades += 1
        if (
            not run.blueprint
            and rng.random() < config["blueprint"]["chancePerUpgrade"]
        ):
            run.blueprint = True

    if run.energy >= config["blueprint"]["revealAtPeakEnergy"]:
        run.blueprint = True


def simulate(seed: int, config: dict, maximum_seconds: float = 1_200) -> Run:
    rng = random.Random(seed)
    run = Run(crc_count=config["energy"]["initialCrcCount"])
    step = config["timing"]["simulationStepMs"] / 1_000

    while run.elapsed < maximum_seconds:
        run.elapsed += step
        run.energy = min(
            config["energy"]["powerCellCapacity"],
            run.energy + production(run, config) * step,
        )

        if run.study_remaining is None:
            run.study_remaining = study_duration(run, config)
        run.study_remaining -= step
        if run.study_remaining <= 0:
            complete_study(run, config, rng)
            run.study_remaining = None

        if (
            not run.soft_data_display
            and run.energy >= config["softDataDisplay"]["cost"]
        ):
            run.energy -= config["softDataDisplay"]["cost"]
            run.soft_data_display = True

        if (
            not run.auto_calculator
            and run.energy >= config["autoCalculator"]["cost"]
        ):
            run.energy -= config["autoCalculator"]["cost"]
            run.auto_calculator = True
            run.study_remaining = None

        if (
            run.blueprint
            and run.crc_count < config["crcConstruction"]["maximumCrcs"]
            and run.construction_remaining is None
            and run.energy >= config["crcConstruction"]["cost"]
        ):
            run.energy -= config["crcConstruction"]["cost"]
            run.construction_remaining = config["crcConstruction"]["durationSeconds"]

        if run.construction_remaining is not None:
            run.construction_remaining -= step
            if run.construction_remaining <= 0:
                run.crc_count += 1
                run.construction_remaining = None

        if (
            run.energy >= config["processor"]["cost"]
        ):
            run.energy -= config["processor"]["cost"]
            return run

    return run


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, math.floor((len(ordered) - 1) * fraction))
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate MVP-0 progression.")
    parser.add_argument("--runs", type=int, default=1_000)
    parser.add_argument("--seed", type=int, default=20260717)
    args = parser.parse_args()

    config = load_config()
    results = [simulate(args.seed + index, config) for index in range(args.runs)]
    seconds = [run.elapsed for run in results]

    print(f"Runs: {len(results)}")
    print(f"Mean: {statistics.mean(seconds) / 60:.2f} minutes")
    print(f"Median: {statistics.median(seconds) / 60:.2f} minutes")
    print(f"P10: {percentile(seconds, 0.10) / 60:.2f} minutes")
    print(f"P90: {percentile(seconds, 0.90) / 60:.2f} minutes")
    print(f"Maximum: {max(seconds) / 60:.2f} minutes")


if __name__ == "__main__":
    main()
