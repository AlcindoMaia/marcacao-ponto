-- =====================================================================
-- Esquema da base de dados (Supabase npyosbigynxmxdakcymg)
-- Gerado a partir da PRODUÇÃO a 2026-11-09, por consulta ao catálogo do
-- Postgres. Substitui a versão de 12/10, que tinha 28 das tabelas.
-- Serve de referência e de caminho de recuperação; não é para correr por
-- cima de uma base de dados que já existe.
-- Ficheiros *.sql soltos na raiz = as migrações que trouxeram cada parte.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tabelas (colunas, chaves e restrições) e RLS
-- ---------------------------------------------------------------------

create table if not exists public.admins (
    id uuid default gen_random_uuid() not null,
    device_id text,
    nome text,
    created_at timestamp without time zone default now(),
    email text,
    constraint admins_pkey PRIMARY KEY (id),
    constraint admins_device_id_key UNIQUE (device_id),
    constraint admins_email_key UNIQUE (email)
);
alter table public.admins enable row level security;

create table if not exists public.artigo_precos (
    id uuid default gen_random_uuid() not null,
    artigo_id uuid not null,
    preco_unitario numeric(12,4) not null,
    data_inicio date not null,
    data_fim date,
    origem text not null,
    created_at timestamp without time zone default now(),
    constraint artigo_precos_pkey PRIMARY KEY (id),
    constraint artigo_precos_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES artigos(id) ON DELETE CASCADE,
    constraint artigo_precos_origem_check CHECK ((origem = ANY (ARRAY['compra'::text, 'ajuste'::text, 'inventario'::text])))
);
alter table public.artigo_precos enable row level security;

create table if not exists public.artigo_sinonimos (
    id uuid default gen_random_uuid() not null,
    texto text not null,
    artigo_id uuid not null,
    origem text default 'correcao'::text not null,
    criado_em timestamp with time zone default now() not null,
    constraint artigo_sinonimos_pkey PRIMARY KEY (id),
    constraint artigo_sinonimos_texto_key UNIQUE (texto),
    constraint artigo_sinonimos_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES artigos(id) ON DELETE CASCADE
);
alter table public.artigo_sinonimos enable row level security;

create table if not exists public.artigos (
    id uuid default gen_random_uuid() not null,
    descricao text not null,
    unidade_id integer not null,
    ativo boolean default true,
    created_at timestamp without time zone default now(),
    codigo text,
    tipo_artigo text,
    taxa_iva numeric default 23,
    preco_atual numeric default 0,
    stock_inicial numeric default 0,
    local_armazenamento text,
    stock_minimo integer,
    familia text,
    unidade_compra text,
    constraint artigos_pkey PRIMARY KEY (id),
    constraint artigos_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES unidades_medida(id)
);
alter table public.artigos enable row level security;

create table if not exists public.assistente_registo (
    id uuid default gen_random_uuid() not null,
    accao text not null,
    utilizador text,
    entrada jsonb,
    saida jsonb,
    modelo text,
    tokens_entrada integer,
    tokens_saida integer,
    custo_estimado numeric,
    erro text,
    criado_em timestamp with time zone default now() not null,
    constraint assistente_registo_pkey PRIMARY KEY (id)
);
alter table public.assistente_registo enable row level security;

create table if not exists public.auto_linhas (
    id uuid default gen_random_uuid() not null,
    auto_id uuid not null,
    obra_servico_id uuid not null,
    percentagem numeric(5,2) not null,
    valor numeric(12,2) default 0 not null,
    constraint auto_linhas_pkey PRIMARY KEY (id),
    constraint auto_linhas_auto_id_obra_servico_id_key UNIQUE (auto_id, obra_servico_id),
    constraint auto_linhas_auto_id_fkey FOREIGN KEY (auto_id) REFERENCES autos_medicao(id) ON DELETE CASCADE,
    constraint auto_linhas_obra_servico_id_fkey FOREIGN KEY (obra_servico_id) REFERENCES obra_servicos(id) ON DELETE CASCADE,
    constraint auto_linhas_percentagem_check CHECK (((percentagem >= (0)::numeric) AND (percentagem <= (100)::numeric)))
);
alter table public.auto_linhas enable row level security;

create table if not exists public.autos_medicao (
    id uuid default gen_random_uuid() not null,
    obra_id uuid not null,
    numero integer not null,
    data date default CURRENT_DATE not null,
    estado text default 'rascunho'::text not null,
    taxa_iva numeric(5,2) default 23 not null,
    notas text,
    created_at timestamp with time zone default now(),
    constraint autos_medicao_pkey PRIMARY KEY (id),
    constraint autos_medicao_obra_id_numero_key UNIQUE (obra_id, numero),
    constraint autos_medicao_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
    constraint autos_medicao_estado_check CHECK ((estado = ANY (ARRAY['rascunho'::text, 'enviado'::text, 'faturado'::text])))
);
alter table public.autos_medicao enable row level security;

create table if not exists public.biblioteca_materiais (
    id uuid default gen_random_uuid() not null,
    servico_id uuid not null,
    descricao text not null,
    unidade text not null,
    quantidade numeric(10,4) not null,
    ordem integer default 0,
    created_at timestamp with time zone default now(),
    constraint biblioteca_materiais_pkey PRIMARY KEY (id),
    constraint biblioteca_materiais_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES biblioteca_servicos(id) ON DELETE CASCADE
);
alter table public.biblioteca_materiais enable row level security;

create table if not exists public.biblioteca_servicos (
    id uuid default gen_random_uuid() not null,
    nome text not null,
    categoria text not null,
    unidade text default 'm²'::text not null,
    rendimento_mo numeric(8,2),
    unidade_mo text default 'dia'::text,
    observacoes text,
    ativo boolean default true,
    ordem integer default 0,
    created_at timestamp with time zone default now(),
    constraint biblioteca_servicos_pkey PRIMARY KEY (id)
);
alter table public.biblioteca_servicos enable row level security;

create table if not exists public.categorias_financeiras (
    id uuid default gen_random_uuid() not null,
    nome text not null,
    tipo text not null,
    created_at timestamp without time zone default now(),
    constraint categorias_financeiras_pkey PRIMARY KEY (id),
    constraint categorias_financeiras_nome_key UNIQUE (nome),
    constraint categorias_financeiras_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text])))
);
alter table public.categorias_financeiras enable row level security;

create table if not exists public.cliente_pedidos (
    id uuid default gen_random_uuid() not null,
    cliente_id uuid not null,
    obra_id uuid,
    tipo text not null,
    mensagem text not null,
    estado text default 'novo'::text not null,
    resposta text,
    respondido_em timestamp with time zone,
    ip text,
    created_at timestamp with time zone default now() not null,
    constraint cliente_pedidos_pkey PRIMARY KEY (id),
    constraint cliente_pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    constraint cliente_pedidos_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    constraint cliente_pedidos_estado_check CHECK ((estado = ANY (ARRAY['novo'::text, 'respondido'::text, 'fechado'::text]))),
    constraint cliente_pedidos_mensagem_check CHECK (((char_length(mensagem) >= 1) AND (char_length(mensagem) <= 2000))),
    constraint cliente_pedidos_resposta_check CHECK ((char_length(resposta) <= 4000)),
    constraint cliente_pedidos_tipo_check CHECK ((tipo = ANY (ARRAY['informacao'::text, 'extra'::text, 'reclamacao'::text, 'sugestao'::text])))
);
alter table public.cliente_pedidos enable row level security;

create table if not exists public.clientes (
    id uuid default gen_random_uuid() not null,
    nome text not null,
    nif text,
    email text,
    telefone text,
    morada text,
    notas text,
    created_at timestamp with time zone default now(),
    token_acesso text,
    acesso_ativo boolean default false not null,
    acesso_criado_em timestamp with time zone,
    ultimo_acesso timestamp with time zone,
    constraint clientes_pkey PRIMARY KEY (id)
);
alter table public.clientes enable row level security;

create table if not exists public.comparacao_artigos (
    id uuid default gen_random_uuid() not null,
    comparacao_id uuid not null,
    nome text not null,
    unidade text not null,
    qtd_correta numeric(12,3),
    nota text,
    destacar boolean default false not null,
    no_cesto boolean default true not null,
    ordem integer default 0 not null,
    criado_em timestamp with time zone default now() not null,
    constraint comparacao_artigos_pkey PRIMARY KEY (id),
    constraint comparacao_artigos_comparacao_id_fkey FOREIGN KEY (comparacao_id) REFERENCES comparacoes(id) ON DELETE CASCADE
);
alter table public.comparacao_artigos enable row level security;

create table if not exists public.comparacao_cotacoes (
    id uuid default gen_random_uuid() not null,
    artigo_id uuid not null,
    proposta_id uuid not null,
    nao_cotou boolean default false not null,
    quantidade numeric(12,3),
    quantidade_txt text,
    preco_unitario numeric(14,6),
    descricao text,
    criado_em timestamp with time zone default now() not null,
    constraint comparacao_cotacoes_pkey PRIMARY KEY (id),
    constraint comparacao_cotacoes_artigo_id_proposta_id_key UNIQUE (artigo_id, proposta_id),
    constraint comparacao_cotacoes_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES comparacao_artigos(id) ON DELETE CASCADE,
    constraint comparacao_cotacoes_proposta_id_fkey FOREIGN KEY (proposta_id) REFERENCES comparacao_propostas(id) ON DELETE CASCADE
);
alter table public.comparacao_cotacoes enable row level security;

create table if not exists public.comparacao_propostas (
    id uuid default gen_random_uuid() not null,
    comparacao_id uuid not null,
    fornecedor_id uuid,
    fornecedor text not null,
    documento text,
    data_documento date,
    validade text,
    sistema text,
    total_sem_iva numeric(12,2),
    total_com_iva numeric(12,2),
    pagamento text,
    entrega text,
    observacoes text,
    ordem integer default 0 not null,
    criado_em timestamp with time zone default now() not null,
    constraint comparacao_propostas_pkey PRIMARY KEY (id),
    constraint comparacao_propostas_comparacao_id_fkey FOREIGN KEY (comparacao_id) REFERENCES comparacoes(id) ON DELETE CASCADE,
    constraint comparacao_propostas_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE SET NULL
);
alter table public.comparacao_propostas enable row level security;

create table if not exists public.comparacao_riscos (
    id uuid default gen_random_uuid() not null,
    comparacao_id uuid not null,
    ponto text not null,
    impacto text,
    acao text,
    grave boolean default false not null,
    ordem integer default 0 not null,
    criado_em timestamp with time zone default now() not null,
    constraint comparacao_riscos_pkey PRIMARY KEY (id),
    constraint comparacao_riscos_comparacao_id_fkey FOREIGN KEY (comparacao_id) REFERENCES comparacoes(id) ON DELETE CASCADE
);
alter table public.comparacao_riscos enable row level security;

create table if not exists public.comparacoes (
    id uuid default gen_random_uuid() not null,
    titulo text not null,
    obra_id uuid,
    quantidade_base numeric(12,2),
    unidade_base text default 'm²'::text not null,
    estado text default 'aberta'::text not null,
    conclusao text,
    notas_resumo jsonb default '{}'::jsonb not null,
    criado_em timestamp with time zone default now() not null,
    atualizado_em timestamp with time zone default now() not null,
    constraint comparacoes_pkey PRIMARY KEY (id),
    constraint comparacoes_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    constraint comparacoes_estado_check CHECK ((estado = ANY (ARRAY['aberta'::text, 'decidida'::text, 'arquivada'::text])))
);
alter table public.comparacoes enable row level security;

create table if not exists public.corte_linhas (
    id uuid default gen_random_uuid() not null,
    corte_id uuid not null,
    obra_servico_id uuid not null,
    percentagem_antes numeric(5,2) default 0 not null,
    percentagem numeric(5,2) not null,
    constraint corte_linhas_pkey PRIMARY KEY (id),
    constraint corte_linhas_corte_id_obra_servico_id_key UNIQUE (corte_id, obra_servico_id),
    constraint corte_linhas_corte_id_fkey FOREIGN KEY (corte_id) REFERENCES cortes_semanais(id) ON DELETE CASCADE,
    constraint corte_linhas_obra_servico_id_fkey FOREIGN KEY (obra_servico_id) REFERENCES obra_servicos(id) ON DELETE CASCADE,
    constraint corte_linhas_percentagem_check CHECK (((percentagem >= (0)::numeric) AND (percentagem <= (100)::numeric)))
);
alter table public.corte_linhas enable row level security;

create table if not exists public.cortes_semanais (
    id uuid default gen_random_uuid() not null,
    obra_id uuid not null,
    semana date not null,
    estado text default 'pendente'::text not null,
    funcionario_id uuid,
    notas text,
    created_at timestamp with time zone default now() not null,
    atualizado_em timestamp with time zone default now() not null,
    tratado_em timestamp with time zone,
    constraint cortes_semanais_pkey PRIMARY KEY (id),
    constraint cortes_semanais_obra_id_semana_key UNIQUE (obra_id, semana),
    constraint cortes_semanais_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE SET NULL,
    constraint cortes_semanais_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
    constraint cortes_semanais_estado_check CHECK ((estado = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'rejeitado'::text]))),
    constraint cortes_semanais_notas_check CHECK ((char_length(notas) <= 2000))
);
alter table public.cortes_semanais enable row level security;

create table if not exists public.entradas_inventario (
    id uuid default gen_random_uuid() not null,
    artigo_id uuid not null,
    data date not null,
    quantidade numeric(10,2) not null,
    preco_unitario numeric(10,4) not null,
    fornecedor text,
    documento text,
    created_at timestamp without time zone default now(),
    constraint entradas_inventario_pkey PRIMARY KEY (id),
    constraint entradas_inventario_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES artigos(id) ON DELETE CASCADE,
    constraint entradas_inventario_preco_unitario_check CHECK ((preco_unitario >= (0)::numeric)),
    constraint entradas_inventario_quantidade_check CHECK ((quantidade > (0)::numeric))
);
alter table public.entradas_inventario enable row level security;

create table if not exists public.fatura_linhas (
    id uuid default gen_random_uuid() not null,
    movimento_id uuid not null,
    artigo_id uuid,
    descricao_original text not null,
    quantidade numeric,
    unidade text,
    preco_unitario numeric,
    valor_total numeric,
    taxa_iva numeric,
    ordem integer default 0 not null,
    origem text default 'ia'::text not null,
    criado_em timestamp with time zone default now() not null,
    constraint fatura_linhas_pkey PRIMARY KEY (id),
    constraint fatura_linhas_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES artigos(id) ON DELETE SET NULL,
    constraint fatura_linhas_movimento_id_fkey FOREIGN KEY (movimento_id) REFERENCES movimentos_financeiros(id) ON DELETE CASCADE
);
alter table public.fatura_linhas enable row level security;

create table if not exists public.fornecedores (
    id uuid default gen_random_uuid() not null,
    nif text,
    nome text,
    created_at timestamp without time zone default now(),
    telefone text,
    email text,
    iban text,
    constraint fornecedores_pkey PRIMARY KEY (id),
    constraint fornecedores_nif_key UNIQUE (nif)
);
alter table public.fornecedores enable row level security;

create table if not exists public.funcionarios (
    id uuid default gen_random_uuid() not null,
    nome text not null,
    codigo text,
    device_id text,
    created_at timestamp with time zone default now(),
    valor_dia numeric(10,2),
    ativo boolean default true,
    acesso_stock boolean default false,
    categoria text,
    telemovel text,
    nif text,
    iban text,
    tipo_contrato text default 'fixo'::text,
    codigo_inscricao text,
    codigo_inscricao_expira timestamp with time zone,
    niss text,
    morada text,
    data_nascimento date,
    nacionalidade text,
    data_admissao date,
    data_fim_contrato date,
    data_saida date,
    salario_mensal numeric(10,2),
    emergencia_nome text,
    emergencia_telefone text,
    subsidio_alimentacao_dia numeric(8,2),
    constraint funcionarios_pkey PRIMARY KEY (id),
    constraint funcionarios_device_id_key UNIQUE (device_id),
    constraint funcionarios_tipo_contrato_check CHECK ((tipo_contrato = ANY (ARRAY['fixo'::text, 'temporario'::text])))
);
alter table public.funcionarios enable row level security;

create table if not exists public.inventario_movimentos (
    id uuid default gen_random_uuid() not null,
    artigo_id uuid not null,
    data_movimento date not null,
    quantidade numeric(12,3) not null,
    tipo_movimento text not null,
    motivo text not null,
    created_at timestamp without time zone default now(),
    constraint inventario_movimentos_pkey PRIMARY KEY (id),
    constraint inventario_movimentos_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES artigos(id) ON DELETE CASCADE,
    constraint inventario_movimentos_tipo_movimento_check CHECK ((tipo_movimento = ANY (ARRAY['ENTRADA'::text, 'SAIDA'::text, 'AJUSTE'::text])))
);
alter table public.inventario_movimentos enable row level security;

create table if not exists public.movimento_servicos (
    id uuid default gen_random_uuid() not null,
    movimento_id uuid not null,
    obra_servico_id uuid not null,
    valor numeric(10,2) not null,
    created_at timestamp with time zone default now(),
    constraint movimento_servicos_pkey PRIMARY KEY (id),
    constraint movimento_servicos_movimento_id_fkey FOREIGN KEY (movimento_id) REFERENCES movimentos_financeiros(id) ON DELETE CASCADE,
    constraint movimento_servicos_obra_servico_id_fkey FOREIGN KEY (obra_servico_id) REFERENCES obra_servicos(id) ON DELETE CASCADE,
    constraint movimento_servicos_valor_check CHECK ((valor > (0)::numeric))
);
alter table public.movimento_servicos enable row level security;

create table if not exists public.movimentos_financeiros (
    id uuid default gen_random_uuid() not null,
    referencia text,
    data_documento date not null,
    tipo text not null,
    fornecedor_id uuid,
    cliente_nome text,
    categoria_id uuid,
    obra_id uuid not null,
    valor_base numeric(12,2) not null,
    iva numeric(12,2) not null,
    valor_total numeric(12,2) not null,
    estado_pagamento text not null,
    observacoes text,
    ativo boolean default true,
    created_at timestamp without time zone default now(),
    fonte text,
    fonte_id text,
    cliente_id uuid,
    constraint movimentos_financeiros_pkey PRIMARY KEY (id),
    constraint movimentos_financeiros_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias_financeiras(id),
    constraint movimentos_financeiros_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    constraint movimentos_financeiros_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
    constraint movimentos_financeiros_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id),
    constraint movimentos_financeiros_estado_pagamento_check CHECK ((estado_pagamento = ANY (ARRAY['pago'::text, 'por_pagar'::text]))),
    constraint movimentos_financeiros_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text])))
);
alter table public.movimentos_financeiros enable row level security;

create table if not exists public.movimentos_stock (
    id uuid default gen_random_uuid() not null,
    artigo_id uuid,
    tipo_movimento text not null,
    quantidade numeric not null,
    preco_unitario numeric,
    data_movimento date default CURRENT_DATE,
    observacoes text,
    created_at timestamp without time zone default now(),
    funcionario_id uuid,
    obra_origem_id uuid,
    obra_destino_id uuid,
    sessao_id text,
    movimento_id uuid,
    fatura_linha_id uuid,
    constraint movimentos_stock_pkey PRIMARY KEY (id),
    constraint movimentos_stock_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES artigos(id) ON DELETE CASCADE,
    constraint movimentos_stock_fatura_linha_id_fkey FOREIGN KEY (fatura_linha_id) REFERENCES fatura_linhas(id) ON DELETE SET NULL,
    constraint movimentos_stock_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
    constraint movimentos_stock_movimento_id_fkey FOREIGN KEY (movimento_id) REFERENCES movimentos_financeiros(id) ON DELETE SET NULL,
    constraint movimentos_stock_obra_destino_id_fkey FOREIGN KEY (obra_destino_id) REFERENCES obras(id),
    constraint movimentos_stock_obra_origem_id_fkey FOREIGN KEY (obra_origem_id) REFERENCES obras(id)
);
alter table public.movimentos_stock enable row level security;

create table if not exists public.obra_diario (
    id uuid default gen_random_uuid() not null,
    obra_id uuid not null,
    data date not null,
    notas text not null,
    visivel_cliente boolean default false not null,
    created_at timestamp with time zone default now(),
    constraint obra_diario_pkey PRIMARY KEY (id),
    constraint obra_diario_obra_id_data_key UNIQUE (obra_id, data),
    constraint obra_diario_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
    constraint obra_diario_notas_check CHECK ((char_length(notas) <= 4000))
);
alter table public.obra_diario enable row level security;

create table if not exists public.obra_documentos (
    id uuid default gen_random_uuid() not null,
    obra_id uuid not null,
    tipo text not null,
    nome_ficheiro text not null,
    caminho text not null,
    mime text,
    tamanho bigint,
    visivel_cliente boolean default false not null,
    estado text default 'arquivado'::text not null,
    numero_documento text,
    data_documento date,
    dados_lidos jsonb,
    orcamento_id uuid,
    movimento_id uuid,
    criado_por text,
    created_at timestamp with time zone default now(),
    constraint obra_documentos_pkey PRIMARY KEY (id),
    constraint obra_documentos_caminho_key UNIQUE (caminho),
    constraint obra_documentos_movimento_id_fkey FOREIGN KEY (movimento_id) REFERENCES movimentos_financeiros(id) ON DELETE SET NULL,
    constraint obra_documentos_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
    constraint obra_documentos_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE SET NULL,
    constraint obra_documentos_estado_check CHECK ((estado = ANY (ARRAY['por_tratar'::text, 'registado'::text, 'arquivado'::text]))),
    constraint obra_documentos_tipo_check CHECK ((tipo = ANY (ARRAY['orcamento'::text, 'fatura'::text, 'recibo'::text, 'foto'::text, 'outro'::text])))
);
alter table public.obra_documentos enable row level security;

create table if not exists public.obra_fases (
    id uuid default gen_random_uuid() not null,
    obra_id uuid not null,
    nome text not null,
    ordem integer default 0 not null,
    data_inicio date,
    data_fim date,
    estado text default 'por_fazer'::text not null,
    visivel_cliente boolean default true not null,
    created_at timestamp with time zone default now(),
    constraint obra_fases_pkey PRIMARY KEY (id),
    constraint obra_fases_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
    constraint obra_fases_estado_check CHECK ((estado = ANY (ARRAY['por_fazer'::text, 'a_decorrer'::text, 'concluida'::text])))
);
alter table public.obra_fases enable row level security;

create table if not exists public.obra_notas (
    id uuid default gen_random_uuid() not null,
    obra_id uuid not null,
    tipo text default 'ponto_situacao'::text not null,
    texto text not null,
    autor text,
    criado_em timestamp with time zone default now() not null,
    constraint obra_notas_pkey PRIMARY KEY (id),
    constraint obra_notas_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
    constraint obra_notas_tipo_valido CHECK ((tipo = ANY (ARRAY['ponto_situacao'::text, 'contexto'::text, 'projeto'::text, 'decisao'::text])))
);
alter table public.obra_notas enable row level security;

create table if not exists public.obra_servicos (
    id uuid default gen_random_uuid() not null,
    obra_id uuid not null,
    nome text not null,
    horas_orcamento numeric(6,1),
    valor_orcamento numeric(10,2),
    concluido boolean default false,
    extra boolean default false,
    ordem integer default 0,
    created_at timestamp with time zone default now(),
    orcamento_id uuid,
    zona text,
    responsavel_funcionario_id uuid,
    responsavel_externo text,
    criterio_fim text,
    data_fim_prevista date,
    concluido_em date,
    percentagem numeric(5,2) default 0 not null,
    fase_id uuid,
    constraint obra_servicos_pkey PRIMARY KEY (id),
    constraint obra_servicos_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES obra_fases(id) ON DELETE SET NULL,
    constraint obra_servicos_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
    constraint obra_servicos_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE SET NULL,
    constraint obra_servicos_responsavel_funcionario_id_fkey FOREIGN KEY (responsavel_funcionario_id) REFERENCES funcionarios(id) ON DELETE SET NULL,
    constraint obra_servicos_percentagem_0_100 CHECK (((percentagem >= (0)::numeric) AND (percentagem <= (100)::numeric)))
);
alter table public.obra_servicos enable row level security;

create table if not exists public.obras (
    id uuid default gen_random_uuid() not null,
    codigo text,
    nome text,
    local text,
    created_at timestamp with time zone default now(),
    latitude double precision,
    longitude double precision,
    morada text,
    raio integer default 120,
    estado text default 'ativa'::text,
    percentagem_conclusao integer,
    data_conclusao_prevista date,
    drive_pastas jsonb,
    cliente_id uuid,
    plano_pagamentos text default '50/30/20'::text,
    mostrar_contas_cliente boolean default false not null,
    constraint obras_pkey PRIMARY KEY (id),
    constraint obras_codigo_key UNIQUE (codigo),
    constraint obras_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    constraint obras_estado_check CHECK ((estado = ANY (ARRAY['ativa'::text, 'concluida'::text]))),
    constraint obras_percentagem_conclusao_check CHECK (((percentagem_conclusao >= 0) AND (percentagem_conclusao <= 100)))
);
alter table public.obras enable row level security;

create table if not exists public.orcamento_categorias (
    id uuid default gen_random_uuid() not null,
    orcamento_id uuid not null,
    nome text not null,
    ordem integer default 0 not null,
    created_at timestamp with time zone default now(),
    constraint orcamento_categorias_pkey PRIMARY KEY (id),
    constraint orcamento_categorias_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE
);
alter table public.orcamento_categorias enable row level security;

create table if not exists public.orcamento_linhas (
    id uuid default gen_random_uuid() not null,
    orcamento_id uuid not null,
    categoria_id uuid,
    tipo text not null,
    descricao text,
    unidade text default 'un'::text,
    n_pessoas integer default 1,
    quantidade numeric(10,2) default 1,
    preco_unitario numeric(10,2) default 0,
    ordem integer default 0,
    created_at timestamp with time zone default now(),
    constraint orcamento_linhas_pkey PRIMARY KEY (id),
    constraint orcamento_linhas_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES orcamento_categorias(id) ON DELETE CASCADE,
    constraint orcamento_linhas_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
    constraint orcamento_linhas_tipo_check CHECK ((tipo = ANY (ARRAY['mao_obra'::text, 'material'::text, 'outro'::text])))
);
alter table public.orcamento_linhas enable row level security;

create table if not exists public.orcamento_respostas (
    id uuid default gen_random_uuid() not null,
    orcamento_id uuid not null,
    cliente_id uuid,
    documento_id uuid,
    resposta text not null,
    comentario text,
    ip text,
    navegador text,
    created_at timestamp with time zone default now() not null,
    tratada_em timestamp with time zone,
    decisao text,
    constraint orcamento_respostas_pkey PRIMARY KEY (id),
    constraint orcamento_respostas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    constraint orcamento_respostas_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES obra_documentos(id) ON DELETE SET NULL,
    constraint orcamento_respostas_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
    constraint orcamento_respostas_comentario_check CHECK ((char_length(comentario) <= 2000)),
    constraint orcamento_respostas_decisao_check CHECK ((decisao = ANY (ARRAY['confirmada'::text, 'ignorada'::text, 'vista'::text]))),
    constraint orcamento_respostas_resposta_check CHECK ((resposta = ANY (ARRAY['aceite'::text, 'alteracoes'::text, 'recusa'::text])))
);
alter table public.orcamento_respostas enable row level security;

create table if not exists public.orcamentos (
    id uuid default gen_random_uuid() not null,
    numero text not null,
    data date default CURRENT_DATE not null,
    validade date,
    estado text default 'rascunho'::text not null,
    cliente_nome text not null,
    cliente_nif text,
    cliente_morada text,
    cliente_email text,
    cliente_tel text,
    obra_id uuid,
    obra_descricao text,
    prazo_obra text,
    condicoes_pag text,
    notas text,
    taxa_iva numeric(5,2) default 23 not null,
    subtotal_mao_obra numeric(10,2) default 0,
    subtotal_materiais numeric(10,2) default 0,
    subtotal_outros numeric(10,2) default 0,
    total_sem_iva numeric(10,2) default 0,
    total_iva numeric(10,2) default 0,
    total_com_iva numeric(10,2) default 0,
    duplicado_de uuid,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    cliente_id uuid,
    constraint orcamentos_pkey PRIMARY KEY (id),
    constraint orcamentos_numero_key UNIQUE (numero),
    constraint orcamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    constraint orcamentos_duplicado_de_fkey FOREIGN KEY (duplicado_de) REFERENCES orcamentos(id) ON DELETE SET NULL,
    constraint orcamentos_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    constraint orcamentos_estado_check CHECK ((estado = ANY (ARRAY['rascunho'::text, 'enviado'::text, 'aceite'::text, 'recusado'::text, 'cancelado'::text])))
);
alter table public.orcamentos enable row level security;

create table if not exists public.pagamento_dia (
    id uuid default gen_random_uuid() not null,
    funcionario_id uuid not null,
    dia date not null,
    fator numeric(3,1) default 1.0 not null,
    observacoes text,
    created_at timestamp without time zone default now(),
    constraint pagamento_dia_pkey PRIMARY KEY (id),
    constraint pagamento_dia_funcionario_id_dia_key UNIQUE (funcionario_id, dia),
    constraint pagamento_dia_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
alter table public.pagamento_dia enable row level security;

create table if not exists public.pedido_linhas (
    id uuid default gen_random_uuid() not null,
    pedido_id uuid not null,
    artigo_id uuid,
    descricao text not null,
    quantidade numeric,
    unidade text,
    confianca text default 'media'::text not null,
    ordem integer default 0 not null,
    criado_em timestamp with time zone default now() not null,
    constraint pedido_linhas_pkey PRIMARY KEY (id),
    constraint pedido_linhas_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES artigos(id) ON DELETE SET NULL,
    constraint pedido_linhas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    constraint pedido_linhas_confianca_valida CHECK ((confianca = ANY (ARRAY['alta'::text, 'media'::text, 'baixa'::text])))
);
alter table public.pedido_linhas enable row level security;

create table if not exists public.pedidos (
    id uuid default gen_random_uuid() not null,
    obra_id uuid,
    pedido_por text,
    texto_original text,
    estado text default 'rascunho'::text not null,
    notas text,
    criado_em timestamp with time zone default now() not null,
    validado_em timestamp with time zone,
    validado_por text,
    constraint pedidos_pkey PRIMARY KEY (id),
    constraint pedidos_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    constraint pedidos_estado_valido CHECK ((estado = ANY (ARRAY['rascunho'::text, 'validado'::text, 'encomendado'::text, 'recebido'::text, 'cancelado'::text])))
);
alter table public.pedidos enable row level security;

create table if not exists public.ponto (
    id uuid default gen_random_uuid() not null,
    funcionario_id uuid not null,
    obra_id uuid not null,
    datahora timestamp with time zone not null,
    latitude numeric,
    longitude numeric,
    created_at timestamp with time zone default now(),
    tipo text,
    parecer_saida text,
    origem text default 'qr'::text not null,
    distancia_m integer,
    precisao_m integer,
    a_rever boolean default false not null,
    obra_servico_id uuid,
    constraint ponto_pkey PRIMARY KEY (id),
    constraint ponto_obra_servico_id_fkey FOREIGN KEY (obra_servico_id) REFERENCES obra_servicos(id) ON DELETE SET NULL,
    constraint ponto_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text])))
);
alter table public.ponto enable row level security;

create table if not exists public.ponto_correcoes (
    id uuid default gen_random_uuid() not null,
    ponto_id uuid,
    funcionario_id uuid,
    acao text not null,
    tipo text,
    antes timestamp with time zone,
    depois timestamp with time zone,
    motivo text,
    feito_por text not null,
    feito_em timestamp with time zone default now() not null,
    constraint ponto_correcoes_pkey PRIMARY KEY (id),
    constraint ponto_correcoes_acao_check CHECK ((acao = ANY (ARRAY['alterar'::text, 'adicionar'::text, 'apagar'::text, 'declarar'::text, 'alinhar'::text])))
);
alter table public.ponto_correcoes enable row level security;

create table if not exists public.precos (
    id uuid default gen_random_uuid() not null,
    artigo_id uuid not null,
    fornecedor_id uuid,
    preco numeric not null,
    unidade text,
    data date not null,
    validade date,
    origem text default 'fatura'::text not null,
    fatura_linha_id uuid,
    criado_em timestamp with time zone default now() not null,
    constraint precos_pkey PRIMARY KEY (id),
    constraint precos_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES artigos(id) ON DELETE CASCADE,
    constraint precos_fatura_linha_id_fkey FOREIGN KEY (fatura_linha_id) REFERENCES fatura_linhas(id) ON DELETE SET NULL,
    constraint precos_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE SET NULL
);
alter table public.precos enable row level security;

create table if not exists public.registo_servicos (
    id uuid default gen_random_uuid() not null,
    registo_id uuid not null,
    obra_servico_id uuid not null,
    horas numeric(4,1) not null,
    created_at timestamp with time zone default now(),
    constraint registo_servicos_pkey PRIMARY KEY (id),
    constraint registo_servicos_obra_servico_id_fkey FOREIGN KEY (obra_servico_id) REFERENCES obra_servicos(id) ON DELETE CASCADE,
    constraint registo_servicos_registo_id_fkey FOREIGN KEY (registo_id) REFERENCES registos_admin(id) ON DELETE CASCADE,
    constraint registo_servicos_horas_check CHECK ((horas > (0)::numeric))
);
alter table public.registo_servicos enable row level security;

create table if not exists public.registos_admin (
    id uuid default gen_random_uuid() not null,
    data date not null,
    funcionario_id uuid,
    obra_id uuid,
    horas numeric(5,2) not null,
    observacoes text,
    created_at timestamp with time zone default now(),
    tipo text default 'presenca'::text,
    motivo text,
    origem text default 'manual'::text not null,
    ponto_saida_id uuid,
    constraint registos_admin_pkey PRIMARY KEY (id),
    constraint registos_admin_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
    constraint registos_admin_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    constraint registos_admin_ponto_saida_id_fkey FOREIGN KEY (ponto_saida_id) REFERENCES ponto(id) ON DELETE CASCADE,
    constraint registos_admin_horas_check CHECK (((horas >= (0)::numeric) AND (horas <= (24)::numeric))),
    constraint registos_admin_motivo_check CHECK (((motivo IS NULL) OR (motivo = ANY (ARRAY['ferias'::text, 'baixa'::text, 'justificada'::text, 'injustificada'::text])))),
    constraint registos_admin_tipo_check CHECK ((tipo = ANY (ARRAY['presenca'::text, 'falta'::text])))
);
alter table public.registos_admin enable row level security;

create table if not exists public.rh_documentos (
    id uuid default gen_random_uuid() not null,
    funcionario_id uuid,
    tipo text not null,
    descricao text,
    data_emissao date,
    validade date,
    nome_ficheiro text,
    caminho text,
    mime text,
    tamanho bigint,
    dados_lidos jsonb,
    criado_por text,
    created_at timestamp with time zone default now(),
    constraint rh_documentos_pkey PRIMARY KEY (id),
    constraint rh_documentos_caminho_key UNIQUE (caminho),
    constraint rh_documentos_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);
alter table public.rh_documentos enable row level security;

create table if not exists public.saidas_inventario (
    id uuid default gen_random_uuid() not null,
    artigo_id uuid not null,
    data date not null,
    quantidade numeric(10,2) not null,
    motivo text not null,
    obra_id uuid,
    created_at timestamp without time zone default now(),
    constraint saidas_inventario_pkey PRIMARY KEY (id),
    constraint saidas_inventario_artigo_id_fkey FOREIGN KEY (artigo_id) REFERENCES artigos(id) ON DELETE CASCADE,
    constraint saidas_inventario_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id),
    constraint saidas_inventario_motivo_check CHECK ((motivo = ANY (ARRAY['obra'::text, 'perda'::text, 'ajuste'::text]))),
    constraint saidas_inventario_quantidade_check CHECK ((quantidade > (0)::numeric))
);
alter table public.saidas_inventario enable row level security;

create table if not exists public.tarefa_funcionarios (
    tarefa_id uuid not null,
    funcionario_id uuid not null,
    responsavel boolean default false not null,
    criado_em timestamp with time zone default now() not null,
    constraint tarefa_funcionarios_pkey PRIMARY KEY (tarefa_id, funcionario_id),
    constraint tarefa_funcionarios_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
    constraint tarefa_funcionarios_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES tarefas(id) ON DELETE CASCADE
);
alter table public.tarefa_funcionarios enable row level security;

create table if not exists public.tarefas (
    id uuid default gen_random_uuid() not null,
    obra_id uuid,
    descricao text not null,
    notas text,
    data_prevista date not null,
    hora_inicio time without time zone,
    duracao_horas numeric(5,2) default 8 not null,
    ordem integer default 0 not null,
    usar_morada_obra boolean default true not null,
    morada text,
    latitude double precision,
    longitude double precision,
    estado text default 'planeada'::text not null,
    concluida_em timestamp with time zone,
    duracao_real_horas numeric(5,2),
    criado_em timestamp with time zone default now() not null,
    atualizado_em timestamp with time zone default now() not null,
    constraint tarefas_pkey PRIMARY KEY (id),
    constraint tarefas_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    constraint tarefas_duracao_horas_check CHECK ((duracao_horas > (0)::numeric)),
    constraint tarefas_estado_check CHECK ((estado = ANY (ARRAY['planeada'::text, 'em_curso'::text, 'concluida'::text, 'cancelada'::text])))
);
alter table public.tarefas enable row level security;

create table if not exists public.toc_oauth_estado (
    estado text not null,
    criado_em timestamp with time zone default now() not null,
    usado_em timestamp with time zone,
    pedido_por text,
    constraint toc_oauth_estado_pkey PRIMARY KEY (estado)
);
alter table public.toc_oauth_estado enable row level security;

create table if not exists public.unidades_medida (
    id integer default nextval('unidades_medida_id_seq'::regclass) not null,
    codigo text not null,
    descricao text not null,
    constraint unidades_medida_pkey PRIMARY KEY (id),
    constraint unidades_medida_codigo_key UNIQUE (codigo)
);
alter table public.unidades_medida enable row level security;


-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------

create unique index if not exists clientes_nif_unico ON public.clientes USING btree (nif) WHERE ((nif IS NOT NULL) AND (nif <> ''::text));
create unique index if not exists clientes_token_acesso_unico ON public.clientes USING btree (token_acesso) WHERE (token_acesso IS NOT NULL);
create unique index if not exists funcionarios_codigo_inscricao_idx ON public.funcionarios USING btree (codigo_inscricao) WHERE (codigo_inscricao IS NOT NULL);
create index if not exists idx_assistente_registo_data ON public.assistente_registo USING btree (criado_em DESC);
create index if not exists idx_bib_mat_servico ON public.biblioteca_materiais USING btree (servico_id);
create index if not exists idx_cliente_pedidos_estado ON public.cliente_pedidos USING btree (estado, created_at);
create index if not exists idx_comp_artigos_comp ON public.comparacao_artigos USING btree (comparacao_id);
create index if not exists idx_comp_cotacoes_proposta ON public.comparacao_cotacoes USING btree (proposta_id);
create index if not exists idx_comp_propostas_comp ON public.comparacao_propostas USING btree (comparacao_id);
create index if not exists idx_comp_riscos_comp ON public.comparacao_riscos USING btree (comparacao_id);
create index if not exists idx_cortes_obra ON public.cortes_semanais USING btree (obra_id, semana DESC);
create index if not exists idx_fatura_linhas_artigo ON public.fatura_linhas USING btree (artigo_id);
create index if not exists idx_fatura_linhas_movimento ON public.fatura_linhas USING btree (movimento_id);
create index if not exists idx_movimento_servicos_mov ON public.movimento_servicos USING btree (movimento_id);
create index if not exists idx_movimento_servicos_serv ON public.movimento_servicos USING btree (obra_servico_id);
create index if not exists idx_movimentos_fonte ON public.movimentos_financeiros USING btree (fonte, fonte_id) WHERE (fonte IS NOT NULL);
create index if not exists idx_movimentos_stock_movimento ON public.movimentos_stock USING btree (movimento_id);
create index if not exists idx_movstock_artigo ON public.movimentos_stock USING btree (artigo_id);
create index if not exists idx_movstock_data ON public.movimentos_stock USING btree (data_movimento DESC);
create index if not exists idx_movstock_funcionario ON public.movimentos_stock USING btree (funcionario_id);
create index if not exists idx_movstock_sessao ON public.movimentos_stock USING btree (sessao_id);
create index if not exists idx_obra_documentos_obra ON public.obra_documentos USING btree (obra_id, created_at DESC);
create index if not exists idx_obra_fases_obra ON public.obra_fases USING btree (obra_id, ordem);
create index if not exists idx_obra_notas_obra ON public.obra_notas USING btree (obra_id, criado_em DESC);
create index if not exists idx_obra_servicos_fase ON public.obra_servicos USING btree (fase_id);
create index if not exists idx_obra_servicos_obra ON public.obra_servicos USING btree (obra_id);
create index if not exists idx_obra_servicos_orcamento ON public.obra_servicos USING btree (orcamento_id);
create index if not exists idx_orc_linhas_cat ON public.orcamento_linhas USING btree (categoria_id);
create index if not exists idx_orc_linhas_orc ON public.orcamento_linhas USING btree (orcamento_id);
create index if not exists idx_pedido_linhas_pedido ON public.pedido_linhas USING btree (pedido_id);
create index if not exists idx_pedidos_estado ON public.pedidos USING btree (estado, criado_em DESC);
create index if not exists idx_pedidos_obra ON public.pedidos USING btree (obra_id);
create index if not exists idx_precos_artigo_data ON public.precos USING btree (artigo_id, data DESC);
create index if not exists idx_registo_servicos_reg ON public.registo_servicos USING btree (registo_id);
create index if not exists idx_registo_servicos_serv ON public.registo_servicos USING btree (obra_servico_id);
create index if not exists idx_registos_admin_data ON public.registos_admin USING btree (data DESC);
create index if not exists idx_registos_admin_funcionario ON public.registos_admin USING btree (funcionario_id);
create index if not exists idx_rh_documentos_func ON public.rh_documentos USING btree (funcionario_id, tipo);
create index if not exists idx_rh_documentos_validade ON public.rh_documentos USING btree (validade) WHERE (validade IS NOT NULL);
create index if not exists idx_tarefa_func_funcionario ON public.tarefa_funcionarios USING btree (funcionario_id);
create index if not exists idx_tarefas_data ON public.tarefas USING btree (data_prevista);
create index if not exists idx_tarefas_estado ON public.tarefas USING btree (estado);
create index if not exists idx_tarefas_obra ON public.tarefas USING btree (obra_id);
create unique index if not exists movimentos_financeiros_ref_unica ON public.movimentos_financeiros USING btree (fornecedor_id, referencia) WHERE (ativo AND (fornecedor_id IS NOT NULL) AND (referencia IS NOT NULL) AND (referencia <> ''::text) AND (COALESCE(fonte, ''::text) <> ALL (ARRAY['toc_online'::text, 'saft'::text])));
create unique index if not exists orcamento_respostas_uma_pendente ON public.orcamento_respostas USING btree (orcamento_id) WHERE (tratada_em IS NULL);
create index if not exists ponto_correcoes_func_idx ON public.ponto_correcoes USING btree (funcionario_id, feito_em DESC);
create index if not exists ponto_correcoes_ponto_idx ON public.ponto_correcoes USING btree (ponto_id);
create unique index if not exists registos_admin_ponto_saida_unica ON public.registos_admin USING btree (ponto_saida_id) WHERE (ponto_saida_id IS NOT NULL);
create index if not exists toc_oauth_estado_criado_em_idx ON public.toc_oauth_estado USING btree (criado_em);
create unique index if not exists unico_saida_qr ON public.movimentos_financeiros USING btree (referencia, data_documento, valor_total) WHERE ((tipo = 'saida'::text) AND (ativo = true));

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------

create or replace view public.vw_carga_diaria with (security_invoker=on) as
 SELECT tf.funcionario_id,
    t.data_prevista,
    count(*) AS n_tarefas,
    sum(t.duracao_horas) AS horas_planeadas
   FROM tarefas t
     JOIN tarefa_funcionarios tf ON tf.tarefa_id = t.id
  WHERE t.estado <> 'cancelada'::text
  GROUP BY tf.funcionario_id, t.data_prevista;

create or replace view public.vw_dashboard_mes_atual with (security_invoker=on) as
 SELECT funcionario,
    sum(total_segundos) / 3600.0 AS horas_trabalhadas,
    count(DISTINCT dia) AS dias_trabalhados,
    count(DISTINCT dia) FILTER (WHERE total_segundos < 28800::numeric AND estado = 'OK'::text) AS dias_nao_completos,
    sum(total_segundos) / 3600.0 * COALESCE(( SELECT f.valor_dia
           FROM funcionarios f
          WHERE f.nome = vw_registos_ponto.funcionario
         LIMIT 1), 0::numeric) AS valor_a_receber
   FROM vw_registos_ponto
  WHERE date_trunc('month'::text, dia::timestamp with time zone) = date_trunc('month'::text, now())
  GROUP BY funcionario;

create or replace view public.vw_fluxo_mes with (security_invoker=on) as
 SELECT date_trunc('month'::text, data_documento::timestamp with time zone) AS mes,
    sum(
        CASE
            WHEN tipo = 'entrada'::text THEN valor_total
            ELSE 0::numeric
        END) AS total_entradas,
    sum(
        CASE
            WHEN tipo = 'saida'::text THEN valor_total
            ELSE 0::numeric
        END) AS total_saidas,
    sum(
        CASE
            WHEN tipo = 'entrada'::text THEN valor_total
            ELSE - valor_total
        END) AS saldo
   FROM movimentos_financeiros
  WHERE ativo = true
  GROUP BY (date_trunc('month'::text, data_documento::timestamp with time zone))
  ORDER BY (date_trunc('month'::text, data_documento::timestamp with time zone)) DESC;

create or replace view public.vw_horas_anuais with (security_invoker=on) as
 SELECT f.nome AS funcionario,
    EXTRACT(year FROM p.datahora) AS ano,
    segundos_para_hhmm(sum(
        CASE
            WHEN p.tipo = 'saida'::text THEN EXTRACT(epoch FROM p.datahora)
            WHEN p.tipo = 'entrada'::text THEN - EXTRACT(epoch FROM p.datahora)
            ELSE NULL::numeric
        END)) AS horas
   FROM ponto p
     LEFT JOIN funcionarios f ON f.id = p.funcionario_id
  GROUP BY f.nome, (EXTRACT(year FROM p.datahora))
  ORDER BY (EXTRACT(year FROM p.datahora)) DESC, f.nome;

create or replace view public.vw_horas_detalhadas with (security_invoker=on) as
 SELECT p.id,
    f.nome AS funcionario,
    f.codigo AS funcionario_codigo,
    o.nome AS obra,
    o.codigo AS obra_codigo,
    p.datahora AS marcacao,
    p.tipo,
    p.latitude,
    p.longitude,
    p.created_at
   FROM ponto p
     LEFT JOIN funcionarios f ON f.id = p.funcionario_id
     LEFT JOIN obras o ON o.id = p.obra_id
  ORDER BY p.datahora;

create or replace view public.vw_horas_incompletas with (security_invoker=on) as
 WITH reg AS (
         SELECT p.id,
            p.funcionario_id,
            p.obra_id,
            p.datahora,
            p.latitude,
            p.longitude,
            p.created_at,
            p.tipo,
            lead(p.tipo) OVER (PARTITION BY p.funcionario_id, p.obra_id, (date(p.datahora)) ORDER BY p.datahora) AS prox_tipo
           FROM ponto p
        )
 SELECT funcionario_id,
    obra_id,
    datahora,
    tipo,
        CASE
            WHEN tipo = 'entrada'::text AND prox_tipo <> 'saida'::text THEN 'Entrada sem saída'::text
            WHEN tipo = 'saida'::text AND prox_tipo <> 'entrada'::text THEN 'Saída sem entrada'::text
            ELSE NULL::text
        END AS erro
   FROM reg r
  WHERE tipo = 'entrada'::text AND prox_tipo <> 'saida'::text OR tipo = 'saida'::text AND prox_tipo <> 'entrada'::text
  ORDER BY datahora DESC;

create or replace view public.vw_horas_mensais with (security_invoker=on) as
 SELECT f.nome AS funcionario,
    o.nome AS obra,
    EXTRACT(year FROM p.datahora) AS ano,
    EXTRACT(month FROM p.datahora) AS mes,
    segundos_para_hhmm(sum(
        CASE
            WHEN p.tipo = 'saida'::text THEN EXTRACT(epoch FROM p.datahora)
            WHEN p.tipo = 'entrada'::text THEN - EXTRACT(epoch FROM p.datahora)
            ELSE NULL::numeric
        END)) AS horas
   FROM ponto p
     LEFT JOIN funcionarios f ON f.id = p.funcionario_id
     LEFT JOIN obras o ON o.id = p.obra_id
  GROUP BY f.nome, o.nome, (EXTRACT(year FROM p.datahora)), (EXTRACT(month FROM p.datahora))
  ORDER BY (EXTRACT(year FROM p.datahora)) DESC, (EXTRACT(month FROM p.datahora)) DESC;

create or replace view public.vw_horas_por_dia with (security_invoker=on) as
 SELECT f.nome AS funcionario,
    o.nome AS obra,
    date(p.datahora) AS dia,
    segundos_para_hhmm(sum(
        CASE
            WHEN p.tipo = 'saida'::text THEN EXTRACT(epoch FROM p.datahora)
            WHEN p.tipo = 'entrada'::text THEN - EXTRACT(epoch FROM p.datahora)
            ELSE NULL::numeric
        END)) AS horas
   FROM ponto p
     LEFT JOIN funcionarios f ON f.id = p.funcionario_id
     LEFT JOIN obras o ON o.id = p.obra_id
  GROUP BY f.nome, o.nome, (date(p.datahora))
  ORDER BY (date(p.datahora)) DESC, f.nome;

create or replace view public.vw_horas_semanais with (security_invoker=on) as
 SELECT f.nome AS funcionario,
    o.nome AS obra,
    EXTRACT(isoyear FROM p.datahora) AS ano,
    EXTRACT(week FROM p.datahora) AS semana,
    segundos_para_hhmm(sum(
        CASE
            WHEN p.tipo = 'saida'::text THEN EXTRACT(epoch FROM p.datahora)
            WHEN p.tipo = 'entrada'::text THEN - EXTRACT(epoch FROM p.datahora)
            ELSE NULL::numeric
        END)) AS horas
   FROM ponto p
     LEFT JOIN funcionarios f ON f.id = p.funcionario_id
     LEFT JOIN obras o ON o.id = p.obra_id
  GROUP BY f.nome, o.nome, (EXTRACT(isoyear FROM p.datahora)), (EXTRACT(week FROM p.datahora))
  ORDER BY (EXTRACT(isoyear FROM p.datahora)) DESC, (EXTRACT(week FROM p.datahora)) DESC;

create or replace view public.vw_kpis_financeiros_mes with (security_invoker=on) as
 SELECT count(DISTINCT funcionario) AS total_funcionarios,
    segundos_para_hhmm(sum(total_segundos)) AS total_horas_mes,
    count(DISTINCT dia) AS total_dias_trabalhados,
    count(DISTINCT dia) FILTER (WHERE total_segundos < 28800::numeric AND estado = 'OK'::text) AS total_dias_nao_completos,
    sum(total_segundos / 3600.0 * COALESCE(( SELECT f.valor_dia
           FROM funcionarios f
          WHERE f.nome = vw_registos_ponto.funcionario
         LIMIT 1), 0::numeric)) AS total_a_pagar
   FROM vw_registos_ponto
  WHERE date_trunc('month'::text, dia::timestamp with time zone) = date_trunc('month'::text, now());

create or replace view public.vw_movimentos_financeiros with (security_invoker=on) as
 SELECT m.id,
    m.referencia,
    m.data_documento,
    m.tipo,
    f.nome AS fornecedor,
    c.nome AS categoria,
    o.nome AS obra,
    m.valor_base,
    m.iva,
    m.valor_total,
    m.estado_pagamento,
    m.observacoes
   FROM movimentos_financeiros m
     LEFT JOIN fornecedores f ON f.id = m.fornecedor_id
     LEFT JOIN categorias_financeiras c ON c.id = m.categoria_id
     LEFT JOIN obras o ON o.id = m.obra_id
  WHERE m.ativo = true
  ORDER BY m.data_documento DESC;

create or replace view public.vw_registos_ponto with (security_invoker=on) as
 WITH base AS (
         SELECT p.id,
            p.funcionario_id,
            f.nome AS funcionario,
            o.nome AS obra,
            (p.datahora AT TIME ZONE 'Europe/Lisbon'::text)::date AS dia,
            p.datahora AS created_at,
            p.tipo,
            p.a_rever,
            p.distancia_m
           FROM ponto p
             LEFT JOIN funcionarios f ON f.id = p.funcionario_id
             LEFT JOIN obras o ON o.id = p.obra_id
        ), entradas AS (
         SELECT base.id,
            base.funcionario_id,
            base.funcionario,
            base.obra,
            base.dia,
            base.created_at AS entrada,
            row_number() OVER (PARTITION BY base.funcionario, base.obra, base.dia ORDER BY base.created_at) AS rn
           FROM base
          WHERE base.tipo = 'entrada'::text
        ), saidas AS (
         SELECT base.id,
            base.funcionario,
            base.obra,
            base.dia,
            base.created_at AS saida,
            row_number() OVER (PARTITION BY base.funcionario, base.obra, base.dia ORDER BY base.created_at) AS rn
           FROM base
          WHERE base.tipo = 'saida'::text
        ), pares AS (
         SELECT e.id AS entrada_id,
            s.id AS saida_id,
            e.funcionario_id,
            e.funcionario,
            e.obra,
            e.dia,
            e.entrada,
            s.saida,
            EXTRACT(epoch FROM s.saida - e.entrada) -
                CASE
                    WHEN (s.saida - e.entrada) > '06:00:00'::interval THEN 3600
                    ELSE 0
                END::numeric AS segundos
           FROM entradas e
             LEFT JOIN saidas s ON e.funcionario = s.funcionario AND e.obra = s.obra AND e.dia = s.dia AND e.rn = s.rn
        ), rever AS (
         SELECT base.funcionario,
            base.obra,
            base.dia,
            array_agg(base.id) AS ids_a_rever,
            max(base.distancia_m) AS distancia_m
           FROM base
          WHERE base.a_rever
          GROUP BY base.funcionario, base.obra, base.dia
        )
 SELECT pares.funcionario,
    pares.obra,
    pares.dia,
    min(pares.entrada) AS entrada,
    max(pares.saida) AS saida,
    max(pares.entrada_id::text)::uuid AS entrada_id,
    max(pares.saida_id::text)::uuid AS saida_id,
    sum(pares.segundos) AS total_segundos,
        CASE
            WHEN count(pares.saida) < count(pares.entrada) THEN 'Incompleto'::text
            ELSE 'OK'::text
        END AS estado,
    segundos_para_hhmm(sum(pares.segundos)) AS horas,
    max(rever.ids_a_rever::text) IS NOT NULL AS a_rever,
    max(rever.ids_a_rever::text)::uuid[] AS ids_a_rever,
    max(rever.distancia_m) AS distancia_m,
    max(pares.funcionario_id::text)::uuid AS funcionario_id
   FROM pares
     LEFT JOIN rever ON NOT rever.funcionario IS DISTINCT FROM pares.funcionario AND NOT rever.obra IS DISTINCT FROM pares.obra AND rever.dia = pares.dia
  GROUP BY pares.funcionario, pares.obra, pares.dia
  ORDER BY pares.dia DESC;

create or replace view public.vw_stock_atual with (security_invoker=on) as
 SELECT a.id,
    a.codigo,
    a.descricao,
    a.tipo_artigo,
    a.preco_atual,
    a.local_armazenamento,
    COALESCE(sum(
        CASE
            WHEN m.tipo_movimento = ANY (ARRAY['ENTRADA'::text, 'INVENTARIO_INICIAL'::text, 'AJUSTE'::text]) THEN m.quantidade
            WHEN m.tipo_movimento = 'SAIDA'::text THEN - m.quantidade
            ELSE NULL::numeric
        END), 0::numeric) AS quantidade
   FROM artigos a
     LEFT JOIN movimentos_stock m ON m.artigo_id = a.id
  GROUP BY a.id, a.codigo, a.descricao, a.tipo_artigo, a.preco_atual, a.local_armazenamento;

create or replace view public.vw_stock_por_data with (security_invoker=on) as
 SELECT a.id AS artigo_id,
    a.descricao,
    u.codigo AS unidade,
    sum(
        CASE
            WHEN m.tipo_movimento = 'ENTRADA'::text THEN m.quantidade
            WHEN m.tipo_movimento = 'AJUSTE'::text THEN m.quantidade
            ELSE - m.quantidade
        END) AS quantidade
   FROM artigos a
     JOIN unidades_medida u ON u.id = a.unidade_id
     LEFT JOIN inventario_movimentos m ON m.artigo_id = a.id
  GROUP BY a.id, a.descricao, u.codigo;


-- ---------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.corte_aprovar(p_corte_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    begin
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        if not is_admin() then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                raise exception 'sem_permissao' using errcode = '42501';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        if not exists (select 1 from cortes_semanais where id = p_corte_id and estado = 'pendente') then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                raise exception 'corte_nao_pendente' using errcode = '22023';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    end if;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        update obra_servicos s
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               set percentagem  = l.percentagem,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          concluido    = l.percentagem >= 100,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     concluido_em = case when l.percentagem >= 100 then coalesce(s.concluido_em, current_date) end
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           from corte_linhas l
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                where l.corte_id = p_corte_id and l.obra_servico_id = s.id;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    update cortes_semanais set estado = 'aprovado', tratado_em = now() where id = p_corte_id;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    end;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    $function$
;

CREATE OR REPLACE FUNCTION public.corte_gravar(p_device text, p_obra_id uuid, p_linhas jsonb, p_notas text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
                                                                                                                                                                                                            declare
                                                                                                                                                                                                                v_func  uuid;
                                                                                                                                                                                                                    v_corte record;
                                                                                                                                                                                                                        v_l     jsonb;
                                                                                                                                                                                                                            v_pct   numeric;
                                                                                                                                                                                                                                v_serv  record;
                                                                                                                                                                                                                                begin
                                                                                                                                                                                                                                    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
                                                                                                                                                                                                                                        if v_func is null then
                                                                                                                                                                                                                                                raise exception 'dispositivo_nao_registado' using errcode = '42501';
                                                                                                                                                                                                                                                    end if;
                                                                                                                                                                                                                                                        if not exists (select 1 from obras o where o.id = p_obra_id and o.estado = 'ativa') then
                                                                                                                                                                                                                                                                raise exception 'obra_invalida' using errcode = '22023';
                                                                                                                                                                                                                                                                    end if;
                                                                                                                                                                                                                                                                        if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
                                                                                                                                                                                                                                                                                raise exception 'sem_linhas' using errcode = '22023';
                                                                                                                                                                                                                                                                                    end if;

                                                                                                                                                                                                                                                                                        select c.id, c.estado into v_corte
                                                                                                                                                                                                                                                                                              from cortes_semanais c where c.obra_id = p_obra_id and c.semana = semana_atual();
                                                                                                                                                                                                                                                                                                  if v_corte.estado = 'aprovado' then
                                                                                                                                                                                                                                                                                                          raise exception 'corte_ja_aprovado' using errcode = '22023';
                                                                                                                                                                                                                                                                                                              end if;

                                                                                                                                                                                                                                                                                                                  if v_corte.id is null then
                                                                                                                                                                                                                                                                                                                          insert into cortes_semanais (obra_id, semana, funcionario_id, notas)
                                                                                                                                                                                                                                                                                                                                  values (p_obra_id, semana_atual(), v_func, nullif(trim(left(p_notas, 2000)), ''))
                                                                                                                                                                                                                                                                                                                                          returning id, estado into v_corte;
                                                                                                                                                                                                                                                                                                                                              else
                                                                                                                                                                                                                                                                                                                                                      update cortes_semanais
                                                                                                                                                                                                                                                                                                                                                                 set estado = 'pendente', funcionario_id = v_func, tratado_em = null,
                                                                                                                                                                                                                                                                                                                                                                                notas = nullif(trim(left(p_notas, 2000)), ''), atualizado_em = now()
                                                                                                                                                                                                                                                                                                                                                                                         where id = v_corte.id;
                                                                                                                                                                                                                                                                                                                                                                                             end if;

                                                                                                                                                                                                                                                                                                                                                                                                 for v_l in select * from jsonb_array_elements(p_linhas) loop
                                                                                                                                                                                                                                                                                                                                                                                                         select s.id, s.percentagem into v_serv
                                                                                                                                                                                                                                                                                                                                                                                                                   from obra_servicos s
                                                                                                                                                                                                                                                                                                                                                                                                                            where s.id = (v_l->>'id')::uuid and s.obra_id = p_obra_id;
                                                                                                                                                                                                                                                                                                                                                                                                                                    continue when v_serv.id is null;
                                                                                                                                                                                                                                                                                                                                                                                                                                            v_pct := greatest(0, least(100, round((v_l->>'percentagem')::numeric, 2)));
                                                                                                                                                                                                                                                                                                                                                                                                                                                    insert into corte_linhas (corte_id, obra_servico_id, percentagem_antes, percentagem)
                                                                                                                                                                                                                                                                                                                                                                                                                                                            values (v_corte.id, v_serv.id, v_serv.percentagem, v_pct)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    on conflict (corte_id, obra_servico_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                            do update set percentagem = excluded.percentagem, percentagem_antes = excluded.percentagem_antes;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                end loop;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    return v_corte.id;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    end;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    $function$
;

CREATE OR REPLACE FUNCTION public.corte_pacotes(p_device text, p_obra_id uuid)
 RETURNS TABLE(id uuid, zona text, nome text, criterio_fim text, percentagem numeric, proposta numeric, estado_corte text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
                                                                                                                          declare
                                                                                                                              v_corte record;
                                                                                                                              begin
                                                                                                                                  if not exists (select 1 from funcionarios f where f.device_id = p_device and f.ativo) then
                                                                                                                                          raise exception 'dispositivo_nao_registado' using errcode = '42501';
                                                                                                                                              end if;
                                                                                                                                                  select c.id, c.estado into v_corte
                                                                                                                                                        from cortes_semanais c where c.obra_id = p_obra_id and c.semana = semana_atual();
                                                                                                                                                            return query
                                                                                                                                                                select s.id, s.zona, s.nome, s.criterio_fim, s.percentagem,
                                                                                                                                                                           (select l.percentagem from corte_linhas l where l.corte_id = v_corte.id and l.obra_servico_id = s.id),
                                                                                                                                                                                      v_corte.estado
                                                                                                                                                                                            from obra_servicos s
                                                                                                                                                                                                  join obras o on o.id = s.obra_id
                                                                                                                                                                                                       where s.obra_id = p_obra_id and o.estado = 'ativa'
                                                                                                                                                                                                            order by s.zona nulls last, s.ordem, s.created_at;
                                                                                                                                                                                                            end;
                                                                                                                                                                                                            $function$
;

CREATE OR REPLACE FUNCTION public.funcionario_por_dispositivo(p_device text)
 RETURNS TABLE(id uuid, nome text, ativo boolean, acesso_stock boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select f.id, f.nome, f.ativo, coalesce(f.acesso_stock, false)
      from funcionarios f
     where p_device is not null
       and btrim(p_device) <> ''
       and f.device_id = p_device;
$function$
;

CREATE OR REPLACE FUNCTION public.gerar_codigo_inscricao(p_funcionario uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    v_codigo   text;
    v_existe   boolean;
begin
    if not is_admin() then
        raise exception 'sem_permissao' using errcode = '42501';
    end if;

    if not exists (select 1 from funcionarios where id = p_funcionario and ativo) then
        raise exception 'funcionario_inexistente_ou_inativo' using errcode = '22023';
    end if;

    -- Repetir ate sair um codigo livre (o indice unico garante o resto)
    loop
        v_codigo := '';
        for i in 1..8 loop
            v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
        end loop;
        select exists (select 1 from funcionarios where codigo_inscricao = v_codigo) into v_existe;
        exit when not v_existe;
    end loop;

    update funcionarios
       set codigo_inscricao        = v_codigo,
           codigo_inscricao_expira = now() + interval '48 hours'
     where id = p_funcionario;

    return v_codigo;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gerar_codigo_obra()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.gerar_numero_orcamento()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_mes(p_mes date)
 RETURNS TABLE(funcionario text, horas_trabalhadas text, dias_trabalhados integer, dias_nao_completos integer, valor_a_receber numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    if not is_admin() then
        raise exception 'sem_permissao' using errcode = '42501';
    end if;

    return query
    with dias as (
        select f.id as funcionario_id, f.nome as funcionario,
               date(p.dia) as dia, sum(p.total_segundos) as total_segundos
        from vw_registos_ponto p
        join funcionarios f on f.nome = p.funcionario
        where p.dia >= date_trunc('month', p_mes)
          and p.dia <  date_trunc('month', p_mes) + interval '1 month'
        group by f.id, f.nome, date(p.dia)
    ),
    dias_com_pagamento as (
        select d.funcionario_id, d.funcionario, d.dia, d.total_segundos,
               coalesce(pd.fator, 1.0) as fator
        from dias d
        left join pagamento_dia pd
               on pd.funcionario_id = d.funcionario_id and pd.dia = d.dia
    ),
    resumo as (
        select dcp.funcionario,
               sum(dcp.total_segundos) as total_segundos,
               count(*) as dias_trabalhados,
               count(*) filter (where dcp.fator < 1.0) as dias_nao_completos,
               sum(dcp.fator) as dias_pagos
        from dias_com_pagamento dcp
        group by dcp.funcionario
    )
    select r.funcionario,
           to_char(make_interval(secs => r.total_segundos), 'HH24:MI') as horas_trabalhadas,
           r.dias_trabalhados::integer,
           r.dias_nao_completos::integer,
           round(r.dias_pagos * f.valor_dia, 2) as valor_a_receber
    from resumo r
    join funcionarios f on f.nome = r.funcionario
    order by r.funcionario;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_inventario_data(p_data date)
 RETURNS TABLE(descricao text, quantidade numeric, medida text, preco_unitario numeric, total numeric)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_metrica_admin()
 RETURNS TABLE(horas_hoje text, horas_semana text, horas_mes text)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.horas_totais_dia(p_data date)
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.horas_totais_mes()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.horas_totais_semana()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from admins
    where lower(btrim(email)) = lower(btrim(auth.jwt() ->> 'email'))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.obra_por_dispositivo(p_device text, p_obra_id uuid)
 RETURNS TABLE(id uuid, nome text, estado text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.id, o.nome, o.estado
  from obras o
  where o.id = p_obra_id
    and exists (
      select 1 from funcionarios f
      where f.device_id = p_device and f.ativo
    );
$function$
;

CREATE OR REPLACE FUNCTION public.obras_ativas_por_dispositivo(p_device text)
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.id, o.nome
  from obras o
  where o.estado = 'ativa'
    and exists (
      select 1 from funcionarios f
      where f.device_id = p_device and f.ativo
    )
  order by o.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.obras_para_marcar(p_device text)
 RETURNS TABLE(id uuid, nome text, ultima boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_func uuid;
        v_ult  uuid;
        begin
            select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
                if v_func is null then
                        raise exception 'dispositivo_nao_registado' using errcode = '42501';
                            end if;

                                select p.obra_id into v_ult
                                      from ponto p where p.funcionario_id = v_func
                                           order by p.datahora desc limit 1;

                                               return query
                                                   select o.id, o.nome, coalesce(o.id = v_ult, false)
                                                         from obras o
                                                              where o.estado = 'ativa'
                                                                   order by o.nome;
                                                                   end;
                                                                   $function$
;

CREATE OR REPLACE FUNCTION public.ponto_adicionar(p_funcionario uuid, p_obra uuid, p_tipo text, p_dia date, p_hora time without time zone, p_motivo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_nova timestamptz;
    v_id   uuid;
    v_serv uuid;
begin
    if not is_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
    if p_tipo not in ('entrada', 'saida') then raise exception 'tipo_invalido' using errcode = '22023'; end if;
    if p_dia is null or p_hora is null then raise exception 'hora_em_falta' using errcode = '22023'; end if;

    v_nova := (p_dia + p_hora) at time zone 'Europe/Lisbon';
    if v_nova > now() + interval '5 minutes' then
        raise exception 'hora_no_futuro' using errcode = '22023';
    end if;

    -- Uma entrada nova fica com o serviço da obra, se só houver um
    if p_tipo = 'entrada' then v_serv := servico_da_obra(null, p_obra); end if;

    insert into ponto (funcionario_id, obra_id, datahora, created_at, tipo, origem, a_rever, obra_servico_id)
    values (p_funcionario, p_obra, v_nova, now(), p_tipo, 'painel', false, v_serv)
    returning id into v_id;

    insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
    values (v_id, p_funcionario, 'adicionar', p_tipo, null, v_nova,
            nullif(trim(p_motivo), ''), coalesce(auth.jwt() ->> 'email', 'painel'));
    return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ponto_apagar(p_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_antes record;
begin
    if not is_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
    select * into v_antes from ponto where id = p_id;
    if v_antes.id is null then return; end if;

    insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
    values (p_id, v_antes.funcionario_id, 'apagar', v_antes.tipo, v_antes.datahora, null,
            nullif(trim(p_motivo), ''), coalesce(auth.jwt() ->> 'email', 'painel'));
    delete from ponto where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ponto_apos_alteracao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_saida uuid;
begin
    -- Marcação apagada: a saída apagada leva a linha consigo (cascade); se
    -- for uma entrada, recalcula-se a saída que vinha a seguir.
    if tg_op = 'DELETE' then
        if old.tipo = 'entrada' then
            select p.id into v_saida from ponto p
             where p.funcionario_id = old.funcionario_id
               and p.datahora > old.datahora and p.tipo = 'saida'
             order by p.datahora limit 1;
            if v_saida is not null then perform ponto_gerar_registo(v_saida); end if;
        end if;
        return null;
    end if;

    if new.tipo = 'saida' then
        v_saida := new.id;
    else
        select p.id into v_saida from ponto p
         where p.funcionario_id = new.funcionario_id
           and p.datahora > new.datahora
         order by p.datahora limit 1;
        if v_saida is not null
           and (select tipo from ponto where id = v_saida) <> 'saida' then
            v_saida := null;
        end if;
    end if;

    if v_saida is not null then
        perform ponto_gerar_registo(v_saida);
    end if;
    return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ponto_corrigir(p_id uuid, p_dia date, p_hora time without time zone, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_antes record;
    v_nova  timestamptz;
begin
    if not is_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
    if p_dia is null or p_hora is null then raise exception 'hora_em_falta' using errcode = '22023'; end if;

    select * into v_antes from ponto where id = p_id;
    if v_antes.id is null then raise exception 'marcacao_inexistente' using errcode = '22023'; end if;

    v_nova := (p_dia + p_hora) at time zone 'Europe/Lisbon';
    if v_nova > now() + interval '5 minutes' then
        raise exception 'hora_no_futuro' using errcode = '22023';
    end if;

    if v_nova is distinct from v_antes.datahora then
        insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
        values (p_id, v_antes.funcionario_id, 'alterar', v_antes.tipo, v_antes.datahora, v_nova,
                nullif(trim(p_motivo), ''), coalesce(auth.jwt() ->> 'email', 'painel'));
    end if;

    update ponto set datahora = v_nova, a_rever = false where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ponto_declarar_saida(p_device text, p_caso text, p_hora time without time zone)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_func   uuid;
    v_m      record;
    v_ent    record;
    v_dia    date;
    v_nova   timestamptz;
    v_hoje   date := (now() at time zone 'Europe/Lisbon')::date;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;
    if p_hora is null then raise exception 'hora_em_falta' using errcode = '22023'; end if;

    if p_caso = 'esquecida' then
        -- A última marcação antes de hoje tem de ser uma entrada (há no máximo 14 dias)
        select * into v_m from ponto p
         where p.funcionario_id = v_func
           and p.datahora < (v_hoje::timestamp at time zone 'Europe/Lisbon')
         order by p.datahora desc limit 1;
        if v_m.id is null or v_m.tipo <> 'entrada' then
            raise exception 'nada_para_declarar' using errcode = '22023';
        end if;
        v_dia := (v_m.datahora at time zone 'Europe/Lisbon')::date;
        if v_dia < v_hoje - 14 then
            raise exception 'nada_para_declarar' using errcode = '22023';
        end if;
        v_nova := (v_dia + p_hora) at time zone 'Europe/Lisbon';
        if v_nova <= v_m.datahora then
            raise exception 'saida_antes_da_entrada' using errcode = '22023';
        end if;

        insert into ponto (funcionario_id, obra_id, datahora, created_at, tipo, origem, a_rever)
        values (v_func, v_m.obra_id, v_nova, now(), 'saida', 'declarada', true)
        returning * into v_m;

        insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
        values (v_m.id, v_func, 'declarar', 'saida', null, v_nova,
                'Esqueceu-se de marcar a saída', 'funcionário');
        return v_dia;
    end if;

    if p_caso = 'longe' then
        -- A última marcação é uma saída de hoje, longe da obra, feita há menos de 3 h
        select * into v_m from ponto p where p.funcionario_id = v_func
         order by p.datahora desc limit 1;
        if v_m.id is null or v_m.tipo <> 'saida' or not v_m.a_rever
           or v_m.created_at < now() - interval '3 hours' then
            raise exception 'nada_para_declarar' using errcode = '22023';
        end if;
        v_dia  := (v_m.created_at at time zone 'Europe/Lisbon')::date;
        v_nova := (v_dia + p_hora) at time zone 'Europe/Lisbon';
        if v_nova >= v_m.created_at then
            raise exception 'hora_depois_da_marcacao' using errcode = '22023';
        end if;
        select * into v_ent from ponto p where p.funcionario_id = v_func and p.datahora < v_m.datahora
         order by p.datahora desc limit 1;
        if v_ent.id is not null and v_nova <= v_ent.datahora then
            raise exception 'saida_antes_da_entrada' using errcode = '22023';
        end if;

        insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
        values (v_m.id, v_func, 'declarar', 'saida', v_m.datahora, v_nova,
                'Marcou a saída mais tarde, longe da obra', 'funcionário');
        update ponto set datahora = v_nova where id = v_m.id;
        return v_dia;
    end if;

    raise exception 'caso_invalido' using errcode = '22023';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ponto_gerar_registo(p_saida uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_sai   record;
    v_ent   record;
    v_dia   date;
    v_horas numeric;
    v_reg   uuid;
begin
    -- A linha antiga deste par sai sempre; volta a ser criada se ainda contar
    delete from registos_admin where ponto_saida_id = p_saida and origem = 'ponto';

    select * into v_sai from ponto where id = p_saida and tipo = 'saida';
    if v_sai.id is null then return; end if;
    v_dia := (v_sai.datahora at time zone 'Europe/Lisbon')::date;

    -- A entrada do par: a última marcação antes da saída, no mesmo dia
    select * into v_ent from ponto p
     where p.funcionario_id = v_sai.funcionario_id
       and p.datahora < v_sai.datahora
     order by p.datahora desc limit 1;
    if v_ent.id is null or v_ent.tipo <> 'entrada'
       or (v_ent.datahora at time zone 'Europe/Lisbon')::date <> v_dia then
        return;
    end if;

    if v_ent.a_rever or v_sai.a_rever then return; end if;

    -- O Registo diário escrito à mão manda
    if exists (select 1 from registos_admin r
                where r.funcionario_id = v_sai.funcionario_id
                  and r.data = v_dia
                  and r.origem <> 'ponto') then
        return;
    end if;

    v_horas := extract(epoch from v_sai.datahora - v_ent.datahora) / 3600.0;
    if v_horas > 6 then v_horas := v_horas - 1; end if;
    v_horas := round(v_horas * 2) / 2;
    if v_horas <= 0 then return; end if;
    v_horas := least(v_horas, 24);

    insert into registos_admin (data, funcionario_id, obra_id, horas, tipo, origem, ponto_saida_id, observacoes)
    values (v_dia, v_sai.funcionario_id, v_ent.obra_id, v_horas, 'presenca', 'ponto', v_sai.id,
            'Das marcações ' || to_char(v_ent.datahora at time zone 'Europe/Lisbon', 'HH24:MI')
                     || '–' || to_char(v_sai.datahora at time zone 'Europe/Lisbon', 'HH24:MI'))
    returning id into v_reg;

    if v_ent.obra_servico_id is not null then
        insert into registo_servicos (registo_id, obra_servico_id, horas)
        values (v_reg, v_ent.obra_servico_id, v_horas);
    end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ponto_historico(p_device text, p_desde timestamp with time zone)
 RETURNS TABLE(id uuid, datahora timestamp with time zone, tipo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                                                            limit 60;
                                                            end;
                                                            $function$
;

CREATE OR REPLACE FUNCTION public.ponto_marcar(p_device text, p_obra_id uuid, p_lat double precision, p_lon double precision, p_servico uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tipo text, datahora timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_func   uuid;
    v_obra   record;
    v_dist   double precision;
    v_raio   int;
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

    -- Saída se houver uma entrada aberta de hoje; senão entrada
    v_tipo := ponto_proximo_tipo(v_func);

    insert into ponto (funcionario_id, obra_id, datahora, latitude, longitude, tipo, distancia_m, obra_servico_id)
    values (v_func, p_obra_id, now(), p_lat, p_lon, v_tipo, round(v_dist),
            case when v_tipo = 'entrada' then servico_da_obra(p_servico, p_obra_id) end);

    return query select v_tipo, now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ponto_marcar_area(p_device text, p_obra_id uuid, p_lat double precision, p_lon double precision, p_precisao double precision, p_servico uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tipo text, datahora timestamp with time zone, a_rever boolean, distancia_m integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_func   uuid;
    v_obra   record;
    v_dist   int;
    v_rever  boolean;
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
        v_dist := round(6371000 * 2 * asin(sqrt(
            power(sin(radians(p_lat - v_obra.latitude) / 2), 2) +
            cos(radians(v_obra.latitude)) * cos(radians(p_lat)) *
            power(sin(radians(p_lon - v_obra.longitude) / 2), 2)
        )));
        v_rever := v_dist > coalesce(v_obra.raio, 120);
    else
        -- Obra sem coordenadas: não há com que comparar
        v_rever := true;
    end if;

    -- Saída se houver uma entrada aberta de hoje; senão entrada
    v_tipo := ponto_proximo_tipo(v_func);

    insert into ponto (funcionario_id, obra_id, datahora, latitude, longitude, tipo,
                       origem, distancia_m, precisao_m, a_rever, obra_servico_id)
    values (v_func, p_obra_id, now(), p_lat, p_lon, v_tipo,
            'area', v_dist, round(p_precisao), v_rever,
            case when v_tipo = 'entrada' then servico_da_obra(p_servico, p_obra_id) end);

    return query select v_tipo, now(), v_rever, v_dist;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ponto_proximo_tipo(p_func uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select case
        when u.tipo = 'entrada'
         and (u.datahora at time zone 'Europe/Lisbon')::date = (now() at time zone 'Europe/Lisbon')::date
        then 'saida' else 'entrada' end
      from (select null::int) x
      left join lateral (select p.tipo, p.datahora from ponto p where p.funcionario_id = p_func
                          order by p.datahora desc limit 1) u on true;
$function$
;

CREATE OR REPLACE FUNCTION public.registar_dispositivo(p_nome text, p_device text)
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.registar_dispositivo_por_codigo(p_codigo text, p_device text)
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_id   uuid;
    v_nome text;
begin
    if p_device is null or btrim(p_device) = '' then
        return;
    end if;

    -- Ja registado neste dispositivo: devolve o proprio registo
    return query
        select f.id, f.nome from funcionarios f
         where f.device_id = p_device and f.ativo;
    if found then
        return;
    end if;

    if p_codigo is null or btrim(p_codigo) = '' then
        return;
    end if;

    -- Consumir o codigo. O update so acerta se o codigo existir, estiver
    -- dentro do prazo, e a pessoa estiver activa e sem dispositivo.
    update funcionarios f
       set device_id               = p_device,
           codigo_inscricao        = null,
           codigo_inscricao_expira = null
     where upper(btrim(f.codigo_inscricao)) = upper(btrim(p_codigo))
       and f.codigo_inscricao_expira > now()
       and f.device_id is null
       and f.ativo
    returning f.id, f.nome into v_id, v_nome;

    if v_id is null then
        return;
    end if;

    return query select v_id, v_nome;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.segundos_para_hhmm(total integer)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.segundos_para_hhmm(total_segundos numeric)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.semana_atual()
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$
                                                                                                            select date_trunc('week', (now() at time zone 'Europe/Lisbon'))::date
                                                                                                            $function$
;

CREATE OR REPLACE FUNCTION public.servico_da_obra(p_servico uuid, p_obra_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select coalesce(
        (select s.id from obra_servicos s where s.id = p_servico and s.obra_id = p_obra_id),
        (select min(s.id::text)::uuid from obra_servicos s
          where p_servico is null and s.obra_id = p_obra_id and not coalesce(s.concluido, false)
         having count(*) = 1)
    );
$function$
;

CREATE OR REPLACE FUNCTION public.servicos_para_marcar(p_device text, p_obra_id uuid)
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    begin
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        if not exists (select 1 from funcionarios f where f.device_id = p_device and f.ativo) then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                raise exception 'dispositivo_nao_registado' using errcode = '42501';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        return query
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            select s.id, coalesce(s.zona || ' · ', '') || s.nome
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  from obra_servicos s
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        join obras o on o.id = s.obra_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             where s.obra_id = p_obra_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    and o.estado = 'ativa'
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           and not coalesce(s.concluido, false)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                order by s.zona nulls last, s.ordem, s.created_at;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                end;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                $function$
;

CREATE OR REPLACE FUNCTION public.set_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.atualizado_em = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.stock_artigo_por_codigo(p_device text, p_codigo text)
 RETURNS TABLE(id uuid, codigo text, descricao text, tipo_artigo text, local_armazenamento text, stock_atual numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.stock_registar_movimentos(p_device text, p_movimentos jsonb, p_local text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        -- Bloqueia a linha do artigo atÃ© ao fim da transaÃ§Ã£o, para que duas
        -- saÃ­das em simultÃ¢neo nÃ£o possam ambas passar na validaÃ§Ã£o.
        select a.id, a.descricao, a.tipo_artigo, coalesce(a.stock_inicial, 0) as stock_inicial
          into v_artigo
          from artigos a
         where a.id = (v_item->>'artigo_id')::uuid and a.ativo
           for update;

        if v_artigo.id is null then
            raise exception 'artigo_invalido' using errcode = '22023';
        end if;

        v_qtd := (v_item->>'quantidade')::numeric;

        -- SÃ³ consumÃ­veis e mercadorias tÃªm stock. Ferramentas e equipamentos
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
                raise exception 'Stock insuficiente de % â€” disponÃ­vel %, pedido %',
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
$function$
;

CREATE OR REPLACE FUNCTION public.trg_obras_set_codigo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
    if new.codigo is null or new.codigo = '' then
        new.codigo := gerar_codigo_obra();
    end if;
    return new;
end;
$function$
;


-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

CREATE TRIGGER trg_comparacoes_atualizado BEFORE UPDATE ON public.comparacoes FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
CREATE TRIGGER obras_set_codigo BEFORE INSERT ON public.obras FOR EACH ROW EXECUTE FUNCTION trg_obras_set_codigo();
CREATE TRIGGER ponto_gera_registo AFTER INSERT OR DELETE OR UPDATE OF datahora, a_rever, obra_servico_id, tipo ON public.ponto FOR EACH ROW EXECUTE FUNCTION ponto_apos_alteracao();
CREATE TRIGGER trg_tarefas_atualizado_em BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ---------------------------------------------------------------------
-- Políticas de acesso (RLS)
-- ---------------------------------------------------------------------

create policy "admins: admin lê" on public.admins as permissive for select to authenticated using (is_admin());
create policy "artigo_precos: só admin" on public.artigo_precos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "artigo_sinonimos: admin gere tudo" on public.artigo_sinonimos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "artigos: só admin" on public.artigos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "assistente_registo: admin gere tudo" on public.assistente_registo as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "auto_linhas: admin gere tudo" on public.auto_linhas as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "autos_medicao: admin gere tudo" on public.autos_medicao as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "biblioteca_materiais: admin gere tudo" on public.biblioteca_materiais as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "biblioteca_servicos: admin gere tudo" on public.biblioteca_servicos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "categorias_fin: admin gere, auth lê" on public.categorias_financeiras as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "cliente_pedidos: admin gere tudo" on public.cliente_pedidos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "clientes: admin gere tudo" on public.clientes as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "comparacao_artigos: admin gere tudo" on public.comparacao_artigos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "comparacao_cotacoes: admin gere tudo" on public.comparacao_cotacoes as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "comparacao_propostas: admin gere tudo" on public.comparacao_propostas as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "comparacao_riscos: admin gere tudo" on public.comparacao_riscos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "comparacoes: admin gere tudo" on public.comparacoes as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "corte_linhas: admin gere tudo" on public.corte_linhas as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "cortes_semanais: admin gere tudo" on public.cortes_semanais as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "entradas_inv: só admin" on public.entradas_inventario as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "fatura_linhas: admin gere tudo" on public.fatura_linhas as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "fornecedores: só admin" on public.fornecedores as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "funcionarios: admin gere tudo" on public.funcionarios as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "inv_mov: só admin" on public.inventario_movimentos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "movimento_servicos: admin gere tudo" on public.movimento_servicos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "mov_fin: só admin" on public.movimentos_financeiros as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "mov_stock: só admin" on public.movimentos_stock as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "obra_diario: admin gere tudo" on public.obra_diario as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "obra_documentos: admin gere tudo" on public.obra_documentos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "obra_fases: admin gere tudo" on public.obra_fases as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "obra_notas: admin gere tudo" on public.obra_notas as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "obra_servicos: admin gere tudo" on public.obra_servicos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "obras: admin gere tudo" on public.obras as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "orcamento_categorias: admin gere tudo" on public.orcamento_categorias as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "orcamento_linhas: admin gere tudo" on public.orcamento_linhas as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "orcamento_respostas: admin gere tudo" on public.orcamento_respostas as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "orcamentos: admin gere tudo" on public.orcamentos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "pagamento_dia: só admin" on public.pagamento_dia as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "pedido_linhas: admin gere tudo" on public.pedido_linhas as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "pedidos: admin gere tudo" on public.pedidos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin lê correções" on public.ponto_correcoes as permissive for select to authenticated using (is_admin());
create policy "ponto: admin gere tudo" on public.ponto as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "precos: admin gere tudo" on public.precos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "registo_servicos: admin gere tudo" on public.registo_servicos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "registos_admin: admin gere tudo" on public.registos_admin as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "rh_documentos: admin gere tudo" on public.rh_documentos as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "saidas_inv: só admin" on public.saidas_inventario as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "tarefa_funcionarios: admin gere tudo" on public.tarefa_funcionarios as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "tarefas: admin gere tudo" on public.tarefas as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "unidades: admin gere" on public.unidades_medida as permissive for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- Permissões nas tabelas
-- ---------------------------------------------------------------------

grant delete, insert, references, select, trigger, truncate, update on public.admins to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.artigo_precos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.artigo_sinonimos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.artigos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.assistente_registo to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.auto_linhas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.autos_medicao to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.biblioteca_materiais to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.biblioteca_servicos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.categorias_financeiras to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.cliente_pedidos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.clientes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.comparacao_artigos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.comparacao_cotacoes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.comparacao_propostas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.comparacao_riscos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.comparacoes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.corte_linhas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.cortes_semanais to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.entradas_inventario to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.fatura_linhas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.fornecedores to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.funcionarios to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.inventario_movimentos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.movimento_servicos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.movimentos_financeiros to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.movimentos_stock to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.obra_diario to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.obra_documentos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.obra_fases to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.obra_notas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.obra_servicos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.obras to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.orcamento_categorias to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.orcamento_linhas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.orcamento_respostas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.orcamentos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.pagamento_dia to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.pedido_linhas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.pedidos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.ponto_correcoes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.ponto to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.precos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.registo_servicos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.registos_admin to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.rh_documentos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.saidas_inventario to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.tarefa_funcionarios to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.tarefas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.unidades_medida to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_carga_diaria to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_dashboard_mes_atual to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_fluxo_mes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_horas_anuais to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_horas_detalhadas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_horas_incompletas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_horas_mensais to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_horas_por_dia to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_horas_semanais to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_kpis_financeiros_mes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_movimentos_financeiros to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_registos_ponto to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_stock_atual to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.vw_stock_por_data to authenticated;

-- ---------------------------------------------------------------------
-- Permissões nas funções
-- ---------------------------------------------------------------------

grant execute on function public.corte_aprovar(p_corte_id uuid) to authenticated;
grant execute on function public.corte_gravar(p_device text, p_obra_id uuid, p_linhas jsonb, p_notas text) to anon;
grant execute on function public.corte_gravar(p_device text, p_obra_id uuid, p_linhas jsonb, p_notas text) to authenticated;
grant execute on function public.corte_pacotes(p_device text, p_obra_id uuid) to anon;
grant execute on function public.corte_pacotes(p_device text, p_obra_id uuid) to authenticated;
grant execute on function public.funcionario_por_dispositivo(p_device text) to anon;
grant execute on function public.funcionario_por_dispositivo(p_device text) to authenticated;
grant execute on function public.gerar_codigo_inscricao(p_funcionario uuid) to authenticated;
grant execute on function public.gerar_codigo_obra() to anon;
grant execute on function public.gerar_codigo_obra() to authenticated;
grant execute on function public.gerar_numero_orcamento() to authenticated;
grant execute on function public.get_inventario_data(p_data date) to authenticated;
grant execute on function public.get_metrica_admin() to authenticated;
grant execute on function public.horas_totais_dia(p_data date) to anon;
grant execute on function public.horas_totais_dia(p_data date) to authenticated;
grant execute on function public.horas_totais_mes() to anon;
grant execute on function public.horas_totais_mes() to authenticated;
grant execute on function public.horas_totais_semana() to anon;
grant execute on function public.horas_totais_semana() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.obra_por_dispositivo(p_device text, p_obra_id uuid) to anon;
grant execute on function public.obra_por_dispositivo(p_device text, p_obra_id uuid) to authenticated;
grant execute on function public.obras_ativas_por_dispositivo(p_device text) to anon;
grant execute on function public.obras_ativas_por_dispositivo(p_device text) to authenticated;
grant execute on function public.obras_para_marcar(p_device text) to anon;
grant execute on function public.obras_para_marcar(p_device text) to authenticated;
grant execute on function public.ponto_adicionar(p_funcionario uuid, p_obra uuid, p_tipo text, p_dia date, p_hora time without time zone, p_motivo text) to authenticated;
grant execute on function public.ponto_apagar(p_id uuid, p_motivo text) to authenticated;
grant execute on function public.ponto_apos_alteracao() to anon;
grant execute on function public.ponto_apos_alteracao() to authenticated;
grant execute on function public.ponto_corrigir(p_id uuid, p_dia date, p_hora time without time zone, p_motivo text) to authenticated;
grant execute on function public.ponto_declarar_saida(p_device text, p_caso text, p_hora time without time zone) to anon;
grant execute on function public.ponto_declarar_saida(p_device text, p_caso text, p_hora time without time zone) to authenticated;
grant execute on function public.ponto_historico(p_device text, p_desde timestamp with time zone) to anon;
grant execute on function public.ponto_historico(p_device text, p_desde timestamp with time zone) to authenticated;
grant execute on function public.ponto_marcar_area(p_device text, p_obra_id uuid, p_lat double precision, p_lon double precision, p_precisao double precision, p_servico uuid) to anon;
grant execute on function public.ponto_marcar_area(p_device text, p_obra_id uuid, p_lat double precision, p_lon double precision, p_precisao double precision, p_servico uuid) to authenticated;
grant execute on function public.ponto_marcar(p_device text, p_obra_id uuid, p_lat double precision, p_lon double precision, p_servico uuid) to anon;
grant execute on function public.ponto_marcar(p_device text, p_obra_id uuid, p_lat double precision, p_lon double precision, p_servico uuid) to authenticated;
grant execute on function public.registar_dispositivo_por_codigo(p_codigo text, p_device text) to anon;
grant execute on function public.registar_dispositivo_por_codigo(p_codigo text, p_device text) to authenticated;
grant execute on function public.segundos_para_hhmm(total_segundos numeric) to anon;
grant execute on function public.segundos_para_hhmm(total integer) to anon;
grant execute on function public.segundos_para_hhmm(total_segundos numeric) to authenticated;
grant execute on function public.segundos_para_hhmm(total integer) to authenticated;
grant execute on function public.semana_atual() to anon;
grant execute on function public.semana_atual() to authenticated;
grant execute on function public.servicos_para_marcar(p_device text, p_obra_id uuid) to anon;
grant execute on function public.servicos_para_marcar(p_device text, p_obra_id uuid) to authenticated;
grant execute on function public.set_atualizado_em() to anon;
grant execute on function public.set_atualizado_em() to authenticated;
grant execute on function public.stock_artigo_por_codigo(p_device text, p_codigo text) to anon;
grant execute on function public.stock_artigo_por_codigo(p_device text, p_codigo text) to authenticated;
grant execute on function public.stock_registar_movimentos(p_device text, p_movimentos jsonb, p_local text) to anon;
grant execute on function public.stock_registar_movimentos(p_device text, p_movimentos jsonb, p_local text) to authenticated;
grant execute on function public.trg_obras_set_codigo() to anon;
grant execute on function public.trg_obras_set_codigo() to authenticated;
