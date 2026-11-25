import { useEffect, useRef } from 'react';

export interface PedidoConfirmacao {
  texto: string;
  rotulo: string;
  acao: () => void;
}

/** Diálogo de confirmação (no lugar de window.confirm). Cancelar nunca altera nada. */
export function Confirmar({
  pedido,
  fechar,
}: {
  pedido: PedidoConfirmacao | null;
  fechar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (pedido && !d.open) {
      if (d.showModal) d.showModal();
      else d.setAttribute('open', '');
    }
    if (!pedido && d.open) d.close?.();
  }, [pedido]);
  return (
    <dialog ref={ref} className="pm-dlg" aria-label="Confirmação" onClose={fechar}>
      {pedido && (
        <>
          <p>{pedido.texto}</p>
          <div className="pm-row">
            <button type="button" className="pm-btn" onClick={fechar}>
              Cancelar
            </button>
            <button
              type="button"
              className="pm-btn pm-danger"
              onClick={() => {
                const { acao } = pedido;
                fechar();
                acao();
              }}
            >
              {pedido.rotulo}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
