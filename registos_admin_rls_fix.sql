-- =======================================================
-- CORRECÇÃO RLS: registos_admin
-- Executar no Supabase SQL Editor se o delete estiver a falhar
-- =======================================================

-- Remover policy antiga
drop policy if exists "registos_admin: só autenticados" on registos_admin;

-- Policies separadas por operação (mais seguro e compatível com RLS)
create policy "registos_admin: select"
    on registos_admin for select
    to authenticated
    using (true);

create policy "registos_admin: insert"
    on registos_admin for insert
    to authenticated
    with check (true);

create policy "registos_admin: update"
    on registos_admin for update
    to authenticated
    using (true)
    with check (true);

create policy "registos_admin: delete"
    on registos_admin for delete
    to authenticated
    using (true);
