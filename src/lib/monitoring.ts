/**
 * Monitoramento de erros em produção (Sentry, plano gratuito).
 * Só liga com VITE_SENTRY_DSN definido e fora do modo local/testes.
 * Privacidade: nada de dados pessoais ou financeiros sai do navegador. Sem usuário, sem
 * breadcrumbs, sem replay, sem tracing; mensagens passam por redact() antes do envio.
 */
import * as Sentry from '@sentry/browser';

/** Remove e-mails, UUIDs, valores em R$ e sequências numéricas longas (PIX, CPF, chaves). */
export const redact = (s: string): string =>
  s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[id]')
    .replace(/R\$\s*[\d.,]+/g, 'R$ [valor]')
    .replace(/\d[\d.,/-]{5,}\d/g, '[num]')
    .slice(0, 300);

type Ev = Sentry.ErrorEvent;

/** Deixa o evento só com tipo, mensagem redigida, pilha e etiquetas técnicas. */
export const scrubEvent = (event: Ev): Ev => {
  delete event.user;
  delete event.breadcrumbs;
  delete event.request;
  delete event.contexts?.device;
  delete event.extra;
  if (event.message) event.message = redact(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = redact(ex.value);
  }
  if (event.tags) {
    for (const k of Object.keys(event.tags)) event.tags[k] = redact(String(event.tags[k]));
  }
  return event;
};

let on = false;

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || !import.meta.env.PROD || import.meta.env.VITE_LOCAL_MODE === '1') return;
  Sentry.init({
    dsn,
    defaultIntegrations: false,
    integrations: [
      Sentry.globalHandlersIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.functionToStringIntegration(),
    ],
    maxBreadcrumbs: 0,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
  on = true;
}

/** Falha de RPC do Supabase: manda só o nome da função e o código do erro, nunca argumentos. */
export function reportRpcError(fn: string, error: { code?: string; message?: string }): void {
  if (!on) return;
  Sentry.withScope((scope) => {
    scope.setTag('rpc', fn);
    scope.setTag('rpc_code', error.code ?? 'sem-codigo');
    scope.setFingerprint(['rpc', fn, error.code ?? '']);
    Sentry.captureException(new Error(`Falha de RPC ${fn}: ${redact(error.message ?? '')}`));
  });
}
