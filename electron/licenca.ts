/**
 * Módulo de licença — validação 100% offline via HMAC-SHA256 + arquivo AES.
 *
 * Formato da chave entregue ao lojista:  CLIENTE:AAAA-MM-DD:HMAC16
 *   Exemplo: LOJA001:2026-06-30:A3F2B891C4D5E6F7
 *
 * O arquivo licenca.lic armazena a chave criptografada com AES-256-CBC
 * para dificultar inspeção manual.
 *
 * ATENÇÃO: as constantes CHAVE_HMAC e CHAVE_AES devem ser idênticas
 * às definidas em tools/gerar-licenca.ts.
 */
import { createHmac, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { obterBancoDeDados } from './db/conexao'

const CHAVE_HMAC = 'SR-2024-hmac-varejo-k9x3mz'
const CHAVE_AES = 'SR-2024-aes-varejo-file-k7z1qp'
const SALT_AES = 'sistema-rt-2024-salt'

// Tolerância para o guard de relógio. Ajustes menores que isso (correções de
// timezone, fuso, drift) não disparam o bloqueio.
const TOLERANCIA_RELOGIO_MS = 48 * 60 * 60 * 1000

function derivarChaveAES(): Buffer {
  return scryptSync(CHAVE_AES, SALT_AES, 32)
}

function criptografar(texto: string): string {
  const chave = derivarChaveAES()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', chave, iv)
  const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + enc.toString('hex')
}

function descriptografar(cifrado: string): string {
  const idx = cifrado.indexOf(':')
  if (idx === -1) throw new Error('Formato de arquivo inválido')
  const ivHex = cifrado.slice(0, idx)
  const encHex = cifrado.slice(idx + 1)
  const chave = derivarChaveAES()
  const decipher = createDecipheriv('aes-256-cbc', chave, Buffer.from(ivHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final()
  ]).toString('utf8')
}

export function calcularHMAC(clienteId: string, expiracao: string): string {
  return createHmac('sha256', CHAVE_HMAC)
    .update(`${clienteId}:${expiracao}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase()
}

export function caminhoLicenca(): string {
  return join(app.getPath('userData'), 'licenca.lic')
}

function caminhoHeartbeat(): string {
  return join(app.getPath('userData'), 'licenca.heartbeat')
}

// Lê o último timestamp registrado pelo heartbeat. Retorna null em qualquer falha
// (arquivo ausente, corrompido, descriptografia falhando) — o chamador trata como
// "sem histórico" e usa apenas o anchor do SQLite.
function lerHeartbeat(): number | null {
  try {
    const caminho = caminhoHeartbeat()
    if (!existsSync(caminho)) return null
    const cifrado = readFileSync(caminho, 'utf8').trim()
    const obj = JSON.parse(descriptografar(cifrado)) as { ts?: number }
    return typeof obj.ts === 'number' ? obj.ts : null
  } catch {
    return null
  }
}

function escreverHeartbeat(ts: number): void {
  try {
    const conteudo = criptografar(JSON.stringify({ ts }))
    writeFileSync(caminhoHeartbeat(), conteudo, 'utf8')
  } catch {
    // Falha silenciosa — sem heartbeat o sistema só fica menos seguro, não trava.
  }
}

// Maior data registrada em vendas (em ms, UTC). Anchor "duro" porque mexer aqui
// implica adulterar o SQLite — bem mais difícil do que apagar o heartbeat.
function obterMaxDataVendaMs(): number | null {
  try {
    const db = obterBancoDeDados()
    const row = db.prepare('SELECT MAX(data) AS max_data FROM vendas').get() as {
      max_data: string | null
    }
    if (!row.max_data) return null
    const ms = new Date(row.max_data.replace(' ', 'T') + 'Z').getTime()
    return isNaN(ms) ? null : ms
  } catch {
    return null
  }
}

type ResultadoGuard =
  | { ok: true; aviso?: string }
  | { ok: false; mensagem: string }

// Detecta se o relógio do SO foi adulterado pra trás. Combina dois anchors:
// heartbeat criptografado + MAX(vendas.data). Em qualquer falha (sem DB,
// sem heartbeat, sem vendas), degrada com segurança — não bloqueia.
//
// Resultado:
//  - ok: false  → relógio voltou além da tolerância → bloqueia
//  - ok: true, aviso definido → voltou dentro da tolerância → permite mas avisa
//  - ok: true sem aviso → tudo certo
function verificarRelogio(): ResultadoGuard {
  try {
    const agora = Date.now()
    const heartbeatMs = lerHeartbeat()
    const maxVendaMs = obterMaxDataVendaMs()
    const ancora = Math.max(heartbeatMs ?? 0, maxVendaMs ?? 0)

    if (ancora === 0) {
      // Sem referência (primeira execução pós-feature ou banco vazio).
      escreverHeartbeat(agora)
      return { ok: true }
    }

    if (agora < ancora - TOLERANCIA_RELOGIO_MS) {
      return {
        ok: false,
        mensagem:
          'Relógio do sistema parece incorreto. Ajuste a data/hora do Windows e tente novamente. ' +
          'Se o problema persistir, contate o suporte.'
      }
    }

    // Heartbeat só avança — nunca regride, mesmo dentro da tolerância.
    escreverHeartbeat(Math.max(ancora, agora))

    if (agora < ancora) {
      // Voltou pouco (dentro da tolerância). Não bloqueia, mas avisa.
      return {
        ok: true,
        aviso:
          'Atenção: detectamos que o relógio do sistema foi alterado para trás. ' +
          'Verifique se a data/hora do Windows está correta — alterações maiores podem bloquear o sistema.'
      }
    }
    return { ok: true }
  } catch {
    return { ok: true }
  }
}

export type StatusLicenca = {
  valida: boolean
  diasRestantes?: number
  mensagem: string
  clienteId?: string
  aviso?: string
}

export function validarChave(chave: string): StatusLicenca {
  const partes = chave.trim().split(':')
  if (partes.length !== 3) {
    return { valida: false, mensagem: 'Formato inválido. Use: CLIENTE:AAAA-MM-DD:CODIGO' }
  }

  const [clienteId, expiracao, hmacFornecido] = partes

  if (hmacFornecido.toUpperCase() !== calcularHMAC(clienteId, expiracao)) {
    return { valida: false, mensagem: 'Chave de licença inválida ou adulterada.' }
  }

  const dataExp = new Date(expiracao + 'T23:59:59')
  if (isNaN(dataExp.getTime())) {
    return { valida: false, mensagem: 'Data de expiração inválida na chave.' }
  }

  if (dataExp < new Date()) {
    return {
      valida: false,
      mensagem: 'Licença expirada. Contate o suporte para renovação.',
      clienteId
    }
  }

  const diasRestantes = Math.ceil((dataExp.getTime() - Date.now()) / 86_400_000)
  return {
    valida: true,
    diasRestantes,
    mensagem: `Licença válida por mais ${diasRestantes} dia(s).`,
    clienteId
  }
}

export function validarLicenca(): StatusLicenca {
  const caminho = caminhoLicenca()

  if (!existsSync(caminho)) {
    return { valida: false, mensagem: 'Nenhuma licença encontrada. Insira sua chave de ativação.' }
  }

  const guard = verificarRelogio()
  if (!guard.ok) {
    return { valida: false, mensagem: guard.mensagem }
  }

  try {
    const conteudo = readFileSync(caminho, 'utf8').trim()
    const chaveDecriptada = descriptografar(conteudo)
    const status = validarChave(chaveDecriptada)
    return guard.aviso ? { ...status, aviso: guard.aviso } : status
  } catch {
    return { valida: false, mensagem: 'Arquivo de licença corrompido. Reinsira a chave.' }
  }
}

export function ativarLicenca(chave: string): StatusLicenca {
  const status = validarChave(chave)
  if (!status.valida) return status
  const guard = verificarRelogio()
  if (!guard.ok) {
    return { valida: false, mensagem: guard.mensagem }
  }
  writeFileSync(caminhoLicenca(), criptografar(chave.trim()), 'utf8')
  escreverHeartbeat(Date.now())
  return guard.aviso ? { ...status, aviso: guard.aviso } : status
}
