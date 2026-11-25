# Rateio — banco de dados (Supabase / Postgres)

Schema do porte do `rateio-v3.html` (DATA_VERSION 7, v3.4) para a versão web. Sem backend próprio: o front (React + TypeScript) fala direto com o Supabase. Login pelo Supabase Auth, todas as tabelas com RLS por usuário e as operações que mexem em várias tabelas ficam em funções SQL que rodam numa transação só.

Para a thread do repositório: copiar `migrations/` para `supabase/migrations/` do repo e `tests/` para `supabase/tests/`.

## Migrations

| Arquivo | Conteúdo |
|---|---|
| `0001_schema.sql` | Tabelas, constraints, índices, RLS, gatilhos `updated_at` e a view `open_balances` |
| `0002_pin.sql` | Trava de PIN (igual à do concilia-finance): verifier bcrypt no schema `private`, bloqueio progressivo, `get_pin_status`, `set_pin`, `verify_pin` e `reset_pin` (este só funciona com login feito há até 10 min) |
| `0003_backup_import_export.sql` | `import_rateio_backup` e `export_rateio_backup` (formato `RATEIO-BACKUP {json}`, versões 1 a 7) |
| `0004_close_month_and_payments.sql` | `close_month`, `undo_close_month` e `register_payment` |

## De onde vem cada tabela (localStorage do v3 → banco)

| v3 (`rateio.*`) | Tabela | Observação |
|---|---|---|
| `settings` | `settings` | 1 linha por usuário. Guarda a chave PIX (só aqui, protegida pela RLS), o dono do cartão, as preferências de mensagem, o tempo de bloqueio por inatividade e `data_version` |
| `people` | `people` | `position` guarda a ordem da lista, que define as sobras de centavo e a ordem das mensagens |
| `tags` | `tags` | Nome único por usuário, sem diferenciar maiúsculas |
| `rules` + `ruleSplits` + `ruleEach` + `ruleObs` | `owner_memory` | 1 linha por texto normalizado. `observations` = a lista do `ruleObs` (centavos, donos ou `null` = bloqueio, pesos, data), mais recente primeiro |
| `ruleTags` | `tag_memory` | Chave = texto normalizado ou `fixa:<id>` |
| `charges` | `fixed_charges` | `amount_cents` em centavos (o v3 guardava `"1234.56"` como texto). Parcela atual, total e competência da âncora (`parcComp`) |
| `parcelas` | `installment_memory` | 1 registro por parcela, chave `p3\|FITID\|t\|n` ou `p2\|cartão\|texto\|t\|n`. `extra` guarda campos desconhecidos, para o backup ir e voltar sem perda |
| `history[]` | `closed_months` | Foto do mês fechado. `items`, `fora` e `charges_before` ficam em jsonb porque não mudam depois do fechamento |
| `history[].people[]` | `closed_month_people` | Nome, cor, total e mensagem de cada pessoa no mês |
| `history[].people[].payments[]` | `payments` | Pagamentos recebidos. Apagar o mês apaga os pagamentos junto (cascata) |
| (novo) | `invoice_drafts` | Fatura em revisão. Opcional: deixa a etapa Revisar sobreviver a um recarregamento ou à troca de aparelho. Nunca guarda o OFX bruto |

`open_balances` (view, roda com a permissão de quem consulta) é o `remainingOf()`/`openBalances()` do v3: total do mês maior que zero, menos os pagamentos, sem o dono do cartão. Serve para o selo "n em aberto" e para o resumo "Em aberto".

## Regras que o banco garante

- **Dinheiro em centavos inteiros** (`bigint`) em todas as colunas `*_cents`. Os jsonb do histórico também guardam centavos inteiros, que é como o v3 grava.
- **Ids no formato do app** (`^[A-Za-z0-9_.:-]{1,64}$`), a mesma regra do `backupProblem()` da v3.3 contra backup malicioso (XSS). Os ids são texto e não mudam na migração, então o backup não precisa traduzir id nenhum.
- **Competência** sempre `AAAA-MM` com mês de 01 a 12, e **um fechamento por competência** (`unique (user_id, comp)`).
- **RLS em todas as tabelas**: o dono só lê e grava as próprias linhas (`(select auth.uid()) = user_id`). O papel `anon` não tem acesso a nada.
- **Apagar a conta** (`auth.users`) apaga tudo em cascata.
- Nada de número de conta, CPF ou OFX bruto. A chave PIX só existe em `settings.pix_key`.

## Funções (RPC) para o front

Todas exigem login e rodam como o usuário (`security invoker`, passam pela RLS). A exceção é o PIN, que usa `security definer` para ler o verifier, que fica fora do alcance do cliente.

| Função | Faz o quê no v3 |
|---|---|
| `import_rateio_backup(texto, modo_parcelas?)` | "Restaurar backup". Confere o backup inteiro antes de gravar e é tudo ou nada. Substitui só as partes que estão presentes no backup e roda as migrações 3 a 7 em backup antigo. Se a memória de parcelas do backup não bate com a do banco e não veio `modo_parcelas`, devolve `{status:"needs_decision"}` sem mudar nada; a tela pergunta e chama de novo com `'substituir'` ou `'juntar'`. Backup com senha (`ENC1`) é decifrado no navegador antes da chamada |
| `export_rateio_backup()` | "Copiar backup" / "Baixar .json". Texto idêntico ao do v3, que abre no `rateio-v3.html` antigo |
| `close_month(mes, cobrancas, parcelas)` | Grava de uma vez só o mês fechado, as cobranças fixas já avançadas e as parcelas gravadas no fechamento. Refechar mantém os pagamentos de cada pessoa. O cálculo continua no app |
| `undo_close_month(id)` | "Desfazer fechamento": só o mais recente. Volta as cobranças para `chargesBefore` e apaga o mês |
| `register_payment(pessoa, centavos, data, mes?, posicao?)` | "Registrar pagamento". Sem mês, distribui do mais antigo para o mais novo. Não aceita valor maior que o total em aberto |
| `get_pin_status`, `set_pin`, `verify_pin`, `reset_pin` | Trava de PIN |

O resto é CRUD direto pela API do Supabase (pessoas, tags, memória, cobranças, parcelas, remover mês, apagar pagamento, rascunho).

## Testes

`tests/rodar.sh` roda tudo num Postgres local com um stub mínimo do Supabase (`tests/supabase-stub.sql`):

1. `gerar-backup.cjs` abre o **rateio-v3.html de verdade** no Chromium e monta um backup só com dados inventados: 2 meses fechados, divisão, tags, cobrança fixa parcelada e dividida por proporção, parcela paga antecipadamente e pagamento parcial.
2. `db.test.cjs` roda 31 testes: ida e volta do backup sem perda, centavos, RLS entre dois usuários e `anon`, backup malicioso ou quebrado recusado sem mudar nada, versão nova recusada, conflito de parcelas (perguntar, juntar, substituir), parte ausente mantida, modo cauteloso, migração de backup v2, refechar mantendo pagamentos, desfazer fechamento, distribuição de pagamento, cascatas, PIN e rascunho.
3. `restaurar-no-v3.cjs` devolve o export do banco ao `rateio-v3.html` e confere que o app gera de volta o mesmo backup.

Resultado em 2026-11-25: 31 de 31 testes passaram, e o v3 restaurou o export sem erro e gerou o mesmo backup.

## Decisões técnicas

- **Ids do app preservados como texto**, com chave primária `(user_id, id)`, no lugar de uuid. O backup vai e volta sem tabela de tradução, e o front portado continua usando os mesmos ids.
- **Foto do mês em jsonb, pagamentos em tabela.** A foto nunca muda depois do fechamento. Os pagamentos mudam e precisam de constraint (valor > 0, data válida) e de soma em SQL.
- **`owner_memory` junta os 4 mapas da memória de donos**, porque todos usam a mesma chave (o texto normalizado).
- **O cálculo continua no front** (`memoryFor`, divisão, mensagens, avanço das cobranças). O banco garante formato, isolamento e atomicidade. Assim a regra de negócio fica num lugar só, em TypeScript.
- **Pequenas diferenças do import em relação ao v3**: dois fechamentos da mesma competência no histórico são recusados; cor de pessoa ou tag fora do formato `#RGB…` vira vazia (o v3 já mostrava a cor neutra nesse caso); campos desconhecidos em pessoas, tags e cobranças são descartados (em parcelas e meses fechados vão para `extra`).

## Rodar os testes a partir deste repositório

`db.test.cjs` precisa só de um Postgres 16+ local e de um backup de entrada. `gerar-backup.cjs` e
`restaurar-no-v3.cjs` abrem o `rateio-v3.html` original com o harness de `rateio-v3-testes/`, que
não fazem parte deste repositório: rode-os onde esses arquivos estiverem (pasta do projeto), ou
aponte os caminhos no início de cada script. Por isso essa bateria não roda no CI.
