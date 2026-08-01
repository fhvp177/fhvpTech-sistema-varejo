/**
 * Modo terminal: esta máquina é um segundo caixa do PC da loja.
 *
 * ── O que muda no boot ───────────────────────────────────────────────────────
 * Nada de banco. Nem abrir, nem migrar, nem fazer backup. É essa ausência que
 * dá a garantia central do desenho: **não existe um segundo conjunto de dados
 * para divergir do primeiro**. O pior que pode acontecer aqui é "sem conexão" —
 * nunca "os dois estoques discordam".
 *
 * Os 134 handlers continuam registrados normalmente. Eles só deixam de ser
 * chamados: o roteador desvia para a rede tudo que é dado da loja, e o que
 * sobra roda local mesmo (impressora, atualização, licença desta máquina).
 */
import {
  configurarEncaminhador,
  type Encaminhador
} from '@fhvptech/core/electron/roteador'
import { app } from 'electron'
import { ClienteMulticaixa } from '@fhvptech/core/electron/multicaixa/cliente'
import {
  gravarConfigMulticaixa,
  lerConfigMulticaixa
} from '@fhvptech/core/electron/multicaixa/config'
import { normalizarEndereco } from '@fhvptech/core/electron/multicaixa/clonagem'
import {
  anotarQueda,
  anotarVolta,
  resumirQuedas,
  type ResumoQuedas
} from '@fhvptech/core/electron/multicaixa/registroQuedas'
import { join } from 'path'

/** Ao lado da configuração do multicaixa, no userData — aqui não há banco. */
function caminhoDiarioQuedas(): string {
  return join(app.getPath('userData'), 'multicaixa-quedas.json')
}

/** Resumo para o suporte responder "o segundo caixa fica caindo" com dado. */
export function resumoDeQuedas(): ResumoQuedas {
  return resumirQuedas(caminhoDiarioQuedas())
}
import { canalAtendePelaRede, podeRepetir } from './canais'

/**
 * Canais que existem nesta máquina mas não podem rodar nela.
 *
 * Backup lê o banco, e aqui não há banco. Sem esta trava, o lojista clicaria em
 * "fazer backup" no segundo caixa e receberia uma mensagem incompreensível de
 * banco de dados em vez de saber que aquilo é tarefa do caixa principal. A
 * interface esconde a seção, mas a trava fica porque esconder não é impedir.
 */
const BLOQUEADOS_NO_TERMINAL = new Set([
  'backup:fazerManual',
  'backup:gravarConfig',
  'backup:listarBackups',
  'backup:obterStatus',
  'backup:restaurar',
  'backup:selecionarPasta',
  'backup:verificarSenha'
])

const AVISO_BLOQUEADO = 'Esta ação só está disponível no caixa principal.'

let cliente: ClienteMulticaixa | null = null
let conectado = true

export function clienteDoTerminal(): ClienteMulticaixa | null {
  return cliente
}

export function terminalConectado(): boolean {
  return conectado
}

/**
 * Liga o desvio para o caixa principal. Chamado no boot quando a configuração
 * diz que esta máquina é um terminal.
 *
 * Devolve `false` se não houver com quem falar — a interface mostra a tela de
 * conexão em vez de um sistema pela metade.
 */
export function ligarModoTerminal(aoMudarConexao?: (ligado: boolean) => void): boolean {
  const config = lerConfigMulticaixa()
  if (config.modo !== 'terminal' || !config.servidor) return false

  const remoto =
    config.servidor.relay && config.servidor.chaveSigilo
      ? {
          url: config.servidor.relay.url,
          loja: config.servidor.relay.loja,
          terminal: config.servidor.terminalId ?? '',
          chaveSigilo: config.servidor.chaveSigilo
        }
      : undefined

  cliente = new ClienteMulticaixa({
    url: config.servidor.url,
    token: config.servidor.token,
    relay: remoto,
    podeRepetir,
    aoMudarConexao: (ligado) => {
      conectado = ligado
      // Registrado antes de avisar a tela: se o diário falhar, o aviso ainda
      // acontece. É diagnóstico, e ele nunca vem na frente da operação.
      if (ligado) anotarVolta(caminhoDiarioQuedas())
      else anotarQueda(caminhoDiarioQuedas())
      aoMudarConexao?.(ligado)
    }
  })

  const encaminhador: Encaminhador = {
    deveEnviar: (canal) => canalAtendePelaRede(canal) || BLOQUEADOS_NO_TERMINAL.has(canal),
    enviar: async (canal, args) => {
      if (BLOQUEADOS_NO_TERMINAL.has(canal)) {
        // Devolve no formato dos handlers, e não como exceção: a tela mostra a
        // frase ao operador em vez de um erro genérico.
        return { success: false, error: AVISO_BLOQUEADO }
      }
      return cliente!.chamar(canal, args)
    }
  }
  configurarEncaminhador(encaminhador)
  return true
}

/**
 * Conecta esta máquina a um caixa principal.
 *
 * Troca o código de 6 dígitos por um token permanente e grava a configuração.
 * Depois disso o app precisa REINICIAR: o modo é decidido no boot, porque é ele
 * que determina se o banco chega a ser aberto. Aplicar sem reiniciar deixaria a
 * máquina num estado meio-a-meio, com banco aberto e chamadas indo pela rede.
 */
export async function conectarComoTerminal(
  enderecoBruto: string,
  codigo: string,
  nome: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const config = lerConfigMulticaixa()
  let base: string
  try {
    base = normalizarEndereco(enderecoBruto, config.porta)
  } catch (erro) {
    return { ok: false, erro: (erro as Error).message }
  }

  let resposta: Response
  try {
    resposta = await fetch(`${base}/parear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, nome }),
      signal: AbortSignal.timeout(15_000)
    })
  } catch {
    return {
      ok: false,
      erro:
        'Não foi possível falar com o caixa principal. Confira se os dois computadores estão na ' +
        'mesma rede e se o endereço está correto.'
    }
  }

  const corpo = (await resposta.json().catch(() => ({}))) as {
    ok?: boolean
    id?: string
    token?: string
    chaveSigilo?: string
    relay?: { url: string; loja: string }
    erro?: string
    versao?: string
  }
  if (!resposta.ok || !corpo.token) {
    return { ok: false, erro: corpo.erro ?? 'Não foi possível conectar.' }
  }

  // Versões diferentes conversam mal: os canais podem ter mudado de forma. É
  // melhor recusar agora, com explicação, do que descobrir na hora da venda.
  if (corpo.versao && corpo.versao !== app.getVersion()) {
    return {
      ok: false,
      erro:
        `O caixa principal está na versão ${corpo.versao} e este computador na ` +
        `${app.getVersion()}. Atualize os dois para a mesma versão antes de conectar.`
    }
  }

  gravarConfigMulticaixa({
    ...config,
    modo: 'terminal',
    servidor: {
      url: base,
      token: corpo.token,
      // Guardados agora porque é a única vez que as duas máquinas se falam sem
      // intermediário. Sem isto, este caixa só funcionaria dentro da loja.
      chaveSigilo: corpo.chaveSigilo,
      terminalId: corpo.id,
      relay: corpo.relay
    }
  })
  return { ok: true }
}

/** Desfaz o modo terminal — usado ao desconectar desta máquina. */
export function desligarModoTerminal(): void {
  configurarEncaminhador(null)
  cliente = null
  conectado = true
}
