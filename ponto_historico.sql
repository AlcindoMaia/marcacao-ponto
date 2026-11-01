-- Área do funcionário: o histórico da semana trazia só as últimas 12
-- marcações. Com entrada e saída ao almoço (4 por dia) a semana ficava
-- cortada a meio. Passa a 60 (duas semanas de 6 dias com 5 marcações).
-- Correr uma vez no SQL Editor do Supabase. Não apaga nem muda dados.
create or replace function public.ponto_historico(p_device text, p_desde timestamptz)
returns table(id uuid, datahora timestamptz, tipo text)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
    v_func uuid;
begin
    select f.id into v_func from funcionarios f where f.device_id = p_device and f.ativo;
    if v_func is null then
        raise exception 'dispositivo_nao_registado' using errcode = '42501';
    end if;

    return query
    select p.id, p.datahora, p.tipo
      from ponto p
     where p.funcionario_id = v_func
       and p.datahora >= coalesce(p_desde, now() - interval '7 days')
     order by p.datahora desc
     limit 60;
end;
$$;
