import Decimal from "break_eternity.js";

export const BigNum = Decimal;
if (typeof globalThis !== "undefined") {
  globalThis.__TES_NUMERIC__ = { big, BigNum: Decimal };
}

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

export const NOTATION_MODES = {
  ENGINEERING: "engineering",
  ENGINEERING_NUM: "engineering_num",
  ALPHA: "alpha",
};

let currentNotation = "engineering";

export function setGlobalNotation(notation) {
  if (["engineering", "engineering_num", "alpha"].includes(notation)) {
    currentNotation = notation;
  }
}

export function getGlobalNotation() {
  return currentNotation;
}

if (typeof globalThis !== "undefined") {
  globalThis.__TES_NUMERIC__ = {
    big,
    BigNum: Decimal,
    formatInteger,
    formatNumber,
    formatEnergy,
    formatRate,
    formatDuration,
    formatStudyDuration,
    formatEngineering,
    setGlobalNotation,
    getGlobalNotation,
  };
}

const SI_PREFIXES = {
  "-24": "y",
  "-21": "z",
  "-18": "a",
  "-15": "f",
  "-12": "p",
  "-9": "n",
  "-6": "u",
  "-3": "m",
  "0": "",
  "3": "K",
  "6": "M",
  "9": "G",
  "12": "T",
  "15": "P",
  "18": "E",
  "21": "Z",
  "24": "Y",
};

export function getAlphaSubUnit(k) {
  if (k <= 0) return "";
  let s = "";
  let n = k;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(97 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function getAlphaSuperUnit(k) {
  if (k <= 0) return "";
  let s = "";
  let n = k;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
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

export function formatEngineering(value, suffix = "", notation = currentNotation) {
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
    return `${sign}e${formatEngineering(logarithm, "", notation)}${suffix}`;
  }

  if (Math.abs(logarithm.toNumber()) >= 1e9) {
    return `${sign}e${formatExponent(logarithm.toNumber())}${suffix}`;
  }

  let exponent = Math.floor(logarithm.toNumber() / 3) * 3;
  let mantissa = absolute.div(Decimal.pow(10, exponent)).toNumber();
  if (Number(mantissa.toFixed(3)) >= 1000) {
    mantissa /= 1000;
    exponent += 3;
  }
  const mantissaStr = trimFixed(mantissa);

  if (notation === "alpha") {
    if (exponent === 0) return `${sign}${mantissaStr}${suffix}`;
    if (exponent < 0) {
      const letter = getAlphaSubUnit(-exponent / 3);
      return `${sign}${mantissaStr} ${letter}${suffix}`;
    }
    const letter = getAlphaSuperUnit(exponent / 3);
    return `${sign}${mantissaStr} ${letter}${suffix}`;
  }

  if (notation === "engineering") {
    if (exponent === 0) return `${sign}${mantissaStr}${suffix}`;
    const prefix = SI_PREFIXES[String(exponent)];
    if (prefix !== undefined) {
      return `${sign}${mantissaStr} ${prefix}${suffix}`;
    }
  }

  return `${sign}${mantissaStr}e${formatExponent(exponent)}${suffix}`;
}

export function formatEnergy(value, precision = 2, notation = currentNotation) {
  const d = big(value);
  if (!d.isFinite()) return "SIGNAL ERROR";
  if (d.eq(0)) {
    if (notation === "alpha") return `0.${"0".repeat(precision)} dJ`;
    if (notation === "engineering_num") return `0.${"0".repeat(precision)}e-12 J`;
    return `0.${"0".repeat(precision)} pJ`;
  }

  const sign = d.lt(0) ? "-" : "";
  const absolute = d.abs();

  const log10 = absolute.log10();
  if (log10.layer > 0 || Math.abs(log10.toNumber()) > 1e15) {
    return `${sign}e${formatEngineering(log10, "", notation)} J`;
  }

  const logNum = log10.toNumber();
  let exponent = Math.floor(logNum / 3) * 3;
  let mantissa = absolute.div(Decimal.pow(10, exponent)).toNumber();
  if (Number(mantissa.toFixed(precision)) >= 1000) {
    mantissa /= 1000;
    exponent += 3;
  }
  const mantissaStr = mantissa.toFixed(precision);

  if (notation === "engineering_num") {
    if (exponent === 0) {
      return `${sign}${mantissaStr} J`;
    }
    return `${sign}${mantissaStr}e${exponent} J`;
  }

  if (notation === "alpha") {
    if (exponent === 0) {
      return `${sign}${mantissaStr} J`;
    }
    if (exponent < 0) {
      const k = Math.abs(exponent) / 3;
      const letter = getAlphaSubUnit(k);
      return `${sign}${mantissaStr} ${letter}J`;
    }
    const k = exponent / 3;
    const letter = getAlphaSuperUnit(k);
    return `${sign}${mantissaStr} ${letter}J`;
  }

  // Default: "engineering" (m, u, n, p, K, M, G, T)
  if (exponent === 0) {
    return `${sign}${mantissaStr} J`;
  }
  const prefix = SI_PREFIXES[String(exponent)];
  if (prefix !== undefined) {
    return `${sign}${mantissaStr} ${prefix}J`;
  }

  return `${sign}${mantissaStr}e${formatExponent(exponent)} J`;
}

export function formatRate(value, precision = 2, notation = currentNotation) {
  const d = big(value);
  const prefix = d.gte(0) ? "+" : "";
  return `${prefix}${formatEnergy(d, precision, notation)}/s`;
}

export function formatInteger(value, notation = currentNotation) {
  const d = big(value);
  if (!d.isFinite()) return "SIGNAL ERROR";
  if (d.abs().lte(99999)) {
    return Math.trunc(d.toNumber()).toLocaleString("en-US");
  }
  return formatEngineering(d, "", notation);
}

export function formatNumber(value, decimals = 1, notation = currentNotation) {
  const d = big(value);
  if (!d.isFinite()) return "SIGNAL ERROR";
  if (d.abs().lte(99999)) {
    return d.toNumber().toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return formatEngineering(d, "", notation);
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

export function formatStudyDuration(seconds, notation = currentNotation) {
  const s = Math.max(0, Number(seconds ?? 0));
  if (s < 0.05) {
    if (s <= 0) return "∞/s";
    const rate = 1 / s;
    if (rate > 99999) {
      return `${formatEngineering(rate, "", notation)}/s`;
    }
    if (rate >= 1000) {
      return `${(rate / 1000).toFixed(1)}k/s`;
    }
    return `${rate.toFixed(1)}/s`;
  }
  return `${s.toFixed(2)}s`;
}

