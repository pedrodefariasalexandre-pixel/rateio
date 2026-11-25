/** Etapa 3 — Mensagens prontas: texto por pessoa, copiar/WhatsApp, CSV, projeção e fechar o mês. */
import { useState } from 'react';
import { backupText } from '../../../../lib/backup';
import { canClose, closeMonth } from '../../../../lib/closeMonth';
import { csvMonth } from '../../../../lib/csv';
import { dateBR } from '../../../../lib/dates';
import { fmtC } from '../../../../lib/money';
import { allMessages, monthLabel, msgContext, waLink } from '../../../../lib/message';
import { curProjection } from '../../../../lib/projection';
import { computeTotals } from '../../../../lib/split';
import { safeColor } from '../../../../lib/state';
import type { Settings } from '../../../../lib/types';
import { useRateio } from '../../../AppContext';
import { useConfirm } from '../../../base/confirm';
import { ProjectionView } from './Projection';

/** Copia pelo navegador; sem permissão, mostra o texto para copiar à mão (como o v3). */
function copyText(txt: string, done: (ok: boolean) => void, hint = 'Copie o texto (Ctrl+C):') {
  const manual = () => done(window.prompt(hint, txt) !== null);
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => done(true), manual);
  else manual();
}

function download(name: string, text: string, type: string, fail: () => void) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    fail();
  }
}

export function FinalScreen({ onBack, onClosed }: { onBack: () => void; onClosed: () => void }) {
  const { ctx: c, commit, bump, toast } = useRateio();
  const ask = useConfirm();
  const [edits, setEdits] = useState<Map<string, string>>(() => new Map());
  const [copied, setCopied] = useState<string | null>(null);
  const [bkCopied, setBkCopied] = useState(false);

  const s = c.d.settings;
  const mctx = msgContext(c);
  const cards = allMessages(c, mctx);
  const label = monthLabel(c);
  const done = c.d.history.find((h) => h.comp === c.inv.comp);
  const needBk = !!done && (!s.lastBackup || s.lastBackup < done.closedAt);
  const pr = mctx.proj || curProjection(c);
  const paidNoOwner = c.inv.txs.filter(
    (t) =>
      t.reason === 'pago' &&
      t.excluded &&
      t.parcela &&
      t.parcela.cur < t.parcela.tot &&
      !t.owners.length,
  );

  const setSetting = (
    k: keyof Pick<Settings, 'msgPending' | 'msgProjection' | 'projRecurring'>,
    v: boolean,
  ) =>
    void commit(
      (x) => {
        x.d.settings[k] = v;
      },
      { undo: false },
    );

  const setEdit = (pid: string, v: string | null) =>
    setEdits((m) => {
      const n = new Map(m);
      if (v === null) n.delete(pid);
      else n.set(pid, v);
      return n;
    });

  const copy = (key: string, text: string) =>
    copyText(text, (ok) => {
      if (!ok) return;
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
    });

  const copyBackup = () =>
    copyText(
      backupText(c.d),
      (ok) => {
        if (!ok) return;
        void commit(
          (x) => {
            x.d.settings.lastBackup = new Date().toISOString();
          },
          { undo: false },
        );
        toast('Backup copiado');
        setBkCopied(true);
        setTimeout(() => setBkCopied(false), 2500);
      },
      'Copie o texto (Ctrl+C) e guarde numa conversa sua no WhatsApp:',
    );

  const close = async () => {
    if (!canClose(c)) {
      toast('Há itens sem dono ou com divisão inválida. Volte e ajuste antes de fechar.', 'err');
      return;
    }
    const ok = await ask(
      done
        ? `Substituir o fechamento de ${label}?`
        : `Fechar ${label}? O resumo vai para o histórico.`,
      { ok: done ? 'Substituir' : 'Fechar mês' },
    );
    if (!ok) return;
    const snap = structuredClone(c.d);
    const saved = await commit(
      (x) => {
        closeMonth(x, edits);
      },
      { undo: false },
    );
    if (!saved) {
      // não gravou: volta tudo (contador, histórico, parcelas), como o v3
      Object.assign(c, { d: snap, hIdx: null });
      bump();
      toast(
        `${label} NÃO foi fechado: o navegador não deixou salvar (espaço cheio ou bloqueado). Nada mudou. Libere espaço ou faça um backup e tente de novo.`,
        'err',
      );
      return;
    }
    toast(`${label} fechado ✓`);
    onClosed();
  };

  return (
    <section id="sFinal">
      <div className="rhead">
        <div>
          <h2>Mensagens prontas</h2>
          <div className="sub" id="finalSub">
            {`${label} · ${fmtC(computeTotals(c).assigned)} dividido entre ${cards.length} pessoa(s)`}
          </div>
        </div>
        <button
          className="btn small"
          id="btnCsvMonth"
          style={{ marginLeft: 'auto' }}
          onClick={() =>
            download(
              `rateio-${c.inv.comp || 'mes'}.csv`,
              csvMonth(c),
              'text/csv;charset=utf-8',
              () => toast('Download bloqueado aqui.', 'err'),
            )
          }
        >
          Exportar CSV
        </button>
        <button className="btn ghost small" id="btnBack" onClick={onBack}>
          ← Voltar e ajustar
        </button>
      </div>
      <div className="msgopts" id="msgOpts">
        <span className="help" style={{ margin: 0 }}>
          Incluir na mensagem:
        </span>
        <label className="toggle">
          <input
            type="checkbox"
            checked={!!s.msgPending}
            onChange={(e) => setSetting('msgPending', e.target.checked)}
          />
          valores em aberto de meses anteriores
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={!!s.msgProjection}
            onChange={(e) => setSetting('msgProjection', e.target.checked)}
          />
          previsão das parcelas
        </label>
      </div>
      <div className="cards" id="finalCards">
        {cards.length ? (
          cards.map((m, i) => {
            const pid = m.p.id,
              value = edits.get(pid) ?? m.text,
              phone = (m.p.fone || '').replace(/\D/g, '');
            return (
              <article className="pcard" key={pid}>
                <div className="head">
                  <span className="dot" style={{ background: safeColor(m.p.cor) }} />
                  <h3>{m.p.nome}</h3>
                  <b className="num">{fmtC(m.total)}</b>
                </div>
                <textarea
                  id={`msg${i}`}
                  aria-label={`Mensagem para ${m.p.nome}`}
                  value={value}
                  onChange={(e) => setEdit(pid, e.target.value)}
                />
                {edits.has(pid) && (
                  <p className="help edited">
                    Editada à mão: opções acima não mudam este texto.{' '}
                    <button className="linkbtn" onClick={() => setEdit(pid, null)}>
                      Voltar ao texto automático
                    </button>
                  </p>
                )}
                <div className="actions">
                  <button className="btn primary" onClick={() => copy(pid, value)}>
                    {copied === pid ? 'Copiado ✓' : 'Copiar texto'}
                  </button>
                  <a
                    className="btn"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={waLink(phone, value)}
                  >
                    WhatsApp{phone ? '' : ' (escolher contato)'}
                  </a>
                </div>
              </article>
            );
          })
        ) : (
          <p className="empty">Nenhum valor atribuído.</p>
        )}
      </div>
      <div className="closebox" id="closeBox">
        <p id="closeText">
          {needBk && (
            <>
              <b>{label} fechado.</b> Guarde o backup agora para não perder o histórico.{' '}
              <button className="btn small primary" style={{ marginLeft: 6 }} onClick={copyBackup}>
                {bkCopied ? 'Copiado ✓ — cole no WhatsApp' : 'Copiar backup agora'}
              </button>
              <br />
            </>
          )}
          {done ? (
            <>
              <b>{label} já foi fechado</b> em {dateBR(done.closedAt)}. Fechar de novo substitui o
              registro no histórico (as parcelas das cobranças fixas não avançam duas vezes).
            </>
          ) : (
            <>
              Depois de mandar as mensagens, <b>feche o mês</b>: salva o resumo no histórico, avisa
              se este arquivo for importado de novo e avança as parcelas das cobranças fixas.
            </>
          )}
        </p>
        <button className="btn primary" id="btnCloseMonth" onClick={() => void close()}>
          Fechar mês
        </button>
      </div>
      <section className="proj" id="projBox" aria-labelledby="projT">
        <div className="proj-head">
          <div>
            <h3 id="projT">Compromissos futuros</h3>
            <p className="help" style={{ margin: '2px 0 0' }}>
              Parcelas desta fatura que ainda vão cair, divididas como neste mês. Estimativa pelo
              valor da parcela atual.
            </p>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={!!s.projRecurring}
              onChange={(e) => setSetting('projRecurring', e.target.checked)}
            />
            incluir cobranças fixas mensais
          </label>
        </div>
        <ProjectionView pr={pr} context="nesta fatura" />
        {paidNoOwner.length > 0 && (
          <p className="help">
            {paidNoOwner.length} compra(s) parcelada(s) já paga(s) neste mês não entram na previsão
            porque não têm dono:{' '}
            {paidNoOwner
              .slice(0, 3)
              .map((t) => t.memo)
              .join('; ')}
            {paidNoOwner.length > 3 ? '…' : ''}. As próximas parcelas delas vão aparecer nas faturas
            seguintes.
          </p>
        )}
      </section>
    </section>
  );
}
