import { getDevelopmentProductionMultiplier } from "./formulas.js";
import { big } from "./numeric.js";

export function getProductionEffects(state, config, developmentMode = false) {
  const effects = [
    {
      id: "base-crc-production",
      label: "Base CRC signal",
      target: "crc.production",
      operation: "base",
      value: config.energy.baseProductionPerSecond
    },
    {
      id: "crc-count",
      label: "Active CRCs",
      target: "crc.production",
      operation: "multiply",
      value: state.crcCount
    },
    {
      id: "algorithm-improvements",
      label: "Algorithm Improvements",
      target: "crc.production",
      operation: "multiply",
      value: 1 + Math.max(0, state.improvements ?? 0)
    },
    {
      id: "algorithm-upgrades",
      label: "Algorithm Upgrades",
      target: "crc.production",
      operation: "multiply",
      value: big(config.algorithmUpgrade.productionMultiplier).pow(
        state.upgrades,
      )
    }
  ];

  if (developmentMode) {
    effects.push({
      id: "development-production",
      label: "Development multiplier",
      target: "crc.production",
      operation: "multiply",
      value: getDevelopmentProductionMultiplier(state, config)
    });
  }

  return effects;
}

export function applyProductionEffects(effects) {
  const base = effects.find((effect) => effect.operation === "base")?.value ?? 0;
  return effects
    .filter((effect) => effect.operation === "multiply")
    .reduce((value, effect) => value.mul(effect.value), big(base));
}
