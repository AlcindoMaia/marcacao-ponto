-- =====================================================================
-- Gravar sem perder dados (PR A, 09/11/2026)
--
-- Três sítios da app apagavam primeiro e inseriam depois, em pedidos
-- separados. Se a rede falhasse a meio (telemóvel em obra), ficava tudo
-- apagado e nada inserido:
--   1. Registo diário: as horas de todos, do dia inteiro
--   2. Autos de medição: as linhas do auto (e o auto seguinte voltava a
--      cobrar o que este já tinha cobrado)
--   3. Faturas: linhas, preços e entradas em stock
--   (+ as imputações da fatura aos serviços da obra)
--
-- Cada função abaixo faz tudo numa só transacção: ou entra tudo, ou fica
-- tudo como estava. São "security invoker": correm com as permissões de
-- quem chama, por isso as regras de acesso (só administrador) continuam
-- a ser as das tabelas. Correr uma vez no SQL Editor do Supabase.
-- =====================================================================

-- ---------- 1. Registo diário de horas ----------
-- p_registos: [{funcionario_id, obra_id, horas, observacoes, obra_servico_id}]
-- Substitui as presenças do dia (as faltas ficam). A ligação ao serviço
-- vai na mesma linha, em vez de se emparelhar por posição depois.
create or replace function public.guardar_registos_do_dia(p_data date, p_registos jsonb)
returns integer
language plpgsql security invoker
set search_path to 'public'
as $$
declare
    r  jsonb;
    novo uuid;
    n  integer := 0;
begin
    if not is_admin() then
        raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if p_data is null or jsonb_typeof(p_registos) <> 'array' then
        raise exception 'dados_invalidos' using errcode = '22023';
    end if;

    -- As ligações aos serviços saem com os registos (on delete cascade)
    delete from registos_admin
     where data = p_data and tipo is distinct from 'falta';

    for r in select * from jsonb_array_elements(p_registos) loop
        insert into registos_admin (data, funcionario_id, obra_id, horas, observacoes)
        values (p_data,
                nullif(r->>'funcionario_id', '')::uuid,
                nullif(r->>'obra_id', '')::uuid,
                (r->>'horas')::numeric,
                nullif(r->>'observacoes', ''))
        returning id into novo;

        if nullif(r->>'obra_servico_id', '') is not null then
            insert into registo_servicos (registo_id, obra_servico_id, horas)
            values (novo, (r->>'obra_servico_id')::uuid, (r->>'horas')::numeric);
        end if;
        n := n + 1;
    end loop;
    return n;
end;
$$;

-- ---------- 2. Auto de medição ----------
-- p_auto_id null = auto novo. p_dados: {data, taxa_iva, estado, notas}.
-- p_linhas: [{obra_servico_id, percentagem, valor}]. Devolve o id do auto.
create or replace function public.gravar_auto_medicao(
    p_auto_id uuid, p_obra_id uuid, p_numero integer, p_dados jsonb, p_linhas jsonb)
returns uuid
language plpgsql security invoker
set search_path to 'public'
as $$
declare
    v_id uuid := p_auto_id;
begin
    if not is_admin() then
        raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
        raise exception 'auto_sem_linhas' using errcode = '22023';
    end if;

    if v_id is null then
        insert into autos_medicao (obra_id, numero, data, taxa_iva, estado, notas)
        values (p_obra_id, p_numero,
                coalesce(nullif(p_dados->>'data', '')::date, current_date),
                coalesce((p_dados->>'taxa_iva')::numeric, 0),
                coalesce(nullif(p_dados->>'estado', ''), 'rascunho'),
                nullif(p_dados->>'notas', ''))
        returning id into v_id;
    else
        update autos_medicao
           set data     = coalesce(nullif(p_dados->>'data', '')::date, data),
               taxa_iva = coalesce((p_dados->>'taxa_iva')::numeric, taxa_iva),
               estado   = coalesce(nullif(p_dados->>'estado', ''), estado),
               notas    = nullif(p_dados->>'notas', '')
         where id = v_id;
        if not found then
            raise exception 'auto_inexistente' using errcode = '22023';
        end if;
        delete from auto_linhas where auto_id = v_id;
    end if;

    insert into auto_linhas (auto_id, obra_servico_id, percentagem, valor)
    select v_id, l.obra_servico_id, l.percentagem, coalesce(l.valor, 0)
      from jsonb_to_recordset(p_linhas) as l(obra_servico_id uuid, percentagem numeric, valor numeric);

    return v_id;
end;
$$;

-- ---------- 3. Linhas de uma fatura ----------
-- Grava as linhas lidas pelo assistente. Com p_substituir (edição), as
-- linhas lidas antes, os preços delas e as entradas em stock desta fatura
-- saem na mesma transacção. Com p_compra (fatura de fornecedor), cada
-- linha com artigo regista o preço e, se marcada, a entrada em stock; no
-- fim o preço actual de cada artigo tocado passa a ser o mais recente que
-- se conhece (uma só passagem, em vez de duas consultas por artigo).
-- p_linhas: [{descricao_original, artigo_id, quantidade, unidade,
--             preco_unitario, valor_total, ordem, stock}]
create or replace function public.gravar_linhas_fatura(
    p_movimento uuid, p_substituir boolean, p_linhas jsonb,
    p_compra boolean, p_fornecedor uuid, p_data date, p_referencia text)
returns table(id uuid, artigo_id uuid, descricao_original text,
              preco_unitario numeric, unidade text, ordem integer)
language plpgsql security invoker
set search_path to 'public'
as $$
declare
    l        jsonb;
    novo     uuid;
    v_artigo uuid;
    v_preco  numeric;
    v_qtd    numeric;
    tocados  uuid[] := '{}';
    novas    uuid[] := '{}';
begin
    if not is_admin() then
        raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if p_movimento is null or jsonb_typeof(p_linhas) <> 'array' then
        raise exception 'dados_invalidos' using errcode = '22023';
    end if;

    if p_substituir then
        select coalesce(array_agg(distinct p.artigo_id), '{}') into tocados
          from precos p
          join fatura_linhas fl on fl.id = p.fatura_linha_id
         where fl.movimento_id = p_movimento and fl.origem = 'ia';

        delete from precos p
         using fatura_linhas fl
         where p.fatura_linha_id = fl.id
           and fl.movimento_id = p_movimento and fl.origem = 'ia';
        delete from fatura_linhas fl
         where fl.movimento_id = p_movimento and fl.origem = 'ia';
        delete from movimentos_stock ms where ms.movimento_id = p_movimento;
    end if;

    for l in select * from jsonb_array_elements(p_linhas) loop
        v_artigo := nullif(l->>'artigo_id', '')::uuid;
        v_preco  := nullif(l->>'preco_unitario', '')::numeric;
        v_qtd    := nullif(l->>'quantidade', '')::numeric;

        insert into fatura_linhas (movimento_id, artigo_id, descricao_original, quantidade,
                                   unidade, preco_unitario, valor_total, ordem, origem)
        values (p_movimento, v_artigo, l->>'descricao_original', v_qtd,
                nullif(l->>'unidade', ''), v_preco,
                nullif(l->>'valor_total', '')::numeric,
                coalesce((l->>'ordem')::integer, 0), 'ia')
        returning fatura_linhas.id into novo;
        novas := novas || novo;

        if p_compra and v_artigo is not null then
            if coalesce(v_preco, 0) > 0 then
                insert into precos (artigo_id, fornecedor_id, preco, unidade, data, origem, fatura_linha_id)
                values (v_artigo, p_fornecedor, v_preco, nullif(l->>'unidade', ''), p_data, 'fatura', novo);
                tocados := tocados || v_artigo;
            end if;
            if coalesce((l->>'stock')::boolean, false) and coalesce(v_qtd, 0) > 0 then
                insert into movimentos_stock (artigo_id, tipo_movimento, quantidade, preco_unitario,
                                              data_movimento, observacoes, movimento_id, fatura_linha_id)
                values (v_artigo, 'entrada', v_qtd, v_preco, p_data,
                        case when nullif(p_referencia, '') is not null
                             then 'Fatura ' || p_referencia else 'Entrada por fatura' end,
                        p_movimento, novo);
            end if;
        end if;
    end loop;

    -- Preço actual = o mais recente conhecido (pode ser uma fatura atrasada)
    update artigos a
       set preco_atual = r.preco
      from (select distinct on (p.artigo_id) p.artigo_id, p.preco
              from precos p
             where p.artigo_id = any(tocados)
             order by p.artigo_id, p.data desc, p.criado_em desc) r
     where a.id = r.artigo_id and r.preco > 0;

    return query
    select fl.id, fl.artigo_id, fl.descricao_original, fl.preco_unitario, fl.unidade, fl.ordem
      from fatura_linhas fl
     where fl.id = any(novas)
     order by fl.ordem;
end;
$$;

-- ---------- 4. Imputação de uma fatura aos serviços da obra ----------
-- p_imputacoes: [{obra_servico_id, valor}]. Substitui as anteriores.
create or replace function public.substituir_imputacoes(p_movimento uuid, p_imputacoes jsonb)
returns integer
language plpgsql security invoker
set search_path to 'public'
as $$
declare
    n integer;
begin
    if not is_admin() then
        raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if p_movimento is null or jsonb_typeof(p_imputacoes) <> 'array' then
        raise exception 'dados_invalidos' using errcode = '22023';
    end if;

    delete from movimento_servicos where movimento_id = p_movimento;
    insert into movimento_servicos (movimento_id, obra_servico_id, valor)
    select p_movimento, i.obra_servico_id, i.valor
      from jsonb_to_recordset(p_imputacoes) as i(obra_servico_id uuid, valor numeric);
    get diagnostics n = row_count;
    return n;
end;
$$;

revoke execute on function public.guardar_registos_do_dia(date, jsonb)                              from public, anon;
revoke execute on function public.gravar_auto_medicao(uuid, uuid, integer, jsonb, jsonb)             from public, anon;
revoke execute on function public.gravar_linhas_fatura(uuid, boolean, jsonb, boolean, uuid, date, text) from public, anon;
revoke execute on function public.substituir_imputacoes(uuid, jsonb)                                from public, anon;
grant  execute on function public.guardar_registos_do_dia(date, jsonb)                              to authenticated;
grant  execute on function public.gravar_auto_medicao(uuid, uuid, integer, jsonb, jsonb)             to authenticated;
grant  execute on function public.gravar_linhas_fatura(uuid, boolean, jsonb, boolean, uuid, date, text) to authenticated;
grant  execute on function public.substituir_imputacoes(uuid, jsonb)                                to authenticated;
