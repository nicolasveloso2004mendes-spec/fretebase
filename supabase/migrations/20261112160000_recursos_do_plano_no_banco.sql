-- Recursos do plano aplicados no banco (antes só o menu escondia). Regras RESTRITIVAS: somam às regras de empresa/papel já existentes.
-- Plano sem linha (ou empresa sem plano) = tudo liberado, igual ao menu.
create or replace function public.app_has_feature(f text) returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select coalesce(p.features ? f, false) from public.orgs o join public.plans p on p.id = o.plan_id where o.id = public.app_org()), true)
$$;
revoke all on function public.app_has_feature(text) from public;
grant execute on function public.app_has_feature(text) to authenticated;

-- Tabelas que pertencem só a um recurso: bloqueio total (ler e gravar)
create policy plan_feature on public.maintenance_records as restrictive for all to authenticated using (public.app_has_feature('manutencao')) with check (public.app_has_feature('manutencao'));
create policy plan_feature on public.fuel_logs as restrictive for all to authenticated using (public.app_has_feature('frota')) with check (public.app_has_feature('frota'));
create policy plan_feature on public.tire_events as restrictive for all to authenticated using (public.app_has_feature('frota')) with check (public.app_has_feature('frota'));
create policy plan_feature on public.insurance_claims as restrictive for all to authenticated using (public.app_has_feature('documentos')) with check (public.app_has_feature('documentos'));
create policy plan_feature on public.insurers as restrictive for all to authenticated using (public.app_has_feature('documentos')) with check (public.app_has_feature('documentos'));
create policy plan_feature on public.message_templates as restrictive for all to authenticated using (public.app_has_feature('automacoes')) with check (public.app_has_feature('automacoes'));
create policy plan_feature on public.message_log as restrictive for all to authenticated using (public.app_has_feature('automacoes')) with check (public.app_has_feature('automacoes'));
create policy plan_feature on public.assistant_queries as restrictive for all to authenticated using (public.app_has_feature('assistente')) with check (public.app_has_feature('assistente'));

-- Tabelas lidas por telas do plano básico (simulador, alertas, viagem): leitura livre, gravação só com o recurso
create policy plan_feature_ins on public.tires as restrictive for insert to authenticated with check (public.app_has_feature('frota'));
create policy plan_feature_upd on public.tires as restrictive for update to authenticated using (public.app_has_feature('frota')) with check (public.app_has_feature('frota'));
create policy plan_feature_del on public.tires as restrictive for delete to authenticated using (public.app_has_feature('frota'));
create policy plan_feature_ins on public.insurance_policies as restrictive for insert to authenticated with check (public.app_has_feature('documentos'));
create policy plan_feature_upd on public.insurance_policies as restrictive for update to authenticated using (public.app_has_feature('documentos')) with check (public.app_has_feature('documentos'));
create policy plan_feature_del on public.insurance_policies as restrictive for delete to authenticated using (public.app_has_feature('documentos'));
create policy plan_feature_ins on public.fiscal_documents as restrictive for insert to authenticated with check (public.app_has_feature('documentos'));
create policy plan_feature_upd on public.fiscal_documents as restrictive for update to authenticated using (public.app_has_feature('documentos')) with check (public.app_has_feature('documentos'));
create policy plan_feature_del on public.fiscal_documents as restrictive for delete to authenticated using (public.app_has_feature('documentos'));
create policy plan_feature_ins on public.ciot_records as restrictive for insert to authenticated with check (public.app_has_feature('documentos'));
create policy plan_feature_upd on public.ciot_records as restrictive for update to authenticated using (public.app_has_feature('documentos')) with check (public.app_has_feature('documentos'));
create policy plan_feature_del on public.ciot_records as restrictive for delete to authenticated using (public.app_has_feature('documentos'));
create policy plan_feature_ins on public.toll_records as restrictive for insert to authenticated with check (public.app_has_feature('documentos'));
create policy plan_feature_upd on public.toll_records as restrictive for update to authenticated using (public.app_has_feature('documentos')) with check (public.app_has_feature('documentos'));
create policy plan_feature_del on public.toll_records as restrictive for delete to authenticated using (public.app_has_feature('documentos'));

-- Convite de motorista / cliente só se o plano inclui a área correspondente
create or replace function public.plan_limit_users() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare lim int; feats jsonb;
begin
  select p.max_users, p.features into lim, feats from public.orgs o join public.plans p on p.id = o.plan_id where o.id = new.org_id;
  if lim is not null and (select count(*) from public.members where org_id = new.org_id) + (select count(*) from public.invites where org_id = new.org_id and used_at is null) >= lim then
    raise exception 'Limite de usuários do plano atingido (%).', lim; end if;
  if feats is not null and new.role = 'motorista' and not (feats ? 'motorista') then
    raise exception 'O plano atual não inclui a área do motorista.'; end if;
  if feats is not null and new.role = 'cliente' and not (feats ? 'portal_cliente') then
    raise exception 'O plano atual não inclui o portal do cliente.'; end if;
  return new;
end $$;
