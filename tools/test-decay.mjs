import { big, bigMax } from '../js/numeric.js';

function calculateEnergyOverflowDecay(storedEnergy = 0, stableCapacity = 0, config = {}) {
  const energy = big(storedEnergy);
  const cap = big(stableCapacity);
  const overflow = bigMax(0, energy.sub(cap));
  if (overflow.lte(0)) return big(0);

  const rate = config.decay?.overflowDecayRate ?? 0.012;
  const power = config.decay?.overflowDecayPower ?? 1.42;
  const relExponent = config.decay?.relativeDecayExponent ?? 3.0;
  const minRef = big(config.decay?.minReferenceCapacity ?? 1.0);

  const refCap = cap.gt(0) ? cap : minRef;
  const x = overflow.div(refCap);

  const baseDecay = cap.gt(0)
    ? big(rate).mul(cap).mul(x.pow(power))
    : big(rate).mul(overflow.pow(power));

  if (relExponent > 0) {
    const wallMultiplier = cap.gt(0) || x.gt(1.0)
      ? big(1).add(cap.gt(0) ? x : x.sub(1.0)).pow(relExponent)
      : big(1.0);

    return baseDecay.mul(wallMultiplier);
  }

  return baseDecay;
}

const config = {
  decay: {
    overflowDecayRate: 0.012,
    overflowDecayPower: 1.42,
    relativeDecayExponent: 3.0,
    minReferenceCapacity: 1.0
  }
};

console.log('=== TEST 1: 0 Power Cells (cap = 0) ===');
for (const e of [1e-12, 1e-9, 1e-6, 1e-3, 0.1, 1.0, 1.5, 2.0, 5.0, 10.0]) {
  const d = calculateEnergyOverflowDecay(e, 0, config);
  console.log(`  e = ${e >= 1 ? e.toFixed(1) + ' J' : e.toExponential(1)} -> decay = ${d.toString()} J/s (${d.mul(1000).toString()} mJ/s)`);
}

console.log('\n=== TEST 2: 1 Power Cell (cap = 1 mJ) ===');
for (const mult of [1.0, 1.1, 1.5, 2.0, 3.0, 5.0, 10.0]) {
  const e = 1e-3 * mult;
  const d = calculateEnergyOverflowDecay(e, 1e-3, config);
  console.log(`  e = ${mult.toFixed(1)}x cap (${(e*1000).toFixed(1)} mJ) -> decay = ${d.mul(1000).toString()} mJ/s`);
}

console.log('\n=== TEST 3: 1000 Power Cells (cap = 1.0 J) ===');
for (const mult of [1.0, 1.1, 1.5, 2.0, 3.0, 5.0, 10.0]) {
  const e = 1.0 * mult;
  const d = calculateEnergyOverflowDecay(e, 1.0, config);
  console.log(`  e = ${mult.toFixed(1)}x cap (${e.toFixed(1)} J) -> decay = ${d.toString()} J/s`);
}
