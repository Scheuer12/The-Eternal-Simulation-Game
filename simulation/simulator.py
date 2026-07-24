"""Deterministic balance runner for the current Energy Layer.

The browser is the canonical game runtime. This standard-library simulator mirrors
the core formulas so rough pacing can be explored without rendering UI. It uses a
simple eager strategy and is not a target-duration assertion.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "game-config.json"


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def escalating_cost(base: float, growth: float, exponent: float, owned: int) -> float:
    if owned <= 0:
        return base
    return base * growth ** (owned ** exponent)


def improvement_bonus(completed: int, config: dict, method_upgrades: int = 0) -> float:
    study = config["study"]
    effective = completed * study["effectPenaltyMultiplierPerMethod"] ** method_upgrades
    onboarding = study["onboardingImprovements"]

    if effective < onboarding:
        remaining = 1 - effective / onboarding
        return study["baselineBonus"] + (
            study["onboardingInitialBonus"] - study["baselineBonus"]
        ) * remaining ** study["onboardingDecayShape"]

    late = effective - onboarding
    return study["baselineBonus"] / (
        1 + late / study["lateDecayScale"]
    ) ** study["lateDecayPower"]


def auto_calculator_cost(owned: int, config: dict) -> float:
    settings = config["autoCalculator"]
    return escalating_cost(
        settings["baseCost"],
        settings["costGrowth"],
        settings["costGrowthExponent"],
        owned,
    )


def processor_cost(owned: int, config: dict) -> float:
    settings = config["processor"]
    return escalating_cost(
        settings["baseCost"],
        settings["costGrowth"],
        settings["costGrowthExponent"],
        owned,
    )


def stable_energy_capacity(run: "Run", config: dict) -> float:
    return config["energy"]["powerCellCapacity"] * run.power_cells


def power_cell_cost(run: "Run", config: dict) -> float:
    settings = config["powerCell"]
    current_capacity = stable_energy_capacity(run, config)
    owned = max(1, run.power_cells)
    multiplier = settings["baseCapacityCostMultiplier"] * (
        1 + (owned - 1) / settings["costGrowthScale"]
    ) ** settings["costGrowthPower"]
    return current_capacity * multiplier


def energy_overflow_decay(run: "Run", config: dict) -> float:
    capacity = stable_energy_capacity(run, config)
    if run.energy <= capacity:
        return 0

    overflow_ratio = (run.energy - capacity) / capacity
    return (
        capacity
        * config["energy"]["overflowDecayRate"]
        * overflow_ratio ** config["energy"]["overflowDecayPower"]
    )


def effective_energy_gain(run: "Run", raw_gain: float, config: dict) -> float:
    return max(0, raw_gain)


def device_efficiency(run: "Run", config: dict) -> float:
    return config["processor"]["deviceEfficiencyMultiplier"] ** run.processors


def auto_calculator_speed(run: "Run", config: dict) -> float:
    if run.auto_calculators <= 0:
        return 1
    settings = config["autoCalculator"]
    return (
        settings["firstSpeedMultiplier"]
        * settings["additionalSpeedMultiplier"] ** (run.auto_calculators - 1)
        * device_efficiency(run, config)
    )


def study_duration(run: "Run", config: dict) -> float:
    study = config["study"]
    early_until = study["durationEarlyLoadUntil"]
    full_at = study["durationFullLoadAt"]
    early_load = run.improvements * study["durationEarlyLoadMultiplier"]
    effective_load = run.improvements
    if run.improvements <= early_until:
        effective_load = early_load
    elif run.improvements < full_at:
        progress = (run.improvements - early_until) / (full_at - early_until)
        eased = progress * progress * (3 - 2 * progress)
        effective_load = early_load + (run.improvements - early_load) * eased
    effective_load *= study["durationLoadMultiplierPerSetup"] ** run.setup_optimizations
    return (
        study["baseDurationSeconds"]
        * (1 + study["durationGrowthCoefficient"] * effective_load ** study["durationGrowthPower"])
        / auto_calculator_speed(run, config)
    )


def production(run: "Run", config: dict) -> float:
    return (
        config["energy"]["baseProductionPerSecond"]
        * run.crc_count
        * run.production_multiplier
        * config["algorithmUpgrade"]["productionMultiplier"] ** run.upgrades
    )


def algorithm_upgrade_requirement(run: "Run", config: dict) -> int:
    settings = config["algorithmUpgrade"]
    return settings["initialImprovementsRequired"] + (
        settings["improvementsRequiredGrowth"] * run.upgrades
    )


@dataclass
class Run:
    energy: float = 0
    power_cells: int = 1
    production_multiplier: float = 1
    improvements: int = 0
    upgrades: int = 0
    crc_count: int = 1
    soft_data_display: bool = False
    auto_calculators: int = 0
    processors: int = 0
    method_upgrades: int = 0
    setup_optimizations: int = 0
    study_remaining: float | None = None
    elapsed: float = 0


def complete_improvement(run: Run, config: dict) -> None:
    run.production_multiplier *= 1 + improvement_bonus(
        run.improvements,
        config,
        run.method_upgrades,
    )
    run.improvements += 1


def complete_algorithm_upgrade(run: Run, config: dict) -> None:
    run.upgrades += 1
    run.improvements = 0
    run.production_multiplier = 1
    run.study_remaining = None


def simulate(config: dict, maximum_seconds: float = 86_400) -> Run:
    run = Run(
        crc_count=config["energy"]["initialCrcCount"],
        power_cells=config["energy"]["initialPowerCells"],
    )
    step = config["timing"]["simulationStepMs"] / 1_000

    while run.elapsed < maximum_seconds:
        run.elapsed += step
        run.energy += effective_energy_gain(run, production(run, config) * step, config)
        if run.energy > stable_energy_capacity(run, config):
            run.energy -= min(
                run.energy - stable_energy_capacity(run, config),
                energy_overflow_decay(run, config) * step,
            )

        if run.study_remaining is None:
            run.study_remaining = study_duration(run, config)
        run.study_remaining -= step
        if run.study_remaining <= 0:
            complete_improvement(run, config)

        if run.improvements >= algorithm_upgrade_requirement(run, config):
            complete_algorithm_upgrade(run, config)

        if not run.soft_data_display and run.energy >= config["softDataDisplay"]["cost"]:
            run.energy -= config["softDataDisplay"]["cost"]
            run.soft_data_display = True

        if run.auto_calculators < 1 and run.energy >= auto_calculator_cost(run.auto_calculators, config):
            run.energy -= auto_calculator_cost(run.auto_calculators, config)
            run.auto_calculators += 1
            run.study_remaining = None

        if run.energy >= processor_cost(run.processors, config):
            run.energy -= processor_cost(run.processors, config)
            run.processors += 1
            return run

        if (
            run.soft_data_display
            and run.upgrades >= config["powerCell"]["algorithmUpgradesRequired"]
            and run.energy >= power_cell_cost(run, config)
        ):
            run.energy -= power_cell_cost(run, config)
            run.power_cells += 1

    return run


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate current Energy Layer progression.")
    parser.add_argument("--max-seconds", type=float, default=86_400)
    args = parser.parse_args()

    config = load_config()
    result = simulate(config, maximum_seconds=args.max_seconds)

    print(f"Elapsed: {result.elapsed / 60:.2f} minutes")
    print(f"Energy: {result.energy:.6g} J")
    print(f"Improvements: {result.improvements}")
    print(f"Algorithm Upgrades: {result.upgrades}")
    print(f"Processors: {result.processors}")
    print(f"Auto Calculators: {result.auto_calculators}")
    print(f"Power Cells: {result.power_cells}")


if __name__ == "__main__":
    main()
