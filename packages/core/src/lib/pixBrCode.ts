// Monta o "BR Code" do PIX — a receita que vira o QR impresso no cupom.
//
// O código PIX não é um segredo nem depende de banco: é um texto montado por
// uma regra pública do Banco Central (o "EMV MPM"), onde cada campo é escrito
// como ID + TAMANHO + VALOR, um atrás do outro, e no fim vai um dígito de
// verificação. Quem escaneia lê esse texto e já sabe pra quem mandar e quanto.
// Por isso dá pra gerar aqui dentro, offline, sem taxa e sem integração.
//
// ── Decisões que valem explicação ────────────────────────────────────────────
//
// 1. NÃO usamos o campo "Point of Initiation Method" (01). Ele diria "este QR é
//    de uso único". Seria semanticamente certo — o QR vale por uma dívida —
//    mas app de banco que leva a sério recusa a segunda leitura, e o cliente
//    que escaneou, desistiu e voltou ficaria travado com o papel na mão.
//    Omitir faz o QR nascer reutilizável, que é o que sempre funciona.
//
// 2. O txid (campo 62.05) vai como "***", e não como o número da venda.
//    Carregar o número ajudaria o lojista a conciliar o extrato, mas txid fora
//    do padrão é recusado por parte dos bancos — e um QR recusado no papel é um
//    defeito que ninguém consegue depurar no balcão. Na prática o lojista
//    identifica pelo nome de quem pagou, que o PIX sempre carrega.
//
// 3. Tudo vira ASCII antes de entrar. O TAMANHO de cada campo é contado em
//    BYTES, não em letras: deixar um "ã" passar faria o tamanho declarado
//    mentir e o QR inteiro seria rejeitado. Como o texto é ASCII puro, byte e
//    caractere viram a mesma coisa e a conta fecha.

export type TipoChavePix = 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria'

export const ROTULO_TIPO_CHAVE: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  telefone: 'Celular',
  email: 'E-mail',
  aleatoria: 'Chave aleatória'
}

export type ResultadoChave =
  | { ok: true; tipo: TipoChavePix; valor: string }
  | { ok: false; erro: string }

export type ParamsBrCodePix = {
  chave: string
  /** Nome que aparece pro cliente no app do banco. Máx. 25 caracteres. */
  beneficiario: string
  /** Cidade do recebedor. Máx. 15 caracteres. */
  cidade: string
  /** Valor em reais. Precisa ser maior que zero. */
  valor: number
  /** Força o tipo da chave em vez de deduzir (resolve o empate CPF × celular). */
  tipo?: TipoChavePix
}

export type ResultadoBrCode = { ok: true; payload: string } | { ok: false; erro: string }

const MAX_BENEFICIARIO = 25
const MAX_CIDADE = 15
const MAX_EMAIL = 77

// ── A chave ──────────────────────────────────────────────────────────────────

const soDigitos = (texto: string): string => texto.replace(/\D/g, '')

// Confere os dois dígitos finais do CPF/CNPJ. Não prova que a chave é DO
// lojista — só pega o dedo trocado, que é o erro comum. Quem confere de
// verdade é o próprio lojista, escaneando a prévia na tela de configuração.
function digitosConferem(numero: string, pesosIniciais: number): boolean {
  const base = numero.slice(0, -2)
  let verificadores = ''
  for (let rodada = 0; rodada < 2; rodada++) {
    const corpo = base + verificadores
    let peso = pesosIniciais + rodada
    let soma = 0
    for (const caractere of corpo) {
      soma += Number(caractere) * peso
      peso--
      if (peso < 2) peso = 9
    }
    const resto = soma % 11
    verificadores += resto < 2 ? '0' : String(11 - resto)
  }
  return verificadores === numero.slice(-2)
}

const cpfValido = (d: string): boolean =>
  d.length === 11 && !/^(\d)\1{10}$/.test(d) && digitosConferem(d, 10)

const cnpjValido = (d: string): boolean =>
  d.length === 14 && !/^(\d)\1{13}$/.test(d) && digitosConferem(d, 5)

// Telefone brasileiro, com o formato apertado de propósito: DDD (dois dígitos,
// nenhum deles zero) seguido de celular começando em 9 ou de fixo começando
// entre 2 e 5.
//
// A frouxidão aqui custa caro. Um CPF digitado errado tem os mesmos 11 dígitos
// de um celular: com a regra larga ("DDD + 9 dígitos quaisquer"), o CPF cujo
// verificador não fecha escorregava pro lado do telefone e virava uma chave
// PIX plausível e errada — sem erro nenhum na tela, e com o dinheiro do cliente
// indo pra chave de outra pessoa. Exigir o 9 do celular fecha essa porta.
const pareceTelefone = (d: string): boolean =>
  /^[1-9][1-9]9\d{8}$/.test(d) || /^[1-9][1-9][2-5]\d{7}$/.test(d)

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ALEATORIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Descobre de que tipo é a chave e devolve no formato que o PIX exige.
 *
 * O empate mora nos 11 dígitos: CPF e celular têm o mesmo tamanho. Desempatamos
 * pelos dígitos verificadores — se fecham como CPF, é CPF. Quem tem celular
 * cadastrado e caiu no lado errado resolve escolhendo o tipo na mão, que é o
 * motivo de `tipo` existir.
 */
export function analisarChavePix(bruta: string, tipo?: TipoChavePix): ResultadoChave {
  const texto = (bruta ?? '').trim()
  if (!texto) return { ok: false, erro: 'Informe a chave PIX.' }

  const digitos = soDigitos(texto)
  const temMais = texto.startsWith('+')

  if (tipo === 'email' || (!tipo && texto.includes('@'))) {
    const email = texto.toLowerCase()
    if (!EMAIL.test(email)) return { ok: false, erro: 'E-mail inválido.' }
    if (email.length > MAX_EMAIL)
      return { ok: false, erro: `E-mail longo demais (máximo ${MAX_EMAIL} caracteres).` }
    return { ok: true, tipo: 'email', valor: email }
  }

  if (tipo === 'aleatoria' || (!tipo && ALEATORIA.test(texto))) {
    if (!ALEATORIA.test(texto))
      return { ok: false, erro: 'Chave aleatória inválida (são 32 caracteres com hífens).' }
    return { ok: true, tipo: 'aleatoria', valor: texto.toLowerCase() }
  }

  if (tipo === 'cnpj' || (!tipo && digitos.length === 14)) {
    if (!cnpjValido(digitos)) return { ok: false, erro: 'CNPJ inválido.' }
    return { ok: true, tipo: 'cnpj', valor: digitos }
  }

  if (tipo === 'cpf') {
    if (!cpfValido(digitos)) return { ok: false, erro: 'CPF inválido.' }
    return { ok: true, tipo: 'cpf', valor: digitos }
  }

  if (tipo === 'telefone' || temMais) {
    const nacional = digitos.replace(/^55/, '')
    if (!pareceTelefone(nacional))
      return { ok: false, erro: 'Celular inválido. Use DDD + número, ex.: (11) 99999-9999.' }
    return { ok: true, tipo: 'telefone', valor: `+55${nacional}` }
  }

  if (!tipo) {
    if (cpfValido(digitos)) return { ok: true, tipo: 'cpf', valor: digitos }
    if (pareceTelefone(digitos)) return { ok: true, tipo: 'telefone', valor: `+55${digitos}` }

    // Onze dígitos que não fecham como CPF nem têm cara de celular são, quase
    // sempre, um CPF com um número trocado. Dizer "chave não reconhecida" ali
    // é jogar a pessoa de volta pro começo, quando o que ela precisa ouvir é
    // "confira os números" — este é o erro mais provável da tela inteira.
    if (digitos.length === 11)
      return {
        ok: false,
        erro: 'CPF inválido — confira os números. Se for um celular, escolha "Celular" no tipo.'
      }
  }

  return {
    ok: false,
    erro: 'Chave não reconhecida. Use CPF, CNPJ, celular, e-mail ou a chave aleatória.'
  }
}

// ── O payload ────────────────────────────────────────────────────────────────

/** Um campo do BR Code: identificador, tamanho com dois dígitos, conteúdo. */
const campo = (id: string, valor: string): string =>
  `${id}${String(valor.length).padStart(2, '0')}${valor}`

/**
 * Deixa o texto em ASCII. Acento vira a letra sem acento; o que não for ASCII
 * imprimível cai fora. Ver a decisão 3 no topo do arquivo.
 *
 * A dupla abaixo é o truque todo, e a ordem importa. O `normalize('NFD')`
 * separa "ã" em "a" + um acento avulso; o filtro seguinte varre tudo que não
 * for ASCII imprimível e leva o acento avulso junto com emoji e símbolo,
 * deixando o "a" de pé. Sem o NFD, o "ã" seria um caractere não-ASCII inteiro e
 * o filtro apagaria a LETRA — "Açúcar" viraria "Acar".
 *
 * Maiúsculas e minúsculas são preservadas de propósito: o padrão aceita as
 * duas, e é este nome que o cliente lê no app do banco na hora de confirmar o
 * pagamento — "Loja do Joao" se reconhece melhor que "LOJA DO JOAO".
 */
export function normalizarTextoPix(texto: string, maximo: number): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximo)
    .trim()
}

/**
 * Dígito de verificação do BR Code (CRC-16/CCITT-FALSE). É calculado sobre o
 * payload INTEIRO, já incluindo o "6304" que o anuncia — por isso ele é sempre
 * o último campo e por isso a conta é feita no fim.
 */
export function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Monta o texto completo do PIX pronto pra virar QR.
 *
 * Devolve o motivo quando não dá — nunca um QR pela metade. Cupom sem QR é um
 * cupom normal; cupom com QR quebrado é dinheiro que não chega e ninguém
 * descobre por quê.
 */
export function montarBrCodePix(p: ParamsBrCodePix): ResultadoBrCode {
  const chave = analisarChavePix(p.chave, p.tipo)
  if (!chave.ok) return { ok: false, erro: chave.erro }

  const beneficiario = normalizarTextoPix(p.beneficiario, MAX_BENEFICIARIO)
  if (!beneficiario)
    return { ok: false, erro: 'Preencha o nome da loja em "Dados da loja" para gerar o QR.' }

  const cidade = normalizarTextoPix(p.cidade, MAX_CIDADE)
  if (!cidade)
    return { ok: false, erro: 'Preencha a cidade da loja em "Dados da loja" para gerar o QR.' }

  if (!Number.isFinite(p.valor)) return { ok: false, erro: 'O valor precisa ser um número.' }

  // A conferência é feita DEPOIS de arredondar, não antes. Testar o valor cru
  // deixava passar a sobra de centavo: 0,004 é maior que zero, mas arredonda
  // pra zero e o QR sairia pedindo R$ 0,00 — um código que o cliente escaneia,
  // não entende, e o lojista não consegue explicar.
  const centavos = Math.round(p.valor * 100)
  if (centavos <= 0) return { ok: false, erro: 'O valor precisa ser maior que zero.' }
  const valor = (centavos / 100).toFixed(2)
  if (valor.length > 13) return { ok: false, erro: 'Valor alto demais para um QR PIX.' }

  const contaPix = campo('00', 'br.gov.bcb.pix') + campo('01', chave.valor)

  const semCrc =
    campo('00', '01') +
    campo('26', contaPix) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valor) +
    campo('58', 'BR') +
    campo('59', beneficiario) +
    campo('60', cidade) +
    campo('62', campo('05', '***')) +
    '6304'

  return { ok: true, payload: semCrc + crc16(semCrc) }
}
