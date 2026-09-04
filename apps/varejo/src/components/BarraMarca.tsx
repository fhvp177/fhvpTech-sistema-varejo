import logoEmpresa from '@/assets/logo.png'

/**
 * A faixa de topo do celular: a marca, e nada mais.
 *
 * ── Por que ela existe ───────────────────────────────────────────────────────
 * No Kiko é a primeira coisa da página, e é um dos motivos de ele parecer
 * aplicativo e não site: uma linha só, sempre no topo, dizendo de quem é aquilo.
 * Antes daqui havia uma faixa branca de 48px que só carregava um sino — gastava
 * a mesma altura sem dizer nada.
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
export function BarraMarca() {
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
      */}
      <span className="text-[15px] font-semibold uppercase tracking-[0.14em] text-foreground">
        FHVP <span className="text-primary">Tech</span>
      </span>
    </div>
  )
}
