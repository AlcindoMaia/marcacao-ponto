create table if not exists funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text,
  device_id text unique not null,
  created_at timestamptz default now()
);

create table if not exists ponto (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id),
  obra_id text not null,
  datahora timestamptz not null,
  latitude numeric,
  longitude numeric,
  created_at timestamptz default now()
);

create table if not exists obras (
  id text primary key,
  nome text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz default now()
);
