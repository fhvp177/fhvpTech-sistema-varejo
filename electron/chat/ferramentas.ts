// Tools do chatbot: o que o modelo pode consultar no SQLite local. TODAS são
// read-only (resolvem em electron/db/queries/chat.ts). O app executa as tools
// localmente e devolve o resultado pro modelo via o proxy do backend.
//
// Tipos definidos localmente de propósito: o app NÃO depende do @anthropic-ai/sdk
// (quem fala com a Anthropic é o backend). Aqui só montamos JSON e lemos a
// resposta crua da Messages API.

import { buscarProdutos, giroProduto, vendasRecentes } from '../db/queries/chat'
import { resumoDashboard } from '../db/queries/vendas'

export type DefinicaoTool = {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// Descrições prescritivas ("use quando…") — modelos recentes acionam tools com
// base nelas. Texto em PT-BR porque a conversa é em português.
export const TOOLS: DefinicaoTool[] = [
  {
    name: 'buscar_produtos',
    description:
      'Busca produtos do estoque por trecho do nome ou categoria e retorna preço de VENDA, ' +
      'quantidade em estoque, categoria e fornecedor. Use quando o lojista perguntar sobre ' +
      'preço, estoque ou disponibilidade de um item. Atenção: o sistema NÃO armazena custo de ' +
      'compra nem margem — só o preço de venda.',
    input_schema: {
      type: 'object',
      properties: {
        termo: {
          type: 'string',
          description: 'Trecho do nome ou categoria. Vazio retorna os primeiros produtos.'
        }
      }
    }
  },
  {
    name: 'giro_produto',
    description:
      'Quantas unidades de um produto saíram (foram vendidas) nos últimos N dias, junto do ' +
      'estoque atual. Use para avaliar velocidade de venda / giro e decidir reposição.',
    input_schema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Trecho do nome do produto.' },
        dias: {
          type: 'integer',
          description: 'Janela em dias para somar as vendas (padrão 30).'
        }
      },
      required: ['termo']
    }
  },
  {
    name: 'vendas_recentes',
    description:
      'Lista as vendas mais recentes (data, cliente, total, status de pagamento). Use para ' +
      'perguntas sobre últimas vendas, vendas em aberto ou inadimplência recente.',
    input_schema: {
      type: 'object',
      properties: {
        limite: { type: 'integer', description: 'Quantas vendas retornar (padrão 20, máx 100).' }
      }
    }
  },
  {
    name: 'resumo_loja',
    description:
      'Resumo do dia: número de vendas e faturamento de hoje, total de clientes e de produtos ' +
      'cadastrados. Use para uma visão geral rápida da loja.',
    input_schema: { type: 'object', properties: {} }
  }
]

export type ResultadoTool = { conteudo: string; erro: boolean }

function ok(dados: unknown): ResultadoTool {
  return { conteudo: JSON.stringify(dados), erro: false }
}

// Executa a tool pedida pelo modelo. Captura erro e devolve como is_error pro
// modelo se recuperar, em vez de derrubar o loop.
export function executarTool(nome: string, input: Record<string, unknown>): ResultadoTool {
  try {
    switch (nome) {
      case 'buscar_produtos':
        return ok(buscarProdutos(typeof input.termo === 'string' ? input.termo : undefined))
      case 'giro_produto': {
        const termo = typeof input.termo === 'string' ? input.termo : ''
        if (!termo.trim()) return { conteudo: 'Informe o termo do produto.', erro: true }
        const dias = typeof input.dias === 'number' ? input.dias : 30
        return ok(giroProduto(termo, dias))
      }
      case 'vendas_recentes':
        return ok(vendasRecentes(typeof input.limite === 'number' ? input.limite : 20))
      case 'resumo_loja':
        return ok(resumoDashboard())
      default:
        return { conteudo: `Tool desconhecida: ${nome}`, erro: true }
    }
  } catch (e) {
    return { conteudo: `Erro ao consultar: ${(e as Error).message}`, erro: true }
  }
}
