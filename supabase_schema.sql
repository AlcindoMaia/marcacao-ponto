-- =======================================================
-- SCHEMA MAIA SOLUTIONS
-- Copiado do Supabase (projeto npyosbigynxmxdakcymg) em 2026-10-12.
-- Reflete o que está em produção: tabelas, índices, funções, vistas,
-- triggers, RLS e permissões do schema public.
--
-- Ordem de execução numa base nova:
--   1. supabase_schema.sql  (este ficheiro)
--   2. tarefas.sql          (tabelas tarefas + tarefa_funcionarios)
--   3. a secção "vw_carga_diaria" no fim deste ficheiro cria a vista
--      só se a tabela tarefas já existir; volta a correr esse bloco
--      depois do passo 2.
--   4. pedidos.sql          (tabelas pedidos + pedido_linhas, ecrã Hoje)
--
-- O código usa objetos que NÃO existem em produção:
--   - função gerar_numero_orcamento (admin.js; tem fallback 'ORC-<timestamp>')
-- =======================================================


-- =======================================================
-- TABELAS
-- =======================================================

-- ADMINS (quem pode usar o painel; is_admin() compara o email do login)
create table if not exists admins (
    id         uuid primary key default gen_random_uuid(),
    device_id  text unique,
    nome       text,
    created_at timestamp default now(),
    email      text unique
);

-- FUNCIONÁRIOS
create table if not exists funcionarios (
    id            uuid primary key default gen_random_uuid(),
    nome          text not null,
    codigo        text,
    device_id     text unique,
    created_at    timestamptz default now(),
    valor_dia     numeric(10,2),
    ativo         boolean default true,
    acesso_stock  boolean default false,
    categoria     text,
    telemovel     text,
    nif           text,
    iban          text,
    tipo_contrato text default 'fixo' check (tipo_contrato in ('fixo', 'temporario'))
);

-- OBRAS (código gerado pelo trigger obras_set_codigo, ex: 12/2026)
create table if not exists obras (
    id                      uuid primary key default gen_random_uuid(),
    codigo                  text unique,
    nome                    text,
    local                   text,
    created_at              timestamptz default now(),
    latitude                double precision,
    longitude               double precision,
    morada                  text,
    raio                    integer default 120,  -- metros, validação GPS
    estado                  text default 'ativa' check (estado in ('ativa', 'concluida')),
    percentagem_conclusao   integer check (percentagem_conclusao >= 0 and percentagem_conclusao <= 100),
    data_conclusao_prevista date,
    drive_pastas            jsonb  -- IDs das pastas no Google Drive: {pasta, fotos, orcamentos, projeto, faturas, documentos}
);

-- PONTO (marcações individuais de entrada/saída; inseridas via ponto_marcar)
create table if not exists ponto (
    id             uuid primary key default gen_random_uuid(),
    funcionario_id uuid not null,
    obra_id        uuid not null,
    datahora       timestamptz not null,
    latitude       numeric,
    longitude      numeric,
    created_at     timestamptz default now(),
    tipo           text check (tipo in ('entrada', 'saida')),
    parecer_saida  text
);

-- PAGAMENTO POR DIA (fator aplicado ao valor_dia: 1.0 = dia completo)
create table if not exists pagamento_dia (
    id             uuid primary key default gen_random_uuid(),
    funcionario_id uuid not null references funcionarios(id),
    dia            date not null,
    fator          numeric(3,1) not null default 1.0,
    observacoes    text,
    created_at     timestamp default now(),
    unique (funcionario_id, dia)
);

-- REGISTOS ADMIN (registo diário do encarregado — fonte de verdade para salários)
create table if not exists registos_admin (
    id             uuid primary key default gen_random_uuid(),
    data           date not null,
    funcionario_id uuid references funcionarios(id) on delete cascade,
    obra_id        uuid references obras(id) on delete set null,
    horas          numeric(5,2) not null check (horas >= 0 and horas <= 24),
    observacoes    text,
    created_at     timestamptz default now(),
    tipo           text default 'presenca' check (tipo in ('presenca', 'falta'))
);

-- UNIDADES DE MEDIDA
create table if not exists unidades_medida (
    id        serial primary key,
    codigo    text not null unique,  -- ex: UN, KG, M, M2
    descricao text not null
);

-- ARTIGOS (inventário)
create table if not exists artigos (
    id                  uuid primary key default gen_random_uuid(),
    descricao           text not null,
    unidade_id          integer not null references unidades_medida(id),
    ativo               boolean default true,
    created_at          timestamp default now(),
    codigo              text,
    tipo_artigo         text,
    taxa_iva            numeric default 23,
    preco_atual         numeric default 0,
    stock_inicial       numeric default 0,
    local_armazenamento text,
    stock_minimo        integer,
    familia             text,
    unidade_compra      text
);

-- HISTÓRICO DE PREÇOS DO ARTIGO (usado por get_inventario_data)
create table if not exists artigo_precos (
    id             uuid primary key default gen_random_uuid(),
    artigo_id      uuid not null references artigos(id) on delete cascade,
    preco_unitario numeric(12,4) not null,
    data_inicio    date not null,
    data_fim       date,
    origem         text not null check (origem in ('compra', 'ajuste', 'inventario')),
    created_at     timestamp default now()
);

-- SINÓNIMOS DE ARTIGOS (texto de fatura -> artigo, aprendido nas correções)
create table if not exists artigo_sinonimos (
    id        uuid primary key default gen_random_uuid(),
    texto     text not null unique,
    artigo_id uuid not null references artigos(id) on delete cascade,
    origem    text not null default 'correcao',
    criado_em timestamptz not null default now()
);

-- ENTRADAS / SAÍDAS / MOVIMENTOS DE INVENTÁRIO (modelo antigo de inventário)
create table if not exists entradas_inventario (
    id             uuid primary key default gen_random_uuid(),
    artigo_id      uuid not null references artigos(id) on delete cascade,
    data           date not null,
    quantidade     numeric(10,2) not null check (quantidade > 0),
    preco_unitario numeric(10,4) not null check (preco_unitario >= 0),
    fornecedor     text,
    documento      text,
    created_at     timestamp default now()
);

create table if not exists saidas_inventario (
    id         uuid primary key default gen_random_uuid(),
    artigo_id  uuid not null references artigos(id) on delete cascade,
    data       date not null,
    quantidade numeric(10,2) not null check (quantidade > 0),
    motivo     text not null check (motivo in ('obra', 'perda', 'ajuste')),
    obra_id    uuid references obras(id),
    created_at timestamp default now()
);

create table if not exists inventario_movimentos (
    id             uuid primary key default gen_random_uuid(),
    artigo_id      uuid not null references artigos(id) on delete cascade,
    data_movimento date not null,
    quantidade     numeric(12,3) not null,
    tipo_movimento text not null check (tipo_movimento in ('ENTRADA', 'SAIDA', 'AJUSTE')),
    motivo         text not null,
    created_at     timestamp default now()
);

-- MOVIMENTOS DE STOCK (inseridos pela app de stock via stock_registar_movimentos)
create table if not exists movimentos_stock (
    id              uuid primary key default gen_random_uuid(),
    artigo_id       uuid references artigos(id) on delete cascade,
    tipo_movimento  text not null,  -- entrada | saida | ajuste_entrada | ajuste_saida
    quantidade      numeric not null,
    preco_unitario  numeric,
    data_movimento  date default current_date,
    observacoes     text,
    created_at      timestamp default now(),
    funcionario_id  uuid references funcionarios(id),
    obra_origem_id  uuid references obras(id),
    obra_destino_id uuid references obras(id),
    sessao_id       text
);

-- FORNECEDORES
create table if not exists fornecedores (
    id         uuid primary key default gen_random_uuid(),
    nif        text unique,
    nome       text,
    created_at timestamp default now(),
    telefone   text,
    email      text,
    iban       text
);

-- CATEGORIAS FINANCEIRAS
create table if not exists categorias_financeiras (
    id         uuid primary key default gen_random_uuid(),
    nome       text not null unique,
    tipo       text not null check (tipo in ('entrada', 'saida')),
    created_at timestamp default now()
);

-- MOVIMENTOS FINANCEIROS (faturas de compra e venda)
create table if not exists movimentos_financeiros (
    id               uuid primary key default gen_random_uuid(),
    referencia       text,
    data_documento   date not null,
    tipo             text not null check (tipo in ('entrada', 'saida')),
    fornecedor_id    uuid references fornecedores(id),
    cliente_nome     text,
    categoria_id     uuid references categorias_financeiras(id),
    obra_id          uuid not null references obras(id),
    valor_base       numeric(12,2) not null,
    iva              numeric(12,2) not null,
    valor_total      numeric(12,2) not null,
    estado_pagamento text not null check (estado_pagamento in ('pago', 'por_pagar')),
    observacoes      text,
    ativo            boolean default true,
    created_at       timestamp default now(),
    fonte            text,  -- origem da importação (ex: SAF-T, TOC Online)
    fonte_id         text
);

-- LINHAS DE FATURA (lidas da fatura, ligadas a artigos)
create table if not exists fatura_linhas (
    id                 uuid primary key default gen_random_uuid(),
    movimento_id       uuid not null references movimentos_financeiros(id) on delete cascade,
    artigo_id          uuid references artigos(id) on delete set null,
    descricao_original text not null,
    quantidade         numeric,
    unidade            text,
    preco_unitario     numeric,
    valor_total        numeric,
    taxa_iva           numeric,
    ordem              integer not null default 0,
    origem             text not null default 'ia',
    criado_em          timestamptz not null default now()
);

-- PREÇOS (histórico de preços por artigo e fornecedor)
create table if not exists precos (
    id              uuid primary key default gen_random_uuid(),
    artigo_id       uuid not null references artigos(id) on delete cascade,
    fornecedor_id   uuid references fornecedores(id) on delete set null,
    preco           numeric not null,
    unidade         text,
    data            date not null,
    validade        date,
    origem          text not null default 'fatura',
    fatura_linha_id uuid references fatura_linhas(id) on delete set null,
    criado_em       timestamptz not null default now()
);

-- SERVIÇOS DA OBRA (orçamento por serviço, horas e custos imputados)
create table if not exists obra_servicos (
    id              uuid primary key default gen_random_uuid(),
    obra_id         uuid not null references obras(id) on delete cascade,
    nome            text not null,
    horas_orcamento numeric(6,1),
    valor_orcamento numeric(10,2),
    concluido       boolean default false,
    extra           boolean default false,
    ordem           integer default 0,
    created_at      timestamptz default now()
);

-- horas de um registo_admin repartidas por serviço
create table if not exists registo_servicos (
    id              uuid primary key default gen_random_uuid(),
    registo_id      uuid not null references registos_admin(id) on delete cascade,
    obra_servico_id uuid not null references obra_servicos(id) on delete cascade,
    horas           numeric(4,1) not null check (horas > 0),
    created_at      timestamptz default now()
);

-- valor de um movimento financeiro repartido por serviço
create table if not exists movimento_servicos (
    id              uuid primary key default gen_random_uuid(),
    movimento_id    uuid not null references movimentos_financeiros(id) on delete cascade,
    obra_servico_id uuid not null references obra_servicos(id) on delete cascade,
    valor           numeric(10,2) not null check (valor > 0),
    created_at      timestamptz default now()
);

-- ORÇAMENTOS
create table if not exists orcamentos (
    id                 uuid primary key default gen_random_uuid(),
    numero             text not null unique,
    data               date not null default current_date,
    validade           date,
    estado             text not null default 'rascunho'
                       check (estado in ('rascunho', 'enviado', 'aceite', 'recusado', 'cancelado')),
    cliente_nome       text not null,
    cliente_nif        text,
    cliente_morada     text,
    cliente_email      text,
    cliente_tel        text,
    obra_id            uuid references obras(id) on delete set null,
    obra_descricao     text,
    prazo_obra         text,
    condicoes_pag      text,
    notas              text,
    taxa_iva           numeric(5,2) not null default 23,
    subtotal_mao_obra  numeric(10,2) default 0,
    subtotal_materiais numeric(10,2) default 0,
    subtotal_outros    numeric(10,2) default 0,
    total_sem_iva      numeric(10,2) default 0,
    total_iva          numeric(10,2) default 0,
    total_com_iva      numeric(10,2) default 0,
    duplicado_de       uuid references orcamentos(id) on delete set null,
    created_at         timestamptz default now(),
    updated_at         timestamptz default now()
);

-- orçamento aceite que criou o serviço da obra (null = criado à mão)
alter table obra_servicos add column if not exists orcamento_id uuid references orcamentos(id) on delete set null;

create table if not exists orcamento_categorias (
    id           uuid primary key default gen_random_uuid(),
    orcamento_id uuid not null references orcamentos(id) on delete cascade,
    nome         text not null,
    ordem        integer not null default 0,
    created_at   timestamptz default now()
);

create table if not exists orcamento_linhas (
    id             uuid primary key default gen_random_uuid(),
    orcamento_id   uuid not null references orcamentos(id) on delete cascade,
    categoria_id   uuid references orcamento_categorias(id) on delete cascade,
    tipo           text not null check (tipo in ('mao_obra', 'material', 'outro')),
    descricao      text,
    unidade        text default 'un',
    n_pessoas      integer default 1,
    quantidade     numeric(10,2) default 1,
    preco_unitario numeric(10,2) default 0,
    ordem          integer default 0,
    created_at     timestamptz default now()
);

-- BIBLIOTECA DE SERVIÇOS (modelos reutilizáveis nos orçamentos)
create table if not exists biblioteca_servicos (
    id            uuid primary key default gen_random_uuid(),
    nome          text not null,
    categoria     text not null,
    unidade       text not null default 'm²',
    rendimento_mo numeric(8,2),
    unidade_mo    text default 'dia',
    observacoes   text,
    ativo         boolean default true,
    ordem         integer default 0,
    created_at    timestamptz default now()
);

create table if not exists biblioteca_materiais (
    id         uuid primary key default gen_random_uuid(),
    servico_id uuid not null references biblioteca_servicos(id) on delete cascade,
    descricao  text not null,
    unidade    text not null,
    quantidade numeric(10,4) not null,
    ordem      integer default 0,
    created_at timestamptz default now()
);

-- REGISTO DO ASSISTENTE IA (pedidos, respostas, tokens e custo)
create table if not exists assistente_registo (
    id             uuid primary key default gen_random_uuid(),
    accao          text not null,
    utilizador     text,
    entrada        jsonb,
    saida          jsonb,
    modelo         text,
    tokens_entrada integer,
    tokens_saida   integer,
    custo_estimado numeric,
    erro           text,
    criado_em      timestamptz not null default now()
);


-- =======================================================
-- ÍNDICES
-- =======================================================
create index if not exists idx_registos_admin_data        on registos_admin(data desc);
create index if not exists idx_registos_admin_funcionario on registos_admin(funcionario_id);

create index if not exists idx_movstock_artigo      on movimentos_stock(artigo_id);
create index if not exists idx_movstock_data        on movimentos_stock(data_movimento desc);
create index if not exists idx_movstock_funcionario on movimentos_stock(funcionario_id);
create index if not exists idx_movstock_sessao      on movimentos_stock(sessao_id);

create index if not exists idx_movimentos_fonte on movimentos_financeiros(fonte, fonte_id)
    where fonte is not null;
-- impede importar a mesma fatura de compra duas vezes
create unique index if not exists unico_saida_qr on movimentos_financeiros(referencia, data_documento, valor_total)
    where tipo = 'saida' and ativo = true;
-- uma fatura ativa por fornecedor e referência (as importações TOC/SAF-T
-- substituem-se a si próprias e ficam de fora)
create unique index if not exists movimentos_financeiros_ref_unica
    on movimentos_financeiros (fornecedor_id, referencia)
    where ativo and fornecedor_id is not null and referencia is not null and referencia <> ''
      and coalesce(fonte, '') not in ('toc_online', 'saft');

create index if not exists idx_fatura_linhas_artigo    on fatura_linhas(artigo_id);
create index if not exists idx_fatura_linhas_movimento on fatura_linhas(movimento_id);
create index if not exists idx_precos_artigo_data      on precos(artigo_id, data desc);

create index if not exists idx_obra_servicos_obra       on obra_servicos(obra_id);
create index if not exists idx_obra_servicos_orcamento  on obra_servicos(orcamento_id);
create index if not exists idx_registo_servicos_reg     on registo_servicos(registo_id);
create index if not exists idx_registo_servicos_serv    on registo_servicos(obra_servico_id);
create index if not exists idx_movimento_servicos_mov   on movimento_servicos(movimento_id);
create index if not exists idx_movimento_servicos_serv  on movimento_servicos(obra_servico_id);

create index if not exists idx_orc_linhas_cat on orcamento_linhas(categoria_id);
create index if not exists idx_orc_linhas_orc on orcamento_linhas(orcamento_id);
create index if not exists idx_bib_mat_servico on biblioteca_materiais(servico_id);

create index if not exists idx_assistente_registo_data on assistente_registo(criado_em desc);


-- =======================================================
-- FUNÇÕES DE APOIO
-- =======================================================

-- numeração dos orçamentos: ORC-AAAA-NNN, recomeça em cada ano
create or replace function public.gerar_numero_orcamento()
returns text
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
    v_ano text := to_char(now() at time zone 'Europe/Lisbon', 'YYYY');
    v_n   int;
begin
    perform pg_advisory_xact_lock(hashtext('gerar_numero_orcamento'));
    select coalesce(max((regexp_match(numero, '^ORC-' || v_ano || '-(\d+)$'))[1]::int), 0) + 1
      into v_n
      from orcamentos;
    return 'ORC-' || v_ano || '-' || lpad(v_n::text, 3, '0');
end;
$function$;
revoke execute on function public.gerar_numero_orcamento() from public, anon;
grant execute on function public.gerar_numero_orcamento() to authenticated;

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

create or replace function public.segundos_para_hhmm(total integer)
returns text
language plpgsql
set search_path to 'public'
as $$
declare
    h int;
    m int;
begin
    if total is null then
        return '00:00';
    end if;

    h := total / 3600;
    m := (total % 3600) / 60;

    return lpad(h::text, 2, '0') || ':' || lpad(m::text, 2, '0');
end;
$$;

create or replace function public.segundos_para_hhmm(total_segundos numeric)
returns text
language plpgsql
set search_path to 'public'
as $$
declare
    horas integer;
    minutos integer;
begin
    if total_segundos is null then
        return null;
    end if;

    horas := floor(total_segundos / 3600);
    minutos := floor((total_segundos % 3600) / 60);

    return lpad(horas::text, 2, '0') || ':' || lpad(minutos::text, 2, '0');
end;
$$;

-- Código automático da obra: <n>/<ano>
create or replace function public.gerar_codigo_obra()
returns text
language plpgsql
set search_path to 'public'
as $$
declare
    ano_atual int := extract(year from now());
    ultimo_numero int;
begin
    select coalesce(
        max(
            case
                when codigo like '%/%'
                then split_part(codigo, '/', 1)::int
                else null
            end
        ),
        0
    )
    into ultimo_numero
    from obras
    where codigo like '%/%'
      and split_part(codigo, '/', 2) = ano_atual::text;

    return (ultimo_numero + 1) || '/' || ano_atual;
end;
$$;

create or replace function public.trg_obras_set_codigo()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
    if new.codigo is null or new.codigo = '' then
        new.codigo := gerar_codigo_obra();
    end if;
    return new;
end;
$$;

drop trigger if exists obras_set_codigo on obras;
create trigger obras_set_codigo
    before insert on obras
    for each row execute function trg_obras_set_codigo();


-- =======================================================
-- FUNÇÕES DA APP DO FUNCIONÁRIO (chamadas como anon, identificadas pelo device_id)
-- =======================================================

create or replace function public.funcionario_por_dispositivo(p_device text)
returns table(id uuid, nome text, ativo boolean, acesso_stock boolean)
language sql
stable security definer
set search_path to 'public'
as $$
    select f.id, f.nome, f.ativo, coalesce(f.acesso_stock, false)
      from funcionarios f
     where p_device is not null
       and btrim(p_device) <> ''
       and f.device_id = p_device;
$$;

create or replace function public.registar_dispositivo(p_nome text, p_device text)
returns table(id uuid, nome text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_candidatos int;
begin
    if p_device is null or btrim(p_device) = '' or p_nome is null or btrim(p_nome) = '' then
        return;
    end if;

    -- Já registado neste dispositivo: devolve o próprio registo
    return query
        select f.id, f.nome from funcionarios f where f.device_id = p_device;
    if found then
        return;
    end if;

    -- Só associa quando o nome identifica uma única pessoa por registar
    select count(*) into v_candidatos
      from funcionarios f
     where f.device_id is null
       and f.ativo
       and lower(btrim(f.nome)) = lower(btrim(p_nome));

    if v_candidatos <> 1 then
        return;
    end if;

    return query
    update funcionarios f
       set device_id = p_device
     where f.device_id is null
       and f.ativo
       and lower(btrim(f.nome)) = lower(btrim(p_nome))
    returning f.id, f.nome;
end;
$$;

create or replace function public.ponto_marcar(p_device text, p_obra_id uuid, p_lat double precision, p_lon double precision)
returns table(tipo text, datahora timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_func   uuid;
    v_obra   record;
    v_dist   double precision;
    v_raio   int;
    v_ultimo text;
    v_tipo   text;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;

    select o.id, o.latitude, o.longitude, o.raio, o.estado into v_obra
      from obras o where o.id = p_obra_id;
    if v_obra.id is null or v_obra.estado <> 'ativa' then
        raise exception 'obra_invalida' using errcode = '22023';
    end if;

    if p_lat is null or p_lon is null then
        raise exception 'sem_localizacao' using errcode = '22023';
    end if;

    -- Distância em metros (haversine), calculada no servidor
    if v_obra.latitude is not null and v_obra.longitude is not null then
        v_raio := coalesce(v_obra.raio, 120);
        v_dist := 6371000 * 2 * asin(sqrt(
            power(sin(radians(p_lat - v_obra.latitude) / 2), 2) +
            cos(radians(v_obra.latitude)) * cos(radians(p_lat)) *
            power(sin(radians(p_lon - v_obra.longitude) / 2), 2)
        ));
        if v_dist > v_raio then
            raise exception 'Fora do perímetro da obra: % m (máximo % m)',
                round(v_dist::numeric), v_raio using errcode = '22023';
        end if;
    end if;

    -- Alterna entre entrada e saída consoante a última marcação
    select p.tipo into v_ultimo
      from ponto p where p.funcionario_id = v_func
     order by p.datahora desc limit 1;

    v_tipo := case when v_ultimo = 'entrada' then 'saida' else 'entrada' end;

    insert into ponto (funcionario_id, obra_id, datahora, latitude, longitude, tipo)
    values (v_func, p_obra_id, now(), p_lat, p_lon, v_tipo);

    return query select v_tipo, now();
end;
$$;

create or replace function public.ponto_historico(p_device text, p_desde timestamptz)
returns table(id uuid, datahora timestamptz, tipo text)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
    v_func uuid;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;

    return query
    select p.id, p.datahora, p.tipo
      from ponto p
     where p.funcionario_id = v_func
       and p.datahora >= coalesce(p_desde, now() - interval '7 days')
     order by p.datahora desc
     limit 12;
end;
$$;

create or replace function public.stock_artigo_por_codigo(p_device text, p_codigo text)
returns table(id uuid, codigo text, descricao text, tipo_artigo text, local_armazenamento text, stock_atual numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
    v_func uuid;
begin
    select f.id into v_func
      from funcionarios f
     where f.device_id = p_device and f.ativo and coalesce(f.acesso_stock, false);

    if v_func is null then
        raise exception 'sem_permissao' using errcode = '42501';
    end if;

    return query
    select a.id, a.codigo, a.descricao, a.tipo_artigo, a.local_armazenamento,
           coalesce(a.stock_inicial, 0) + coalesce((
               select sum(case when m.tipo_movimento in ('entrada','ajuste_entrada')
                               then m.quantidade else -m.quantidade end)
                 from movimentos_stock m where m.artigo_id = a.id), 0) as stock_atual
      from artigos a
     where a.codigo = p_codigo and a.ativo;
end;
$$;

create or replace function public.stock_registar_movimentos(p_device text, p_movimentos jsonb, p_local text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_func   uuid;
    v_item   jsonb;
    v_total  int := 0;
    v_artigos uuid[] := '{}';
    v_artigo  record;
    v_qtd     numeric;
    v_disp    numeric;
begin
    select f.id into v_func
      from funcionarios f
     where f.device_id = p_device and f.ativo and coalesce(f.acesso_stock, false);

    if v_func is null then
        raise exception 'sem_permissao' using errcode = '42501';
    end if;

    if jsonb_typeof(p_movimentos) <> 'array' or jsonb_array_length(p_movimentos) = 0 then
        raise exception 'sem_movimentos' using errcode = '22023';
    end if;
    if jsonb_array_length(p_movimentos) > 200 then
        raise exception 'demasiados_movimentos' using errcode = '22023';
    end if;

    for v_item in select * from jsonb_array_elements(p_movimentos) loop
        if (v_item->>'tipo_movimento') not in ('entrada','saida','ajuste_entrada','ajuste_saida') then
            raise exception 'tipo_invalido' using errcode = '22023';
        end if;
        if coalesce((v_item->>'quantidade')::numeric, 0) <= 0 then
            raise exception 'quantidade_invalida' using errcode = '22023';
        end if;
        -- Bloqueia a linha do artigo até ao fim da transação, para que duas
        -- saídas em simultâneo não possam ambas passar na validação.
        select a.id, a.descricao, a.tipo_artigo, coalesce(a.stock_inicial, 0) as stock_inicial
          into v_artigo
          from artigos a
         where a.id = (v_item->>'artigo_id')::uuid and a.ativo
           for update;

        if v_artigo.id is null then
            raise exception 'artigo_invalido' using errcode = '22023';
        end if;

        v_qtd := (v_item->>'quantidade')::numeric;

        -- Só consumíveis e mercadorias têm stock. Ferramentas e equipamentos
        -- usam movimentos de "saida" apenas para mudar de local.
        if v_artigo.tipo_artigo in ('consumivel','mercadoria')
           and (v_item->>'tipo_movimento') in ('saida','ajuste_saida') then

            select v_artigo.stock_inicial + coalesce(sum(
                       case when m.tipo_movimento in ('entrada','ajuste_entrada')
                            then m.quantidade else -m.quantidade end), 0)
              into v_disp
              from movimentos_stock m
             where m.artigo_id = v_artigo.id;

            if v_qtd > v_disp then
                raise exception 'Stock insuficiente de % — disponível %, pedido %',
                    v_artigo.descricao, v_disp, v_qtd
                    using errcode = '22023';
            end if;
        end if;

        insert into movimentos_stock (
            artigo_id, tipo_movimento, quantidade, data_movimento,
            funcionario_id, obra_origem_id, obra_destino_id, observacoes, sessao_id)
        values (
            (v_item->>'artigo_id')::uuid,
            v_item->>'tipo_movimento',
            (v_item->>'quantidade')::numeric,
            coalesce((v_item->>'data_movimento')::date, current_date),
            v_func,                                   -- nunca o que vem do browser
            nullif(v_item->>'obra_origem_id','')::uuid,
            nullif(v_item->>'obra_destino_id','')::uuid,
            left(coalesce(v_item->>'observacoes',''), 300),
            left(coalesce(v_item->>'sessao_id',''), 100)
        );

        v_artigos := v_artigos || (v_item->>'artigo_id')::uuid;
        v_total := v_total + 1;
    end loop;

    if p_local is not null and btrim(p_local) <> '' then
        update artigos set local_armazenamento = left(btrim(p_local), 120)
         where id = any(v_artigos);
    end if;

    return v_total;
end;
$$;


-- =======================================================
-- VISTAS (security_invoker: aplicam o RLS de quem consulta)
-- =======================================================

-- Pares entrada/saída por funcionário, obra e dia (usada pelo painel admin)
create or replace view vw_registos_ponto with (security_invoker = on) as
with base as (
    select p.id,
           p.funcionario_id,
           f.nome as funcionario,
           o.nome as obra,
           date(p.created_at) as dia,
           p.created_at,
           p.tipo
      from ponto p
      left join funcionarios f on f.id = p.funcionario_id
      left join obras o on o.id = p.obra_id
), entradas as (
    select base.id, base.funcionario, base.obra, base.dia,
           base.created_at as entrada,
           row_number() over (partition by base.funcionario, base.obra, base.dia order by base.created_at) as rn
      from base
     where base.tipo = 'entrada'
), saidas as (
    select base.id, base.funcionario, base.obra, base.dia,
           base.created_at as saida,
           row_number() over (partition by base.funcionario, base.obra, base.dia order by base.created_at) as rn
      from base
     where base.tipo = 'saida'
), pares as (
    select e.id as entrada_id,
           s.id as saida_id,
           e.funcionario, e.obra, e.dia, e.entrada, s.saida,
           extract(epoch from s.saida - e.entrada) as segundos
      from entradas e
      left join saidas s
        on e.funcionario = s.funcionario and e.obra = s.obra and e.dia = s.dia and e.rn = s.rn
)
select funcionario,
       obra,
       dia,
       min(entrada) as entrada,
       max(saida) as saida,
       max(entrada_id::text)::uuid as entrada_id,
       max(saida_id::text)::uuid as saida_id,
       sum(segundos) as total_segundos,
       case when count(saida) < count(entrada) then 'Incompleto' else 'OK' end as estado,
       segundos_para_hhmm(sum(segundos)) as horas
  from pares
 group by funcionario, obra, dia
 order by dia desc;

create or replace view vw_horas_detalhadas with (security_invoker = on) as
select p.id,
       f.nome as funcionario,
       f.codigo as funcionario_codigo,
       o.nome as obra,
       o.codigo as obra_codigo,
       p.datahora as marcacao,
       p.tipo,
       p.latitude,
       p.longitude,
       p.created_at
  from ponto p
  left join funcionarios f on f.id = p.funcionario_id
  left join obras o on o.id = p.obra_id
 order by p.datahora;

create or replace view vw_horas_por_dia with (security_invoker = on) as
select f.nome as funcionario,
       o.nome as obra,
       date(p.datahora) as dia,
       segundos_para_hhmm(sum(
           case
               when p.tipo = 'saida' then extract(epoch from p.datahora)
               when p.tipo = 'entrada' then - extract(epoch from p.datahora)
               else null::numeric
           end)) as horas
  from ponto p
  left join funcionarios f on f.id = p.funcionario_id
  left join obras o on o.id = p.obra_id
 group by f.nome, o.nome, (date(p.datahora))
 order by (date(p.datahora)) desc, f.nome;

create or replace view vw_horas_semanais with (security_invoker = on) as
select f.nome as funcionario,
       o.nome as obra,
       extract(isoyear from p.datahora) as ano,
       extract(week from p.datahora) as semana,
       segundos_para_hhmm(sum(
           case
               when p.tipo = 'saida' then extract(epoch from p.datahora)
               when p.tipo = 'entrada' then - extract(epoch from p.datahora)
               else null::numeric
           end)) as horas
  from ponto p
  left join funcionarios f on f.id = p.funcionario_id
  left join obras o on o.id = p.obra_id
 group by f.nome, o.nome, (extract(isoyear from p.datahora)), (extract(week from p.datahora))
 order by (extract(isoyear from p.datahora)) desc, (extract(week from p.datahora)) desc;

create or replace view vw_horas_mensais with (security_invoker = on) as
select f.nome as funcionario,
       o.nome as obra,
       extract(year from p.datahora) as ano,
       extract(month from p.datahora) as mes,
       segundos_para_hhmm(sum(
           case
               when p.tipo = 'saida' then extract(epoch from p.datahora)
               when p.tipo = 'entrada' then - extract(epoch from p.datahora)
               else null::numeric
           end)) as horas
  from ponto p
  left join funcionarios f on f.id = p.funcionario_id
  left join obras o on o.id = p.obra_id
 group by f.nome, o.nome, (extract(year from p.datahora)), (extract(month from p.datahora))
 order by (extract(year from p.datahora)) desc, (extract(month from p.datahora)) desc;

create or replace view vw_horas_anuais with (security_invoker = on) as
select f.nome as funcionario,
       extract(year from p.datahora) as ano,
       segundos_para_hhmm(sum(
           case
               when p.tipo = 'saida' then extract(epoch from p.datahora)
               when p.tipo = 'entrada' then - extract(epoch from p.datahora)
               else null::numeric
           end)) as horas
  from ponto p
  left join funcionarios f on f.id = p.funcionario_id
 group by f.nome, (extract(year from p.datahora))
 order by (extract(year from p.datahora)) desc, f.nome;

create or replace view vw_horas_incompletas with (security_invoker = on) as
with reg as (
    select p.id, p.funcionario_id, p.obra_id, p.datahora, p.latitude, p.longitude, p.created_at, p.tipo,
           lead(p.tipo) over (partition by p.funcionario_id, p.obra_id, (date(p.datahora)) order by p.datahora) as prox_tipo
      from ponto p
)
select funcionario_id,
       obra_id,
       datahora,
       tipo,
       case
           when tipo = 'entrada' and prox_tipo <> 'saida' then 'Entrada sem saída'
           when tipo = 'saida' and prox_tipo <> 'entrada' then 'Saída sem entrada'
           else null::text
       end as erro
  from reg r
 where tipo = 'entrada' and prox_tipo <> 'saida'
    or tipo = 'saida' and prox_tipo <> 'entrada'
 order by datahora desc;

create or replace view vw_kpis_financeiros_mes with (security_invoker = on) as
select count(distinct funcionario) as total_funcionarios,
       segundos_para_hhmm(sum(total_segundos)) as total_horas_mes,
       count(distinct dia) as total_dias_trabalhados,
       count(distinct dia) filter (where total_segundos < 28800::numeric and estado = 'OK') as total_dias_nao_completos,
       sum(total_segundos / 3600.0 * coalesce((
           select f.valor_dia from funcionarios f
            where f.nome = vw_registos_ponto.funcionario
            limit 1), 0::numeric)) as total_a_pagar
  from vw_registos_ponto
 where date_trunc('month', dia::timestamptz) = date_trunc('month', now());

create or replace view vw_dashboard_mes_atual with (security_invoker = on) as
select funcionario,
       sum(total_segundos) / 3600.0 as horas_trabalhadas,
       count(distinct dia) as dias_trabalhados,
       count(distinct dia) filter (where total_segundos < 28800::numeric and estado = 'OK') as dias_nao_completos,
       sum(total_segundos) / 3600.0 * coalesce((
           select f.valor_dia from funcionarios f
            where f.nome = vw_registos_ponto.funcionario
            limit 1), 0::numeric) as valor_a_receber
  from vw_registos_ponto
 where date_trunc('month', dia::timestamptz) = date_trunc('month', now())
 group by funcionario;

create or replace view vw_stock_atual with (security_invoker = on) as
select a.id,
       a.codigo,
       a.descricao,
       a.tipo_artigo,
       a.preco_atual,
       a.local_armazenamento,
       coalesce(sum(
           case
               when m.tipo_movimento = any (array['ENTRADA', 'INVENTARIO_INICIAL', 'AJUSTE']) then m.quantidade
               when m.tipo_movimento = 'SAIDA' then - m.quantidade
               else null::numeric
           end), 0::numeric) as quantidade
  from artigos a
  left join movimentos_stock m on m.artigo_id = a.id
 group by a.id, a.codigo, a.descricao, a.tipo_artigo, a.preco_atual, a.local_armazenamento;

create or replace view vw_stock_por_data with (security_invoker = on) as
select a.id as artigo_id,
       a.descricao,
       u.codigo as unidade,
       sum(
           case
               when m.tipo_movimento = 'ENTRADA' then m.quantidade
               when m.tipo_movimento = 'AJUSTE' then m.quantidade
               else - m.quantidade
           end) as quantidade
  from artigos a
  join unidades_medida u on u.id = a.unidade_id
  left join inventario_movimentos m on m.artigo_id = a.id
 group by a.id, a.descricao, u.codigo;

create or replace view vw_movimentos_financeiros with (security_invoker = on) as
select m.id,
       m.referencia,
       m.data_documento,
       m.tipo,
       f.nome as fornecedor,
       c.nome as categoria,
       o.nome as obra,
       m.valor_base,
       m.iva,
       m.valor_total,
       m.estado_pagamento,
       m.observacoes
  from movimentos_financeiros m
  left join fornecedores f on f.id = m.fornecedor_id
  left join categorias_financeiras c on c.id = m.categoria_id
  left join obras o on o.id = m.obra_id
 where m.ativo = true
 order by m.data_documento desc;

create or replace view vw_fluxo_mes with (security_invoker = on) as
select date_trunc('month', data_documento::timestamptz) as mes,
       sum(case when tipo = 'entrada' then valor_total else 0::numeric end) as total_entradas,
       sum(case when tipo = 'saida' then valor_total else 0::numeric end) as total_saidas,
       sum(case when tipo = 'entrada' then valor_total else - valor_total end) as saldo
  from movimentos_financeiros
 where ativo = true
 group by (date_trunc('month', data_documento::timestamptz))
 order by (date_trunc('month', data_documento::timestamptz)) desc;


-- =======================================================
-- FUNÇÕES DO PAINEL ADMIN (dependem das vistas acima)
-- =======================================================

create or replace function public.get_dashboard_mes(p_mes date)
returns table(funcionario text, horas_trabalhadas text, dias_trabalhados integer, dias_nao_completos integer, valor_a_receber numeric)
language sql
security definer
set search_path to 'public'
as $$
with dias as (
    -- horas por funcionário e dia (base)
    select
        f.id as funcionario_id,
        f.nome as funcionario,
        date(p.dia) as dia,
        sum(p.total_segundos) as total_segundos
    from vw_registos_ponto p
    join funcionarios f on f.nome = p.funcionario
    where
        p.dia >= date_trunc('month', p_mes)
        and p.dia < date_trunc('month', p_mes) + interval '1 month'
    group by f.id, f.nome, date(p.dia)
),

dias_com_pagamento as (
    select
        d.funcionario_id,
        d.funcionario,
        d.dia,
        d.total_segundos,
        coalesce(pd.fator, 1.0) as fator
    from dias d
    left join pagamento_dia pd
        on pd.funcionario_id = d.funcionario_id
       and pd.dia = d.dia
),

resumo as (
    select
        funcionario,
        sum(total_segundos) as total_segundos,
        count(*) as dias_trabalhados,
        count(*) filter (where fator < 1.0) as dias_nao_completos,
        sum(fator) as dias_pagos
    from dias_com_pagamento
    group by funcionario
)

select
    r.funcionario,

    -- conversão de segundos para HH:MM
    to_char(
        make_interval(secs => r.total_segundos),
        'HH24:MI'
    ) as horas_trabalhadas,

    r.dias_trabalhados,
    r.dias_nao_completos,

    -- valor a pagar (dias pagos * valor_dia)
    round(
        r.dias_pagos * f.valor_dia,
        2
    ) as valor_a_receber

from resumo r
join funcionarios f on f.nome = r.funcionario
order by r.funcionario;
$$;

create or replace function public.get_metrica_admin()
returns table(horas_hoje text, horas_semana text, horas_mes text)
language sql
set search_path to 'public'
as $$
    select
        coalesce(
            (select segundos_para_hhmm(sum(total_segundos))
             from vw_registos_ponto
             where dia = current_date),
            '00:00'
        ) as horas_hoje,

        coalesce(
            (select segundos_para_hhmm(sum(total_segundos))
             from vw_registos_ponto
             where dia >= current_date - interval '6 days'),
            '00:00'
        ) as horas_semana,

        coalesce(
            (select segundos_para_hhmm(sum(total_segundos))
             from vw_registos_ponto
             where date_trunc('month', dia) = date_trunc('month', current_date)),
            '00:00'
        ) as horas_mes;
$$;

create or replace function public.get_inventario_data(p_data date)
returns table(descricao text, quantidade numeric, medida text, preco_unitario numeric, total numeric)
language sql
set search_path to 'public'
as $$
    select
        a.descricao,
        coalesce(sum(
            case
                when m.tipo_movimento in ('ENTRADA','INVENTARIO_INICIAL','AJUSTE') then m.quantidade
                when m.tipo_movimento = 'SAIDA' then -m.quantidade
            end
        ),0) as quantidade,
        u.codigo as medida,
        (
            select ap.preco_unitario
            from artigo_precos ap
            where ap.artigo_id = a.id
            and ap.data_inicio <= p_data
            order by ap.data_inicio desc
            limit 1
        ) as preco_unitario,
        coalesce(sum(
            case
                when m.tipo_movimento in ('ENTRADA','INVENTARIO_INICIAL','AJUSTE') then m.quantidade
                when m.tipo_movimento = 'SAIDA' then -m.quantidade
            end
        ),0)
        *
        (
            select ap.preco_unitario
            from artigo_precos ap
            where ap.artigo_id = a.id
            and ap.data_inicio <= p_data
            order by ap.data_inicio desc
            limit 1
        ) as total
    from artigos a
    left join movimentos_stock m
        on m.artigo_id = a.id
        and m.data_movimento <= p_data
    left join unidades_medida u on u.id = a.unidade_id
    group by a.id, u.codigo;
$$;

create or replace function public.horas_totais_dia(p_data date)
returns text
language sql
set search_path to 'public'
as $$
    select segundos_para_hhmm(
        sum(
            case
                when tipo = 'saida' then extract(epoch from datahora)
                when tipo = 'entrada' then -extract(epoch from datahora)
            end
        )
    )
    from ponto
    where date(datahora) = p_data;
$$;

create or replace function public.horas_totais_semana()
returns text
language sql
set search_path to 'public'
as $$
    select segundos_para_hhmm(
        sum(
            case
                when tipo = 'saida' then extract(epoch from datahora)
                when tipo = 'entrada' then -extract(epoch from datahora)
            end
        )
    )
    from ponto
    where extract(week from datahora) = extract(week from now())
      and extract(isoyear from datahora) = extract(isoyear from now());
$$;

create or replace function public.horas_totais_mes()
returns text
language sql
set search_path to 'public'
as $$
    select segundos_para_hhmm(
        sum(
            case
                when tipo = 'saida' then extract(epoch from datahora)
                when tipo = 'entrada' then -extract(epoch from datahora)
            end
        )
    )
    from ponto
    where extract(month from datahora) = extract(month from now())
      and extract(year from datahora) = extract(year from now());
$$;


-- =======================================================
-- RLS
-- Regra geral: só administradores (is_admin()) leem e escrevem.
-- A app do funcionário (anon) passa pelas funções security definer acima.
-- =======================================================
alter table admins                 enable row level security;
alter table funcionarios           enable row level security;
alter table obras                  enable row level security;
alter table ponto                  enable row level security;
alter table pagamento_dia          enable row level security;
alter table registos_admin         enable row level security;
alter table unidades_medida        enable row level security;
alter table artigos                enable row level security;
alter table artigo_precos          enable row level security;
alter table artigo_sinonimos       enable row level security;
alter table entradas_inventario    enable row level security;
alter table saidas_inventario      enable row level security;
alter table inventario_movimentos  enable row level security;
alter table movimentos_stock       enable row level security;
alter table fornecedores           enable row level security;
alter table categorias_financeiras enable row level security;
alter table movimentos_financeiros enable row level security;
alter table fatura_linhas          enable row level security;
alter table precos                 enable row level security;
alter table obra_servicos          enable row level security;
alter table registo_servicos       enable row level security;
alter table movimento_servicos     enable row level security;
alter table orcamentos             enable row level security;
alter table orcamento_categorias   enable row level security;
alter table orcamento_linhas       enable row level security;
alter table biblioteca_servicos    enable row level security;
alter table biblioteca_materiais   enable row level security;
alter table assistente_registo     enable row level security;

-- Tabelas só de admin (uma policy "for all")
do $$
declare
    p record;
begin
    for p in select * from (values
        ('artigo_precos',          'artigo_precos: só admin'),
        ('artigo_sinonimos',       'artigo_sinonimos: admin gere tudo'),
        ('artigos',                'artigos: só admin'),
        ('assistente_registo',     'assistente_registo: admin gere tudo'),
        ('biblioteca_materiais',   'biblioteca_materiais: admin gere tudo'),
        ('biblioteca_servicos',    'biblioteca_servicos: admin gere tudo'),
        ('categorias_financeiras', 'categorias_fin: admin gere, auth lê'),
        ('entradas_inventario',    'entradas_inv: só admin'),
        ('fatura_linhas',          'fatura_linhas: admin gere tudo'),
        ('fornecedores',           'fornecedores: só admin'),
        ('funcionarios',           'funcionarios: admin gere tudo'),
        ('inventario_movimentos',  'inv_mov: só admin'),
        ('movimento_servicos',     'movimento_servicos: admin gere tudo'),
        ('movimentos_financeiros', 'mov_fin: só admin'),
        ('movimentos_stock',       'mov_stock: só admin'),
        ('obra_servicos',          'obra_servicos: admin gere tudo'),
        ('obras',                  'obras: admin gere tudo'),
        ('orcamento_categorias',   'orcamento_categorias: admin gere tudo'),
        ('orcamento_linhas',       'orcamento_linhas: admin gere tudo'),
        ('orcamentos',             'orcamentos: admin gere tudo'),
        ('pagamento_dia',          'pagamento_dia: só admin'),
        ('ponto',                  'ponto: admin gere tudo'),
        ('precos',                 'precos: admin gere tudo'),
        ('registo_servicos',       'registo_servicos: admin gere tudo'),
        ('saidas_inventario',      'saidas_inv: só admin'),
        ('unidades_medida',        'unidades: admin gere')
    ) as t(tabela, nome)
    loop
        execute format('drop policy if exists %I on %I', p.nome, p.tabela);
        execute format(
            'create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())',
            p.nome, p.tabela);
    end loop;
end;
$$;

-- admins: só admin lê (sem escrita pela API)
drop policy if exists "admins: admin lê" on admins;
create policy "admins: admin lê" on admins
    for select to authenticated using (is_admin());

-- leituras abertas a qualquer utilizador autenticado
drop policy if exists "categorias_fin: auth lê (forms)" on categorias_financeiras;
create policy "categorias_fin: auth lê (forms)" on categorias_financeiras
    for select to authenticated using (true);

drop policy if exists "unidades: authenticated lê" on unidades_medida;
create policy "unidades: authenticated lê" on unidades_medida
    for select to authenticated using (true);

-- obras: anon lê (validação do QR na app do funcionário)
drop policy if exists "obras: anon lê (validação QR)" on obras;
create policy "obras: anon lê (validação QR)" on obras
    for select to anon using (true);

-- ponto: policies anon antigas (sem efeito: anon não tem grant em ponto,
-- a marcação passa por ponto_marcar / ponto_historico)
drop policy if exists "ponto: anon insere (marcação)" on ponto;
create policy "ponto: anon insere (marcação)" on ponto
    for insert to anon with check (true);

drop policy if exists "ponto: anon lê os seus" on ponto;
create policy "ponto: anon lê os seus" on ponto
    for select to anon
    using (funcionario_id in (
        select funcionarios.id
          from funcionarios
         where funcionarios.device_id = (
             select funcionarios_1.device_id
               from funcionarios funcionarios_1
              where funcionarios_1.id = ponto.funcionario_id
              limit 1)));

-- registos_admin: qualquer utilizador autenticado (policies por operação)
drop policy if exists "registos_admin: só autenticados" on registos_admin;
drop policy if exists "registos_admin: select" on registos_admin;
drop policy if exists "registos_admin: insert" on registos_admin;
drop policy if exists "registos_admin: update" on registos_admin;
drop policy if exists "registos_admin: delete" on registos_admin;
create policy "registos_admin: select" on registos_admin for select to authenticated using (true);
create policy "registos_admin: insert" on registos_admin for insert to authenticated with check (true);
create policy "registos_admin: update" on registos_admin for update to authenticated using (true);
create policy "registos_admin: delete" on registos_admin for delete to authenticated using (true);


-- =======================================================
-- PERMISSÕES
-- O Supabase dá todas as permissões a anon e authenticated por omissão;
-- em produção foram retiradas ao anon nestes objetos.
-- =======================================================
revoke all on ponto, funcionarios, obra_servicos, registo_servicos, movimento_servicos,
              orcamentos, orcamento_categorias, orcamento_linhas,
              biblioteca_servicos, biblioteca_materiais,
              fatura_linhas, artigo_sinonimos, precos, assistente_registo
    from anon;

revoke all on vw_registos_ponto, vw_horas_detalhadas, vw_horas_por_dia, vw_horas_semanais,
              vw_horas_mensais, vw_horas_anuais, vw_horas_incompletas,
              vw_kpis_financeiros_mes, vw_dashboard_mes_atual,
              vw_stock_atual, vw_stock_por_data, vw_movimentos_financeiros, vw_fluxo_mes
    from anon;

-- Funções só para utilizadores autenticados
revoke execute on function public.is_admin()                   from public, anon;
revoke execute on function public.get_dashboard_mes(date)      from public, anon;
revoke execute on function public.get_inventario_data(date)    from public, anon;
revoke execute on function public.get_metrica_admin()          from public, anon;
-- Funções da app do funcionário: anon pode executar, mas não "public"
revoke execute on function public.funcionario_por_dispositivo(text)                  from public;
revoke execute on function public.registar_dispositivo(text, text)                   from public;
revoke execute on function public.ponto_marcar(text, uuid, double precision, double precision) from public;
revoke execute on function public.ponto_historico(text, timestamptz)                 from public;
revoke execute on function public.stock_artigo_por_codigo(text, text)                from public;
revoke execute on function public.stock_registar_movimentos(text, jsonb, text)       from public;
revoke execute on function public.horas_totais_dia(date)                             from public;
revoke execute on function public.horas_totais_semana()                              from public;
revoke execute on function public.horas_totais_mes()                                 from public;


-- =======================================================
-- vw_carga_diaria (horas planeadas por funcionário e dia)
-- Depende de tarefas.sql: só é criada se a tabela tarefas já existir.
-- =======================================================
do $$
begin
    if to_regclass('public.tarefas') is not null
       and to_regclass('public.tarefa_funcionarios') is not null then
        execute $v$
            create or replace view vw_carga_diaria with (security_invoker = on) as
            select tf.funcionario_id,
                   t.data_prevista,
                   count(*) as n_tarefas,
                   sum(t.duracao_horas) as horas_planeadas
              from tarefas t
              join tarefa_funcionarios tf on tf.tarefa_id = t.id
             where t.estado <> 'cancelada'
             group by tf.funcionario_id, t.data_prevista
        $v$;
        revoke all on vw_carga_diaria from anon;
    end if;
end;
$$;
