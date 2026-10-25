// =======================================================
// ASSISTENTE — ler-documento-obra
// Lê um PDF emitido pela Maia Solutions no TOCONLINE e carregado na ficha da
// obra: orçamento, fatura de venda ou recibo. Devolve os dados estruturados,
// já verificados pelo código, para o Alcindo confirmar.
//
// NÃO grava nada além do registo de uso: a app mostra o que foi lido e só
// grava depois de confirmado.
//
// Aqui a Maia Solutions é quem EMITE o documento e o cliente é quem o recebe
// (ao contrário do ler-fatura, que lê faturas de fornecedores).
//
// Segredos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY    a chave da API
//   ASSISTENTE_TETO_DIA  opcional, leituras por dia (defeito 50)
//   NIF_EMPRESA          opcional, o nosso NIF
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

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

function instrucoes(nifEmpresa: string) {
    return `És um leitor de documentos emitidos pela Maia Solutions (NIF ${nifEmpresa}),
uma empresa de construção civil em Portugal, a partir do programa TOCONLINE.

O documento é um destes:
- "orcamento": orçamento ou proposta ao cliente (também revisões e extras)
- "fatura": fatura (FT), fatura-recibo (FR) ou fatura simplificada (FS) ao cliente
- "recibo": recibo (RC/RG) de um pagamento do cliente
- "outro": qualquer outra coisa

A Maia Solutions é SEMPRE quem emite. O CLIENTE é o destinatário: o nome, o
NIF e a morada junto de "Exmo(s) Sr(s)", "Cliente", "Contribuinte" do cliente.
Nunca devolvas o NIF ${nifEmpresa} como NIF do cliente.

Muitos PDFs repetem o documento como "Original", "Duplicado", "Triplicado":
é o mesmo documento, lê-o uma vez.

Devolves SEMPRE este JSON, sem texto à volta:
{
  "tipo": "orcamento"|"fatura"|"recibo"|"outro",
  "tipo_documento": "ORC"|"FT"|"FR"|"FS"|"NC"|"RC"|"RG"|null,
  "numero_documento": string|null,
  "data": "AAAA-MM-DD"|null,
  "validade": "AAAA-MM-DD"|null,
  "data_vencimento": "AAAA-MM-DD"|null,
  "cliente": {
    "nome": string|null,
    "nif": string|null,
    "morada": string|null,
    "email": string|null,
    "telefone": string|null
  },
  "descricao": string|null,
  "total_sem_iva": number|null,
  "total_iva": number|null,
  "total_com_iva": number|null,
  "faturas_liquidadas": [ { "numero": string, "valor": number|null } ],
  "valor_recebido": number|null,
  "e_revisao_ou_extra": boolean,
  "observacoes": string|null
}

Regras:
- Números em formato português: "1 674,40" devolve-se como 1674.40.
- "descricao": uma linha curta com o objeto do documento (ex.: "Remodelação
  de cozinha"), tirada do próprio documento. Não inventes.
- Num recibo, "faturas_liquidadas" são as faturas que o recibo paga, com o
  valor de cada uma, e "valor_recebido" é o total recebido.
- Numa fatura-recibo (FR) o pagamento já está feito: indica-o em "observacoes".
- "e_revisao_ou_extra": true só se o documento disser que é revisão,
  aditamento, adicional ou trabalhos a mais.
- Se um valor não estiver legível, devolve null. NUNCA inventes um número.`;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST")    return resposta({ erro: "Método não permitido" }, 405);

    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (!chave) return resposta({ erro: "ANTHROPIC_API_KEY não está definida" }, 500);

    const nifEmpresa = Deno.env.get("NIF_EMPRESA") || "518392074";
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
        .eq("accao", "ler_documento_obra")
        .gte("criado_em", hoje);
    if ((count ?? 0) >= teto) {
        return resposta({ erro: `Limite diário atingido (${teto} leituras).` }, 429);
    }

    // ---- Entrada ----
    let corpo: { ficheiro_base64?: string; tipo?: string; tipo_esperado?: string; obra_id?: string };
    try { corpo = await req.json(); } catch { return resposta({ erro: "JSON inválido" }, 400); }

    const b64  = corpo.ficheiro_base64;
    const mime = corpo.tipo || "application/pdf";
    if (!b64) return resposta({ erro: "Falta ficheiro_base64" }, 400);
    if (b64.length * 0.75 > MAX_BYTES) {
        return resposta({ erro: "Ficheiro demasiado grande para ler (máx. 8 MB)." }, 413);
    }

    const bloco = mime === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image",    source: { type: "base64", media_type: mime,              data: b64 } };

    const pista = corpo.tipo_esperado
        ? `Quem carregou disse que é: ${corpo.tipo_esperado}. Confirma pelo conteúdo.`
        : "";

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
                max_tokens: 2000,
                system: instrucoes(nifEmpresa),
                messages: [{
                    role: "user",
                    content: [bloco, { type: "text", text: `Lê este documento e devolve o JSON. ${pista}` }],
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

    await admin.from("assistente_registo").insert({
        accao: "ler_documento_obra",
        utilizador: user.email,
        entrada: { tipo: mime, tipo_esperado: corpo.tipo_esperado || null, bytes: Math.round(b64.length * 0.75) },
        saida: erro ? null : d,
        modelo: MODELO,
        tokens_entrada: tokIn,
        tokens_saida: tokOut,
        custo_estimado: tokIn * CUSTO_ENTRADA + tokOut * CUSTO_SAIDA,
        erro,
    });

    if (erro) return resposta({ erro: "Não foi possível ler o ficheiro: " + erro }, 502);

    // ---- Verificações: isto é do código, não da IA ----
    const avisos: string[] = [];
    d.cliente = d.cliente || {};
    d.faturas_liquidadas = Array.isArray(d.faturas_liquidadas) ? d.faturas_liquidadas : [];

    const nifCliente = soDigitos(d.cliente.nif);
    if (nifCliente === nifEmpresa) {
        avisos.push("O NIF lido como cliente é o da Maia Solutions: confirma o NIF do cliente.");
        d.cliente.nif = null;
    }

    if (corpo.tipo_esperado && d.tipo && d.tipo !== corpo.tipo_esperado) {
        avisos.push(`Escolheste "${corpo.tipo_esperado}", mas o documento parece ser "${d.tipo}".`);
    }

    if (d.total_sem_iva != null && d.total_iva != null && d.total_com_iva != null &&
        Math.abs(Number(d.total_sem_iva) + Number(d.total_iva) - Number(d.total_com_iva)) > 0.05) {
        avisos.push("Base mais IVA não dá o total do documento.");
    }

    // Cliente já conhecido?
    let cliente_conhecido = null;
    if (nifCliente && nifCliente !== nifEmpresa) {
        const { data: c } = await admin.from("clientes")
            .select("id, nome, nif, email, telefone, morada").eq("nif", nifCliente).maybeSingle();
        if (c) cliente_conhecido = c;
    }

    // A obra já tem cliente? E é o mesmo?
    let cliente_da_obra = null;
    if (corpo.obra_id) {
        const { data: o } = await admin.from("obras")
            .select("cliente_id, clientes(id, nome, nif, email, telefone, morada)")
            .eq("id", corpo.obra_id).maybeSingle();
        cliente_da_obra = (o as any)?.clientes || null;
        if (cliente_da_obra && cliente_conhecido && cliente_da_obra.id !== cliente_conhecido.id) {
            avisos.push(`Esta obra está ligada a "${cliente_da_obra.nome}", mas o documento é de "${cliente_conhecido.nome}".`);
        }
    }

    // Repetidos
    if (d.numero_documento && d.tipo === "orcamento") {
        const { data: reps } = await admin.from("orcamentos")
            .select("id, data").eq("numero", d.numero_documento).limit(1);
        if (reps?.[0]) avisos.push(`Já existe um orçamento com o número ${d.numero_documento} (${reps[0].data}).`);
    }
    if (d.numero_documento && d.tipo === "fatura") {
        const { data: reps } = await admin.from("movimentos_financeiros")
            .select("id, data_documento").eq("tipo", "entrada").eq("ativo", true)
            .eq("referencia", d.numero_documento).limit(1);
        if (reps?.[0]) avisos.push(`Já existe uma entrada com a referência ${d.numero_documento} (${reps[0].data_documento}).`);
    }

    // Recibo: que faturas paga, e já estão na app?
    const faturas_encontradas: any[] = [];
    if (d.tipo === "recibo") {
        for (const f of d.faturas_liquidadas) {
            if (!f?.numero) continue;
            const { data: m } = await admin.from("movimentos_financeiros")
                .select("id, referencia, data_documento, valor_total, estado_pagamento, obra_id")
                .eq("tipo", "entrada").eq("ativo", true).eq("referencia", f.numero).limit(1);
            if (m?.[0]) {
                faturas_encontradas.push(m[0]);
                if (m[0].estado_pagamento === "pago") avisos.push(`A fatura ${f.numero} já está marcada como paga.`);
                if (corpo.obra_id && m[0].obra_id !== corpo.obra_id) avisos.push(`A fatura ${f.numero} está registada noutra obra.`);
            } else {
                avisos.push(`A fatura ${f.numero} ainda não está na app: carrega-a primeiro para a poder marcar como paga.`);
            }
        }
        if (!d.faturas_liquidadas.length) avisos.push("Não consegui ver que faturas este recibo paga.");
    }

    return resposta({
        documento: { ...d, cliente_conhecido, cliente_da_obra, faturas_encontradas, avisos },
        uso: { tokens_entrada: tokIn, tokens_saida: tokOut },
    });
});
