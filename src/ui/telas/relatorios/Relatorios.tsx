/** Tela de relatórios dos meses fechados (renderReports do v3): por pessoa ou por tag, com período e resumo. */
import { useMemo, useState } from 'react';
import { fmtC, sum } from '../../../lib/money';
import { reportData, type ReportMode, type ReportPeriod } from '../../../lib/reports';
import { activePeople } from '../../../lib/state';
import type { Ctx } from '../../../lib/types';
import { StackedChart } from '../grafico/StackedChart';
import '../grafico/grafico.css';

export interface RelatoriosProps {
  ctx: Ctx;
}

const PERIODOS: [ReportPeriod, string][] = [
  ['3', 'Últimos 3 meses'],
  ['6', 'Últimos 6 meses'],
  ['12', 'Últimos 12 meses'],
  ['all', 'Tudo'],
];

export function Relatorios({ ctx }: RelatoriosProps) {
  const [mode, setMode] = useState<ReportMode>('pessoa');
  const [period, setPeriod] = useState<ReportPeriod>('6');
  const [person, setPerson] = useState('');
  const d = useMemo(() => reportData(ctx, mode, period, person), [ctx, mode, period, person]);

  if (!ctx.d.history.length)
    return (
      <div className="rg">
        <p className="empty">
          Feche pelo menos um mês para ver relatórios. Com 2 ou 3 meses fechados dá para ver a
          evolução por pessoa e por tag.
        </p>
      </div>
    );

  const totals = d.months.map((m) => sum(d.series.map((s) => d.value(m.key, s.key))));
  const last = totals.at(-1) || 0,
    prev = totals.length > 1 ? totals.at(-2)! : null,
    avg = totals.length ? Math.round(sum(totals) / totals.length) : 0,
    delta = prev != null ? last - prev : null;
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

  return (
    <div className="rg" data-testid="relatorios">
      <div className="rep-controls">
        <div className="seg" role="group" aria-label="Agrupar por">
          <button aria-pressed={mode === 'pessoa'} onClick={() => setMode('pessoa')}>
            Por pessoa
          </button>
          <button aria-pressed={mode === 'tag'} onClick={() => setMode('tag')}>
            Por tag
          </button>
        </div>
        <label className="sr" htmlFor="repPeriod">
          Período
        </label>
        <select
          id="repPeriod"
          className="field"
          value={period}
          onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
        >
          {PERIODOS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        {mode === 'tag' && (
          <>
            <label className="sr" htmlFor="repPerson">
              Pessoa
            </label>
            <select
              id="repPerson"
              className="field"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              <option value="">Valor total dos itens</option>
              {activePeople(ctx).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      <p className="rep-sum">
        <span>
          Último mês ({d.months.at(-1)?.full || ''}) <b className="num">{fmtC(last)}</b>
        </span>
        {delta != null && (
          <span>
            vs. anterior{' '}
            <b className={'num ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : '')}>
              {sign(delta)}
              {fmtC(Math.abs(delta))}
              {prev ? ` (${sign(delta)}${Math.abs(Math.round((delta / prev) * 100))}%)` : ''}
            </b>
          </span>
        )}
        <span>
          Média por mês <b className="num">{fmtC(avg)}</b>
        </span>
      </p>
      <StackedChart
        months={d.months}
        series={d.series}
        value={d.value}
        title={
          mode === 'pessoa'
            ? 'Valor por pessoa em cada mês fechado'
            : 'Valor por tag em cada mês fechado'
        }
      />
      {mode === 'tag' ? (
        <p className="help">
          Um item com duas tags entra nas duas; por isso a soma das tags pode passar do total do
          mês.
          {person
            ? ''
            : ' Valores pelo total de cada item; escolha uma pessoa para ver só a parte dela.'}
        </p>
      ) : (
        <p className="help">Parte de cada pessoa nos itens divididos (cartão e cobranças fixas).</p>
      )}
      {d.months.length < 2 && (
        <p className="help">Com mais meses fechados o gráfico mostra a evolução.</p>
      )}
    </div>
  );
}
