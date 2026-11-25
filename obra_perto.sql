-- Área do funcionário: ao abrir, sugerir a obra onde ele está.
-- O telemóvel manda a localização e o servidor devolve só o id da obra ativa
-- mais próxima, se estiver dentro do raio da obra + 50 m. As coordenadas das
-- obras nunca saem do servidor. Obras sem coordenadas nunca são sugeridas.
-- Correr uma vez no SQL Editor do Supabase.

create or replace function public.obra_perto(p_device text,
                                             p_lat double precision,
                                             p_lon double precision)
returns uuid
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
    v_func uuid;
    v_obra uuid;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;
    if p_lat is null or p_lon is null then return null; end if;

    select d.id into v_obra
      from (
        select o.id, coalesce(o.raio, 120) as raio,
               6371000 * 2 * asin(sqrt(
                   power(sin(radians(p_lat - o.latitude) / 2), 2) +
                   cos(radians(o.latitude)) * cos(radians(p_lat)) *
                   power(sin(radians(p_lon - o.longitude) / 2), 2)
               )) as dist
          from obras o
         where o.estado = 'ativa'
           and o.latitude is not null and o.longitude is not null
      ) d
     where d.dist <= d.raio + 50
     order by d.dist
     limit 1;

    return v_obra;
end;
$$;
revoke execute on function public.obra_perto(text, double precision, double precision) from public;
grant  execute on function public.obra_perto(text, double precision, double precision) to anon, authenticated;
