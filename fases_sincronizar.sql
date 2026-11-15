-- =======================================================
-- FASES E % FEITA ANDAM JUNTAS
-- Até aqui o estado da fase (Por fazer / A decorrer / Concluída) e a % dos
-- pacotes dessa fase eram coisas separadas: marcar a fase "Concluída"
-- deixava "0% feito". A partir daqui:
--   - na app, marcar a fase "Concluída" põe os pacotes dela a 100%
--     (andamento.js);
--   - aqui, na base de dados: sempre que a % de um pacote muda (à mão, no
--     separador Serviços, ou ao aprovar um corte semanal), a fase dele
--     acompanha: todos a 100% → "Concluída"; algum com avanço → "A decorrer".
--     Com todos a 0% a fase fica como o Alcindo a deixou.
-- No fim, um acerto único: os pacotes das fases que já estão "Concluída"
-- passam a 100% (hoje só a obra 21/2026: 4 pacotes).
-- Corre-se uma vez no SQL Editor do Supabase; pode correr outra vez sem mal.
-- =======================================================

create or replace function public.fase_acompanha_pacotes()
returns trigger
language plpgsql security invoker
set search_path to 'public'
as $$
declare
    v_fase    uuid;
    v_total   int;
    v_feitos  int;
    v_mexidos int;
begin
    for v_fase in
        select distinct x from unnest(array[new.fase_id,
            case when tg_op = 'UPDATE' then old.fase_id end]) as x
         where x is not null
    loop
        select count(*),
               count(*) filter (where concluido or coalesce(percentagem, 0) >= 100),
               count(*) filter (where concluido or coalesce(percentagem, 0) > 0)
          into v_total, v_feitos, v_mexidos
          from obra_servicos where fase_id = v_fase;
        if v_total > 0 and v_feitos = v_total then
            update obra_fases set estado = 'concluida'  where id = v_fase and estado is distinct from 'concluida';
        elsif v_mexidos > 0 then
            update obra_fases set estado = 'a_decorrer' where id = v_fase and estado is distinct from 'a_decorrer';
        end if;
    end loop;
    return null;
end;
$$;

drop trigger if exists trg_fase_acompanha_pacotes on obra_servicos;
create trigger trg_fase_acompanha_pacotes
    after insert or update of percentagem, concluido, fase_id on obra_servicos
    for each row execute function public.fase_acompanha_pacotes();

-- Acerto único: fases já concluídas → os seus pacotes a 100%
update obra_servicos s
   set percentagem = 100, concluido = true, concluido_em = coalesce(s.concluido_em, current_date)
  from obra_fases f
 where s.fase_id = f.id and f.estado = 'concluida'
   and (not coalesce(s.concluido, false) or coalesce(s.percentagem, 0) < 100);
