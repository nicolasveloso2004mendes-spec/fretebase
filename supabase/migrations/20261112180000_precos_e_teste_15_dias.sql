-- Preços de lançamento e teste grátis padrão de 15 dias.
update public.plans set price_month = 59  where code = 'essencial';
update public.plans set price_month = 129 where code = 'profissional';
update public.plans set price_month = 249 where code = 'premium';

create or replace function public.master_decide_request(p_request uuid, p_approve boolean, p_plan text, p_trial_days integer)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare r public.org_requests%rowtype; nid uuid;
begin
  perform master_guard(case when p_approve then 'aprovar_cadastro' else 'recusar_cadastro' end, p_request::text, jsonb_build_object('plano', p_plan, 'dias_teste', p_trial_days));
  select * into r from public.org_requests where id = p_request and status = 'pendente' for update;
  if not found then raise exception 'Pedido não encontrado ou já decidido.'; end if;
  if p_approve then
    if exists (select 1 from auth.users where lower(email) = r.email) then raise exception 'Este e-mail já tem conta. Use outro e-mail para o proprietário.'; end if;
    insert into public.orgs(name, legal_name, cnpj, phone, email, status, plan_id, trial_ends_at)
    values (r.company, r.company, r.cnpj, r.phone, r.email, 'teste', (select id from public.plans where code = p_plan), current_date + greatest(coalesce(p_trial_days, 15), 0))
    returning id into nid;
    insert into public.invites(org_id, email, role) values (nid, r.email, 'proprietario');
  end if;
  update public.org_requests set status = case when p_approve then 'aprovada' else 'recusada' end, org_id = nid, decided_at = now(), decided_by = auth.uid() where id = r.id;
end $function$;
