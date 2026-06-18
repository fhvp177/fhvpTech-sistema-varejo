// Tools do chatbot: o que o modelo pode consultar no SQLite local. TODAS são
// read-only (resolvem em electron/db/queries/chat.ts). O app executa as tools
// localmente e devolve o resultado pro modelo via o proxy do backend.
//
// Tipos definidos localmente de propósito: o app NÃO depende do @anthropic-ai/sdk
// (quem fala com a Anthropic é o backend). Aqui só montamos JSON e lemos a
// resposta crua da Messages API.

import {
  buscarProdutos,
  giroProduto,
  vendasRecentes,
  clientesDevedores,
  resolverPeriodo,
  estatisticasVendas,
  produtosMaisVendidos,
  desempenhoVendedores,
  melhoresClientes,
  dividaCliente,
  totalAReceber
} from '../db/queries/chat'
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

// Parâmetros de período compartilhados pelas tools de análise. O modelo usa
// `periodo` (relativo) na maioria dos casos; inicio/fim cobrem intervalos exatos.
const PROPS_PERIODO: Record<string, unknown> = {
  periodo: {
    type: 'string',
    enum: ['hoje', 'ontem', 'ultimos_7_dias', 'ultimos_30_dias', 'este_mes', 'mes_passado', 'este_ano'],
    description: 'Período relativo (padrão "este_mes"). Ex.: "mês passado" → mes_passado.'
  },
  inicio: {
    type: 'string',
    description: 'Data inicial YYYY-MM-DD, para um intervalo específico (use junto com fim).'
  },
  fim: { type: 'string', description: 'Data final YYYY-MM-DD, inclusiva (use junto com inicio).' }
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
      'perguntas sobre as últimas vendas. Para inadimplência/cobrança/quem deve, use ' +
      'contas_a_receber (esta aqui só traz as mais recentes, não calcula atraso).',
    input_schema: {
      type: 'object',
      properties: {
        limite: { type: 'integer', description: 'Quantas vendas retornar (padrão 20, máx 100).' }
      }
    }
  },
  {
    name: 'contas_a_receber',
    description:
      'Lista, por cliente, o que ele deve à loja, separando "em_atraso" (vendas a prazo ou ' +
      'parcelas já VENCIDAS e não pagas = INADIMPLÊNCIA) de "a_vencer" (ainda dentro do prazo). ' +
      'Também traz "vencimento_mais_antigo" da parte em atraso e o telefone do cliente. Cobre ' +
      'vendas a prazo e parceladas. Use SEMPRE que perguntarem sobre inadimplentes, devedores, ' +
      'quem está em atraso, contas a receber ou cobrança. Para listar SOMENTE os inadimplentes ' +
      '(em atraso), passe apenas_em_atraso=true — não inclua quem só tem valor "a_vencer".',
    input_schema: {
      type: 'object',
      properties: {
        apenas_em_atraso: {
          type: 'boolean',
          description:
            'true = só clientes com valor em atraso (inadimplentes). false (padrão) = todos que devem.'
        },
        limite: { type: 'integer', description: 'Máximo de clientes (padrão 50, máx 200).' }
      }
    }
  },
  {
    name: 'resumo_loja',
    description:
      'Resumo do dia: número de vendas e faturamento de hoje, total de clientes e de produtos ' +
      'cadastrados. Use para uma visão geral rápida da loja.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'estatisticas_vendas',
    description:
      'Estatísticas de vendas de um PERÍODO: faturamento total, número de vendas, ticket médio, ' +
      'a MAIOR e a MENOR venda (com data e cliente), o melhor dia, e o total devolvido no período. ' +
      'Use para qualquer pergunta sobre desempenho ou resumo de um intervalo de tempo — ex.: ' +
      '"quanto faturei mês passado", "qual foi minha maior venda em maio", "ticket médio da semana", ' +
      '"qual meu melhor dia". O faturamento já é líquido de desconto.',
    input_schema: { type: 'object', properties: { ...PROPS_PERIODO } }
  },
  {
    name: 'produtos_mais_vendidos',
    description:
      'Ranking dos produtos mais vendidos num período (quantidade e receita de cada um). Use para ' +
      '"produto mais vendido", "o que mais saiu", "top 5 produtos do mês".',
    input_schema: {
      type: 'object',
      properties: {
        ...PROPS_PERIODO,
        limite: { type: 'integer', description: 'Quantos produtos no ranking (padrão 10, máx 50).' }
      }
    }
  },
  {
    name: 'desempenho_vendedores',
    description:
      'Vendas por vendedor num período: número de vendas e faturamento de cada um, do que mais ' +
      'vendeu ao que menos vendeu. Use para "qual vendedor vendeu mais", "quanto o João vendeu".',
    input_schema: { type: 'object', properties: { ...PROPS_PERIODO } }
  },
  {
    name: 'melhores_clientes',
    description:
      'Clientes que mais compraram num período (número de compras e total gasto). Use para ' +
      '"melhores clientes", "quem comprou mais". Ignora vendas avulsas (sem cliente).',
    input_schema: {
      type: 'object',
      properties: {
        ...PROPS_PERIODO,
        limite: { type: 'integer', description: 'Quantos clientes no ranking (padrão 10, máx 50).' }
      }
    }
  },
  {
    name: 'divida_cliente',
    description:
      'Detalha quanto UM cliente específico deve: total em atraso, total a vencer e a LISTA de cada ' +
      'venda/parcela em aberto (valor, vencimento e se está atrasada). Use quando perguntarem sobre a ' +
      'dívida de um cliente pelo nome — ex.: "quanto a Maria me deve", "o que o João tem em aberto". ' +
      'Casa por trecho do nome (pode retornar mais de um cliente). Lista vazia = nenhum cliente com ' +
      'esse nome; cliente com totais 0 = encontrado, mas sem nada em aberto.',
    input_schema: {
      type: 'object',
      properties: { nome: { type: 'string', description: 'Nome (ou parte) do cliente.' } },
      required: ['nome']
    }
  },
  {
    name: 'total_a_receber',
    description:
      'Total que a loja tem a receber agora, somado no banco: quanto está EM ATRASO (inadimplência), ' +
      'quanto está A VENCER, o total geral e quantos clientes devem algo. Use para "quanto tenho a ' +
      'receber", "qual minha inadimplência total", "quanto o pessoal me deve no total".',
    input_schema: { type: 'object', properties: {} }
  }
]

export type ResultadoTool = { conteudo: string; erro: boolean }

function ok(dados: unknown): ResultadoTool {
  return { conteudo: JSON.stringify(dados), erro: false }
}

// Extrai os campos de período da entrada crua do modelo, ignorando tipos errados.
function periodoDoInput(input: Record<string, unknown>): {
  periodo?: string
  inicio?: string
  fim?: string
} {
  return {
    periodo: typeof input.periodo === 'string' ? input.periodo : undefined,
    inicio: typeof input.inicio === 'string' ? input.inicio : undefined,
    fim: typeof input.fim === 'string' ? input.fim : undefined
  }
}

function numero(v: unknown, padrao: number): number {
  return typeof v === 'number' ? v : padrao
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
      case 'contas_a_receber':
        return ok(
          clientesDevedores(
            input.apenas_em_atraso === true,
            typeof input.limite === 'number' ? input.limite : 50
          )
        )
      case 'resumo_loja':
        return ok(resumoDashboard())
      case 'estatisticas_vendas':
        return ok(estatisticasVendas(resolverPeriodo(periodoDoInput(input))))
      case 'produtos_mais_vendidos':
        return ok(produtosMaisVendidos(resolverPeriodo(periodoDoInput(input)), numero(input.limite, 10)))
      case 'desempenho_vendedores':
        return ok(desempenhoVendedores(resolverPeriodo(periodoDoInput(input))))
      case 'melhores_clientes':
        return ok(melhoresClientes(resolverPeriodo(periodoDoInput(input)), numero(input.limite, 10)))
      case 'divida_cliente': {
        const nome = typeof input.nome === 'string' ? input.nome : ''
        if (!nome.trim()) return { conteudo: 'Informe o nome do cliente.', erro: true }
        return ok(dividaCliente(nome))
      }
      case 'total_a_receber':
        return ok(totalAReceber())
      default:
        return { conteudo: `Tool desconhecida: ${nome}`, erro: true }
    }
  } catch (e) {
    return { conteudo: `Erro ao consultar: ${(e as Error).message}`, erro: true }
  }
}
