// Regras da revenda em 2 níveis: FHVP → revendedor → lojista.
//
// Código PURO de propósito (sem banco, sem HTTP), no mesmo padrão do nfce.ts e
// do relogioLogica do app: são as regras que seguram dinheiro e poder, e elas
// precisam ser testáveis sem subir nada.
//
// ── O que sustenta o modelo inteiro ─────────────────────────────────────────
// A licença do lojista é validada OFFLINE pelo app, então não existe revogar
// antes da data. "Bloquear" é, na prática, DEIXAR DE RENOVAR — e é por isso que
// o período é curto (~30 dias). Daí saem as duas regras deste arquivo:
//
//   1. TETO — o revendedor nunca emite chave que ultrapasse a validade DELE.
//      Sem isso ele renova a carteira toda por 10 anos na véspera do calote e o
//      bloqueio vira enfeite. O teto é o que faz "estrangular" funcionar
//      sozinho, sem tocar em loja nenhuma.
//
//   2. BLOQUEIO GANHA DE PAGAMENTO — dinheiro mexe na validade; bloqueio é uma
//      chave à parte. Emitir exige as DUAS coisas: em dia E não bloqueado.
//      Sem isso, quem foi bloqueado paga o PIX de sempre e se restaura sozinho.
//
// ⚠️ Regra estrutural que NÃO mora aqui porque não pode depender de conferência:
// o revendedor emite chave para os CLIENTES dele, nunca para si mesmo. A
// validade dele vive noutra tabela (`revendedores`) e o caminho que ele usa só
// sabe escrever em `clientes`. Se um dia isso virar uma checagem `if`, o teto
// passa a poder se levantar sozinho.

/** Quem revende. A `validade` é a coleira: teto de tudo que ele emite. */
export type Revendedor = {
  revendedorId: string
  nome: string
  contato?: string
  criadoEm: string // ISO
  /** AAAA-MM-DD — até quando ele pode operar. Renovada por PIX ou pela FHVP. */
  validade?: string
  /** Marcado à mão pela FHVP. Independente da validade: pagar não desfaz. */
  bloqueado?: boolean
  /** Anotação do porquê, para quem for destravar depois entender. */
  motivoBloqueio?: string
  /** Preço de atacado por cliente ativo, em centavos. Por plano. */
  precoCentavosBasico?: number
  precoCentavosPro?: number
  /**
   * Piso da mensalidade dele, em centavos.
   *
   * Existe para destravar a armadilha do recomeço: quem deixa a assinatura
   * vencer perde os clientes um a um, e chega ao ponto de ter ZERO ativos — aí
   * a conta por cliente daria R$0 e não há PIX de zero real para gerar. Sem
   * piso, ele ficaria impedido de voltar justamente por estar parado.
   */
  precoCentavosMinimo?: number
  /** Hash da senha do painel (formato do revendaAuth). Ausente = ele ainda não
   *  tem acesso — a FHVP define a primeira. NUNCA sai em resposta de rota. */
  senhaHash?: string
  /**
   * Para onde vai o código quando ele esquece a senha.
   *
   * Exigido na CRIAÇÃO (`POST /admin/revendedor`), mas opcional no tipo de
   * propósito: os revendedores cadastrados antes desta regra existem sem ele,
   * e tratar essa ausência como impossível quebraria a leitura deles. Quem
   * está sem aparece marcado na listagem e leva aviso permanente no painel.
   */
  email?: string
}

export type EstadoRevendedor = 'ativo' | 'em_graca' | 'vencido' | 'bloqueado'

/**
 * Dias que ele continua operando depois da validade vencer.
 *
 * Existe para atraso bancário não virar crise: validade que vence na sexta não
 * pode deixar a carteira dele parada até segunda. Não é generosidade — é evitar
 * suporte de emergência no fim de semana por causa de um boleto de dois dias.
 */
export const DIAS_DE_GRACA = 3

/** Período padrão de uma licença de lojista. Curto DE PROPÓSITO: é o que torna
 *  "bloquear = não renovar" uma alavanca real em vez de teoria. */
export const DIAS_PADRAO_LICENCA = 30

function fimDoDia(data: string): number {
  return new Date(data + 'T23:59:59Z').getTime()
}

function dataValida(data: string | undefined): data is string {
  return typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data) && !isNaN(fimDoDia(data))
}

/**
 * Em que pé está o revendedor.
 *
 * A ordem importa: BLOQUEADO vence tudo. Um revendedor bloqueado com validade
 * em dia continua bloqueado — é exatamente esse caso que impede alguém de se
 * desbloquear pagando.
 */
export function estadoRevendedor(r: Revendedor, agora: number = Date.now()): EstadoRevendedor {
  if (r.bloqueado) return 'bloqueado'
  if (!dataValida(r.validade)) return 'vencido'
  const limite = fimDoDia(r.validade)
  if (agora <= limite) return 'ativo'
  if (agora <= limite + DIAS_DE_GRACA * 86_400_000) return 'em_graca'
  return 'vencido'
}

/** Só quem está em dia (ou na graça) e destravado consegue emitir chave. */
export function podeEmitir(r: Revendedor, agora: number = Date.now()): boolean {
  const estado = estadoRevendedor(r, agora)
  return estado === 'ativo' || estado === 'em_graca'
}

/**
 * ★ A REGRA-MESTRE: corta a validade pedida no teto do revendedor.
 *
 * Cliente direto da FHVP (sem revendedor) não tem teto — passa reto. Para
 * cliente de revendedor, devolve a MENOR entre o que foi pedido e a validade
 * dele. Revendedor sem validade legível não emite nada: na dúvida, recusa.
 */
export function limitarAoTeto(
  expiracaoPedida: string,
  revendedor: Revendedor | null | undefined
): { ok: true; expiracao: string; cortada: boolean } | { ok: false; erro: string } {
  if (!dataValida(expiracaoPedida)) {
    return { ok: false, erro: 'data de expiração inválida' }
  }
  if (!revendedor) {
    // Cliente direto da FHVP: quem manda é quem pediu.
    return { ok: true, expiracao: expiracaoPedida, cortada: false }
  }
  if (!dataValida(revendedor.validade)) {
    return { ok: false, erro: 'revendedor sem validade definida' }
  }
  // O corte usa a validade CRUA, não a graça: a graça serve para ele continuar
  // operando por alguns dias, não para esticar o que ele entrega ao lojista.
  if (fimDoDia(expiracaoPedida) > fimDoDia(revendedor.validade)) {
    return { ok: true, expiracao: revendedor.validade, cortada: true }
  }
  return { ok: true, expiracao: expiracaoPedida, cortada: false }
}

/**
 * Monta o clienteId definitivo a partir do sufixo escolhido pelo revendedor.
 *
 * ⚠️ Isto NÃO é cosmético. `nfce_numero` e `nfce_emissao` são chaveadas por
 * cliente_id — duas lojas com o mesmo id dividiriam o contador da NFC-e e
 * emitiriam nota com número repetido, que é problema com a SEFAZ. Prefixar é
 * barato agora e caríssimo depois da primeira nota emitida.
 *
 * Cliente direto da FHVP segue sem prefixo (compatibilidade com os que existem).
 */
export function montarClienteId(revendedorId: string | null | undefined, sufixo: string): string {
  const limpo = sufixo.trim().toUpperCase()
  if (!revendedorId) return limpo
  return `${revendedorId.trim().toUpperCase()}-${limpo}`
}

/** Formato aceito para id de revendedor e sufixo de cliente. Sem hífen no
 *  sufixo para o prefixo continuar sendo separável a olho nu. */
export function idValido(id: string): boolean {
  return /^[A-Z0-9]{2,20}$/.test(id.trim().toUpperCase())
}

/**
 * Um cliente está impedido de RENOVAR?
 *
 * Note o que isto NÃO faz: não derruba o período que ele já tem. A licença dele
 * segue valendo até a data, offline, como sempre. Bloquear é sobre o próximo
 * ciclo — que é a única coisa que dá para controlar em sistema offline.
 */
export function clienteBloqueado(cliente: { bloqueadoPor?: 'revendedor' | 'fhvp' }): boolean {
  return cliente.bloqueadoPor === 'revendedor' || cliente.bloqueadoPor === 'fhvp'
}

/**
 * Quem bloqueou pode desbloquear?
 *
 * O revendedor mexe no que ele mesmo trancou. Bloqueio posto pela FHVP é
 * intocável por ele — sem esta regra, o poder de última instância não existe,
 * porque ele desfaria no clique seguinte.
 */
export function podeDesbloquear(
  quemPede: 'revendedor' | 'fhvp',
  bloqueadoPor: 'revendedor' | 'fhvp' | undefined
): boolean {
  if (!bloqueadoPor) return true // já está livre
  if (quemPede === 'fhvp') return true // a FHVP desfaz qualquer um
  return bloqueadoPor === 'revendedor'
}
