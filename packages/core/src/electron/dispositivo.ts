/**
 * Quem é esta máquina.
 *
 * ── Para que serve ───────────────────────────────────────────────────────────
 * A licença é validada offline: uma chave assinada dentro de um arquivo
 * cifrado. Isso é ótimo para a loja, que segue vendendo com a internet caída, e
 * significa que copiar o `licenca.lic` para outro computador sempre funcionou.
 * Para o plano poder dizer "até 2 computadores", alguém precisa saber
 * distinguir um computador do outro. É o que este módulo faz.
 *
 * A contagem em si NÃO mora aqui, e nem poderia: máquinas não se contam entre
 * si. Ela mora no servidor, em `backend/src/dispositivos.ts`.
 *
 * ── Dois números, e o segundo evita ligação de suporte ───────────────────────
 *
 *   `deviceId`  sorteado na primeira execução e guardado na pasta de dados
 *   `digital`   impressão do hardware, RECALCULADA a cada abertura
 *
 * Formatou o PC: o `deviceId` se perde, a `digital` volta igual, o servidor
 * reconhece a máquina e devolve a mesma vaga. Copiou a pasta de dados inteira
 * para outro PC: o `deviceId` vem junto, mas a `digital` é outra, então são
 * duas máquinas.
 *
 * ★ É por isso que a digital NUNCA é gravada em disco. Guardar o valor
 * calculado dentro da pasta de dados pareceria economia (uma chamada a menos
 * por abertura) e faria a cópia da pasta carregar a digital da máquina de
 * origem, desmontando o único sinal que distingue as duas.
 *
 * ── O que acontece quando não dá para coletar ────────────────────────────────
 * Digital vazia é estado VÁLIDO. A coleta depende do PowerShell responder, e
 * num PC qualquer ela pode falhar. Aí a identidade fica só no `deviceId`, que é
 * menos preciso e continua funcionando. Recusar a instalação porque o Windows
 * não respondeu seria punir o cliente por um driver.
 */
import { createHash, randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { hostname } from 'os'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { pastaDados } from './plataforma'

export type IdentidadeDispositivo = {
  /** Sorteado na primeira execução. Vive na pasta de dados. */
  deviceId: string
  /** Impressão do hardware. Vazia quando não deu para coletar. */
  digital: string
  /** Nome da máquina, para dar para reconhecer a linha no painel. */
  nome: string
}

const TIMEOUT_COLETA_MS = 4000

/**
 * Números que aparecem em placa que veio sem série gravada.
 *
 * Eles não identificam nada: metade das placas baratas devolve o mesmo texto,
 * e aceitá-los faria máquinas diferentes compartilharem digital, ou seja, uma
 * vaga só para a loja inteira.
 */
const VALORES_INUTEIS = new Set([
  '',
  '0',
  'NONE',
  'NULL',
  'DEFAULT STRING',
  'TO BE FILLED BY O.E.M.',
  'SYSTEM SERIAL NUMBER',
  'NOT SPECIFIED',
  'NOT APPLICABLE',
  'INVALID',
  'X.X.X',
  '00000000-0000-0000-0000-000000000000',
  'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'
])

/**
 * Junta o que foi coletado numa digital só.
 *
 * Separada da coleta de propósito: é a parte que tem regra (o que vale, o que
 * é lixo, o que sai quando nada presta) e a única que dá para testar sem
 * depender do hardware de quem está rodando o teste.
 */
export function montarDigital(fontes: Array<string | null | undefined>): string {
  const uteis = fontes
    .map((f) => String(f ?? '').trim().toUpperCase())
    .filter((f) => f.length >= 4 && !VALORES_INUTEIS.has(f))

  if (uteis.length === 0) return ''
  return createHash('sha256').update(uteis.join('|'), 'utf8').digest('hex').slice(0, 32)
}

function rodar(comando: string, args: string[]): Promise<string> {
  return new Promise((resolver) => {
    try {
      const filho = execFile(
        comando,
        args,
        { timeout: TIMEOUT_COLETA_MS, windowsHide: true },
        (erro, saida) => resolver(erro ? '' : String(saida ?? ''))
      )
      filho.on('error', () => resolver(''))
    } catch {
      resolver('')
    }
  })
}

/**
 * Pergunta ao sistema operacional o que ele sabe sobre esta máquina.
 *
 * No Windows sai numa chamada só de propósito: cada abertura do PowerShell
 * custa perto de meio segundo, e duas perguntas separadas dobrariam isso sem
 * nenhum ganho.
 */
async function coletarFontes(): Promise<string[]> {
  if (process.platform === 'win32') {
    const saida = await rodar('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$u = (Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID; ' +
        '$s = (Get-CimInstance -ClassName Win32_BaseBoard).SerialNumber; ' +
        'Write-Output "$u|$s"'
    ])
    const partes = saida.trim().split('|')
    if (partes.some((p) => p.trim().length >= 4)) return partes
  } else {
    // Linux: é onde roda a loja hospedada. Ali a "máquina" é o servidor, e o
    // machine-id é estável enquanto o volume for o mesmo.
    for (const caminho of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try {
        if (existsSync(caminho)) {
          const id = readFileSync(caminho, 'utf8').trim()
          if (id.length >= 4) return [id]
        }
      } catch {
        // segue para a próxima fonte
      }
    }
  }
  return []
}

let digitalEmMemoria: Promise<string> | null = null

/**
 * A digital desta máquina.
 *
 * Calculada UMA vez por execução e guardada só na memória. Ver o aviso no topo
 * do arquivo: gravá-la em disco quebraria o recurso.
 */
export function digitalDoHardware(): Promise<string> {
  if (!digitalEmMemoria) {
    digitalEmMemoria = coletarFontes()
      .then((fontes) => montarDigital(fontes))
      .catch(() => '')
  }
  return digitalEmMemoria
}

function caminhoIdentidade(): string {
  return join(pastaDados(), 'dispositivo.json')
}

/**
 * O identificador sorteado desta instalação, criado na primeira vez.
 *
 * Fica em texto puro de propósito: ele não é segredo nenhum, é só um número
 * para diferenciar instalações. Cifrá-lo daria trabalho e nenhuma proteção,
 * porque quem tem acesso à pasta já tem acesso ao banco inteiro.
 */
export function identificadorLocal(): string {
  const caminho = caminhoIdentidade()
  try {
    if (existsSync(caminho)) {
      const salvo = JSON.parse(readFileSync(caminho, 'utf8')) as { id?: unknown }
      if (typeof salvo.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(salvo.id)) return salvo.id
    }
  } catch {
    // arquivo ilegível: reescreve abaixo
  }

  const id = randomUUID()
  try {
    writeFileSync(caminho, JSON.stringify({ id, criadoEm: new Date().toISOString() }), 'utf8')
  } catch {
    // Sem conseguir gravar, o id muda a cada abertura e a máquina aparece
    // como nova toda vez. É ruim, e mesmo assim melhor que impedir de abrir:
    // a digital do hardware segura a identidade no lugar dele.
  }
  return id
}

/**
 * Deixa o nome da máquina em condição de virar linha de tabela.
 *
 * Separada da coleta porque é a parte que tem regra, e a única que dá para
 * exercitar sem depender do hostname da máquina onde o teste roda. O servidor
 * limpa de novo, do lado dele: isto aqui é cortesia, não é a defesa.
 */
export function limparNomeDeMaquina(bruto: unknown): string {
  const limpo = Array.from(typeof bruto === 'string' ? bruto : '')
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join('')
    .trim()
  return limpo.slice(0, 60) || 'Máquina sem nome'
}

/** Nome desta máquina, como o painel vai mostrar. */
export function nomeDaMaquina(): string {
  try {
    return limparNomeDeMaquina(hostname())
  } catch {
    return 'Máquina sem nome'
  }
}

export async function identidadeDoDispositivo(): Promise<IdentidadeDispositivo> {
  return {
    deviceId: identificadorLocal(),
    digital: await digitalDoHardware(),
    nome: nomeDaMaquina()
  }
}
