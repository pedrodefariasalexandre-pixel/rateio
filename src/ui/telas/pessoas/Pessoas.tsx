import {
  addPerson,
  archivePerson,
  deletePerson,
  editPerson,
  unarchivePerson,
} from '../../../lib/people';
import { activePeople, safeColor } from '../../../lib/state';
import type { SecaoProps } from './tipos';

export function Pessoas({ ctx, onChange, confirmar, redesenhar }: SecaoProps) {
  return (
    <section className="pm-sec" aria-labelledby="pm-pessoas">
      <h4 id="pm-pessoas">Pessoas</h4>
      {activePeople(ctx).map((p) => (
        <div className="pm-row" key={p.id} data-pessoa={p.id}>
          <input
            type="color"
            defaultValue={safeColor(p.cor)}
            aria-label={`Cor de ${p.nome}`}
            onChange={(e) => {
              editPerson(ctx, p.id, 'cor', e.target.value);
              onChange('pessoas');
            }}
          />
          <input
            className="pm-field"
            type="text"
            defaultValue={p.nome}
            placeholder="Nome"
            aria-label={`Nome de ${p.nome}`}
            onBlur={redesenhar}
            onChange={(e) => {
              editPerson(ctx, p.id, 'nome', e.target.value);
              onChange('pessoas');
            }}
          />
          <input
            className="pm-field"
            type="tel"
            defaultValue={p.fone || ''}
            placeholder="55DDDNÚMERO"
            aria-label={`WhatsApp de ${p.nome}`}
            onChange={(e) => {
              editPerson(ctx, p.id, 'fone', e.target.value);
              onChange('pessoas');
            }}
          />
          <button
            type="button"
            className="pm-btn pm-small"
            aria-label={`Arquivar ${p.nome}`}
            onClick={() =>
              confirmar(
                `Arquivar ${p.nome}? Some da divisão, mas o histórico e a memória continuam. Dá para reativar depois.`,
                () => {
                  archivePerson(ctx, p.id);
                  onChange('pessoas');
                  redesenhar();
                },
                'Arquivar',
              )
            }
          >
            Arquivar
          </button>
        </div>
      ))}
      <button
        type="button"
        className="pm-btn pm-small"
        onClick={() => {
          addPerson(ctx);
          onChange('pessoas');
          redesenhar();
        }}
      >
        + Adicionar pessoa
      </button>
      <Arquivadas ctx={ctx} onChange={onChange} confirmar={confirmar} redesenhar={redesenhar} />
      <p className="pm-help">
        Telefone no formato internacional (ex.: 5548999998888) abre a conversa direto no WhatsApp.
      </p>
    </section>
  );
}

export function Arquivadas({ ctx, onChange, confirmar, redesenhar }: SecaoProps) {
  const arq = ctx.d.people.filter((p) => p.archived);
  if (!arq.length) return null;
  return (
    <div data-testid="arquivadas">
      <p className="pm-help">
        Arquivadas ({arq.length}): continuam no histórico e na memória, mas não aparecem para
        dividir.
      </p>
      {arq.map((p) => (
        <div className="pm-row" key={p.id}>
          <span className="pm-nome">
            <span className="pm-dot" style={{ background: safeColor(p.cor) }} />
            {p.nome}
          </span>
          <button
            type="button"
            className="pm-btn pm-small"
            onClick={() => {
              unarchivePerson(ctx, p.id);
              onChange('pessoas');
              redesenhar();
            }}
          >
            Reativar
          </button>
          <button
            type="button"
            className="pm-btn pm-small pm-danger"
            onClick={() =>
              confirmar(
                `Excluir ${p.nome} de vez? O histórico continua com o nome, mas as regras da memória que apontam para essa pessoa deixam de valer.`,
                () => {
                  deletePerson(ctx, p.id);
                  onChange('pessoas');
                  redesenhar();
                },
                'Excluir de vez',
              )
            }
          >
            Excluir de vez
          </button>
        </div>
      ))}
    </div>
  );
}
