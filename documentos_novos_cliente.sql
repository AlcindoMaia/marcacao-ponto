-- =======================================================
-- DOCUMENTOS NOVOS NA ÁREA DO CLIENTE
-- O que fica "Visível ao cliente" aparece ao cliente no topo da página,
-- em "Novo esta semana", durante 7 dias ou até ele carregar em
-- "Tomei conhecimento". Depois passa para a sua secção normal.
--
--   visivel_desde   quando o documento ficou visível ao cliente (não é a
--                   data do carregamento: um ficheiro antigo que só hoje
--                   passa a visível conta como novo a partir de hoje)
--   cliente_viu_em  quando o cliente carregou em "Tomei conhecimento"
--
-- Corre uma vez no SQL Editor do Supabase. Pode correr-se de novo sem mal.
-- =======================================================

alter table obra_documentos add column if not exists visivel_desde  timestamptz;
alter table obra_documentos add column if not exists cliente_viu_em timestamptz;

-- Os que já estão visíveis: contam desde que foram carregados
update obra_documentos set visivel_desde = created_at
 where visivel_cliente and visivel_desde is null;

-- Sempre que um documento passa a visível, a contagem recomeça e o
-- "tomei conhecimento" anterior deixa de valer
create or replace function obra_documentos_visivel_desde() returns trigger
language plpgsql as $$
begin
    if new.visivel_cliente and (tg_op = 'INSERT' or not coalesce(old.visivel_cliente, false)) then
        new.visivel_desde  := now();
        new.cliente_viu_em := null;
    end if;
    return new;
end $$;

drop trigger if exists trg_obra_documentos_visivel_desde on obra_documentos;
create trigger trg_obra_documentos_visivel_desde
    before insert or update of visivel_cliente on obra_documentos
    for each row execute function obra_documentos_visivel_desde();
