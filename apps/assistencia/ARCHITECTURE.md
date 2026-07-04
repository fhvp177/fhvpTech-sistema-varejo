# CONTEXTO DO PROJETO

Estou desenvolvendo um **sistema desktop offline** para gestão de uma pequena loja de varejo (roupas, brinquedos, perfumes e produtos diversos). O sistema será **alugado mensalmente** para lojistas, então precisa ter um mecanismo de licenciamento que bloqueie o acesso quando o aluguel não for pago.

Preciso que você me ajude a construir esse sistema do zero, seguindo a arquitetura e os requisitos descritos abaixo. **Antes de começar a codar, leia este documento por completo e me faça perguntas se algo estiver ambíguo.**

---

## 🏗️ STACK TÉCNICA OBRIGATÓRIA

| Camada | Tecnologia |
|---|---|
| Shell desktop | **Electron** (offline, cross-platform) |
| Frontend | **React + TypeScript** |
| Estilização | **Tailwind CSS** |
| Componentes UI | **shadcn/ui** |
| Banco de dados | **SQLite via better-sqlite3** |
| Geração de código de barras | **JsBarcode** (SVG) |
| Máscaras de input | **react-imask** |
| Envio de e-mail | **Nodemailer** (com fila local para modo offline) |
| Geração de PDF | **jsPDF + html2canvas** ou impressão nativa do Electron |
| Build/Empacotamento | **electron-builder** |

---

## 📐 ARQUITETURA EM CAMADAS

```
┌─────────────────────────────────────────────┐
│  APRESENTAÇÃO: React + TypeScript + Tailwind │
├─────────────────────────────────────────────┤
│  NEGÓCIO: Electron Main Process (Node.js)    │
│  (Regras, Licença, Email, IPC handlers)      │
├─────────────────────────────────────────────┤
│  DADOS: SQLite via better-sqlite3            │
└─────────────────────────────────────────────┘
```

A comunicação entre o React (renderer) e o Node (main) deve ser feita via **IPC seguro com contextBridge no preload.ts**. NUNCA exponha o `ipcRenderer` ou módulos do Node diretamente ao React.

---

## 📁 ESTRUTURA DE PASTAS DESEJADA

```
/meu-sistema/
├── electron/
│   ├── main.ts              ← processo principal
│   ├── preload.ts           ← ponte segura IPC
│   ├── licenca.ts           ← validação de licença
│   ├── email.ts             ← envio de e-mails (Nodemailer)
│   └── ipc/                 ← handlers IPC por entidade
│       ├── produtos.ts
│       ├── clientes.ts
│       ├── fornecedores.ts
│       ├── vendas.ts
│       └── etiquetas.ts
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Produtos.tsx
│   │   ├── Clientes.tsx
│   │   ├── Fornecedores.tsx
│   │   ├── Vendas.tsx
│   │   └── EtiquetasA4.tsx
│   ├── components/
│   │   ├── BarcodeGenerator.tsx
│   │   ├── FolhaA4Preview.tsx
│   │   ├── EtiquetaUnitaria.tsx
│   │   ├── SeletorLayout.tsx
│   │   ├── InadimplentesCard.tsx
│   │   └── ui/              ← componentes shadcn/ui
│   ├── db/
│   │   ├── schema.ts        ← criação das tabelas
│   │   └── queries/         ← queries por entidade
│   ├── utils/
│   │   ├── presetsLayoutA4.ts
│   │   └── gerarPDFEtiquetas.ts
│   └── App.tsx
├── database.sqlite
├── licenca.lic
└── package.json
```

---

## 🗄️ SCHEMA DO BANCO DE DADOS (SQLite)

```sql
-- Produtos
CREATE TABLE produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_barras TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT,
  preco REAL NOT NULL,
  estoque INTEGER DEFAULT 0,
  fornecedor_id INTEGER,
  data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
);

-- Fornecedores
CREATE TABLE fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cnpj TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT
);

-- Clientes (nome e telefone obrigatórios; endereço opcional)
CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  endereco TEXT,
  data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vendas
CREATE TABLE vendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER,
  data DATETIME DEFAULT CURRENT_TIMESTAMP,
  total REAL NOT NULL,
  status_pagamento TEXT CHECK(status_pagamento IN ('pago','pendente','inadimplente')) DEFAULT 'pendente',
  data_vencimento DATE,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- Itens da venda
CREATE TABLE itens_venda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id INTEGER NOT NULL,
  produto_id INTEGER NOT NULL,
  quantidade INTEGER NOT NULL,
  preco_unitario REAL NOT NULL,
  FOREIGN KEY (venda_id) REFERENCES vendas(id),
  FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

-- Licença mensal
CREATE TABLE licenca (
  id INTEGER PRIMARY KEY,
  chave TEXT NOT NULL,
  data_expiracao DATE NOT NULL,
  ativo BOOLEAN DEFAULT 1
);

-- Layouts customizados de etiqueta A4
CREATE TABLE layouts_etiqueta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  colunas INTEGER NOT NULL,
  linhas INTEGER NOT NULL,
  largura_etiqueta_mm REAL NOT NULL,
  altura_etiqueta_mm REAL NOT NULL,
  margem_topo_mm REAL DEFAULT 0,
  margem_esquerda_mm REAL DEFAULT 0,
  espacamento_h_mm REAL DEFAULT 0,
  espacamento_v_mm REAL DEFAULT 0
);

-- Fila de e-mails (modo offline)
CREATE TABLE email_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destinatario TEXT NOT NULL,
  assunto TEXT NOT NULL,
  corpo TEXT NOT NULL,
  enviado BOOLEAN DEFAULT 0,
  data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
  data_envio DATETIME
);
```

---

## ✅ REQUISITOS FUNCIONAIS

### 1. Cadastro de Produtos
- Campos: código de barras, nome, categoria, preço, estoque, fornecedor
- **Botão para gerar código de barras automaticamente** (formato EAN-13 ou Code128)
- Exibição visual do código de barras gerado (SVG via JsBarcode)
- Suporte a **leitor de código de barras USB** (atua como teclado — capturar via input focado)

### 2. Cadastro de Clientes
- **Obrigatórios:** nome e telefone
- **Opcional:** endereço
- Máscara no telefone: `(XX) X.XXXX-XXXX`

### 3. Cadastro de Fornecedores
- Campos: nome, CNPJ, telefone, e-mail, endereço
- Máscaras: CNPJ `XX.XXX.XXX/XXXX-XX`, telefone `(XX) XXXX-XXXX`

### 4. Vendas
- Tela de PDV com leitura de código de barras (auto-foco no campo de leitura)
- Adicionar múltiplos itens, calcular total
- Definir status: pago / pendente / inadimplente
- Se pendente, registrar data de vencimento

### 5. Dashboard Inicial
- **Área destacada no topo** mostrando:
  - Clientes **inadimplentes** (vencimento passou e não pagou) — destaque vermelho
  - Clientes com **pagamento vence hoje** — destaque amarelo
- Resumo de vendas do dia, total em estoque, etc.

### 6. Sistema de Licença Mensal
- Arquivo `licenca.lic` criptografado (AES) na pasta do app
- Ao iniciar, o Electron valida a data de expiração
- Se vencida → tela de bloqueio até inserir nova chave
- Chave gerada externamente por mim (script separado) contendo: identificador do cliente + mês/ano + hash
- Validação **100% offline**

### 7. Envio de E-mail de Inadimplência
- Tarefa agendada (ex: ao abrir o app) verifica clientes inadimplentes
- Gera e-mail consolidado e adiciona à `email_queue`
- Quando houver internet, Nodemailer envia via SMTP (configurável pelo lojista)

### 8. Gerador de Etiquetas em Folha A4 Adesiva
- Selecionar produtos do estoque e quantidade de etiquetas por produto
- Presets de layout: Pimaco 6080 (3×10), Pimaco 6082 (2×7), Pimaco A4356 (3×8), Compacta (4×12), Personalizado
- **Campo "posição inicial"** para aproveitar folhas parcialmente usadas
- Opção de mostrar/ocultar: nome do produto, número do código, linhas-guia de corte
- Layout de cada etiqueta:
```
  |||| || ||||  ← código de barras
  7891234567890  ← número
  Produto X      ← nome
```
- Pré-visualização fiel à impressão
- Exportar PDF ou imprimir direto
- CSS com `@page { size: A4; margin: 0; }` e Grid CSS para precisão milimétrica

---

## 🎨 PADRÕES DE CÓDIGO

- **TypeScript estrito** (`strict: true` no tsconfig)
- Componentes React em **arrow functions** com tipagem explícita de props
- Queries SQL **sempre parametrizadas** (proteção contra SQL injection, mesmo offline)
- Toda operação de banco passa pelo **main process via IPC** — o renderer nunca acessa o SQLite diretamente
- Tratamento de erro com `try/catch` e retorno padronizado: `{ success: boolean, data?, error? }`
- Nomes de variáveis e funções **em português** (já que é um sistema brasileiro)
- Comentários explicativos em pontos críticos (licença, IPC, impressão)

---

## 🚀 ORDEM DE IMPLEMENTAÇÃO SUGERIDA

1. **Setup inicial** — Electron + Vite + React + TypeScript + Tailwind + shadcn/ui
2. **Banco de dados** — schema, conexão, primeiras queries
3. **Ponte IPC segura** — preload.ts + handlers básicos
4. **Sistema de licença** — bloqueio funcional antes de tudo
5. **CRUD de Fornecedores** (mais simples, serve de modelo)
6. **CRUD de Produtos** com gerador de código de barras
7. **CRUD de Clientes** com máscaras
8. **Módulo de Vendas / PDV**
9. **Dashboard** com card de inadimplentes
10. **Gerador de etiquetas A4**
11. **Módulo de e-mail** com fila
12. **Empacotamento** com electron-builder (instalador .exe / .dmg / .AppImage)

---

## 🎯 PRIMEIRA TAREFA

Comece pelo **passo 1: setup inicial do projeto**.

1. Crie a estrutura de pastas conforme descrito acima
2. Configure Electron + Vite + React + TypeScript + Tailwind + shadcn/ui
3. Configure o `electron-builder` no `package.json`
4. Crie um `main.ts` mínimo que abra uma janela com o React rodando
5. Configure o `preload.ts` com `contextBridge` (deixar pronto para receber handlers)
6. Me mostre o resultado final e como rodar o projeto em modo dev

**Antes de gerar qualquer código, confirme comigo:**
- Sistema operacional alvo principal (Windows? macOS? Linux? Todos?)
- Se devo usar `npm`, `yarn` ou `pnpm`
- Se posso prosseguir com essa stack ou se você tem alguma sugestão melhor para algum ponto específico

Vamos construir isso passo a passo, sem pular etapas. A cada módulo concluído, faremos testes antes de seguir para o próximo.