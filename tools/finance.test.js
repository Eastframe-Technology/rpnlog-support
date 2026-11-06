// Run with: node --test tools/finance.test.js
// The vectors come from the RPNLog app's test/finance_test.dart and
// test/calculator_test.dart, plus the schedule shown in the app's screenshots
// and the numbers quoted on this site's own pages.
const test = require('node:test');
const assert = require('node:assert');
const F = require('./finance.js');

function close(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} got ${actual}, expected ${expected} +/- ${tol}`);
}
const isFinanceError = (e) => e instanceof F.FinanceError;

test('mortgage payment, rate and term', () => {
  const t = { n: 360, i: 0.5, pv: 200000 };
  close(F.solvePmt(t), -1199.10, 0.005);
  const withPmt = { ...t, pmt: -1199.10 };
  close(F.solveI({ ...withPmt, i: 0 }), 0.5, 1e-5);
  assert.strictEqual(F.solveN({ ...withPmt, n: 0 }), 360);
  assert.ok(Math.abs(F.solveFv(withPmt)) < 2);
  close(F.solvePv({ ...t, pmt: -1199.10, pv: 0 }), 200000, 1);
});

test('car loan and savings', () => {
  close(F.solvePmt({ n: 48, i: 7.5 / 12, pv: 25000 }), -604.47, 0.005);
  close(F.solveFv({ n: 120, i: 0.5, pmt: -100 }), 16387.93, 0.005);
});

test('begin mode payment is the end payment discounted one period', () => {
  const end = { n: 36, i: 1, pv: 10000 };
  const beg = { ...end, begin: true };
  close(F.solvePmt(beg), F.solvePmt(end) / 1.01, 1e-9);
  close(F.solveI({ ...beg, pmt: F.solvePmt(beg) }), 1, 1e-6);
});

test('zero rate', () => {
  const t = { n: 10, i: 0, pv: 1000 };
  close(F.solvePmt(t), -100, 1e-12);
  assert.strictEqual(F.solveN({ ...t, pmt: -100 }), 10);
});

test('n rounds up unless the fraction is under 0.005', () => {
  assert.strictEqual(F.solveN({ i: 1, pv: 1000, pmt: -30 }), 41);
  const p = F.solvePmt({ n: 12, i: 1, pv: 1000 });
  assert.strictEqual(F.solveN({ i: 1, pv: 1000, pmt: p }), 12);
});

test('rate with no payment, and impossible cases', () => {
  close(F.solveI({ n: 10, pv: -1000, fv: 2000 }), (Math.pow(2, 0.1) - 1) * 100, 1e-9);
  assert.throws(() => F.solveI({ n: 10, pv: 1000, fv: 2000 }), isFinanceError);
  assert.throws(() => F.solveN({ i: 1, pv: 1000, pmt: -5 }), isFinanceError);
});

test('high and negative rates solve', () => {
  const p = F.solvePmt({ n: 12, i: 25, pv: 1000 });
  close(F.solveI({ n: 12, pv: 1000, pmt: p }), 25, 1e-6);
  const q = F.solvePmt({ n: 12, i: -2, pv: 1000 });
  close(F.solveI({ n: 12, pv: 1000, pmt: q }), -2, 1e-6);
});

test('the app quick guide: 30 years, 6.5% a year, 450,000', () => {
  close(F.solvePmt({ n: 30 * 12, i: 6.5 / 12, pv: 450000, fv: 0 }), -2844.31, 0.005);
});

test('keystroke test: a new PV gives half the payment', () => {
  close(F.solvePmt({ n: 360, i: 0.5, pv: 100000 }), -599.55, 0.005);
});

test('amortization: totals add up and the balance runs to zero', () => {
  const t = { n: 0, i: 0.5, pv: 200000, pmt: -1199.10 };
  const a = F.amortize(t, 12, 2);
  close(a.interest + a.principal, 12 * -1199.10, 1e-6);
  close(a.balance, 200000 + a.principal, 1e-6);
  assert.strictEqual(a.n, 12);
  assert.strictEqual(F.amortize(t, 1, 2).interest, -1000);
  const rows = F.schedule({ ...t, n: 360 }, 2);
  assert.strictEqual(rows.length, 360);
  assert.ok(Math.abs(rows[rows.length - 1].balance) < 5);
});

test('amortization: begin mode has no interest on the first payment', () => {
  const t = { n: 0, i: 1, pv: 1000, pmt: -100, begin: true };
  assert.strictEqual(F.amortize(t, 1, 2).interest, 0);
  assert.strictEqual(F.amortize(t, 2, 2).interest, -9);
});

test('schedule: the app screenshot, 450,000 over 360 payments of 2,844.31', () => {
  const t = { n: 360, i: 6.5 / 12, pv: 450000, pmt: F.solvePmt({ n: 360, i: 6.5 / 12, pv: 450000 }) };
  const rows = F.schedule(t, 2);
  close(rows[0].interest, -2437.50, 0.005);
  close(rows[0].principal, -406.81, 0.005);
  close(rows[0].balance, 449593.19, 0.005);
  close(rows[11].balance, 444970.17, 0.005);
  close(rows.reduce((s, r) => s + r.interest, 0), -573947.33, 0.005);
  close(rows.reduce((s, r) => s + r.principal, 0), -450004.27, 0.005);
});

test('roundTo rounds away from zero like the display', () => {
  assert.strictEqual(F.roundTo(2.345, 2), 2.35);
  assert.strictEqual(F.roundTo(-2.345, 2), -2.35);
  assert.strictEqual(F.roundTo(0, 2), 0);
});

test('display format, from the app test/format_test.dart', () => {
  assert.strictEqual(F.formatNumber(1234567.891), '1,234,567.89');
  assert.strictEqual(F.formatNumber(-1199.1, 2), '\u22121,199.10');
  assert.strictEqual(F.formatNumber(0.5, 4), '0.5000');
  assert.strictEqual(F.formatNumber(-0.001, 2), '\u22121.00 E\u221203');
  assert.strictEqual(F.formatNumber(0), '0.00');
  assert.strictEqual(F.formatNumber(-0.004, 2), '\u22124.00 E\u221203');
  assert.strictEqual(F.formatNumber(1.5e15), '1.50 E15');
  assert.strictEqual(F.formatSci(9.99996, 4), '1.0000 E01');
  assert.strictEqual(F.formatNumber(0.00001234, 2), '1.23 E\u221205');
  assert.strictEqual(F.formatNumber(450000, 0), '450,000');
});

test('field input parsing', () => {
  assert.strictEqual(F.parseInput('450,000'), 450000);
  assert.strictEqual(F.parseInput('1,234,567.5'), 1234567.5);
  assert.strictEqual(F.parseInput('450 000'), 450000);
  assert.strictEqual(F.parseInput('6,5'), 6.5);
  assert.strictEqual(F.parseInput('.5'), 0.5);
  assert.strictEqual(F.parseInput('\u2212100'), -100);
  assert.strictEqual(F.parseInput(''), null);
  assert.ok(Number.isNaN(F.parseInput('abc')));
});
