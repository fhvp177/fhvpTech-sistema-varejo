import type { ReactNode } from 'react'
import logoEmpresa from '@/assets/logo.png'

/**
 * A faixa de topo do celular: a marca à esquerda, e o que for de ação à direita.
 *
 * ── Por que ela existe ───────────────────────────────────────────────────────
 * No Kiko é a primeira coisa da página, e é um dos motivos de ele parecer
 * aplicativo e não site: uma linha só, sempre no topo, dizendo de quem é aquilo.
 * Antes daqui havia uma faixa branca de 48px que só carregava um sino — gastava
 * a mesma altura sem dizer nada.
 *
 * ⚠️ É UMA faixa, não duas. Quando o sino saiu daqui para flutuar, a tira
 * antiga continuou renderizando vazia logo acima desta, e o celular ficou com
 * duas barras brancas empilhadas. Se um dia algo voltar para o topo, volta para
 * DENTRO desta.
 *
 * ── Grudenta, e por baixo da navegação ───────────────────────────────────────
 * `sticky` porque a marca não pode sumir ao rolar; `z-index` abaixo do 20 da
 * ilha porque a faixa nunca deve cobrir a navegação.
 *
 * ── Sobre a fonte ────────────────────────────────────────────────────────────
 * ⚠️ A tipografia exata da logo NÃO está no projeto — o desenho dela vive só
 * dentro do PNG. O que dá para fazer sem chutar é usar a própria imagem como
 * símbolo e compor o nome ao lado com a MESMA geometria: caixa alta, traço
 * largo entre letras e o azul da marca no "Tech", que é como a logo separa as
 * duas palavras. Se você me passar o arquivo da fonte, eu troco e fica idêntico.
 */
export function BarraMarca({ children }: { children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-[15] flex h-14 shrink-0 items-center gap-2.5 border-b bg-background px-4 lg:hidden">
      <img
        src={logoEmpresa}
        alt=""
        aria-hidden="true"
        className="h-8 w-8 shrink-0 rounded-full object-contain"
      />
      {/*
        O nome é um texto de verdade, e não um recorte da imagem: assim ele
        acompanha o tema escuro, o leitor de tela o lê, e não fica borrado numa
        tela de densidade alta.

        `min-w-0` + `truncate`: numa tela de 360 com o sino do lado, um nome
        maior encolhe em vez de empurrar o sino para fora.
      */}
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold uppercase tracking-[0.14em] text-foreground">
        FHVP <span className="text-primary">Tech</span>
      </span>

      {/*
        A ação da direita. O sino entra por aqui: o painel dele se ancora abaixo
        do próprio botão, então estando no topo ele abre para dentro da tela.
      */}
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}
