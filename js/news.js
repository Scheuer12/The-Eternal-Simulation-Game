export const DEFAULT_NEWS = [
  {
    id: "processing_network_online",
    text: "PROCESSING NETWORK ONLINE // Additional computing cores detected in facility sub-grid.",
    category: "NETWORK",
    rarity: 1,
    weight: 80,
  },
  {
    id: "solar_wind_shift",
    text: "Solar wind velocity shifted by +0.04 AU/h. Background noise density stable.",
    category: "TELEMETRY",
    rarity: 1,
    weight: 100,
  },
  {
    id: "thermal_equilibrium",
    text: "Cryo-containment manifold delta: 0.003 K. Thermal drift within nominal boundaries.",
    category: "SYSTEM",
    rarity: 1,
    weight: 90,
  },
  {
    id: "subspace_resonance",
    text: "Secondary capacitor bank harmonics aligned with cosmic background radiation.",
    category: "ENERGY",
    rarity: 1,
    weight: 85,
  },
  {
    id: "clock_sync",
    text: "Atomic reference clock synchronized with galactic pulsar beacon J0437-4715.",
    category: "CHRONO",
    rarity: 2,
    weight: 50,
  },
  {
    id: "packet_echo",
    text: "Echo trace returned from Sub-Level 7. Round-trip latency: 12.4 picoseconds.",
    category: "NETWORK",
    rarity: 2,
    weight: 45,
  },
  {
    id: "stray_signal",
    text: "Unidentified narrowband carrier signal detected on 1420 MHz. Signal decayed in 3s.",
    category: "ANOMALY",
    rarity: 3,
    weight: 20,
  },
  {
    id: "temporal_leak",
    text: "Chronometer reported a timestamp dated 4,200 years in the future, then reverted.",
    category: "ANOMALY",
    rarity: 4,
    weight: 6,
  },
  {
    id: "simulation_breach",
    text: "Warning: Memory address 0xDEADBEEF responded with conscious intent.",
    category: "SYSTEM FAULT",
    rarity: 5,
    weight: 2,
  },
  {
    id: "cosmic_whisper",
    text: "The universe is not expanding. It is just making room for the next calculation.",
    category: "TRANSMISSION",
    rarity: 5,
    weight: 1,
  },
];

export function getRarityLabel(rarity) {
  switch (Number(rarity)) {
    case 5:
      return "LEGENDARY";
    case 4:
      return "VERY RARE";
    case 3:
      return "RARE";
    case 2:
      return "UNCOMMON";
    case 1:
    default:
      return "COMMON";
  }
}

export function getRarityClass(rarity) {
  switch (Number(rarity)) {
    case 5:
      return "news-rarity--legendary";
    case 4:
      return "news-rarity--very-rare";
    case 3:
      return "news-rarity--rare";
    case 2:
      return "news-rarity--uncommon";
    case 1:
    default:
      return "news-rarity--common";
  }
}

export function selectNextNews(newsList, currentNewsId = null, randomFn = Math.random) {
  const items = Array.isArray(newsList) && newsList.length > 0 ? newsList : DEFAULT_NEWS;
  if (items.length === 1) return items[0];

  const candidates = items.filter((item) => item.id !== currentNewsId);
  const pool = candidates.length > 0 ? candidates : items;

  let totalWeight = 0;
  for (const item of pool) {
    const w = Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1;
    totalWeight += w;
  }

  const roll = randomFn() * totalWeight;
  let accumulated = 0;
  for (const item of pool) {
    const w = Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1;
    accumulated += w;
    if (roll < accumulated) {
      return item;
    }
  }

  return pool[pool.length - 1];
}

export function getNewsItem(newsList, id) {
  const items = Array.isArray(newsList) && newsList.length > 0 ? newsList : DEFAULT_NEWS;
  if (!id) return selectNextNews(items);
  return items.find((item) => item.id === id) || items[0];
}
