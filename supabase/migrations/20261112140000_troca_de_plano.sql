-- Troca de plano (upgrade/downgrade) sobre a assinatura existente do Mercado Pago.
-- Guardamos qual é a assinatura atual da empresa e o plano pendente (vale quando a próxima cobrança, já no valor novo, for aprovada).
alter table public.orgs add column if not exists mp_preapproval_id text;
alter table public.orgs add column if not exists pending_plan_code text;

create or replace function public.orgs_guard() returns trigger language plpgsql set search_path to 'public' as $$
begin
  if coalesce(current_setting('app.master', true), '') <> '1' and coalesce(auth.role(), '') <> 'service_role' and
     (new.status is distinct from old.status or new.plan_id is distinct from old.plan_id or new.trial_ends_at is distinct from old.trial_ends_at
      or new.mp_preapproval_id is distinct from old.mp_preapproval_id or new.pending_plan_code is distinct from old.pending_plan_code) then
    raise exception 'Plano e situação da assinatura só podem ser alterados pela NicoTech.';
  end if;
  return new;
end $$;

-- Marca o plano pendente. Só com o segredo do webhook de pagamento (chamado pelo servidor do app). p_plan nulo limpa.
create or replace function public.set_pending_plan(p_secret text, p_org uuid, p_plan text) returns text
language plpgsql security definer set search_path to 'public' as $$
declare h text;
begin
  select s.hash into h from public.platform_secrets s where s.name = 'payment_webhook';
  if h is null or length(coalesce(p_secret, '')) < 32 or encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') <> h then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_plan is not null and not exists (select 1 from public.plans where code = p_plan and active) then raise exception 'plano invalido'; end if;
  perform set_config('app.master', '1', true);
  update public.orgs set pending_plan_code = p_plan where id = p_org;
  return 'ok';
end $$;
revoke all on function public.set_pending_plan(text, uuid, text) from public;
grant execute on function public.set_pending_plan(text, uuid, text) to anon, authenticated, service_role;

create or replace function public.ingest_payment_event(p_secret text, p_provider text, p_event_id text, p_org uuid, p_kind text, p_status text, p_amount numeric, p_at timestamp with time zone, p_raw jsonb)
returns text language plpgsql security definer set search_path to 'public' as $$
declare h text; n int; pid uuid; pend text; matched boolean := false; cur text; v_code text;
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
  if p_org is not null then
    select mp_preapproval_id, pending_plan_code into cur, pend from public.orgs where id = p_org;
  end if;
  if p_org is not null and p_status = 'confirmado' then
    perform set_config('app.master', '1', true);
    -- troca de plano: a cobrança aprovada no valor do plano pendente efetiva a troca
    if pend is not null and p_amount is not null and exists (select 1 from public.plans where code = pend and active and price_month = p_amount) then
      matched := true; v_code := pend;
    else
      v_code := p_raw->>'fb_plan';
    end if;
    select id into pid from public.plans where code = v_code and active;
    update public.orgs set status = 'ativa', plan_id = coalesce(pid, plan_id),
           pending_plan_code = case when matched then null else pending_plan_code end,
           mp_preapproval_id = coalesce(nullif(p_raw->>'preapproval_id', ''), mp_preapproval_id)
     where id = p_org and (status in ('teste', 'suspensa') or matched);
    insert into public.platform_audit(admin_user, action, target, details)
    values ('00000000-0000-0000-0000-000000000000', 'webhook_pagamento_confirmado', p_org::text, jsonb_build_object('evento', p_event_id, 'provedor', p_provider, 'valor', p_amount, 'plano', v_code, 'troca_de_plano', matched));
  elsif p_org is not null and p_kind = 'assinatura' and p_raw->>'status' = 'authorized' and nullif(p_raw->>'id', '') is not null then
    perform set_config('app.master', '1', true);
    update public.orgs set mp_preapproval_id = p_raw->>'id' where id = p_org;
  elsif p_org is not null and p_status = 'falhou' and p_kind in ('assinatura_cancelada', 'assinatura_pausada') then
    -- cancelamento de uma assinatura antiga (não a atual) não suspende a empresa
    if cur is null or p_raw->>'id' is null or cur = p_raw->>'id' then
      perform set_config('app.master', '1', true);
      update public.orgs set status = 'suspensa' where id = p_org and status = 'ativa';
      insert into public.platform_audit(admin_user, action, target, details)
      values ('00000000-0000-0000-0000-000000000000', 'webhook_assinatura_suspensa', p_org::text, jsonb_build_object('evento', p_event_id, 'provedor', p_provider, 'tipo', p_kind));
    end if;
  end if;
  return 'ok';
end $$;

-- empresas que já tinham assinatura autorizada registrada
select set_config('app.master', '1', true);
update public.orgs o set mp_preapproval_id = x.pid
from (select distinct on (org_id) org_id, raw->>'id' pid from public.subscription_payments
      where provider = 'mercadopago' and kind = 'assinatura' and raw->>'status' = 'authorized' and org_id is not null
      order by org_id, created_at desc) x
where o.id = x.org_id and o.mp_preapproval_id is null;
