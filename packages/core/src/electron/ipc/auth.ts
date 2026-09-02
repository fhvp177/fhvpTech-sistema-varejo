import { registrarCanal } from '@fhvptech/core/electron/roteador'
import {
  alterarPin,
  definirPin,
  gerarCodigoRecuperacao,
  lerAutoLockMinutos,
  redefinirComCodigo,
  setarAutoLockMinutos,
  temPinConfigurado,
  verificarPinDono,
  verificarPin
} from '../auth/auth'
import { definirSessao, limparSessao, obterSessao } from '../auth/sessao'
import { obterAuthStore } from '../auth/store'
import { extrairClienteIdLocal } from '@fhvptech/core/electron/licenca'

// Mesmo backend do chat/renovação (ver ipc/licenca-pagamento.ts).
const URL_BACKEND = 'https://licenca-gnmodas.fly.dev'

// Handlers de auth do núcleo, parametrizados pela AuthStore injetada no boot.
// Os nomes de canal são genéricos ('usuario', não 'vendedor') — o varejo, ao
// convergir, troca seu preload/renderer pra estes nomes.
export function registrarHandlersAuth(): void {
  // Status geral usado pelo App pra ler auto-lock e saber se há PIN configurado
  // (instalação fresca pode não ter — a tela de login lida com 1º cadastro).
  registrarCanal('auth:obterStatus', () => {
    try {
      return {
        success: true,
        data: {
          pinConfigurado: temPinConfigurado(),
          autoLockMinutos: lerAutoLockMinutos()
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ─── Sessão e login por usuário ──────────────────────────────────────
  registrarCanal('auth:listarUsuariosParaLogin', () => {
    try {
      return { success: true, data: obterAuthStore().listarParaLogin() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('auth:login', async (usuarioId: number, pin: string) => {
    try {
      const ok = await verificarPin(usuarioId, pin)
      if (!ok) return { success: true, data: { ok: false } }
      definirSessao(usuarioId)
      const sessao = obterSessao()
      return { success: true, data: { ok: true, sessao } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('auth:logout', () => {
    try {
      limparSessao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('auth:sessaoAtual', () => {
    try {
      return { success: true, data: obterSessao() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Modal "elevar privilégio": valida PIN de qualquer dono ativo sem trocar
  // o usuário da sessão. Retorna o id do dono que autenticou (pra log futuro).
  registrarCanal('auth:elevar', async (pin: string) => {
    try {
      const donoId = await verificarPinDono(pin)
      return { success: true, data: { ok: donoId !== null, donoId } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal(
    'auth:cadastrarPinPrimeiroUso',
    async (usuarioId: number, pin: string) => {
      try {
        await definirPin(usuarioId, pin)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  registrarCanal(
    'auth:alterarPin',
    async (usuarioId: number, pinAtual: string, pinNovo: string) => {
      try {
        await alterarPin(usuarioId, pinAtual, pinNovo)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // ─── Recuperação de PIN por email ────────────────────────────────────
  // Gera o código local (hash bcrypt, 6 dígitos, 15 min) e pede ao backend Fly
  // pra enviar por email. `enviado: false` = nenhum usuário ativo com esse email.
  registrarCanal('auth:solicitarRecuperacao', async (email: string) => {
    try {
      const gerado = await gerarCodigoRecuperacao(email)
      if (!gerado) {
        return { success: true, data: { enviado: false } }
      }
      const clienteId = extrairClienteIdLocal()
      if (!clienteId) {
        return {
          success: false,
          error: 'Não foi possível identificar a licença deste computador.'
        }
      }
      const r = await fetch(`${URL_BACKEND}/recuperacao/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          para: gerado.email,
          codigo: gerado.codigo,
          nome: gerado.nome
        })
      })
      if (!r.ok) {
        let msg = `Falha ao enviar o email (erro ${r.status}).`
        try {
          const corpo = (await r.json()) as { erro?: string }
          if (corpo.erro) msg = corpo.erro
        } catch {
          // corpo não-JSON; mantém a mensagem genérica
        }
        return { success: false, error: msg }
      }
      return { success: true, data: { enviado: true } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Valida o código e redefine o PIN. Em sucesso, já abre a sessão do usuário
  // (login automático) — ele acabou de provar a identidade pelo email.
  registrarCanal(
    'auth:redefinirComCodigo',
    async (email: string, codigo: string, novoPin: string) => {
      try {
        const usuarioId = await redefinirComCodigo(email, codigo, novoPin)
        definirSessao(usuarioId)
        return { success: true, data: { ok: true, sessao: obterSessao() } }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // ─── Auto-lock ───────────────────────────────────────────────────────
  registrarCanal('auth:setarAutoLock', (minutos: number) => {
    try {
      setarAutoLockMinutos(minutos)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
