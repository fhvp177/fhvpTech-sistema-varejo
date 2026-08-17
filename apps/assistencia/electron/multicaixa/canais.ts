/**
 * Quais canais atendem o segundo caixa pela rede, e quais nunca saem da máquina.
 *
 * ── Fecha por padrão ─────────────────────────────────────────────────────────
 * Só passa pela rede o que está explicitamente em `CANAIS_REDE`. Canal novo,
 * canal com nome errado, canal inventado: recusado. A alternativa — listar o
 * que é proibido e liberar o resto — daria acesso remoto de graça a todo canal
 * criado daqui pra frente, e ninguém lembra de revisar uma lista de proibições
 * ao adicionar uma funcionalidade.
 *
 * O teste de inventário exige que TODO canal registrado esteja em uma das duas
 * listas. Então criar um canal novo obriga a decidir — é o efeito desejado.
 *
 * ── Três motivos para um canal ficar local ───────────────────────────────────
 *
 * 1. **Fala com hardware da máquina.** Impressora é a do balcão onde a pessoa
 *    está. O terminal fora da loja precisa imprimir na impressora DELE, não na
 *    do PC — mandar pela rede imprimiria no lugar errado.
 *
 * 2. **Abre janela do sistema.** Diálogo de "escolher pasta" abre onde o
 *    processo roda, ou seja, no PC. Chamado do terminal, ele travaria esperando
 *    uma resposta enquanto uma janela aparece na frente de quem está no caixa
 *    da loja. Há teste garantindo que todo canal com diálogo esteja aqui.
 *
 * 3. **É sobre a instalação, não sobre a loja.** Backup, atualização e licença
 *    dizem respeito àquela máquina específica. Backup ainda tem o agravante de
 *    só fazer sentido em quem é dono do banco — restaurar backup a partir de um
 *    terminal seria destrutivo e é justamente o que a lista impede, mesmo que
 *    um token vaze.
 *
 * ── Um caso que surpreende ───────────────────────────────────────────────────
 * `config:obter` e `config:salvar` (preferência de interface: seção aberta ou
 * fechada) parecem local, mas gravam na tabela `config` — e o terminal não tem
 * banco. Vão pela rede. Efeito colateral aceito: o estado recolhido das seções
 * fica compartilhado entre o PC e o terminal.
 */

/** Nunca saem da máquina, mesmo com token válido. */
export const CANAIS_LOCAIS = [
  // Atualização — cada máquina se atualiza sozinha.
  'atualizacao:instalar',
  'atualizacao:obterInfo',
  'atualizacao:verificar',
  // Backup — só faz sentido em quem é dono do banco.
  'backup:fazerManual',
  'backup:gravarConfig',
  'backup:listarBackups',
  'backup:obterStatus',
  'backup:restaurar',
  'backup:selecionarPasta',
  'backup:verificarSenha',
  // Abre diálogo de pasta no PC.
  'fiscal:salvarXmls',
  'notasEntrada:exportarXmls',
  // Impressão — hardware de quem está operando.
  'impressao:imprimir',
  'impressao:imprimirJanela',
  'impressao:imprimirPdf',
  'impressao:listarImpressoras',
  'impressao:obterPreferencias',
  'impressao:salvarPdf',
  'impressao:salvarPreferencias',
  // Configuração do próprio multi-caixa. Locais por definição: quem administra
  // é quem está no caixa principal. Se atendessem pela rede, um terminal
  // parearia outro terminal ou revogaria a si mesmo.
  'multicaixa:abrirClonagem',
  'multicaixa:abrirPareamento',
  'multicaixa:conectarComoTerminal',
  'multicaixa:reiniciarApp',
  'multicaixa:desligarServidor',
  'multicaixa:estado',
  'multicaixa:exigeSenhaParaReceber',
  'multicaixa:fecharClonagem',
  'multicaixa:fecharPareamento',
  'multicaixa:liberarFirewall',
  'multicaixa:ligarServidor',
  'multicaixa:receberBanco',
  'multicaixa:revogarTerminal',
  'multicaixa:sairDoModoTerminal',
  'multicaixa:situacao',
  // Licença — cada máquina ativa a própria. O destravamento de relógio também
  // é de cada máquina: quem tem a data errada é o PC onde a tela apareceu.
  'licenca:ativar',
  'licenca:consultarCobranca',
  'licenca:criarCobranca',
  'licenca:destravarRelogio',
  'licenca:obterClienteId',
  'licenca:validar'
] as const

/** Atendem o segundo caixa. São os dados da loja: um banco, duas telas. */
export const CANAIS_REDE = [
  'auth:alterarPinVendedor',
  'auth:cadastrarPinPrimeiroUso',
  'auth:elevar',
  'auth:lerTetoDesconto',
  'auth:listarVendedoresParaLogin',
  'auth:login',
  'auth:logout',
  'auth:obterStatus',
  'auth:redefinirComCodigo',
  'auth:sessaoAtual',
  'auth:setarAutoLock',
  'auth:setarTetoDesconto',
  'auth:solicitarRecuperacao',
  'categorias:atualizar',
  'categorias:criar',
  'categorias:definir-tamanhos',
  'categorias:deletar',
  'categorias:listar',
  'chat:enviar',
  'clientes:atualizar',
  'clientes:criar',
  'clientes:deletar',
  'clientes:listar',
  'clientes:listarInadimplentes',
  'clientes:listarVencendoHoje',
  'config:obter',
  'config:salvar',
  'contasPagar:atualizar',
  'contasPagar:criar',
  'contasPagar:deletar',
  'contasPagar:estornarPagamento',
  'contasPagar:listar',
  'contasPagar:registrarPagamento',
  'contasPagar:resumo',
  'dashboard:metricas',
  'dashboard:salvarMeta',
  'devolucoes:itensDevolviveis',
  'devolucoes:porVenda',
  'devolucoes:registrar',
  'devolucoes:saldoCredito',
  'etiquetas:gerarPDF',
  'fiscal:aplicarEmLote',
  'fiscal:buscarCep',
  // Consulta de CNPJ. Atende o segundo posto (é cadastro de cliente), mas de
  // propósito NÃO entra em CANAIS_REPETIVEIS logo abaixo: apesar de ser uma
  // leitura, ela CONSOME 0,1 crédito da conta fiscal (medido — saldo antes e
  // depois de uma chamada isolada). Repetir sozinha depois de falha de rede
  // gastaria crédito sem o dono pedir — aqui a regra de ouro da lista ("só
  // entra quem não muda nada") vale por causa do custo, não do banco.
  'fiscal:buscarCnpj',
  'fiscal:cadastrarEmpresa',
  'fiscal:cancelarNfce',
  'fiscal:cancelarNfse',
  'fiscal:categoriasPendentes',
  'fiscal:configurarCsc',
  'fiscal:configurarNfse',
  'fiscal:consultarCidadeNfse',
  'fiscal:danfe',
  'fiscal:danfse',
  'fiscal:diagnostico',
  'fiscal:diagnosticoNfse',
  'fiscal:diasParaVencerCertificado',
  'fiscal:emitirNfce',
  'fiscal:emitirNfse',
  'fiscal:enviarCertificado',
  'fiscal:listarClassificacao',
  'fiscal:listarServicos',
  'fiscal:mesesComNotas',
  'fiscal:notasDasVendas',
  'fiscal:notasServicoDasVendas',
  'fiscal:notasDoMes',
  'fiscal:obter',
  'fiscal:obterCliente',
  'fiscal:obterProduto',
  'fiscal:obterServico',
  'fiscal:resolverMunicipio',
  'fiscal:salvar',
  'fiscal:salvarCliente',
  'fiscal:salvarProduto',
  'fiscal:salvarServico',
  'fiscal:statusNfce',
  'fiscal:statusNfse',
  'fiscal:statusRemoto',
  'fiscal:xmlNota',
  'fornecedores:atualizar',
  'fornecedores:criar',
  'fornecedores:deletar',
  'fornecedores:listar',
  'loja:obter',
  'loja:salvar',
  'notasEntrada:analisar',
  'notasEntrada:importar',
  'notasEntrada:listar',
  'notasEntrada:meses',
  'notificacoes:detalhe',
  'notificacoes:dispensar',
  'notificacoes:listar',
  'notificacoes:marcarLidas',
  'novidades:estado',
  'novidades:marcar',
  'onboarding:dispensarChecklist',
  'onboarding:estado',
  'onboarding:marcarGuiaVisto',
  // Ordens de serviço — dados da loja, então atendem o segundo posto. É o caso
  // de uso mais natural do multi-caixa neste nicho: o balcão recebe o aparelho
  // e a bancada do técnico acompanha a mesma fila.
  //
  // `os:fechar` merece atenção: ele GERA UMA VENDA (baixa peça do estoque e
  // cobra). Está aqui porque a entrega pode acontecer no balcão, mas jamais pode
  // entrar em CANAIS_REPETIVEIS — repetir depois de falha de rede cobraria o
  // cliente duas vezes.
  //
  // `os:adicionarFoto` trafega a foto já redimensionada em data URL (~300-600 kB,
  // teto de ~2 MB no backend), bem abaixo do LIMITE_CORPO_BYTES de 32 MB do
  // servidor. Passa sem aperto.
  'os:adicionarFoto',
  'os:atualizar',
  'os:criar',
  'os:criarGarantia',
  'os:definirItens',
  'os:fechar',
  'os:historicoAparelho',
  'os:listar',
  'os:listarFotos',
  'os:mudarStatus',
  'os:obter',
  'os:removerFoto',
  // Recibos avulsos. São dados da loja, então o segundo posto emite igual ao
  // balcão. `recibos:criar` NUNCA entra em CANAIS_REPETIVEIS logo abaixo:
  // repetir depois de uma falha de rede queimaria um número da sequência e
  // deixaria dois papéis diferentes para o mesmo recebimento.
  'recibos:cancelar',
  'recibos:criar',
  'recibos:listar',
  'recibos:meses',
  'recibos:obter',
  'recibos:proximoNumero',
  'produtos:atualizar',
  'produtos:buscarPorCodigoBarras',
  'produtos:criar',
  'produtos:deletar',
  'produtos:listar',
  'vendas:aReceberDoMes',
  'vendas:atualizarStatus',
  'vendas:buscarPorId',
  'vendas:cancelar',
  'vendas:criar',
  'vendas:estornarParcela',
  'vendas:estornarRecebimento',
  'vendas:listar',
  'vendas:listarCanceladas',
  'vendas:pagarParcela',
  'vendas:produtosMaisVendidos',
  'vendas:registrarPagamentoParcial',
  'vendas:resumoDashboard',
  'vendedores:alterarPapel',
  'vendedores:alternarAtivo',
  'vendedores:atualizar',
  'vendedores:criar',
  'vendedores:deletar',
  'vendedores:listar',
  'vendedores:redefinirPin'
] as const

/**
 * Canais que o terminal pode tentar de novo sozinho depois de uma falha de rede.
 *
 * A regra que governa esta lista: **só entra quem não muda nada.** Quando uma
 * chamada falha por rede, é impossível saber se ela não chegou ou se chegou,
 * executou e a resposta é que se perdeu. Repetir uma leitura nesse caso é
 * inofensivo. Repetir uma escrita registra a venda duas vezes.
 *
 * Por isso escrita nunca é repetida automaticamente — falhou, o terminal avisa
 * o operador e ele decide. Um pedido a mais é irritante; uma venda a mais é
 * dinheiro errado e estoque furado, e ninguém descobre no dia.
 *
 * Há teste estrutural recusando nesta lista qualquer nome com verbo de escrita.
 */
export const CANAIS_REPETIVEIS = [
  'auth:listarVendedoresParaLogin',
  'auth:lerTetoDesconto',
  'auth:obterStatus',
  'auth:sessaoAtual',
  'categorias:listar',
  'clientes:listar',
  'clientes:listarInadimplentes',
  'clientes:listarVencendoHoje',
  'config:obter',
  'contasPagar:listar',
  'contasPagar:resumo',
  'dashboard:metricas',
  'devolucoes:itensDevolviveis',
  'devolucoes:porVenda',
  'devolucoes:saldoCredito',
  'fiscal:categoriasPendentes',
  'fiscal:diagnostico',
  'fiscal:diagnosticoNfse',
  'fiscal:diasParaVencerCertificado',
  'fiscal:listarClassificacao',
  'fiscal:listarServicos',
  'fiscal:mesesComNotas',
  'fiscal:notasDasVendas',
  'fiscal:notasServicoDasVendas',
  'fiscal:notasDoMes',
  'fiscal:obter',
  'fiscal:obterCliente',
  'fiscal:obterProduto',
  'fiscal:obterServico',
  'fiscal:statusNfce',
  'fiscal:statusNfse',
  'fiscal:xmlNota',
  'fornecedores:listar',
  'loja:obter',
  'notasEntrada:listar',
  'notasEntrada:meses',
  'notificacoes:detalhe',
  'notificacoes:listar',
  'novidades:estado',
  'onboarding:estado',
  // Só as LEITURAS da OS. `os:criar`, `os:mudarStatus`, `os:definirItens` e
  // sobretudo `os:fechar` ficam de fora: são escritas.
  'os:historicoAparelho',
  'os:listar',
  'os:listarFotos',
  'os:obter',
  // Só as LEITURAS. `recibos:criar` fica de fora de propósito: repetir sozinho
  // depois de uma falha de rede queimaria um número da sequência e geraria dois
  // papéis diferentes para o mesmo recebimento. `recibos:cancelar` também
  // escreve.
  'recibos:listar',
  'recibos:meses',
  'recibos:obter',
  'recibos:proximoNumero',
  'produtos:buscarPorCodigoBarras',
  'produtos:listar',
  'vendas:aReceberDoMes',
  'vendas:buscarPorId',
  'vendas:listar',
  'vendas:listarCanceladas',
  'vendas:produtosMaisVendidos',
  'vendas:resumoDashboard',
  'vendedores:listar'
] as const

const CONJUNTO_REDE: ReadonlySet<string> = new Set(CANAIS_REDE)
const CONJUNTO_REPETIVEL: ReadonlySet<string> = new Set(CANAIS_REPETIVEIS)

/** Se o terminal pode repetir sozinho depois de falha de rede. Fecha por padrão. */
export function podeRepetir(canal: string): boolean {
  return CONJUNTO_REPETIVEL.has(canal)
}

/**
 * Decide se o servidor atende este canal. Fecha por padrão: nome desconhecido
 * é recusado, e não liberado por omissão.
 */
export function canalAtendePelaRede(canal: string): boolean {
  return CONJUNTO_REDE.has(canal)
}

/** Todos os canais registrados pela assistência, classificados. */
export const TOTAL_CANAIS = CANAIS_LOCAIS.length + CANAIS_REDE.length
