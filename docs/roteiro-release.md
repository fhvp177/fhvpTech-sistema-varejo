# Roteiro de release

Como uma versão sai daqui e chega na máquina do lojista. Este arquivo é o
procedimento; as armadilhas estão marcadas com ⚠️ no lugar onde mordem.

> **Nunca publique sem autorização explícita para aquela release.** Autorização
> de uma release não vale para a seguinte. O upload vai direto para clientes de
> produção e não tem botão de desfazer.

---

## Onde a atualização mora

O feed é o **Cloudflare R2**, servido em `updates.fhvptech.com`. São **quatro
canais**, dois por aplicativo:

```
updates.fhvptech.com/basico/latest.yml     varejo, plano Básico
updates.fhvptech.com/pro/latest.yml        varejo, plano Pro
```

E os equivalentes da assistência. O canal também define o que vai **dentro do
binário**: o build roda com `EDICAO=basico|pro`, e é o tree-shaking que remove
do instalador as features fora do plano.

⚠️ **O GitHub é feed APOSENTADO desde a 1.32.2.** Não publique lá, não crie tag
(o tagging morreu junto) e, principalmente, **nunca leia `gh release list` para
saber em que versão o cliente está**. Ele mostra uma release velha e mente. Isso
já fez eu dizer ao dono que os clientes estavam seis versões atrás quando
estavam uma. A conferência certa custa dois segundos:

```bash
curl -s https://updates.fhvptech.com/basico/latest.yml | grep ^version
curl -s https://updates.fhvptech.com/pro/latest.yml    | grep ^version
```

---

## Antes de empacotar

**1. Suba o backend primeiro, se a release depender dele.**
O aplicativo novo pode falar com o servidor velho por alguns minutos, mas o
contrário não: se o app for antes, quem atualizar primeiro quebra. Foi assim na
1.42.1 e tinha que ser.

**2. Suba a versão** em `apps/varejo/package.json` e/ou
`apps/assistencia/package.json`. Os dois aplicativos têm numeração própria e
independente (hoje varejo 1.42.1, assistência 1.5.1).

**3. Escreva as Novidades** em `apps/*/src/data/novidades.ts`, em tom de
vitrine: título curto, **uma frase**, um emoji discreto. Nada de causa de bug,
nada de trabalho interno.

⚠️ **Mostre o texto das Novidades a ele ANTES de empacotar.** Ele vai dentro do
binário: depois de empacotado, mudar uma vírgula exige refazer tudo.

**4. Rode as verificações**, da pasta de cada app:

```bash
npm run typecheck      # NUNCA `tsc -p tsconfig.json`, aquilo aprova em silêncio
npm test
```

**5. Commit e push ANTES do build.** Sempre nessa ordem. Assim o que está no ar
corresponde a um commit que existe no remoto.

---

## Limpar o ambiente

⚠️ **App de dev aberto quebra o empacotamento.** O electron-builder recompila a
dependência nativa e não consegue sobrescrever `better_sqlite3.node` enquanto
uma instância de `npm run dev` o segura. O build morre em
`EBUSY / EPERM: operation not permitted, unlink better_sqlite3.node`.

**6. Mate o `npm run dev`, o `electron-vite dev`, todo processo `electron` e
qualquer servidor local. E CONFIRA que morreram.**

Matar o observador de arquivos não basta: o processo filho do Node continua
segurando o arquivo. Confira de verdade:

```powershell
Get-Process electron, node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path
Get-NetTCPConnection -LocalPort <porta> -State Listen
```

⚠️ Na release de 09/09 um servidor local na 8080 **não morreu**, e o build passou
assim mesmo. Build que passa não prova ambiente limpo.

**7. Limpe `dist/basico` e `dist/pro`.** O `dist-edicao.js` já faz isso, mas
confira: o electron-builder não remove instalador de versão anterior, e sobra
antiga já fez o `publicar-r2` subir o `.exe` errado.

---

## Empacotar e publicar

**8. De dentro da pasta do app** (`apps/varejo` ou `apps/assistencia`):

```bash
npm run dist:basico
npm run dist:pro
```

Um de cada vez, o Básico primeiro. Cada um faz três coisas em sequência:
`npm run build` com o `EDICAO` certo, depois `electron-builder` com
`build-edicoes.config.js`, e por último `scripts/publicar-r2.js`.

⚠️ **O upload é o ÚLTIMO passo, e isso é proposital**: se o build falhar, nada
subiu, e cliente nenhum recebe release pela metade.

Precisa de `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_ENDPOINT` no
`.env` da pasta do app (fora do git). O script reclama e para se faltar algum.

### O que NÃO fazer no empacotamento

⚠️ **Nunca chame `npx electron-builder` direto, nem `npm run dist`.** Sem
`--config build-edicoes.config.js` ele usa o `publish` do `package.json`, que
aponta para o GitHub, e sem `EDICAO` ele cai no padrão `pro`. O resultado é o
pior instalador possível: recursos do plano Pro com endereço de atualização que
nunca mais recebe versão. A máquina instalada assim responde "você já está na
versão mais recente" para sempre, e está tecnicamente certa, só está perguntando
no lugar errado. **Dois notebooks em produção ficaram presos na 1.32.0 por
causa disso.** Por isso `npm run dist` hoje é um script que só imprime o aviso
e sai com erro.

⚠️ **Nunca publique com `gh release create` passando os `.exe`.** Já quebrou:
o `gh` nomeia os assets com **pontos** (`FHVP.Tech...`) e o `latest.yml` espera
**hífens** (`FHVP-Tech...`), então o auto-update não acha o arquivo.

Só para ensaiar o instalador sem publicar:

```bash
node scripts/dist-edicao.js pro --dir
```

---

## Verificar, canal por canal

Sem isto a release não está entregue. São três passos.

**1. O `latest.yml` inteiro** de cada canal, conferido contra o `.exe` local:
`version`, `path`, `size` e `sha512`. O hash se calcula assim:

```bash
openssl dgst -sha512 -binary INSTALADOR.exe | openssl base64 -A
```

**2. `HEAD` no instalador** de cada canal: tem que voltar **200** e o
`content-length` bater com o tamanho do arquivo local.

**3. O `app-update.yml` de DENTRO de cada instalador**, provando que ele aponta
para o canal da própria edição:

```bash
7z e -oT inst.exe '$PLUGINSDIR/app-64.7z'
7z e -oT T/app-64.7z 'resources/app-update.yml'
```

E, no `win-unpacked/resources/app.asar`, conferir com `grep -a` (o asar é
binário) que o canal embutido bate e que **o canal da outra edição não
aparece**.

⚠️ **O `7z` não existe nesta máquina**, então o passo 3 vem sendo pulado. Se
for pular, **diga que pulou**, não deixe implícito. Ele é o passo que teria
pegado o incidente dos dois notebooks.

⚠️ **Armadilha de nome:** o instalador local nasce com **espaços**
(`FHVP Tech Varejo Setup 1.42.1.exe`) e o `publicar-r2` sobe **hifenizado**
(`FHVP-Tech-Varejo-Setup-1.42.1.exe`). Script de verificação que procura o nome
hifenizado no disco não acha nada e acusa falha falsa.

---

## Depois

- Registre no histórico o que foi publicado, em que canais, e **o que foi
  provado e o que não foi**. "Sem smoke-test manual do instalador" é uma frase
  legítima e frequente aqui: escreva ela quando for verdade.
- ⚠️ **Teste automatizado e build limpo não provam impressão.** Se a release
  mexeu em cupom, DANFE ou etiqueta, a prova é papel. O roteiro está em
  `docs/roteiro-danfe-largura.md`.
