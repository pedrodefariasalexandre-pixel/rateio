/** Página usada só pelo E2E (E2E_HARNESS=1 no build): monta Relatórios e a Projeção com dados sintéticos. */
import { createRoot } from 'react-dom/client';
import { ctxRelatorios } from './fixtureRelatorios';
import { Relatorios } from './Relatorios';
import { ProjecaoBox } from '../grafico';
import { buildProjection, historyProjItems } from '../../../lib/projection';

const c = ctxRelatorios();
const h = c.d.history[0]!;
const item = historyProjItems(c, h)[0]!;
const pr = buildProjection(c, [{ ...item, parcela: { cur: 2, tot: 5 } }], '2026-10');

createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}>
    <Relatorios ctx={c} />
    <h2>Projeção</h2>
    <ProjecaoBox projection={pr} context="nesta fatura" />
  </main>,
);
