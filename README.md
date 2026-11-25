# Rateio

Divide a fatura do cartão entre as pessoas: importa o OFX, revisa quem paga cada item e gera a
mensagem de cobrança de cada um. Port do `rateio-v3.html` para um site com banco.

**Stack:** React + TypeScript (Vite) · Supabase (Auth + Postgres com RLS) · Vercel · Vitest · ESLint
· Prettier.

## Rodar localmente

Requer Node 22 (ver `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # preencha com a URL e a chave pública do Supabase
npm run dev
```

Sem `.env.local` o app abre, mas sem banco.

## Scripts

| Comando             | O que faz                                    |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | servidor local com hot reload                |
| `npm run build`     | checa tipos e gera `dist/`                   |
| `npm test`          | testes (Vitest)                              |
| `npm run lint`      | ESLint                                       |
| `npm run format`    | formata com Prettier                         |
| `npm run typecheck` | só a checagem de tipos                       |
| `npm run check`     | lint + formatação + tipos + testes (o do CI) |
| `npm run test:e2e`  | E2E no navegador (Playwright)                |
| `npm run test:db`   | migrations + testes SQL num Postgres local   |

## Testes automáticos (GitHub Actions)

Rodam em todo push, de qualquer branch, e em todo PR:

- **lint, typecheck, test, build**: Vitest e build. É o check exigido na `main`.
- **banco**: Postgres 16 limpo, stub do Supabase, todas as migrations e a bateria SQL (RLS, PIN, import/export de backup). Usa um backup sintético fixo em `supabase/tests/fixtures/`.
- **e2e**: Playwright (desktop e iPhone) contra o build local.
- **e2e no preview**: o mesmo E2E contra a URL do preview da Vercel, quando a integração Git da Vercel estiver ligada.

Nenhum segredo fica no repositório.

## Estrutura

```
src/lib/    domínio puro e testado (sem React, sem rede)
src/data/   Supabase e repositórios
src/ui/     telas e componentes
supabase/migrations/   SQL versionado
docs/       arquitetura e decisões
```

Detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Fluxo de trabalho

- `main` é protegida: mudança entra por pull request com o CI verde.
- Banco: toda mudança de schema é uma nova migration em `supabase/migrations/`.
- Nunca commitar `.env*`, faturas `.ofx`, backups ou dados pessoais (CPF, chave PIX).

## Deploy

Vercel, ligada a este repositório (preview por PR, produção pela `main`). Variáveis
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configuradas no projeto da Vercel.
