-- =======================================================
-- ÁREA DO FUNCIONÁRIO: MARCAR O PONTO SEM O QR
-- Página app.html aberta sem ?obra=. O funcionário escolhe a obra numa lista
-- e marca com o GPS do telemóvel. Serve para quando o papel com o QR
-- desapareceu ou o Alcindo não está.
--
-- A marcação nunca é recusada por causa da distância: o servidor mede a
-- distância à obra escolhida e, se estiver fora do raio ou se a obra não
-- tiver coordenadas, a marcação fica "a rever" para o Alcindo confirmar.
-- As coordenadas das obras não saem do servidor.
--
-- Correr no SQL Editor do Supabase. Pode correr-se mais de uma vez.
-- =======================================================

alter table ponto add column if not exists origem      text not null default 'qr';
alter table ponto add column if not exists distancia_m int;
alter table ponto add column if not exists precisao_m  int;
alter table ponto add column if not exists a_rever     boolean not null default false;

-- Obras ativas para a lista da área do funcionário: só id e nome.
-- "ultima" marca a obra da última marcação deste funcionário, que vem já
-- escolhida.
create or replace function public.obras_para_marcar(p_device text)
returns table(id uuid, nome text, ultima boolean)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
    v_func uuid;
    v_ult  uuid;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;

    select p.obra_id into v_ult
      from ponto p where p.funcionario_id = v_func
     order by p.datahora desc limit 1;

    return query
    select o.id, o.nome, coalesce(o.id = v_ult, false)
      from obras o
     where o.estado = 'ativa'
     order by o.nome;
end;
$$;

-- Marcação a partir da área do funcionário.
create or replace function public.ponto_marcar_area(p_device text, p_obra_id uuid,
                                                    p_lat double precision, p_lon double precision,
                                                    p_precisao double precision)
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
    v_ultimo text;
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

    -- Alterna entre entrada e saída consoante a última marcação
    select p.tipo into v_ultimo
      from ponto p where p.funcionario_id = v_func
     order by p.datahora desc limit 1;

    v_tipo := case when v_ultimo = 'entrada' then 'saida' else 'entrada' end;

    insert into ponto (funcionario_id, obra_id, datahora, latitude, longitude, tipo,
                       origem, distancia_m, precisao_m, a_rever)
    values (v_func, p_obra_id, now(), p_lat, p_lon, v_tipo,
            'area', v_dist, round(p_precisao), v_rever);

    return query select v_tipo, now(), v_rever, v_dist;
end;
$$;

-- Funções da app do funcionário: anon pode executar, mas não "public"
revoke execute on function public.obras_para_marcar(text) from public;
revoke execute on function public.ponto_marcar_area(text, uuid, double precision, double precision, double precision) from public;
grant  execute on function public.obras_para_marcar(text) to anon, authenticated;
grant  execute on function public.ponto_marcar_area(text, uuid, double precision, double precision, double precision) to anon, authenticated;

-- Registo diário: as marcações "a rever" aparecem assinaladas, com a maior
-- distância do dia. As colunas novas vão no fim (exigência do "or replace").
create or replace view vw_registos_ponto with (security_invoker = on) as
 WITH base AS (
         SELECT p.id,
            p.funcionario_id,
            f.nome AS funcionario,
            o.nome AS obra,
            date(p.created_at) AS dia,
            p.created_at,
            p.tipo,
            p.a_rever,
            p.distancia_m
           FROM ponto p
             LEFT JOIN funcionarios f ON f.id = p.funcionario_id
             LEFT JOIN obras o ON o.id = p.obra_id
        ), entradas AS (
         SELECT base.id,
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
    max(rever.distancia_m) AS distancia_m
   FROM pares
     LEFT JOIN rever ON rever.funcionario IS NOT DISTINCT FROM pares.funcionario
                    AND rever.obra IS NOT DISTINCT FROM pares.obra
                    AND rever.dia = pares.dia
  GROUP BY pares.funcionario, pares.obra, pares.dia
  ORDER BY pares.dia DESC;
