import { useState } from 'react';
import { chargeHint, chargeOwners, editCharge, newCharge } from '../../../lib/charges';
import { activePeople, personById, safeColor } from '../../../lib/state';
import type { Charge } from '../../../lib/types';
import type { Env } from '../env';
import './cobrancas.css';

type Campo = 'nome' | 'valor' | 'parcAtual' | 'parcTotal' | 'parcComp';

const decimal = (x: unknown) => String(x ?? '').replace('.', ',');

/** Rascunho local de cada campo: grava no blur (uma gravação por campo, não por tecla). */
function Linha({ env, c }: { env: Env; c: Charge }) {
  const { ctx } = env;
  const [d, setD] = useState({
    nome: c.nome || '',
    valor: decimal(c.valor),
    parcAtual: String(c.parcAtual || ''),
    parcTotal: String(c.parcTotal || ''),
    parcComp: c.parcComp || '',
  });
  const [w, setW] = useState<Record<string, string>>({});
  const donos = chargeOwners(ctx, c);

  // dica ao vivo, com o que está digitado
  const dica = chargeHint({
    ...c,
    parcAtual: d.parcAtual,
    parcTotal: d.parcTotal,
    parcComp: d.parcComp,
  });

  async function salvar(campo: Campo) {
    await env.commit((x) => {
      const ch = x.d.charges.find((k) => k.id === c.id);
      if (ch) editCharge(x, ch, campo, d[campo]);
    });
    const fresh = env.ctx.d.charges.find((k) => k.id === c.id);
    if (fresh)
      setD({
        nome: fresh.nome || '',
        valor: campo === 'valor' ? decimal(fresh.valor) : d.valor,
        parcAtual: String(fresh.parcAtual || ''),
        parcTotal: String(fresh.parcTotal || ''),
        parcComp: fresh.parcComp || '',
      });
  }

  const campo = (k: Campo) => ({
    value: d[k],
    onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }),
    onBlur: () => void salvar(k),
  });

  async function remover() {
    if (!(await env.confirm(`Remover a cobrança “${c.nome || '(sem nome)'}”?`, { danger: true })))
      return;
    await env.commit((x) => {
      x.d.charges = x.d.charges.filter((k) => k.id !== c.id);
    });
  }

  async function alternarDono(pid: string) {
    await env.commit((x) => {
      const ch = x.d.charges.find((k) => k.id === c.id)!;
      ch.owners = ch.owners || [];
      const i = ch.owners.indexOf(pid);
      if (i >= 0) ch.owners.splice(i, 1);
      else ch.owners.push(pid);
    });
  }

  async function salvarPeso(pid: string, txt: string) {
    const v = Number(String(txt).replace(',', '.'));
    await env.commit((x) => {
      const ch = x.d.charges.find((k) => k.id === c.id)!;
      ch.w = ch.w || {};
      ch.w[pid] = Number.isFinite(v) ? v : 0;
    });
    setW((o) => {
      const n = { ...o };
      delete n[pid];
      return n;
    });
  }

  return (
    <div className="crow">
      <div className="l1">
        <input
          className="field"
          type="text"
          placeholder="Ex.: Empréstimo Mercado Pago"
          aria-label="Descrição"
          {...campo('nome')}
        />
        <input
          className="field"
          type="text"
          inputMode="decimal"
          placeholder="Valor"
          aria-label="Valor"
          {...campo('valor')}
        />
        <button className="iconbtn" aria-label="Remover cobrança" onClick={remover}>
          ✕
        </button>
      </div>
      <div className="l2">
        Parcela{' '}
        <input
          className="field parc"
          type="number"
          min={1}
          aria-label="Parcela atual"
          {...campo('parcAtual')}
        />{' '}
        de{' '}
        <input
          className="field parc"
          type="number"
          min={1}
          aria-label="Total de parcelas"
          {...campo('parcTotal')}
        />{' '}
        em{' '}
        <input
          className="field"
          type="month"
          style={{ width: 150 }}
          aria-label="Mês a que a parcela atual se refere"
          {...campo('parcComp')}
        />
        <span>{dica}</span>
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {activePeople(ctx).map((p) => (
          <button
            key={p.id}
            className="chip"
            style={{ ['--c' as string]: safeColor(p.cor) }}
            aria-pressed={(c.owners || []).includes(p.id)}
            onClick={() => void alternarDono(p.id)}
          >
            <span className="dot" />
            {p.nome}
          </button>
        ))}
      </div>
      {donos.length > 1 && (
        <div className="l2" style={{ marginTop: 8 }}>
          Proporção:{' '}
          {donos.map((id) => (
            <label key={id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {personById(ctx, id)!.nome}{' '}
              <input
                className="field parc"
                inputMode="decimal"
                aria-label={`Partes de ${personById(ctx, id)!.nome}`}
                value={w[id] ?? decimal(c.w?.[id] ?? 1)}
                onChange={(e) => setW({ ...w, [id]: e.target.value })}
                onBlur={(e) => void salvarPeso(id, e.target.value)}
              />
            </label>
          ))}{' '}
          <span>(1 e 1 = metade cada; 2 e 1 = 2/3 e 1/3)</span>
        </div>
      )}
    </div>
  );
}

export function Cobrancas({ env }: { env: Env }) {
  const { charges } = env.ctx.d;
  return (
    <div className="tela-cobrancas">
      <p className="help" style={{ margin: '0 0 12px' }}>
        Empréstimos, outros cartões e assinaturas que não estão no OFX. Entram na divisão. Com
        parcela preenchida, informe também a que mês ela se refere (“em”): o app calcula a parcela
        de cada fatura, a cobrança não aparece antes da primeira nem depois da última, e o contador
        avança sozinho ao fechar o mês. Sem parcela, repete todo mês.
      </p>
      {charges.length ? (
        charges.map((c) => <Linha key={String(c.id)} env={env} c={c} />)
      ) : (
        <p className="empty">Nenhuma cobrança cadastrada.</p>
      )}
      <button
        className="btn small"
        onClick={() =>
          void env.commit((x) => {
            x.d.charges.push(newCharge());
          })
        }
      >
        + Adicionar cobrança
      </button>
    </div>
  );
}
