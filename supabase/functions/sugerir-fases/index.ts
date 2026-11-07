// =======================================================
// ASSISTENTE — sugerir-fases
// Recebe um orçamento aceite de uma obra e PROPÕE as fases da obra (aba
// Andamento) e, dentro de cada fase, os pacotes de trabalho (as subfases),
// dizendo que linhas do orçamento cabem em cada pacote.
//
// NÃO grava nada além do registo de uso: a app mostra a proposta, o
// Alcindo corrige e só grava quando carrega em Aceitar.
//
// De onde vêm as linhas:
//   - orçamento feito na app: das tabelas orcamento_linhas (sem IA);
//   - orçamento carregado em PDF (TOCONLINE): a IA lê-as do PDF guardado na
//     obra, e o código confere que a soma dá o total do orçamento.
//
// Os valores de cada pacote são somados pelo código a partir das linhas.
// A IA só agrupa e dá nomes; nunca escreve o valor de um pacote.
//
// Segredos: ANTHROPIC_API_KEY, ASSISTENTE_TETO_DIA (defeito 50)
// =======================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELO = "claude-sonnet-5";
const CUSTO_ENTRADA = 3 / 1_000_000;
const CUSTO_SAIDA   = 15 / 1_000_000;

const BUCKET    = "obra-documentos";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FASES   = 15;
const MAX_PACOTES = 60;
const MAX_LINHAS  = 300;
const MAX_SAIDA   = 12000;   // tokens de resposta; no plano grátis a função tem 150 s, por isso as linhas vêm em formato curto

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

const arred2 = (v: number) => Math.round(v * 100) / 100;
const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function base64(bytes: Uint8Array) {
    let s = "";
    const passo = 0x8000;
    for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
    return btoa(s);
}

function instrucoes(o: any, fasesExistentes: string[], linhasTexto: string | null) {
    const parteLinhas = linhasTexto
        ? `LINHAS DO ORÇAMENTO (n | descrição | valor sem IVA):
${linhasTexto}

As linhas já estão lidas: NÃO devolvas "linhas".`
        : `O orçamento vem em PDF, em anexo. Primeiro lê TODAS as linhas de
artigos, pela ordem do documento, numeradas a partir de 1, e devolve-as em
"linhas", cada uma como [n, "descrição curta", valor] (descrição com 50
caracteres no máximo: um orçamento grande tem centenas de linhas e a
resposta não pode ficar cortada). O valor de cada linha é o da coluna "Valor sem IVA" (ou o total da
linha sem IVA). Não contes linhas de "Transporte" / "Total a transportar"
entre páginas, nem subtotais, nem totais: só artigos. Se o PDF repetir o
documento (Original, Duplicado), lê-o uma vez. Números em formato
português: "1 674,40" devolve-se como 1674.40. Se um valor não estiver
legível, devolve null: NUNCA inventes um número.`;

    return `És o diretor de obra de uma empresa de construção civil em
Portugal (obras novas em alvenaria, remodelações e steel frame). Recebes um
orçamento aceite e organizas o trabalho em FASES e, dentro de cada fase, em
PACOTES de trabalho.

ORÇAMENTO ${o.numero}${o.obra_descricao ? `: ${o.obra_descricao}` : ""}
Total sem IVA: ${o.total_sem_iva ?? "não indicado"}

FASES QUE A OBRA JÁ TEM (reutiliza o nome exato quando o trabalho lá cabe):
${fasesExistentes.length ? fasesExistentes.map(n => `- ${n}`).join("\n") : "(nenhuma)"}

${parteLinhas}

O que é cada coisa:
- FASE: um passo da obra que o cliente percebe e vê na área do cliente
  (ex.: "Demolições", "Rebocos", "Pinturas", "Limpeza e entrega"). Pela
  ORDEM DE EXECUÇÃO em obra, não pela ordem do orçamento: o que tem de
  secar seca antes, o que suja faz-se antes do que fica limpo, o que tapa
  vem depois do que é tapado. Numa obra pequena chegam 3 a 6 fases.
- PACOTE: um trabalho entregável dentro da fase, que o encarregado marca
  em % no corte semanal. Normalmente uma ou poucas linhas do orçamento.
  Nome curto (até 60 caracteres), sem preços. "criterio_fim" diz numa
  frase curta como se vê que está terminado.

Devolves SEMPRE este JSON, sem texto à volta:
{
  ${linhasTexto ? "" : `"linhas": [ [n, "descrição curta", valor|null] ],
  `}"fases": [
    { "nome": string,
      "pacotes": [ { "nome": string, "criterio_fim": string, "linhas": [number] } ] }
  ],
  "notas": [string]
}

Regras, e são para cumprir:
- Cada linha do orçamento entra em UM e um só pacote. Nenhuma fica de fora.
- "linhas" de cada pacote são os números "n" das linhas.
- Uma linha que mistura duas fases (ex.: "desmontagem e remontagem") vai
  para a fase em que o trabalho fica terminado.
- Não inventes trabalho que não está no orçamento.
- No máximo ${MAX_FASES} fases e ${MAX_PACOTES} pacotes.
- Sê breve: nomes de pacotes até 50 caracteres, "criterio_fim" até 60.
- Num orçamento grande junta várias linhas do mesmo trabalho num pacote
  (ex.: um pacote por capítulo e zona), em vez de um pacote por linha.
- "notas": até 3 frases curtas com o que assumiste ou o que convém o
  Alcindo confirmar (ex.: a ordem de dois trabalhos).`;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST")    return resposta({ erro: "Método não permitido" }, 405);

    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (!chave) return resposta({ erro: "ANTHROPIC_API_KEY não está definida" }, 500);

    const url     = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin   = createClient(url, service);

    // ---- Só admins ----
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error: erroUser } = await admin.auth.getUser(jwt);
    if (erroUser || !user?.email) return resposta({ erro: "Sessão inválida" }, 401);

    const { data: ehAdmin } = await admin
        .from("admins").select("email").ilike("email", user.email).maybeSingle();
    if (!ehAdmin) return resposta({ erro: "Sem permissão" }, 403);

    // ---- Teto diário ----
    const hoje = new Date().toISOString().slice(0, 10);
    const teto = Number(Deno.env.get("ASSISTENTE_TETO_DIA") || "50");
    const { count } = await admin.from("assistente_registo")
        .select("id", { count: "exact", head: true })
        .eq("accao", "sugerir_fases").gte("criado_em", hoje);
    if ((count ?? 0) >= teto) {
        return resposta({ erro: `Limite diário atingido (${teto} sugestões).` }, 429);
    }

    // ---- Entrada ----
    let corpo: { obra_id?: string; orcamento_id?: string };
    try { corpo = await req.json(); } catch { return resposta({ erro: "JSON inválido" }, 400); }
    if (!corpo.obra_id || !corpo.orcamento_id) return resposta({ erro: "Falta a obra ou o orçamento" }, 400);

    const { data: orc } = await admin.from("orcamentos")
        .select("id, numero, obra_id, obra_descricao, total_sem_iva, estado")
        .eq("id", corpo.orcamento_id).maybeSingle();
    if (!orc || orc.obra_id !== corpo.obra_id) return resposta({ erro: "Orçamento não encontrado nesta obra" }, 404);

    const { data: fasesObra } = await admin.from("obra_fases")
        .select("id, nome").eq("obra_id", corpo.obra_id).order("ordem");
    const fasesExistentes = (fasesObra || []).map((f: any) => f.nome);

    // ---- Linhas: da app, ou do PDF ----
    let linhas: { n: number; descricao: string; valor: number | null }[] = [];
    let origem: "app" | "pdf" = "app";
    let pdf64: string | null = null;

    const { data: cats } = await admin.from("orcamento_categorias")
        .select("nome, ordem, orcamento_linhas(tipo, descricao, quantidade, preco_unitario, n_pessoas, ordem)")
        .eq("orcamento_id", orc.id).order("ordem");
    (cats || []).forEach((c: any) => {
        [...(c.orcamento_linhas || [])].sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0)).forEach((l: any) => {
            // Mesma conta que criarServicosDoOrcamento (admin.js)
            const v = Number(l.quantidade || 0) * Number(l.preco_unitario || 0)
                * (l.tipo === "mao_obra" ? (Number(l.n_pessoas) || 1) : 1);
            linhas.push({ n: linhas.length + 1, descricao: texto(`${c.nome}: ${l.descricao || ""}`, 140), valor: arred2(v) });
        });
    });

    if (!linhas.length) {
        origem = "pdf";
        const { data: docs } = await admin.from("obra_documentos")
            .select("caminho, mime, tamanho").eq("obra_id", orc.obra_id).eq("orcamento_id", orc.id)
            .order("created_at", { ascending: false }).limit(1);
        const doc = docs?.[0];
        if (!doc?.caminho) {
            return resposta({ erro: "Este orçamento não tem linhas na app nem PDF carregado na obra. Carrega o PDF em Documentos." }, 422);
        }
        if ((doc.mime || "application/pdf") !== "application/pdf") {
            return resposta({ erro: "O orçamento carregado não é um PDF." }, 422);
        }
        const dl = await admin.storage.from(BUCKET).download(doc.caminho);
        if (dl.error || !dl.data) return resposta({ erro: "Não foi possível abrir o PDF do orçamento." }, 502);
        const bytes = new Uint8Array(await dl.data.arrayBuffer());
        if (bytes.length > MAX_BYTES) return resposta({ erro: "O PDF é demasiado grande para ler (máx. 8 MB)." }, 413);
        pdf64 = base64(bytes);
    }

    if (linhas.length > MAX_LINHAS) {
        return resposta({ erro: `O orçamento tem ${linhas.length} linhas: é grande demais para uma sugestão de uma vez.` }, 422);
    }

    const linhasTexto = origem === "app"
        ? linhas.map(l => `${l.n} | ${l.descricao} | ${l.valor}`).join("\n") : null;

    // ---- IA ----
    let d: any = null, erro: string | null = null, tokIn = 0, tokOut = 0;
    try {
        const conteudo: any[] = [];
        if (pdf64) conteudo.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf64 } });
        conteudo.push({ type: "text", text: `Organiza o orçamento ${orc.numero} em fases e pacotes e devolve o JSON.` });

        const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": chave,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: MODELO,
                max_tokens: MAX_SAIDA,
                system: instrucoes(orc, fasesExistentes, linhasTexto),
                messages: [{ role: "user", content: conteudo }],
            }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
        tokIn  = j?.usage?.input_tokens  ?? 0;
        tokOut = j?.usage?.output_tokens ?? 0;
        if (j?.stop_reason === "max_tokens") throw new Error("a resposta ficou cortada: o orçamento é grande demais para uma sugestão de uma vez");

        const bruto = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
        const limpo = bruto.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
        d = JSON.parse(limpo);
    } catch (e: any) {
        erro = String(e?.message || e);
    }

    await admin.from("assistente_registo").insert({
        accao: "sugerir_fases",
        utilizador: user.email,
        entrada: { obra_id: orc.obra_id, orcamento_id: orc.id, numero: orc.numero, origem, linhas: linhas.length },
        saida: erro ? null : d,
        modelo: MODELO,
        tokens_entrada: tokIn,
        tokens_saida: tokOut,
        custo_estimado: tokIn * CUSTO_ENTRADA + tokOut * CUSTO_SAIDA,
        erro,
    });

    if (erro) return resposta({ erro: "Não foi possível fazer a sugestão: " + erro }, 502);

    // ---- Verificações: isto é do código, não da IA ----
    const avisos: string[] = [];

    if (origem === "pdf") {
        linhas = (Array.isArray(d?.linhas) ? d.linhas : []).slice(0, MAX_LINHAS).map((x: any, i: number) => {
            // Vem como [n, descrição, valor]; aceita também { n, descricao, valor }
            const l = Array.isArray(x) ? { n: x[0], descricao: x[1], valor: x[2] } : x;
            const v = l?.valor == null || l.valor === "" ? null : Number(l.valor);
            return {
                n: Number.isInteger(Number(l?.n)) ? Number(l.n) : i + 1,
                descricao: texto(l?.descricao, 140),
                valor: v != null && Number.isFinite(v) ? arred2(v) : null,
            };
        });
        // Números repetidos: renumera pela ordem em que vieram
        if (new Set(linhas.map(l => l.n)).size !== linhas.length) linhas = linhas.map((l, i) => ({ ...l, n: i + 1 }));
        if (!linhas.length) return resposta({ erro: "Não consegui ler as linhas do PDF do orçamento." }, 422);
        const sem = linhas.filter(l => l.valor == null).length;
        if (sem) avisos.push(`${sem} linha(s) do PDF sem valor legível: ficam a 0 €. Confirma no orçamento.`);
    }

    const somaLinhas = arred2(linhas.reduce((s, l) => s + (l.valor || 0), 0));
    const total = orc.total_sem_iva == null ? null : Number(orc.total_sem_iva);
    if (total != null && Math.abs(somaLinhas - total) > 0.5) {
        avisos.push(`As linhas somam ${somaLinhas.toFixed(2)} €, mas o orçamento diz ${total.toFixed(2)} € sem IVA. Confere os valores dos pacotes antes de aceitar.`);
    }

    const porN = new Map(linhas.map(l => [l.n, l]));
    const usadas = new Set<number>();
    let nPacotes = 0;

    const fases = (Array.isArray(d?.fases) ? d.fases : []).slice(0, MAX_FASES).map((f: any) => {
        const nome = texto(f?.nome, 120);
        const existente = (fasesObra || []).find((x: any) => x.nome.trim().toLowerCase() === nome.toLowerCase());
        const pacotes = (Array.isArray(f?.pacotes) ? f.pacotes : []).map((p: any) => {
            if (nPacotes >= MAX_PACOTES) return null;
            const ns = (Array.isArray(p?.linhas) ? p.linhas : []).map(Number)
                .filter((n: number) => porN.has(n) && !usadas.has(n));
            ns.forEach((n: number) => usadas.add(n));
            if (!ns.length) return null;
            nPacotes++;
            return {
                nome: texto(p?.nome, 120) || texto(porN.get(ns[0])!.descricao, 120),
                criterio_fim: texto(p?.criterio_fim, 200) || null,
                linhas: ns,
                valor: arred2(ns.reduce((s: number, n: number) => s + (porN.get(n)!.valor || 0), 0)),
            };
        }).filter(Boolean);
        return { nome, fase_id: existente?.id || null, pacotes };
    }).filter((f: any) => f.nome && f.pacotes.length);

    // Linhas que a IA deixou de fora: não se perdem, vão para um pacote à parte
    const faltam = linhas.filter(l => !usadas.has(l.n));
    if (faltam.length) {
        avisos.push(`${faltam.length} linha(s) não ficaram em nenhum pacote: estão em "Por arrumar". Muda-as para a fase certa.`);
        const pacote = {
            nome: "Por arrumar", criterio_fim: null, linhas: faltam.map(l => l.n),
            valor: arred2(faltam.reduce((s, l) => s + (l.valor || 0), 0)),
        };
        if (fases.length) fases[fases.length - 1].pacotes.push(pacote);
        else fases.push({ nome: "Por arrumar", fase_id: null, pacotes: [pacote] });
    }

    return resposta({
        orcamento: { id: orc.id, numero: orc.numero, total_sem_iva: total, estado: orc.estado },
        origem,
        linhas,
        soma_linhas: somaLinhas,
        fases,
        notas: (Array.isArray(d?.notas) ? d.notas : []).slice(0, 3).map((n: any) => texto(n, 300)),
        avisos,
        uso: { tokens_entrada: tokIn, tokens_saida: tokOut },
    });
});
