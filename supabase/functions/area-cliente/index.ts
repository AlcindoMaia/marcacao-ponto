// =======================================================
// area-cliente
// Dados da Área do cliente (cliente.html?t=<código>).
//
// Pública (sem sessão): quem tem o link fixo do cliente entra. Por isso esta
// função é a ÚNICA porta e só devolve o que o cliente pode ver:
//   - o nome do cliente;
//   - as obras ligadas a ele (nome, local, estado, percentagem, data prevista);
//   - os documentos dessas obras marcados "Visível ao cliente", com um link
//     temporário (1 hora) para abrir o ficheiro;
//   - nas faturas, o total e se está paga; nos orçamentos, se está aceite.
// Nunca devolve custos, margens, fornecedores, horas ou outras obras.
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

    let corpo: { token?: string };
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

    const { data: obras } = await db.from("obras")
        .select("id, codigo, nome, local, estado, percentagem_conclusao, data_conclusao_prevista")
        .eq("cliente_id", cliente.id)
        .order("created_at", { ascending: false });

    const idsObras = (obras || []).map(o => o.id);
    let documentos: any[] = [];

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
            idsOrc.length ? db.from("orcamentos").select("id, estado").in("id", idsOrc) : { data: [] },
            idsMov.length ? db.from("movimentos_financeiros").select("id, valor_total, estado_pagamento")
                              .in("id", idsMov).eq("tipo", "entrada") : { data: [] },
        ]);
        const estadoOrc = new Map((orcs.data || []).map((o: any) => [o.id, o.estado]));
        const dadosMov  = new Map((movs.data || []).map((m: any) => [m.id, m]));

        const assinados = lista.length
            ? (await db.storage.from(BUCKET).createSignedUrls(lista.map(d => d.caminho), VALIDADE_LINK)).data || []
            : [];
        const urlDe = new Map(assinados.map((s: any) => [s.path, s.signedUrl]));

        documentos = lista.map(d => {
            const mov = d.movimento_id ? dadosMov.get(d.movimento_id) : null;
            return {
                id: d.id,
                obra_id: d.obra_id,
                tipo: d.tipo,
                nome: d.nome_ficheiro,
                mime: d.mime,
                numero: d.numero_documento,
                data: d.data_documento || d.created_at?.slice(0, 10),
                url: urlDe.get(d.caminho) || null,
                estado_orcamento: d.orcamento_id ? estadoOrc.get(d.orcamento_id) || null : null,
                total: mov ? mov.valor_total : null,
                paga: mov ? mov.estado_pagamento === "pago" : null,
            };
        });
    }

    await db.from("clientes").update({ ultimo_acesso: new Date().toISOString() }).eq("id", cliente.id);

    return resposta({ cliente: { nome: cliente.nome }, obras: obras || [], documentos });
});
