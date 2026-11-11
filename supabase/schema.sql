-- Fretebase — rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- Cada usuário só enxerga os próprios dados (Row Level Security).

create extension if not exists "pgcrypto";

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  contact text,
  phone text,
  email text,
  payment_terms text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  plate text,
  consumption_km_l numeric not null default 0 check (consumption_km_l >= 0),
  maintenance_per_km numeric not null default 0 check (maintenance_per_km >= 0),
  tire_per_km numeric not null default 0 check (tire_per_km >= 0),
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  origin text not null,
  destination text not null,
  cargo text,
  weight_kg numeric check (weight_kg is null or weight_kg >= 0),
  desired_date date,
  status text not null default 'novo' check (status in ('novo','cotado','cancelado')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  origin text not null,
  destination text not null,
  distance_km numeric not null default 0 check (distance_km >= 0),
  round_trip boolean not null default true,
  cargo text,
  consumption_km_l numeric not null default 0,
  diesel_price numeric not null default 0,
  maintenance_per_km numeric not null default 0,
  tire_per_km numeric not null default 0,
  tolls numeric not null default 0,
  driver_cost numeric not null default 0,
  other_cost numeric not null default 0,
  tax_pct numeric not null default 0,
  freight_value numeric not null default 0,
  cost_total numeric not null default 0,
  profit numeric not null default 0,
  terms text,
  status text not null default 'rascunho' check (status in ('rascunho','enviada','aprovada','recusada')),
  follow_up_date date,
  created_at timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  origin text not null,
  destination text not null,
  pickup_date date,
  delivery_date date,
  status text not null default 'agendada' check (status in ('agendada','em_viagem','entregue','cancelada')),
  freight_value numeric not null default 0,
  cost_total numeric not null default 0,
  payment_status text not null default 'pendente' check (payment_status in ('pendente','pago')),
  payment_due date,
  paid_at date,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_idx on orders(user_id, created_at desc);
create index if not exists quotes_user_idx on quotes(user_id, created_at desc);
create index if not exists trips_user_idx on trips(user_id, created_at desc);

alter table clients enable row level security;
alter table vehicles enable row level security;
alter table orders enable row level security;
alter table quotes enable row level security;
alter table trips enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clients','vehicles','orders','quotes','trips'] loop
    execute format('drop policy if exists "own rows" on %I', t);
    execute format(
      'create policy "own rows" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;
