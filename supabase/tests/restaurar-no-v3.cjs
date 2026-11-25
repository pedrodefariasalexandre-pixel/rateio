/* Prova de compatibilidade: o backup EXPORTADO PELO BANCO abre no rateio-v3.html e o app gera de volta o mesmo backup.
 * Uso: node restaurar-no-v3.cjs <backup-original.txt> <export-do-banco.txt> */
"use strict";
const path = require("path"), fs = require("fs");
const T = path.resolve(__dirname, "../../rateio-v3-testes");
const H = require(path.join(T, "harness.cjs"));
const norm = x => Array.isArray(x) ? x.map(norm) : x && typeof x === "object"
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, norm(x[k])]).filter(([, v]) => !(v === null || v === "" || v === false || v === undefined || (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length))))
  : (typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x) && !/^0\d/.test(x)) ? Number(x) : x;
const body = s => JSON.parse(s.replace(/^\s*RATEIO-BACKUP\s*/, ""));
(async () => {
  const [orig, fromDb] = process.argv.slice(2).map(f => fs.readFileSync(f, "utf8"));
  await H.start(path.resolve(T, "../rateio-v3.html"));
  const a = await H.App.open();
  await a.restore(fromDb);
  const again = await a.r("R.backupText()");
  const same = JSON.stringify(norm(body(again))) === JSON.stringify(norm(body(orig)));
  const ui = await a.r("({hist: R.history.length, open: R.openBalances().length})");
  console.log(same ? "✓ v3 restaurou o export do banco e gerou o mesmo backup" : "✗ backup diferente depois de passar pelo banco");
  console.log("  erros de script:", a.errors.length, "· diálogos:", a.dialogs.map(d => d.msg.slice(0, 60)), "· histórico:", ui.hist, "· pessoas em aberto:", ui.open);
  await a.close(); await H.stop();
  process.exit(same && !a.errors.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
