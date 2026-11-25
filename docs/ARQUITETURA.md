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

Port do `rateio-v3.html` (v3.4, `DATA_VERSION 7`). As regras de negócio do v3 valem sem mudança.
O formato dos dados (`lib/types.ts`, `Data`) é o mesmo JSON do backup `RATEIO-BACKUP`, que o banco
importa e exporta (`import_rateio_backup` / `export_rateio_backup`).

### Módulos de `lib/`

As regras recebem um `Ctx` (`{ d: Data, inv: Invoice, today }`) no lugar das variáveis globais do v3.
Nada em `lib/` lê a data de hoje, grava ou pergunta: quem chama decide e salva.

| Módulo                  | O que tem (nome da função no v3)                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `money`                 | centavos inteiros: `parseCents`, `parseOfxCents`, `splitEqual`, `splitWeighted`, `fmtC`, `fracLabel`           |
| `text`, `dates`         | `normalize` (chave da memória, contrato), parcela no texto, `clean`, `pixLabel`, `cyrb53`; competência e datas |
| `ofx`                   | `decodeOfx`, `parseOFX`, sinal das compras, junção por FITID, `detectPaid`                                     |
| `invoice`               | `importStatement` (o cálculo do `buildTxs`), sequência de parcelas, duplicadas, `releaseMissingOwners`         |
| `review`                | o que cada botão da revisão faz no item (dono, divisão, tirar/incluir, pago antecipadamente, em massa)         |
| `split`                 | `sharesOf`, `computeTotals`, `stateOf` (o que trava mensagens e fechamento)                                    |
| `memory`                | memória por texto + valor (`memoryFor`, `applyRule`) e "uma para cada pessoa"                                  |
| `parcelas`              | memória de parcelas (chaves `p3\|FITID\|t\|n`, `p2\|…`, sufixo `#k`), conferir, voltas                         |
| `charges`               | cobranças fixas: parcela por competência, avanço ao fechar, sincronizar com a fatura                           |
| `tags`, `people`        | tags (PAGO reservada) e pessoas (arquivar, excluir)                                                            |
| `message`, `csv`        | texto do WhatsApp (PIX só das configurações) e CSV protegido contra fórmula                                    |
| `receivables`           | em aberto por pessoa, registrar e apagar pagamento                                                             |
| `projection`, `reports` | compromissos futuros e relatórios por pessoa/tag                                                               |
| `closeMonth`            | fechar, desfazer e remover mês                                                                                 |
| `backup`                | texto do backup, validação completa (`backupProblem`), mesclagem e backup com senha                            |
| `undo`                  | desfazer (40 níveis)                                                                                           |

`src/lib/rateio.test.ts` traz os testes de domínio da bateria `rateio-v3-testes/` (ids A–H). Na
preparação deste port, a importação, as mensagens e o fechamento de mês da `lib/` foram comparados com
o `rateio-v3.html` real numa fatura sintética com memória, parcelas, "uma para cada" e cobranças
fixas: mesmos itens, mesmas mensagens e o mesmo registro no histórico.

## Segurança

- Só a chave pública do Supabase vai para o navegador; o isolamento por usuário é o RLS.
- Chave PIX e CPF nunca no código: ficam nas configurações do usuário, no banco.
- `.gitignore` barra `.env*` e qualquer `*.ofx`.
