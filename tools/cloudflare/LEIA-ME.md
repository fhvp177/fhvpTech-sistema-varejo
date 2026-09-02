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
# redireciona para a barra no fim (301) — é o que segura os caminhos relativos
curl -sI https://fhvptech.com/painel-do-revendedor | head -3

# a página
curl -s -o /dev/null -w "%{http_code}\n" https://fhvptech.com/painel-do-revendedor/

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

## Por que a barra no fim importa

A página usa caminhos **relativos** (`painel.css`, `revenda/login`) — é isso que
a faz funcionar nos dois endereços com o mesmo arquivo. O navegador resolve
relativo contra o *diretório* do endereço atual:

```
/painel-do-revendedor     → diretório é /                   → /painel.css              ✗
/painel-do-revendedor/    → diretório é /painel-do-.../      → /painel-do-.../painel.css ✓
```

Sem a barra, o pedido sai para a raiz de `fhvptech.com`, onde o Worker não
escuta: a página abre sem estilo e o login não responde. O redirecionamento 301
do passo 1 do Worker existe só para isso.

## O que este Worker deixa passar

Fechado por padrão. Só a superfície do revendedor:

- `/painel` (a página)
- `/painel.css` e `/painel-logo.png`
- `/revenda/*` (login, carteira, criar/renovar/bloquear loja)

O painel da FHVP (`/painel-fhvp`) e as rotas `/admin/*` **não** passam. Elas
exigem o `ADMIN_TOKEN`, mas não têm por que ficar alcançáveis a partir de um
endereço público de marca.
