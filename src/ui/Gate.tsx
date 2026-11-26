/** Login (Supabase Auth). Sem PIN: o login é a única proteção. */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import './gate.css';
import type { Auth } from '../data/auth';

type Stage = 'loading' | 'login' | 'open';

export function Gate({ auth, children }: { auth: Auth; children: ReactNode }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [msg, setMsg] = useState('');

  const route = async () => {
    try {
      setStage((await auth.session()) ? 'open' : 'login');
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

  if (stage === 'open') return <>{children}</>;
  if (stage === 'loading') return <p className="gate">Carregando…</p>;
  return <Login auth={auth} msg={msg} />;
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
