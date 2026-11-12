// One named test per rule in spec R2, plus R2c from amendment 1: which plan the page keeps when the account document arrives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const E = load();
const OLD = '2026-01-10T09:00:00.000Z';
const NEW = '2026-01-15T11:00:00.000Z';
const plan = (updatedAt, n = 2) => {
  const s = E.normalise({ debts: Array.from({ length: n }, (_, i) => ({ id: 'd' + i, balance: 100 * (i + 1), minPay: 10 })) });
  s.updatedAt = updatedAt;
  return s;
};
const empty = (updatedAt) => Object.assign(E.emptyState(), { updatedAt });
const pick = (r) => ({ use: r.use, write: r.write, rule: r.rule });

test('R2.1 No account document: keep local; write it only when it is a real plan with a debt', () => {
  assert.deepEqual(pick(E.loadChoice(plan(OLD), null, false)), { use: 'local', write: true, rule: 1 });
  assert.deepEqual(pick(E.loadChoice(E.exampleState(), null, false)), { use: 'local', write: false, rule: 1 });
  assert.deepEqual(pick(E.loadChoice(empty(NEW), null, false)), { use: 'local', write: false, rule: 1 });
});

test('R2.2 Account has debts and local is the example set or empty: the account wins, whatever the timestamps', () => {
  // The wipe in grill F2: examples cleared before the first read, so local is empty and newer.
  assert.deepEqual(pick(E.loadChoice(empty(NEW), plan(OLD), false)), { use: 'account', write: false, rule: 2 });
  assert.deepEqual(pick(E.loadChoice(E.exampleState(), plan(OLD), false)), { use: 'account', write: false, rule: 2 });
  // The page's own "checking" placeholder before anything is known.
  assert.deepEqual(pick(E.loadChoice(empty(''), plan(OLD), false)), { use: 'account', write: false, rule: 2 });
});

test('R2.3 Both have debts: the newer updatedAt wins, and a newer local plan goes to the account', () => {
  assert.deepEqual(pick(E.loadChoice(plan(NEW, 1), plan(OLD), false)), { use: 'local', write: true, rule: 3 });
  assert.deepEqual(pick(E.loadChoice(plan(OLD, 1), plan(NEW), false)), { use: 'account', write: false, rule: 3 });
  assert.deepEqual(pick(E.loadChoice(plan(NEW, 1), plan(NEW), true)), { use: 'account', write: false, rule: 3 });
});

test('R2.4 An empty local plan replaces an account plan only when cleared after that plan was read in this page load', () => {
  // Read earlier in this page load, then the person deleted everything: the clear stands and is sent.
  assert.deepEqual(pick(E.loadChoice(empty(NEW), plan(OLD), true)), { use: 'local', write: true, rule: 4 });
  // Read earlier, but the account plan is newer than the clear: the account wins.
  assert.deepEqual(pick(E.loadChoice(empty(OLD), plan(NEW), true)), { use: 'account', write: false, rule: 2 });
});

test('R2c An account document with no debts counts as no document: it never beats a plan with debts', () => {
  // Spec Done when 14: the empty account document is newer, the local plan has one debt; local stays and is sent.
  assert.deepEqual(pick(E.loadChoice(plan(OLD, 1), empty(NEW), false)), { use: 'local', write: true, rule: 1 });
  assert.deepEqual(pick(E.loadChoice(plan(OLD, 1), empty(NEW), true)), { use: 'local', write: true, rule: 1 });
  // Nothing to send on either side: examples or an empty plan stay, and no empty plan is written.
  assert.deepEqual(pick(E.loadChoice(E.exampleState(), empty(NEW), false)), { use: 'local', write: false, rule: 1 });
  assert.deepEqual(pick(E.loadChoice(empty(NEW), empty(OLD), true)), { use: 'local', write: false, rule: 1 });
});
