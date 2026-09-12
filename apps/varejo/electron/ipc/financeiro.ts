import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono, requerSessao } from '../sessao'
import {
  listarContas,
  criarConta,
  atualizarConta,
  desativarConta,
  reativarConta,
  extrato,
  saldoConsolidado,
  lancarMovimentoAvulso,
  type DadosConta,
  type TipoConta
} from '../db/queries/financeiro'
import { resumoFinanceiroMes, mesesComMovimento } from '../db/queries/resumoFinanceiro'
import {
  transferir,
  listarTransferencias,
  mesesComTransferencia
} from '../db/queries/transferencias'
import {
  listarCategoriasConta,
  criarCategoriaConta,
  atualizarCategoriaConta,
  deletarCategoriaConta
} from '../db/queries/categoriasConta'
import {
  turnoAberto,
  caixasComTurno,
  abrirTurno,
  fecharTurno,
  confirmarTurno,
  listarTurnos,
  contagensDoTurno,
  sangria,
  suprimento,
  diferencasPorOperador,
  turnoParaRelatorio,
  vendasDoTurno,
  resumoVendasDoTurno,
  exigeCaixaAberto,
  definirExigenciaCaixa
} from '../db/queries/turnos'

const TIPOS: TipoConta[] = ['caixa', 'banco', 'a_receber']

function validarConta(payload: unknown): DadosConta {
  if (!payload || typeof payload !== 'object') throw new Error('Dados inválidos.')
  const p = payload as Record<string, unknown>

  const nome = String(p.nome ?? '').trim()
  if (!nome) throw new Error('O nome da conta é obrigatório.')

  const tipo = String(p.tipo ?? 'banco') as TipoConta
  if (!TIPOS.includes(tipo)) throw new Error('Tipo de conta inválido.')

  const saldoInicial = Number(p.saldo_inicial ?? 0)
  if (!Number.isFinite(saldoInicial)) throw new Error('Saldo inicial inválido.')

  const texto = (v: unknown): string | null => {
    const s = String(v ?? '').trim()
    return s === '' ? null : s
  }

  return {
    nome,
    tipo,
    banco: texto(p.banco),
    agencia: texto(p.agencia),
    conta: texto(p.conta),
    saldo_inicial: saldoInicial,
    forma_padrao: texto(p.forma_padrao),
    padrao_recebimento: !!p.padrao_recebimento,
    padrao_pagamento: !!p.padrao_pagamento
  }
}

function valorPositivo(v: unknown, oQue: string): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${oQue} deve ser maior que zero.`)
  return +n.toFixed(2)
}

export function registrarHandlersFinanceiro(): void {
  // ── Contas ────────────────────────────────────────────────────────────────
  registrarCanal('financeiro:listarContas', (incluirInativas?: boolean) => {
    try {
      return { success: true, data: listarContas(!!incluirInativas) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('financeiro:criarConta', (dados: unknown) => {
    try {
      requerDono()
      const r = criarConta(validarConta(dados))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: r }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('financeiro:atualizarConta', (id: number, dados: unknown) => {
    try {
      requerDono()
      atualizarConta(Number(id), validarConta(dados))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('financeiro:desativarConta', (id: number) => {
    try {
      requerDono()
      desativarConta(Number(id))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('financeiro:reativarConta', (id: number) => {
    try {
      requerDono()
      reativarConta(Number(id))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ── Extrato ───────────────────────────────────────────────────────────────
  registrarCanal(
    'financeiro:extrato',
    (filtro?: { conta_id?: number; de?: string; ate?: string; limite?: number }) => {
      try {
        requerDono()
        return { success: true, data: extrato(filtro ?? {}) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  /*
   * ── O mês fechado na tela, sem precisar exportar ─────────────────────────
   *
   * ⚠️ `requerDono`, igual ao extrato, e pelo mesmo motivo: isto é o resultado
   * do mês da loja. Um vendedor com acesso a esta tela veria o lucro, o saldo
   * em banco e cada gasto da loja por categoria.
   */
  registrarCanal('financeiro:resumoMensal', (mes: unknown) => {
    try {
      requerDono()
      return { success: true, data: resumoFinanceiroMes(String(mes ?? '')) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('financeiro:mesesComMovimento', () => {
    try {
      requerDono()
      return { success: true, data: mesesComMovimento() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('financeiro:saldoConsolidado', () => {
    try {
      requerDono()
      return { success: true, data: saldoConsolidado() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Lançamento na mão (aporte, retirada, acerto).
   *
   * ⚠️ Só o dono. É a única porta por onde entra dinheiro sem origem numa venda
   * ou numa conta — se o vendedor pudesse usá-la, o fechamento às cegas perderia
   * o sentido: bastaria lançar um "ajuste" do tamanho da falta.
   */
  registrarCanal(
    'financeiro:lancar',
    (contaId: number, valor: number, tipo: string, descricao: string) => {
      try {
        requerDono()
        const n = Number(valor)
        if (!Number.isFinite(n) || n === 0) throw new Error('Informe um valor diferente de zero.')
        const texto = String(descricao ?? '').trim()
        if (!texto) throw new Error('Descreva o lançamento.')
        lancarMovimentoAvulso({
          conta_id: Number(contaId),
          valor: +n.toFixed(2),
          tipo: tipo === 'aporte' ? 'aporte' : 'ajuste',
          descricao: texto,
          vendedor_id: requerSessao().id
        })
        obterBackupManager().marcarAlteracao()
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // ── Turno de caixa ────────────────────────────────────────────────────────
  registrarCanal('caixa:caixasComTurno', () => {
    try {
      return { success: true, data: caixasComTurno() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('caixa:turnoAberto', (caixaId?: number) => {
    try {
      return { success: true, data: turnoAberto(caixaId ? Number(caixaId) : undefined) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('caixa:abrirTurno', (contaId: number, fundoTroco: number) => {
    try {
      const sessao = requerSessao()
      const fundo = Number(fundoTroco ?? 0)
      if (!Number.isFinite(fundo) || fundo < 0) throw new Error('Fundo de troco inválido.')
      const r = abrirTurno(Number(contaId), sessao.id, fundo)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: r }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Fecha o turno com a contagem.
   *
   * ⚠️ É AQUI que o esperado é calculado pela primeira vez, e é por isso que o
   * fechamento é às cegas de verdade: não existe canal que responda "quanto
   * deveria ter na gaveta?" antes desta chamada. Se existisse, bastaria a tela
   * perguntar antes de o operador digitar.
   */
  registrarCanal(
    'caixa:fecharTurno',
    (turnoId: number, contagens: Array<{ forma: string; valor_contado: number }>) => {
      try {
        const sessao = requerSessao()
        if (!Array.isArray(contagens)) throw new Error('Contagem inválida.')
        const limpas = contagens.map((c) => {
          const v = Number(c?.valor_contado)
          if (!Number.isFinite(v) || v < 0) throw new Error('Valor contado inválido.')
          return { forma: String(c.forma), valor_contado: +v.toFixed(2) }
        })
        const r = fecharTurno(Number(turnoId), sessao.id, limpas)
        obterBackupManager().marcarAlteracao()
        return { success: true, data: r }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  /**
   * O gerente aceita a diferença.
   *
   * ⚠️ `requerDono` é o que dá sentido ao PIN: quem conferiu não pode ser quem
   * aceita a própria quebra. Numa loja em que o dono opera o caixa isso vira
   * disciplina em vez de auditoria, e tudo bem — o controle existe para quando
   * houver vendedor.
   */
  registrarCanal('caixa:confirmarTurno', (turnoId: number, justificativa?: string) => {
    try {
      requerDono()
      const sessao = requerSessao()
      const texto = String(justificativa ?? '').trim() || null
      confirmarTurno(Number(turnoId), sessao.id, texto)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('caixa:listarTurnos', (limite?: number) => {
    try {
      requerDono()
      return { success: true, data: listarTurnos(Number(limite ?? 60)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('caixa:contagens', (turnoId: number) => {
    try {
      requerDono()
      return { success: true, data: contagensDoTurno(Number(turnoId)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /*
   * ★ O relatório que faz o fechamento às cegas valer a pena: a QUEBRA POR
   * OPERADOR ao longo do tempo. Uma diferença isolada é erro humano; o que diz
   * alguma coisa é o padrão, e ele não aparece em nenhum outro lugar.
   */
  registrarCanal('caixa:diferencasPorOperador', (de: string, ate: string) => {
    try {
      requerDono()
      return { success: true, data: diferencasPorOperador(String(de), String(ate)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /*
   * O interruptor "não vende sem caixa aberto".
   *
   * ⚠️ LER é livre, e precisa ser: o PDV consulta a cada abertura para saber se
   * mostra a tela de bloqueio. Negar a leitura ao vendedor faria o PDV cair no
   * padrão e barrar a venda numa loja que não usa caixa.
   *
   * GRAVAR é do dono. É uma trava de controle de dinheiro; quem opera o caixa
   * não pode desligar a conferência de si mesmo.
   */

  /*
   * Transferência entre contas da própria loja.
   *
   * ⚠️ Só o dono. Mover dinheiro entre contas muda o saldo de duas delas de uma
   * vez e não tem tela de conferência própria — é exatamente o tipo de operação
   * que não se deixa na mão de quem está operando o balcão.
   */
  registrarCanal('financeiro:transferir', (dados: unknown) => {
    try {
      requerDono()
      const sessao = requerSessao()
      const d = (dados ?? {}) as Record<string, unknown>
      const r = transferir({
        conta_origem_id: Number(d.conta_origem_id),
        conta_destino_id: Number(d.conta_destino_id),
        valor: Number(d.valor),
        observacao: (d.observacao as string | null) ?? null,
        // Quem fez vem da SESSÃO, nunca da tela: é a primeira pergunta quando
        // o saldo não bate, e não pode depender de quem chamou dizer a verdade.
        vendedor_id: sessao.id
      })
      obterBackupManager().marcarAlteracao()
      return { success: true, data: r }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Leitura do histórico: do dono, como o resto do financeiro.
  registrarCanal('financeiro:listarTransferencias', (mes?: string) => {
    try {
      requerDono()
      return { success: true, data: listarTransferencias(mes) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('financeiro:mesesComTransferencia', () => {
    try {
      requerDono()
      return { success: true, data: mesesComTransferencia() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('categoriasConta:listar', () => {
    try {
      return { success: true, data: listarCategoriasConta() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('categoriasConta:criar', (nome: string) => {
    try {
      requerDono()
      return { success: true, data: criarCategoriaConta(String(nome ?? '')) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('categoriasConta:atualizar', (id: number, nome: string) => {
    try {
      requerDono()
      atualizarCategoriaConta(Number(id), String(nome ?? ''))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('categoriasConta:deletar', (id: number) => {
    try {
      requerDono()
      deletarCategoriaConta(Number(id))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('caixa:exigencia', () => {
    try {
      return { success: true, data: exigeCaixaAberto() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('caixa:definirExigencia', (exigir: boolean) => {
    try {
      requerDono()
      definirExigenciaCaixa(!!exigir)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // O que foi vendido num turno — a resposta de "de onde veio a diferença?".
  registrarCanal('caixa:vendasDoTurno', (turnoId: number) => {
    try {
      return {
        success: true,
        data: {
          vendas: vendasDoTurno(Number(turnoId)),
          resumo: resumoVendasDoTurno(Number(turnoId))
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('caixa:turnoParaRelatorio', (turnoId: number) => {
    try {
      requerDono()
      return { success: true, data: turnoParaRelatorio(Number(turnoId)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('caixa:sangria', (contaId: number, valor: number, descricao: string) => {
    try {
      const sessao = requerSessao()
      const texto = String(descricao ?? '').trim()
      if (!texto) throw new Error('Diga para onde o dinheiro foi.')
      sangria(Number(contaId), sessao.id, valorPositivo(valor, 'O valor da sangria'), texto)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('caixa:suprimento', (contaId: number, valor: number, descricao: string) => {
    try {
      const sessao = requerSessao()
      const texto = String(descricao ?? '').trim()
      if (!texto) throw new Error('Diga de onde o dinheiro veio.')
      suprimento(Number(contaId), sessao.id, valorPositivo(valor, 'O valor do suprimento'), texto)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
