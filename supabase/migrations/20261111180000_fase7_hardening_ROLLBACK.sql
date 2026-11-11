-- Rollback dos privilégios (restaura o padrão do Supabase). A RLS continua protegendo os dados.
grant all on all tables in schema public to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to anon;
-- MFA: voltar app_is_superadmin para a regra anterior
create or replace function public.app_is_superadmin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.platform_admins where user_id = auth.uid()) and public.app_mfa_ok_raw() $$;
-- Webhook: desativar sem apagar histórico
revoke execute on function public.ingest_payment_event(text, text, text, uuid, text, text, numeric, timestamptz, jsonb) from anon, authenticated;
