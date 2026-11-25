import { useRef, useState } from 'react';
import { backupText, decryptText, isEncrypted } from '../../../lib/backup';
import { daysSince, todayISO } from '../../../lib/dates';
import { releaseMissingOwners } from '../../../lib/invoice';
import { activePeople } from '../../../lib/state';
import { clean } from '../../../lib/text';
import type { ParcelasMode } from '../../../lib/backup';
import type { ImportOutcome } from '../../../data/repo';
import type { Env } from '../env';
import { copyText, downloadText } from '../util';

/** O que a tela de configurações precisa do repositório (vem de useRateio().repo / reload). */
export interface BackupApi {
  importar(text: string, mode?: ParcelasMode): Promise<ImportOutcome>;
  recarregar(): Promise<void>;
}

interface Props {
  env: Env;
  backup: BackupApi;
}

const hasSavedData = (d: Env['ctx']['d']) =>
  d.history.length > 0 ||
  Object.keys(d.rules).length > 0 ||
  d.charges.length > 0 ||
  d.tags.length > 0 ||
  Object.keys(d.parcelas).length > 0;

/** Marca o backup como feito (zera o lembrete). Não entra no "desfazer". */
const marcarBackup = (env: Env) =>
  env.commit(
    (c) => {
      c.d.settings.lastBackup = new Date().toISOString();
    },
    { undo: false },
  );

/** Faixa "guarde um backup" (aparece com dados salvos e backup ausente ou com mais de 30 dias). */
export function BackupNag({ env }: { env: Env }) {
  const d = env.ctx.d;
  const [copiado, setCopiado] = useState(false);
  const dias = daysSince(d.settings.lastBackup);
  if (!(hasSavedData(d) && (dias === null || dias > 30))) return null;
  async function copiar() {
    if (
      !(await copyText(
        backupText(env.ctx.d),
        env.prompt,
        'Copie o texto (Ctrl+C) e guarde numa conversa sua no WhatsApp:',
      ))
    )
      return;
    await marcarBackup(env);
    env.toast('Backup copiado');
    setCopiado(true);
  }
  return (
    <div className="notice info">
      <span className="grow">
        {dias === null ? (
          <>
            <b>Você ainda não guardou um backup.</b> Pessoas, memória e histórico ficam só neste
            navegador.
          </>
        ) : (
          <>
            <b>Último backup há {dias} dias.</b> Guarde um novo para não perder a memória e o
            histórico.
          </>
        )}
      </span>
      <button className="btn small primary" onClick={() => void copiar()}>
        {copiado ? 'Copiado ✓ — cole no WhatsApp' : 'Copiar backup agora'}
      </button>
      <button
        className="btn ghost small"
        onClick={() => {
          if (
            downloadText(
              `rateio-backup-${todayISO()}.json`,
              backupText(env.ctx.d),
              'application/json',
            )
          )
            void marcarBackup(env);
          else env.toast('Download bloqueado aqui.', 'err');
        }}
      >
        Baixar .json
      </button>
    </div>
  );
}

export function Config({ env, backup }: Props) {
  const { ctx } = env;
  const { settings } = ctx.d;
  const [pix, setPix] = useState(settings.pix || '');
  const [copiado, setCopiado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const donoValido = activePeople(ctx).some((p) => p.id === settings.pixOwner);

  async function salvarPix(valor: string) {
    const v = clean(valor, 77);
    setPix(v);
    if (v === settings.pix) return;
    await env.commit(
      (c) => {
        c.d.settings.pix = v;
      },
      { undo: false },
    );
  }

  async function copiar() {
    if (
      !(await copyText(
        backupText(ctx.d),
        env.prompt,
        'Copie o texto (Ctrl+C) e guarde numa conversa sua no WhatsApp:',
      ))
    )
      return;
    await marcarBackup(env);
    env.toast('Backup copiado');
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  function baixar() {
    if (!downloadText(`rateio-backup-${todayISO()}.json`, backupText(ctx.d), 'application/json'))
      return env.toast('Download bloqueado aqui.', 'err');
    void marcarBackup(env);
  }

  async function restaurar(raw: string) {
    let texto = raw;
    if (isEncrypted(raw)) {
      const senha = await env.prompt('Este backup está protegido. Digite a senha:');
      if (!senha) return;
      try {
        texto = await decryptText(raw, senha);
      } catch (e) {
        return env.toast((e as Error).message, 'err');
      }
    }
    let r = await backup.importar(texto);
    if (r.status === 'needs_decision') {
      const substituir = await env.confirm(
        `O backup tem ${r.theirs} parcela(s) na memória de parcelas. Aqui há ${r.mine}, e ${r.lost} delas não estão iguais no backup.\n\nSubstituir = usa a do backup (as ${r.lost} daqui se perdem).\nJuntar = mantém as daqui e só acrescenta as do backup.`,
        { ok: 'Substituir', danger: true },
      );
      r = await backup.importar(texto, substituir ? 'substituir' : 'juntar');
    }
    if (r.status === 'invalid')
      return env.toast(
        `Backup inválido: ${r.problem}. Nada foi alterado. Cole a mensagem inteira, começando em RATEIO-BACKUP.`,
        'err',
      );
    if (r.status !== 'ok') return;
    await backup.recarregar();
    const c = env.ctx;
    const liberados = releaseMissingOwners(c);
    env.toast(
      `Backup restaurado: ${c.d.people.length} pessoa(s), ${Object.keys(c.d.rules).length} regra(s), ${Object.keys(c.d.parcelas).length} parcela(s) na memória` +
        (liberados
          ? `. ${liberados} item(ns) da fatura aberta estavam com uma pessoa que não existe no backup e voltaram a ficar sem dono: confira`
          : ''),
    );
  }

  async function colar() {
    const raw = await env.prompt('Cole aqui a mensagem de backup (começa com RATEIO-BACKUP):');
    if (raw) await restaurar(raw);
  }

  function lerArquivo(f: File | undefined) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => void restaurar(String(r.result));
    r.readAsText(f);
  }

  return (
    <div>
      <div className="dsec">
        <h4>Chave PIX nas mensagens</h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
            gap: 8,
          }}
        >
          <input
            className="field"
            maxLength={77}
            placeholder="CPF, e-mail, telefone ou chave aleatória"
            aria-label="Chave PIX"
            value={pix}
            onChange={(e) => setPix(e.target.value)}
            onBlur={(e) => void salvarPix(e.target.value)}
          />
          <select
            className="field"
            aria-label="Dono da chave PIX"
            value={donoValido ? settings.pixOwner : ''}
            onChange={(e) =>
              void env.commit(
                (c) => {
                  c.d.settings.pixOwner = e.target.value;
                },
                { undo: false },
              )
            }
          >
            <option value="">(ninguém)</option>
            {activePeople(ctx).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} (dono do cartão)
              </option>
            ))}
          </select>
        </div>
        <p className="help">
          Vai no fim da mensagem de cada pessoa, menos na do dono do cartão. O dono do cartão é quem
          recebe os pagamentos: não entra em “em aberto”. Fica salva só na sua conta e no backup
          (não fica escrita no código).
        </p>
      </div>

      <div className="dsec">
        <h4>Backup</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn small primary" onClick={() => void copiar()}>
            {copiado ? 'Copiado ✓ — cole no WhatsApp' : 'Copiar backup (texto)'}
          </button>
          <button className="btn small" onClick={() => void colar()}>
            Restaurar de texto
          </button>
          <button className="btn small" onClick={baixar}>
            Baixar .json
          </button>
          <button className="btn small" onClick={() => arquivo.current?.click()}>
            Restaurar .json
          </button>
        </div>
        <input
          ref={arquivo}
          type="file"
          accept=".json,.txt"
          hidden
          data-testid="bk-input"
          onChange={(e) => {
            lerArquivo(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="help">
          Sugestão: copie o backup e cole numa conversa sua no WhatsApp. Inclui pessoas, memória,
          memória de parcelas, cobranças fixas e histórico.
        </p>
      </div>
    </div>
  );
}
