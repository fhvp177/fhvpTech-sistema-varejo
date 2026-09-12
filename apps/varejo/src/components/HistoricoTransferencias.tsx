import { FC, useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react'
import { Select } from '@fhvptech/core/ui/select'
import EstadoVazio from '@fhvptech/core/ui/EstadoVazio'

/**
 * O histórico de transferências entre as contas da loja.
 *
 * ── Por que aqui, e não numa aba nova ───────────────────────────────────────
 * Transferência não é venda nem despesa: ela não aparece em nenhum dos totais
 * do mês, de propósito (ver a migration 055). Justamente por isso ela precisa
 * de um lugar onde se possa olhar — senão o lojista vê o saldo de uma conta
 * cair e não encontra a explicação em canto nenhum.
 *
 * Fica junto do resumo financeiro porque é a mesma pergunta: "para onde foi o
 * dinheiro este mês?". E fica FECHADA por padrão, porque a maioria das lojas
 * transfere pouco e o resumo do mês é o que se vem ver aqui.
 *
 * ── ⚠️ Sem totais somados ───────────────────────────────────────────────────
 * Não existe "total transferido no mês" nesta tela, e a falta é deliberada:
 * somar dez transferências de mil reais entre as mesmas duas contas daria
 * "R$ 10.000" com cara de movimento, quando a loja tem o mesmo dinheiro do
 * começo. O que informa aqui é cada linha, não a soma delas.
 */

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDataHora = (iso: string): string =>
  new Date(iso.replace(' ', 'T')).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  })

const rotuloMes = (mes: string): string => {
  const [ano, m] = mes.split('-')
  const nomes = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]
  return `${nomes[Number(m) - 1]} de ${ano}`
}

const HistoricoTransferencias: FC = () => {
  const [aberto, setAberto] = useState(false)
  const [meses, setMeses] = useState<string[]>([])
  const [mes, setMes] = useState('')
  const [lista, setLista] = useState<Transferencia[]>([])
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async (m: string) => {
    setCarregando(true)
    const r = await window.api.financeiro.listarTransferencias(m || undefined)
    if (r.success) setLista(r.data)
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Só busca quando alguém abre: numa loja que nunca transfere, esta consulta
    // rodaria a cada visita à tela de Relatórios para desenhar uma lista vazia.
    if (!aberto) return
    void window.api.financeiro.mesesComTransferencia().then((r) => {
      if (r.success) setMeses(r.data)
    })
    void carregar(mes)
  }, [aberto, mes, carregar])

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {aberto ? (
          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
        )}
        <ArrowLeftRight className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 min-w-0 font-semibold">Transferências entre contas</span>
        <span className="shrink-0 text-[12.5px] text-muted-foreground">
          {aberto ? '' : 'dinheiro que mudou de conta'}
        </span>
      </button>

      {aberto && (
        <div className="border-t px-4 py-3">
          <div className="mb-3 max-w-xs">
            <Select
              value={mes}
              onChange={setMes}
              opcoes={[
                { valor: '', rotulo: 'Mais recentes' },
                ...meses.map((m) => ({ valor: m, rotulo: rotuloMes(m) }))
              ]}
            />
          </div>

          {carregando ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <EstadoVazio
              icone={<ArrowLeftRight className="w-6 h-6" />}
              dica="Use o botão Transferir na aba Contas para mover dinheiro entre elas."
            >
              Nenhuma transferência registrada.
            </EstadoVazio>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Quando</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Saiu de</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Entrou em</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Valor</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Observação</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Quem fez</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((t, i) => (
                    <tr key={t.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {fmtDataHora(t.criada_em)}
                      </td>
                      <td className="px-3 py-2">{t.conta_origem_nome}</td>
                      <td className="px-3 py-2">{t.conta_destino_nome}</td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {fmt(t.valor)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{t.observacao || '—'}</td>
                      {/* Venda antiga da loja pode não ter vendedor: travessão em
                          vez de espaço em branco, para não parecer dado faltando. */}
                      <td className="px-3 py-2 text-muted-foreground">{t.vendedor_nome || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default HistoricoTransferencias
