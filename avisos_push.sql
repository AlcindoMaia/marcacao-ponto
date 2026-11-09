-- =======================================================
-- AVISOS NO TELEMÓVEL (Web Push)
-- Correr uma vez no SQL Editor do Supabase. Pode correr-se outra vez
-- sem estragar nada.
--
-- O que cria:
--   push_subscricoes  os telemóveis/computadores que ativaram os avisos,
--                     e que tipos de aviso cada um quer
--   push_enviados     o que já foi avisado (para não avisar duas vezes)
--   push_config       as chaves do envio (ninguém as lê pela app)
--   um relógio (pg_cron) que chama a função "avisos" de 5 em 5 minutos
-- =======================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- telemóveis com avisos ativos ----------
create table if not exists public.push_subscricoes (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
    endpoint     text not null unique,
    p256dh       text not null,
    auth         text not null,
    -- clientes = resposta a orçamento / pedido do cliente (na hora)
    -- resumo   = "Precisa de ti" às 8h
    -- registo  = Registo diário por fazer às 19h
    -- ponto    = saída do ponto esquecida às 19h
    -- rh       = documentos de RH a caducar (segunda às 8h)
    tipos        text[] not null default array['clientes','resumo','registo','ponto','rh'],
    aparelho     text,
    created_at   timestamptz not null default now(),
    ultimo_envio timestamptz,
    ultimo_erro  text
);

alter table public.push_subscricoes enable row level security;
drop policy if exists push_subscricoes_proprias on public.push_subscricoes;
create policy push_subscricoes_proprias on public.push_subscricoes
    for all to authenticated
    using (user_id = auth.uid() and public.is_admin())
    with check (user_id = auth.uid() and public.is_admin());
revoke all on public.push_subscricoes from anon;
grant select, insert, update, delete on public.push_subscricoes to authenticated;

-- ---------- o que já foi avisado ----------
create table if not exists public.push_enviados (
    chave      text primary key,
    enviado_em timestamptz not null default now()
);
alter table public.push_enviados enable row level security;
revoke all on public.push_enviados from anon, authenticated;

-- ---------- chaves (só a função as lê, com a chave de serviço) ----------
create table if not exists public.push_config (
    id            int primary key default 1 check (id = 1),
    vapid_publica text,
    vapid_privada text,
    chave_cron    text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

-- ---------- relógio: de 5 em 5 minutos ----------
-- A função decide o que enviar conforme a hora de Lisboa (8h, 19h) e
-- avisa na hora as respostas e os pedidos dos clientes.
select cron.unschedule(jobid) from cron.job where jobname = 'avisos-telemovel';
select cron.schedule('avisos-telemovel', '*/5 * * * *', $cron$
    select net.http_post(
        url     := 'https://npyosbigynxmxdakcymg.supabase.co/functions/v1/avisos',
        headers := jsonb_build_object(
            'Content-Type',   'application/json',
            'x-avisos-chave', (select chave_cron from public.push_config where id = 1)),
        body    := '{"acao":"cron"}'::jsonb,
        timeout_milliseconds := 25000)
$cron$);

-- Confirmar: deve aparecer uma linha "avisos-telemovel"
select jobname, schedule, active from cron.job where jobname = 'avisos-telemovel';
