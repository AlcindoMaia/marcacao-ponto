// =======================================================
// pedir-material — REFORMADA
//
// Foi substituída pela função "assistente", que faz isto e mais: além
// dos pedidos de material, responde a perguntas sobre os dados.
//
// Não consigo apagar funções a partir daqui, por isso esta ficou vazia:
// deixou de chamar a IA, deixou de ler a base de dados, e devolve 410.
// Para a apagar de vez: painel do Supabase → Edge Functions →
// pedir-material → Delete.
// =======================================================

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    return new Response(
        JSON.stringify({
            erro: "Esta função foi substituída. Usa /functions/v1/assistente.",
        }),
        { status: 410, headers: { ...CORS, "Content-Type": "application/json" } },
    );
});
