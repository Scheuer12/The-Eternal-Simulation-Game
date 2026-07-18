import {
  calculateImprovementBonus,
  calculateProduction,
  calculateStudyDuration,
  calculateUpgradeChance,
  clamp
} from "./formulas.js";

export class GameEngine {
  constructor({ state, config, developmentMode = false, random = Math.random }) {
    this.state = state;
    this.config = config;
    this.developmentMode = developmentMode;
    this.random = random;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) listener(this.state);
  }

  addLog(message, tone = "info") {
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

    this.tickStudy(delta);
    this.tickConstruction(delta);
  }

  addEnergy(amount, notify = true) {
    const availableSpace =
      this.config.energy.powerCellCapacity - this.state.energy;
    const collected = Math.max(0, Math.min(amount, availableSpace));

    this.state.energy += collected;
    this.state.peakEnergy = Math.max(this.state.peakEnergy, this.state.energy);
    this.state.stats.totalEnergyCollected += collected;

    if (notify) this.notify();
    return collected;
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
      if (this.state.devices.autoCalculator) this.startStudy(true);
      return;
    }

    this.state.study.elapsed += delta;
    if (this.state.study.elapsed < this.state.study.duration) return;

    this.completeStudy();
  }

  completeStudy() {
    const bonus = calculateImprovementBonus(
      this.state.improvements,
      this.config
    );

    this.state.improvementMultiplier *= 1 + bonus;
    this.state.improvements += 1;
    this.state.study.active = false;
    this.state.study.elapsed = 0;

    this.addLog(
      `Algorithm Improvement ${this.state.improvements} completed: +${(
        bonus * 100
      ).toFixed(2)}% efficiency.`
    );

    const upgradeChance = calculateUpgradeChance(
      this.state.upgrades,
      this.config
    );

    if (this.random() < upgradeChance) {
      this.state.upgrades += 1;
      this.addLog(
        `Algorithm Upgrade discovered. Energy production doubled (×${
          2 ** this.state.upgrades
        }).`,
        "discovery"
      );

      if (
        !this.state.discoveries.crcBlueprint &&
        this.random() < this.config.blueprint.chancePerUpgrade
      ) {
        this.discoverBlueprint("probability");
      }
    }

    this.checkBlueprintGuarantee();

    if (this.state.devices.autoCalculator) {
      this.startStudy(true);
    } else {
      this.notify();
    }
  }

  checkBlueprintGuarantee() {
    if (this.state.discoveries.crcBlueprint) return;

    if (this.state.peakEnergy >= this.config.blueprint.revealAtPeakEnergy) {
      this.discoverBlueprint("energy-threshold");
    }
  }

  discoverBlueprint(source) {
    if (this.state.discoveries.crcBlueprint) return;
    this.state.discoveries.crcBlueprint = true;
    this.state.discoveries.blueprintSource = source;
    this.addLog(
      source === "probability"
        ? "Unexpected structural symmetry detected. CRC Blueprint recovered early."
        : source === "energy-threshold"
          ? "Stored Energy has crossed an impossible threshold. CRC Blueprint surfaced from protected memory."
          : "CRC Blueprint reconstructed.",
      "discovery"
    );
    this.notify();
  }

  canPurchaseAutoCalculator() {
    return (
      !this.state.devices.autoCalculator &&
      this.state.energy >= this.config.autoCalculator.cost
    );
  }

  canPurchaseSoftDataDisplay() {
    return (
      !this.state.devices.softDataDisplay &&
      this.state.energy >= this.config.softDataDisplay.cost
    );
  }

  purchaseSoftDataDisplay() {
    if (!this.canPurchaseSoftDataDisplay()) return false;
    this.state.energy -= this.config.softDataDisplay.cost;
    this.state.devices.softDataDisplay = true;
    this.addLog(
      "Soft Data Display restored. Production telemetry is now readable.",
      "device"
    );
    this.notify();
    return true;
  }

  purchaseAutoCalculator() {
    if (!this.canPurchaseAutoCalculator()) return false;
    this.state.energy -= this.config.autoCalculator.cost;
    this.state.devices.autoCalculator = true;
    this.addLog(
      "Auto Calculator connected. Algorithm Improvements are now automated.",
      "device"
    );
    if (!this.state.study.active) this.startStudy(true);
    this.notify();
    return true;
  }

  canConstructCrc() {
    return (
      this.state.discoveries.crcBlueprint &&
      !this.state.construction.active &&
      this.state.crcCount < this.config.crcConstruction.maximumCrcs &&
      this.state.energy >= this.config.crcConstruction.cost
    );
  }

  startCrcConstruction() {
    if (!this.canConstructCrc()) return false;
    this.state.energy -= this.config.crcConstruction.cost;
    this.state.construction.active = true;
    this.state.construction.elapsed = 0;
    this.state.construction.duration =
      this.config.crcConstruction.durationSeconds *
      (this.developmentMode
        ? this.config.development.durationMultiplier
        : 1);
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
    this.addLog(
      `Cosmic Radiation Condenser ${this.state.crcCount} is online.`,
      "discovery"
    );
    this.notify();
  }

  canPurchaseProcessor() {
    return (
      !this.state.devices.processor &&
      this.state.energy >= this.config.processor.cost
    );
  }

  purchaseProcessor() {
    if (!this.canPurchaseProcessor()) return false;
    this.state.energy -= this.config.processor.cost;
    this.state.devices.processor = true;
    this.state.prototypeComplete = true;
    this.addLog(
      "Processor online. Device execution time reduced by 10%.",
      "milestone"
    );
    this.notify();
    return true;
  }

  developmentAddEnergy() {
    if (!this.developmentMode) return;
    this.addEnergy(this.config.energy.powerCellCapacity * 0.25);
  }

  developmentCompleteStudy() {
    if (!this.developmentMode) return;
    if (!this.state.study.active) this.startStudy(false);
    this.completeStudy();
  }

  developmentForceBlueprint() {
    if (!this.developmentMode) return;
    this.discoverBlueprint("energy-threshold");
  }
}
