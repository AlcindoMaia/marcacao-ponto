-- =======================================================
-- AS MARCAÇÕES CRIAM AS HORAS NO REGISTO DIÁRIO
-- Na entrada o funcionário escolhe o serviço da obra (vem escolhido quando a
-- obra só tem um). Quando há um par entrada → saída no mesmo dia, o servidor
-- cria a linha de presença no Registo diário (registos_admin), com as horas
-- e o serviço, marcada com origem = 'ponto'.
--
-- Regras:
--   * horas = saída − entrada, menos 1 h de almoço se o par passar de 6 h,
--     arredondadas à meia hora;
--   * nunca se sobrepõe ao Registo diário escrito à mão: se já houver uma
--     linha manual desse funcionário nesse dia, não cria nada;
--   * marcações "a rever" só contam depois de confirmadas (✓ em Registos);
--   * se o Alcindo corrigir a hora de uma marcação em Registos, a linha
--     criada pelo ponto é recalculada.
--
-- Depende de area_funcionario.sql. Correr no SQL Editor do Supabase.
-- Pode correr-se mais de uma vez.
-- =======================================================

alter table ponto add column if not exists obra_servico_id uuid
    references obra_servicos(id) on delete set null;

alter table registos_admin add column if not exists origem text not null default 'manual';
alter table registos_admin add column if not exists ponto_saida_id uuid
    references ponto(id) on delete cascade;
create unique index if not exists registos_admin_ponto_saida_unica
    on registos_admin(ponto_saida_id) where ponto_saida_id is not null;

-- Serviços da obra para a lista da marcação: só id e nome dos não concluídos
create or replace function public.servicos_para_marcar(p_device text, p_obra_id uuid)
returns table(id uuid, nome text)
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
    if not exists (select 1 from funcionarios f where f.device_id = p_device and f.ativo) then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;

    return query
    select s.id, s.nome
      from obra_servicos s
      join obras o on o.id = s.obra_id
     where s.obra_id = p_obra_id
       and o.estado = 'ativa'
       and not coalesce(s.concluido, false)
     order by s.ordem, s.created_at;
end;
$$;

-- Cria (ou recria) a linha do Registo diário de um par entrada → saída.
-- p_saida é a marcação de saída do par.
create or replace function public.ponto_gerar_registo(p_saida uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_sai   record;
    v_ent   record;
    v_dia   date;
    v_horas numeric;
    v_reg   uuid;
begin
    -- A linha antiga deste par sai sempre; volta a ser criada se ainda contar
    delete from registos_admin where ponto_saida_id = p_saida and origem = 'ponto';

    select * into v_sai from ponto where id = p_saida and tipo = 'saida';
    if v_sai.id is null then return; end if;
    v_dia := (v_sai.datahora at time zone 'Europe/Lisbon')::date;

    -- A entrada do par: a última marcação antes da saída, no mesmo dia
    select * into v_ent from ponto p
     where p.funcionario_id = v_sai.funcionario_id
       and p.datahora < v_sai.datahora
     order by p.datahora desc limit 1;
    if v_ent.id is null or v_ent.tipo <> 'entrada'
       or (v_ent.datahora at time zone 'Europe/Lisbon')::date <> v_dia then
        return;
    end if;

    if v_ent.a_rever or v_sai.a_rever then return; end if;

    -- O Registo diário escrito à mão manda
    if exists (select 1 from registos_admin r
                where r.funcionario_id = v_sai.funcionario_id
                  and r.data = v_dia
                  and r.origem <> 'ponto') then
        return;
    end if;

    v_horas := extract(epoch from v_sai.datahora - v_ent.datahora) / 3600.0;
    if v_horas > 6 then v_horas := v_horas - 1; end if;
    v_horas := round(v_horas * 2) / 2;
    if v_horas <= 0 then return; end if;
    v_horas := least(v_horas, 24);

    insert into registos_admin (data, funcionario_id, obra_id, horas, tipo, origem, ponto_saida_id, observacoes)
    values (v_dia, v_sai.funcionario_id, v_ent.obra_id, v_horas, 'presenca', 'ponto', v_sai.id,
            'Das marcações ' || to_char(v_ent.datahora at time zone 'Europe/Lisbon', 'HH24:MI')
                     || '–' || to_char(v_sai.datahora at time zone 'Europe/Lisbon', 'HH24:MI'))
    returning id into v_reg;

    if v_ent.obra_servico_id is not null then
        insert into registo_servicos (registo_id, obra_servico_id, horas)
        values (v_reg, v_ent.obra_servico_id, v_horas);
    end if;
end;
$$;

revoke execute on function public.ponto_gerar_registo(uuid) from public, anon, authenticated;

-- Sempre que uma marcação é criada, confirmada ou corrigida, o par dela é
-- recalculado. Para uma entrada, o par é a saída que vem a seguir.
create or replace function public.ponto_apos_alteracao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_saida uuid;
begin
    -- Marcação apagada: a saída apagada leva a linha consigo (cascade); se
    -- for uma entrada, recalcula-se a saída que vinha a seguir.
    if tg_op = 'DELETE' then
        if old.tipo = 'entrada' then
            select p.id into v_saida from ponto p
             where p.funcionario_id = old.funcionario_id
               and p.datahora > old.datahora and p.tipo = 'saida'
             order by p.datahora limit 1;
            if v_saida is not null then perform ponto_gerar_registo(v_saida); end if;
        end if;
        return null;
    end if;

    if new.tipo = 'saida' then
        v_saida := new.id;
    else
        select p.id into v_saida from ponto p
         where p.funcionario_id = new.funcionario_id
           and p.datahora > new.datahora
         order by p.datahora limit 1;
        if v_saida is not null
           and (select tipo from ponto where id = v_saida) <> 'saida' then
            v_saida := null;
        end if;
    end if;

    if v_saida is not null then
        perform ponto_gerar_registo(v_saida);
    end if;
    return null;
end;
$$;

drop trigger if exists ponto_gera_registo on ponto;
create trigger ponto_gera_registo
    after insert or delete or update of datahora, a_rever, obra_servico_id, tipo on ponto
    for each row execute function ponto_apos_alteracao();

-- As funções de marcação passam a receber o serviço (opcional, para os
-- telemóveis que ainda têm a página antiga em cache continuarem a marcar).
drop function if exists public.ponto_marcar(text, uuid, double precision, double precision);
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

    -- Alterna entre entrada e saída consoante a última marcação
    select p.tipo into v_ultimo
      from ponto p where p.funcionario_id = v_func
     order by p.datahora desc limit 1;

    v_tipo := case when v_ultimo = 'entrada' then 'saida' else 'entrada' end;

    insert into ponto (funcionario_id, obra_id, datahora, latitude, longitude, tipo, distancia_m, obra_servico_id)
    values (v_func, p_obra_id, now(), p_lat, p_lon, v_tipo, round(v_dist),
            case when v_tipo = 'entrada' then servico_da_obra(p_servico, p_obra_id) end);

    return query select v_tipo, now();
end;
$$;

drop function if exists public.ponto_marcar_area(text, uuid, double precision, double precision, double precision);
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
                       origem, distancia_m, precisao_m, a_rever, obra_servico_id)
    values (v_func, p_obra_id, now(), p_lat, p_lon, v_tipo,
            'area', v_dist, round(p_precisao), v_rever,
            case when v_tipo = 'entrada' then servico_da_obra(p_servico, p_obra_id) end);

    return query select v_tipo, now(), v_rever, v_dist;
end;
$$;

-- Serviço escolhido, se for mesmo desta obra; sem escolha e com um só
-- serviço por concluir, fica esse.
create or replace function public.servico_da_obra(p_servico uuid, p_obra_id uuid)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
    select coalesce(
        (select s.id from obra_servicos s where s.id = p_servico and s.obra_id = p_obra_id),
        (select min(s.id::text)::uuid from obra_servicos s
          where p_servico is null and s.obra_id = p_obra_id and not coalesce(s.concluido, false)
         having count(*) = 1)
    );
$$;

revoke execute on function public.servico_da_obra(uuid, uuid) from public, anon, authenticated;

-- Funções da app do funcionário: anon pode executar, mas não "public"
revoke execute on function public.servicos_para_marcar(text, uuid) from public;
revoke execute on function public.ponto_marcar(text, uuid, double precision, double precision, uuid) from public;
revoke execute on function public.ponto_marcar_area(text, uuid, double precision, double precision, double precision, uuid) from public;
grant  execute on function public.servicos_para_marcar(text, uuid) to anon, authenticated;
grant  execute on function public.ponto_marcar(text, uuid, double precision, double precision, uuid) to anon, authenticated;
grant  execute on function public.ponto_marcar_area(text, uuid, double precision, double precision, double precision, uuid) to anon, authenticated;
