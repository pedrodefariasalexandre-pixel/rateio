/** Abas do app. As telas são portadas em src/ui/screens/main (fatura) e src/ui/telas (demais). */
import { useEffect, useState } from 'react';
import { useRateio } from './AppContext';
import { FaturaFlow } from './screens/main/FaturaFlow';
import { PessoasMemoriaAba } from './telas';
import {
  BackupNagTopo,
  CobrancasTela,
  ConfigTela,
  HistoricoTela,
  RelatoriosTela,
} from './telas/adapters';

const TABS = ['Fatura', 'Histórico', 'Relatórios', 'Pessoas', 'Cobranças', 'Config'] as const;
type Tab = (typeof TABS)[number];

export function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('Fatura');
  const { undo } = useRateio();
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
  return (
    <div className="wrap">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 12,
        }}
      >
        <h1>Rateio</h1>
        <button className="btn" onClick={onSignOut}>
          Sair
        </button>
      </header>
      <nav className="tabs" aria-label="Seções">
        {TABS.map((t) => (
          <button key={t} aria-current={t === tab ? 'page' : undefined} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <main>
        <BackupNagTopo />
        {tab === 'Fatura' ? (
          <FaturaFlow />
        ) : tab === 'Histórico' ? (
          <HistoricoTela />
        ) : tab === 'Pessoas' ? (
          <PessoasMemoriaAba />
        ) : tab === 'Relatórios' ? (
          <RelatoriosTela />
        ) : tab === 'Cobranças' ? (
          <CobrancasTela />
        ) : tab === 'Config' ? (
          <ConfigTela />
        ) : (
          <p className="muted">Tela “{tab}” em portabilidade.</p>
        )}
      </main>
    </div>
  );
}
