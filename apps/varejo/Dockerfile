# Imagem do servidor web de UMA loja.
#
# ── Duas etapas, e a razão da primeira ───────────────────────────────────────
# O `better-sqlite3` é um binário compilado, e tem que ser compilado para o
# motor que vai carregá-lo. No repositório ele está compilado para o Electron
# (é o que o `electron-builder install-app-deps` faz), e o Node comum recusa
# aquele arquivo. Então a primeira etapa instala e compila para o Node desta
# imagem, e a segunda leva só o resultado — sem compilador, sem cabeçalhos de
# Python, sem as centenas de megabytes que isso arrasta.
#
# ── O que NÃO é construído aqui ──────────────────────────────────────────────
# A interface (`dist-web`) e o servidor (`dist-servidor`) são compilados na
# máquina de quem publica, com `npm run build:web`, e entram prontos. Construir
# dentro da imagem obrigaria a trazer o monorepo inteiro para dentro dela.
#
# Os segredos NÃO estão nesses arquivos: as chaves de licença são lidas do
# ambiente em tempo de execução (ver vite.servidor.config.ts). Esta imagem pode
# ser reconstruída à vontade sem carregar nada sensível.
#
# Publicar:
#   npm run build:web
#   fly deploy --config fly.loja.toml --app fhvp-<loja>

# ── Etapa 1: compilar o SQLite para este Node ────────────────────────────────
FROM node:22-slim AS nativo

# node-gyp precisa destes três para compilar o addon. Ficam nesta etapa e não
# chegam na imagem final.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /build
# Só o que o servidor carrega do node_modules em tempo de execução — o resto do
# monorepo já está embutido no bundle.
RUN npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund \
       better-sqlite3@^12.10.0 \
       bcryptjs@^3.0.3 \
       archiver@^6.0.2 \
       adm-zip@^0.5.17

# ── Etapa 2: a imagem que roda ───────────────────────────────────────────────
FROM node:22-slim

# `tini` para o processo receber o sinal de desligamento direito: sem ele o Node
# roda como PID 1 e o Fly acaba matando a máquina à força durante um deploy,
# no meio de uma escrita no banco.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=nativo /build/node_modules ./node_modules
COPY dist-servidor/servidor.mjs ./servidor.mjs
COPY dist-web ./dist-web

# O volume da loja é montado aqui — ver o `[[mounts]]` do fly.loja.toml.
ENV FHVP_DADOS=/data \
    FHVP_WEB=/app/dist-web \
    PORT=8080 \
    NODE_ENV=production

EXPOSE 8080

# ── Sobre rodar como root ────────────────────────────────────────────────────
# Fica como root, e é escolha, não descuido.
#
# O volume do Fly é montado em `/data` pertencendo ao root. Um processo rodando
# como `node` não conseguiria escrever nele — o banco nem abriria. Contornar
# exigiria um script de entrada que troca o dono e depois abaixa privilégio,
# e essa dança complica o repasse do sinal de desligamento, que é justamente o
# que protege uma escrita no banco durante um deploy.
#
# O que se ganharia é pouco nesta forma: a máquina atende UMA loja, roda UM
# processo, e quem escapasse dele alcançaria exatamente os dados que o processo
# já lê. Não há vizinho para contaminar.
#
# Vale endurecer quando houver folga — não vale trocar uma proteção real de
# escrita por uma teórica de contenção.

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "servidor.mjs"]
