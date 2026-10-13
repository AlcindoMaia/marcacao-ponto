-- =======================================================
-- TABELAS: comparação de cotações de fornecedores
-- Admin › Orçamentos › Comparar fornecedores (cotacoes.js).
-- Uma comparação junta as propostas de vários fornecedores para o
-- mesmo trabalho (ex.: material de capoto para 200 m²) e mostra:
-- resumo, preços unitários, como está cotado, cesto normalizado
-- e faltas/riscos.
-- Depende de: obras, fornecedores, is_admin(), set_atualizado_em()
-- (ver supabase_schema.sql e tarefas.sql)
-- =======================================================

-- -------------------------------------------------------
-- comparacoes: o trabalho que se está a cotar
-- -------------------------------------------------------
create table if not exists comparacoes (
    id              uuid primary key default gen_random_uuid(),
    titulo          text not null,
    obra_id         uuid references obras(id) on delete set null,
    quantidade_base numeric(12,2),            -- ex.: 200 (m² de fachada); dá o €/m²
    unidade_base    text not null default 'm²',
    estado          text not null default 'aberta'
                    check (estado in ('aberta', 'decidida', 'arquivada')),
    conclusao       text,                      -- uma conclusão por linha
    notas_resumo    jsonb not null default '{}'::jsonb, -- nota por linha do resumo
    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now()
);

drop trigger if exists trg_comparacoes_atualizado on comparacoes;
create trigger trg_comparacoes_atualizado
    before update on comparacoes
    for each row execute function set_atualizado_em();

-- -------------------------------------------------------
-- comparacao_propostas: um orçamento de um fornecedor
-- -------------------------------------------------------
create table if not exists comparacao_propostas (
    id             uuid primary key default gen_random_uuid(),
    comparacao_id  uuid not null references comparacoes(id) on delete cascade,
    fornecedor_id  uuid references fornecedores(id) on delete set null,
    fornecedor     text not null,              -- nome mostrado
    documento      text,                       -- nº do orçamento do fornecedor
    data_documento date,
    validade       text,                       -- texto livre: "08/10/2026", "8 dias", "não vinculativo"
    sistema        text,                       -- marca / sistema (Weber, Secil Isovit...)
    total_sem_iva  numeric(12,2),              -- como está no documento
    total_com_iva  numeric(12,2),
    pagamento      text,
    entrega        text,
    observacoes    text,                       -- descontos, conversões, etc.
    ordem          integer not null default 0,
    criado_em      timestamptz not null default now()
);

create index if not exists idx_comp_propostas_comp on comparacao_propostas(comparacao_id);

-- -------------------------------------------------------
-- comparacao_artigos: as linhas comparáveis (EPS, buchas, rede...)
-- -------------------------------------------------------
create table if not exists comparacao_artigos (
    id            uuid primary key default gen_random_uuid(),
    comparacao_id uuid not null references comparacoes(id) on delete cascade,
    nome          text not null,
    unidade       text not null,               -- unidade de comparação: m², kg, ml, un, €
    qtd_correta   numeric(12,3),               -- quantidade certa para o trabalho
    nota          text,                        -- "quantidade correta e porquê"
    destacar      boolean not null default false, -- linha a vermelho em "como está cotado"
    no_cesto      boolean not null default true,  -- false = taxas/extras fora do cesto
    ordem         integer not null default 0,
    criado_em     timestamptz not null default now()
);

create index if not exists idx_comp_artigos_comp on comparacao_artigos(comparacao_id);

-- -------------------------------------------------------
-- comparacao_cotacoes: o que cada fornecedor cotou para cada artigo
-- -------------------------------------------------------
create table if not exists comparacao_cotacoes (
    id              uuid primary key default gen_random_uuid(),
    artigo_id       uuid not null references comparacao_artigos(id) on delete cascade,
    proposta_id     uuid not null references comparacao_propostas(id) on delete cascade,
    nao_cotou       boolean not null default false,
    quantidade      numeric(12,3),             -- quantidade cotada, na unidade do artigo
    quantidade_txt  text,                      -- para mostrar quando a unidade é outra (ex.: "45 L")
    preco_unitario  numeric(12,4),             -- líquido, com descontos, sem IVA, por unidade do artigo
    descricao       text,                      -- designação no documento do fornecedor
    criado_em       timestamptz not null default now(),
    unique (artigo_id, proposta_id)
);

create index if not exists idx_comp_cotacoes_proposta on comparacao_cotacoes(proposta_id);

-- -------------------------------------------------------
-- comparacao_riscos: o que falta e o que perguntar
-- -------------------------------------------------------
create table if not exists comparacao_riscos (
    id            uuid primary key default gen_random_uuid(),
    comparacao_id uuid not null references comparacoes(id) on delete cascade,
    ponto         text not null,
    impacto       text,
    acao          text,
    grave         boolean not null default false,
    ordem         integer not null default 0,
    criado_em     timestamptz not null default now()
);

create index if not exists idx_comp_riscos_comp on comparacao_riscos(comparacao_id);

-- -------------------------------------------------------
-- RLS: só administradores
-- -------------------------------------------------------
alter table comparacoes          enable row level security;
alter table comparacao_propostas enable row level security;
alter table comparacao_artigos   enable row level security;
alter table comparacao_cotacoes  enable row level security;
alter table comparacao_riscos    enable row level security;

drop policy if exists "comparacoes: admin gere tudo" on comparacoes;
create policy "comparacoes: admin gere tudo" on comparacoes
    for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "comparacao_propostas: admin gere tudo" on comparacao_propostas;
create policy "comparacao_propostas: admin gere tudo" on comparacao_propostas
    for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "comparacao_artigos: admin gere tudo" on comparacao_artigos;
create policy "comparacao_artigos: admin gere tudo" on comparacao_artigos
    for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "comparacao_cotacoes: admin gere tudo" on comparacao_cotacoes;
create policy "comparacao_cotacoes: admin gere tudo" on comparacao_cotacoes
    for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "comparacao_riscos: admin gere tudo" on comparacao_riscos;
create policy "comparacao_riscos: admin gere tudo" on comparacao_riscos
    for all to authenticated using (is_admin()) with check (is_admin());
