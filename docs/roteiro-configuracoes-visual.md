# Roteiro manual — visual das Configurações (varejo)

Cada seção virou cartão, com sanfona curta na abertura e a cor da marca em duas
intensidades. Rodar com `npm run dev` dentro de `apps/varejo`, logado como
**gerente** (PIN de desenvolvimento: `343761` / `1325`).

O que os testes automatizados prendem: a duração da sanfona (≤150ms), que só ela
anima layout, que só anima a trilha do grid, e que tudo desliga em movimento
reduzido. O que eles **não** veem é se ficou bom — que é o que este roteiro pede.

---

## 1. A tela abre parada

1. Entrar em **Configurações**.
2. ✅ As seções que estavam abertas da última vez já aparecem abertas, **sem se
   desdobrarem sozinhas**. Nada se mexe no carregamento.

> Abrir o app e ver três sanfonas animando seria o "app que se sacode ao abrir".
> A animação é resposta a um clique, não um espetáculo de entrada.

## 2. Abrir e fechar

3. Clicar no cabeçalho de **Segurança**.
   ✅ A caixa cresce rápido (~120ms) e o conteúdo entra logo atrás, com um
   deslizinho de cima para baixo.
   ✅ A seta gira e fica na cor da marca.
   ✅ O ícone escurece um pouco (10% → 20% da cor).
   ✅ O cabeçalho ganha uma lâmina de fundo e a borda do cartão realça.
4. Clicar de novo para fechar.
   ✅ Fecha **com o conteúdo dentro** — a caixa não fica vazia por um quadro
   antes de encolher.
   ✅ O resumo ("bloqueio em 15 min") reaparece embaixo do título.

## 3. A seção mais pesada

5. Abrir **Dados da loja**, que é o formulão da tela.
   ✅ Abre igualmente liso, sem engasgo nem tranco no meio.

> É o caso que decidiu o teto de 120ms. Se aqui tremer no PC da loja, o número
> está alto demais — e o lugar de mexer é o `animacoes.css`, não a tela.

## 4. Nada fica cortado

6. Abrir **Impressão** e abrir o seletor de impressora.
   ✅ A lista aparece inteira, mesmo passando da borda da seção.
7. Mesma coisa em qualquer seção com seletor.

> Durante a transição a seção recorta o que transborda; ela **solta** o recorte
> ao assentar. Se um dia um seletor aparecer decapitado, é aqui que quebrou.

## 5. Só uma cor, em intensidades

8. Olhar a tela com várias seções fechadas.
   ✅ Todos os ícones estão na **mesma** cor (azul no varejo), variando só a
   força entre aberta e fechada.
   ✅ Nenhuma seção tem cor própria.

> Foi decisão sua: a alternativa (âmbar em Segurança, verde em Dados da loja)
> deixaria a tela mais fácil de varrer, mas essas cores sairiam iguais em todos
> os nichos. Assim a tela nasce certa em cada marca — na assistência a mesma
> classe pinta petróleo.

## 6. Hover

9. Passar o mouse por um cartão **fechado**.
   ✅ Ele sobe 1px, ganha sombra e a borda insinua a cor da marca.
   ✅ O ícone acena de leve.
10. Passar o mouse por um cartão **aberto**.
    ✅ Não sobe. Cartão aberto está "fixo" — mexer nele enquanto se lê o
    conteúdo seria ruído.

## 7. Movimento reduzido (o teste que mais gente esquece)

11. Windows → **Configurações → Acessibilidade → Efeitos visuais** → desligar
    "Efeitos de animação".
12. Voltar ao app e abrir/fechar seções.
    ✅ Elas trocam de estado **num quadro só**, sem sanfona e sem fade.
    ✅ **O conteúdo aparece.** Este é o ponto: se só a transição fosse desligada,
    o conteúdo ficaria congelado em invisível e a seção abriria vazia. Trocar
    animação por tela quebrada é pior que a animação.
13. Religar o ajuste ao terminar.

## 8. A memória do que ficou aberto

14. Deixar duas seções abertas, sair de Configurações e voltar.
    ✅ As mesmas duas continuam abertas.
15. Fechar o app e reabrir.
    ✅ Continuam abertas.

---

## Pendências assumidas

- **A assistência não recebeu isto.** O `SecaoConfig` está duplicado nos dois
  apps e só o do varejo mudou — as duas telas estão diferentes de propósito, por
  falta de tempo, não por decisão de desenho.
- **O certo é o componente ir para `packages/core`** e os dois apps consumirem o
  mesmo. Enquanto não for, toda mudança aqui precisa ser repetida lá na mão.
- O CSS da sanfona **já está no core** (`packages/core/src/ui/animacoes.css`), o
  que deixa essa mudança futura mais curta: falta mover só o componente.
