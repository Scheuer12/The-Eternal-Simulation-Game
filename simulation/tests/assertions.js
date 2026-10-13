import assert from "node:assert/strict";

import { big } from "../../js/numeric.js";

export function assertBigEqual(actual, expected, message) {
  assert.ok(
    big(actual).eq(expected),
    message ?? `${big(actual).toString()} !== ${big(expected).toString()}`,
  );
}

export function assertBigClose(actual, expected, relativeTolerance = 1e-12) {
  const expectedValue = big(expected);
  const scale = expectedValue.abs().max(1);
  const relativeError = big(actual).sub(expectedValue).abs().div(scale);
  assert.ok(
    relativeError.lte(relativeTolerance),
    `${big(actual).toString()} is not within ${relativeTolerance} of ${expectedValue.toString()}`,
  );
}
