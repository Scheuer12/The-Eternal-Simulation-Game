"""Deterministic balance runner for Economy V2 in The Eternal Simulation.

The browser is the canonical game runtime. This standard-library simulator mirrors
the core V2 mathematical formulas so progression, pacing, and pacing comparisons
can be verified headlessly.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "game-config.json"


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def escalating_cost(base: float, growth: float, exponent: float, owned: int) -> float:
    if owned <= 0:
        return base
    return base * (growth ** (owned ** exponent))


@dataclass
class RunState:
    energy: float = 0.0
    peak_energy: float = 0.0
    power_cells: int = 1
    power_modules: int = 0
    crc_count: int = 1
    improvements: int = 0
    upgrades: int = 0
    method_upgrades: int = 0  # CMU
    setup_optimizations: int = 0  # Setup
    auto_calculators: int = 0
    processors: int = 0
    overclockers: int = 0
    overclocker_active: bool = False
    overclocker_heat: float = 0.0

    # Discoveries & displays
    soft_data_display: bool = False
    t2_soft_data_display: bool = False
    crc_blueprint: bool = False
    overclocker_blueprint: bool = False

    # Science Era / Perks
    science_points: int = 0
    quarks: float = 0.0
    perks: dict[str, bool] = field(default_factory=dict)

    # Telemetry
    elapsed: float = 0.0
    study_remaining: float | None = None
    milestones: dict[str, float] = field(default_factory=dict)


def device_performance_setup(run: RunState) -> float:
    return 1.0 + 2.0 * math.log(1.0 + run.setup_optimizations)


def stable_energy_capacity(run: RunState, config: dict) -> float:
    base_cap = config["energy"]["powerCellCapacity"]
    setup_mult = 1.0 + 0.5 * math.log(1.0 + run.setup_optimizations)
    module_mult = 1.0 + 0.5 * run.power_modules
    cell_cap = base_cap * run.power_cells * setup_mult
    if run.perks.get("powerCellResonance"):
        cell_cap *= 1.0 + 0.02 * math.log10(1.0 + max(1, run.power_cells))
    return cell_cap * module_mult


def power_cell_cost(run: RunState, config: dict) -> float:
    settings = config["powerCell"]
    cap = stable_energy_capacity(run, config)
    owned = max(1, run.power_cells)
    multiplier = settings["baseCapacityCostMultiplier"] * (
        1.0 + (owned - 1.0) / settings["costGrowthScale"]
    ) ** settings["costGrowthPower"]
    return cap * multiplier


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


def overclocker_cost(owned: int, config: dict) -> float:
    settings = config["overclocker"]
    return settings["baseCost"] * (settings["costGrowth"] ** owned)


def crc_cost(owned: int, config: dict) -> float:
    settings = config["crcConstruction"]
    return escalating_cost(
        settings["baseCost"],
        settings["costGrowth"],
        settings["costGrowthExponent"],
        max(0, owned - 1),
    )


def processor_effectiveness(run: RunState, config: dict) -> float:
    if run.processors <= 0:
        return 1.0
    cmu_mult = (
        config["economyV2"]["calculationMethods"]["processorBonusMultiplierPerCMU"]
        ** run.method_upgrades
    )
    d_s = device_performance_setup(run)
    oc_mult = 1.0
    if run.overclocker_active and run.overclockers > 0:
        o0 = 5.0 * (1.5 ** (run.overclockers - 1))
        oc_mult = 1.0 + (o0 - 1.0) * d_s
    unit_bonus = (
        config["economyV2"]["processors"]["perUnitBonus"]
        * cmu_mult
        * d_s
        * oc_mult
    )
    return (1.0 + unit_bonus) ** run.processors


def auto_calculator_speed_multiplier(run: RunState, config: dict) -> float:
    if run.auto_calculators <= 0:
        return 1.0
    base_bonus = config["economyV2"]["autoCalculators"]["perUnitSpeedBonus"]
    d_s = device_performance_setup(run)
    e_p = processor_effectiveness(run, config)
    unit_bonus = base_bonus * d_s * e_p
    return (1.0 + unit_bonus) ** run.auto_calculators


def algorithm_improvement_speed(run: RunState, config: dict) -> float:
    va = auto_calculator_speed_multiplier(run, config)
    vr = 1.0
    if run.perks.get("redundancyElimination"):
        eff_i = (
            run.improvements
            if run.improvements <= 50
            else min(54, 50 + (min(run.improvements, 100) - 50) * 0.08)
        )
        vr = 1.005 ** (run.upgrades * eff_i)

    v_direct = 1.0
    if run.perks.get("processorBonusAppliesAImprovementSpeed"):
        e_p = processor_effectiveness(run, config)
        v_direct = max(1.0, e_p ** 1.07)

    v_quantum = 1.0
    if run.perks.get("quantumSuperposition") and run.quarks > 0:
        v_quantum = 1.0 + 0.02 * math.log10(1.0 + run.quarks)

    return va * vr * v_direct * v_quantum


def study_duration(run: RunState, config: dict) -> float:
    base_sec = config["economyV2"]["improvements"]["baseDurationSeconds"]
    coeff = config["economyV2"]["improvements"]["durationGrowthCoefficient"]
    power = config["economyV2"]["improvements"]["durationGrowthPower"]
    base_curve = base_sec * (1.0 + coeff * (run.improvements ** power))
    speed = algorithm_improvement_speed(run, config)
    return base_curve / max(1e-9, speed)


def production(run: RunState, config: dict) -> float:
    base = config["economyV2"]["crc"]["baseProductionPerSecond"]
    # Linear (1 + I) * 2^U * CRCs
    crc_mult = run.crc_count
    if run.perks.get("crcCountExponential"):
        crc_mult *= 1.005 ** run.crc_count

    i_mult = 1.0 + run.improvements
    u_mult = 2.0 ** run.upgrades
    d_s = device_performance_setup(run)
    prod = base * crc_mult * i_mult * u_mult * d_s

    if run.perks.get("sciencePoweredEnergyProduction") and run.science_points > 0:
        prod *= 1.0 + run.science_points
    elif run.perks.get("sciencePointsMultiplier") and run.science_points > 0:
        prod *= 1.0 + run.science_points
    if run.perks.get("processorBonusAppliesCRC") or run.perks.get("processorBonusAppliesProduction"):
        e_p = processor_effectiveness(run, config)
        prod *= max(1.0, e_p ** 0.15)
    if run.perks.get("quantumSuperposition") and run.quarks > 0:
        prod *= 1.0 + 0.05 * math.log10(1.0 + run.quarks)

    return prod


def energy_overflow_decay(run: RunState, config: dict) -> float:
    capacity = stable_energy_capacity(run, config)
    if run.energy <= capacity:
        return 0.0
    overflow_ratio = (run.energy - capacity) / capacity
    return (
        capacity
        * config["energy"]["overflowDecayRate"]
        * (overflow_ratio ** config["energy"]["overflowDecayPower"])
    )


def algorithm_upgrade_requirement(run: RunState, config: dict) -> int:
    u = run.upgrades
    initial = config["economyV2"]["algorithmUpgrades"]["initialRequiredImprovements"]
    linear = config["economyV2"]["algorithmUpgrades"]["linearRequirementGrowth"]
    quad = config["economyV2"]["algorithmUpgrades"]["quadraticRequirementCoefficient"]
    return math.ceil(initial + linear * u + (quad / 2.0) * u * (u - 1))


def cmu_requirement(run: RunState, config: dict) -> int:
    initial = config["calculationMethodUpgrade"]["initialAlgorithmUpgradesRequired"]
    growth = config["calculationMethodUpgrade"]["algorithmUpgradesRequiredGrowth"]
    return initial + run.method_upgrades * growth


def setup_requirement(run: RunState, config: dict) -> int:
    initial = config["setupOptimization"]["initialMethodUpgradesRequired"]
    growth = config["setupOptimization"]["methodUpgradesRequiredGrowth"]
    return initial + run.setup_optimizations * growth


def simulate_run(
    config: dict,
    has_redundancy: bool = False,
    max_seconds: float = 7200.0,
    target_energy: float = 100e9,
) -> RunState:
    run = RunState(
        crc_count=config["energy"]["initialCrcCount"],
        power_cells=config["energy"]["initialPowerCells"],
    )
    if has_redundancy:
        run.perks["redundancyElimination"] = True
        run.science_points = 1

    dt = 0.1  # 100ms simulation tick

    while run.elapsed < max_seconds:
        run.elapsed += dt

        # Production and decay
        prod = production(run, config)
        run.energy += prod * dt
        if run.energy > run.peak_energy:
            run.peak_energy = run.energy

        cap = stable_energy_capacity(run, config)
        if run.energy > cap:
            decay = energy_overflow_decay(run, config)
            run.energy = max(cap, run.energy - decay * dt)

        # Milestone recordings
        if "1e-8" not in run.milestones and run.peak_energy >= 1e-8:
            run.milestones["1e-8"] = run.elapsed
        if "100_J" not in run.milestones and run.peak_energy >= 100.0:
            run.milestones["100_J"] = run.elapsed
        if "1e11_J" not in run.milestones and run.peak_energy >= target_energy:
            run.milestones["1e11_J"] = run.elapsed
            break

        # Studies: improvements
        if run.study_remaining is None:
            run.study_remaining = study_duration(run, config)
        run.study_remaining -= dt
        if run.study_remaining <= 0:
            run.improvements += 1
            run.study_remaining = None

        # Automatic trigger of Algorithm Upgrade when requirement reached
        req_u = algorithm_upgrade_requirement(run, config)
        if run.improvements >= req_u:
            run.upgrades += 1
            run.improvements = 0
            run.study_remaining = None

        # CMU Trigger: reset studies when required Algorithm Upgrades reached
        req_cmu = cmu_requirement(run, config)
        if run.method_upgrades < 2 and run.upgrades >= req_cmu:
            run.method_upgrades += 1
            if "first_cmu" not in run.milestones:
                run.milestones["first_cmu"] = run.elapsed
            if run.method_upgrades == 2 and "second_cmu" not in run.milestones:
                run.milestones["second_cmu"] = run.elapsed
            run.upgrades = 0
            run.improvements = 0
            run.study_remaining = None

        # Setup Optimization Trigger: used for deep runs when power cells are well-established
        req_setup = setup_requirement(run, config)
        if run.method_upgrades >= req_setup and run.power_cells >= 50 and run.peak_energy >= 1e12:
            run.setup_optimizations += 1
            run.energy = 0.0
            run.improvements = 0
            run.upgrades = 0
            run.method_upgrades = 0
            run.auto_calculators = 0
            run.processors = 0
            run.overclockers = 0
            run.crc_count = config["energy"]["initialCrcCount"]
            run.soft_data_display = False
            run.t2_soft_data_display = False
            run.crc_blueprint = False
            run.overclocker_blueprint = False
            run.study_remaining = None
            continue

        # Active player purchase decisions based on availability:
        # 1. Soft Data Display
        if not run.soft_data_display and run.energy >= config["softDataDisplay"]["cost"]:
            run.energy -= config["softDataDisplay"]["cost"]
            run.soft_data_display = True

        # 2. T2 Soft Data Display
        if (
            run.soft_data_display
            and not run.t2_soft_data_display
            and run.energy >= config["t2SoftDataDisplay"]["cost"]
        ):
            run.energy -= config["t2SoftDataDisplay"]["cost"]
            run.t2_soft_data_display = True
            if "t2_display" not in run.milestones:
                run.milestones["t2_display"] = run.elapsed

        # 3. Power Cells (expand capacity and satisfy Overclocker prerequisite)
        cost_cell = power_cell_cost(run, config)
        if (
            run.soft_data_display
            and run.energy >= cost_cell
            and (run.power_cells < 3 or run.energy >= 0.5 * cap)
            and run.power_cells < 20000
        ):
            run.energy -= cost_cell
            run.power_cells += 1

        # 4. Auto Calculator
        cost_calc = auto_calculator_cost(run.auto_calculators, config)
        if run.energy >= cost_calc and run.auto_calculators < 15:
            run.energy -= cost_calc
            run.auto_calculators += 1
            run.study_remaining = None
            if "first_calc" not in run.milestones:
                run.milestones["first_calc"] = run.elapsed

        # 5. Processor
        cost_proc = processor_cost(run.processors, config)
        if run.energy >= cost_proc and run.processors < 25:
            run.energy -= cost_proc
            run.processors += 1
            if "first_proc" not in run.milestones:
                run.milestones["first_proc"] = run.elapsed

        # 6. Overclocker Blueprint & Overclocker (requires 3 Processors & 3 Power Cells)
        if run.processors >= 3 and run.power_cells >= 3:
            run.overclocker_blueprint = True

        if run.overclocker_blueprint:
            cost_oc = overclocker_cost(run.overclockers, config)
            if run.energy >= cost_oc and run.overclockers < 5:
                run.energy -= cost_oc
                run.overclockers += 1
                run.overclocker_active = True

        # 7. CRC Blueprint & Construction
        if run.peak_energy >= config["blueprint"]["revealAtPeakEnergy"]:
            run.crc_blueprint = True

        if run.crc_blueprint:
            cost_crc = crc_cost(run.crc_count, config)
            if run.energy >= cost_crc and run.crc_count < 25:
                run.energy -= cost_crc
                run.crc_count += 1

    return run


def run_benchmark() -> None:
    config = load_config()
    print("================================================================================")
    print("THE ETERNAL SIMULATION - ECONOMY V2 BENCHMARK & PROGRESSION VERIFICATION")
    print("================================================================================\n")

    print("[RUN 1: Fresh Start (0 Science Points, First Particle Synthesis)]")
    run1 = simulate_run(config, has_redundancy=False, max_seconds=7200.0)
    time1 = run1.milestones.get("1e11_J", run1.elapsed)
    calc1 = run1.milestones.get("first_calc", 0)
    print(f"  * Elapsed Time       : {run1.elapsed:.1f} s ({run1.elapsed / 60.0:.2f} min)")
    print(f"  * Peak Energy        : {run1.peak_energy:.4e} J")
    print(f"  * Milestone 1e-8 J   : {run1.milestones.get('1e-8', 0):.1f} s")
    print(f"  * First Auto Calc    : {calc1:.1f} s ({calc1 / 60.0:.2f} min)")
    print(f"  * First Processor    : {run1.milestones.get('first_proc', 0):.1f} s ({run1.milestones.get('first_proc', 0) / 60.0:.2f} min)")
    print(f"  * First CMU          : {run1.milestones.get('first_cmu', 0):.1f} s ({run1.milestones.get('first_cmu', 0) / 60.0:.2f} min)")
    print(f"  * Second CMU         : {run1.milestones.get('second_cmu', 0):.1f} s ({run1.milestones.get('second_cmu', 0) / 60.0:.2f} min)")
    print(f"  * T2 Soft Display    : {run1.milestones.get('t2_display', 0):.1f} s ({run1.milestones.get('t2_display', 0) / 60.0:.2f} min)")
    print(f"  * Milestone 100 J    : {run1.milestones.get('100_J', 0):.1f} s ({run1.milestones.get('100_J', 0) / 60.0:.2f} min)")
    print(f"  * Milestone 100 GJ   : {time1:.1f} s ({time1 / 60.0:.2f} min)")
    print(f"  * Algorithm Upgrades : {run1.upgrades}")
    print(f"  * Improvements       : {run1.improvements}")
    print(f"  * CMUs (Method)      : {run1.method_upgrades}")
    print(f"  * Setup Optimizations: {run1.setup_optimizations}")
    print(f"  * Auto Calculators   : {run1.auto_calculators}")
    print(f"  * Processors         : {run1.processors}")
    print(f"  * Overclockers       : {run1.overclockers}")
    print(f"  * Power Cells        : {run1.power_cells}\n")

    print("[RUN 2: Post-Synthesis with Redundancy Elimination Active]")
    run2 = simulate_run(config, has_redundancy=True, max_seconds=7200.0)
    time2 = run2.milestones.get("1e11_J", run2.elapsed)
    calc2 = run2.milestones.get("first_calc", 0)
    print(f"  * Elapsed Time       : {run2.elapsed:.1f} s ({run2.elapsed / 60.0:.2f} min)")
    print(f"  * Peak Energy        : {run2.peak_energy:.4e} J")
    print(f"  * Milestone 1e-8 J   : {run2.milestones.get('1e-8', 0):.1f} s")
    print(f"  * First Auto Calc    : {calc2:.1f} s ({calc2 / 60.0:.2f} min)")
    print(f"  * First Processor    : {run2.milestones.get('first_proc', 0):.1f} s ({run2.milestones.get('first_proc', 0) / 60.0:.2f} min)")
    print(f"  * First CMU          : {run2.milestones.get('first_cmu', 0):.1f} s ({run2.milestones.get('first_cmu', 0) / 60.0:.2f} min)")
    print(f"  * Second CMU         : {run2.milestones.get('second_cmu', 0):.1f} s ({run2.milestones.get('second_cmu', 0) / 60.0:.2f} min)")
    print(f"  * T2 Soft Display    : {run2.milestones.get('t2_display', 0):.1f} s ({run2.milestones.get('t2_display', 0) / 60.0:.2f} min)")
    print(f"  * Milestone 100 J    : {run2.milestones.get('100_J', 0):.1f} s ({run2.milestones.get('100_J', 0) / 60.0:.2f} min)")
    print(f"  * Milestone 100 GJ   : {time2:.1f} s ({time2 / 60.0:.2f} min)")
    print(f"  * Algorithm Upgrades : {run2.upgrades}")
    print(f"  * Improvements       : {run2.improvements}")
    print(f"  * CMUs (Method)      : {run2.method_upgrades}")
    print(f"  * Setup Optimizations: {run2.setup_optimizations}")
    print(f"  * Auto Calculators   : {run2.auto_calculators}")
    print(f"  * Processors         : {run2.processors}")
    print(f"  * Overclockers       : {run2.overclockers}")
    print(f"  * Power Cells        : {run2.power_cells}\n")

    speedup = time1 / max(1.0, time2)
    print(f"Synthesis Acceleration Factor: {speedup:.2f}x faster with Redundancy Elimination")
    print("================================================================================")


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate Economy V2 Energy Layer progression.")
    parser.add_argument("--benchmark", action="store_true", help="Run benchmark comparison (Run 1 vs Run 2)")
    parser.add_argument("--max-seconds", type=float, default=7200.0)
    args = parser.parse_args()

    run_benchmark()


if __name__ == "__main__":
    main()
