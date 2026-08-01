/**
 * Servidor embutido do caixa principal.
 *
 * Expõe o roteador de canais para os terminais pareados. Uma rota só de
 * verdade — `POST /rpc` — porque o terminal não precisa de uma API: precisa
 * chamar exatamente os mesmos handlers que a janela local chama. Toda a
 * inteligência já está no roteador; aqui é só porta de entrada.
 *
 * ── O que este servidor NÃO é ────────────────────────────────────────────────
 * Não é uma API pública, não atende navegador e não tem CORS de propósito. O
 * único cliente é outra instância deste mesmo app, da mesma versão.
 *
 * ── Por que HTTP puro, e quando isso deveria mudar ───────────────────────────
 * Dentro da loja o tráfego vai em texto claro. Foi decisão consciente
 * (2026-07-28), não descuido, e o raciocínio fica registrado aqui para quem
 * reabrir o assunto:
 *
 * O servidor escuta em `0.0.0.0` — precisa, porque o terminal está em outra
 * máquina. Logo, qualquer aparelho na Wi-Fi da loja alcança esta porta. O token
 * impede que ele use o sistema, mas não impede que ele LEIA o que passa: em
 * rede WPA2 com senha compartilhada (o normal no comércio pequeno), quem tem a
 * senha decifra o tráfego alheio. Estariam expostos vendas, CPF de cliente e o
 * próprio token no cabeçalho.
 *
 * Aceitou-se o risco porque o segundo caixa vai operar majoritariamente FORA da
 * loja, e lá o túnel da Fase 3 já criptografa tudo; e porque o ataque dentro da
 * loja exige alguém com interesse e conhecimento de captura de pacotes ao mesmo
 * tempo.
 *
 * **Reabrir se** algum cliente passar a usar o segundo caixa principalmente
 * dentro da loja. A saída desenhada é o PC gerar o próprio certificado ao ligar
 * o multi-caixa e o terminal fixar a impressão digital dele no pareamento —
 * sem CA, sem aviso de navegador, porque os dois lados são este mesmo app.
 * Custo estimado: 1 a 2 dias. Atenção ao custo assimétrico: mudar depois obriga
 * a revogar todo token já distribuído e reparear todo terminal.
 *
 * ── Como o erro atravessa a rede ─────────────────────────────────────────────
 * Os handlers têm dois jeitos de falhar, e os dois precisam chegar do outro
 * lado exatamente como chegariam em casa:
 * - devolvendo `{ success: false, error }` — isso é um valor normal, viaja como
 *   resultado e o terminal repassa pra tela igual;
 * - lançando exceção — vira `{ ok: false, erro }`, e o cliente do terminal
 *   torna a lançar. Sem isso, um erro de permissão viraria "sucesso com dados
 *   estranhos" na tela do segundo caixa.
 *
 * Erro de infraestrutura (token inválido, canal barrado) responde com código
 * HTTP, que é categoria diferente: não é o handler falhando, é a chamada nem
 * ter chegado nele.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { RECUSA_CLONAGEM, type ResultadoClonagem } from './clonagem'

/** Corpo máximo aceito. XML de nota e PDF em base64 passam por aqui. */
export const LIMITE_CORPO_BYTES = 32 * 1024 * 1024

export interface OpcoesServidor {
  porta: number
  /** Versão do app. O terminal recusa conversar com versão diferente. */
  versao: string
  /** Diz de qual terminal é o token, ou `null` se não for de ninguém. */
  autenticar(token: string): string | null
  /** Diz se o canal pode ser atendido pela rede. Ver a allowlist. */
  canalPermitido(canal: string): boolean
  /** Executa a chamada no roteador, em nome da origem informada. */
  despachar(canal: string, args: unknown[], origem: string): unknown
  /** Chamado a cada chamada aceita — o PC anota o último acesso do terminal. */
  aoAtender?(origem: string): void
  /**
   * Tentativa de pareamento. É a ÚNICA porta que atende sem token — o terminal
   * novo ainda não tem nenhum. Devolve a credencial em caso de acerto, ou a
   * razão da recusa. Ausente = pareamento indisponível neste servidor.
   */
  parear?(codigo: string, nome: string): ResultadoParear
  /**
   * Entrega do banco para clonagem. Também atende sem token, e também tem
   * autorização própria — mas SEPARADA da do pareamento, de propósito.
   *
   * Atender um caixa adicional e entregar o banco inteiro são coisas de peso
   * bem diferente: o zip leva tudo de uma vez, incluindo o que um caixa jamais
   * pediria canal por canal. Um token de caixa não deve virar chave do arquivo
   * completo, então a clonagem exige o próprio código, gerado na hora, com o
   * lojista olhando a tela da origem.
   */
  clonar?(codigo: string, versaoDestino: string): Promise<ResultadoClonagem>
}

export type ResultadoParear =
  | {
      ok: true
      id: string
      token: string
      /** Chave do sigilo ponta a ponta, para quando este caixa sair da loja. */
      chaveSigilo?: string
      /** Onde encontrar este computador quando não houver rede local. */
      relay?: { url: string; loja: string }
    }
  | { ok: false; motivo: 'sem-codigo' | 'codigo-errado' | 'codigo-expirado' }

/**
 * Mensagens de recusa do pareamento.
 *
 * São distintas de propósito, apesar de contarem um pouco ao atacante. Quem
 * está do outro lado é, quase sempre, o próprio lojista com o notebook na mão —
 * e "código incorreto" e "o código expirou, gere outro" levam a ações
 * diferentes. Trocar isso por um "não autorizado" genérico transformaria cada
 * erro de digitação num chamado de suporte, e o que o atacante aprende é só o
 * que ele mesmo provocou: que queimou o código.
 */
const RECUSA_PAREAMENTO: Record<string, string> = {
  'sem-codigo': 'Nenhum pareamento aberto. Gere um código no caixa principal.',
  'codigo-errado': 'Código incorreto.',
  'codigo-expirado': 'O código expirou. Gere outro no caixa principal.'
}

export interface ServidorMulticaixa {
  porta: number
  parar(): Promise<void>
}

function responder(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    // Não é navegador do outro lado; deixar explícito evita que um dia alguém
    // aponte uma página web pra cá achando que é API.
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(texto)
}

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let tamanho = 0
    const partes: Buffer[] = []
    req.on('data', (parte: Buffer) => {
      tamanho += parte.length
      // Corta cedo: sem isso, qualquer um na rede derruba o caixa mandando um
      // corpo infinito até a memória acabar.
      if (tamanho > LIMITE_CORPO_BYTES) {
        reject(new Error('corpo grande demais'))
        req.destroy()
        return
      }
      partes.push(parte)
    })
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')))
    req.on('error', reject)
  })
}

/** Extrai o token do cabeçalho `Authorization: Bearer <token>`. */
function tokenDoPedido(req: IncomingMessage): string {
  const cabecalho = req.headers.authorization
  if (typeof cabecalho !== 'string') return ''
  const [esquema, valor] = cabecalho.split(' ')
  return esquema?.toLowerCase() === 'bearer' && valor ? valor.trim() : ''
}

export function criarServidorMulticaixa(opcoes: OpcoesServidor): Promise<ServidorMulticaixa> {
  const servidor = createServer((req, res) => {
    void atender(opcoes, req, res).catch(() => {
      // Nunca deixa a exceção subir pro processo: uma falha inesperada
      // atendendo um terminal não pode derrubar o caixa da loja.
      if (!res.headersSent) responder(res, 500, { ok: false, erro: 'Erro interno.' })
    })
  })

  return new Promise((resolve, reject) => {
    servidor.once('error', reject)
    // 0.0.0.0 porque o terminal está em OUTRA máquina — 127.0.0.1 só atenderia
    // a si mesmo. É o que torna a allowlist e o token indispensáveis.
    servidor.listen(opcoes.porta, '0.0.0.0', () => {
      servidor.removeListener('error', reject)
      const endereco = servidor.address()
      resolve(montarControle(servidor, typeof endereco === 'object' && endereco ? endereco.port : opcoes.porta))
    })
  })
}

function montarControle(servidor: Server, porta: number): ServidorMulticaixa {
  return {
    porta,
    parar: () =>
      new Promise<void>((resolve) => {
        servidor.closeAllConnections?.()
        servidor.close(() => resolve())
      })
  }
}

async function atenderPareamento(
  opcoes: OpcoesServidor,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!opcoes.parear) {
    responder(res, 404, { ok: false, erro: 'Rota inexistente.' })
    return
  }

  let pedido: { codigo?: unknown; nome?: unknown }
  try {
    pedido = JSON.parse(await lerCorpo(req))
  } catch {
    responder(res, 400, { ok: false, erro: 'Pedido malformado.' })
    return
  }

  const codigo = typeof pedido.codigo === 'string' ? pedido.codigo : ''
  const nome = (typeof pedido.nome === 'string' ? pedido.nome : '').trim().slice(0, 60)

  const resultado = opcoes.parear(codigo, nome)
  if (!resultado.ok) {
    responder(res, 401, { ok: false, erro: RECUSA_PAREAMENTO[resultado.motivo] })
    return
  }
  responder(res, 200, {
    ok: true,
    id: resultado.id,
    token: resultado.token,
    chaveSigilo: resultado.chaveSigilo,
    relay: resultado.relay,
    versao: opcoes.versao
  })
}

async function atenderClonagem(
  opcoes: OpcoesServidor,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!opcoes.clonar) {
    responder(res, 404, { ok: false, erro: 'Rota inexistente.' })
    return
  }

  let pedido: { codigo?: unknown; versao?: unknown }
  try {
    pedido = JSON.parse(await lerCorpo(req))
  } catch {
    responder(res, 400, { ok: false, erro: 'Pedido malformado.' })
    return
  }

  const resultado = await opcoes.clonar(
    typeof pedido.codigo === 'string' ? pedido.codigo : '',
    typeof pedido.versao === 'string' ? pedido.versao : ''
  )

  if (!resultado.ok) {
    // 401 para código, 409 para versão: são problemas de natureza diferente e o
    // destino mostra mensagens diferentes.
    const status = resultado.motivo === 'versao-antiga' ? 409 : 401
    responder(res, status, {
      ok: false,
      erro: resultado.detalhe ?? RECUSA_CLONAGEM[resultado.motivo]
    })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Length': resultado.zip.length,
    'Content-Disposition': `attachment; filename="${resultado.nomeArquivo}"`,
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(resultado.zip)
}

async function atender(
  opcoes: OpcoesServidor,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const caminho = (req.url ?? '').split('?')[0]

  // Pareamento vem antes da autenticação porque é a etapa em que o terminal
  // AINDA NÃO TEM token. O que protege esta porta não é cabeçalho nenhum: é a
  // janela de pareamento só existir enquanto o lojista a mantém aberta, e o
  // código morrer em 5 erros. Ver `pareamento.ts`.
  if (caminho === '/parear') {
    if (req.method !== 'POST') {
      responder(res, 405, { ok: false, erro: 'Método não permitido.' })
      return
    }
    await atenderPareamento(opcoes, req, res)
    return
  }

  // Clonagem, também antes da autenticação e pelo mesmo motivo: a máquina de
  // destino pode nem ter sido configurada ainda. Ver o comentário em `clonar`.
  if (caminho === '/clonar') {
    if (req.method !== 'POST') {
      responder(res, 405, { ok: false, erro: 'Método não permitido.' })
      return
    }
    await atenderClonagem(opcoes, req, res)
    return
  }

  // Autenticação antes de qualquer coisa, inclusive do handshake: responder
  // "sou um FHVP Tech versão X" para quem não provou nada já é informação
  // demais para quem está sondando a rede.
  const origem = opcoes.autenticar(tokenDoPedido(req))
  if (!origem) {
    responder(res, 401, { ok: false, erro: 'Terminal não autorizado.' })
    return
  }
  opcoes.aoAtender?.(origem)

  if (caminho === '/handshake' && req.method === 'GET') {
    responder(res, 200, { ok: true, versao: opcoes.versao })
    return
  }

  if (caminho !== '/rpc') {
    responder(res, 404, { ok: false, erro: 'Rota inexistente.' })
    return
  }
  if (req.method !== 'POST') {
    responder(res, 405, { ok: false, erro: 'Método não permitido.' })
    return
  }

  let pedido: unknown
  try {
    pedido = JSON.parse(await lerCorpo(req))
  } catch {
    responder(res, 400, { ok: false, erro: 'Pedido malformado.' })
    return
  }

  const resposta = await processarChamada(opcoes, pedido, origem)
  responder(res, resposta.status, resposta.corpo)
}

/**
 * O que fazer com uma chamada — sem saber COMO ela chegou.
 *
 * Separado do servidor HTTP porque um caixa fora da loja não alcança o
 * computador principal diretamente: a chamada dele vai chegar por outro
 * caminho. As regras, porém, têm que ser exatamente as mesmas — mesma
 * allowlist, mesma tradução de erro, mesma resposta. Duas cópias disso
 * divergiriam, e a divergência apareceria como "funciona na loja, falha fora".
 *
 * A autenticação fica FORA daqui de propósito: quem sabe conferir credencial é
 * cada transporte, porque cada um a carrega de um jeito.
 */
export async function processarChamada(
  opcoes: Pick<OpcoesServidor, 'canalPermitido' | 'despachar'>,
  pedido: unknown,
  origem: string
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const p = (pedido ?? {}) as { canal?: unknown; args?: unknown }
  const canal = typeof p.canal === 'string' ? p.canal : ''
  const args = Array.isArray(p.args) ? p.args : []

  if (!canal) return { status: 400, corpo: { ok: false, erro: 'Pedido sem canal.' } }

  // A allowlist vem ANTES do roteador de propósito: mesmo com token válido,
  // um terminal não restaura backup nem imprime na impressora do PC.
  if (!opcoes.canalPermitido(canal)) {
    return {
      status: 403,
      corpo: { ok: false, erro: `O canal "${canal}" não atende pela rede.` }
    }
  }

  try {
    return { status: 200, corpo: { ok: true, valor: await opcoes.despachar(canal, args, origem) } }
  } catch (erro) {
    // Handler que lançou. Vira ok:false pro cliente tornar a lançar do outro
    // lado — a tela do terminal precisa ver o mesmo erro que veria em casa.
    return { status: 200, corpo: { ok: false, erro: (erro as Error).message } }
  }
}
