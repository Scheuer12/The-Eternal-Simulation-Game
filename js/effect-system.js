/**
 * effect-system.js
 * Declarative effects for The Eternal Simulation (Rebuild specification).
 * Binds origins (Devices, Upgrades, Resets) to destination statIds via EffectRegistry.
 */

import { big } from "./numeric.js";
import { defaultEffectRegistry } from "./effect-registry.js";
import {
  calculateFacilityDeviceMultiplier,
  calculateProcessorDeviceMultiplier,
  calculateCapacitorMultiplier,
  calculateCrcMultiplier,
  calculateEffectiveStudySpeed,
} from "./formulas.js";

export function createStandardEffects(config = {}) {
  return [
    // 1. Facility Optimization multiplier on global device performance
    {
      id: "facility-optimization-multiplier",
      label: "Facility Optimization Multiplier",
      source: "facilityOptimization",
      targetStatId: "devices.globalMultiplier",
      operation: "multiply",
      value: (context) => {
        const H = context.state?.facilityOptimizations ?? 0;
        return calculateFacilityDeviceMultiplier(H, context.config ?? config);
      },
    },

    // 2. Processor multiplier on global device performance
    {
      id: "processor-device-multiplier",
      label: "Processor Device Multiplier",
      source: "processor",
      targetStatId: "devices.globalMultiplier",
      operation: "multiply",
      value: (context) => {
        const P = context.state?.devices?.processors ?? 0;
        return calculateProcessorDeviceMultiplier(P, context.config ?? config);
      },
    },

    // 3. CRC Gadget multiplier on CRC production
    {
      id: "crc-gadget-multiplier",
      label: "CRC Gadget Multiplier",
      source: "crcGadget",
      targetStatId: "devices.crc.multiplier",
      operation: "multiply",
      value: (context) => {
        const devMult = context.resolve
          ? context.resolve("devices.globalMultiplier")
          : 1.0;
        return calculateCrcMultiplier(context.state, context.config ?? config, devMult);
      },
    },

    // 4. Capacitor multiplier on A.Improvement energy contribution
    {
      id: "capacitor-aimp-multiplier",
      label: "Capacitor AImp Multiplier",
      source: "capacitor",
      targetStatId: "algorithms.AImp.capacitorMultiplier",
      operation: "base",
      value: (context) => {
        const devMult = context.resolve
          ? context.resolve("devices.globalMultiplier")
          : 1.0;
        const caps = context.state?.devices?.capacitors ?? 0;
        return calculateCapacitorMultiplier(caps, context.config ?? config, devMult);
      },
    },

    // 5. Study speeds for AImp, AUpg, ARec
    {
      id: "study-speed-aimp",
      label: "A.Improvement Study Speed",
      source: "studyFleet",
      targetStatId: "studies.AImp.speed",
      operation: "base",
      value: (context) => calculateEffectiveStudySpeed("AImp", context.state, context.config ?? config),
    },
    {
      id: "study-speed-aupg",
      label: "A.Upgrade Study Speed",
      source: "studyFleet",
      targetStatId: "studies.AUpg.speed",
      operation: "base",
      value: (context) => calculateEffectiveStudySpeed("AUpg", context.state, context.config ?? config),
    },
    {
      id: "study-speed-arec",
      label: "A.Recalculation Study Speed",
      source: "studyFleet",
      targetStatId: "studies.ARec.speed",
      operation: "base",
      value: (context) => calculateEffectiveStudySpeed("ARec", context.state, context.config ?? config),
    },
  ];
}

export function registerStandardEffects(registry = defaultEffectRegistry, config = {}) {
  const effects = createStandardEffects(config);
  registry.registerAll(effects);
  return registry;
}
