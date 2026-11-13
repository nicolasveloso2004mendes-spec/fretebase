-- Link público de cotação: o cliente da transportadora pede frete sem criar conta.
-- Tudo passa por funções (SECURITY DEFINER) com validação e limite de uso; nenhuma tabela é aberta ao público.

create table public.org_public_links (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  slug text not null unique,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.org_public_links enable row level security;
revoke all on public.org_public_links from anon, authenticated;

create table public.public_quote_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  origin text not null,
  destination text not null,
  cargo text,
  weight_kg numeric,
  notes text,
  status text not null default 'novo' check (status in ('novo','atendido','descartado')),
  created_at timestamptz not null default now()
);
create index public_quote_requests_org_idx on public.public_quote_requests (org_id, created_at desc);
alter table public.public_quote_requests enable row level security;
revoke all on public.public_quote_requests from anon, authenticated;
grant select, update, delete on public.public_quote_requests to authenticated;
create policy "reader select" on public.public_quote_requests for select to authenticated using (org_id = app_org() and app_is_reader());
create policy "staff update" on public.public_quote_requests for update to authenticated using (org_id = app_org() and app_is_staff()) with check (org_id = app_org() and app_is_staff());
create policy "staff delete" on public.public_quote_requests for delete to authenticated using (org_id = app_org() and app_is_staff());

-- Dono/admin: lê o estado do link (cria o registro, desligado, na primeira vez).
create or replace function public.get_public_quote_link() returns jsonb
language plpgsql security definer set search_path = public as $$
declare oid uuid := app_org(); r public.org_public_links%rowtype;
begin
  if oid is null or not app_is_admin() then raise exception 'Ação exclusiva do administrador.'; end if;
  select * into r from public.org_public_links where org_id = oid;
  if not found then
    insert into public.org_public_links(org_id, slug) values (oid, substr(md5(random()::text || clock_timestamp()::text || oid::text), 1, 10)) returning * into r;
  end if;
  return jsonb_build_object('slug', r.slug, 'enabled', r.enabled);
end $$;

create or replace function public.set_public_quote_link(p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
declare oid uuid := app_org();
begin
  if oid is null or not app_is_admin() then raise exception 'Ação exclusiva do administrador.'; end if;
  perform public.get_public_quote_link();
  update public.org_public_links set enabled = coalesce(p_enabled, false) where org_id = oid;
end $$;

-- Público: nome da empresa para mostrar no formulário (só se o link estiver ligado e a empresa em dia).
create or replace function public.public_quote_info(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', coalesce(nullif(o.trade_name, ''), o.name))
  from public.org_public_links l join public.orgs o on o.id = l.org_id
  where l.slug = p_slug and l.enabled
    and (o.status = 'ativa' or (o.status = 'teste' and o.trial_ends_at >= current_date))
$$;

-- Público: recebe o pedido. Campo p_website é isca para robôs (humano nunca preenche).
create or replace function public.public_quote_submit(p_slug text, p_name text, p_phone text, p_email text, p_origin text, p_destination text,
                                                     p_cargo text, p_weight numeric, p_notes text, p_website text default null) returns void
language plpgsql security definer set search_path = public as $$
declare oid uuid; digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if coalesce(btrim(p_website), '') <> '' then return; end if;
  select o.id into oid from public.org_public_links l join public.orgs o on o.id = l.org_id
   where l.slug = p_slug and l.enabled and (o.status = 'ativa' or (o.status = 'teste' and o.trial_ends_at >= current_date));
  if oid is null then raise exception 'Este link não está disponível.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 or char_length(p_name) > 120 then raise exception 'Informe seu nome.'; end if;
  if char_length(digits) < 10 or char_length(digits) > 13 then raise exception 'Informe um telefone ou WhatsApp com DDD.'; end if;
  if coalesce(p_email, '') <> '' and (char_length(p_email) > 150 or position('@' in p_email) < 2) then raise exception 'E-mail inválido.'; end if;
  if char_length(btrim(coalesce(p_origin, ''))) < 2 or char_length(btrim(coalesce(p_destination, ''))) < 2 or char_length(p_origin) > 200 or char_length(p_destination) > 200 then raise exception 'Informe origem e destino.'; end if;
  if char_length(coalesce(p_cargo, '')) > 300 or char_length(coalesce(p_notes, '')) > 1000 then raise exception 'Texto longo demais.'; end if;
  if coalesce(p_weight, 0) < 0 or coalesce(p_weight, 0) > 1000000 then raise exception 'Peso inválido.'; end if;
  if (select count(*) from public.public_quote_requests where org_id = oid and created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.public_quote_requests where org_id = oid and created_at > now() - interval '1 day') >= 200 then
    raise exception 'Muitos pedidos neste momento. Tente de novo mais tarde ou fale direto com a transportadora.'; end if;
  if (select count(*) from public.public_quote_requests where org_id = oid and regexp_replace(phone, '\D', '', 'g') = digits and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Já recebemos seus pedidos de hoje. A transportadora entrará em contato.'; end if;
  insert into public.public_quote_requests(org_id, name, phone, email, origin, destination, cargo, weight_kg, notes)
  values (oid, btrim(p_name), btrim(p_phone), nullif(btrim(coalesce(p_email, '')), ''), btrim(p_origin), btrim(p_destination),
          nullif(btrim(coalesce(p_cargo, '')), ''), p_weight, nullif(btrim(coalesce(p_notes, '')), ''));
end $$;

revoke execute on function public.get_public_quote_link(), public.set_public_quote_link(boolean),
  public.public_quote_info(text), public.public_quote_submit(text, text, text, text, text, text, text, numeric, text, text) from public;
grant execute on function public.get_public_quote_link(), public.set_public_quote_link(boolean) to authenticated;
grant execute on function public.public_quote_info(text), public.public_quote_submit(text, text, text, text, text, text, text, numeric, text, text) to anon, authenticated;

-- Retenção: pedidos de cotação feitos pelo link são apagados após 180 dias.
select cron.schedule('purge-public-quotes', '30 6 * * *', $$delete from public.public_quote_requests where created_at < now() - interval '180 days'$$);
