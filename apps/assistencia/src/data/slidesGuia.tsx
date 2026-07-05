import {
  Sparkles, ShoppingCart, Package, Users, BarChart3, Tags, MessageCircle, ShieldCheck
} from 'lucide-react'
import type { SlideGuia } from '@fhvptech/core/ui/GuiaBoasVindas'

// Monta os slides do guia de boas-vindas da assistência técnica. Slides de features opcionais
// (Dashboard, Etiquetas, Assistente IA) só entram se a EDIÇÃO os tiver ligados —
// assim o tutorial nunca mostra algo que aquele build não tem.
export function construirSlidesGuia(): SlideGuia[] {
  const slides: SlideGuia[] = [
    {
      icone: <Sparkles className="w-8 h-8" />,
      corIcone: 'bg-blue-100 text-blue-600',
      titulo: 'Bem-vindo ao FHVP Tech',
      descricao:
        'Seu sistema de gestão da assistência técnica, completo e fácil. Em menos de um minuto, vou te mostrar tudo que ele faz por você.'
    },
    {
      icone: <ShoppingCart className="w-8 h-8" />,
      corIcone: 'bg-emerald-100 text-emerald-600',
      titulo: 'Venda em segundos',
      descricao:
        'A tela de Vendas é seu caixa: bipe o código de barras ou busque o produto, escolha à vista, a prazo (fiado) ou parcelado, e imprima o cupom na hora.'
    },
    {
      icone: <Package className="w-8 h-8" />,
      corIcone: 'bg-orange-100 text-orange-600',
      titulo: 'Controle seu estoque',
      descricao:
        'Cadastre produtos com preço e quantidade e receba alertas automáticos quando algo estiver acabando.'
    },
    {
      icone: <Users className="w-8 h-8" />,
      corIcone: 'bg-purple-100 text-purple-600',
      titulo: 'Clientes e fiado',
      descricao:
        'Cadastre clientes, venda no fiado com tranquilidade e acompanhe quem está devendo e o que vence hoje — sem caderninho.'
    }
  ]

  if (__FEAT_DASHBOARD__) {
    slides.push({
      icone: <BarChart3 className="w-8 h-8" />,
      corIcone: 'bg-indigo-100 text-indigo-600',
      titulo: 'Enxergue seu negócio',
      descricao:
        'A Dashboard mostra faturamento, lucro, ticket médio, ranking de técnicos e muito mais — para você decidir com dados, não no achismo.'
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

  slides.push({
    icone: <ShieldCheck className="w-8 h-8" />,
    corIcone: 'bg-slate-100 text-slate-600',
    titulo: 'Seus dados seguros',
    descricao:
      'O backup automático protege tudo e o acesso é trancado por PIN. Precisou de ajuda? O suporte está a um clique no menu lateral. Bora começar!'
  })

  return slides
}
