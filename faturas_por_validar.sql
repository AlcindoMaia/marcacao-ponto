-- =======================================================
-- FATURAS POR VALIDAR
-- O assistente lê as faturas que chegam ao e-mail da empresa e deixa-as
-- aqui, já preenchidas. No Financeiro › Fluxo aparecem numa lista
-- "Por validar": o Alcindo abre cada uma, confere e grava, ou rejeita.
-- Nada entra em movimentos_financeiros sem esse clique.
-- Correr uma vez no SQL Editor do Supabase.
-- =======================================================

create table if not exists faturas_por_validar (
    id            uuid primary key default gen_random_uuid(),
    created_at    timestamptz not null default now(),
    origem        text not null default 'email',      -- de onde veio (email, drive...)
    origem_ref    text,                               -- id da mensagem do Gmail, ficheiro...
    documento     jsonb not null,                     -- a fatura lida, no formato do ler-fatura
    resumo        text,                               -- o que o assistente achou (obra, pago, ferramentas)
    estado        text not null default 'pendente'
                  check (estado in ('pendente','validada','rejeitada')),
    movimento_id  uuid references movimentos_financeiros(id) on delete set null,
    decidido_em   timestamptz
);

-- A mesma fatura do mesmo fornecedor não fica duas vezes à espera
create unique index if not exists faturas_por_validar_unica
    on faturas_por_validar ((documento->>'fornecedor_nif'), (documento->>'numero_documento'))
    where estado = 'pendente';

create index if not exists faturas_por_validar_estado on faturas_por_validar (estado, created_at);

alter table faturas_por_validar enable row level security;
drop policy if exists "faturas_por_validar: admin gere tudo" on faturas_por_validar;
create policy "faturas_por_validar: admin gere tudo" on faturas_por_validar
    for all to authenticated using (is_admin()) with check (is_admin());
revoke all on faturas_por_validar from anon;
grant select, insert, update, delete on faturas_por_validar to authenticated;
