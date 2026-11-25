/** Abas do app. As telas são portadas em src/ui/screens/main (fatura) e src/ui/telas (demais). */
import { useEffect, useState } from 'react';
import { useRateio } from './AppContext';
import { FaturaFlow } from './screens/main/FaturaFlow';
import { Relatorios } from './telas';

const TABS = ['Fatura', 'Histórico', 'Relatórios', 'Pessoas', 'Cobranças', 'Config'] as const;
type Tab = (typeof TABS)[number];

export function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('Fatura');
  const { undo, ctx } = useRateio();
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
        {tab === 'Fatura' ? (
          <FaturaFlow />
        ) : tab === 'Relatórios' ? (
          <Relatorios ctx={ctx} />
        ) : (
          <p className="muted">Tela “{tab}” em portabilidade.</p>
        )}
      </main>
    </div>
  );
}
