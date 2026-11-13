select cron.unschedule('purge-public-quotes');
drop function if exists public.public_quote_submit(text, text, text, text, text, text, text, numeric, text, text);
drop function if exists public.public_quote_info(text);
drop function if exists public.set_public_quote_link(boolean);
drop function if exists public.get_public_quote_link();
drop table if exists public.public_quote_requests;
drop table if exists public.org_public_links;
