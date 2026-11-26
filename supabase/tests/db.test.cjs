/* Testes do banco do Rateio num Postgres local com um "stub" do Supabase (auth.uid(), papéis anon/authenticated).
 * Uso: PGHOST=... PGPORT=... PGDATABASE=rt node db.test.cjs <backup-gerado-pelo-v3.txt>
 * O banco precisa estar com tests/supabase-stub.sql + migrations/*.sql aplicados (ver tests/README). */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";
let pass = 0, fail = 0;
const results = [];

function psql(sql) {
  return execFileSync("psql", ["-U", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 << 20 }).trim();
}
const lit = s => "$q$" + s + "$q$";
/** Roda SQL como usuário logado (role authenticated + JWT) numa transação. amr: timestamp do login, p/ reset de PIN. */
function as(user, sql, { role = "authenticated", amr } = {}) {
  const claims = JSON.stringify(user ? { sub: user, role, amr: amr ? [{ method: "password", timestamp: amr }] : [] } : { role });
  return psql(`begin; set local role ${role}; do $do$ begin perform set_config('request.jwt.claims', ${lit(claims)}, true); end $do$;
${sql}
commit;`);
}
function asErr(user, sql, opts) {
  try { as(user, sql, opts); return null; } catch (e) { return String(e.stderr || e.message); }
}
function t(name, fn) {
  try { fn(); pass++; results.push(["ok", name]); }
  catch (e) { fail++; results.push(["FALHOU", name + " — " + (e.message || e).split("\n").slice(0, 4).join(" | ")]); }
}
/** Primeiro caminho em que a e b diferem (para a mensagem de erro). */
function diffPath(a, b, p = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diffPath(a[k], b[k], p + "." + k); if (d) return d; }
  }
  return `${p}: esperado ${JSON.stringify(b)?.slice(0, 200)} obtido ${JSON.stringify(a)?.slice(0, 200)}`;
}
function eq(a, b, msg = "") { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} ${diffPath(a, b)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || "condição falsa"); }

/** Compara backups pelo significado: ignora null/""/false/{}, número em texto = número, ordem de chaves. */
function norm(x) {
  if (Array.isArray(x)) return x.map(norm);
  if (x && typeof x === "object") {
    const o = {};
    for (const k of Object.keys(x).sort()) {
      const v = norm(x[k]);
      if (v === null || v === undefined || v === "" || v === false || (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) continue;
      o[k] = v;
    }
    return o;
  }
  if (typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x) && !/^0\d/.test(x)) return Number(x);
  return x;
}
const parseBk = s => JSON.parse(s.replace(/^\s*RATEIO-BACKUP\s*/, ""));
const imp = (user, txt, mode) => JSON.parse(as(user, `select public.import_rateio_backup(${lit(txt)}${mode ? `, ${lit(mode)}` : ""});`));
const exp = user => as(user, `select public.export_rateio_backup();`);
const reset = () => psql(`delete from auth.users; insert into auth.users values ('${U1}'),('${U2}'); delete from private.pin_credentials;`);

const BK = fs.readFileSync(process.argv[2], "utf8");
const bk = parseBk(BK);
const base = (over = {}) => "RATEIO-BACKUP " + JSON.stringify(Object.assign({ v: 7, people: [{ id: "p1", nome: "A", cor: "#3B5BDB", fone: "" }, { id: "p2", nome: "B", cor: "#D6336C", fone: "" }] }, over));

reset();

t("01 importa o backup gerado pelo v3 e devolve ok", () => {
  const r = imp(U1, BK);
  eq(r.status, "ok"); eq(r.pessoas, bk.people.length); eq(r.meses, bk.history.length); eq(r.memoria_parcelas, Object.keys(bk.parcelas).length);
});
t("02 exportar devolve o mesmo backup (ida e volta sem perda)", () => {
  const out = exp(U1); ok(out.startsWith("RATEIO-BACKUP {"), "prefixo");
  eq(norm(parseBk(out)), norm(bk));
});
t("03 dinheiro em centavos inteiros (bigint) nas tabelas", () => {
  const r = as(U1, `select string_agg(table_name||'.'||column_name||':'||data_type, ',' order by 1) from information_schema.columns
    where table_schema='public' and (column_name like '%cents%') and data_type <> 'bigint';`);
  eq(r, "");
});
t("04 pagamento registrado no v3 virou linha em payments", () => {
  const n = +as(U1, `select count(*) from public.payments;`);
  const exp = bk.history.reduce((a, h) => a + h.people.reduce((b, p) => b + (p.payments || []).length, 0), 0);
  eq(n, exp); ok(n >= 1, "o backup de teste deveria ter pagamento");
});
t("05 RLS: outro usuário não vê nada", () => {
  eq(as(U2, `select (select count(*) from public.people)+(select count(*) from public.closed_months)+(select count(*) from public.installment_memory)+(select count(*) from public.settings)+(select count(*) from public.open_balances);`), "0");
});
t("06 RLS: outro usuário não grava com o user_id do primeiro", () => {
  const e = asErr(U2, `insert into public.people(user_id,id,name) values ('${U1}','px','x');`); ok(e && /row-level security/.test(e), e);
});
t("07 RLS: outro usuário não altera nem apaga linhas do primeiro", () => {
  as(U2, `update public.people set name='hack'; delete from public.closed_months;`);
  eq(as(U1, `select count(*) from public.people where name='hack';`), "0");
  eq(+as(U1, `select count(*) from public.closed_months;`), bk.history.length);
});
t("08 anon não lê tabela nem chama RPC", () => {
  ok(asErr(null, `select * from public.people;`, { role: "anon" }), "select deveria falhar");
  ok(asErr(null, `select public.export_rateio_backup();`, { role: "anon" }), "rpc deveria falhar");
});
t("09 backup com id malicioso é recusado inteiro e nada muda", () => {
  const before = exp(U1);
  const e = asErr(U1, `select public.import_rateio_backup(${lit(base({ people: [{ id: 'p1" autofocus onfocus="x', nome: "X" }] }))});`);
  ok(/identificador inválido/.test(e), e); eq(exp(U1), before);
});
t("10 backup quebrado no meio (histórico sem competência) não troca as pessoas", () => {
  const before = exp(U1);
  const e = asErr(U1, `select public.import_rateio_backup(${lit(base({ history: [{ id: 1, comp: "" }] }))});`);
  ok(/competência/.test(e), e); eq(exp(U1), before);
});
t("11 backup de versão mais nova é recusado", () => {
  ok(/versão mais nova/.test(asErr(U1, `select public.import_rateio_backup(${lit(base({ v: 8 }))});`)));
});
t("12 backup com senha pede para abrir no app", () => {
  ok(/senha/.test(asErr(U1, `select public.import_rateio_backup('RATEIO-BACKUP-ENC1 abc');`)));
});
t("13 texto que não é backup", () => {
  ok(/não é um backup completo/.test(asErr(U1, `select public.import_rateio_backup('RATEIO-BACKUP {quebrado');`)));
});
t("14 parcelas diferentes: sem escolha devolve needs_decision e nada muda", () => {
  const before = exp(U1);
  const r = imp(U1, base({ parcelas: { "p3|ZZ|5|1": { key: "p3|ZZ|5|1", memo: "OUTRA 1/5", norm: "OUTRA", parcela: { cur: 1, tot: 5 }, cents: 100, fitid: "ZZ", status: "fora_manual", em: "2026-11-01", comp: "2026-11", origem: "manual" } } }));
  eq(r.status, "needs_decision"); eq(r.diferentes, Object.keys(bk.parcelas).length); eq(exp(U1), before);
});
t("15 parcelas: juntar mantém as atuais e acrescenta as do backup", () => {
  const r = imp(U1, base({ parcelas: { "p3|ZZ|5|1": { key: "p3|ZZ|5|1", memo: "OUTRA 1/5", norm: "OUTRA", parcela: { cur: 1, tot: 5 }, cents: 100, fitid: "ZZ", status: "fora_manual", em: "2026-11-01", comp: "2026-11", origem: "manual" } } }), "juntar");
  eq(r.parcelas, "junto"); eq(r.memoria_parcelas, Object.keys(bk.parcelas).length + 1);
});
t("16 parcelas: substituir troca pelas do backup; backup sem parcelas mantém", () => {
  imp(U1, base({ parcelas: {} }), "substituir");
  eq(+as(U1, `select count(*) from public.installment_memory;`), 0);
  imp(U1, BK);   // volta ao estado completo (sem conflito: base vazia)
  eq(+as(U1, `select count(*) from public.installment_memory;`), Object.keys(bk.parcelas).length);
  imp(U1, base({}));
  eq(+as(U1, `select count(*) from public.installment_memory;`), Object.keys(bk.parcelas).length);
});
t("17 parte ausente no backup fica como está (só pessoas trocadas)", () => {
  imp(U1, BK);
  imp(U1, base({}));
  eq(+as(U1, `select count(*) from public.people;`), 2);
  eq(+as(U1, `select count(*) from public.closed_months;`), bk.history.length);
  eq(+as(U1, `select count(*) from public.fixed_charges;`), bk.charges.length);
});
t("18 backup com rules e sem ruleObs volta a memória por valor ao modo cauteloso", () => {
  imp(U1, BK);
  ok(+as(U1, `select count(*) from public.owner_memory where observations is not null;`) > 0);
  imp(U1, base({ rules: { "LOJA X": ["p1"] } }));
  eq(+as(U1, `select count(*) from public.owner_memory where observations is not null;`), 0);
  eq(as(U1, `select owners::text from public.owner_memory where norm_key='LOJA X';`), "{p1}");
});
t("19 ruleSplits, ruleEach, ruleTags e tags ida e volta", () => {
  reset();
  const o = { rules: { A: ["p1"], "": ["p2"] }, ruleSplits: { A: { w: { p1: 1, p2: 2 } } }, ruleEach: { "PLANO CEL": ["p1", "p2"] },
    ruleObs: { A: [{ c: 1000, o: ["p1"], at: "2026-11-01" }, { c: 2000, o: null, at: "2026-10-01" }] },
    tags: [{ id: "g1", nome: "Casa", cor: "#0CA678" }], ruleTags: { A: ["g1"], "fixa:17": ["g1"] } };
  imp(U1, base(o));
  eq(norm(parseBk(exp(U1))), norm(Object.assign(parseBk(base(o)), { charges: [], history: [], parcelas: {},
    settings: { pix: "", pixOwner: "p1", lastBackup: "", msgPending: true, msgProjection: false, projRecurring: false } })));
});
t("20 tag com mesmo nome (maiúsc./minúsc.) é recusada", () => {
  ok(/tags_user_name_uq|duplicate/.test(asErr(U1, `select public.import_rateio_backup(${lit(base({ tags: [{ id: "g1", nome: "Casa" }, { id: "g2", nome: "casa" }] }))});`)));
});
t("21 backup antigo (v2): migrações 3, 5, 6 e 7 aplicadas", () => {
  reset();
  const v2 = "RATEIO-BACKUP " + JSON.stringify({ v: 2,
    people: [{ id: "p1", nome: "Pedro", cor: "#3B5BDB" }, { id: "p2", nome: "Nega", cor: "#D6336C" }],
    tags: [{ id: "g1", nome: "Casa", cor: "#0CA678" }],
    rules: { LOJA: ["p2"] },
    charges: [{ id: 5, nome: "Emp", valor: "100.00", owners: ["p2"], parcAtual: 3, parcTotal: 10, lastMonth: "Outubro/2026" },
              { id: 6, nome: "Mensal", valor: "10", owners: ["p1"] }],
    history: [{ id: 99, comp: "2026-10", label: "Outubro/2026", closedAt: "2026-10-30T10:00:00.000Z", totalCents: 1000,
      people: [{ nome: "Nega", total: 1000, text: "m" }], items: [{ memo: "LOJA", cents: 1000, tags: ["Casa"], shares: [{ nome: "Nega", cents: 1000 }] }], fora: [] }],
    parcelas: {
      "antiga-1": { memo: "MOVEIS 2/5", norm: "MOVEIS", acct: "kab", parcela: { cur: 2, tot: 5 }, cents: 500, fitid: "F9", status: "pago_antecipado", em: "2026-10-01", comp: "2026-10" },
      "antiga-2": { memo: "TV 1/3", norm: "TV", acct: "", parcela: { cur: 1, tot: 3 }, cents: 700, fitid: "", status: "fora_manual", em: "2026-10-01", comp: "2026-10" },
      "antiga-3": { memo: "TV 1/3", norm: "TV", acct: "", parcela: { cur: 1, tot: 3 }, cents: 701, fitid: "", status: "fora_manual", em: "2026-10-02", comp: "2026-10" },
    } });
  const r = imp(U1, v2); eq(r.status, "ok"); eq(r.versao_do_backup, 2);
  const d = parseBk(exp(U1));
  eq(d.history[0].people[0].pid, "p2", "pid pelo nome");
  eq(d.history[0].items[0].shares[0].pid, "p2"); eq(d.history[0].items[0].tagIds, ["g1"]);
  eq(d.history[0].people[0].payments, []);
  eq(Object.keys(d.parcelas).sort(), ["p2|-|TV|3|1", "p2|-|TV|3|1#2", "p3|F9|5|2"]);
  eq(d.parcelas["p3|F9|5|2"].chaveAntiga, "antiga-1");
  eq(d.parcelas["p2|-|TV|3|1"].conferir, "migração"); eq(d.parcelas["p2|-|TV|3|1#2"].conferir, "migração");
  eq(d.charges[0].parcComp, "2026-11", "âncora = mês seguinte ao último fechamento");
  eq(d.charges[1].parcComp, "", "mensal continua sem âncora");
  eq(d.charges[1].valor, "10.00");
});
t("22 migração 6 é idempotente (backup v7 com chaves certas não muda)", () => {
  imp(U1, BK, "substituir");
  eq(norm(parseBk(exp(U1)).parcelas), norm(bk.parcelas));
});
t("23 fechar mês: refechar mantém pagamentos; cobranças e parcelas gravadas juntas", () => {
  reset(); imp(U1, BK);
  const h = bk.history.find(x => x.people.some(p => (p.payments || []).length));
  const paid = h.people.find(p => (p.payments || []).length);
  const novo = Object.assign({}, h, { id: 1999999999999, totalCents: h.totalCents, people: h.people.map(p => Object.assign({}, p, { payments: [] })) });
  const ch = bk.charges.map(c => Object.assign({}, c, { nome: c.nome + " (editada)" }));
  const r = JSON.parse(as(U1, `select public.close_month(${lit(JSON.stringify(novo))}, ${lit(JSON.stringify(ch))}, ${lit(JSON.stringify({ "p2|k|X|4|2": { key: "p2|k|X|4|2", memo: "X 2/4", norm: "X", parcela: { cur: 2, tot: 4 }, cents: 10, status: "fora_manual", em: "2026-12-01", comp: h.comp, origem: "fechamento" } }))});`));
  eq(r.substituiu, true);
  const d = parseBk(exp(U1)), h2 = d.history.find(x => x.comp === h.comp);
  eq(h2.id, 1999999999999); eq(norm(h2.people.find(p => p.pid === paid.pid).payments), norm(paid.payments));
  ok(d.charges.every(c => c.nome.endsWith("(editada)"))); eq(d.parcelas["p2|k|X|4|2"].origem, "fechamento");
});
t("24 fechar mês inválido não grava nada", () => {
  const before = exp(U1);
  ok(asErr(U1, `select public.close_month(${lit(JSON.stringify({ id: 5, comp: "2026-13" }))});`));
  eq(exp(U1), before);
});
t("25 desfazer fechamento: só o mais recente; volta as cobranças anteriores", () => {
  const d0 = parseBk(exp(U1));
  const last = as(U1, `select id from public.closed_months order by closed_at desc, id desc limit 1;`);
  const other = as(U1, `select id from public.closed_months where id <> ${lit(last)} limit 1;`);
  ok(/mais recente/.test(asErr(U1, `select public.undo_close_month(${lit(other)});`)));
  const before = d0.history.find(h => String(h.id) === last).chargesBefore;
  as(U1, `select public.undo_close_month(${lit(last)});`);
  const d = parseBk(exp(U1));
  eq(d.history.length, d0.history.length - 1); eq(norm(d.charges), norm(before));
});
t("26 pagamento: distribui do mês mais antigo e respeita o total em aberto", () => {
  reset();
  const h = (id, comp, total) => ({ id, comp, label: comp, closedAt: comp + "-28T12:00:00.000Z", totalCents: total * 2,
    people: [{ pid: "p1", nome: "A", total, text: "" }, { pid: "p2", nome: "B", total, text: "" }], items: [], fora: [] });
  imp(U1, base({ settings: { pixOwner: "p1" }, history: [h(2, "2026-11", 3000), h(1, "2026-10", 5000)] }));
  eq(as(U1, `select string_agg(person_key||':'||remaining_cents, ',' order by comp) from public.open_balances;`), "p2:5000,p2:3000", "dono do cartão fora");
  ok(/Maior que o total em aberto/.test(asErr(U1, `select public.register_payment('p2', 8001, '2026-12-01');`)));
  as(U1, `select public.register_payment('p2', 6000, '2026-12-01');`);
  eq(as(U1, `select string_agg(comp||':'||paid_cents||'/'||remaining_cents, ',' order by comp) from public.open_balances;`), "2026-11:1000/2000");
  ok(/Maior que o valor em aberto/.test(asErr(U1, `select public.register_payment('p2', 2001, '2026-12-02', '2', 1);`)));
  as(U1, `select public.register_payment('p2', 2000, '2026-12-02', '2', 1);`);
  eq(as(U1, `select count(*) from public.open_balances;`), "0");
  ok(/maior que zero/.test(asErr(U1, `select public.register_payment('p2', 0, '2026-12-02');`)));
});
t("27 remover mês apaga os pagamentos (cascata)", () => {
  as(U1, `delete from public.closed_months where id='1';`);
  eq(as(U1, `select count(*) from public.payments where month_id='1';`), "0");
});
t("28 PIN: cria, não sobrescreve, erra 5x e bloqueia, acerta zera", () => {
  eq(JSON.parse(as(U1, `select public.set_pin('1234');`)).status, "ok");
  eq(JSON.parse(as(U1, `select public.set_pin('9999');`)).status, "already_configured");
  for (let i = 0; i < 4; i++) eq(JSON.parse(as(U1, `select public.verify_pin('0000');`)).status, "invalid");
  eq(JSON.parse(as(U1, `select public.verify_pin('0000');`)).status, "locked");
  eq(JSON.parse(as(U1, `select public.verify_pin('1234');`)).status, "locked", "bloqueado mesmo com o PIN certo");
  psql(`update private.pin_credentials set locked_until = now() - interval '1 s';`);
  eq(JSON.parse(as(U1, `select public.verify_pin('1234');`)).status, "success");
  ok(asErr(U1, `select * from private.pin_credentials;`), "tabela do verifier não pode ser lida");
});
t("29 PIN: esqueci o PIN só com login recente", () => {
  eq(JSON.parse(as(U1, `select public.reset_pin();`, { amr: Math.floor(Date.now() / 1000) - 3600 })).status, "reauth_required");
  eq(JSON.parse(as(U1, `select public.reset_pin();`, { amr: Math.floor(Date.now() / 1000) - 30 })).status, "ok");
  eq(JSON.parse(as(U1, `select public.get_pin_status();`)).configured, false);
});
t("30 rascunho da fatura: um por usuário, só o dono vê", () => {
  as(U1, `insert into public.invoice_drafts(comp, file_name, state) values ('2026-12','x.ofx','{"txs":[]}');`);
  eq(as(U2, `select count(*) from public.invoice_drafts;`), "0");
  ok(asErr(U1, `insert into public.invoice_drafts(comp, state) values ('2026-12','{}');`), "segundo rascunho deveria falhar");
});
const SNAP = (h) => JSON.stringify({ acct: "kabc", comp: "2026-12", dueDate: "2026-12-07", totalCents: 30000, contentHash: h,
  lines: [{ pos: 0, fitid: "f1", postedOn: "2026-11-03", memo: "LOJA X 03/10", norm: "LOJA X", cents: 10000, kind: "compra", instCur: 3, instTot: 10, seriesKey: "p2|kabc|LOJA X|10" }] });
t("40 Horizonte: salvar fatura, reimportar igual não duplica, conteúdo novo pede confirmação", () => {
  eq(JSON.parse(as(U1, `select public.save_invoice_snapshot(${lit(SNAP("h1"))}::jsonb);`)).status, "created");
  eq(JSON.parse(as(U1, `select public.save_invoice_snapshot(${lit(SNAP("h1"))}::jsonb);`)).status, "unchanged");
  eq(JSON.parse(as(U1, `select public.save_invoice_snapshot(${lit(SNAP("h2"))}::jsonb);`)).status, "conflict");
  eq(JSON.parse(as(U1, `select public.save_invoice_snapshot(${lit(SNAP("h2"))}::jsonb, true);`)).status, "created");
  eq(as(U1, `select count(*)||'/'||(select count(*) from public.invoice_lines) from public.invoice_snapshots;`), "1/1");
});
t("41 Horizonte RLS: outro usuário não lê, não grava nem apaga (CA08)", () => {
  as(U1, `insert into public.pockets(name, rule, is_reserve) values ('Reserva','acumula',true);
          insert into public.pocket_moves(pocket_id, kind, cents, on_date) select id,'aporte',100,'2026-11-01' from public.pockets;`);
  const tabs = ["hz_settings","invoice_snapshots","invoice_lines","hz_decisions","hz_cards","income_sources","hz_holidays","pay_window_overrides","pockets","pocket_moves","hz_items","planned_entries","hz_item_prefs"];
  eq(as(U2, `select ${tabs.map(x => `(select count(*) from public.${x})`).join("+")};`), "0");
  const e = asErr(U2, `insert into public.pockets(user_id,name) values ('${U1}','x');`); ok(e && /row-level security/.test(e), e);
  as(U2, `select public.delete_horizon_data(); delete from public.invoice_snapshots;`);
  eq(as(U1, `select (select count(*) from public.invoice_snapshots)+(select count(*) from public.pockets);`), "2");
  ok(asErr(null, `select count(*) from public.pockets;`, { role: "anon" }), "anon leu pockets");
  ok(asErr(null, `select public.delete_horizon_data();`, { role: "anon" }), "anon chamou RPC");
});
t("42 Horizonte: excluir tudo remove só do usuário (CA16) e sem número de cartão", () => {
  ok(asErr(U1, `insert into public.invoice_snapshots(acct,comp,total_cents,content_hash) values ('5555 4444 3333 2222','2027-01',1,'x');`), "aceitou número de cartão");
  as(U2, `insert into public.pockets(name) values ('Dele');`);
  as(U1, `select public.delete_horizon_data();`);
  eq(as(U1, `select (select count(*) from public.invoice_snapshots)+(select count(*) from public.invoice_lines)+(select count(*) from public.pockets)+(select count(*) from public.pocket_moves);`), "0");
  eq(as(U2, `select count(*) from public.pockets;`), "1");
});
t("31 apagar a conta apaga tudo (cascata de auth.users)", () => {
  reset(); imp(U1, BK);
  psql(`delete from auth.users where id='${U1}';`);
  eq(psql(`select (select count(*) from public.people)+(select count(*) from public.closed_months)+(select count(*) from public.payments)+(select count(*) from public.installment_memory)+(select count(*) from public.settings);`), "0");
});

reset(); imp(U1, BK);
fs.writeFileSync(path.join(process.env.OUT_DIR || ".", "export-do-banco.txt"), exp(U1));
for (const [s, n] of results) console.log(`${s === "ok" ? "✓" : "✗"} ${n}`);
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
