import { createElement, useMemo } from 'react';
import { isLocalMode } from '../../../data/auth';
import { supabase } from '../../../data/supabase';
import { supabaseHorizonRepo } from '../../../horizonte/repo';
import { useRateio } from '../../AppContext';
import { fonteDoContrato } from './contrato';
import { fonteFicticia } from './ficticio';
import { Horizonte } from './Horizonte';
import { minhaParte } from './minhaParte';

export { Horizonte } from './Horizonte';
export type * from './modelo';

/** Produção: motor + Supabase, só a parte do Pedro (memória de donos). Modo local: fictícios. */
export function HorizonteTela() {
  const { ctx } = useRateio();
  const fonte = useMemo(
    () =>
      supabase && !isLocalMode
        ? fonteDoContrato(supabaseHorizonRepo(supabase), () => minhaParte(ctx))
        : fonteFicticia(),
    [ctx],
  );
  return createElement(Horizonte, { fonte });
}
