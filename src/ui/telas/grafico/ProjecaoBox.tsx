/** Bloco "compromissos futuros": resumo por pessoa, gráfico empilhado e lista de parcelas em andamento (projectionHTML do v3). */
import { fmtC } from '../../../lib/money';
import { monthShort } from '../../../lib/dates';
import type { ProjListItem, Projection } from '../../../lib/projection';
import { safeColor } from '../../../lib/state';
import { StackedChart } from './StackedChart';
import './grafico.css';

export interface ProjecaoBoxProps {
  projection: Projection;
  /** Complemento da mensagem de vazio, ex.: "nesta fatura". */
  context?: string;
}

function Parcela({ i }: { i: ProjListItem }) {
  const pct = Math.round((i.parcela.cur / i.parcela.tot) * 100);
  return (
    <li className="pitem">
      <div className="pi-top">
        <span className="pi-name">{i.memo}</span>
        <b className="num">{fmtC(i.remainingCents)}</b>
      </div>
      <div className="meter" role="img" aria-label={`Parcela ${i.parcela.cur} de ${i.parcela.tot}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="pi-meta">
        <span>
          {i.parcela.cur}/{i.parcela.tot} · faltam {i.remaining} × {fmtC(i.cents)}
          {i.skipped ? ` · ${i.skipped} já fora (memória de parcelas)` : ''}
        </span>
        <span>termina em {monthShort(i.endComp)}</span>
        <span>
          {i.shares.map((s) => (
            <span className="mini" key={s.key}>
              <span className="dot" style={{ background: safeColor(s.cor) }} />
              {s.nome} {fmtC(s.cents)}
            </span>
          ))}
        </span>
      </div>
    </li>
  );
}

export function ProjecaoBox({ projection: pr, context }: ProjecaoBoxProps) {
  if (!pr.months.length)
    return (
      <div className="rg">
        <p className="empty">Nenhuma parcela futura{context ? ' ' + context : ''}.</p>
      </div>
    );
  const first = pr.list.slice(0, 6),
    rest = pr.list.slice(6);
  return (
    <div className="rg">
      <div className="proj-people">
        {pr.series.map((s) => (
          <div className="prow2" key={s.key}>
            <span className="who">
              <span className="dot" style={{ background: safeColor(s.cor) }} />
              {s.nome}
            </span>
            <span className="help">
              {pr.months[0]!.label}:{' '}
              <b className="num">{fmtC(pr.value(pr.months[0]!.key, s.key))}</b>
            </span>
            <span className="help">até {monthShort(pr.lastMonthOf(s.key))}</span>
            <span className="help">
              total{' '}
              <b className="num" style={{ color: 'var(--ink)', fontSize: '.95rem' }}>
                {fmtC(pr.totalOf(s.key))}
              </b>
            </span>
          </div>
        ))}
      </div>
      <StackedChart
        months={pr.months}
        series={pr.series}
        value={pr.value}
        title="Valor comprometido por mês, por pessoa"
      />
      {pr.list.length > 0 && (
        <>
          <h4 className="ph">
            Parcelas em andamento <span className="help">{pr.list.length}</span>
          </h4>
          <ul className="plist">
            {first.map((i, k) => (
              <Parcela key={k} i={i} />
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="more">
              <summary>Ver mais {rest.length}</summary>
              <ul className="plist">
                {rest.map((i, k) => (
                  <Parcela key={k} i={i} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {pr.rec.length > 0 && (
        <p className="help">
          Inclui {pr.rec.length} cobrança(s) fixa(s) mensal(is) pelos próximos {pr.months.length}{' '}
          meses.
        </p>
      )}
    </div>
  );
}
