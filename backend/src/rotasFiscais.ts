// Rotas HTTP da nota fiscal. O app (Electron) chama estas rotas; elas validam
// licença, protegem o vínculo loja↔CNPJ e repassam pra ACBr via fiscal.ts.
//
// Por que passa pelo backend e não vai direto do app pra ACBr: aqui ficam as
// credenciais da conta ACBr e por aqui passam (sem gravar) o certificado A1 e o
// CSC dos clientes. O app nunca vê a credencial da conta. Mesmo princípio do
// /chat, que esconde a chave da Anthropic.

import type { Hono } from 'hono'
import { exigirLicenca } from './licencaGuard.ts'
import {
  gravarCliente,
  reservarNumeroNfce,
  devolverNumeroNfce,
  obterEmissaoNfce,
  gravarEmissaoNfce,
  contarNotasMes,
  registrarNotaMes
} from './db.ts'
import {
  montarPedidoNfce,
  ErroMontagem,
  type VendaParaNfce,
  type EmitenteNfce
} from './nfce.ts'
import {
  garantirEmpresa,
  enviarCertificado,
  consultarCertificado,
  configurarNfce,
  configurarNfe,
  consultarCep,
  type DadosEmpresa,
  type ConfigNfce,
  type ConfigNfe
} from './fiscal.ts'
import { consultarCreditos, chamarAcbr, ErroAcbr, type CodigoErroAcbr } from './acbr.ts'

// O que a ACBr devolve numa emissão/consulta de DF-e (subconjunto que usamos).
type RespostaDfe = {
  id?: string
  status?: string
  numero?: number
  serie?: number
  chave?: string
  autorizacao?: { codigo_status?: number; motivo_status?: string }
}

// Status que significam "a nota foi transmitida à SEFAZ" — a partir daqui o
// número está consumido de vez (mesmo se rejeitada). Só a AUSÊNCIA de resposta
// (exceção) devolve o número ao pool.
const TRANSMITIDA = new Set(['autorizado', 'rejeitado', 'denegado', 'pendente', 'cancelado'])

const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

// A ACBr tem endereços separados por documento. Sem escolher o certo, a NF-e
// bateria na rota da NFC-e e "não existiria".
const rotaDoModelo = (modelo: number) => (modelo === 55 ? 'nfe' : 'nfce')

// Traduz o erro do cliente ACBr no status HTTP que o app entende. Erros de
// credencial/config são NOSSOS (502/500), não do lojista — não faz sentido
// devolver 401 ao app, que o interpretaria como licença.
const STATUS_POR_CODIGO: Record<CodigoErroAcbr, number> = {
  sem_credito: 402,
  limite: 429,
  validacao: 400,
  auth: 502,
  nao_encontrado: 404,
  indisponivel: 502,
  config: 500
}

// Resposta de erro padronizada. Nunca vaza `detalhe` cru pro app quando o erro
// é de config nossa (poderia conter pistas internas); nos demais, o detalhe da
// ACBr ajuda o lojista/contador a entender uma rejeição.
function responderErro(erro: unknown) {
  if (erro instanceof ErroAcbr) {
    const status = STATUS_POR_CODIGO[erro.codigo] ?? 502
    const corpo: Record<string, unknown> = { erro: erro.message, codigo: erro.codigo }
    if (erro.codigo !== 'config' && erro.detalhe) corpo.detalhe = erro.detalhe
    if (erro.tentarEmSegundos) corpo.tentarEmSegundos = erro.tentarEmSegundos
    return { status, corpo }
  }
  return { status: 500, corpo: { erro: (erro as Error).message ?? 'Erro inesperado.' } }
}

// Garante que o CNPJ que a loja quer operar é o dela. Na primeira vez, adota o
// CNPJ; depois, exige que bata. Fecha o vetor de uma loja mexer na NFC-e de
// outra dentro da conta guarda-chuva.
function exigirCnpjDaLoja(
  cliente: { clienteId: string; cnpjEmitente?: string },
  cpfCnpjInformado: string
): { ok: true; cnpj: string } | { ok: false; status: number; erro: string } {
  const cnpj = soDigitos(cpfCnpjInformado)
  if (cnpj.length !== 11 && cnpj.length !== 14) {
    return { ok: false, status: 400, erro: 'CNPJ inválido.' }
  }
  if (cliente.cnpjEmitente && cliente.cnpjEmitente !== cnpj) {
    return {
      ok: false,
      status: 403,
      erro: 'Este CNPJ não é o emitente cadastrado para esta loja.'
    }
  }
  return { ok: true, cnpj }
}

export function registrarRotasFiscais(app: Hono): void {
  // Cadastra/atualiza a empresa emitente na ACBr e amarra o CNPJ à loja.
  app.post('/fiscal/empresa', async (c) => {
    const body = await c.req.json<{ clienteId?: string; empresa?: DadosEmpresa }>()
    const lic = exigirLicenca(body.clienteId)
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)
    if (!body.empresa?.cpf_cnpj) return c.json({ erro: 'dados da empresa obrigatórios' }, 400)

    const guard = exigirCnpjDaLoja(lic.cliente, body.empresa.cpf_cnpj)
    if (!guard.ok) return c.json({ erro: guard.erro }, guard.status as 400)

    try {
      const empresa = await garantirEmpresa(body.empresa)
      // Adota o CNPJ na primeira vez (idempotente nas próximas).
      if (!lic.cliente.cnpjEmitente) {
        gravarCliente({ ...lic.cliente, cnpjEmitente: guard.cnpj })
      }
      return c.json({ ok: true, empresa })
    } catch (e) {
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }
  })

  // Sobe o certificado A1 (base64 + senha). Devolve só os METADADOS (titular,
  // validade) — o app guarda a validade pra avisar do vencimento no sino.
  app.put('/fiscal/certificado', async (c) => {
    const body = await c.req.json<{
      clienteId?: string
      cpf_cnpj?: string
      certificado?: string
      senha?: string
    }>()
    const lic = exigirLicenca(body.clienteId)
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)

    const guard = exigirCnpjDaLoja(lic.cliente, body.cpf_cnpj ?? '')
    if (!guard.ok) return c.json({ erro: guard.erro }, guard.status as 400)

    try {
      const info = await enviarCertificado(guard.cnpj, body.certificado ?? '', body.senha ?? '')
      // Nunca ecoa o que foi enviado — só o que a ACBr extraiu do certificado.
      return c.json({
        ok: true,
        titular: info.subject_name ?? info.nome_razao_social ?? '',
        validade: info.not_valid_after ?? '',
        emissor: info.issuer_name ?? ''
      })
    } catch (e) {
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }
  })

  // Consulta os metadados do certificado já cadastrado (pro semáforo/aviso).
  app.get('/fiscal/certificado', async (c) => {
    const lic = exigirLicenca(c.req.query('clienteId'))
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)
    if (!lic.cliente.cnpjEmitente) return c.json({ ok: true, existe: false })
    try {
      const info = await consultarCertificado(lic.cliente.cnpjEmitente)
      return c.json({
        ok: true,
        existe: Boolean(info.not_valid_after),
        titular: info.subject_name ?? info.nome_razao_social ?? '',
        validade: info.not_valid_after ?? ''
      })
    } catch (e) {
      if (e instanceof ErroAcbr && e.codigo === 'nao_encontrado') {
        return c.json({ ok: true, existe: false })
      }
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }
  })

  // Configura a NFC-e da empresa (regime + CSC). O CSC não fica guardado do
  // nosso lado, vai direto pra ACBr.
  app.put('/fiscal/nfce-config', async (c) => {
    const body = await c.req.json<{
      clienteId?: string
      cpf_cnpj?: string
      config?: ConfigNfce
    }>()
    const lic = exigirLicenca(body.clienteId)
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)

    const guard = exigirCnpjDaLoja(lic.cliente, body.cpf_cnpj ?? '')
    if (!guard.ok) return c.json({ erro: guard.erro }, guard.status as 400)
    if (!body.config) return c.json({ erro: 'configuração obrigatória' }, 400)

    try {
      await configurarNfce(guard.cnpj, body.config)
      return c.json({ ok: true })
    } catch (e) {
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }
  })

  // Consulta de CEP — devolve o código IBGE do município, que a nota exige e
  // que nenhum lojista sabe de cabeça. Barato (0,1 crédito), mas atrás de
  // licença pra não virar API de consulta aberta.
  app.get('/fiscal/cep/:cep', async (c) => {
    const lic = exigirLicenca(c.req.query('clienteId'))
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)
    try {
      return c.json({ ok: true, endereco: await consultarCep(c.req.param('cep')) })
    } catch (e) {
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }
  })

  // Saldo de créditos da conta — pro app mostrar quanto resta e pra sustentar
  // a regra comercial de notas/mês.
  app.get('/fiscal/creditos', async (c) => {
    const lic = exigirLicenca(c.req.query('clienteId'))
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)
    try {
      return c.json({ ok: true, ...(await consultarCreditos()) })
    } catch (e) {
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }
  })

  // Emite uma NFC-e a partir de uma venda. O app manda a venda + os dados do
  // emitente (que ele já tem no config); o CNPJ vem do vínculo da loja, não do
  // corpo. `referencia` (ex.: "v123") é a chave de idempotência.
  app.post('/fiscal/nfce', async (c) => {
    const body = await c.req.json<{
      clienteId?: string
      referencia?: string
      serie?: number
      emitente?: Omit<EmitenteNfce, 'cnpj'>
      venda?: VendaParaNfce
      /** 65 = NFC-e (consumidor) · 55 = NF-e (empresa). Padrão: 65. */
      modelo?: 55 | 65
    }>()
    const lic = exigirLicenca(body.clienteId)
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)
    if (!lic.cliente.cnpjEmitente) {
      return c.json({ erro: 'Empresa emitente ainda não cadastrada.' }, 400)
    }
    if (!body.referencia) return c.json({ erro: 'referencia obrigatória' }, 400)
    if (!body.venda || !body.emitente) return c.json({ erro: 'venda e emitente obrigatórios' }, 400)

    const clienteId = lic.cliente.clienteId

    // 1) Idempotência: mesma venda reenviada devolve a emissão que já existe,
    //    nunca gera uma segunda nota.
    const existente = obterEmissaoNfce(clienteId, body.referencia)
    if (existente) {
      return c.json({ ok: true, jaEmitida: true, emissao: existente })
    }

    const modelo = body.modelo === 55 ? 55 : 65
    const serie = Number.isInteger(body.serie) ? (body.serie as number) : 1
    const ambiente = c.req.query('ambiente') === 'producao' ? 'producao' : 'homologacao'
    // 2) Reserva o número ANTES de montar/enviar.
    //    NF-e e NFC-e têm sequências INDEPENDENTES (são documentos distintos
    //    para a SEFAZ), por isso o modelo entra na chave da numeração.
    const numero = reservarNumeroNfce(`${clienteId}|${modelo}`, serie)

    let pedido: Record<string, unknown>
    try {
      pedido = montarPedidoNfce({
        venda: body.venda,
        emitente: { ...body.emitente, cnpj: lic.cliente.cnpjEmitente },
        serie,
        numero,
        ambiente,
        referencia: body.referencia,
        modelo
      })
    } catch (e) {
      // Erro de montagem (ex.: produto sem NCM): a nota nem foi transmitida —
      // devolve o número pra não abrir buraco na sequência.
      devolverNumeroNfce(`${clienteId}|${modelo}`, serie, numero)
      if (e instanceof ErroMontagem) return c.json({ erro: e.message, codigo: 'validacao' }, 400)
      throw e
    }

    // 3) Emite. Exceção = não transmitiu → devolve o número. Retorno = foi
    //    transmitida (mesmo se rejeitada) → número consumido, registra.
    let dfe: RespostaDfe
    try {
      // Endpoints distintos: /nfe (modelo 55) e /nfce (modelo 65).
      const rota = modelo === 55 ? '/nfe' : '/nfce'
      // A NF-e exige a config de NF-e cadastrada na empresa (regime + ambiente).
      // Diferente da NFC-e, ela não tem passo próprio na tela (não usa CSC),
      // então é garantida aqui — idempotente, sem custo, e sempre no ambiente
      // desta emissão. Sem isto a ACBr recusa com "configuração de NF-e não
      // encontrada".
      if (modelo === 55) {
        const crt = Number((body.emitente as { crt?: number } | undefined)?.crt)
        await configurarNfe(lic.cliente.cnpjEmitente, {
          CRT: ([1, 2, 3, 4].includes(crt) ? crt : undefined) as ConfigNfe['CRT'],
          ambiente
        })
      }
      dfe = await chamarAcbr<RespostaDfe>(rota, { metodo: 'POST', corpo: pedido })
    } catch (e) {
      devolverNumeroNfce(`${clienteId}|${modelo}`, serie, numero)
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }

    const status = dfe.status ?? 'pendente'
    gravarEmissaoNfce({
      cliente_id: clienteId,
      referencia: body.referencia,
      modelo,
      serie,
      numero,
      acbr_id: dfe.id ?? null,
      status,
      chave: dfe.chave ?? null,
      criada_em: new Date().toISOString()
    })
    // Conta a nota do mês só quando foi de fato transmitida.
    if (TRANSMITIDA.has(status)) registrarNotaMes(clienteId)

    return c.json({
      ok: true,
      emissao: {
        referencia: body.referencia,
        serie,
        numero,
        acbr_id: dfe.id ?? null,
        status,
        chave: dfe.chave ?? null,
        motivo: dfe.autorizacao?.motivo_status ?? null
      },
      notasNoMes: contarNotasMes(clienteId)
    })
  })

  // DANFE da NFC-e em PDF, no tamanho da bobina térmica — é o "cupom" que o
  // cliente leva. Baixar o PDF NÃO consome crédito, então reimprimir é de
  // graça. Volta em base64 porque o app precisa gravar o arquivo pra imprimir.
  app.get('/fiscal/nfce/:referencia/danfe', async (c) => {
    const lic = exigirLicenca(c.req.query('clienteId'))
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)

    const emissao = obterEmissaoNfce(lic.cliente.clienteId, c.req.param('referencia'))
    if (!emissao?.acbr_id) return c.json({ erro: 'emissão não encontrada' }, 404)
    if (emissao.status !== 'autorizado') {
      return c.json({ erro: 'A nota ainda não foi autorizada.' }, 409)
    }

    // A NFC-e sai em bobina (80mm padrão, 58mm estreita); a NF-e é A4 e não
    // aceita largura — mandar o parâmetro ali seria pedir um papel que não existe.
    const largura = Number(c.req.query('largura')) === 58 ? 58 : 80
    const rota = rotaDoModelo(emissao.modelo)
    const query = emissao.modelo === 55 ? '' : `?largura=${largura}`
    try {
      const pdf = await chamarAcbr<ArrayBuffer>(
        `/${rota}/${emissao.acbr_id}/pdf${query}`,
        { binario: true }
      )
      return c.json({ ok: true, pdfBase64: Buffer.from(pdf).toString('base64') })
    } catch (e) {
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }
  })

  // XML da nota autorizada. É o documento que vale legalmente — o lojista é
  // obrigado a guardar por 5 ANOS e é o que o contador pede todo mês.
  //
  // ⚠️ A ACBr dá o PRIMEIRO download de graça e cobra 1 crédito nos seguintes.
  // Por isso o app guarda o XML no banco assim que baixa, e nunca pede duas
  // vezes o mesmo — ver `xml` em nfce_emitidas.
  app.get('/fiscal/nfce/:referencia/xml', async (c) => {
    const lic = exigirLicenca(c.req.query('clienteId'))
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)

    const emissao = obterEmissaoNfce(lic.cliente.clienteId, c.req.param('referencia'))
    if (!emissao?.acbr_id) return c.json({ erro: 'emissão não encontrada' }, 404)
    if (emissao.status !== 'autorizado' && emissao.status !== 'cancelado') {
      return c.json({ erro: 'A nota ainda não foi autorizada.' }, 409)
    }

    try {
      const xml = await chamarAcbr<ArrayBuffer>(
        `/${rotaDoModelo(emissao.modelo)}/${emissao.acbr_id}/xml`,
        { binario: true }
      )
      return c.json({ ok: true, xml: Buffer.from(xml).toString('utf-8') })
    } catch (e) {
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }
  })

  // Cancela uma NFC-e autorizada. A SEFAZ exige justificativa e só aceita
  // dentro do prazo legal (curto na NFC-e — costuma ser 30 minutos). Consome
  // 1 crédito, como uma emissão.
  app.post('/fiscal/nfce/:referencia/cancelamento', async (c) => {
    const body = await c.req.json<{ clienteId?: string; justificativa?: string }>()
    const lic = exigirLicenca(body.clienteId)
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)

    const emissao = obterEmissaoNfce(lic.cliente.clienteId, c.req.param('referencia'))
    if (!emissao?.acbr_id) return c.json({ erro: 'emissão não encontrada' }, 404)
    if (emissao.status !== 'autorizado') {
      return c.json({ erro: 'Só é possível cancelar uma nota autorizada.' }, 409)
    }

    // Exigência da SEFAZ: no mínimo 15 caracteres. Barrar aqui evita gastar
    // um crédito numa recusa certa.
    const justificativa = (body.justificativa ?? '').trim()
    if (justificativa.length < 15) {
      return c.json(
        { erro: 'A justificativa do cancelamento precisa ter pelo menos 15 caracteres.' },
        400
      )
    }

    try {
      await chamarAcbr(`/${rotaDoModelo(emissao.modelo)}/${emissao.acbr_id}/cancelamento`, {
        metodo: 'POST',
        corpo: { justificativa }
      })
      gravarEmissaoNfce({ ...emissao, status: 'cancelado' })
      return c.json({ ok: true, emissao: { ...emissao, status: 'cancelado' } })
    } catch (e) {
      const { status, corpo } = responderErro(e)
      return c.json(corpo, status as 400)
    }
  })

  // Consulta o status atual de uma emissão. Se ainda está "pendente" na SEFAZ,
  // pergunta à ACBr e atualiza — o polling do app cai aqui. Consultar status
  // na ACBr não custa crédito.
  app.get('/fiscal/nfce/:referencia', async (c) => {
    const lic = exigirLicenca(c.req.query('clienteId'))
    if (!lic.ok) return c.json({ erro: lic.erro }, lic.status)

    const emissao = obterEmissaoNfce(lic.cliente.clienteId, c.req.param('referencia'))
    if (!emissao) return c.json({ erro: 'emissão não encontrada' }, 404)

    // Estado final: nada a atualizar.
    if (emissao.status !== 'pendente' || !emissao.acbr_id) {
      return c.json({ ok: true, emissao })
    }

    try {
      const dfe = await chamarAcbr<RespostaDfe>(
        `/${rotaDoModelo(emissao.modelo)}/${emissao.acbr_id}`
      )
      if (dfe.status && dfe.status !== emissao.status) {
        gravarEmissaoNfce({
          ...emissao,
          status: dfe.status,
          chave: dfe.chave ?? emissao.chave
        })
        emissao.status = dfe.status
        if (dfe.chave) emissao.chave = dfe.chave
      }
      return c.json({ ok: true, emissao })
    } catch (e) {
      // Falha ao consultar não muda o que já sabemos — devolve o estado atual.
      const { corpo } = responderErro(e)
      return c.json({ ok: true, emissao, avisoConsulta: corpo })
    }
  })
}
