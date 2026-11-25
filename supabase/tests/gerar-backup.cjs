/* Gera um backup RATEIO-BACKUP realista usando o rateio-v3.html de verdade (Chromium), só com dados sintéticos.
 * Uso: node gerar-backup.cjs <saida.txt>   (rodar de dentro de rateio-v3-testes/, que tem harness e fixtures) */
"use strict";
const path = require("path"), fs = require("fs");
const T = path.resolve(__dirname, "../../rateio-v3-testes");
const H = require(path.join(T, "harness.cjs")), F = require(path.join(T, "fixtures.cjs"));
(async () => {
  await H.start(path.resolve(T, "../rateio-v3.html"));
  const a = await H.App.open();
  await a.restore(F.backupText({
    tags: [{ id: "gcasa", nome: "Casa", cor: "#0CA678" }],
    charges: [
      { id: 1730000000001, nome: "Emprestimo ficticio", valor: "300.00", owners: ["p2"], parcAtual: "4", parcTotal: "10", parcComp: "2026-10", lastMonth: "" },
      { id: 1730000000002, nome: "Assinatura dividida", valor: "45.90", owners: ["p1", "p3"], w: { p1: 2, p3: 1 }, parcAtual: "", parcTotal: "", parcComp: "", lastMonth: "" },
    ],
    ruleSplits: { "STREAMING EXEMPLO": { w: { p1: 1, p2: 2 } } },
    ruleTags: { "MERCADO FICTICIO SA": ["gcasa"], "fixa:1730000000002": ["gcasa"] },
    settings: { pix: "teste@exemplo.invalid", pixOwner: "p1", lastBackup: "", msgPending: true, msgProjection: true, projRecurring: false },
  }));
  // fatura 1 (competência 2026-11)
  await a.importText(F.faturaBase(), "outubro.ofx");
  const ids = await a.r(`R.txs.filter(t=>!t.excluded && !t.owners.length).map(t=>t.id)`);
  for (const [i, id] of ids.entries()) {
    await a.click(`[data-tx="${id}"][data-person="p1"]`);
    if (i % 2) await a.click(`[data-tx="${id}"][data-person="p2"]`);
  }
  const parc = await a.r(`R.txs.find(t=>t.pkey)?.id`);
  if (parc) { await a.click(`[data-antecip-open="${parc}"]`); await a.page.fill("[data-antecip-val]", "280,00"); await a.page.fill("[data-antecip-desc]", "20,00"); await a.click(`[data-antecip-ok="${parc}"]`); }
  await a.finishAndClose();
  // fatura 2 (competência 2026-12)
  await a.importText(F.faturaBase({ dtStart: "20261111", dtEnd: "20261210", trns: [
    { amt: "-120.00", memo: "MERCADO FICTICIO SA", fitid: "B001", date: "20261112" },
    { amt: "-89.90", memo: "PLANO CELULAR", fitid: "B002", date: "20261113" },
    { amt: "-89.90", memo: "PLANO CELULAR", fitid: "B003", date: "20261113" },
    { amt: "-300.00", memo: "LOJA MOVEIS FAKE - Parcela 3/10", fitid: "A003", date: "20261114" },
  ] }), "novembro.ofx");
  const ids2 = await a.r(`R.txs.filter(t=>!t.excluded && !t.owners.length).map(t=>t.id)`);
  for (const id of ids2) await a.click(`[data-tx="${id}"][data-person="p3"]`);
  await a.finishAndClose();
  const hist = await a.r(`R.history.map(h=>({id:h.id, comp:h.comp, people:h.people.map(p=>[p.pid,p.total])}))`);
  const oct = hist[hist.length - 1];   // mês mais antigo
  const p2 = oct.people.find(p => p[0] === "p2");
  if (p2 && p2[1] > 100) await a.r(`R.savePayment("${oct.id}:${oct.people.indexOf(p2)}", 100, "2026-12-05")`);
  const txt = await a.r(`R.backupText()`);
  fs.writeFileSync(process.argv[2], txt);
  console.log("ok", txt.length, "bytes; erros:", a.errors);
  await a.close(); await H.stop();
})().catch(e => { console.error(e); process.exit(1); });
