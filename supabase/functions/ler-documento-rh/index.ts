// =======================================================
// ASSISTENTE — ler-documento-rh
// Lê um documento de recursos humanos carregado na ficha de um trabalhador
// (cartão de cidadão, ficha de aptidão, certificado de formação, contrato…)
// ou nos documentos da empresa (apólice do seguro, alvará, declarações de
// não dívida) e devolve o tipo e as datas, para o Alcindo confirmar.
//
// NÃO grava nada além do registo de uso: a app preenche o formulário e só
// grava depois de confirmado. Não devolve números de documentos pessoais
// (CC, NIF, NISS): só o que é preciso para saber a validade.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY    a chave da API
//   ASSISTENTE_TETO_DIA  opcional, leituras por dia (defeito 50)
// =======================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELO = "claude-sonnet-5";
const MAX_BYTES = 8 * 1024 * 1024;

const CUSTO_ENTRADA = 3 / 1_000_000;
const CUSTO_SAIDA   = 15 / 1_000_000;

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

const TIPOS_TRABALHADOR = `
- "identificacao": cartão de cidadão, bilhete de identidade, passaporte, título ou autorização de residência
- "contrato": contrato de trabalho (ou adenda)
- "admissao_ss": comprovativo da comunicação de admissão à Segurança Social
- "medicina": ficha de aptidão para o trabalho (medicina do trabalho)
- "formacao_sst": formação de acolhimento, segurança e saúde no trabalho
- "epi": registo ou declaração de entrega de equipamentos de proteção individual
- "formacao": outro certificado de formação (andaimes, máquinas, trabalhos em altura, primeiros socorros…)
- "outro": qualquer outra coisa`;

const TIPOS_EMPRESA = `
- "seguro_at": apólice ou condições particulares do seguro de acidentes de trabalho
- "seguro_recibo": recibo ou aviso de pagamento do seguro de acidentes de trabalho
- "sst": contrato com empresa de segurança e saúde no trabalho / medicina do trabalho
- "alvara": alvará ou certificado de empreiteiro do IMPIC
- "nao_divida_at": certidão de situação tributária regularizada (Finanças)
- "nao_divida_ss": declaração de situação contributiva regularizada (Segurança Social)
- "outro": qualquer outra coisa`;

function instrucoes(ambito: string) {
    return `Lês documentos de recursos humanos de uma pequena empresa de construção civil
em Portugal, para saber de que documento se trata e até quando é válido.

O documento é um destes:${ambito === "empresa" ? TIPOS_EMPRESA : TIPOS_TRABALHADOR}

Devolves SEMPRE este JSON, sem texto à volta:
{
  "tipo": string,
  "descricao": string|null,
  "nome_pessoa": string|null,
  "data_emissao": "AAAA-MM-DD"|null,
  "validade": "AAAA-MM-DD"|null,
  "observacoes": string|null
}

Regras:
- "descricao": uma linha curta. Numa formação, o nome da formação e a
  entidade (ex.: "Montagem de andaimes · Centro X"). Numa apólice, o número da
  apólice e a seguradora. Num cartão, só "Cartão de cidadão" ou "Título de
  residência". NUNCA escrevas números de identificação pessoal, NIF ou NISS.
- "data_emissao": a data do documento, do exame ou da conclusão da formação.
- "validade": a data até quando é válido, se o documento a disser
  ("válido até", "data de validade", "próximo exame", fim do período do
  seguro). Se o documento não tiver validade escrita, devolve null: NÃO a
  calcules nem a inventes.
- Na ficha de aptidão, "nome_pessoa" é o trabalhador; e se disser "apto
  condicionalmente" ou "inapto", põe isso em "observacoes".
- Datas portuguesas "15/03/2027" devolvem-se como "2027-03-15".
- Se um valor não estiver legível, devolve null. NUNCA inventes.`;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

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
    const teto = Number(Deno.env.get("ASSISTENTE_TETO_DIA") || "50");
    const hoje = new Date().toISOString().slice(0, 10);
    const { count } = await admin
        .from("assistente_registo")
        .select("id", { count: "exact", head: true })
        .eq("accao", "ler_documento_rh")
        .gte("criado_em", hoje);
    if ((count ?? 0) >= teto) {
        return resposta({ erro: `Limite diário atingido (${teto} leituras).` }, 429);
    }

    // ---- Entrada ----
    let corpo: { ficheiro_base64?: string; tipo?: string; ambito?: string; nome_esperado?: string | null };
    try { corpo = await req.json(); } catch { return resposta({ erro: "JSON inválido" }, 400); }

    const b64  = corpo.ficheiro_base64;
    const mime = corpo.tipo || "application/pdf";
    const ambito = corpo.ambito === "empresa" ? "empresa" : "trabalhador";
    if (!b64) return resposta({ erro: "Falta ficheiro_base64" }, 400);
    if (b64.length * 0.75 > MAX_BYTES) {
        return resposta({ erro: "Ficheiro demasiado grande para ler (máx. 8 MB)." }, 413);
    }

    const bloco = mime === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image",    source: { type: "base64", media_type: mime,              data: b64 } };

    // ---- IA ----
    let d: any = null, erro: string | null = null, tokIn = 0, tokOut = 0;

    try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": chave,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: MODELO,
                max_tokens: 800,
                system: instrucoes(ambito),
                messages: [{
                    role: "user",
                    content: [bloco, { type: "text", text: "Lê este documento e devolve o JSON." }],
                }],
            }),
        });

        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);

        tokIn  = j?.usage?.input_tokens  ?? 0;
        tokOut = j?.usage?.output_tokens ?? 0;

        const texto = (j.content || []).filter((c: any) => c.type === "text")
                                       .map((c: any) => c.text).join("");
        const limpo = texto.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
        d = JSON.parse(limpo);
    } catch (e: any) {
        erro = String(e?.message || e);
    }

    // Registo de uso sem dados pessoais: só o tipo e as datas
    await admin.from("assistente_registo").insert({
        accao: "ler_documento_rh",
        utilizador: user.email,
        entrada: { tipo: mime, ambito, bytes: Math.round(b64.length * 0.75) },
        saida: erro ? null : { tipo: d?.tipo ?? null, data_emissao: d?.data_emissao ?? null, validade: d?.validade ?? null },
        modelo: MODELO,
        tokens_entrada: tokIn,
        tokens_saida: tokOut,
        custo_estimado: tokIn * CUSTO_ENTRADA + tokOut * CUSTO_SAIDA,
        erro,
    });

    if (erro) return resposta({ erro: "Não foi possível ler o ficheiro: " + erro }, 502);

    // ---- Verificações: isto é do código, não da IA ----
    const avisos: string[] = [];
    const dataOk = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
    if (d.data_emissao && !dataOk(d.data_emissao)) { avisos.push("Não percebi a data do documento."); d.data_emissao = null; }
    if (d.validade && !dataOk(d.validade))         { avisos.push("Não percebi a validade.");           d.validade = null; }
    if (d.validade && d.validade < hoje) avisos.push("Este documento já caducou.");
    if (d.validade && d.data_emissao && d.validade < d.data_emissao) {
        avisos.push("A validade lida é anterior à data do documento: confirma as duas.");
    }

    // O documento é da pessoa certa? (comparação simples de nomes)
    if (ambito === "trabalhador" && corpo.nome_esperado && d.nome_pessoa) {
        const esperado = normalizar(corpo.nome_esperado).split(/\s+/).filter(p => p.length > 2);
        const lido = normalizar(String(d.nome_pessoa));
        if (esperado.length && !esperado.some(p => lido.includes(p))) {
            avisos.push(`O documento parece ser de "${d.nome_pessoa}", não de ${corpo.nome_esperado}.`);
        }
    }
    if (d.observacoes && /inapto|condiciona/i.test(d.observacoes)) avisos.push(d.observacoes);

    return resposta({
        documento: { ...d, avisos },
        uso: { tokens_entrada: tokIn, tokens_saida: tokOut },
    });
});
