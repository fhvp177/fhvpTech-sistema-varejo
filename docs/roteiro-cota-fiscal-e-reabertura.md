# Cota fiscal e reabertura do aplicativo

Preparado em 10/09/2026 para Assistência e Varejo. As correções são locais,
ainda sem commit, release ou deploy. Nenhuma etapa manual abaixo foi
declarada executada pelo dono do projeto.
O incidente relatado pelo cliente foi com **NFC-e na Assistência**; esse é o
primeiro caminho a conferir. NFS-e ainda não foi validada no uso real.

## O que já foi conferido automaticamente

- O próprio Electron foi executado em processos isolados, com uma janela
  principal e outra invisível representando uma impressão presa. O código
  antigo deixou o processo vivo e impediu outra abertura. A correção encerrou
  o processo e permitiu a abertura seguinte com a mesma pasta de teste.
- Os handlers fiscais reais foram exercitados com respostas simuladas e
  SQLite em memória, usando as migrations reais das tabelas de notas.
- A recusa de cota é exibida como erro; a tentativa fica recusada, sem número
  fiscal inventado. Uma tentativa posterior confirmada guarda seu número.
- Dois pedidos simultâneos na mesma instalação não enviam duas notas. Após
  timeout, a tentativa permanece reservada e pode recuperar a autorização por
  consulta, inclusive após registrar novamente os handlers.
- Erros de consulta, inclusive `avisoConsulta` do backend, chegam ao aplicativo.
- Falha ou demora ao carregar o documento destrói a janela invisível. Cliques
  repetidos no X não iniciam backups concorrentes.
- Seis mutações deliberadas fizeram os testes falhar por asserção. Os arquivos
  foram restaurados byte a byte, preservando o trabalho anterior sem commit.

A reprodução isolada fica em `tools/verificar-reabertura/`. Ela usa o Electron
instalado no repositório, uma pasta temporária própria e documentos locais.
Não abre o banco da loja, não imprime, não emite nota e não inicia servidor.

## Conferência manual no aplicativo

Usar uma instalação de desenvolvimento com dados de teste. Repetir os passos
nos dois aplicativos. As etapas fiscais exigem um servidor fiscal de teste
com respostas controladas; não alterar a cota nem emitir notas de um cliente
em produção para executar este roteiro.

1. Abrir um turno de caixa com R$ 40,00 de fundo, fechar o aplicativo pelo X,
   concluir a escolha de backup e abrir novamente pelo atalho.
   **Esperado:** a janela de login aparece sem reiniciar o Windows; após entrar,
   o mesmo turno continua aberto e o fundo continua R$ 40,00.
2. Repetir o fechamento com a preferência de backup automático ativada e clicar
   no X duas vezes enquanto o backup ocorre.
   **Esperado:** apenas um backup e um encerramento; a próxima abertura funciona.
3. Numa instalação de teste em que o backup falhe, escolher Cancelar na mensagem
   de falha, continuar usando o aplicativo e tentar fechar novamente.
   **Esperado:** cancelar mantém a janela utilizável; a próxima tentativa de
   fechamento funciona, sem exigir reiniciar o computador.
4. Imprimir um comprovante de teste, fechar o aplicativo após o trabalho terminar
   e abrir novamente. Repetir com a impressora indisponível e depois voltar a
   disponibilizá-la.
   **Esperado:** a falha fica visível; fechar e abrir não exige reiniciar o
   Windows. Conferir a fila do Windows antes de repetir uma impressão para
   evitar duas cópias físicas do mesmo comprovante.
5. Com o servidor fiscal de teste recusando por cota, tentar emitir uma NFC-e
   de uma venda de R$ 40,00.
   **Esperado:** aparece a mensagem da cota atingida; o indicador de operação
   termina e a escolha do documento permanece disponível. Ao recarregar a lista,
   a tentativa aparece como erro, sem ficar eternamente em processamento. A
   venda continua R$ 40,00 e seu pagamento não muda.
6. Na Assistência, repetir a etapa anterior com NFS-e de uma venda com serviço.
   **Esperado:** o mesmo aviso de cota e o encerramento do indicador de operação;
   o serviço e o recebimento da venda permanecem intactos.
7. Simular emissão cuja resposta demora mais de 60 segundos. Fechar o aplicativo,
   abrir novamente e consultar a nota depois de o servidor de teste confirmar
   a autorização.
   **Esperado:** há aviso de falta de confirmação; não é enviada outra nota para
   a mesma venda. A consulta recupera o número e a autorização, e o aplicativo
   pode ser fechado e reaberto durante a pendência.
8. Simular falha na consulta de uma nota pendente, incluindo o limite de consultas
   do provedor, e clicar para consultar.
   **Esperado:** a mensagem explica a falha e o botão volta a responder. O estado
   fiscal conhecido é preservado, sem transformar falta de resposta em rejeição.
9. Imprimir DANFE NFC-e em bobina de 80 mm e NF-e/NFS-e em A4.
   **Esperado:** NFC-e continua sendo solicitada/impressa em 72 mm, os valores
   da direita aparecem inteiros, e os documentos A4 continuam na impressora
   correspondente. Esta verificação exige papel; a automação não a substitui.

## Limites da comprovação

O incidente no computador específico do cliente ainda não foi repetido nessa
máquina com a correção. A reprodução isolada comprova um caminho real do defeito
de encerramento, mas não identifica o driver ou o documento que deixou a janela
invisível no incidente original. Não foi comprovado vínculo causal entre a cota,
o caixa aberto e essa janela invisível.

Quando a comunicação se perde durante o envio, não é seguro criar outra nota
automaticamente. Se a consulta continuar sem localizar a tentativa, é necessário
conferir a referência no servidor/provedor antes de liberá-la. A correção não
apaga nem reemite notas antigas que já ficaram presas. Só cota atingida não é
prova de que uma nota anterior deixou de existir.

Não foi feita impressão física, emissão fiscal real, alteração de licença,
mudança de cota em produção nem publicação de atualização.
