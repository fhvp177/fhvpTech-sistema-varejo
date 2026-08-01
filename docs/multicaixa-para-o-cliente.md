# Multicaixa — o que o cliente precisa saber antes de contratar

Documento para entregar ao lojista. É folheto por fora e contrato por dentro: descreve o que a
função faz e, principalmente, **o que ela não faz**. Cada limitação aqui é uma escolha de projeto,
não uma pendência — e é melhor combinar antes do que explicar depois.

---

## O que é

Mais de um computador trabalhando na **mesma loja, ao mesmo tempo**: dois caixas no balcão, um
caixa que vai vender fora, uma segunda máquina no escritório.

Todos veem o mesmo estoque, os mesmos preços, os mesmos clientes e as mesmas vendas — na hora. Não
há sincronização a fazer, nem versões diferentes que possam discordar, porque os dados existem em
um lugar só.

## Como funciona, em uma frase

Um computador guarda os dados — chamamos de **caixa principal**. Os outros são **caixas
adicionais**, e não guardam nada: cada tela que abrem consulta o principal e mostra a resposta.

É por isso que nunca ficam desatualizados. E é por isso que precisam estar em contato com ele.

---

## O que muda na sua rotina

### O computador principal vira infraestrutura

Ele precisa ficar **ligado e conectado** enquanto os outros caixas estiverem em uso. Não pode mais
ser "desliga que hoje ninguém usa".

O sistema impede que ele entre em suspensão sozinho enquanto está atendendo — a tela pode apagar
normalmente, só o computador continua acordado. Mas três coisas continuam fora do alcance do
sistema:

- alguém escolher "Suspender" ou desligar a máquina;
- o Windows reiniciar de madrugada para atualizar, e ninguém entrar nela pela manhã;
- falta de energia.

### Sem conexão, o caixa adicional não vende

Se a rede cair, ou o computador principal desligar, o caixa adicional mostra um aviso e **bloqueia
a abertura de novas vendas**. Ele não guarda a venda para enviar depois.

Isso é deliberado. Guardar vendas para enviar mais tarde é exatamente o que faz nascerem dois
estoques diferentes — e o erro só aparece semanas depois, na contagem, quando já não dá para saber
qual número estava certo. Preferimos um caixa que avisa que parou a um caixa que erra em silêncio.

Enquanto não volta, a orientação é anotar no papel e lançar depois.

### Ele também não mostra dados antigos

Sem conexão, a tela fica vazia com o aviso — não mostra a última lista que viu. Dado velho em um
caixa é pior que dado nenhum: exibiria um preço que já mudou e um produto que já foi vendido, e o
operador venderia acreditando na tela.

### A impressora é de cada máquina

O cupom sai na impressora do computador onde a pessoa está. Um caixa adicional operando fora da
loja precisa de impressora própria para entregar cupom em papel.

O mesmo vale para a nota fiscal: ela é emitida normalmente, mas o papel só sai onde houver
impressora.

### O backup existe apenas no computador principal

É ele que tem os dados. Nos caixas adicionais a seção de backup nem aparece.

### As versões precisam ser iguais

Todos os computadores precisam estar na mesma versão do sistema. A atualização é automática, mas
uma máquina que ficou semanas desligada vai se atualizar ao ser aberta — e só depois disso conecta.

---

## Segurança

**Ninguém entra sem autorização.** Para conectar um caixa novo, o gerente gera um código de 6
dígitos no computador principal. O código vale 5 minutos, serve uma única vez e é cancelado após
poucas tentativas erradas.

**Cada caixa pode ser removido a qualquer momento**, pelo próprio computador principal. O acesso
cai na hora.

**Nem tudo é permitido de longe.** Restaurar backup, configurar a impressora e ativar a licença só
funcionam na própria máquina — mesmo para um caixa autorizado.

**Cada pessoa é identificada.** Cada caixa tem seu próprio login, e cada venda registra quem a
realizou. Duas pessoas em máquinas diferentes não se misturam.

---

## Trazer os dados de outro computador

Função separada, útil em três situações:

- instalar o sistema em uma máquina nova sem refazer cadastros;
- trocar o computador da loja;
- o computador principal apresentar defeito e outra máquina precisar assumir.

O gerente gera um código no computador de origem e informa endereço e código no de destino. Os
dados são copiados pela rede, sem pen drive.

**Atenção:** a operação substitui integralmente os dados do computador de destino. Antes de
qualquer alteração, o sistema guarda uma cópia do que existia lá, na pasta de backups. Se o
computador de destino já tiver senha de restauração configurada, ela será exigida.

Copiar os dados **não é necessário** para conectar um caixa adicional — o caixa adicional consulta
o principal ao vivo e não precisa de cópia alguma.

---

## Perguntas que costumam aparecer

**Quantos caixas adicionais posso ter?**
Não há limite técnico. Dois, três, quatro — cada um se conecta da mesma forma.

**Preciso de internet dentro da loja?**
Não. Na mesma rede, os computadores conversam direto, sem passar pela internet.

**E se eu quiser usar um caixa fora da loja?**
Funciona, com internet dos dois lados. A resposta fica um pouco mais lenta que na loja —
imperceptível para vender.

**Os dados ficam na nuvem?**
Não. Os dados continuam no computador da loja, como sempre estiveram.

**Se eu desligar o multicaixa, perco alguma coisa?**
Nada. Os dados são os mesmos de antes; apenas os outros computadores deixam de enxergá-los.
