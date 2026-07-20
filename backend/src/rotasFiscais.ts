// Rotas HTTP da nota fiscal. O app (Electron) chama estas rotas; elas validam
// licença, protegem o vínculo loja↔CNPJ e repassam pra ACBr via fiscal.ts.
//
// Por que passa pelo backend e não vai direto do app pra ACBr: aqui ficam as
// credenciais da conta ACBr e por aqui passam (sem gravar) o certificado A1 e o
// CSC dos clientes. O app nunca vê a credencial da conta. Mesmo princípio do
// /chat, que esconde a chave da Anthropic.

import type { Hono } from 'hono'
import { exigirLicenca } from './licencaGuard.ts'
import { gravarCliente } from './db.ts'
import {
  garantirEmpresa,
  enviarCertificado,
  consultarCertificado,
  configurarNfce,
  consultarCep,
  type DadosEmpresa,
  type ConfigNfce
} from './fiscal.ts'
import { consultarCreditos, ErroAcbr, type CodigoErroAcbr } from './acbr.ts'

const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

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
}
