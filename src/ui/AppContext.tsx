/* eslint-disable react-hooks/preserve-manual-memoization -- Ctx é mutável por desenho (regras de src/lib) */
/** Estado do app: Ctx mutável (regras de src/lib), gravação do estado inteiro, desfazer e aviso. */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Repo } from '../data/repo';
import { newCtx } from '../lib/state';
import { todayISO } from '../lib/dates';
import { pushUndo, undoLast } from '../lib/undo';
import type { Ctx, Data } from '../lib/types';

export type ToastKind = 'ok' | 'err';
export interface Rateio {
  ctx: Ctx;
  /** Snapshot p/ desfazer (padrão), roda fn; string = erro (não grava). Depois re-renderiza e grava. */
  commit(fn: (c: Ctx) => void | string, opts?: { undo?: boolean }): Promise<boolean>;
  /** Re-renderiza sem gravar (estado só de tela). */
  bump(): void;
  undo(): void;
  toast(msg: string, kind?: ToastKind): void;
  repo: Repo;
  /** Recarrega do banco (após restaurar backup). */
  reload(): Promise<void>;
}

const Ctx_ = createContext<Rateio | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useRateio(): Rateio {
  const r = useContext(Ctx_);
  if (!r) throw new Error('useRateio fora do RateioProvider');
  return r;
}

export function RateioProvider({
  repo,
  initial,
  children,
}: {
  repo: Repo;
  initial: Data;
  children: ReactNode;
}) {
  const [ctx] = useState<{ current: Ctx }>(() => ({ current: newCtx(initial, todayISO()) }));
  const undoStack = useRef<string[]>([]);
  const [v, setV] = useState(0);
  const [saveErr, setSaveErr] = useState('');
  const [toastMsg, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const bump = useCallback(() => setV((v) => v + 1), []);
  const toast = useCallback((msg: string, kind: ToastKind = 'ok') => {
    setToast({ msg, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  const save = useCallback(() => {
    const snap = structuredClone(ctx.current.d);
    const p = queue.current.then(() => repo.save(snap));
    queue.current = p.catch(() => {});
    return p.then(
      () => (setSaveErr(''), true),
      (e: Error) => (setSaveErr('Não consegui salvar: ' + e.message + '. Tente de novo.'), false),
    );
  }, [repo, ctx]);

  const value = useMemo<Rateio>(
    () => ({
      ctx: ctx.current,
      repo,
      bump,
      toast,
      async commit(fn, opts) {
        if (opts?.undo !== false) pushUndo(ctx.current, undoStack.current);
        const err = fn(ctx.current);
        if (typeof err === 'string' && err) {
          if (opts?.undo !== false) undoStack.current.pop();
          toast(err, 'err');
          return false;
        }
        bump();
        return save();
      },
      undo() {
        if (!undoLast(ctx.current, undoStack.current)) return toast('Nada para desfazer.');
        bump();
        void save();
      },
      async reload() {
        Object.assign(ctx.current, { d: await repo.load(), hIdx: null });
        undoStack.current = [];
        bump();
      },
    }),
    // ctx.current é estável; re-render é forçado por bump
    // eslint-disable-next-line react-hooks/exhaustive-deps -- v força novo valor a cada bump
    [v, repo, bump, toast, save],
  );

  return (
    <Ctx_.Provider value={value}>
      {saveErr && (
        <div className="savebar" role="alert">
          {saveErr} <button onClick={() => void save()}>Tentar de novo</button>
        </div>
      )}
      {children}
      {toastMsg && (
        <div className={'apptoast ' + toastMsg.kind} role="status">
          {toastMsg.msg}
        </div>
      )}
    </Ctx_.Provider>
  );
}
