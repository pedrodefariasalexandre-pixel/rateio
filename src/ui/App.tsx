import { useEffect, useMemo, useState } from 'react';
import { isLocalMode, localAuth, supabaseAuth } from '../data/auth';
import { localRepo, supabaseRepo } from '../data/repo';
import { isSupabaseConfigured } from '../data/supabase';
import type { Data } from '../lib/types';
import { RateioProvider } from './AppContext';
import { ConfirmProvider } from './base/confirm';
import { Gate } from './Gate';
import { Shell } from './Shell';

export function App() {
  const local = isLocalMode || !isSupabaseConfigured;
  const auth = useMemo(() => (local ? localAuth() : supabaseAuth()), [local]);
  const repo = useMemo(() => (local ? localRepo() : supabaseRepo()), [local]);
  return (
    <Gate auth={auth}>
      <Loaded repo={repo} onSignOut={() => void auth.signOut()} />
    </Gate>
  );
}

function Loaded({
  repo,
  onSignOut,
}: {
  repo: ReturnType<typeof localRepo>;
  onSignOut: () => void;
}) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    repo.load().then(setD, (e: Error) => setErr(e.message));
  }, [repo]);
  if (err)
    return (
      <p className="gate err" role="alert">
        {err}
      </p>
    );
  if (!d) return <p className="gate">Carregando seus dados…</p>;
  return (
    <RateioProvider repo={repo} initial={d}>
      <ConfirmProvider>
        <Shell onSignOut={onSignOut} />
      </ConfirmProvider>
    </RateioProvider>
  );
}
