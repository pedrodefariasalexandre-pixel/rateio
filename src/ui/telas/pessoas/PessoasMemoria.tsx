import { useReducer, useState } from 'react';
import { Confirmar, type PedidoConfirmacao } from './Confirmar';
import { Pessoas } from './Pessoas';
import { Pix } from './Pix';
import { Regras } from './Regras';
import { TagsAdmin } from './TagsAdmin';
import type { PessoasMemoriaProps } from './tipos';
import './pessoas.css';

/** Tela "Pessoas & memória" (sem o backup, que é de outra frente). */
export function PessoasMemoria({ ctx, onChange }: PessoasMemoriaProps) {
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const confirmar = (texto: string, acao: () => void, rotulo = 'Confirmar') =>
    setPedido({ texto, acao, rotulo });
  const s = { ctx, onChange, confirmar, redesenhar };
  return (
    <div className="pm" data-testid="pessoas-memoria">
      <h3>Pessoas &amp; memória</h3>
      <Pessoas {...s} />
      <Pix ctx={ctx} onChange={onChange} />
      <TagsAdmin {...s} />
      <Regras {...s} />
      <Confirmar pedido={pedido} fechar={() => setPedido(null)} />
    </div>
  );
}
