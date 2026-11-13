create or replace function public.request_org_signup(p_company text, p_cnpj text, p_contact text, p_email text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare c text := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
begin
  if char_length(coalesce(btrim(p_company), '')) not between 2 and 160 or char_length(coalesce(btrim(p_contact), '')) not between 2 and 160 then raise exception 'Informe empresa e responsável.'; end if;
  if coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_email) > 200 then raise exception 'E-mail inválido.'; end if;
  if c <> '' and char_length(c) <> 14 then raise exception 'CNPJ deve ter 14 dígitos.'; end if;
  if char_length(coalesce(p_phone, '')) > 30 then raise exception 'Telefone inválido.'; end if;
  if (select count(*) from public.org_requests where created_at > now() - interval '1 hour') >= 20 then raise exception 'Muitos pedidos agora. Tente mais tarde.'; end if;
  if exists (select 1 from public.org_requests where lower(email) = lower(btrim(p_email)) and status = 'pendente') then return; end if;
  insert into public.org_requests(company, cnpj, contact_name, email, phone) values (btrim(p_company), nullif(c, ''), btrim(p_contact), lower(btrim(p_email)), nullif(btrim(coalesce(p_phone, '')), ''));
end $$;
