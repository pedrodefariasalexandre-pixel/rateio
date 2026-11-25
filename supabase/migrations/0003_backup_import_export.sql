-- Rateio — importar e exportar o backup "RATEIO-BACKUP {json}" do rateio-v3.html (formatos v1 a v7).
--
--   public.import_rateio_backup(p_backup text, p_parcelas_mode text default null) -> jsonb
--   public.export_rateio_backup() -> text
--
-- Mesmas regras do restoreBackup() do v3.4:
--   * Confere o backup INTEIRO antes de gravar (backupProblem). Problema = exceção, nada muda.
--   * Tudo ou nada: a função roda numa transação só.
--   * Substitui cada parte PRESENTE no backup; parte ausente fica como está.
--   * Backup com "rules" e sem "ruleObs" volta a memória por valor ao modo cauteloso (observações vazias).
--   * Memória de parcelas: backup sem parcelas mantém a atual. Se as parcelas atuais não estão iguais
--     no backup, a escolha é de quem importa: p_parcelas_mode = 'substituir' | 'juntar' (as atuais ganham).
--     Sem escolha, devolve {status:'needs_decision', ...} SEM alterar nada (a tela pergunta e chama de novo).
--   * Roda as migrações 3 a 7 do app no conteúdo importado (backup de versão antiga).
--   * Backup com senha (RATEIO-BACKUP-ENC1) é decifrado no navegador antes de chamar a função.
-- SECURITY INVOKER: tudo passa pela RLS do usuário logado.

-- ---------------------------------------------------------------- helpers (schema private, fora da API)
grant usage on schema private to authenticated;

-- Número de um valor JSON (número ou texto numérico); senão null. Equivale ao +x do JS para dados bem formados.
create function private.num(x jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case jsonb_typeof(x)
           when 'number' then (x #>> '{}')::numeric
           when 'string' then case when btrim(x #>> '{}') ~ '^-?\d+(\.\d+)?$' then btrim(x #>> '{}')::numeric end
         end
$$;

-- Texto de um valor JSON, com '' para null/ausente (como String(x||"") no app).
create function private.txt(x jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when x is null or jsonb_typeof(x) = 'null' then '' else x #>> '{}' end
$$;

-- Id no formato do app (string ou número finito, ^[A-Za-z0-9_.:-]{1,64}$).
create function private.ok_id(x jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(x) in ('string','number') and (x #>> '{}') ~ '^[A-Za-z0-9_.:-]{1,64}$'
$$;

-- Lista de ids.
create function private.ok_ids(x jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(x) = 'array' and not exists (select 1 from jsonb_array_elements(x) e where not private.ok_id(e))
$$;

-- Data que existe (AAAA-MM-DD). = isRealDate() do app.
create function private.is_real_date(x text) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if x is null or x !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return to_char(x::date, 'YYYY-MM-DD') = x;
exception when others then return false;
end $$;

create function private.ids_array(x jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(e #>> '{}' order by o), '{}') from jsonb_array_elements(coalesce(x, '[]')) with ordinality as t(e, o)
$$;

-- Id numérico do app (Date.now()) volta como número no backup, para o rateio-v3.html continuar abrindo.
create function private.id_json(x text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when x ~ '^[1-9]\d{0,14}$' then to_jsonb(x::bigint) else to_jsonb(x) end
$$;

-- ---------------------------------------------------------------- backupProblem()
create function private.backup_problem(d jsonb) returns text
language plpgsql stable set search_path = '' as $$
declare
  k text; v jsonb; e jsonb; i int; p jsonb; x jsonb;
begin
  if jsonb_typeof(d) is distinct from 'object' then return 'o conteúdo não é um backup do Rateio'; end if;
  if d ? 'v' and jsonb_typeof(d->'v') <> 'null' then
    if private.num(d->'v') is null or private.num(d->'v') <> trunc(private.num(d->'v')) or private.num(d->'v') < 1 then
      return 'versão do backup inválida'; end if;
    if private.num(d->'v') > 7 then
      return format('o backup é de uma versão mais nova do app (formato %s; este app lê até 7)', left(d->>'v', 10)); end if;
  end if;
  if jsonb_typeof(d->'people') = 'array' and jsonb_array_length(d->'people') = 0 then
    return 'o backup não tem nenhuma pessoa (sem pessoas não há como dividir)'; end if;

  -- listas
  foreach k in array array['people','tags','charges','history'] loop
    if d ? k and jsonb_typeof(d->k) <> 'null' then
      if jsonb_typeof(d->k) <> 'array' then return format('“%s” não é uma lista', k); end if;
      i := 0;
      for e in select value from jsonb_array_elements(d->k) loop
        i := i + 1;
        if jsonb_typeof(e) <> 'object' then return format('%s nº %s: item vazio', k, i); end if;
        if k in ('people','tags','charges') and not private.ok_id(e->'id') then
          return format('%s nº %s: identificador inválido', k, i); end if;
        if k = 'charges' and e ? 'owners' and jsonb_typeof(e->'owners') <> 'null' and not private.ok_ids(e->'owners') then
          return format('%s nº %s: donos inválidos', k, i); end if;
        if k = 'history' then
          if coalesce(e->>'comp', '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then return format('history nº %s: mês sem competência (AAAA-MM)', i); end if;
          if e ? 'id' and jsonb_typeof(e->'id') <> 'null' and not private.ok_id(e->'id') then return format('history nº %s: identificador inválido', i); end if;
          foreach x in array array[e->'people', e->'items', e->'fora', e->'keys'] loop
            if x is not null and jsonb_typeof(x) not in ('array','null') then return format('history nº %s: lista inválida', i); end if;
          end loop;
          for p in select value from jsonb_array_elements(coalesce(nullif(e->'people','null'), '[]')) loop
            if jsonb_typeof(p) <> 'object' then return format('history nº %s: pessoa vazia', i); end if;
            if p ? 'pid' and jsonb_typeof(p->'pid') <> 'null' and not private.ok_id(p->'pid') then return format('history nº %s: pessoa com identificador inválido', i); end if;
            if p ? 'payments' and jsonb_typeof(p->'payments') <> 'null' then
              if jsonb_typeof(p->'payments') <> 'array' then return format('history nº %s: pagamentos em formato inválido', i); end if;
              if exists (select 1 from jsonb_array_elements(p->'payments') y
                          where jsonb_typeof(y) <> 'object' or not private.is_real_date(y->>'date')
                             or (y ? 'id' and jsonb_typeof(y->'id') <> 'null' and not private.ok_id(y->'id'))
                             or private.num(y->'cents') is null or private.num(y->'cents') <= 0
                             or private.num(y->'cents') <> trunc(private.num(y->'cents'))) then
                return format('history nº %s: pagamentos em formato inválido', i); end if;
            end if;
          end loop;
          if exists (select 1 from jsonb_array_elements(coalesce(nullif(e->'items','null'),'[]') || coalesce(nullif(e->'fora','null'),'[]')) y where jsonb_typeof(y) <> 'object') then
            return format('history nº %s: item vazio', i); end if;
        end if;
      end loop;
    end if;
  end loop;

  -- mapas
  foreach k in array array['rules','ruleEach','ruleTags','ruleSplits','ruleObs','parcelas'] loop
    if d ? k and jsonb_typeof(d->k) <> 'null' then
      if jsonb_typeof(d->k) <> 'object' then return format('“%s” não é um objeto', k); end if;
      for p in select jsonb_build_object('n', key, 'v', value) from jsonb_each(d->k) loop
        v := p->'v';
        if k in ('rules','ruleEach','ruleTags') and not private.ok_ids(v) then
          return format('%s “%s”: deveria ser uma lista de identificadores', k, left(p->>'n', 40)); end if;
        if k = 'ruleSplits' and jsonb_typeof(v) <> 'object' then return format('%s “%s”: formato inválido', k, left(p->>'n', 40)); end if;
        if k = 'ruleObs' and (jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements(v) o
              where jsonb_typeof(o) <> 'object' or (o ? 'o' and jsonb_typeof(o->'o') <> 'null' and not private.ok_ids(o->'o')))) then
          return format('%s “%s”: formato inválido', k, left(p->>'n', 40)); end if;
        if k = 'parcelas' then
          if jsonb_typeof(v) <> 'object' then return format('parcelas “%s”: registro vazio', left(p->>'n', 40)); end if;
          if coalesce(v->>'em', '') <> '' and not private.is_real_date(v->>'em') then return format('parcelas “%s”: data inválida', left(p->>'n', 40)); end if;
          if coalesce(v->>'comp', '') <> '' and v->>'comp' !~ '^\d{4}-(0[1-9]|1[0-2])$' then return format('parcelas “%s”: competência inválida', left(p->>'n', 40)); end if;
          if coalesce(v->>'status', 'pendente') not in ('pendente','pago_antecipado','fora_manual') then return format('parcelas “%s”: situação desconhecida', left(p->>'n', 40)); end if;
        end if;
      end loop;
    end if;
  end loop;
  if d ? 'settings' and jsonb_typeof(d->'settings') not in ('object','null') then return '“settings” não é um objeto'; end if;
  return '';
end $$;

-- ---------------------------------------------------------------- migrações do app sobre o JSON
-- Migração 5 (chave da parcela sem valor: p2|cartão|texto|t|n). Nada é descartado; colisão marca "migração".
create function private.migrate_parcelas_v5(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  o jsonb := '{}'; k text; r jsonb; base text; v_key text; i int;
begin
  for k, r in select j.key, j.value from jsonb_each(p) j where j.key like 'p2|%' order by j.key collate "C" loop
    o := o || jsonb_build_object(k, r);
  end loop;
  for k, r in select j.key, j.value from jsonb_each(p) j where j.key not like 'p2|%' order by j.key collate "C" loop
    if jsonb_typeof(r) <> 'object' or coalesce(r->>'norm', '') = '' or jsonb_typeof(r->'parcela') <> 'object'
       or coalesce(private.num(r->'parcela'->'cur'), 0) < 1 or coalesce(private.num(r->'parcela'->'tot'), 0) < 2 then
      o := o || jsonb_build_object(k, r); continue;
    end if;
    base := concat_ws('|', 'p2', coalesce(nullif(r->>'acct', ''), '-'), r->>'norm',
                      trim_scale(private.num(r->'parcela'->'tot'))::text, trim_scale(private.num(r->'parcela'->'cur'))::text);
    v_key := base; i := 1;
    while o ? v_key loop i := i + 1; v_key := base || '#' || i; end loop;
    if i > 1 then
      o := jsonb_set(o, array[base], (o->base) || '{"conferir":"migração"}');
      r := r || '{"conferir":"migração"}';
    end if;
    o := o || jsonb_build_object(v_key, r || jsonb_build_object('key', v_key, 'chaveAntiga', k));
  end loop;
  return o;
end $$;

-- Migração 6 (chave com FITID: p3|FITID|t|n; sem FITID continua p2). Idempotente; colisão não funde.
create function private.migrate_parcelas_v6(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  o jsonb := '{}'; k text; r jsonb; b text; v_key text; i int; fit text;
  pend jsonb := '[]'; x jsonb;
begin
  for k, r in select j.key, j.value from jsonb_each(p) j order by j.key collate "C" loop
    b := null;
    if jsonb_typeof(r) = 'object' and jsonb_typeof(r->'parcela') = 'object'
       and coalesce(private.num(r->'parcela'->'cur'), 0) >= 1 and coalesce(private.num(r->'parcela'->'tot'), 0) >= 2 then
      fit := case when coalesce(r->>'fitid', '') <> '' and r->>'fitid' !~ '^sem-fitid-' then r->>'fitid' else '' end;
      if fit <> '' then
        b := concat_ws('|', 'p3', fit, trim_scale(private.num(r->'parcela'->'tot'))::text, trim_scale(private.num(r->'parcela'->'cur'))::text);
      elsif coalesce(r->>'norm', '') <> '' then
        b := concat_ws('|', 'p2', coalesce(nullif(r->>'acct', ''), '-'), r->>'norm',
                       trim_scale(private.num(r->'parcela'->'tot'))::text, trim_scale(private.num(r->'parcela'->'cur'))::text);
      end if;
    end if;
    if b is null then o := o || jsonb_build_object(k, r); continue; end if;
    if regexp_replace(k, '#\d+$', '') = b and r->>'key' = k then o := o || jsonb_build_object(k, r); continue; end if;
    pend := pend || jsonb_build_array(jsonb_build_object('k', k, 'r', r, 'b', b));
  end loop;
  for x in select value from jsonb_array_elements(pend) loop
    b := x->>'b'; v_key := b; i := 1;
    while o ? v_key loop i := i + 1; v_key := b || '#' || i; end loop;
    r := (x->'r') || jsonb_build_object('key', v_key, 'chaveAntiga', coalesce(nullif(nullif(x->'r'->>'chaveAntiga', ''), 'false'), x->>'k'));
    if i > 1 then
      o := jsonb_set(o, array[b], (o->b) || '{"conferir":"migração"}');
      r := r || '{"conferir":"migração"}';
    end if;
    o := o || jsonb_build_object(v_key, r);
  end loop;
  return o;
end $$;

-- Migração 7 (cobrança fixa parcelada ganha a competência da parcela atual: mês seguinte ao último
-- fechamento, senão o mês de hoje em São Paulo).
create function private.migrate_charges_v7(c jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  m text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  this_ym text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  o jsonb := '[]'; e jsonb; lb text[]; idx int; last text;
begin
  for e in select t.v from jsonb_array_elements(c) with ordinality as t(v, n) order by t.n loop
    if jsonb_typeof(e) = 'object' and coalesce(private.num(e->'parcTotal'), 0) >= 1 and coalesce(private.num(e->'parcAtual'), 0) >= 1
       and coalesce(e->>'parcComp', '') !~ '^\d{4}-\d{2}$' then
      lb := regexp_match(btrim(coalesce(e->>'lastMonth', '')), '^(\S+)/(\d{4})$');
      idx := case when lb is null then null else array_position(m, lower(lb[1])) end;
      last := case when idx is null then null else lb[2] || '-' || lpad(idx::text, 2, '0') end;
      e := e || jsonb_build_object('parcComp',
             case when last is null then this_ym else to_char((last || '-01')::date + interval '1 month', 'YYYY-MM') end);
    end if;
    o := o || jsonb_build_array(e);
  end loop;
  return o;
end $$;

-- Migração 3 (histórico ganha pid pelo nome, tagIds pelo nome e a lista de pagamentos).
create function private.migrate_history_v3(h jsonb, people jsonb, tags jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  with pid as (select p->>'nome' as nome, min(p->>'id') as id from jsonb_array_elements(coalesce(people, '[]')) p group by 1),
       tg  as (select g->>'nome' as nome, min(g->>'id') as id from jsonb_array_elements(coalesce(tags, '[]')) g group by 1)
  select coalesce(jsonb_agg(
    m || jsonb_build_object(
      'people', (select coalesce(jsonb_agg(
                   case when coalesce(pp->>'pid', '') = '' and (select id from pid where pid.nome = pp->>'nome') is not null
                        then pp || jsonb_build_object('pid', (select id from pid where pid.nome = pp->>'nome')) else pp end
                   || case when jsonb_typeof(pp->'payments') = 'array' then '{}'::jsonb else '{"payments":[]}'::jsonb end
                   order by n), '[]')
                 from jsonb_array_elements(coalesce(nullif(m->'people','null'), '[]')) with ordinality as a(pp, n)),
      'items', (select coalesce(jsonb_agg(
                   it || jsonb_build_object('shares', (select coalesce(jsonb_agg(
                            case when coalesce(s->>'pid', '') = '' and (select id from pid where pid.nome = s->>'nome') is not null
                                 then s || jsonb_build_object('pid', (select id from pid where pid.nome = s->>'nome')) else s end order by sn), '[]')
                          from jsonb_array_elements(coalesce(nullif(it->'shares','null'), '[]')) with ordinality as b(s, sn)))
                   || case when it ? 'tagIds' or jsonb_typeof(it->'tags') <> 'array' then '{}'::jsonb
                           else jsonb_build_object('tagIds', (select coalesce(jsonb_agg(to_jsonb((select id from tg where tg.nome = tn #>> '{}')) order by tnn), '[]')
                                                              from jsonb_array_elements(it->'tags') with ordinality as c(tn, tnn))) end
                   order by n), '[]')
                 from jsonb_array_elements(coalesce(nullif(m->'items','null'), '[]')) with ordinality as a(it, n))
    ) order by hn), '[]')
  from jsonb_array_elements(h) with ordinality as z(m, hn)
$$;

-- ---------------------------------------------------------------- leitura de uma parte do estado como JSON do app
create function private.parcel_json(r public.installment_memory) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
           'key', r.key, 'memo', r.memo, 'norm', r.norm, 'acct', r.acct,
           'parcela', case when r.cur is null and r.tot is null then null else jsonb_build_object('cur', r.cur, 'tot', r.tot) end,
           'cents', r.cents, 'fitid', r.fitid, 'dataCompra', r.purchase_date, 'status', r.status,
           'em', r.marked_on::text, 'comp', r.comp, 'valorPago', r.paid_cents, 'desconto', r.discount_cents, 'origem', r.origin)
         || case when r.returns <> '{}' then jsonb_build_object('voltas', r.returns) else '{}' end
         || case when r.review_flag is not null then jsonb_build_object('conferir', r.review_flag) else '{}' end
         || case when r.old_key is not null then jsonb_build_object('chaveAntiga', r.old_key) else '{}' end
         || r.extra
$$;

create function private.current_parcelas() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(m.key, private.parcel_json(m)), '{}') from public.installment_memory m where m.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------- gravação (compartilhada com o fechamento de mês)
create function private.write_parcel(k text, r jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  known text[] := array['key','memo','norm','acct','parcela','cents','fitid','dataCompra','status','em','comp','valorPago','desconto','origem','voltas','conferir','chaveAntiga'];
  ex jsonb;
begin
  ex := r - known;
  if r ? 'key' and r->>'key' is distinct from k then ex := ex || jsonb_build_object('key', r->'key'); end if;
  insert into public.installment_memory as t
    (key, memo, norm, acct, cur, tot, cents, fitid, purchase_date, status, marked_on, comp, paid_cents, discount_cents,
     origin, returns, review_flag, old_key, extra)
  values (k, private.txt(r->'memo'), private.txt(r->'norm'), private.txt(r->'acct'),
          round(private.num(r->'parcela'->'cur'))::int, round(private.num(r->'parcela'->'tot'))::int,
          round(private.num(r->'cents'))::bigint, private.txt(r->'fitid'), private.txt(r->'dataCompra'),
          coalesce(nullif(private.txt(r->'status'), ''), 'pendente'), nullif(private.txt(r->'em'), '')::date,
          private.txt(r->'comp'), nullif(round(private.num(r->'valorPago')), 0)::bigint, nullif(round(private.num(r->'desconto')), 0)::bigint,
          coalesce(nullif(private.txt(r->'origem'), ''), 'manual'),
          case when jsonb_typeof(r->'voltas') = 'object' then r->'voltas' else '{}' end,
          nullif(nullif(private.txt(r->'conferir'), ''), 'false'), nullif(private.txt(r->'chaveAntiga'), ''), ex)
  on conflict (user_id, key) do update set
    memo = excluded.memo, norm = excluded.norm, acct = excluded.acct, cur = excluded.cur, tot = excluded.tot,
    cents = excluded.cents, fitid = excluded.fitid, purchase_date = excluded.purchase_date, status = excluded.status,
    marked_on = excluded.marked_on, comp = excluded.comp, paid_cents = excluded.paid_cents,
    discount_cents = excluded.discount_cents, origin = excluded.origin, returns = excluded.returns,
    review_flag = excluded.review_flag, old_key = excluded.old_key, extra = excluded.extra;
end $$;

-- Substitui todas as cobranças fixas pelas da lista (formato do app).
create function private.write_charges(c jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  delete from public.fixed_charges where user_id = auth.uid();
  insert into public.fixed_charges (id, position, name, amount_cents, owners, weights, installment_current, installment_total,
                                    installment_comp, last_month_label)
  select e->>'id', n - 1, left(private.txt(e->'nome'), 200),
         round(private.num(case when jsonb_typeof(e->'valor') = 'string' then to_jsonb(replace(e->>'valor', ',', '.')) else e->'valor' end) * 100)::bigint,
         private.ids_array(nullif(e->'owners', 'null')),
         case when jsonb_typeof(e->'w') = 'object' then e->'w' end,
         round(private.num(e->'parcAtual'))::int, round(private.num(e->'parcTotal'))::int,
         case when coalesce(e->>'parcComp', '') ~ '^\d{4}-(0[1-9]|1[0-2])$' then e->>'parcComp' end,
         private.txt(e->'lastMonth')
    from jsonb_array_elements(c) with ordinality as t(e, n);
end $$;

-- Grava um mês fechado (formato do app). Pagamentos vêm de dentro de people[].payments.
create function private.write_month(h jsonb) returns text
language plpgsql set search_path = '' as $$
declare
  v_id text := coalesce(nullif(private.txt(h->'id'), ''), 'm' || replace(h->>'comp', '-', ''));
  known text[] := array['id','comp','label','closedAt','signature','keys','file','chargesBefore','totalCents','people','items','fora'];
begin
  insert into public.closed_months (id, comp, label, closed_at, signature, item_keys, file_name, charges_before, total_cents, items, fora, extra)
  values (v_id, h->>'comp', private.txt(h->'label'),
          coalesce(case when coalesce(h->>'closedAt', '') <> '' then (h->>'closedAt')::timestamptz end, now()),
          private.txt(h->'signature'), private.ids_array(nullif(h->'keys', 'null')), private.txt(h->'file'),
          case when jsonb_typeof(h->'chargesBefore') = 'array' then h->'chargesBefore' end,
          coalesce(round(private.num(h->'totalCents')), 0)::bigint,
          coalesce(nullif(h->'items', 'null'), '[]'), coalesce(nullif(h->'fora', 'null'), '[]'), h - known);

  insert into public.closed_month_people (month_id, position, person_id, name, color, total_cents, message)
  select v_id, n - 1, nullif(private.txt(p->'pid'), ''), private.txt(p->'nome'), nullif(private.txt(p->'cor'), ''),
         coalesce(round(private.num(p->'total')), 0)::bigint, private.txt(p->'text')
    from jsonb_array_elements(coalesce(nullif(h->'people', 'null'), '[]')) with ordinality as t(p, n);

  -- id repetido na mesma pessoa ganha sufixo (a chave do pagamento é mês + pessoa + id)
  insert into public.payments (month_id, person_pos, id, position, cents, paid_on)
  select v_id, pn - 1,
         case when count(*) over (partition by pn, coalesce(private.txt(y->'id'), '')) > 1 or coalesce(private.txt(y->'id'), '') = ''
              then left(coalesce(nullif(private.txt(y->'id'), ''), 'pay'), 56) || '.' || yn else private.txt(y->'id') end,
         yn - 1, round(private.num(y->'cents'))::bigint, (y->>'date')::date
    from jsonb_array_elements(coalesce(nullif(h->'people', 'null'), '[]')) with ordinality as t(p, pn),
         jsonb_array_elements(coalesce(nullif(p->'payments', 'null'), '[]')) with ordinality as u(y, yn);
  return v_id;
end $$;

-- ---------------------------------------------------------------- import
create function public.import_rateio_backup(p_backup text, p_parcelas_mode text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  d      jsonb;
  v_prob text;
  v_from int;
  v_mine jsonb;
  v_bk   jsonb;
  v_lost int := 0;
  v_par  jsonb;
  v_pres text := 'mantido';
  v_people jsonb;
  v_tags   jsonb;
  v_k text; v_r jsonb; v_s jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_parcelas_mode is not null and p_parcelas_mode not in ('substituir','juntar') then
    raise exception 'p_parcelas_mode deve ser substituir ou juntar' using errcode = '22023'; end if;
  if coalesce(p_backup, '') ~ '^\s*RATEIO-BACKUP-ENC1\s' then
    raise exception 'Backup protegido por senha: abra no app para digitar a senha. Nada foi alterado.' using errcode = '22023'; end if;

  begin
    d := btrim(regexp_replace(coalesce(p_backup, ''), '^\s*RATEIO-BACKUP\s*', ''))::jsonb;
  exception when others then
    raise exception 'Backup inválido: o texto não é um backup completo. Nada foi alterado.' using errcode = '22023';
  end;
  v_prob := private.backup_problem(d);
  if v_prob <> '' then raise exception 'Backup inválido: %. Nada foi alterado.', v_prob using errcode = '22023'; end if;

  v_from := coalesce(nullif(private.num(d->'v'), 0)::int, 1);

  -- memória de parcelas: decide antes de gravar qualquer coisa
  if jsonb_typeof(d->'parcelas') = 'object' then
    v_mine := private.current_parcelas();
    v_bk := d->'parcelas';
    select count(*) into v_lost from jsonb_each(v_mine) m where not (v_bk ? m.key) or v_bk->m.key <> m.value;
    if v_lost = 0 then
      v_par := v_mine || v_bk; v_pres := 'junto';
    elsif p_parcelas_mode is null then
      return jsonb_build_object('status', 'needs_decision', 'backup_parcelas', (select count(*) from jsonb_object_keys(v_bk)),
                                'local_parcelas', (select count(*) from jsonb_object_keys(v_mine)), 'diferentes', v_lost);
    elsif p_parcelas_mode = 'substituir' then
      v_par := v_bk; v_pres := 'substituido';
    else
      v_par := v_bk || v_mine; v_pres := 'junto';
    end if;
  end if;

  -- migrações do app (versão do backup -> 7)
  if v_from < 3 and jsonb_typeof(d->'history') = 'array' then
    v_people := case when jsonb_typeof(d->'people') = 'array' then d->'people'
                     else (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', name) order by position), '[]') from public.people where user_id = v_uid) end;
    v_tags   := case when jsonb_typeof(d->'tags') = 'array' then d->'tags'
                     else (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', name) order by position), '[]') from public.tags where user_id = v_uid) end;
    d := jsonb_set(d, '{history}', private.migrate_history_v3(d->'history', v_people, v_tags));
  end if;
  if v_par is not null and v_from < 5 then v_par := private.migrate_parcelas_v5(v_par); end if;
  if v_par is not null and v_from < 6 then v_par := private.migrate_parcelas_v6(v_par); end if;
  if v_from < 7 and jsonb_typeof(d->'charges') = 'array' then d := jsonb_set(d, '{charges}', private.migrate_charges_v7(d->'charges')); end if;

  -- pessoas
  if jsonb_typeof(d->'people') = 'array' then
    delete from public.people where user_id = v_uid;
    insert into public.people (id, position, name, color, phone, archived)
    select e->>'id', n - 1, left(private.txt(e->'nome'), 40),
           case when private.txt(e->'cor') ~ '^#[0-9A-Fa-f]{3,8}$' then e->>'cor' end,
           left(private.txt(e->'fone'), 30), coalesce(jsonb_typeof(e->'archived') = 'boolean' and (e->>'archived')::boolean, false)
      from jsonb_array_elements(d->'people') with ordinality as t(e, n);
  end if;

  -- tags
  if jsonb_typeof(d->'tags') = 'array' then
    delete from public.tags where user_id = v_uid;
    insert into public.tags (id, position, name, color)
    select e->>'id', n - 1, left(private.txt(e->'nome'), 24), case when private.txt(e->'cor') ~ '^#[0-9A-Fa-f]{3,8}$' then e->>'cor' end
      from jsonb_array_elements(d->'tags') with ordinality as t(e, n);
  end if;

  -- memória de donos (cada mapa presente substitui a sua coluna)
  if jsonb_typeof(d->'rules') = 'object' then
    update public.owner_memory set owners = null, observations = null where user_id = v_uid;
    insert into public.owner_memory as m (norm_key, owners)
    select key, private.ids_array(value) from jsonb_each(d->'rules')
    on conflict (user_id, norm_key) do update set owners = excluded.owners;
    if jsonb_typeof(d->'ruleObs') = 'object' then
      insert into public.owner_memory as m (norm_key, observations)
      select key, value from jsonb_each(d->'ruleObs')
      on conflict (user_id, norm_key) do update set observations = excluded.observations;
    end if;
  end if;
  if jsonb_typeof(d->'ruleSplits') = 'object' then
    update public.owner_memory set split = null where user_id = v_uid;
    insert into public.owner_memory as m (norm_key, split)
    select key, value from jsonb_each(d->'ruleSplits')
    on conflict (user_id, norm_key) do update set split = excluded.split;
  end if;
  if jsonb_typeof(d->'ruleEach') = 'object' then
    update public.owner_memory set each_owners = null where user_id = v_uid;
    insert into public.owner_memory as m (norm_key, each_owners)
    select key, private.ids_array(value) from jsonb_each(d->'ruleEach')
    on conflict (user_id, norm_key) do update set each_owners = excluded.each_owners;
  end if;
  delete from public.owner_memory
   where user_id = v_uid and owners is null and split is null and each_owners is null and observations is null;

  -- tags lembradas
  if jsonb_typeof(d->'ruleTags') = 'object' then
    delete from public.tag_memory where user_id = v_uid;
    insert into public.tag_memory (rule_key, tag_ids) select key, private.ids_array(value) from jsonb_each(d->'ruleTags');
  end if;

  -- configurações (chave PIX só aqui, protegida pela RLS)
  if jsonb_typeof(d->'settings') = 'object' then
    v_s := d->'settings';
    insert into public.settings as s (user_id, pix_key, pix_owner_id, last_backup_at, msg_pending, msg_projection, proj_recurring)
    values (v_uid, left(private.txt(v_s->'pix'), 77), coalesce(nullif(private.txt(v_s->'pixOwner'), ''), 'p1'),
            case when private.txt(v_s->'lastBackup') ~ '^\d{4}-\d{2}-\d{2}T' then (v_s->>'lastBackup')::timestamptz end,
            case when jsonb_typeof(v_s->'msgPending') = 'boolean' then (v_s->>'msgPending')::boolean else true end,
            case when jsonb_typeof(v_s->'msgProjection') = 'boolean' then (v_s->>'msgProjection')::boolean else false end,
            case when jsonb_typeof(v_s->'projRecurring') = 'boolean' then (v_s->>'projRecurring')::boolean else false end)
    on conflict (user_id) do update set pix_key = excluded.pix_key, pix_owner_id = excluded.pix_owner_id,
      last_backup_at = excluded.last_backup_at, msg_pending = excluded.msg_pending,
      msg_projection = excluded.msg_projection, proj_recurring = excluded.proj_recurring;
  end if;
  insert into public.settings (user_id) values (v_uid) on conflict (user_id) do nothing;
  update public.settings set data_version = 7 where user_id = v_uid;

  -- cobranças fixas
  if jsonb_typeof(d->'charges') = 'array' then perform private.write_charges(d->'charges'); end if;

  -- histórico
  if jsonb_typeof(d->'history') = 'array' then
    delete from public.closed_months where user_id = v_uid;
    for v_r in select value from jsonb_array_elements(d->'history') loop
      if exists (select 1 from public.closed_months where user_id = v_uid and comp = v_r->>'comp') then
        raise exception 'Backup inválido: o histórico tem dois fechamentos de %. Nada foi alterado.', v_r->>'comp' using errcode = '22023';
      end if;
      perform private.write_month(v_r);
    end loop;
  end if;

  -- memória de parcelas
  if v_par is not null then
    delete from public.installment_memory where user_id = v_uid;
    for v_k, v_r in select key, value from jsonb_each(v_par) loop perform private.write_parcel(v_k, v_r); end loop;
  end if;

  return jsonb_build_object(
    'status', 'ok', 'versao_do_backup', v_from, 'parcelas', v_pres,
    'pessoas', (select count(*) from public.people where user_id = v_uid),
    'regras', (select count(*) from public.owner_memory where user_id = v_uid and owners is not null),
    'cobrancas', (select count(*) from public.fixed_charges where user_id = v_uid),
    'meses', (select count(*) from public.closed_months where user_id = v_uid),
    'memoria_parcelas', (select count(*) from public.installment_memory where user_id = v_uid));
end $$;

-- ---------------------------------------------------------------- export (mesmo formato do botão "Copiar backup")
create function public.export_rateio_backup()
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.settings;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into s from public.settings where user_id = v_uid;
  return 'RATEIO-BACKUP ' || jsonb_build_object(
    'v', 7,
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', name, 'cor', color, 'fone', phone)
                                         || case when archived then '{"archived":true}'::jsonb else '{}'::jsonb end order by position, id), '[]')
                 from public.people where user_id = v_uid),
    'rules', (select coalesce(jsonb_object_agg(norm_key, to_jsonb(owners)), '{}') from public.owner_memory where user_id = v_uid and owners is not null),
    'ruleSplits', (select coalesce(jsonb_object_agg(norm_key, split), '{}') from public.owner_memory where user_id = v_uid and split is not null),
    'ruleEach', (select coalesce(jsonb_object_agg(norm_key, to_jsonb(each_owners)), '{}') from public.owner_memory where user_id = v_uid and each_owners is not null),
    'ruleObs', (select coalesce(jsonb_object_agg(norm_key, observations), '{}') from public.owner_memory where user_id = v_uid and observations is not null),
    'tags', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', name, 'cor', color) order by position, id), '[]') from public.tags where user_id = v_uid),
    'ruleTags', (select coalesce(jsonb_object_agg(rule_key, to_jsonb(tag_ids)), '{}') from public.tag_memory where user_id = v_uid),
    'charges', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', private.id_json(id), 'nome', name,
                   'valor', case when amount_cents is null then '' else to_char(amount_cents / 100.0, 'FM999999999999990.00') end,
                   'owners', to_jsonb(owners),
                   'parcAtual', coalesce(installment_current::text, ''), 'parcTotal', coalesce(installment_total::text, ''),
                   'parcComp', coalesce(installment_comp, ''), 'lastMonth', last_month_label)
                   || case when weights is not null then jsonb_build_object('w', weights) else '{}' end order by position, id), '[]')
                 from public.fixed_charges where user_id = v_uid),
    'settings', jsonb_build_object(
                   'pix', coalesce(s.pix_key, ''), 'pixOwner', coalesce(s.pix_owner_id, 'p1'),
                   'lastBackup', coalesce(to_char(s.last_backup_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''),
                   'msgPending', coalesce(s.msg_pending, true), 'msgProjection', coalesce(s.msg_projection, false),
                   'projRecurring', coalesce(s.proj_recurring, false)),
    'history', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', private.id_json(m.id), 'comp', m.comp, 'label', m.label,
                   'closedAt', to_char(m.closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                   'signature', m.signature, 'keys', to_jsonb(m.item_keys), 'file', m.file_name,
                   'chargesBefore', m.charges_before, 'totalCents', m.total_cents,
                   'people', (select coalesce(jsonb_agg(jsonb_build_object('pid', p.person_id, 'nome', p.name, 'cor', p.color,
                                 'total', p.total_cents, 'text', p.message,
                                 'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'cents', y.cents, 'date', y.paid_on::text)
                                                                        order by y.position, y.created_at), '[]')
                                                from public.payments y where y.user_id = p.user_id and y.month_id = p.month_id and y.person_pos = p.position))
                                 order by p.position), '[]')
                                from public.closed_month_people p where p.user_id = m.user_id and p.month_id = m.id),
                   'items', m.items, 'fora', m.fora) || m.extra order by m.comp desc), '[]')
                 from public.closed_months m where m.user_id = v_uid),
    'parcelas', private.current_parcelas()
  )::text;
end $$;

-- ---------------------------------------------------------------- privilégios
-- Supabase dá EXECUTE direto a anon/authenticated por default privileges: revogar e liberar só o necessário.
revoke all on function public.import_rateio_backup(text, text) from public, anon;
revoke all on function public.export_rateio_backup() from public, anon;
grant execute on function public.import_rateio_backup(text, text) to authenticated;
grant execute on function public.export_rateio_backup() to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
