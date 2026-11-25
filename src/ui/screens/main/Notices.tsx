/** Avisos da revisão (#reviewNotices) e "Conferência da fatura" (#ledger), iguais ao v3. */
import { useEffect, useRef, type ReactNode } from 'react';
import { chargesOutside } from '../../../lib/charges';
import { dateBR, ddmm } from '../../../lib/dates';
import type { InstallmentCheck } from '../../../lib/invoice';
import { repeatGroup } from '../../../lib/memory';
import { fmtC, sum } from '../../../lib/money';
import { monthLabel } from '../../../lib/message';
import { personById, safeColor } from '../../../lib/state';
import type { Ctx, Tx } from '../../../lib/types';

const N = ({ k, children }: { k: 'danger' | 'warn' | 'info'; children: ReactNode }) => (
  <div className={'notice ' + k}>
    <span className="grow">{children}</span>
  </div>
);
const uniq = (a: string[]) => [...new Set(a)];

export function Notices({
  c,
  seq,
  eachBad,
}: {
  c: Ctx;
  seq: InstallmentCheck;
  eachBad: Set<string>;
}) {
  const { txs, fileInfo, comp } = c.inv;
  const out: ReactNode[] = [];
  const skip = fileInfo?.skipped || [];
  if (skip.length)
    out.push(
      <N k="danger" key="skip">
        <b>{skip.length} lançamento(s) do arquivo não foram lidos</b> (valor em formato que o app
        não entende):{' '}
        {skip
          .slice(0, 5)
          .map((x) => `${x.memo} (“${x.raw}”)`)
          .join('; ')}
        {skip.length > 5 ? '…' : ''}. Eles <b>não</b> estão na divisão nem na conferência. Confira
        no app do banco; se for cobrança, lance em “Cobranças fixas”.
      </N>,
    );
  if (fileInfo?.signature) {
    const exact = c.d.history.find((h) => h.signature === fileInfo.signature);
    if (exact)
      out.push(
        <N k="danger" key="closed">
          <b>Este arquivo já foi fechado</b> em {exact.label} ({dateBR(exact.closedAt)}). Fechar de
          novo duplica a cobrança.
        </N>,
      );
    else {
      const set = new Set(fileInfo.keys);
      let best: { label: string; o: number } | null = null;
      c.d.history.forEach((h) => {
        const o = (h.keys || []).filter((k) => set.has(k)).length;
        if (o > (best?.o || 0)) best = { label: h.label, o };
      });
      const b = best as { label: string; o: number } | null;
      if (b && b.o > fileInfo.keys.length / 2)
        out.push(
          <N k="warn" key="overlap">
            {b.o} lançamentos deste arquivo já estavam no mês fechado <b>{b.label}</b>. Confira
            antes de cobrar.
          </N>,
        );
    }
  }
  const outC = comp ? chargesOutside(c.d.charges, comp) : [];
  if (outC.length)
    out.push(
      <N k="info" key="outc">
        <b>
          {outC.length} cobrança(s) fixa(s) parcelada(s) fora de {monthLabel(c)}:
        </b>{' '}
        {outC.map((o) => `${o.nome} (${o.why})`).join('; ')}. Não entram na divisão deste mês. Se
        algum mês estiver errado, ajuste em “Cobranças fixas”.
      </N>,
    );
  const noAnc = txs.filter((t) => t.chargeNoAnchor);
  if (noAnc.length)
    out.push(
      <N k="warn" key="noanc">
        <b>Cobrança fixa sem mês de referência da parcela:</b> {noAnc.map((t) => t.memo).join('; ')}
        . Sem isso o app não sabe se a parcela cai nesta fatura. Preencha o campo “em” em “Cobranças
        fixas”.
      </N>,
    );
  const noMem = txs.filter((t) => t.memNote && !t.owners.length && !t.excluded);
  if (noMem.length)
    out.push(
      <N k="warn" key="nomem">
        <b>{noMem.length} item(ns) ficaram sem dono de propósito:</b> a memória não teve certeza de
        quem paga (mesmo texto com valores ou donos diferentes). Nada foi chutado.{' '}
        {uniq(noMem.map((t) => t.memo))
          .slice(0, 4)
          .join('; ')}
        {noMem.length > 4 ? '…' : ''}. Escolha a pessoa em cada um.
      </N>,
    );
  const back = txs.filter((t) => t.voltou === 'conferir');
  if (back.length) {
    const pl = back.length > 1;
    out.push(
      <N k="danger" key="back">
        <b>Parcela já marcada como paga, conferir no banco:</b>{' '}
        {back.map((t) => `${t.memo} ${fmtC(t.cents)}`).join('; ')}.{' '}
        {pl ? 'Foram pagas' : 'Foi paga'} antecipadamente e{' '}
        {pl ? 'voltaram cobradas' : 'voltou cobrada'} nesta fatura. {pl ? 'Ficam' : 'Fica'} fora da
        divisão até você decidir em “Fora da divisão”.
      </N>,
    );
  }
  const conf = txs.filter((t) => t.pconferir);
  if (conf.length)
    out.push(
      <N k="warn" key="conf">
        <b>Conferir parcela:</b> {conf.map((t) => `${t.memo} ${fmtC(t.cents)}`).join('; ')}. Pode
        ser uma parcela que já tem decisão na memória, mas não deu para ter certeza (mesma loja,
        total e número de parcela). Nada foi aplicado; confirme no item.
      </N>,
    );
  const ant = txs.filter((t) => t.reason === 'antecipado' && t.excluded && !t.voltou);
  const man = txs.filter((t) => t.reason === 'manual' && t.excluded && t.pmem);
  if (ant.length || man.length)
    out.push(
      <N k="info" key="pmem">
        <b>Memória de parcelas:</b>{' '}
        {[
          ant.length
            ? `${ant.length} parcela(s) paga(s) antecipadamente (${fmtC(sum(ant.map((t) => t.cents)))})`
            : '',
          man.length
            ? `${man.length} tirada(s) da divisão (${fmtC(sum(man.map((t) => t.cents)))})`
            : '',
        ]
          .filter(Boolean)
          .join(' e ')}{' '}
        ficaram fora. Dá para incluir de volta em “Fora da divisão”.
      </N>,
    );
  const paid = txs.filter((t) => t.reason === 'pago' && t.excluded);
  if (paid.length)
    out.push(
      <N k="info" key="paid">
        <b>{paid.length} compra(s) já paga(s)</b> detectada(s) —{' '}
        {fmtC(sum(paid.map((t) => t.cents)))}. Ficaram fora da divisão; dá para incluir de volta em
        “Fora da divisão”.
      </N>,
    );
  const est = txs.filter((t) => t.kind === 'estorno' && t.excluded);
  if (est.length)
    out.push(
      <N k="warn" key="est">
        <b>{est.length} estorno(s) para conferir</b> — {fmtC(-sum(est.map((t) => t.cents)))}.
      </N>,
    );
  const amb = txs.filter((t) => t.kind === 'pagamento' && t.payState === 'ambiguo' && t.excluded);
  if (amb.length)
    out.push(
      <N k="warn" key="amb">
        <b>{amb.length} pagamento(s)</b> batem com mais de uma compra. Escolha qual foi paga em
        “Fora da divisão”.
      </N>,
    );
  const mism = new Map<string, Tx>();
  txs.filter((t) => t.eachMismatch && !t.excluded).forEach((t) => mism.set(t.norm, t));
  mism.forEach((t) =>
    out.push(
      <N k="warn" key={'mism' + t.norm}>
        Regra “uma para cada pessoa”: esperava <b>{t.eachMismatch!.expected}</b> cobrança(s) de “
        {t.memo}” e vieram <b>{t.eachMismatch!.got}</b>. Nada foi preenchido para não errar: atribua
        manualmente.
      </N>,
    ),
  );
  if (eachBad.size)
    out.push(
      <N k="danger" key="eachbad">
        <b>A mesma pessoa está em duas cobranças iguais</b> que são “uma para cada pessoa”. Corrija
        para liberar as mensagens.
      </N>,
    );
  const allSame = new Map<string, Tx>();
  txs
    .filter(
      (t) =>
        t.kind === 'compra' &&
        !t.charge &&
        !t.excluded &&
        !c.d.ruleEach[t.norm] &&
        t.owners.length === 1,
    )
    .forEach((t) => {
      const g = repeatGroup(c, t);
      if (g.length > 1 && g.every((x) => x.owners.length === 1 && x.owners[0] === t.owners[0]))
        allSame.set(t.norm, t);
    });
  allSame.forEach((t) =>
    out.push(
      <N k="warn" key={'same' + t.norm}>
        “{t.memo}” aparece {repeatGroup(c, t).length}× e todas estão com{' '}
        <b>{personById(c, t.owners[0])?.nome || ''}</b>. Se cada uma é de uma pessoa, use “Uma para
        cada pessoa” no item.
      </N>,
    ),
  );
  const seqBad = txs.filter((t) => t.seqWarn && !t.excluded);
  if (seqBad.length)
    out.push(
      <N k="warn" key="seq">
        <b>{seqBad.length} parcela(s) fora da sequência</b> comparando com {seq.prevLabel}:{' '}
        {seqBad
          .slice(0, 4)
          .map((t) => t.memo + ' (' + t.seqWarn + ')')
          .join('; ')}
        {seqBad.length > 4 ? '…' : ''}.
      </N>,
    );
  if (seq.missing.length)
    out.push(
      <N k="info" key="miss">
        <b>
          {seq.missing.length} parcela(s) de {seq.prevLabel} não vieram nesta fatura:
        </b>{' '}
        {seq.missing
          .slice(0, 5)
          .map((m) => `${m.memo} (esperada ${m.cur}/${m.tot}, ${fmtC(m.cents)})`)
          .join('; ')}
        {seq.missing.length > 5 ? '…' : ''}. Confira se foi antecipada, cancelada ou caiu em outro
        cartão.
      </N>,
    );
  const dups = txs.filter((t) => t.maybeDup);
  if (dups.length)
    out.push(
      <N k="warn" key="dup">
        <b>Possível cobrança duplicada:</b>{' '}
        {uniq(dups.map((t) => `${t.memo} ${fmtC(t.cents)} em ${ddmm(t.date)}`)).join('; ')}. Confira
        no app do banco antes de cobrar.
      </N>,
    );
  if (txs.some((t) => t.fitidWarn))
    out.push(
      <N k="warn" key="fitid">
        Há lançamentos com o mesmo identificador (FITID) que não parecem parcelas de uma mesma
        compra (parcela repetida, fora de 1 a t, ou loja/total diferentes) ou que parecem compras
        diferentes (mostradas separadas, sem somar). Confira um a um.
      </N>,
    );
  return <div id="reviewNotices">{out}</div>;
}

export function Ledger({ c }: { c: Ctx }) {
  const { txs, fileInfo } = c.inv;
  const ofx = txs.filter((t) => !t.charge);
  const g = (f: (t: Tx) => boolean) => {
    const a = ofx.filter(f);
    return { n: a.length, c: sum(a.map((t) => t.cents)) };
  };
  const inc = g((t) => !t.excluded),
    paid = g((t) => t.reason === 'pago' && t.excluded),
    payQ = g((t) => t.kind === 'pagamento' && t.payState === 'quitou'),
    payA = g((t) => t.kind === 'pagamento' && t.payState !== 'quitou'),
    est = g((t) => t.kind === 'estorno' && t.excluded),
    ant = g((t) => t.reason === 'antecipado' && t.excluded),
    oth = g(
      (t) => t.excluded && !['pago', 'pagamento', 'estorno', 'antecipado'].includes(t.reason),
    );
  const fx = txs.filter((t) => t.charge && !t.excluded);
  const parts = inc.c + paid.c + payQ.c + payA.c + est.c + ant.c + oth.c;
  const sg = (fileInfo?.buySign ?? 1) < 0 ? -1 : 1,
    fileTotal = sg * sum((fileInfo?.lines || []).map((l) => l.cents));
  const skipN = fileInfo?.skipped?.length || 0;
  const okSum = parts === fileTotal && !skipN; // linha ilegível nunca deixa "✓ confere"
  const linesN = fileInfo?.lines.length || 0;
  const tagRows = c.d.tags
    .map((tg) => ({ tg, a: txs.filter((t) => !t.excluded && (t.tags || []).includes(tg.id)) }))
    .filter((x) => x.a.length);
  const grey = { color: 'var(--ink-2)' };
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!okSum && ref.current) ref.current.open = true;
  });
  return (
    <details className="ledger" id="ledger" ref={ref}>
      <summary>
        <span className="lbl">Conferência da fatura</span>
        <span id="ledgerSum">
          <span className="num">a dividir {fmtC(inc.c + sum(fx.map((t) => t.cents)))}</span>{' '}
          {okSum ? (
            <span className="okmark">✓ confere</span>
          ) : skipN ? (
            <span className="badmark">⚠ {skipN} linha(s) não lida(s)</span>
          ) : (
            <span className="badmark">⚠ não fecha</span>
          )}
        </span>
        <span className="chev">▼</span>
      </summary>
      <table className="ltable" id="ledgerTable">
        <tbody>
          <tr>
            <td colSpan={3} style={grey}>
              {linesN} linhas no arquivo → {ofx.length} lançamentos (encargos como IOF somados à
              compra do mesmo identificador)
            </td>
          </tr>
          {skipN > 0 && (
            <tr>
              <td colSpan={3}>
                <span className="badmark">
                  ⚠ {skipN} linha(s) com valor ilegível não foram lidas e estão fora desta soma
                </span>
              </td>
            </tr>
          )}
          <LRow l="A dividir (compras do cartão)" o={inc} />
          <LRow l="Já pagas (fora)" o={paid} />
          <LRow l="Pagamentos que quitaram essas compras" o={payQ} />
          <LRow l="Pagamento da fatura anterior / sem par" o={payA} />
          <LRow l="Estornos (fora)" o={est} />
          {ant.n > 0 && <LRow l="Parcelas pagas antecipadamente (fora)" o={ant} />}
          <LRow l="Outros fora da divisão" o={oth} />
          <tr className="total">
            <td>Soma = saldo do arquivo</td>
            <td className="n"></td>
            <td className="num">
              {fmtC(parts)}{' '}
              {okSum ? (
                <span className="okmark">✓</span>
              ) : parts === fileTotal ? (
                <span className="badmark">⚠</span>
              ) : (
                <span className="badmark">≠ {fmtC(fileTotal)}</span>
              )}
            </td>
          </tr>
          {fileInfo?.ledger != null && (
            <tr>
              <td colSpan={2} style={grey}>
                Saldo informado pelo banco no arquivo
              </td>
              <td className="num" style={grey}>
                {fmtC(sg * fileInfo.ledger)}
              </td>
            </tr>
          )}
          {fx.length > 0 && (
            <tr>
              <td>Cobranças fixas (fora do OFX)</td>
              <td className="n">{fx.length}</td>
              <td className="num">{fmtC(sum(fx.map((t) => t.cents)))}</td>
            </tr>
          )}
          {tagRows.length > 0 && (
            <tr>
              <td colSpan={3} style={{ ...grey, fontWeight: 600 }}>
                Por tag (itens na divisão)
              </td>
            </tr>
          )}
          {tagRows.map(({ tg, a }) => (
            <tr key={tg.id}>
              <td>
                <span className="utag static" style={{ ['--tc' as string]: safeColor(tg.cor) }}>
                  {tg.nome}
                </span>
              </td>
              <td className="n">{a.length}</td>
              <td className="num">{fmtC(sum(a.map((t) => t.cents)))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function LRow({ l, o }: { l: string; o: { n: number; c: number } }) {
  return (
    <tr>
      <td>{l}</td>
      <td className="n">{o.n}</td>
      <td className="num">{fmtC(o.c)}</td>
    </tr>
  );
}
