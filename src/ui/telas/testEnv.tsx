/** Ambiente de teste das telas: mesmo contrato do shell, com estado local e diálogos que respondem sim. */
import { useState, type ReactNode } from 'react';
import type { Ctx } from '../../lib/types';
import type { Env } from './env';

export interface Spy {
  toasts: string[];
  confirms: string[];
  count(): void;
  commits: number;
  answer: boolean;
  promptAnswer: string | null;
}

function restaurar(c: Ctx, d: Ctx['d']) {
  c.d = d;
}

export function TestEnv({
  ctx,
  spy,
  children,
}: {
  ctx: Ctx;
  spy: Spy;
  children: (env: Env) => ReactNode;
}) {
  const [, setN] = useState(0);
  const env: Env = {
    ctx,
    async commit(fn) {
      const snap = structuredClone(ctx.d);
      const erro = fn(ctx);
      if (typeof erro === 'string' && erro) {
        restaurar(ctx, snap);
        return false;
      }
      spy.count();
      setN((n) => n + 1);
      return true;
    },
    toast: (m) => void spy.toasts.push(m),
    confirm: async (m) => (spy.confirms.push(m), spy.answer),
    prompt: async () => spy.promptAnswer,
  };
  return <>{children(env)}</>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const newSpy = (): Spy => ({
  toasts: [],
  confirms: [],
  commits: 0,
  count() {
    this.commits++;
  },
  answer: true,
  promptAnswer: null,
});
