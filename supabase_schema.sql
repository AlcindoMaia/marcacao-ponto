-- =======================================================
-- SCHEMA MAIA SOLUTIONS
-- Versão corrigida — adiciona colunas em falta
-- =======================================================

-- FUNCIONÁRIOS
create table if not exists funcionarios (
    id         uuid primary key default gen_random_uuid(),
    nome       text not null,
    codigo     text,
    device_id  text unique not null,
    created_at timestamptz default now()
);

-- OBRAS
-- FIX: id agora é UUID gerado automaticamente (era "text" sem default)
-- FIX: adicionado campo "raio" que estava a ser guardado mas não existia
create table if not exists obras (
    id         uuid primary key default gen_random_uuid(),
    nome       text not null,
    morada     text,
    latitude   numeric,
    longitude  numeric,
    raio       integer default 120,  -- raio em metros para validação GPS
    codigo     text,                  -- código auto gerado ex: 12/2026
    created_at timestamptz default now()
);

-- REGISTO DE PONTO (batidas individuais entrada/saída)
-- FIX: adicionado campo "tipo" que estava a ser usado mas não existia no schema
create table if not exists ponto (
    id             uuid primary key default gen_random_uuid(),
    funcionario_id uuid not null references funcionarios(id) on delete cascade,
    obra_id        uuid not null references obras(id) on delete cascade,
    datahora       timestamptz not null,
    latitude       numeric,
    longitude      numeric,
    tipo           text not null check (tipo in ('entrada', 'saida')),
    created_at     timestamptz default now()
);

-- REGISTOS DE PONTO (pares entrada/saída por dia — usados pelo painel admin)
-- Esta tabela recebe os pares calculados (ou pode ser uma view)
create table if not exists registos_ponto (
    id             uuid primary key default gen_random_uuid(),
    funcionario_id uuid not null references funcionarios(id) on delete cascade,
    obra_id        uuid not null references obras(id) on delete cascade,
    dia            date not null,
    entrada        timestamptz,
    saida          timestamptz,
    horas          numeric,           -- horas trabalhadas calculadas
    estado         text default 'OK' check (estado in ('OK', 'Incompleto')),
    created_at     timestamptz default now()
);

-- ARTIGOS (inventário)
create table if not exists artigos (
    id                  uuid primary key default gen_random_uuid(),
    codigo              text unique,
    descricao           text not null,
    tipo_artigo         text check (tipo_artigo in ('ferramenta', 'consumivel', 'mercadoria')),
    preco               numeric default 0,
    iva                 integer default 23,
    unidade_medida_id   uuid references unidades_medida(id),
    local_armazenamento text,
    created_at          timestamptz default now()
);

-- UNIDADES DE MEDIDA
create table if not exists unidades_medida (
    id     uuid primary key default gen_random_uuid(),
    codigo text not null unique,  -- ex: UN, KG, M, M2
    nome   text
);

-- MOVIMENTOS DE STOCK
create table if not exists movimentos_stock (
    id             uuid primary key default gen_random_uuid(),
    artigo_id      uuid not null references artigos(id) on delete cascade,
    tipo_movimento text not null check (tipo_movimento in ('entrada', 'saida', 'inicial')),
    quantidade     numeric not null,
    obra_id        uuid references obras(id),
    observacoes    text,
    created_at     timestamptz default now()
);

-- FORNECEDORES
create table if not exists fornecedores (
    id         uuid primary key default gen_random_uuid(),
    nif        text unique,
    nome       text not null,
    created_at timestamptz default now()
);

-- CATEGORIAS FINANCEIRAS
create table if not exists categorias_financeiras (
    id         uuid primary key default gen_random_uuid(),
    nome       text not null unique,
    tipo       text check (tipo in ('entrada', 'saida', 'ambos')) default 'ambos',
    created_at timestamptz default now()
);

-- MOVIMENTOS FINANCEIROS
create table if not exists movimentos_financeiros (
    id                uuid primary key default gen_random_uuid(),
    referencia        text,
    data_documento    date not null,
    tipo              text not null check (tipo in ('entrada', 'saida')),
    fornecedor_id     uuid references fornecedores(id),
    categoria_id      uuid references categorias_financeiras(id),
    obra_id           uuid references obras(id),
    valor_base        numeric default 0,
    iva               numeric default 0,
    valor_total       numeric not null,
    estado_pagamento  text default 'por_pagar' check (estado_pagamento in ('pago', 'por_pagar')),
    observacoes       text,
    created_at        timestamptz default now()
);

-- =======================================================
-- TRIGGER: gerar código automático de obra (ex: 12/2026)
-- =======================================================
create or replace function gerar_codigo_obra()
returns trigger language plpgsql as $$
declare
    seq integer;
begin
    select coalesce(max(
        cast(split_part(codigo, '/', 1) as integer)
    ), 0) + 1
    into seq
    from obras
    where codigo like '%/' || extract(year from now())::text;

    new.codigo := seq::text || '/' || extract(year from now())::text;
    return new;
end;
$$;

drop trigger if exists trg_codigo_obra on obras;
create trigger trg_codigo_obra
before insert on obras
for each row execute function gerar_codigo_obra();
