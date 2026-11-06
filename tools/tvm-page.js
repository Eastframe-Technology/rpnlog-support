// Page script for the TVM calculator. The math is in finance.js.
(function () {
  var F = window.Finance, $ = function (id) { return document.getElementById(id); };
  var FIELDS = ['n', 'i', 'pv', 'pmt', 'fv'];
  var NAMES = { n: 'N', i: 'I/Y', pv: 'PV', pmt: 'PMT', fv: 'FV' };
  var EXAMPLES = {
    mortgage: { solve: 'pmt', n: '360', i: '0.5416666667', pv: '450000', pmt: '', fv: '0', begin: false },
    car: { solve: 'pmt', n: '48', i: '0.625', pv: '25000', pmt: '', fv: '0', begin: false },
    savings: { solve: 'fv', n: '120', i: '0.5', pv: '0', pmt: '-100', fv: '', begin: false },
    rate: { solve: 'i', n: '60', i: '', pv: '30000', pmt: '-600', fv: '0', begin: false },
    term: { solve: 'n', n: '', i: '1', pv: '1000', pmt: '-30', fv: '0', begin: false }
  };
  var solvers = { n: F.solveN, i: F.solveI, pv: F.solvePv, pmt: F.solvePmt, fv: F.solveFv };

  // Like a calculator register, a solved field keeps its full value behind the
  // rounded text, until someone edits it. Solving for another field then round-trips.
  var kept = {};

  function target() { return document.querySelector('input[name="solve"]:checked').value; }
  function begin() { return document.querySelector('input[name="timing"]:checked').value === 'begin'; }

  // Digits to show in the solved field: plain enough to copy, exact enough to reuse.
  function plain(k, v) { return k === 'n' ? String(v) : k === 'i' ? String(Number(v.toFixed(8))) : v.toFixed(2); }

  function explain(k, v, t) {
    var a = F.formatNumber(Math.abs(v), 2);
    if (k === 'n') return 'Periods, rounded up to a whole number, as classic RPN financial calculators do. The last payment may be smaller than the others.';
    if (k === 'i') return 'Percent per period. Times 12 that is ' + F.formatNumber(v * 12, 4) + '% a year, if the periods are months.';
    var dir = v < 0 ? 'you pay' : 'you receive';
    if (k === 'pmt') return 'Each period ' + dir + ' ' + a + (t.begin ? ', at the start of the period.' : ', at the end of the period.');
    if (k === 'pv') return 'Today ' + dir + ' ' + a + '.';
    return 'At the end ' + dir + ' ' + a + '.';
  }

  function update() {
    var k = target(), t = { begin: begin() }, bad = null;
    FIELDS.forEach(function (f) {
      var el = $(f);
      el.readOnly = f === k;
      el.classList.toggle('solved', f === k);
      el.setAttribute('aria-label', NAMES[f] + (f === k ? ', calculated' : ''));
      $('chs-' + f).disabled = f === k;
      if (f === k) return;
      var v = kept[f] && kept[f].text === el.value ? kept[f].value : F.parseInput(el.value);
      if (v !== v) bad = NAMES[f];
      t[f] = v === null ? 0 : v;
    });
    ['x12', 'd12'].forEach(function (b) { $(b).disabled = (b === 'x12' ? 'n' : 'i') === k; });
    var msg = $('msg'), ans = $('answer');
    var fail = function (text) {
      msg.textContent = text; msg.hidden = false; ans.hidden = true; $(k).value = '';
    };
    if (bad) return fail(bad + ' is not a number.');
    if (k !== 'n' && t.n < 0) return fail('N cannot be negative.');
    var v;
    try {
      if (k === 'pv' || k === 'pmt' || k === 'fv') { if (t.n === 0) return fail('Enter the number of periods, N.'); }
      v = solvers[k](t);
      if (!isFinite(v)) throw new F.FinanceError('tvm');
    } catch (e) {
      if (!(e instanceof F.FinanceError)) throw e;
      return fail('No solution for these values. Usually PV, PMT and FV need at least one positive and one negative number, or the payment is too small to cover the interest.');
    }
    msg.hidden = true; ans.hidden = false;
    $(k).value = plain(k, v);
    kept[k] = { text: $(k).value, value: v };
    $('ans-big').textContent = NAMES[k] + ' = ' + (k === 'n' ? F.formatNumber(v, 0) : k === 'i' ? F.formatNumber(v, 4) + '%' : F.formatNumber(v, 2));
    $('ans-text').textContent = explain(k, v, t);
  }

  function load(name) {
    var e = EXAMPLES[name];
    document.querySelector('input[name="solve"][value="' + e.solve + '"]').checked = true;
    document.querySelector('input[name="timing"][value="' + (e.begin ? 'begin' : 'end') + '"]').checked = true;
    FIELDS.forEach(function (f) { $(f).value = e[f]; });
    update();
  }

  FIELDS.forEach(function (f) {
    $(f).addEventListener('input', update);
    $('chs-' + f).addEventListener('click', function () {
      var v = F.parseInput($(f).value);
      if (v !== null && v === v) { $(f).value = String(-v); update(); }
    });
  });
  document.querySelectorAll('input[name="solve"], input[name="timing"]').forEach(function (r) { r.addEventListener('change', update); });
  $('x12').addEventListener('click', function () {
    var v = F.parseInput($('n').value);
    if (v !== null && v === v) { $('n').value = String(Number((v * 12).toFixed(6))); update(); }
  });
  $('d12').addEventListener('click', function () {
    var v = F.parseInput($('i').value);
    if (v !== null && v === v) { $('i').value = String(Number((v / 12).toFixed(10))); update(); }
  });
  document.querySelectorAll('button.chip[data-example]').forEach(function (b) {
    b.addEventListener('click', function () { load(b.getAttribute('data-example')); });
  });
  load('mortgage');
})();
