import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono, requerSessao } from '../sessao'
import {
  listarEmprestimos,
  buscarEmprestimoPorId,
  criarEmprestimo,
  registrarPagamentoEmprestimo,
  pagarParcelaEmprestimo,
  lancarAjuste,
  estornarLancamento,
  cancelarEmprestimo,
  resumoEmprestimos,
  moduloEmprestimosAtivo,
  definirModuloEmprestimos,
  type DadosEmprestimo,
  type DadosLancamento,
  type FiltroEmprestimos
} from '../db/queries/emprestimos'

// ── Por que TODO canal daqui exige gerente, inclusive os de leitura ───────────
// Contas a Pagar protege só a rota na interface: `contasPagar:listar` responde a
// qualquer sessão, e o que esconde a tela é o item de menu sumir. Para
// empréstimo isso não basta — a lista é "quem deve dinheiro ao patrão", e um
// técnico com acesso ao app não deveria conseguir puxá-la nem por curiosidade.
// Então a proteção mora no backend, onde não depende da tela ter sido escondida.
//
// A única exceção é `emprestimos:moduloAtivo`, que responde a qualquer sessão de
// propósito: o menu lateral é montado antes de saber o papel de quem entrou, e a
// resposta ("esta loja usa empréstimos") não conta nada sobre ninguém.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function textoOuNulo(v: unknown): string | null {
  const t = String(v ?? '').trim()
  return t === '' ? null : t
}

function dinheiro(v: unknown, campo: string): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${campo} deve ser maior que zero.`)
  return +n.toFixed(2)
}

function data(v: unknown, campo: string): string {
  const t = String(v ?? '').trim()
  if (!ISO_DATE.test(t)) throw new Error(`${campo} inválida.`)
  return t
}

function validarEmprestimo(payload: unknown): DadosEmprestimo {
  if (!payload || typeof payload !== 'object') throw new Error('Dados inválidos.')
  const p = payload as Record<string, unknown>

  const nome = textoOuNulo(p.devedor_nome)
  if (!nome) throw new Error('Informe quem está pegando o empréstimo.')

  const principal = dinheiro(p.valor_principal, 'O valor emprestado')
  const acordado = dinheiro(p.valor_acordado, 'O valor a receber')

  const modo = p.modo === 'carne' ? 'carne' : 'unico'

  let clienteId: number | null = null
  if (p.cliente_id != null && p.cliente_id !== '') {
    clienteId = Number(p.cliente_id)
    if (!Number.isInteger(clienteId)) throw new Error('Cliente inválido.')
  }

  const dados: DadosEmprestimo = {
    cliente_id: clienteId,
    devedor_nome: nome,
    devedor_documento: textoOuNulo(p.devedor_documento),
    valor_principal: principal,
    valor_acordado: acordado,
    modo,
    data_emprestimo: data(p.data_emprestimo, 'A data do empréstimo'),
    vencimento: null,
    observacao: textoOuNulo(p.observacao),
    criado_por: requerSessao().nome
  }

  if (modo === 'carne') {
    const n = Number(p.num_parcelas)
    if (!Number.isInteger(n) || n < 2) throw new Error('O carnê precisa de pelo menos 2 parcelas.')
    dados.num_parcelas = n
    dados.primeiro_vencimento = data(p.primeiro_vencimento, 'A data da primeira parcela')
  } else if (textoOuNulo(p.vencimento)) {
    dados.vencimento = data(p.vencimento, 'A data de vencimento')
  }

  return dados
}

function validarLancamento(payload: unknown): DadosLancamento {
  if (!payload || typeof payload !== 'object') throw new Error('Dados inválidos.')
  const p = payload as Record<string, unknown>
  return {
    valor: dinheiro(p.valor, 'O valor'),
    data: textoOuNulo(p.data) ? data(p.data, 'A data') : new Date().toISOString().slice(0, 10),
    forma_pagamento: textoOuNulo(p.forma_pagamento),
    observacao: textoOuNulo(p.observacao),
    criado_por: requerSessao().nome
  }
}

export function registrarHandlersEmprestimos(): void {
  registrarCanal('emprestimos:moduloAtivo', () => {
    try {
      return { success: true, data: moduloEmprestimosAtivo() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:definirModulo', (ativo: boolean) => {
    try {
      requerDono()
      definirModuloEmprestimos(ativo === true)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:listar', (filtro?: string) => {
    try {
      requerDono()
      const f: FiltroEmprestimos =
        filtro === 'aberto' || filtro === 'quitado' ? filtro : 'todos'
      return { success: true, data: listarEmprestimos(f) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:obter', (id: number) => {
    try {
      requerDono()
      const emp = buscarEmprestimoPorId(Number(id))
      if (!emp) throw new Error('Empréstimo não encontrado.')
      return { success: true, data: emp }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:resumo', () => {
    try {
      requerDono()
      return { success: true, data: resumoEmprestimos() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:criar', (dados: unknown) => {
    try {
      requerDono()
      const criado = criarEmprestimo(validarEmprestimo(dados))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: criado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:registrarPagamento', (id: number, dados: unknown) => {
    try {
      requerDono()
      registrarPagamentoEmprestimo(Number(id), validarLancamento(dados))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:pagarParcela', (parcelaId: number, dados: unknown) => {
    try {
      requerDono()
      pagarParcelaEmprestimo(Number(parcelaId), validarLancamento(dados))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:lancarAjuste', (id: number, tipo: string, dados: unknown) => {
    try {
      requerDono()
      if (tipo !== 'acrescimo' && tipo !== 'desconto') throw new Error('Tipo de ajuste inválido.')
      lancarAjuste(Number(id), tipo, validarLancamento(dados))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:estornarLancamento', (lancamentoId: number) => {
    try {
      requerDono()
      estornarLancamento(Number(lancamentoId))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('emprestimos:cancelar', (id: number, motivo: string) => {
    try {
      requerDono()
      cancelarEmprestimo(Number(id), String(motivo ?? ''))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
