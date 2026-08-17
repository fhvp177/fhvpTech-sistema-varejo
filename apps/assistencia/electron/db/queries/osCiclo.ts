// Ciclo de vida da Ordem de Serviço — módulo PURO (sem banco) pra regra de
// transição ser testável no vitest sem o ABI do better-sqlite3.
//
//   aberta → orcamento → aguardando_aprovacao → aprovada ─┬─ (bancada) ──► em_reparo → pronta → entregue
//                             │        │                  └─ (externo) ► agendada ──┘   ⇅
//                             ▼        └► orcamento (voltar p/ ajustar)         aguardando_peca
//                          recusada
//   cancelada: de qualquer estado em andamento, com motivo.

export type TipoAtendimento = 'bancada' | 'externo'

// ONDE o trabalho acontece é o TipoAtendimento; O QUE ele é, é a natureza.
// Instalação (CFTV, alarme, SSD no notebook) não tem "defeito" — os rótulos
// da UI e dos documentos se ajustam por ela.
export type NaturezaOS = 'conserto' | 'instalacao'

// EM QUE se trabalha: um aparelho avulso ou um sistema de CFTV. É a primeira
// pergunta da Nova OS — o formulário inteiro se adapta por ela (equipamento
// pede aparelho/série/senha; CFTV é sempre no local e pede endereço/escopo).
export type CategoriaOS = 'equipamento' | 'cftv'

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

// Padrão decidido pelo dono do produto: 45 dias em 2026-07-05, revisto para
// **90 dias** em 2026-08-16. Continua editável por OS, na tela de detalhe.
//
// ⚠️ Quem manda é ESTA constante — `criarOS` e `criarOSGarantia` a passam no
// INSERT. A coluna `garantia_dias` da migration 028 ainda tem `DEFAULT 45`, e é
// preciso deixar assim: migration já aplicada não se edita, e o SQLite não muda
// o default de uma coluna sem reconstruir a tabela inteira. Esse default virou
// letra morta — nenhum caminho do código chega nele.
//
// Mudar este número NÃO mexe em OS já aberta. A garantia que o cliente levou
// escrita no comprovante é a que vale; o número novo só alcança OS nova.
export const GARANTIA_PADRAO_DIAS = 90

export const ROTULOS_STATUS: Record<StatusOS, string> = {
  aberta: 'Aberta',
  orcamento: 'Em orçamento',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovada: 'Aprovada',
  agendada: 'Agendada',
  em_reparo: 'Em execução', // neutro: vale pra conserto E instalação
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
