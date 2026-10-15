/**
 * EffectRegistry
 * Indexes effect definitions by targetStatId (N:N relationship).
 * Any layer can register effects modifying any statId without hardcoded switches.
 */

export class EffectRegistry {
  constructor() {
    this.effectsById = new Map();
    this.effectsByTarget = new Map();
  }

  register(effect) {
    if (!effect || !effect.id || !effect.targetStatId) {
      throw new Error("Effect must specify id and targetStatId");
    }

    if (this.effectsById.has(effect.id)) {
      this.unregister(effect.id);
    }

    this.effectsById.set(effect.id, effect);

    const target = effect.targetStatId;
    if (!this.effectsByTarget.has(target)) {
      this.effectsByTarget.set(target, []);
    }
    this.effectsByTarget.get(target).push(effect);
  }

  registerAll(effects) {
    for (const effect of effects) {
      this.register(effect);
    }
  }

  unregister(effectId) {
    const effect = this.effectsById.get(effectId);
    if (!effect) return false;

    this.effectsById.delete(effectId);
    const list = this.effectsByTarget.get(effect.targetStatId);
    if (list) {
      const index = list.findIndex((e) => e.id === effectId);
      if (index !== -1) {
        list.splice(index, 1);
      }
      if (list.length === 0) {
        this.effectsByTarget.delete(effect.targetStatId);
      }
    }
    return true;
  }

  getEffectsForTarget(targetStatId) {
    return this.effectsByTarget.get(targetStatId) ?? [];
  }

  getAllEffects() {
    return Array.from(this.effectsById.values());
  }

  getTargets() {
    return Array.from(this.effectsByTarget.keys());
  }

  clear() {
    this.effectsById.clear();
    this.effectsByTarget.clear();
  }
}

export const defaultEffectRegistry = new EffectRegistry();
