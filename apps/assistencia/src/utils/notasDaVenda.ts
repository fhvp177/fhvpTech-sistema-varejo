/**
 * Quais notas cabem numa venda, e como resumir o estado das duas num ícone só.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 * Uma venda de assistência técnica pode render DOIS documentos fiscais, e eles
 * se somam — não são alternativas:
 *
 *   peça (mercadoria)  → NFC-e ou NF-e, imposto do ESTADO
 *   mão de obra        → NFS-e,         imposto do MUNICÍPIO
 *
 * A coluna de ações da tela de Vendas é uma fileira de ícones. Colocar um botão
 * para cada documento inchava a linha, e numa entrega de OS só de mão de obra
 * ela ainda oferecia a nota de mercadoria — que não tinha o que emitir e morria
 * com "Esta venda não tem itens", mensagem que para o dono está simplesmente
 * errada (a venda TEM itens; o que ela não tem é mercadoria).
 *
 * A regra que resolve os dois problemas mora aqui: perguntar antes QUAIS
 * documentos cabem, e só então decidir o que a tela mostra.
 *
 * Este módulo é PURO de propósito. Os testes desta casa rodam em ambiente Node,
 * sem DOM — então a lógica que decide o que aparece fica fora do componente,
 * onde dá para provar cada combinação. O componente só desenha.
 */

/** Os dois lados da mesma venda. */
export type Documento = 'mercadoria' | 'servico'

/**
 * O que o painel consegue pedir a um botão de nota.
 *
 * Mora aqui, e não dentro de um dos componentes, pra que nenhum dos dois
 * precise importar o outro só por causa de um tipo.
 */
export type GatilhoNota = { abrir: () => void }

/**
 * Status que a NFC-e/NF-e assume no banco local. `null` = nunca emitida.
 * (Espelha `NotaFiscalVenda.status` — ver electron.d.ts.)
 */
export type StatusMercadoria =
  | 'autorizado'
  | 'pendente'
  | 'cancelado'
  | 'rejeitado'
  | 'denegado'
  | 'erro'

/**
 * Status da NFS-e. Vocabulário PRÓPRIO, no feminino, e não por acaso: reusar o
 * da NFC-e já custou caro antes (a contagem mensal nunca subia). Mantido
 * separado aqui pelo mesmo motivo.
 */
export type StatusServico =
  | 'autorizada'
  | 'processando'
  | 'cancelada'
  | 'substituida'
  | 'negada'
  | 'erro'

/**
 * Quais documentos cabem nesta venda.
 *
 * Devolve na ordem em que aparecem na tela: mercadoria primeiro, porque é o que
 * o dono conhece do varejo; serviço depois.
 */
export function documentosQueCabem(venda: {
  temProduto: boolean
  temServico: boolean
}): Documento[] {
  const documentos: Documento[] = []
  if (venda.temProduto) documentos.push('mercadoria')
  if (venda.temServico) documentos.push('servico')
  return documentos
}

/**
 * Resumo do estado das notas de uma venda, para o ícone único da coluna.
 *
 * - `erro`        alguma nota foi recusada — é o que o dono precisa ver primeiro
 * - `processando` alguma está esperando resposta da SEFAZ ou da prefeitura
 * - `completa`    TODO documento que cabia já foi emitido e está válido
 * - `parcial`     ao menos um emitido, mas ainda falta outro
 * - `nenhuma`     nada emitido ainda (ou tudo que existia foi cancelado)
 *
 * A ordem de precedência importa: um erro não pode ser escondido por uma nota
 * boa ao lado. Numa venda mista, "a de peça saiu, a de serviço foi recusada"
 * tem que pintar de vermelho — senão o dono só descobre no fim do mês.
 */
export type EstadoCombinado = 'erro' | 'processando' | 'completa' | 'parcial' | 'nenhuma'

const MERCADORIA_ERRO: StatusMercadoria[] = ['rejeitado', 'denegado', 'erro']
const SERVICO_ERRO: StatusServico[] = ['negada', 'erro']

/**
 * Nota "vale" quando ela cumpre o papel dela: existe e está autorizada.
 *
 * Cancelada NÃO vale — o documento deixou de existir para o Fisco, e a venda
 * volta a ser uma venda sem nota. É por isso que ela cai em `nenhuma` e não em
 * `completa`: reemitir é um caminho legítimo, e o ícone tem que convidar.
 */
export function estadoCombinado(entrada: {
  temProduto: boolean
  temServico: boolean
  statusMercadoria: StatusMercadoria | null
  statusServico: StatusServico | null
}): EstadoCombinado {
  const cabem = documentosQueCabem(entrada)

  // Só os status dos documentos que CABEM entram na conta. Uma NFS-e recusada
  // numa venda que perdeu o item de serviço não pode pintar o ícone de vermelho
  // para sempre.
  const relevantes = cabem.map((doc) =>
    doc === 'mercadoria' ? entrada.statusMercadoria : entrada.statusServico
  )

  const ehErro = (s: StatusMercadoria | StatusServico | null): boolean =>
    s != null && (MERCADORIA_ERRO as string[]).concat(SERVICO_ERRO).includes(s)
  const ehProcessando = (s: StatusMercadoria | StatusServico | null): boolean =>
    s === 'pendente' || s === 'processando'
  const ehValida = (s: StatusMercadoria | StatusServico | null): boolean =>
    s === 'autorizado' || s === 'autorizada'

  if (relevantes.some(ehErro)) return 'erro'
  if (relevantes.some(ehProcessando)) return 'processando'

  const validas = relevantes.filter(ehValida).length
  if (validas === 0) return 'nenhuma'
  if (validas === relevantes.length) return 'completa'
  return 'parcial'
}

/** Texto do `title` do ícone — o que o dono lê antes de clicar. */
export function resumoDoEstado(estado: EstadoCombinado, cabem: Documento[]): string {
  const mista = cabem.length > 1
  switch (estado) {
    case 'erro':
      return mista ? 'Uma das notas não foi aceita' : 'A nota não foi aceita'
    case 'processando':
      return 'Aguardando resposta — clique para verificar'
    case 'completa':
      return mista ? 'As duas notas foram emitidas' : 'Nota emitida'
    case 'parcial':
      return 'Falta emitir uma das notas'
    default:
      return mista ? 'Emitir notas desta venda' : 'Emitir nota fiscal'
  }
}
