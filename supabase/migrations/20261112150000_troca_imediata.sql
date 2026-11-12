-- Troca imediata de plano: o cliente paga um novo checkout (plano novo). Quando a nova assinatura é autorizada,
-- a antiga é cancelada no Mercado Pago (o servidor faz isso ao receber 'replaced:<id antigo>'); o plano muda quando
-- a cobrança aprovada tem o valor do plano pendente. O cancelamento da antiga não suspende a empresa.
create or replace function public.ingest_payment_event(p_secret text, p_provider text, p_event_id text, p_org uuid, p_kind text, p_status text, p_amount numeric, p_at timestamp with time zone, p_raw jsonb)
returns text language plpgsql security definer set search_path to 'public' as $$
declare h text; n int; pid uuid; pend text; matched boolean := false; cur text; v_code text; v_new text;
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
    if pend is not null and p_amount is not null and exists (select 1 from public.plans where code = pend and active and price_month = p_amount) then
      matched := true; v_code := pend;
    else
      v_code := p_raw->>'fb_plan';
    end if;
    select id into pid from public.plans where code = v_code and active;
    update public.orgs set status = 'ativa', plan_id = coalesce(pid, plan_id),
           pending_plan_code = case when matched then null else pending_plan_code end,
           mp_preapproval_id = coalesce(mp_preapproval_id, nullif(p_raw->>'preapproval_id', ''))
     where id = p_org and (status in ('teste', 'suspensa') or matched);
    insert into public.platform_audit(admin_user, action, target, details)
    values ('00000000-0000-0000-0000-000000000000', 'webhook_pagamento_confirmado', p_org::text, jsonb_build_object('evento', p_event_id, 'provedor', p_provider, 'valor', p_amount, 'plano', v_code, 'troca_de_plano', matched));
  elsif p_org is not null and p_kind = 'assinatura' and p_raw->>'status' = 'authorized' and nullif(p_raw->>'id', '') is not null then
    perform set_config('app.master', '1', true);
    v_new := p_raw->>'id';
    update public.orgs set mp_preapproval_id = v_new where id = p_org;
    -- troca imediata em andamento: a assinatura antiga deve ser cancelada pelo servidor
    if pend is not null and cur is not null and cur <> v_new then
      insert into public.platform_audit(admin_user, action, target, details)
      values ('00000000-0000-0000-0000-000000000000', 'webhook_assinatura_substituida', p_org::text, jsonb_build_object('antiga', cur, 'nova', v_new));
      return 'replaced:' || cur;
    end if;
  elsif p_org is not null and p_status = 'falhou' and p_kind in ('assinatura_cancelada', 'assinatura_pausada') then
    if cur is null or p_raw->>'id' is null or cur = p_raw->>'id' then
      perform set_config('app.master', '1', true);
      update public.orgs set status = 'suspensa' where id = p_org and status = 'ativa';
      insert into public.platform_audit(admin_user, action, target, details)
      values ('00000000-0000-0000-0000-000000000000', 'webhook_assinatura_suspensa', p_org::text, jsonb_build_object('evento', p_event_id, 'provedor', p_provider, 'tipo', p_kind));
    end if;
  end if;
  return 'ok';
end $$;
