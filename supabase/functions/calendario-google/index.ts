// =======================================================
// calendario-google
// Devolve as reuniões do Google Calendar do Alcindo entre duas datas,
// para aparecerem no quadro do Planeamento.
//
// Só lê. Usa o "endereço secreto no formato iCal" do calendário, que fica
// num segredo do servidor e nunca chega ao browser: quem tiver esse link
// vê a agenda toda.
//
// Segredos: GOOGLE_CALENDAR_ICS — um ou mais links .ics (separados por
// espaço, vírgula ou mudança de linha, para juntar vários calendários)
// =======================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import ICAL from "npm:ical.js@2.2.1";
import { lerReunioes } from "./reunioes.ts";

const MAX_DIAS = 62;   // o quadro pede uma semana; isto chega para um mês com folga

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), {
        status, headers: { ...CORS, "Content-Type": "application/json" },
    });
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST")    return resposta({ erro: "Método não permitido" }, 405);

    const url     = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin   = createClient(url, service);

    // ---- Só admins ----
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error: erroUser } = await admin.auth.getUser(jwt);
    if (erroUser || !user?.email) return resposta({ erro: "Sessão inválida" }, 401);

    const { data: ehAdmin } = await admin
        .from("admins").select("email").eq("email", user.email).maybeSingle();
    if (!ehAdmin) return resposta({ erro: "Sem permissão" }, 403);

    let corpo: { de?: string; ate?: string };
    try { corpo = await req.json(); } catch { return resposta({ erro: "JSON inválido" }, 400); }
    const { de, ate } = corpo;
    if (!de || !ate || !DATA.test(de) || !DATA.test(ate) || de > ate) {
        return resposta({ erro: "Datas inválidas" }, 400);
    }
    if ((Date.parse(ate) - Date.parse(de)) / 86_400_000 > MAX_DIAS) {
        return resposta({ erro: `No máximo ${MAX_DIAS} dias de cada vez` }, 400);
    }

    // Aceita o link como o Google o mostra ou como se cola sem querer:
    // entre aspas, com webcal:// ou http:// em vez de https://
    // e até sem o https:// à frente
    const bruto = Deno.env.get("GOOGLE_CALENDAR_ICS") || "";
    const links = bruto
        .split(/[\s,;]+/)
        .map(l => l.replace(/^["'<]+|["'>]+$/g, "")
                   .replace(/^(webcal|http):\/\//i, "https://")
                   .replace(/^(?!https:\/\/)(?=calendar\.google\.com\/)/i, "https://"))
        .filter(l => /^https:\/\//i.test(l));
    if (!links.length) {
        // Só a forma do valor, nunca o valor: chega para saber o que foi colado
        console.log(`GOOGLE_CALENDAR_ICS sem link utilizável: ${bruto.length} caracteres, ` +
            `começa por "${bruto.slice(0, 6).replace(/[^a-z:/"' ]/gi, "?")}", ` +
            `google=${bruto.includes("calendar.google.com")}, ical=${bruto.includes("/ical/")}`);
        // Vai como falha para o quadro mostrar o aviso "⚠ calendário"
        return resposta({ configurado: false, reunioes: [],
            falhas: ["O link do Google Calendar não está guardado no servidor (segredo GOOGLE_CALENDAR_ICS)."] });
    }

    const reunioes = [];
    const falhas: string[] = [];
    await Promise.all(links.map(async (link, i) => {
        try {
            const r = await fetch(link, { signal: AbortSignal.timeout(10_000) });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const ics = await r.text();
            const lidas = lerReunioes(ICAL, ics, de, ate);
            // Só contagens: o link e o conteúdo da agenda não vão para os registos
            console.log(`calendário ${i + 1}: ${ics.length} bytes, ` +
                `${(ics.match(/BEGIN:VEVENT/g) || []).length} eventos, ${lidas.length} entre ${de} e ${ate}`);
            reunioes.push(...lidas);
        } catch (e) {
            // Nunca devolver o link: é secreto
            console.error(`calendário ${i + 1}:`, (e as Error).message);
            falhas.push(`Não foi possível ler o calendário ${i + 1}.`);
        }
    }));

    reunioes.sort((x, y) =>
        x.data.localeCompare(y.data) ||
        (x.hora_inicio || "").localeCompare(y.hora_inicio || ""));

    return resposta({ configurado: true, reunioes, falhas });
});
