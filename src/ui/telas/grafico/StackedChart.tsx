/** Gráfico de colunas empilhadas em SVG (sem biblioteca), com dica por coluna, legenda e "ver como tabela". */
import { useState, type CSSProperties } from 'react';
import { fmtC, sum } from '../../../lib/money';
import type { ChartMonth, Series } from '../../../lib/projection';
import { compactBRL, niceMax, wholeBRL } from '../../../lib/reports';
import { safeColor } from '../../../lib/state';
import './grafico.css';

export interface StackedChartProps {
  months: ChartMonth[];
  series: Pick<Series, 'key' | 'nome' | 'cor'>[];
  /** Centavos de uma série num mês. */
  value: (monthKey: string, seriesKey: string) => number;
  /** Texto de acessibilidade do gráfico. */
  title: string;
}

const W = 640,
  H = 230,
  padL = 64,
  padR = 10,
  padT = 24,
  padB = 30;

const roundTop = (x: number, y: number, w: number, h: number, r0: number): string => {
  const r = Math.min(r0, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
const mc = (cor: string | undefined) => ({ '--mc': safeColor(cor) }) as CSSProperties;

export function StackedChart({ months, series, value, title }: StackedChartProps) {
  const [on, setOn] = useState<number | null>(null);
  const totals = months.map((m) => sum(series.map((s) => Math.max(0, value(m.key, s.key)))));
  const max = niceMax(Math.max(0, ...totals));
  const plotH = H - padT - padB,
    plotW = W - padL - padR,
    band = plotW / Math.max(1, months.length),
    bw = Math.min(24, band * 0.56);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const maxI = totals.indexOf(Math.max(...totals));
  const segsOf = (m: ChartMonth) =>
    series.map((s) => ({ s, v: Math.max(0, value(m.key, s.key)) })).filter((z) => z.v > 0);

  // dica: centralizada na coluna, sem sair do gráfico
  const tipLeft = (i: number) => {
    const cx = (padL + band * i + band / 2) / W;
    return `${Math.min(Math.max(cx, 0.2), 0.8) * 100}%`;
  };

  return (
    <figure className="chart" data-chart-root style={{ margin: '8px 0 4px' }}>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line className="grid" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
              <text className="tick" x={padL - 8} y={y(t) + 4} textAnchor="end">
                {compactBRL(t)}
              </text>
            </g>
          ))}
          {months.map((m, i) => {
            const cx = padL + band * i + band / 2,
              x = cx - bw / 2,
              segs = segsOf(m);
            let acc = 0;
            return (
              <g key={m.key}>
                {segs.map((z, j) => {
                  const y0 = y(acc),
                    y1 = y(acc + z.v);
                  acc += z.v;
                  const hgt = Math.max(0.5, y0 - y1 - (j > 0 ? 2 : 0));
                  return j === segs.length - 1 ? (
                    <path
                      key={z.s.key}
                      className="mk"
                      style={mc(z.s.cor)}
                      d={roundTop(x, y1, bw, hgt, 4)}
                    />
                  ) : (
                    <rect
                      key={z.s.key}
                      className="mk"
                      style={mc(z.s.cor)}
                      x={x}
                      y={y1}
                      width={bw}
                      height={hgt}
                    />
                  );
                })}
                {totals[i]! > 0 && (i === 0 || i === maxI) && (
                  <text className="cap" x={cx} y={y(totals[i]!) - 7} textAnchor="middle">
                    {wholeBRL(totals[i]!)}
                  </text>
                )}
                <text className="xl" x={cx} y={H - 10} textAnchor="middle">
                  {m.label}
                </text>
                <rect
                  className={'hit' + (on === i ? ' on' : '')}
                  x={padL + band * i}
                  y={padT}
                  width={band}
                  height={plotH}
                  data-col={i}
                  tabIndex={0}
                  role="button"
                  aria-label={`${m.full || m.label}: ${fmtC(totals[i]!)}`}
                  onPointerEnter={() => setOn(i)}
                  onPointerLeave={() => setOn(null)}
                  onFocus={() => setOn(i)}
                  onBlur={() => setOn(null)}
                />
              </g>
            );
          })}
        </svg>
        <div
          className="chart-tip"
          hidden={on === null}
          style={{ left: on === null ? 0 : tipLeft(on) }}
        >
          {on !== null && months[on] && (
            <>
              <b>{months[on].full || months[on].label}</b>
              {segsOf(months[on])
                .reverse()
                .map((z) => (
                  <div className="tr" key={z.s.key}>
                    <span className="dot" style={{ background: safeColor(z.s.cor) }} />
                    {z.s.nome}
                    <span className="num">{fmtC(z.v)}</span>
                  </div>
                ))}
              <div className="tr tt">
                <span />
                Total
                <span className="num">{fmtC(totals[on]!)}</span>
              </div>
            </>
          )}
        </div>
      </div>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <i className="mk" style={mc(s.cor)} />
              {s.nome}
            </span>
          ))}
        </div>
      )}
      <details className="ctable">
        <summary>Ver como tabela</summary>
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                {series.map((s) => (
                  <th key={s.key}>{s.nome}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m.key}>
                  <td>{m.full || m.label}</td>
                  {series.map((s) => (
                    <td className="num" key={s.key}>
                      {fmtC(value(m.key, s.key))}
                    </td>
                  ))}
                  <td className="num">
                    <b>{fmtC(totals[i]!)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
