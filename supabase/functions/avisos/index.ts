// =======================================================
// AVISOS — envia notificações para o telemóvel (Web Push)
//
// Quem chama:
//   - o relógio pg_cron, de 5 em 5 minutos, com { acao: "cron" } e o
//     cabeçalho x-avisos-chave (a chave está em push_config.chave_cron);
//   - a app (admin.html), com a sessão do administrador:
//       { acao: "chave" }  devolve a chave pública para ativar os avisos
//       { acao: "teste" }  envia um aviso de teste aos telemóveis de quem pede
//
// O que envia (tipo -> quando):
//   clientes  resposta a um orçamento ou pedido na Área do cliente, na hora
//   resumo    "Precisa de ti" às 8h (só se houver alguma coisa)
//   rh        documentos de RH caducados ou a caducar em 30 dias, segunda às 8h
//   registo   às 19h (seg-sáb), se ainda não houver Registo diário do dia
//   ponto     às 19h, quem marcou entrada hoje e não marcou saída
//
// Nunca avisa duas vezes a mesma coisa: cada aviso tem uma chave em
// push_enviados (ex.: "resp:<id>", "resumo:2026-11-10").
//
// As chaves VAPID são criadas na primeira vez e guardadas em push_config,
// que só a chave de serviço consegue ler. Não há segredos para configurar.
// Publicar com verify_jwt = false (o relógio não tem sessão).
// =======================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const URL_SB   = Deno.env.get("SUPABASE_URL")!;
const SERVICO  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON     = Deno.env.get("SUPABASE_ANON_KEY")!;
const ASSUNTO  = "https://alcindomaia.github.io/marcacao-ponto/";
const JANELA_CLIENTES_H = 6;     // respostas/pedidos mais antigos que isto não se avisam
const DIAS_RH = 30;

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SB = createClient(URL_SB, SERVICO, { auth: { persistSession: false } });

type Aviso = { titulo: string; corpo: string; url: string; tag: string };

// ---------- hora de Lisboa ----------
function lisboa(d = new Date()) {
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
    }).formatToParts(d)) p[x.type] = x.value;
    return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), semana: p.weekday };
}
const curta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => n === 1 ? `1 ${um}` : `${n} ${varios}`;
const cortar = (t: string, n = 120) => t.length > n ? t.slice(0, n - 1) + "…" : t;

// ---------- chaves VAPID ----------
async function chaves() {
    const { data, error } = await SB.from("push_config").select("vapid_publica, vapid_privada").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (data?.vapid_publica && data?.vapid_privada) return { publica: data.vapid_publica, privada: data.vapid_privada };
    const k = webpush.generateVAPIDKeys();
    // Só grava se ainda estiverem vazias (duas chamadas ao mesmo tempo não se pisam)
    await SB.from("push_config").update({ vapid_publica: k.publicKey, vapid_privada: k.privateKey })
        .eq("id", 1).is("vapid_publica", null);
    const { data: d2 } = await SB.from("push_config").select("vapid_publica, vapid_privada").eq("id", 1).single();
    return { publica: d2!.vapid_publica as string, privada: d2!.vapid_privada as string };
}

// ---------- enviar ----------
async function enviar(tipo: string, aviso: Aviso, soUser?: string) {
    let q = SB.from("push_subscricoes").select("id, endpoint, p256dh, auth, tipos, user_id");
    if (soUser) q = q.eq("user_id", soUser);
    const { data: subs, error } = await q;
    if (error) throw error;
    const alvo = (subs || []).filter(s => soUser || (s.tipos || []).includes(tipo));
    if (!alvo.length) return 0;
    const k = await chaves();
    webpush.setVapidDetails(ASSUNTO, k.publica, k.privada);
    let ok = 0;
    await Promise.all(alvo.map(async s => {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                JSON.stringify(aviso), { TTL: 12 * 3600, urgency: "high" });
            ok++;
            await SB.from("push_subscricoes").update({ ultimo_envio: new Date().toISOString(), ultimo_erro: null }).eq("id", s.id);
        } catch (e) {
            const st = (e as { statusCode?: number }).statusCode;
            // 404/410: o telemóvel desativou ou a app foi apagada — deixa de se enviar
            if (st === 404 || st === 410) await SB.from("push_subscricoes").delete().eq("id", s.id);
            else await SB.from("push_subscricoes").update({ ultimo_erro: cortar(`${st ?? ""} ${(e as Error).message}`, 300) }).eq("id", s.id);
        }
    }));
    return ok;
}

// Marca a chave como avisada. Devolve false se já tinha sido.
async function primeiraVez(chave: string) {
    const { data, error } = await SB.from("push_enviados")
        .upsert({ chave }, { onConflict: "chave", ignoreDuplicates: true }).select("chave");
    if (error) throw error;
    return (data || []).length > 0;
}

// ---------- clientes (na hora) ----------
async function avisosClientes(): Promise<Aviso[]> {
    const desde = new Date(Date.now() - JANELA_CLIENTES_H * 3600_000).toISOString();
    const out: Aviso[] = [];
    const { data: resps } = await SB.from("orcamento_respostas")
        .select("id, resposta, comentario, orcamentos(numero, cliente_nome, obras(nome))")
        .is("tratada_em", null).gte("created_at", desde).order("created_at");
    for (const r of resps || []) {
        if (!await primeiraVez("resp:" + r.id)) continue;
        // deno-lint-ignore no-explicit-any
        const o: any = r.orcamentos || {};
        const quem = o.cliente_nome || o.obras?.nome || "Um cliente";
        const verbo = r.resposta === "aceite" ? "aceitou" : r.resposta === "recusa" ? "recusou" : "comentou";
        out.push({ titulo: `${quem} ${verbo} o orçamento ${o.numero || ""}`.trim(),
                   corpo: r.comentario ? cortar(`"${r.comentario}"`) : "Toca para ver na Visão geral.",
                   url: "admin.html", tag: "resp-" + r.id });
    }
    const TIPO: Record<string, string> = { informacao: "pedido de informação", extra: "pedido de trabalho extra", reclamacao: "reclamação", sugestao: "sugestão" };
    const { data: peds } = await SB.from("cliente_pedidos")
        .select("id, tipo, mensagem, obras(nome), clientes(nome)")
        .eq("estado", "novo").gte("created_at", desde).order("created_at");
    for (const p of peds || []) {
        if (!await primeiraVez("ped:" + p.id)) continue;
        // deno-lint-ignore no-explicit-any
        const x: any = p;
        out.push({ titulo: `${x.clientes?.nome || "Cliente"}: ${TIPO[p.tipo] || "pedido"}${x.obras?.nome ? " · " + x.obras.nome : ""}`,
                   corpo: cortar(p.mensagem || ""), url: "admin.html", tag: "ped-" + p.id });
    }
    return out;
}

// ---------- 8h: Precisa de ti ----------
async function contar(q: PromiseLike<{ count: number | null }>) { return (await q).count || 0; }
async function avisoResumo(hoje: string): Promise<Aviso | null> {
    const h = { count: "exact" as const, head: true };
    const [resp, peds, cortes, mat, atraso, semObra, tarefas] = await Promise.all([
        contar(SB.from("orcamento_respostas").select("id", h).is("tratada_em", null)),
        contar(SB.from("cliente_pedidos").select("id", h).eq("estado", "novo")),
        contar(SB.from("cortes_semanais").select("id", h).eq("estado", "pendente")),
        contar(SB.from("pedidos").select("id", h).eq("estado", "rascunho")),
        contar(SB.from("movimentos_financeiros").select("id", h).eq("estado_pagamento", "por_pagar")
            .eq("tipo", "saida").eq("ativo", true).lt("data_documento", hoje)),
        contar(SB.from("movimentos_financeiros").select("id", h).is("obra_id", null).eq("tipo", "saida").eq("ativo", true)),
        contar(SB.from("tarefas").select("id", h).lt("data_prevista", hoje).not("estado", "in", "(concluida,cancelada)")),
    ]);
    const partes = [
        resp && plural(resp, "resposta de cliente", "respostas de clientes"),
        peds && plural(peds, "pedido de cliente", "pedidos de clientes"),
        cortes && plural(cortes, "corte semanal por aprovar", "cortes semanais por aprovar"),
        mat && plural(mat, "pedido de material por validar", "pedidos de material por validar"),
        atraso && plural(atraso, "fatura por pagar", "faturas por pagar"),
        semObra && plural(semObra, "despesa sem obra", "despesas sem obra"),
        tarefas && plural(tarefas, "tarefa atrasada", "tarefas atrasadas"),
    ].filter(Boolean) as string[];
    if (!partes.length) return null;
    return { titulo: "Precisa de ti hoje", corpo: partes.join(" · "), url: "admin.html", tag: "resumo" };
}

// ---------- segunda 8h: documentos de RH ----------
async function avisoRH(hoje: string): Promise<Aviso | null> {
    const limite = new Date(Date.parse(hoje + "T12:00:00Z") + DIAS_RH * 86400_000).toISOString().slice(0, 10);
    const { data } = await SB.from("rh_documentos")
        .select("tipo, descricao, validade, funcionario_id, funcionarios(nome, ativo)")
        .not("validade", "is", null).lte("validade", limite).order("validade");
    // deno-lint-ignore no-explicit-any
    const docs = (data || []).filter((d: any) => !d.funcionario_id || d.funcionarios?.ativo);
    if (!docs.length) return null;
    const caducados = docs.filter(d => d.validade < hoje).length;
    // deno-lint-ignore no-explicit-any
    const linhas = docs.slice(0, 4).map((d: any) =>
        `${d.funcionarios?.nome || "Empresa"}: ${d.descricao || d.tipo} (${curta(d.validade)})`);
    return { titulo: caducados ? `${plural(docs.length, "documento de RH", "documentos de RH")} a tratar (${caducados} caducado${caducados === 1 ? "" : "s"})`
                               : `${plural(docs.length, "documento de RH caduca", "documentos de RH caducam")} em ${DIAS_RH} dias`,
             corpo: linhas.join(" · ") + (docs.length > 4 ? ` · e mais ${docs.length - 4}` : ""),
             url: "admin.html", tag: "rh" };
}

// ---------- 19h: Registo diário ----------
async function avisoRegisto(hoje: string): Promise<Aviso | null> {
    const n = await contar(SB.from("registos_admin").select("id", { count: "exact", head: true }).eq("data", hoje));
    if (n) return null;
    return { titulo: "Falta o Registo diário de hoje", corpo: "Ainda ninguém registou quem trabalhou hoje. Toca para abrir.",
             url: "registo-admin.html", tag: "registo" };
}

// ---------- 19h: saída do ponto esquecida ----------
async function avisoPonto(hoje: string): Promise<Aviso | null> {
    const desde = new Date(Date.now() - 26 * 3600_000).toISOString();
    const { data } = await SB.from("ponto").select("funcionario_id, tipo, datahora, funcionarios(nome)")
        .gte("datahora", desde).order("datahora");
    const ultimo = new Map<string, { tipo: string; nome: string }>();
    // deno-lint-ignore no-explicit-any
    for (const p of (data || []) as any[]) {
        if (lisboa(new Date(p.datahora)).dia !== hoje) continue;
        ultimo.set(p.funcionario_id, { tipo: p.tipo, nome: p.funcionarios?.nome || "?" });
    }
    const nomes = [...ultimo.values()].filter(u => u.tipo === "entrada").map(u => u.nome);
    if (!nomes.length) return null;
    return { titulo: nomes.length === 1 ? `${nomes[0]} não marcou a saída` : `${nomes.length} trabalhadores não marcaram a saída`,
             corpo: nomes.length === 1 ? "Entrou hoje e não há saída no ponto." : nomes.slice(0, 6).join(", ") + (nomes.length > 6 ? "…" : ""),
             url: "admin.html", tag: "ponto" };
}

// ---------- uma volta do relógio ----------
async function correrCron() {
    const { count } = await SB.from("push_subscricoes").select("id", { count: "exact", head: true });
    if (!count) return { enviados: 0, nota: "sem telemóveis" };
    const { dia, hora, semana } = lisboa();
    const feitos: string[] = [];
    let enviados = 0;
    const mandar = async (tipo: string, a: Aviso | null) => {
        if (!a) return;
        enviados += await enviar(tipo, a);
        feitos.push(a.tag);
    };

    for (const a of await avisosClientes()) await mandar("clientes", a);

    if (hora === 8 && await primeiraVez("resumo:" + dia)) {
        await mandar("resumo", await avisoResumo(dia));
        await SB.from("push_enviados").delete().lt("enviado_em", new Date(Date.now() - 40 * 86400_000).toISOString());
    }
    if (hora === 8 && semana === "Mon" && await primeiraVez("rh:" + dia)) await mandar("rh", await avisoRH(dia));
    if (hora === 19 && semana !== "Sun" && await primeiraVez("registo:" + dia)) await mandar("registo", await avisoRegisto(dia));
    if (hora === 19 && await primeiraVez("ponto:" + dia)) await mandar("ponto", await avisoPonto(dia));

    return { enviados, avisos: feitos };
}

// ---------- quem está a chamar ----------
async function adminDaSessao(req: Request) {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return null;
    const cli = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await cli.auth.getUser(auth.slice(7));
    if (!u?.user) return null;
    const { data: admin } = await cli.rpc("is_admin");
    return admin === true ? u.user.id : null;
}

Deno.serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return resposta({ erro: "Só POST" }, 405);
    let corpo: { acao?: string } = {};
    try { corpo = await req.json(); } catch { /* sem corpo */ }

    try {
        if (corpo.acao === "cron") {
            const dada = req.headers.get("x-avisos-chave") || "";
            const { data } = await SB.from("push_config").select("chave_cron").eq("id", 1).maybeSingle();
            if (!data?.chave_cron || dada !== data.chave_cron) return resposta({ erro: "Sem autorização" }, 401);
            return resposta(await correrCron());
        }

        const user = await adminDaSessao(req);
        if (!user) return resposta({ erro: "Só administradores" }, 401);

        if (corpo.acao === "chave") return resposta({ publica: (await chaves()).publica });
        if (corpo.acao === "teste") {
            const n = await enviar("teste", { titulo: "Avisos ativos ✓", corpo: "É assim que os avisos da Maia Solutions vão aparecer.",
                                             url: "admin.html", tag: "teste" }, user);
            return resposta({ enviados: n });
        }
        return resposta({ erro: "Ação desconhecida" }, 400);
    } catch (e) {
        console.error(e);
        return resposta({ erro: (e as Error).message }, 500);
    }
});
