# Arquitetura

SPA em React + TypeScript (Vite), servida pela Vercel, com Supabase (Auth + Postgres com RLS)
como único backend. Não há servidor próprio.

## Camadas

```
src/
  lib/    domínio puro: dinheiro, OFX, regras de divisão, memória. Sem React, sem rede. Tudo testado.
  data/   acesso a dados: cliente Supabase e repositórios por tabela. Converte linhas ⇄ tipos do lib.
  ui/     telas e componentes React. Chama lib/ para calcular e data/ para ler e gravar.
  test/   setup do Vitest.
supabase/
  migrations/  SQL versionado do banco.
```

Regra de dependência: `ui → data → lib` e `ui → lib`. O `lib/` não importa nada das outras
camadas (o ESLint barra).

## Origem

Port do `rateio-v3.html` (v3.4, `DATA_VERSION 7`). As regras de negócio do v3 valem sem mudança;
o primeiro módulo portado é `lib/money.ts` (centavos inteiros, `splitEqual`, `splitWeighted`,
`parseCents`, `parseOfxCents`).

## Segurança

- Só a chave pública do Supabase vai para o navegador; o isolamento por usuário é o RLS.
- Chave PIX e CPF nunca no código: ficam nas configurações do usuário, no banco.
- `.gitignore` barra `.env*` e qualquer `*.ofx`.
