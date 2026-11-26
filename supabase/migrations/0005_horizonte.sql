-- Horizonte (requisitos v5): dados pessoais de projeção. Regra de negócio fica no motor TS (src/horizonte/engine.ts);
-- o banco garante formato, RLS por user_id e atomicidade. Nunca guarda número do cartão (acct = hash) nem OFX bruto.

create table public.hz_settings (
  user_id             uuid primary key default auth.uid() references auth.users on delete cascade,
  months              integer not null default 6 check (months between 1 and 12),
  reserve_mode        text check (reserve_mode in ('manual','meta','pct_salario')),
  reserve_value_cents bigint check (reserve_value_cents > 0),
  reserve_pct         integer check (reserve_pct between 1 and 100),
  reserve_goal_comp   text check (reserve_goal_comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  furo_order          text[] not null default '{semanas,reserva,emergencia}'
                      check (furo_order <@ array['semanas','reserva','emergencia']),
  avulsos_on          boolean not null default true,
  weekly_cap_cents    bigint not null default 0 check (weekly_cap_cents >= 0),
  weeks_pocket_id     uuid,
  updated_at          timestamptz not null default now()
);

create table public.invoice_snapshots (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  id           uuid not null default gen_random_uuid(),
  acct         text not null check (acct ~ '^[A-Za-z0-9_-]{1,40}$'),
  comp         text not null check (comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  due_date     date,
  total_cents  bigint not null,
  content_hash text not null check (char_length(content_hash) <= 80),
  imported_at  timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, acct, comp)
);

create table public.invoice_lines (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  snapshot_id uuid not null,
  pos         integer not null check (pos >= 0),
  fitid       text not null default '' check (char_length(fitid) <= 120),
  posted_on   date,
  memo        text not null check (char_length(memo) <= 300),
  norm        text not null check (char_length(norm) <= 300),
  cents       bigint not null,
  kind        text not null check (kind in ('compra','estorno','credito','pagamento','encargo')),
  inst_cur    integer check (inst_cur between 1 and 99),
  inst_tot    integer check (inst_tot between 1 and 99),
  series_key  text check (char_length(series_key) <= 400),
  primary key (user_id, snapshot_id, pos),
  foreign key (user_id, snapshot_id) references public.invoice_snapshots on delete cascade
);

create table public.hz_decisions (
  user_id           uuid not null default auth.uid() references auth.users on delete cascade,
  alert_key         text not null check (char_length(alert_key) <= 500),
  decision          text not null check (decision in ('ignorado','pago_antecipado','fora_manual')),
  anticipated_last  integer check (anticipated_last between 1 and 99),
  decided_at        timestamptz not null default now(),
  primary key (user_id, alert_key)
);

create table public.hz_cards (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  acct        text not null check (acct ~ '^[A-Za-z0-9_-]{1,40}$'),
  name        text not null default '' check (char_length(name) <= 60),
  closing_day integer not null check (closing_day between 1 and 31),
  due_day     integer not null check (due_day between 1 and 31),
  primary key (user_id, acct)
);

create table public.income_sources (
  user_id             uuid not null default auth.uid() references auth.users on delete cascade,
  id                  uuid not null default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 60),
  grp                 text not null default 'eu' check (grp in ('eu','pai','mae')),
  gross_cents         bigint not null check (gross_cents >= 0),
  deductions          jsonb not null default '{}' check (jsonb_typeof(deductions) = 'object'),
  net_cents           bigint not null check (net_cents >= 0),
  advance_day         integer not null default 15 check (advance_day between 1 and 28),
  advance_cents       bigint not null default 0 check (advance_cents >= 0),
  salary_business_day integer not null default 5 check (salary_business_day between 1 and 20),
  thirteenth          jsonb not null default '{}' check (jsonb_typeof(thirteenth) = 'object'),
  primary key (user_id, id)
);

create table public.hz_holidays (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  on_date     date not null,
  description text not null default '' check (char_length(description) <= 80),
  primary key (user_id, on_date)
);

create table public.pay_window_overrides (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  comp        text not null check (comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  salary_date date not null,
  primary key (user_id, comp)
);

create table public.pockets (
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  id              uuid not null default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 60),
  rule            text not null default 'livre' check (rule in ('piso','acumula','fonte','livre')),
  floor_cents     bigint not null default 0 check (floor_cents >= 0),
  goal_cents      bigint check (goal_cents > 0),
  goal_comp       text check (goal_comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  monthly_cents   bigint not null default 0,
  yield_pct_month numeric(6,3) not null default 0 check (yield_pct_month between 0 and 20),
  is_reserve      boolean not null default false,
  is_weeks        boolean not null default false,
  archived        boolean not null default false,
  primary key (user_id, id)
);
create unique index pockets_one_reserve on public.pockets (user_id) where is_reserve;
create unique index pockets_one_weeks on public.pockets (user_id) where is_weeks;

create table public.pocket_moves (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  id          uuid not null default gen_random_uuid(),
  pocket_id   uuid not null,
  kind        text not null check (kind in ('aporte','retirada','pagamento','ajuste')),
  cents       bigint not null check (cents >= 0),
  on_date     date not null,
  reason      text not null default '' check (char_length(reason) <= 120),
  transfer_id uuid,
  imprevisto  boolean not null default false,
  item_id     text check (char_length(item_id) <= 120),
  primary key (user_id, id),
  foreign key (user_id, pocket_id) references public.pockets on delete cascade
);
create index pocket_moves_transfer on public.pocket_moves (user_id, transfer_id) where transfer_id is not null;

-- Contas fixas, assinaturas e terceiros do Horizonte (não mexe em fixed_charges do rateio).
create table public.hz_items (
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  id               uuid not null default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 120),
  alias            text check (char_length(alias) <= 60),
  hidden           boolean not null default false,
  direction        text not null check (direction in ('entrada','saida')),
  amount_cents     bigint not null check (amount_cents >= 0),
  full_cents       bigint check (full_cents >= 0),
  recurrence       jsonb not null check (recurrence->>'kind' in ('mensal','semanal','parcelas')),
  end_comp         text check (end_comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  is_subscription  boolean not null default false,
  source_pocket_id uuid,
  third_party      text check (third_party in ('eu','pai','mae')),
  primary key (user_id, id)
);

create table public.planned_entries (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  id           uuid not null default gen_random_uuid(),
  comp         text not null check (comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  direction    text not null check (direction in ('entrada','saida')),
  name         text not null check (char_length(name) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  kind         text not null default 'real' check (kind in ('real','pontual_previsto')),
  considered   boolean not null default true,
  received_on  date,
  third_party  text check (third_party in ('eu','pai','mae')),
  grp          text not null default 'eu' check (grp in ('eu','pai','mae')),
  primary key (user_id, id)
);

-- Apelido / ocultar (RF46): o memo real nunca aparece quando há apelido.
create table public.hz_item_prefs (
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  item_key text not null check (char_length(item_key) <= 400),
  alias    text check (char_length(alias) <= 60),
  hidden   boolean not null default false,
  primary key (user_id, item_key)
);

-- ---------------------------------------------------------------- RLS (CA08)
do $$
declare t text;
begin
  foreach t in array array['hz_settings','invoice_snapshots','invoice_lines','hz_decisions','hz_cards','income_sources',
                           'hz_holidays','pay_window_overrides','pockets','pocket_moves','hz_items','planned_entries','hz_item_prefs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', 'own ' || t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RPCs (security invoker: RLS vale)
-- Salva a fatura numa transação só (RF03): mesmo hash = nada; hash diferente = conflito, salvo p_replace.
create function public.save_invoice_snapshot(p jsonb, p_replace boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_old record; v_id uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select id, content_hash into v_old from public.invoice_snapshots
   where user_id = auth.uid() and acct = p->>'acct' and comp = p->>'comp';
  if found then
    if v_old.content_hash = p->>'contentHash' then return jsonb_build_object('status','unchanged'); end if;
    if not p_replace then return jsonb_build_object('status','conflict','existingId',v_old.id); end if;
    delete from public.invoice_snapshots where user_id = auth.uid() and id = v_old.id;
  end if;
  insert into public.invoice_snapshots (acct, comp, due_date, total_cents, content_hash)
  values (p->>'acct', p->>'comp', nullif(p->>'dueDate','')::date, (p->>'totalCents')::bigint, p->>'contentHash')
  returning id into v_id;
  insert into public.invoice_lines (snapshot_id, pos, fitid, posted_on, memo, norm, cents, kind, inst_cur, inst_tot, series_key)
  select v_id, (l->>'pos')::int, coalesce(l->>'fitid',''), nullif(l->>'postedOn','')::date, l->>'memo', l->>'norm',
         (l->>'cents')::bigint, l->>'kind', (l->>'instCur')::int, (l->>'instTot')::int, l->>'seriesKey'
    from jsonb_array_elements(coalesce(p->'lines','[]')) l;
  return jsonb_build_object('status','created','id',v_id);
end $$;

-- "Excluir tudo do Horizonte" (CA16): só as linhas do próprio usuário.
create function public.delete_horizon_data()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  delete from public.invoice_snapshots where user_id = auth.uid();
  delete from public.hz_decisions where user_id = auth.uid();
  delete from public.hz_cards where user_id = auth.uid();
  delete from public.income_sources where user_id = auth.uid();
  delete from public.hz_holidays where user_id = auth.uid();
  delete from public.pay_window_overrides where user_id = auth.uid();
  delete from public.pockets where user_id = auth.uid();
  delete from public.hz_items where user_id = auth.uid();
  delete from public.planned_entries where user_id = auth.uid();
  delete from public.hz_item_prefs where user_id = auth.uid();
  delete from public.hz_settings where user_id = auth.uid();
end $$;

revoke execute on function public.save_invoice_snapshot(jsonb, boolean), public.delete_horizon_data() from public, anon;
grant execute on function public.save_invoice_snapshot(jsonb, boolean), public.delete_horizon_data() to authenticated;
