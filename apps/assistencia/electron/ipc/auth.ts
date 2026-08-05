import { registrarCanal } from '@fhvptech/core/electron/roteador'
import {
  alterarPinVendedor,
  definirPinVendedor,
  gerarCodigoRecuperacao,
  lerAutoLockMinutos,
  lerTetoDescontoPct,
  redefinirComCodigo,
  setarAutoLockMinutos,
  setarTetoDescontoPct,
  temPinConfigurado,
  verificarPinDono,
  verificarPinVendedor
} from '../auth'
import { definirSessao, limparSessao, obterSessao, requerDono } from '../sessao'
import { extrairClienteIdLocal } from '@fhvptech/core/electron/licenca'
import { listarParaLogin } from '../db/queries/vendedores'

// Mesmo backend do chat/renovação (ipc/chat.ts, ipc/licenca-pagamento.ts).
const URL_BACKEND = 'https://licenca-gnmodas.fly.dev'

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

  // ─── Sessão e login por vendedor ─────────────────────────────────────
  registrarCanal('auth:listarVendedoresParaLogin', () => {
    try {
      return { success: true, data: listarParaLogin() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('auth:login', async (vendedorId: number, pin: string) => {
    try {
      const ok = await verificarPinVendedor(vendedorId, pin)
      if (!ok) return { success: true, data: { ok: false } }
      definirSessao(vendedorId)
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

  // Modal "elevar privilégio": valida PIN de qualquer gerente ativo sem trocar
  // o vendedor da sessão. Retorna o id do gerente que autenticou (pra log futuro).
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
    async (vendedorId: number, pin: string) => {
      try {
        await definirPinVendedor(vendedorId, pin)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  registrarCanal(
    'auth:alterarPinVendedor',
    async (vendedorId: number, pinAtual: string, pinNovo: string) => {
      try {
        await alterarPinVendedor(vendedorId, pinAtual, pinNovo)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // ─── Recuperação de PIN por email (gerente ou vendedor) ─────────────────
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

  // Valida o código e redefine o PIN. Em sucesso, já abre a sessão do gerente
  // (login automático) — ele acabou de provar a identidade pelo email.
  registrarCanal(
    'auth:redefinirComCodigo',
    async (email: string, codigo: string, novoPin: string) => {
      try {
        const vendedorId = await redefinirComCodigo(email, codigo, novoPin)
        definirSessao(vendedorId)
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

  // ─── Teto de desconto ────────────────────────────────────────────────
  registrarCanal('auth:lerTetoDesconto', () => {
    try {
      return { success: true, data: lerTetoDescontoPct() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('auth:setarTetoDesconto', (pct: number) => {
    try {
      requerDono()
      setarTetoDescontoPct(pct)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
