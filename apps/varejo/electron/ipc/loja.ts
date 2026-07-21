import { ipcMain } from 'electron'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'

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
  exibir_logo: false
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
    exibir_logo: lerConfig('loja_exibir_logo') === '1'
  }
}

export function registrarHandlersLoja(): void {
  ipcMain.handle('loja:obter', () => {
    try {
      return { success: true, data: obterDadosLoja() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('loja:salvar', (_event, dados: DadosLoja) => {
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
      gravarConfig('loja_configurada', '1')
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
