-- =======================================================
-- DOCUMENTOS DA OBRA E FICHA DE CLIENTE
-- Primeiro passo da Área do cliente: o Alcindo carrega na ficha da obra os
-- PDFs que saem do TOCONLINE (orçamentos, faturas de venda, recibos), fotos
-- e outros documentos. O assistente lê os PDFs e propõe o registo; só grava
-- depois de confirmado.
--
-- Os ficheiros ficam no Storage do Supabase, no bucket privado
-- "obra-documentos", em <obra_id>/<ficheiro>. Por agora só os
-- administradores lhes chegam; "visivel_cliente" marca o que a Área do
-- cliente vai mostrar quando existir.
-- =======================================================

-- CLIENTES (até aqui o cliente era só um nome escrito em cada documento)
create table if not exists clientes (
    id         uuid primary key default gen_random_uuid(),
    nome       text not null,
    nif        text,
    email      text,
    telefone   text,
    morada     text,
    notas      text,
    created_at timestamptz default now()
);

create unique index if not exists clientes_nif_unico
    on clientes (nif) where nif is not null and nif <> '';

alter table obras                  add column if not exists cliente_id uuid references clientes(id) on delete set null;
alter table orcamentos             add column if not exists cliente_id uuid references clientes(id) on delete set null;
alter table movimentos_financeiros add column if not exists cliente_id uuid references clientes(id) on delete set null;

-- DOCUMENTOS DA OBRA
create table if not exists obra_documentos (
    id               uuid primary key default gen_random_uuid(),
    obra_id          uuid not null references obras(id) on delete cascade,
    tipo             text not null check (tipo in ('orcamento', 'fatura', 'recibo', 'foto', 'outro')),
    nome_ficheiro    text not null,
    caminho          text not null unique,   -- caminho no bucket obra-documentos
    mime             text,
    tamanho          bigint,
    visivel_cliente  boolean not null default false,
    -- por_tratar: PDF à espera de ser lido e confirmado
    -- registado:  o que o assistente leu já foi gravado
    -- arquivado:  só guardado (fotos, outros, ou quando não se quer registar)
    estado           text not null default 'arquivado'
                     check (estado in ('por_tratar', 'registado', 'arquivado')),
    numero_documento text,
    data_documento   date,
    dados_lidos      jsonb,                  -- o que o assistente leu, tal como foi confirmado
    orcamento_id     uuid references orcamentos(id) on delete set null,
    movimento_id     uuid references movimentos_financeiros(id) on delete set null,
    criado_por       text,
    created_at       timestamptz default now()
);

create index if not exists idx_obra_documentos_obra on obra_documentos (obra_id, created_at desc);

-- RLS: só administradores
alter table clientes        enable row level security;
alter table obra_documentos enable row level security;

drop policy if exists "clientes: admin gere tudo" on clientes;
create policy "clientes: admin gere tudo" on clientes
    for all to authenticated
    using (is_admin()) with check (is_admin());

drop policy if exists "obra_documentos: admin gere tudo" on obra_documentos;
create policy "obra_documentos: admin gere tudo" on obra_documentos
    for all to authenticated
    using (is_admin()) with check (is_admin());

revoke all on clientes, obra_documentos from anon;
grant select, insert, update, delete on clientes, obra_documentos to authenticated;

-- STORAGE: bucket privado, 20 MB por ficheiro
insert into storage.buckets (id, name, public, file_size_limit)
values ('obra-documentos', 'obra-documentos', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "obra-documentos: admin gere tudo" on storage.objects;
create policy "obra-documentos: admin gere tudo" on storage.objects
    for all to authenticated
    using (bucket_id = 'obra-documentos' and public.is_admin())
    with check (bucket_id = 'obra-documentos' and public.is_admin());
