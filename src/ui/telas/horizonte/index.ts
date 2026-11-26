import { createElement } from 'react';
import { fonteFicticia } from './ficticio';
import { Horizonte } from './Horizonte';

export { Horizonte } from './Horizonte';
export type * from './modelo';

/** Fonte única da aba; troca para o adaptador do contrato src/horizonte quando o motor entrar. */
const fonte = fonteFicticia();
export const HorizonteTela = () => createElement(Horizonte, { fonte });
