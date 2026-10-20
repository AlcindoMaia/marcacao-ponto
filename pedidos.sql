-- =======================================================
-- TABELAS: pedidos + pedido_linhas
-- Pedidos de material feitos no ecrã Hoje (assistente "Pede material"),
-- guardados como rascunho e depois validados ou cancelados pelo admin.
-- Requer supabase_schema.sql (obras, artigos, is_admin).
-- Reflete o que está em produção (migração pedidos_de_material, 2026-10-13).
-- =======================================================

create table if not exists pedidos (
    id             uuid primary key default gen_random_uuid(),
    obra_id        uuid references obras(id) on delete set null,
    pedido_por     text,           -- email de quem fez o pedido
    texto_original text,           -- o que foi escrito ao assistente
    estado         text not null default 'rascunho'
                   check (estado in ('rascunho', 'validado', 'encomendado', 'recebido', 'cancelado')),
    notas          text,
    criado_em      timestamptz not null default now(),
    validado_em    timestamptz,
    validado_por   text
);

create index if not exists idx_pedidos_estado on pedidos(estado, criado_em desc);
create index if not exists idx_pedidos_obra   on pedidos(obra_id);

create table if not exists pedido_linhas (
    id         uuid primary key default gen_random_uuid(),
    pedido_id  uuid not null references pedidos(id) on delete cascade,
    artigo_id  uuid references artigos(id) on delete set null,
    descricao  text not null,
    quantidade numeric,
    unidade    text,
    confianca  text not null default 'media'
               check (confianca in ('alta', 'media', 'baixa')),  -- vem do assistente
    ordem      integer not null default 0,
    criado_em  timestamptz not null default now()
);

create index if not exists idx_pedido_linhas_pedido on pedido_linhas(pedido_id);

-- RLS: só administradores
alter table pedidos       enable row level security;
alter table pedido_linhas enable row level security;

drop policy if exists "pedidos: admin gere tudo" on pedidos;
create policy "pedidos: admin gere tudo" on pedidos
    for all to authenticated
    using (is_admin()) with check (is_admin());

drop policy if exists "pedido_linhas: admin gere tudo" on pedido_linhas;
create policy "pedido_linhas: admin gere tudo" on pedido_linhas
    for all to authenticated
    using (is_admin()) with check (is_admin());

revoke all on pedidos, pedido_linhas from anon;
