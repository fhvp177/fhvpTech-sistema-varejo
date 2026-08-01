/**
 * Orquestra o multi-caixa no caixa principal.
 *
 * Junta as peças que vivem no core — configuração, servidor, pareamento,
 * bloqueio de suspensão, firewall — e as amarra ao roteador e à sessão do
 * varejo. A tela de Configurações conversa só com este módulo.
 *
 * ── Estado ligado e estado gravado ───────────────────────────────────────────
 * Duas coisas parecidas que não são a mesma: o arquivo de configuração diz o
 * que o lojista QUER (modo servidor ou não), e o servidor em pé diz o que
 * ESTÁ acontecendo. Podem divergir — porta ocupada por outro programa, por
 * exemplo. A tela mostra os dois, porque "liguei e não funciona" precisa ter
 * resposta visível em vez de virar telefonema.
 */
import { networkInterfaces } from 'os'
import { app, powerSaveBlocker } from 'electron'
import { despachar } from '@fhvptech/core/electron/roteador'
import {
  gravarConfigMulticaixa,
  lerConfigMulticaixa,
  type ConfigMulticaixa,
  type TerminalPareado
} from '@fhvptech/core/electron/multicaixa/config'
import {
  criarServidorMulticaixa,
  type ServidorMulticaixa
} from '@fhvptech/core/electron/multicaixa/servidor'
import { JanelaPareamento } from '@fhvptech/core/electron/multicaixa/pareamento'
import { CodigoDeUsoUnico } from '@fhvptech/core/electron/multicaixa/codigoTemporario'
import {
  destinoConsegueLer,
  type ResultadoClonagem
} from '@fhvptech/core/electron/multicaixa/clonagem'
import { fazerBackupManual } from '@fhvptech/core/electron/backup/BackupManual'
import { origemDoToken } from '@fhvptech/core/electron/multicaixa/tokens'
import { Despertador } from '@fhvptech/core/electron/multicaixa/despertador'
import {
  argumentosCriacao,
  comandoElevado,
  consultarRegra,
  type EstadoFirewall
} from '@fhvptech/core/electron/multicaixa/firewall'
import { canalAtendePelaRede } from './canais'
import {
  atendimentoRemotoLigado,
  dadosDoRelay,
  desligarAtendimentoRemoto,
  ligarAtendimentoRemoto
} from './relayLoja'
import { limparSessaoDaOrigem } from '../sessao'

export interface EstadoMulticaixa {
  modo: ConfigMulticaixa['modo']
  servidorNoAr: boolean
  /** Se este computador também atende caixas que estão fora da loja. */
  atendeForaDaLoja: boolean
  porta: number
  endereco: string | null
  firewall: EstadoFirewall
  /** Código que autoriza CONECTAR um caixa novo. */
  codigoPareamento: { codigo: string; expiraEm: number } | null
  /**
   * Código que autoriza COPIAR o banco para outro computador. Separado do de
   * conexão de propósito: quem opera um caixa não deve, por isso, poder levar a
   * loja inteira num arquivo.
   */
  codigoCopia: { codigo: string; expiraEm: number } | null
  terminais: Array<Omit<TerminalPareado, 'tokenHash'>>
  versao: string
}

let servidor: ServidorMulticaixa | null = null
/**
 * Servidor levantado só para entregar uma cópia do banco.
 *
 * A clonagem tem que funcionar em loja que nunca ligou o multi-caixa — quem só
 * quer trocar de computador não deveria precisar habilitar um segundo caixa. E
 * subir isto apenas enquanto o código está válido tem um bônus de segurança: a
 * porta não fica aberta o resto do tempo.
 */
let servidorClonagem: ServidorMulticaixa | null = null
const janelaPareamento = new JanelaPareamento()
const janelaClonagem = new CodigoDeUsoUnico()
const despertador = new Despertador(powerSaveBlocker)

/**
 * Endereço IPv4 da máquina na rede local — o que o lojista digita no terminal.
 * Ignora interfaces internas e IPv6: ninguém vai digitar um endereço IPv6 na
 * tela de um notebook.
 */
function enderecoNaRede(): string | null {
  for (const enderecos of Object.values(networkInterfaces())) {
    for (const e of enderecos ?? []) {
      if (e.family === 'IPv4' && !e.internal) return e.address
    }
  }
  return null
}

function semSegredo(t: TerminalPareado): Omit<TerminalPareado, 'tokenHash'> {
  // O resumo do token nunca sai para o renderer: ele não tem uso na tela e
  // qualquer coisa que chega no renderer fica ao alcance do DevTools.
  const { tokenHash: _ignorado, ...resto } = t
  return resto
}

export async function estadoMulticaixa(): Promise<EstadoMulticaixa> {
  const config = lerConfigMulticaixa()
  const ativo = janelaPareamento.ativo()
  return {
    modo: config.modo,
    servidorNoAr: servidor !== null,
    atendeForaDaLoja: atendimentoRemotoLigado(),
    porta: config.porta,
    endereco: enderecoNaRede(),
    firewall: await consultarRegra(executarNetsh),
    codigoPareamento: ativo ? { codigo: ativo.codigo, expiraEm: ativo.expiraEm } : null,
    codigoCopia: codigoClonagemAtivo(),
    terminais: config.terminais.map(semSegredo),
    versao: app.getVersion()
  }
}

/** Sobe o servidor e grava a escolha. Idempotente. */
export async function ligarServidor(): Promise<void> {
  const config = lerConfigMulticaixa()
  if (!servidor) {
    servidor = await criarServidorMulticaixa({
      porta: config.porta,
      versao: app.getVersion(),
      autenticar: (token) => (token ? origemDoToken(token, lerConfigMulticaixa().terminais) : null),
      canalPermitido: canalAtendePelaRede,
      despachar: (canal, args, origem) => despachar(canal, args, { origem }),
      aoAtender: anotarAcesso,
      parear: (codigo, nome) => {
        const resultado = janelaPareamento.tentar(codigo)
        if (!resultado.ok) return resultado
        const { id, token, tokenHash, chaveSigilo } = resultado.credencial
        registrarTerminal(id, nome, tokenHash, chaveSigilo)
        // A chave de sigilo e o endereço do servidor de encontro viajam AQUI,
        // no único momento em que as duas máquinas se falam sem intermediário:
        // o pareamento, dentro da loja.
        return { ok: true, id, token, chaveSigilo, relay: dadosDoRelay() ?? undefined }
      },
      clonar: atenderPedidoDeCopia
    })
  }
  // Só depois de o servidor subir de fato: gravar antes deixaria o arquivo
  // dizendo "sou servidor" numa máquina onde a porta está ocupada.
  gravarConfigMulticaixa({ ...config, modo: 'servidor' })
  despertador.ligar()
  // Atender caixas que estão FORA da loja. Sem isto, o multicaixa só funciona
  // na rede local — o computador principal não é alcançável de fora.
  ligarAtendimentoRemoto()
}

/**
 * Pede ao Windows para liberar a porta, se ela já não estiver liberada.
 *
 * ── Por que só quando falta, e não sempre ────────────────────────────────────
 * O servidor volta sozinho a cada abertura do app. Pedir elevação "sempre que
 * ligar" faria a caixa do escudo aparecer TODA VEZ que a loja abre o sistema —
 * o que treina o lojista a clicar "sim" no automático e faz o app parecer
 * suspeito. Conferindo antes, ela aparece uma vez na vida.
 *
 * ── Por que aqui e não no instalador ─────────────────────────────────────────
 * O instalador roda como administrador e resolveria sem caixa nenhuma, mas
 * abriria a porta no firewall de todas as lojas para servir um recurso que
 * poucas usam. Melhor pedir a quem de fato ligou.
 *
 * Falhar aqui não impede nada: o Windows ainda vai perguntar por conta própria
 * quando o servidor subir.
 */
export async function liberarFirewallSeNecessario(): Promise<EstadoFirewall> {
  if (process.platform !== 'win32') return 'indeterminado'
  if ((await consultarRegra(executarNetsh)) === 'liberado') return 'liberado'

  try {
    const { programa, argumentos } = comandoElevado(
      argumentosCriacao(lerConfigMulticaixa().porta, app.getPath('exe'))
    )
    await executarNetsh(programa, argumentos)
  } catch {
    // Recusa na caixa de administrador cai aqui. A tela mostra o aviso e o
    // botão de tentar de novo.
  }
  return consultarRegra(executarNetsh)
}

export async function desligarServidor(): Promise<void> {
  janelaPareamento.fechar()
  await servidor?.parar()
  servidor = null
  despertador.desligar()
  desligarAtendimentoRemoto()
  const config = lerConfigMulticaixa()
  gravarConfigMulticaixa({ ...config, modo: 'normal' })
}

// ─── Clonagem do banco para outra máquina ───────────────────────────────────

/**
 * Atende o pedido de cópia. Confere o código PRIMEIRO e a versão depois: com
 * código errado, o pedinte não fica sabendo nem qual versão roda aqui.
 *
 * O zip é gerado pelo caminho normal de backup manual, de propósito — assim a
 * cópia aparece no histórico de backups da loja. Entregar o banco inteiro é a
 * operação mais sensível do sistema, e deixar rastro disso é desejável.
 */
async function atenderPedidoDeCopia(
  codigo: string,
  versaoDestino: string
): Promise<ResultadoClonagem> {
  const conferencia = janelaClonagem.conferir(codigo)
  if (conferencia !== 'ok') return { ok: false, motivo: conferencia }

  if (!destinoConsegueLer(app.getVersion(), versaoDestino)) {
    return { ok: false, motivo: 'versao-antiga' }
  }

  const backup = await fazerBackupManual()
  if (!backup.sucesso || !backup.caminhoZip) {
    return { ok: false, motivo: 'sem-codigo', detalhe: backup.erro ?? 'Falha ao preparar a cópia.' }
  }

  const { readFileSync } = await import('fs')
  const { basename } = await import('path')
  return {
    ok: true,
    zip: readFileSync(backup.caminhoZip),
    nomeArquivo: basename(backup.caminhoZip)
  }
}

/**
 * Abre a janela de cópia e garante que exista alguém atendendo na porta.
 *
 * Se o multi-caixa já está no ar, ele passa a atender a clonagem também. Se
 * não, sobe um servidor mínimo que SÓ faz isso — nega qualquer outra rota — e
 * que morre junto com o código.
 */
export async function abrirClonagem(): Promise<{ codigo: string; expiraEm: number; porta: number }> {
  const config = lerConfigMulticaixa()
  const ativo = janelaClonagem.abrir()

  if (!servidor && !servidorClonagem) {
    servidorClonagem = await criarServidorMulticaixa({
      porta: config.porta,
      versao: app.getVersion(),
      // Ninguém se autentica aqui: /rpc e /handshake respondem 401 sempre. A
      // única porta viva é a da cópia, e ela tem o próprio código.
      autenticar: () => null,
      canalPermitido: () => false,
      despachar: () => undefined,
      clonar: atenderPedidoDeCopia
    })
  }

  return { codigo: ativo.codigo, expiraEm: ativo.expiraEm, porta: config.porta }
}

export async function fecharClonagem(): Promise<void> {
  janelaClonagem.fechar()
  // Só derruba o que subiu para isto. O servidor do multi-caixa, se estiver no
  // ar, continua atendendo os caixas adicionais.
  await servidorClonagem?.parar()
  servidorClonagem = null
}

export function codigoClonagemAtivo(): { codigo: string; expiraEm: number } | null {
  const ativo = janelaClonagem.ativo()
  return ativo ? { codigo: ativo.codigo, expiraEm: ativo.expiraEm } : null
}

export function abrirPareamento(): { codigo: string; expiraEm: number } {
  const { codigo, expiraEm } = janelaPareamento.abrir()
  return { codigo, expiraEm }
}

export function fecharPareamento(): void {
  janelaPareamento.fechar()
}

function registrarTerminal(
  id: string,
  nome: string,
  tokenHash: string,
  chaveSigilo: string
): void {
  const config = lerConfigMulticaixa()
  gravarConfigMulticaixa({
    ...config,
    terminais: [
      ...config.terminais,
      {
        id,
        nome: nome || `Caixa ${config.terminais.length + 2}`,
        tokenHash,
        chaveSigilo,
        criadoEm: new Date().toISOString(),
        ultimoAcessoEm: null
      }
    ]
  })
}

/**
 * Revoga o acesso de um terminal.
 *
 * Derruba a sessão junto: sem isso, o terminal continuaria operando com o
 * vendedor logado até a próxima chamada falhar. Revogar tem que valer agora.
 */
export function revogarTerminal(id: string): void {
  const config = lerConfigMulticaixa()
  gravarConfigMulticaixa({
    ...config,
    terminais: config.terminais.filter((t) => t.id !== id)
  })
  limparSessaoDaOrigem(id)
}

/** Anota quando cada terminal apareceu pela última vez — sem gravar a cada chamada. */
const ultimoAcessoGravado = new Map<string, number>()
const INTERVALO_ANOTACAO_MS = 60_000

function anotarAcesso(origem: string): void {
  const agora = Date.now()
  // Gravar arquivo a cada requisição faria o disco trabalhar à toa num caixa
  // movimentado. Um minuto de resolução é de sobra para a tela.
  if (agora - (ultimoAcessoGravado.get(origem) ?? 0) < INTERVALO_ANOTACAO_MS) return
  ultimoAcessoGravado.set(origem, agora)
  const config = lerConfigMulticaixa()
  gravarConfigMulticaixa({
    ...config,
    terminais: config.terminais.map((t) =>
      t.id === origem ? { ...t, ultimoAcessoEm: new Date(agora).toISOString() } : t
    )
  })
}

async function executarNetsh(
  programa: string,
  argumentos: string[]
): Promise<{ codigo: number; saida: string }> {
  const { execFile } = await import('child_process')
  return new Promise((resolve) => {
    // execFile e não exec: os argumentos vão como lista, então caminho com
    // espaço ou & não vira sintaxe de shell.
    execFile(programa, argumentos, { windowsHide: true }, (erro, stdout, stderr) => {
      resolve({ codigo: erro ? 1 : 0, saida: `${stdout}${stderr}` })
    })
  })
}

/** No boot: se o lojista deixou o modo servidor ligado, sobe de novo. */
export async function retomarServidorSeConfigurado(): Promise<void> {
  if (lerConfigMulticaixa().modo !== 'servidor') return
  try {
    await ligarServidor()
  } catch {
    // Porta ocupada não pode impedir o caixa de abrir. A tela de Configurações
    // vai mostrar "modo servidor" com "servidor fora do ar", que é a verdade.
  }
}
