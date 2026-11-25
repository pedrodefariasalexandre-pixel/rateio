-- Rateio — schema inicial (porte do rateio-v3.html, DATA_VERSION 7).
--
-- Princípios:
--   * Um usuário = um "navegador" do app antigo. Toda linha tem user_id e RLS por auth.uid().
--   * Dinheiro sempre em centavos inteiros (bigint). Nenhum float.
--   * Os ids do app (p1, g…, 1732…, chaves de parcela) são preservados como texto, com a mesma regra
--     de formato do backupProblem() do v3 (^[A-Za-z0-9_.:-]{1,64}$). Isso mantém o backup
--     RATEIO-BACKUP ida e volta sem tradução de ids.
--   * Mês fechado é foto imutável: itens e "fora" ficam em jsonb. O que muda depois do fechamento
--     (pessoas do mês e pagamentos recebidos) é tabela normal, com constraint.
--   * Nada de OFX bruto, número de conta ou CPF no banco. A chave PIX fica só em settings (RLS).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as
$$ begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------- settings
-- rateio.settings + versão do formato + preferência de bloqueio por inatividade (PIN).
create table public.settings (
  user_id            uuid primary key default auth.uid() references auth.users on delete cascade,
  pix_key            text not null default '' check (char_length(pix_key) <= 77),
  pix_owner_id       text not null default 'p1',         -- "dono do cartão": nunca fica em aberto, não recebe PIX
  last_backup_at     timestamptz,
  msg_pending        boolean not null default true,      -- mensagens incluem valores em aberto
  msg_projection     boolean not null default false,     -- mensagens incluem previsão de parcelas
  proj_recurring     boolean not null default false,     -- projeção inclui cobranças fixas mensais
  inactivity_minutes integer not null default 5 check (inactivity_minutes between 1 and 60),
  data_version       integer not null default 7,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------- pessoas
create table public.people (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null check (id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  position   integer not null default 0,                 -- ordem da lista (define sobras de centavo e mensagens)
  name       text not null default '' check (char_length(name) <= 40),
  color      text check (color ~ '^#[0-9A-Fa-f]{3,8}$'),
  phone      text not null default '' check (char_length(phone) <= 30),
  archived   boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------- tags
create table public.tags (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null check (id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  position   integer not null default 0,
  name       text not null check (char_length(name) between 1 and 24),
  color      text check (color ~ '^#[0-9A-Fa-f]{3,8}$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index tags_user_name_uq on public.tags (user_id, lower(name));

-- ---------------------------------------------------------------- memória de donos
-- Uma linha por texto normalizado (normalize() do app). Junta quatro mapas do v3:
--   rules[norm] -> owners · ruleSplits[norm] -> split · ruleEach[norm] -> each_owners · ruleObs[norm] -> observations
-- observations = [{c: centavos, o: [pid] | null, w?: {pid: peso}, at: 'AAAA-MM-DD'}], mais recente primeiro, até 12.
create table public.owner_memory (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  norm_key     text not null check (char_length(norm_key) <= 300),
  owners       text[],
  split        jsonb check (split is null or jsonb_typeof(split) = 'object'),
  each_owners  text[],
  observations jsonb check (observations is null or jsonb_typeof(observations) = 'array'),
  updated_at   timestamptz not null default now(),
  primary key (user_id, norm_key)
);

-- Tags lembradas: chave = texto normalizado ou 'fixa:<id da cobrança>'.
create table public.tag_memory (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  rule_key   text not null check (char_length(rule_key) <= 300),
  tag_ids    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, rule_key)
);

-- ---------------------------------------------------------------- cobranças fixas
-- parcAtual vale para a competência installment_comp; sem parcela = repete todo mês.
create table public.fixed_charges (
  user_id             uuid not null default auth.uid() references auth.users on delete cascade,
  id                  text not null check (id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  position            integer not null default 0,
  name                text not null default '' check (char_length(name) <= 200),
  amount_cents        bigint,                            -- null = valor vazio/ilegível; só entra na fatura se > 0
  owners              text[] not null default '{}',
  weights             jsonb check (weights is null or jsonb_typeof(weights) = 'object'),
  installment_current integer,                           -- vazio = cobrança mensal
  installment_total   integer,
  installment_comp    text check (installment_comp is null or installment_comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  last_month_label    text not null default '',
  updated_at          timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------- memória de parcelas
-- Um registro POR PARCELA (nunca por loja). Chave p3|FITID|t|n ou p2|cartão|texto|t|n (#2, #3 em colisão).
-- extra guarda campos que o app venha a gravar e que este schema não conhece (backup ida e volta sem perda).
create table public.installment_memory (
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  key            text not null check (char_length(key) between 1 and 400),
  memo           text not null default '',
  norm           text not null default '',
  acct           text not null default '',               -- hash do cartão ("k…"), nunca o número
  cur            integer,
  tot            integer,
  cents          bigint,
  fitid          text not null default '',
  purchase_date  text not null default '',               -- dataCompra, só informação ("12/03")
  status         text not null default 'pendente' check (status in ('pendente','pago_antecipado','fora_manual')),
  marked_on      date,                                   -- em
  comp           text not null default '' check (comp = '' or comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  paid_cents     bigint check (paid_cents > 0),           -- valorPago
  discount_cents bigint check (discount_cents >= 0),     -- desconto
  origin         text not null default 'manual',          -- manual | fechamento
  returns        jsonb not null default '{}' check (jsonb_typeof(returns) = 'object'),  -- voltas[comp] = {decisao, em}
  review_flag    text,                                    -- conferir (ex.: "migração")
  old_key        text,                                    -- chaveAntiga
  extra          jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'),
  updated_at     timestamptz not null default now(),
  primary key (user_id, key)
);
create index installment_memory_status_idx on public.installment_memory (user_id, status) where status <> 'pendente';

-- ---------------------------------------------------------------- histórico (meses fechados)
create table public.closed_months (
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  id             text not null check (id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  comp           text not null check (comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  label          text not null default '',
  closed_at      timestamptz not null default now(),
  signature      text not null default '',              -- hash do arquivo (aviso de reimportação)
  item_keys      text[] not null default '{}',
  file_name      text not null default '',
  charges_before jsonb check (charges_before is null or jsonb_typeof(charges_before) = 'array'),  -- para "Desfazer fechamento"
  total_cents    bigint not null default 0,
  items          jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  fora           jsonb not null default '[]' check (jsonb_typeof(fora) = 'array'),
  extra          jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'),
  primary key (user_id, id),
  unique (user_id, comp)                                -- um fechamento por competência
);

-- Pessoas de cada mês fechado (foto: nome/cor do dia do fechamento + mensagem enviada).
create table public.closed_month_people (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  month_id    text not null,
  position    integer not null,
  person_id   text,                                    -- pid (pode faltar em histórico muito antigo)
  name        text not null default '',
  color       text,
  total_cents bigint not null default 0,               -- negativo = "tem a receber"
  message     text not null default '',
  primary key (user_id, month_id, position),
  foreign key (user_id, month_id) references public.closed_months (user_id, id) on delete cascade
);
create index closed_month_people_person_idx on public.closed_month_people (user_id, person_id);

-- Pagamentos recebidos. Apagar o mês (remover registro / desfazer fechamento) apaga os pagamentos.
create table public.payments (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  month_id   text not null,
  person_pos integer not null,
  id         text not null check (id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  position   integer not null default 0,
  cents      bigint not null check (cents > 0),
  paid_on    date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month_id, person_pos, id),
  foreign key (user_id, month_id, person_pos) references public.closed_month_people (user_id, month_id, position) on delete cascade
);

-- ---------------------------------------------------------------- fatura em revisão (rascunho)
-- Novo na versão web: a fatura aberta (etapa Revisar) sobrevive a recarregar a página / trocar de aparelho.
-- state = itens já processados (sem o OFX bruto). Uma por usuário.
create table public.invoice_drafts (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  comp       text check (comp is null or comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  file_name  text not null default '',
  state      jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- updated_at
do $$
declare t text;
begin
  foreach t in array array['settings','people','tags','owner_memory','tag_memory','fixed_charges','installment_memory','invoice_drafts'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
-- Dono só enxerga as próprias linhas, em toda tabela. (select auth.uid()) = avaliado uma vez por consulta.
do $$
declare t text;
begin
  foreach t in array array['settings','people','tags','owner_memory','tag_memory','fixed_charges','installment_memory',
                           'closed_months','closed_month_people','payments','invoice_drafts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', 'own ' || t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- saldo em aberto
-- = remainingOf()/openBalances() do v3: total > 0, menos pagamentos; o dono do cartão nunca deve.
create view public.open_balances with (security_invoker = true) as
select m.user_id, m.id as month_id, m.comp, m.label, p.position as person_pos, p.person_id,
       coalesce(p.person_id, 'nome:' || p.name) as person_key, p.name, p.color,
       greatest(p.total_cents, 0) as due_cents,
       coalesce(pay.paid, 0)::bigint as paid_cents,
       greatest(greatest(p.total_cents, 0) - coalesce(pay.paid, 0), 0)::bigint as remaining_cents
  from public.closed_months m
  join public.closed_month_people p on p.user_id = m.user_id and p.month_id = m.id
  left join public.settings s on s.user_id = m.user_id
  left join lateral (select sum(x.cents) as paid from public.payments x
                      where x.user_id = p.user_id and x.month_id = p.month_id and x.person_pos = p.position) pay on true
 where p.total_cents > 0
   and (p.person_id is null or p.person_id is distinct from coalesce(s.pix_owner_id, 'p1'))
   and greatest(p.total_cents, 0) - coalesce(pay.paid, 0) > 0;

revoke all on public.open_balances from anon;
grant select on public.open_balances to authenticated;
