import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDecimal,
  formatFeetInches,
  formatInchesDecimal,
  formatInchesFraction,
  fractionWasRounded,
  inchesFromFraction,
  lengthConversions,
} from "../js/parse.js";
import { TAP_MS, TAP_SLOP, classifyLenTap } from "../js/tap.js";

test("fractions reduce to the shop denominator", () => {
  assert.equal(formatInchesFraction(12.375, 16), "12\u00a03/8");
  assert.equal(formatInchesFraction(0.5, 16), "1/2");
  assert.equal(formatInchesFraction(8, 16), "8");
  assert.equal(formatInchesFraction(12 + 1 / 32, 32), "12\u00a01/32");
  assert.equal(formatInchesFraction(12 + 1 / 32, 16), "12\u00a01/16");
});

test("fraction rounding snaps to the nearest denominator and can be detected", () => {
  assert.equal(inchesFromFraction(12.37, 16), 12.375);
  assert.equal(fractionWasRounded(12.375, 16), false);
  assert.equal(fractionWasRounded(12.37, 16), true);
  assert.equal(fractionWasRounded(12 + 1 / 32, 32), false);
  assert.equal(fractionWasRounded(12 + 1 / 32, 16), true);
  assert.equal(fractionWasRounded(0, 16), false);
  assert.equal(fractionWasRounded(Number.NaN, 16), false);
});

test("decimal inches keep thousandths and drop trailing zeros", () => {
  assert.equal(formatInchesDecimal(12.375), "12.375");
  assert.equal(formatInchesDecimal(12), "12");
  assert.equal(formatInchesDecimal(-3.5), "-3.5");
  assert.equal(formatInchesDecimal(1 / 64), formatDecimal(1 / 64, 3));
});

test("feet and inches stay fractional unless decimal style is asked for", () => {
  assert.equal(formatFeetInches(15.5, 16), `1' 3\u00a01/2"`);
  assert.equal(formatFeetInches(12, 16), `1' 0"`);
  assert.equal(formatFeetInches(3.375, 16), `0' 3\u00a03/8"`);
  assert.equal(formatFeetInches(15.5, 16, "decimal"), `1' 3.5"`);
  assert.equal(formatFeetInches(12, 16, "decimal"), `1' 0"`);
  assert.equal(formatFeetInches(3.375, 16, "decimal"), `0' 3.375"`);
  assert.equal(formatFeetInches(-15.5, 16, "decimal"), `-1' 3.5"`);
});

test("metric and the default conversion line are unchanged", () => {
  const conv = lengthConversions(12.375, 16);
  assert.equal(conv.fractionalInches, `12\u00a03/8"`);
  assert.equal(conv.decimalInches, "12.375 in");
  assert.equal(conv.feetInches, formatFeetInches(12.375, 16));
  assert.equal(conv.mm, `${formatDecimal(12.375 * 25.4, 2)} mm`);
});

test("a second tap in the same spot toggles, a distant tap does not", () => {
  const first = classifyLenTap(null, { x: 10, y: 20, t: 1000 });
  assert.equal(first.toggle, false);
  const second = classifyLenTap(first.prev, { x: 16, y: 24, t: 1000 + TAP_MS });
  assert.equal(second.toggle, true);
  assert.equal(second.prev, null);
  const late = classifyLenTap(first.prev, { x: 12, y: 20, t: 1000 + TAP_MS + 1 });
  assert.equal(late.toggle, false);
  const far = classifyLenTap(first.prev, { x: 10 + TAP_SLOP + 1, y: 20, t: 1100 });
  assert.equal(far.toggle, false);
});
