# Hospedar uma loja

Para o lojista que não tem onde instalar o aplicativo. O sistema é o mesmo —
mesmo banco, mesmos handlers, mesmas telas — servido por um endereço em vez de
uma janela.

> **Uma loja, uma máquina, um disco.** A conexão com o banco é uma variável
> única do processo, consultada em 334 lugares. Mais importante: o que impede
> vender a última unidade duas vezes é o banco ser **síncrono**, uma operação
> por vez. Um processo por loja preserva essa garantia; espalhar por processos
> a quebraria sem reprovar teste nenhum.

## Antes da primeira loja: o bucket de backups

Uma vez só, para todas as lojas.

```bash
# Bucket PRIVADO. O updates-fhvptech não serve: ele é público, é de lá que sai
# o instalador. Backup de cliente ali seria dado de terceiro na internet aberta.
npx wrangler r2 bucket create fhvp-backups
```

Depois, no painel da Cloudflare → **R2 → Manage API Tokens**, criar um token com
permissão de **escrita** neste bucket. O token que publica os instaladores não
serve: ele alcança o bucket público, e não este.

> Vale configurar no bucket uma **regra de ciclo de vida** apagando objetos com
> mais de 90 dias. Sem ela, os zips diários se acumulam para sempre.

## Abrir uma loja

```bash
LOJA=fhvp-nomedaloja

fly apps create $LOJA
fly volumes create loja_dados --app $LOJA --region gru --size 1

fly secrets set --app $LOJA \
  CHAVE_HMAC=... CHAVE_AES=... SALT_AES=... \
  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET_BACKUPS=fhvp-backups

npm run build:web
fly deploy --config fly.loja.toml --app $LOJA
```

O script manda sete variáveis, tiradas do `.env` local. As chaves de licença
são as mesmas que geram os instaladores; as do R2 são as do token de **backup**
(`R2_BACKUPS_*` no `.env`), e não as que publicam o instalador — mandar as
erradas daria à loja permissão de sobrescrever o instalador que todos os
clientes baixam.

**Nenhuma delas entra na imagem** — o servidor as lê do ambiente em tempo de
execução, e se recusa a subir sem as de licença.

> ⚠️ **Confira o IP depois do primeiro deploy.** No `fhvp-netoimports` o Fly
> falhou em alocar sozinho, com um erro no meio da saída que é fácil de não ver
> (`error allocating ipv6 ... org_slug is only supported with private_v6 type`).
> O deploy foi dado como bem-sucedido, a máquina subiu, e o endereço não
> respondia nada. O conserto é manual:
>
> ```bash
> fly ips list --app $LOJA            # vazio = é isto
> fly ips allocate-v4 --shared --app $LOJA --yes
> fly ips allocate-v6 --app $LOJA     # este NÃO aceita --yes
> ```

Por fim, a licença: a loja abre pedindo ativação, como qualquer instalação nova,
e a chave é cunhada no painel de sempre.

> O backup na nuvem **não liga** enquanto não houver licença — sem ela não há
> como saber de quem é o arquivo. Isso é esperado, e não exige reiniciar nada:
> o servidor reconfere a cada cinco minutos e liga sozinho quando a chave
> entrar. O registro passa de "AINDA NÃO ATIVO" para `[backup-nuvem] ligado`.

## Endereço de marca

O `<loja>.fly.dev` funciona, mas tem cara de infraestrutura. Cada loja ganha um
subdomínio próprio:

```bash
fly certs add netoimports.fhvptech.com --app $LOJA
```

O comando imprime os endereços A e AAAA da loja. No Cloudflare → **DNS**, criar
os dois **sem proxy** (nuvem CINZA):

| Tipo | Nome | Conteúdo | Proxy |
|------|------|----------|-------|
| A | `<loja>` | o IPv4 que o `certs add` mostrou | **DNS only** |
| AAAA | `<loja>` | o IPv6 que o `certs add` mostrou | **DNS only** |

> Subdomínio, e não caminho como no painel do revendedor. Lá faz sentido: é UM
> painel para todos. Aqui cada loja é uma máquina própria, e um caminho exigiria
> um Worker roteando por loja — mais peças, e a mesma armadilha de CSP que já
> derrubou o estilo daquele painel.

### ⚠️ O certificado não sai sem o registro do desafio

Este morde em toda loja nova, e o sintoma não sugere a causa: o
`fly certs check` fica em **"Not verified"** para sempre, sem erro nenhum.

O motivo é o `force_https = true` do `fly.loja.toml`. Ele redireciona TUDO para
HTTPS — inclusive o `/.well-known/acme-challenge/` que a validação usa. E o
HTTPS ainda não funciona, porque o certificado é justamente o que está sendo
emitido. Ovo e galinha.

Para confirmar que é isto:

```bash
curl -s -o /dev/null -w "%{http_code}
"   "http://<loja>.fhvptech.com/.well-known/acme-challenge/x"
# 301 = é isto
```

A saída é validar por DNS em vez de HTTP. Rode `fly certs setup <host> --app $LOJA`
e crie o CNAME que ele mostra, **sem proxy**:

| Tipo | Nome | Conteúdo | Proxy |
|------|------|----------|-------|
| CNAME | `_acme-challenge.<loja>` | `<loja>.fhvptech.com.<id>.flydns.net` | **DNS only** |

O `<id>` é da aplicação e sai naquele comando. O certificado sai em segundos
depois que o CNAME resolve — não precisa mexer no `force_https`, que continua
protegendo o tráfego real.

## Conferir que subiu

```bash
LOJA=fhvp-nomedaloja

# o processo está de pé (não toca no banco)
curl -s https://$LOJA.fly.dev/saude

# a interface é servida
curl -s -o /dev/null -w "%{http_code}\n" https://$LOJA.fly.dev/

# o backup na nuvem ligou — procure a linha "[backup-nuvem] ligado"
fly logs --app $LOJA | grep backup-nuvem
```

Se aparecer `⚠️ BACKUP NA NUVEM AINDA NÃO ATIVO`, leia o motivo na mesma linha:

- **"a loja ainda não foi ativada"** — normal numa loja recém-aberta. Liga
  sozinho quando a licença entrar, sem reiniciar nada.
- **"faltam as variáveis..."** — o script de segredos não rodou, ou o deploy
  ainda não aconteceu depois dele. Isso NÃO se conserta sozinho.

**A loja vende nos dois casos, de propósito** — um sistema que se recusa a
vender porque o backup não está pronto troca um problema sério por um pior. Mas
no segundo caso não deixe assim: os dados existem em um disco só.

## O que fica onde

| | Onde | Custo |
|---|---|---|
| Banco vivo | volume do Fly, São Paulo, `/data`, cifrado | US$ 0,15/mês (1 GB) |
| Máquina | `shared-cpu-1x` 512 MB, sempre ligada | US$ 3,32/mês |
| Backups | R2 `fhvp-backups` (privado), `lojas/<clienteId>/<tipo>/` | ~zero neste tamanho |
| Instalador | R2 `updates-fhvptech` (público) | já existia |

O volume de 1 GB cobre com folga uma loja de venda pouca e cara. O que faz o
banco crescer não são as vendas — é o **XML fiscal guardado dentro dele** (uma
nota de fornecedor medida deu 12,7 KB, e a lei pede cinco anos de guarda). Loja
de volume alto pede mais: `fly volumes extend` resolve sem parar nada.

## Restaurar um backup

O zip do R2 é o **mesmo formato que o aplicativo instalado restaura**. Ou seja:
o cliente pode baixar os dados dele e abrir num Windows, sem depender de nós.
Isso é promessa comercial, e é bom que continue verdade.

```bash
# baixar o mais recente de uma loja
npx wrangler r2 object get fhvp-backups/lojas/<clienteId>/diario/<arquivo>.zip \
  --file backup.zip
```

## Publicar uma versão nova

O aplicativo instalado não muda: `npm run dist:pro` e o `publicar-r2.js` seguem
iguais. O que entra é um passo a mais, depois deles:

```bash
npm run build:web
npm run publicar:lojas            # só LISTA o que faria
npm run publicar:lojas -- --publicar
```

A lista de lojas sai do próprio Fly — todo app com prefixo `fhvp-`. Não há
arquivo para manter em dia, mas há uma pegadinha: **app de loja que fuja desse
prefixo nunca recebe atualização**, e em silêncio.

As lojas são publicadas **uma de cada vez**, e a primeira falha interrompe o
resto. É de propósito: cada deploy derruba e sobe a máquina daquela loja, e o
boot aplica migrations. Em paralelo, uma falha deixaria várias lojas
meio-migradas ao mesmo tempo; em sequência, as que ainda não foram continuam
intactas na versão anterior, que é um estado conhecido.

### Onde as duas pontas divergem

| | App instalado | Loja hospedada |
|---|---|---|
| Quem decide a hora | O lojista clica | Você, no deploy |
| Migrations rodam | Ao abrir depois de instalar | No boot do contêiner |
| Voltar atrás | O instalador antigo continua lá | `fly releases` volta o **código** |

⚠️ **Voltar não desfaz a migration.** O `fly releases` devolve o código; o
esquema do banco já mudou. Código velho lendo esquema novo costuma tolerar (as
migrations aqui são aditivas), mas "costuma" não serve quando o dado é do
cliente. Por isso existe o passo abaixo.

### A cópia antes de migrar

Todo boot que encontra migration pendente guarda uma cópia **antes** de
aplicá-la, em `Backups/pre-update/`, e ela sobe para o R2 como as outras. É o
equivalente ao que o aplicativo instalado sempre fez antes de atualizar — e na
nuvem importa mais, porque ali a nossa é a única cópia.

Loja recém-criada não gera essa cópia: todas as migrations estão pendentes e não
há nada a proteger.

Conferir depois de publicar:

```bash
fly logs --app $LOJA --no-tail | grep -E "cópia guardada|migration"
```

## Rodar na sua máquina

```bash
npm run build:web
npm run servidor:local   # http://localhost:8710
```

Na primeira vez, o script instala um `better-sqlite3` próprio numa pasta
separada — o do repositório é compilado para o Electron e o Node comum recusa
aquele binário. **O aplicativo instalado não é afetado.**

Sem `FHVP_DADOS`, ele cria uma loja vazia própria. Com a variável apontando para
uma pasta de dados existente, abre aquela loja.

## Limitações conhecidas

- **Sem internet, não vende.** A loja instalada continua vendendo com a internet
  caída; esta não. Precisa ser dito ao cliente antes de fechar, não depois da
  primeira queda.
- **Impressão abre a caixa do sistema.** Não existe impressão silenciosa no
  navegador: cada cupom pede um toque a mais. Num balcão de venda cara isso não
  pesa; num mercado de 300 vendas ao dia, pesaria.
- **Sem segundo caixa.** Não faz falta: a web já é vários aparelhos no mesmo
  endereço.
- **O processo roda como root** no contêiner, porque o volume do Fly é montado
  assim. É uma máquina de um inquilino só — mas está anotado como coisa a
  endurecer quando houver folga. Ver o comentário no `Dockerfile`.
