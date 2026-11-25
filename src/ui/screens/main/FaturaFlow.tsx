/** A aba "Fatura": as três etapas do v3 (Importar → Revisar → Mensagens); o indicador fica na topbar do Shell. */
import { useRateio } from '../../AppContext';
import type { Ctx } from '../../../lib/types';
import { FinalScreen } from './final/FinalScreen';
import { ImportScreen } from './ImportScreen';
import { ReviewScreen } from './ReviewScreen';

/** Descarta a fatura em revisão (ela não é salva no banco). */
function clearInvoice(c: Ctx) {
  c.inv = { txs: [], fileInfo: null, comp: '' };
}

export type Step = 'sImport' | 'sReview' | 'sFinal';
export const STEPS: [Step, string][] = [
  ['sImport', 'Importar'],
  ['sReview', 'Revisar'],
  ['sFinal', 'Mensagens'],
];

export function FaturaFlow({ step, setStep }: { step: Step; setStep: (s: Step) => void }) {
  const { ctx, bump } = useRateio();
  const go = (s: Step) => {
    setStep(s);
    window.scrollTo?.(0, 0);
  };
  const reset = () => {
    clearInvoice(ctx);
    bump();
    go('sImport');
  };
  return (
    <>
      {step === 'sImport' && <ImportScreen onImported={() => go('sReview')} />}
      {step === 'sReview' && <ReviewScreen onRestart={reset} onFinish={() => go('sFinal')} />}
      {step === 'sFinal' && <FinalScreen onBack={() => go('sReview')} onClosed={reset} />}
    </>
  );
}
