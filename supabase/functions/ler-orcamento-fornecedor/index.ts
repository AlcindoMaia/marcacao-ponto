// =======================================================
// ASSISTENTE — ler-orcamento-fornecedor
// Recebe o PDF (ou foto) de um orçamento de fornecedor e os artigos da
// comparação onde vai entrar. Devolve o cabeçalho, as linhas e, para cada
// linha, o artigo da comparação a que corresponde, com a quantidade e o
// preço líquido sem IVA já na unidade desse artigo.
//
// NÃO grava nada além do registo de uso: devolve um rascunho para validação.
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

type Artigo = { nome: string; unidade: string };

function instrucoes(nifEmpresa: string, artigos: Artigo[]) {
    const lista = artigos.length
        ? artigos.map((a, i) => `  ${i}: ${a.nome} (unidade de comparação: ${a.unidade})`).join("\n")
        : "  (ainda não há artigos: propõe-nos tu)";
    return `És o comprador de uma empresa de construção civil em Portugal. Vais ler o
orçamento de UM fornecedor e prepará-lo para ser comparado com orçamentos de
outros fornecedores para o mesmo trabalho.

Artigos da comparação (índice: nome, unidade):
${lista}

Devolves SEMPRE este JSON, sem texto à volta:
{
  "fornecedor_nome": string|null,
  "fornecedor_nif": string|null,
  "documento": string|null,
  "data": "AAAA-MM-DD"|null,
  "validade": string|null,
  "pagamento": string|null,
  "entrega": string|null,
  "sistema": string|null,
  "precos_com_iva": boolean,
  "total_sem_iva": number|null,
  "total_iva": number|null,
  "total_com_iva": number|null,
  "observacoes": string|null,
  "linhas": [
    {
      "codigo": string|null,
      "descricao": string,
      "quantidade": number|null,
      "unidade": string|null,
      "preco_unitario": number|null,
      "desconto": string|null,
      "valor_liquido_sem_iva": number|null,
      "taxa_iva": number|null,
      "artigo": number|null,
      "novo_artigo": { "nome": string, "unidade": string }|null,
      "fora_do_cesto": boolean,
      "quantidade_comparavel": number|null,
      "preco_comparavel": number|null,
      "conversao": string|null
    }
  ]
}

Regras:
- O FORNECEDOR é quem EMITE o orçamento. O NIF ${nifEmpresa} é o NOSSO, do
  cliente: nunca o uses como fornecedor.
- Números em formato português: vírgula decimal e espaço ou ponto nos
  milhares. "1 674,40" devolve-se como 1674.40.
- "valor_liquido_sem_iva" é o valor da linha depois de TODOS os descontos e
  SEM IVA. Se o documento só mostra preços com IVA (ex.: Leroy Merlin, lojas),
  põe "precos_com_iva": true e divide pelo (1 + taxa de IVA) depois de
  aplicar os descontos da linha. Explica em "conversao".
- "validade": copia como está ("16/10/2026", "8 dias", "não vinculativo").
- "sistema": marca ou sistema principal (ex.: Weber, Secil, Knauf, Placo),
  ou null.
- "observacoes": descontos aplicados, conversões feitas e condições
  importantes, numa ou duas frases.
- Correspondência com os artigos da comparação:
  * "artigo" é o índice do artigo equivalente da lista acima, ou null.
    Equivalente = mesma função na obra, mesmo que a marca seja outra.
  * Se não houver equivalente, "artigo": null e propõe "novo_artigo" com um
    nome genérico (sem marca) e uma unidade de comparação útil
    (m², ml, kg, L, un...).
  * "quantidade_comparavel" é a quantidade da linha convertida para a
    unidade do artigo. Ex.: 20 barras de 2,5 m = 50 ml; 65 sacos de 25 kg =
    1625 kg; 40 packs de 10 placas de 0,5 m² = 200 m²; 4 rolos de 1x50 m =
    200 m². Explica a conversão em "conversao".
  * "preco_comparavel" = valor_liquido_sem_iva / quantidade_comparavel.
  * Se uma conversão precisar de um dado que o documento não dá (ex.:
    densidade de um primário vendido em litros quando o artigo é em kg),
    usa um valor típico, diz qual em "conversao" e acrescenta "confirmar".
  * Portes, paletes, taxas e serviços que não são material do trabalho:
    "fora_do_cesto": true.
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

    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error: erroUser } = await admin.auth.getUser(jwt);
    if (erroUser || !user?.email) return resposta({ erro: "Sessão inválida" }, 401);

    const { data: ehAdmin } = await admin
        .from("admins").select("email").eq("email", user.email).maybeSingle();
    if (!ehAdmin) return resposta({ erro: "Sem permissão" }, 403);

    const teto = Number(Deno.env.get("ASSISTENTE_TETO_DIA") || "50");
    const hoje = new Date().toISOString().slice(0, 10);
    const { count } = await admin
        .from("assistente_registo")
        .select("id", { count: "exact", head: true })
        .eq("accao", "ler_orcamento_fornecedor")
        .gte("criado_em", hoje);
    if ((count ?? 0) >= teto) {
        return resposta({ erro: `Limite diário atingido (${teto} leituras).` }, 429);
    }

    let corpo: { ficheiro_base64?: string; tipo?: string; artigos?: Artigo[] };
    try { corpo = await req.json(); } catch { return resposta({ erro: "JSON inválido" }, 400); }

    const b64  = corpo.ficheiro_base64;
    const tipo = corpo.tipo || "application/pdf";
    const artigos = (Array.isArray(corpo.artigos) ? corpo.artigos : [])
        .filter(a => a && a.nome).map(a => ({ nome: String(a.nome), unidade: String(a.unidade || "") }));
    if (!b64) return resposta({ erro: "Falta ficheiro_base64" }, 400);
    if (b64.length * 0.75 > MAX_BYTES) {
        return resposta({ erro: "Ficheiro demasiado grande (máx. 8 MB)." }, 413);
    }

    const bloco = tipo === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image",    source: { type: "base64", media_type: tipo,              data: b64 } };

    let dados: any = null, erro: string | null = null, tokIn = 0, tokOut = 0;

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
                max_tokens: 8000,
                system: instrucoes(nifEmpresa, artigos),
                messages: [{
                    role: "user",
                    content: [bloco, { type: "text", text: "Lê este orçamento e devolve o JSON." }],
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
        dados = JSON.parse(limpo);
    } catch (e: any) {
        erro = String(e?.message || e);
    }

    await admin.from("assistente_registo").insert({
        accao: "ler_orcamento_fornecedor",
        utilizador: user.email,
        entrada: { tipo, bytes: Math.round(b64.length * 0.75), artigos: artigos.length },
        saida: erro ? null : dados,
        modelo: MODELO,
        tokens_entrada: tokIn,
        tokens_saida: tokOut,
        custo_estimado: tokIn * CUSTO_ENTRADA + tokOut * CUSTO_SAIDA,
        erro,
    });

    if (erro) return resposta({ erro: "Não foi possível ler o ficheiro: " + erro }, 502);

    // Verificações feitas pelo código, não pela IA
    const avisos: string[] = [];
    const linhas = Array.isArray(dados?.linhas) ? dados.linhas : [];
    for (const l of linhas) {
        if (l.artigo != null && (!Number.isInteger(l.artigo) || l.artigo < 0 || l.artigo >= artigos.length)) l.artigo = null;
        const v = Number(l.valor_liquido_sem_iva), q = Number(l.quantidade_comparavel);
        if (l.preco_comparavel == null && v > 0 && q > 0) l.preco_comparavel = Math.round(v / q * 1e6) / 1e6;
    }
    const soma = linhas.reduce((s: number, l: any) => s + (Number(l.valor_liquido_sem_iva) || 0), 0);
    if (dados?.total_sem_iva != null && Math.abs(soma - Number(dados.total_sem_iva)) > 0.05) {
        avisos.push(`A soma das linhas (${soma.toFixed(2)} €) não bate com o total sem IVA do documento (${Number(dados.total_sem_iva).toFixed(2)} €).`);
    }
    if (!linhas.length) avisos.push("Não foi reconhecida nenhuma linha.");
    if (dados?.fornecedor_nif && String(dados.fornecedor_nif).replace(/\D/g, "") === nifEmpresa) {
        avisos.push("O NIF lido é o da nossa empresa: confirma quem emitiu o orçamento.");
    }

    let fornecedor = null;
    if (dados?.fornecedor_nif) {
        const nif = String(dados.fornecedor_nif).replace(/\D/g, "");
        const { data: fs } = await admin
            .from("fornecedores").select("id, nome, nif")
            .in("nif", [nif, "PT" + nif]).limit(1);
        if (fs && fs.length) fornecedor = { id: fs[0].id, nome: fs[0].nome };
    }

    return resposta({
        orcamento: { ...dados, linhas },
        fornecedor_conhecido: fornecedor,
        avisos,
        uso: { tokens_entrada: tokIn, tokens_saida: tokOut },
    });
});
