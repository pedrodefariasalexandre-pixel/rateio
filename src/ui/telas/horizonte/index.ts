import { createElement } from 'react';
import { isLocalMode } from '../../../data/auth';
import { supabase } from '../../../data/supabase';
import { supabaseHorizonRepo } from '../../../horizonte/repo';
import { fonteDoContrato } from './contrato';
import { fonteFicticia } from './ficticio';
import { Horizonte } from './Horizonte';

export { Horizonte } from './Horizonte';
export type * from './modelo';

/** Produção: motor + Supabase. Modo local (dev/E2E): dados fictícios. */
const fonte =
  supabase && !isLocalMode ? fonteDoContrato(supabaseHorizonRepo(supabase)) : fonteFicticia();
export const HorizonteTela = () => createElement(Horizonte, { fonte });
