-- Rateio — operações que mexem em várias tabelas de uma vez (tudo ou nada), como no v3.3+.
--
--   public.close_month(p_month jsonb, p_charges jsonb, p_parcelas jsonb) -> jsonb
--       Grava o mês fechado (formato do histórico do app), substitui as cobranças fixas já avançadas
--       e grava as parcelas que o fechamento registrou (origem "fechamento"). Refechar a mesma competência
--       substitui o registro e MANTÉM os pagamentos de cada pessoa (casados pelo pid), como no app.
--       O cálculo (mensagens, avanço das parcelas, chargesBefore) continua no app; aqui só a gravação atômica.
--   public.undo_close_month(p_month_id text) -> jsonb
--       "Desfazer fechamento": só o mês fechado mais recentemente; volta as cobranças fixas para
--       chargesBefore e apaga o mês com os pagamentos.
--   public.register_payment(p_person_key text, p_cents bigint, p_paid_on date, p_month_id text, p_person_pos int) -> jsonb
--       = savePayment(): com mês, não aceita mais que o restante daquele mês; sem mês, distribui do mês
--       mais antigo para o mais novo e não aceita mais que o total em aberto da pessoa.
-- "Remover registro" e apagar um pagamento são DELETE simples pela API (RLS + cascata).

create function public.close_month(p_month jsonb, p_charges jsonb default null, p_parcelas jsonb default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_prob text;
  v_old  text;
  v_kept jsonb;
  v_id   text;
  k text; r jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_prob := private.backup_problem(jsonb_build_object('history', jsonb_build_array(p_month))
                                   || case when p_charges is null then '{}' else jsonb_build_object('charges', p_charges) end
                                   || case when p_parcelas is null then '{}' else jsonb_build_object('parcelas', p_parcelas) end);
  if v_prob <> '' then raise exception 'Fechamento inválido: %. Nada foi alterado.', v_prob using errcode = '22023'; end if;

  -- pagamentos já registrados no fechamento anterior desta competência (por pid)
  select m.id into v_old from public.closed_months m where m.user_id = v_uid and m.comp = p_month->>'comp' for update;
  if v_old is not null then
    select coalesce(jsonb_object_agg(p.person_id, (
             select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'cents', y.cents, 'date', y.paid_on::text) order by y.position, y.created_at), '[]')
               from public.payments y where y.user_id = v_uid and y.month_id = v_old and y.person_pos = p.position)), '{}')
      into v_kept
      from public.closed_month_people p where p.user_id = v_uid and p.month_id = v_old and p.person_id is not null;
    delete from public.closed_months where user_id = v_uid and id = v_old;
  end if;

  p_month := jsonb_set(p_month, '{people}', (
    select coalesce(jsonb_agg(pp || jsonb_build_object('payments', coalesce(v_kept -> (pp->>'pid'), '[]')) order by n), '[]')
      from jsonb_array_elements(coalesce(nullif(p_month->'people', 'null'), '[]')) with ordinality as t(pp, n)));
  v_id := private.write_month(p_month);

  if p_charges is not null then perform private.write_charges(p_charges); end if;
  if p_parcelas is not null then
    for k, r in select key, value from jsonb_each(p_parcelas) loop perform private.write_parcel(k, r); end loop;
  end if;
  return jsonb_build_object('status', 'ok', 'month_id', v_id, 'substituiu', v_old is not null);
end $$;

create function public.undo_close_month(p_month_id text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.closed_months;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into m from public.closed_months where user_id = v_uid order by closed_at desc, id desc limit 1 for update;
  if m.id is distinct from p_month_id then
    raise exception 'Só dá para desfazer o fechamento mais recente.' using errcode = '22023'; end if;
  if m.charges_before is null then
    raise exception 'Este fechamento não guardou as cobranças anteriores; use Remover registro.' using errcode = '22023'; end if;
  perform private.write_charges(m.charges_before);
  delete from public.closed_months where user_id = v_uid and id = m.id;
  return jsonb_build_object('status', 'ok', 'comp', m.comp);
end $$;

create function public.register_payment(p_person_key text, p_cents bigint, p_paid_on date,
                                        p_month_id text default null, p_person_pos integer default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_ms    text := (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  v_left  bigint := p_cents;
  v_total bigint;
  v_take  bigint;
  b record;
  n int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_cents is null or p_cents <= 0 then raise exception 'Informe um valor maior que zero' using errcode = '22023'; end if;
  if p_paid_on is null then raise exception 'Informe uma data válida' using errcode = '22023'; end if;

  if p_month_id is not null then
    select remaining_cents into v_total from public.open_balances
     where user_id = v_uid and month_id = p_month_id and person_pos = p_person_pos;
    if coalesce(v_total, 0) < p_cents then
      raise exception 'Maior que o valor em aberto (%)', coalesce(v_total, 0) using errcode = '22023'; end if;
    insert into public.payments (month_id, person_pos, id, position, cents, paid_on)
    values (p_month_id, p_person_pos, v_ms,
            (select count(*) from public.payments where user_id = v_uid and month_id = p_month_id and person_pos = p_person_pos),
            p_cents, p_paid_on);
    return jsonb_build_object('status', 'ok', 'pagamentos', 1);
  end if;

  select coalesce(sum(remaining_cents), 0) into v_total from public.open_balances where user_id = v_uid and person_key = p_person_key;
  if v_total < p_cents then raise exception 'Maior que o total em aberto (%)', v_total using errcode = '22023'; end if;
  for b in select month_id, person_pos, remaining_cents from public.open_balances
            where user_id = v_uid and person_key = p_person_key order by comp, month_id loop
    exit when v_left = 0;
    v_take := least(v_left, b.remaining_cents);
    insert into public.payments (month_id, person_pos, id, position, cents, paid_on)
    values (b.month_id, b.person_pos, left(v_ms || '-' || b.month_id, 64),
            (select count(*) from public.payments where user_id = v_uid and month_id = b.month_id and person_pos = b.person_pos),
            v_take, p_paid_on);
    v_left := v_left - v_take; n := n + 1;
  end loop;
  return jsonb_build_object('status', 'ok', 'pagamentos', n);
end $$;

revoke all on function public.close_month(jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.undo_close_month(text) from public, anon;
revoke all on function public.register_payment(text, bigint, date, text, integer) from public, anon;
grant execute on function public.close_month(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.undo_close_month(text) to authenticated;
grant execute on function public.register_payment(text, bigint, date, text, integer) to authenticated;
