import Decimal from "break_eternity.js";

export const BigNum = Decimal;

export function big(value = 0) {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === "") {
    return new Decimal(0);
  }

  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

export function isValidBig(value, { positive = false } = {}) {
  if (value === null || value === undefined || value === "") return false;
  try {
    const parsed = new Decimal(value);
    return (
      parsed.isFinite() &&
      (positive ? parsed.gt(0) : parsed.gte(0))
    );
  } catch {
    return false;
  }
}

export function bigMax(left, right) {
  const a = big(left);
  const b = big(right);
  return a.gte(b) ? a : b;
}

export function bigMin(left, right) {
  const a = big(left);
  const b = big(right);
  return a.lte(b) ? a : b;
}

export function bigClamp(value, minimum, maximum) {
  return bigMax(minimum, bigMin(value, maximum));
}

export function bigFloor(value) {
  const d = big(value);
  if (d.layer === 0 && d.mag < 1e15) {
    const r = Math.round(d.toNumber());
    if (Math.abs(d.toNumber() - r) < 1e-11) return big(r);
  }
  return d.floor();
}

export function bigCeil(value) {
  const d = big(value);
  if (d.layer === 0 && d.mag < 1e15) {
    const r = Math.round(d.toNumber());
    if (Math.abs(d.toNumber() - r) < 1e-11) return big(r);
  }
  return d.ceil();
}

export function bigRound(value) {
  const d = big(value);
  return d.round();
}

export function bigFloorDiv(numerator, denominator) {
  const num = big(numerator);
  const den = big(denominator);
  if (den.eq(0)) return big(0);
  return bigFloor(num.div(den));
}

export function bigPow(base, exponent) {
  return big(base).pow(exponent);
}

export function bigLog10(value) {
  return big(value).log10();
}

export function bigLn(value) {
  return big(value).ln();
}

export function bigExp(value) {
  return big(value).exp();
}

export function toFiniteNumber(value, fallback = 0) {
  const result = big(value).toNumber();
  return Number.isFinite(result) ? result : fallback;
}

export function serializeBig(value) {
  return big(value).toString();
}

function trimFixed(value, digits = 3) {
  return Number(value.toFixed(digits)).toString();
}

function formatExponent(exponent) {
  const absolute = Math.abs(exponent);
  if (absolute < 1e9) return Math.trunc(exponent).toString();

  const group = Math.floor(Math.log10(absolute) / 3) * 3;
  const mantissa = exponent / 10 ** group;
  return `${trimFixed(mantissa)}e${group}`;
}

export function formatEngineering(value, suffix = "") {
  const amount = big(value);
  if (!amount.isFinite()) return "SIGNAL ERROR";
  if (amount.eq(0)) return `0${suffix}`;

  const sign = amount.lt(0) ? "-" : "";
  const absolute = amount.abs();

  if (absolute.gte(1) && absolute.lte(999)) {
    const native = absolute.toNumber();
    const digits = native < 10 ? 3 : native < 100 ? 2 : 1;
    return `${sign}${trimFixed(native, digits)}${suffix}`;
  }

  const logarithm = absolute.log10();
  if (logarithm.layer > 0 || Math.abs(logarithm.toNumber()) > 1e15) {
    return `${sign}e${formatEngineering(logarithm)}${suffix}`;
  }

  if (Math.abs(logarithm.toNumber()) >= 1e9) {
    return `${sign}e${formatExponent(logarithm.toNumber())}${suffix}`;
  }

  const exponent = Math.floor(logarithm.toNumber() / 3) * 3;
  const mantissa = absolute.div(Decimal.pow(10, exponent)).toNumber();
  return `${sign}${trimFixed(mantissa)}e${formatExponent(exponent)}${suffix}`;
}
