/**
 * Diálogo próprio no lugar de confirm()/prompt() do v3 (funciona igual no iPhone e dá para testar).
 * Uso: envolva o App com <ConfirmProvider>; nas telas, `await useConfirm()(msg)` e `await usePrompt()(msg, def)`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ConfirmOpts {
  /** Texto do botão de confirmar (padrão "OK"). */
  ok?: string;
  /** Botão de confirmar em vermelho (ação destrutiva). */
  danger?: boolean;
}

type Req =
  | { kind: 'confirm'; msg: string; opts: ConfirmOpts; done: (v: boolean) => void }
  | {
      kind: 'prompt';
      msg: string;
      def: string;
      opts: ConfirmOpts;
      done: (v: string | null) => void;
    };

interface Api {
  confirm: (msg: string, opts?: ConfirmOpts) => Promise<boolean>;
  prompt: (msg: string, def?: string, opts?: ConfirmOpts) => Promise<string | null>;
}

const Ctx = createContext<Api | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Req[]>([]);
  const [api] = useState<Api>(() => ({
    confirm: (msg, opts = {}) =>
      new Promise((done) => setQueue((q) => [...q, { kind: 'confirm', msg, opts, done }])),
    prompt: (msg, def = '', opts = {}) =>
      new Promise((done) => setQueue((q) => [...q, { kind: 'prompt', msg, def, opts, done }])),
  }));
  const cur = queue[0];
  const finish = useCallback(
    (v: boolean | string | null) => {
      if (!cur) return;
      if (cur.kind === 'confirm') cur.done(v !== false && v !== null);
      else cur.done(typeof v === 'string' ? v : null);
      setQueue((q) => q.slice(1));
    },
    [cur],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      {cur && <AskDialog key={queue.length + cur.msg} req={cur} finish={finish} />}
    </Ctx.Provider>
  );
}

function AskDialog({ req, finish }: { req: Req; finish: (v: boolean | string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [val, setVal] = useState(req.kind === 'prompt' ? req.def : '');
  useEffect(() => {
    const d = ref.current;
    if (d && typeof d.showModal === 'function' && !d.open) d.showModal();
    else d?.setAttribute('open', '');
  }, []);
  const cancel = () => finish(req.kind === 'prompt' ? null : false);
  return (
    <dialog
      ref={ref}
      className="ask"
      aria-label={req.msg}
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          finish(req.kind === 'prompt' ? val : true);
        }}
      >
        <div className="dbody">
          <p style={{ whiteSpace: 'pre-line', margin: '0 0 12px' }}>{req.msg}</p>
          {req.kind === 'prompt' && (
            <input
              className="field"
              autoFocus
              value={val}
              aria-label={req.msg}
              onChange={(e) => setVal(e.target.value)}
            />
          )}
        </div>
        <div
          className="dhead"
          style={{
            borderTop: '1px solid var(--line)',
            borderBottom: 0,
            justifyContent: 'flex-end',
          }}
        >
          <button type="button" className="btn ghost small" onClick={cancel}>
            Cancelar
          </button>
          <button
            type="submit"
            className={'btn small ' + (req.opts.danger ? 'danger' : 'primary')}
            autoFocus={req.kind === 'confirm'}
          >
            {req.opts.ok || 'OK'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function useApi(): Api {
  const a = useContext(Ctx);
  if (!a) throw new Error('ConfirmProvider ausente.');
  return a;
}
/** Pergunta sim/não (substitui confirm()). */
export const useConfirm = () => useApi().confirm;
/** Pede um texto (substitui prompt()); null = cancelou. */
export const usePrompt = () => useApi().prompt;
