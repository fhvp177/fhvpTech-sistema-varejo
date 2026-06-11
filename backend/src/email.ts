// Envio de emails transacionais via Resend. Hoje só o código de recuperação de
// acesso (PIN do dono). A RESEND_API_KEY é secret do Fly — NUNCA vai pro app
// nem pro cliente, por isso o envio mora aqui no backend e não no Electron.
//
// Domínio fhvptech.com verificado na Resend (DKIM + SPF/MX no subdomínio
// send.fhvptech.com). Remetente fixo: suporte@fhvptech.com.

import { Resend } from 'resend'

const REMETENTE = 'FHVP Tech <suporte@fhvptech.com>'

let client: Resend | null = null

export type ResultadoEmail =
  | { ok: true }
  | { ok: false; status: number; erro: string }

type CodigoRecuperacao = {
  para: string
  codigo: string
  nome?: string
  minutosValidade: number
}

// Escapa texto que entra no HTML (só o nome é dinâmico aqui) pra não permitir
// injeção de marcação no corpo do email.
function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function corpoTexto(saudacao: string, codigo: string, minutos: number): string {
  return [
    saudacao,
    '',
    'Recebemos um pedido para redefinir o PIN de acesso ao seu sistema FHVP Tech.',
    '',
    `Seu código de verificação é: ${codigo}`,
    '',
    `Ele é válido por ${minutos} minutos. Digite-o na tela de recuperação para criar um novo PIN.`,
    '',
    'Se você não pediu isso, ignore este email — seu acesso continua seguro.',
    '',
    '— Equipe FHVP Tech'
  ].join('\n')
}

function corpoHtml(saudacaoHtml: string, codigo: string, minutos: number): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background:#111827;padding:20px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">FHVP Tech</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px;font-size:15px;">${saudacaoHtml}</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
                  Recebemos um pedido para redefinir o PIN de acesso ao seu sistema.
                  Use o código abaixo na tela de recuperação:
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <span style="display:inline-block;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:10px;padding:14px 28px;font-size:30px;font-weight:bold;letter-spacing:8px;color:#111827;">${codigo}</span>
                </div>
                <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.5;">
                  O código é válido por <strong>${minutos} minutos</strong>.
                </p>
                <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5;">
                  Se você não solicitou isso, pode ignorar este email — seu acesso continua seguro.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e4e4e7;">
                <span style="font-size:12px;color:#a1a1aa;">Equipe FHVP Tech</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export async function enviarCodigoRecuperacao(
  req: CodigoRecuperacao
): Promise<ResultadoEmail> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    return { ok: false, status: 503, erro: 'Envio de email não está configurado no servidor.' }
  }
  if (!client) client = new Resend(key)

  const saudacaoTexto = req.nome ? `Olá, ${req.nome}!` : 'Olá!'
  const saudacaoHtml = req.nome ? `Olá, <strong>${escaparHtml(req.nome)}</strong>!` : 'Olá!'

  try {
    const { error } = await client.emails.send({
      from: REMETENTE,
      to: req.para,
      subject: 'Código de recuperação de acesso — FHVP Tech',
      text: corpoTexto(saudacaoTexto, req.codigo, req.minutosValidade),
      html: corpoHtml(saudacaoHtml, req.codigo, req.minutosValidade)
    })
    if (error) {
      return { ok: false, status: 502, erro: error.message ?? 'Falha ao enviar email.' }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, status: 500, erro: (e as Error).message }
  }
}
