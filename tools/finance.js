// Time-value-of-money and amortization math, ported from the RPNLog app
// (lib/logic/finance.dart) so the site and the app give the same answers.
// Rates are percent per period. Cash flows follow the sign convention: money
// received is positive, money paid is negative. Runs in a browser (as
// window.Finance) and under node (require). Nothing here touches the network.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Finance = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function FinanceError(code) {
    this.name = 'FinanceError';
    this.code = code;
    this.message = 'FinanceError(' + code + ')';
  }
  FinanceError.prototype = Object.create(Error.prototype);

  function log1p(x) {
    var u = 1 + x;
    if (u === 1) return x;
    return Math.log(u) * x / (u - 1);
  }

  function expm1(x) {
    if (Math.abs(x) < 1e-5) return x + x * x / 2 + x * x * x / 6;
    return Math.exp(x) - 1;
  }

  // (1+r)^n and the annuity factor ((1+r)^n - 1)/r, accurate near r = 0.
  function factors(r, n) {
    if (r === 0) return [1, n];
    var g = n * log1p(r);
    return [Math.exp(g), expm1(g) / r];
  }

  // The TVM equation; zero when the five values are consistent.
  function residual(n, r, pv, pmt, fv, s) {
    var f = factors(r, n);
    return pv * f[0] + pmt * (1 + r * s) * f[1] + fv;
  }

  // A TVM problem is { n, i, pv, pmt, fv, begin }. Missing values count as 0.
  function norm(t) {
    return { n: t.n || 0, i: t.i || 0, pv: t.pv || 0, pmt: t.pmt || 0, fv: t.fv || 0, begin: !!t.begin };
  }

  function solvePv(t0) {
    var t = norm(t0), r = t.i / 100, f = factors(r, t.n);
    return -(t.pmt * (1 + r * (t.begin ? 1 : 0)) * f[1] + t.fv) / f[0];
  }

  function solveFv(t0) {
    var t = norm(t0), r = t.i / 100, f = factors(r, t.n);
    return -(t.pv * f[0] + t.pmt * (1 + r * (t.begin ? 1 : 0)) * f[1]);
  }

  function solvePmt(t0) {
    var t = norm(t0), r = t.i / 100, f = factors(r, t.n);
    var d = (1 + r * (t.begin ? 1 : 0)) * f[1];
    if (d === 0) throw new FinanceError('tvm');
    return -(t.pv * f[0] + t.fv) / d;
  }

  // Number of periods, rounded the way RPN financial calculators do: up to the
  // next whole period unless the fraction is under 0.005.
  function solveN(t0) {
    var t = norm(t0), r = t.i / 100, raw;
    if (r === 0) {
      if (t.pmt === 0) throw new FinanceError('tvm');
      raw = -(t.pv + t.fv) / t.pmt;
    } else {
      var k = t.pmt * (1 + r * (t.begin ? 1 : 0)) / r;
      var num = k - t.fv, den = t.pv + k;
      if (den === 0 || num / den <= 0 || r <= -1) throw new FinanceError('tvm');
      raw = Math.log(num / den) / log1p(r);
    }
    if (!isFinite(raw) || raw < 0) throw new FinanceError('tvm');
    var whole = Math.floor(raw);
    if (raw - whole < 0.005) return whole;
    return whole + 1;
  }

  // Periodic rate in percent.
  function solveI(t0) {
    var t = norm(t0);
    if (t.n <= 0) throw new FinanceError('tvm');
    if (t.pmt === 0) {
      if (t.pv === 0 || t.fv === 0 || (t.pv > 0) === (t.fv > 0)) throw new FinanceError('tvm');
      return (Math.pow(-t.fv / t.pv, 1 / t.n) - 1) * 100;
    }
    var s = t.begin ? 1 : 0;
    var root = findRoot(function (r) { return residual(t.n, r, t.pv, t.pmt, t.fv, s); });
    if (root === null) throw new FinanceError('tvm');
    return root * 100;
  }

  // Finds a root of f for a rate in (-99.99%, 10000%): scans for a sign change,
  // prefers the one nearest zero, then refines it (bisection plus secant
  // steps). Returns null when there is no sign change.
  function findRoot(f) {
    var grid = [], x;
    for (x = -0.9999; x < -0.5; x += 0.02) grid.push(x);
    for (x = -0.5; x < 0.5; x += 0.0025) grid.push(x);
    for (x = 0.5; x < 100; x *= 1.08) grid.push(x);
    var brackets = [], prevX = null, prevF = null;
    for (var g = 0; g < grid.length; g++) {
      x = grid[g];
      var fx = f(x);
      if (!isFinite(fx)) { prevX = null; continue; }
      if (fx === 0) return x;
      if (prevX !== null && prevF !== null && (prevF < 0) !== (fx < 0)) brackets.push([prevX, x]);
      prevX = x;
      prevF = fx;
    }
    if (brackets.length === 0) return null;
    // The economically meaningful root is normally the one closest to zero.
    brackets.sort(function (p, q) {
      return Math.min(Math.abs(p[0]), Math.abs(p[1])) - Math.min(Math.abs(q[0]), Math.abs(q[1]));
    });
    var a = brackets[0][0], b = brackets[0][1], fa = f(a), fb = f(b);
    for (var k = 0; k < 200; k++) {
      // Secant guess, kept inside the bracket; otherwise bisect.
      var m = b - fb * (b - a) / (fb - fa);
      if (!(m > Math.min(a, b) && m < Math.max(a, b))) m = (a + b) / 2;
      var fm = f(m);
      if (fm === 0 || Math.abs(b - a) < 1e-15 * Math.max(1, Math.abs(m))) return m;
      if ((fa < 0) !== (fm < 0)) { b = m; fb = fm; } else { a = m; fa = fm; }
      // Guard against one-sided secant stalls.
      if (k % 3 === 2) {
        var mid = (a + b) / 2, fmid = f(mid);
        if ((fa < 0) !== (fmid < 0)) { b = mid; fb = fmid; } else { a = mid; fa = fmid; }
      }
    }
    return (a + b) / 2;
  }

  // Rounds like a calculator display set to a number of decimals.
  function roundTo(x, digits) {
    var m = Math.pow(10, digits);
    var v = Math.round(Math.abs(x) * m + 1e-9) / m;
    return x < 0 ? -v : v;
  }

  // Amortizes a number of payments starting after t.n payments already made.
  // Each period's interest is rounded to the given decimals, as a calculator
  // set to that display does, so totals match a lender's statement.
  function amortize(t0, payments, digits) {
    if (payments <= 0) throw new FinanceError('amort');
    var t = norm(t0), r = t.i / 100, pv = t.pv, made = Math.round(t.n);
    var interestTotal = 0, principalTotal = 0, pmt = roundTo(t.pmt, digits);
    for (var k = 0; k < payments; k++) {
      var interest = (t.begin && made === 0) ? 0 : -roundTo(pv * r, digits);
      var principal = pmt - interest;
      pv += principal;
      interestTotal += interest;
      principalTotal += principal;
      made++;
    }
    return { interest: interestTotal, principal: principalTotal, balance: roundTo(pv, digits + 2), n: made };
  }

  // One row per payment: { period, payment, interest, principal, balance }.
  function schedule(t0, digits, maxRows) {
    var t = norm(t0), rows = [], cur = norm(t0);
    cur.n = 0;
    var total = Math.min(Math.round(t.n), maxRows === undefined ? 1200 : maxRows);
    for (var p = 1; p <= total; p++) {
      var a = amortize(cur, 1, digits);
      rows.push({ period: p, payment: roundTo(t.pmt, digits), interest: a.interest, principal: a.principal, balance: a.balance });
      cur.pv = a.balance;
      cur.n = a.n;
    }
    return rows;
  }

  // A result as the app's display shows it: FIX decimals with grouping, or
  // scientific when too large, or too small to show any digit.
  function formatNumber(v, fix) {
    if (fix === undefined) fix = 2;
    if (isNaN(v)) return '\u2014';
    var a = Math.abs(v);
    var roundsToZero = v !== 0 && a < 0.5 * Math.pow(10, -fix);
    if (a >= 1e12 || roundsToZero) return formatSci(v, Math.min(Math.max(fix, 2), 7));
    var str = a.toFixed(fix), parts = str.split('.');
    var body = parts[0].replace(/\B(?=(\d{3})+$)/g, ',') + (parts.length > 1 ? '.' + parts[1] : '');
    return v < 0 && Number(str) !== 0 ? '\u2212' + body : body;
  }

  function formatSci(v, digits) {
    if (digits === undefined) digits = 4;
    if (v === 0) return '0.' + '0'.repeat(digits);
    var e = Math.floor(Math.log(Math.abs(v)) / Math.LN10);
    var m = Math.abs(v) / Math.pow(10, e);
    if (Number(m.toFixed(digits)) >= 10) { e += 1; m /= 10; }
    var abs = Math.abs(e), es = (e < 0 ? '\u2212' : '') + (abs < 10 ? '0' + abs : abs);
    return (v < 0 ? '\u2212' : '') + m.toFixed(digits) + ' E' + es;
  }

  // What a person typed in a field. '' gives null, nonsense gives NaN. Takes
  // 450,000 and 450 000 as thousands, 6,5 as a decimal comma, and a real minus.
  function parseInput(text) {
    var s = String(text).trim().replace(/[\s\u00a0\u202f]/g, '').replace(/\u2212/g, '-');
    if (s === '') return null;
    if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else if (/^[-+]?\d*,\d+$/.test(s)) s = s.replace(',', '.');
    var v = Number(s);
    return isFinite(v) ? v : NaN;
  }

  return {
    formatNumber: formatNumber, formatSci: formatSci, parseInput: parseInput,
    FinanceError: FinanceError, residual: residual, solvePv: solvePv, solveFv: solveFv, solvePmt: solvePmt,
    solveN: solveN, solveI: solveI, findRoot: findRoot, roundTo: roundTo, amortize: amortize, schedule: schedule
  };
});
