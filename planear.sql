-- =======================================================
-- Planear (2026-11-17): plano das próximas 3 semanas com "está tudo
-- pronto?" e composições de custo na Biblioteca de serviços.
--
-- Correr uma vez no SQL Editor do Supabase. Pode correr-se outra vez.
--
-- 1. tarefas: duas verificações marcadas à mão antes de a tarefa entrar na
--    semana: o material e a decisão do cliente. A terceira (a equipa) é
--    calculada pela app: tem gente atribuída e ninguém de folga nesse dia.
--      por_ver      ainda ninguém viu (amarelo)
--      falta        falta (vermelho)
--      pronto       está tratado (verde)
--      nao_precisa  esta tarefa não precisa (verde)
-- 2. biblioteca_servicos / biblioteca_materiais: a estrutura das composições
--    da DDC (horas de mão de obra por unidade × €/hora + material por unidade
--    × preço + equipamento), com os NOSSOS preços: o material liga a um
--    artigo do Stock (usa o preço atual) ou leva um preço escrito à mão.
-- =======================================================

-- ---------- 1. Tarefas: está tudo pronto? ----------
alter table tarefas add column if not exists material_estado text not null default 'por_ver';
alter table tarefas add column if not exists decisao_estado  text not null default 'por_ver';
alter table tarefas drop constraint if exists tarefas_material_estado_check;
alter table tarefas add constraint tarefas_material_estado_check
    check (material_estado in ('por_ver', 'falta', 'pronto', 'nao_precisa'));
alter table tarefas drop constraint if exists tarefas_decisao_estado_check;
alter table tarefas add constraint tarefas_decisao_estado_check
    check (decisao_estado in ('por_ver', 'falta', 'pronto', 'nao_precisa'));

-- ---------- 2. Composições de custo ----------
alter table biblioteca_servicos  add column if not exists custo_mo_dia         numeric(10,2);          -- € por dia da equipa que faz o rendimento
alter table biblioteca_servicos  add column if not exists equipamento_unidade  numeric(10,2) default 0; -- € por unidade (andaimes, máquinas…)
alter table biblioteca_servicos  add column if not exists margem               numeric(5,3) default 1.3;
alter table biblioteca_materiais add column if not exists artigo_id    uuid references artigos(id) on delete set null;
alter table biblioteca_materiais add column if not exists preco_manual numeric(12,4);   -- € por unidade do material
alter table biblioteca_materiais add column if not exists perdas_pct   numeric(5,2) default 0;
