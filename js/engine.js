import { evaluateComponent } from "./availability.js";
import {
  calculateAlgorithmUpgradeDuration,
  calculateAlgorithmUpgradeRequirement,
  calculateBlueprintResearchDuration,
  calculateDeviceDurationMultiplier,
  calculateEnergyOverflowDecay,
  calculateEffectiveEnergyGain,
  calculateImprovementBonus,
  calculateOverclockerDrainPerSecond,
  calculateProduction,
  calculateStableEnergyCapacity,
  calculateStudyDuration,
  canResearchBlueprint,
  clamp
} from "./formulas.js";

export class GameEngine {
  constructor({
    state,
    config,
    developmentMode = false,
    random = Math.random,
    collectEvents = false,
    suppressLogs = false
  }) {
    this.state = state;
    this.config = config;
    this.developmentMode = developmentMode;
    this.random = random;
    this.collectEvents = collectEvents;
    this.suppressLogs = suppressLogs;
    this.events = [];
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) listener(this.state);
  }

  emitEvent(type, payload = {}) {
    if (!this.collectEvents) return;
    this.events.push({
      type,
      at: this.state.stats.runPlayTime,
      ...payload
    });
  }

  consumeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  addLog(message, tone = "info") {
    if (this.suppressLogs) return;

    this.state.log.unshift({
      id: `${Date.now()}-${Math.random()}`,
      message,
      tone,
      at: this.state.stats.runPlayTime
    });
    this.state.log = this.state.log.slice(0, 60);
  }

  pressButton() {
    this.state.introState = "crc-briefing";
    this.notify();
  }

  activateCrc() {
    this.state.introState = "active";
    this.addLog(
      "Cosmic Radiation Condenser detected. Status: ONLINE.",
      "discovery"
    );
    this.notify();
  }

  leaveRoom() {
    this.state.introState = "left";
    this.notify();
  }

  returnToRoom() {
    this.state.introState = "choice";
    this.notify();
  }

  tick(deltaSeconds) {
    if (this.state.introState !== "active") return;

    const delta = clamp(
      deltaSeconds,
      0,
      this.config.timing.maximumTickSeconds
    );

    if (delta <= 0) return;

    this.state.stats.totalPlayTime += delta;
    this.state.stats.runPlayTime += delta;

    const production = calculateProduction(
      this.state,
      this.config,
      this.developmentMode
    );
    this.addEnergy(production * delta, false);
    this.decayOverflowEnergy(delta, false);
    this.drainOverclocker(delta, false);
    this.coolOverclocker(delta, false);

    this.tickStudy(delta);
    this.tickAlgorithmUpgradeStudy(delta);
    this.tickBlueprintStudy(delta);
    this.tickConstruction(delta);
  }

  addEnergy(amount, notify = true) {
    const collected = calculateEffectiveEnergyGain(
      this.state,
      amount,
      this.config
    );

    this.state.energy += collected;
    this.state.peakEnergy = Math.max(this.state.peakEnergy, this.state.energy);
    this.state.stats.totalEnergyCollected += collected;
    if (collected > 0) {
      this.emitEvent("energy-collected", { amount: collected });
    }

    if (notify) this.notify();
    return collected;
  }

  decayOverflowEnergy(delta, notify = true) {
    const capacity = calculateStableEnergyCapacity(this.state, this.config);
    if (this.state.energy <= capacity) return 0;

    const decay = Math.min(
      this.state.energy - capacity,
      calculateEnergyOverflowDecay(this.state, this.config) * delta
    );

    this.state.energy -= decay;
    if (decay > 0) {
      this.emitEvent("energy-decayed", { amount: decay });
    }
    if (notify) this.notify();
    return decay;
  }

  drainOverclocker(delta, notify = true) {
    if (this.state.devices.overclockers <= 0 || !this.state.overclocker.active) {
      return 0;
    }

    const stableCapacity = calculateStableEnergyCapacity(this.state, this.config);
    const availableExcess = Math.max(0, this.state.energy - stableCapacity);
    if (availableExcess <= 0) {
      this.state.overclocker.active = false;
      this.refreshAlgorithmImprovementDuration();
      this.addLog("Overclocker lost excess feed. Cooling sequence started.", "info");
      if (notify) this.notify();
      return 0;
    }

    const drain = calculateOverclockerDrainPerSecond(this.state, this.config) * delta;
    if (drain <= 0) return 0;

    const consumed = Math.min(availableExcess, drain);
    this.state.energy -= consumed;
    if (consumed > 0) {
      this.emitEvent("overclocker-drained", { amount: consumed });
    }

    if (consumed < drain || this.state.energy <= stableCapacity) {
      this.state.energy = Math.max(stableCapacity, this.state.energy);
      this.state.overclocker.active = false;
      this.refreshAlgorithmImprovementDuration();
      this.addLog("Overclocker lost excess feed. Cooling sequence started.", "info");
    } else {
      this.state.overclocker.activeSeconds += delta;
    }

    if (notify) this.notify();
    return consumed;
  }

  coolOverclocker(delta, notify = true) {
    if (
      this.state.devices.overclockers <= 0 ||
      this.state.overclocker.active ||
      this.state.overclocker.activeSeconds <= 0
    ) {
      return 0;
    }

    const coolingMultiplier =
      this.config.overclocker.coolingDurationMultiplier ?? 2;
    const cooling = Math.min(
      this.state.overclocker.activeSeconds,
      delta / Math.max(coolingMultiplier, Number.EPSILON)
    );

    this.state.overclocker.activeSeconds = Math.max(
      0,
      this.state.overclocker.activeSeconds - cooling
    );

    if (notify) this.notify();
    return cooling;
  }

  retimeActiveProgress(task, nextDuration) {
    if (!task.active || nextDuration <= 0) return;

    const progress = task.duration > 0
      ? clamp(task.elapsed / task.duration, 0, 1)
      : 0;

    task.duration = nextDuration;
    task.elapsed = Math.min(task.duration, progress * task.duration);
  }

  calculateCrcConstructionDuration() {
    return (
      this.config.crcConstruction.durationSeconds *
      calculateDeviceDurationMultiplier(this.state, this.config) *
      (this.developmentMode
        ? this.state.devSettings.durationMultiplier
        : 1)
    );
  }

  refreshAlgorithmImprovementDuration() {
    this.retimeActiveProgress(
      this.state.study,
      calculateStudyDuration(this.state, this.config, this.developmentMode)
    );
  }

  refreshAllActiveDurations() {
    this.refreshAlgorithmImprovementDuration();
    this.retimeActiveProgress(
      this.state.algorithmUpgradeStudy,
      calculateAlgorithmUpgradeDuration(
        this.state,
        this.config,
        this.developmentMode
      )
    );
    this.retimeActiveProgress(
      this.state.blueprintStudy,
      calculateBlueprintResearchDuration(
        this.state,
        this.config,
        this.developmentMode
      )
    );
    this.retimeActiveProgress(
      this.state.construction,
      this.calculateCrcConstructionDuration()
    );
  }

  startStudy(automated = false) {
    if (this.state.study.active || this.state.introState !== "active") {
      return false;
    }

    this.state.study.active = true;
    this.state.study.elapsed = 0;
    this.state.study.duration = calculateStudyDuration(
      this.state,
      this.config,
      this.developmentMode
    );
    this.state.study.automated = automated;
    this.notify();
    return true;
  }

  tickStudy(delta) {
    if (!this.state.study.active) {
      if (this.state.devices.autoCalculators > 0) this.startStudy(true);
      return;
    }

    this.state.study.elapsed += delta;
    if (this.state.study.elapsed < this.state.study.duration) return;

    this.completeStudy();
  }

  completeStudy() {
    const bonus = calculateImprovementBonus(
      this.state.improvements,
      this.config,
      this.state.calculationMethods
    );

    this.state.improvementMultiplier *= 1 + bonus;
    this.state.improvements += 1;
    this.state.study.active = false;
    this.state.study.elapsed = 0;
    this.emitEvent("algorithm-improvement-completed", {
      count: this.state.improvements,
      bonus
    });

    this.addLog(
      `Algorithm Improvement ${this.state.improvements} completed: +${(
        bonus * 100
      ).toFixed(2)}% efficiency.`
    );

    this.checkBlueprintGuarantee();

    if (this.state.devices.autoCalculators > 0) {
      this.startStudy(true);
    } else {
      this.notify();
    }
  }

  checkBlueprintGuarantee() {
    if (
      canResearchBlueprint(this.state, this.config) &&
      this.state.discoveries.blueprintSource !== "research-available"
    ) {
      this.state.discoveries.blueprintSource = "research-available";
      this.addLog(
        "CRC Blueprint signal isolated. A short reconstruction pass is now available.",
        "discovery"
      );
      this.notify();
    }
  }

  completeBlueprintResearch(source = "research") {
    if (this.state.discoveries.crcBlueprint) return;
    this.state.discoveries.crcBlueprint = true;
    this.state.discoveries.blueprintSource = source;
    this.emitEvent("blueprint-research-completed", { source });
    this.addLog("CRC Blueprint reconstructed. New condensers can now be fabricated.", "discovery");
    this.notify();
  }

  canStartBlueprintResearch() {
    return evaluateComponent("crcBlueprint", this.state, this.config).enabled;
  }

  startBlueprintResearch() {
    if (!this.canStartBlueprintResearch()) return false;
    this.state.blueprintStudy.active = true;
    this.state.blueprintStudy.elapsed = 0;
    this.state.blueprintStudy.duration = calculateBlueprintResearchDuration(
      this.state,
      this.config,
      this.developmentMode
    );
    this.addLog("CRC Blueprint research started.", "device");
    this.notify();
    return true;
  }

  tickBlueprintStudy(delta) {
    if (!this.state.blueprintStudy.active) return;
    this.state.blueprintStudy.elapsed += delta;
    if (this.state.blueprintStudy.elapsed < this.state.blueprintStudy.duration) {
      return;
    }

    this.state.blueprintStudy.active = false;
    this.state.blueprintStudy.elapsed = 0;
    this.completeBlueprintResearch("research");
  }

  canPurchaseAutoCalculator() {
    return evaluateComponent("autoCalculator", this.state, this.config).enabled;
  }

  canPurchaseSoftDataDisplay() {
    return evaluateComponent("softDataDisplay", this.state, this.config).enabled;
  }

  canPurchaseT2SoftDataDisplay() {
    return evaluateComponent("t2SoftDataDisplay", this.state, this.config).enabled;
  }

  canPurchasePowerCell() {
    return evaluateComponent("powerCell", this.state, this.config).enabled;
  }

  canPurchasePowerModule() {
    return evaluateComponent("powerModule", this.state, this.config).enabled;
  }

  canPurchaseOverclocker() {
    return evaluateComponent("overclocker", this.state, this.config).enabled;
  }

  purchasePowerCell() {
    if (!this.canPurchasePowerCell()) return false;
    const cost = evaluateComponent("powerCell", this.state, this.config).cost;

    this.state.energy -= cost;
    this.state.powerCells += 1;
    this.emitEvent("device-purchased", {
      device: "powerCell",
      count: this.state.powerCells,
      cost
    });
    this.addLog(
      `Power Cell ${this.state.powerCells} stabilized. Energy capacity expanded.`,
      "device"
    );
    this.notify();
    return true;
  }

  purchaseMaxPowerCells(maxPurchases = 100000) {
    let purchased = 0;

    while (purchased < maxPurchases) {
      const availability = evaluateComponent("powerCell", this.state, this.config);
      if (
        !availability.enabled ||
        !Number.isFinite(availability.cost) ||
        availability.cost <= 0 ||
        this.state.energy < availability.cost
      ) {
        break;
      }

      this.state.energy -= availability.cost;
      this.state.powerCells += 1;
      purchased += 1;
      this.emitEvent("device-purchased", {
        device: "powerCell",
        count: this.state.powerCells,
        cost: availability.cost
      });
    }

    if (purchased <= 0) return 0;

    this.addLog(
      `Power Cell Array expanded. ${purchased} cells stabilized.`,
      "device"
    );
    this.notify();
    return purchased;
  }

  purchasePowerModule() {
    if (!this.canPurchasePowerModule()) return false;
    const availability = evaluateComponent("powerModule", this.state, this.config);

    this.state.energy -= availability.cost;
    this.state.powerModules += 1;
    this.emitEvent("device-purchased", {
      device: "powerModule",
      count: this.state.powerModules,
      cost: availability.cost
    });
    this.addLog(
      `Power Module ${this.state.powerModules} synchronized. Cell conduction capacity increased.`,
      "device"
    );
    this.notify();
    return true;
  }

  purchaseSoftDataDisplay() {
    if (!this.canPurchaseSoftDataDisplay()) return false;
    const cost = evaluateComponent("softDataDisplay", this.state, this.config).cost;
    this.state.energy -= cost;
    this.state.devices.softDataDisplay = true;
    this.emitEvent("device-purchased", {
      device: "softDataDisplay",
      count: 1,
      cost
    });
    this.addLog(
      "Soft Display restored. Production telemetry is now readable.",
      "device"
    );
    this.notify();
    return true;
  }

  purchaseT2SoftDataDisplay() {
    if (!this.canPurchaseT2SoftDataDisplay()) return false;
    const cost = evaluateComponent("t2SoftDataDisplay", this.state, this.config).cost;
    this.state.energy -= cost;
    this.state.devices.t2SoftDataDisplay = true;
    this.emitEvent("device-purchased", {
      device: "t2SoftDataDisplay",
      count: 1,
      cost
    });
    this.addLog(
      "T2 Soft Display restored. Condenser output composition is now readable.",
      "device"
    );
    this.notify();
    return true;
  }

  purchaseOverclocker() {
    if (!this.canPurchaseOverclocker()) return false;
    const cost = evaluateComponent("overclocker", this.state, this.config).cost;
    this.state.energy -= cost;
    this.state.devices.overclockers += 1;
    this.state.overclocker.active = false;
    this.emitEvent("device-purchased", {
      device: "overclocker",
      count: this.state.devices.overclockers,
      cost
    });
    this.addLog(
      `Overclocker ${this.state.devices.overclockers} installed. Stored Energy can now be burned to force faster calculations.`,
      "device"
    );
    this.refreshAlgorithmImprovementDuration();
    this.notify();
    return true;
  }

  toggleOverclocker() {
    if (this.state.devices.overclockers <= 0) return false;

    if (this.state.overclocker.active) {
      this.state.overclocker.active = false;
      this.refreshAlgorithmImprovementDuration();
      this.addLog("Overclocker disengaged. Cooling sequence started.", "info");
      this.notify();
      return true;
    }

    if (
      this.state.devices.autoCalculators <= 0 ||
      this.state.energy <= calculateStableEnergyCapacity(this.state, this.config)
    ) {
      return false;
    }

    this.state.overclocker.active = true;
    this.refreshAlgorithmImprovementDuration();
    this.addLog("Overclocker engaged. Auto Calculator speed increased.", "device");
    this.notify();
    return true;
  }

  purchaseAutoCalculator() {
    if (!this.canPurchaseAutoCalculator()) return false;
    const cost = evaluateComponent("autoCalculator", this.state, this.config).cost;

    this.state.energy -= cost;
    this.state.devices.autoCalculators += 1;
    this.emitEvent("device-purchased", {
      device: "autoCalculator",
      count: this.state.devices.autoCalculators,
      cost
    });
    if (this.state.study.active) {
      this.state.study.automated = true;
      this.refreshAlgorithmImprovementDuration();
    }
    this.addLog(
      `Auto Calculator ${this.state.devices.autoCalculators} connected. Study automation improved.`,
      "device"
    );
    if (!this.state.study.active) this.startStudy(true);
    this.notify();
    return true;
  }

  canConstructCrc() {
    return evaluateComponent("crcConstruction", this.state, this.config).enabled;
  }

  startCrcConstruction() {
    if (!this.canConstructCrc()) return false;
    const cost = evaluateComponent("crcConstruction", this.state, this.config).cost;
    this.state.energy -= cost;
    this.state.construction.active = true;
    this.state.construction.elapsed = 0;
    this.state.construction.duration = this.calculateCrcConstructionDuration();
    this.emitEvent("construction-started", {
      device: "crc",
      cost
    });
    this.addLog("CRC construction sequence initiated.", "device");
    this.notify();
    return true;
  }

  tickConstruction(delta) {
    if (!this.state.construction.active) return;
    this.state.construction.elapsed += delta;

    if (
      this.state.construction.elapsed < this.state.construction.duration
    ) {
      return;
    }

    this.state.construction.active = false;
    this.state.construction.elapsed = 0;
    this.state.crcCount += 1;
    this.emitEvent("construction-completed", {
      device: "crc",
      count: this.state.crcCount
    });
    this.addLog(
      `Cosmic Radiation Condenser ${this.state.crcCount} is online.`,
      "discovery"
    );
    this.notify();
  }

  canPurchaseProcessor() {
    return evaluateComponent("processor", this.state, this.config).enabled;
  }

  purchaseProcessor() {
    if (!this.canPurchaseProcessor()) return false;
    const cost = evaluateComponent("processor", this.state, this.config).cost;

    this.state.energy -= cost;
    this.state.devices.processors += 1;
    this.state.prototypeComplete = true;
    this.emitEvent("device-purchased", {
      device: "processor",
      count: this.state.devices.processors,
      cost
    });
    this.refreshAlgorithmImprovementDuration();
    this.retimeActiveProgress(
      this.state.construction,
      this.calculateCrcConstructionDuration()
    );
    this.addLog(
      `Processor ${this.state.devices.processors} online. Device execution time reduced.`,
      "milestone"
    );
    this.notify();
    return true;
  }

  canStartAlgorithmUpgradeStudy() {
    return evaluateComponent("algorithmUpgrade", this.state, this.config).enabled;
  }

  startAlgorithmUpgradeStudy() {
    if (!this.canStartAlgorithmUpgradeStudy()) return false;
    this.state.algorithmUpgradeStudy.active = true;
    this.state.algorithmUpgradeStudy.elapsed = 0;
    this.state.algorithmUpgradeStudy.duration =
      calculateAlgorithmUpgradeDuration(
        this.state,
        this.config,
        this.developmentMode
      );
    this.addLog("Algorithm Upgrade study started.", "device");
    this.notify();
    return true;
  }

  tickAlgorithmUpgradeStudy(delta) {
    if (!this.state.algorithmUpgradeStudy.active) return;
    this.state.algorithmUpgradeStudy.elapsed += delta;
    if (
      this.state.algorithmUpgradeStudy.elapsed <
      this.state.algorithmUpgradeStudy.duration
    ) {
      return;
    }

    this.completeAlgorithmUpgrade();
  }

  completeAlgorithmUpgrade() {
    this.state.algorithmUpgradeStudy.active = false;
    this.state.algorithmUpgradeStudy.elapsed = 0;
    this.state.upgrades += 1;
    this.resetAlgorithmImprovements();
    this.emitEvent("algorithm-upgrade-completed", {
      count: this.state.upgrades
    });
    this.addLog(
      `Algorithm Upgrade ${this.state.upgrades} completed. CRC production doubled and Improvements were reset.`,
      "milestone"
    );
    if (this.state.devices.autoCalculators > 0) this.startStudy(true);
    this.notify();
  }

  canClaimCalculationMethodUpgrade() {
    return evaluateComponent("calculationMethodUpgrade", this.state, this.config).enabled;
  }

  claimCalculationMethodUpgrade() {
    if (!this.canClaimCalculationMethodUpgrade()) return false;

    this.state.calculationMethods += 1;
    this.resetAllStudies();
    this.emitEvent("calculation-method-upgraded", {
      count: this.state.calculationMethods
    });
    this.addLog(
      `Calculation Method Upgrade ${this.state.calculationMethods} completed. Improvement penalty scaling reduced.`,
      "milestone"
    );
    this.notify();
    return true;
  }

  canClaimSetupOptimization() {
    return evaluateComponent("setupOptimization", this.state, this.config).enabled;
  }

  canActivateParticleSynthesizer() {
    return evaluateComponent("particleSynthesizer", this.state, this.config).enabled;
  }

  activateParticleSynthesizer() {
    if (!this.canActivateParticleSynthesizer()) return false;
    const cost = evaluateComponent("particleSynthesizer", this.state, this.config).cost;

    this.state.energy -= cost;
    this.state.sciencePoints += 1;
    this.state.science.syntheses += 1;
    this.emitEvent("particle-synthesizer-activated", {
      cost,
      sciencePoints: 1
    });
    this.resetEnergyLayerForSynthesis();
    this.addLog(
      "Particle Synthesizer activated. One Science Point preserved through a full Energy Layer reset.",
      "milestone"
    );
    this.notify();
    return true;
  }

  canPurchaseMatrixMechanics() {
    return evaluateComponent("matrixMechanics", this.state, this.config).enabled;
  }

  purchaseMatrixMechanics() {
    if (!this.canPurchaseMatrixMechanics()) return false;
    const cost = evaluateComponent("matrixMechanics", this.state, this.config).cost;

    this.state.sciencePoints -= cost;
    this.state.science.matrixMechanics = true;
    this.emitEvent("science-upgrade-purchased", {
      upgrade: "matrixMechanics",
      cost
    });
    this.refreshAlgorithmImprovementDuration();
    this.addLog(
      "Matrix Mechanics acquired. Algorithm Upgrades now compound a small Improvement calculation speed correction.",
      "milestone"
    );
    this.notify();
    return true;
  }

  claimSetupOptimization() {
    if (!this.canClaimSetupOptimization()) return false;

    this.state.setupOptimizations += 1;
    this.resetHardwareForSetupOptimization();
    this.emitEvent("setup-optimized", {
      count: this.state.setupOptimizations
    });
    this.addLog(
      `Setup Optimization ${this.state.setupOptimizations} completed. Study time penalty scaling reduced.`,
      "milestone"
    );
    this.notify();
    return true;
  }

  resetAlgorithmImprovements() {
    this.state.improvements = 0;
    this.state.improvementMultiplier = 1;
    this.state.study.active = false;
    this.state.study.elapsed = 0;
    this.state.study.duration = 0;
    this.state.study.automated = false;
  }

  resetAllStudies() {
    this.resetAlgorithmImprovements();
    this.state.upgrades = 0;
    this.state.algorithmUpgradeStudy.active = false;
    this.state.algorithmUpgradeStudy.elapsed = 0;
    this.state.algorithmUpgradeStudy.duration = 0;
    this.state.blueprintStudy.active = false;
    this.state.blueprintStudy.elapsed = 0;
    this.state.blueprintStudy.duration = 0;
  }

  resetHardwareForSetupOptimization() {
    this.state.energy = 0;
    this.state.peakEnergy = 0;
    this.resetAllStudies();
    this.state.calculationMethods = 0;
    this.state.devices.softDataDisplay = false;
    this.state.devices.t2SoftDataDisplay = false;
    this.state.devices.autoCalculators = 0;
    this.state.devices.processors = 0;
    this.state.devices.overclockers = 0;
    this.state.powerModules = 0;
    this.state.overclocker.active = false;
    this.state.overclocker.activeSeconds = 0;
    this.state.crcCount = this.config.energy.initialCrcCount;
    this.state.discoveries.crcBlueprint = false;
    this.state.discoveries.blueprintSource = null;
    this.state.blueprintStudy.active = false;
    this.state.blueprintStudy.elapsed = 0;
    this.state.blueprintStudy.duration = 0;
    this.state.construction.active = false;
    this.state.construction.elapsed = 0;
    this.state.construction.duration = 0;
    this.state.prototypeComplete = false;
  }

  resetEnergyLayerForSynthesis() {
    this.state.energy = 0;
    this.state.peakEnergy = 0;
    this.state.powerCells = this.config.energy.initialPowerCells;
    this.state.powerModules = 0;
    this.state.improvements = 0;
    this.state.improvementMultiplier = 1;
    this.state.upgrades = 0;
    this.state.calculationMethods = 0;
    this.state.setupOptimizations = 0;
    this.state.crcCount = this.config.energy.initialCrcCount;
    this.state.devices.softDataDisplay = false;
    this.state.devices.t2SoftDataDisplay = false;
    this.state.devices.autoCalculators = 0;
    this.state.devices.processors = 0;
    this.state.devices.overclockers = 0;
    this.state.overclocker.active = false;
    this.state.overclocker.activeSeconds = 0;
    this.state.discoveries.crcBlueprint = false;
    this.state.discoveries.blueprintSource = null;
    this.state.study.active = false;
    this.state.study.elapsed = 0;
    this.state.study.duration = 0;
    this.state.study.automated = false;
    this.state.algorithmUpgradeStudy.active = false;
    this.state.algorithmUpgradeStudy.elapsed = 0;
    this.state.algorithmUpgradeStudy.duration = 0;
    this.state.blueprintStudy.active = false;
    this.state.blueprintStudy.elapsed = 0;
    this.state.blueprintStudy.duration = 0;
    this.state.construction.active = false;
    this.state.construction.elapsed = 0;
    this.state.construction.duration = 0;
    this.state.particleSynthesizer.activated = false;
    this.state.prototypeComplete = false;
    this.state.stats.runPlayTime = 0;
    this.state.ui.activeTab = "science";
  }

  resetStudyProgression() {
    this.resetAllStudies();
    this.state.study.active = false;
    this.state.study.elapsed = 0;
    this.state.study.duration = 0;
    this.state.study.automated = false;
  }

  developmentAddEnergy() {
    if (!this.developmentMode) return;
    this.addEnergy(this.config.energy.powerCellCapacity * 0.25);
  }

  developmentAddLargeEnergy() {
    if (!this.developmentMode) return;
    this.addEnergy(Math.max(1, this.state.energy || 1));
  }

  developmentCompleteStudy() {
    if (!this.developmentMode) return;
    if (!this.state.study.active) this.startStudy(false);
    this.completeStudy();
  }

  developmentCompleteAlgorithmUpgrade() {
    if (!this.developmentMode) return;
    if (!this.canStartAlgorithmUpgradeStudy()) {
      this.state.improvements = calculateAlgorithmUpgradeRequirement(
        this.state,
        this.config
      );
    }
    this.completeAlgorithmUpgrade();
  }

  developmentForceBlueprint() {
    if (!this.developmentMode) return;
    this.completeBlueprintResearch("development");
  }

  developmentCycleProductionMultiplier() {
    if (!this.developmentMode) return;
    const options = [1, 1000, 1_000_000, 1_000_000_000];
    const current = this.state.devSettings.productionMultiplier;
    const index = options.indexOf(current);
    this.state.devSettings.productionMultiplier =
      options[(index + 1) % options.length];
    this.notify();
  }

  developmentCycleDurationMultiplier() {
    if (!this.developmentMode) return;
    const options = [1, 0.05, 0.005, 0.0005];
    const current = this.state.devSettings.durationMultiplier;
    const index = options.indexOf(current);
    this.state.devSettings.durationMultiplier =
      options[(index + 1) % options.length];
    this.refreshAllActiveDurations();
    this.notify();
  }
}
