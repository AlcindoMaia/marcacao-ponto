-- =======================================================
-- TABELA: registos_admin
-- Registo diário do encarregado — fonte de verdade para salários
-- =======================================================

create table if not exists registos_admin (
    id            uuid primary key default gen_random_uuid(),
    data          date not null,
    funcionario_id uuid not null references funcionarios(id) on delete cascade,
    obra_id       uuid references obras(id) on delete set null,
    horas         numeric(5,2) not null check (horas >= 0 and horas <= 24),
    observacoes   text,
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
);

-- Índices para queries rápidas
create index if not exists idx_registos_admin_data          on registos_admin(data desc);
create index if not exists idx_registos_admin_funcionario   on registos_admin(funcionario_id);
create index if not exists idx_registos_admin_obra          on registos_admin(obra_id);

-- Unique: um funcionário pode ter vários registos no mesmo dia (obras diferentes)
-- mas não o mesmo funcionário + obra + data duplicado
create unique index if not exists idx_registos_admin_unique
    on registos_admin(data, funcionario_id, coalesce(obra_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- RLS
alter table registos_admin enable row level security;

-- anon não lê nada
create policy "registos_admin: só autenticados"
    on registos_admin for all
    to authenticated
    using (true)
    with check (true);

-- =======================================================
-- VIEW: vw_comparacao_registos
-- Compara registos_admin com ponto dos colaboradores
-- =======================================================
create or replace view vw_comparacao_registos as
select
    ra.data,
    f.nome                                          as funcionario,
    o.nome                                          as obra_admin,
    ra.horas                                        as horas_admin,
    -- Registos do colaborador no mesmo dia
    vr.obra                                         as obra_colab,
    vr.horas                                        as horas_colab,
    vr.estado                                       as estado_colab,
    -- Divergências
    case
        when vr.funcionario is null              then 'sem_registo_colab'
        when vr.estado = 'Incompleto'            then 'registo_incompleto'
        when o.nome != vr.obra                   then 'obra_diferente'
        when abs(ra.horas - (
            case when vr.horas ~ '^\d+:\d+$'
                 then (split_part(vr.horas,':',1)::numeric + split_part(vr.horas,':',2)::numeric/60)
                 else vr.horas::numeric end
        )) > 0.5                                 then 'horas_diferentes'
        else 'ok'
    end                                             as divergencia,
    ra.id                                           as registo_admin_id
from registos_admin ra
join funcionarios f on f.id = ra.funcionario_id
left join obras o on o.id = ra.obra_id
left join vw_registos_ponto vr
    on vr.funcionario = f.nome
    and vr.dia = ra.data::text
    and (o.nome is null or vr.obra = o.nome)
order by ra.data desc, f.nome;
