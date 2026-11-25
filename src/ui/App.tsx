import { isSupabaseConfigured } from '../data/supabase';
import { fmtC } from '../lib/money';

export function App() {
  return (
    <main className="shell">
      <h1>Rateio</h1>
      <p>Esqueleto do port do rateio-v3. As telas ainda não foram portadas.</p>
      <p className="muted">
        Banco: {isSupabaseConfigured ? 'configurado' : 'não configurado (.env.local)'} · Exemplo de
        formatação: {fmtC(123456)}
      </p>
    </main>
  );
}
