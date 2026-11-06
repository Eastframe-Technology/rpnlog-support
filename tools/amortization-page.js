// Page script for the amortization schedule. The math is in finance.js.
(function () {
  var F = window.Finance, $ = function (id) { return document.getElementById(id); };
  var money = function (v) { return F.formatNumber(v, 2); };

  function update() {
    var msg = $('msg'), out = $('out');
    var fail = function (t) { msg.textContent = t; msg.hidden = false; out.hidden = true; };
    var amount = F.parseInput($('amount').value), rate = F.parseInput($('rate').value), years = F.parseInput($('years').value);
    var perYear = Number($('per').value), begin = $('timing').value === 'begin';
    if (amount === null || amount !== amount || amount <= 0) return fail('Enter the loan amount.');
    if (rate === null || rate !== rate || rate < 0 || rate > 1000) return fail('Enter the yearly interest rate in percent, for example 6.5.');
    if (years === null || years !== years || years <= 0) return fail('Enter the term in years.');
    var n = Math.round(years * perYear);
    if (n < 1 || n > 1200) return fail('This schedule takes 1 to 1,200 payments. That term gives ' + F.formatNumber(n, 0) + '.');

    var t = { n: n, i: rate / perYear, pv: amount, fv: 0, begin: begin };
    t.pmt = F.solvePmt(t);
    var rows = F.schedule(t, 2);
    var interest = 0, paid = 0, html = [], years_ = [];
    rows.forEach(function (r, k) {
      interest -= r.interest; paid -= r.payment;
      var y = Math.floor(k / perYear);
      if (!years_[y]) years_[y] = { i: 0, p: 0, b: 0 };
      years_[y].i -= r.interest; years_[y].p -= r.principal; years_[y].b = r.balance;
      html.push('<tr><td class="n">' + r.period + '</td><td class="n">' + money(-r.payment) + '</td><td class="n">' + money(-r.interest) + '</td><td class="n">' + money(-r.principal) + '</td><td class="n">' + money(r.balance) + '</td></tr>');
    });
    var last = rows[rows.length - 1].balance;
    msg.hidden = true; out.hidden = false;
    $('s-pmt').textContent = money(-rows[0].payment);
    $('s-int').textContent = money(interest);
    $('s-paid').textContent = money(paid);
    $('s-last').textContent = money(last);
    $('s-note').textContent = Math.abs(last) < 0.005
      ? 'The balance reaches exactly zero with the last payment.'
      : 'The payment is rounded to the cent, so the last balance is ' + money(last) + ' rather than zero. In practice the final payment would be ' + money(Math.abs(last)) + (last < 0 ? ' smaller.' : ' larger.');
    $('rows').innerHTML = html.join('');
    $('yrows').innerHTML = years_.map(function (y, k) {
      return '<tr><td class="n">' + (k + 1) + '</td><td class="n">' + money(y.i) + '</td><td class="n">' + money(y.p) + '</td><td class="n">' + money(y.b) + '</td></tr>';
    }).join('');
  }

  ['amount', 'rate', 'years'].forEach(function (id) { $(id).addEventListener('input', update); });
  ['per', 'timing'].forEach(function (id) { $(id).addEventListener('change', update); });
  update();
})();
