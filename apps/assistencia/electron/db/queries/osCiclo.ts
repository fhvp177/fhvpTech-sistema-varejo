// Ciclo de vida da Ordem de Serviço — módulo PURO (sem banco) pra regra de
// transição ser testável no vitest sem o ABI do better-sqlite3.
//
//   aberta → orcamento → aguardando_aprovacao → aprovada ─┬─ (bancada) ──► em_reparo → pronta → entregue
//                             │        │                  └─ (externo) ► agendada ──┘   ⇅
//                             ▼        └► orcamento (voltar p/ ajustar)         aguardando_peca
//                          recusada
//   cancelada: de qualquer estado em andamento, com motivo.

export type TipoAtendimento = 'bancada' | 'externo'

export type StatusOS =
  | 'aberta'
  | 'orcamento'
  | 'aguardando_aprovacao'
  | 'aprovada'
  | 'agendada'
  | 'em_reparo'
  | 'aguardando_peca'
  | 'pronta'
  | 'entregue'
  | 'recusada'
  | 'cancelada'

// Padrão decidido pelo dono do produto (2026-07-05): 45 dias, editável por OS.
export const GARANTIA_PADRAO_DIAS = 45

export const ROTULOS_STATUS: Record<StatusOS, string> = {
  aberta: 'Aberta',
  orcamento: 'Em orçamento',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovada: 'Aprovada',
  agendada: 'Agendada',
  em_reparo: 'Em reparo',
  aguardando_peca: 'Aguardando peça',
  pronta: 'Pronta',
  entregue: 'Entregue',
  recusada: 'Recusada',
  cancelada: 'Cancelada'
}

export const STATUS_ENCERRADOS: readonly StatusOS[] = ['entregue', 'recusada', 'cancelada']

const TRANSICOES: Record<StatusOS, StatusOS[]> = {
  aberta: ['orcamento', 'cancelada'],
  orcamento: ['aguardando_aprovacao', 'cancelada'],
  aguardando_aprovacao: ['aprovada', 'recusada', 'orcamento', 'cancelada'],
  aprovada: ['em_reparo', 'agendada', 'cancelada'],
  agendada: ['em_reparo', 'cancelada'],
  em_reparo: ['aguardando_peca', 'pronta', 'cancelada'],
  aguardando_peca: ['em_reparo', 'cancelada'],
  pronta: ['entregue', 'cancelada'],
  entregue: [],
  recusada: [],
  cancelada: []
}

// Uma transição é válida se está no mapa E respeita o tipo de atendimento:
// 'agendada' só existe no atendimento externo (bancada não agenda visita).
export function podeTransitar(de: StatusOS, para: StatusOS, tipo: TipoAtendimento): boolean {
  if (para === 'agendada' && tipo !== 'externo') return false
  return TRANSICOES[de]?.includes(para) ?? false
}

export function transicoesPermitidas(de: StatusOS, tipo: TipoAtendimento): StatusOS[] {
  return (TRANSICOES[de] ?? []).filter((para) => podeTransitar(de, para, tipo))
}

export function estaEncerrada(status: StatusOS): boolean {
  return STATUS_ENCERRADOS.includes(status)
}
