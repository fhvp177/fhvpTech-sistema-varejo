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
  // De qual revendedor esta loja veio. AUSENTE = cliente direto da FHVP, que é
  // o caso de todos os que existiam antes da revenda — por isso é opcional e
  // por isso "ausente" nunca pode ser lido como restrição.
  revendedorId?: string
  // Quem trancou a renovação desta loja. NÃO derruba o período corrente: a
  // licença dela segue valendo offline até a data. Bloquear é sobre o PRÓXIMO
  // ciclo, que é a única coisa controlável em sistema offline. Guardar QUEM
  // trancou é o que impede o revendedor de desfazer um bloqueio da FHVP.
  bloqueadoPor?: 'revendedor' | 'fhvp'
  motivoBloqueio?: string
  // Plano contratado — define o preço de atacado cobrado do revendedor.
  plano?: 'basico' | 'pro'
  // Quantas notas fiscais estão incluídas no que esta loja paga, por mês.
  // AUSENTE = ninguém combinou cota com ela; a emissão conta e não compara.
  // Nunca leia ausência como zero — zero significaria "esta loja não emite",
  // e é assim que um campo novo derruba a emissão de todos os clientes atuais.
  // O padrão por origem/plano está em `cotaPadrao()`, em cotaNotas.ts.
  tetoNotasMes?: number
  // Passar da cota IMPEDE de emitir? Padrão não. A cota é régua (gatilho de
  // renegociação, porque o preço é negociado caso a caso) — não cancela. Ligar
  // isto é decisão deliberada para um caso específico, nunca a política geral.
  bloquearAcimaDoTeto?: boolean
}

export type StatusCobranca = 'pendente' | 'paga' | 'expirada'

export type Cobranca = {
  txid: string
  // Quem está pagando. AUSENTE = cliente, que é o que toda cobrança gravada
  // antes da revenda existir é — inclusive as em voo no momento do deploy.
  // Por isso é opcional: "sem o campo" tem que continuar significando o
  // comportamento antigo, nunca uma restrição nova.
  alvo?: 'cliente' | 'revendedor'
  // Para `alvo: 'revendedor'` este campo guarda o revendedorId. O nome ficou
  // por compatibilidade com as cobranças já gravadas.
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
  /**
   * Senha do painel da FHVP. Substituiu o antigo `ADMIN_TOKEN`.
   *
   * É a fonte da verdade: não há cópia no banco, e trocar este segredo já é o
   * reset da senha. O porquê está no cabeçalho de `adminAuth.ts`.
   */
  ADMIN_SENHA: string
}
