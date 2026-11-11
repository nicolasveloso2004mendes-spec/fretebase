-- Fase 7: privilégios mínimos, webhook idempotente (segredo só como hash), MFA progressivo.
-- (Aplicada no Supabase como "fase7_hardening_privilegios_webhook_mfa". Veja o histórico em supabase_migrations.schema_migrations.)
-- O hash abaixo é de um segredo gerado para este projeto; para rotacionar, gere outro segredo, atualize PAYMENT_WEBHOOK_SECRET na Vercel e este hash.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.driver_trips, public.client_trips, public.client_events, public.client_proofs, public.client_documents, public.client_quotes, public.client_orders, public.client_last_location from authenticated;
revoke all on public.platform_admins, public.platform_audit, public.org_requests from authenticated;
revoke insert, update, delete on public.plans, public.audit_log, public.subscription_payments from authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
revoke execute on function public.check_org_refs() from anon, public;
-- (demais objetos: platform_secrets, ingest_payment_event, app_mfa_strict, app_is_superadmin, app_org, my_org, orgs_mfa_policy_guard — ver histórico de migrações do projeto)
