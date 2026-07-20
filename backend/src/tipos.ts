// Tipos compartilhados pelo backend. Espelham (em parte) os tipos do app
// pra evitar divergência no formato dos dados trocados via HTTP.

export type Cliente = {
  clienteId: string
  nome: string
  contato?: string
  criadoEm: string // ISO date
  validadeAtual?: string // AAAA-MM-DD da licença atual ativa
  ultimoPagamentoEm?: string // ISO date do último pagamento confirmado
  // Valor cobrado neste cliente nas próximas renovações (em centavos). Quando
  // definido, sobrescreve o que o app envia em POST /cobranca. Permite cobrar
  // valores diferentes por cliente sem precisar de release do app.
  valorCentavosRenovacao?: number
  // CNPJ do emitente fiscal desta loja (só dígitos). A conta ACBr é uma só
  // (guarda-chuva), e cada loja cadastra a própria empresa dentro dela. Este
  // vínculo trava uma loja de operar a NFC-e de OUTRO CNPJ que não o seu —
  // gravado no 1º cadastro e conferido nas chamadas seguintes.
  cnpjEmitente?: string
}

export type StatusCobranca = 'pendente' | 'paga' | 'expirada'

export type Cobranca = {
  txid: string
  clienteId: string
  valorCentavos: number
  diasContratados: number
  status: StatusCobranca
  qrcode: string // copia-e-cola PIX
  qrcodeBase64: string // imagem do QR pra exibir no app
  criadaEm: string // ISO
  expiraEm: string // ISO
  pagaEm?: string // ISO quando pago
  chaveLicencaGerada?: string // chave assinada emitida após pagamento confirmado
}

// Configuração lida de env vars no boot. Centraliza tudo que vem de fora
// pra que o código de domínio não dependa de process.env espalhado.
export type Config = {
  CHAVE_HMAC: string
  ADMIN_TOKEN: string
}
