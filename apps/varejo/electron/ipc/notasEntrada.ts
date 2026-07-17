import { ipcMain, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  analisarNota,
  importarNotaEntrada,
  listarNotasEntrada,
  mesesComNotas,
  xmlsDoMes,
  type DadosImportacao,
  type ItemParaAnalise,
  type LinhaImportacao
} from '../db/queries/notasEntrada'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono } from '../sessao'

const CHAVE_NFE = /^\d{44}$/
const MES = /^\d{4}-\d{2}$/

const textoOuNull = (v: unknown): string | null => {
  const t = String(v ?? '').trim()
  return t ? t : null
}

const numeroPositivo = (v: unknown, campo: string): number => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${campo} inválido na importação.`)
  return n
}

const numeroNaoNegativo = (v: unknown, campo: string): number => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) throw new Error(`${campo} inválido na importação.`)
  return n
}

// O item da nota viaja do renderer já estruturado; aqui só garantimos os
// invariantes que protegem o banco (quantidade/custo numéricos, descrição).
function validarItemXml(v: unknown): {
  cprod: string
  descricao: string
  ncm: string | null
  cfop: string | null
  unidade: string | null
  quantidade: number
  custoUnitario: number
} {
  if (!v || typeof v !== 'object') throw new Error('Item da nota inválido.')
  const i = v as Record<string, unknown>
  const descricao = String(i.descricao ?? '').trim()
  if (!descricao) throw new Error('Item da nota sem descrição.')
  return {
    cprod: String(i.cprod ?? '').trim(),
    descricao,
    ncm: textoOuNull(i.ncm),
    cfop: textoOuNull(i.cfop),
    unidade: textoOuNull(i.unidade),
    quantidade: numeroPositivo(i.quantidade, `Quantidade de "${descricao}"`),
    custoUnitario: numeroNaoNegativo(i.custoUnitario, `Custo de "${descricao}"`)
  }
}

function validarLinha(v: unknown): LinhaImportacao {
  if (!v || typeof v !== 'object') throw new Error('Linha de importação inválida.')
  const l = v as Record<string, unknown>

  if (l.tipo === 'novo') {
    const nome = String(l.nome ?? '').trim()
    if (!nome) throw new Error('Produto novo sem nome.')
    const variacoesBrutas = Array.isArray(l.variacoes) ? l.variacoes : []
    const variacoes = variacoesBrutas.map((vb) => {
      const vr = vb as Record<string, unknown>
      const tamanho = String(vr.tamanho ?? '').trim()
      const codigo = String(vr.codigo_barras ?? '').trim()
      if (!tamanho || !codigo) throw new Error(`Grade de "${nome}" com tamanho/código vazio.`)
      return { tamanho, codigo_barras: codigo, item: validarItemXml(vr.item) }
    })
    const codigoBarras = textoOuNull(l.codigo_barras)
    if (variacoes.length === 0 && !codigoBarras) {
      throw new Error(`Produto novo "${nome}" sem código de barras.`)
    }
    return {
      tipo: 'novo',
      nome,
      categoria: textoOuNull(l.categoria),
      preco: numeroPositivo(l.preco, `Preço de "${nome}"`),
      custo: numeroNaoNegativo(l.custo, `Custo de "${nome}"`),
      codigo_barras: variacoes.length > 0 ? null : codigoBarras,
      item: variacoes.length > 0 ? undefined : validarItemXml(l.item),
      variacoes: variacoes.length > 0 ? variacoes : undefined
    }
  }

  if (l.tipo === 'reposicao') {
    const produtoId = Number(l.produto_id)
    if (!Number.isInteger(produtoId)) throw new Error('Reposição sem produto válido.')
    const variacaoId = l.variacao_id == null ? null : Number(l.variacao_id)
    if (variacaoId !== null && !Number.isInteger(variacaoId)) {
      throw new Error('Reposição com tamanho inválido.')
    }
    return {
      tipo: 'reposicao',
      produto_id: produtoId,
      variacao_id: variacaoId,
      novo_custo: numeroNaoNegativo(l.novo_custo, 'Custo da reposição'),
      novo_preco: l.novo_preco == null ? null : numeroPositivo(l.novo_preco, 'Preço da reposição'),
      item: validarItemXml(l.item)
    }
  }

  throw new Error('Linha de importação com tipo desconhecido.')
}

function validarImportacao(payload: unknown): DadosImportacao {
  if (!payload || typeof payload !== 'object') throw new Error('Dados de importação inválidos.')
  const p = payload as Record<string, unknown>

  const nota = (p.nota ?? {}) as Record<string, unknown>
  const chave = String(nota.chave ?? '').trim()
  if (!CHAVE_NFE.test(chave)) throw new Error('Chave de acesso da nota inválida.')
  const xml = String(nota.xml ?? '')
  if (!xml.trim()) throw new Error('XML da nota ausente.')

  const forn = (p.fornecedor ?? {}) as Record<string, unknown>
  const fornNome = String(forn.nome ?? '').trim()
  if (!fornNome) throw new Error('Fornecedor sem nome.')
  const fornId = forn.id == null ? null : Number(forn.id)
  if (fornId !== null && !Number.isInteger(fornId)) throw new Error('Fornecedor inválido.')

  const linhasBrutas = Array.isArray(p.linhas) ? p.linhas : []
  if (linhasBrutas.length === 0) throw new Error('Nenhum item selecionado pra importar.')
  const linhas = linhasBrutas.map(validarLinha)

  let margemUsada: DadosImportacao['margemUsada']
  if (p.margemUsada && typeof p.margemUsada === 'object') {
    const m = p.margemUsada as Record<string, unknown>
    const valor = Number(m.valor)
    if (Number.isFinite(valor) && valor >= 0) {
      margemUsada = { valor, tipo: m.tipo === 'reais' ? 'reais' : 'pct' }
    }
  }

  return {
    nota: {
      chave,
      numero: textoOuNull(nota.numero),
      serie: textoOuNull(nota.serie),
      modelo: textoOuNull(nota.modelo),
      dataEmissao: textoOuNull(nota.dataEmissao),
      valorTotal: numeroNaoNegativo(nota.valorTotal, 'Valor total da nota'),
      xml
    },
    fornecedor: {
      id: fornId,
      nome: fornNome,
      cnpj: textoOuNull(forn.cnpj),
      telefone: textoOuNull(forn.telefone),
      endereco: textoOuNull(forn.endereco)
    },
    linhas,
    margemUsada
  }
}

export function registrarHandlersNotasEntrada(): void {
  ipcMain.handle(
    'notasEntrada:analisar',
    (_event, chave: string, fornecedorCnpj: string | null, itens: ItemParaAnalise[]) => {
      try {
        requerDono()
        const c = String(chave ?? '').trim()
        if (!CHAVE_NFE.test(c)) throw new Error('Chave de acesso da nota inválida.')
        const lista = (Array.isArray(itens) ? itens : []).map((i) => ({
          nItem: Number(i?.nItem) || 0,
          cprod: String(i?.cprod ?? '').trim(),
          ean: i?.ean ? String(i.ean).trim() : null
        }))
        return { success: true, data: analisarNota(c, fornecedorCnpj ?? null, lista) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('notasEntrada:importar', (_event, payload: unknown) => {
    try {
      requerDono()
      const resultado = importarNotaEntrada(validarImportacao(payload))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('notasEntrada:listar', (_event, mes?: string) => {
    try {
      requerDono()
      const m = mes && MES.test(mes) ? mes : undefined
      return { success: true, data: listarNotasEntrada(m) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('notasEntrada:meses', () => {
    try {
      requerDono()
      return { success: true, data: mesesComNotas() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Salva os XMLs originais do mês numa pasta que o lojista escolhe — é o que
  // o contador pede: o arquivo fiscal oficial, não um relatório nosso.
  ipcMain.handle('notasEntrada:exportarXmls', async (_event, mes: string) => {
    try {
      requerDono()
      if (!MES.test(String(mes ?? ''))) throw new Error('Mês inválido.')
      const notas = xmlsDoMes(mes)
      if (notas.length === 0) throw new Error('Nenhuma nota importada neste mês.')

      const resultado = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: `Escolher pasta pros XMLs de ${mes}`
      })
      if (resultado.canceled || resultado.filePaths.length === 0) {
        return { success: true, data: null } // lojista desistiu — não é erro
      }

      const pasta = resultado.filePaths[0]
      for (const nota of notas) {
        writeFileSync(join(pasta, `NFe-${nota.chave}.xml`), nota.xml, 'utf-8')
      }
      return { success: true, data: { pasta, quantidade: notas.length } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
