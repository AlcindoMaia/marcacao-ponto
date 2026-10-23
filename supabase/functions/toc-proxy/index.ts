// =======================================================
// toc-proxy — Supabase Edge Function
// Proxy OAuth2 para o TOC Online
//
// Esta função estava aberta à internet sem autenticação nenhuma, com o
// destino do fetch escolhido por quem chamava. Quatro problemas, todos
// fechados aqui:
//
//   1. Sem autenticação. Todas as outras funções verificam o JWT e a
//      pertença à tabela `admins`; esta não verificava nada. Agora
//      verifica, excepto no callback do OAuth — que vem de um redirect
//      do TOC e por isso não pode trazer JWT.
//
//   2. Destino do fetch por concatenação de string. Um `x-toc-path`
//      começado por `@` fazia de api35.toconline.pt a parte de utilizador
//      do URL, e o host real passava a ser o do atacante; um ponto à
//      frente dava-lhe um subdomínio. Em qualquer dos casos a função ia
//      buscar o que ele quisesse e devolvia-lhe o corpo — um relay
//      anónimo. Agora o caminho é validado contra uma lista de prefixos
//      e o host do URL construído é comparado com o esperado.
//
//   3. OAuth sem `state`. O callback aceitava qualquer ?code= de qualquer
//      pessoa. Agora o estado é gerado quando um administrador pede o URL
//      de autorização, guardado na base de dados, e o callback exige
//      encontrá-lo não usado e dentro do prazo. De uso único.
//
//   4. CORS aberto a qualquer origem. Agora só a do painel.
// =======================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const TOC_CLIENT_ID     = Deno.env.get("TOC_CLIENT_ID") ?? "";
const TOC_CLIENT_SECRET = Deno.env.get("TOC_CLIENT_SECRET") ?? "";
const TOC_OAUTH_URL     = Deno.env.get("TOC_OAUTH_URL") ?? "https://app35.toconline.pt/oauth";
const TOC_API_BASE      = Deno.env.get("TOC_API_BASE") ?? "https://api35.toconline.pt";
const ADMIN_URL         = Deno.env.get("ADMIN_URL") ?? "https://alcindomaia.github.io/marcacao-ponto/admin.html";
const SELF_URL          = Deno.env.get("SELF_URL") ??
    "https://npyosbigynxmxdakcymg.supabase.co/functions/v1/toc-proxy";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Só a origem do painel. Era "*", o que permitia a qualquer página chamar
// esta função a partir do browser de quem a visitasse.
const ORIGEM_PAINEL = new URL(ADMIN_URL).origin;
const CORS = {
    "Access-Control-Allow-Origin":  ORIGEM_PAINEL,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-toc-path, x-toc-token, x-toc-action",
    "Vary": "Origin",
};

const PRAZO_DO_ESTADO_MS = 10 * 60 * 1000;   // 10 minutos

// Caminhos que o painel precisa de alcançar na API do TOC. Lista fechada: o
// que não estiver aqui é recusado, em vez de se tentar adivinhar o que é
// perigoso. (O toc-online.js usa /customers, /suppliers, /items,
// /sale_invoices e /purchase_invoices.)
const PREFIXOS_PERMITIDOS = [
    "/customers",
    "/suppliers",
    "/items",
    "/sale_invoices",
    "/purchase_invoices",
];

function json(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// O mesmo portão das outras funções: JWT válido e pertença a `admins`.
async function exigirAdmin(req: Request): Promise<Response | null> {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!jwt) return json({ erro: "Não autenticado." }, 401);

    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user?.email) return json({ erro: "Não autenticado." }, 401);

    const { data: adm } = await admin
        .from("admins")
        .select("email")
        .ilike("email", user.email)
        .maybeSingle();
    if (!adm) return json({ erro: "Sem permissão." }, 403);

    return null;
}

// Valida o caminho e devolve o URL final, ou null se não servir. Construir o
// URL e comparar o host é o que trava o truque do `@`: por muito que o
// caminho se pareça com um caminho, se o host sair diferente, recusa.
function urlDaApiTOC(caminho: string): URL | null {
    if (!caminho.startsWith("/")) return null;
    if (caminho.includes("..") || caminho.startsWith("//")) return null;
    if (/[@\\\s]/.test(caminho)) return null;

    const semQuery = caminho.split("?")[0];
    if (!PREFIXOS_PERMITIDOS.some(p => semQuery === p || semQuery.startsWith(p + "/"))) {
        return null;
    }

    let url: URL;
    try { url = new URL(TOC_API_BASE + caminho); } catch { return null; }
    if (url.origin !== new URL(TOC_API_BASE).origin) return null;
    return url;
}

async function trocarCodigo(code: string) {
    const basic = btoa(`${TOC_CLIENT_ID}:${TOC_CLIENT_SECRET}`);
    const resp  = await fetch(`${TOC_OAUTH_URL}/token`, {
        method: "POST",
        headers: {
            "Content-Type":  "application/x-www-form-urlencoded",
            "Accept":        "application/json",
            "Authorization": `Basic ${basic}`,
        },
        body: new URLSearchParams({
            grant_type:   "authorization_code",
            code,
            redirect_uri: SELF_URL,
        }),
    });
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`Troca de código falhou: ${resp.status}`);
    return JSON.parse(texto) as { access_token: string; refresh_token?: string };
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    const url    = new URL(req.url);
    const code   = url.searchParams.get("code");
    const estado = url.searchParams.get("state");
    const accao  = req.headers.get("x-toc-action") ?? url.searchParams.get("action") ?? "";

    try {
        // ── Callback do OAuth ──────────────────────────────────────────
        // Vem de um redirect do TOC, logo não traz JWT. Quem o autoriza é o
        // `state`, que só existe se um administrador o tiver pedido.
        if (code && req.method === "GET") {
            if (!estado) {
                return new Response("Falta o parâmetro state.", { status: 400 });
            }

            const { data: linha } = await admin
                .from("toc_oauth_estado")
                .select("estado, criado_em, usado_em")
                .eq("estado", estado)
                .maybeSingle();

            if (!linha) {
                return new Response("Estado desconhecido. Reinicie a autorização no painel.", { status: 400 });
            }
            if (linha.usado_em) {
                return new Response("Este estado já foi usado. Reinicie a autorização.", { status: 400 });
            }
            if (Date.now() - new Date(linha.criado_em).getTime() > PRAZO_DO_ESTADO_MS) {
                return new Response("A autorização expirou. Reinicie no painel.", { status: 400 });
            }

            // Marcar como usado ANTES de trocar o código, para que duas
            // chegadas em paralelo não sejam ambas aceites.
            const { data: marcado } = await admin
                .from("toc_oauth_estado")
                .update({ usado_em: new Date().toISOString() })
                .eq("estado", estado)
                .is("usado_em", null)
                .select("estado")
                .maybeSingle();
            if (!marcado) {
                return new Response("Este estado já foi usado. Reinicie a autorização.", { status: 400 });
            }

            const tokens = await trocarCodigo(code);
            // ADMIN_URL é fixo por variável de ambiente, nunca vem do pedido:
            // é isso que impede que o token seja entregue noutro sítio.
            return Response.redirect(
                `${ADMIN_URL}#toc_token=${encodeURIComponent(tokens.access_token)}`, 302);
        }

        // ── Daqui para baixo, só administradores ───────────────────────
        const recusa = await exigirAdmin(req);
        if (recusa) return recusa;

        // ── URL de autorização, com estado de uso único ────────────────
        if (accao === "auth_url") {
            const novoEstado = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
            const jwt = req.headers.get("Authorization")!.replace(/^Bearer\s+/i, "");
            const { data: { user } } = await admin.auth.getUser(jwt);

            const { error } = await admin.from("toc_oauth_estado").insert({
                estado: novoEstado,
                pedido_por: user?.email ?? null,
            });
            if (error) return json({ erro: "Não foi possível iniciar a autorização." }, 500);

            const params = new URLSearchParams({
                client_id:     TOC_CLIENT_ID,
                redirect_uri:  SELF_URL,
                response_type: "code",
                scope:         "commercial",
                state:         novoEstado,
            });
            return json({ auth_url: `${TOC_OAUTH_URL}/auth?${params}` });
        }

        // ── Reencaminhar à API do TOC ──────────────────────────────────
        const caminho = req.headers.get("x-toc-path") ?? url.searchParams.get("path") ?? "";
        const token   = req.headers.get("x-toc-token") ?? "";

        if (!caminho) return json({ erro: "Falta x-toc-path." }, 400);
        if (!token)   return json({ erro: "Não autenticado no TOC Online." }, 401);

        const destino = urlDaApiTOC(caminho);
        if (!destino) return json({ erro: "Caminho não permitido." }, 400);

        const resp = await fetch(destino, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept":        "application/json",
                "Content-Type":  "application/json",
            },
            redirect: "manual",   // não seguir redirects para fora do TOC
        });

        const texto = await resp.text();
        let corpo: unknown;
        try { corpo = JSON.parse(texto); } catch { corpo = { erro: "Resposta inesperada do TOC." }; }
        return json(corpo, resp.status);

    } catch (err) {
        console.error("toc-proxy:", err);
        // Mensagem genérica: a do fetch ou do Postgres revela demasiado.
        return json({ erro: "Erro ao falar com o TOC Online." }, 500);
    }
});
