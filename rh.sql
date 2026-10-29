-- =======================================================
-- RECURSOS HUMANOS: ficha do trabalhador, documentos com validade,
-- motivo das faltas e salário mensal
--
-- O que a lei pede por trabalhador numa obra (DL 273/2003, art. 21.º):
-- identificação, morada, NIF, n.º de Segurança Social, categoria, datas na
-- obra e o seguro de acidentes de trabalho. A ficha passa a ter esses dados,
-- e cada trabalhador tem uma pasta privada com os documentos e a validade
-- de cada um (cartão de cidadão, contrato, medicina do trabalho, formações,
-- entrega de EPI). Os documentos da empresa (apólice do seguro, alvará,
-- declarações de não dívida) ficam na mesma tabela, sem funcionario_id.
--
-- Os ficheiros ficam no Storage do Supabase, no bucket privado
-- "rh-documentos", em <funcionario_id>/<ficheiro> ou empresa/<ficheiro>.
-- Só os administradores lhes chegam: são dados pessoais.
-- =======================================================

-- FICHA DO TRABALHADOR
alter table funcionarios add column if not exists niss                 text;
alter table funcionarios add column if not exists morada               text;
alter table funcionarios add column if not exists data_nascimento      date;
alter table funcionarios add column if not exists nacionalidade        text;
alter table funcionarios add column if not exists data_admissao        date;
alter table funcionarios add column if not exists data_fim_contrato    date;   -- contratos a termo
alter table funcionarios add column if not exists data_saida           date;
alter table funcionarios add column if not exists salario_mensal       numeric(10,2);  -- vazio = pago ao dia (valor_dia)
alter table funcionarios add column if not exists emergencia_nome      text;
alter table funcionarios add column if not exists emergencia_telefone  text;

-- MOTIVO DA FALTA (só quando tipo = 'falta')
-- ferias e justificada (incl. feriado/luto/casamento) não descontam no
-- ordenado; baixa é paga pela Segurança Social; injustificada desconta.
alter table registos_admin add column if not exists motivo text;
alter table registos_admin drop constraint if exists registos_admin_motivo_check;
alter table registos_admin add constraint registos_admin_motivo_check
    check (motivo is null or motivo in ('ferias', 'baixa', 'justificada', 'injustificada'));

-- DOCUMENTOS (do trabalhador, ou da empresa quando funcionario_id é null)
create table if not exists rh_documentos (
    id              uuid primary key default gen_random_uuid(),
    funcionario_id  uuid references funcionarios(id) on delete cascade,
    tipo            text not null,          -- ver TIPOS_DOC_RH / TIPOS_DOC_EMPRESA em rh.js
    descricao       text,                   -- ex.: nome da formação
    data_emissao    date,
    validade        date,                   -- vazio = não caduca
    nome_ficheiro   text,
    caminho         text unique,            -- caminho no bucket rh-documentos (vazio = só registado, sem ficheiro)
    mime            text,
    tamanho         bigint,
    dados_lidos     jsonb,                  -- o que o assistente leu, se foi lido
    criado_por      text,
    created_at      timestamptz default now()
);

create index if not exists idx_rh_documentos_func on rh_documentos (funcionario_id, tipo);
create index if not exists idx_rh_documentos_validade on rh_documentos (validade) where validade is not null;

alter table rh_documentos enable row level security;

drop policy if exists "rh_documentos: admin gere tudo" on rh_documentos;
create policy "rh_documentos: admin gere tudo" on rh_documentos
    for all to authenticated
    using (is_admin()) with check (is_admin());

revoke all on rh_documentos from anon;
grant select, insert, update, delete on rh_documentos to authenticated;

-- STORAGE: bucket privado, 20 MB por ficheiro
insert into storage.buckets (id, name, public, file_size_limit)
values ('rh-documentos', 'rh-documentos', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "rh-documentos: admin gere tudo" on storage.objects;
create policy "rh-documentos: admin gere tudo" on storage.objects
    for all to authenticated
    using (bucket_id = 'rh-documentos' and public.is_admin())
    with check (bucket_id = 'rh-documentos' and public.is_admin());
