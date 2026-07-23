// Habilitação fiscal de uma loja na ACBr: cadastrar a empresa emitente, subir
// o certificado A1 e configurar a NFC-e.
//
// Por que isto existe: sem estes três passos, nenhuma nota sai. E como a ACBr
// expõe tudo por API, a loja se ativa sozinha pela tela do sistema — sem
// ninguém abrir o painel da ACBr pra cada cliente novo. Com um piloto tanto
// faz; com dez lojas, é a diferença entre um botão e uma rotina manual.
//
// ── Sobre o certificado ───────────────────────────────────────────────────────
// O A1 é a assinatura digital da empresa: quem o tem assina qualquer documento
// em nome daquele CNPJ. Ele passa por aqui SÓ DE PASSAGEM (tela → backend →
// ACBr) e a guarda fica com a ACBr, que tem estrutura pra isso. Este backend
// não grava o .pfx nem a senha em lugar nenhum, e nada disso entra em log.

import { chamarAcbr, ErroAcbr } from './acbr.ts'

export type EnderecoEmpresa = {
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
  codigo_municipio: string // IBGE, 7 dígitos
  cidade?: string
  uf: string
  cep: string
}

export type DadosEmpresa = {
  cpf_cnpj: string
  nome_razao_social: string
  nome_fantasia?: string
  email: string
  fone?: string
  inscricao_estadual?: string
  inscricao_municipal?: string
  endereco: EnderecoEmpresa
}

export type Empresa = DadosEmpresa & { created_at?: string; updated_at?: string }

// Metadados do certificado. `not_valid_after` é o que alimenta o aviso de
// vencimento no sino do sistema — sem ele, o lojista descobre que o
// certificado venceu quando a nota para de sair numa manhã de movimento.
export type CertificadoInfo = {
  serial_number?: string
  issuer_name?: string
  subject_name?: string
  nome_razao_social?: string
  cpf_cnpj?: string
  not_valid_before?: string
  not_valid_after?: string
  thumbprint?: string
}

// CRT — Código de Regime Tributário: 1 Simples, 2 Simples c/ excesso, 3 Normal.
export type ConfigNfce = {
  CRT: 1 | 2 | 3
  ambiente: 'homologacao' | 'producao'
  sefaz: { id_csc: number; csc: string }
}

const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

// A ACBr quer CNPJ sem máscara na URL e no corpo.
function exigirCnpj(cpfCnpj: string): string {
  const limpo = soDigitos(cpfCnpj)
  if (limpo.length !== 11 && limpo.length !== 14) {
    throw new ErroAcbr('validacao', 'CNPJ (ou CPF) inválido.')
  }
  return limpo
}

export async function cadastrarEmpresa(dados: DadosEmpresa): Promise<Empresa> {
  const cpfCnpj = exigirCnpj(dados.cpf_cnpj)
  return chamarAcbr<Empresa>('/empresas', {
    metodo: 'POST',
    corpo: {
      ...dados,
      cpf_cnpj: cpfCnpj,
      inscricao_estadual: dados.inscricao_estadual
        ? soDigitos(dados.inscricao_estadual)
        : undefined,
      endereco: {
        ...dados.endereco,
        cep: soDigitos(dados.endereco.cep),
        codigo_municipio: soDigitos(dados.endereco.codigo_municipio),
        uf: (dados.endereco.uf ?? '').toUpperCase()
      }
    }
  })
}

export function consultarEmpresa(cpfCnpj: string): Promise<Empresa> {
  return chamarAcbr<Empresa>(`/empresas/${exigirCnpj(cpfCnpj)}`)
}

export function atualizarEmpresa(cpfCnpj: string, dados: Partial<DadosEmpresa>): Promise<Empresa> {
  return chamarAcbr<Empresa>(`/empresas/${exigirCnpj(cpfCnpj)}`, { metodo: 'PUT', corpo: dados })
}

// Cadastra a empresa se ainda não existir; se existir, atualiza. Deixa a tela
// poder chamar "salvar" quantas vezes quiser sem precisar saber o que já foi
// feito antes.
export async function garantirEmpresa(dados: DadosEmpresa): Promise<Empresa> {
  try {
    await consultarEmpresa(dados.cpf_cnpj)
  } catch (e) {
    if (e instanceof ErroAcbr && e.codigo === 'nao_encontrado') {
      return cadastrarEmpresa(dados)
    }
    throw e
  }
  return atualizarEmpresa(dados.cpf_cnpj, dados)
}

// Sobe o A1 (.pfx/.p12) em base64 + senha. Nem o arquivo nem a senha são
// gravados aqui; seguem direto pra ACBr.
export async function enviarCertificado(
  cpfCnpj: string,
  certificadoBase64: string,
  senha: string
): Promise<CertificadoInfo> {
  if (!certificadoBase64) throw new ErroAcbr('validacao', 'Arquivo do certificado ausente.')
  if (!senha) throw new ErroAcbr('validacao', 'Senha do certificado ausente.')
  return chamarAcbr<CertificadoInfo>(`/empresas/${exigirCnpj(cpfCnpj)}/certificado`, {
    metodo: 'PUT',
    corpo: { certificado: certificadoBase64, password: senha }
  })
}

export function consultarCertificado(cpfCnpj: string): Promise<CertificadoInfo> {
  return chamarAcbr<CertificadoInfo>(`/empresas/${exigirCnpj(cpfCnpj)}/certificado`)
}

// Configura a NFC-e da empresa: regime tributário e o CSC (o código que
// autentica o QR Code da nota). O CSC também não fica guardado do nosso lado.
export function configurarNfce(cpfCnpj: string, config: ConfigNfce): Promise<unknown> {
  if (!config.sefaz?.csc || !config.sefaz?.id_csc) {
    throw new ErroAcbr('validacao', 'CSC e identificador do CSC são obrigatórios.')
  }
  return chamarAcbr(`/empresas/${exigirCnpj(cpfCnpj)}/nfce`, { metodo: 'PUT', corpo: config })
}

export function consultarConfigNfce(cpfCnpj: string): Promise<ConfigNfce> {
  return chamarAcbr<ConfigNfce>(`/empresas/${exigirCnpj(cpfCnpj)}/nfce`)
}

// Configura a NF-e da empresa: só regime tributário e ambiente. A NF-e NÃO usa
// CSC (isso é exclusivo da NFC-e), então não há passo próprio na tela — a
// emissão garante esta config antes de transmitir. PUT é idempotente e não
// consome crédito.
export type ConfigNfe = {
  CRT?: 1 | 2 | 3 | 4
  ambiente: 'homologacao' | 'producao'
}

export function configurarNfe(cpfCnpj: string, config: ConfigNfe): Promise<unknown> {
  return chamarAcbr(`/empresas/${exigirCnpj(cpfCnpj)}/nfe`, { metodo: 'PUT', corpo: config })
}

// Endereço a partir do CEP — devolve inclusive o código IBGE do município, que
// é obrigatório no cadastro e que nenhum lojista sabe de cabeça.
export type EnderecoPorCep = {
  bairro: string
  cep: string
  codigo_ibge: string
  complemento: string
  logradouro: string
  municipio: string
  uf: string
}

export function consultarCep(cep: string): Promise<EnderecoPorCep> {
  const limpo = soDigitos(cep)
  if (limpo.length !== 8) throw new ErroAcbr('validacao', 'CEP inválido.')
  return chamarAcbr<EnderecoPorCep>(`/cep/${limpo}`)
}
