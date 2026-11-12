// The one shared loader (spec R2). Every test gets the engine through load() and nowhere else.
// It cuts the engine out of the page by the page's own section comments, so the page needs no change.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MASTER = path.resolve(here, '..', 'debt-snowball.html');

// "Now" is fixed so results never drift: 15 Jan 2026 12:00 local (month is zero-based).
const NOW = [2026, 0, 15, 12];

export function load(file = process.env.DEBT_MASTER || MASTER) {
  const src = fs.readFileSync(file, 'utf8');
  const cut = (from, to) => {
    const i = src.indexOf(from);
    if (i < 0) throw new Error(`engine marker not found in ${file}: ${from}`);
    const j = src.indexOf(to, i);
    if (j < 0) throw new Error(`engine marker not found in ${file}: ${to}`);
    return src.slice(i, j);
  };
  const code =
    cut('/* ---------- helpers ---------- */', '/* ---------- storage') +
    cut('/* ---------- debt rules ---------- */', '/* ---------- rendering ---------- */') +
    '\nvar state;';
  const ctx = vm.createContext({});
  // Only a no-argument new Date() and Date.now() are fixed; dated calls behave normally.
  vm.runInContext(
    `(function(){const R=Date;class D extends R{constructor(...a){a.length?super(...a):super(${NOW})}static now(){return new D().getTime()}}globalThis.Date=D;})();`,
    ctx
  );
  vm.runInContext(code, ctx, { filename: file });
  if (typeof ctx.simulate !== 'function') throw new Error(`simulate not found in ${file}`);
  return ctx;
}
