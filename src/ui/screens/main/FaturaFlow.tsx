/** A aba "Fatura": as três etapas do v3 (Importar → Revisar → Mensagens) com o indicador de etapas. */
import { useState } from 'react';
import { useRateio } from '../../AppContext';
import type { Ctx } from '../../../lib/types';
import { FinalScreen } from './final/FinalScreen';
import { ImportScreen } from './ImportScreen';
import { ReviewScreen } from './ReviewScreen';

/** Descarta a fatura em revisão (ela não é salva no banco). */
function clearInvoice(c: Ctx) {
  c.inv = { txs: [], fileInfo: null, comp: '' };
}

type Step = 'sImport' | 'sReview' | 'sFinal';
const STEPS: [Step, string][] = [
  ['sImport', 'Importar'],
  ['sReview', 'Revisar'],
  ['sFinal', 'Mensagens'],
];

export function FaturaFlow() {
  const { ctx, bump } = useRateio();
  const [step, setStep] = useState<Step>(ctx.inv.txs.length ? 'sReview' : 'sImport');
  const go = (s: Step) => {
    setStep(s);
    window.scrollTo?.(0, 0);
  };
  const reset = () => {
    clearInvoice(ctx);
    bump();
    go('sImport');
  };
  const idx = STEPS.findIndex(([s]) => s === step);
  return (
    <>
      <nav className="steps" aria-label="Etapas">
        {STEPS.map(([s, l], i) => (
          <span key={s} data-step={s} className={i === idx ? 'on' : undefined}>
            {l}
          </span>
        ))}
      </nav>
      {step === 'sImport' && <ImportScreen onImported={() => go('sReview')} />}
      {step === 'sReview' && <ReviewScreen onRestart={reset} onFinish={() => go('sFinal')} />}
      {step === 'sFinal' && <FinalScreen onBack={() => go('sReview')} onClosed={reset} />}
    </>
  );
}
