// One named test per rule in spec R2. Figures are worked by hand in the comments, not snapshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load } from './load.mjs';

const E = load();
const debts = (o) => E.normalise(o).debts;
// The engine runs in its own vm realm, so its objects have that realm's prototype. A shallow
// copy gives a plain object here that deepEqual can compare key by key (all values are numbers).
const plain = (x) => ({ ...x });

test('1 Snowball: extra goes to the smallest balance first', () => {
  // A 1000, B 500, minimums 50 each, budget 300: extra = 300 - 100 = 200.
  // B is smaller, so B gets 50 + 200 = 250 and A stays on 50.
  const s = E.simulate(debts({ debts: [
    { id: 'A', balance: 1000, apr: 20, minPay: 50 },
    { id: 'B', balance: 500, apr: 10, minPay: 50 }] }), 300, 'snowball');
  assert.deepEqual(plain(s.months[0].pays), { A: 50, B: 250 });
  assert.equal(s.months[0].focus, 'B');
});

test('2 Avalanche: extra goes to the highest current rate first', () => {
  // Same debts; A is 20% against B 10%, so A gets 50 + 200 = 250 and B stays on 50.
  const s = E.simulate(debts({ debts: [
    { id: 'A', balance: 1000, apr: 20, minPay: 50 },
    { id: 'B', balance: 500, apr: 10, minPay: 50 }] }), 300, 'avalanche');
  assert.deepEqual(plain(s.months[0].pays), { A: 250, B: 50 });
  assert.equal(s.months[0].focus, 'A');
});

test('3 Balanced: debts over 25% of their limit are brought to the line first, highest rate first, then avalanche', () => {
  // C 600 of limit 1000 at 10%, F 600 of limit 1000 at 20%, D 2000 at 30% with no limit.
  // Line = 25% of 1000 = 250. Minimums C 20, F 20, D 50 = 90.
  // After minimums C and F are each at 580, so each needs 580 - 250 = 330 extra to reach the line.
  const three = [
    { id: 'C', balance: 600, apr: 10, minPay: 20, limit: 1000 },
    { id: 'F', balance: 600, apr: 20, minPay: 20, limit: 1000 },
    { id: 'D', balance: 2000, apr: 30, minPay: 50 }];
  // Budget 490: 400 spare, not enough for both. F (20%) is the dearer over-line debt, so it goes
  // first: F 20 + 330 = 350, leaving 70 for C: C 20 + 70 = 90. D, dearest of all but under no
  // limit, stays on its 50.
  const short = E.simulate(debts({ debts: three }), 490, 'balanced');
  assert.deepEqual(plain(short.months[0].pays), { C: 90, F: 350, D: 50 });
  assert.equal(short.months[0].focus, 'F');
  // Budget 850: 760 spare. F 330 and C 330 bring both to the line (C 350, F 350),
  // then avalanche: the last 760 - 660 = 100 goes to D (30%): D 50 + 100 = 150.
  const full = E.simulate(debts({ debts: three }), 850, 'balanced');
  assert.deepEqual(plain(full.months[0].pays), { C: 350, F: 350, D: 150 });
});

test('4 Split card: payment covers plan dues first, then the highest-rate part', () => {
  // Card E, minimum 150, no budget. Plan part pays 100 a month (due first).
  // The remaining 150 - 100 = 50 goes to the 20% part; the 10% part gets 0.
  const s = E.simulate(debts({ debts: [{ id: 'E', balance: 0, minPay: 150, parts: [
    { id: 'p', label: 'Plan', balance: 600, apr: 0, plan: true, planPay: 100 },
    { id: 'h', label: 'Purch', balance: 400, apr: 20 },
    { id: 'l', label: 'Cash', balance: 300, apr: 10 }] }] }), null, 'avalanche');
  assert.deepEqual(plain(s.months[0].partPay), { 'E/p': 100, 'E/h': 50, 'E/l': 0 });
});

test('5 Roll-on: a cleared debt\'s payment moves to the top of the picked order', () => {
  // X 100, Y 1000, Z 2000, all 0%, fixed 100 each (300 a month), snowball.
  // Month 0: X, Y and Z each pay 100, so X clears (month 0).
  // Month 1: X's 100 rolls to Y (smallest): Y 200, Z 100.
  // Y has 900 left after month 0, then takes 200 a month: months 1 to 5 pay 1000 in total
  // (900 = 4 x 200 + 100), so Y clears in month 5 and month 5 pays Y 100.
  // That month's leftover 100 goes to Z: Z 200. Z then has 2000 - (100 + 4x100 + 200) = 1300,
  // taking 300 a month for 4 months and the last 100: clears in month 10.
  const s = E.simulate(debts({ debts: [
    { id: 'X', balance: 100, minPay: 5 },
    { id: 'Y', balance: 1000, minPay: 5 },
    { id: 'Z', balance: 2000, minPay: 5 }] }), null, 'snowball', { X: 100, Y: 100, Z: 100 });
  assert.deepEqual(plain(s.months[1].pays), { Y: 200, Z: 100 });
  assert.deepEqual(plain(s.months[5].pays), { Y: 100, Z: 200 });
  assert.deepEqual(plain(s.cleared), { X: 0, Y: 5, Z: 10 });
});

test('6 Tie-break: equal rates rank smaller balance first; equal balances rank higher rate first', () => {
  // Avalanche, both 20%: A 1000, B 500, min 50 each, budget 300. Extra 200 goes to smaller B: 250.
  const av = E.simulate(debts({ debts: [
    { id: 'A', balance: 1000, apr: 20, minPay: 50 },
    { id: 'B', balance: 500, apr: 20, minPay: 50 }] }), 300, 'avalanche');
  assert.deepEqual(plain(av.months[0].pays), { A: 50, B: 250 });
  // Snowball, both 500 (450 after minimums): A 10%, B 20%. Higher rate B gets 50 + 200 = 250.
  const sn = E.simulate(debts({ debts: [
    { id: 'A', balance: 500, apr: 10, minPay: 50 },
    { id: 'B', balance: 500, apr: 20, minPay: 50 }] }), 300, 'snowball');
  assert.deepEqual(plain(sn.months[0].pays), { A: 50, B: 250 });
});

test('7 Loader: a file with no engine, or no simulate, fails with a message naming what is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debt-load-'));
  const file = path.join(dir, 'no-engine.html');
  fs.writeFileSync(file, '<html><body>no engine here</body></html>');
  // Every section marker present, but nothing between them defines simulate.
  const noSim = path.join(dir, 'no-simulate.html');
  fs.writeFileSync(noSim, [
    '/* ---------- helpers ---------- */', 'var helper = 1;',
    '/* ---------- storage ---------- */',
    '/* ---------- debt rules ---------- */', 'function normalise(o){ return o; }',
    '/* ---------- rendering ---------- */'].join('\n'));
  try {
    assert.throws(() => load(file), (e) => {
      console.log('# loader error:', e.message);
      return e.message === `engine marker not found in ${file}: /* ---------- helpers ---------- */`;
    });
    assert.throws(() => load(noSim), (e) => {
      console.log('# loader error:', e.message);
      return e.message === `simulate not found in ${noSim}`;
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
