# FHVP Tech: instruções de trabalho neste repositório

Leia este arquivo inteiro antes da primeira ação. Ele não é documentação do
código: é o acordo de trabalho com o dono do projeto, construído ao longo de
meses. Cada regra aqui nasceu de um erro que já custou caro.

---

## 1. Quem é o dono do projeto, e como falar com ele

Ele é o **dono do negócio e o decisor**, não um programador. Opera sistemas em
**produção, em lojas reais, com dinheiro passando**.

- **Responda sempre em português do Brasil.**
- **Linguagem simples, com analogias concretas.** Jargão trava a conversa.
  Termos como "abstração de user store" ou "extrair sob demanda" já pararam o
  trabalho. O que funciona: "o núcleo compartilhado é a caixa de ferramentas",
  "código é a máquina, config é o valor que você digita".
- **Converse em prosa antes de pedir decisão.** Ele rejeita popup de escolha
  enquanto ainda está entendendo o assunto. Explique, confirme que ficou claro,
  e deixe ELE puxar a decisão.
- **Poucos travessões.** Pedido explícito, vale no código, nas telas e no chat.
  Use dois-pontos, parênteses, vírgula ou ponto final.
- **A marca é "FHVP Tech".** "Sistema RT" e "GN Modas" são nomes aposentados.
  Não use nem no raciocínio interno.
- ⚠️ **O nome do cliente antigo NUNCA vai para produção.** É o nome que aparece
  no endereço do backend no Fly (`licenca-...fly.dev`), e por isso ainda existe
  em 19 arquivos: o app não dá para renomear. Há um teste
  (`backend/src/painelNoDominio.test.ts`) que prende essa lista — ela pode
  encolher, nunca crescer. Arquivo novo com o nome dentro quebra o build.

  ⚠️ Isto vale para ESTE arquivo também, e já mordeu: escrever a regra
  soletrando a palavra faz o próprio teste reprovar, porque ele não distingue
  usar de citar. Descreva o nome, não o escreva.
- **Vocabulário genérico no varejo.** O app de varejo é produto de prateleira
  para lojas de qualquer ramo. Fale em produto, item, unidade, estoque, venda.
  Nunca em peça, blusa, roupa, "loja de roupas".

## 2. Como agir

**Execute, não dite comandos.** Se há comando para rodar, rode. Entregar uma
lista para ele colar transfere o trabalho, o risco de digitar errado e a
responsabilidade de perceber que um passo falhou. Isso já causou um incidente
real: um comando rodou no servidor, o terminal do Windows mentiu dizendo "The
handle is invalid", e a loja de um cliente ficou travada na tela de ativação
sem ninguém saber.

Só devolva comando para ele quando você de fato não puder executar: login
interativo (`fly auth login`), senha, ou bloqueio de permissão. Nesse caso,
diga que foi bloqueio, não escolha sua.

**Não peça permissão para ação local e reversível.** Fechar app de dev, matar
processo travado, limpar `out/`, apagar temporário: faça e avise depois, em uma
linha.

**Peça confirmação UMA vez para o que sai da máquina ou não tem volta:**
publicar release, `git push`, `git commit`, deploy no Fly, cadastrar chave no
servidor de licença (irreversível), apagar código ou dado do usuário.

**Avalie o risco ANTES de implementar.** Em qualquer mudança que toque runtime
(validação, segurança, fluxo de dinheiro), liste o que pode quebrar e, também,
o que NÃO é afetado. Ele exige "zero impacto para os clientes de produção".

**Levante o modelo de ameaça sozinho** ao expor dado ou superfície nova: quem
alcança isso na prática, o que vaza, quanto custa consertar depois. Resolva o
que é decisão técnica óbvia; traga só o que tem trade-off real. Dê sempre o
argumento contrário com honestidade e uma recomendação explícita. Quando a
decisão for "não fazer", escreva no código que foi escolha, senão vira dívida
que o próximo leitor confunde com descuido.

**Pedido de economia vale para a sessão, não para sempre.** Se ele pedir para
gastar menos tokens ou ir mais rápido, isso expira quando o motivo passa.

**Nunca diga que testou quando só rodou o vitest.**

## 3. O repositório

Monorepo com npm workspaces. Node + TypeScript + React + Vite + Electron +
SQLite. Windows, CRLF.

```
packages/core/     núcleo compartilhado (ui, lib, electron)
apps/varejo/       PDV de varejo (o principal, Electron + versão web hospedada)
apps/assistencia/  nicho de assistência técnica (ordens de serviço)
apps/veterinaria/  nicho veterinário
backend/           licenciador + painel FHVP + painel de revendedores (Fly.io)
docs/              roteiros de teste manual
```

⚠️ Nos nichos, **peça e serviço dividem a tabela `produtos`**. Código escrito
pensando no varejo costuma ignorar isso e quebrar.

## 4. Comandos

```
npm run typecheck              # SEMPRE este, de dentro da pasta do app
npm run typecheck:web
npm run typecheck:node
npm test                       # vitest, na raiz roda todos os workspaces
npm run dev:varejo
npm run dev:assistencia
npm run build:varejo
npm run dist:varejo:win
```

⚠️⚠️ **NUNCA use `npx tsc --noEmit -p tsconfig.json`.** O `tsconfig.json` da
raiz de cada app tem `"files": []` e só aponta referências. O comando termina em
silêncio **sem conferir arquivo nenhum**, e a saída vazia parece aprovação. Isso
já custou uma tela branca no aparelho de um cliente: o typecheck foi reportado
como "ok" quatro vezes seguidas e nunca tinha conferido nada.

**Desconfie de verificação que passa instantaneamente.** O typecheck destes
apps leva segundos, não milissegundos.

## 5. Regras invioláveis de interface

O princípio único, que resolveu três reincidências: **a proteção mora no
componente BASE, nunca na tela**. Corrigir tela a tela é esteira infinita,
porque toda tela nova nasce desprotegida.

**Diálogos** (`packages/core/src/ui/dialog.tsx`):
- Não adicione `max-h` nem `overflow` na tela. Já vem do base. Se precisou, o
  base regrediu: conserte lá.
- `[&>*]:min-w-0` no DialogContent, senão conteúdo longo pinta fora da caixa.
- `max-h-[90vh] overflow-y-auto`, senão some o título em cima e os botões
  embaixo.
- `sticky` no cabeçalho/rodapé **não funciona** enquanto o container for `grid`.
- Tabela dentro de diálogo vai em contêiner com `overflow-x-auto`. Nunca
  `overflow-hidden` (amputa a última coluna) e nunca teto em px numa coluna
  (teto em `<table>` vira PISO de largura).
- Rode `larguraDosDialogos.test.ts` (existe no varejo e na assistência).

**Listas flutuantes dentro de diálogo** (autocomplete, combo). Três regras, e
o jsdom não pega nenhuma delas:
1. `createPortal` + `fixed`, posição medida com `getBoundingClientRect()`,
   remedindo em `resize` e `scroll` (com capture `true`). Modelo pronto:
   `ClienteSeletor.tsx`. Nunca `absolute` dentro do diálogo.
2. `pointer-events` e `pointerdown` tratados no portal.
3. **`wheel`**: sem isso a roda do mouse não rola a lista.

**Proibido `<select>` nativo.** Guardado por `semSelectNativo.test.ts`.

**Proibido `alert()`, `confirm()` e `prompt()` do navegador.** Toda caixa é
componente do sistema, com as cores e a tipografia do sistema.

**Campo com formato SEMPRE com máscara**: telefone, CPF/CNPJ, CEP, valor.
- Use `IMaskInput`, nunca reformate no `onChange`: o IMask preserva a posição
  do cursor. Sem isso o cursor pula pro fim a cada tecla.
- Guarda automática: `camposComMascara.test.ts` varre todo `.tsx` e reprova
  campo chamado cpf/cnpj/rg/cep/telefone/documento sem máscara.
- ⚠️ RG não tem formato nacional. Só dígitos, X final opcional e teto de
  tamanho. Máscara fixa recusaria RG legítimo.

**Foco**: campo `disabled` durante verificação assíncrona mais `focus()`
chamado antes do repintar é NO-OP. Use `useFocoAoLiberar`
(`packages/core/src/lib/`). Nunca chame `focus()` depois do `await`.

**Erro não fecha a caixa**: devolve o cursor ao campo culpado.

## 6. Armadilhas do domínio

⚠️ **O SQLite síncrono segura dinheiro.** É o comportamento síncrono do banco
que impede vender a última unidade duas vezes. Não "modernize" para assíncrono.

⚠️ **"Hoje" é calculado em UTC.** `CURRENT_TIMESTAMP` no SQLite é UTC por
definição. Corrigido no varejo na v1.41.0. **A assistência ainda tem o
defeito.**

⚠️ **Os dois drivers de SQLite discordam em silêncio.** `better-sqlite3` lança
erro com parâmetro ausente; `node:sqlite` grava NULL. A guarda tem que ser
estrutural, não convenção.

⚠️ **`valor_pago` é a fonte da verdade.** Dívida é `total - valor_pago`.

⚠️ **Migrations**: todo `ALTER` é idempotente. Os esquemas escritos à mão
dentro dos testes envelhecem e divergem do real.

⚠️ **Porta local: nunca 8080, 3000, 5173, 5000, 8000.** A máquina dele roda
outros projetos em paralelo, alguns prestes a ir para cliente. Um servidor na
8080 já sequestrou um site dele **duas vezes**. E não é conflito de porta: um
app fica em IPv4, o outro em IPv6, os dois no ar sem erro, e o túnel do
Cloudflare prefere IPv6. **Confira as DUAS pilhas.** O padrão do backend é
4899, com teste que segura.

⚠️ **Matar processo não basta, CONFIRA.** `pkill -f "tsx watch"` mata o
observador de arquivos, mas o processo filho do Node, que é quem mantém o
socket, continua vivo. Depois de encerrar, rode
`Get-NetTCPConnection -LocalPort <porta> -State Listen`. Só então diga que
limpou. PID que dá "Acesso negado" provavelmente é processo dele: não insista.

⚠️ **Script que edita código-fonte vai em ARQUIVO, nunca `python -c`.** O shell
come um nível de escape e o estrago é silencioso: já gravou bytes de controle
(0x00, 0x08, 0x1f, 0x7f) dentro do código quatro vezes, e o arquivo continua
parecendo certo na tela. Escreva o `.py`, normalize CRLF para `\n` antes de
casar âncora, ancore em texto único com `assert conta == 1`, e ao final varra
os bytes provando que não sobrou caractere de controle.

## 7. Testes

**Toda entrega de peso leva DOIS conjuntos, separados e explícitos:**
1. **Automatizados** (vitest), que você escreve e executa.
2. **Roteiro manual** numerado, para ele executar no app rodando, com o
   resultado esperado escrito ao lado de cada passo ("o total tem que continuar
   R$ 40,00", não "confira o total"). Vivem em `docs/`.

Priorize no manual o que a automação não alcança: **impressão**, janela e foco,
atalhos de teclado, comportamento com duas máquinas, e todo fluxo de dinheiro
ponta a ponta.

**Verde não vale sozinho: prove que fica vermelho.** Mute o código de propósito,
veja o teste falhar, restaure com `git checkout --` e confira o `git status`
limpo. Já houve teste que sobrevivia à mutação que devolvia o bug.

**Mudou algo visual? Avise na hora**, dizendo o que olhar, e siga trabalhando.
Ele roda `npm run dev` e confere.

## 8. Release

- As "Novidades" que o lojista lê (`apps/*/src/data/novidades.ts`) são
  **vitrine, não changelog**. Tom formal, **uma frase curta** por item, um emoji
  discreto. Para bug: "Foram corrigidos pequenos problemas em X" e acabou. Nunca
  a causa, nunca o como, nunca a situação que acontecia. Trabalho interno
  (refatoração, teste, migration, troca de credencial) **não aparece**. O
  critério é: o dono da loja faz algo diferente por causa disto?
**O passo a passo completo está em `docs/roteiro-release.md`. Leia antes de
publicar qualquer coisa, e não publique sem autorização explícita para aquela
release.** O resumo:

- O feed é o **Cloudflare R2**, em `updates.fhvptech.com`, com **quatro canais**
  (Básico e Pro, para cada aplicativo). Publica-se com `npm run dist:basico` e
  `npm run dist:pro`, de dentro da pasta do app.
- ⚠️ **Nunca chame `npx electron-builder` direto nem `npm run dist`.** Sem o
  `--config build-edicoes.config.js` ele aponta o auto-update para o GitHub e
  cai no padrão `pro`. Dois notebooks em produção ficaram presos na 1.32.0 por
  causa disso, respondendo "você já está na versão mais recente" para sempre.
- ⚠️ **O GitHub é feed aposentado desde a 1.32.2.** Não publique lá, não crie
  tag, e **nunca use `gh release list` para saber o que o cliente tem**: ele
  mostra release velha e mente. A verdade é
  `curl -s updates.fhvptech.com/<canal>/latest.yml | grep ^version`.
- ⚠️ **App de dev aberto quebra o empacotamento** (`EBUSY` no
  `better_sqlite3.node`). Mate tudo antes e **confira** que morreu.
- Mostre o texto das Novidades a ele **antes** de empacotar: vai dentro do
  binário.
- Verifique canal por canal depois: `latest.yml` completo contra o `.exe` local
  (sha512 incluído) e `HEAD` 200 no instalador.
- O instalador da assistência tem **acento** no nome do arquivo.
- Backend (Fly) vai **antes** do cliente, sempre.

---

## 9. Contexto profundo (leia sob demanda)

O histórico completo do projeto vive fora do repositório, em **87 arquivos** de
memória escritos ao longo de meses:

```
C:\Users\fhvp1\.claude\projects\C--Users-fhvp1-Desktop-FHVP-Tech---Apps\memory\
```

Comece pelo `MEMORY.md` de lá: é o índice, com o estado atual, as pendências
abertas e uma linha por assunto. Quando for mexer num assunto específico
(nota fiscal, licenciamento, TEF, impressora térmica, backup em nuvem,
migração de cliente), **leia o arquivo daquele assunto antes de escrever
código**. Vários deles registram decisões que parecem erradas e não são.

Alguns que quase sempre importam:

| arquivo | assunto |
|---|---|
| `project_nota_fiscal_vet.md` | NFC-e e NFS-e. A constante ESCOPOS é o teto de tudo |
| `reference_impressora_termica_80mm.md` | POS80. O DANFE se pede em 72mm, 80mm é a bobina |
| `reference_licenciador_chaves.md` | banco no Fly em WAL, trava fiscal nunca é forçável |
| `project_painel_fhvp_admin.md` | a chave só aparece uma vez; `clienteId` chaveia a NFC-e |
| `project_release_pendente_v1_11.md` | histórico de releases e as armadilhas de publicação |
| `project_multinicho_monorepo.md` | por que o core existe e o que pode entrar nele |
| `project_abrir_loja_hospedada.md` | ⚠️ o Fly falha em alocar IP e reporta deploy como SUCESSO |

⚠️ Essas memórias descrevem o que era verdade quando foram escritas. Se uma
delas citar arquivo, função ou flag, **confirme que ainda existe** antes de
recomendar.
