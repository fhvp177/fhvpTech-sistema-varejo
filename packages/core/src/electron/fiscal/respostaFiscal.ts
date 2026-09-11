export type RespostaBackendFiscal = { ok?: boolean; erro?: string; [chave: string]: unknown }

export const TEMPO_RESPOSTA_FISCAL_MS = 60_000

/** O que fica gravado na nota quando a reserva local é liberada. */
export const MOTIVO_SEM_REGISTRO =
  'O servidor fiscal não tem registro desta nota: ela não chegou a ser emitida. Pode emitir novamente.'

export class ErroRespostaFiscal extends Error {
  /**
   * `semRegistro` é o 404 do backend: ele afirma que NUNCA viu esta referência.
   *
   * É a única recusa que libera a reserva local, e o motivo é que o backend é
   * o único caminho até a SEFAZ. Se ele não tem registro, nada foi emitido, e
   * segurar a reserva só condenaria a venda a ficar sem nota para sempre.
   *
   * ⚠️ Não confundir com timeout ou 5xx: ali o pedido PODE ter chegado, e
   * liberar viraria nota em duplicidade.
   */
  constructor(
    mensagem: string,
    readonly recusada: boolean = false,
    readonly semRegistro: boolean = false
  ) {
    super(mensagem)
  }
}

/**
 * Uma recusa explícita não é uma nota em processamento. Já um silêncio de rede
 * não prova que a emissão falhou: a referência continua reservada localmente
 * para consultar o desfecho, sem enviar outra nota por conta própria.
 */
export async function pedirRespostaFiscal(url: URL, opcoes: RequestInit): Promise<RespostaBackendFiscal> {
  const controle = new AbortController()
  const timer = setTimeout(() => controle.abort(), TEMPO_RESPOSTA_FISCAL_MS)
  try {
    const resposta = await fetch(url, { ...opcoes, signal: controle.signal })
    const texto = await resposta.text()
    let dados: RespostaBackendFiscal
    try {
      const valor: unknown = JSON.parse(texto)
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error()
      dados = valor as RespostaBackendFiscal
    } catch {
      throw new ErroRespostaFiscal('O servidor fiscal enviou uma resposta incompleta. Consulte a nota antes de tentar emitir novamente.')
    }

    const cota = dados.cota as { podeEmitir?: boolean; motivo?: string } | undefined
    if (cota?.podeEmitir === false) {
      throw new ErroRespostaFiscal(
        String(dados.erro || cota.motivo || 'A cota de notas fiscais do mês foi atingida. Entre em contato com a FHVP Tech.'),
        true
      )
    }
    if (!resposta.ok || dados.ok === false || dados.erro) {
      // Estes retornos são recusas explícitas do backend. Erro 5xx, corpo
      // inválido e timeout permanecem incertos, por escolha contra duplicação.
      const recusada = [400, 401, 402, 403, 404, 429].includes(resposta.status)
      throw new ErroRespostaFiscal(
        String(dados.erro || `Erro ${resposta.status} no servidor fiscal.`),
        recusada,
        resposta.status === 404
      )
    }
    const aviso = dados.avisoConsulta as { erro?: string } | undefined
    if (aviso) {
      throw new ErroRespostaFiscal(String(aviso.erro || 'Não foi possível consultar a nota fiscal. Tente consultar novamente.'))
    }
    return dados
  } catch (erro) {
    if (erro instanceof ErroRespostaFiscal) throw erro
    if (controle.signal.aborted) {
      throw new ErroRespostaFiscal('O servidor fiscal demorou para responder. A emissão ainda não foi confirmada. Consulte a nota antes de tentar emitir novamente.')
    }
    throw new ErroRespostaFiscal('Não foi possível falar com o servidor fiscal. Verifique a conexão e consulte a nota novamente.')
  } finally {
    clearTimeout(timer)
  }
}

export type EmissaoFiscal = {
  serie?: number
  numero?: number
  acbr_id?: string | null
  status: string
  chave?: string | null
  codigo_verificacao?: string | null
  link_url?: string | null
  motivo?: string | null
}

export function exigirEmissaoFiscal(resposta: RespostaBackendFiscal): EmissaoFiscal {
  const emissao = resposta.emissao as EmissaoFiscal | undefined
  if (!emissao || typeof emissao !== 'object' || typeof emissao.status !== 'string' || !emissao.status) {
    throw new ErroRespostaFiscal('O servidor fiscal não confirmou o estado da nota. Consulte novamente; não foi confirmada uma nova emissão.')
  }
  return emissao
}
