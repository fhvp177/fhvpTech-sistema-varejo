# Documentação da ACBr API (arquivada)

Cópia local da documentação do provedor fiscal escolhido (ACBr API), usada pela
integração de NFC-e/NF-e/NFS-e que vive **neste backend** — nunca no Electron,
porque a credencial da ACBr e o certificado A1 dos clientes são secrets.

## Por que arquivado

O site `dev.acbr.api.br` responde **403 para acesso automatizado** (ferramentas,
scripts, agentes). Só o `llms-full.txt` passa. Estes arquivos garantem que a
referência continue disponível offline e versionada.

| Arquivo | O que é | Origem |
|---|---|---|
| `acbr-llms-full.txt` | Doc consolidada em Markdown (~192 KB) | `https://dev.acbr.api.br/llms-full.txt` |
| `acbr-swagger.json` | OpenAPI 2.0 completo, 179 endpoints (~816 KB) | `https://prod.acbr.api.br/openapi/swagger.json` |

Baixados em 2026-07-20. Versão da API na época: **3.1.7**.

## Essencial

- **Ambientes:** produção `https://prod.acbr.api.br` · homologação `https://hom.acbr.api.br`
- **Auth:** OAuth2 `client_credentials` em
  `https://auth.acbr.api.br/realms/ACBrAPI/protocol/openid-connect/token`,
  corpo `application/x-www-form-urlencoded`, com `scope` por família de
  documento (ex.: `empresa nfe nfse`).

### Consumo de crédito (importante pro custo)

Nem toda chamada gasta. Conferido no `llms-full.txt`:

- **Gastam 1 crédito:** `POST /nfce` (emitir), `POST /nfce/{id}/cancelamento`,
  `POST /nfce/{id}/email`, `POST /nfce/previa/pdf`, `POST /nfce/{id}/sincronizar`.
- **Grátis:** `GET /nfce/{id}` (consultar status), `GET /nfce/{id}/pdf`,
  `GET /nfce/{id}/escpos`, `GET /nfce/sefaz/status`, `GET /nfce` (listar).
- **Primeira grátis, depois 1 cada:** downloads de XML
  (`/xml`, `/xml/nota`, `/xml/protocolo`).

Consequência prática: **o XML tem que ser guardado no banco no primeiro
download** — rebaixar o mesmo XML cobra de novo. PDF e ESC/POS podem ser
buscados à vontade, então reimprimir cupom não custa nada.

## Consultar sem reler tudo

O `llms-full.txt` é grande; prefira buscar o trecho:

```bash
grep -nA3 "POST /nfce" backend/docs/acbr/acbr-llms-full.txt
```

O swagger é OpenAPI **2.0** (Swagger), não 3.x — schemas ficam em
`definitions`, não em `components.schemas`:

```bash
node -e "const s=require('./backend/docs/acbr/acbr-swagger.json'); console.log(Object.keys(s.definitions).filter(k=>/Nfe|Dfe/.test(k)))"
```
