import { ipcMain } from 'electron'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import { extrairClienteIdLocal } from '@fhvptech/core/electron/licenca'
import { diagnosticoFiscal } from '../db/queries/fiscal'
import { requerDono } from '../sessao'
import { urlBackend } from '../backendUrl'

// Configuração fiscal da loja (NFC-e). Mora na tabela `config` (key-value),
// mesmo padrão da identidade da loja em ipc/loja.ts — um build só, cada loja com
// os seus dados. Só existe no plano Pro (flag __FEAT_NFE__).
//
// ── O que este arquivo deliberadamente NÃO guarda ─────────────────────────────
// O certificado A1 e o CSC são credenciais da EMPRESA DO CLIENTE, não nossas:
// com o A1 dá pra assinar qualquer documento em nome daquele CNPJ. Os dois
// passam pelo sistema apenas de passagem (tela → backend → ACBr), que é quem
// tem estrutura pra guardá-los. Aqui fica só o que é inofensivo e útil offline:
// o número identificador do CSC (que não é segredo, é um sequencial tipo
// "000001") e os METADADOS do certificado — titular e data de validade.
//
// A validade em cache é o que permite o sino avisar "seu certificado vence em
// 30 dias" sem bater na API toda hora. Sem esse aviso, o lojista descobre que o
// certificado venceu do pior jeito possível: a nota parando de sair numa manhã
// de movimento.

// CRT — Código de Regime Tributário, como a SEFAZ enumera. Define se o produto
// usa CSOSN (Simples) ou CST (regime normal), então muda o cálculo inteiro da
// nota. Vazio = ainda não informado.
export type RegimeTributario = '' | '1' | '2' | '3'

// Faixa de série normal definida pela SEFAZ (890-899 é avulsa do Fisco, 900-999
// é SCAN). Mesmos números que a tela usa — ver src/utils/validacaoFiscal.ts.
const SERIE_MIN = 0
const SERIE_MAX = 889

export type ConfigFiscal = {
  inscricao_estadual: string
  regime_tributario: RegimeTributario
  codigo_municipio: string // código IBGE de 7 dígitos
  email: string
  serie_nfce: number
  cfop_padrao: string
  csc_id: string
  ambiente: 'homologacao' | 'producao'
  // Endereço decomposto que a ACBr exige no cadastro do emitente (o cupom segue
  // usando o texto livre de Dados da loja; estes campos são só pra nota).
  // Cidade, UF e CEP continuam vindo de Dados da loja — aqui só o que falta.
  endereco_logradouro: string
  endereco_numero: string
  endereco_complemento: string
  endereco_bairro: string
  // Derivados — preenchidos pelo sistema, não digitados.
  csc_configurado: boolean
  certificado_titular: string
  certificado_validade: string // ISO; vazio quando não há certificado
  configurada: boolean
}

// Nasce em branco e em HOMOLOGAÇÃO: enquanto o lojista não conferiu tudo com o
// contador, o pior cenário é emitir nota de teste — que não vale fiscalmente e
// não custa crédito de verdade. Produção é uma escolha consciente.
const FISCAL_EM_BRANCO: ConfigFiscal = {
  inscricao_estadual: '',
  regime_tributario: '',
  codigo_municipio: '',
  email: '',
  serie_nfce: 1,
  cfop_padrao: '',
  csc_id: '',
  ambiente: 'homologacao',
  endereco_logradouro: '',
  endereco_numero: '',
  endereco_complemento: '',
  endereco_bairro: '',
  csc_configurado: false,
  certificado_titular: '',
  certificado_validade: '',
  configurada: false
}

// O endereço é lido SEMPRE, mesmo antes de o lojista configurar o resto: a
// migration 032 pode tê-lo pré-preenchido a partir do endereço em texto livre,
// e esse adiantamento tem que aparecer na tela já na primeira abertura.
function lerEnderecoFiscal(): Pick<
  ConfigFiscal,
  'endereco_logradouro' | 'endereco_numero' | 'endereco_complemento' | 'endereco_bairro'
> {
  return {
    endereco_logradouro: lerConfig('fiscal_endereco_logradouro'),
    endereco_numero: lerConfig('fiscal_endereco_numero'),
    endereco_complemento: lerConfig('fiscal_endereco_complemento'),
    endereco_bairro: lerConfig('fiscal_endereco_bairro')
  }
}

// Só dígitos — IE e código IBGE vêm com máscara dependendo de onde o lojista
// copiou ("06.123.456-7"), e a SEFAZ quer o número limpo.
function apenasDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '')
}

function obterConfigFiscal(): ConfigFiscal {
  // Endereço vem sempre — mesmo sem o resto configurado, pode haver
  // pré-preenchimento da migration esperando conferência.
  if (lerConfig('fiscal_configurada') !== '1') {
    return { ...FISCAL_EM_BRANCO, ...lerEnderecoFiscal() }
  }

  const serie = Number.parseInt(lerConfig('fiscal_serie_nfce'), 10)
  const ambiente = lerConfig('fiscal_ambiente') === 'producao' ? 'producao' : 'homologacao'
  const regime = lerConfig('fiscal_regime_tributario')

  return {
    inscricao_estadual: lerConfig('fiscal_inscricao_estadual'),
    regime_tributario: (['1', '2', '3'].includes(regime) ? regime : '') as RegimeTributario,
    codigo_municipio: lerConfig('fiscal_codigo_municipio'),
    email: lerConfig('fiscal_email'),
    // Série inválida no banco cairia numa nota rejeitada lá na frente; 1 é o
    // valor normal do varejo e é melhor default que NaN.
    serie_nfce: Number.isFinite(serie) && serie > 0 ? serie : 1,
    cfop_padrao: lerConfig('fiscal_cfop_padrao'),
    csc_id: lerConfig('fiscal_csc_id'),
    ambiente,
    ...lerEnderecoFiscal(),
    csc_configurado: lerConfig('fiscal_csc_configurado') === '1',
    certificado_titular: lerConfig('fiscal_certificado_titular'),
    certificado_validade: lerConfig('fiscal_certificado_validade'),
    configurada: true
  }
}

// Quantos dias faltam pro certificado vencer. `null` quando não há certificado
// ou a data gravada não faz sentido — quem chama decide o que mostrar.
export function diasParaVencerCertificado(agora = new Date()): number | null {
  const validade = lerConfig('fiscal_certificado_validade')
  if (!validade) return null
  const fim = new Date(validade)
  if (Number.isNaN(fim.getTime())) return null
  return Math.ceil((fim.getTime() - agora.getTime()) / 86_400_000)
}

export function registrarHandlersFiscal(): void {
  // Configuração fiscal é assunto do dono: mexe em tributação e em credencial
  // da empresa, não é coisa de balconista.
  ipcMain.handle('fiscal:obter', () => {
    try {
      requerDono()
      return { success: true, data: obterConfigFiscal() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Diagnóstico do "está tudo pronto?". Roda 100% local e de graça — nenhuma
  // chamada à API, nenhum crédito gasto.
  ipcMain.handle('fiscal:diagnostico', () => {
    try {
      requerDono()
      return { success: true, data: diagnosticoFiscal() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Salva só o que o lojista digita. Certificado e CSC entram por caminhos
  // próprios (Fase 2), justamente pra não trafegarem junto com dados comuns.
  ipcMain.handle('fiscal:salvar', (_event, dados: Partial<ConfigFiscal>) => {
    try {
      requerDono()

      // Última linha de defesa. A tela já impede a digitação errada e é lá que
      // mora a validação boa de UX (formato da IE por estado, e-mail, etc.);
      // aqui ficam só as regras que, se furadas, ESTRAGAM A EMISSÃO depois —
      // e que por isso não podem depender só da interface. De propósito não é
      // uma cópia da validação da tela: duplicar aquilo garantiria divergência
      // entre as duas com o tempo.
      const serie = Number(dados.serie_nfce)
      if (!Number.isInteger(serie) || serie < SERIE_MIN || serie > SERIE_MAX) {
        // Antes isto era corrigido calado pra 1. Corrigir em silêncio é pior:
        // o lojista salva 900, o sistema grava 1, e ninguém entende por que as
        // notas saem numa série que ele não escolheu.
        throw new Error(`Série inválida: use um número entre ${SERIE_MIN} e ${SERIE_MAX}.`)
      }

      const regime = dados.regime_tributario ?? ''
      if (!['1', '2', '3'].includes(regime)) {
        throw new Error('Regime tributário inválido.')
      }

      gravarConfig('fiscal_inscricao_estadual', apenasDigitos(dados.inscricao_estadual ?? ''))
      gravarConfig('fiscal_regime_tributario', regime)
      gravarConfig('fiscal_codigo_municipio', apenasDigitos(dados.codigo_municipio ?? ''))
      gravarConfig('fiscal_email', (dados.email ?? '').trim())
      gravarConfig('fiscal_serie_nfce', String(serie))
      gravarConfig('fiscal_cfop_padrao', apenasDigitos(dados.cfop_padrao ?? ''))
      gravarConfig('fiscal_csc_id', apenasDigitos(dados.csc_id ?? ''))
      gravarConfig('fiscal_ambiente', dados.ambiente === 'producao' ? 'producao' : 'homologacao')
      // Endereço estruturado (só pra nota; texto livre do cupom não é tocado).
      gravarConfig('fiscal_endereco_logradouro', (dados.endereco_logradouro ?? '').trim())
      gravarConfig('fiscal_endereco_numero', (dados.endereco_numero ?? '').trim())
      gravarConfig('fiscal_endereco_complemento', (dados.endereco_complemento ?? '').trim())
      gravarConfig('fiscal_endereco_bairro', (dados.endereco_bairro ?? '').trim())
      gravarConfig('fiscal_configurada', '1')
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('fiscal:diasParaVencerCertificado', () => {
    try {
      return { success: true, data: diasParaVencerCertificado() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarHandlersFiscalRemoto()
}

// ─── Ponte com o backend (ACBr) ───────────────────────────────────────────────
// Estes handlers falam com o backend do Fly, que fala com a ACBr. O certificado
// e o CSC passam por aqui mas NÃO são gravados localmente — seguem pro backend
// e de lá pra ACBr. Só metadados inofensivos (validade do certificado, id do
// CSC, flag "configurado") ficam no config local, pra alimentar a tela e o
// aviso de vencimento sem precisar bater na API toda hora.

type RespostaBackend = { ok?: boolean; erro?: string; [k: string]: unknown }

// Chamada ao backend com o clienteId da licença. Traduz o corpo de erro do
// backend na mensagem que a tela mostra (o backend já manda `erro` legível).
async function chamarBackendFiscal(
  rota: string,
  opcoes: { metodo?: string; corpo?: Record<string, unknown> } = {}
): Promise<RespostaBackend> {
  const clienteId = extrairClienteIdLocal()
  if (!clienteId) throw new Error('Nenhuma licença ativa encontrada nesta instalação.')

  const { metodo = 'GET', corpo } = opcoes
  // clienteId vai no corpo (POST/PUT) ou na query (GET).
  const temCorpo = metodo !== 'GET'
  const url = new URL(`${urlBackend()}${rota}`)
  if (!temCorpo) url.searchParams.set('clienteId', clienteId)

  let r: Response
  try {
    r = await fetch(url, {
      method: metodo,
      headers: temCorpo ? { 'Content-Type': 'application/json' } : undefined,
      body: temCorpo ? JSON.stringify({ clienteId, ...corpo }) : undefined
    })
  } catch (e) {
    throw new Error(`Não foi possível falar com o servidor fiscal: ${(e as Error).message}`)
  }

  const texto = await r.text()
  let dados: RespostaBackend = {}
  try {
    dados = texto ? (JSON.parse(texto) as RespostaBackend) : {}
  } catch {
    throw new Error(`Resposta inesperada do servidor fiscal (HTTP ${r.status}).`)
  }
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status} no servidor fiscal.`)
  return dados
}

// Monta os dados do emitente a partir do que já está no banco (identidade da
// loja + config fiscal). Endereço decomposto vem do namespace fiscal_endereco_*;
// cidade/UF/CEP da identidade da loja.
function montarDadosEmpresa(): Record<string, unknown> {
  const cnpj = apenasDigitos(lerConfig('loja_cnpj'))
  if (cnpj.length !== 14) {
    throw new Error('Cadastre o CNPJ da loja em Dados da loja antes de habilitar a nota.')
  }
  const razao = lerConfig('loja_razao_social') || lerConfig('loja_nome')
  const email = lerConfig('fiscal_email')
  const logradouro = lerConfig('fiscal_endereco_logradouro')
  const numero = lerConfig('fiscal_endereco_numero')
  const bairro = lerConfig('fiscal_endereco_bairro')
  if (!razao) throw new Error('Preencha a razão social em Dados da loja.')
  if (!email) throw new Error('Preencha o e-mail da empresa.')
  if (!logradouro || !numero || !bairro) {
    throw new Error('Preencha o endereço da nota (logradouro, número e bairro).')
  }

  return {
    cpf_cnpj: cnpj,
    nome_razao_social: razao,
    nome_fantasia: lerConfig('loja_nome') || undefined,
    email,
    inscricao_estadual: apenasDigitos(lerConfig('fiscal_inscricao_estadual')) || undefined,
    fone: lerConfig('loja_telefone') || undefined,
    endereco: {
      logradouro,
      numero,
      complemento: lerConfig('fiscal_endereco_complemento') || undefined,
      bairro,
      codigo_municipio: apenasDigitos(lerConfig('fiscal_codigo_municipio')) || undefined,
      cidade: lerConfig('loja_cidade') || undefined,
      uf: (lerConfig('loja_uf') || '').toUpperCase(),
      cep: apenasDigitos(lerConfig('loja_cep'))
    }
  }
}

function registrarHandlersFiscalRemoto(): void {
  // Resolve o código IBGE do município pelo CEP da loja (a nota exige, e
  // ninguém sabe de cabeça). Grava pra não consultar de novo.
  ipcMain.handle('fiscal:resolverMunicipio', async () => {
    try {
      requerDono()
      const jaTem = lerConfig('fiscal_codigo_municipio')
      if (jaTem) return { success: true, data: { codigo_municipio: jaTem, cidade: '' } }

      const cep = apenasDigitos(lerConfig('loja_cep'))
      if (cep.length !== 8) throw new Error('Preencha o CEP da loja em Dados da loja.')

      const r = await chamarBackendFiscal(`/fiscal/cep/${cep}`)
      const end = (r.endereco ?? {}) as { codigo_ibge?: string; municipio?: string }
      if (end.codigo_ibge) gravarConfig('fiscal_codigo_municipio', end.codigo_ibge)
      return {
        success: true,
        data: { codigo_municipio: end.codigo_ibge ?? '', cidade: end.municipio ?? '' }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Cadastra/atualiza a empresa emitente na ACBr (passo que antecede tudo).
  ipcMain.handle('fiscal:cadastrarEmpresa', async () => {
    try {
      requerDono()
      const empresa = montarDadosEmpresa() as { endereco: { codigo_municipio?: string } }
      // Sem código do município? Resolve pelo CEP antes de cadastrar.
      if (!empresa.endereco.codigo_municipio) {
        const cep = apenasDigitos(lerConfig('loja_cep'))
        const r = await chamarBackendFiscal(`/fiscal/cep/${cep}`)
        const end = (r.endereco ?? {}) as { codigo_ibge?: string }
        if (!end.codigo_ibge) throw new Error('Não foi possível achar o município pelo CEP.')
        gravarConfig('fiscal_codigo_municipio', end.codigo_ibge)
        empresa.endereco.codigo_municipio = end.codigo_ibge
      }
      await chamarBackendFiscal('/fiscal/empresa', { metodo: 'POST', corpo: { empresa } })
      gravarConfig('fiscal_empresa_cadastrada', '1')
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Sobe o certificado A1. Recebe o arquivo já em base64 e a senha do renderer;
  // repassa e guarda só a validade/titular que a ACBr devolve.
  ipcMain.handle(
    'fiscal:enviarCertificado',
    async (_e, args: { certificadoBase64: string; senha: string }) => {
      try {
        requerDono()
        const cnpj = apenasDigitos(lerConfig('loja_cnpj'))
        const r = await chamarBackendFiscal('/fiscal/certificado', {
          metodo: 'PUT',
          corpo: {
            cpf_cnpj: cnpj,
            certificado: args?.certificadoBase64 ?? '',
            senha: args?.senha ?? ''
          }
        })
        // Só metadados — o .pfx e a senha não voltam e não são guardados.
        gravarConfig('fiscal_certificado_validade', String(r.validade ?? ''))
        gravarConfig('fiscal_certificado_titular', String(r.titular ?? ''))
        return { success: true, data: { validade: r.validade, titular: r.titular } }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Configura o CSC (autentica o QR Code da NFC-e). O CSC em si vai pro backend
  // e não fica aqui; só o id (que não é segredo) e a flag "configurado".
  ipcMain.handle(
    'fiscal:configurarCsc',
    async (_e, args: { csc: string; idCsc: string }) => {
      try {
        requerDono()
        const cnpj = apenasDigitos(lerConfig('loja_cnpj'))
        const regime = lerConfig('fiscal_regime_tributario')
        const crt = Number(regime)
        if (![1, 2, 3].includes(crt)) {
          throw new Error('Defina o regime tributário no passo 1 antes do CSC.')
        }
        const idCsc = apenasDigitos(args?.idCsc ?? '')
        const csc = (args?.csc ?? '').trim()
        if (!idCsc || !csc) throw new Error('Informe o identificador e o código do CSC.')

        const ambiente =
          lerConfig('fiscal_ambiente') === 'producao' ? 'producao' : 'homologacao'
        await chamarBackendFiscal('/fiscal/nfce-config', {
          metodo: 'PUT',
          corpo: {
            cpf_cnpj: cnpj,
            config: { CRT: crt, ambiente, sefaz: { id_csc: Number(idCsc), csc } }
          }
        })
        // Guarda só o id e a flag; o CSC não fica no config local.
        gravarConfig('fiscal_csc_id', idCsc)
        gravarConfig('fiscal_csc_configurado', '1')
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Estado remoto pro semáforo: saldo de créditos e certificado na ACBr.
  ipcMain.handle('fiscal:statusRemoto', async () => {
    try {
      requerDono()
      const [cert, cred] = await Promise.allSettled([
        chamarBackendFiscal('/fiscal/certificado'),
        chamarBackendFiscal('/fiscal/creditos')
      ])
      return {
        success: true,
        data: {
          certificado:
            cert.status === 'fulfilled'
              ? { existe: Boolean(cert.value.existe), validade: cert.value.validade ?? '' }
              : null,
          creditos:
            cred.status === 'fulfilled' ? Number(cred.value.creditos_disponiveis ?? 0) : null
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
