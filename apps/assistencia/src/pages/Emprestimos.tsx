import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Search,
  HandCoins,
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  Printer,
  Undo2,
  Ban,
  TrendingUp,
  TrendingDown,
  FileText
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { useToast } from '@fhvptech/core/ui/toast'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import EstadoVazio from '@fhvptech/core/ui/EstadoVazio'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import Paginacao from '@fhvptech/core/ui/paginacao'
import { Select } from '@fhvptech/core/ui/select'
import { useValorMudou } from '@fhvptech/core/ui/animacoes'
import ClienteSeletor, { type ClienteSelecionavel } from '../components/ClienteSeletor'
import { CampoCpfCnpj } from '../components/CamposDocumento'
import { useImprimir } from '../components/ImpressaoProvider'
import { comprovanteEmprestimoHtml, reciboPagamentoEmprestimoHtml } from '../utils/comprovanteEmprestimo'
import {
  carneEmprestimoHtml,
  promissoriaEmprestimoHtml
} from '../utils/documentosEmprestimo'
import { obterDadosLoja } from '../utils/dadosLoja'
import { montarParcelas } from '@fhvptech/core/lib/parcelas'

// Empréstimos de dinheiro do dono para clientes.
//
// Módulo OPCIONAL (ligado por loja em Configurações) e restrito ao gerente — a
// rota é `RotaSomenteDono` e todo canal IPC exige `requerDono()`, inclusive os
// de leitura: esta lista é "quem deve dinheiro ao patrão".
//
// A mecânica está em electron/db/queries/emprestimos.ts. O que importa aqui:
//   • o valor é uma FOTO combinada no ato — não anda sozinho;
//   • o que ajusta a dívida é um LANÇAMENTO datado (acréscimo/desconto), feito
//     por decisão do dono, nunca por cálculo do sistema;
//   • nada disso encosta em vendas, estoque ou faturamento.

const ITENS_POR_PAGINA = 20

type Filtro = 'aberto' | 'quitado' | 'todos'

/** Como o juros foi informado: em porcentagem sobre o capital, ou em reais. */
type ModoJuros = 'percentual' | 'reais'

type FormEmprestimo = {
  cliente_id: string // '' = devedor avulso (não é cliente cadastrado)
  devedor_nome: string
  devedor_documento: string
  valor_principal: string
  /**
   * O juros combinado no ato. NÃO é uma taxa que o sistema guarda e recalcula
   * com o tempo — é só a conta que produz o total, feita uma vez. O que fica
   * gravado são o capital e o total; o juros é sempre recuperável a partir dos
   * dois (total − capital, e a % em cima do capital), então ele não precisa de
   * coluna própria no banco.
   */
  juros: string
  juros_modo: ModoJuros
  data_emprestimo: string
  /**
   * A CONDIÇÃO de pagamento — o prazo, não o instrumento.
   *
   * ⚠️ Não chamar de "forma de pagamento". Forma é dinheiro/PIX/cartão;
   * condição é à vista/parcelado. A casa já trocou os dois nomes uma vez e
   * teve de corrigir em 4 lugares do PDV; o módulo novo nasce com o nome certo.
   *
   * Os dois valores são excludentes de propósito, igual às vendas:
   *   'unico' = uma data alvo, e o devedor paga quanto quiser até quitar;
   *   'carne' = parcelas fixas, cada uma quitada por inteiro.
   * Misturar os dois faria o papel que o cliente leva pra casa deixar de bater
   * com o saldo do sistema.
   */
  modo: ModoEmprestimo
  vencimento: string
  /** Só no carnê. */
  num_parcelas: string
  primeiro_vencimento: string
  observacao: string
}

type ModoEmprestimo = 'unico' | 'carne'

const hojeISO = (): string => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

const formVazio = (): FormEmprestimo => ({
  cliente_id: '',
  devedor_nome: '',
  devedor_documento: '',
  valor_principal: '',
  juros: '',
  // R$ e não %: o dono do negócio pensa em "quanto eu ganho em cima", não em
  // taxa. Quem raciocina por porcentagem troca a unidade num clique; quem
  // raciocina por valor — a maioria — não precisa mexer em nada.
  juros_modo: 'reais',
  data_emprestimo: hojeISO(),
  // Vencimento único como padrão: é o acordo mais comum de balcão, e quem
  // precisa de carnê sabe que precisa.
  modo: 'unico',
  vencimento: '',
  num_parcelas: '3',
  primeiro_vencimento: '',
  observacao: ''
})

/**
 * A conta do acordo: capital + juros = total a receber.
 *
 * Feita UMA vez, na criação. O total sai daqui e é congelado — depois disso a
 * dívida não anda sozinha, só muda por lançamento do gerente. Campo vazio conta
 * como zero (empréstimo sem juros), e não como erro.
 */
export function calcularAcordo(
  principal: number,
  juros: number,
  modo: ModoJuros
): { capital: number; juros: number; total: number } {
  // O capital é arredondado ANTES de entrar na conta, e é este valor que vai
  // gravado. Sem isso, alguém colando "333,333" veria a prévia calculada sobre
  // 333,333 enquanto o backend gravaria 333,33 (ele arredonda para centavos) —
  // e o total impresso no comprovante sairia diferente do total do sistema, por
  // fração de centavo, sem ninguém conseguir explicar de onde veio.
  const capital =
    Number.isFinite(principal) && principal > 0 ? Math.round(principal * 100) / 100 : 0
  const taxa = Number.isFinite(juros) && juros > 0 ? juros : 0
  const emReais = modo === 'percentual' ? (capital * taxa) / 100 : taxa
  const arredondado = Math.round(emReais * 100) / 100
  return { capital, juros: arredondado, total: Math.round((capital + arredondado) * 100) / 100 }
}

const BADGE: Record<SituacaoEmprestimo, string> = {
  aberto: 'bg-amber-100 text-amber-700',
  vencido: 'bg-red-100 text-red-700',
  quitado: 'bg-green-100 text-green-700',
  cancelado: 'bg-slate-200 text-slate-600'
}
const ROTULO_SITUACAO: Record<SituacaoEmprestimo, string> = {
  aberto: 'Em aberto',
  vencido: 'Em atraso',
  quitado: 'Quitado',
  cancelado: 'Cancelado'
}

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (iso: string): string => new Date(iso + 'T00:00').toLocaleDateString('pt-BR')

function diasAte(iso: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.round((new Date(iso + 'T00:00').getTime() - hoje.getTime()) / 86400000)
}

function textoVencimento(e: Emprestimo): { texto: string; cor: string } {
  if (!e.proximo_vencimento) return { texto: 'Sem data', cor: 'text-muted-foreground' }
  const data = fmtData(e.proximo_vencimento)
  if (e.situacao === 'quitado' || e.situacao === 'cancelado') {
    return { texto: data, cor: 'text-muted-foreground' }
  }
  const dias = diasAte(e.proximo_vencimento)
  if (dias < 0) return { texto: `${data} · ${-dias}d de atraso`, cor: 'text-red-600 font-medium' }
  if (dias === 0) return { texto: `${data} · hoje`, cor: 'text-amber-600 font-medium' }
  if (dias <= 7) return { texto: `${data} · em ${dias}d`, cor: 'text-amber-600' }
  return { texto: data, cor: '' }
}

/**
 * Lê o que foi digitado num campo de dinheiro.
 *
 * ⚠️ NÃO remova pontos achando que são separador de milhar. Os campos daqui são
 * `type="number"`, e o navegador entrega o valor com PONTO decimal: "600.00".
 * Uma versão anterior desta função tirava os pontos e transformava 600,00 em
 * 60000 — cem vezes o valor, direto no saldo do cliente, sem erro nenhum na
 * tela. O `replace(',', '.')` fica só como rede para teclados que insistem na
 * vírgula. É a mesma leitura usada em ContasPagar.tsx:191 e em outras 8 telas.
 */
export function paraNumero(texto: string): number {
  const limpo = texto.trim()
  return limpo === '' ? NaN : parseFloat(limpo.replace(',', '.'))
}

const Emprestimos: FC = () => {
  const confirmar = useConfirm()
  const { showToast } = useToast()
  const imprimir = useImprimir()

  const [lista, setLista] = useState<Emprestimo[]>([])
  const [resumo, setResumo] = useState<ResumoEmprestimos | null>(null)
  const [clientes, setClientes] = useState<ClienteSelecionavel[]>([])
  const [filtro, setFiltro] = useState<Filtro>('aberto')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [carregando, setCarregando] = useState(true)

  // Novo empréstimo
  const [dialogNovo, setDialogNovo] = useState(false)
  const [form, setForm] = useState<FormEmprestimo>(formVazio)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Detalhe / extrato
  const [detalhe, setDetalhe] = useState<EmprestimoDetalhado | null>(null)

  // Receber pagamento
  const [recebendo, setRecebendo] = useState<Emprestimo | null>(null)
  const [valorReceb, setValorReceb] = useState('')
  const [dataReceb, setDataReceb] = useState(hojeISO())
  const [erroReceb, setErroReceb] = useState('')

  // Acréscimo / desconto
  const [ajustando, setAjustando] = useState<{
    emp: Emprestimo
    tipo: 'acrescimo' | 'desconto'
  } | null>(null)
  const [valorAjuste, setValorAjuste] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [erroAjuste, setErroAjuste] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [respLista, respResumo] = await Promise.all([
      window.api.emprestimos.listar(filtro),
      window.api.emprestimos.resumo()
    ])
    if (respLista.success) setLista(respLista.data)
    else showToast({ message: respLista.error, variant: 'destructive' })
    if (respResumo.success) setResumo(respResumo.data)
    setCarregando(false)
  }, [filtro, showToast])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    window.api.clientes.listar().then((r) => {
      if (r.success) setClientes(r.data as ClienteSelecionavel[])
    })
  }, [])

  useEffect(() => setPagina(1), [filtro, busca])

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return lista
    return lista.filter(
      (e) =>
        e.devedor_nome.toLowerCase().includes(termo) ||
        (e.devedor_documento ?? '').toLowerCase().includes(termo) ||
        (e.observacao ?? '').toLowerCase().includes(termo)
    )
  }, [lista, busca])

  const listaPaginada = useMemo(
    () => listaFiltrada.slice((pagina - 1) * ITENS_POR_PAGINA, pagina * ITENS_POR_PAGINA),
    [listaFiltrada, pagina]
  )

  // A prévia do acordo, recalculada a cada tecla — é o que responde "então vai
  // ficar quanto?" sem a pessoa ter que fazer a conta de cabeça.
  const acordo = useMemo(
    () => calcularAcordo(paraNumero(form.valor_principal), paraNumero(form.juros), form.juros_modo),
    [form.valor_principal, form.juros, form.juros_modo]
  )

  /**
   * A prévia do carnê. Usa `montarParcelas` do core — a MESMA função que o banco
   * chama ao gravar. Não é uma reimplementação parecida: é a mesma conta, e é
   * isso que garante que o carnê impresso bata com o que será cobrado.
   *
   * Devolve [] em vez de estourar quando os campos ainda estão pela metade —
   * digitar é um estado normal do formulário, não um erro.
   */
  const previaParcelas = useMemo(() => {
    if (form.modo !== 'carne') return []
    const n = Number(form.num_parcelas)
    try {
      return montarParcelas(acordo.total, n, form.primeiro_vencimento)
    } catch {
      return []
    }
  }, [form.modo, form.num_parcelas, form.primeiro_vencimento, acordo.total])

  // ── Novo empréstimo ────────────────────────────────────────────────────────
  const abrirNovo = (): void => {
    setForm(formVazio())
    setErro('')
    setDialogNovo(true)
  }

  // Escolher um cliente preenche nome e documento — mas os campos continuam
  // editáveis: o que vale no comprovante é o texto, congelado na emissão.
  const escolherCliente = (id: string): void => {
    const c = clientes.find((x) => String(x.id) === id)
    setForm((f) => ({
      ...f,
      cliente_id: id,
      devedor_nome: c ? c.nome : f.devedor_nome,
      devedor_documento: c ? (c.cpf ?? c.cnpj ?? f.devedor_documento) : f.devedor_documento
    }))
  }

  const salvarNovo = async (): Promise<void> => {
    const principal = paraNumero(form.valor_principal)
    const jurosDigitado = paraNumero(form.juros)

    if (!form.devedor_nome.trim()) return setErro('Informe o nome do devedor.')
    if (!Number.isFinite(principal) || principal <= 0) {
      return setErro('Informe o valor emprestado.')
    }
    // Campo de juros vazio é empréstimo sem juros — legítimo, não é erro. Só
    // número negativo é recusado: "juros de -10%" não quer dizer nada aqui, e
    // quem quer devolver menos do que pegou faz isso por desconto depois.
    if (form.juros.trim() !== '' && (!Number.isFinite(jurosDigitado) || jurosDigitado < 0)) {
      return setErro('O juros não pode ser negativo.')
    }
    if (!form.data_emprestimo) return setErro('Informe a data do empréstimo.')

    if (form.modo === 'carne') {
      const n = Number(form.num_parcelas)
      if (!Number.isInteger(n) || n < 2) return setErro('O carnê precisa de pelo menos 2 parcelas.')
      if (!form.primeiro_vencimento) return setErro('Informe o vencimento da primeira parcela.')
      if (form.primeiro_vencimento < form.data_emprestimo) {
        return setErro('A primeira parcela não pode vencer antes do empréstimo.')
      }
      // Se a prévia não fechou, alguma coisa acima está incoerente — melhor
      // barrar aqui do que gravar um carnê que a tela não conseguiu desenhar.
      if (previaParcelas.length !== n) return setErro('Confira os dados do carnê.')
    } else if (form.vencimento && form.vencimento < form.data_emprestimo) {
      return setErro('O vencimento não pode ser antes da data do empréstimo.')
    }

    const acordado = acordo.total
    const capital = acordo.capital

    setSalvando(true)
    setErro('')
    const resp = await window.api.emprestimos.criar({
      cliente_id: form.cliente_id === '' ? null : Number(form.cliente_id),
      devedor_nome: form.devedor_nome.trim(),
      devedor_documento: form.devedor_documento.trim() || null,
      // Capital e total vêm os dois da MESMA conta que alimentou a prévia. É o
      // que garante que o número visto na tela, o gravado e o impresso sejam um
      // só.
      valor_principal: capital,
      valor_acordado: acordado,
      modo: form.modo,
      data_emprestimo: form.data_emprestimo,
      // No carnê o vencimento vive nas parcelas; mandar uma data solta aqui
      // criaria uma segunda verdade sobre a mesma coisa.
      vencimento: form.modo === 'carne' ? null : form.vencimento || null,
      num_parcelas: form.modo === 'carne' ? Number(form.num_parcelas) : null,
      primeiro_vencimento: form.modo === 'carne' ? form.primeiro_vencimento : null,
      observacao: form.observacao.trim() || null
    })
    setSalvando(false)

    if (!resp.success) return setErro(resp.error)

    setDialogNovo(false)
    showToast({ message: 'Empréstimo registrado.', variant: 'success' })
    await carregar()

    const criado = resp.data
    const querPapel = await confirmar({
      titulo: 'Imprimir comprovante?',
      mensagem: `Sai um papel de ${fmt(criado.valor_acordado)} em nome de ${
        criado.devedor_nome
      }, pra ficar uma via com cada um.`,
      rotuloConfirmar: 'Imprimir',
      rotuloCancelar: 'Agora não'
    })
    if (querPapel) await imprimirComprovante(criado)
  }

  const imprimirComprovante = async (emp: Emprestimo): Promise<void> => {
    const loja = await obterDadosLoja()
    await imprimir(comprovanteEmprestimoHtml(emp, loja), 'comprovante-emprestimo', 'cupom')
  }

  // Carnê e promissória são 'documento', não 'cupom': saem em A4 na impressora
  // comum, não na bobina térmica do balcão.
  const imprimirCarne = async (emp: EmprestimoDetalhado): Promise<void> => {
    const loja = await obterDadosLoja()
    await imprimir(
      carneEmprestimoHtml(emp, emp.parcelas, loja),
      `carne-emprestimo-${emp.id}`,
      'documento'
    )
  }

  const imprimirPromissoria = async (emp: Emprestimo): Promise<void> => {
    const loja = await obterDadosLoja()
    await imprimir(
      promissoriaEmprestimoHtml(emp, loja),
      `promissoria-emprestimo-${emp.id}`,
      'documento'
    )
  }

  // ── Receber pagamento ──────────────────────────────────────────────────────
  const abrirRecebimento = (emp: Emprestimo): void => {
    setRecebendo(emp)
    setValorReceb(String(emp.restante.toFixed(2)))
    setDataReceb(hojeISO())
    setErroReceb('')
  }

  /**
   * Quita uma parcela do carnê por inteiro.
   *
   * Sem campo de valor de propósito: a parcela vale o que está escrita no papel
   * que o cliente levou pra casa. Deixar editar aqui abriria a porta pro saldo
   * do sistema e o carnê da mão dele contarem histórias diferentes — quem quiser
   * cobrar a mais lança um acréscimo, que fica datado no extrato.
   */
  const receberParcela = async (parcela: ParcelaEmprestimo): Promise<void> => {
    if (!detalhe) return
    const ok = await confirmar({
      titulo: `Receber a ${parcela.numero}ª parcela?`,
      mensagem: `${fmt(parcela.valor)}, com vencimento em ${fmtData(parcela.vencimento)}.`,
      rotuloConfirmar: 'Confirmar recebimento'
    })
    if (!ok) return

    const resp = await window.api.emprestimos.pagarParcela(parcela.id, {
      valor: parcela.valor,
      data: hojeISO()
    })
    if (!resp.success) return showToast({ message: resp.error, variant: 'destructive' })

    showToast({ message: `Parcela ${parcela.numero} recebida.`, variant: 'success' })
    await recarregarDetalhe(detalhe.id)
    await carregar()
  }

  const confirmarRecebimento = async (): Promise<void> => {
    if (!recebendo) return
    const valor = paraNumero(valorReceb)
    if (!Number.isFinite(valor) || valor <= 0) return setErroReceb('Informe um valor válido.')

    const resp = await window.api.emprestimos.registrarPagamento(recebendo.id, {
      valor,
      data: dataReceb
    })
    if (!resp.success) return setErroReceb(resp.error)

    const efetivo = Math.min(valor, recebendo.restante)
    const restanteDepois = +(recebendo.restante - efetivo).toFixed(2)
    const devedor = recebendo.devedor_nome
    setRecebendo(null)
    showToast({ message: `Recebimento de ${fmt(efetivo)} registrado.`, variant: 'success' })
    await carregar()
    if (detalhe) await recarregarDetalhe(detalhe.id)

    const querPapel = await confirmar({
      titulo: 'Imprimir recibo?',
      mensagem:
        restanteDepois > 0
          ? `Recibo de ${fmt(efetivo)}. Ainda restam ${fmt(restanteDepois)}.`
          : `Recibo de ${fmt(efetivo)}. Empréstimo quitado.`,
      rotuloConfirmar: 'Imprimir',
      rotuloCancelar: 'Agora não'
    })
    if (querPapel) {
      const loja = await obterDadosLoja()
      await imprimir(
        reciboPagamentoEmprestimoHtml(
          { devedor, valor: efetivo, data: dataReceb, restante: restanteDepois },
          loja
        ),
        'recibo-pagamento-emprestimo',
        'cupom'
      )
    }
  }

  // ── Acréscimo / desconto ───────────────────────────────────────────────────
  const abrirAjuste = (emp: Emprestimo, tipo: 'acrescimo' | 'desconto'): void => {
    setAjustando({ emp, tipo })
    setValorAjuste('')
    setMotivoAjuste('')
    setErroAjuste('')
  }

  const confirmarAjuste = async (): Promise<void> => {
    if (!ajustando) return
    const valor = paraNumero(valorAjuste)
    if (!Number.isFinite(valor) || valor <= 0) return setErroAjuste('Informe um valor válido.')
    if (!motivoAjuste.trim()) return setErroAjuste('Escreva o motivo — ele aparece no extrato.')

    const resp = await window.api.emprestimos.lancarAjuste(ajustando.emp.id, ajustando.tipo, {
      valor,
      data: hojeISO(),
      observacao: motivoAjuste.trim()
    })
    if (!resp.success) return setErroAjuste(resp.error)

    const id = ajustando.emp.id
    setAjustando(null)
    showToast({
      message: ajustando.tipo === 'acrescimo' ? 'Acréscimo lançado.' : 'Desconto lançado.',
      variant: 'success'
    })
    await carregar()
    if (detalhe) await recarregarDetalhe(id)
  }

  // ── Detalhe / extrato ──────────────────────────────────────────────────────
  const recarregarDetalhe = async (id: number): Promise<void> => {
    const resp = await window.api.emprestimos.obter(id)
    if (resp.success) setDetalhe(resp.data)
  }

  const estornar = async (lancamentoId: number): Promise<void> => {
    if (!detalhe) return
    const ok = await confirmar({
      titulo: 'Estornar lançamento?',
      mensagem:
        'Ele continua no extrato, riscado, com a marca de estornado — o saldo volta ao que era antes.',
      rotuloConfirmar: 'Estornar',
      variante: 'destructive'
    })
    if (!ok) return
    const resp = await window.api.emprestimos.estornarLancamento(lancamentoId)
    if (!resp.success) return showToast({ message: resp.error, variant: 'destructive' })
    showToast({ message: 'Lançamento estornado.', variant: 'success' })
    await recarregarDetalhe(detalhe.id)
    await carregar()
  }

  const cancelar = async (emp: Emprestimo): Promise<void> => {
    const ok = await confirmar({
      titulo: `Cancelar o empréstimo de ${emp.devedor_nome}?`,
      mensagem:
        'Ele sai dos totais e das cobranças, mas continua consultável com o motivo. Nada é apagado.',
      rotuloConfirmar: 'Cancelar empréstimo',
      variante: 'destructive'
    })
    if (!ok) return
    const resp = await window.api.emprestimos.cancelar(emp.id, 'Cancelado pelo gerente')
    if (!resp.success) return showToast({ message: resp.error, variant: 'destructive' })
    showToast({ message: 'Empréstimo cancelado.', variant: 'success' })
    setDetalhe(null)
    await carregar()
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <HandCoins className="w-6 h-6 text-primary" />
            Empréstimos
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Controle dos valores emprestados a clientes. Não integra o faturamento: é capital
            próprio a receber, não receita.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="w-4 h-4 mr-2" />
          Novo empréstimo
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <CartaoResumo
          rotulo="Total a receber"
          valor={resumo?.total_a_receber}
          icone={<HandCoins className="w-4 h-4" />}
          rodape={
            resumo ? `${fmt(resumo.principal_em_aberto)} em capital emprestado` : undefined
          }
        />
        <CartaoResumo
          rotulo="Em atraso"
          valor={resumo?.vencido}
          destaque="text-red-600"
          icone={<AlertTriangle className="w-4 h-4" />}
        />
        <CartaoResumo
          rotulo="Vencem em 7 dias"
          valor={resumo?.vence_7d}
          destaque="text-amber-600"
          icone={<CalendarClock className="w-4 h-4" />}
        />
        <CartaoResumo
          rotulo="Recebido no mês"
          valor={resumo?.recebido_mes}
          destaque="text-green-600"
          icone={<CheckCircle className="w-4 h-4" />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-lg border p-0.5 bg-muted/30">
          {(
            [
              ['aberto', 'Em aberto'],
              ['quitado', 'Quitados'],
              ['todos', 'Todos']
            ] as [Filtro, string][]
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setFiltro(valor)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filtro === valor
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do devedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Devedor</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vencimento</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total devido</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Situação</th>
              <th className="w-40 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!carregando && listaFiltrada.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EstadoVazio
                    icone={<HandCoins className="w-9 h-9" />}
                    dica={
                      busca || filtro !== 'todos'
                        ? undefined
                        : 'O botão "Novo empréstimo" registra o primeiro.'
                    }
                  >
                    {busca
                      ? 'Nenhum empréstimo encontrado para a busca.'
                      : filtro === 'aberto'
                        ? 'Nenhum empréstimo em aberto.'
                        : 'Nenhum empréstimo registrado.'}
                  </EstadoVazio>
                </td>
              </tr>
            )}
            {listaPaginada.map((e) => {
              const venc = textoVencimento(e)
              return (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <button
                      className="font-medium text-left hover:underline"
                      onClick={() => recarregarDetalhe(e.id)}
                    >
                      {e.devedor_nome}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      Capital {fmt(e.valor_principal)} · {fmtData(e.data_emprestimo)}
                    </div>
                  </td>
                  <td className={`px-4 py-3 ${venc.cor}`}>{venc.texto}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-medium">{fmt(e.valor_devido)}</div>
                    {e.valor_pago > 0 && (
                      <div className="text-xs text-green-600">pago {fmt(e.valor_pago)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(e.restante)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${BADGE[e.situacao]}`}>
                      {ROTULO_SITUACAO[e.situacao]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {e.situacao !== 'quitado' && e.situacao !== 'cancelado' && (
                        // No carnê não existe "receber um valor qualquer": o
                        // backend recusa pagamento parcial de propósito, porque
                        // o papel do cliente tem parcelas fechadas. Mandar pro
                        // carnê é o único caminho que leva a algum lugar —
                        // abrir o diálogo de valor livre daria um erro seco.
                        <Button
                          size="sm"
                          onClick={() =>
                            e.modo === 'carne' ? recarregarDetalhe(e.id) : abrirRecebimento(e)
                          }
                        >
                          {e.modo === 'carne' ? 'Ver carnê' : 'Receber'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Imprimir comprovante"
                        onClick={() => imprimirComprovante(e)}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {listaFiltrada.length > ITENS_POR_PAGINA && (
        <div className="mt-4">
          <Paginacao
            paginaAtual={pagina}
            totalItens={listaFiltrada.length}
            itensPorPagina={ITENS_POR_PAGINA}
            onMudarPagina={setPagina}
          />
        </div>
      )}

      {/* ── Novo empréstimo ─────────────────────────────────────────────── */}
      <Dialog open={dialogNovo} onOpenChange={setDialogNovo}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo empréstimo</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Cliente</Label>
              <ClienteSeletor
                clientes={clientes}
                clienteIdSelecionado={form.cliente_id}
                onChange={escolherCliente}
                placeholder="Buscar cliente cadastrado (opcional)"
                rotuloSemCliente="— Sem cliente cadastrado —"
              />
              <p className="text-xs text-muted-foreground">
                Opcional. Para quem não é cliente cadastrado, informe o nome abaixo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="devedor">
                  Nome do devedor <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="devedor"
                  value={form.devedor_nome}
                  onChange={(e) => setForm((f) => ({ ...f, devedor_nome: e.target.value }))}
                  placeholder="Nome completo"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="documento">CPF/CNPJ</Label>
                <CampoCpfCnpj
                  id="documento"
                  value={form.devedor_documento}
                  onChange={(v) => setForm((f) => ({ ...f, devedor_documento: v }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="principal">
                  Valor emprestado <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="principal"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.valor_principal}
                  onChange={(e) => setForm((f) => ({ ...f, valor_principal: e.target.value }))}
                  placeholder="0,00"
                />
                <p className="text-xs text-muted-foreground">Capital entregue ao devedor.</p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="juros">Juros</Label>
                <div className="flex gap-2">
                  <Input
                    id="juros"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.juros}
                    onChange={(e) => setForm((f) => ({ ...f, juros: e.target.value }))}
                    placeholder={form.juros_modo === 'reais' ? '0,00' : '0'}
                    className="flex-1"
                  />
                  {/* Unidade ao lado do campo, não numa pergunta separada: quem
                      combina "20%" e quem combina "R$ 100" digitam o mesmo
                      número em lugares diferentes, e a troca é um clique. */}
                  <div className="inline-flex rounded-md border p-0.5 bg-muted/30 shrink-0">
                    {(
                      [
                        ['reais', 'R$'],
                        ['percentual', '%']
                      ] as [ModoJuros, string][]
                    ).map(([modo, rotulo]) => (
                      <button
                        key={modo}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, juros_modo: modo }))}
                        className={`px-2.5 text-sm rounded transition-colors ${
                          form.juros_modo === modo
                            ? 'bg-background shadow-sm font-medium'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Opcional. Deixe em branco para empréstimo sem juros.
                </p>
              </div>
            </div>

            {/* A prévia do acordo. Existe pra que ninguém confirme sem ter visto
                o número que o devedor vai ter que devolver — é ele que sai no
                comprovante e é ele que fica congelado. */}
            <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total a receber</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {acordo.juros > 0
                    ? `${fmt(acordo.capital)} de capital + ${fmt(acordo.juros)} de juros${
                        form.juros_modo === 'percentual'
                          ? ''
                          : ` (${((acordo.juros / (acordo.capital || 1)) * 100).toLocaleString(
                              'pt-BR',
                              { maximumFractionDigits: 2 }
                            )}%)`
                      }`
                    : 'Sem juros — o devedor devolve o capital emprestado.'}
                </p>
              </div>
              <p className="text-2xl font-bold whitespace-nowrap">{fmt(acordo.total)}</p>
            </div>

            {/* Forma de cobrança. Os dois modos são excludentes: o carnê quita
                parcela por inteiro, o vencimento único aceita pagamento parcial
                livre. Deixar escolher DEPOIS de ver o total é de propósito — a
                pergunta "em quantas vezes?" só faz sentido com o número na tela. */}
            <div className="grid gap-1.5">
              <Label>Condição de pagamento</Label>
              <div className="inline-flex rounded-lg border p-0.5 bg-muted/30 w-fit">
                {(
                  [
                    ['unico', 'Pagamento único'],
                    ['carne', 'Parcelado (carnê)']
                  ] as [ModoEmprestimo, string][]
                ).map(([modo, rotulo]) => (
                  <button
                    key={modo}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, modo }))}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      form.modo === modo
                        ? 'bg-background shadow-sm font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="data">
                  Data <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="data"
                  type="date"
                  value={form.data_emprestimo}
                  onChange={(e) => setForm((f) => ({ ...f, data_emprestimo: e.target.value }))}
                />
              </div>

              {form.modo === 'unico' ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="vencimento">Vencimento</Label>
                  <Input
                    id="vencimento"
                    type="date"
                    value={form.vencimento}
                    onChange={(e) => setForm((f) => ({ ...f, vencimento: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="primeira-parcela">
                    1ª parcela vence em <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="primeira-parcela"
                    type="date"
                    value={form.primeiro_vencimento}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, primeiro_vencimento: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>

            {form.modo === 'carne' && (
              <div className="grid gap-1.5">
                <Label htmlFor="num-parcelas">
                  Quantas parcelas <span className="text-destructive">*</span>
                </Label>
                <Select
                  id="num-parcelas"
                  value={form.num_parcelas}
                  onChange={(v) => setForm((f) => ({ ...f, num_parcelas: v }))}
                  classNameContainer="max-w-xs"
                  opcoes={Array.from({ length: 23 }, (_, i) => i + 2).map((n) => ({
                    valor: String(n),
                    rotulo: `${n}x`,
                    detalhe:
                      acordo.total > 0
                        ? `de ${fmt(Math.round((acordo.total / n) * 100) / 100)} (aprox.)`
                        : undefined
                  }))}
                />
              </div>
            )}

            {/* A prévia do carnê. Sai da MESMA função que o banco usa pra gravar,
                então o que está na tela é exatamente o que vai ser cobrado — e o
                que vai sair impresso no papel do cliente. */}
            {form.modo === 'carne' && previaParcelas.length > 0 && (
              <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
                <p className="text-xs font-medium mb-2">
                  Carnê de {previaParcelas.length} parcelas
                </p>
                <div className="max-h-36 overflow-y-auto divide-y divide-border/60">
                  {previaParcelas.map((p) => (
                    <div key={p.numero} className="flex items-center gap-3 py-1 text-sm">
                      <span className="w-8 text-muted-foreground">{p.numero}ª</span>
                      <span className="flex-1 text-muted-foreground">{fmtData(p.vencimento)}</span>
                      <span className="font-medium">{fmt(p.valor)}</span>
                    </div>
                  ))}
                </div>
                {previaParcelas[0].valor !== previaParcelas[previaParcelas.length - 1].valor && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    A sobra dos centavos vai na 1ª parcela, para o carnê não terminar com um
                    valor quebrado.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="observacao">Observação</Label>
              <Input
                id="observacao"
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                placeholder="Anotações sobre o acordo (opcional)"
              />
            </div>

            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNovo(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvarNovo} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Registrar empréstimo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Receber ─────────────────────────────────────────────────────── */}
      <Dialog open={recebendo !== null} onOpenChange={(v) => !v && setRecebendo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Receber de {recebendo?.devedor_nome}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Saldo devedor:{' '}
              <span className="font-semibold text-foreground">{fmt(recebendo?.restante ?? 0)}</span>
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="valor-receb">Valor recebido</Label>
              <Input
                id="valor-receb"
                type="number"
                min="0.01"
                step="0.01"
                value={valorReceb}
                onChange={(e) => setValorReceb(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data-receb">Data</Label>
              <Input
                id="data-receb"
                type="date"
                value={dataReceb}
                onChange={(e) => setDataReceb(e.target.value)}
              />
            </div>
            {erroReceb && <p className="text-sm text-destructive">{erroReceb}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecebendo(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarRecebimento}>Confirmar recebimento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Acréscimo / desconto ────────────────────────────────────────── */}
      <Dialog open={ajustando !== null} onOpenChange={(v) => !v && setAjustando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {ajustando?.tipo === 'acrescimo' ? 'Lançar acréscimo' : 'Lançar desconto'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              {ajustando?.tipo === 'acrescimo'
                ? 'Juros, multa por atraso ou taxa. Aumenta o saldo devedor.'
                : 'Abatimento concedido. Reduz o saldo devedor.'}
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="valor-ajuste">Valor</Label>
              <Input
                id="valor-ajuste"
                type="number"
                min="0.01"
                step="0.01"
                value={valorAjuste}
                onChange={(e) => setValorAjuste(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="motivo-ajuste">Motivo</Label>
              <Input
                id="motivo-ajuste"
                value={motivoAjuste}
                onChange={(e) => setMotivoAjuste(e.target.value)}
                placeholder="Ex.: juros de setembro"
              />
            </div>
            {erroAjuste && <p className="text-sm text-destructive">{erroAjuste}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAjustando(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarAjuste}>Lançar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detalhe / extrato ───────────────────────────────────────────── */}
      <Dialog open={detalhe !== null} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detalhe?.devedor_nome}</DialogTitle>
          </DialogHeader>

          {detalhe && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Bloco
                  rotulo="Capital emprestado"
                  valor={fmt(detalhe.valor_principal)}
                  // O juros do acordo não tem coluna no banco: ele é a diferença
                  // entre o total combinado e o capital, e a % em cima do capital.
                  rodape={
                    detalhe.valor_acordado > detalhe.valor_principal
                      ? `+ ${fmt(detalhe.valor_acordado - detalhe.valor_principal)} de juros (${(
                          ((detalhe.valor_acordado - detalhe.valor_principal) /
                            detalhe.valor_principal) *
                          100
                        ).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)`
                      : undefined
                  }
                />
                <Bloco rotulo="Total devido" valor={fmt(detalhe.valor_devido)} />
                <Bloco
                  rotulo="Saldo a receber"
                  valor={fmt(detalhe.restante)}
                  destaque={detalhe.restante > 0 ? 'text-red-600' : 'text-green-600'}
                />
              </div>

              {detalhe.cancelado === 1 && (
                <p className="text-sm bg-slate-100 text-slate-700 rounded-md px-3 py-2">
                  Cancelado — {detalhe.cancelado_motivo}
                </p>
              )}

              {detalhe.modo === 'carne' && detalhe.parcelas.length > 0 && (
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-sm font-medium">
                      Carnê · {detalhe.parcelas.filter((p) => p.paga === 1).length} de{' '}
                      {detalhe.parcelas.length} pagas
                    </p>
                    {detalhe.cancelado === 0 && (
                      <Button size="sm" variant="outline" onClick={() => imprimirCarne(detalhe)}>
                        <Printer className="w-4 h-4 mr-1.5" />
                        Imprimir carnê
                      </Button>
                    )}
                  </div>
                  <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                    {detalhe.parcelas.map((p) => {
                      const atrasada = p.paga === 0 && p.vencimento < hojeISO()
                      return (
                        <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="w-8 text-muted-foreground">{p.numero}ª</span>
                          <span
                            className={`flex-1 ${
                              atrasada ? 'text-red-600 font-medium' : 'text-muted-foreground'
                            }`}
                          >
                            {fmtData(p.vencimento)}
                            {atrasada && ' · em atraso'}
                          </span>
                          <span className={`font-medium ${p.paga ? 'line-through opacity-60' : ''}`}>
                            {fmt(p.valor)}
                          </span>
                          {p.paga === 1 ? (
                            <span className="text-xs text-green-600 w-20 text-right">paga</span>
                          ) : detalhe.cancelado === 0 ? (
                            <Button size="sm" className="w-20" onClick={() => receberParcela(p)}>
                              Receber
                            </Button>
                          ) : (
                            <span className="w-20" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2">Extrato</p>
                <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                  <LinhaExtrato
                    data={detalhe.data_emprestimo}
                    descricao="Empréstimo concedido"
                    valor={detalhe.valor_acordado}
                    cor="text-foreground"
                  />
                  {detalhe.lancamentos.map((l) => (
                    <LinhaExtrato
                      key={l.id}
                      data={l.data}
                      descricao={
                        l.tipo === 'pagamento'
                          ? 'Pagamento recebido'
                          : l.tipo === 'acrescimo'
                            ? `Acréscimo${l.observacao ? ` — ${l.observacao}` : ''}`
                            : `Desconto${l.observacao ? ` — ${l.observacao}` : ''}`
                      }
                      valor={l.valor}
                      cor={
                        l.tipo === 'pagamento'
                          ? 'text-green-600'
                          : l.tipo === 'acrescimo'
                            ? 'text-red-600'
                            : 'text-blue-600'
                      }
                      sinal={l.tipo === 'pagamento' ? '-' : l.tipo === 'acrescimo' ? '+' : '-'}
                      estornado={l.estornado === 1}
                      onEstornar={
                        l.estornado === 0 && detalhe.cancelado === 0
                          ? () => estornar(l.id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>

              {detalhe.cancelado === 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrirAjuste(detalhe, 'acrescimo')}
                  >
                    <TrendingUp className="w-4 h-4 mr-1.5" />
                    Acréscimo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrirAjuste(detalhe, 'desconto')}
                  >
                    <TrendingDown className="w-4 h-4 mr-1.5" />
                    Desconto
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => imprimirComprovante(detalhe)}>
                    <Printer className="w-4 h-4 mr-1.5" />
                    Comprovante
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => imprimirPromissoria(detalhe)}>
                    <FileText className="w-4 h-4 mr-1.5" />
                    Promissória
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto text-destructive"
                    onClick={() => cancelar(detalhe)}
                  >
                    <Ban className="w-4 h-4 mr-1.5" />
                    Cancelar empréstimo
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

const CartaoResumo: FC<{
  rotulo: string
  valor: number | undefined
  destaque?: string
  icone: ReactNode
  rodape?: string
}> = ({ rotulo, valor, destaque, icone, rodape }) => {
  // Ver o comentário gêmeo em ContasPagar: o cartão descobre sozinho que mudou.
  const mudou = useValorMudou(valor)
  return (
    <div className="border rounded-xl p-3 bg-card">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
        {icone}
        <span className="text-xs font-medium">{rotulo}</span>
      </div>
      <p className={`text-xl font-bold ${destaque ?? ''} ${mudou ? 'anim-valor-muda' : ''}`}>
        {valor == null ? '...' : fmt(valor)}
      </p>
      {rodape && <p className="text-[11px] text-muted-foreground mt-0.5">{rodape}</p>}
    </div>
  )
}

const Bloco: FC<{ rotulo: string; valor: string; destaque?: string; rodape?: string }> = ({
  rotulo,
  valor,
  destaque,
  rodape
}) => (
  <div className="border rounded-lg p-3">
    <p className="text-xs text-muted-foreground">{rotulo}</p>
    <p className={`text-lg font-semibold ${destaque ?? ''}`}>{valor}</p>
    {rodape && <p className="text-[11px] text-muted-foreground mt-0.5">{rodape}</p>}
  </div>
)

const LinhaExtrato: FC<{
  data: string
  descricao: string
  valor: number
  cor: string
  sinal?: string
  estornado?: boolean
  onEstornar?: () => void
}> = ({ data, descricao, valor, cor, sinal, estornado, onEstornar }) => (
  <div className={`flex items-center gap-3 px-3 py-2 text-sm ${estornado ? 'opacity-50' : ''}`}>
    <span className="text-muted-foreground w-20 shrink-0">{fmtData(data)}</span>
    <span className={`flex-1 ${estornado ? 'line-through' : ''}`}>
      {descricao}
      {estornado && <span className="ml-2 text-xs text-muted-foreground">(estornado)</span>}
    </span>
    <span className={`font-medium ${estornado ? 'line-through' : cor}`}>
      {sinal}
      {fmt(valor)}
    </span>
    {onEstornar && (
      <button
        onClick={onEstornar}
        title="Estornar"
        className="text-muted-foreground hover:text-destructive"
      >
        <Undo2 className="w-4 h-4" />
      </button>
    )}
  </div>
)

export default Emprestimos
