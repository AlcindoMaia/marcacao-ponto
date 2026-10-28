-- =======================================================
-- RESPOSTAS DO CLIENTE A ORÇAMENTOS (Área do cliente)
-- Na Área do cliente, um orçamento "enviado" tem dois botões: "Aceito este
-- orçamento" e "Pedir alterações". A resposta fica guardada aqui e NÃO muda
-- o orçamento: o Alcindo vê-a no sino e na lista de orçamentos e confirma
-- (aí o orçamento passa a aceite e os serviços da obra são criados) ou
-- ignora. Fica o registo de quando e de onde o cliente respondeu.
--
-- O cliente não lê nem escreve esta tabela: só a função area-cliente
-- (chave de serviço) a escreve, depois de confirmar o link do cliente.
-- =======================================================

create table if not exists orcamento_respostas (
    id            uuid primary key default gen_random_uuid(),
    orcamento_id  uuid not null references orcamentos(id) on delete cascade,
    cliente_id    uuid references clientes(id) on delete set null,
    documento_id  uuid references obra_documentos(id) on delete set null,
    resposta      text not null check (resposta in ('aceite', 'alteracoes')),
    comentario    text check (char_length(comentario) <= 2000),
    ip            text,
    navegador     text,
    created_at    timestamptz not null default now(),
    -- preenchidos quando o Alcindo trata a resposta
    tratada_em    timestamptz,
    decisao       text check (decisao in ('confirmada', 'ignorada', 'vista'))
);

-- Só uma resposta por tratar de cada vez em cada orçamento
create unique index if not exists orcamento_respostas_uma_pendente
    on orcamento_respostas (orcamento_id) where tratada_em is null;

alter table orcamento_respostas enable row level security;

drop policy if exists "orcamento_respostas: admin gere tudo" on orcamento_respostas;
create policy "orcamento_respostas: admin gere tudo" on orcamento_respostas
    for all to authenticated
    using (is_admin()) with check (is_admin());

revoke all on orcamento_respostas from anon;
grant select, insert, update, delete on orcamento_respostas to authenticated;
