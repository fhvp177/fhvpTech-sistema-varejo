import { ipcMain } from 'electron'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import { diagnosticoFiscal } from '../db/queries/fiscal'
import { requerDono } from '../sessao'

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
  csc_configurado: false,
  certificado_titular: '',
  certificado_validade: '',
  configurada: false
}

// Só dígitos — IE e código IBGE vêm com máscara dependendo de onde o lojista
// copiou ("06.123.456-7"), e a SEFAZ quer o número limpo.
function apenasDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '')
}

function obterConfigFiscal(): ConfigFiscal {
  if (lerConfig('fiscal_configurada') !== '1') return FISCAL_EM_BRANCO

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
}
