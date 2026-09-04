// Backend de licenciamento + pagamento PIX do Sistema FHVP Tech.
// Roda em Node.js com Hono + @hono/node-server, hospedado no Fly.io.
//
// Fluxo simplificado:
//   1. (admin) POST /admin/cliente cria um cliente novo e gera a 1ª chave.
//   2. App pede POST /cobranca → backend cria PIX (mock) e devolve QR + txid.
//   3. App polla GET /cobranca/:txid até o pagamento cair.
//   4. (defesa extra) EfiPay pode chamar POST /webhook/efi; mesmo assim o backend
//      só gera a chave após CONFIRMAR o pagamento direto na EfiPay — nunca confia
//      no corpo da requisição. A confirmação principal é o polling do passo 3.
//   5. App pega a chave do GET /cobranca/:txid e ativa localmente.
//
// Enquanto não temos EfiPay real, POST /admin/marcar-pago simula o webhook
// pra destravar testes end-to-end.

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { readFile } from 'node:fs/promises'
import type { Cliente, Cobranca, Config } from './tipos.ts'
import { proxyChat, type ChatRequest } from './chat.ts'
import {
  obterCliente,
  gravarCliente,
  listarClientes,
  obterCobranca,
  gravarCobranca,
  custoMicroChatMes,
  registrarCustoChat,
  registrarEnvioRecuperacao,
  obterRevendedor,
  gravarRevendedor,
  listarRevendedores,
  listarClientesDoRevendedor,
  apagarSessoesDoRevendedor,
  contarNotasMesDeTodos,
  contarNotasMes,
  listarDispositivos,
  gravarDispositivo,
  dispositivosDeTodos,
  levantarImpedimentosDoCliente,
  apagarClienteDoBanco,
  gravarSessaoAdmin,
  obterSessaoAdmin,
  apagarSessaoAdmin,
  apagarTodasSessoesAdmin,
  limparSessoesAdminVencidas,
  contarTentativasAdmin,
  registrarTentativaAdmin,
  zerarTentativasAdmin
} from './db.ts'
import { foiRenovado, motivoDaRecusa, podeApagar } from './exclusaoCliente.ts'
import { avaliarCota, cotaPadrao } from './cotaNotas.ts'
import {
  avaliarDispositivos,
  decidirVaga,
  estaAtiva,
  nomeSeguroDeMaquina,
  HORAS_ENTRE_CONFERENCIAS,
  type OrigemDispositivo
} from './dispositivos.ts'
import {
  clienteBloqueado,
  limitarAoTeto,
  montarClienteId,
  idValido,
  podeEmitir,
  podeDesbloquear,
  estadoRevendedor,
  DIAS_PADRAO_LICENCA,
  type Revendedor
} from './revenda.ts'
import { enviarCodigoRecuperacao } from './email.ts'
import {
  calcularExpiracao,
  somarDiasNaExpiracao,
  gerarChaveLicenca,
  conferirChaveDeLicenca
} from './licenca.ts'
import { licencaAtiva } from './licencaGuard.ts'
import { registrarRotasRelay } from './relay.ts'
import { registrarRotasFiscais } from './rotasFiscais.ts'
import { registrarRotasRevenda } from './rotasRevenda.ts'
import { gerarHashSenha, senhaAceitavel, emailAceitavel } from './revendaAuth.ts'
import {
  hashTokenAdmin,
  montarSessaoAdmin,
  origemDoPedido,
  passouDoLimiteAdmin,
  senhaAdminAceitavel,
  senhaAdminConfere,
  sessaoAdminExpirada,
  tokenAdminDoCabecalho
} from './adminAuth.ts'
function obrigatoria(chave: string): string {
  const v = process.env[chave]
  if (!v) throw new Error(`env ${chave} obrigatória`)
  return v
}

const config: Config = {
  CHAVE_HMAC: obrigatoria('CHAVE_HMAC'),
  ADMIN_SENHA: obrigatoria('ADMIN_SENHA')
}

/**
 * A senha do painel é forte o bastante para o que ela abre?
 *
 * ── Por que só AVISA, e não derruba o boot ──────────────────────────────────
 * Recusar subir com senha fraca pareceria mais rigoroso, e seria pior: este
 * backend valida licença de TODA loja em produção. Derrubá-lo por causa de uma
 * senha fraca trocaria um risco (alguém talvez acertar a senha) por um dano
 * certo (todas as lojas sem licença agora).
 *
 * O aviso é gritado no log, que é onde quem acabou de rodar `fly secrets set`
 * está olhando.
 */
const forcaDaSenha = senhaAdminAceitavel(config.ADMIN_SENHA)
if (!forcaDaSenha.ok) {
  console.warn(`[fhvp] ⚠️  ADMIN_SENHA fraca: ${forcaDaSenha.erro}`)
  console.warn('[fhvp] ⚠️  esta senha abre TODAS as lojas e revendedores.')
  console.warn("[fhvp] ⚠️  troque com: fly secrets set ADMIN_SENHA='...' --app licenca-gnmodas")
}

/**
 * Toda sessão do painel morre quando o backend sobe.
 *
 * O único motivo de mexer no segredo é trocar a senha, e trocar a senha reinicia
 * a máquina. Se as sessões sobrevivessem, trocar a senha NÃO expulsaria quem já
 * estava dentro — e trocar a senha é exatamente o que se faz quando se
 * desconfia de alguém. O custo é ter que entrar de novo depois de um deploy.
 */
apagarTodasSessoesAdmin()

// Toggle entre mock e EfiPay real baseado em ter ou não credenciais.
// Em dev local sem EfiPay configurado, usa o mock. Em produção, real.
const usaMock = !process.env.EFI_CLIENT_ID
const { criarCobrancaPIX } = usaMock
  ? await import('./mock-efipay.ts')
  : await import('./efipay.ts')
console.log(`PIX provider: ${usaMock ? 'mock' : 'EfiPay (' + (process.env.EFI_AMBIENTE ?? 'homologacao') + ')'}`)

const app = new Hono()

app.use('*', cors())

app.get('/', (c) => c.text('FHVP Tech — licenca API ok'))

/**
 * Identidade visual dos painéis — folha e logotipo, servidos pelo backend.
 *
 * Ficam em arquivo próprio, e não embutidos em cada página, porque são DOIS
 * painéis (o do revendedor e o da FHVP) que precisam parecer o mesmo produto.
 * Com o CSS copiado nos dois, a segunda mudança de cor já sai divergente — e
 * "quase igual" passa impressão de descuido, justamente o que um parceiro
 * comercial não deveria sentir ao abrir a tela todo dia.
 *
 * A folha é lida do disco a cada pedido (arquivo pequeno; editar não exige
 * reiniciar) e vai com cache curto: é servida pela mesma origem das páginas,
 * então nunca desencontra da versão delas.
 */
const CAMINHO_CSS_PAINEL = new URL('./painel.css', import.meta.url)
app.get('/painel.css', async (c) => {
  const css = await readFile(CAMINHO_CSS_PAINEL, 'utf8')
  return c.body(css, 200, {
    'Content-Type': 'text/css; charset=utf-8',
    'Cache-Control': 'public, max-age=300'
  })
})

/**
 * Pecas de interface compartilhadas pelos dois paineis (icones, cartao, menu).
 *
 * Servido como arquivo, e nao embutido em cada pagina, pela mesma razao da
 * folha de estilo: sao duas telas que precisam parecer o mesmo produto, e
 * codigo duplicado diverge na segunda alteracao.
 */
const CAMINHO_UI_PAINEL = new URL('./painel-ui.js', import.meta.url)
app.get('/painel-ui.js', async (c) => {
  const js = await readFile(CAMINHO_UI_PAINEL, 'utf8')
  return c.body(js, 200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=300'
  })
})

const CAMINHO_LOGO = new URL('./logo.png', import.meta.url)
app.get('/painel-logo.png', async (c) => {
  const png = await readFile(CAMINHO_LOGO)
  return c.body(new Uint8Array(png), 200, {
    'Content-Type': 'image/png',
    // O logotipo não muda; vale guardar por um dia para a tela de entrada não
    // baixar 270 KB a cada login.
    'Cache-Control': 'public, max-age=86400'
  })
})

/**
 * Quem atende esta loja.
 *
 * ── As duas coisas que isto resolve ──────────────────────────────────────────
 * (a) O app do lojista de revendedor precisa ESCONDER o botão de renovar por
 *     PIX — aquele PIX cai na conta da FHVP, e quem cobra essa loja é o
 *     revendedor. Sem isto, o dinheiro vai para o lado errado do ciclo.
 * (b) A marca na tela é FHVP Tech, então o lojista com problema liga para a
 *     FHVP mesmo quando comprou de terceiro. Com um `clienteId` em mãos dá para
 *     saber para quem devolver a ligação, em vez de descobrir na conversa.
 *
 * ── Por que é aberta, e o que isso obrigou ───────────────────────────────────
 * Precisa responder ao app antes de qualquer sessão existir, então não há
 * autenticação. Isso a tornaria um verificador de quais códigos de loja são
 * reais — por isso **código desconhecido recebe a MESMA resposta** de um cliente
 * direto: atendido pela FHVP. Quem sondar não distingue "não existe" de "existe
 * e é nosso", que é exatamente o que se quer.
 *
 * Sai o `contato` do revendedor (o que ele já usa para atender), NUNCA o e-mail
 * dele: aquele endereço é o caminho de recuperação de senha do painel, e
 * publicá-lo numa rota aberta entregaria metade do login de graça.
 */
const SUPORTE_FHVP = {
  nome: 'FHVP Tech',
  contato: process.env.CONTATO_SUPORTE_FHVP ?? 'https://wa.me/5585921871975'
}

app.get('/suporte/:clienteId', (c) => {
  const cliente = obterCliente(c.req.param('clienteId'))
  const revendedor = cliente?.revendedorId ? obterRevendedor(cliente.revendedorId) : null

  // A ausência de revendedor — porque a loja é direta, porque o código não
  // existe, ou porque o cadastro do revendedor sumiu — cai toda no mesmo lugar.
  if (!revendedor) {
    return c.json({
      atendidoPor: 'fhvp',
      nome: SUPORTE_FHVP.nome,
      contato: SUPORTE_FHVP.contato,
      podeRenovarNoApp: true
    })
  }

  return c.json({
    atendidoPor: 'revendedor',
    nome: revendedor.nome,
    contato: revendedor.contato ?? null,
    // O app lê ESTE campo para decidir se mostra o botão de PIX — e não o
    // `atendidoPor`. Assim, mudar a política de quem pode renovar sozinho não
    // exige uma release do app para reinterpretar o outro campo.
    podeRenovarNoApp: false
  })
})

/**
 * Teto simples de pedidos de vaga por IP.
 *
 * Mora na memoria, e nao no banco, de propósito: reiniciar o processo zerar a
 * contagem aqui não custa nada, porque quem tem chave válida é cliente de
 * verdade. Serve contra script bobo, não contra adversário determinado.
 */
const MAX_VAGAS_POR_HORA = 60
const pedidosDeVagaPorIp = new Map<string, { hora: string; n: number }>()

function passouDoLimiteDeVagas(origem: string, hora: string): boolean {
  if (pedidosDeVagaPorIp.size > 5000) {
    for (const [ip, reg] of pedidosDeVagaPorIp) {
      if (reg.hora !== hora) pedidosDeVagaPorIp.delete(ip)
    }
  }
  const atual = pedidosDeVagaPorIp.get(origem)
  if (!atual || atual.hora !== hora) {
    pedidosDeVagaPorIp.set(origem, { hora, n: 1 })
    return false
  }
  atual.n += 1
  return atual.n > MAX_VAGAS_POR_HORA
}

/**
 * Vaga de dispositivo: a maquina se apresenta e pede para abrir o sistema.
 *
 * ── Por que esta rota e PUBLICA ─────────────────────────────────────────────
 * Quem chama e a loja, que nao tem sessao de painel nenhuma. O que faz as vezes
 * de credencial e a propria chave de licenca: ela e assinada por HMAC com um
 * segredo que so este servidor tem, e o `clienteId` sai DE DENTRO dela.
 * ★ Aceitar um `clienteId` solto no corpo deixaria qualquer pessoa lotar as
 * vagas da loja dos outros, que e um jeito barato de derrubar um concorrente.
 *
 * ── O que ela devolve, e o que o app faz com isso ───────────────────────────
 * `concedida: true` vira passe local. O 403 com `concedida: false` e a UNICA
 * resposta que impede a ativacao. Silencio (rede caida, servidor fora) nao e
 * resposta: o app segue trabalhando e pergunta de novo depois.
 */
app.post('/licenca/dispositivo', async (c) => {
  const origem = origemDoPedido(c.req.header('x-forwarded-for'))
  if (passouDoLimiteDeVagas(origem, new Date().toISOString().slice(0, 13))) {
    return c.json({ erro: 'muitos pedidos — tente novamente mais tarde' }, 429)
  }

  const body = await c.req
    .json<{
      chave?: string
      deviceId?: string
      digital?: string
      nome?: string
      origem?: OrigemDispositivo
      versao?: string
    }>()
    .catch(() => null)
  if (!body) return c.json({ erro: 'corpo inválido' }, 400)

  const conferida = await conferirChaveDeLicenca(config.CHAVE_HMAC, body.chave)
  if (!conferida.ok) return c.json({ erro: conferida.erro }, 400)

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
  if (!/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) {
    return c.json({ erro: 'deviceId inválido' }, 400)
  }
  // Digital vazia e ESTADO VALIDO: a coleta de hardware pode falhar num PC
  // qualquer, e recusar a instalacao por isso seria punir o cliente por um
  // driver. O que nao entra e lixo com cara de digital.
  const digital = typeof body.digital === 'string' ? body.digital.trim() : ''
  if (digital !== '' && !/^[a-f0-9]{16,64}$/.test(digital)) {
    return c.json({ erro: 'digital inválida' }, 400)
  }

  const cliente = obterCliente(conferida.clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const agoraMs = Date.now()
  const veredito = decidirVaga({
    existentes: listarDispositivos(cliente.clienteId),
    pedido: {
      deviceId,
      digital,
      nome: nomeSeguroDeMaquina(body.nome),
      origem: body.origem === 'terminal' ? 'terminal' : 'principal',
      versao: typeof body.versao === 'string' ? body.versao.slice(0, 20) : undefined
    },
    limite: cliente.limiteDispositivos,
    permitirAcimaDoLimite: cliente.permitirAcimaDoLimite === true,
    agoraMs
  })

  if (!veredito.concedida) {
    return c.json(
      {
        concedida: false,
        motivo: veredito.motivo,
        limite: veredito.limite,
        mensagem: veredito.mensagem,
        // So o nome e a data: e o que a tela precisa para a pessoa reconhecer
        // qual computador liberar. Digital e identificador nao voltam.
        emUso: veredito.emUso.map((d) => ({ nome: d.nome, ultimoEm: d.ultimoEm }))
      },
      403
    )
  }

  gravarDispositivo(cliente.clienteId, veredito.registro, veredito.substitui)

  return c.json({
    concedida: true,
    motivo: veredito.motivo,
    limite: cliente.limiteDispositivos ?? null,
    emUso: veredito.emUso,
    // Quando perguntar de novo. Vai junto para o app nao carregar uma copia da
    // constante e os dois lados nao discordarem do prazo.
    reconferirEm: new Date(agoraMs + HORAS_ENTRE_CONFERENCIAS * 3_600_000).toISOString()
  })
})

// Painel do revendedor: página única, servida pelo próprio backend.
//
// Mesma origem da API de propósito — sem CORS, sem token viajando entre
// domínios, e sem um segundo alvo de deploy pra manter em sincronia. Lida do
// disco a cada pedido: o arquivo é pequeno e assim editar o painel não exige
// reiniciar o processo em desenvolvimento.
//
// Fora do prefixo `/revenda` porque a portaria de lá exige sessão — a página
// que DESENHA o login não pode exigir estar logado pra carregar.
const CAMINHO_PAINEL = new URL('./painel.html', import.meta.url)
app.get('/painel', async (c) => {
  const html = await readFile(CAMINHO_PAINEL, 'utf8')
  return c.html(html, 200, {
    // Nada nesta página vem de fora, então travar as origens é de graça e
    // fecha a porta pra injeção de script de terceiro.
    'Content-Security-Policy':
      "default-src 'none'; script-src 'self' 'unsafe-inline'; " +
      // 'self' entrou para a folha de identidade (/painel.css) e o logotipo;
      // 'unsafe-inline' segue porque as páginas ainda têm estilo embutido.
      "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
      "connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  })
})

/**
 * Painel da FHVP — o outro lado do balcão.
 *
 * Fica FORA do prefixo `/admin` de propósito: aquele guarda exige um cabeçalho
 * `Authorization`, e um navegador pedindo uma página não manda cabeçalho nenhum.
 * A página em si não é segredo — ela é uma casca vazia sem token. O que protege
 * são as rotas `/admin/*` que ela chama, cada uma exigindo o Bearer que a pessoa
 * cola na tela.
 *
 * O nome é `/painel-fhvp` e não `/admin/painel` justamente para não sugerir que
 * a página está atrás da portaria — ela não está, e fingir que sim seria pior
 * que assumir.
 */
const CAMINHO_PAINEL_FHVP = new URL('./painel-fhvp.html', import.meta.url)
app.get('/painel-fhvp', async (c) => {
  const html = await readFile(CAMINHO_PAINEL_FHVP, 'utf8')
  return c.html(html, 200, {
    'Content-Security-Policy':
      "default-src 'none'; script-src 'self' 'unsafe-inline'; " +
      // 'self' entrou para a folha de identidade (/painel.css) e o logotipo;
      // 'unsafe-inline' segue porque as páginas ainda têm estilo embutido.
      "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
      "connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    // Esta tela lista a carteira inteira. Não deve ficar em cache de proxy nem
    // voltar pelo botão "voltar" depois de alguém sair.
    'Cache-Control': 'no-store'
  })
})

// Ponto de encontro do multicaixa: liga o computador principal de uma loja a um
// caixa adicional que está fora dela. O conteúdo passa cifrado ponta a ponta —
// este servidor encaminha bytes que não consegue interpretar. Ver relay.ts.
registrarRotasRelay(app, config.CHAVE_HMAC)

// Rotas da nota fiscal (NFC-e via ACBr). Protegidas por licença lá dentro.
registrarRotasFiscais(app)

// Painel do revendedor. Registrado ANTES do guarda do /admin/* de propósito:
// são portarias independentes, e nenhuma rota /revenda/* aceita a sessão do
// painel da FHVP — nem o contrário.
registrarRotasRevenda(app, config.CHAVE_HMAC, criarCobrancaPIX)

// ───── Admin ─────────────────────────────────────────────────────────
/**
 * Login do painel da FHVP.
 *
 * ── Por que não é `/admin/login` ─────────────────────────────────────────────
 * O guarda logo abaixo protege `/admin/*`, e uma rota de login lá dentro
 * exigiria estar logado para logar. Fora do prefixo, e a leitura fica óbvia.
 *
 * ── O que esta rota se recusa a contar ───────────────────────────────────────
 * Erro de senha e limite estourado devolvem mensagens diferentes de propósito
 * (quem esgotou precisa saber que é só esperar), mas nenhuma das duas diz se a
 * senha chegou perto. Não existe "usuário não encontrado" aqui: a conta é uma
 * só, e a única informação é a senha.
 */
app.post('/admin-login', async (c) => {
  const origem = origemDoPedido(c.req.header('x-forwarded-for'))
  const hora = new Date().toISOString().slice(0, 13) // AAAA-MM-DDTHH

  if (passouDoLimiteAdmin(contarTentativasAdmin(origem, hora))) {
    return c.json(
      { erro: 'muitas tentativas — espere a virada da hora e tente de novo' },
      429
    )
  }

  const body = await c.req.json<{ senha?: string }>().catch(() => ({ senha: undefined }))

  if (!senhaAdminConfere(body.senha, config.ADMIN_SENHA)) {
    // Conta ANTES de responder: contar só no sucesso não freou nada, e contar
    // depois de um `return` é o jeito clássico de o limite nunca subir.
    registrarTentativaAdmin(origem, hora)
    return c.json({ erro: 'senha incorreta' }, 401)
  }

  // Acertou: zera o balde desta origem para que uma sequência de erros de
  // digitação não persiga quem já provou quem é.
  zerarTentativasAdmin(origem, hora)
  limparSessoesAdminVencidas()

  const { token, sessao } = montarSessaoAdmin()
  gravarSessaoAdmin(sessao)
  return c.json({ token, expiraEm: sessao.expiraEm })
})

/** Encerra a sessão atual. O painel chama ao sair; o token morre na hora. */
app.post('/admin-logout', async (c) => {
  const token = tokenAdminDoCabecalho(c.req.header('authorization'))
  if (token) apagarSessaoAdmin(hashTokenAdmin(token))
  return c.json({ ok: true })
})

// Protege rotas /admin/* com a sessão criada no /admin-login.
app.use('/admin/*', async (c, next) => {
  const token = tokenAdminDoCabecalho(c.req.header('authorization'))
  if (!token) return c.json({ erro: 'não autenticado' }, 401)

  const sessao = obterSessaoAdmin(hashTokenAdmin(token))
  if (!sessao || sessaoAdminExpirada(sessao)) {
    if (sessao) apagarSessaoAdmin(sessao.tokenHash)
    // "inválida OU expirada" numa frase só: separar as duas contaria a um
    // estranho que aquele token já existiu.
    return c.json({ erro: 'sessão inválida ou expirada — entre novamente' }, 401)
  }
  await next()
})

// Lista todos os clientes cadastrados, com o consumo de notas do mês.
//
// O contador vem junto de propósito: é a pergunta "quem está emitindo quanto?",
// e ela só é útil se puder ser feita de um golpe, olhando a carteira inteira.
// Perguntar loja a loja daria uma consulta por cliente para desenhar uma tabela
// — por isso `contarNotasMesDeTodos` traz tudo numa consulta só.
//
// `?mes=AAAA-MM` olha um mês fechado. É o que se usa para cobrar excedente: o
// mês corrente ainda está andando, e cobrar por ele seria cobrar um número que
// vai mudar depois.
app.get('/admin/clientes', (c) => {
  const mes = c.req.query('mes')
  const contagem = contarNotasMesDeTodos(mes)
  const maquinasPorLoja = dispositivosDeTodos()
  const agoraMs = Date.now()

  const clientes = listarClientes().map((cl) => {
    const teto =
      cl.tetoNotasMes ??
      cotaPadrao({ plano: cl.plano, ehDeRevendedor: Boolean(cl.revendedorId) })
    const cota = avaliarCota(
      contagem.get(cl.clienteId) ?? 0,
      teto,
      cl.bloquearAcimaDoTeto === true
    )
    return {
      clienteId: cl.clienteId,
      nome: cl.nome,
      contato: cl.contato,
      validadeAtual: cl.validadeAtual,
      valorCentavosRenovacao: cl.valorCentavosRenovacao ?? null,
      plano: cl.plano ?? null,
      // Ausente = cliente direto da FHVP. Explicitado como null para a tela não
      // ter que distinguir "campo não veio" de "não tem revendedor".
      revendedorId: cl.revendedorId ?? null,
      bloqueadoPor: cl.bloqueadoPor ?? null,
      notas: {
        mes: mes ?? new Date().toISOString().slice(0, 7),
        emitidas: cota.emitidas,
        teto: cota.teto,
        excedentes: cota.excedentes,
        // Verdadeiro só quando alguém ligou o bloqueio nesta loja. Serve para a
        // tela mostrar que ali existe uma cancela, não só uma régua.
        bloqueiaAcimaDoTeto: cl.bloquearAcimaDoTeto === true
      },
      // Em quantas máquinas esta loja abre. Vem já na lista, e não só na
      // tela de detalhe, porque a pergunta que se faz olhando a carteira
      // inteira é "quem está usando mais do que contratou?".
      dispositivos: avaliarDispositivos(
        maquinasPorLoja.get(cl.clienteId) ?? [],
        cl.limiteDispositivos,
        agoraMs
      ),
      permitirAcimaDoLimite: cl.permitirAcimaDoLimite === true
    }
  })

  // Quem estourou primeiro: é essa a linha que o gerente procura ao abrir.
  clientes.sort((a, b) => b.notas.excedentes - a.notas.excedentes)
  return c.json({ total: clientes.length, clientes })
})

/**
 * Ajusta a cota de notas de uma loja.
 *
 * `teto: null` devolve a loja ao padrão da origem dela (varejo 100 · cliente de
 * revendedor no Pro 50) — não é o mesmo que `teto: 0`, que significaria "esta
 * loja não emite mais nada". Os dois estados são aceitos porque os dois têm uso.
 */
app.post('/admin/cliente/:clienteId/cota', async (c) => {
  const clienteId = c.req.param('clienteId')
  const cliente = obterCliente(clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const body = await c.req.json<{ teto?: number | null; bloquear?: boolean }>()

  if (body.teto !== undefined) {
    if (body.teto === null) {
      delete cliente.tetoNotasMes
    } else if (!Number.isInteger(body.teto) || body.teto < 0) {
      return c.json({ erro: 'teto deve ser inteiro >= 0, ou null para voltar ao padrão' }, 400)
    } else {
      cliente.tetoNotasMes = body.teto
    }
  }
  if (body.bloquear !== undefined) {
    cliente.bloquearAcimaDoTeto = body.bloquear === true
  }
  gravarCliente(cliente)

  const tetoEfetivo =
    cliente.tetoNotasMes ??
    cotaPadrao({ plano: cliente.plano, ehDeRevendedor: Boolean(cliente.revendedorId) })
  return c.json({
    ok: true,
    clienteId,
    cota: avaliarCota(
      contarNotasMes(clienteId),
      tetoEfetivo,
      cliente.bloquearAcimaDoTeto === true
    ),
    usandoPadrao: cliente.tetoNotasMes === undefined
  })
})

/**
 * As maquinas desta loja, para a tela mostrar qual liberar.
 */
app.get('/admin/cliente/:clienteId/dispositivos', (c) => {
  const clienteId = c.req.param('clienteId')
  const cliente = obterCliente(clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const agoraMs = Date.now()
  const lista = listarDispositivos(clienteId)
  return c.json({
    clienteId,
    limite: cliente.limiteDispositivos ?? null,
    permitirAcimaDoLimite: cliente.permitirAcimaDoLimite === true,
    situacao: avaliarDispositivos(lista, cliente.limiteDispositivos, agoraMs),
    dispositivos: lista
      .map((d) => ({ ...d, ativo: estaAtiva(d, agoraMs) }))
      .sort((a, b) => (a.ultimoEm < b.ultimoEm ? 1 : -1))
  })
})

/**
 * Ajusta em quantas maquinas esta loja abre.
 *
 * `limite: null` devolve a loja ao estado "sem limite combinado", que e o de
 * quem nunca negociou isso. NAO e o mesmo que zero.
 *
 * ⚠️ Zero e RECUSADO aqui. Na cota de notas ele tem uso ("nenhuma incluida"),
 * mas em dispositivo ele significa "esta loja nao abre em lugar nenhum", que e
 * quase sempre engano de digitacao e cujo estrago aparece so na proxima
 * instalacao, longe de quem digitou. Para desligar uma loja existem o bloqueio
 * e a validade, que dizem o que sao.
 */
app.post('/admin/cliente/:clienteId/dispositivos', async (c) => {
  const clienteId = c.req.param('clienteId')
  const cliente = obterCliente(clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const body = await c.req.json<{ limite?: number | null; permitirAcima?: boolean }>()

  if (body.limite !== undefined) {
    if (body.limite === null) {
      delete cliente.limiteDispositivos
    } else if (!Number.isInteger(body.limite) || body.limite < 1) {
      return c.json(
        { erro: 'limite deve ser inteiro >= 1, ou null para deixar sem limite' },
        400
      )
    } else {
      cliente.limiteDispositivos = body.limite
    }
  }
  if (body.permitirAcima !== undefined) {
    cliente.permitirAcimaDoLimite = body.permitirAcima === true
  }
  gravarCliente(cliente)

  return c.json({
    ok: true,
    clienteId,
    limite: cliente.limiteDispositivos ?? null,
    permitirAcimaDoLimite: cliente.permitirAcimaDoLimite === true,
    situacao: avaliarDispositivos(
      listarDispositivos(clienteId),
      cliente.limiteDispositivos,
      Date.now()
    )
  })
})

/**
 * Devolve a vaga de uma maquina.
 *
 * O registro NAO e apagado: ele fica marcado com a data, porque saber que
 * aquele computador existiu e o que explica a conta depois.
 *
 * ★ A maquina liberada nao para na hora, e nem deveria: ela descobre na
 * conferencia seguinte. E, ao voltar, ela DISPUTA a vaga como qualquer outra
 * (ver `decidirVaga`). E isso que faz liberar valer para tirar um computador a
 * mais, e nao so para acomodar um novo.
 */
app.delete('/admin/cliente/:clienteId/dispositivo/:deviceId', (c) => {
  const clienteId = c.req.param('clienteId')
  const deviceId = c.req.param('deviceId')
  const cliente = obterCliente(clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const alvo = listarDispositivos(clienteId).find((d) => d.deviceId === deviceId)
  if (!alvo) return c.json({ erro: 'dispositivo não encontrado' }, 404)
  if (alvo.liberadoEm) return c.json({ erro: 'esta vaga já estava liberada' }, 409)

  gravarDispositivo(clienteId, { ...alvo, liberadoEm: new Date().toISOString() })

  return c.json({
    ok: true,
    liberado: alvo.nome,
    situacao: avaliarDispositivos(
      listarDispositivos(clienteId),
      cliente.limiteDispositivos,
      Date.now()
    )
  })
})

// Cria um cliente novo e devolve a 1ª chave (válida por `diasIniciais`).
// Aceita opcionalmente `valorCentavosRenovacao` pra fixar preço por cliente
// — quando definido, sobrescreve o que o app manda em POST /cobranca.
app.post('/admin/cliente', async (c) => {
  const body = await c.req.json<{
    clienteId: string
    nome: string
    contato?: string
    diasIniciais?: number
    valorCentavosRenovacao?: number
    // Novos e OPCIONAIS: sem eles a rota se comporta exatamente como antes,
    // que é o caso de todo cliente direto da FHVP.
    revendedorId?: string
    plano?: 'basico' | 'pro'
    // Em quantas máquinas a loja abre. Vem no CADASTRO porque faz parte do
    // que se combina na hora de fechar, e não de uma revisão futura. Ausente
    // segue significando sem limite.
    limiteDispositivos?: number
  }>()
  if (!body.clienteId || !body.nome) {
    return c.json({ erro: 'clienteId e nome são obrigatórios' }, 400)
  }

  // Cliente de revendedor: id nasce PREFIXADO. Não é cosmético — `nfce_numero`
  // e `nfce_emissao` são chaveadas por cliente_id, e dois revendedores com uma
  // "LOJA001" cada dividiriam o contador da NFC-e, emitindo nota com número
  // repetido. Problema com a SEFAZ, não com o software.
  let revendedor: Revendedor | null = null
  if (body.revendedorId) {
    if (!idValido(body.revendedorId) || !idValido(body.clienteId)) {
      return c.json({ erro: 'id deve ter 2-20 letras/números, sem hífen' }, 400)
    }
    revendedor = obterRevendedor(body.revendedorId.trim().toUpperCase())
    if (!revendedor) return c.json({ erro: 'revendedor não encontrado' }, 404)
    if (!podeEmitir(revendedor)) {
      return c.json(
        { erro: `revendedor ${estadoRevendedor(revendedor)} — não pode emitir`, estado: estadoRevendedor(revendedor) },
        403
      )
    }
  }
  const clienteId = montarClienteId(revendedor?.revendedorId ?? null, body.clienteId)

  if (obterCliente(clienteId)) {
    return c.json({ erro: 'clienteId já existe' }, 409)
  }

  const dias = body.diasIniciais ?? DIAS_PADRAO_LICENCA
  // ★ O TETO. Cliente direto passa reto; cliente de revendedor nunca recebe
  // data além da validade dele. É o que faz bloquear o revendedor esvaziar a
  // carteira dele sozinha, sem a FHVP tocar em loja nenhuma.
  const teto = limitarAoTeto(calcularExpiracao(dias), revendedor)
  if (!teto.ok) return c.json({ erro: teto.erro }, 400)

  const chave = await gerarChaveLicenca(config.CHAVE_HMAC, clienteId, teto.expiracao)

  // O MESMO instante nos dois campos, de propósito. Duas chamadas ao relógio
  // caem em milissegundos diferentes, e é essa diferença que distingue
  // "cadastrado agora" de "já renovou" (ver foiRenovado em exclusaoCliente.ts).
  // Com dois valores, um cadastro recém-criado parecia ter história.
  const agoraCadastro = new Date().toISOString()

  const cliente: Cliente = {
    clienteId,
    nome: body.nome,
    contato: body.contato,
    criadoEm: agoraCadastro,
    validadeAtual: teto.expiracao,
    ultimoPagamentoEm: agoraCadastro,
    valorCentavosRenovacao: body.valorCentavosRenovacao,
    revendedorId: revendedor?.revendedorId,
    plano: body.plano,
    limiteDispositivos: body.limiteDispositivos
  }
  gravarCliente(cliente)

  return c.json({ cliente, chave, validadeCortadaNoTeto: teto.cortada })
})

// Renova (ou estende) a licença de um cliente. É por aqui que o revendedor vai
// renovar os dele quando o painel existir — e o teto vale igual.
app.post('/admin/cliente/:clienteId/renovar', async (c) => {
  const clienteId = c.req.param('clienteId')
  const body = await c.req.json<{ dias?: number }>().catch(() => ({ dias: undefined }))
  const cliente = obterCliente(clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)
  if (clienteBloqueado(cliente)) {
    return c.json({ erro: `renovação bloqueada por ${cliente.bloqueadoPor}` }, 403)
  }

  const revendedor = cliente.revendedorId ? obterRevendedor(cliente.revendedorId) : null
  if (cliente.revendedorId && !revendedor) {
    return c.json({ erro: 'revendedor do cliente não existe mais' }, 409)
  }
  if (revendedor && !podeEmitir(revendedor)) {
    return c.json({ erro: `revendedor ${estadoRevendedor(revendedor)} — não pode emitir` }, 403)
  }

  const pedida = somarDiasNaExpiracao(cliente.validadeAtual, body.dias ?? DIAS_PADRAO_LICENCA)
  const teto = limitarAoTeto(pedida, revendedor)
  if (!teto.ok) return c.json({ erro: teto.erro }, 400)

  const chave = await gerarChaveLicenca(config.CHAVE_HMAC, clienteId, teto.expiracao)
  gravarCliente({ ...cliente, validadeAtual: teto.expiracao })
  return c.json({ ok: true, chave, validade: teto.expiracao, validadeCortadaNoTeto: teto.cortada })
})

// Tranca/destranca a renovação de UMA loja. Não derruba o período corrente —
// a licença dela segue valendo offline até a data. `porQuem` é o que impede o
// revendedor de desfazer um bloqueio da FHVP.
/**
 * Apaga o cadastro de um cliente — só enquanto ele ainda não produziu nada.
 *
 * ── Por que a regra é estreita ──────────────────────────────────────────────
 * O `clienteId` é a chave da numeração da NFC-e. Apagar um cliente que já
 * emitiu, e depois recriar o mesmo id, reiniciaria a sequência — e nota com
 * número repetido é problema com a SEFAZ, não com o software. Não é um erro
 * que se conserta com um segundo DELETE.
 *
 * O caso que esta rota atende é outro, e é o comum: cadastrou `NETOIMPORTS`,
 * queria `NETO`, percebeu em cinco minutos. Antes disso existir, o conselho era
 * "na dúvida cadastre curto" — o medo de errar moldando o nome que o cliente
 * carrega para sempre.
 *
 * ── Não existe `?forcar=1` ──────────────────────────────────────────────────
 * Foi tentador e ficou de fora. Uma saída de emergência nesta rota seria usada
 * no dia de pressa, que é exatamente o dia em que ninguém lê o aviso. Cliente
 * com história se ENCERRA bloqueando a renovação; o cadastro fica, porque a
 * numeração fiscal dele precisa continuar existindo.
 */
app.delete('/admin/cliente/:clienteId', async (c) => {
  const clienteId = c.req.param('clienteId')
  const cliente = obterCliente(clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const impedimentos = {
    ...levantarImpedimentosDoCliente(clienteId),
    renovado: foiRenovado(cliente),
    temCnpj: Boolean(cliente.cnpjEmitente)
  }

  if (!podeApagar(impedimentos)) {
    // 409 e não 403: não é falta de permissão, é o estado do recurso que não
    // permite. Quem lê o código do erro precisa saber que insistir não ajuda.
    return c.json({ erro: motivoDaRecusa(clienteId, impedimentos), impedimentos }, 409)
  }

  apagarClienteDoBanco(clienteId)
  console.log(`[admin] cliente ${clienteId} apagado (sem emissão, sem renovação)`)
  return c.json({ ok: true, apagado: clienteId })
})

app.post('/admin/cliente/:clienteId/bloqueio', async (c) => {
  const clienteId = c.req.param('clienteId')
  const body = await c.req.json<{
    bloquear: boolean
    porQuem?: 'revendedor' | 'fhvp'
    motivo?: string
  }>()
  const cliente = obterCliente(clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const quem = body.porQuem ?? 'fhvp'
  if (!body.bloquear && !podeDesbloquear(quem, cliente.bloqueadoPor)) {
    return c.json({ erro: `bloqueio posto pela FHVP — ${quem} não pode desfazer` }, 403)
  }

  gravarCliente({
    ...cliente,
    bloqueadoPor: body.bloquear ? quem : undefined,
    motivoBloqueio: body.bloquear ? body.motivo : undefined
  })
  return c.json({ ok: true, bloqueado: body.bloquear })
})

// ───── Revendedores ──────────────────────────────────────────────────
app.get('/admin/revendedores', (c) => {
  const lista = listarRevendedores().map((r) => {
    const clientes = listarClientesDoRevendedor(r.revendedorId)
    return {
      revendedorId: r.revendedorId,
      nome: r.nome,
      contato: r.contato,
      validade: r.validade,
      estado: estadoRevendedor(r),
      bloqueado: !!r.bloqueado,
      motivoBloqueio: r.motivoBloqueio,
      // Sem e-mail ele NÃO recupera a senha sozinho — toda vez que esquecer
      // vira ligação para a FHVP. Aparece na listagem para o buraco ser
      // visível ANTES de alguém precisar dele.
      email: r.email ?? null,
      podeRecuperarSenha: !!r.email,
      // A cunhagem É a medição: como toda chave passa por aqui, isto é a base
      // de faturamento dele. Ele não tem como subdeclarar.
      clientes: clientes.length,
      clientesAtivos: clientes.filter((cl) => licencaAtiva(cl) && !clienteBloqueado(cl)).length
    }
  })
  return c.json({ total: lista.length, revendedores: lista })
})

app.post('/admin/revendedor', async (c) => {
  const body = await c.req.json<{
    revendedorId: string
    nome: string
    contato?: string
    dias?: number
    precoCentavosBasico?: number
    precoCentavosPro?: number
    precoCentavosMinimo?: number
    // OBRIGATÓRIO. Sem e-mail não existe "esqueci minha senha", e todo
    // revendedor cadastrado sem ele é um telefonema futuro garantido para a
    // FHVP. Exigir na criação custa zero; correr atrás depois custa tempo.
    email: string
  }>()
  if (!body.revendedorId || !body.nome) {
    return c.json({ erro: 'revendedorId e nome são obrigatórios' }, 400)
  }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email) {
    return c.json(
      { erro: 'email é obrigatório — sem ele o revendedor não consegue recuperar a senha sozinho' },
      400
    )
  }
  if (!emailAceitavel(email)) return c.json({ erro: 'e-mail inválido' }, 400)
  if (!idValido(body.revendedorId)) {
    return c.json({ erro: 'revendedorId deve ter 2-20 letras/números, sem hífen' }, 400)
  }
  const id = body.revendedorId.trim().toUpperCase()
  if (obterRevendedor(id)) return c.json({ erro: 'revendedorId já existe' }, 409)

  const revendedor: Revendedor = {
    revendedorId: id,
    nome: body.nome,
    contato: body.contato,
    criadoEm: new Date().toISOString(),
    validade: calcularExpiracao(body.dias ?? DIAS_PADRAO_LICENCA),
    precoCentavosBasico: body.precoCentavosBasico,
    precoCentavosPro: body.precoCentavosPro,
    precoCentavosMinimo: body.precoCentavosMinimo,
    email
  }
  gravarRevendedor(revendedor)
  return c.json({ revendedor })
})

// Define (ou redefine) a senha do painel do revendedor. A PRIMEIRA senha sai
// daqui, da mão da FHVP — não existe autocadastro. Redefinir também serve de
// socorro para quem esqueceu, e derruba as sessões abertas junto: senha nova
// com sessão velha de pé não expulsa ninguém.
app.post('/admin/revendedor/:revendedorId/senha', async (c) => {
  const revendedor = obterRevendedor(c.req.param('revendedorId'))
  if (!revendedor) return c.json({ erro: 'revendedor não encontrado' }, 404)
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { senha?: string }
  const senha = body.senha ?? ''
  const ok = senhaAceitavel(senha)
  if (!ok.ok) return c.json({ erro: ok.erro }, 400)

  gravarRevendedor({ ...revendedor, senhaHash: await gerarHashSenha(senha) })
  return c.json({ ok: true, sessoesDerrubadas: apagarSessoesDoRevendedor(revendedor.revendedorId) })
})

// E-mail do revendedor: é para onde vai o código quando ele esquece a senha.
// Sem e-mail cadastrado, recuperar só por telefonema para a FHVP.
app.post('/admin/revendedor/:revendedorId/email', async (c) => {
  const revendedor = obterRevendedor(c.req.param('revendedorId'))
  if (!revendedor) return c.json({ erro: 'revendedor não encontrado' }, 404)
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { email?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!emailAceitavel(email)) return c.json({ erro: 'e-mail inválido' }, 400)

  gravarRevendedor({ ...revendedor, email })
  const sessoesDerrubadas = apagarSessoesDoRevendedor(revendedor.revendedorId)
  return c.json({ ok: true, sessoesDerrubadas })
})

// Ajusta os preços de atacado do revendedor. `precoCentavosMinimo` é o piso da
// mensalidade dele — sem ele, quem chega a zero clientes ativos não consegue
// gerar cobrança nenhuma e fica impedido de voltar por estar parado.
app.post('/admin/revendedor/:revendedorId/precos', async (c) => {
  const revendedor = obterRevendedor(c.req.param('revendedorId'))
  if (!revendedor) return c.json({ erro: 'revendedor não encontrado' }, 404)
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as {
    precoCentavosBasico?: number | null
    precoCentavosPro?: number | null
    precoCentavosMinimo?: number | null
  }
  // Só mexe no que veio: `undefined` mantém o valor atual, `null` apaga.
  const ajustar = (atual: number | undefined, novo: number | null | undefined) =>
    novo === undefined ? atual : typeof novo === 'number' && novo > 0 ? novo : undefined
  const atualizado: Revendedor = {
    ...revendedor,
    precoCentavosBasico: ajustar(revendedor.precoCentavosBasico, body.precoCentavosBasico),
    precoCentavosPro: ajustar(revendedor.precoCentavosPro, body.precoCentavosPro),
    precoCentavosMinimo: ajustar(revendedor.precoCentavosMinimo, body.precoCentavosMinimo)
  }
  gravarRevendedor(atualizado)
  return c.json({
    ok: true,
    precoCentavosBasico: atualizado.precoCentavosBasico ?? null,
    precoCentavosPro: atualizado.precoCentavosPro ?? null,
    precoCentavosMinimo: atualizado.precoCentavosMinimo ?? null
  })
})

// Estende a coleira do revendedor. É o que o PIX dele vai chamar depois.
app.post('/admin/revendedor/:revendedorId/validade', async (c) => {
  const revendedor = obterRevendedor(c.req.param('revendedorId'))
  if (!revendedor) return c.json({ erro: 'revendedor não encontrado' }, 404)
  const body = await c.req.json<{ dias?: number }>().catch(() => ({ dias: undefined }))
  const validade = somarDiasNaExpiracao(revendedor.validade, body.dias ?? DIAS_PADRAO_LICENCA)
  gravarRevendedor({ ...revendedor, validade })
  // Repare que estender validade NÃO desbloqueia: são chaves separadas.
  return c.json({ ok: true, validade, bloqueado: !!revendedor.bloqueado })
})

// Estrangular: tira o painel dele, NÃO derruba as lojas. A carteira murcha
// sozinha no ritmo do ciclo (~30 dias), o que dá um mês de negociação em vez de
// trinta lojistas furiosos num sábado — e o nome na tela deles é o da FHVP.
app.post('/admin/revendedor/:revendedorId/bloqueio', async (c) => {
  const revendedor = obterRevendedor(c.req.param('revendedorId'))
  if (!revendedor) return c.json({ erro: 'revendedor não encontrado' }, 404)
  const body = await c.req.json<{ bloquear: boolean; motivo?: string }>()
  gravarRevendedor({
    ...revendedor,
    bloqueado: body.bloquear,
    motivoBloqueio: body.bloquear ? body.motivo : undefined
  })
  // Derruba as sessões abertas dele NA HORA. Sem isto, o bloqueio só valeria
  // quando a sessão vencesse (até 12h) — e quem acabou de ser bloqueado é
  // exatamente quem não vai deslogar por educação. É por causa desta linha que
  // a sessão é opaca em banco, e não um JWT auto-contido.
  const sessoesDerrubadas = body.bloquear
    ? apagarSessoesDoRevendedor(revendedor.revendedorId)
    : 0
  const clientes = listarClientesDoRevendedor(revendedor.revendedorId)
  return c.json({
    ok: true,
    bloqueado: body.bloquear,
    sessoesDerrubadas,
    // Deixa explícito que as lojas continuam de pé, pra ninguém achar que
    // cascateou e ir dormir tranquilo achando que cortou.
    lojasIntactas: clientes.length,
    aviso: body.bloquear
      ? 'as lojas dele seguem válidas até a data de cada uma; use /cortar para derrubar'
      : undefined
  })
})

// O botão nuclear, SEPARADO de propósito: derruba as lojas dele agora. É para
// fraude, não para atraso. Exige confirmar o id no corpo — um POST disparado
// sem querer não pode desligar o caixa de trinta lojas.
app.post('/admin/revendedor/:revendedorId/cortar', async (c) => {
  const id = c.req.param('revendedorId')
  const revendedor = obterRevendedor(id)
  if (!revendedor) return c.json({ erro: 'revendedor não encontrado' }, 404)
  const body = await c.req.json<{ confirmarId: string; motivo?: string }>()
  if (body.confirmarId !== revendedor.revendedorId) {
    return c.json({ erro: 'confirmarId não confere — corte não executado' }, 400)
  }
  const clientes = listarClientesDoRevendedor(revendedor.revendedorId)
  for (const cl of clientes) {
    gravarCliente({ ...cl, bloqueadoPor: 'fhvp', motivoBloqueio: body.motivo })
  }
  gravarRevendedor({ ...revendedor, bloqueado: true, motivoBloqueio: body.motivo })
  return c.json({ ok: true, lojasBloqueadas: clientes.length })
})

// Atualiza o preço de renovação de um cliente existente. Manda
// `valorCentavos: null` (ou omite) pra remover o preço fixo e voltar ao default.
app.post('/admin/cliente/:clienteId/preco', async (c) => {
  const clienteId = c.req.param('clienteId')
  const body = await c.req.json<{ valorCentavos?: number | null }>()
  const cliente = obterCliente(clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const novoValor =
    typeof body.valorCentavos === 'number' && body.valorCentavos > 0
      ? body.valorCentavos
      : undefined
  const atualizado: Cliente = { ...cliente, valorCentavosRenovacao: novoValor }
  gravarCliente(atualizado)
  return c.json({ ok: true, cliente: atualizado })
})

// Atalho de dev: simula o webhook do EfiPay marcando uma cobrança como paga.
app.post('/admin/marcar-pago', async (c) => {
  const { txid } = await c.req.json<{ txid: string }>()
  if (!txid) return c.json({ erro: 'txid obrigatório' }, 400)
  const resultado = await confirmarPagamento(txid)
  if (!resultado.ok) return c.json({ erro: resultado.mensagem }, 400)
  return c.json({ ok: true, chave: resultado.chave, cobranca: resultado.cobranca })
})

// ───── Chatbot (proxy autenticado pra Claude API) ─────────────────────
// licencaAtiva vive em licencaGuard.ts (compartilhado com as rotas fiscais).

// Proteção de custo do assistente: ORÇAMENTO MENSAL DE GASTO por loja, medido em
// microdólares (1 µ$ = US$0,000001) a partir do gasto real de cada chamada que a
// própria API reporta. Conta TODA chamada — inclusive as rodadas de ferramenta —,
// então, diferente de contar "perguntas", não dá pra burlar dizendo que uma
// chamada não conta. O limite é teto de GASTO, não de quantidade.
//
// ≈ R$5/mês por loja, supondo ~R$5,50/US$ → ~US$0,91 → 910.000 µ$.
// (Era R$30; reduzido em 2026-07-17 — teto igual nos planos Básico e Pro por ora.)
// Ajuste este número se o câmbio mudar ou se quiser outro teto.
const LIMITE_CUSTO_MICRO_MES = 910_000

// Trava de tamanho do prompt: corta de cara um payload absurdo (ex.: colar
// centenas de KB) ANTES de gastar qualquer token. ~200 KB ≈ 50k tokens — folgado
// pro uso normal, já que as ferramentas devolvem resumos pequenos.
const MAX_CHARS_MENSAGENS = 200_000

// Custo em microdólares de uma chamada, pelos preços do Haiku 4.5 (o modelo
// fixado em chat.ts): input US$1/M, output US$5/M, escrita de cache US$1,25/M,
// leitura de cache US$0,10/M. Como US$1/M = 1 µ$ por token, o preço por milhão
// vira o peso por token. A saída (5×) é a parte cara; cache lido (0,1×) é barato.
function custoMicrodolaresChat(u: {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}): number {
  return Math.round(
    (u.input_tokens ?? 0) * 1 +
      (u.output_tokens ?? 0) * 5 +
      (u.cache_creation_input_tokens ?? 0) * 1.25 +
      (u.cache_read_input_tokens ?? 0) * 0.1
  )
}

// O app monta system+tools+messages (executa as tools no SQLite local) e manda
// pra cá só pra adicionar a API key e chamar a Anthropic. Ver chat.ts.
app.post('/chat', async (c) => {
  const body = await c.req.json<{ clienteId: string } & ChatRequest>()
  if (!body.clienteId) return c.json({ erro: 'clienteId obrigatório' }, 400)

  const cliente = obterCliente(body.clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)
  if (!licencaAtiva(cliente)) return c.json({ erro: 'licença inativa' }, 403)

  // 1) Trava de tamanho — barra prompts gigantes antes de chamar a API.
  if (JSON.stringify(body.messages ?? '').length > MAX_CHARS_MENSAGENS) {
    return c.json(
      { erro: 'Sua mensagem ficou grande demais para o assistente. Resuma e tente de novo.' },
      413
    )
  }

  // 2) Orçamento de gasto do mês já estourado? Barra antes de gastar mais.
  if (custoMicroChatMes(body.clienteId) >= LIMITE_CUSTO_MICRO_MES) {
    return c.json(
      {
        erro:
          'O assistente atingiu o limite de uso deste mês desta loja. O limite reseta no início do mês. ' +
          'Para um teto maior, fale com o suporte sobre um upgrade do plano — ' +
          'botão "Suporte" na barra lateral ou no WhatsApp (85) 9.2187-1975.'
      },
      429
    )
  }

  const r = await proxyChat({
    system: body.system,
    tools: body.tools,
    messages: body.messages,
    max_tokens: body.max_tokens
  })
  if (!r.ok) return c.json({ erro: r.erro }, r.status as 400)

  // 3) Contabiliza o gasto REAL desta chamada (a API reporta no usage).
  registrarCustoChat(body.clienteId, custoMicrodolaresChat(r.message.usage))

  return c.json(r.message)
})

// ───── Recuperação de acesso (envia código de PIN por email) ──────────
// O app gera o código de 6 dígitos, guarda o HASH localmente e manda o código
// pra cá só pra enviar por email. Este endpoint NÃO guarda nem valida o código
// (isso é local, no app) — é um relay fino, gateado por licença + rate-limit.
const LIMITE_RECUPERACAO_HORA = 3
const MINUTOS_VALIDADE_CODIGO = 15

app.post('/recuperacao/enviar', async (c) => {
  const body = await c.req.json<{
    clienteId: string
    para: string
    codigo: string
    nome?: string
  }>()

  if (!body.clienteId || !body.para || !body.codigo) {
    return c.json({ erro: 'clienteId, para e codigo são obrigatórios' }, 400)
  }

  const cliente = obterCliente(body.clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)
  if (!licencaAtiva(cliente)) return c.json({ erro: 'licença inativa' }, 403)

  const email = body.para.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ erro: 'email inválido' }, 400)
  }
  // O corpo do email só aceita um código de 6 dígitos — trava o endpoint como
  // canal de texto arbitrário (anti-abuso) além do escape de HTML no nome.
  if (!/^\d{6}$/.test(body.codigo)) {
    return c.json({ erro: 'codigo deve ter 6 dígitos' }, 400)
  }

  const uso = registrarEnvioRecuperacao(email, LIMITE_RECUPERACAO_HORA)
  if (!uso.permitido) {
    return c.json(
      { erro: 'Muitas solicitações. Aguarde alguns minutos antes de pedir um novo código.' },
      429
    )
  }

  const r = await enviarCodigoRecuperacao({
    para: email,
    codigo: body.codigo,
    nome: body.nome,
    minutosValidade: MINUTOS_VALIDADE_CODIGO
  })
  if (!r.ok) return c.json({ erro: r.erro }, r.status as 400)
  return c.json({ ok: true })
})

// ───── App ───────────────────────────────────────────────────────────
app.post('/cobranca', async (c) => {
  const body = await c.req.json<{
    clienteId: string
    diasContratados?: number
    valorCentavos?: number
  }>()
  if (!body.clienteId) return c.json({ erro: 'clienteId obrigatório' }, 400)

  const cliente = obterCliente(body.clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  // 1º dos dois portões do bloqueio: não gera nem o QR. O 2º está no
  // confirmarPagamento — os dois existem porque há uma corrida no meio (QR
  // gerado às 14h, bloqueio às 15h, pagamento às 16h atravessaria só este).
  // Recusar ANTES é o certo: melhor não receber do que receber e não entregar.
  if (clienteBloqueado(cliente)) {
    return c.json(
      { erro: 'renovação bloqueada — procure quem lhe vendeu o sistema', bloqueado: true },
      403
    )
  }

  // ★ Loja de REVENDEDOR não paga a FHVP: quem cobra ela é o revendedor.
  // Esta rota manda o PIX para a conta da FHVP, então deixá-la aberta desviaria
  // o dinheiro do revendedor — e ainda furava o teto de validade dele, porque
  // o pagamento estende a licença sem consultar ninguém.
  //
  // ⚠️ A condição é a PRESENÇA de `revendedorId`. Cliente direto da FHVP não
  // tem esse campo (nenhum dos que já estão em produção tem), então para eles
  // nada muda — esta rota segue exatamente como sempre foi.
  if (cliente.revendedorId) {
    return c.json(
      {
        erro: 'Sua renovação é feita por quem lhe vendeu o sistema. Procure seu revendedor.',
        viaRevendedor: true
      },
      403
    )
  }

  const diasContratados = body.diasContratados ?? DIAS_PADRAO_LICENCA
  // Preço fixo do cliente (cadastrado por admin) sobrescreve o que o app
  // manda. Permite cobrar valores diferentes por cliente sem release do app.
  const valorCentavos =
    cliente.valorCentavosRenovacao ?? body.valorCentavos ?? 10000

  const pix = await criarCobrancaPIX(valorCentavos)
  const cobranca: Cobranca = {
    txid: pix.txid,
    clienteId: cliente.clienteId,
    valorCentavos,
    diasContratados,
    status: 'pendente',
    qrcode: pix.qrcode,
    qrcodeBase64: pix.qrcodeBase64,
    criadaEm: new Date().toISOString(),
    expiraEm: pix.expiraEm
  }
  gravarCobranca(cobranca)
  return c.json(cobranca)
})

app.get('/cobranca/:txid', async (c) => {
  const txid = c.req.param('txid')
  const cobranca = obterCobranca(txid)
  if (!cobranca) return c.json({ erro: 'cobrança não encontrada' }, 404)

  // Se ainda pendente em modo EfiPay real, consulta status atual na API.
  // Mais simples que webhook (não precisa mTLS de recebimento no nosso backend),
  // e o frontend já está pollando aqui mesmo a cada poucos segundos.
  if (cobranca.status === 'pendente' && !usaMock) {
    try {
      const efi = await import('./efipay.ts')
      const status = await efi.consultarCobrancaPIX(txid)
      if (status.paga) {
        const r = await confirmarPagamento(txid)
        if (r.ok) return c.json(r.cobranca)
      }
    } catch (e) {
      // Falha de rede com EfiPay não bloqueia a resposta — frontend tenta de novo
      // no próximo poll. Mantém o status local atual.
      console.error('Falha ao consultar EfiPay:', (e as Error).message)
    }
  }

  return c.json(cobranca)
})

// Webhook que o EfiPay chama quando o pagamento cair.
// SEGURANÇA: NUNCA geramos licença confiando no corpo da requisição. Como este
// endpoint é público, confiar no payload deixaria qualquer um ativar licença de
// graça mandando um txid pendente. A confirmação principal é o polling do passo
// 3 (GET /cobranca/:txid). Aqui, se vier algum txid no corpo, só confirmamos
// DEPOIS de checar o status direto na EfiPay (a verdade vem dela). Na prática a
// EfiPay é configurada com ignorar-payload=true (ver configurarWebhook), então o
// corpo chega vazio e só devolvemos 200 pra completar o handshake da notificação.
app.post('/webhook/efi', async (c) => {
  // Em modo mock (dev) não há EfiPay pra consultar: testes usam /admin/marcar-pago.
  if (usaMock) return c.json({ ok: true })

  let eventos: Array<{ txid: string }> = []
  try {
    const body = await c.req.json<{ pix?: Array<{ txid: string }> }>()
    eventos = body.pix ?? []
  } catch {
    eventos = [] // corpo vazio/inválido (esperado com ignorar-payload=true)
  }

  const efi = await import('./efipay.ts')
  const resultados: Array<{ txid: string; ok: boolean; erro?: string }> = []
  for (const evt of eventos) {
    try {
      const status = await efi.consultarCobrancaPIX(evt.txid)
      if (!status.paga) {
        resultados.push({ txid: evt.txid, ok: false, erro: 'pagamento não confirmado na EfiPay' })
        continue
      }
      const r = await confirmarPagamento(evt.txid)
      resultados.push({ txid: evt.txid, ok: r.ok, erro: r.ok ? undefined : r.mensagem })
    } catch (e) {
      resultados.push({ txid: evt.txid, ok: false, erro: (e as Error).message })
    }
  }
  return c.json({ ok: true, recebidos: resultados.length, resultados })
})

// ───── Lógica compartilhada ─────────────────────────────────────────
// Idempotente: se a cobrança já estava paga, só devolve a chave existente.
type ResultadoPagamento =
  | { ok: true; cobranca: Cobranca; chave: string }
  | { ok: false; mensagem: string }

/**
 * Pagamento do REVENDEDOR à FHVP — a seta de baixo do ciclo.
 *
 * Diferente do cliente, aqui não sai chave nenhuma: o que ele compra é o
 * direito de continuar operando o painel, e isso é a `validade` dele. É essa
 * data que serve de TETO para tudo que ele emite, então estendê-la é
 * literalmente o que devolve a capacidade de trabalhar.
 *
 * ⚠️ Pagar NÃO desbloqueia. Bloqueio e validade são chaves separadas: o
 * dinheiro entra e conta, mas quem foi bloqueado pela FHVP continua bloqueado
 * até ela destravar. Sem isso, R$100 desfariam qualquer decisão sua.
 */
async function confirmarPagamentoRevendedor(cobranca: Cobranca): Promise<ResultadoPagamento> {
  const revendedor = obterRevendedor(cobranca.clienteId)
  if (!revendedor) return { ok: false, mensagem: 'revendedor não encontrado' }

  const validade = somarDiasNaExpiracao(revendedor.validade, cobranca.diasContratados)
  const agora = new Date().toISOString()
  gravarRevendedor({ ...revendedor, validade })
  // `chaveLicencaGerada` fica com um marcador, não com uma chave: é o que faz a
  // idempotência lá em cima reconhecer a cobrança já processada e não somar
  // dias duas vezes se o webhook repetir.
  const paga: Cobranca = {
    ...cobranca,
    status: 'paga',
    pagaEm: agora,
    chaveLicencaGerada: `revendedor:${revendedor.revendedorId}:${validade}`
  }
  gravarCobranca(paga)

  if (revendedor.bloqueado) {
    return {
      ok: false,
      mensagem: 'pagamento recebido e validade estendida, mas a conta segue bloqueada — fale com a FHVP Tech'
    }
  }
  return { ok: true, cobranca: paga, chave: paga.chaveLicencaGerada as string }
}

async function confirmarPagamento(txid: string): Promise<ResultadoPagamento> {
  const cobranca = obterCobranca(txid)
  if (!cobranca) return { ok: false, mensagem: 'cobrança não encontrada' }

  if (cobranca.status === 'paga' && cobranca.chaveLicencaGerada) {
    return { ok: true, cobranca, chave: cobranca.chaveLicencaGerada }
  }
  if (cobranca.status === 'expirada') {
    return { ok: false, mensagem: 'cobrança expirada' }
  }

  // Cobrança de REVENDEDOR renova a assinatura do painel dele, não a licença de
  // uma loja. `alvo` ausente = cobrança de cliente, que é o que TODA cobrança
  // gravada antes desta mudança é — inclusive as em voo no momento do deploy.
  if (cobranca.alvo === 'revendedor') return confirmarPagamentoRevendedor(cobranca)

  const cliente = obterCliente(cobranca.clienteId)
  if (!cliente) return { ok: false, mensagem: 'cliente não encontrado' }

  // 2º portão do bloqueio, e o que dá o desenho certo: o dinheiro CONTA (a
  // validade é estendida, ninguém fica com pagamento sem contrapartida), mas a
  // CHAVE não sai. Bloqueio e validade são coisas separadas: emitir exige as
  // duas, estar em dia E não estar bloqueado. Sem isto, quem foi bloqueado paga
  // o PIX de sempre e se restaura sozinho — o botão de bloquear não valeria
  // nada contra alguém com R$100 e a chave PIX.
  const pedida = somarDiasNaExpiracao(cliente.validadeAtual, cobranca.diasContratados)

  // ★ O TETO também vale aqui. `/cobranca` já recusa loja de revendedor, então
  // esta é a segunda camada — cobre a corrida em que a cobrança foi criada
  // ANTES daquela trava existir e só é paga depois. Sem ela, um pagamento
  // antigo ainda furaria a validade do revendedor.
  //
  // ⚠️ Cliente direto (sem `revendedorId`) passa por `limitarAoTeto` com
  // revendedor `null`, que devolve a data pedida intacta. Nada muda para quem
  // já está em produção.
  const revendedorDoCliente = cliente.revendedorId ? obterRevendedor(cliente.revendedorId) : null
  const teto = limitarAoTeto(pedida, revendedorDoCliente)
  if (!teto.ok) return { ok: false, mensagem: teto.erro }
  const novaExpiracao = teto.expiracao
  const agora0 = new Date().toISOString()
  if (clienteBloqueado(cliente)) {
    gravarCobranca({ ...cobranca, status: 'paga', pagaEm: agora0 })
    gravarCliente({ ...cliente, validadeAtual: novaExpiracao, ultimoPagamentoEm: agora0 })
    return {
      ok: false,
      mensagem: 'pagamento recebido, mas a renovação está bloqueada — procure o suporte'
    }
  }

  const chave = await gerarChaveLicenca(config.CHAVE_HMAC, cliente.clienteId, novaExpiracao)

  const agora = new Date().toISOString()
  const cobrancaPaga: Cobranca = {
    ...cobranca,
    status: 'paga',
    pagaEm: agora,
    chaveLicencaGerada: chave
  }
  const clienteAtualizado: Cliente = {
    ...cliente,
    validadeAtual: novaExpiracao,
    ultimoPagamentoEm: agora
  }
  gravarCobranca(cobrancaPaga)
  gravarCliente(clienteAtualizado)

  return { ok: true, cobranca: cobrancaPaga, chave }
}

/**
 * Porta do servidor local.
 *
 * ⚠️ NAO voltar para 8080. Esta maquina roda outros projetos, e o 8080 e de
 * um deles (o site do Kiko Pescados, publicado por tunel do Cloudflare).
 * Subir aqui na 8080 nao da erro de porta ocupada: o outro app ouve em IPv4
 * e este acaba em IPv6, os dois no ar ao mesmo tempo. O tunel resolve
 * `localhost` preferindo IPv6 e passa a entregar ESTE backend aos visitantes
 * do site do outro projeto. Ja aconteceu duas vezes, em 2026-09-03.
 *
 * Em producao quem manda e o `PORT` do fly.toml, que existe justamente para
 * o Fly nao depender do padrao daqui.
 */
const PORTA_PADRAO_LOCAL = 4899
const porta = Number(process.env.PORT ?? PORTA_PADRAO_LOCAL)
serve({ fetch: app.fetch, port: porta }, (info) => {
  console.log(`licenca API ouvindo em http://0.0.0.0:${info.port}`)
})
