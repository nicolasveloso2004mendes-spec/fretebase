select cron.unschedule(jobid) from cron.job where jobname = 'purge-locations';
drop function if exists public.purge_old_locations(int);
