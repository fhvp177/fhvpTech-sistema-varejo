import type { ReactNode } from 'react'
import nomeDaMarca from '@/assets/marca-nome.png'

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
 * ── ⭐ O nome é a IMAGEM da logo, não um texto parecido ──────────────────────
 * Antes o nome era escrito à mão em caixa alta com espaçamento largo, imitando
 * a logo de longe. O dono pediu o desenho de verdade, e o desenho vive só
 * dentro do PNG: então ele é recortado do próprio arquivo da logo
 * (`marca-nome.png`, o pedaço com as trilhas, o "FHVP" e o "TECH").
 *
 * ⚠️ E é por isso que a faixa é ESCURA nos dois temas. As letras do desenho são
 * brancas e o azul só tem contraste sobre o quase-preto em que foram
 * desenhadas; sobre fundo claro elas sumiriam. A cor não é escolha de gosto: é
 * `--marca`, lida do próprio arquivo da logo. O `theme-color` do
 * `index.web.html` aponta para o mesmo valor, e é isso que faz a barra de
 * status do aparelho continuar a faixa em vez de virar um retalho colado.
 *
 * O `alt` carrega o nome porque agora a imagem É o nome — quem usa leitor de
 * tela ouve "FHVP Tech", não "logo".
 */
export function BarraMarca({ children }: { children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-[15] flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 bg-marca px-4 lg:hidden">
      <img
        src={nomeDaMarca}
        alt="FHVP Tech"
        className="h-9 w-auto shrink-0 select-none"
        draggable={false}
      />

      {/*
        A ação da direita. O sino entra por aqui: o painel dele se ancora abaixo
        do próprio botão, então estando no topo ele abre para dentro da tela.

        ⚠️ As classes de cor vêm daqui, de fora, e não do sino: ele é do núcleo
        e serve os dois nichos, então não pode saber que existe uma faixa escura
        no varejo web. Um seletor de descendente ganha do `text-muted-foreground`
        que ele traz, sem tocar em uma linha do componente compartilhado.
      */}
      {children && (
        <div className="ml-auto shrink-0 [&_button]:text-white/75 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
          {children}
        </div>
      )}
    </div>
  )
}
