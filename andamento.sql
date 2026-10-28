-- =======================================================
-- ANDAMENTO DA OBRA: FASES E AUTOS DE MEDIÇÃO
-- Separador "Andamento" no painel da obra.
--
-- Fases: uma linha do tempo simples (fundações, estrutura, acabamentos…),
-- com datas e estado. O cliente vê as fases marcadas como visíveis na Área
-- do cliente: só o estado e as datas, sem percentagens.
--
-- Autos de medição: em cada auto o Alcindo marca a percentagem feita
-- (acumulada) de cada serviço da obra; o valor do auto é o que essa
-- percentagem acrescenta ao auto anterior, sobre o valor sem IVA do serviço.
-- Serve para as duas formas de cobrar: por fases (aplica-se a mesma % a
-- todos os serviços, ex.: 30%) ou pelo que foi feito em cada mês.
-- A fatura continua a ser emitida no TOCONLINE; o auto é o pedido de
-- pagamento. O cliente vê os autos enviados na Área do cliente.
-- =======================================================

create table if not exists obra_fases (
    id               uuid primary key default gen_random_uuid(),
    obra_id          uuid not null references obras(id) on delete cascade,
    nome             text not null,
    ordem            int  not null default 0,
    data_inicio      date,
    data_fim         date,
    estado           text not null default 'por_fazer'
                     check (estado in ('por_fazer', 'a_decorrer', 'concluida')),
    visivel_cliente  boolean not null default true,
    created_at       timestamptz default now()
);

create index if not exists idx_obra_fases_obra on obra_fases (obra_id, ordem);

create table if not exists autos_medicao (
    id               uuid primary key default gen_random_uuid(),
    obra_id          uuid not null references obras(id) on delete cascade,
    numero           int  not null,
    data             date not null default current_date,
    -- rascunho: só o Alcindo vê; enviado: o cliente vê; faturado: já tem fatura
    estado           text not null default 'rascunho'
                     check (estado in ('rascunho', 'enviado', 'faturado')),
    taxa_iva         numeric(5,2) not null default 23,
    notas            text,
    created_at       timestamptz default now(),
    unique (obra_id, numero)
);

create table if not exists auto_linhas (
    id               uuid primary key default gen_random_uuid(),
    auto_id          uuid not null references autos_medicao(id) on delete cascade,
    obra_servico_id  uuid not null references obra_servicos(id) on delete cascade,
    percentagem      numeric(5,2) not null check (percentagem between 0 and 100),  -- acumulada até este auto
    valor            numeric(12,2) not null default 0,   -- o que este auto acrescenta, sem IVA
    unique (auto_id, obra_servico_id)
);

-- RLS: só administradores. O cliente lê pela função area-cliente.
alter table obra_fases    enable row level security;
alter table autos_medicao enable row level security;
alter table auto_linhas   enable row level security;

drop policy if exists "obra_fases: admin gere tudo" on obra_fases;
create policy "obra_fases: admin gere tudo" on obra_fases
    for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "autos_medicao: admin gere tudo" on autos_medicao;
create policy "autos_medicao: admin gere tudo" on autos_medicao
    for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "auto_linhas: admin gere tudo" on auto_linhas;
create policy "auto_linhas: admin gere tudo" on auto_linhas
    for all to authenticated using (is_admin()) with check (is_admin());

revoke all on obra_fases, autos_medicao, auto_linhas from anon;
grant select, insert, update, delete on obra_fases, autos_medicao, auto_linhas to authenticated;
