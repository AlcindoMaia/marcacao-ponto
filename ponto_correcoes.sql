-- =======================================================
-- CORRIGIR MARCAÇÕES DE PONTO (sobretudo saídas esquecidas)
--
-- O que estava mal:
--   * o painel gravava a hora corrigida em created_at e não em datahora.
--     As horas do Registo diário (ponto_horas.sql) usam datahora, por isso
--     as correções mudavam o que se via mas não as horas pagas;
--   * a hora ia sem fuso: no verão ficava 1 h trocada;
--   * apagar a hora da célula gravava "sem hora" e a marcação desaparecia;
--   * quem se esquecia da saída ficava com tudo trocado no dia seguinte (a
--     entrada da manhã contava como saída de ontem).
--
-- Daqui em diante:
--   * datahora é a hora que conta; created_at fica sempre o momento real em
--     que se carregou no botão (nunca mais é alterado);
--   * o painel corrige pelas funções ponto_corrigir / ponto_adicionar /
--     ponto_apagar, que guardam quem corrigiu, quando e porquê
--     (ponto_correcoes);
--   * uma entrada esquecida de um dia anterior já não faz da marcação de
--     hoje uma saída;
--   * o funcionário pode dizer a que horas saiu (ponto_declarar_saida):
--     fica "a rever" até o Alcindo confirmar.
--
-- Depende de area_funcionario.sql e ponto_horas.sql. Correr no SQL Editor
-- do Supabase. Pode correr-se mais de uma vez.
-- =======================================================

-- Histórico de correções
create table if not exists ponto_correcoes (
    id          uuid primary key default gen_random_uuid(),
    ponto_id    uuid,                 -- sem FK: a linha fica mesmo se a marcação for apagada
    funcionario_id uuid,                -- sem FK: há marcações antigas de funcionários já apagados
    acao        text not null check (acao in ('alterar', 'adicionar', 'apagar', 'declarar', 'alinhar')),
    tipo        text,
    antes       timestamptz,
    depois      timestamptz,
    motivo      text,
    feito_por   text not null,
    feito_em    timestamptz not null default now()
);
create index if not exists ponto_correcoes_func_idx on ponto_correcoes(funcionario_id, feito_em desc);
create index if not exists ponto_correcoes_ponto_idx on ponto_correcoes(ponto_id);

alter table ponto_correcoes enable row level security;
drop policy if exists "admin lê correções" on ponto_correcoes;
create policy "admin lê correções" on ponto_correcoes
    for select to authenticated using (is_admin());
revoke all on ponto_correcoes from anon;
grant select on ponto_correcoes to authenticated;

-- -------------------------------------------------------
-- Alinhar as correções antigas: até hoje o painel escrevia em created_at.
-- O que se vê agora no painel (created_at) passa a ser a hora que conta
-- (datahora), para nada mudar de sítio quando a vista passar a usar
-- datahora. Fica registado no histórico. Marcações que já passaram pelas
-- funções novas (têm histórico) nunca são tocadas, por isso correr o
-- ficheiro outra vez não desfaz correções. O gatilho das horas fica parado
-- durante este passo, para não criar linhas novas no Registo diário de
-- meses antigos.
-- -------------------------------------------------------
alter table ponto disable trigger ponto_gera_registo;

insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
select p.id, p.funcionario_id, 'alinhar', p.tipo, p.datahora, p.created_at,
       'Correção antiga feita no painel', 'sistema'
  from ponto p
 where p.created_at is not null
   and abs(extract(epoch from p.created_at - p.datahora)) > 60
   and not exists (select 1 from ponto_correcoes c where c.ponto_id = p.id);

update ponto p set datahora = p.created_at
 where p.created_at is not null
   and abs(extract(epoch from p.created_at - p.datahora)) > 60
   and exists (select 1 from ponto_correcoes c where c.ponto_id = p.id and c.acao = 'alinhar')
   and not exists (select 1 from ponto_correcoes c where c.ponto_id = p.id and c.acao <> 'alinhar');

-- Marcações cuja hora foi apagada no painel: volta a hora em que foram feitas
update ponto set created_at = datahora where created_at is null;

alter table ponto enable trigger ponto_gera_registo;

-- As linhas do Registo diário que já vinham do ponto são recalculadas
do $$
declare v_ids uuid[];
        v_id  uuid;
begin
    select array_agg(ponto_saida_id) into v_ids from registos_admin
     where origem = 'ponto' and ponto_saida_id is not null;
    foreach v_id in array coalesce(v_ids, '{}') loop
        perform ponto_gerar_registo(v_id);
    end loop;
end $$;

-- -------------------------------------------------------
-- Vista dos Registos: passa a usar datahora e o dia de Lisboa
-- (as colunas são as mesmas de antes, mais funcionario_id no fim)
-- -------------------------------------------------------
create or replace view vw_registos_ponto with (security_invoker = on) as
 WITH base AS (
         SELECT p.id,
            p.funcionario_id,
            f.nome AS funcionario,
            o.nome AS obra,
            (p.datahora AT TIME ZONE 'Europe/Lisbon')::date AS dia,
            p.datahora AS created_at,
            p.tipo,
            p.a_rever,
            p.distancia_m
           FROM ponto p
             LEFT JOIN funcionarios f ON f.id = p.funcionario_id
             LEFT JOIN obras o ON o.id = p.obra_id
        ), entradas AS (
         SELECT base.id,
            base.funcionario_id,
            base.funcionario,
            base.obra,
            base.dia,
            base.created_at AS entrada,
            row_number() OVER (PARTITION BY base.funcionario, base.obra, base.dia ORDER BY base.created_at) AS rn
           FROM base
          WHERE base.tipo = 'entrada'::text
        ), saidas AS (
         SELECT base.id,
            base.funcionario,
            base.obra,
            base.dia,
            base.created_at AS saida,
            row_number() OVER (PARTITION BY base.funcionario, base.obra, base.dia ORDER BY base.created_at) AS rn
           FROM base
          WHERE base.tipo = 'saida'::text
        ), pares AS (
         SELECT e.id AS entrada_id,
            s.id AS saida_id,
            e.funcionario_id,
            e.funcionario,
            e.obra,
            e.dia,
            e.entrada,
            s.saida,
            EXTRACT(epoch FROM s.saida - e.entrada) AS segundos
           FROM entradas e
             LEFT JOIN saidas s ON e.funcionario = s.funcionario AND e.obra = s.obra AND e.dia = s.dia AND e.rn = s.rn
        ), rever AS (
         SELECT base.funcionario,
            base.obra,
            base.dia,
            array_agg(base.id) AS ids_a_rever,
            max(base.distancia_m) AS distancia_m
           FROM base
          WHERE base.a_rever
          GROUP BY base.funcionario, base.obra, base.dia
        )
 SELECT pares.funcionario,
    pares.obra,
    pares.dia,
    min(pares.entrada) AS entrada,
    max(pares.saida) AS saida,
    max(pares.entrada_id::text)::uuid AS entrada_id,
    max(pares.saida_id::text)::uuid AS saida_id,
    sum(pares.segundos) AS total_segundos,
        CASE
            WHEN count(pares.saida) < count(pares.entrada) THEN 'Incompleto'::text
            ELSE 'OK'::text
        END AS estado,
    segundos_para_hhmm(sum(pares.segundos)) AS horas,
    (max(rever.ids_a_rever::text) IS NOT NULL) AS a_rever,
    max(rever.ids_a_rever::text)::uuid[] AS ids_a_rever,
    max(rever.distancia_m) AS distancia_m,
    max(pares.funcionario_id::text)::uuid AS funcionario_id
   FROM pares
     LEFT JOIN rever ON rever.funcionario IS NOT DISTINCT FROM pares.funcionario
                    AND rever.obra IS NOT DISTINCT FROM pares.obra
                    AND rever.dia = pares.dia
  GROUP BY pares.funcionario, pares.obra, pares.dia
  ORDER BY pares.dia DESC;

-- -------------------------------------------------------
-- Correções feitas no painel (só administradores)
-- A hora chega como dia + hora de Lisboa; o servidor faz a conta do fuso.
-- Corrigir uma marcação também a dá como vista (a_rever = false).
-- -------------------------------------------------------
create or replace function public.ponto_corrigir(p_id uuid, p_dia date, p_hora time, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_antes record;
    v_nova  timestamptz;
begin
    if not is_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
    if p_dia is null or p_hora is null then raise exception 'hora_em_falta' using errcode = '22023'; end if;

    select * into v_antes from ponto where id = p_id;
    if v_antes.id is null then raise exception 'marcacao_inexistente' using errcode = '22023'; end if;

    v_nova := (p_dia + p_hora) at time zone 'Europe/Lisbon';
    if v_nova > now() + interval '5 minutes' then
        raise exception 'hora_no_futuro' using errcode = '22023';
    end if;

    if v_nova is distinct from v_antes.datahora then
        insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
        values (p_id, v_antes.funcionario_id, 'alterar', v_antes.tipo, v_antes.datahora, v_nova,
                nullif(trim(p_motivo), ''), coalesce(auth.jwt() ->> 'email', 'painel'));
    end if;

    update ponto set datahora = v_nova, a_rever = false where id = p_id;
end;
$$;

create or replace function public.ponto_adicionar(p_funcionario uuid, p_obra uuid, p_tipo text,
                                                  p_dia date, p_hora time, p_motivo text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_nova timestamptz;
    v_id   uuid;
    v_serv uuid;
begin
    if not is_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
    if p_tipo not in ('entrada', 'saida') then raise exception 'tipo_invalido' using errcode = '22023'; end if;
    if p_dia is null or p_hora is null then raise exception 'hora_em_falta' using errcode = '22023'; end if;

    v_nova := (p_dia + p_hora) at time zone 'Europe/Lisbon';
    if v_nova > now() + interval '5 minutes' then
        raise exception 'hora_no_futuro' using errcode = '22023';
    end if;

    -- Uma entrada nova fica com o serviço da obra, se só houver um
    if p_tipo = 'entrada' then v_serv := servico_da_obra(null, p_obra); end if;

    insert into ponto (funcionario_id, obra_id, datahora, created_at, tipo, origem, a_rever, obra_servico_id)
    values (p_funcionario, p_obra, v_nova, now(), p_tipo, 'painel', false, v_serv)
    returning id into v_id;

    insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
    values (v_id, p_funcionario, 'adicionar', p_tipo, null, v_nova,
            nullif(trim(p_motivo), ''), coalesce(auth.jwt() ->> 'email', 'painel'));
    return v_id;
end;
$$;

create or replace function public.ponto_apagar(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_antes record;
begin
    if not is_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
    select * into v_antes from ponto where id = p_id;
    if v_antes.id is null then return; end if;

    insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
    values (p_id, v_antes.funcionario_id, 'apagar', v_antes.tipo, v_antes.datahora, null,
            nullif(trim(p_motivo), ''), coalesce(auth.jwt() ->> 'email', 'painel'));
    delete from ponto where id = p_id;
end;
$$;

revoke execute on function public.ponto_corrigir(uuid, date, time, text) from public, anon;
revoke execute on function public.ponto_adicionar(uuid, uuid, text, date, time, text) from public, anon;
revoke execute on function public.ponto_apagar(uuid, text) from public, anon;
grant  execute on function public.ponto_corrigir(uuid, date, time, text) to authenticated;
grant  execute on function public.ponto_adicionar(uuid, uuid, text, date, time, text) to authenticated;
grant  execute on function public.ponto_apagar(uuid, text) to authenticated;

-- -------------------------------------------------------
-- O funcionário diz a que horas saiu (app do telemóvel)
--   * p_caso 'esquecida': esqueceu-se da saída num dia anterior: cria a
--     saída desse dia;
--   * p_caso 'longe': marcou a saída longe da obra há pouco: acerta a hora
--     dessa saída para mais cedo.
-- Fica sempre "a rever": só conta para as horas depois do ✓ do Alcindo.
-- Devolve o dia a que a saída ficou.
-- -------------------------------------------------------
drop function if exists public.ponto_declarar_saida(text, time);
create or replace function public.ponto_declarar_saida(p_device text, p_caso text, p_hora time)
returns date
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_func   uuid;
    v_m      record;
    v_ent    record;
    v_dia    date;
    v_nova   timestamptz;
    v_hoje   date := (now() at time zone 'Europe/Lisbon')::date;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;
    if p_hora is null then raise exception 'hora_em_falta' using errcode = '22023'; end if;

    if p_caso = 'esquecida' then
        -- A última marcação antes de hoje tem de ser uma entrada (há no máximo 14 dias)
        select * into v_m from ponto p
         where p.funcionario_id = v_func
           and p.datahora < (v_hoje::timestamp at time zone 'Europe/Lisbon')
         order by p.datahora desc limit 1;
        if v_m.id is null or v_m.tipo <> 'entrada' then
            raise exception 'nada_para_declarar' using errcode = '22023';
        end if;
        v_dia := (v_m.datahora at time zone 'Europe/Lisbon')::date;
        if v_dia < v_hoje - 14 then
            raise exception 'nada_para_declarar' using errcode = '22023';
        end if;
        v_nova := (v_dia + p_hora) at time zone 'Europe/Lisbon';
        if v_nova <= v_m.datahora then
            raise exception 'saida_antes_da_entrada' using errcode = '22023';
        end if;

        insert into ponto (funcionario_id, obra_id, datahora, created_at, tipo, origem, a_rever)
        values (v_func, v_m.obra_id, v_nova, now(), 'saida', 'declarada', true)
        returning * into v_m;

        insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
        values (v_m.id, v_func, 'declarar', 'saida', null, v_nova,
                'Esqueceu-se de marcar a saída', 'funcionário');
        return v_dia;
    end if;

    if p_caso = 'longe' then
        -- A última marcação é uma saída de hoje, longe da obra, feita há menos de 3 h
        select * into v_m from ponto p where p.funcionario_id = v_func
         order by p.datahora desc limit 1;
        if v_m.id is null or v_m.tipo <> 'saida' or not v_m.a_rever
           or v_m.created_at < now() - interval '3 hours' then
            raise exception 'nada_para_declarar' using errcode = '22023';
        end if;
        v_dia  := (v_m.created_at at time zone 'Europe/Lisbon')::date;
        v_nova := (v_dia + p_hora) at time zone 'Europe/Lisbon';
        if v_nova >= v_m.created_at then
            raise exception 'hora_depois_da_marcacao' using errcode = '22023';
        end if;
        select * into v_ent from ponto p where p.funcionario_id = v_func and p.datahora < v_m.datahora
         order by p.datahora desc limit 1;
        if v_ent.id is not null and v_nova <= v_ent.datahora then
            raise exception 'saida_antes_da_entrada' using errcode = '22023';
        end if;

        insert into ponto_correcoes (ponto_id, funcionario_id, acao, tipo, antes, depois, motivo, feito_por)
        values (v_m.id, v_func, 'declarar', 'saida', v_m.datahora, v_nova,
                'Marcou a saída mais tarde, longe da obra', 'funcionário');
        update ponto set datahora = v_nova where id = v_m.id;
        return v_dia;
    end if;

    raise exception 'caso_invalido' using errcode = '22023';
end;
$$;

revoke execute on function public.ponto_declarar_saida(text, text, time) from public;
grant  execute on function public.ponto_declarar_saida(text, text, time) to anon, authenticated;

-- -------------------------------------------------------
-- Marcar: uma entrada de um dia anterior sem saída já não faz da marcação
-- de hoje uma saída. A entrada antiga fica "sem saída" na lista de
-- Registos para corrigir.
-- -------------------------------------------------------
create or replace function public.ponto_proximo_tipo(p_func uuid)
returns text
language sql
stable security definer
set search_path to 'public'
as $$
    select case
        when u.tipo = 'entrada'
         and (u.datahora at time zone 'Europe/Lisbon')::date = (now() at time zone 'Europe/Lisbon')::date
        then 'saida' else 'entrada' end
      from (select null::int) x
      left join lateral (select p.tipo, p.datahora from ponto p where p.funcionario_id = p_func
                          order by p.datahora desc limit 1) u on true;
$$;
revoke execute on function public.ponto_proximo_tipo(uuid) from public, anon, authenticated;

create or replace function public.ponto_marcar(p_device text, p_obra_id uuid,
                                               p_lat double precision, p_lon double precision,
                                               p_servico uuid default null)
returns table(tipo text, datahora timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_func   uuid;
    v_obra   record;
    v_dist   double precision;
    v_raio   int;
    v_tipo   text;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;

    select o.id, o.latitude, o.longitude, o.raio, o.estado into v_obra
      from obras o where o.id = p_obra_id;
    if v_obra.id is null or v_obra.estado <> 'ativa' then
        raise exception 'obra_invalida' using errcode = '22023';
    end if;

    if p_lat is null or p_lon is null then
        raise exception 'sem_localizacao' using errcode = '22023';
    end if;

    -- Distância em metros (haversine), calculada no servidor
    if v_obra.latitude is not null and v_obra.longitude is not null then
        v_raio := coalesce(v_obra.raio, 120);
        v_dist := 6371000 * 2 * asin(sqrt(
            power(sin(radians(p_lat - v_obra.latitude) / 2), 2) +
            cos(radians(v_obra.latitude)) * cos(radians(p_lat)) *
            power(sin(radians(p_lon - v_obra.longitude) / 2), 2)
        ));
        if v_dist > v_raio then
            raise exception 'Fora do perímetro da obra: % m (máximo % m)',
                round(v_dist::numeric), v_raio using errcode = '22023';
        end if;
    end if;

    -- Saída se houver uma entrada aberta de hoje; senão entrada
    v_tipo := ponto_proximo_tipo(v_func);

    insert into ponto (funcionario_id, obra_id, datahora, latitude, longitude, tipo, distancia_m, obra_servico_id)
    values (v_func, p_obra_id, now(), p_lat, p_lon, v_tipo, round(v_dist),
            case when v_tipo = 'entrada' then servico_da_obra(p_servico, p_obra_id) end);

    return query select v_tipo, now();
end;
$$;

create or replace function public.ponto_marcar_area(p_device text, p_obra_id uuid,
                                                    p_lat double precision, p_lon double precision,
                                                    p_precisao double precision,
                                                    p_servico uuid default null)
returns table(tipo text, datahora timestamptz, a_rever boolean, distancia_m int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_func   uuid;
    v_obra   record;
    v_dist   int;
    v_rever  boolean;
    v_tipo   text;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;

    select o.id, o.latitude, o.longitude, o.raio, o.estado into v_obra
      from obras o where o.id = p_obra_id;
    if v_obra.id is null or v_obra.estado <> 'ativa' then
        raise exception 'obra_invalida' using errcode = '22023';
    end if;

    if p_lat is null or p_lon is null then
        raise exception 'sem_localizacao' using errcode = '22023';
    end if;

    -- Distância em metros (haversine), calculada no servidor
    if v_obra.latitude is not null and v_obra.longitude is not null then
        v_dist := round(6371000 * 2 * asin(sqrt(
            power(sin(radians(p_lat - v_obra.latitude) / 2), 2) +
            cos(radians(v_obra.latitude)) * cos(radians(p_lat)) *
            power(sin(radians(p_lon - v_obra.longitude) / 2), 2)
        )));
        v_rever := v_dist > coalesce(v_obra.raio, 120);
    else
        -- Obra sem coordenadas: não há com que comparar
        v_rever := true;
    end if;

    -- Saída se houver uma entrada aberta de hoje; senão entrada
    v_tipo := ponto_proximo_tipo(v_func);

    insert into ponto (funcionario_id, obra_id, datahora, latitude, longitude, tipo,
                       origem, distancia_m, precisao_m, a_rever, obra_servico_id)
    values (v_func, p_obra_id, now(), p_lat, p_lon, v_tipo,
            'area', v_dist, round(p_precisao), v_rever,
            case when v_tipo = 'entrada' then servico_da_obra(p_servico, p_obra_id) end);

    return query select v_tipo, now(), v_rever, v_dist;
end;
$$;

revoke execute on function public.ponto_marcar(text, uuid, double precision, double precision, uuid) from public;
revoke execute on function public.ponto_marcar_area(text, uuid, double precision, double precision, double precision, uuid) from public;
grant  execute on function public.ponto_marcar(text, uuid, double precision, double precision, uuid) to anon, authenticated;
grant  execute on function public.ponto_marcar_area(text, uuid, double precision, double precision, double precision, uuid) to anon, authenticated;
