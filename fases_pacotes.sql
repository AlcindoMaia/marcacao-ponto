-- =======================================================
-- FASES E PACOTES (subfases) DA OBRA
-- Cada pacote de trabalho da obra (obra_servicos) pode pertencer a uma
-- fase da aba Andamento (obra_fases). A aba mostra os pacotes por baixo
-- da fase, com o valor e a % feita; o assistente (função sugerir-fases)
-- propõe as fases e os pacotes a partir do orçamento aceite.
-- Apagar uma fase não apaga os pacotes: ficam só sem fase.
-- Corre-se uma vez no SQL Editor do Supabase; pode correr outra vez sem mal.
-- =======================================================

alter table obra_servicos
    add column if not exists fase_id uuid references obra_fases(id) on delete set null;

create index if not exists idx_obra_servicos_fase on obra_servicos (fase_id);
