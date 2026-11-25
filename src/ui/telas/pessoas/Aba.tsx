import { useEffect, useRef } from 'react';
import { useRateio } from '../../AppContext';
import { PessoasMemoria } from './PessoasMemoria';

/** Liga a tela ao app: cada alteração já está em ctx; grava (com pausa de 0,6 s, para não gravar a cada tecla). */
export function PessoasMemoriaAba() {
  const { ctx, commit } = useRateio();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gravar = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(() => {}, { undo: false }), 600);
  };
  // ao sair da aba, grava na hora o que estiver pendente
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void commit(() => {}, { undo: false });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit muda a cada render; só importa o desmonte
    [],
  );
  return <PessoasMemoria ctx={ctx} onChange={gravar} />;
}
