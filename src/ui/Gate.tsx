/** Login (Supabase Auth) e trava de PIN, inclusive por inatividade. */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { PIN_RE, type Auth } from '../data/auth';

/** Tempo oculta (trocar de app/aba do navegador) a partir do qual pede o PIN. */
const HIDDEN_LOCK_MS = 60_000;

type Stage = 'loading' | 'login' | 'pin-new' | 'pin' | 'open';

export function Gate({
  auth,
  lockMinutes,
  children,
}: {
  auth: Auth;
  lockMinutes: number;
  children: ReactNode;
}) {
  const [stage, setStage] = useState<Stage>('loading');
  const [msg, setMsg] = useState('');
  const stageRef = useRef<Stage>('loading');
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const route = async () => {
    try {
      if (!(await auth.session())) return setStage('login');
      // o Supabase reemite SIGNED_IN ao voltar para a aba; não deve travar de novo
      if (stageRef.current === 'open') return;
      const s = await auth.pinStatus();
      setStage(s.configured ? 'pin' : 'pin-new');
    } catch (e) {
      setMsg((e as Error).message);
      setStage('login');
    }
  };
  useEffect(() => {
    void Promise.resolve().then(route);
    return auth.onChange(() => void route());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  // trava por inatividade
  useEffect(() => {
    if (stage !== 'open') return;
    let t: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(t);
      t = setTimeout(() => setStage('pin'), lockMinutes * 60_000);
    };
    const ev = ['pointerdown', 'keydown', 'scroll'];
    ev.forEach((e) => addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(t);
      ev.forEach((e) => removeEventListener(e, arm));
    };
  }, [stage, lockMinutes]);

  // trava ao voltar se a página ficou oculta por HIDDEN_LOCK_MS ou mais
  useEffect(() => {
    if (stage !== 'open') return;
    let since = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') since = Date.now();
      else if (since && Date.now() - since >= HIDDEN_LOCK_MS) setStage('pin');
      else since = 0;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [stage]);

  if (stage === 'open') return <>{children}</>;
  if (stage === 'loading') return <p className="gate">Carregando…</p>;
  if (stage === 'login') return <Login auth={auth} msg={msg} />;
  return (
    <Pin
      auth={auth}
      isNew={stage === 'pin-new'}
      onOpen={() => setStage('open')}
      onLogout={() => setStage('login')}
    />
  );
}

function Login({ auth, msg }: { auth: Auth; msg: string }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(msg);
  const [info, setInfo] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(await auth.signIn(email.trim(), pw));
  };
  const link = async () => {
    if (!email.trim()) return setErr('Digite o e-mail.');
    const r = await auth.sendLink(email.trim());
    setErr(r);
    if (!r) setInfo('Link enviado. Abra o e-mail neste aparelho.');
  };
  return (
    <form className="gate" onSubmit={submit}>
      <h1>Rateio</h1>
      <label>
        E-mail
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Senha
        <input
          type="password"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </label>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
      {info && <p role="status">{info}</p>}
      <button className="primary">Entrar</button>
      <button type="button" className="link" onClick={link}>
        Receber link de acesso por e-mail
      </button>
    </form>
  );
}

function Pin({
  auth,
  isNew,
  onOpen,
  onLogout,
}: {
  auth: Auth;
  isNew: boolean;
  onOpen: () => void;
  onLogout: () => void;
}) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!PIN_RE.test(pin)) return setErr('O PIN tem de 4 a 8 números.');
    if (isNew) {
      if (pin !== pin2) return setErr('Os dois PINs não são iguais.');
      const r = await auth.setPin(pin);
      return r === 'ok' ? onOpen() : setErr('Não consegui criar o PIN (' + r + ').');
    }
    const { result, retryAfter } = await auth.verifyPin(pin);
    setPin('');
    if (result === 'ok') return onOpen();
    setErr(
      result === 'locked'
        ? `Muitas tentativas. Tente em ${Math.ceil((retryAfter ?? 60) / 60)} min.`
        : 'PIN incorreto.',
    );
  };
  const forgot = async () => {
    const r = await auth.resetPin();
    if (r === 'ok') return location.reload();
    await auth.signOut();
    onLogout();
  };
  return (
    <form className="gate" onSubmit={submit}>
      <h1>{isNew ? 'Crie seu PIN' : 'Digite o PIN'}</h1>
      <label>
        PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
        />
      </label>
      {isNew && (
        <label>
          Repita o PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
          />
        </label>
      )}
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
      <button className="primary">{isNew ? 'Criar PIN' : 'Entrar'}</button>
      {!isNew && (
        <button type="button" className="link" onClick={forgot}>
          Esqueci o PIN (pede login de novo)
        </button>
      )}
      <button
        type="button"
        className="link"
        onClick={async () => (await auth.signOut(), onLogout())}
      >
        Sair
      </button>
    </form>
  );
}
