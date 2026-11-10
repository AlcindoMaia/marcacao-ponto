-- =======================================================
-- QUEM TEM CONTRATO DE TRABALHO
-- Correr uma vez no SQL Editor do Supabase. Pode correr-se outra vez.
--
-- Quem não tem contrato (sócio-gerente, familiar, independente) deixa de
-- aparecer no sino com "contrato / Segurança Social / medicina / EPI em
-- falta". Continua a pedir-se só o cartão de cidadão.
-- =======================================================

alter table public.funcionarios
    add column if not exists com_contrato boolean not null default true;

-- Hoje (10/11/2026) só o Jacob Lucas tem contrato de trabalho
update public.funcionarios set com_contrato = false
 where id in ('fc6ea792-8c9a-45f9-abe7-90fdce16486f',   -- Alcindo Maia
              'a5d71ca6-4cdd-4205-b2a3-b2211a509e42',   -- Pai
              '38f3414a-f07e-45d2-b8ea-67bf71154b6e');  -- Ramiro

-- Confirmar: só o Jacob deve aparecer com "true"
select nome, com_contrato from public.funcionarios where ativo order by nome;
