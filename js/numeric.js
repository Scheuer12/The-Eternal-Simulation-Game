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

const SI_UNITS_HIGH = {
  15: "PJ",
  18: "EJ",
  21: "ZJ",
  24: "YJ",
};

export function formatEnergy(value, precision = 2) {
  const d = big(value);
  if (!d.isFinite()) return "SIGNAL ERROR";
  if (d.eq(0)) return "0.00 pJ";

  // Layer 0 SI handling
  if (d.layer === 0) {
    const num = d.toNumber();
    const abs = Math.abs(num);

    if (abs >= 1e24) return `${(num / 1e24).toFixed(precision)} YJ`;
    if (abs >= 1e21) return `${(num / 1e21).toFixed(precision)} ZJ`;
    if (abs >= 1e18) return `${(num / 1e18).toFixed(precision)} EJ`;
    if (abs >= 1e15) return `${(num / 1e15).toFixed(precision)} PJ`;
    if (abs >= 1e12) return `${(num / 1e12).toFixed(precision)} TJ`;
    if (abs >= 1e9) return `${(num / 1e9).toFixed(precision)} GJ`;
    if (abs >= 1e6) return `${(num / 1e6).toFixed(precision)} MJ`;
    if (abs >= 1e3) return `${(num / 1e3).toFixed(precision)} kJ`;
    if (abs >= 1) return `${num.toFixed(precision)} J`;
    if (abs >= 1e-3) return `${(num * 1e3).toFixed(precision)} mJ`;
    if (abs >= 1e-6) return `${(num * 1e6).toFixed(precision)} µJ`;
    if (abs >= 1e-9) return `${(num * 1e9).toFixed(precision)} nJ`;
    if (abs >= 1e-12) return `${(num * 1e12).toFixed(precision)} pJ`;
    if (abs >= 1e-15) return `${(num * 1e15).toFixed(precision)} fJ`;
    if (abs >= 1e-18) return `${(num * 1e18).toFixed(precision)} aJ`;
  } else if (d.layer === 1 && d.mag < 27) {
    const group = Math.floor(d.mag / 3) * 3;
    const unit = SI_UNITS_HIGH[group];
    if (unit) {
      const mantissa = 10 ** (d.mag - group);
      return `${mantissa.toFixed(precision)} ${unit}`;
    }
  }

  return formatEngineering(d, " J");
}

export function formatRate(value, precision = 2) {
  const d = big(value);
  const prefix = d.gte(0) ? "+" : "";
  return `${prefix}${formatEnergy(d, precision)}/s`;
}

export function formatInteger(value) {
  const num = Math.floor(Number(value) || 0);
  return num.toLocaleString("en-US");
}

export function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds ?? 0));
  if (s < 60) return `${s.toFixed(1)}s`;
  if (s < 3600) {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return `${hours}h ${mins}m`;
}

