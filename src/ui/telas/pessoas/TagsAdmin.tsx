import { safeColor } from '../../../lib/state';
import { deleteTag } from '../../../lib/tags';
import { corDaTag, renomearTag } from './edicao';
import type { SecaoProps } from './tipos';

export function TagsAdmin({ ctx, onChange, confirmar, redesenhar }: SecaoProps) {
  const usos = (id: string) => Object.values(ctx.d.ruleTags).filter((a) => a.includes(id)).length;
  return (
    <section className="pm-sec" aria-labelledby="pm-tags">
      <h4 id="pm-tags">Tags</h4>
      {ctx.d.tags.length ? (
        ctx.d.tags.map((g) => (
          <div className="pm-row" key={g.id}>
            <input
              type="color"
              defaultValue={safeColor(g.cor)}
              aria-label={`Cor da tag ${g.nome}`}
              onChange={(e) => {
                corDaTag(ctx, g.id, e.target.value);
                onChange('tags');
              }}
            />
            <input
              className="pm-field"
              type="text"
              maxLength={24}
              defaultValue={g.nome}
              aria-label={`Nome da tag ${g.nome}`}
              onBlur={redesenhar}
              onChange={(e) => {
                if (renomearTag(ctx, g.id, e.target.value)) onChange('tags');
              }}
            />
            <span>{usos(g.id)} regra(s)</span>
            <button
              type="button"
              className="pm-icon"
              aria-label={`Apagar tag ${g.nome}`}
              onClick={() =>
                confirmar(
                  `Apagar a tag “${g.nome}”? Ela sai de todos os lançamentos e da memória.`,
                  () => {
                    deleteTag(ctx, g.id);
                    onChange('tags');
                    redesenhar();
                  },
                  'Apagar tag',
                )
              }
            >
              ✕
            </button>
          </div>
        ))
      ) : (
        <p className="pm-empty">Nenhuma tag criada.</p>
      )}
      <p className="pm-help">
        Crie tags direto no lançamento (botão “+ tag”). Aqui você renomeia, troca a cor ou apaga.
      </p>
    </section>
  );
}
