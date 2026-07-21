import {
  Sparkles, ShoppingCart, Package, FileUp, Users, Undo2, Receipt, Printer,
  BarChart3, Tags, MessageCircle, Bell, ShieldCheck
} from 'lucide-react'
import type { SlideGuia } from '@fhvptech/core/ui/GuiaBoasVindas'

// Monta os slides do guia de boas-vindas do varejo — o tour completo: quem
// nunca viu o sistema termina o guia sabendo tudo que ele faz. Slides de
// features opcionais (Dashboard, Etiquetas, Assistente IA) só entram se a
// EDIÇÃO os tiver ligados — assim o tutorial nunca mostra algo que aquele
// build não tem.
export function construirSlidesGuia(): SlideGuia[] {
  const slides: SlideGuia[] = [
    {
      icone: <Sparkles className="w-8 h-8" />,
      corIcone: 'bg-blue-100 text-blue-600',
      titulo: 'Bem-vindo ao FHVP Tech',
      descricao:
        'Seu sistema de gestão de loja, completo e fácil: caixa, estoque, clientes, contas e relatórios num lugar só. Em dois minutos, este tour mostra tudo que ele faz por você.'
    },
    {
      icone: <ShoppingCart className="w-8 h-8" />,
      corIcone: 'bg-emerald-100 text-emerald-600',
      titulo: 'Venda em segundos',
      descricao:
        'A tela de Vendas é seu caixa: bipe o código de barras ou digite a referência curta do produto (ex.: "10" + Enter) e ele cai no carrinho. À vista, fiado ou parcelado, com cupom na hora. Cliente perguntou o preço? Aperte F2 e consulte sem mexer na venda.'
    },
    {
      icone: <Package className="w-8 h-8" />,
      corIcone: 'bg-orange-100 text-orange-600',
      titulo: 'Controle seu estoque',
      descricao:
        'Cadastre produtos com preço, custo e quantidade — cada um ganha uma referência curta pra achar sem leitor. Roupas têm grade de tamanhos (P ao GG, com estoque por tamanho), e o sistema avisa sozinho quando algo está acabando.'
    },
    {
      icone: <FileUp className="w-8 h-8" />,
      corIcone: 'bg-sky-100 text-sky-600',
      titulo: 'Importe a nota do fornecedor',
      descricao:
        'Chegou mercadoria? Arraste o XML da nota fiscal pra dentro do sistema: ele cadastra os produtos, o fornecedor e o custo real (com frete e impostos), e você só diz quanto quer de lucro. Na recompra, ele reconhece os itens e repõe o estoque sozinho.'
    },
    {
      icone: <Users className="w-8 h-8" />,
      corIcone: 'bg-purple-100 text-purple-600',
      titulo: 'Clientes e fiado',
      descricao:
        'Cadastre clientes, venda no fiado ou parcelado com tranquilidade e receba os pagamentos direto no sistema. Você vê quem está devendo, o que vence hoje e o que atrasou — sem caderninho.'
    },
    {
      icone: <Undo2 className="w-8 h-8" />,
      corIcone: 'bg-amber-100 text-amber-600',
      titulo: 'Trocas e devoluções',
      descricao:
        'Cliente voltou com o produto? Registre a troca ou devolução em cima da venda original: o estoque volta sozinho e o valor vira crédito ou devolução — tudo com histórico de quem fez e quando.'
    },
    {
      icone: <Receipt className="w-8 h-8" />,
      corIcone: 'bg-red-100 text-red-600',
      titulo: 'Contas a pagar',
      descricao:
        'Anote tudo que a loja deve — fornecedor, aluguel, luz, salário — com valor e vencimento. O sistema mostra o que está vencido e o que vence em breve, e o painel fecha a conta: quanto entra e quanto sai.'
    },
    {
      icone: <Printer className="w-8 h-8" />,
      corIcone: 'bg-teal-100 text-teal-600',
      titulo: 'Relatórios prontos',
      descricao:
        'Uma aba só de Relatórios: vendas do mês, balanço de estoque, tabela de referências pro balcão e as compras por nota fiscal — tudo em PDF ou direto na impressora. E os XMLs das notas saem prontinhos pra mandar pro contador.'
    }
  ]

  if (__FEAT_DASHBOARD__) {
    slides.push({
      icone: <BarChart3 className="w-8 h-8" />,
      corIcone: 'bg-indigo-100 text-indigo-600',
      titulo: 'Enxergue seu negócio',
      descricao:
        'A Dashboard mostra faturamento, lucro, ticket médio, ranking de vendedores e muito mais — para você decidir com dados, não no achismo.'
    })
  }

  if (__FEAT_ETIQUETAS__) {
    slides.push({
      icone: <Tags className="w-8 h-8" />,
      corIcone: 'bg-rose-100 text-rose-600',
      titulo: 'Etiquetas com código',
      descricao:
        'Gere folhas A4 de etiquetas com código de barras dos seus produtos e agilize ainda mais a venda no caixa.'
    })
  }

  if (__FEAT_CHATBOT__) {
    slides.push({
      icone: <MessageCircle className="w-8 h-8" />,
      corIcone: 'bg-cyan-100 text-cyan-600',
      titulo: 'Seu assistente de IA',
      descricao:
        'Pergunte em português, como você falaria com alguém: "quanto vendi essa semana?", "quais produtos estão parados?" — e ele responde na hora.'
    })
  }

  slides.push(
    {
      icone: <Bell className="w-8 h-8" />,
      corIcone: 'bg-yellow-100 text-yellow-600',
      titulo: 'O sistema te avisa',
      descricao:
        'O sino no topo lembra do que importa: dinheiro pra receber, conta vencendo, estoque acabando, backup com problema. Você não precisa vigiar nada — é ele que te procura.'
    },
    {
      icone: <ShieldCheck className="w-8 h-8" />,
      corIcone: 'bg-slate-100 text-slate-600',
      titulo: 'Seus dados seguros',
      descricao:
        'Backup automático protege tudo, o acesso é trancado por PIN e cada vendedor tem o seu — com as telas do gerente (dinheiro e configurações) reservadas ao gerente. Precisou de ajuda? O suporte está a um clique no menu lateral. Bora começar!'
    }
  )

  return slides
}
