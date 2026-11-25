import { activePeople } from '../../../lib/state';
import { setPix, setPixOwner } from './edicao';
import type { SecaoProps } from './tipos';

export function Pix({ ctx, onChange }: Pick<SecaoProps, 'ctx' | 'onChange'>) {
  const s = ctx.d.settings;
  const ativas = activePeople(ctx);
  const dono = ativas.some((p) => p.id === s.pixOwner) ? s.pixOwner : '';
  return (
    <section className="pm-sec" aria-labelledby="pm-pix">
      <h4 id="pm-pix">Chave PIX nas mensagens</h4>
      <div className="pm-grid">
        <input
          className="pm-field"
          maxLength={77}
          defaultValue={s.pix || ''}
          placeholder="CPF, e-mail, telefone ou chave aleatória"
          aria-label="Chave PIX"
          onChange={(e) => {
            setPix(ctx, e.target.value);
            onChange('preferencias');
          }}
        />
        <select
          className="pm-field"
          defaultValue={dono}
          aria-label="Dono da chave PIX"
          onChange={(e) => {
            setPixOwner(ctx, e.target.value);
            onChange('preferencias');
          }}
        >
          <option value="">(ninguém)</option>
          {ativas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} (dono do cartão)
            </option>
          ))}
        </select>
      </div>
      <p className="pm-help">
        Vai no fim da mensagem de cada pessoa, menos na do dono do cartão. O dono do cartão é quem
        recebe os pagamentos: não entra em “em aberto”. A chave PIX fica salva na sua conta e no
        backup (não fica escrita no código).
      </p>
    </section>
  );
}
