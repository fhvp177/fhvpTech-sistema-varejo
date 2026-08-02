# Roteiro manual — guardião de relógio

Confere o tratamento novo: em vez de cair na tela de licença ("insira sua
chave"), o sistema agora confere a hora com o servidor e decide o que fazer.

Rode em ambiente de DEV (`npm run dev` em `apps/varejo`). Anote o resultado de
cada passo.

> **Antes de começar:** o Windows vai querer corrigir a data sozinho. Desligue
> Configurações → Data e hora → "Definir horário automaticamente" enquanto
> estiver testando, e ligue de volta no fim.

---

## Cenário 1 — o caso do cliente: data certa, âncora podre

O que se espera: **o sistema abre normalmente, sem nenhuma tela de erro.**

1. Com o sistema fechado, adiante a data do Windows em **10 dias**.
2. Abra o sistema. Ele abre normal (o relógio andou para frente, não há
   bloqueio). Isso grava a data adiantada no caderninho.
3. Feche o sistema.
4. Volte a data do Windows para **hoje**.
5. Deixe a internet **ligada** e abra o sistema.

✅ **Passou se:** o sistema abriu direto, como se nada tivesse acontecido. Sem
tela de relógio, sem tela de licença.

❌ **Falhou se:** apareceu qualquer tela de bloqueio.

---

## Cenário 2 — sem internet, ninguém pôde conferir

O que se espera: **tela nova de relógio, com o botão de destravar.**

1. Repita os passos 1 a 4 do cenário 1 (adiantar 10 dias, abrir, fechar, voltar
   a data).
2. **Desligue o Wi-Fi / tire o cabo de rede.**
3. Abra o sistema.

✅ **Passou se:** apareceu a tela "A data do computador está errada", mostrando
a data desta máquina, com dois botões: "Já ajustei a data, tentar novamente" e
"Destravar mesmo assim".

4. Clique em **"Destravar mesmo assim"**.

✅ **Passou se:** o sistema entrou. Feche, abra de novo (ainda sem internet) e
confirme que ele continua abrindo — o conserto é permanente.

---

## Cenário 3 — a fraude que a trava existe para pegar

O que se espera: **continua bloqueado, mas agora dizendo a data correta.**

1. Com o sistema fechado e a internet **ligada**, atrase a data do Windows em
   **30 dias**.
2. Abra o sistema.

✅ **Passou se:** apareceu a tela de relógio mostrando as DUAS datas — "Neste
computador" (a atrasada) e "Data correta" (a de verdade, vinda do servidor) —
com o passo a passo de como ajustar o Windows. **Não pode haver botão
"Destravar mesmo assim"**: aqui o relógio está errado mesmo.

3. Corrija a data do Windows.
4. Clique em **"Já ajustei a data, tentar novamente"**.

✅ **Passou se:** o sistema entrou.

---

## Cenário 4 — nada quebrou no caminho feliz

1. Com data certa e internet ligada, abra e feche o sistema duas vezes.

✅ **Passou se:** abre normalmente e sem demora perceptível. (A consulta ao
servidor só acontece quando a trava dispara — no uso normal ela nem é feita.)

---

## Depois de testar

- Religue "Definir horário automaticamente" no Windows.
- Se quiser inspecionar o estado do caderninho:
  `node scripts/diagnosticar-relogio.js` em `apps/varejo`.
