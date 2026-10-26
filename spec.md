<USER_REQUEST>
# THE ETERNAL SIMULATION — SANDBOX REBUILD
## Energy Era · Algorithm Learning · Devices · Facility Optimization

### 0. Mission

Rebuild the TES gameplay sandbox around a simpler, deeper core loop.

**This is a gameplay rebuild, not a software architecture rewrite.**

Preserve:
- Existing software architecture, class contracts, dependencies and relationships.
- Configuration-driven game definitions and formulas.
- GameState as the single source of truth for player state.
- EffectRegistry, EffectEngine, StatResolver, FormulaRegistry and CommandEngine responsibilities.
- The existing Energy Decay premise and its valid implementation.
- Big-number support, deterministic simulation, offline progression infrastructure and save facilities where reusable.

Replace:
- All previous gameplay definitions and economic formulas that conflict with this specification.
- Old A.Improvement and A.Upgrade progression.
- Old Soft Reset and Hard Reset mechanics.
- Old Calculator/Microprocessor/Processor formulas.
- Old CMU and Setup Optimization gameplay.
- Previous unlock logic and obsolete UI content.

Do not preserve legacy mechanics merely because they already exist in the codebase.

**Preserve architecture, replace gameplay.**

Create a working branch and an appropriate backup before migrating. Do not delete architectural source code or modify `main` directly.

Do not silently implement legacy mechanics or reintroduce previously removed formulas.

---

# PART I — DESIGN PRINCIPLES

## 1. Gameplay philosophy

TES should be:

- Easy to understand initially.
- Mathematically deep.
- Strategically interesting.
- Built around a small number of meaningful decisions.
- Rewarding through discoveries that modify existing relationships.
- Capable of supporting extremely large values and long-term progression.
- Avoid unnecessary waiting for excessively long study progress bars.

The player should understand the initial loop:

**Study Algorithms → Produce Energy → Build Computing Infrastructure → Improve Research and Learning → Run Machine Learning → Optimize the Facility.**

The complexity should emerge progressively.

Do not introduce artificial caps unless a cap is an explicit mechanic.

Do not introduce a new currency or subsystem without a defined gameplay purpose.

All new economic parameters must be configurable.

---

# PART II — CORE GAMEPLAY

## 2. Algorithm Features

There are exactly three Algorithm Features:

1. Algorithm Improvement — `AImp`
2. Algorithm Upgrade — `AUpg`
3. Algorithm Recalculation — `ARec`

Each A-Feature has:

- `owned`: current units available.
- `produced`: total units produced during the current cycle, for statistics.
- `unitStrength`: derived Energy contribution per owned unit.
- `contribution`: `owned × unitStrength`.
- `studyDuration`: derived study duration.
- `unlockState`: whether the player can access it.

There are **no individual A-Feature Levels** in this version.

There is only one global Computer Level.

### Study duration

Initial base duration for every A-Feature:

`0.5 seconds`

There is no automatic duration scaling by study index or number produced.

Every study completion produces one unit of its designated A-Feature.

Study speed modifiers may reduce the effective duration.

No increasing A-Feature cost curve is introduced now. Such a mechanic may be added after sandbox testing if the economy needs another constraint.

### Conversion costs

Use one configurable factor:

`algorithmConversionFactor = 12`

Rules:

- Studying 1 AImp produces 1 AImp; no input units are consumed.
- Studying 1 AUpg requires and consumes 12 AImp.
- Studying 1 ARec requires and consumes 12 AUpg.

An A.Upgrade does not consume all A.Improvements, only the configured conversion cost.

An A.Recalculation similarly consumes only its configured conversion cost.

Conversions must be atomic.

Automated studies must never consume units that were already reserved by another pending study.

An unavailable conversion waits for the required units rather than producing negative inventory.

### Unlocking

- AImp: available from the start.
- AUpg: visible from the start; actionable when sufficient AImp exist.
- ARec: hidden until the player's first successful Facility Optimization.

Do not preserve the old CMU requirement. CMUs are not part of this rebuilt gameplay.

---

## 3. Algorithm Performance and Energy

The Cosmic Radiation Condenser (`CRC`) converts Algorithm Performance into Energy.

### Algorithm Performance

`AP = AImpContribution + AUpgContribution + ARecContribution`

### Base strengths

Configuration:

`algorithmBaseStrength = 1e-15`

`algorithmConversionFactor = 12`

`conversionPerformanceRatio = 2`

Define the strengths before global modifiers:

`AImpStrength = 1e-15`

`AUpgStrength = AImpStrength × 12 × 2`

`ARecStrength = AUpgStrength × 12 × 2`

Therefore:

| A-Feature | Base strength |
|---|---:|
| AImp | `1e-15` |
| AUpg | `24e-15` |
| ARec | `576e-15` |

Converting 12 units into one higher-order unit doubles the Energy contribution of the converted set, before other modifiers.

### Computer Level

Computer Level modifies the aggregate Algorithm Performance once.

`ComputerPerformanceMultiplier(L) = 1.5^(L - 1)`

Initial Computer Level:

`L = 1`

### CRC production

`EnergyProduction = AP × ComputerPerformanceMultiplier × CRCModifiers`

Initial CRC modifier:

`1`

Energy Production must be Idle when AP is zero and no other legitimate production source exists.

Do not invent a hidden baseline production rate.

Do not apply Computer Level separately at each tier of the A-Feature strength cascade.

Its contribution must be applied exactly once.

### Energy units

- All economic calculations use Joules.
- `Stored Energy` is displayed in J.
- `Energy Production` is displayed in J/s.
- Use engineering notation in the interface.
- Support pJ, nJ, µJ, mJ, J and larger orders of magnitude.

Preserve the Energy Decay mechanics already implemented, adjusting their integration to the new production model.

---

# PART III — COMPUTER LEARNING

## 4. Available Data (XP)

UI label:

**Available Data (XP)**

Suggested tooltip:

"Also known as XP. Apparently, scientists still need experience points."

Available Data represents how much useful learning material the current computational setup possesses.

It is **not a second permanently accumulated currency**.

### Static contribution from Owned A-Features

`DataFromAlgorithms = 1 × AImpOwned + 9 × AUpgOwned + 81 × ARecOwned`

Parameters:

| A-Feature | Data per owned unit |
|---|---:|
| AImp | 1 |
| AUpg | 9 |
| ARec | 81 |

These contributions depend on current `owned`, not total historical `produced`.

When 12 AImp are converted into 1 AUpg:

- Energy contribution doubles.
- Data contribution falls from 12 to 9.

When 12 AUpg are converted into 1 ARec:

- Energy contribution doubles.
- Data contribution falls from 108 to 81.

This trade-off is intentional.

Players should be able to choose between prioritizing immediate Energy production and maintaining greater Available Data for their next Machine Learning operation.

### Hard Disk contribution

Hard Disks can also generate Data while powered.

`AvailableData = DataFromAlgorithms + HardDiskDataBuffer`

The Hard Disk buffer is a separate state variable, defined in the device section.

There is no generic passive XP/s generator in the core algorithm system.

---

## 5. Run Machine Learning — Soft Reset

Replace the old Soft Reset with:

**Run Machine Learning**

Purpose:

Use sufficient Available Data to advance the global Computer Level.

### Initial level

`ComputerLevel = 1`

### Data requirements

Let `k = current ComputerLevel`.

The requirement for advancing from Level `k` to Level `k + 1` is:

`RequiredData(k) = ceil(693 + 2304 × (k - 1)^1.6643485138)`

Reference values:

| Current Level | Required Data for next level |
|---:|---:|
| 1 | 693 |
| 2 | 2,997 |
| 3 | 7,996 |
| 4 | 15,034 |
| 5 | 23,841 |
| 6 | 34,252 |
| 7 | 46,150 |
| 8 | 59,445 |
| 9 | 74,066 |

The first three milestones reproduce the requested experimental thresholds.

Later requirements use a power curve rather than maintaining a constant 2.17× escalation of the incremental cost.

The curve parameters must be configurable.

### Soft Reset transaction

Requirements:

`AvailableData >= RequiredData(currentComputerLevel)`

On successful Run Machine Learning:

1. Increase Computer Level by exactly 1.
2. Reset all current A-Feature inventories to zero.
3. Reset current-cycle A-Feature production statistics.
4. Clear pending A-Feature study jobs and release their reservations.
5. Clear the accumulated Hard Disk Data buffer.
6. Cancel temporary Overclocker effects.
7. Preserve purchased hardware.
8. Preserve the player's Stored Energy.
9. Preserve Power Cells.
10. Preserve completed Facility Optimizations.
11. Recalculate all derived stats and effects.

Do not subtract XP as a conventional currency and then preserve the A-Features that supplied it.

Data is used as a requirement for the reset; the reset itself removes the algorithm inventories contributing that Data.

### Learning multiplier

`ComputerPerformanceMultiplier = 1.5^(ComputerLevel - 1)`

This is a global Algorithm Performance modifier, not a multiplier applied repeatedly at each tier.

---

# PART IV — FACILITY OPTIMIZATION

## 6. Hard Reset

Replace the old Hard Reset with:

**Facility Optimization**

Suggested description:

"Slightly improves the performance of all operational devices."

### First requirement

`MinimumComputerLevel = 9`

Because the computer starts at Level 1, reaching Level 9 requires eight successful Machine Learning operations.

### Subsequent requirements

Experimental proposal:

`RequiredComputerLevelForFacilityOptimization = 9 + 3 × CompletedFacilityOptimizations`

Examples:

| Optimization | Minimum Computer Level |
|---:|---:|
| 1st | 9 |
| 2nd | 12 |
| 3rd | 15 |
| 4th | 18 |
| 5th | 21 |

Make the initial threshold and level increment configurable.

### Facility performance bonus

Experimental formula:

`FacilityDeviceMultiplier(H) = 1.09^H`

Where `H` is the number of completed Facility Optimizations.

Initial value:

`H = 0 → 1×`

Each optimization improves eligible Device performance by 9% relative to the prior value.

This is a small permanent bonus that becomes more interesting as Device synergies increase.

The bonus must act on declared Device contributions, not repeatedly multiply the same final derived attribute.

### First optimization unlocks

On the first Facility Optimization:

- Unlock A.Recalculation.
- Unlock Processor.
- Preserve these global unlock milestones permanently.

### Facility Optimization transaction

On completion:

1. Increase completed Facility Optimizations by 1.
2. Reset AImp, AUpg and ARec inventories.
3. Clear pending studies and temporary effects.
4. Reset Stored Energy to zero.
5. Reset the current Hard Disk Data buffer.
6. Remove conventional purchased hardware.
7. Reset temporary transistor allocation and operational states.
8. Preserve Computer Level.
9. Preserve owned Power Cells.
10. Preserve permanent Facility Optimization effects.
11. Preserve global technological unlock milestones already achieved.
12. Recalculate the game state and derived attributes.

**Computer Level must persist through Facility Optimization.**

This avoids exchanging substantial Machine Learning progress for an insufficiently rewarding small Device bonus.

Power Cell ownership persists, but any charge stored in the cells is reset to zero.

---

# PART V — DEVICES

## 7. General Device principles

Devices are physical infrastructure.

They should be purchased occasionally, with meaningful effects.

Avoid reproducing the previous economy of buying thousands of Microprocessors merely to increment an additive percentage.

Support Device categories:

- Study Automation
- Study Efficiency
- Energy Production
- Energy Storage
- Learning Infrastructure

Use generic Device definitions and existing effect infrastructure wherever possible.

Only create specialized behavior handlers when lifecycle or operational state makes them necessary.

All prices and effects below are **experimental sandbox defaults**, except the Power Cell's explicitly defined initial cost and capacity.

They must be easy to tune.

Do not reuse old Device price curves.

---

## 8. AutoCalculator Chip

Purpose:

Automates studies of one selected A-Feature.

### Behavior

- Each Chip represents one independent study worker.
- Each worker is assigned to exactly one A-Feature.
- Multiple Chips may be assigned to the same A-Feature.
- Chips can be reassigned between unlocked A-Features.
- Workers respect the study's effective duration.
- Workers must respect conversion costs and input reservations.
- When insufficient input units exist, the worker waits.
- Automation must not generate units instantly or bypass study durations.

### Initial configuration

- Initial cost: `3e-11 J`
- Cost growth: `×4` per purchased Chip.
- Initial automation target: AImp.

### Unlock

Reveal after the player's first completed A.Upgrade.

Do not purchase it automatically.

---

## 9. Transistor Board

Purpose:

Provides the interface and infrastructure to purchase and allocate Transistors among study types.

### Behavior

- A single Board unlocks transistor allocation.
- Transistors can be purchased for the player's available study types.
- Every transistor belongs to one allocation at a time.
- The global transistor purchase price depends on total transistors purchased, not on the chosen study type.
- Reassigning owned Transistors does not change their purchase history or automatically refund them.
- Transistors consumed by Overclocker are permanently removed from the current inventory.
- Other study types do not lose their transistors when Overclocker burns the target study's allocation.

### Initial configuration

Board:

- Initial cost: `2e-10 J`
- Unique Device.

Transistors:

- Initial cost: `3e-11 J`
- Cost multiplier: `1.4`
- Shared geometric price curve.

### Base effect

Experimental:

`TransistorStudySpeedMultiplier(T) = 1 + 0.05 × T`

Where `T` is the number of Transistors allocated to that study.

The base effect is additive in Transistor count.

### Unlock

Reveal after purchasing the first AutoCalculator Chip.

### UI

Provide a compact expandable Transistor Board panel inside Efficiency & Automation, with a row for each unlocked A-Feature.

Each row must display:

- Allocated Transistors.
- Effective study duration.
- Current speed contribution.
- Buy and allocation controls.
- Overclock availability when applicable.

---

## 10. Microprocessor

Purpose:

Geometrically amplifies the study speed of one selected A-Feature based on its allocated Transistors.

### Initial configuration

- Initial cost: `3e-9 J`
- One active Microprocessor in the initial sandbox.
- Can target AImp, AUpg or ARec, provided the target is unlocked.

### Effect

Experimental:

`MicroprocessorStudyMultiplier(T) = 1.12^T`

Where `T` is the number of Transistors assigned to the selected study.

The effect applies to exactly one study type in the initial gameplay.

Study durations remain governed by the single Study Speed resolution system.

### Unlock

Reveal after:

- Acquiring a Transistor Board.
- Purchasing at least four Transistors in total.

### Future support

Keep the target-assignment contract extensible.

A future Science Perk, **Multithreader**, may allow a Microprocessor effect to target two study types simultaneously.

Do not implement Multithreader gameplay now.

---

## 11. Overclocker

Purpose:

Temporarily boosts Microprocessor effectiveness by sacrificing Transistors.

### Initial configuration

- Initial cost: `9e-8 J`
- One operational Overclocker in the initial sandbox.

### Activation

The player chooses an eligible study target with an installed Microprocessor effect.

Let `T` be the number of Transistors currently allocated to that study.

Require:

`T >= 2`

On activation:

1. Atomically consume all `T` Transistors allocated to the selected study.
2. Record the number consumed.
3. Calculate the temporary amplification.
4. Start the effect timer.

### Duration

`OverclockDurationSeconds(T) = log(T) / log(1.5)`

### Temporary effect

Experimental:

`OverclockBonusMultiplier(T) = 1 + T / 3`

Apply this amplification to the Microprocessor's bonus above its neutral `1×` value, rather than blindly multiplying every Study Speed contribution.

This avoids duplicate effect amplification.

The bonus must remain active for the calculated duration even though the consumed Transistors no longer exist.

The Transistors are not restored after expiration.

### Unlock

Reveal when:

- A Microprocessor exists.
- At least two Transistors are available for sacrifice.

---

## 12. CRC Gadget

Purpose:

Improves total CRC Energy Production.

### Configuration

Experimental:

- Initial cost: `1e-8 J`
- One Gadget in the initial sandbox.
- Effect: `×2` CRC Energy Production.

This modifies the CRC production multiplier, not the A-Feature inventories or their Data contributions.

---

## 13. Capacitor

Purpose:

Increases the Energy contribution of A.Improvements only.

### Configuration

Experimental:

- Initial cost: `1e-8 J`
- Cost growth: `×5`
- Effect per Capacitor: `+50%` of the base AImp contribution.

### Effect

`AImpCapacitorMultiplier = 1 + 0.5 × CapacitorsOwned`

This modifies the AImp contribution before Algorithm Performance is summed.

It must not inadvertently alter AUpg or ARec base strength through cascading dependencies.

Unlock after the first Run Machine Learning.

---

## 14. Processor

Purpose:

Slightly improves the effectiveness of other eligible Devices.

### Unlock

Unlock only after the first Facility Optimization.

### Initial configuration

Experimental:

- Initial cost: `1e-4 J`
- Cost growth: `×2`
- Bonus per Processor: `+3%` to eligible Device performance.

### Effect

`ProcessorDeviceMultiplier = 1 + 0.03 × ProcessorsOwned`

The Processor must not amplify its own bonus recursively.

The modifier should apply to relevant beneficial Device effects through the common EffectEngine.

It must not duplicate the Facility Optimization modifier.

---

## 15. Hard Disk

Purpose:

Consumes Energy continuously to generate additional Available Data.

### Unlock

Unlock after the first Facility Optimization.

### Initial configuration

Experimental:

- Initial cost: `1e-5 J`
- Cost growth: `×9`
- XP production: `3 Data/s` per active Disk.
- Initial energy consumption: `1e-10 J/s` per Disk.
- Energy consumption growth: linear with active running time.

### Energy consumption

For each Disk:

`EnergyDrain(t) = baseDrain × (1 + activeSeconds / 60)`

Use effective Device performance for XP production and beneficial energy efficiency where appropriate.

Do not increase energy consumption merely because a Facility Optimization improved the Device.

### Data Buffer

Hard Disks generate Data into a temporary accumulated buffer.

This buffer is added to Available Data while the Device remains logically enabled.

States:

**Active**
- Consumes Energy.
- Produces Data.
- Running-time consumption increases.

**Standby**
- Triggered by insufficient operating Energy.
- Stops consuming and producing.
- Preserves accumulated Data.
- May resume automatically when sufficient Energy is available.

**Off**
- Device has been explicitly turned off.
- Loses the accumulated Data credited to that Disk.
- Resets the consumption growth timer.

Turning the Disk back on starts a new buffer from zero.

Machine Learning consumes the current-cycle Data by resetting the relevant progress and buffers.

Facility Optimization destroys ordinary Hard Disks and clears their buffers.

The Disk does not create permanently banked XP that survives being turned off.

---

## 16. Power Cells

Purpose:

Provide operational Energy capacity for eligible physical Devices.

Power Cells are passive Devices.

### Mandatory configuration

- First Power Cell cost: `1 J`
- Capacity per Power Cell: `1e-3 J`

### Experimental cost curve

After the first unit:

`Cost(N) = 1 × 2.25^N J`

Where `N` is the number already purchased.

### Capacity

`PowerCellCapacity = PowerCellsOwned × 1e-3 J × EligibleCapacityModifiers`

Facility Optimization and applicable Processor effects may improve effective capacity according to the declared effect rules.

### Important distinction

**The main Stored Energy wallet must not be capped at 1e-3 J.**

That would make purchasing the first Power Cell for 1 J impossible.

Treat Power Cell capacity as operational Energy buffering, separate from the total Stored Energy wallet.

Transfers between Stored Energy and Power Cell charge must conserve Energy.

Do not create Energy when charging or discharging Power Cells.

Provide the necessary operational interfaces for Devices that consume energy from these buffers.

Power Cell ownership persists after Facility Optimization.

Power Cells are available for purchase only when this subsystem becomes relevant; do not clutter the early UI with them.

---

# PART VI — UI / UX

## 17. Overall structure

Use two main tabs:

1. **Energy**
2. **Efficiency & Automation**

No additional gameplay tabs are needed for the initial sandbox.

All elements should be compact, readable and responsive.

Use small informative cards with optional tooltips and expandable details.

Avoid oversized cards for basic counters or A-Feature actions.

### Persistent information bar

Maintain a compact sticky status bar visible when scrolling.

Display:

- Stored Energy — J.
- Current Energy Production — J/s.
- Available Data (XP).
- Computer Level.
- Facility Optimization count.

Clearly distinguish stored quantities from production rates.

The bar must not obstruct content on smaller screens.

---

## 18. Energy tab

Suggested order:

### A. Introductory narrative

At the beginning of a new game, show a brief narrative introduction.

Explain that the player has activated an experimental computational system capable of improving its own algorithms and extracting usable Energy from cosmic radiation.

Do not expose all future mechanics.

### B. Cosmic Radiation Condenser

Compact CRC panel with:

- CRC status: Idle / Producing.
- Current Algorithm Performance.
- Effective production multiplier.
- Energy production rate.

Detailed calculation in a tooltip or expandable breakdown.

### C. Algorithm Features

Show AImp and AUpg initially.

Show ARec only after unlock.

Each A-Feature should occupy approximately one or two compact rows.

Display:

- Feature name.
- Owned quantity.
- Strength per unit.
- Total contribution.
- Study time or current progress.
- Study/queue controls.

Provide concise tooltips explaining the purpose and conversion cost.

No separate Level bar per A-Feature.

### D. Direct Energy Devices

Show unlocked relevant Devices:

- CRC Gadget.
- Capacitor.
- Power Cells and their operational capacity, when relevant.

Use compact cards or rows.

Do not show locked Devices before their reveal conditions unless they have an intentional narrative teaser.

---

## 19. Efficiency & Automation tab

Suggested order:

### A. Computer Learning

Display:

- Computer Level.
- Available Data.
- Data required for next Level.
- Progress bar.
- Current Computer Performance multiplier.
- Run Machine Learning action.

Use a tooltip to explain the difference between Data and Energy.

### B. AutoCalculator Chips

Display:

- Chips owned.
- Current allocation per A-Feature.
- Active study workers.
- Effective study throughput.

Provide assignment controls.

### C. Transistor Board

Expandable allocation panel containing:

- Transistors purchased.
- Transistors allocated.
- Transistor price.
- Allocations by study.
- Relevant speed effects.

### D. Computing Devices

Display as unlocked:

- Microprocessor.
- Overclocker.
- Processor.
- Hard Disk.

Each should expose current effect, next purchase effect and operational state.

### E. Facility Optimization

Show only when relevant.

Display:

- Current Facility Optimization count.
- Current Computer Level requirement.
- Permanent Device performance modifier.
- What the reset removes.
- What the reset preserves.
- Facility Optimization action.

Require a confirmation interaction for irreversible prestige actions in normal gameplay.

---

# PART VII — PURCHASES AND STUDY ACTIONS

## 20. Bulk actions

Every repeatable purchase action must support:

- Buy 1
- Buy 10
- Buy 100
- Buy 1000

When an item is unique, disable the unsupported quantities.

Bulk transactions must calculate the real sum of individual costs.

Do not multiply the current unit price by the requested quantity.

The player must have enough Energy for the entire requested batch unless using Developer Mode.

For A-Feature studies, the equivalent controls schedule the requested number of study completions.

**They must not produce the requested units instantly.**

Automation and queued studies must observe duration, resource availability and research concurrency.

Bulk research controls should manage queues, not bypass time.

---

# PART VIII — DEVELOPER SANDBOX

## 21. Developer features

Developer Mode must be fully operational.

Enable:

### Force Buy

Allow force purchasing:

- 1 unit.
- 10 units.
- 100 units.
- 1000 units.

Force Buy may bypass ordinary affordability and unlock checks in Developer Mode.

It must not create negative Stored Energy by default.

If a forced purchase is unaffordable, record the actual nominal cost and the amount actually debited, including the fact that it was a Developer Mode grant.

Forced purchases must be explicitly identifiable in the event log.

### Reset

Provide:

- Reset current run.
- Reset all gameplay progress.
- Return to a clean initial sandbox state.

Reset operations must preserve configuration and architecture.

Provide confirmations for destructive actions.

### Quick Save

Capture a complete gameplay snapshot.

### Quick Restore

Restore the saved snapshot deterministically, including:

- Player inventories.
- Computer Level.
- Facility Optimization progress.
- Owned Devices.
- Transistor assignments.
- Power Cell inventory and charge.
- Energy.
- Hard Disk states and buffers.
- Active temporary effects and remaining durations.
- Study queues and progress.
- Relevant timers and RNG state, if applicable.

The restored game must produce the same results as an uninterrupted game with the same subsequent commands and elapsed time.

### Game Speed

Expose a development-only simulation speed multiplier for accelerated testing.

It must accelerate the deterministic simulation clock, not merely UI animation.

### Parameter editing

Allow rapid changes to gameplay configuration in the sandbox, followed by safe stat recalculation.

No effect should be implemented twice merely to support the debug controls.

---

## 22. Purchase and action logging

All player and Developer Mode purchase actions must be logged.

Each log entry must capture:

- Timestamp and simulation timestamp.
- Transaction ID.
- Action type.
- Device or resource identifier.
- Requested quantity.
- Purchased quantity.
- Nominal cost.
- Currency actually debited.
- Whether the action was forced.
- Whether affordability/unlock checks were bypassed.
- Computer Level.
- Facility Optimization count.
- Stored Energy before and after.
- Available Data before and after.
- Effective Energy Production before and after.
- A-Feature quantities.
- Device quantities.
- Transistor allocation.
- Active operational effects.
- Relevant current configuration parameters.

Maintain the relevant setup snapshot at the time of the transaction.

Logs must be exportable for analysis.

Avoid recording thousands of redundant full snapshots for ordinary automated study completions. Those may use aggregated operational events, provided deterministic replay and debugging remain possible.

Never omit or collapse player purchase transactions.

---

# PART IX — ARCHITECTURAL REQUIREMENTS

## 23. Preserve existing software contracts

Use the existing architecture as the foundation.

Expected boundaries:

**Configuration / Content SSoT**
- Gameplay parameters.
- Formula identifiers.
- Prices.
- Unlock definitions.
- Device definitions.
- Effect declarations.

**GameState**
- Owned resources.
- Computer Level.
- Completed Facility Optimizations.
- Device ownership.
- Operational state.
- Data buffers.
- Queued research.
- Transactional state.

**FormulaRegistry**
- Pure mathematical formulas.

**EffectRegistry**
- Source and target relationships.

**EffectEngine**
- Centralized composition of effects.

**StatResolver**
- Derived properties.
- Dependency resolution.
- Breakdown and trace.
- Cycle detection.

**CommandEngine**
- Purchases.
- Study starts and completions.
- Allocations.
- Activations.
- Soft Reset.
- Hard Reset.

**SimulationRunner / OfflineSimulator**
- Deterministic time progression.
- Automated studies.
- Device consumption.
- Energy production and Decay.
- Event-driven transitions.

**UI**
- Read-only view models.
- User intents.
- No duplicate economic formulas.

### Engineering constraints

- Do not create a specialized class for every A-Feature or Device.
- Use generic definitions for ordinary purchase/effect behavior.
- Use lifecycle components where an operational state machine is genuinely necessary, particularly Hard Disk and Overclocker.
- Do not persist calculated stat values as authoritative state.
- Do not use native floating-point numbers as the sole representation for large Energy values.
- Support large integer inventory quantities.
- Do not duplicate derived stat calculations in React/UI components.
- Preserve deterministic online/offline behavior.
- Ensure all reset operations are atomic.
- Ensure simultaneous study completions cannot consume the same resources twice.
- Ensure all effects can be traced to their origin.

### Simulation accuracy

The 0.5-second study duration must remain valid even when speed modifiers allow multiple completions per simulation tick.

Do not limit an automated worker to one completion per rendering frame.

Production, Decay, Energy consumption and research completions must respect actual simulated elapsed time.

Any batching optimization must be equivalent to the underlying game rules.

---

# PART X — ACCEPTANCE TESTS

## 24. Core algorithm tests

Verify:

1. Initial AImp study takes 0.5 seconds.
2. Twelve AImp can be converted into one AUpg.
3. AUpg conversion consumes exactly twelve AImp.
4. Twelve AUpg can be converted into one ARec after its unlock.
5. ARec conversion consumes exactly twelve AUpg.
6. At Level 1, one AImp contributes `1e-15`.
7. At Level 1, one AUpg contributes `24e-15`.
8. At Level 1, one ARec contributes `576e-15`.
9. Energy Production correctly uses the sum of contributions.
10. Computer Level affects Algorithm Performance exactly once.

## 25. Data and Machine Learning tests

Verify:

- 12 AImp give 12 Available Data.
- Converting them into one AUpg changes that portion to 9 Available Data.
- 12 AUpg give 108 Available Data.
- Converting them into one ARec changes that portion to 81 Available Data.
- First Machine Learning requirement is 693.
- Second requirement is 2,997.
- Third requirement is 7,996.
- Machine Learning increases Computer Level exactly once.
- Algorithm inventories are reset.
- Conventional hardware persists.
- Computer Performance multiplier updates correctly.

## 26. Facility Optimization tests

Verify:

- First Facility Optimization requires Computer Level 9.
- Eight Machine Learning operations advance the initial computer from Level 1 to Level 9.
- First Facility Optimization unlocks ARec and Processor.
- Computer Level persists.
- Conventional hardware resets.
- Power Cell ownership persists.
- Facility performance is resolved once per eligible effect.
- A second Facility Optimization requires Level 12 under the experimental curve.

## 27. Devices and UI tests

Verify:

- Studies remain duration-based after automation.
- Shared Transistor prices work correctly across allocations.
- Microprocessor targets only its assigned study.
- Overclocker consumes the correct Transistors.
- Hard Disk pauses when energy is insufficient.
- Hard Disk loses its Data buffer when explicitly turned off.
- Power Cell cost and capacity are correct.
- Energy remains conserved in Power Cell transfers.
- Energy and Efficiency & Automation tabs display the correct unlocked content.
- Sticky production and storage information remains visible while scrolling.
- Buy 1/10/100/1000, Force Buy, Reset, Quick Save and Quick Restore all work.
- Every purchase has a valid log entry and setup snapshot.

---

# PART XI — IMPLEMENTATION PROCESS

## 28. Required delivery sequence

1. Audit the existing project and identify reusable architectural components.
2. Create the working branch and backup.
3. Remove obsolete gameplay definitions, UI and formulas without destroying reusable architecture.
4. Implement the new A-Feature model and CRC economy.
5. Implement Available Data and Computer Level.
6. Implement Run Machine Learning.
7. Implement Facility Optimization.
8. Implement the Device system and unlock sequence.
9. Implement the new two-tab UI.
10. Implement Developer Mode and transaction logging.
11. Test calculations, reset transactions, online/offline simulation and save/restore.
12. Run balance simulations for early Computer Levels and the first Facility Optimization.
13. Present test results, deviations and unresolved issues.

Use automated tests and the sandbox to identify overpowered or underpowered parameters.

Do not silently rebalance gameplay values while implementing.

Do not implement Science Era, Particle Era or Multithreader gameplay yet.

Keep the architecture extensible for them.

**The goal is a functional, measurable, visually clean sandbox that allows subsequent gameplay balancing through configuration rather than repeated architectural changes.**

## 29. Authority of this specification

All prices and Device effect parameters marked experimental are adjustable starting values.

The fundamental rules, relationships, UX structure and reset semantics in this document are the intended sandbox design.

When existing code conflicts with this specification, prefer this specification for gameplay while preserving reusable architectural contracts.

When a change would require violating an architectural invariant, report the conflict and propose the smallest compatible implementation.

Do not introduce undocumented mechanics, progression currencies, caps, or hidden multipliers.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-18T21:08:21-03:00.
</ADDITIONAL_METADATA>