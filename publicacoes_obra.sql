-- =======================================================
-- PUBLICAR DA OBRA (área do funcionário)
-- Quem está na obra publica fotos e uma nota a partir do telemóvel. Se
-- marcar "é um problema", fica aberto até o Alcindo o dar como resolvido,
-- e o aviso chega-lhe ao telemóvel (tipo "obra" dos avisos).
--
-- As fotos vão para o bucket privado obra-documentos, na pasta
-- equipa/<número do telemóvel>/<obra>/..., e ficam também na lista de
-- documentos da obra (tipo foto, escondidas do cliente até as mostrares).
--
-- O telemóvel do funcionário não tem sessão: como no ponto, é reconhecido
-- pelo número guardado no browser (funcionarios.device_id). Só pode
-- CARREGAR ficheiros para a sua própria pasta; não pode ler, trocar nem
-- apagar nada.
--
-- Correr no SQL Editor do Supabase. Pode correr-se mais de uma vez.
-- =======================================================

create table if not exists obra_publicacoes (
    id              uuid primary key default gen_random_uuid(),
    obra_id         uuid not null references obras(id) on delete cascade,
    funcionario_id  uuid references funcionarios(id) on delete set null,
    texto           text check (char_length(texto) <= 2000),
    problema        boolean not null default false,
    urgente         boolean not null default false,
    -- só para problemas: aberto até alguém o resolver
    estado          text check (estado in ('aberto', 'resolvido')),
    resolucao       text check (char_length(resolucao) <= 2000),
    resolvido_em    timestamptz,
    visto_em        timestamptz,          -- o Alcindo já viu (publicações que não são problema)
    created_at      timestamptz not null default now(),
    constraint obra_publicacoes_estado_ok check (problema = (estado is not null))
);

create index if not exists idx_obra_publicacoes_obra on obra_publicacoes (obra_id, created_at desc);
create index if not exists idx_obra_publicacoes_abertas on obra_publicacoes (estado) where estado = 'aberto';

alter table obra_documentos add column if not exists publicacao_id uuid references obra_publicacoes(id) on delete set null;

alter table obra_publicacoes enable row level security;
drop policy if exists "obra_publicacoes: admin gere tudo" on obra_publicacoes;
create policy "obra_publicacoes: admin gere tudo" on obra_publicacoes
    for all to authenticated using (is_admin()) with check (is_admin());
revoke all on obra_publicacoes from anon;
grant select, insert, update, delete on obra_publicacoes to authenticated;

-- ---------- o telemóvel está registado e ativo? ----------
-- Usada pela regra do Storage (que corre como anon e não lê funcionarios).
-- Também trava enchimentos: no máximo 60 fotos por telemóvel em 24 horas.
create or replace function public.dispositivo_ativo(p_device text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
    select coalesce(p_device is not null and length(p_device) >= 16
           and exists (select 1 from funcionarios f where f.device_id = p_device and f.ativo)
           and (select count(*) from storage.objects s
                 where s.bucket_id = 'obra-documentos'
                   and s.name like 'equipa/' || replace(replace(p_device, '%', ''), '_', '') || '/%'
                   and s.created_at > now() - interval '24 hours') < 60, false);
$$;
revoke execute on function public.dispositivo_ativo(text) from public;
grant  execute on function public.dispositivo_ativo(text) to anon, authenticated;

-- ---------- Storage: o telemóvel só carrega fotos para a sua pasta ----------
drop policy if exists "obra-documentos: equipa carrega fotos" on storage.objects;
create policy "obra-documentos: equipa carrega fotos" on storage.objects
    for insert to anon
    with check (
        bucket_id = 'obra-documentos'
        and (storage.foldername(name))[1] = 'equipa'
        and public.dispositivo_ativo((storage.foldername(name))[2])
        and lower(name) ~ '\.jpe?g$'
    );

-- ---------- publicar ----------
-- p_fotos: [{ "caminho": "equipa/<device>/<obra>/....jpg", "nome": "...", "tamanho": 123 }]
-- Cada caminho tem de estar na pasta deste telemóvel e já existir no Storage.
create or replace function public.publicar_obra(p_device text, p_obra_id uuid, p_texto text,
                                                p_problema boolean, p_urgente boolean, p_fotos jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_func  record;
    v_id    uuid;
    v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
    v_fotos jsonb := coalesce(p_fotos, '[]'::jsonb);
    v_f     jsonb;
    v_cam   text;
begin
    select f.id, f.nome into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func.id is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;
    if not exists (select 1 from obras o where o.id = p_obra_id and o.estado = 'ativa') then
        raise exception 'obra_invalida' using errcode = '22023';
    end if;
    if jsonb_typeof(v_fotos) <> 'array' or jsonb_array_length(v_fotos) > 6 then
        raise exception 'fotos_invalidas' using errcode = '22023';
    end if;
    if v_texto is null and jsonb_array_length(v_fotos) = 0 then
        raise exception 'publicacao_vazia' using errcode = '22023';
    end if;
    if coalesce(p_problema, false) and v_texto is null then
        raise exception 'problema_sem_texto' using errcode = '22023';
    end if;
    if char_length(coalesce(v_texto, '')) > 2000 then
        raise exception 'texto_longo' using errcode = '22023';
    end if;

    -- As fotos têm de ser deste telemóvel e desta obra, e já estar carregadas
    for v_f in select * from jsonb_array_elements(v_fotos) loop
        v_cam := v_f->>'caminho';
        if v_cam is null
           or left(v_cam, length('equipa/' || p_device || '/' || p_obra_id::text || '/'))
              <> 'equipa/' || p_device || '/' || p_obra_id::text || '/'
           or v_cam like '%..%'
           or not exists (select 1 from storage.objects s
                           where s.bucket_id = 'obra-documentos' and s.name = v_cam
                             and lower(coalesce(s.metadata->>'mimetype', '')) = 'image/jpeg')
           or exists (select 1 from obra_documentos d where d.caminho = v_cam) then
            raise exception 'foto_invalida' using errcode = '22023';
        end if;
    end loop;

    insert into obra_publicacoes (obra_id, funcionario_id, texto, problema, urgente, estado)
    values (p_obra_id, v_func.id, v_texto, coalesce(p_problema, false),
            coalesce(p_problema, false) and coalesce(p_urgente, false),
            case when coalesce(p_problema, false) then 'aberto' end)
    returning id into v_id;

    insert into obra_documentos (obra_id, tipo, nome_ficheiro, caminho, mime, tamanho,
                                 visivel_cliente, estado, criado_por, publicacao_id)
    select p_obra_id, 'foto', left(coalesce(nullif(x->>'nome', ''), 'foto.jpg'), 200), x->>'caminho',
           'image/jpeg', nullif(s.metadata->>'size', '')::bigint, false, 'arquivado', v_func.nome, v_id
      from jsonb_array_elements(v_fotos) x
      join storage.objects s on s.bucket_id = 'obra-documentos' and s.name = x->>'caminho';

    return v_id;
end;
$$;

-- ---------- as minhas últimas publicações nesta obra ----------
create or replace function public.publicacoes_minhas(p_device text, p_obra_id uuid)
returns table(id uuid, texto text, problema boolean, urgente boolean, estado text,
              resolucao text, fotos int, created_at timestamptz)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v_func uuid;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;
    return query
    select p.id, p.texto, p.problema, p.urgente, p.estado, p.resolucao,
           (select count(*)::int from obra_documentos d where d.publicacao_id = p.id), p.created_at
      from obra_publicacoes p
     where p.funcionario_id = v_func and p.obra_id = p_obra_id
     order by p.created_at desc
     limit 5;
end;
$$;

revoke execute on function public.publicar_obra(text, uuid, text, boolean, boolean, jsonb) from public;
revoke execute on function public.publicacoes_minhas(text, uuid) from public;
grant  execute on function public.publicar_obra(text, uuid, text, boolean, boolean, jsonb) to anon, authenticated;
grant  execute on function public.publicacoes_minhas(text, uuid) to anon, authenticated;

-- ---------- avisos no telemóvel: tipo novo "obra" ----------
-- Quem já tem os avisos ligados passa a receber também os da obra.
alter table push_subscricoes alter column tipos set default array['clientes','obra','resumo','registo','ponto','rh'];
-- Só na primeira vez (marca em push_config): quem desligar este tipo nos
-- avisos não o volta a ter ligado se o ficheiro for corrido outra vez.
alter table push_config add column if not exists obra_ligado boolean not null default false;
update push_subscricoes set tipos = array_append(tipos, 'obra')
 where not ('obra' = any(tipos))
   and not (select obra_ligado from push_config where id = 1);
update push_config set obra_ligado = true where id = 1;

-- Confirmar: deve devolver a tabela e as duas funções
select (select count(*) from obra_publicacoes) as publicacoes,
       to_regprocedure('public.publicar_obra(text, uuid, text, boolean, boolean, jsonb)') is not null as publicar,
       exists (select 1 from pg_policies where policyname = 'obra-documentos: equipa carrega fotos') as regra_fotos;
