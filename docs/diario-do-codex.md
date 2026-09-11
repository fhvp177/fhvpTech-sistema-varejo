# Diário do Codex

## 10/09/2026: cota fiscal e aplicativo que não reabre

### Pedido e contexto

O dono relatou dois incidentes possivelmente relacionados. Prioridade: na
Assistência atualizada, em um computador de cliente, fechar com caixa aberto
ou nota processando deixou o aplicativo sem reabrir até reiniciar o Windows.
A tentativa de abertura não mostra nenhuma janela ou mensagem. O dono não
conseguiu reproduzir na própria máquina. Também pediu aviso adequado ao atingir
a cota fiscal, em vez de processamento indefinido. Verificar ambos os aplicativos.
Durante a investigação confirmou que a nota presa era **NFC-e**. NFS-e ainda
não foi testada no uso real. Não houve confirmação de tentativa de impressão
antes do incidente.

Leituras: `AGENTS.md`, `PARA-O-CODEX.md`, índice de memória e memórias de emissão
fiscal, licenciamento e problemas antigos de abertura. As hipóteses de pasta de
dados ou relógio não explicam por si o relato de ausência completa de janela.

### O que mudou

- **Encerramento:** `packages/core/src/electron/encerramentoJanela.ts` e
  `apps/{assistencia,varejo}/electron/main.ts`. Depois de a principal efetivamente
  fechar, solicita encerrar o app em Windows/Linux, independentemente das janelas
  invisíveis. A referência da principal é limpa. O fluxo anterior de decisão e
  backup continua sendo executado antes. Fechar o app não fecha o turno do caixa.
- **Impressão:** `packages/core/src/electron/impressao/janelaOculta.ts` e
  `apps/{assistencia,varejo}/electron/ipc/impressao.ts`. A função que cria a janela
  conserva a responsabilidade de destruí-la se carregar falhar ou passar de 30 s.
  O handler HTML também limpa após exceção na impressão. Destruição protegida por
  `isDestroyed()`. Não foram alteradas medidas, margens ou escolha de impressora.
- **Backup ao fechar:** `packages/core/src/electron/backup/BackupAoFechar.ts`.
  Impede reentrada por vários cliques no X. Cancelar depois de uma falha permite
  uma nova tentativa. Nenhum prazo foi imposto ao backup e nenhum banco foi
  convertido para operações assíncronas.
- **Resposta fiscal:** `packages/core/src/electron/fiscal/respostaFiscal.ts` e
  `apps/{assistencia,varejo}/electron/ipc/fiscal.ts`. Espera limitada a 60 s,
  inclusive para o corpo da resposta; tradução da recusa de cota e dos avisos de
  consulta; resposta sem estado não é convertida silenciosamente em pendente.
- **Reserva da tentativa:** mesmos handlers e
  `apps/{assistencia,varejo}/electron/db/queries/fiscal.ts`. A tentativa local é
  gravada antes da rede. Recusas explícitas ficam como erro. Resposta incerta
  conserva a tentativa e bloqueia duplicação. A confirmação/consulta completa
  número, série e identificador do provedor na mesma linha. NFS-e ganhou o
  upsert necessário, pois o método anterior era somente INSERT.
- **Mensagens e espera na tela:** `apps/{assistencia,varejo}/src/components/BotaoNotaFiscal.tsx`
  e `apps/assistencia/src/components/BotaoNotaServico.tsx`. Consultas mostram
  erros, inclusive na consulta automática após emitir. Falhas inesperadas liberam
  o estado ocupado com `finally`. O diálogo de escolha não fecha na recusa.
- **Verificações:** `apps/{assistencia,varejo}/electron/__tests__/emissaoFiscal.test.ts`,
  `apps/varejo/electron/__tests__/{encerramentoJanela,respostaFiscal}.test.ts`,
  `tools/verificar-reabertura/{cenario,verificar}.cjs` e
  `docs/roteiro-cota-fiscal-e-reabertura.md`.

### Evidências, separadas por tipo

**Automação de lógica e SQLite:** testes novos cobrem recusa de cota, nova
tentativa após recusa, simultaneidade, timeout, recuperação por consulta,
metadados, resposta incompleta, avisos ocultos, destruição de janela e reentrada
do backup. As tabelas fiscais dos testes são criadas pelas migrations reais.

**Electron real, automatizado:** `tools/verificar-reabertura/verificar.cjs`
cria processos isolados sem dados de loja. O comportamento antigo mantém uma
janela invisível, segura a trava e impede a sonda de abrir. O corrigido encerra
com código 0 e a sonda obtém a trava. Não é teste de impressão física nem teste
manual do app completo. O cenário foi repetido depois da separação entre núcleo
e criação de janelas no desktop.

**Mutações:** seis proteções removidas deliberadamente, uma por vez, causaram
falha de asserção: pedido de saída, limpeza de janela no erro, aviso fiscal,
registro de recusa, gravação do número confirmado e proteção contra backup
concorrente. Restauradas byte a byte. Não usei `git checkout --` porque os arquivos
continham o trabalho novo sem commit; isso apagaria a correção. O `git status`
após as mutações coincidiu com o anterior, sem remover o trabalho preexistente.

**Primeira suíte completa:** falhou em `nucleoSemElectron.test.ts` porque dois
helpers novos importavam Electron. A regra foi preservada: passei as funções de
criar janela/encerrar pelo app, mantendo os helpers carregáveis em Node comum.
Não foi ampliada a lista de exceções. As conferências de tipos de Varejo e
Assistência passaram antes dessa última separação; a verificação final será
registrada abaixo.

**Verificação final:** `npm test` da raiz terminou com código 0: Assistência
com 1.109 testes aprovados e 15 casos `todo`; Varejo com 1.315 aprovados,
3 ignorados e 15 `todo`. Os novos 33 testes executaram sem skip. Cada aplicativo
mantém um arquivo de testes pendentes ignorado já existente. `npm run typecheck`
rodou na pasta de cada aplicativo, incluindo as configurações node e web, e
ambos terminaram com código 0 depois da separação. A Veterinária não oferece
script de teste/typecheck no package atual; não foi alegada cobertura dela.

Os processos Electron criados pelas duas execuções do cenário foram conferidos
por `Win32_Process` e não restaram processos associados às pastas isoladas.
Não foi aberto servidor local em nenhuma porta. A validação final de arquivos
normalizou somente os arquivos desta tarefa para CRLF e verificou ausência de
bytes de controle. O roteiro e o diário são os registros duráveis da entrega.

**Manual:** nenhum passo reportado pelo dono, nenhuma impressão física ou
emissão real executada. Roteiro numerado com resultados esperados no arquivo
próprio. O computador do incidente ainda precisa da conferência após uma futura
publicação autorizada.

### Descobertas e decisões

1. `window-all-closed` inclui janelas ocultas. A combinação de principal
   destruída, impressão invisível remanescente e `second-instance` que só tenta
   focar uma principal existente produz exatamente ausência de janela ao tentar
   reabrir. Referência: [eventos de encerramento do Electron](https://www.electronjs.org/docs/latest/api/app#event-window-all-closed).
2. Antes da correção, falha em `loadFile` podia deixar a janela sem dono: o
   chamador só recebia a referência depois do `await`. O handler HTML também
   não destruía a janela caso `print()` lançasse antes do callback.
3. O backend **já retorna HTTP 429 com mensagem na recusa comercial de cota**.
   Esse retorno normal já era transformado em erro pelos aplicativos. Não foi
   reproduzido o relato exato de cota que vira processamento pelo POST normal.
   Entretanto, falhas posteriores de consulta retornam HTTP 200 com
   `avisoConsulta`, ignorado pelos aplicativos; outras falhas de consulta também
   eram silenciosas, e os fetches não tinham prazo máximo.
4. Não foi comprovado que caixa aberto ou cota atingida criam a janela invisível.
   O conserto cobre o caminho comprovado de encerramento e os buracos fiscais
   encontrados, sem apresentar a hipótese como diagnóstico do computador real.
5. Não se marca como rejeitada uma nota cuja resposta sumiu, nem se reemite por
   timeout. É escolha deliberada para evitar duplicação. Se a referência não
   aparecer na consulta, precisa de conciliação no servidor/provedor. Nenhuma
   liberação automática de notas antigas foi adicionada.
6. O backup ao fechar continua podendo aguardar disco lento. Encerrá-lo à força
   arriscaria a cópia de segurança. Os novos limites são para carregar documento
   (30 s) e responder chamada fiscal (60 s), não para finalizar backup.
7. Nenhuma nova rota, credencial ou exposição de dados. As respostas simuladas
   usam domínio `.invalid`, identificadores fictícios e banco em memória.
   A regra comercial de cota, a numeração no servidor, estoque, pagamentos,
   licenças e dados dos clientes não foram alterados.

### Trabalho anterior preservado

Já existiam alterações sem commit em `apps/varejo/electron/backup/migrations/index.ts`,
migration 049, testes de cobrança e `packages/core/src/electron/pagamento/filaLogica.ts`.
Também estavam sem rastreamento `AGENTS.md`, `PARA-O-CODEX.md` e o roteiro de release.
Esses arquivos não foram alterados nesta tarefa. Não houve commit, push, mudança
de versão, empacotamento, upload ao R2 ou deploy no Fly.
