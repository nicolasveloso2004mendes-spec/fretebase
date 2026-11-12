drop function if exists public.set_pending_plan(text, uuid, text);
alter table public.orgs drop column if exists pending_plan_code;
alter table public.orgs drop column if exists mp_preapproval_id;
-- restaurar orgs_guard e ingest_payment_event da migração 20261111190000_cobranca_mercadopago_trial.sql
