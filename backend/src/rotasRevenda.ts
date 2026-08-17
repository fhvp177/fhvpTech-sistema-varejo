// Rotas do painel do revendedor (`/revenda/*`).
//
// Em arquivo próprio pelo mesmo motivo do rotasFiscais.ts e do relay.ts: o
// index.ts já é o funil de tudo e não precisa crescer mais.
//
// ── A diferença entre estas rotas e as /admin ───────────────────────────────
// `/admin/*` responde ao ADMIN_TOKEN, que é a chave de Deus da FHVP: enxerga
// todo mundo. `/revenda/*` responde a uma sessão de revendedor e enxerga
// EXCLUSIVAMENTE a carteira dele. Nenhuma rota daqui aceita o ADMIN_TOKEN, e
// nenhuma rota daqui escreve na tabela `revendedores` — a validade do
// revendedor (o teto de tudo que ele emite) só muda pela mão da FHVP ou pelo
// pagamento. Ele não tem caminho para levantar o próprio teto.

import { Hono } from 'hono'
import type { Cliente, Cobranca } from './tipos.ts'
import {
  obterCliente,
  gravarCliente,
  obterCobranca,
  gravarCobranca,
  obterRevendedor,
  gravarRevendedor,
  listarClientesDoRevendedor,
  gravarSessaoRevenda,
  obterSessaoRevenda,
  apagarSessaoRevenda,
  apagarSessoesDoRevendedor,
  limparSessoesVencidas,
  tentativasDeLogin,
  registrarTentativaDeLogin,
  zerarTentativasDeLogin,
  gravarPedidoRecuperacao,
  obterPedidoRecuperacao,
  apagarPedidoRecuperacao,
  registrarChuteNoCodigo,
  pedidosDeRecuperacao,
  registrarPedidoDeRecuperacao
} from './db.ts'
import {
  conferirSenha,
  gerarHashSenha,
  senhaAceitavel,
  montarSessao,
  sessaoExpirada,
  hashToken,
  tokenDoCabecalho,
  passouDoLimiteDeTentativas,
  clienteEhDoRevendedor,
  gerarCodigoRecuperacao,
  codigoExpirado,
  codigoQueimado,
  emailAceitavel,
  MINUTOS_CODIGO_RECUPERACAO,
  MAX_PEDIDOS_RECUPERACAO_POR_HORA
} from './revendaAuth.ts'
import { enviarCodigoRecuperacao } from './email.ts'
import {
  limitarAoTeto,
  montarClienteId,
  idValido,
  podeEmitir,
  podeDesbloquear,
  estadoRevendedor,
  clienteBloqueado,
  DIAS_PADRAO_LICENCA,
  type Revendedor
} from './revenda.ts'
import { calcularExpiracao, somarDiasNaExpiracao, gerarChaveLicenca } from './licenca.ts'
import { licencaAtiva } from './licencaGuard.ts'

const horaAtual = () => new Date().toISOString().slice(0, 13) // AAAA-MM-DDTHH

/** Nunca devolver o hash da senha numa resposta. */
function revendedorPublico(r: Revendedor) {
  return {
    revendedorId: r.revendedorId,
    nome: r.nome,
    contato: r.contato,
    validade: r.validade,
    estado: estadoRevendedor(r),
    precoCentavosBasico: r.precoCentavosBasico,
    precoCentavosPro: r.precoCentavosPro
  }
}

function clientePublico(c: Cliente) {
  return {
    clienteId: c.clienteId,
    nome: c.nome,
    contato: c.contato,
    plano: c.plano ?? 'basico',
    validadeAtual: c.validadeAtual,
    ativo: licencaAtiva(c) && !clienteBloqueado(c),
    bloqueadoPor: c.bloqueadoPor,
    motivoBloqueio: c.motivoBloqueio,
    criadoEm: c.criadoEm
  }
}

/** O que a portaria deixa disponível para os handlers de dentro. */
type VariaveisRevenda = { revendedor: Revendedor; tokenHash: string }

/** Corpo JSON tolerante: pedido sem corpo, ou com corpo inválido, vira objeto
 *  vazio em vez de 500. Cada rota confere o que precisa. */
async function corpo<T>(c: { req: { json: () => Promise<unknown> } }): Promise<Partial<T>> {
  return ((await c.req.json().catch(() => ({}))) ?? {}) as Partial<T>
}

/** O criador de cobrança PIX entra por parâmetro porque o index.ts decide em
 *  tempo de boot entre o mock e a EfiPay real, conforme haja credencial. */
type CriarCobrancaPIX = (valorCentavos: number) => Promise<{
  txid: string; qrcode: string; qrcodeBase64: string; expiraEm: string
}>

export function registrarRotasRevenda(
  app: Hono,
  chaveHmac: string,
  criarCobrancaPIX: CriarCobrancaPIX
): void {
  const revenda = new Hono<{ Variables: VariaveisRevenda }>()

  // ───── Login ────────────────────────────────────────────────────────────
  revenda.post('/login', async (c) => {
    const body = await corpo<{ revendedorId: string; senha: string }>(c)
    const id = (body.revendedorId ?? '').trim().toUpperCase()
    const senha = body.senha ?? ''
    if (!id || !senha) return c.json({ erro: 'revendedorId e senha são obrigatórios' }, 400)

    const hora = horaAtual()
    if (passouDoLimiteDeTentativas(tentativasDeLogin(id, hora))) {
      return c.json({ erro: 'muitas tentativas — tente novamente na próxima hora' }, 429)
    }
    registrarTentativaDeLogin(id, hora)

    const revendedor = obterRevendedor(id)
    // Recusa IDÊNTICA para "não existe", "sem senha definida" e "senha errada".
    // Mensagens diferentes contariam a um estranho quais ids existem.
    const senhaConfere = await conferirSenha(senha, revendedor?.senhaHash)
    if (!revendedor || !senhaConfere) {
      return c.json({ erro: 'credenciais inválidas' }, 401)
    }

    limparSessoesVencidas()
    zerarTentativasDeLogin(id, hora)

    const { token, sessao } = montarSessao(revendedor.revendedorId)
    gravarSessaoRevenda(sessao)
    // O estado vai junto MESMO quando bloqueado: ele entra, vê a carteira em
    // modo leitura e lê o motivo. Porta fechada sem explicação vira ligação
    // para a FHVP — e a marca na tela do lojista dele é a da FHVP.
    return c.json({
      token,
      expiraEm: sessao.expiraEm,
      revendedor: revendedorPublico(revendedor)
    })
  })

  // ───── Recuperação de senha ─────────────────────────────────────────────
  // Fica ANTES da portaria e fora dela: quem esqueceu a senha, por definição,
  // não consegue se autenticar.
  //
  // ⚠️ As duas rotas respondem a MESMA coisa para conta que existe e para
  // conta que não existe. Um "revendedor não encontrado" aqui transformaria
  // este endpoint num verificador de quais códigos de revendedor são reais.
  revenda.post('/recuperacao/pedir', async (c) => {
    const body = await corpo<{ revendedorId: string }>(c)
    const id = (body.revendedorId ?? '').trim().toUpperCase()
    // Resposta única, montada uma vez e devolvida em todos os caminhos.
    const generica = {
      ok: true,
      mensagem:
        'Se este código de revendedor existir e tiver e-mail cadastrado, enviamos um código de 6 dígitos. Confira sua caixa de entrada.'
    }
    if (!id) return c.json(generica)

    const hora = horaAtual()
    if (pedidosDeRecuperacao(id, hora) >= MAX_PEDIDOS_RECUPERACAO_POR_HORA) {
      // Também genérica: contar o limite revelaria que a conta existe.
      return c.json(generica)
    }
    registrarPedidoDeRecuperacao(id, hora)

    const revendedor = obterRevendedor(id)
    if (!revendedor || !revendedor.email || !emailAceitavel(revendedor.email)) {
      return c.json(generica)
    }

    const codigo = gerarCodigoRecuperacao()
    gravarPedidoRecuperacao({
      revendedorId: id,
      codigoHash: await gerarHashSenha(codigo),
      expiraEm: new Date(Date.now() + MINUTOS_CODIGO_RECUPERACAO * 60_000).toISOString(),
      chutes: 0
    })
    // Falha de envio também devolve a resposta genérica: o erro fica no log do
    // servidor, não na tela de quem talvez nem seja o dono da conta.
    const envio = await enviarCodigoRecuperacao({
      para: revendedor.email,
      codigo,
      nome: revendedor.nome,
      minutosValidade: MINUTOS_CODIGO_RECUPERACAO
    })
    if (!envio.ok) console.error('[revenda] falha ao enviar código:', envio.erro)
    return c.json(generica)
  })

  revenda.post('/recuperacao/redefinir', async (c) => {
    const body = await corpo<{ revendedorId: string; codigo: string; nova: string }>(c)
    const id = (body.revendedorId ?? '').trim().toUpperCase()
    const codigo = (body.codigo ?? '').trim()
    const recusa = { erro: 'Código inválido ou expirado. Peça um novo.' }

    // A senha nova é conferida ANTES do código: senha fraca não deve consumir
    // um chute nem queimar o código de quem digitou certo.
    const forca = senhaAceitavel(body.nova ?? '')
    if (!forca.ok) return c.json({ erro: forca.erro }, 400)

    const pedido = id ? obterPedidoRecuperacao(id) : null
    if (!pedido || codigoExpirado(pedido) || codigoQueimado(pedido)) {
      if (pedido) apagarPedidoRecuperacao(id)
      return c.json(recusa, 400)
    }

    // Conta o chute ANTES de comparar. Se contasse depois, um script que
    // derruba a conexão a cada tentativa nunca gastaria chute nenhum.
    registrarChuteNoCodigo(id)
    if (!(await conferirSenha(codigo, pedido.codigoHash))) return c.json(recusa, 400)

    const revendedor = obterRevendedor(id)
    if (!revendedor) return c.json(recusa, 400)

    gravarRevendedor({ ...revendedor, senhaHash: await gerarHashSenha(body.nova as string) })
    apagarPedidoRecuperacao(id)
    // Quem redefine senha pode estar expulsando um invasor — todas as sessões
    // abertas caem junto, senão o invasor continuaria dentro.
    const sessoesDerrubadas = apagarSessoesDoRevendedor(id)
    // Zera o contador de login: quem acabou de provar que é o dono não pode
    // ficar travado por tentativas antigas.
    zerarTentativasDeLogin(id, horaAtual())
    return c.json({ ok: true, sessoesDerrubadas })
  })

  // ───── Portaria de tudo que vem depois ──────────────────────────────────
  revenda.use('*', async (c, next) => {
    // Conferido pelo caminho completo, e não pela ordem de registro: assim
    // reordenar as rotas neste arquivo não abre a portaria sem querer.
    const livres = ['/revenda/login', '/revenda/recuperacao/pedir', '/revenda/recuperacao/redefinir']
    if (livres.includes(c.req.path)) return next()

    const token = tokenDoCabecalho(c.req.header('authorization'))
    if (!token) return c.json({ erro: 'não autenticado' }, 401)

    const sessao = obterSessaoRevenda(hashToken(token))
    if (!sessao || sessaoExpirada(sessao)) {
      if (sessao) apagarSessaoRevenda(sessao.tokenHash)
      // "inválida OU expirada" numa frase só, de propósito: separar as duas
      // contaria a um estranho que aquele token já existiu. E, do lado de cá,
      // quem acabou de ser bloqueado cai aqui — dizer só "expirada" o faria
      // culpar o tempo e ligar para o suporte perguntando de sessão.
      return c.json({ erro: 'sessão inválida ou expirada — entre novamente' }, 401)
    }
    const revendedor = obterRevendedor(sessao.revendedorId)
    if (!revendedor) {
      apagarSessaoRevenda(sessao.tokenHash)
      return c.json({ erro: 'revendedor não existe mais' }, 401)
    }
    c.set('revendedor', revendedor)
    c.set('tokenHash', sessao.tokenHash)
    await next()
  })

  /**
   * Guarda das rotas que MUDAM alguma coisa.
   *
   * Ler é sempre liberado — inclusive bloqueado, de propósito. Escrever exige
   * estar em dia e destravado. É esta separação que faz "estrangular" ser
   * humano: ele enxerga a carteira e entende o que houve, mas não age.
   */
  function bloqueioDeEscrita(r: Revendedor): { erro: string; estado: string } | null {
    if (podeEmitir(r)) return null
    const estado = estadoRevendedor(r)
    // Frase por estado, e não o nome do estado colado numa string: "sua conta
    // está bloqueado" erra a concordância, e o revendedor lê isso na tela.
    const frase =
      estado === 'bloqueado'
        ? 'sua conta está bloqueada — fale com a FHVP Tech'
        : 'sua assinatura está vencida — renove para voltar a cadastrar e renovar clientes'
    return { erro: frase, estado }
  }

  // ───── Leitura ──────────────────────────────────────────────────────────
  revenda.get('/eu', (c) => {
    const r = c.get('revendedor')
    const clientes = listarClientesDoRevendedor(r.revendedorId)
    const ativos = clientes.filter((cl) => licencaAtiva(cl) && !clienteBloqueado(cl))
    return c.json({
      revendedor: revendedorPublico(r),
      motivoBloqueio: r.bloqueado ? r.motivoBloqueio : undefined,
      podeEmitir: podeEmitir(r),
      // O painel usa isto para avisar quem está sem e-mail. Sem o aviso, ele
      // só descobre que não tem no dia em que esquece a senha — tarde demais.
      email: r.email ?? null,
      podeRecuperarSenha: !!r.email,
      resumo: {
        clientes: clientes.length,
        ativos: ativos.length,
        // Quebra por plano: é a base do que ele paga à FHVP, e mostrar aqui
        // evita a conversa de "mas eu tinha menos cliente que isso".
        ativosBasico: ativos.filter((cl) => (cl.plano ?? 'basico') === 'basico').length,
        ativosPro: ativos.filter((cl) => cl.plano === 'pro').length
      }
    })
  })

  revenda.get('/clientes', (c) => {
    const r = c.get('revendedor')
    return c.json({ clientes: listarClientesDoRevendedor(r.revendedorId).map(clientePublico) })
  })

  // ───── Escrita ──────────────────────────────────────────────────────────
  revenda.post('/cliente', async (c) => {
    const r = c.get('revendedor')
    const impedido = bloqueioDeEscrita(r)
    if (impedido) return c.json(impedido, 403)

    const body = await corpo<{ clienteId: string; nome: string; contato: string; plano: 'basico' | 'pro'; dias: number }>(c)
    if (!body.clienteId || !body.nome) {
      return c.json({ erro: 'clienteId e nome são obrigatórios' }, 400)
    }
    if (!idValido(body.clienteId)) {
      return c.json({ erro: 'clienteId deve ter 2-20 letras/números, sem hífen' }, 400)
    }

    // O id nasce prefixado com o revendedor da SESSÃO — nunca com um id vindo
    // do corpo. Aceitar o revendedorId do pedido deixaria ele cadastrar loja na
    // carteira de outro.
    const clienteId = montarClienteId(r.revendedorId, body.clienteId)
    if (obterCliente(clienteId)) return c.json({ erro: 'clienteId já existe' }, 409)

    const teto = limitarAoTeto(calcularExpiracao(body.dias ?? DIAS_PADRAO_LICENCA), r)
    if (!teto.ok) return c.json({ erro: teto.erro }, 400)

    const chave = await gerarChaveLicenca(chaveHmac, clienteId, teto.expiracao)
    const agora = new Date().toISOString()
    const cliente: Cliente = {
      clienteId,
      nome: body.nome,
      contato: body.contato,
      criadoEm: agora,
      validadeAtual: teto.expiracao,
      ultimoPagamentoEm: agora,
      revendedorId: r.revendedorId,
      plano: body.plano ?? 'basico'
    }
    gravarCliente(cliente)
    return c.json({
      cliente: clientePublico(cliente),
      chave,
      validadeCortadaNoTeto: teto.cortada
    })
  })

  revenda.post('/cliente/:clienteId/renovar', async (c) => {
    const r = c.get('revendedor')
    const impedido = bloqueioDeEscrita(r)
    if (impedido) return c.json(impedido, 403)

    const cliente = obterCliente(c.req.param('clienteId'))
    // 404 (e não 403) quando não é dele: confirmar que a loja existe já seria
    // contar coisa da carteira alheia.
    if (!cliente || !clienteEhDoRevendedor(cliente, r.revendedorId)) {
      return c.json({ erro: 'cliente não encontrado' }, 404)
    }
    if (clienteBloqueado(cliente)) {
      return c.json({ erro: `cliente bloqueado por ${cliente.bloqueadoPor}` }, 403)
    }

    const body = await corpo<{ dias: number }>(c)
    const teto = limitarAoTeto(
      somarDiasNaExpiracao(cliente.validadeAtual, body.dias ?? DIAS_PADRAO_LICENCA),
      r
    )
    if (!teto.ok) return c.json({ erro: teto.erro }, 400)

    const chave = await gerarChaveLicenca(chaveHmac, cliente.clienteId, teto.expiracao)
    gravarCliente({ ...cliente, validadeAtual: teto.expiracao })
    return c.json({ ok: true, chave, validade: teto.expiracao, validadeCortadaNoTeto: teto.cortada })
  })

  revenda.post('/cliente/:clienteId/bloqueio', async (c) => {
    const r = c.get('revendedor')
    const impedido = bloqueioDeEscrita(r)
    if (impedido) return c.json(impedido, 403)

    const cliente = obterCliente(c.req.param('clienteId'))
    if (!cliente || !clienteEhDoRevendedor(cliente, r.revendedorId)) {
      return c.json({ erro: 'cliente não encontrado' }, 404)
    }
    const body = await corpo<{ bloquear: boolean; motivo: string }>(c)
    if (typeof body.bloquear !== 'boolean') {
      return c.json({ erro: 'bloquear (true/false) é obrigatório' }, 400)
    }
    // Ele desfaz o que ele mesmo trancou; o que a FHVP trancou, não.
    if (!body.bloquear && !podeDesbloquear('revendedor', cliente.bloqueadoPor)) {
      return c.json({ erro: 'bloqueio posto pela FHVP Tech — fale com o suporte' }, 403)
    }
    gravarCliente({
      ...cliente,
      bloqueadoPor: body.bloquear ? 'revendedor' : undefined,
      motivoBloqueio: body.bloquear ? body.motivo : undefined
    })
    // Lembrete honesto na resposta: o bloqueio não apaga a licença que a loja
    // já tem na mão — ela vale offline até a data. O efeito é não renovar.
    return c.json({
      ok: true,
      bloqueado: body.bloquear,
      aviso: body.bloquear
        ? `a loja segue funcionando até ${cliente.validadeAtual}; o bloqueio impede a renovação`
        : undefined
    })
  })

  // ───── Pagamento da assinatura dele à FHVP ──────────────────────────────
  // A seta de baixo do ciclo: cliente paga o revendedor, revendedor paga a
  // FHVP. Cai na conta da FHVP, com as credenciais que já existem — nada de
  // multi-inquilino aqui.
  //
  // ⚠️ Estas duas rotas ficam de FORA do `bloqueioDeEscrita` de propósito.
  // São as únicas ações que precisam funcionar justamente quando todo o resto
  // está travado: um revendedor vencido tem que conseguir pagar para voltar, e
  // recusar o pagamento dele seria trancar a porta por dentro.
  revenda.post('/cobranca', async (c) => {
    const r = c.get('revendedor')
    const clientes = listarClientesDoRevendedor(r.revendedorId)
    const ativos = clientes.filter((cl) => licencaAtiva(cl) && !clienteBloqueado(cl))
    const basico = ativos.filter((cl) => (cl.plano ?? 'basico') === 'basico').length
    const pro = ativos.filter((cl) => cl.plano === 'pro').length

    const porCliente = basico * (r.precoCentavosBasico ?? 0) + pro * (r.precoCentavosPro ?? 0)
    const valorCentavos = Math.max(porCliente, r.precoCentavosMinimo ?? 0)
    if (valorCentavos <= 0) {
      // Sem preço cadastrado (ou sem clientes e sem piso) não dá para inventar
      // um valor — cobrar errado é pior que não cobrar.
      return c.json(
        { erro: 'não há valor a cobrar na sua conta — fale com a FHVP Tech para acertar seu preço' },
        400
      )
    }

    const dias = DIAS_PADRAO_LICENCA
    const pix = await criarCobrancaPIX(valorCentavos)
    const cobranca: Cobranca = {
      txid: pix.txid,
      alvo: 'revendedor',
      clienteId: r.revendedorId, // o campo guarda o revendedorId quando alvo='revendedor'
      valorCentavos,
      diasContratados: dias,
      status: 'pendente',
      qrcode: pix.qrcode,
      qrcodeBase64: pix.qrcodeBase64,
      criadaEm: new Date().toISOString(),
      expiraEm: pix.expiraEm
    }
    gravarCobranca(cobranca)
    return c.json({
      txid: cobranca.txid,
      valorCentavos,
      diasContratados: dias,
      qrcode: cobranca.qrcode,
      qrcodeBase64: cobranca.qrcodeBase64,
      expiraEm: cobranca.expiraEm,
      // Detalhamento na resposta: ele vê de onde saiu o número em vez de
      // receber um valor sem explicação.
      detalhe: { ativosBasico: basico, ativosPro: pro, porCliente, piso: r.precoCentavosMinimo ?? 0 }
    })
  })

  revenda.get('/cobranca/:txid', (c) => {
    const r = c.get('revendedor')
    const cobranca = obterCobranca(c.req.param('txid'))
    // 404 quando a cobrança é de outro: o mesmo cuidado da carteira alheia.
    if (!cobranca || cobranca.alvo !== 'revendedor' || cobranca.clienteId !== r.revendedorId) {
      return c.json({ erro: 'cobrança não encontrada' }, 404)
    }
    return c.json({ txid: cobranca.txid, status: cobranca.status, pagaEm: cobranca.pagaEm })
  })

  // ───── Conta ────────────────────────────────────────────────────────────
  /**
   * O revendedor cadastra/troca o PRÓPRIO e-mail de recuperação.
   *
   * ⚠️ Exige a senha atual, e isso não é burocracia. Sem ela, uma sessão
   * roubada vira tomada PERMANENTE da conta: o invasor troca o e-mail de
   * recuperação para o dele, sai, pede "esqueci minha senha" e passa a ser o
   * dono — sem nunca ter sabido a senha. Pedir a senha aqui é o que mantém o
   * estrago limitado ao tempo da sessão.
   */
  revenda.post('/email', async (c) => {
    const r = c.get('revendedor')
    const body = await corpo<{ atual: string; email: string }>(c)
    if (!(await conferirSenha(body.atual ?? '', r.senhaHash))) {
      return c.json({ erro: 'senha atual não confere' }, 401)
    }
    const email = (body.email ?? '').trim().toLowerCase()
    if (!emailAceitavel(email)) return c.json({ erro: 'e-mail inválido' }, 400)
    gravarRevendedor({ ...r, email })
    return c.json({ ok: true, email })
  })

  revenda.post('/senha', async (c) => {
    const r = c.get('revendedor')
    const body = await corpo<{ atual: string; nova: string }>(c)
    if (!(await conferirSenha(body.atual ?? '', r.senhaHash))) {
      return c.json({ erro: 'senha atual não confere' }, 401)
    }
    const ok = senhaAceitavel(body.nova ?? '')
    if (!ok.ok) return c.json({ erro: ok.erro }, 400)

    // Trocar senha derruba as outras sessões: é o que dá a quem desconfia de
    // invasão uma forma de expulsar o invasor sem depender da FHVP.
    gravarRevendedor({ ...r, senhaHash: await gerarHashSenha(body.nova as string) })
    apagarSessoesDoRevendedor(r.revendedorId)
    return c.json({ ok: true, aviso: 'todas as sessões foram encerradas — entre novamente' })
  })

  revenda.post('/logout', (c) => {
    apagarSessaoRevenda(c.get('tokenHash'))
    return c.json({ ok: true })
  })

  app.route('/revenda', revenda)
}
