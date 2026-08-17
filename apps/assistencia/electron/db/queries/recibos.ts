import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

// Recibos avulsos: emitir, listar, cancelar. Ver o porquê da tabela em
// backup/migrations/os/at_002_recibos.ts.

export type Recibo = {
  id: number
  numero: number
  valor: number
  recebedor_nome: string
  recebedor_documento: string | null
  recebedor_rg: string | null
  pagador_nome: string
  pagador_documento: string | null
  pagador_rg: string | null
  pagador_cliente_id: number | null
  referente: string
  cidade: string | null
  uf: string | null
  data_recibo: string
  observacao: string | null
  cancelado: number
  cancelado_em: string | null
  cancelado_motivo: string | null
  criado_em: string
  criado_por: string | null
}

export type DadosRecibo = {
  valor: number
  recebedor_nome: string
  recebedor_documento?: string | null
  recebedor_rg?: string | null
  pagador_nome: string
  pagador_documento?: string | null
  pagador_rg?: string | null
  pagador_cliente_id?: number | null
  referente: string
  cidade?: string | null
  uf?: string | null
  data_recibo: string
  observacao?: string | null
  criado_por?: string | null
}

const texto = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

const EH_DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * O próximo número livre.
 *
 * Serve só para a tela mostrar "Nº 8" antes de salvar. O número que VALE é o
 * que `criarRecibo` reserva dentro da transação — perguntar aqui e usar depois
 * abriria o vão entre ler e gravar, que é onde nascem dois recibos com o mesmo
 * número (o mesmo raciocínio do estoque em vendas.ts).
 */
export function proximoNumeroRecibo(): number {
  const db = obterBancoDeDados()
  const r = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM recibos').get() as {
    n: number
  }
  return r.n
}

export function criarRecibo(dados: DadosRecibo): Recibo {
  const db = obterBancoDeDados()

  const valor = Number(dados.valor)
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Informe um valor maior que zero.')
  }
  const recebedor = texto(dados.recebedor_nome)
  if (!recebedor) throw new Error('Informe quem está recebendo.')
  const pagador = texto(dados.pagador_nome)
  if (!pagador) throw new Error('Informe quem está pagando.')
  const referente = texto(dados.referente)
  if (!referente) {
    // Sem isto o recibo declara ter recebido dinheiro sem dizer por quê — e é
    // exatamente essa frase que faz dele uma quitação de alguma coisa.
    throw new Error('Informe a que se refere o pagamento.')
  }
  if (!EH_DATA.test(dados.data_recibo ?? '')) {
    throw new Error('Data do recibo inválida.')
  }

  const inserir = db.prepare(
    `INSERT INTO recibos
       (numero, valor, recebedor_nome, recebedor_documento, recebedor_rg,
        pagador_nome, pagador_documento, pagador_rg, pagador_cliente_id,
        referente, cidade, uf, data_recibo, observacao, criado_por)
     VALUES (@numero, @valor, @recebedor_nome, @recebedor_documento, @recebedor_rg,
             @pagador_nome, @pagador_documento, @pagador_rg, @pagador_cliente_id,
             @referente, @cidade, @uf, @data_recibo, @observacao, @criado_por)`
  )

  // Ler o maior número e inserir DENTRO da mesma transação é o que impede dois
  // recibos com o mesmo número quando há um segundo caixa na rede. O UNIQUE da
  // coluna é a segunda tranca: se algum dia esta função virar assíncrona, ele
  // transforma um recibo duplicado num erro em vez de num documento inválido.
  const criar = db.transaction((): number => {
    const { n } = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM recibos').get() as {
      n: number
    }
    inserir.run({
      numero: n,
      // Centavos inteiros: o valor é dinheiro e vai virar extenso no papel.
      valor: Math.round(valor * 100) / 100,
      recebedor_nome: recebedor,
      recebedor_documento: texto(dados.recebedor_documento),
      recebedor_rg: texto(dados.recebedor_rg),
      pagador_nome: pagador,
      pagador_documento: texto(dados.pagador_documento),
      pagador_rg: texto(dados.pagador_rg),
      pagador_cliente_id: dados.pagador_cliente_id ?? null,
      referente,
      cidade: texto(dados.cidade),
      // Sempre em maiúsculas: é sigla, e o resto do sistema a guarda assim.
      uf: texto(dados.uf)?.toUpperCase() ?? null,
      data_recibo: dados.data_recibo,
      observacao: texto(dados.observacao),
      criado_por: texto(dados.criado_por)
    })
    return n
  })

  return obterRecibo(criar())!
}

export function obterRecibo(numero: number): Recibo | null {
  const db = obterBancoDeDados()
  return (db.prepare('SELECT * FROM recibos WHERE numero = ?').get(numero) as Recibo) ?? null
}

/**
 * Lista de um mês (YYYY-MM) ou os últimos emitidos quando `mes` vem vazio.
 *
 * Cancelados continuam na lista, riscados: o número existiu e o buraco na
 * sequência precisa de explicação.
 */
export function listarRecibos(mes?: string): Recibo[] {
  const db = obterBancoDeDados()
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    return db
      .prepare(
        `SELECT * FROM recibos WHERE substr(data_recibo, 1, 7) = ? ORDER BY numero DESC`
      )
      .all(mes) as Recibo[]
  }
  return db.prepare('SELECT * FROM recibos ORDER BY numero DESC LIMIT 200').all() as Recibo[]
}

/** Meses que têm recibo, para o seletor da tela. Mais recente primeiro. */
export function mesesComRecibos(): string[] {
  const db = obterBancoDeDados()
  const linhas = db
    .prepare(
      `SELECT DISTINCT substr(data_recibo, 1, 7) AS mes FROM recibos ORDER BY mes DESC`
    )
    .all() as Array<{ mes: string }>
  return linhas.map((l) => l.mes)
}

/**
 * Cancela um recibo emitido por engano.
 *
 * O número NÃO volta para a fila. Recibo é papel que já pode ter saído da loja:
 * reaproveitar o número faria existirem dois documentos diferentes com a mesma
 * identificação, que é o pior desfecho possível para quem precisa provar um
 * pagamento. O buraco na sequência, com motivo registrado, conta a verdade.
 */
export function cancelarRecibo(numero: number, motivo: string): void {
  const db = obterBancoDeDados()
  const justificativa = texto(motivo)
  if (!justificativa) throw new Error('Diga por que este recibo está sendo cancelado.')

  const alvo = obterRecibo(numero)
  if (!alvo) throw new Error('Recibo não encontrado.')
  if (alvo.cancelado) throw new Error('Este recibo já está cancelado.')

  db.prepare(
    `UPDATE recibos
        SET cancelado = 1,
            cancelado_em = datetime('now', 'localtime'),
            cancelado_motivo = ?
      WHERE numero = ? AND cancelado = 0`
  ).run(justificativa, numero)
}
