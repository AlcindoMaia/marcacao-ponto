// =======================================================
// dados-publicos
// Serviços públicos e gratuitos usados pelo painel, chamados daqui e não do
// browser: assim não há problemas de CORS e a Nominatim recebe a
// identificação que exige.
//
//   { acao: "feriados", ano }        feriados nacionais (Nager.Date)
//   { acao: "morada",   texto }      morada → coordenadas (Nominatim / OSM)
//   { acao: "tempo",    pontos }     previsão de 5 dias (IPMA)
//   { acao: "nif",      nif }        valida o NIF e procura-o no VIES (UE)
//
// Nenhum precisa de chave nem de conta. Só admins.
// =======================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { feriadosCalculados, nifValido } from "./util.ts";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// A Nominatim recusa pedidos sem uma identificação da aplicação.
const AGENTE = "MaiaSolutions-Plataforma/1.0 (+https://github.com/AlcindoMaia/marcacao-ponto)";

function resposta(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), {
        status, headers: { ...CORS, "Content-Type": "application/json" },
    });
}

async function lerJson(url: string, ms = 8000) {
    const r = await fetch(url, {
        headers: { "User-Agent": AGENTE, "Accept": "application/json" },
        signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) throw new Error(`${new URL(url).host} respondeu ${r.status}`);
    return await r.json();
}

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

    let corpo: Record<string, unknown>;
    try { corpo = await req.json(); } catch { return resposta({ erro: "JSON inválido" }, 400); }

    try {
        switch (corpo.acao) {
            case "feriados": return resposta(await feriados(Number(corpo.ano)));
            case "morada":   return resposta(await morada(String(corpo.texto || "")));
            case "tempo":    return resposta(await tempo(corpo.pontos));
            case "nif":      return resposta(await nif(String(corpo.nif || "")));
            default:         return resposta({ erro: "Ação desconhecida" }, 400);
        }
    } catch (e) {
        console.error(corpo.acao, e);
        return resposta({ erro: e instanceof Error ? e.message : String(e) }, 502);
    }
});

// ── Feriados ────────────────────────────────────────────────
// Só os nacionais: os regionais (Açores, Madeira) vêm com global = false.
// Se a Nager.Date falhar, usam-se os calculados, que são os mesmos.
const _feriados = new Map<number, unknown>();

async function feriados(ano: number) {
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new Error("Ano inválido");
    if (_feriados.has(ano)) return _feriados.get(ano);

    let lista: { data: string; nome: string }[];
    let fonte = "Nager.Date";
    try {
        const j = await lerJson(`https://date.nager.at/api/v3/PublicHolidays/${ano}/PT`);
        lista = (j as { date: string; localName: string; global: boolean; types?: string[] }[])
            .filter(f => f.global && (!f.types || f.types.includes("Public")))
            .map(f => ({ data: f.date, nome: f.localName }));
        if (!lista.length) throw new Error("lista vazia");
    } catch (e) {
        console.error("Nager.Date:", e);
        lista = feriadosCalculados(ano);
        fonte = "calculados";
    }
    const r = { ano, fonte, feriados: lista };
    _feriados.set(ano, r);
    return r;
}

// ── Morada → coordenadas ────────────────────────────────────
// Política da Nominatim: no máximo 1 pedido por segundo, o que chega
// perfeitamente para quem procura uma morada à mão.
async function morada(texto: string) {
    texto = texto.trim();
    if (texto.length < 3 || texto.length > 200) throw new Error("Escreva a morada com pelo menos 3 letras");
    const q = new URLSearchParams({
        q: texto, format: "jsonv2", countrycodes: "pt", limit: "5", "accept-language": "pt-PT",
    });
    const j = await lerJson(`https://nominatim.openstreetmap.org/search?${q}`);
    return {
        resultados: (j as { display_name: string; lat: string; lon: string; type: string }[])
            .map(r => ({ nome: r.display_name, lat: Number(r.lat), lon: Number(r.lon), tipo: r.type })),
    };
}

// ── Previsão do tempo ───────────────────────────────────────
// O IPMA publica a previsão para as capitais de distrito e ilhas. Cada ponto
// usa a mais próxima. Ver os códigos de tempo em
// https://api.ipma.pt/open-data/weather-type-classe.json
type Local = { globalIdLocal: number; local: string; latitude: string; longitude: string };
let _locais: { quando: number; lista: Local[] } | null = null;
const _previsoes = new Map<number, { quando: number; dados: unknown }>();
const UMA_HORA = 3_600_000;

async function locaisIpma() {
    if (_locais && Date.now() - _locais.quando < 24 * UMA_HORA) return _locais.lista;
    const j = await lerJson("https://api.ipma.pt/open-data/distrits-islands.json");
    _locais = { quando: Date.now(), lista: j.data };
    return _locais.lista;
}

function maisProximo(locais: Local[], lat: number, lon: number) {
    let melhor = locais[0], dist = Infinity;
    const cos = Math.cos(lat * Math.PI / 180);
    for (const l of locais) {
        const dLat = Number(l.latitude) - lat;
        const dLon = (Number(l.longitude) - lon) * cos;
        const d = dLat * dLat + dLon * dLon;
        if (d < dist) { dist = d; melhor = l; }
    }
    return melhor;
}

async function previsao(local: Local) {
    const c = _previsoes.get(local.globalIdLocal);
    if (c && Date.now() - c.quando < UMA_HORA) return c.dados;
    const j = await lerJson(
        `https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/${local.globalIdLocal}.json`);
    const dados = {
        local: local.local,
        atualizado: j.dataUpdate,
        dias: (j.data as Record<string, string | number>[]).map(d => ({
            data:  d.forecastDate,
            prob:  Math.round(Number(d.precipitaProb)),
            tMin:  Number(d.tMin),
            tMax:  Number(d.tMax),
            tipo:  Number(d.idWeatherType),
            vento: Number(d.classWindSpeed),
        })),
    };
    _previsoes.set(local.globalIdLocal, { quando: Date.now(), dados });
    return dados;
}

// pontos: { chave: [lat, lon] }. Devolve a previsão de cada local do IPMA
// usado e, por chave, qual deles lhe calhou.
async function tempo(pontos: unknown) {
    if (!pontos || typeof pontos !== "object") throw new Error("Pontos em falta");
    const entradas = Object.entries(pontos as Record<string, unknown>).slice(0, 200);
    const locais = await locaisIpma();

    const porChave: Record<string, number> = {};
    const usados = new Map<number, Local>();
    for (const [chave, p] of entradas) {
        if (!Array.isArray(p)) continue;
        const [lat, lon] = p.map(Number);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const l = maisProximo(locais, lat, lon);
        porChave[chave] = l.globalIdLocal;
        usados.set(l.globalIdLocal, l);
    }

    const previsoes: Record<number, unknown> = {};
    await Promise.all([...usados.values()].map(async l => {
        previsoes[l.globalIdLocal] = await previsao(l);
    }));
    return { pontos: porChave, previsoes };
}

// ── NIF ─────────────────────────────────────────────────────
// O dígito de controlo apanha os enganos a escrever. O VIES só conhece quem
// está registado para IVA intracomunitário: um particular, ou uma pequena
// empresa que não fature para fora, não aparece e isso é normal.
async function nif(valor: string) {
    const n = valor.replace(/\s/g, "").replace(/^PT/i, "");
    if (!nifValido(n)) return { nif: n, valido: false };

    try {
        const j = await lerJson(
            `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/PT/vat/${n}`, 10000);
        const limpo = (s: unknown) => {
            const t = String(s ?? "").trim();
            return t && t !== "---" ? t.replace(/\s*\n\s*/g, ", ") : null;
        };
        return {
            nif: n, valido: true,
            vies: j.userError && j.userError !== "VALID" && j.userError !== "INVALID"
                ? { erro: j.userError }
                : { registado: !!j.isValid, nome: limpo(j.name), morada: limpo(j.address) },
        };
    } catch (e) {
        console.error("VIES:", e);
        return { nif: n, valido: true, vies: { erro: "VIES indisponível" } };
    }
}
