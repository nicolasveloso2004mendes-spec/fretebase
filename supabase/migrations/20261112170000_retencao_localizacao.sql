-- LGPD: a localização do motorista é apagada automaticamente 30 dias após o registro (rotina diária).
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.purge_old_locations(p_days int default 30) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if p_days is null or p_days < 1 then raise exception 'prazo invalido'; end if;
  delete from public.trip_locations where recorded_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_old_locations(int) from public, anon, authenticated;

-- todo dia às 06:15 UTC (03:15 em Brasília); substitui o agendamento se já existir
select cron.unschedule(jobid) from cron.job where jobname = 'purge-locations';
select cron.schedule('purge-locations', '15 6 * * *', $$select public.purge_old_locations(30)$$);
