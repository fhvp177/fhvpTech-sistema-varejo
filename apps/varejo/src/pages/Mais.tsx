import { useNavigate } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'

/**
 * A aba "Mais": o que não coube nas quatro primeiras.
 *
 * ── Por que é uma PÁGINA, e não um menu que abre por cima ────────────────────
 * Roteiro do mobile, §5.1: ou hambúrguer, ou barra inferior — não os dois. Duas
 * navegações concorrentes ensinam duas rotas para a mesma coisa e nenhuma das
 * duas bem, e foi assim que o celular ficou com a gaveta E a barra ao mesmo
 * tempo (defeito nº 7 do diagnóstico).
 *
 * Sendo página, ela ganha de graça o que um menu sobreposto não tem: o botão
 * "voltar" do aparelho funciona, o endereço é compartilhável, e ela rola sem
 * disputar o gesto com a lista de trás.
 *
 * ── Por que a lista vem de fora ──────────────────────────────────────────────
 * As seções são as MESMAS da barra lateral do desktop, com as mesmas regras de
 * quem pode ver o quê. Reescrevê-las aqui criaria uma segunda lista para
 * esquecer de atualizar: no dia em que uma aba nova nascesse, ela apareceria no
 * desktop e sumiria no celular, sem ninguém perceber.
 */
export type SecaoMais = {
  titulo: string
  itens: { to: string; label: string; icon: LucideIcon }[]
}

export default function Mais({ secoes }: { secoes: SecaoMais[] }) {
  const navegar = useNavigate()

  return (
    /*
      `entrada-escalonada`: as seções sobem e aparecem uma após a outra, como
      no Painel. Ela nasceu antes dessa regra existir e ficava sendo a única
      aba a piscar inteira de uma vez.
    */
    <div className="entrada-escalonada p-4 space-y-6">
      {secoes.map((secao) => (
        <section key={secao.titulo}>
          {/*
            Rótulo de seção do roteiro (§5.2): 11px, caixa alta espaçada, cinza.
            Uma linha de 15px de altura que faz o trabalho que um título de 34px
            estava tentando fazer.
          */}
          <h2 className="text-[11px] font-semibold tracking-[0.10em] uppercase text-muted-foreground mb-2">
            {secao.titulo}
          </h2>

          {/* 12px, o mesmo canto de todo cartão da reforma. */}
          <div className="rounded-xl border bg-card overflow-hidden">
            {secao.itens.map((item, i) => {
              const Icone = item.icon
              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => navegar(item.to)}
                  /*
                    56px de altura: acima dos 44 que o dedo pede, porque aqui a
                    lista é percorrida com o polegar em movimento. O `w-full` +
                    `text-left` é o que faz a linha inteira ser o alvo, e não só
                    o texto dentro dela.
                  */
                  className={`w-full min-h-[56px] flex items-center gap-3 px-4 py-3 text-left active:bg-muted ${
                    i > 0 ? 'border-t' : ''
                  }`}
                >
                  <Icone className="w-[18px] h-[18px] text-muted-foreground shrink-0" />
                  {/*
                    `min-w-0` é obrigatório: sem ele um rótulo longo se recusa a
                    encolher abaixo do próprio conteúdo e estoura a linha para
                    fora da tela. É uma das três causas de rolagem horizontal
                    que o roteiro nomeia (§11).
                  */}
                  <span className="flex-1 min-w-0 truncate">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
