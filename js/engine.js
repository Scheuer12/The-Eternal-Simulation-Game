import { evaluateComponent } from "./availability.js";
import { big, bigMax, bigMin } from "./numeric.js";
import {
  evaluateSciencePerk,
  getSciencePerk,
  getSciencePerkStoredEnergyRequirement,
  SCIENCE_PERKS,
} from "./science-perks.js";
import {
  isAiCalculationSupportAutomationActive,
  isAutoCalculatorAutomationActive,
  isFiftyGCalculatorAutomationActive,
  setAutomationEnabled,
  unlockAutomation,
} from "./automations.js";
import {
  calculateAlgorithmUpgradeDuration,
  calculateAlgorithmUpgradeRequirement,
  calculateAlgorithmImprovementSpeedMultiplier,
  calculateBatchDuration,
  calculateBatchEnergy,
  calculateMaxBatchImprovements,
  calculateImprovementRatePerSecond,
  calculateBlueprintResearchDuration,
  calculateOverclockerBlueprintDuration,
  calculateDeviceDurationMultiplier,
  calculateEnergyOverflowDecay,
  calculateEffectiveEnergyGain,
  calculateImprovementBonus,
  calculateOverclockerDrainPerSecond,
  calculateParticleSynthesizerCost,
  calculateSciencePointReward,
  calculateProduction,
  calculateQuarksGenerated,
  calculateQuarkDecay,
  calculateStableEnergyCapacity,
  calculateStudyDuration,
  canResearchBlueprint,
  clamp,
} from "./formulas.js";
import { DEFAULT_NEWS, getNewsItem, selectNextNews } from "./news.js";

export class GameEngine {
  constructor({
    state,
    config,
    developmentMode = false,
    random = Math.random,
    collectEvents = false,
    suppressLogs = false,
    news = null,
  }) {
    this.state = state;
    this.config = config;
    this.developmentMode = developmentMode;
    this.random = random;
    this.collectEvents = collectEvents;
    this.suppressLogs = suppressLogs;
    this.news =
      Array.isArray(news) && news.length > 0
        ? news
        : globalThis.__TES_NEWS__ || DEFAULT_NEWS;
    this.events = [];
    this.listeners = new Set();

    if (this.state.ui && !this.state.ui.currentNewsId) {
      const initial = selectNextNews(this.news, null, this.random);
      if (initial) {
        this.state.ui.currentNewsId = initial.id;
      }
    }
  }

  getNewsList() {
    return this.news;
  }

  setNewsList(newsList) {
    if (Array.isArray(newsList) && newsList.length > 0) {
      this.news = newsList;
      if (!this.state.ui.currentNewsId) {
        const next = selectNextNews(this.news, null, this.random);
        if (next) this.state.ui.currentNewsId = next.id;
      }
    }
  }

  cycleNews(manual = false) {
    if (!this.news || this.news.length === 0) return;
    const next = selectNextNews(
      this.news,
      this.state.ui?.currentNewsId,
      this.random,
    );
    if (next && this.state.ui) {
      this.state.ui.currentNewsId = next.id;
      this.state.ui.newsTimer = 0;
      if (manual) this.notify();
    }
  }

  dismissNewsSection() {
    if (this.state.ui) {
      this.state.ui.newsDismissed = true;
      this.notify();
    }
  }

  restoreNewsSection() {
    if (this.state.ui) {
      this.state.ui.newsDismissed = false;
      this.notify();
    }
  }

  toggleNewsSection() {
    if (this.state.ui) {
      this.state.ui.newsDismissed = !this.state.ui.newsDismissed;
      this.notify();
    }
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
      ...payload,
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
      at: this.state.stats.runPlayTime,
    });
    this.state.log = this.state.log.slice(0, 60);
  }

  recordHistory({ eventId, kind = "Narrative", title, summary, body }) {
    if (!this.state.history) {
      this.state.history = [];
    }
    const id = eventId;
    if (this.state.history.some((e) => (e.id || e.eventId) === id)) {
      return;
    }
    const entry = {
      id,
      eventId: id,
      kind,
      title,
      summary,
      body: body || summary,
      timestamp: Date.now(),
      runPlayTime: this.state.stats.runPlayTime,
      seenAt: Date.now(),
    };
    this.state.history.unshift(entry);
  }

  openHistoryEntry(id) {
    if (!this.state.history) return false;
    const entry = this.state.history.find((e) => (e.id || e.eventId) === id);
    if (!entry) return false;
    this.state.ui.historyModalEntry = entry;
    this.notify();
    return true;
  }

  closeHistoryModal() {
    if (!this.state.ui.historyModalEntry) return false;
    this.state.ui.historyModalEntry = null;
    this.notify();
    return true;
  }

  pressButton() {
    this.state.introState = "crc-briefing";
    this.recordHistory({
      eventId: "narrative-intro",
      kind: "Narrative",
      title: "The room has been waiting.",
      summary: "Dust hangs motionless in the air. A single button emits a faint blue pulse.",
      body: "Dust hangs motionless in the air. Every panel is dark, every instrument silent.\n\nAt the center of the chamber, a single button emits a faint blue pulse.\n\nYou cannot remember why you entered this place — only that something behind these walls was never meant to be forgotten.",
    });
    this.notify();
  }

  activateCrc() {
    this.state.introState = "active";
    this.recordHistory({
      eventId: "narrative-crc-awakening",
      kind: "Narrative",
      title: "The first machine wakes by pulling energy out of noise.",
      summary: "Cosmic Radiation Condenser online. Pulls background radiation into usable Stored Energy.",
      body: "The screen identifies the device as a Cosmic Radiation Condenser: a damaged instrument built to catch background cosmic radiation and compress it into usable Stored Energy.\n\nIts output is almost nothing at first. The facility expects you to improve the algorithm, not to operate the machine by hand.\n\nA Power Cell below the floor begins accepting charge. Every system you recover will either improve the condenser, automate the study cycle, or prepare the next layer of the facility.",
    });
    this.addLog(
      "Cosmic Radiation Condenser detected. Status: ONLINE.",
      "discovery",
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

  advanceTimersAndEnergy(tau) {
    if (tau <= 0) return;
    const production = calculateProduction(
      this.state,
      this.config,
      this.developmentMode,
    );
    this.advanceEnergy(production, tau);
    this.advanceNonEnergyTimers(tau);
  }

  advanceNonEnergyTimers(tau) {
    if (tau <= 0) return;
    this.decayQuarks(tau, false);
    this.drainOverclocker(tau, false);
    this.coolOverclocker(tau, false);
    this.tickBlueprintStudy(tau);
    this.tickOverclockerBlueprintStudy(tau);
    this.tickConstruction(tau);
  }

  advanceBatchEnergy(eBatch, dtBatch) {
    if (dtBatch <= 0) return;
    const overflowDecay = calculateEnergyOverflowDecay(
      this.state,
      this.config,
    );
    const netEnergy = bigMax(0, eBatch.sub(overflowDecay.mul(dtBatch)));
    const collected = calculateEffectiveEnergyGain(
      this.state,
      netEnergy,
      this.config,
    );

    this.state.energy = big(this.state.energy).add(collected);
    this.state.peakEnergy = bigMax(this.state.peakEnergy, this.state.energy);
    for (const perk of SCIENCE_PERKS) {
      const threshold = getSciencePerkStoredEnergyRequirement(
        perk,
        this.config,
      );
      if (threshold > 0 && this.state.energy.gte(threshold)) {
        this.state.science.revealedPerks[perk.id] = true;
      }
    }
    this.state.stats.totalEnergyCollected = big(
      this.state.stats.totalEnergyCollected,
    ).add(collected);
    this.emitEvent("energy-collected", { amount: collected });
  }

  tick(deltaSeconds) {
    if (this.state.introState !== "active") return;
    if (this.state.ui?.particleSynthesisModal) return;

    const delta = clamp(deltaSeconds, 0, this.config.timing.maximumTickSeconds);
    if (delta <= 0) return;

    this.state.stats.totalPlayTime += delta;
    this.state.stats.runPlayTime += delta;

    if (this.state.ui) {
      this.state.ui.newsTimer = (this.state.ui.newsTimer || 0) + delta;
      if (this.state.ui.newsTimer >= 10) {
        this.state.ui.newsTimer = 0;
        this.cycleNews(false);
      }
    }

    let remainingTime = delta;
    const maxSubSteps = 1000;
    let subStepCount = 0;

    while (remainingTime > 1e-9 && subStepCount < maxSubSteps) {
      subStepCount += 1;

      // 1. If Algorithm Upgrade study is active (running via 50G Calculator automation)
      if (this.state.algorithmUpgradeStudy?.active) {
        if (this.state.algorithmUpgradeStudy.automated !== true) {
          this.completeAlgorithmUpgrade("legacy-manual");
          continue;
        }

        const dur = this.state.algorithmUpgradeStudy.duration;
        const el = this.state.algorithmUpgradeStudy.elapsed;
        const tRem = Math.max(0, dur - el);
        const tau = Math.min(remainingTime, tRem);

        this.advanceTimersAndEnergy(tau);
        this.state.algorithmUpgradeStudy.elapsed += tau;

        if (this.state.algorithmUpgradeStudy.elapsed >= dur) {
          this.completeAlgorithmUpgrade("automated");
        }
        remainingTime -= tau;
        continue;
      }

      // 2. Check if automated AI Calculation Support can claim CMU
      if (
        isAiCalculationSupportAutomationActive(this.state) &&
        this.canClaimCalculationMethodUpgrade()
      ) {
        this.claimCalculationMethodUpgrade();
      }

      // 3. Check if automated Algorithm Upgrade should start (via 50G Calculator)
      if (
        isFiftyGCalculatorAutomationActive(this.state) &&
        this.canStartAlgorithmUpgradeStudy()
      ) {
        this.startAlgorithmUpgradeStudy({ automated: true });
        continue;
      }

      // 4. Algorithm Improvement study (manual or automated via Auto Calculators)
      if (!this.state.study.active && isAutoCalculatorAutomationActive(this.state)) {
        this.startNextAutomatedStudy();
      }

      if (this.state.study.active) {
        // Variable speed regime (Redundancy Elimination active and improvements < 100)
        const isVariableSpeed =
          Boolean(this.state.science?.perks?.redundancyElimination) &&
          this.state.improvements < 100;

        if (isVariableSpeed) {
          const dur = calculateStudyDuration(this.state, this.config, this.developmentMode);
          this.state.study.duration = dur;
          const tRem = Math.max(0, dur - this.state.study.elapsed);
          const tau = Math.min(remainingTime, tRem);

          this.advanceTimersAndEnergy(tau);
          this.state.study.elapsed += tau;

          if (this.state.study.elapsed >= dur) {
            this.completeStudy();
          }
          remainingTime -= tau;
          continue;
        }

        // Constant speed regime (I >= 100 or no Redundancy Elimination)
        let nLimit = Infinity;
        if (isFiftyGCalculatorAutomationActive(this.state)) {
          const req = calculateAlgorithmUpgradeRequirement(this.state, this.config);
          nLimit = Math.max(0, req - this.state.improvements);
          if (nLimit === 0) {
            this.startAlgorithmUpgradeStudy({ automated: true });
            continue;
          }
        }

        // Finish any pending partial study first
        if (this.state.study.elapsed > 0) {
          const dur = calculateStudyDuration(this.state, this.config, this.developmentMode);
          this.state.study.duration = dur;
          const tRem = Math.max(0, dur - this.state.study.elapsed);

          if (remainingTime < tRem) {
            this.advanceTimersAndEnergy(remainingTime);
            this.state.study.elapsed += remainingTime;
            remainingTime = 0;
            break;
          }

          this.advanceTimersAndEnergy(tRem);
          this.completeStudy();
          remainingTime -= tRem;
          continue;
        }

        // Now elapsed === 0: execute closed-form batching
        const j = this.state.improvements;
        const V = calculateAlgorithmImprovementSpeedMultiplier(this.state, this.config);
        const n = calculateMaxBatchImprovements(j, V, remainingTime, nLimit, this.config);

        if (n > 0) {
          const dtBatch = calculateBatchDuration(j, n, V, this.config).toNumber();
          const curProd = calculateProduction(this.state, this.config, this.developmentMode);
          const Q = curProd.div(1 + j);
          const eBatch = calculateBatchEnergy(j, n, V, Q, this.config);

          this.advanceBatchEnergy(eBatch, dtBatch);
          this.advanceNonEnergyTimers(dtBatch);

          this.state.improvements += n;
          this.state.improvementMultiplier = big(1 + this.state.improvements);
          this.emitEvent("algorithm-improvement-completed", {
            count: this.state.improvements,
            batchSize: n,
            elapsed: dtBatch,
          });
          this.checkBlueprintGuarantee();

          remainingTime -= dtBatch;

          if (
            isFiftyGCalculatorAutomationActive(this.state) &&
            this.canStartAlgorithmUpgradeStudy()
          ) {
            this.startAlgorithmUpgradeStudy({ automated: true });
            continue;
          }
        }

        // Leftover time after batching: partial progress into next study
        if (remainingTime > 1e-9) {
          const nextDur = calculateStudyDuration(this.state, this.config, this.developmentMode);
          this.state.study.active = true;
          this.state.study.elapsed = remainingTime;
          this.state.study.duration = nextDur;
          this.state.study.automated = isAutoCalculatorAutomationActive(this.state);

          this.advanceTimersAndEnergy(remainingTime);
          remainingTime = 0;
          break;
        }
      } else {
        // No study active or automated
        this.advanceTimersAndEnergy(remainingTime);
        remainingTime = 0;
        break;
      }
    }
  }

  addEnergy(amount, notify = true) {
    const collected = calculateEffectiveEnergyGain(
      this.state,
      amount,
      this.config,
    );

    this.state.energy = big(this.state.energy).add(collected);
    this.state.peakEnergy = bigMax(this.state.peakEnergy, this.state.energy);
    for (const perk of SCIENCE_PERKS) {
      const threshold = getSciencePerkStoredEnergyRequirement(
        perk,
        this.config,
      );
      if (threshold > 0 && this.state.energy.gte(threshold)) {
        this.state.science.revealedPerks[perk.id] = true;
      }
    }
    this.state.stats.totalEnergyCollected = big(
      this.state.stats.totalEnergyCollected,
    ).add(collected);
    if (collected.gt(0)) {
      this.emitEvent("energy-collected", { amount: collected });
    }

    if (notify) this.notify();
    return collected;
  }

  advanceEnergy(production, delta) {
    const capacity = calculateStableEnergyCapacity(this.state, this.config);
    const energyBeforeTick = big(this.state.energy);
    const collected = production.mul(delta);

    this.addEnergy(collected, false);
    const energyBeforeDecay = big(this.state.energy);
    if (energyBeforeDecay.lte(capacity)) return;

    // Solve E_next + decay(E_next) * dt = E_before_decay implicitly. The old
    // explicit Euler step overshot this very stiff nonlinear decay at high
    // output rates, deleting the entire overflow on every animation frame.
    let low = capacity;
    let high = energyBeforeDecay;
    const decayRate = this.config.energy.overflowDecayRate;
    const decayPower = this.config.energy.overflowDecayPower;

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const midpoint = low.add(high.sub(low).div(2));
      if (midpoint.eq(low) || midpoint.eq(high)) break;

      const overflowRatio = midpoint.sub(capacity).div(capacity);
      const decay = capacity
        .mul(decayRate)
        .mul(overflowRatio.pow(decayPower))
        .mul(delta);
      if (midpoint.add(decay).gt(energyBeforeDecay)) {
        high = midpoint;
      } else {
        low = midpoint;
      }
    }

    this.state.energy = low.add(high.sub(low).div(2));
    const decayed = energyBeforeDecay.sub(this.state.energy);
    if (decayed.gt(0)) {
      this.emitEvent("energy-decayed", { amount: decayed });
    }
    // Preserve the prior peak calculation semantics: transient generated
    // energy is still eligible for peak-energy unlocks before decay.
    this.state.peakEnergy = bigMax(
      this.state.peakEnergy,
      energyBeforeTick.add(collected),
    );
  }

  decayOverflowEnergy(delta, notify = true) {
    const capacity = calculateStableEnergyCapacity(this.state, this.config);
    if (big(this.state.energy).lte(capacity)) return big(0);

    const decay = bigMin(
      big(this.state.energy).sub(capacity),
      calculateEnergyOverflowDecay(this.state, this.config).mul(delta),
    );

    const overflow = big(this.state.energy).sub(capacity);
    // Avoid catastrophic cancellation when overflow dwarfs capacity: at large
    // magnitudes, energy - overflow rounds to zero instead of to capacity.
    this.state.energy = decay.gte(overflow)
      ? capacity
      : big(this.state.energy).sub(decay);
    if (decay.gt(0)) {
      this.emitEvent("energy-decayed", { amount: decay });
    }
    if (notify) this.notify();
    return decay;
  }

  decayQuarks(delta, notify = true) {
    const decayPerSecond = calculateQuarkDecay(this.state, this.config);
    if (decayPerSecond.lte(0)) return big(0);

    const decayed = bigMin(
      this.state.quarks.available,
      decayPerSecond.mul(delta),
    );

    this.state.quarks.available = bigMax(
      0,
      big(this.state.quarks.available).sub(decayed),
    );
    if (decayed.gt(0)) {
      this.emitEvent("quarks-decayed", { amount: decayed });
    }
    if (notify) this.notify();
    return decayed;
  }

  drainOverclocker(delta, notify = true) {
    if (
      this.state.devices.overclockers <= 0 ||
      !this.state.overclocker.active
    ) {
      return 0;
    }

    const stableCapacity = calculateStableEnergyCapacity(
      this.state,
      this.config,
    );
    const availableExcess = bigMax(
      0,
      big(this.state.energy).sub(stableCapacity),
    );
    if (availableExcess.lte(0)) {
      this.state.overclocker.active = false;
      this.refreshAlgorithmImprovementDuration();
      this.addLog(
        "Overclocker lost excess feed. Cooling sequence started.",
        "info",
      );
      if (notify) this.notify();
      return big(0);
    }

    const drain = big(
      calculateOverclockerDrainPerSecond(this.state, this.config),
    ).mul(delta);
    if (drain.lte(0)) return big(0);

    const consumed = bigMin(availableExcess, drain);
    this.state.energy = big(this.state.energy).sub(consumed);
    if (consumed.gt(0)) {
      this.emitEvent("overclocker-drained", { amount: consumed });
    }

    if (consumed.lt(drain) || this.state.energy.lte(stableCapacity)) {
      this.state.energy = bigMax(stableCapacity, this.state.energy);
      this.state.overclocker.active = false;
      this.refreshAlgorithmImprovementDuration();
      this.addLog(
        "Overclocker lost excess feed. Cooling sequence started.",
        "info",
      );
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
      delta / Math.max(coolingMultiplier, Number.EPSILON),
    );

    this.state.overclocker.activeSeconds = Math.max(
      0,
      this.state.overclocker.activeSeconds - cooling,
    );

    if (notify) this.notify();
    return cooling;
  }

  retimeActiveProgress(task, nextDuration) {
    if (!task.active || nextDuration <= 0) return;

    const progress =
      task.duration > 0 ? clamp(task.elapsed / task.duration, 0, 1) : 0;

    task.duration = nextDuration;
    task.elapsed = Math.min(task.duration, progress * task.duration);
  }

  calculateCrcConstructionDuration() {
    return (
      this.config.crcConstruction.durationSeconds *
      calculateDeviceDurationMultiplier(this.state, this.config) *
      (this.developmentMode ? this.state.devSettings.durationMultiplier : 1)
    );
  }

  refreshAlgorithmImprovementDuration() {
    this.retimeActiveProgress(
      this.state.study,
      calculateStudyDuration(this.state, this.config, this.developmentMode),
    );
  }

  refreshAllActiveDurations() {
    this.refreshAlgorithmImprovementDuration();
    this.retimeActiveProgress(
      this.state.algorithmUpgradeStudy,
      calculateAlgorithmUpgradeDuration(
        this.state,
        this.config,
        this.developmentMode,
      ),
    );
    this.retimeActiveProgress(
      this.state.blueprintStudy,
      calculateBlueprintResearchDuration(
        this.state,
        this.config,
        this.developmentMode,
      ),
    );
    this.retimeActiveProgress(
      this.state.construction,
      this.calculateCrcConstructionDuration(),
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
      this.developmentMode,
    );
    this.state.study.automated = automated;
    this.notify();
    return true;
  }

  tickStudy(delta) {
    if (!this.state.study.active) {
      this.startNextAutomatedStudy();
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
      this.state.calculationMethods,
    );

    this.state.improvements += 1;
    this.state.improvementMultiplier = big(1 + this.state.improvements);
    this.state.study.active = false;
    this.state.study.elapsed = 0;
    this.emitEvent("algorithm-improvement-completed", {
      count: this.state.improvements,
      bonus,
    });

    if (!this.state.study.automated || this.state.improvements <= 5) {
      this.addLog(
        `Algorithm Improvement ${this.state.improvements} completed: +${(
          bonus * 100
        ).toFixed(2)}% efficiency.`,
      );
    }

    this.checkBlueprintGuarantee();

    if (isAutoCalculatorAutomationActive(this.state)) {
      this.startNextAutomatedStudy();
    } else {
      this.notify();
    }
  }

  startNextAutomatedStudy() {
    if (
      this.state.introState !== "active" ||
      !isAutoCalculatorAutomationActive(this.state) ||
      this.state.study.active ||
      this.state.algorithmUpgradeStudy.active
    ) {
      return false;
    }

    if (
      isAiCalculationSupportAutomationActive(this.state) &&
      this.canClaimCalculationMethodUpgrade()
    ) {
      this.claimCalculationMethodUpgrade();
      return this.startStudy(true);
    }

    if (
      isFiftyGCalculatorAutomationActive(this.state) &&
      this.canStartAlgorithmUpgradeStudy()
    ) {
      return this.startAlgorithmUpgradeStudy({ automated: true });
    }

    return this.startStudy(true);
  }

  checkBlueprintGuarantee() {
    if (
      canResearchBlueprint(this.state, this.config) &&
      this.state.discoveries.blueprintSource !== "research-available"
    ) {
      this.state.discoveries.blueprintSource = "research-available";
      this.addLog(
        "CRC Blueprint signal isolated. A short reconstruction pass is now available.",
        "discovery",
      );
      this.notify();
    }
  }

  completeBlueprintResearch(source = "research") {
    if (this.state.discoveries.crcBlueprint) return;
    this.state.discoveries.crcBlueprint = true;
    this.state.discoveries.blueprintSource = source;
    this.emitEvent("blueprint-research-completed", { source });
    this.recordHistory({
      eventId: "discovery-crc-blueprint",
      kind: "Discoveries",
      title: "CRC Blueprint Recovered",
      summary: "Specifications recovered for constructing additional Cosmic Radiation Condensers.",
      body: "The facility has reconstructed the fabrication plan for additional Cosmic Radiation Condensers. Each new condenser constructed provides an independent, passive energy gathering point.",
    });
    this.addLog(
      "CRC Blueprint reconstructed. New condensers can now be fabricated.",
      "discovery",
    );
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
      this.developmentMode,
    );
    this.addLog("CRC Blueprint research started.", "device");
    this.notify();
    return true;
  }

  tickBlueprintStudy(delta) {
    if (!this.state.blueprintStudy.active) return;
    this.state.blueprintStudy.elapsed += delta;
    if (
      this.state.blueprintStudy.elapsed < this.state.blueprintStudy.duration
    ) {
      return;
    }

    this.state.blueprintStudy.active = false;
    this.state.blueprintStudy.elapsed = 0;
    this.completeBlueprintResearch("research");
  }

  canStartOverclockerBlueprintResearch() {
    return evaluateComponent(
      "overclockerBlueprint",
      this.state,
      this.config,
    ).enabled;
  }

  startOverclockerBlueprintResearch() {
    if (!this.canStartOverclockerBlueprintResearch()) return false;
    this.state.overclockerBlueprintStudy.active = true;
    this.state.overclockerBlueprintStudy.elapsed = 0;
    this.state.overclockerBlueprintStudy.duration =
      calculateOverclockerBlueprintDuration(this.state, this.config);
    this.addLog("Overclocker Blueprint research started.", "device");
    this.notify();
    return true;
  }

  tickOverclockerBlueprintStudy(delta) {
    if (!this.state.overclockerBlueprintStudy?.active) return;
    this.state.overclockerBlueprintStudy.elapsed += delta;
    if (
      this.state.overclockerBlueprintStudy.elapsed <
      this.state.overclockerBlueprintStudy.duration
    ) {
      return;
    }

    this.completeOverclockerBlueprintResearch();
  }

  completeOverclockerBlueprintResearch() {
    this.state.overclockerBlueprintStudy.active = false;
    this.state.overclockerBlueprintStudy.elapsed = 0;
    this.state.discoveries.overclockerBlueprint = true;
    this.emitEvent("blueprint-completed", { device: "overclocker" });
    this.recordHistory({
      eventId: "discovery-overclocker-blueprint",
      kind: "Discoveries",
      title: "Overclocker Blueprint Recovered",
      summary: "Thermal routing plan recovered for overclocking calculator arrays.",
      body: "Analysis of processor routing channels reveals an overclocking pathway. Excessive Stored Energy can be burned to dramatically accelerate Auto Calculator speed.",
    });
    this.addLog(
      "Overclocker Blueprint research completed. Overclocker construction unlocked.",
      "discovery",
    );
    this.notify();
  }

  canPurchaseAutoCalculator() {
    return evaluateComponent("autoCalculator", this.state, this.config).enabled;
  }

  canPurchaseSoftDataDisplay() {
    return evaluateComponent("softDataDisplay", this.state, this.config)
      .enabled;
  }

  canPurchaseT2SoftDataDisplay() {
    return evaluateComponent("t2SoftDataDisplay", this.state, this.config)
      .enabled;
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

    this.state.energy = big(this.state.energy).sub(cost);
    this.state.powerCells += 1;
    this.emitEvent("device-purchased", {
      device: "powerCell",
      count: this.state.powerCells,
      cost,
    });
    this.addLog(
      `Power Cell ${this.state.powerCells} stabilized. Energy capacity expanded.`,
      "device",
    );
    this.notify();
    return true;
  }

  purchasePowerCells(amount = 1) {
    if (amount === "max") {
      return this.purchaseMaxPowerCells();
    }
    const count = typeof amount === "number" ? amount : parseInt(amount, 10) || 1;
    if (count <= 1) {
      return this.purchasePowerCell() ? 1 : 0;
    }
    let totalCost = big(0);
    for (let i = 0; i < count; i++) {
      totalCost = totalCost.add(
        calculatePowerCellCost(
          { ...this.state, powerCells: this.state.powerCells + i },
          this.config,
        ),
      );
    }
    if (big(this.state.energy).lt(totalCost)) return 0;
    this.state.energy = big(this.state.energy).sub(totalCost);
    this.state.powerCells += count;
    this.emitEvent("device-purchased", {
      device: "powerCell",
      count,
      cost: totalCost,
    });
    this.addLog(`Power Cell Array expanded by ${count} cells.`, "device");
    this.notify();
    return count;
  }

  purchaseMaxPowerCells(maxPurchases = 100000) {
    let purchased = 0;

    while (purchased < maxPurchases) {
      const availability = evaluateComponent(
        "powerCell",
        this.state,
        this.config,
      );
      if (
        !availability.enabled ||
        big(availability.cost).lte(0) ||
        big(this.state.energy).lt(availability.cost)
      ) {
        break;
      }

      this.state.energy = big(this.state.energy).sub(availability.cost);
      this.state.powerCells += 1;
      purchased += 1;
      this.emitEvent("device-purchased", {
        device: "powerCell",
        count: this.state.powerCells,
        cost: availability.cost,
      });
    }

    if (purchased <= 0) return 0;

    this.addLog(
      `Power Cell Array expanded. ${purchased} cells stabilized.`,
      "device",
    );
    this.notify();
    return purchased;
  }

  purchasePowerModule() {
    if (!this.canPurchasePowerModule()) return false;
    const availability = evaluateComponent(
      "powerModule",
      this.state,
      this.config,
    );

    this.state.energy = big(this.state.energy).sub(availability.cost);
    this.state.powerModules += 1;
    this.emitEvent("device-purchased", {
      device: "powerModule",
      count: this.state.powerModules,
      cost: availability.cost,
    });
    this.addLog(
      `Power Module ${this.state.powerModules} synchronized. Cell conduction capacity increased.`,
      "device",
    );
    this.notify();
    return true;
  }

  purchasePowerModules(amount = 1) {
    const count = typeof amount === "number" ? amount : parseInt(amount, 10) || 1;
    let purchased = 0;
    const maxIterations = amount === "max" ? 1000 : count;
    for (let i = 0; i < maxIterations; i++) {
      if (!this.canPurchasePowerModule()) break;
      const availability = evaluateComponent("powerModule", this.state, this.config);
      if (big(this.state.energy).lt(availability.cost)) break;
      this.state.energy = big(this.state.energy).sub(availability.cost);
      this.state.powerModules += 1;
      purchased++;
    }
    if (purchased > 0) {
      this.emitEvent("device-purchased", {
        device: "powerModule",
        count: this.state.powerModules,
      });
      this.addLog(`${purchased} Power Module(s) synchronized.`, "device");
      this.notify();
    }
    return purchased;
  }

  purchaseSoftDataDisplay() {
    if (!this.canPurchaseSoftDataDisplay()) return false;
    const cost = evaluateComponent(
      "softDataDisplay",
      this.state,
      this.config,
    ).cost;
    this.state.energy = big(this.state.energy).sub(cost);
    this.state.devices.softDataDisplay = true;
    this.emitEvent("device-purchased", {
      device: "softDataDisplay",
      count: 1,
      cost,
    });
    this.recordHistory({
      eventId: "discovery-soft-display",
      kind: "Discoveries",
      title: "Soft Data Display Restored",
      summary: "Production telemetry and flow dynamics unlocked. Buy 10 enabled.",
      body: "The primary monitoring display flickers to life. Real-time net flow, overflow decay rates, and stable cell thresholds are now legible across all facility sectors.",
    });
    this.addLog(
      "Soft Display restored. Production telemetry is now readable.",
      "device",
    );
    this.notify();
    return true;
  }

  purchaseT2SoftDataDisplay() {
    if (!this.canPurchaseT2SoftDataDisplay()) return false;
    const cost = evaluateComponent(
      "t2SoftDataDisplay",
      this.state,
      this.config,
    ).cost;
    this.state.energy = big(this.state.energy).sub(cost);
    this.state.devices.t2SoftDataDisplay = true;
    this.emitEvent("device-purchased", {
      device: "t2SoftDataDisplay",
      count: 1,
      cost,
    });
    this.recordHistory({
      eventId: "discovery-t2-soft-display",
      kind: "Discoveries",
      title: "T2 Soft Data Display Restored",
      summary: "Output composition and mathematical trace unlocked. Buy Max enabled.",
      body: "The auxiliary analysis matrix decodes high-frequency resonance patterns. Production breakdowns and multi-factor mathematical traces can now be inspected directly.",
    });
    this.addLog(
      "T2 Soft Display restored. Condenser output composition is now readable.",
      "device",
    );
    this.notify();
    return true;
  }

  purchaseOverclocker() {
    if (!this.canPurchaseOverclocker()) return false;
    const cost = evaluateComponent("overclocker", this.state, this.config).cost;
    this.state.energy = big(this.state.energy).sub(cost);
    this.state.devices.overclockers += 1;
    this.state.overclocker.active = false;
    this.emitEvent("device-purchased", {
      device: "overclocker",
      count: this.state.devices.overclockers,
      cost,
    });
    this.addLog(
      `Overclocker ${this.state.devices.overclockers} installed. Stored Energy can now be burned to force faster calculations.`,
      "device",
    );
    this.refreshAlgorithmImprovementDuration();
    this.notify();
    return true;
  }

  purchaseOverclockers(amount = 1) {
    const count = typeof amount === "number" ? amount : parseInt(amount, 10) || 1;
    let purchased = 0;
    const maxIterations = amount === "max" ? 1000 : count;
    for (let i = 0; i < maxIterations; i++) {
      if (!this.canPurchaseOverclocker()) break;
      const cost = evaluateComponent("overclocker", this.state, this.config).cost;
      if (big(this.state.energy).lt(cost)) break;
      this.state.energy = big(this.state.energy).sub(cost);
      this.state.devices.overclockers += 1;
      this.state.overclocker.active = false;
      purchased++;
    }
    if (purchased > 0) {
      this.emitEvent("device-purchased", {
        device: "overclocker",
        count: this.state.devices.overclockers,
      });
      this.addLog(`${purchased} Overclocker(s) installed.`, "device");
      this.refreshAlgorithmImprovementDuration();
      this.notify();
    }
    return purchased;
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
      big(this.state.energy).lte(
        calculateStableEnergyCapacity(this.state, this.config),
      )
    ) {
      return false;
    }

    this.state.overclocker.active = true;
    this.refreshAlgorithmImprovementDuration();
    this.addLog(
      "Overclocker engaged. Auto Calculator speed increased.",
      "device",
    );
    this.notify();
    return true;
  }

  purchaseAutoCalculator() {
    if (!this.canPurchaseAutoCalculator()) return false;
    const cost = evaluateComponent(
      "autoCalculator",
      this.state,
      this.config,
    ).cost;

    this.state.energy = big(this.state.energy).sub(cost);
    this.state.devices.autoCalculators += 1;
    unlockAutomation(this.state, "autoCalculator");
    this.emitEvent("device-purchased", {
      device: "autoCalculator",
      count: this.state.devices.autoCalculators,
      cost,
    });
    if (this.state.study.active && isAutoCalculatorAutomationActive(this.state)) {
      this.state.study.automated = true;
      this.refreshAlgorithmImprovementDuration();
    }
    this.addLog(
      `Auto Calculator ${this.state.devices.autoCalculators} connected. Study automation improved.`,
      "device",
    );
    if (!this.state.study.active) this.startNextAutomatedStudy();
    this.notify();
    return true;
  }

  purchaseAutoCalculators(amount = 1) {
    const count = typeof amount === "number" ? amount : parseInt(amount, 10) || 1;
    let purchased = 0;
    const maxIterations = amount === "max" ? 1000 : count;
    for (let i = 0; i < maxIterations; i++) {
      if (!this.canPurchaseAutoCalculator()) break;
      const cost = evaluateComponent("autoCalculator", this.state, this.config).cost;
      if (big(this.state.energy).lt(cost)) break;
      this.state.energy = big(this.state.energy).sub(cost);
      this.state.devices.autoCalculators += 1;
      unlockAutomation(this.state, "autoCalculator");
      purchased++;
    }
    if (purchased > 0) {
      this.emitEvent("device-purchased", {
        device: "autoCalculator",
        count: this.state.devices.autoCalculators,
      });
      if (this.state.study.active && isAutoCalculatorAutomationActive(this.state)) {
        this.state.study.automated = true;
        this.refreshAlgorithmImprovementDuration();
      }
      this.addLog(`${purchased} Auto Calculator(s) connected.`, "device");
      if (!this.state.study.active) this.startNextAutomatedStudy();
      this.notify();
    }
    return purchased;
  }

  toggleAutomation(id, enabled) {
    const nextEnabled =
      typeof enabled === "boolean"
        ? enabled
        : this.state.automations?.enabled?.[id] === false;
    if (!setAutomationEnabled(this.state, id, nextEnabled)) return false;
    if (nextEnabled) this.startNextAutomatedStudy();
    this.notify();
    return true;
  }

  canConstructCrc() {
    return evaluateComponent("crcConstruction", this.state, this.config)
      .enabled;
  }

  startCrcConstruction() {
    if (!this.canConstructCrc()) return false;
    const cost = evaluateComponent(
      "crcConstruction",
      this.state,
      this.config,
    ).cost;
    this.state.energy = big(this.state.energy).sub(cost);
    this.state.construction.active = true;
    this.state.construction.elapsed = 0;
    this.state.construction.duration = this.calculateCrcConstructionDuration();
    this.emitEvent("construction-started", {
      device: "crc",
      cost,
    });
    this.addLog("CRC construction sequence initiated.", "device");
    this.notify();
    return true;
  }

  tickConstruction(delta) {
    if (!this.state.construction.active) return;
    this.state.construction.elapsed += delta;

    if (this.state.construction.elapsed < this.state.construction.duration) {
      return;
    }

    this.state.construction.active = false;
    this.state.construction.elapsed = 0;
    this.state.crcCount += 1;
    this.emitEvent("construction-completed", {
      device: "crc",
      count: this.state.crcCount,
    });
    this.addLog(
      `Cosmic Radiation Condenser ${this.state.crcCount} is online.`,
      "discovery",
    );
    this.notify();
  }

  canPurchaseProcessor() {
    return evaluateComponent("processor", this.state, this.config).enabled;
  }

  purchaseProcessor() {
    if (!this.canPurchaseProcessor()) return false;
    const cost = evaluateComponent("processor", this.state, this.config).cost;

    this.state.energy = big(this.state.energy).sub(cost);
    this.state.devices.processors += 1;
    if (!this.state.prototypeComplete) {
      this.state.prototypeComplete = true;
      if (this.state.ui) {
        this.state.ui.newsDismissed = false;
        this.state.ui.currentNewsId = "processing_network_online";
      }
    }
    this.emitEvent("device-purchased", {
      device: "processor",
      count: this.state.devices.processors,
      cost,
    });
    this.refreshAlgorithmImprovementDuration();
    this.retimeActiveProgress(
      this.state.construction,
      this.calculateCrcConstructionDuration(),
    );
    this.addLog(
      `Processor ${this.state.devices.processors} online. Device execution time reduced.`,
      "milestone",
    );
    this.notify();
    return true;
  }

  purchaseProcessors(amount = 1) {
    const count = typeof amount === "number" ? amount : parseInt(amount, 10) || 1;
    let purchased = 0;
    const maxIterations = amount === "max" ? 1000 : count;
    for (let i = 0; i < maxIterations; i++) {
      if (!this.canPurchaseProcessor()) break;
      const cost = evaluateComponent("processor", this.state, this.config).cost;
      if (big(this.state.energy).lt(cost)) break;
      this.state.energy = big(this.state.energy).sub(cost);
      this.state.devices.processors += 1;
      if (!this.state.prototypeComplete) {
        this.state.prototypeComplete = true;
        if (this.state.ui) {
          this.state.ui.newsDismissed = false;
          this.state.ui.currentNewsId = "processing_network_online";
        }
      }
      purchased++;
    }
    if (purchased > 0) {
      this.emitEvent("device-purchased", {
        device: "processor",
        count: this.state.devices.processors,
      });
      this.refreshAlgorithmImprovementDuration();
      this.retimeActiveProgress(
        this.state.construction,
        this.calculateCrcConstructionDuration(),
      );
      this.addLog(`${purchased} Processor(s) integrated.`, "device");
      this.notify();
    }
    return purchased;
  }

  canStartAlgorithmUpgradeStudy() {
    return evaluateComponent("algorithmUpgrade", this.state, this.config)
      .enabled;
  }

  startAlgorithmUpgradeStudy(options = {}) {
    const automated =
      typeof options === "boolean" ? options : Boolean(options.automated);
    if (!this.canStartAlgorithmUpgradeStudy()) return false;

    if (!automated) {
      this.completeAlgorithmUpgrade("manual");
      return true;
    }

    this.state.algorithmUpgradeStudy.active = true;
    this.state.algorithmUpgradeStudy.elapsed = 0;
    this.state.algorithmUpgradeStudy.automated = true;
    this.state.algorithmUpgradeStudy.duration =
      calculateAlgorithmUpgradeDuration(
        this.state,
        this.config,
        this.developmentMode,
      );
    this.addLog("Automated Algorithm Upgrade study started.", "device");
    this.notify();
    return true;
  }

  tickAlgorithmUpgradeStudy(delta) {
    if (!this.state.algorithmUpgradeStudy.active) return;

    // Saves created before manual Upgrades became instant do not have this flag.
    // Their active study can only be a legacy manual run, so complete it now.
    if (this.state.algorithmUpgradeStudy.automated !== true) {
      this.completeAlgorithmUpgrade("legacy-manual");
      return;
    }

    this.state.algorithmUpgradeStudy.elapsed += delta;
    if (
      this.state.algorithmUpgradeStudy.elapsed <
      this.state.algorithmUpgradeStudy.duration
    ) {
      return;
    }

    this.completeAlgorithmUpgrade();
  }

  completeAlgorithmUpgrade(source = "automated") {
    this.state.algorithmUpgradeStudy.active = false;
    this.state.algorithmUpgradeStudy.elapsed = 0;
    this.state.algorithmUpgradeStudy.duration = 0;
    this.state.algorithmUpgradeStudy.automated = false;
    this.state.upgrades += 1;
    this.resetAlgorithmImprovements();
    this.emitEvent("algorithm-upgrade-completed", {
      count: this.state.upgrades,
    });
    this.addLog(
      `Algorithm Upgrade ${this.state.upgrades} completed. CRC production doubled and Improvements were reset.`,
      "milestone",
    );
    if (isAutoCalculatorAutomationActive(this.state)) {
      this.startNextAutomatedStudy();
    }
    this.notify();
  }

  canClaimCalculationMethodUpgrade() {
    return evaluateComponent(
      "calculationMethodUpgrade",
      this.state,
      this.config,
    ).enabled;
  }

  claimCalculationMethodUpgrade() {
    if (!this.canClaimCalculationMethodUpgrade()) return false;

    this.state.calculationMethods += 1;
    this.resetAllStudies();
    this.emitEvent("calculation-method-upgraded", {
      count: this.state.calculationMethods,
    });
    this.recordHistory({
      eventId: `milestone-cmu-${this.state.calculationMethods}`,
      kind: "Milestones",
      title: `Calculation Method Upgrade #${this.state.calculationMethods}`,
      summary: `Processor bonus amplified by 1.2^${this.state.calculationMethods}. Studies reset.`,
      body: `The facility's fundamental mathematical frameworks have been re-engineered. All Processors now achieve a 1.2^${this.state.calculationMethods} scaling multiplier across all calculation tasks.`,
    });
    this.addLog(
      `Calculation Method Upgrade ${this.state.calculationMethods} completed. Improvement penalty scaling reduced.`,
      "milestone",
    );
    this.notify();
    return true;
  }

  openCalculationMethodUpgradeConfirmation() {
    if (!this.canClaimCalculationMethodUpgrade()) return false;
    this.state.ui.resetModal = "cmu";
    this.notify();
    return true;
  }

  confirmCalculationMethodUpgrade() {
    if (this.state.ui.resetModal !== "cmu") return false;
    this.state.ui.resetModal = null;
    return this.claimCalculationMethodUpgrade();
  }

  canClaimSetupOptimization() {
    return evaluateComponent("setupOptimization", this.state, this.config)
      .enabled;
  }

  openSetupOptimizationConfirmation() {
    if (!this.canClaimSetupOptimization()) return false;
    this.state.ui.resetModal = "setup";
    this.notify();
    return true;
  }

  confirmSetupOptimization() {
    if (this.state.ui.resetModal !== "setup") return false;
    this.state.ui.resetModal = null;
    return this.claimSetupOptimization();
  }

  canActivateParticleSynthesizer() {
    return evaluateComponent("particleSynthesizer", this.state, this.config)
      .enabled;
  }

  openParticleSynthesisConfirmation() {
    if (!this.canActivateParticleSynthesizer()) return false;
    this.state.ui.particleSynthesisModal = "confirm";
    this.state.ui.resetModal = "synthesis";
    this.notify();
    return true;
  }

  closeParticleSynthesisModal() {
    this.state.ui.particleSynthesisModal = null;
    this.state.ui.resetModal = null;
    this.notify();
    return true;
  }

  closeResetModal() {
    return this.closeParticleSynthesisModal();
  }

  confirmParticleSynthesis() {
    if (
      this.state.ui.particleSynthesisModal !== "confirm" &&
      this.state.ui.resetModal !== "synthesis"
    ) {
      return false;
    }
    this.state.ui.resetModal = null;
    return this.activateParticleSynthesizer({ showNarrative: true });
  }

  getResetPreview(resetType) {
    if (resetType === "cmu") {
      const nextCMU = this.state.calculationMethods + 1;
      const studyRunning = Boolean(
        this.state.study?.active ||
          this.state.algorithmUpgradeStudy?.active ||
          this.state.blueprintStudy?.active ||
          this.state.overclockerBlueprintStudy?.active,
      );
      return {
        type: "cmu",
        title: "Confirm Calculation Method Upgrade",
        gain: `Calculation Method Upgrade ${this.state.calculationMethods} → ${nextCMU} (Processor unit bonus × 1.2)`,
        lost: "Resets Algorithm Improvements (I → 0), Algorithm Upgrades (U → 0), active studies, and blueprint research.",
        preserved:
          "Preserves Power Cells, Power Modules, CRCs, Auto Calculators, Processors, Overclockers, and Stored Energy.",
        warnings: studyRunning
          ? "Warning: A research study or blueprint reconstruction is currently active and will be aborted!"
          : null,
        isEligible: this.canClaimCalculationMethodUpgrade(),
      };
    }

    if (resetType === "setup") {
      const nextSetup = this.state.setupOptimizations + 1;
      const currentD = 1 + 2 * Math.log(1 + this.state.setupOptimizations);
      const nextD = 1 + 2 * Math.log(1 + nextSetup);
      return {
        type: "setup",
        title: "Confirm Setup Optimization",
        gain: `Setup Optimization ${this.state.setupOptimizations} → ${nextSetup} (Device performance D(S): ${currentD.toFixed(2)} → ${nextD.toFixed(2)})`,
        lost: "HARD RESET: Stored Energy resets to 0. Resets CRCs to 1, Auto Calculators to 0, Processors to 0, Overclockers to 0, studies, and CMUs to 0.",
        preserved:
          "Preserves Power Cells, Science Points, Quarks, Science Perks, and History.",
        warnings:
          "High-impact Hard Reset! Lower Energy Layer machinery and accumulated Stored Energy will be cleared.",
        isEligible: this.canClaimSetupOptimization(),
      };
    }

    if (resetType === "synthesis") {
      const activationCost = calculateParticleSynthesizerCost(
        this.state,
        this.config,
      );
      const spReward = calculateSciencePointReward(
        this.state.energy,
        this.state.science?.totalScienceEarned ?? 0,
        this.config,
      );
      const quarksReward = calculateQuarksGenerated(
        this.state.energy,
        this.config,
      );
      return {
        type: "synthesis",
        title: "Confirm Particle Synthesis",
        gain: `+${spReward} Science Point${spReward === 1 ? "" : "s"} and +${quarksReward} Quarks`,
        lost: "FULL RESET of the Energy Layer: Stored Energy, Power Cells, Power Modules, CRCs, Auto Calculators, Processors, Overclockers, studies, CMUs, and Setup Optimizations.",
        preserved:
          "Preserves Science Points, Quarks, Science Perks, and History.",
        warnings:
          "Complete reset of all physical devices, power cells, and stored energy.",
        isEligible: this.canActivateParticleSynthesizer(),
        activationCost,
        spReward,
        quarksReward,
      };
    }

    return null;
  }

  activateParticleSynthesizer({ showNarrative = false } = {}) {
    if (!this.canActivateParticleSynthesizer()) return false;
    const firstSynthesis = this.state.science.syntheses === 0;
    const activationCost = calculateParticleSynthesizerCost(
      this.state,
      this.config,
    );
    if (big(this.state.energy).lt(activationCost)) return false;
    const energyAtSynthesis = big(this.state.energy);
    const sciencePointsGained = calculateSciencePointReward(
      energyAtSynthesis,
      this.state.science.totalScienceEarned,
      this.config,
    );
    const quarksGenerated = calculateQuarksGenerated(
      energyAtSynthesis,
      this.config,
    );

    this.state.energy = big(this.state.energy).sub(activationCost);
    this.state.sciencePoints += sciencePointsGained;
    this.state.science.syntheses += 1;
    this.state.science.totalScienceEarned += sciencePointsGained;
    this.state.quarks.available = big(this.state.quarks.available).add(
      quarksGenerated,
    );
    this.state.quarks.totalEarned = big(this.state.quarks.totalEarned).add(
      quarksGenerated,
    );
    this.state.quarks.lastSynthesis = quarksGenerated;
    this.emitEvent("particle-synthesizer-activated", {
      cost: activationCost,
      energyAtSynthesis,
      sciencePoints: sciencePointsGained,
      quarksGenerated,
    });
    this.resetEnergyLayerForSynthesis();
    this.recordHistory({
      eventId: `milestone-synthesis-${this.state.science.syntheses}`,
      kind: firstSynthesis ? "Narrative" : "Milestones",
      title: firstSynthesis
        ? "First Particle Synthesis"
        : `Particle Synthesis #${this.state.science.syntheses}`,
      summary: `Full Energy Layer reset yielding ${sciencePointsGained} SP and ${quarksGenerated} Quarks.`,
      body: "The laboratory rings ignite in sequence. For a fraction of a second, the entire facility feeds one impossible concentration of energy into the central chamber.\n\nA new signature appears on the display. Then the Synthesizer overloads. Protection circuits sever every route at once, and the facility falls dark.\n\nWhen the first condenser returns, something survived the collapse: preserved scientific knowledge and the quarks formed during synthesis.",
    });
    this.state.ui.particleSynthesisModal =
      showNarrative && firstSynthesis ? "narrative" : null;
    this.state.ui.resetModal = null;
    this.addLog(
      `Particle Synthesizer activated. ${sciencePointsGained} Science Points and ${quarksGenerated} quarks preserved through a full Energy Layer reset.`,
      "milestone",
    );
    this.notify();
    return true;
  }

  canPurchaseQuarkCage() {
    return evaluateComponent("quarkCage", this.state, this.config).enabled;
  }

  purchaseQuarkCage() {
    if (!this.canPurchaseQuarkCage()) return false;
    const cost = evaluateComponent("quarkCage", this.state, this.config).cost;

    this.state.energy = big(this.state.energy).sub(cost);
    this.state.scienceDevices.quarkCages += 1;
    this.emitEvent("device-purchased", {
      device: "quarkCage",
      count: this.state.scienceDevices.quarkCages,
      cost,
    });
    this.addLog(
      `Quarks Cage ${this.state.scienceDevices.quarkCages} stabilized. Safe quark containment increased.`,
      "device",
    );
    this.notify();
    return true;
  }

  purchaseQuarkCages(amount = 1) {
    const count = typeof amount === "number" ? amount : parseInt(amount, 10) || 1;
    let purchased = 0;
    const maxIterations = amount === "max" ? 1000 : count;
    for (let i = 0; i < maxIterations; i++) {
      if (!this.canPurchaseQuarkCage()) break;
      const cost = evaluateComponent("quarkCage", this.state, this.config).cost;
      if (big(this.state.energy).lt(cost)) break;
      this.state.energy = big(this.state.energy).sub(cost);
      this.state.scienceDevices.quarkCages += 1;
      purchased++;
    }
    if (purchased > 0) {
      this.emitEvent("device-purchased", {
        device: "quarkCage",
        count: this.state.scienceDevices.quarkCages,
      });
      this.addLog(`${purchased} Quarks Cage(s) stabilized.`, "device");
      this.notify();
    }
    return purchased;
  }

  canPurchaseFiftyGCalculator() {
    return evaluateSciencePerk("fiftyGCalculator", this.state, this.config)
      .canPurchase;
  }

  purchaseFiftyGCalculator() {
    if (!this.canPurchaseFiftyGCalculator()) return false;
    const cost = evaluateComponent(
      "fiftyGCalculator",
      this.state,
      this.config,
    ).cost;

    this.state.sciencePoints -= cost;
    this.state.science.fiftyGCalculator = true;
    unlockAutomation(this.state, "fiftyGCalculator");
    this.emitEvent("science-upgrade-purchased", {
      upgrade: "fiftyGCalculator",
      cost,
    });
    this.addLog(
      "50G Calculator acquired. Auto Calculators now run timed Algorithm Upgrade studies when their requirements are met.",
      "milestone",
    );
    this.startNextAutomatedStudy();
    this.notify();
    return true;
  }

  canPurchaseSciencePerk(perkId) {
    const perk = getSciencePerk(perkId);
    if (!perk || perkId === "fiftyGCalculator") {
      return false;
    }
    return evaluateSciencePerk(perkId, this.state, this.config).canPurchase;
  }

  purchaseSciencePerk(perkId) {
    if (perkId === "fiftyGCalculator") return this.purchaseFiftyGCalculator();
    if (!this.canPurchaseSciencePerk(perkId)) return false;

    const { cost, perk } = evaluateSciencePerk(perkId, this.state, this.config);
    this.state.sciencePoints -= cost;
    this.state.science.perks[perkId] = true;
    if (perkId === "aiCalculationSupport") {
      unlockAutomation(this.state, "aiCalculationSupport");
    }
    if (perkId === "redundancyElimination") {
      this.refreshAlgorithmImprovementDuration();
    }
    this.emitEvent("science-upgrade-purchased", { upgrade: perkId, cost });
    this.addLog(`${perk.name} acquired.`, "milestone");
    this.notify();
    return true;
  }

  buySciencePerk(perkId) {
    return this.purchaseSciencePerk(perkId);
  }

  resetSciencePointAllocation() {
    const totalScienceEarned = Math.max(
      0,
      this.state.science?.totalScienceEarned ?? 0,
    );
    const allocatedSciencePoints = Math.max(
      0,
      totalScienceEarned - (this.state.sciencePoints ?? 0),
    );
    if (allocatedSciencePoints <= 0) return false;

    this.state.sciencePoints = totalScienceEarned;
    this.state.science.fiftyGCalculator = false;
    this.state.science.perks = {};

    if (this.state.algorithmUpgradeStudy.active) {
      this.state.algorithmUpgradeStudy.active = false;
      this.state.algorithmUpgradeStudy.elapsed = 0;
      this.state.algorithmUpgradeStudy.duration = 0;
      this.state.algorithmUpgradeStudy.automated = false;
    }

    this.refreshAlgorithmImprovementDuration();
    if (
      isAutoCalculatorAutomationActive(this.state) &&
      !this.state.study.active
    ) {
      this.startNextAutomatedStudy();
    }

    this.emitEvent("science-points-reset", {
      refunded: allocatedSciencePoints,
    });
    this.addLog(
      `${allocatedSciencePoints} allocated Science Points returned for testing.`,
      "milestone",
    );
    this.notify();
    return true;
  }

  claimSetupOptimization() {
    if (!this.canClaimSetupOptimization()) return false;

    this.state.setupOptimizations += 1;
    this.resetHardwareForSetupOptimization();
    const D_S = 1 + 2 * Math.log(1 + this.state.setupOptimizations);
    this.emitEvent("setup-optimized", {
      count: this.state.setupOptimizations,
    });
    this.recordHistory({
      eventId: `milestone-setup-${this.state.setupOptimizations}`,
      kind: "Milestones",
      title: `Setup Optimization #${this.state.setupOptimizations}`,
      summary: `Lower energy layer reorganized. Device efficiency D(S) scaled to ${D_S.toFixed(2)}.`,
      body: `Lower energy layer physical infrastructure has been dismantled and re-architected. Power Cells and scientific progress are preserved while device performance scales to D(S) = 1 + 2 ln(1+S).`,
    });
    this.addLog(
      `Setup Optimization ${this.state.setupOptimizations} completed. Study time penalty scaling reduced.`,
      "milestone",
    );
    this.notify();
    return true;
  }

  resetAlgorithmImprovements() {
    this.state.improvements = 0;
    this.state.improvementMultiplier = big(1);
    this.state.preservedImprovementLog = big(0);
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
    this.state.algorithmUpgradeStudy.automated = false;
    this.state.blueprintStudy.active = false;
    this.state.blueprintStudy.elapsed = 0;
    this.state.blueprintStudy.duration = 0;
    if (this.state.overclockerBlueprintStudy) {
      this.state.overclockerBlueprintStudy.active = false;
      this.state.overclockerBlueprintStudy.elapsed = 0;
      this.state.overclockerBlueprintStudy.duration = 0;
    }
    this.state.discoveries.crcBlueprint = false;
    this.state.discoveries.overclockerBlueprint = false;
    this.state.discoveries.blueprintSource = null;
  }

  resetHardwareForSetupOptimization() {
    this.state.energy = big(0);
    this.state.peakEnergy = big(0);
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
    this.state.construction.active = false;
    this.state.construction.elapsed = 0;
    this.state.construction.duration = 0;
    this.state.prototypeComplete = false;
  }

  resetEnergyLayerForSynthesis() {
    this.state.energy = big(0);
    this.state.peakEnergy = big(0);
    this.state.powerCells = this.config.energy.initialPowerCells;
    this.state.powerModules = 0;
    this.resetAllStudies();
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
    this.state.construction.active = false;
    this.state.construction.elapsed = 0;
    this.state.construction.duration = 0;
    this.state.particleSynthesizer.activated = false;
    this.state.scienceDevices.quarkCages =
      this.config.science.quarkCage.startingCagesAfterSynthesis ?? 1;
    this.state.prototypeComplete = false;
    this.state.stats.runPlayTime = 0;
    this.state.ui.activeTab = "science";
    this.state.ui.activeScienceSubtab = "devices";
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
    this.addEnergy(bigMax(1, this.state.energy));
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
        this.config,
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

  startAlgorithmUpgrade(options = {}) {
    return this.startAlgorithmUpgradeStudy(options);
  }

  selectSciencePerk(perkId) {
    if (!this.state.ui) this.state.ui = {};
    this.state.ui.selectedSciencePerkId = perkId;
    this.notify();
  }

  setTreeZoom(zoom) {
    if (!this.state.ui) this.state.ui = {};
    this.state.ui.treeZoom = Math.min(2.0, Math.max(0.5, Number(zoom) || 1.0));
    this.notify();
  }

  setBuyMode(mode) {
    if (!this.state.ui) this.state.ui = {};
    this.state.ui.buyMode = String(mode);
    this.notify();
  }

  setHistoryFilter(filter) {
    if (!this.state.ui) this.state.ui = {};
    this.state.ui.historyFilter = String(filter);
    this.notify();
  }
}
