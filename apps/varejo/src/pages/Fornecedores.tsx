import { FC, useEffect, useState } from 'react'
import { IMaskInput } from 'react-imask'
import { Pencil, Trash2, Plus, Search, Truck } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import EstadoVazio from '@fhvptech/core/ui/EstadoVazio'
import { useSaidaDeLinha } from '@fhvptech/core/ui/animacoes'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import Paginacao from '@fhvptech/core/ui/paginacao'
import { MenuAcoes, type AcaoMenu } from '@fhvptech/core/ui/MenuAcoes'
import { useSessao } from '@/App'
import { useEhCelular } from '@/hooks/useEhCelular'
import DicaRolante from '@/components/DicaRolante'
import { corDoNome, iniciaisDoNome } from '@/utils/avatarNome'

const ITENS_POR_PAGINA = 20

type Fornecedor = {
  id: number
  nome: string
  cnpj: string | null
  telefone: string | null
  email: string | null
  endereco: string | null
}

type FormFornecedor = Omit<Fornecedor, 'id'>

const FORM_VAZIO: FormFornecedor = {
  nome: '',
  cnpj: '',
  telefone: '',
  email: '',
  endereco: ''
}

const validarCNPJ = (cnpj: string): boolean => {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14) return false
  if (/^(\d)\1+$/.test(n)) return false // todos os dígitos iguais
  const calc = (digitos: string, pesos: number[]) => {
    const soma = digitos.split('').reduce((acc, d, i) => acc + parseInt(d) * pesos[i], 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const d1 = calc(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (d1 !== parseInt(n[12])) return false
  const d2 = calc(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d2 === parseInt(n[13])
}

const validarEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const Fornecedores: FC = () => {
  const { ehDono } = useSessao()
  const [lista, setLista] = useState<Fornecedor[]>([])
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Fornecedor | null>(null)
  const [form, setForm] = useState<FormFornecedor>(FORM_VAZIO)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [paginaAtual, setPaginaAtual] = useState(1)

  const carregarFornecedores = async () => {
    const resp = await window.api.fornecedores.listar()
    if (resp.success) setLista(resp.data as Fornecedor[])
  }

  useEffect(() => {
    carregarFornecedores()
  }, [])

  const listaFiltrada = lista.filter((f) =>
    [f.nome, f.cnpj, f.telefone, f.email]
      .filter(Boolean)
      .some((campo) => campo!.toLowerCase().includes(busca.toLowerCase()))
  )

  useEffect(() => {
    setPaginaAtual(1)
  }, [busca])

  const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA
  const listaPaginada = listaFiltrada.slice(inicioPagina, inicioPagina + ITENS_POR_PAGINA)

  const abrirNovo = () => {
    setEditando(null)
    setForm(FORM_VAZIO)
    setErro('')
    setDialogAberto(true)
  }

  const abrirEdicao = (fornecedor: Fornecedor) => {
    setEditando(fornecedor)
    setForm({
      nome: fornecedor.nome,
      cnpj: fornecedor.cnpj ?? '',
      telefone: fornecedor.telefone ?? '',
      email: fornecedor.email ?? '',
      endereco: fornecedor.endereco ?? ''
    })
    setErro('')
    setDialogAberto(true)
  }

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('O nome do fornecedor é obrigatório.')
      return
    }

    if (form.cnpj) {
      if (form.cnpj.replace(/\D/g, '').length !== 14) {
        setErro('CNPJ incompleto. Preencha todos os 14 dígitos.')
        return
      }
      if (!validarCNPJ(form.cnpj)) {
        setErro('CNPJ inválido. Verifique os números digitados.')
        return
      }
    }

    if (form.telefone && form.telefone.replace(/\D/g, '').length !== 11) {
      setErro('Telefone incompleto. Preencha o número completo no formato (00) 9.0000-0000.')
      return
    }

    if (form.email && !validarEmail(form.email.trim())) {
      setErro('E-mail inválido. Use o formato nome@dominio.com.')
      return
    }

    setCarregando(true)
    setErro('')

    const dados = {
      nome: form.nome.trim(),
      cnpj: form.cnpj || null,
      telefone: form.telefone || null,
      email: form.email || null,
      endereco: form.endereco || null
    }

    const resp = editando
      ? await window.api.fornecedores.atualizar(editando.id, dados)
      : await window.api.fornecedores.criar(dados)

    if (resp.success) {
      await carregarFornecedores()
      setDialogAberto(false)
    } else {
      setErro(resp.error)
    }

    setCarregando(false)
  }

  const confirmar = useConfirm()

  const saidaLinha = useSaidaDeLinha()

  const ehCelular = useEhCelular()

  const excluir = async (id: number, nome: string) => {
    if (
      !(await confirmar({
        titulo: 'Excluir fornecedor',
        mensagem: `Tem certeza que deseja excluir o fornecedor "${nome}"?`,
        variante: 'destructive'
      }))
    )
      return
    const resp = await window.api.fornecedores.deletar(id)
    if (resp.success) {
      saidaLinha.sairEntao(String(id), () => void carregarFornecedores())
    } else {
      alert(`Erro ao excluir: ${resp.error}`)
    }
  }

  const setFormField = (campo: keyof FormFornecedor) => (valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  return (
    <div className="p-4 lg:p-8">
      {/*
        ⚠️ O cabeçalho sai no celular, como em Clientes e Produtos: quem chegou
        aqui veio de "Mais › Fornecedores" e sabe onde está. O título de 24px
        mais o parágrafo de duas linhas gastavam meia tela antes do primeiro
        fornecedor aparecer.
      */}
      <div className="hidden lg:flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            Fornecedores
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            De quem a loja compra. O mesmo cadastro é usado na importação de XML de nota e nas
            contas a pagar.
          </p>
        </div>
        {ehDono && (
          <Button onClick={abrirNovo}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Fornecedor
          </Button>
        )}
      </div>

      {/*
        No celular a busca ocupa a linha e o "novo fornecedor" vira o quadrado ao
        lado dela — as duas coisas que se faz ao abrir esta tela, numa linha só
        em vez de duas.
      */}
      <div className="flex items-center gap-2 mb-3 lg:mb-4">
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={ehCelular ? '' : 'Buscar por nome, CNPJ, telefone...'}
            aria-label="Buscar por nome, CNPJ, telefone"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
          {/* A dica só existe com o campo vazio; ao digitar, some ela e o movimento. */}
          {ehCelular && busca === '' && <DicaRolante texto="Buscar por nome, CNPJ, telefone" />}
        </div>
        {ehDono && (
          <Button
            onClick={abrirNovo}
            className="lg:hidden h-11 w-11 shrink-0 p-0"
            aria-label="Novo fornecedor"
            title="Novo fornecedor"
          >
            <Plus className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/*
        ⭐ No celular a tabela vira LISTA (roteiro §6), igual à de Clientes — foi
        o pedido, com estas palavras: "deixe parecido com a de clientes".

        Quatro colunas não cabem em 360px, e a saída que estava aqui era a pior
        das três: `overflow-x-auto` na tabela obriga a arrastar o dedo de lado
        linha por linha, e ninguém compara dois fornecedores assim.

        ⚠️ A tabela não é escondida por classe, ela não é RENDERIZADA: com
        `hidden lg:table` as vinte linhas da página existiriam duas vezes no DOM.

        ⚠️ O que não cabe na linha (endereço, e-mail inteiro, o fim do CNPJ)
        continua a um toque, em Editar.
      */}
      {ehCelular ? (
        listaFiltrada.length === 0 ? (
          <div className="border rounded-xl bg-card">
            <EstadoVazio
              icone={<Truck className="w-9 h-9" />}
              dica={busca ? 'Tente outro nome ou CNPJ.' : 'Use o botão + para começar.'}
            >
              {busca ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado.'}
            </EstadoVazio>
          </div>
        ) : (
          <ul className="border rounded-xl bg-card divide-y">
            {listaPaginada.map((f) => {
              const identidade = [f.cnpj, f.email, f.endereco].filter(Boolean).join(' · ')
              const acoes: AcaoMenu[] = ehDono
                ? [
                    {
                      rotulo: 'Editar',
                      icone: <Pencil className="w-4 h-4" />,
                      onSelecionar: () => abrirEdicao(f)
                    },
                    {
                      rotulo: 'Excluir',
                      icone: <Trash2 className="w-4 h-4" />,
                      destrutiva: true,
                      onSelecionar: () => excluir(f.id, f.nome)
                    }
                  ]
                : []
              return (
                <li
                  key={f.id}
                  className={`px-3 py-2.5 ${saidaLinha.estaSaindo(String(f.id)) ? 'anim-linha-sai' : ''}`}
                >
                  {/*
                    `minmax(0,1fr)` na coluna do meio é obrigatório: sem ele um nome
                    longo estoura a grade em vez de cortar, e é assim que aparece
                    rolagem horizontal onde não deveria haver nenhuma.
                  */}
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${corDoNome(f.nome)}`}
                      aria-hidden
                    >
                      {iniciaisDoNome(f.nome)}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold leading-tight" title={f.nome}>
                        {f.nome}
                      </p>
                      {/*
                        Em Clientes a direita da segunda linha é a dívida; aqui,
                        que não tem dinheiro nenhum, ela é o TELEFONE — o dado
                        pelo qual se AGE sobre um fornecedor.

                        ⚠️ Foi o contrário na primeira tentativa, com o CNPJ na
                        direita, e a régua de 360px reprovou: o CNPJ tomava 124px
                        do slot fixo e sobravam 66 para o contato — o telefone
                        saía pela metade, "(88) 9.9...". Invertido, o telefone
                        ocupa 115 e nunca corta, e ao CNPJ sobram 75, que
                        mostram "12.345.678...". Cortar CNPJ pelo fim é o que
                        menos custa: a raiz de 8 dígitos já identifica, o
                        /0001-95 é filial e dígito verificador.

                        `min-w-0` no cinza e `shrink-0` no telefone: quem cede
                        espaço é o texto, nunca o número. E `num` põe a
                        monoespaçada com `tabular-nums`, que alinha os telefones
                        em coluna de um item para o outro sem tabela nenhuma.
                      */}
                      <div className="mt-0.5 flex items-baseline gap-2">
                        <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                          {identidade || 'Sem dados cadastrados'}
                        </p>
                        {f.telefone && (
                          <span className="num shrink-0 text-[12px] text-muted-foreground">
                            {f.telefone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/*
                      ⚠️ Nenhuma ação se perde no menu: editar e excluir mudam de
                      LUGAR, não de existência, e continuam chamando as mesmas
                      funções da tabela do monitor — as duas só para o dono. Sem
                      dono, sem menu: um gatilho que abre um painel vazio é pior
                      do que gatilho nenhum.
                    */}
                    <div className="flex shrink-0 items-center">
                      {acoes.length > 0 && (
                        <MenuAcoes rotulo={`Ações de ${f.nome}`} acoes={acoes} />
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      ) : (
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">CNPJ</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Telefone</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">E-mail</th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EstadoVazio
                    icone={<Truck className="w-9 h-9" />}
                    dica={busca ? 'Tente outro nome ou CNPJ.' : 'Cadastre quem fornece as peças que você revende.'}
                  >
                    {busca ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado.'}
                  </EstadoVazio>
                </td>
              </tr>
            )}
            {listaPaginada.map((f, i) => (
              <tr
                key={f.id}
                className={`border-b border-border last:border-b-0 ${
                  saidaLinha.estaSaindo(String(f.id)) ? 'anim-linha-sai' : ''
                } ${
                  i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                }`}
              >
                <td className="px-4 py-3 font-medium">
                  <div className="truncate max-w-[240px]" title={f.nome}>{f.nome}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{f.cnpj || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{f.telefone || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {f.email
                    ? <div className="truncate max-w-[220px]" title={f.email}>{f.email}</div>
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {ehDono && (
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicao(f)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => excluir(f.id, f.nome)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <Paginacao
        paginaAtual={paginaAtual}
        totalItens={listaFiltrada.length}
        itensPorPagina={ITENS_POR_PAGINA}
        onMudarPagina={setPaginaAtual}
        rotuloItem="fornecedor(es)"
      />

      {/* Dialog criar/editar */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-[538px]">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
          </DialogHeader>

          {/*
            `[&>*>*]:min-w-0` alcança DOIS níveis, e o segundo não é zelo
            excessivo: cada campo é um `grid gap-1.5` sem `grid-cols`, e grade
            sem coluna declarada tem uma única coluna `auto`, que se dimensiona
            pelo conteúdo e cresce ALÉM do pai em vez de apertar. Foi o que
            deixou campo escrito por cima de campo em Produtos.
          */}
          <div className="grid grid-cols-1 gap-4 py-2 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <div className="grid gap-1.5">
              <Label htmlFor="nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setFormField('nome')(e.target.value)}
                placeholder="Nome do fornecedor"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <IMaskInput
                id="cnpj"
                mask="00.000.000/0000-00"
                value={form.cnpj ?? ''}
                onAccept={(valor: string) => setFormField('cnpj')(valor)}
                placeholder="00.000.000/0000-00"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <IMaskInput
                id="telefone"
                mask="(00) 9.0000-0000"
                value={form.telefone ?? ''}
                onAccept={(valor: string) => setFormField('telefone')(valor)}
                placeholder="(00) 9.0000-0000"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setFormField('email')(e.target.value)}
                placeholder="contato@fornecedor.com.br"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="endereco">Endereço</Label>
              <Input
                id="endereco"
                value={form.endereco ?? ''}
                onChange={(e) => setFormField('endereco')(e.target.value)}
                placeholder="Rua, número, bairro, cidade"
              />
            </div>

            {erro && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erro}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={carregando}>
              {carregando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Fornecedores
