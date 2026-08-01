# Multi-caixa — plano de testes

Dois conjuntos, sempre separados:

- **Automatizados** — rodam com `npm test` dentro de `apps/varejo`. Provam lógica e regressão.
- **Roteiro manual** — passo-a-passo pra executar no app rodando. Prova o que automação não alcança: impressão, foco de janela, atalho de teclado, duas máquinas conversando e dinheiro ponta-a-ponta.

Regra que vale pros dois: **teste verde só conta depois de provar que ele fica vermelho.** Antes de confiar num teste novo, quebra o código de propósito, vê falhar, e restaura.

---

## Fase 0 — Roteador de canais

Esta fase não muda nada que o lojista veja. É exatamente isso que se testa: **que nada mudou.**

### Automatizados

| Teste | Arquivo | O que prova |
|---|---|---|
| Inventário de canais | `electron/__tests__/canais.test.ts` | Os 134 canais continuam registrados, sem sumir, renomear nem duplicar. Aceita as duas formas de registro, então não muda durante o refactor. |
| Roteador | `electron/__tests__/roteador.test.ts` | Handler síncrono continua síncrono; exceção continua escapando em vez de virar resposta; a origem não vaza entre chamadas concorrentes; a ponte descarta o evento do Electron. |
| Sessão por máquina | `electron/__tests__/sessao.test.ts` | O login do terminal não derruba o do PC, cada venda sai no nome de quem vendeu, logout e revogação atingem só uma origem. |
| Atomicidade da venda | `electron/__tests__/atomicidade.test.ts` | A camada de queries inteira é síncrona, `criarVenda` confere o estoque antes da transação e o handler `vendas:criar` não é async. |

**Estado:** 42 testes novos passando (4 inventário + 19 roteador + 12 sessão + 7 atomicidade). Suíte cheia do varejo: 292.

A garantia contra estoque furado é uma corrente de três elos, cada um com teste próprio: a camada de queries nunca cede a vez, o handler de venda é síncrono, e o roteador não embrulha síncrono em promessa. Se qualquer elo cair, a garantia cai junto.

Mutações verificadas em 2026-07-28, todas restauradas depois:

| O que quebrei de propósito | O que aconteceu |
|---|---|
| Renomeei um canal | Inventário acusou o canal sumido |
| Registrei um canal no formato novo (`registrarCanal`) | Passou — prova que o teste atravessa o refactor |
| Dupliquei um canal | 3 testes falharam |
| Troquei o contexto por uma variável global | Só o teste de concorrência falhou, e com o bug real: a chamada do PC enxergou a origem do terminal depois do `await` |
| Tornei o `despachar` assíncrono | 7 testes falharam, incluindo o da atomicidade |

### Roteiro manual (executar depois das tarefas #2 a #6)

Rodar com `npm run dev` em `apps/varejo`. O objetivo é não encontrar diferença nenhuma.

| # | Passo | Resultado esperado |
|---|---|---|
| 1 | Abrir o app e logar com o PIN | Entra normal, sem erro no console |
| 2 | Abrir Produtos, cadastrar um produto novo | Salva e aparece na lista |
| 3 | Fazer uma venda à vista de 2 itens | Fecha, o estoque dos 2 itens cai, o cupom sai na impressora |
| 4 | Fazer uma venda parcelada em 3x com entrada | As 3 parcelas aparecem com os valores certos |
| 5 | Receber 1 parcela e conferir a dívida do cliente | O restante bate: total menos o que já foi pago |
| 6 | Estornar esse recebimento | A dívida volta ao valor de antes |
| 7 | Cancelar uma venda usando o PIN do gerente | Pede o PIN, cancela, e o estoque volta |
| 8 | Registrar uma devolução | Gera o crédito e devolve o item ao estoque |
| 9 | Emitir uma NFC-e de teste (ambiente de homologação) | Autoriza, e o DANFE abre |
| 10 | Abrir o painel e conferir os números do dia | Batem com o que foi feito nos passos acima |
| 11 | Sair como vendedor e entrar como gerente | Telas restritas aparecem só pro gerente |
| 12 | Tentar uma ação de gerente logado como vendedor | Pede autorização, como hoje |
| 13 | Rodar um backup manual | Gera o arquivo |
| 14 | Fechar e reabrir o app | Sobe limpo, exige login de novo |

Qualquer passo que se comporte diferente de hoje é bug do refactor — não é ajuste.

**Executado em 2026-07-28.** Passaram: login, cadastro de produto, venda parcelada, estorno, cancelamento, cupom e etiqueta A4 — estes dois últimos cobrem justamente os dois handlers alterados à mão (`impressao:listarImpressoras` e `impressao:imprimirJanela`).

**Não executado: NFC-e (passo 9).** Depende do CSC, credencial que a loja pede à SEFAZ e ainda não existe. É bloqueio anterior ao multi-caixa — a NFC-e nunca foi emitida nem antes do refactor.

Como isso deixava os 26 canais fiscais sem passagem manual, a cobertura foi fechada por outro caminho: uma comparação canal a canal da assinatura de cada handler antes e depois do codemod, contra o `git HEAD`. **129 conferidos, 127 idênticos** fora a remoção do parâmetro do evento; as 2 diferenças são os handlers de impressão corrigidos à mão, de propósito. Como o único estrago possível do codemod é deslocar parâmetros, e nenhum deslocou, o risco na fiscal está coberto.

---

## Fase 1 — Modo servidor no PC

### Automatizados

| Teste | Arquivo | O que prova |
|---|---|---|
| Prova dos nove | `provaDosNove.test.ts` | A mesma chamada, pelo caminho local e pelo HTTP, devolve resultado idêntico — inclusive recusa de regra de negócio, exceção, acento e centavos. A única diferença de propósito é quem chamou. |
| Servidor | `servidorMulticaixa.test.ts` | Sem token não passa nada, nem a versão; allowlist barra antes do roteador; erro de handler atravessa como erro; `/parear` é a única rota sem token. |
| Config | `configMulticaixa.test.ts` | Arquivo corrompido, vazio ou torto não derruba o boot; gravação atômica; o PC nunca guarda o token cru. |
| Pareamento | `pareamento.test.ts` | Código de 6 dígitos morre em 5 minutos, serve uma vez e queima em 5 erros. |
| Firewall | `firewall.test.ts` | Regra estreita (entrada, TCP, uma porta, um programa) e nunca em rede pública; caminho com `&` não vira comando. |
| Despertador | `despertador.test.ts` | Bloqueio de suspensão não acumula nem fica pendurado. |

**Estado:** 384 testes passando na suíte do varejo.

### Roteiro manual — exige as duas máquinas

Na primeira máquina (caixa principal):

| # | Passo | Resultado esperado |
|---|---|---|
| 1 | Configurações → Segundo caixa | A seção aparece, com o botão "Ligar" |
| 2 | Clicar em "Ligar" | Muda para "Atendendo outros caixas"; se o Windows perguntar sobre rede, autorizar |
| 3 | Clicar em "Gerar código" | Aparece o endereço (ex.: 192.168.0.10:4877) e 6 dígitos com contagem regressiva |
| 4 | Esperar os 5 minutos sem usar | O código some sozinho da tela |
| 5 | Gerar outro e deixar aberto | — |

Depois, no segundo computador (a partir da Fase 2, quando a tela de conexão existir): conectar com endereço e código, conferir que aparece na lista "Caixas conectados", e então:

| # | Passo | Resultado esperado |
|---|---|---|
| 6 | Digitar o código errado 5 vezes | Na quinta, avisa que o código expirou e é preciso gerar outro |
| 7 | Remover o terminal da lista no PC | O segundo caixa perde o acesso na hora, sem esperar reiniciar |
| 8 | Deixar o PC ocioso 30 minutos com o modo ligado | Não suspende; a tela pode apagar |
| 9 | Fechar e reabrir o sistema no PC | Volta a atender sozinho, sem precisar ligar de novo |

---

## Fase 2 — Modo terminal

### Automatizados (a criar)

- Boot em modo terminal não abre banco nem roda migration.
- Escrita não reenvia sozinha depois de timeout; leitura reenvia.
- `opId` repetido não grava a mesma venda duas vezes.
- Handshake recusa versões que não casam.

### Roteiro manual — **o mais importante do projeto**

Exige duas máquinas. Cobre os fluxos de dinheiro rodando do terminal (tarefa #22), com conferência no PC depois de cada um; derrubar a rede no meio de uma venda; e desligar o PC com o terminal aberto.

---

## Fases 3, 4 e 5

Roteiros escritos junto com cada fase. Pontos já conhecidos que vão entrar:

- **Fase 3:** latência real fora da loja; busca do PDV com debounce não pode engasgar; reconexão automática depois de perder o sinal.
- **Fase 4:** as duas máquinas ativando a mesma licença; guardião de relógio no terminal, que não tem banco pra ancorar a data.
- **Fase 5 (condicional):** venda offline com reserva e no modo estoque livre; e o relatório de conferência precisa acusar a venda dobrada que o modo livre permite.
