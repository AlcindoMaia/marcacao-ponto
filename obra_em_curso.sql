-- =======================================================
-- Obra em curso (2026-11-17): trabalhos a mais com aceite do cliente,
-- lista de remates e auto de entrega.
--
-- Correr uma vez no SQL Editor do Supabase. Pode correr-se outra vez sem
-- estragar nada (tudo "if not exists" / "or replace").
--
-- 1. trabalhos_mais: um extra pedido em obra. Fica em rascunho até o Alcindo
--    o enviar; o cliente aceita ou recusa na Área do cliente (só a função
--    area-cliente, com a chave de serviço, escreve a resposta). Quando passa a
--    "aceite", nasce sozinho um serviço "extra" na obra com o mesmo valor, e
--    o valor da obra sobe (as contas já somam os serviços sem orçamento).
-- 2. obra_remates: defeitos da vistoria final, por divisão, com foto antes e
--    depois, responsável e prazo. O cliente vê os visíveis e confirma os
--    resolvidos.
-- 3. obras.data_entrega: dia em que a obra foi entregue (auto de entrega).
-- =======================================================

-- ---------- 1. Trabalhos a mais ----------
create table if not exists trabalhos_mais (
    id                  uuid primary key default gen_random_uuid(),
    obra_id             uuid not null references obras(id) on delete cascade,
    pedido_id           uuid references cliente_pedidos(id) on delete set null,
    descricao           text not null check (char_length(descricao) between 1 and 2000),
    valor_sem_iva       numeric(12,2) not null default 0 check (valor_sem_iva >= 0),
    taxa_iva            numeric(5,2) not null default 23,
    dias_prazo          integer check (dias_prazo between 0 and 365),   -- quanto atrasa a obra
    estado              text not null default 'rascunho'
                        check (estado in ('rascunho', 'enviado', 'aceite', 'recusado', 'cancelado')),
    enviado_em          timestamptz,
    resposta_em         timestamptz,
    resposta_nome       text check (char_length(resposta_nome) <= 120),   -- quem aceitou/recusou
    resposta_por        text check (resposta_por in ('cliente', 'alcindo')),
    motivo_recusa       text check (char_length(motivo_recusa) <= 2000),
    resposta_ip         text,
    resposta_navegador  text,
    visto_em            timestamptz,   -- o Alcindo já viu a resposta do cliente
    servico_id          uuid references obra_servicos(id) on delete set null,
    created_at          timestamptz not null default now()
);
create index if not exists idx_trabalhos_mais_obra on trabalhos_mais (obra_id, created_at);

-- Aceite: cria o serviço extra da obra (uma só vez)
create or replace function trabalho_mais_aceite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_ordem integer;
begin
    if new.estado = 'aceite' and new.servico_id is null
       and (tg_op = 'INSERT' or old.estado is distinct from 'aceite') then
        select coalesce(max(ordem), 0) + 1 into v_ordem from obra_servicos where obra_id = new.obra_id;
        insert into obra_servicos (obra_id, nome, valor_orcamento, horas_orcamento, extra, ordem)
        values (new.obra_id, left('Extra: ' || new.descricao, 200), new.valor_sem_iva, 0, true, v_ordem)
        returning id into new.servico_id;
    end if;
    return new;
end $$;

drop trigger if exists trg_trabalho_mais_aceite on trabalhos_mais;
create trigger trg_trabalho_mais_aceite before insert or update on trabalhos_mais
    for each row execute function trabalho_mais_aceite();

alter table trabalhos_mais enable row level security;
drop policy if exists "trabalhos_mais: admin gere tudo" on trabalhos_mais;
create policy "trabalhos_mais: admin gere tudo" on trabalhos_mais
    for all to authenticated using (is_admin()) with check (is_admin());
revoke all on trabalhos_mais from anon;
grant select, insert, update, delete on trabalhos_mais to authenticated;

-- ---------- 2. Remates ----------
create table if not exists obra_remates (
    id                          uuid primary key default gen_random_uuid(),
    obra_id                     uuid not null references obras(id) on delete cascade,
    divisao                     text check (char_length(divisao) <= 120),
    descricao                   text not null check (char_length(descricao) between 1 and 2000),
    foto_antes                  text,   -- caminho no bucket obra-documentos
    foto_depois                 text,
    responsavel_funcionario_id  uuid references funcionarios(id) on delete set null,
    responsavel_externo         text check (char_length(responsavel_externo) <= 120),
    prazo                       date,
    estado                      text not null default 'aberto' check (estado in ('aberto', 'resolvido')),
    resolvido_em                date,
    cliente_confirmou_em        timestamptz,
    visivel_cliente             boolean not null default true,
    created_at                  timestamptz not null default now()
);
create index if not exists idx_obra_remates_obra on obra_remates (obra_id, estado);

alter table obra_remates enable row level security;
drop policy if exists "obra_remates: admin gere tudo" on obra_remates;
create policy "obra_remates: admin gere tudo" on obra_remates
    for all to authenticated using (is_admin()) with check (is_admin());
revoke all on obra_remates from anon;
grant select, insert, update, delete on obra_remates to authenticated;

-- ---------- 3. Data de entrega da obra ----------
alter table obras add column if not exists data_entrega date;
