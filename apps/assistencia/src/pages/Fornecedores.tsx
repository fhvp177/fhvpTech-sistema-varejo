import { FC, useEffect, useState } from 'react'
import { IMaskInput } from 'react-imask'
import { Pencil, Trash2, Plus, Search } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import Paginacao from '@fhvptech/core/ui/paginacao'
import { useSessao } from '@/App'

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
      await carregarFornecedores()
    } else {
      alert(`Erro ao excluir: ${resp.error}`)
    }
  }

  const setFormField = (campo: keyof FormFornecedor) => (valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Fornecedores</h2>
        {ehDono && (
          <Button onClick={abrirNovo}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Fornecedor
          </Button>
        )}
      </div>

      {/* Busca */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CNPJ, telefone..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela */}
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
                <td colSpan={5} className="text-center py-12 text-muted-foreground">
                  {busca ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado.'}
                </td>
              </tr>
            )}
            {listaPaginada.map((f, i) => (
              <tr
                key={f.id}
                className={`border-b border-border last:border-b-0 ${
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

          <div className="grid gap-4 py-2">
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
