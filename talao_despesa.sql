-- =======================================================
-- FOTO DO TALÃO JUNTO DA DESPESA
-- Acrescenta ao movimento financeiro o sítio onde fica guardada a foto do
-- talão ou da fatura (Financeiro › Fluxo › Novo movimento › "Foto do talão").
--
-- A foto fica no armazenamento privado que já existe para os documentos de
-- obra ("obra-documentos"), numa pasta "taloes/". Só os administradores a
-- abrem: as regras desse armazenamento já são essas, não é preciso criar
-- mais nenhuma.
--
-- Não mexe em nenhum dado existente: só cria uma coluna vazia.
-- Correr uma vez no SQL Editor do Supabase. Pode correr-se outra vez sem mal.
-- =======================================================

alter table public.movimentos_financeiros
    add column if not exists talao_caminho text;

comment on column public.movimentos_financeiros.talao_caminho is
    'Caminho da foto do talão/fatura no bucket obra-documentos (pasta taloes/). Vazio quando não há foto.';
