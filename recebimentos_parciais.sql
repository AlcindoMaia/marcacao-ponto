-- ═══════════════════════════════════════════════════════════════════════════
-- Pagamentos e recebimentos parciais de faturas
-- ═══════════════════════════════════════════════════════════════════════════
-- Até aqui uma fatura só tinha dois estados: "pago" ou "por pagar". Um recibo
-- de metade do valor ou dava a fatura como paga na totalidade, ou não ficava
-- registado em lado nenhum. Esta tabela guarda cada pagamento (ou recebimento)
-- de uma fatura com o seu valor. A fatura passa a "pago" sozinha quando a soma
-- dos pagamentos chega ao total; até lá fica "por pagar" e a app mostra o que
-- já entrou e o que falta.
--
-- Correr uma vez no SQL Editor do Supabase. Pode correr-se outra vez sem
-- estragar nada.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pagamentos_fatura (
    id                uuid primary key default gen_random_uuid(),
    movimento_id      uuid not null references public.movimentos_financeiros(id) on delete cascade,
    data              date not null,
    valor             numeric(12,2) not null check (valor > 0),   -- com IVA, como no banco
    recibo            text,                                        -- número do recibo (ex.: RC 2026/9)
    obra_documento_id uuid references public.obra_documentos(id) on delete set null,
    created_at        timestamptz not null default now()
);

-- O mesmo recibo não se regista duas vezes na mesma fatura
-- (sem número de recibo podem registar-se vários)
create unique index if not exists pagamentos_fatura_recibo_unico
    on public.pagamentos_fatura (movimento_id, recibo);
create index if not exists pagamentos_fatura_movimento on public.pagamentos_fatura (movimento_id);

alter table public.pagamentos_fatura enable row level security;
drop policy if exists "pagamentos_fatura: só admin" on public.pagamentos_fatura;
create policy "pagamentos_fatura: só admin" on public.pagamentos_fatura
    for all to authenticated using (is_admin()) with check (is_admin());

-- Quando os pagamentos cobrem o total, a fatura fica "pago". Se um pagamento
-- for apagado e deixar de cobrir, volta a "por pagar". Uma fatura marcada à
-- mão como paga, sem pagamentos registados, não é tocada.
create or replace function public.pagamentos_fatura_estado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    mov   uuid := coalesce(new.movimento_id, old.movimento_id);
    soma  numeric;
    total numeric;
begin
    select coalesce(sum(valor), 0) into soma from pagamentos_fatura where movimento_id = mov;
    select valor_total into total from movimentos_financeiros where id = mov;
    if total is null then return null; end if;
    if soma >= total - 0.01 then
        update movimentos_financeiros set estado_pagamento = 'pago'
         where id = mov and estado_pagamento <> 'pago';
    elsif tg_op = 'DELETE' or tg_op = 'UPDATE' then
        update movimentos_financeiros set estado_pagamento = 'por_pagar'
         where id = mov and estado_pagamento = 'pago';
    end if;
    return null;
end $$;

drop trigger if exists pagamentos_fatura_estado on public.pagamentos_fatura;
create trigger pagamentos_fatura_estado
    after insert or update or delete on public.pagamentos_fatura
    for each row execute function public.pagamentos_fatura_estado();


-- ═══════════════════════════════════════════════════════════════════════════
-- Caso de 16/11/2026: obra José Hermenegildo
-- Fatura FT 2026/12 (3 856,05 €) recebida em parte pelo recibo RC 2026/9
-- de 15/11/2026: 1 930,00 €. Ficam 1 926,05 € por receber.
-- (o recibo foi carregado antes da fatura, por isso não ficou ligado)
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.pagamentos_fatura (movimento_id, data, valor, recibo, obra_documento_id)
select '0e65ff5c-3c9b-4f45-a513-ec57b4f04532', '2026-11-15', 1930.00, 'RC 2026/9', '1721ac41-6fe8-494f-8e32-9c11b2910ed7'
where exists (select 1 from public.movimentos_financeiros where id = '0e65ff5c-3c9b-4f45-a513-ec57b4f04532')
on conflict do nothing;

update public.obra_documentos
   set movimento_id = '0e65ff5c-3c9b-4f45-a513-ec57b4f04532'
 where id = '1721ac41-6fe8-494f-8e32-9c11b2910ed7' and movimento_id is null;

update public.movimentos_financeiros
   set observacoes = observacoes || ' · Recebido 1930,00 € pelo recibo RC 2026/9 de 15/11/2026'
 where id = '0e65ff5c-3c9b-4f45-a513-ec57b4f04532'
   and observacoes not like '%RC 2026/9%';

-- Confirmação: deve mostrar FT 2026/12, por_pagar, recebido 1930.00, falta 1926.05
select m.referencia, m.estado_pagamento, m.valor_total,
       coalesce(sum(p.valor), 0) as recebido,
       m.valor_total - coalesce(sum(p.valor), 0) as falta
  from public.movimentos_financeiros m
  left join public.pagamentos_fatura p on p.movimento_id = m.id
 where m.id = '0e65ff5c-3c9b-4f45-a513-ec57b4f04532'
 group by m.id;
