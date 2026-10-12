-- =======================================================
-- TABELAS: tarefas + tarefa_funcionarios
-- Planeamento operacional (separador Planeamento do admin, ecrã Hoje)
-- Copiado do Supabase em 2026-10-12 — reflete o que está em produção.
-- =======================================================

-- Funções usadas abaixo (já existem em produção; recriadas aqui para o ficheiro ser autónomo)
create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from admins
    where email = auth.jwt() ->> 'email'
  );
$$;

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- -------------------------------------------------------
-- tarefas
-- -------------------------------------------------------
create table if not exists tarefas (
    id                 uuid primary key default gen_random_uuid(),
    obra_id            uuid references obras(id) on delete set null,
    descricao          text not null,
    notas              text,
    data_prevista      date not null,
    hora_inicio        time,
    duracao_horas      numeric not null default 8 check (duracao_horas > 0),
    ordem              integer not null default 0,
    usar_morada_obra   boolean not null default true,
    morada             text,
    latitude           double precision,
    longitude          double precision,
    estado             text not null default 'planeada'
                       check (estado in ('planeada', 'em_curso', 'concluida', 'cancelada')),
    concluida_em       timestamptz,
    duracao_real_horas numeric,
    criado_em          timestamptz not null default now(),
    atualizado_em      timestamptz not null default now()
);

create index if not exists idx_tarefas_data   on tarefas(data_prevista);
create index if not exists idx_tarefas_estado on tarefas(estado);
create index if not exists idx_tarefas_obra   on tarefas(obra_id);

drop trigger if exists trg_tarefas_atualizado_em on tarefas;
create trigger trg_tarefas_atualizado_em
    before update on tarefas
    for each row execute function set_atualizado_em();

-- -------------------------------------------------------
-- tarefa_funcionarios (quem está atribuído a cada tarefa)
-- -------------------------------------------------------
create table if not exists tarefa_funcionarios (
    tarefa_id      uuid not null references tarefas(id) on delete cascade,
    funcionario_id uuid not null references funcionarios(id) on delete cascade,
    responsavel    boolean not null default false,
    criado_em      timestamptz not null default now(),
    primary key (tarefa_id, funcionario_id)
);

create index if not exists idx_tarefa_func_funcionario on tarefa_funcionarios(funcionario_id);

-- -------------------------------------------------------
-- RLS: só administradores
-- -------------------------------------------------------
alter table tarefas             enable row level security;
alter table tarefa_funcionarios enable row level security;

drop policy if exists "tarefas: admin gere tudo" on tarefas;
create policy "tarefas: admin gere tudo" on tarefas
    for all to authenticated
    using (is_admin()) with check (is_admin());

drop policy if exists "tarefa_funcionarios: admin gere tudo" on tarefa_funcionarios;
create policy "tarefa_funcionarios: admin gere tudo" on tarefa_funcionarios
    for all to authenticated
    using (is_admin()) with check (is_admin());
