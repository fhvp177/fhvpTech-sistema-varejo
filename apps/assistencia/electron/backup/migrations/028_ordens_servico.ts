import type Database from 'better-sqlite3'

// O coração do nicho (Fase 3b): a Ordem de Serviço. Princípio de arquitetura:
// a OS cuida do TRABALHO (entrada → orçamento → aprovação → reparo → entrega);
// o DINHEIRO continua 100% com a máquina de vendas — no fechamento, os itens
// da OS viram uma venda comum (`venda_id` é o elo) e herdam crediário,
// parcelas, estorno, cupom e relatórios sem lógica financeira nova.
//
// Bancada × externo é a MESMA OS com um seletor: muda só o miolo (aparelho
// que fica na loja × endereço + agendamento). `os_historico` é a caixa-preta
// do ciclo: cada mudança de status com autor e data (prova da aprovação).
export function aplicar028OrdensServico(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ordens_servico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo_atendimento TEXT NOT NULL DEFAULT 'bancada'
          CHECK (tipo_atendimento IN ('bancada', 'externo')),
        cliente_id INTEGER NOT NULL,
        tecnico_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'aberta'
          CHECK (status IN (
            'aberta', 'orcamento', 'aguardando_aprovacao', 'aprovada', 'agendada',
            'em_reparo', 'aguardando_peca', 'pronta', 'entregue', 'recusada', 'cancelada'
          )),

        -- Bancada: o aparelho que ficou na loja
        equipamento TEXT,
        numero_serie TEXT,
        acessorios TEXT,
        estado_entrada TEXT,
        senha_acesso TEXT,

        -- Externo: onde e quando atender
        endereco_atendimento TEXT,
        agendado_para TEXT,

        defeito_relatado TEXT NOT NULL,
        diagnostico TEXT,

        orcamento_aprovado_em TEXT,
        garantia_dias INTEGER NOT NULL DEFAULT 45,
        entregue_em TEXT,
        venda_id INTEGER,
        os_origem_id INTEGER,
        criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),

        FOREIGN KEY (cliente_id) REFERENCES clientes(id),
        FOREIGN KEY (tecnico_id) REFERENCES vendedores(id),
        FOREIGN KEY (venda_id) REFERENCES vendas(id),
        FOREIGN KEY (os_origem_id) REFERENCES ordens_servico(id)
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_os_cliente ON ordens_servico (cliente_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico (status)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_os_serie ON ordens_servico (numero_serie)`)

    db.exec(`
      CREATE TABLE IF NOT EXISTS os_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        os_id INTEGER NOT NULL,
        produto_id INTEGER NOT NULL,
        variacao_id INTEGER,
        quantidade INTEGER NOT NULL DEFAULT 1,
        preco_unitario REAL NOT NULL,
        FOREIGN KEY (os_id) REFERENCES ordens_servico(id),
        FOREIGN KEY (produto_id) REFERENCES produtos(id),
        FOREIGN KEY (variacao_id) REFERENCES produto_variacoes(id)
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_os_itens_os ON os_itens (os_id)`)

    db.exec(`
      CREATE TABLE IF NOT EXISTS os_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        os_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        observacao TEXT,
        vendedor_id INTEGER NOT NULL,
        criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (os_id) REFERENCES ordens_servico(id),
        FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_os_hist_os ON os_historico (os_id)`)

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('028_ordens_servico')
  })()
}
