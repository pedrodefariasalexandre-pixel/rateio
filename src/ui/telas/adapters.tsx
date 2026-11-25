/** Liga as telas por props ao shell: useRateio (dados, gravação, aviso) + diálogos próprios no lugar de confirm()/prompt(). */
import { useRateio } from '../AppContext';
import { useConfirm, usePrompt } from '../base/confirm';
import { Cobrancas } from './cobrancas/Cobrancas';
import { BackupNag, Config } from './config/Config';
import type { Env } from './env';
import { ProjecaoBox } from './grafico/ProjecaoBox';
import { Historico } from './historico/Historico';
import { Relatorios } from './relatorios/Relatorios';

// eslint-disable-next-line react-refresh/only-export-components
export function useEnv(): Env {
  const { ctx, commit, toast } = useRateio();
  const confirm = useConfirm();
  const prompt = usePrompt();
  return { ctx, commit, toast, confirm, prompt };
}

export function HistoricoTela() {
  const env = useEnv();
  return (
    <Historico
      env={env}
      renderProjecao={(projection, context) => (
        <ProjecaoBox projection={projection} context={context} />
      )}
    />
  );
}

export const CobrancasTela = () => <Cobrancas env={useEnv()} />;

export function RelatoriosTela() {
  return <Relatorios ctx={useRateio().ctx} />;
}

export function ConfigTela() {
  const env = useEnv();
  const { repo, reload } = useRateio();
  return (
    <Config
      env={env}
      backup={{ importar: (t, m) => repo.importBackup(t, m), recarregar: reload }}
    />
  );
}

export function BackupNagTopo() {
  return <BackupNag env={useEnv()} />;
}
