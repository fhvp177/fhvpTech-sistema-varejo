import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import type { TipoChavePix } from '@fhvptech/core/lib/pixBrCode'

// Identidade da loja exibida nos cupons/comprovantes. Fica no banco (tabela
// `config`, key-value), então é por instalação: um único build serve todas as
// lojas, cada uma com seus próprios dados. A logo é guardada como data URI
// (base64) — viaja junto no backup e entra direto no HTML impresso.
export type DadosLoja = {
  nome: string
  razao_social: string
  cnpj: string
  endereco: string
  cidade: string
  uf: string
  cep: string
  telefone: string
  logo: string | null
  exibir_logo: boolean
  /**
   * Chave PIX da loja, usada pra desenhar o QR de pagamento nos documentos com
   * saldo em aberto. Vazia = recurso desligado, e nenhum documento leva QR.
   *
   * Vale dizer o que ela NÃO é: chave PIX não é segredo. Ela só serve pra
   * mandarem dinheiro pro lojista, nunca pra tirar. Por isso mora na config
   * comum, junto do endereço e da logo, e viaja no backup sem tratamento
   * especial. O risco aqui é o inverso do usual — não é vazar, é estar ERRADA,
   * porque aí o dinheiro do cliente vai pro estranho dono daquela chave. Contra
   * isso valem os dígitos verificadores na gravação e a prévia na tela, que o
   * lojista escaneia com o próprio celular antes de valer.
   */
  pix_chave: string
  /**
   * Tipo da chave, quando o lojista precisou dizer na mão. CPF e celular têm os
   * mesmos 11 dígitos e nem sempre dá pra adivinhar; vazio significa "deduza".
   */
  pix_tipo: TipoChavePix | ''
}

// Enquanto o gerente não preencher "Dados da loja", a identidade fica em BRANCO —
// nunca com dados de outra loja. Até a v1.28.0 este fallback trazia os dados da
// 1ª loja do sistema (GN Modas) chumbados, o que vazava a identidade dela pro
// cupom das lojas novas; o legado dela virou config de verdade na migration
// 030_loja_identidade_legada. Campos vazios simplesmente não são impressos (as
// linhas do cupom são condicionais), e o checklist de boas-vindas cobra o
// preenchimento.
const LOJA_EM_BRANCO: DadosLoja = {
  nome: '',
  razao_social: '',
  cnpj: '',
  endereco: '',
  cidade: '',
  uf: '',
  cep: '',
  telefone: '',
  logo: null,
  exibir_logo: false,
  pix_chave: '',
  pix_tipo: ''
}

function obterDadosLoja(): DadosLoja {
  // Enquanto ninguém configurou, devolve em branco. Depois de configurado,
  // respeita exatamente o que foi gravado — inclusive campos deixados em branco.
  if (lerConfig('loja_configurada') !== '1') return LOJA_EM_BRANCO
  const logo = lerConfig('loja_logo')
  return {
    nome: lerConfig('loja_nome'),
    razao_social: lerConfig('loja_razao_social'),
    cnpj: lerConfig('loja_cnpj'),
    endereco: lerConfig('loja_endereco'),
    cidade: lerConfig('loja_cidade'),
    uf: lerConfig('loja_uf'),
    cep: lerConfig('loja_cep'),
    telefone: lerConfig('loja_telefone'),
    logo: logo || null,
    exibir_logo: lerConfig('loja_exibir_logo') === '1',
    pix_chave: lerConfig('loja_pix_chave'),
    pix_tipo: (lerConfig('loja_pix_tipo') as DadosLoja['pix_tipo']) || ''
  }
}

export function registrarHandlersLoja(): void {
  registrarCanal('loja:obter', () => {
    try {
      return { success: true, data: obterDadosLoja() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('loja:salvar', (dados: DadosLoja) => {
    try {
      gravarConfig('loja_nome', dados.nome ?? '')
      gravarConfig('loja_razao_social', dados.razao_social ?? '')
      gravarConfig('loja_cnpj', dados.cnpj ?? '')
      gravarConfig('loja_endereco', dados.endereco ?? '')
      gravarConfig('loja_cidade', dados.cidade ?? '')
      gravarConfig('loja_uf', dados.uf ?? '')
      gravarConfig('loja_cep', dados.cep ?? '')
      gravarConfig('loja_telefone', dados.telefone ?? '')
      gravarConfig('loja_logo', dados.logo ?? '')
      gravarConfig('loja_exibir_logo', dados.exibir_logo ? '1' : '0')
      gravarConfig('loja_pix_chave', (dados.pix_chave ?? '').trim())
      gravarConfig('loja_pix_tipo', dados.pix_tipo ?? '')
      gravarConfig('loja_configurada', '1')
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
