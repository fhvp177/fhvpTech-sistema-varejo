import { FC, useEffect, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  PawPrint
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'

const Tutores: FC = () => {
  const [tutores, setTutores] = useState<Tutor[]>([])
  const [erro, setErro] = useState('')
  const [expandidoId, setExpandidoId] = useState<number | null>(null)

  const [novo, setNovo] = useState({ nome: '', telefone: '', email: '' })
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [edicao, setEdicao] = useState({ nome: '', telefone: '', email: '' })

  const carregar = async () => {
    const resp = await window.api.tutores.listar()
    if (resp.success) setTutores(resp.data)
  }

  useEffect(() => {
    carregar()
  }, [])

  const criar = async () => {
    setErro('')
    if (!novo.nome.trim()) return
    const resp = await window.api.tutores.criar({
      nome: novo.nome.trim(),
      telefone: novo.telefone.trim() || null,
      email: novo.email.trim() || null
    })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setNovo({ nome: '', telefone: '', email: '' })
    await carregar()
  }

  const iniciarEdicao = (t: Tutor) => {
    setEditandoId(t.id)
    setEdicao({ nome: t.nome, telefone: t.telefone ?? '', email: t.email ?? '' })
    setErro('')
  }

  const salvarEdicao = async (id: number) => {
    setErro('')
    if (!edicao.nome.trim()) return
    const resp = await window.api.tutores.atualizar(id, {
      nome: edicao.nome.trim(),
      telefone: edicao.telefone.trim() || null,
      email: edicao.email.trim() || null
    })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setEditandoId(null)
    await carregar()
  }

  const excluir = async (t: Tutor) => {
    setErro('')
    if (!confirm(`Excluir o tutor "${t.nome}"?`)) return
    const resp = await window.api.tutores.deletar(t.id)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    await carregar()
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground">Tutores & Pets</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-5">
        Donos e seus animais. Expanda um tutor para gerenciar os pets dele.
      </p>

      <div className="flex gap-2 mb-2">
        <Input
          value={novo.nome}
          onChange={(e) => {
            setNovo({ ...novo, nome: e.target.value })
            setErro('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Nome do tutor"
          className="flex-1"
        />
        <Input
          value={novo.telefone}
          onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Telefone"
          className="w-36"
        />
        <Input
          value={novo.email}
          onChange={(e) => setNovo({ ...novo, email: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Email (opcional)"
          type="email"
          className="w-48"
        />
        <Button onClick={criar} size="icon" title="Adicionar tutor">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {erro && (
        <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5 mb-2">{erro}</p>
      )}

      <div className="border rounded-lg overflow-hidden">
        {tutores.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Nenhum tutor cadastrado ainda.
          </p>
        ) : (
          <ul className="divide-y">
            {tutores.map((t) => {
              const expandido = expandidoId === t.id
              if (editandoId === t.id) {
                return (
                  <li key={t.id} className="flex gap-2 px-3 py-2.5 bg-blue-50/30">
                    <Input
                      value={edicao.nome}
                      onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                      autoFocus
                      className="h-8 flex-1"
                      placeholder="Nome"
                    />
                    <Input
                      value={edicao.telefone}
                      onChange={(e) => setEdicao({ ...edicao, telefone: e.target.value })}
                      className="h-8 w-32"
                      placeholder="Telefone"
                    />
                    <Input
                      value={edicao.email}
                      onChange={(e) => setEdicao({ ...edicao, email: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') salvarEdicao(t.id)
                        if (e.key === 'Escape') setEditandoId(null)
                      }}
                      className="h-8 w-44"
                      placeholder="Email"
                      type="email"
                    />
                    <button
                      onClick={() => salvarEdicao(t.id)}
                      className="text-green-600 hover:text-green-700 p-1"
                      title="Salvar"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditandoId(null)}
                      className="text-muted-foreground hover:text-foreground p-1"
                      title="Cancelar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                )
              }
              return (
                <li key={t.id}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      onClick={() => setExpandidoId(expandido ? null : t.id)}
                      className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
                      title={expandido ? 'Recolher' : 'Ver pets'}
                    >
                      {expandido ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{t.nome}</span>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span className="truncate">{t.telefone || 'sem telefone'}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <PawPrint className="w-3 h-3" />
                          {t.pets_count} pet{t.pets_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => iniciarEdicao(t)}
                        className="text-muted-foreground hover:text-foreground p-1.5"
                        title="Editar tutor"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => excluir(t)}
                        className="text-destructive/70 hover:text-destructive p-1.5"
                        title="Excluir tutor"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {expandido && <PainelPets tutorId={t.id} onMudou={carregar} />}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// ───── Pets de um tutor ───────────────────────────────────────────────

const PainelPets: FC<{ tutorId: number; onMudou: () => void }> = ({ tutorId, onMudou }) => {
  const [pets, setPets] = useState<Pet[]>([])
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState({ nome: '', especie: '', raca: '', nascimento: '' })
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [edicao, setEdicao] = useState({ nome: '', especie: '', raca: '', nascimento: '' })

  const carregar = async () => {
    const resp = await window.api.pets.listar(tutorId)
    if (resp.success) setPets(resp.data)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorId])

  const criar = async () => {
    setErro('')
    if (!novo.nome.trim()) return
    const resp = await window.api.pets.criar(tutorId, {
      nome: novo.nome.trim(),
      especie: novo.especie.trim() || null,
      raca: novo.raca.trim() || null,
      nascimento: novo.nascimento || null
    })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setNovo({ nome: '', especie: '', raca: '', nascimento: '' })
    await carregar()
    onMudou()
  }

  const iniciarEdicao = (p: Pet) => {
    setEditandoId(p.id)
    setEdicao({
      nome: p.nome,
      especie: p.especie ?? '',
      raca: p.raca ?? '',
      nascimento: p.nascimento ?? ''
    })
  }

  const salvarEdicao = async (id: number) => {
    if (!edicao.nome.trim()) return
    const resp = await window.api.pets.atualizar(id, {
      nome: edicao.nome.trim(),
      especie: edicao.especie.trim() || null,
      raca: edicao.raca.trim() || null,
      nascimento: edicao.nascimento || null
    })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setEditandoId(null)
    await carregar()
  }

  const excluir = async (p: Pet) => {
    if (!confirm(`Excluir o pet "${p.nome}"?`)) return
    const resp = await window.api.pets.deletar(p.id)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    await carregar()
    onMudou()
  }

  return (
    <div className="bg-slate-50 border-t px-3 py-3 pl-9 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          value={novo.nome}
          onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Nome do pet"
          className="h-8 w-36"
        />
        <Input
          value={novo.especie}
          onChange={(e) => setNovo({ ...novo, especie: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Espécie"
          className="h-8 w-28"
        />
        <Input
          value={novo.raca}
          onChange={(e) => setNovo({ ...novo, raca: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Raça"
          className="h-8 w-28"
        />
        <Input
          value={novo.nascimento}
          onChange={(e) => setNovo({ ...novo, nascimento: e.target.value })}
          type="date"
          className="h-8 w-36"
          title="Nascimento"
        />
        <Button onClick={criar} size="sm" variant="outline" className="h-8">
          <Plus className="w-3.5 h-3.5 mr-1" /> Pet
        </Button>
      </div>

      {erro && <p className="text-destructive text-xs">{erro}</p>}

      {pets.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nenhum pet ainda.</p>
      ) : (
        <ul className="space-y-1">
          {pets.map((p) =>
            editandoId === p.id ? (
              <li key={p.id} className="flex flex-wrap gap-2 items-center bg-white rounded p-1.5">
                <Input
                  value={edicao.nome}
                  onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                  autoFocus
                  className="h-7 w-32"
                />
                <Input
                  value={edicao.especie}
                  onChange={(e) => setEdicao({ ...edicao, especie: e.target.value })}
                  placeholder="Espécie"
                  className="h-7 w-24"
                />
                <Input
                  value={edicao.raca}
                  onChange={(e) => setEdicao({ ...edicao, raca: e.target.value })}
                  placeholder="Raça"
                  className="h-7 w-24"
                />
                <Input
                  value={edicao.nascimento}
                  onChange={(e) => setEdicao({ ...edicao, nascimento: e.target.value })}
                  type="date"
                  className="h-7 w-32"
                />
                <button
                  onClick={() => salvarEdicao(p.id)}
                  className="text-green-600 hover:text-green-700 p-1"
                  title="Salvar"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditandoId(null)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  title="Cancelar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ) : (
              <li
                key={p.id}
                className="flex items-center gap-2 text-sm bg-white rounded px-2.5 py-1.5"
              >
                <PawPrint className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-medium">{p.nome}</span>
                <span className="text-xs text-muted-foreground flex-1 truncate">
                  {[p.especie, p.raca].filter(Boolean).join(' · ') || 'sem detalhes'}
                </span>
                <button
                  onClick={() => iniciarEdicao(p)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  title="Editar pet"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => excluir(p)}
                  className="text-destructive/70 hover:text-destructive p-1"
                  title="Excluir pet"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}

export default Tutores
