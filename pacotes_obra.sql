-- =======================================================
-- PACOTES POR ZONA E CORTE SEMANAL DA OBRA
--
-- 1. Os serviços da obra passam a ser "pacotes" de trabalho entregável:
--    cada um tem a zona onde fica (Cozinha, WC, Fachada…), quem responde
--    por ele, o que quer dizer "terminado", até quando devia estar feito e
--    a % feita (a última aprovada). Um serviço grande parte-se em pacotes
--    na app (botão "Partir"); nada muda nas horas, faturas ou autos já
--    ligados, que ficam no primeiro pacote.
--
-- 2. Corte semanal: no telemóvel (área do funcionário) quem está na obra
--    marca a % de cada pacote. O corte fica "pendente" até o Alcindo o
--    aprovar na app; só então a % dos pacotes muda e o cliente a vê na área
--    do cliente. Um corte por obra e por semana (a semana começa à
--    segunda); enquanto estiver pendente, pode ser corrigido.
--
-- 3. Área do cliente: o cliente pode também recusar um orçamento
--    (resposta "recusa"), além de aceitar ou pedir alterações.
--
-- Correr no SQL Editor do Supabase. Pode correr-se mais de uma vez.
-- =======================================================

-- ---------- 1. Pacotes ----------
alter table obra_servicos add column if not exists zona                       text;
alter table obra_servicos add column if not exists responsavel_funcionario_id uuid references funcionarios(id) on delete set null;
alter table obra_servicos add column if not exists responsavel_externo        text;   -- subempreiteiro, fornecedor…
alter table obra_servicos add column if not exists criterio_fim               text;   -- "terminado quando…"
alter table obra_servicos add column if not exists data_fim_prevista          date;   -- passado isto e não feito = atrasado
alter table obra_servicos add column if not exists concluido_em               date;
alter table obra_servicos add column if not exists percentagem                numeric(5,2) not null default 0;

do $$ begin
    alter table obra_servicos add constraint obra_servicos_percentagem_0_100
        check (percentagem between 0 and 100);
exception when duplicate_object then null; end $$;

-- Os serviços já marcados como concluídos ficam a 100 %
update obra_servicos set percentagem = 100 where concluido and percentagem < 100;

-- ---------- 2. Cortes semanais ----------
create table if not exists cortes_semanais (
    id              uuid primary key default gen_random_uuid(),
    obra_id         uuid not null references obras(id) on delete cascade,
    semana          date not null,                       -- segunda-feira da semana
    estado          text not null default 'pendente'
                    check (estado in ('pendente', 'aprovado', 'rejeitado')),
    funcionario_id  uuid references funcionarios(id) on delete set null,   -- quem mediu
    notas           text check (char_length(notas) <= 2000),
    created_at      timestamptz not null default now(),
    atualizado_em   timestamptz not null default now(),
    tratado_em      timestamptz,
    unique (obra_id, semana)
);

create table if not exists corte_linhas (
    id               uuid primary key default gen_random_uuid(),
    corte_id         uuid not null references cortes_semanais(id) on delete cascade,
    obra_servico_id  uuid not null references obra_servicos(id) on delete cascade,
    percentagem_antes numeric(5,2) not null default 0,   -- a aprovada quando se mediu
    percentagem      numeric(5,2) not null check (percentagem between 0 and 100),
    unique (corte_id, obra_servico_id)
);

create index if not exists idx_cortes_obra on cortes_semanais (obra_id, semana desc);

alter table cortes_semanais enable row level security;
alter table corte_linhas    enable row level security;

drop policy if exists "cortes_semanais: admin gere tudo" on cortes_semanais;
create policy "cortes_semanais: admin gere tudo" on cortes_semanais
    for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "corte_linhas: admin gere tudo" on corte_linhas;
create policy "corte_linhas: admin gere tudo" on corte_linhas
    for all to authenticated using (is_admin()) with check (is_admin());

revoke all on cortes_semanais, corte_linhas from anon;
grant select, insert, update, delete on cortes_semanais, corte_linhas to authenticated;

-- Segunda-feira da semana de hoje, na hora de Lisboa
create or replace function public.semana_atual()
returns date language sql stable as $$
    select date_trunc('week', (now() at time zone 'Europe/Lisbon'))::date
$$;

-- Telemóvel: os pacotes da obra para medir, com a % aprovada e a que já
-- estiver no corte pendente desta semana.
create or replace function public.corte_pacotes(p_device text, p_obra_id uuid)
returns table(id uuid, zona text, nome text, criterio_fim text,
              percentagem numeric, proposta numeric, estado_corte text)
language plpgsql stable security definer
set search_path to 'public'
as $$
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
$$;

-- Telemóvel: grava (ou corrige) o corte desta semana. p_linhas é uma lista
-- [{ "id": <pacote>, "percentagem": 0..100 }]. Só pacotes da obra entram.
create or replace function public.corte_gravar(p_device text, p_obra_id uuid, p_linhas jsonb, p_notas text)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $$
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
$$;

-- App (Alcindo): aprovar um corte passa as % para os pacotes; a 100 % o
-- pacote fica concluído nesse dia. Tudo de uma vez ou nada.
create or replace function public.corte_aprovar(p_corte_id uuid)
returns void
language plpgsql security invoker
set search_path to 'public'
as $$
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
$$;

revoke execute on function public.corte_pacotes(text, uuid)               from public;
revoke execute on function public.corte_gravar(text, uuid, jsonb, text)   from public;
revoke execute on function public.corte_aprovar(uuid)                     from public;
grant  execute on function public.corte_pacotes(text, uuid)               to anon, authenticated;
grant  execute on function public.corte_gravar(text, uuid, jsonb, text)   to anon, authenticated;
grant  execute on function public.corte_aprovar(uuid)                     to authenticated;

-- Na entrada do ponto, a lista de serviços mostra a zona antes do nome
create or replace function public.servicos_para_marcar(p_device text, p_obra_id uuid)
returns table(id uuid, nome text)
language plpgsql
stable security definer
set search_path to 'public'
as $$
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
$$;

-- ---------- 3. Recusar orçamento na área do cliente ----------
alter table orcamento_respostas drop constraint if exists orcamento_respostas_resposta_check;
alter table orcamento_respostas add constraint orcamento_respostas_resposta_check
    check (resposta in ('aceite', 'alteracoes', 'recusa'));
