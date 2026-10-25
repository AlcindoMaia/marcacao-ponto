-- =======================================================
-- ÁREA DO CLIENTE (só consulta)
-- Cada cliente tem um link fixo, cliente.html?t=<código>, enviado por
-- WhatsApp. O código é longo e aleatório (gerado na app) e pode ser desligado
-- ou trocado a qualquer momento na ficha do cliente.
--
-- O cliente NÃO lê as tabelas: a página chama a função area-cliente, que
-- confirma o código e devolve só as obras do cliente e os documentos
-- marcados "Visível ao cliente", sem nenhum valor interno.
-- =======================================================

alter table clientes add column if not exists token_acesso     text;
alter table clientes add column if not exists acesso_ativo     boolean not null default false;
alter table clientes add column if not exists acesso_criado_em timestamptz;
alter table clientes add column if not exists ultimo_acesso    timestamptz;

create unique index if not exists clientes_token_acesso_unico
    on clientes (token_acesso) where token_acesso is not null;
