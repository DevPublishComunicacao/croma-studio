# Croma Studio

Plataforma para análise de cores gráficas, conversão CMYK por perfil ICC e geração de materiais de aprovação.

## Estrutura

```text
apps/
  frontend/     Next.js, interface e processamento local de imagens
  backend/      API HTTP independente
packages/
  shared/       Tipos e contratos compartilhados
scripts/        Ferramentas de desenvolvimento
```

## Requisitos

- Node.js 20 ou superior
- npm 10 ou superior
- Docker Desktop

## Desenvolvimento

No Windows, inicie os dois servidores com `start.bat`. O frontend será aberto na porta `3000` e a API na porta `3001`.

```bash
npm install
npm run dev
```

`npm run dev` inicia frontend e API juntos. O PostgreSQL deve estar ativo com `docker compose up -d`.

Em outro terminal, inicialize o PostgreSQL persistente no Docker Desktop:

```bash
docker compose up -d
```

O banco usa o volume `croma-postgres-data` e é criado com o schema de `db/init.sql`.
Para desligar apenas o container, use `docker compose stop`. Não use `docker compose down -v` se quiser preservar os dados.

O frontend inicia em `http://localhost:3000`. Para iniciar a API separadamente:

```bash
npm run dev:backend
```

A API expõe `GET /health` e `GET /api/v1` em `http://localhost:4000`.

## Persistência

O frontend continua processando as imagens localmente, mas registra o processo na API quando o PostgreSQL está disponível:

- `POST /api/v1/jobs`: cria o pedido da página inicial.
- `GET /api/v1/jobs?limit=25&cursor=...`: lista layouts com paginação por cursor.
- `PATCH /api/v1/jobs/:id`: atualiza os dados do pedido sem duplicá-lo.
- `PUT /api/v1/jobs/:id/faces/:side`: salva metadados, preview, análise e cores de `frente` ou `verso`.
- `POST /api/v1/jobs/:id/exports`: salva o PDF/JPEG exportado em `bytea`.
- `GET /api/v1/jobs/:id`: retorna pedido, faces e histórico de exportações.

Configure `DATABASE_URL` conforme `.env.example`. Se a API ou o banco estiverem desligados, a interface mantém o funcionamento local e os dados ficam temporariamente no `sessionStorage`.

## Comandos

- `npm run build`: gera o build de produção do frontend
- `npm run lint`: executa o ESLint
- `npm run typecheck`: valida os tipos TypeScript

O processamento de imagens permanece local no navegador. O backend está isolado para receber autenticação, persistência e novos recursos sem acoplar essas responsabilidades à interface.
