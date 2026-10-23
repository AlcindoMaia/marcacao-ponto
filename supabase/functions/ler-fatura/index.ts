// =======================================================
// ASSISTENTE — ler-fatura
// Recebe a imagem ou o PDF de uma ou mais faturas e devolve as linhas
// estruturadas, já verificadas pelo código.
//
// NÃO grava nada além do registo de uso: devolve um rascunho para validação.
// A IA interpreta, o código decide, nada entra sem o Alcindo aprovar.
//
// O desenho foi calibrado contra uma fatura real (Maximo-Monteiro & Vieira,
// FT26/23), que mostrou quatro coisas a tratar:
//   1. O PDF traz Original E Duplicado da mesma fatura — não pode contar duas vezes.
//   2. "V/ NIF" é o NIF do CLIENTE (nós), não do fornecedor.
//   3. IVA 0% com autoliquidação (M31) é normal na construção, não é erro.
//   4. Números em formato português: "1 674,40" = 1674.40.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY    a chave da API
//   ASSISTENTE_TETO_DIA  opcional, leituras por dia (defeito 50)
//   NIF_EMPRESA          opcional, o nosso NIF, para distinguir do fornecedor
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

// Normaliza um nome de empresa para comparação: sem acentos, sem pontuação,
// sem as formas jurídicas que não distinguem ninguém.
const FORMAS_JURIDICAS =
    /\b(lda|ltda|sa|unipessoal|sociedade|comercio|comercial|industria|de|da|do|dos|das)\b/g;

function nomeNormalizado(nome: string): string {
    return (nome || "")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")    // fora com os acentos
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")                        // fora com a pontuação
        .replace(FORMAS_JURIDICAS, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Semelhança por palavras distintivas partilhadas. Chega para o que se quer
// aqui: apanhar "Cimentos Maia Lda" contra "Cimentos Maia, S.A." sem disparar
// entre duas empresas que só partilham a primeira palavra, como "Ferragens
// Silva" e "Ferragens Costa".
function semelhancaDeNomes(a: string, b: string): number {
    const pa = new Set(nomeNormalizado(a).split(" ").filter(w => w.length > 2));
    const pb = new Set(nomeNormalizado(b).split(" ").filter(w => w.length > 2));
    if (!pa.size || !pb.size) return 0;
    let comuns = 0;
    for (const w of pa) if (pb.has(w)) comuns++;
    return comuns / Math.min(pa.size, pb.size);
}

function instrucoes(nifEmpresa: string) {
    return `És um leitor de faturas de fornecedores de construção civil em Portugal.

O ficheiro pode conter MAIS DO QUE UM documento (um scanner de folhas junta
várias faturas no mesmo PDF). Devolve um documento por cada fatura distinta.

ATENÇÃO — duplicados: muitas faturas portuguesas imprimem a mesma fatura duas
ou três vezes no mesmo ficheiro, marcadas "Original", "Duplicado" e
"Triplicado". São O MESMO documento: devolve-o UMA só vez.

Devolves SEMPRE este JSON, sem texto à volta:
{
  "documentos": [
    {
      "tipo_documento": "FT"|"FR"|"FS"|"NC"|"GT"|"outro"|null,
      "numero_documento": string|null,
      "atcud": string|null,
      "data": "AAAA-MM-DD"|null,
      "data_vencimento": "AAAA-MM-DD"|null,
      "fornecedor_nome": string|null,
      "fornecedor_nif": string|null,
      "fornecedor_iban": string|null,
      "total_sem_iva": number|null,
      "total_iva": number|null,
      "total_com_iva": number|null,
      "motivo_isencao_iva": string|null,
      "linhas": [
        {
          "codigo": string|null,
          "descricao": string,
          "quantidade": number|null,
          "unidade": string|null,
          "preco_unitario": number|null,
          "valor_total": number|null,
          "taxa_iva": number|null
        }
      ],
      "observacoes": string|null
    }
  ]
}

Regras:
- O FORNECEDOR é quem EMITE a fatura, normalmente no topo e no rodapé
  ("Contribuinte: ..."). O NIF ${nifEmpresa} é o NOSSO, do cliente: nunca o
  uses como fornecedor. Rótulos como "V/ NIF" ou "Nº Contribuinte" junto da
  morada de entrega referem-se ao cliente.
- Números em formato português: vírgula decimal e espaço ou ponto nos
  milhares. "1 674,40" devolve-se como 1674.40.
- Copia a descrição tal como está. Não traduzas nem resumas.
- IVA 0% com menção de autoliquidação (M31, "IVA - autoliquidação") é normal
  em serviços de construção: taxa_iva 0 e o motivo em "motivo_isencao_iva".
- Se um valor não estiver legível, devolve null. NUNCA inventes um número.
- Linhas de portes ou taxas entram como linha própria, com a descrição original.
- Se o ficheiro não tiver nenhuma fatura ou guia, devolve "documentos": [].`;
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

    // ilike e não eq: a comparação por igualdade era sensível a maiúsculas e
    // trancava fora um administrador cujo email viesse com outra capitalização.
    const { data: ehAdmin } = await admin
        .from("admins").select("email").ilike("email", user.email).maybeSingle();
    if (!ehAdmin) return resposta({ erro: "Sem permissão" }, 403);

    // ---- Teto diário ----
    const teto = Number(Deno.env.get("ASSISTENTE_TETO_DIA") || "50");
    const hoje = new Date().toISOString().slice(0, 10);
    const { count } = await admin
        .from("assistente_registo")
        .select("id", { count: "exact", head: true })
        .eq("accao", "ler_fatura")
        .gte("criado_em", hoje);
    if ((count ?? 0) >= teto) {
        return resposta({ erro: `Limite diário atingido (${teto} leituras).` }, 429);
    }

    // ---- Entrada ----
    let corpo: { ficheiro_base64?: string; tipo?: string };
    try { corpo = await req.json(); } catch { return resposta({ erro: "JSON inválido" }, 400); }

    const b64  = corpo.ficheiro_base64;
    const tipo = corpo.tipo || "image/jpeg";
    if (!b64) return resposta({ erro: "Falta ficheiro_base64" }, 400);
    if (b64.length * 0.75 > MAX_BYTES) {
        return resposta({ erro: "Ficheiro demasiado grande (máx. 8 MB)." }, 413);
    }

    const bloco = tipo === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image",    source: { type: "base64", media_type: tipo,              data: b64 } };

    // ---- IA ----
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
                system: instrucoes(nifEmpresa),
                messages: [{
                    role: "user",
                    content: [bloco, { type: "text", text: "Lê este ficheiro e devolve o JSON." }],
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
        accao: "ler_fatura",
        utilizador: user.email,
        entrada: { tipo, bytes: Math.round(b64.length * 0.75) },
        saida: erro ? null : dados,
        modelo: MODELO,
        tokens_entrada: tokIn,
        tokens_saida: tokOut,
        custo_estimado: tokIn * CUSTO_ENTRADA + tokOut * CUSTO_SAIDA,
        erro,
    });

    if (erro) return resposta({ erro: "Não foi possível ler o ficheiro: " + erro }, 502);

    // ---- Verificações: isto é do código, não da IA ----
    const documentos = Array.isArray(dados?.documentos) ? dados.documentos : [];
    const saida = [];

    for (const d of documentos) {
        const avisos: string[] = [];
        const linhas = Array.isArray(d.linhas) ? d.linhas : [];
        const soma = linhas.reduce((s: number, l: any) => s + (Number(l.valor_total) || 0), 0);

        if (d.total_sem_iva != null && Math.abs(soma - Number(d.total_sem_iva)) > 0.05) {
            avisos.push(`A soma das linhas (${soma.toFixed(2)} €) não bate com o total sem IVA (${d.total_sem_iva} €).`);
        }
        if (d.total_sem_iva != null && d.total_iva != null && d.total_com_iva != null &&
            Math.abs(Number(d.total_sem_iva) + Number(d.total_iva) - Number(d.total_com_iva)) > 0.05) {
            avisos.push("Base mais IVA não dá o total do documento.");
        }
        if (!linhas.length) avisos.push("Não foi reconhecida nenhuma linha.");
        if (d.fornecedor_nif && d.fornecedor_nif.replace(/\D/g, "") === nifEmpresa) {
            avisos.push("O NIF lido é o da nossa empresa: confirma quem emitiu a fatura.");
        }

        // Fatura repetida?
        if (d.numero_documento) {
            const { data: rep } = await admin
                .from("movimentos_financeiros")
                .select("id, data_documento")
                .eq("referencia", d.numero_documento).eq("ativo", true).maybeSingle();
            if (rep) avisos.push(`Já existe um movimento com a referência ${d.numero_documento} (${rep.data_documento}).`);
        }

        // ---- Fornecedor conhecido? E o IBAN bate certo? ----
        //
        // O aviso de IBAN divergente só era emitido quando o NIF da fatura
        // correspondia a um fornecedor em base. Bastava trocar um dígito no
        // NIF para o aviso nunca aparecer, e ao gravar era criado um
        // fornecedor novo parecido com o verdadeiro: o controlo desligava-se
        // exactamente no caso em que servia para alguma coisa, que é a fraude
        // de transferência bancária — a mais comum neste sector.
        //
        // Agora, quando o NIF não casa, procura-se por semelhança de NOME.
        let fornecedor = null;
        // Sem espaços e em maiúsculas: "PT50 1234 5678" e "pt5012345678" são o
        // mesmo IBAN, e um aviso de fraude que grita sem razão deixa de ser lido.
        const limpoIban = (v: string) => (v || "").replace(/\s+/g, "").toUpperCase();
        const nifLido = d.fornecedor_nif ? String(d.fornecedor_nif).replace(/[^0-9]/g, "") : "";

        if (nifLido) {
            const { data: f } = await admin
                .from("fornecedores").select("id, nome, iban")
                .eq("nif", nifLido).maybeSingle();

            if (f) {
                fornecedor = { id: f.id, nome: f.nome };
                if (d.fornecedor_iban && f.iban &&
                    limpoIban(d.fornecedor_iban) !== limpoIban(f.iban)) {
                    avisos.push("⚠ O IBAN desta fatura é diferente do que está guardado para este fornecedor. Confirma por telefone antes de pagar.");
                }
            }
        }

        // NIF desconhecido (ou ausente): há algum fornecedor com nome parecido?
        // Se houver, é provável que seja o mesmo e que o NIF ou o IBAN desta
        // fatura estejam trocados.
        if (!fornecedor && d.fornecedor_nome) {
            const { data: todos } = await admin
                .from("fornecedores").select("id, nome, nif, iban");

            const parecidos = (todos || [])
                .map((f: any) => ({ f, s: semelhancaDeNomes(d.fornecedor_nome, f.nome) }))
                .filter((x: any) => x.s >= 0.6)
                .sort((a: any, b: any) => b.s - a.s)
                .slice(0, 3);

            for (const { f } of parecidos) {
                const ibanDiferente = d.fornecedor_iban && f.iban &&
                    limpoIban(d.fornecedor_iban) !== limpoIban(f.iban);

                if (nifLido && f.nif && nifLido !== String(f.nif).replace(/[^0-9]/g, "")) {
                    avisos.push(
                        `⚠ Não conheço o NIF ${nifLido}, mas já tenho "${f.nome}" com o NIF ${f.nif}` +
                        (ibanDiferente ? " e com OUTRO IBAN" : "") +
                        ". Se for o mesmo fornecedor, o NIF ou o IBAN desta fatura podem estar trocados. Confirma por telefone antes de pagar."
                    );
                } else if (!nifLido) {
                    avisos.push(
                        `Esta fatura não traz NIF, mas já tenho "${f.nome}", com um nome parecido` +
                        (ibanDiferente ? ", e com OUTRO IBAN" : "") + "."
                    );
                }
            }
        }

        // O IBAN lido vai sempre nos avisos, mesmo não havendo com que
        // comparar: é para estar à vista de quem aprova, não escondido no PDF.
        if (d.fornecedor_iban) {
            avisos.push(`IBAN nesta fatura: ${d.fornecedor_iban}` +
                (fornecedor ? "" : " (fornecedor novo — não tenho nada com que comparar)"));
        }

        saida.push({ ...d, fornecedor_conhecido: fornecedor, avisos });
    }

    return resposta({
        documentos: saida,
        uso: { tokens_entrada: tokIn, tokens_saida: tokOut },
    });
});
