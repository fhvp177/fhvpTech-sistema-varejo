/**
 * O sistema servido pelo navegador.
 *
 * Mesmo banco, mesmos handlers, mesmas telas do aplicativo instalado. O que
 * muda é só por onde a chamada entra: em vez do `ipcMain` de uma janela, um
 * `POST /rpc`. Os dois desembocam no mesmo `despachar()` do roteador — que foi
 * escrito prevendo exatamente este segundo caminho.
 *
 * Existe para o lojista que não tem onde instalar o aplicativo. O primeiro é
 * uma joalheria com um tablet Android e um teclado.
 *
 * ── Uma loja, um processo ────────────────────────────────────────────────────
 * Este servidor atende UMA loja. A conexão com o banco é uma variável única do
 * módulo, e o resto do sistema pergunta por ela em 334 lugares — fazer um
 * processo atender várias lojas significaria carregar a identidade da loja por
 * todos eles, bem no caminho onde mora o dinheiro: estoque, venda, comissão.
 *
 * Há um motivo mais forte ainda. O que impede vender a última unidade duas
 * vezes é o banco ser SÍNCRONO: conferir estoque e gravar acontecem sem brecha
 * no meio, porque o Node não cede a vez durante um handler síncrono. Isso
 * continua valendo aqui, com um processo por loja. Espalhar por processos seria
 * abrir esse vão sem quebrar teste nenhum.
 *
 * Então o isolamento é de infraestrutura: cada loja ganha sua máquina, seu
 * disco e seu arquivo de banco. É a instalação de sempre, na nuvem.
 *
 * ── O que este servidor NÃO faz ──────────────────────────────────────────────
 * Não imprime (a impressora está no balcão, junto do tablet — ver
 * web/impressao.ts), não atualiza a si mesmo (recarregar a página basta) e não
 * tem segundo caixa (a web já é vários aparelhos no mesmo lugar).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'

import { arquivoDaInterface, raizDaInterface, tipoDoArquivo } from './interface'
import { envioImediato, ligarBackupNaNuvem } from './backupNuvem'
import { registrarHandlersNuvem } from './restaurarDaNuvem'
import { gravarConfig, lerConfig } from '@fhvptech/core/electron/backup/configBackup'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { configurarPlataforma } from '@fhvptech/core/electron/plataforma'
import { configurarNucleo } from '@fhvptech/core/electron/nucleo'
import { despachar } from '@fhvptech/core/electron/roteador'
import { processarChamada } from '@fhvptech/core/electron/multicaixa/servidor'
import { inicializarBancoDeDados, obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import {
  inicializarBackupManager,
  obterBackupManager,
  temBackupManager
} from '@fhvptech/core/electron/backup/BackupManager'
import { executarMigrations, migrationsPendentes } from '@fhvptech/core/electron/db/migrations'
import { validarLicenca } from '@fhvptech/core/electron/licenca'
import { registrarHandlersLicenca } from '@fhvptech/core/electron/ipc/licenca'
import { registrarHandlersLicencaPagamento } from '@fhvptech/core/electron/ipc/licenca-pagamento'

import { criarTabelas } from '../electron/db/schema'
import { MIGRATIONS } from '../electron/backup/migrations'
import { limparSessaoDaOrigem } from '../electron/sessao'
import { registrarHandlersAuth } from '../electron/ipc/auth'
import { registrarHandlersBackup } from '../electron/ipc/backup'
import { registrarHandlersCategorias } from '../electron/ipc/categorias'
import { registrarHandlersChat } from '../electron/ipc/chat'
import { registrarHandlersClientes } from '../electron/ipc/clientes'
import { registrarHandlersComissoes } from '../electron/ipc/comissoes'
import { registrarHandlersContasPagar } from '../electron/ipc/contasPagar'
import { registrarHandlersDashboard } from '../electron/ipc/dashboard'
import { registrarHandlersDevolucoes } from '../electron/ipc/devolucoes'
import { registrarHandlersEtiquetas } from '../electron/ipc/etiquetas'
import { registrarHandlersFiscal } from '../electron/ipc/fiscal'
import { registrarHandlersFornecedores } from '../electron/ipc/fornecedores'
import { registrarHandlersLoja } from '../electron/ipc/loja'
import { registrarHandlersNotasEntrada } from '../electron/ipc/notasEntrada'
import { registrarHandlersNotificacoes } from '../electron/ipc/notificacoes'
import { registrarHandlersNovidades } from '../electron/ipc/novidades'
import { registrarHandlersOnboarding } from '../electron/ipc/onboarding'
import { registrarHandlersPreferenciasUi } from '../electron/ipc/preferenciasUi'
import { registrarHandlersProdutos } from '../electron/ipc/produtos'
import { registrarHandlersVendas } from '../electron/ipc/vendas'
import { registrarHandlersVendedores } from '../electron/ipc/vendedores'

// ── Ambiente ─────────────────────────────────────────────────────────────────

// As duas passam por `resolve` mesmo quando vêm prontas do ambiente, e isso
// NÃO é zelo à toa: um caminho digitado com barra normal (`C:/loja/dados`) é
// perfeitamente válido, mas a checagem que impede sair da pasta compara texto
// com texto. Sem normalizar, `C:/loja/web` nunca é prefixo de
// `C:\loja\web\assets\app.js`, e o servidor devolve 404 para a interface
// inteira — só o `index.html` escapava, por ser comparado à parte.
/** Onde ficam banco, licença e backups. Uma pasta por loja. */
const PASTA_DADOS = resolve(process.env.FHVP_DADOS ?? 'dados')
/** Onde está o `dist-web` (a interface compilada). */
const PASTA_WEB = raizDaInterface(process.env.FHVP_WEB)
// 8710 em vez do 8080 de praxe: 8080 é a porta mais disputada que existe, e
// quem desenvolve costuma ter outra coisa nela — o primeiro teste deste
// servidor abriu o navegador e caiu num projeto vizinho do próprio autor. Na
// nuvem quem manda é a variável PORT, então isto só governa a máquina de quem
// está mexendo no código.
const PORTA = Number(process.env.PORT ?? 8710)

/** Corpo máximo aceito. XML de nota e PDF em base64 passam por aqui. */
const LIMITE_CORPO_BYTES = 32 * 1024 * 1024
/** Sessão parada por mais que isto é esquecida. */
const VALIDADE_SESSAO_MS = 12 * 60 * 60 * 1000
const NOME_COOKIE = 'fhvp_sessao'

// ── Sessões ──────────────────────────────────────────────────────────────────

/**
 * Quando cada navegador falou aqui pela última vez.
 *
 * A sessão em si (qual vendedor está logado) é do app, guardada por ORIGEM —
 * um desenho que já existia para o segundo caixa e que serve à web sem
 * alteração nenhuma: cada aba é uma origem, com seu próprio login. Sem isso, o
 * login do gerente no escritório derrubaria o do vendedor no balcão, e as
 * vendas sairiam no nome errado.
 *
 * Aqui só se guarda a hora, para não acumular sessão de navegador que nunca
 * mais voltou — o processo de uma loja fica meses no ar.
 */
const ultimoAcesso = new Map<string, number>()

function esquecerSessoesVelhas(): void {
  const limite = Date.now() - VALIDADE_SESSAO_MS
  for (const [origem, quando] of ultimoAcesso) {
    if (quando < limite) {
      ultimoAcesso.delete(origem)
      limparSessaoDaOrigem(origem)
    }
  }
}

function lerCookie(req: IncomingMessage, nome: string): string | null {
  const cru = req.headers.cookie
  if (!cru) return null
  for (const parte of cru.split(';')) {
    const [chave, ...resto] = parte.trim().split('=')
    if (chave === nome) return decodeURIComponent(resto.join('='))
  }
  return null
}

/** Só aceita o que este servidor emitiu: 64 caracteres hexadecimais. */
function pareceSessao(valor: string): boolean {
  return /^[0-9a-f]{64}$/.test(valor)
}

/**
 * Descobre de qual navegador é a chamada, criando a marca na primeira vez.
 *
 * O cookie é `HttpOnly` (nenhum script da página o lê, então um XSS não o
 * rouba) e `SameSite=Strict` — que é o que impede outro site de disparar uma
 * venda ou um cancelamento em nome de quem está logado, já que o navegador não
 * manda o cookie numa requisição vinda de fora.
 */
function origemDoPedido(req: IncomingMessage, res: ServerResponse): string {
  const existente = lerCookie(req, NOME_COOKIE)
  if (existente && pareceSessao(existente)) return existente

  const nova = randomBytes(32).toString('hex')
  const seguro = (req.headers['x-forwarded-proto'] ?? '') === 'https'
  res.setHeader(
    'Set-Cookie',
    `${NOME_COOKIE}=${nova}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${VALIDADE_SESSAO_MS / 1000}` +
      (seguro ? '; Secure' : '')
  )
  return nova
}

// ── Arquivos da interface ────────────────────────────────────────────────────

function servirInterface(caminhoUrl: string, res: ServerResponse): void {
  const arquivo = arquivoDaInterface(PASTA_WEB, caminhoUrl)
  if (!arquivo) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Não encontrado.')
    return
  }
  const conteudo = readFileSync(arquivo)
  res.writeHead(200, {
    'Content-Type': tipoDoArquivo(arquivo),
    'Content-Length': conteudo.length,
    'X-Content-Type-Options': 'nosniff',
    // O HTML nunca é guardado (é ele que aponta para os arquivos com hash no
    // nome); o resto pode ficar, porque o nome muda a cada build.
    'Cache-Control': arquivo.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable'
  })
  res.end(conteudo)
}

// ── A porta de entrada das chamadas ──────────────────────────────────────────

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0
    const pedacos: Buffer[] = []
    req.on('data', (p: Buffer) => {
      total += p.length
      if (total > LIMITE_CORPO_BYTES) {
        reject(new Error('Pedido grande demais.'))
        req.destroy()
        return
      }
      pedacos.push(p)
    })
    req.on('end', () => resolve(Buffer.concat(pedacos).toString('utf8')))
    req.on('error', reject)
  })
}

function responder(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  })
  res.end(texto)
}

/**
 * Confere que a chamada veio da própria página.
 *
 * `SameSite=Strict` no cookie já é a defesa principal, mas ela mora inteira no
 * navegador. Este segundo par de olhos custa três linhas e cobre o caso de um
 * navegador antigo que ignore a regra do cookie.
 */
function mesmaOrigem(req: IncomingMessage): boolean {
  const origem = req.headers.origin
  if (!origem) return true // curl e afins não mandam Origin; o cookie decide.
  const host = req.headers.host
  if (!host) return false
  try {
    return new URL(origem).host === host
  } catch {
    return false
  }
}

async function atenderRpc(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!mesmaOrigem(req)) {
    responder(res, 403, { ok: false, erro: 'Origem não reconhecida.' })
    return
  }

  const origem = origemDoPedido(req, res)
  ultimoAcesso.set(origem, Date.now())

  let pedido: unknown
  try {
    pedido = JSON.parse(await lerCorpo(req))
  } catch {
    responder(res, 400, { ok: false, erro: 'Pedido malformado.' })
    return
  }

  // `processarChamada` é o mesmo do segundo caixa — traz de graça o tratamento
  // das duas formas de falhar de um handler: devolver `{ success: false }`
  // (valor normal, viaja como resultado) e lançar exceção (vira ok:false para
  // o navegador tornar a lançar, como a tela veria em casa).
  //
  // `canalPermitido` diz sim a tudo porque aqui o navegador É o aplicativo,
  // não um convidado com direitos menores. Quem limita é o que foi REGISTRADO
  // (impressão e segundo caixa nem chegam a existir neste processo) e as travas
  // de dentro dos handlers, como `requerDono()`.
  const { status, corpo } = await processarChamada(
    { canalPermitido: () => true, despachar: (canal, args, org) => despachar(canal, args, { origem: org }) },
    pedido,
    origem
  )
  responder(res, status, corpo)
}

// ── Boot ─────────────────────────────────────────────────────────────────────

function ligarPlataforma(): void {
  configurarPlataforma({
    pastaDados: () => PASTA_DADOS,
    pastaTemp: () => tmpdir(),
    versao: () => __APP_VERSION__
    // `escolherPasta` fica de fora: uma página não escolhe pasta do aparelho.
    // Quem depende disso avisa o lojista — ver plataforma.ts.
  })
}

function registrarHandlers(): void {
  registrarHandlersLicenca()
  registrarHandlersLicencaPagamento()
  registrarHandlersAuth()
  // Sem `aoMudarAgenda`: aqui não há agendador de janela para reiniciar.
  registrarHandlersBackup({ aoConcluirBackup: envioImediato })
  // Só existem aqui: no aplicativo instalado não há nuvem de onde buscar, e o
  // lojista tem a pasta dele e o pendrive.
  registrarHandlersNuvem()
  registrarHandlersCategorias()
  registrarHandlersChat()
  registrarHandlersClientes()
  registrarHandlersComissoes()
  registrarHandlersContasPagar()
  registrarHandlersDashboard()
  registrarHandlersDevolucoes()
  registrarHandlersEtiquetas()
  registrarHandlersFiscal()
  registrarHandlersFornecedores()
  registrarHandlersLoja()
  registrarHandlersNotasEntrada()
  registrarHandlersNotificacoes()
  registrarHandlersNovidades()
  registrarHandlersOnboarding()
  registrarHandlersPreferenciasUi()
  registrarHandlersProdutos()
  registrarHandlersVendas()
  registrarHandlersVendedores()
  // Impressão e segundo caixa ficam de fora de propósito — ver o cabeçalho.
}

/**
 * Confere o que o servidor não tem como adivinhar.
 *
 * As chaves de licença chegam por variável de ambiente (ver
 * vite.servidor.config.ts). Faltando uma, `validarLicenca` compararia contra
 * `undefined` e recusaria toda licença — a loja abriria pedindo ativação, como
 * se a licença do cliente tivesse vencido. Melhor não subir.
 */
function conferirAmbiente(): void {
  const faltando = ['CHAVE_HMAC', 'CHAVE_AES', 'SALT_AES'].filter((n) => !process.env[n])
  if (faltando.length > 0) {
    console.error(`[fhvp] faltam variáveis de ambiente: ${faltando.join(', ')}`)
    console.error('[fhvp] sem elas nenhuma licença valida. Configure com: fly secrets set ...')
    process.exit(1)
  }
}

/**
 * Guarda uma cópia antes de alterar o esquema do banco.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 * No aplicativo instalado, atualizar é um ato do lojista: ele clica, e antes de
 * qualquer coisa o app faz um backup (ver electron/atualizador.ts). Se a versão
 * nova quebrar, existe uma cópia de segundos antes.
 *
 * Na loja hospedada não há esse momento. `fly deploy` sobe um contêiner novo
 * que, no boot, aplica as migrations pendentes direto no banco vivo. Sem esta
 * função, a nuvem — onde a nossa é a ÚNICA cópia — tinha menos proteção que o
 * desktop, onde o lojista ainda tem a pasta dele e o pendrive.
 *
 * ── Por que o backup vale mesmo com o rollback do Fly ────────────────────────
 * `fly releases` volta o CÓDIGO, não o banco: a migration já rodou. Código
 * velho lendo esquema novo costuma tolerar (as migrations aqui são aditivas),
 * mas "costuma" não é garantia quando o dado é do cliente. O zip de antes é o
 * único caminho de volta que não depende de sorte.
 *
 * ── Falhar aqui não pode impedir a loja de abrir ─────────────────────────────
 * Se o backup falhar, a migration acontece assim mesmo e o registro avisa alto.
 * A alternativa — recusar subir — deixaria a loja fora do ar por causa da rede
 * de proteção, que é trocar um problema por um pior.
 */
async function backupAntesDeMigrar(): Promise<void> {
  const { pendentes, jaAplicadas } = migrationsPendentes(obterBancoDeDados(), MIGRATIONS)
  if (pendentes.length === 0) return

  // Banco recém-criado: todas estão pendentes e não há nada a proteger.
  //
  // ⚠️ Sair aqui também é o que mantém o primeiro boot possível. O
  // `BackupManager` lê a tabela `config` ao nascer, e num banco novo essa
  // tabela só existe DEPOIS da migration 001. Ligá-lo antes disso derrubava o
  // boot com "no such table: config" — em toda loja nova, e só nelas.
  if (jaAplicadas === 0) {
    console.log(`[fhvp] loja nova — aplicando ${pendentes.length} migrations do zero`)
    return
  }

  // Daqui para baixo há histórico, então a migration 001 já rodou e a `config`
  // existe. É seguro ligar o gerente de backup agora, que é o que permite
  // tirar a cópia antes de mexer no esquema.
  inicializarBackupManager()

  console.log(`[fhvp] ${pendentes.length} migration(s) para aplicar; guardando cópia antes`)
  try {
    const r = await obterBackupManager().executarBackup('pre-update')
    if (r.sucesso) console.log(`[fhvp] cópia guardada: ${r.caminhoZip}`)
    else console.error(`[fhvp] ⚠️  a cópia falhou (${r.erro}) — migrando assim mesmo`)
  } catch (erro) {
    console.error(`[fhvp] ⚠️  a cópia falhou (${(erro as Error).message}) — migrando assim mesmo`)
  }
}

/**
 * A pasta de backup desta loja é a desta máquina, e ponto.
 *
 * ── O problema que isto conserta ─────────────────────────────────────────────
 * Quem GRAVA o backup usa sempre a pasta de dados desta máquina. Quem LISTA na
 * tela de restauração usa o que está na configuração `backup_pasta_padrao` — e
 * essa configuração viaja DENTRO do banco.
 *
 * Ou seja: um lojista que sai do aplicativo instalado para a loja hospedada traz
 * junto, dentro dos dados, um caminho de Windows apontando para a pasta de
 * backups do computador antigo. Aqui esse caminho não existe. Os backups
 * continuam sendo feitos, certinhos, e a tela de restauração passa a listar
 * NADA.
 *
 * É a pior forma de falhar: silenciosa, e descoberta exatamente no dia em que a
 * pessoa precisa restaurar.
 *
 * O aplicativo instalado já cuidava disso no boot, mas aquele código depende do
 * Electron e resolve um problema diferente — renomeação de pasta entre versões.
 * Aqui a regra é mais simples e mais forte: num servidor não há usuário
 * escolhendo pasta, então o valor certo é sempre o mesmo, e qualquer outra
 * coisa é resíduo de outra máquina.
 */
function ancorarPastaDeBackup(): void {
  const nossa = join(PASTA_DADOS, 'Backups')

  if (lerConfig('backup_pasta_padrao') !== nossa) {
    console.log(`[fhvp] pasta de backup reancorada em ${nossa}`)
    gravarConfig('backup_pasta_padrao', nossa)
  }

  // A secundária existe para espelhar num segundo disco — pendrive, rede da
  // loja. Num servidor não há segundo disco, e um caminho herdado de outra
  // máquina só produziria falha de cópia a cada backup.
  if (lerConfig('backup_pasta_secundaria')) {
    console.log('[fhvp] pasta de backup secundária descartada (não há segundo disco aqui)')
    gravarConfig('backup_pasta_secundaria', '')
  }
}

export async function iniciar(): Promise<void> {
  conferirAmbiente()

  // No aplicativo instalado, quem cria a pasta de dados é o Electron, antes de
  // qualquer código nosso rodar. Aqui não há ninguém — e numa máquina recém
  // criada na nuvem a pasta ainda não existe. Sem esta linha, o primeiro boot
  // de toda loja nova morre com "Cannot open database because the directory
  // does not exist", que não diz a quem está lendo o que fazer a respeito.
  mkdirSync(PASTA_DADOS, { recursive: true })

  ligarPlataforma()
  configurarNucleo({ criarTabelas, migrations: MIGRATIONS, validarLicenca })
  inicializarBancoDeDados(criarTabelas)

  await backupAntesDeMigrar()
  executarMigrations(obterBancoDeDados(), MIGRATIONS)

  // Backup também aqui — e com mais razão que no balcão. Numa loja instalada, o
  // pior caso é o computador do lojista pifar; aqui os dados de terceiros estão
  // sob a nossa guarda, e não existe ninguém do outro lado para copiar a pasta.
  //
  // O AGENDADOR automático fica de fora: ele reage a suspender a máquina e
  // avisa a janela, coisas que servidor não tem. Quem dispara backup por tempo
  // aqui é outro mecanismo, ainda por fazer.
  //
  // DEPOIS das migrations: o gerente lê a tabela `config` ao nascer, e num
  // banco novo ela só existe a partir da migration 001. A cópia pré-migration
  // liga o gerente por conta própria quando precisa — e só quando já há
  // histórico, ou seja, quando a tabela com certeza existe.
  if (!temBackupManager()) inicializarBackupManager()

  // Depois das migrations: a tabela `config` pode ser criada por uma delas, e
  // antes disso não haveria onde gravar.
  ancorarPastaDeBackup()

  // O backup só vale se sair deste disco — ver backupNuvem.ts. Falta de
  // configuração NÃO impede a loja de abrir: um sistema que se recusa a vender
  // porque o backup não está pronto troca um problema sério por um pior.
  // Reclama alto e segue.
  const semNuvem = ligarBackupNaNuvem()
  if (semNuvem) {
    console.warn(`[fhvp] ⚠️  BACKUP NA NUVEM AINDA NÃO ATIVO: ${semNuvem}`)
    console.warn('[fhvp] ⚠️  até lá, os dados desta loja existem em UM disco só.')
  }

  registrarHandlers()

  setInterval(esquecerSessoesVelhas, 30 * 60 * 1000).unref()

  const servidor = createServer((req, res) => {
    const caminho = (req.url ?? '/').split('?')[0]

    if (req.method === 'POST' && caminho === '/rpc') {
      void atenderRpc(req, res).catch(() => {
        // Uma falha inesperada atendendo uma chamada não pode derrubar a loja.
        if (!res.headersSent) responder(res, 500, { ok: false, erro: 'Erro interno.' })
      })
      return
    }

    if (req.method === 'GET' && caminho === '/saude') {
      responder(res, 200, { ok: true, versao: __APP_VERSION__ })
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      servirInterface(caminho, res)
      return
    }

    responder(res, 405, { ok: false, erro: 'Método não suportado.' })
  })

  // Sem isto, porta ocupada derruba o processo com um rastro de pilha do Node —
  // e na nuvem esse é um caso comum: a máquina reinicia antes de o processo
  // anterior soltar a porta. O supervisor tenta de novo de qualquer forma; o
  // que se ganha aqui é o registro dizer o que houve, em vez de vinte linhas
  // que não ajudam ninguém às duas da manhã.
  servidor.on('error', (erro: NodeJS.ErrnoException) => {
    if (erro.code === 'EADDRINUSE') {
      console.error(`[fhvp] a porta ${PORTA} já está ocupada — outro servidor desta loja está no ar?`)
    } else {
      console.error(`[fhvp] o servidor não subiu: ${erro.message}`)
    }
    process.exit(1)
  })

  servidor.listen(PORTA, '0.0.0.0', () => {
    console.log(`[fhvp] loja no ar em http://localhost:${PORTA}`)
    console.log(`[fhvp] dados em ${PASTA_DADOS}`)
    console.log(`[fhvp] interface em ${PASTA_WEB}`)
  })
}

// Falha aqui é falha de boot: o supervisor do Fly reinicia, e o registro tem
// que dizer o motivo em vez de morrer calado numa promessa rejeitada.
void iniciar().catch((erro) => {
  console.error(`[fhvp] o servidor não subiu: ${(erro as Error).message}`)
  process.exit(1)
})
