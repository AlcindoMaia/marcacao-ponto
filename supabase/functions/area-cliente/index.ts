// =======================================================
// area-cliente
// Dados da Área do cliente (cliente.html?t=<código>).
//
// Pública (sem sessão): quem tem o link fixo do cliente entra. Por isso esta
// função é a ÚNICA porta e só devolve o que o cliente pode ver:
//   - o nome do cliente;
//   - as obras ligadas a ele (nome, local, estado, percentagem, data prevista);
//   - as fases visíveis de cada obra (nome, datas, estado, % feita pelos
//     pacotes dessa fase) e os autos de
//     medição já enviados (serviço, % acumulada, valor, totais);
//   - as notas do diário de obra marcadas como visíveis (as últimas 20);
//   - os documentos dessas obras marcados "Visível ao cliente", com um link
//     temporário (1 hora) para abrir o ficheiro;
//   - nas faturas, o total e se está paga; nos orçamentos, o estado, o total
//     e a resposta do cliente que ainda está por tratar;
//   - o avanço da obra pelos pacotes de trabalho (zona, nome, % feita, se
//     está atrasado) e a curva feito vs previsto. Sem valores dos pacotes
//     nem notas de quem mediu. O relatório do corte semanal já não vai ao
//     cliente (decisão do Alcindo, 2026-11-16: as barras chegam);
//   - em cada documento, se é novo: ficou visível há menos de 7 dias e o
//     cliente ainda não carregou em "Tomei conhecimento".
// Nunca devolve custos, margens, fornecedores, horas ou outras obras.
//
// A única coisa que o cliente pode escrever é a resposta a um orçamento
// enviado (acao "responder_orcamento"): "aceite", "alteracoes" com um
// comentário ou "recusa" com um motivo opcional; e um pedido sobre uma obra
// dele (acao "pedido": informação, extra, reclamação ou sugestão), que o
// Alcindo responde na app. Os pedidos e as respostas voltam na leitura.
// E pode carregar em "Tomei conhecimento" nos documentos novos (acao
// "tomei_conhecimento"), o que guarda a data em obra_documentos.cliente_viu_em. Fica em orcamento_respostas e não muda o orçamento; quem o
// passa a aceite é o Alcindo, na app.
//
// Trabalhos a mais (2026-11-17): o cliente vê os extras enviados, aceites e
// recusados, e responde aos enviados (acao "responder_extra": "aceite" com o
// nome de quem aceita, ou "recusa" com motivo opcional). Ao aceitar, a base de
// dados cria o serviço extra da obra (trigger em obra_em_curso.sql).
// Remates: vê os remates visíveis da obra (divisão, o quê, prazo, estado,
// fotos antes/depois) e confirma os resolvidos (acao "confirmar_remate").
//
// O código está em clientes.token_acesso e só vale com acesso_ativo = true.
// =======================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "obra-documentos";
const VALIDADE_LINK = 60 * 60;   // segundos

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), {
        status, headers: { ...CORS, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST")    return resposta({ erro: "Método não permitido" }, 405);

    let corpo: { token?: string; acao?: string; documento_id?: string; resposta?: string; comentario?: string;
                 obra_id?: string; tipo?: string; mensagem?: string; documentos?: unknown;
                 extra_id?: string; nome?: string; remate_id?: string };
    try { corpo = await req.json(); } catch { return resposta({ erro: "Pedido inválido" }, 400); }

    // Os códigos gerados pela app têm 32 caracteres base64url. Tudo o que não
    // tenha esse formato nem chega à base de dados.
    const token = String(corpo.token || "");
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return resposta({ erro: "Link inválido" }, 404);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: cliente } = await db.from("clientes")
        .select("id, nome").eq("token_acesso", token).eq("acesso_ativo", true).maybeSingle();
    // A mesma resposta para "não existe" e "desligado": não se revela nada.
    if (!cliente) return resposta({ erro: "Link inválido ou desligado" }, 404);

    if (corpo.acao === "responder_orcamento") return responderOrcamento(db, req, cliente.id, corpo);
    if (corpo.acao === "pedido") return criarPedido(db, req, cliente.id, corpo);
    if (corpo.acao === "tomei_conhecimento") return tomeiConhecimento(db, cliente.id, corpo.documentos);
    if (corpo.acao === "responder_extra") return responderExtra(db, req, cliente.id, corpo);
    if (corpo.acao === "confirmar_remate") return confirmarRemate(db, cliente.id, corpo.remate_id);

    const { data: obras } = await db.from("obras")
        .select("id, codigo, nome, local, estado, percentagem_conclusao, data_conclusao_prevista, mostrar_contas_cliente")
        .eq("cliente_id", cliente.id)
        .order("created_at", { ascending: false });

    const idsObras = (obras || []).map(o => o.id);
    let documentos: any[] = [];
    let fases: any[] = [], autos: any[] = [], diario: any[] = [];
    let pacotes: any[] = [];
    let avanco: Record<string, number> = {};
    let curva: Record<string, any[]> = {};
    let linksFalharam = false;

    if (idsObras.length) {
        const [f, a, n] = await Promise.all([
            db.from("obra_fases").select("id, obra_id, nome, ordem, data_inicio, data_fim, estado")
                .in("obra_id", idsObras).eq("visivel_cliente", true).order("ordem"),
            db.from("autos_medicao")
                .select("id, obra_id, numero, data, estado, taxa_iva, notas, auto_linhas(percentagem, valor, obra_servicos(nome, ordem))")
                .in("obra_id", idsObras).in("estado", ["enviado", "faturado"]).order("numero"),
            db.from("obra_diario").select("obra_id, data, notas")
                .in("obra_id", idsObras).eq("visivel_cliente", true).order("data", { ascending: false }).limit(20),
        ]);
        diario = n.data || [];
        let pctFase: Record<string, number> = {};
        ({ pacotes, avanco, curva, pctFase } = await pacotesECurva(db, idsObras));
        // % de cada fase pelos seus pacotes (pesada pelo valor, que não sai daqui)
        fases = (f.data || []).map((x: any) => ({ ...x, percentagem: pctFase[x.id] ?? null }));
        autos = (a.data || []).map((x: any) => {
            const linhas = (x.auto_linhas || [])
                .sort((p: any, q: any) => (p.obra_servicos?.ordem || 0) - (q.obra_servicos?.ordem || 0))
                .map((l: any) => ({ servico: l.obra_servicos?.nome || "", percentagem: Number(l.percentagem), valor: Number(l.valor) }));
            const base = Math.round(linhas.reduce((s: number, l: any) => s + l.valor, 0) * 100) / 100;
            const iva  = Math.round(base * Number(x.taxa_iva) / 100 * 100) / 100;
            return { obra_id: x.obra_id, numero: x.numero, data: x.data, estado: x.estado, notas: x.notas,
                     taxa_iva: Number(x.taxa_iva), linhas, total_sem_iva: base, iva, total: Math.round((base + iva) * 100) / 100 };
        });
    }

    if (idsObras.length) {
        const { data: docs } = await db.from("obra_documentos")
            .select("id, obra_id, tipo, nome_ficheiro, caminho, mime, numero_documento, data_documento, created_at, orcamento_id, movimento_id")
            .in("obra_id", idsObras).eq("visivel_cliente", true)
            .order("created_at", { ascending: false });

        const lista = docs || [];

        // Estado do orçamento e da fatura: só estes campos, nada mais.
        const idsOrc = lista.map(d => d.orcamento_id).filter(Boolean);
        const idsMov = lista.filter(d => d.tipo === "fatura").map(d => d.movimento_id).filter(Boolean);
        const [orcs, movs] = await Promise.all([
            idsOrc.length ? db.from("orcamentos").select("id, estado, total_com_iva").in("id", idsOrc) : { data: [] },
            idsMov.length ? db.from("movimentos_financeiros").select("id, valor_total, estado_pagamento")
                              .in("id", idsMov).eq("tipo", "entrada") : { data: [] },
        ]);
        const dadosOrc  = new Map((orcs.data || []).map((o: any) => [o.id, o]));
        const dadosMov  = new Map((movs.data || []).map((m: any) => [m.id, m]));
        // Recibos parciais: quanto de cada fatura por pagar já foi recebido
        const parcialDoc = await somaPagamentos(db, (movs.data || []).filter((m: any) => m.estado_pagamento !== "pago").map((m: any) => m.id));
        const { data: pend } = idsOrc.length
            ? await db.from("orcamento_respostas").select("orcamento_id, resposta, created_at")
                .in("orcamento_id", idsOrc).is("tratada_em", null)
            : { data: [] };
        const pendente = new Map((pend || []).map((p: any) => [p.orcamento_id, p]));

        let assinados: any[] = [];
        if (lista.length) {
            const r = await db.storage.from(BUCKET).createSignedUrls(lista.map(d => d.caminho), VALIDADE_LINK);
            if (r.error) console.error("createSignedUrls", r.error);
            assinados = r.data || [];
            // Um link em falta: a página diz ao cliente para atualizar, em vez
            // de mostrar um botão que não abre nada
            linksFalharam = !!r.error || assinados.some((x: any) => !x.signedUrl || x.error);
        }
        const urlDe = new Map(assinados.map((s: any) => [s.path, s.signedUrl]));
        const novos = await documentosNovos(db, lista.map(d => d.id));

        documentos = lista.map(d => {
            const mov = d.movimento_id ? dadosMov.get(d.movimento_id) : null;
            const orc = d.orcamento_id ? dadosOrc.get(d.orcamento_id) : null;
            const pr  = d.orcamento_id ? pendente.get(d.orcamento_id) : null;
            return {
                id: d.id,
                obra_id: d.obra_id,
                tipo: d.tipo,
                nome: d.nome_ficheiro,
                mime: d.mime,
                numero: d.numero_documento,
                data: d.data_documento || d.created_at?.slice(0, 10),
                url: urlDe.get(d.caminho) || null,
                novo: novos.has(d.id),
                estado_orcamento: orc ? orc.estado : null,
                resposta_pendente: pr ? { resposta: pr.resposta, data: pr.created_at } : null,
                total: mov ? mov.valor_total : orc ? orc.total_com_iva : null,
                paga: mov ? mov.estado_pagamento === "pago" : null,
                recebido: mov && mov.estado_pagamento !== "pago" && parcialDoc.get(mov.id)
                    ? Math.min(Number(mov.valor_total), parcialDoc.get(mov.id)!) : null,
            };
        });
    }

    // Contas da obra (valor, já pago, falta), só nas obras em que o Alcindo
    // ligou "Mostrar contas ao cliente". Tudo sem IVA: muitos recebimentos não
    // têm IVA, e misturar com e sem IVA dava números errados.
    const comContas = (obras || []).filter((o: any) => o.mostrar_contas_cliente).map((o: any) => o.id);
    const contas: Record<string, any> = {};
    if (comContas.length) {
        const [serv, orcs, ent] = await Promise.all([
            db.from("obra_servicos").select("obra_id, orcamento_id, valor_orcamento").in("obra_id", comContas),
            db.from("orcamentos").select("id, obra_id, total_sem_iva, total_com_iva, taxa_iva").in("obra_id", comContas).eq("estado", "aceite"),
            db.from("movimentos_financeiros").select("id, obra_id, valor_base, valor_total, estado_pagamento").in("obra_id", comContas)
                .eq("tipo", "entrada").eq("ativo", true),
        ]);
        // Uma fatura por pagar conta só a parte já recebida por recibos parciais
        const parcialObra = await somaPagamentos(db, (ent.data || []).filter((m: any) => m.estado_pagamento !== "pago").map((m: any) => m.id));
        if (!serv.error && !orcs.error && !ent.error) {
            const r2 = (n: number) => Math.round(n * 100) / 100;
            for (const id of comContas) {
                // Orçamento aceite: o valor dos seus serviços (tem os ajustes), senão o total sem IVA
                const valor = (orcs.data || []).filter((o: any) => o.obra_id === id).reduce((s: number, o: any) => {
                    const sv = (serv.data || []).filter((x: any) => x.orcamento_id === o.id)
                        .reduce((t: number, x: any) => t + Number(x.valor_orcamento || 0), 0);
                    const sem = Number(o.total_sem_iva || 0) || Number(o.total_com_iva || 0) / (1 + Number(o.taxa_iva ?? 23) / 100);
                    return s + (sv > 0 ? sv : sem);
                }, 0) + (serv.data || []).filter((x: any) => x.obra_id === id && !x.orcamento_id)
                    .reduce((t: number, x: any) => t + Number(x.valor_orcamento || 0), 0);
                const pago = (ent.data || []).filter((m: any) => m.obra_id === id)
                    .reduce((t: number, m: any) => {
                        const base = Number(m.valor_base ?? m.valor_total ?? 0);
                        if (m.estado_pagamento === "pago") return t + base;
                        const total = Number(m.valor_total || 0);
                        const rec = Math.min(total, parcialObra.get(m.id) || 0);
                        return t + (total > 0 ? base * rec / total : 0);
                    }, 0);
                contas[id] = { valor: r2(valor), pago: r2(pago), falta: r2(Math.max(0, valor - pago)) };
            }
        }
    }
    const obrasCliente = (obras || []).map(({ mostrar_contas_cliente, ...o }: any) => ({ ...o, contas: contas[o.id] || null, avanco: avanco[o.id] ?? null, curva: curva[o.id] || null }));

    // Pedidos do cliente e respostas (sem a tabela, por correr o SQL, fica vazio)
    const ped = await db.from("cliente_pedidos")
        .select("id, obra_id, tipo, mensagem, estado, resposta, respondido_em, created_at")
        .eq("cliente_id", cliente.id).order("created_at", { ascending: false }).limit(30);
    const pedidos = ped.error ? [] : ped.data || [];

    // Trabalhos a mais e remates (sem as tabelas, por correr o SQL, ficam vazios)
    const { extras, remates } = await extrasERemates(db, idsObras);

    await db.from("clientes").update({ ultimo_acesso: new Date().toISOString() }).eq("id", cliente.id);

    return resposta({ cliente: { nome: cliente.nome }, obras: obrasCliente, documentos, fases, autos, diario,
                      pacotes, pedidos, extras, remates, links_falharam: linksFalharam });
});

// Trabalhos a mais (sem rascunhos nem cancelados) e remates visíveis, com
// links temporários para as fotos. Valores sem IVA e com IVA: o cliente
// aceita um preço, tem de o ver por inteiro.
async function extrasERemates(db: any, idsObras: string[]) {
    if (!idsObras.length) return { extras: [], remates: [] };
    const [e, r] = await Promise.all([
        db.from("trabalhos_mais")
            .select("id, obra_id, descricao, valor_sem_iva, taxa_iva, dias_prazo, estado, enviado_em, resposta_em, resposta_nome, motivo_recusa")
            .in("obra_id", idsObras).in("estado", ["enviado", "aceite", "recusado"]).order("created_at"),
        db.from("obra_remates")
            .select("id, obra_id, divisao, descricao, foto_antes, foto_depois, prazo, estado, resolvido_em, cliente_confirmou_em")
            .in("obra_id", idsObras).eq("visivel_cliente", true).order("created_at"),
    ]);
    if (e.error) console.error("trabalhos_mais", e.error.message);
    if (r.error) console.error("obra_remates", r.error.message);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const extras = (e.data || []).map((x: any) => {
        const base = Number(x.valor_sem_iva || 0), iva = r2(base * Number(x.taxa_iva ?? 23) / 100);
        return { ...x, valor_sem_iva: base, iva, total: r2(base + iva) };
    });
    const lista = r.data || [];
    const caminhos = lista.flatMap((x: any) => [x.foto_antes, x.foto_depois]).filter(Boolean);
    let urlDe = new Map<string, string>();
    if (caminhos.length) {
        const s = await db.storage.from(BUCKET).createSignedUrls(caminhos, VALIDADE_LINK);
        if (s.error) console.error("remates fotos", s.error);
        urlDe = new Map((s.data || []).filter((x: any) => x.signedUrl).map((x: any) => [x.path, x.signedUrl]));
    }
    const remates = lista.map(({ foto_antes, foto_depois, ...x }: any) => ({
        ...x,
        foto_antes: foto_antes ? urlDe.get(foto_antes) || null : null,
        foto_depois: foto_depois ? urlDe.get(foto_depois) || null : null,
    }));
    return { extras, remates };
}

// Resposta do cliente a um trabalho a mais enviado. "aceite" pede o nome de
// quem aceita (fica registado com a data, o IP e o navegador); "recusa" aceita
// um motivo. Só vale para extras "enviado" de obras deste cliente.
async function responderExtra(db: any, req: Request, clienteId: string,
                              corpo: { extra_id?: string; resposta?: string; nome?: string; comentario?: string }) {
    const id = String(corpo.extra_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return resposta({ erro: "Trabalho inválido" }, 400);
    const tipo = corpo.resposta;
    if (tipo !== "aceite" && tipo !== "recusa") return resposta({ erro: "Resposta inválida" }, 400);
    const nome = String(corpo.nome || "").trim().slice(0, 120);
    if (tipo === "aceite" && nome.length < 2) return resposta({ erro: "Escreva o seu nome para aceitar." }, 400);
    const motivo = String(corpo.comentario || "").trim().slice(0, 2000);

    const { data: ex } = await db.from("trabalhos_mais")
        .select("id, estado, obras!inner(cliente_id)")
        .eq("id", id).eq("obras.cliente_id", clienteId).maybeSingle();
    if (!ex) return resposta({ erro: "Trabalho não encontrado" }, 404);
    if (ex.estado !== "enviado") return resposta({ erro: "Este trabalho já não está à espera de resposta." }, 409);

    const { data: feito, error } = await db.from("trabalhos_mais").update({
        estado: tipo === "aceite" ? "aceite" : "recusado",
        resposta_em: new Date().toISOString(),
        resposta_nome: nome || null,
        resposta_por: "cliente",
        motivo_recusa: tipo === "recusa" ? (motivo || null) : null,
        resposta_ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
        resposta_navegador: (req.headers.get("user-agent") || "").slice(0, 300) || null,
        visto_em: null,
    }).eq("id", id).eq("estado", "enviado").select("id");
    if (error) { console.error(error); return resposta({ erro: "Não foi possível guardar a resposta." }, 500); }
    // Outra resposta chegou primeiro (dois cliques, dois telemóveis)
    if (!feito?.length) return resposta({ erro: "Este trabalho já não está à espera de resposta." }, 409);
    return resposta({ ok: true });
}

// O cliente confirma que um remate resolvido ficou bem.
async function confirmarRemate(db: any, clienteId: string, remateId?: string) {
    const id = String(remateId || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return resposta({ erro: "Remate inválido" }, 400);
    const { data: rm } = await db.from("obra_remates")
        .select("id, estado, obras!inner(cliente_id)")
        .eq("id", id).eq("visivel_cliente", true).eq("obras.cliente_id", clienteId).maybeSingle();
    if (!rm) return resposta({ erro: "Remate não encontrado" }, 404);
    if (rm.estado !== "resolvido") return resposta({ erro: "Este remate ainda não está resolvido." }, 409);
    const { error } = await db.from("obra_remates").update({ cliente_confirmou_em: new Date().toISOString() })
        .eq("id", id).is("cliente_confirmou_em", null);
    if (error) { console.error(error); return resposta({ erro: "Não foi possível guardar." }, 500); }
    return resposta({ ok: true });
}

// Pedido do cliente sobre uma das obras dele. No máximo 10 por dia, para um
// link partilhado por engano não encher a caixa do Alcindo.
const TIPOS_PEDIDO = ["informacao", "extra", "reclamacao", "sugestao"];
async function criarPedido(db: any, req: Request, clienteId: string,
                           corpo: { obra_id?: string; tipo?: string; mensagem?: string }) {
    const obraId = String(corpo.obra_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(obraId)) return resposta({ erro: "Obra inválida" }, 400);
    const tipo = String(corpo.tipo || "");
    if (!TIPOS_PEDIDO.includes(tipo)) return resposta({ erro: "Escolha o tipo de pedido." }, 400);
    const mensagem = String(corpo.mensagem || "").trim().slice(0, 2000);
    if (!mensagem) return resposta({ erro: "Escreva o seu pedido." }, 400);

    const { data: obra } = await db.from("obras").select("id").eq("id", obraId).eq("cliente_id", clienteId).maybeSingle();
    if (!obra) return resposta({ erro: "Obra não encontrada" }, 404);

    const desde = new Date(Date.now() - 86400000).toISOString();
    const { count } = await db.from("cliente_pedidos").select("id", { count: "exact", head: true })
        .eq("cliente_id", clienteId).gte("created_at", desde);
    if ((count || 0) >= 10) return resposta({ erro: "Já enviou muitos pedidos hoje. Tente amanhã ou contacte-nos por telefone." }, 429);

    const { error } = await db.from("cliente_pedidos").insert({
        cliente_id: clienteId, obra_id: obraId, tipo, mensagem,
        ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    });
    if (error) { console.error(error); return resposta({ erro: "Não foi possível enviar o pedido." }, 500); }
    return resposta({ ok: true });
}

// Pacotes da obra e curva feito vs previsto (que usa os cortes semanais
// aprovados). Se o SQL dos pacotes ainda não foi corrido, as colunas não
// existem: devolve listas vazias e a página continua a usar a % da obra ou
// as fases.
async function pacotesECurva(db: any, idsObras: string[]) {
    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
    const [p, c] = await Promise.all([
        db.from("obra_servicos")
            .select("id, obra_id, fase_id, zona, nome, ordem, valor_orcamento, percentagem, concluido, data_fim_prevista")
            .in("obra_id", idsObras),
        db.from("cortes_semanais")
            .select("obra_id, semana, corte_linhas(obra_servico_id, percentagem)")
            .in("obra_id", idsObras).eq("estado", "aprovado").order("semana", { ascending: false }),
    ]);
    if (p.error) { console.error("pacotes", p.error); return { pacotes: [], avanco: {}, curva: {}, pctFase: {} }; }
    // O peso de cada pacote (o valor) fica no servidor: o cliente só recebe a
    // % já calculada da obra e a % de cada pacote
    const pacotes = (p.data || [])
        .sort((a: any, b: any) => String(a.zona || "\uffff").localeCompare(String(b.zona || "\uffff"), "pt") || (a.ordem || 0) - (b.ordem || 0))
        .map((x: any) => {
            const pct = x.concluido ? 100 : Math.max(0, Math.min(100, Number(x.percentagem || 0)));
            return { obra_id: x.obra_id, fase_id: x.fase_id || null, zona: x.zona || "", nome: x.nome, percentagem: Math.round(pct),
                     atrasado: pct < 100 && !!x.data_fim_prevista && x.data_fim_prevista < hoje,
                     peso: Number(x.valor_orcamento || 0), id: x.id, fim: x.data_fim_prevista };
        });
    const avanco: Record<string, number> = {};
    for (const id of idsObras) {
        const l = pacotes.filter((x: any) => x.obra_id === id);
        if (!l.length) continue;
        const tot = l.reduce((t: number, x: any) => t + x.peso, 0);
        avanco[id] = Math.round(tot > 0
            ? l.reduce((t: number, x: any) => t + x.peso * x.percentagem, 0) / tot
            : l.reduce((t: number, x: any) => t + x.percentagem, 0) / l.length);
    }
    const pctFase: Record<string, number> = {};
    for (const fid of new Set(pacotes.map((x: any) => x.fase_id).filter(Boolean))) {
        const l = pacotes.filter((x: any) => x.fase_id === fid);
        const tot = l.reduce((t: number, x: any) => t + x.peso, 0);
        pctFase[fid as string] = Math.round(tot > 0
            ? l.reduce((t: number, x: any) => t + x.peso * x.percentagem, 0) / tot
            : l.reduce((t: number, x: any) => t + x.percentagem, 0) / l.length);
    }
    // Curva real vs planeado de cada obra, semana a semana
    const curva: Record<string, any[]> = {};
    for (const id of idsObras) {
        const pacs = pacotes.filter((x: any) => x.obra_id === id);
        const cs = (c.error ? [] : c.data || []).filter((x: any) => x.obra_id === id).reverse();
        const pts = curvaDaObra(pacs, cs);
        if (pts.length) curva[id] = pts;
    }
    return {
        pacotes: pacotes.map(({ peso, id, fim, ...x }: any) => x),
        avanco,
        curva,
        pctFase,
    };
}

// Segunda-feira da semana de uma data "AAAA-MM-DD"
function segunda(d: string) {
    const t = new Date(d + "T12:00:00Z");
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return t.toISOString().slice(0, 10);
}

// Pontos semanais { semana, real, previsto } (0–100). Real: a % pesada pelo
// valor, aplicando os cortes aprovados por ordem (antes do primeiro, tudo a
// 0). Previsto: o peso dos pacotes que deviam estar terminados no fim dessa
// semana (pela data "terminar até"). Sem cortes nem datas, não há curva.
function curvaDaObra(pacs: any[], cortesAsc: any[]) {
    if (!pacs.length) return [];
    const tot = pacs.reduce((t, x) => t + x.peso, 0);
    const peso = (x: any) => tot > 0 ? x.peso / tot : 1 / pacs.length;
    const comFim = pacs.filter(x => x.fim);
    const semanas = [...cortesAsc.map(x => x.semana), ...comFim.map(x => segunda(x.fim))].sort();
    if (!semanas.length) return [];
    const ultimaReal = cortesAsc.length ? cortesAsc[cortesAsc.length - 1].semana : null;
    const pct: Record<string, number> = {};
    const pontos: any[] = [];
    let s = semanas[0];
    for (let i = 0; i < 80 && s <= semanas[semanas.length - 1]; i++) {
        for (const corte of cortesAsc.filter(x => x.semana === s))
            for (const l of corte.corte_linhas || []) pct[l.obra_servico_id] = Number(l.percentagem);
        const fimSemana = new Date(new Date(s + "T12:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);
        pontos.push({
            semana: s,
            real: ultimaReal && s <= ultimaReal ? Math.round(pacs.reduce((t, x) => t + peso(x) * (pct[x.id] || 0), 0)) : null,
            previsto: comFim.length ? Math.round(pacs.reduce((t, x) => t + (x.fim && x.fim <= fimSemana ? peso(x) * 100 : 0), 0)) : null,
        });
        s = new Date(new Date(s + "T12:00:00Z").getTime() + 7 * 86400000).toISOString().slice(0, 10);
    }
    return pontos;
}

// Resposta do cliente a um orçamento. Só vale para um documento de orçamento
// visível de uma obra deste cliente, com o orçamento ainda "enviado" e sem
// outra resposta por tratar.
async function responderOrcamento(db: any, req: Request, clienteId: string,
                                  corpo: { documento_id?: string; resposta?: string; comentario?: string }) {
    const docId = String(corpo.documento_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(docId)) return resposta({ erro: "Documento inválido" }, 400);
    const tipo = corpo.resposta;
    if (tipo !== "aceite" && tipo !== "alteracoes" && tipo !== "recusa") return resposta({ erro: "Resposta inválida" }, 400);
    const comentario = String(corpo.comentario || "").trim().slice(0, 2000);
    if (tipo === "alteracoes" && !comentario) return resposta({ erro: "Escreva o que gostaria de alterar." }, 400);

    const { data: doc } = await db.from("obra_documentos")
        .select("id, orcamento_id, obras!inner(cliente_id)")
        .eq("id", docId).eq("tipo", "orcamento").eq("visivel_cliente", true)
        .eq("obras.cliente_id", clienteId).maybeSingle();
    if (!doc?.orcamento_id) return resposta({ erro: "Orçamento não encontrado" }, 404);

    const { data: orc } = await db.from("orcamentos").select("id, estado").eq("id", doc.orcamento_id).maybeSingle();
    if (!orc || orc.estado !== "enviado") return resposta({ erro: "Este orçamento já não está à espera de resposta." }, 409);

    const { error } = await db.from("orcamento_respostas").insert({
        orcamento_id: orc.id, cliente_id: clienteId, documento_id: doc.id,
        resposta: tipo, comentario: comentario || null,
        ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
        navegador: (req.headers.get("user-agent") || "").slice(0, 300) || null,
    });
    // 23505: já há uma resposta por tratar (índice único)
    if (error?.code === "23505") return resposta({ erro: "Já recebemos a sua resposta a este orçamento." }, 409);
    if (error) { console.error(error); return resposta({ erro: "Não foi possível guardar a resposta." }, 500); }
    return resposta({ ok: true });
}

// Soma dos pagamentos parciais (tabela pagamentos_fatura) por movimento.
// Sem a tabela (SQL por correr) devolve vazio e tudo fica como antes.
async function somaPagamentos(db: any, ids: string[]): Promise<Map<string, number>> {
    const r = new Map<string, number>();
    if (!ids.length) return r;
    const { data, error } = await db.from("pagamentos_fatura").select("movimento_id, valor").in("movimento_id", ids);
    if (error) { console.error("pagamentos_fatura", error.message); return r; }
    for (const p of data || []) r.set(p.movimento_id, (r.get(p.movimento_id) || 0) + Number(p.valor || 0));
    return r;
}

// Documentos novos para o cliente: visíveis há menos de 7 dias e sem
// "Tomei conhecimento". Sem as colunas (SQL documentos_novos_cliente.sql por
// correr), nada é novo e a página fica como antes.
const DIAS_NOVO = 7;
async function documentosNovos(db: any, ids: string[]): Promise<Set<string>> {
    const r = new Set<string>();
    if (!ids.length) return r;
    const desde = new Date(Date.now() - DIAS_NOVO * 86400000).toISOString();
    const { data, error } = await db.from("obra_documentos").select("id")
        .in("id", ids).is("cliente_viu_em", null).gte("visivel_desde", desde);
    if (error) { console.error("documentos novos", error.message); return r; }
    for (const d of data || []) r.add(d.id);
    return r;
}

// "Tomei conhecimento": guarda a data só nos documentos visíveis das obras
// deste cliente que ainda não tinham sido vistos.
async function tomeiConhecimento(db: any, clienteId: string, documentos: unknown) {
    const ids = (Array.isArray(documentos) ? documentos : [])
        .map(String).filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
    if (!ids.length) return resposta({ erro: "Sem documentos" }, 400);
    const { data: obras } = await db.from("obras").select("id").eq("cliente_id", clienteId);
    const idsObras = (obras || []).map((o: any) => o.id);
    if (!idsObras.length) return resposta({ ok: true });
    const { error } = await db.from("obra_documentos").update({ cliente_viu_em: new Date().toISOString() })
        .in("id", ids).in("obra_id", idsObras).eq("visivel_cliente", true).is("cliente_viu_em", null);
    if (error) { console.error(error); return resposta({ erro: "Não foi possível guardar." }, 500); }
    return resposta({ ok: true });
}
