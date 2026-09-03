# Painéis da FHVP no domínio da marca

São DOIS workers nesta pasta, cada um com o seu config:

| Endereço | Worker | Config | Publicar |
|---|---|---|---|
| `fhvptech.com/painel-do-revendedor` | `painel-do-revendedor.worker.js` | `wrangler.toml` | `npx wrangler deploy` |
| `fhvptech.com/painel-fhvp` | `painel-fhvp.worker.js` | `wrangler-painel-fhvp.toml` | `npx wrangler deploy -c wrangler-painel-fhvp.toml` |

Cada um tem a **própria lista fechada de rotas**, e é assim de propósito: um
erro de digitação num deles não pode abrir nada do outro lado. O do revendedor
recusa `/painel-fhvp`, e o da FHVP recusa `/revenda/*` — os dois estão cobertos
por teste em `backend/src/painelNoDominio.test.ts`.

> ⚠️ **Por que o painel da FHVP passou a ficar aqui.** A decisão original era
> mantê-lo só no `.fly.dev`, para não pôr a administração num domínio público.
> Isso mudou quando ele deixou de ser aberto por um segredo colado à mão e
> ganhou login de verdade (senha forte obrigatória, comparação de tempo
> constante, limite por IP, sessão de 12h revogável). A superfície que a decisão
> antiga evitava é a mesma que já existia no `.fly.dev`, e agora é defendida.

---

# Painel do revendedor em `fhvptech.com/painel-do-revendedor`

O painel roda no Fly (`licenca-gnmodas.fly.dev`). Este Worker põe a marca na
frente, sem mover nada de lugar.

> ⚠️ **O `.fly.dev` continua vivo, para sempre.** Ele está compilado dentro de
> todo instalador que já saiu — ativação de licença, PIX, chatbot, recuperação
> de PIN, emissão de NFC-e e o relay do segundo caixa apontam para lá. Uma loja
> que nunca atualizar vai falar com aquele endereço indefinidamente. Este Worker
> **soma** um endereço; ele nunca substitui.

## Passo 1 — fazer o apex existir no Cloudflare

Hoje `fhvptech.com` não resolve para endereço nenhum (só `updates.fhvptech.com`
está de pé, apontando para o bucket R2). Uma rota de Worker só funciona em
hostname que passa pelo Cloudflare, então o apex precisa de um registro.

No painel do Cloudflare → **DNS** → adicionar:

| Tipo | Nome | Conteúdo | Proxy |
|------|------|----------|-------|
| AAAA | `@`  | `100::`  | **Proxied** (nuvem laranja) |

`100::` é o bloco de descarte do IPv6 — não existe servidor ali. É o truque
padrão para publicar um hostname que só o Worker atende: o Cloudflare intercepta
antes de tentar chegar a lugar nenhum.

> Se um dia houver um site em `fhvptech.com`, este registro é trocado pelo
> endereço real e a rota do Worker continua funcionando por cima, porque ela é
> mais específica que a raiz.

## Passo 2 — publicar o Worker

Com o [Wrangler](https://developers.cloudflare.com/workers/wrangler/):

```bash
cd tools/cloudflare
npx wrangler deploy painel-do-revendedor.worker.js \
  --name painel-do-revendedor \
  --compatibility-date 2026-01-01
```

Ou pelo painel: **Workers & Pages → Create → Worker**, colar o conteúdo de
`painel-do-revendedor.worker.js` e salvar.

## Passo 3 — ligar a rota

**Workers & Pages → o worker → Settings → Domains & Routes → Add route:**

```
fhvptech.com/painel-do-revendedor*
```

(a estrela no fim é obrigatória — sem ela só o caminho exato passa, e o CSS, o
logotipo e as chamadas de API ficam de fora)

Zona: `fhvptech.com`.

## Passo 4 — conferir

```bash
# a página — SEM barra no fim, que é como o revendedor vai receber o link
curl -s -o /dev/null -w "%{http_code}\n" https://fhvptech.com/painel-do-revendedor

# e a <base> tem que estar lá dentro: é ela que faz os caminhos resolverem
curl -s https://fhvptech.com/painel-do-revendedor | grep -o '<base[^>]*>'
# esperado: <base href="/painel-do-revendedor/">

# o estilo e o logotipo
curl -s -o /dev/null -w "%{http_code}\n" https://fhvptech.com/painel-do-revendedor/painel.css
curl -s -o /dev/null -w "%{http_code}\n" https://fhvptech.com/painel-do-revendedor/painel-logo.png

# a API do revendedor (401 é o esperado: existe e recusa credencial inválida)
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H 'Content-Type: application/json' -d '{"revendedorId":"X","senha":"y"}' \
  https://fhvptech.com/painel-do-revendedor/revenda/login

# e o que NÃO pode passar: o painel da FHVP fica só no .fly.dev
curl -s -o /dev/null -w "%{http_code}\n" https://fhvptech.com/painel-do-revendedor/admin/clientes
# esperado: 404 (o Worker recusa; a lista de rotas é fechada por padrão)
```

## Por que o endereço fica sem barra no fim

A página usa caminhos **relativos** (`painel.css`, `revenda/login`) — é isso que
a faz funcionar nos dois endereços com o mesmo arquivo. Só que o navegador
resolve relativo contra o *diretório* do endereço atual:

```
/painel-do-revendedor     → diretório é /                → /painel.css               ✗
/painel-do-revendedor/    → diretório é o prefixo        → /painel-do-.../painel.css ✓
```

A saída óbvia seria redirecionar para a versão com barra. Funciona, mas deixa a
barra na cara do revendedor.

Em vez disso o Worker mexe na **página**: injeta `<base href="/painel-do-revendedor/">`
no `<head>` com o `HTMLRewriter`. A tag `<base>` troca a referência contra a qual
todo caminho relativo é resolvido — inclusive os `fetch()` do JavaScript, que
usam a base do documento. Resultado: o endereço fica limpo, sem barra, e os
caminhos saem certos assim mesmo.

> O `*` da rota (`fhvptech.com/painel-do-revendedor*`) é só padrão de
> correspondência do Cloudflare — **nunca aparece no navegador**.

## O que este Worker deixa passar

Fechado por padrão. Só a superfície do revendedor:

- `/painel` (a página)
- `/painel.css` e `/painel-logo.png`
- `/revenda/*` (login, carteira, criar/renovar/bloquear loja)

O painel da FHVP (`/painel-fhvp`) e as rotas `/admin/*` **não** passam. Elas
exigem o `ADMIN_TOKEN`, mas não têm por que ficar alcançáveis a partir de um
endereço público de marca.


---

# Painel da FHVP em `fhvptech.com/painel-fhvp`

Mesmo desenho do painel do revendedor — vale tudo que está escrito acima sobre
a `<base>`, a CSP e a estrela na rota. As diferenças:

**Rotas que passam:** a página, `painel.css`, `painel-logo.png`, `/admin-login`,
`/admin-logout` e `/admin/*`. Nada mais — as rotas dos aplicativos (`/cobranca`,
`/licenca`), as fiscais e as do revendedor ficam de fora.

**O IP do visitante é repassado.** O backend conta tentativas de login pelo
PRIMEIRO valor de `x-forwarded-for`, e o Worker garante que ali esteja o
`cf-connecting-ip`. Sem isso, todo mundo que chega pelo domínio cairia no mesmo
balde de tentativas — e um estranho conseguiria trancar o dono do lado de fora
só gastando o limite.

**Publicar:**

```bash
cd tools/cloudflare
npx wrangler deploy -c wrangler-painel-fhvp.toml
```

**Conferir:**

```bash
# a página, e a <base> que faz os caminhos relativos resolverem
curl -s https://fhvptech.com/painel-fhvp | grep -o '<base href="[^"]*"'
# esperado: <base href="/painel-fhvp/">

# o estilo e o logotipo
curl -s -o /dev/null -w '%{http_code}
' https://fhvptech.com/painel-fhvp/painel.css

# o login existe e recusa senha errada
curl -s -o /dev/null -w '%{http_code}
' -X POST   https://fhvptech.com/painel-fhvp/admin-login   -H 'Content-Type: application/json' -d '{"senha":"errada"}'
# esperado: 401

# e o que NÃO pode passar
curl -s -o /dev/null -w '%{http_code}
' -X POST https://fhvptech.com/painel-fhvp/cobranca
# esperado: 404
```
