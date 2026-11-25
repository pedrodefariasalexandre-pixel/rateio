import { useState } from 'react';
import { clearAllMemory, deleteRule, removeEachRule } from '../../../lib/memory';
import { isOutStatus } from '../../../lib/parcelas';
import { donosDaRegra, nomeDe } from './donos';
import type { SecaoProps } from './tipos';

export function Regras({ ctx, onChange, confirmar, redesenhar }: SecaoProps) {
  const [filtro, setFiltro] = useState('');
  const q = filtro.toUpperCase();
  const d = ctx.d;
  const regras = Object.keys(d.rules)
    .filter((k) => !q || k.includes(q))
    .sort();
  const cada = Object.keys(d.ruleEach)
    .filter((k) => !q || k.includes(q))
    .sort();
  const nP = Object.values(d.parcelas).filter(isOutStatus).length;
  return (
    <section className="pm-sec" aria-labelledby="pm-memoria">
      <h4 id="pm-memoria">
        Memória{' '}
        <span className="pm-help" data-testid="contagem-regras">
          · {Object.keys(d.rules).length + Object.keys(d.ruleEach).length} regra(s)
          {nP ? ` · ${nP} parcela(s) na memória de parcelas` : ''}
        </span>
      </h4>
      <input
        className="pm-field"
        type="search"
        aria-label="Filtrar regras da memória"
        placeholder="Filtrar regras…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />
      <div className="pm-rules">
        {regras.map((k) => (
          <div className="pm-rule" key={'r' + k}>
            <span>
              {k} <span className="pm-who">→ {donosDaRegra(ctx, k)}</span>
            </span>
            <button
              type="button"
              className="pm-icon"
              aria-label={`Apagar regra ${k}`}
              onClick={() =>
                confirmar(
                  `Apagar a regra “${k}”? Só esta regra: as outras ficam.`,
                  () => {
                    deleteRule(ctx, k);
                    onChange('regras');
                    redesenhar();
                  },
                  'Apagar regra',
                )
              }
            >
              ✕
            </button>
          </div>
        ))}
        {cada.map((k) => (
          <div className="pm-rule" key={'e' + k}>
            <span>
              {k}{' '}
              <span className="pm-who">
                → uma para cada: {(d.ruleEach[k] ?? []).map((id) => nomeDe(ctx, id)).join(', ')}
              </span>
            </span>
            <button
              type="button"
              className="pm-icon"
              aria-label={`Apagar regra uma para cada ${k}`}
              onClick={() =>
                confirmar(
                  `Apagar a regra “uma para cada” de “${k}”?`,
                  () => {
                    removeEachRule(ctx, k);
                    onChange('regras');
                    redesenhar();
                  },
                  'Apagar regra',
                )
              }
            >
              ✕
            </button>
          </div>
        ))}
        {!regras.length && !cada.length && (
          <p className="pm-empty">Nenhuma regra{q ? ' com esse filtro' : ''}.</p>
        )}
      </div>
      <p className="pm-help">
        Cada regra liga uma descrição de compra às pessoas (e à proporção, quando a divisão não é
        igual). Quando o mesmo texto já foi de pessoas diferentes, a regra mostra “depende do
        valor”: a memória só preenche o valor que já conhece e deixa o resto sem dono. Apague só a
        que estiver errada.
      </p>
      <button
        type="button"
        className="pm-btn pm-small pm-danger"
        onClick={() =>
          confirmar(
            `Apagar TODA a memória? Isso inclui as regras, as tags lembradas e a memória de parcelas${
              nP
                ? ` (${nP} parcela(s) marcada(s) como paga(s) antecipadamente ou tirada(s) da divisão — elas voltam para a divisão na próxima importação)`
                : ''
            }. A fatura atual não muda; só os próximos meses deixam de vir preenchidos.`,
            () => {
              clearAllMemory(ctx);
              onChange('regras');
              onChange('tags');
              onChange('parcelas');
              redesenhar();
            },
            'Apagar tudo',
          )
        }
      >
        Apagar toda a memória
      </button>
    </section>
  );
}
