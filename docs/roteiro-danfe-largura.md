# Roteiro manual — a nota fiscal cabendo na bobina

O DANFE da NFC-e saía cortado no lado direito: sumiam a coluna **VL TOTAL**, o
**Valor a Pagar**, o **VALOR PAGO**, o **Troco** e o último dígito da chave de
acesso. A causa é que 80mm é a largura da **bobina**, não a que a cabeça térmica
escreve — ela alcança **72mm**. Pedindo o DANFE em 80mm, o provedor monta 76mm
de conteúdo e os 4mm finais são impressos no ar.

Agora o DANFE é pedido já em 72mm e impresso numa página de 72mm. As duas
medidas saem da mesma função (`larguraDoDanfeMm`), porque se divergirem a nota é
centralizada e volta a sair cortada — do outro lado.

O que os testes automatizados **não** cobrem, e por isso está aqui: o papel. O
caminho da impressão é Chromium + driver de impressora, e nenhum teste prova a
medida que sai da cabeça térmica.

> ⚠️ **Ordem obrigatória:** o backend precisa estar publicado ANTES do app.
> Enquanto ele não estiver, o pedido de 72mm volta como 80mm — sem erro nenhum —
> e a nota sai cortada dos **dois** lados. O backend novo continua atendendo os
> apps antigos normalmente, então publicá-lo primeiro não quebra ninguém.

---

## 1. Emitir a nota

1. Loja com NFC-e configurada, impressora térmica de 80mm ligada.
   Se for só teste, deixar em **homologação** (Configurações → Fiscal):
   a nota não vale fiscalmente e não gasta crédito de verdade.
2. Fazer uma venda com **um item de nome comprido** e pagamento em **dinheiro
   com troco** — é o que enche a linha inteira e revela o corte.
3. Emitir a nota e mandar **imprimir**.

## 2. O que olhar no papel

4. ✅ O cabeçalho da tabela de itens termina em **VL TOTAL** — inteiro, e não
   em "VL T".
5. ✅ Cada item mostra **dois** valores: VL UNIT e VL TOTAL.
6. ✅ **Qtd. Total de Itens**, **Valor a Pagar R$**, **VALOR PAGO** e
   **Troco R$** têm número na frente. Antes a coluna inteira vinha vazia.
7. ✅ A **chave de acesso** tem 44 dígitos (11 grupos de 4). Conferir o último
   grupo: era ali que sumia um dígito.
8. ✅ As linhas tracejadas começam e terminam **dentro** do papel, sem encostar
   na borda direita.
9. ✅ O QR Code sai inteiro e o celular **lê** ele.

## 3. Bobina estreita (só se a loja usar 58mm)

10. Configurações → Fiscal → **Largura da bobina: 58mm**.
11. Emitir e imprimir outra nota.
    ✅ A nota sai completa, mais estreita, sem cortar nada à direita
    (o DANFE passa a ser pedido em 48mm, que é o que a cabeça de 58 escreve).

## 4. A NF-e não pode ter mudado

12. Emitir uma **NF-e (modelo 55)** e imprimir na impressora de documentos.
    ✅ Sai em **A4**, do tamanho de sempre. A largura da bobina não a alcança —
    forçar papel de cupom nela seria o mesmo defeito, do avesso.
