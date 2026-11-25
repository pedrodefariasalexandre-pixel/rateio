/** Projeção de parcelas (gráfico SVG de colunas empilhadas + lista), igual ao v3. Sem biblioteca. */
import { useRef, useState, type CSSProperties } from 'react';
import { monthShort } from '../../../../lib/dates';
import { fmtC, sum } from '../../../../lib/money';
import type { ChartMonth, Projection as Proj, Series } from '../../../../lib/projection';
import { compactBRL, niceMax, wholeBRL } from '../../../../lib/reports';
import { safeColor } from '../../../../lib/state';

const roundTop = (x: number, y: number, w: number, h: number, r: number): string => {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
const mc = (c: string) => ({ '--mc': c }) as CSSProperties;

/** months:[{key,label,full}] · series:[{key,nome,cor}] · value(mKey,sKey)→centavos. */
export function StackedChart({
  months,
  series,
  value,
  title,
}: {
  months: ChartMonth[];
  series: Pick<Series, 'key' | 'nome' | 'cor'>[];
  value: (mk: string, sk: string) => number;
  title: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ i: number; left: number } | null>(null);

  const W = 640,
    H = 230,
    padL = 64,
    padR = 10,
    padT = 24,
    padB = 30;
  const totals = months.map((m) => sum(series.map((s) => Math.max(0, value(m.key, s.key)))));
  const max = niceMax(Math.max(0, ...totals));
  const plotH = H - padT - padB,
    plotW = W - padL - padR,
    band = plotW / Math.max(1, months.length),
    bw = Math.min(24, band * 0.56);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const maxI = totals.indexOf(Math.max(...totals));

  const show = (i: number, el: Element) => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!wrap) return;
    const r = el.getBoundingClientRect();
    const half = (tipRef.current?.offsetWidth || 180) / 2;
    const left = Math.min(
      Math.max(r.left - wrap.left + r.width / 2, half),
      Math.max(half, wrap.width - half),
    );
    setTip({ i, left });
  };
  const hide = () => setTip(null);

  const tipMonth = tip ? months[tip.i] : null;
  const tipSegs = tip
    ? series
        .map((s) => ({ s, v: Math.max(0, value(months[tip.i]!.key, s.key)) }))
        .filter((z) => z.v > 0)
    : [];

  return (
    <figure className="chart" data-chart-root>
      <div className="chart-wrap" ref={wrapRef}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line
                className="grid"
                x1={padL}
                x2={W - padR}
                y1={y(t).toFixed(1)}
                y2={y(t).toFixed(1)}
              />
              <text className="tick" x={padL - 8} y={(y(t) + 4).toFixed(1)} textAnchor="end">
                {compactBRL(t)}
              </text>
            </g>
          ))}
          {months.map((m, i) => {
            const cx = padL + band * i + band / 2,
              x = cx - bw / 2;
            const segs = series
              .map((s) => ({ s, v: Math.max(0, value(m.key, s.key)) }))
              .filter((z) => z.v > 0);
            let acc = 0;
            return (
              <g key={m.key}>
                {segs.map((z, j) => {
                  const y0 = y(acc),
                    y1 = y(acc + z.v);
                  acc += z.v;
                  const hgt = Math.max(0.5, y0 - y1 - (j > 0 ? 2 : 0)),
                    c = safeColor(z.s.cor);
                  return j === segs.length - 1 ? (
                    <path
                      key={z.s.key}
                      className="mk"
                      style={mc(c)}
                      d={roundTop(x, y1, bw, hgt, 4)}
                      fill={c}
                    />
                  ) : (
                    <rect
                      key={z.s.key}
                      className="mk"
                      style={mc(c)}
                      x={x.toFixed(1)}
                      y={y1.toFixed(1)}
                      width={bw.toFixed(1)}
                      height={hgt.toFixed(1)}
                      fill={c}
                    />
                  );
                })}
                {totals[i]! > 0 && (i === 0 || i === maxI) && (
                  <text
                    className="cap"
                    x={cx.toFixed(1)}
                    y={(y(totals[i]!) - 7).toFixed(1)}
                    textAnchor="middle"
                  >
                    {wholeBRL(totals[i]!)}
                  </text>
                )}
                <text className="xl" x={cx.toFixed(1)} y={H - 10} textAnchor="middle">
                  {m.label}
                </text>
                <rect
                  className={'hit' + (tip?.i === i ? ' on' : '')}
                  x={(padL + band * i).toFixed(1)}
                  y={padT}
                  width={band.toFixed(1)}
                  height={plotH}
                  data-col={i}
                  tabIndex={0}
                  role="button"
                  aria-label={`${m.full || m.label}: ${fmtC(totals[i]!)}`}
                  onPointerOver={(e) => show(i, e.currentTarget)}
                  onFocus={(e) => show(i, e.currentTarget)}
                  onPointerOut={hide}
                  onBlur={hide}
                />
              </g>
            );
          })}
        </svg>
        <div
          className="chart-tip"
          ref={tipRef}
          hidden={!tip}
          style={tip ? { left: tip.left + 'px' } : undefined}
        >
          {tip && tipMonth && (
            <>
              <b>{tipMonth.full || tipMonth.label}</b>
              {tipSegs
                .slice()
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
                <span className="num">{fmtC(totals[tip.i]!)}</span>
              </div>
            </>
          )}
        </div>
      </div>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <i className="mk" style={mc(safeColor(s.cor))} />
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

/** Pessoas + gráfico + lista de parcelas em andamento. */
export function ProjectionView({ pr, context }: { pr: Proj; context?: string }) {
  if (!pr.months.length)
    return <p className="empty">Nenhuma parcela futura{context ? ' ' + context : ''}.</p>;
  const first = pr.list.slice(0, 6),
    rest = pr.list.slice(6);
  const item = (i: Proj['list'][number], k: number) => {
    const pct = Math.round((i.parcela.cur / i.parcela.tot) * 100);
    return (
      <li className="pitem" key={i.memo + k}>
        <div className="pi-top">
          <span className="pi-name">{i.memo}</span>
          <b className="num">{fmtC(i.remainingCents)}</b>
        </div>
        <div
          className="meter"
          role="img"
          aria-label={`Parcela ${i.parcela.cur} de ${i.parcela.tot}`}
        >
          <span style={{ width: pct + '%' }} />
        </div>
        <div className="pi-meta">
          <span>
            {i.parcela.cur}/{i.parcela.tot} · faltam {i.remaining} × {fmtC(i.cents)}
            {i.skipped ? ` · ${i.skipped} já fora (memória de parcelas)` : ''}
          </span>
          <span>termina em {monthShort(i.endComp)}</span>
          <span>
            {i.shares.map((s) => (
              <span key={s.key}>
                <span className="mini">
                  <span className="dot" style={{ background: safeColor(s.cor) }} />
                  {s.nome} {fmtC(s.cents)}
                </span>{' '}
              </span>
            ))}
          </span>
        </div>
      </li>
    );
  };
  return (
    <>
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
          <ul className="plist">{first.map(item)}</ul>
          {rest.length > 0 && (
            <details className="more">
              <summary>Ver mais {rest.length}</summary>
              <ul className="plist">{rest.map((i, k) => item(i, k + 6))}</ul>
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
    </>
  );
}
