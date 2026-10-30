-- =======================================================
-- REGISTOS DE PONTO: DESCONTAR A HORA DE ALMOÇO
-- As horas da lista Funcionários › Registos (e o aviso +EXT) passam a
-- descontar 1 h de almoço em cada par entrada → saída com mais de 6 h,
-- tal como as horas que vão para o Registo diário (ponto_horas.sql).
-- Só muda a vista; não mexe em marcações. Correr no SQL Editor do
-- Supabase. Pode correr-se mais de uma vez.
-- =======================================================

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
            -- 1 h de almoço descontada em cada par com mais de 6 h, como no Registo diário
            EXTRACT(epoch FROM s.saida - e.entrada)
              - CASE WHEN s.saida - e.entrada > interval '6 hours' THEN 3600 ELSE 0 END AS segundos
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
