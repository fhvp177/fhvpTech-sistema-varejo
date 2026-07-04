import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { lerConfig } from '@fhvptech/core/electron/backup/configBackup'
import { listarInadimplentes, listarVencendoHoje } from './clientes'
import { CHAVE_META_MENSAL } from './dashboard'

export type TipoNotificacao = 'dinheiro' | 'estoque' | 'sistema' | 'relacionamento'
export type Severidade = 'critico' | 'alerta' | 'info'
export type AcaoNotificacao = 'suporte' | 'pix' | 'instalar-update'

// Um aviso calculado "ao vivo" do estado atual. A `chave` identifica o TIPO de
// alerta; a `assinatura` captura o valor atual — juntas dão o dedup: o mesmo
// alerta com o mesmo valor não vira linha nova; quando o valor muda, vira.
export type AlertaVivo = {
  chave: string
  assinatura: string
  tipo: TipoNotificacao
  severidade: Severidade
  titulo: string
  descricao: string
  rota: string | null
  acao: AcaoNotificacao | null
}

export type NotificacaoSalva = {
  id: number
  chave: string
  tipo: TipoNotificacao
  severidade: Severidade
  titulo: string
  descricao: string | null
  rota: string | null
  acao: AcaoNotificacao | null
  criada_em: string
  lida: number
}

const fmtBRL = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ── Alertas que saem do banco de dados (dinheiro, estoque, relacionamento) ──
export function alertasDoBanco(): AlertaVivo[] {
  const db = obterBancoDeDados()
  const alertas: AlertaVivo[] = []
  const hoje = new Date().toISOString().slice(0, 10)

  // Vencimentos de hoje
  const vencHoje = listarVencendoHoje()
  if (vencHoje.length > 0) {
    const soma = vencHoje.reduce((a, c) => a + c.total, 0)
    alertas.push({
      chave: 'venc-hoje',
      assinatura: `${vencHoje.length}:${hoje}`,
      tipo: 'dinheiro',
      severidade: 'alerta',
      titulo: 'Vencimentos de hoje',
      descricao: `${vencHoje.length} cliente(s) a receber · ${fmtBRL(soma)}`,
      rota: '/clientes',
      acao: null
    })
  }

  // Clientes inadimplentes (estado atual)
  const inad = listarInadimplentes()
  if (inad.length > 0) {
    const soma = inad.reduce((a, c) => a + c.total_devido, 0)
    alertas.push({
      chave: 'inadimplentes',
      assinatura: `${inad.length}:${soma.toFixed(2)}`,
      tipo: 'dinheiro',
      severidade: 'critico',
      titulo: 'Clientes inadimplentes',
      descricao: `${inad.length} cliente(s) em atraso · ${fmtBRL(soma)}`,
      rota: '/clientes',
      acao: null
    })
  }

  // Vence amanhã (heads-up para cobrar antes)
  const amanha = db
    .prepare(
      `SELECT COALESCE(SUM(d.devido), 0) AS soma, COUNT(*) AS n FROM (
         SELECT (v.total - v.valor_pago) AS devido
         FROM vendas v
         WHERE v.num_parcelas IS NULL AND v.status_pagamento = 'pendente'
           AND v.cancelada = 0
           AND date(v.data_vencimento) = date('now', '+1 day')
         UNION ALL
         SELECT p.valor AS devido
         FROM parcelas p
         WHERE p.status = 'pendente' AND date(p.data_vencimento) = date('now', '+1 day')
           AND p.venda_id IN (SELECT id FROM vendas WHERE cancelada = 0)
       ) d`
    )
    .get() as { soma: number; n: number }
  if (amanha.n > 0) {
    alertas.push({
      chave: 'vence-amanha',
      assinatura: `${amanha.n}:${hoje}`,
      tipo: 'dinheiro',
      severidade: 'info',
      titulo: 'Vence amanhã',
      descricao: `${amanha.n} recebimento(s) · ${fmtBRL(amanha.soma)}`,
      rota: '/clientes',
      acao: null
    })
  }

  // Meta do mês (só quando há meta definida)
  const meta = Number(lerConfig(CHAVE_META_MENSAL)) || 0
  if (meta > 0) {
    const { fat } = db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS fat FROM vendas
         WHERE substr(data, 1, 7) = strftime('%Y-%m', 'now') AND cancelada = 0`
      )
      .get() as { fat: number }
    const yyyymm = hoje.slice(0, 7)
    if (fat >= meta) {
      alertas.push({
        chave: 'meta-mes',
        assinatura: `batida:${yyyymm}`,
        tipo: 'dinheiro',
        severidade: 'info',
        titulo: 'Meta do mês batida! 🎉',
        descricao: `Você alcançou ${fmtBRL(fat)} de ${fmtBRL(meta)}.`,
        rota: '/',
        acao: null
      })
    } else {
      const agora = new Date()
      const ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate()
      const diasRestantes = ultimoDia - agora.getDate()
      if (diasRestantes <= 7) {
        alertas.push({
          chave: 'meta-mes',
          assinatura: `reta:${yyyymm}`,
          tipo: 'dinheiro',
          severidade: 'info',
          titulo: 'Reta final da meta',
          descricao: `Faltam ${fmtBRL(meta - fat)} para a meta, em ${diasRestantes} dia(s).`,
          rota: '/',
          acao: null
        })
      }
    }
  }

  // Estoque baixo (1 a 5 unidades) — produto simples ou por tamanho da grade
  const { estoqueBaixo } = db
    .prepare(
      `SELECT COUNT(*) AS estoqueBaixo FROM (
         SELECT 1 FROM produtos p
         WHERE p.estoque > 0 AND p.estoque <= 5
           AND NOT EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id)
         UNION ALL
         SELECT 1 FROM produto_variacoes pv
         WHERE pv.estoque > 0 AND pv.estoque <= 5
       )`
    )
    .get() as { estoqueBaixo: number }
  if (estoqueBaixo > 0) {
    alertas.push({
      chave: 'estoque-baixo',
      assinatura: `${estoqueBaixo}`,
      tipo: 'estoque',
      severidade: 'alerta',
      titulo: 'Estoque baixo',
      descricao: `${estoqueBaixo} item(ns) com 5 unidades ou menos.`,
      rota: '/produtos',
      acao: null
    })
  }

  // Produtos parados há 30+ dias (com estoque) — gancho de promoção
  const { parados } = db
    .prepare(
      `SELECT COUNT(*) AS parados FROM (
         SELECT CAST(julianday('now') - julianday(
           COALESCE(
             (SELECT MAX(date(v.data)) FROM itens_venda iv
              JOIN vendas v ON v.id = iv.venda_id WHERE iv.produto_id = p.id AND v.cancelada = 0),
             date(p.data_cadastro), '2000-01-01'
           )
         ) AS INTEGER) AS dias
         FROM produtos p
         WHERE p.estoque > 0
       ) WHERE dias >= 30`
    )
    .get() as { parados: number }
  if (parados > 0) {
    alertas.push({
      chave: 'produtos-parados',
      assinatura: `${parados}`,
      tipo: 'estoque',
      severidade: 'info',
      titulo: 'Produtos parados',
      descricao: `${parados} produto(s) sem venda há 30+ dias.`,
      rota: '/produtos',
      acao: null
    })
  }

  // Aniversariantes de hoje (gancho de marketing)
  const { aniv } = db
    .prepare(
      `SELECT COUNT(*) AS aniv FROM clientes
       WHERE data_nascimento IS NOT NULL AND data_nascimento <> ''
         AND substr(data_nascimento, 6, 5) = strftime('%m-%d', 'now')`
    )
    .get() as { aniv: number }
  if (aniv > 0) {
    alertas.push({
      chave: 'aniversariantes',
      assinatura: `${hoje}:${aniv}`,
      tipo: 'relacionamento',
      severidade: 'info',
      titulo: aniv === 1 ? 'Aniversariante hoje 🎂' : `${aniv} aniversariantes hoje 🎂`,
      descricao: 'Que tal mandar um parabéns com uma promoção?',
      rota: '/clientes',
      acao: null
    })
  }

  return alertas
}

// ── Persistência (a "caixa de entrada" que lembra) ──

// Janela do sino: só mostra avisos que nasceram de ontem pra cá (até 1 dia
// atrás). `criada_em` é o instante em que o aviso surgiu pela primeira vez
// (datetime local); date('now','localtime','-1 day') é a meia-noite de ontem.
// Corte seco por data: um aviso que continua valendo, mas é antigo, some do
// sino mesmo assim. Usado em listar() e contarNaoLidas() pra não divergirem.
const JANELA_RECENTE = `criada_em >= date('now', 'localtime', '-1 day')`

// Grava os alertas novos (dedup pelo índice único chave+assinatura) e mantém só
// as 100 linhas mais recentes, pra tabela não crescer sem limite.
export function sincronizar(alertas: AlertaVivo[]): void {
  const db = obterBancoDeDados()
  const insert = db.prepare(
    `INSERT OR IGNORE INTO notificacoes
       (chave, assinatura, tipo, severidade, titulo, descricao, rota, acao)
     VALUES (@chave, @assinatura, @tipo, @severidade, @titulo, @descricao, @rota, @acao)`
  )
  db.transaction((lista: AlertaVivo[]) => {
    for (const a of lista) insert.run(a)
    db.prepare(
      `DELETE FROM notificacoes WHERE id NOT IN (
         SELECT id FROM notificacoes ORDER BY id DESC LIMIT 100
       )`
    ).run()
  })(alertas)
}

export function listar(): NotificacaoSalva[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT id, chave, tipo, severidade, titulo, descricao, rota, acao, criada_em, lida
       FROM notificacoes
       WHERE dispensada = 0 AND ${JANELA_RECENTE}
       ORDER BY id DESC
       LIMIT 50`
    )
    .all() as NotificacaoSalva[]
}

export function contarNaoLidas(): number {
  const db = obterBancoDeDados()
  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM notificacoes
       WHERE lida = 0 AND dispensada = 0 AND ${JANELA_RECENTE}`
    )
    .get() as { n: number }
  return n
}

export function marcarTodasLidas(): void {
  const db = obterBancoDeDados()
  db.prepare('UPDATE notificacoes SET lida = 1 WHERE lida = 0').run()
}

export function dispensar(id: number): void {
  const db = obterBancoDeDados()
  db.prepare('UPDATE notificacoes SET dispensada = 1 WHERE id = ?').run(id)
}
