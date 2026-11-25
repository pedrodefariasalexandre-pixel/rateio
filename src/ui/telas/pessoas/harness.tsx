/** Só para o E2E (servidor de desenvolvimento): monta a tela com dados sintéticos. Não entra no build. */
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { ctxSintetico } from './fixture';
import { PessoasMemoria } from './PessoasMemoria';

const ctx = ctxSintetico();
const salvos: string[] = [];
(window as unknown as { __harness: unknown }).__harness = { ctx, salvos };
createRoot(document.getElementById('root')!).render(
  <PessoasMemoria ctx={ctx} onChange={(parte) => salvos.push(parte)} />,
);
