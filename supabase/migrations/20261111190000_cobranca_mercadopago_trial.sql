-- Cobrança (Mercado Pago): teste vencido bloqueia no banco; webhook atribui o plano e suspende em cancelamento.
create or replace function public.app_org() returns uuid language sql stable security definer set search_path = public as
$$ select m.org_id from public.members m join public.orgs o on o.id = m.org_id
   where m.user_id = auth.uid()
     and (o.status = 'ativa' or (o.status = 'teste' and (o.trial_ends_at is null or o.trial_ends_at >= (now() at time zone 'America/Sao_Paulo')::date)))
     and public.app_mfa_ok_raw()
     and (not (coalesce(o.settings->>'mfa_obrigatorio', 'false') = 'true' and m.role in ('proprietario', 'admin', 'financeiro')) or public.app_mfa_strict()) $$;

create or replace function public.ingest_payment_event(p_secret text, p_provider text, p_event_id text, p_org uuid, p_kind text, p_status text, p_amount numeric, p_at timestamptz, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare h text; n int; pid uuid;
begin
  select s.hash into h from public.platform_secrets s where s.name = 'payment_webhook';
  if h is null or length(coalesce(p_secret, '')) < 32 or encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') <> h then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_status not in ('pendente', 'confirmado', 'falhou', 'estornado') then raise exception 'status invalido'; end if;
  insert into public.subscription_payments(provider, provider_event_id, org_id, kind, status, amount, occurred_at, raw)
  values (left(p_provider, 40), left(p_event_id, 120), p_org, left(p_kind, 60), p_status, p_amount, p_at, p_raw)
  on conflict (provider, provider_event_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return 'duplicate'; end if;
  if p_org is not null and p_status = 'confirmado' then
    perform set_config('app.master', '1', true);
    select id into pid from public.plans where code = p_raw->>'fb_plan' and active;
    update public.orgs set status = 'ativa', plan_id = coalesce(pid, plan_id) where id = p_org and status in ('teste', 'suspensa');
    insert into public.platform_audit(admin_user, action, target, details)
    values ('00000000-0000-0000-0000-000000000000', 'webhook_pagamento_confirmado', p_org::text, jsonb_build_object('evento', p_event_id, 'provedor', p_provider, 'valor', p_amount, 'plano', p_raw->>'fb_plan'));
  elsif p_org is not null and p_status = 'falhou' and p_kind in ('assinatura_cancelada', 'assinatura_pausada') then
    perform set_config('app.master', '1', true);
    update public.orgs set status = 'suspensa' where id = p_org and status = 'ativa';
    insert into public.platform_audit(admin_user, action, target, details)
    values ('00000000-0000-0000-0000-000000000000', 'webhook_assinatura_suspensa', p_org::text, jsonb_build_object('evento', p_event_id, 'provedor', p_provider, 'tipo', p_kind));
  end if;
  return 'ok';
end $$;
revoke all on function public.ingest_payment_event(text, text, text, uuid, text, text, numeric, timestamptz, jsonb) from public;
grant execute on function public.ingest_payment_event(text, text, text, uuid, text, text, numeric, timestamptz, jsonb) to anon, authenticated;
