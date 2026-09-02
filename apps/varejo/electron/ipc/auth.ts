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
import { origemAtual } from '@fhvptech/core/electron/roteador'
import {
  Estrangulador,
  mensagemDeEspera
} from '@fhvptech/core/electron/auth/estrangulamento'

/**
 * Freio contra quem fica tentando adivinhar PIN ou código de recuperação.
 *
 * No aplicativo instalado isso nunca fez falta: para tentar, a pessoa tem que
 * estar de pé no balcão. Servido pelo navegador o endereço é público, e sem
 * freio um script varre os dez mil PINs de quatro dígitos em minutos.
 *
 * A chave separa o que é independente: cada vendedor tem a sua contagem, a
 * elevação conta por aba, e o código de recuperação conta por e-mail. Assim
 * ninguém castiga ninguém — ver estrangulamento.ts.
 */
const freio = new Estrangulador()

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
      const chave = `login:${vendedorId}`
      const espera = freio.espera(chave)
      if (espera > 0) return { success: true, data: { ok: false, erro: mensagemDeEspera(espera) } }

      const ok = await verificarPinVendedor(vendedorId, pin)
      if (!ok) {
        freio.falhou(chave)
        return { success: true, data: { ok: false } }
      }
      freio.acertou(chave)
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
      // Conta por ORIGEM (a aba que pediu), e não por vendedor: elevar não diz
      // de quem é o PIN que está sendo tentado.
      const chave = `elevar:${origemAtual()}`
      const espera = freio.espera(chave)
      if (espera > 0) {
        return { success: true, data: { ok: false, donoId: null, erro: mensagemDeEspera(espera) } }
      }

      const donoId = await verificarPinDono(pin)
      if (donoId === null) freio.falhou(chave)
      else freio.acertou(chave)
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
      const chave = `login:${vendedorId}`
      const espera = freio.espera(chave)
      if (espera > 0) return { success: false, error: mensagemDeEspera(espera) }
      try {
        await alterarPinVendedor(vendedorId, pinAtual, pinNovo)
        freio.acertou(chave)
        return { success: true, data: null }
      } catch (error) {
        // Trocar o PIN exige o atual: sem freio aqui, seria a mesma porta do
        // login com outro nome. Compartilha a contagem com ele, de propósito.
        freio.falhou(chave)
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
      // O código tem seis dígitos e acertá-lo REDEFINE o PIN — é a porta mais
      // valiosa das quatro, e a única em que adivinhar dá acesso total.
      const chave = `recuperacao:${String(email).trim().toLowerCase()}`
      const espera = freio.espera(chave)
      if (espera > 0) return { success: false, error: mensagemDeEspera(espera) }
      try {
        const vendedorId = await redefinirComCodigo(email, codigo, novoPin)
        freio.acertou(chave)
        definirSessao(vendedorId)
        return { success: true, data: { ok: true, sessao: obterSessao() } }
      } catch (error) {
        freio.falhou(chave)
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
