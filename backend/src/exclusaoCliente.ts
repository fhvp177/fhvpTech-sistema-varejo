/**
 * Apagar o cadastro de um cliente — e quando NÃO apagar.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 * Até aqui o cadastro era irreversível para mais: não dava para apagar, nem
 * renomear, nem encurtar um `clienteId`. O efeito prático era o conselho "na
 * dúvida, cadastre curto" — ou seja, o medo de errar moldando o nome que o
 * cliente carrega para sempre.
 *
 * O caso real é quase sempre o mesmo: cadastrou `NETOIMPORTS`, queria `NETO`,
 * percebeu em cinco minutos. Isso merece um desfazer.
 *
 * ── Por que NÃO é um apagar simples ─────────────────────────────────────────
 * O `clienteId` é a chave da numeração da NFC-e (`nfce_numero`). Apagar um
 * cliente que já emitiu, e depois recriar o mesmo id, reiniciaria a sequência —
 * e nota fiscal com número repetido é problema com a SEFAZ, não com o software.
 * Não é um erro que se conserta com um segundo `DELETE`.
 *
 * Por isso a regra é estreita de propósito: apaga o cadastro que ainda não
 * PRODUZIU nada. Um cliente com nota emitida, número reservado ou renovação
 * paga não é engano de digitação — é história, e história não se apaga por rota
 * de API.
 *
 * ── "Tem pagamento" não serve como sinal ────────────────────────────────────
 * Foi a primeira tentativa, e estava errada: TODO cliente nasce com
 * `ultimoPagamentoEm` preenchido, gravado pela própria rota de cadastro. A
 * regra recusava apagar o cadastro recém-criado, ou seja, justamente o caso
 * que ela deveria atender.
 *
 * O sinal usado é a RENOVAÇÃO PAGA. No cadastro, `criadoEm` e
 * `ultimoPagamentoEm` saem do mesmo instante; só um pagamento descola os dois.
 *
 * ⚠️ **Renovação concedida pelo admin NÃO é detectada.** A rota
 * `/admin/cliente/:id/renovar` só estende `validadeAtual` — ela não registra
 * pagamento, porque não houve. Quem estende a validade pela mão é a mesma
 * pessoa que apagaria o cadastro, e com o mesmo token; não faz sentido a regra
 * proteger alguém de si mesmo.
 *
 * Quem cobre esse vão é o CNPJ: uma loja que configurou os dados fiscais
 * existe de verdade, independente de como a validade dela foi parar ali.
 *
 * ── Reservado conta, mesmo sem nota ─────────────────────────────────────────
 * A conferência olha `proximo > 1` em `nfce_numero`, e não só as emissões. Um
 * número pode ter sido RESERVADO e a transmissão ter falhado: para a SEFAZ
 * aquele número existe e precisa ser justificado. Olhar só as emissões deixaria
 * passar exatamente o caso mais confuso de resolver depois.
 */
/** O que impede apagar. Vazio significa "pode". */
export interface Impedimentos {
  /** Notas transmitidas. */
  emissoes: number
  /** Séries com número já reservado (mesmo que a nota não tenha saído). */
  seriesUsadas: number
  /**
   * Se o cliente já foi RENOVADO alguma vez.
   *
   * ⚠️ Não confundir com "tem data de pagamento": todo cliente nasce com uma,
   * gravada pela própria rota de cadastro. Usar aquele campo cru recusaria
   * apagar o cadastro recém-criado — exatamente o caso que esta rota existe
   * para atender.
   *
   * O que separa um do outro é a comparação: no cadastro, `criadoEm` e
   * `ultimoPagamentoEm` saem idênticos. Só uma renovação descola os dois.
   */
  renovado: boolean
  /**
   * Se a loja já cadastrou o CNPJ emitente.
   *
   * É o sinal mais forte de "esta loja existe de verdade": alguém sentou,
   * configurou os dados fiscais e vinculou um CNPJ. Um cadastro criado por
   * engano nunca chega aí.
   *
   * Vale como guarda separado porque cobre o buraco do sinal de renovação —
   * ver o cabeçalho.
   */
  temCnpj: boolean
}

export function podeApagar(i: Impedimentos): boolean {
  return i.emissoes === 0 && i.seriesUsadas === 0 && !i.renovado && !i.temCnpj
}

/**
 * Impedimento que NENHUMA confirmação derruba.
 *
 * ★ A linha é entre regra COMERCIAL e regra FISCAL, e ela é o ponto todo da
 * exclusão forçada.
 *
 * Renovação paga é comercial: diz que houve dinheiro, e quem administra pode
 * saber que aquele dinheiro foi um teste dele mesmo, feito para exercitar o
 * fluxo do PIX. É o mesmo raciocínio que este módulo já aplica à validade
 * estendida à mão, no cabeçalho: não faz sentido a regra proteger alguém de
 * si mesmo.
 *
 * Nota emitida, número de série reservado e CNPJ vinculado são fiscais. Para
 * a SEFAZ aquele número existe, e apagar o cadastro deixa a numeração livre
 * para recomeçar do 1 se um dia nascer outro cadastro com o mesmo id. Isso
 * não é decisão de dono: é problema com o fisco, e por isso não há
 * confirmação, marcação ou insistência que passe por cima.
 */
export function impedimentoFiscal(i: Impedimentos): boolean {
  return i.emissoes > 0 || i.seriesUsadas > 0 || i.temCnpj
}

/**
 * A frase que explica a recusa a quem está do outro lado da API.
 *
 * Diz o QUE impede e o que fazer no lugar — "não pode" sozinho faria a pessoa
 * tentar de novo, ou pior, mexer no banco na mão.
 */
export function motivoDaRecusa(clienteId: string, i: Impedimentos): string {
  const partes: string[] = []
  if (i.emissoes > 0) partes.push(`${i.emissoes} nota(s) fiscal(is) emitida(s)`)
  if (i.seriesUsadas > 0) partes.push(`numeração de NFC-e já iniciada em ${i.seriesUsadas} série(s)`)
  if (i.renovado) partes.push('renovação já paga')
  if (i.temCnpj) partes.push('CNPJ emitente cadastrado')

  return (
    `O cliente ${clienteId} tem ${partes.join(' e ')} — apagar reiniciaria a ` +
    'numeração fiscal se o mesmo id for recriado, e isso vira problema com a ' +
    'SEFAZ. Para encerrar um cliente que existe de verdade, bloqueie a ' +
    'renovação em vez de apagar o cadastro.'
  )
}

/**
 * Quanto tempo depois do cadastro ainda se considera "o mesmo momento".
 *
 * Existe porque os clientes cadastrados ANTES desta regra têm os dois campos
 * separados por alguns milissegundos — a rota chamava o relógio duas vezes.
 * Comparar por igualdade exata leria todos eles como renovados.
 *
 * Dois segundos, e não mais: o vão entre duas linhas de código adjacentes é de
 * milissegundos, então a folga só precisa absorver isso. Com um minuto — como
 * estava — uma renovação feita logo depois do cadastro passava despercebida, e
 * o cliente podia ser apagado como se nada tivesse acontecido.
 *
 * Clientes cadastrados a partir daqui nem dependem disto: a rota passou a
 * gravar o MESMO instante nos dois campos.
 */
const MESMO_MOMENTO_MS = 2_000

/**
 * Se este cliente já foi renovado — ou seja, se existe história de verdade.
 *
 * ⚠️ Não basta olhar se `ultimoPagamentoEm` existe: TODO cliente nasce com um,
 * gravado pela própria rota de cadastro. O que distingue é a DISTÂNCIA até
 * `criadoEm`.
 */
export function foiRenovado(cliente: {
  criadoEm?: string
  ultimoPagamentoEm?: string
}): boolean {
  if (!cliente.ultimoPagamentoEm || !cliente.criadoEm) return false

  const pago = Date.parse(cliente.ultimoPagamentoEm)
  const criado = Date.parse(cliente.criadoEm)
  // Data ilegível: erra para o lado de recusar a exclusão.
  if (Number.isNaN(pago) || Number.isNaN(criado)) return true

  return pago - criado > MESMO_MOMENTO_MS
}
