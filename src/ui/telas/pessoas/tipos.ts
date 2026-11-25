import type { Ctx } from '../../../lib/types';

/** O que mudou: a camada de dados grava só a parte indicada (uma tabela por parte). */
export type Parte = 'pessoas' | 'regras' | 'tags' | 'preferencias' | 'parcelas';

export interface PessoasMemoriaProps {
  ctx: Ctx;
  /** Chamado depois de cada alteração, já aplicada em ctx.d. */
  onChange: (parte: Parte) => void;
}

/** Subcomponentes: recebem o contexto, avisam a mudança e pedem para redesenhar. */
export interface SecaoProps extends PessoasMemoriaProps {
  /** Pede confirmação (diálogo próprio, funciona no iPhone). */
  confirmar: (texto: string, acao: () => void, rotulo?: string) => void;
  /** Redesenha a tela inteira (o contexto é mutável). */
  redesenhar: () => void;
}
