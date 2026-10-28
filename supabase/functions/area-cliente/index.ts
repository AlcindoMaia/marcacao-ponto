// =======================================================
// area-cliente
// Dados da Área do cliente (cliente.html?t=<código>).
//
// Pública (sem sessão): quem tem o link fixo do cliente entra. Por isso esta
// função é a ÚNICA porta e só devolve o que o cliente pode ver:
//   - o nome do cliente;
//   - as obras ligadas a ele (nome, local, estado, percentagem, data prevista);
//   - as fases visíveis de cada obra (nome, datas, estado) e os autos de
//     medição já enviados (serviço, % acumulada, valor, totais);
//   - as notas do diário de obra marcadas como visíveis (as últimas 20);
//   - os documentos dessas obras marcados "Visível ao cliente", com um link
//     temporário (1 hora) para abrir o ficheiro;
//   - nas faturas, o total e se está paga; nos orçamentos, o estado, o total
//     e a resposta do cliente que ainda está por tratar.
// Nunca devolve custos, margens, fornecedores, horas ou outras obras.
//
// A única coisa que o cliente pode escrever é a resposta a um orçamento
// enviado (acao "responder_orcamento"): "aceite" ou "alteracoes" com um
// comentário. Fica em orcamento_respostas e não muda o orçamento; quem o
// passa a aceite é o Alcindo, na app.
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

    let corpo: { token?: string; acao?: string; documento_id?: string; resposta?: string; comentario?: string };
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

    const { data: obras } = await db.from("obras")
        .select("id, codigo, nome, local, estado, percentagem_conclusao, data_conclusao_prevista")
        .eq("cliente_id", cliente.id)
        .order("created_at", { ascending: false });

    const idsObras = (obras || []).map(o => o.id);
    let documentos: any[] = [];
    let fases: any[] = [], autos: any[] = [], diario: any[] = [];

    if (idsObras.length) {
        const [f, a, n] = await Promise.all([
            db.from("obra_fases").select("obra_id, nome, ordem, data_inicio, data_fim, estado")
                .in("obra_id", idsObras).eq("visivel_cliente", true).order("ordem"),
            db.from("autos_medicao")
                .select("id, obra_id, numero, data, estado, taxa_iva, notas, auto_linhas(percentagem, valor, obra_servicos(nome, ordem))")
                .in("obra_id", idsObras).in("estado", ["enviado", "faturado"]).order("numero"),
            db.from("obra_diario").select("obra_id, data, notas")
                .in("obra_id", idsObras).eq("visivel_cliente", true).order("data", { ascending: false }).limit(20),
        ]);
        fases = f.data || [];
        diario = n.data || [];
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
        const { data: pend } = idsOrc.length
            ? await db.from("orcamento_respostas").select("orcamento_id, resposta, created_at")
                .in("orcamento_id", idsOrc).is("tratada_em", null)
            : { data: [] };
        const pendente = new Map((pend || []).map((p: any) => [p.orcamento_id, p]));

        const assinados = lista.length
            ? (await db.storage.from(BUCKET).createSignedUrls(lista.map(d => d.caminho), VALIDADE_LINK)).data || []
            : [];
        const urlDe = new Map(assinados.map((s: any) => [s.path, s.signedUrl]));

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
                estado_orcamento: orc ? orc.estado : null,
                resposta_pendente: pr ? { resposta: pr.resposta, data: pr.created_at } : null,
                total: mov ? mov.valor_total : orc ? orc.total_com_iva : null,
                paga: mov ? mov.estado_pagamento === "pago" : null,
            };
        });
    }

    await db.from("clientes").update({ ultimo_acesso: new Date().toISOString() }).eq("id", cliente.id);

    return resposta({ cliente: { nome: cliente.nome }, obras: obras || [], documentos, fases, autos, diario });
});

// Resposta do cliente a um orçamento. Só vale para um documento de orçamento
// visível de uma obra deste cliente, com o orçamento ainda "enviado" e sem
// outra resposta por tratar.
async function responderOrcamento(db: any, req: Request, clienteId: string,
                                  corpo: { documento_id?: string; resposta?: string; comentario?: string }) {
    const docId = String(corpo.documento_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(docId)) return resposta({ erro: "Documento inválido" }, 400);
    const tipo = corpo.resposta;
    if (tipo !== "aceite" && tipo !== "alteracoes") return resposta({ erro: "Resposta inválida" }, 400);
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
