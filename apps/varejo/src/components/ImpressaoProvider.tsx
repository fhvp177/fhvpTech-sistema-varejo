import { createContext, useCallback, useContext, useEffect, useRef, useState, type FC, type ReactNode } from 'react'
import { Printer } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { Button } from '@fhvptech/core/ui/button'
import { Label } from '@fhvptech/core/ui/label'
import { useToast } from '@fhvptech/core/ui/toast'

type Impressora = { name: string; displayName: string; isDefault: boolean }

// Tipo de documento → decide qual impressora preferida / "imprimir direto" usar.
// 'cupom' = recibos térmicos (venda, devolução); 'documento' = relatórios + etiquetas A4.
export type CategoriaImpressao = 'cupom' | 'documento'

// Abre o diálogo de impressão no tema do sistema (ou pula, no modo direto) e
// imprime na impressora certa. Resolve `true` se imprimiu, `false` se cancelou.
type ImprimirFn = (html: string, nomeBase: string, categoria: CategoriaImpressao) => Promise<boolean>
// Variante que imprime a JANELA ATUAL (DOM + @media print) — usada pelas Etiquetas A4.
type ImprimirJanelaFn = (nomeBase: string, categoria: CategoriaImpressao) => Promise<boolean>

type ImpressaoContextValue = {
  imprimir: ImprimirFn
  imprimirJanela: ImprimirJanelaFn
}

const ImpressaoContext = createContext<ImpressaoContextValue | null>(null)

export function useImprimir(): ImprimirFn {
  const ctx = useContext(ImpressaoContext)
  if (!ctx) throw new Error('useImprimir deve ser usado dentro de ImpressaoProvider')
  return ctx.imprimir
}

export function useImprimirJanela(): ImprimirJanelaFn {
  const ctx = useContext(ImpressaoContext)
  if (!ctx) throw new Error('useImprimirJanela deve ser usado dentro de ImpressaoProvider')
  return ctx.imprimirJanela
}

type Spec =
  | { tipo: 'html'; html: string; nome: string; categoria: CategoriaImpressao }
  | { tipo: 'janela'; nome: string; categoria: CategoriaImpressao }

type Pendente = Spec & { preferido: string }

export const ImpressaoProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { showToast } = useToast()
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [impressoras, setImpressoras] = useState<Impressora[]>([])
  const [selecionada, setSelecionada] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [imprimindo, setImprimindo] = useState(false)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  // Dispara a impressão de fato (HTML em janela oculta OU a janela atual).
  const executar = useCallback((spec: Spec, deviceName: string) => {
    return spec.tipo === 'html'
      ? window.api.impressao.imprimir(spec.html, spec.nome, deviceName)
      : window.api.impressao.imprimirJanela(deviceName)
  }, [])

  const iniciar = useCallback(
    async (spec: Spec): Promise<boolean> => {
      const respPrefs = await window.api.impressao.obterPreferencias()
      const pref = respPrefs.success
        ? respPrefs.data[spec.categoria]
        : { printer: '', direto: false }

      // Modo direto: pula o diálogo e imprime na impressora salva.
      if (pref.direto && pref.printer) {
        const resp = await executar(spec, pref.printer)
        if (resp.success) return true
        // Falhou (offline/desinstalada) → cai no diálogo pra escolher outra.
        showToast({
          message: 'Não consegui imprimir direto. Escolha a impressora.',
          variant: 'destructive'
        })
      }

      // Abre o diálogo, pré-selecionando a impressora preferida.
      return new Promise<boolean>((resolve) => {
        resolverRef.current?.(false)
        resolverRef.current = resolve
        setPendente({ ...spec, preferido: pref.printer })
      })
    },
    [executar, showToast]
  )

  const imprimir = useCallback<ImprimirFn>(
    (html, nomeBase, categoria) => iniciar({ tipo: 'html', html, nome: nomeBase, categoria }),
    [iniciar]
  )
  const imprimirJanela = useCallback<ImprimirJanelaFn>(
    (nomeBase, categoria) => iniciar({ tipo: 'janela', nome: nomeBase, categoria }),
    [iniciar]
  )

  // Busca as impressoras quando o diálogo abre e pré-seleciona a preferida.
  useEffect(() => {
    if (!pendente) return
    let cancelado = false
    setCarregando(true)
    window.api.impressao.listarImpressoras().then((resp) => {
      if (cancelado) return
      const lista = resp.success ? resp.data : []
      setImpressoras(lista)
      const preferida = lista.find((i) => i.name === pendente.preferido)
      const padrao = preferida ?? lista.find((i) => i.isDefault) ?? lista[0]
      setSelecionada(padrao?.name ?? '')
      setCarregando(false)
    })
    return () => {
      cancelado = true
    }
  }, [pendente])

  const fechar = useCallback((ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setPendente(null)
    setImprimindo(false)
  }, [])

  const confirmar = useCallback(async () => {
    if (!pendente || !selecionada) return
    setImprimindo(true)
    const resp = await executar(pendente, selecionada)
    if (!resp.success) {
      showToast({ message: `Erro ao imprimir: ${resp.error}`, variant: 'destructive' })
      setImprimindo(false)
      return
    }
    // Lembra a impressora escolhida pra essa categoria (pré-seleciona da próxima).
    window.api.impressao.salvarPreferencias({ [pendente.categoria]: { printer: selecionada } })
    fechar(true)
  }, [pendente, selecionada, executar, showToast, fechar])

  return (
    <ImpressaoContext.Provider value={{ imprimir, imprimirJanela }}>
      {children}
      <Dialog open={pendente !== null} onOpenChange={(aberto) => { if (!aberto) fechar(false) }}>
        {pendente && (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Printer className="w-4 h-4" />
                </span>
                Imprimir
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5 py-1">
              <Label className="text-xs">Impressora</Label>
              {carregando ? (
                <p className="text-sm text-muted-foreground py-2">Procurando impressoras…</p>
              ) : impressoras.length === 0 ? (
                <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                  Nenhuma impressora encontrada. Verifique se há uma instalada no Windows.
                </p>
              ) : (
                <select
                  value={selecionada}
                  onChange={(e) => setSelecionada(e.target.value)}
                  disabled={imprimindo}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {impressoras.map((i) => (
                    <option key={i.name} value={i.name}>
                      {i.displayName || i.name}
                      {i.isDefault ? ' (padrão)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => fechar(false)} disabled={imprimindo}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={imprimindo || carregando || !selecionada}>
                {imprimindo ? 'Imprimindo…' : 'Imprimir'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ImpressaoContext.Provider>
  )
}
