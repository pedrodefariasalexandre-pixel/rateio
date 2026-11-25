/** Shell do app: topbar do v3 (logo, etapas da fatura e botões de ícone) + a tela da vez. */
import { useEffect, useState } from 'react';
import './shell.css';
import { openBalances } from '../lib/receivables';
import { useRateio } from './AppContext';
import { PessoasMemoriaAba } from './telas';
import { FaturaFlow, STEPS, type Step } from './screens/main/FaturaFlow';
import {
  BackupNagTopo,
  CobrancasTela,
  ConfigTela,
  HistoricoTela,
  RelatoriosTela,
} from './telas/adapters';

const NAV = [
  ['Relatórios', '📊', 'Relatórios'],
  ['Histórico', '🗂', 'Histórico e recebimentos'],
  ['Cobranças', '📌', 'Cobranças fixas'],
  ['Pessoas', '👥', 'Pessoas & memória'],
  ['Config', '⚙️', 'Configurações e backup'],
] as const;
type Tab = 'Fatura' | (typeof NAV)[number][0];

export function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { undo, ctx } = useRateio();
  const [tab, setTab] = useState<Tab>('Fatura');
  const [step, setStep] = useState<Step>(ctx.inv.txs.length ? 'sReview' : 'sImport');
  const open = openBalances(ctx).length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/INPUT|TEXTAREA/.test(t.tagName)) {
        e.preventDefault();
        undo();
      }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [undo]);
  const idx = STEPS.findIndex(([s]) => s === step);
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <button
            className="logo"
            aria-label="Fatura"
            aria-current={tab === 'Fatura' ? 'page' : undefined}
            onClick={() => setTab('Fatura')}
          >
            <i aria-hidden="true">÷</i>rateio
          </button>
          <nav className="steps" aria-label="Etapas">
            {STEPS.map(([s, l], i) => (
              <span
                key={s}
                data-step={s}
                className={tab === 'Fatura' && i === idx ? 'on' : undefined}
              >
                {l}
              </span>
            ))}
          </nav>
          <nav className="topnav" aria-label="Seções">
            {NAV.map(([t, icon, title]) => (
              <button
                key={t}
                className="btn ghost small"
                title={title}
                aria-label={t === 'Histórico' && open ? `${title}: ${open} pessoa(s) em aberto` : t}
                aria-current={t === tab ? 'page' : undefined}
                onClick={() => setTab(t)}
              >
                {icon}
                <span className="lbl" aria-hidden="true">
                  {t}
                </span>
                {t === 'Histórico' && open > 0 && <span className="nbadge">{open}</span>}
              </button>
            ))}
            <button className="btn ghost small" title="Sair" aria-label="Sair" onClick={onSignOut}>
              ⎋
              <span className="lbl" aria-hidden="true">
                Sair
              </span>
            </button>
          </nav>
        </div>
      </header>
      <main className="wrap">
        <BackupNagTopo />
        {tab === 'Fatura' ? (
          <FaturaFlow step={step} setStep={setStep} />
        ) : tab === 'Histórico' ? (
          <HistoricoTela />
        ) : tab === 'Relatórios' ? (
          <RelatoriosTela />
        ) : tab === 'Cobranças' ? (
          <CobrancasTela />
        ) : tab === 'Pessoas' ? (
          <PessoasMemoriaAba />
        ) : (
          <ConfigTela />
        )}
      </main>
    </>
  );
}
