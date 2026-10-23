// =======================================================
// ASSISTENTE — função geral
// Recebe uma frase em português e decide o que ela é:
//   - um pedido de material   -> rascunho para validação
//   - uma pergunta sobre os dados -> números da base de dados
//   - contexto de uma obra    -> nota por confirmar
//   - um pedido de plano      -> encaminha para a função planear-obra
//   - outra coisa qualquer    -> diz que não sabe, sem inventar
//
// REGRA DE DESENHO, e é a mais importante deste ficheiro:
// a IA escolhe QUAL a pergunta, nunca COMO se vai buscar a resposta.
// Não há SQL gerado por IA. Há um punhado de consultas escritas à mão,
// e a IA só diz qual delas usar e com que argumentos. Os números que
// chegam ao ecrã vêm da base de dados e são formatados por código: o
// modelo nunca escreve um valor.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY     a chave da API
//   ASSISTENTE_TETO_DIA   opcional, pedidos por dia (defeito 50)
// =======================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELO = "claude-sonnet-5";

const CUSTO_ENTRADA = 3 / 1_000_000;
const CUSTO_SAIDA   = 15 / 1_000_000;

const MAX_ARTIGOS = 400;

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

// ---- Formatação: só aqui se transformam números em texto ----
const eur = (n: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
const num = (n: number) =>
    new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(n || 0);

function instrucoes(artigos: any[], obras: any[], fornecedores: any[], sinonimos: any[]) {
    const catalogo = artigos
        .map(a => `${a.id} | ${a.descricao}${a.codigo ? " | cod " + a.codigo : ""}`).join("\n");
    const listaObras = obras
        .map(o => `${o.id} | ${o.nome}${o.codigo ? " | " + o.codigo : ""}`).join("\n");
    const listaForn = fornecedores.map(f => f.nome).join("\n");
    const outrosNomes = sinonimos.length
        ? "\nOutros nomes já usados para estes artigos (texto -> id):\n" +
          sinonimos.map(s => `${s.texto} -> ${s.artigo_id}`).join("\n")
        : "";

    return `És o assistente de uma empresa de construção civil em Portugal.
Falas com o gerente. Recebes uma frase escrita ou ditada e decides o que
ela é. Não respondes com números: quem os vai buscar é o programa.

ARTIGOS (id | descrição | código):
${catalogo || "(o inventário está vazio)"}
${outrosNomes}

OBRAS ACTIVAS (id | nome):
${listaObras || "(não há obras activas)"}

FORNECEDORES CONHECIDOS:
${listaForn || "(nenhum)"}

Devolves SEMPRE este JSON, sem texto à volta:
{
  "tipo": "material" | "pergunta" | "contexto_obra" | "planear_obra" | "fora_de_alcance",
  "nota": { "obra_id": string|null, "tipo": "ponto_situacao"|"contexto"|"projeto"|"decisao",
            "texto": string } | null,
  "planeamento": { "obra_id": string|null } | null,
  "material": { "obra_id": string|null,
                "linhas": [ { "descricao": string, "quantidade": number|null,
                              "unidade": string|null, "artigo_id": string|null,
                              "confianca": "alta"|"media"|"baixa" } ] } | null,
  "pergunta": { "consulta": "custo_obra"|"preco_artigo"|"stock_artigo"|"compras_fornecedor"|"gastos_periodo",
                "obra_id": string|null, "artigo_id": string|null,
                "fornecedor_nome": string|null,
                "desde": "AAAA-MM-DD"|null, "ate": "AAAA-MM-DD"|null } | null,
  "resposta": string|null,
  "por_perceber": string|null
}

QUANDO É "material"
Alguém pede coisas para comprar ou levar para a obra. Exemplos: "10 sacos
de cimento para a Póvoa", "manda vir rede e silicone".
- "artigo_id" tem de ser um id COPIADO da lista. Nunca inventes um id. Se
  não estiver no inventário, devolve null e põe em "descricao" o que foi
  dito. Não é erro: é material novo.
- "confianca": "alta" quando o nome bate certo ou é um dos outros nomes
  conhecidos; "media" quando é o mesmo material escrito de outra maneira;
  "baixa" quando estás a adivinhar.
- Quantidades: "uns sacos" não é número, devolve null. "meia dúzia" é 6.

QUANDO É "pergunta"
Querem saber alguma coisa que está na base de dados. Escolhe UMA consulta:
- "custo_obra" — quanto se gastou numa obra, como vai de orçamento ou de
  horas. Precisa de "obra_id".
- "preco_artigo" — quanto custa, quanto custou da última vez, se subiu.
  Precisa de "artigo_id".
- "stock_artigo" — quanto existe em armazém. Precisa de "artigo_id".
- "compras_fornecedor" — quanto se comprou a um fornecedor. Precisa de
  "fornecedor_nome", copiado da lista.
- "gastos_periodo" — quanto se gastou num período, com ou sem obra.
Datas: hoje é ${new Date().toISOString().slice(0, 10)}. "este mês" é do dia
1 até hoje; "este ano" é de 1 de Janeiro até hoje; "no ano passado" é o ano
civil anterior inteiro. Sem período dito, devolve as datas a null.
Se faltar o essencial — a obra, o artigo, o fornecedor — devolve
"fora_de_alcance" e diz em "resposta" o que falta saber.

QUANDO É "contexto_obra"
Estão a contar-te como está uma obra, ou a dar-te informação para decidires
mais tarde. Exemplos: "na Póvoa o pladur do piso 1 está feito, falta o
piso 2", "o dono da Obra B quer tudo pronto antes do Natal", "o acesso à
Casa Pinhote não dá para camião grande".
- Põe em "nota.texto" o que foi dito, PELAS PALAVRAS DE QUEM DISSE. Não
  resumas, não corrijas, não embelezes. Tira só as hesitações da fala.
- "nota.tipo": "ponto_situacao" quando diz como está a obra agora;
  "contexto" quando é condição a ter em conta; "projeto" quando vem do
  projeto ou do caderno de encargos; "decisao" quando ficou decidido algo.
- "nota.obra_id" copiado da lista. Se não for dita nenhuma obra, null.

QUANDO É "planear_obra"
Estão a pedir-te um plano. Exemplos: "faz o planeamento da Póvoa",
"organiza a semana da Obra B", "qual é o plano de ataque para a Casa
Pinhote". Devolve só "planeamento.obra_id" — o plano é feito a seguir, com
o processo todo à frente. Se não for dita a obra, devolve
"fora_de_alcance" e pergunta de que obra se trata.

QUANDO É "fora_de_alcance"
Tudo o resto: enviar emails, mudar dados, perguntas sobre coisas que não
estão nas listas acima, conversa. Em "resposta" escreve uma
frase curta e directa a dizer o que não consegues fazer, em português de
Portugal, sem pedir desculpa mais do que uma vez e sem prometer que vais
aprender. Se for coisa que o programa já faz noutro sítio, diz onde: ler
faturas é no painel, em Financeiro.`;
}

// =======================================================
// AS CONSULTAS. Escritas à mão, uma a uma. A IA não lhes toca.
// =======================================================
async function responderPergunta(admin: any, p: any) {
    switch (p?.consulta) {
        case "custo_obra":        return await custoObra(admin, p);
        case "preco_artigo":      return await precoArtigo(admin, p);
        case "stock_artigo":      return await stockArtigo(admin, p);
        case "compras_fornecedor":return await comprasFornecedor(admin, p);
        case "gastos_periodo":    return await gastosPeriodo(admin, p);
        default: return { texto: "Não percebi o que querias saber.", dados: null };
    }
}

async function custoObra(admin: any, p: any) {
    if (!p.obra_id) return { texto: "Não percebi de que obra falavas.", dados: null };

    const [{ data: obra }, { data: movs }, { data: horas }, { data: servicos }] = await Promise.all([
        admin.from("obras").select("nome, percentagem_conclusao").eq("id", p.obra_id).maybeSingle(),
        admin.from("movimentos_financeiros").select("valor_total")
             .eq("obra_id", p.obra_id).eq("tipo", "saida").eq("ativo", true),
        admin.from("registos_admin").select("horas").eq("obra_id", p.obra_id),
        admin.from("obra_servicos").select("valor_orcamento, horas_orcamento").eq("obra_id", p.obra_id),
    ]);
    if (!obra) return { texto: "Não encontrei essa obra.", dados: null };

    const gasto    = (movs || []).reduce((s: number, m: any) => s + Number(m.valor_total || 0), 0);
    const hs       = (horas || []).reduce((s: number, h: any) => s + Number(h.horas || 0), 0);
    const orc      = (servicos || []).reduce((s: number, x: any) => s + Number(x.valor_orcamento || 0), 0);
    const orcHoras = (servicos || []).reduce((s: number, x: any) => s + Number(x.horas_orcamento || 0), 0);

    const partes = [`${obra.nome}: ${eur(gasto)} em despesas, em ${movs?.length || 0} documentos.`];
    if (orc > 0) {
        const pc = (gasto / orc) * 100;
        partes.push(`Orçamento dos serviços: ${eur(orc)} — ${pc.toFixed(0)}% consumido.`);
    } else {
        partes.push("Esta obra não tem orçamento por serviço definido, por isso não há com que comparar.");
    }
    if (hs > 0) {
        partes.push(orcHoras > 0
            ? `${num(hs)} horas registadas de ${num(orcHoras)} orçamentadas.`
            : `${num(hs)} horas registadas.`);
    }
    if (obra.percentagem_conclusao) partes.push(`Conclusão: ${obra.percentagem_conclusao}%.`);

    return { texto: partes.join(" "), dados: { gasto, horas: hs, orcamento: orc } };
}

async function precoArtigo(admin: any, p: any) {
    if (!p.artigo_id) return { texto: "Não percebi de que artigo falavas.", dados: null };

    const [{ data: artigo }, { data: precos }] = await Promise.all([
        admin.from("artigos").select("descricao, preco_atual").eq("id", p.artigo_id).maybeSingle(),
        admin.from("precos").select("preco, unidade, data, fornecedores(nome)")
             .eq("artigo_id", p.artigo_id).order("data", { ascending: false }).limit(5),
    ]);
    if (!artigo) return { texto: "Não encontrei esse artigo.", dados: null };

    if (!precos?.length) {
        return {
            texto: `${artigo.descricao}: ainda não há compras registadas com preço. ` +
                   `O preço guardado na ficha é ${eur(Number(artigo.preco_atual))}.`,
            dados: null,
        };
    }

    const ultimo = precos[0];
    const linhas = [`${artigo.descricao}: ${eur(Number(ultimo.preco))}` +
        `${ultimo.unidade ? "/" + ultimo.unidade : ""} em ${ultimo.data}` +
        `${ultimo.fornecedores?.nome ? ", a " + ultimo.fornecedores.nome : ""}.`];

    if (precos.length > 1) {
        const anterior = precos[1];
        const a = Number(anterior.preco), n = Number(ultimo.preco);
        if (a > 0) {
            const pc = ((n - a) / a) * 100;
            linhas.push(Math.abs(pc) < 1
                ? `Igual ao que pagaste em ${anterior.data}.`
                : `${pc > 0 ? "Subiu" : "Desceu"} ${Math.abs(pc).toFixed(0)}% desde ${anterior.data}, que estava a ${eur(a)}.`);
        }
    }
    return { texto: linhas.join(" "), dados: { precos } };
}

async function stockArtigo(admin: any, p: any) {
    if (!p.artigo_id) return { texto: "Não percebi de que artigo falavas.", dados: null };

    const [{ data: artigo }, { data: movs }] = await Promise.all([
        admin.from("artigos").select("descricao, stock_inicial, stock_minimo").eq("id", p.artigo_id).maybeSingle(),
        admin.from("movimentos_stock").select("tipo_movimento, quantidade").eq("artigo_id", p.artigo_id),
    ]);
    if (!artigo) return { texto: "Não encontrei esse artigo.", dados: null };

    let saldo = Number(artigo.stock_inicial) || 0;
    (movs || []).forEach((m: any) => {
        const q = Number(m.quantidade) || 0;
        saldo += (m.tipo_movimento === "entrada" || m.tipo_movimento === "ajuste_entrada") ? q : -q;
    });

    const partes = [`${artigo.descricao}: ${num(saldo)} em armazém.`];
    const minimo = Number(artigo.stock_minimo) || 0;
    if (minimo > 0) {
        partes.push(saldo < minimo
            ? `Está abaixo do mínimo, que é ${num(minimo)}.`
            : `O mínimo definido é ${num(minimo)}.`);
    }
    return { texto: partes.join(" "), dados: { saldo, minimo } };
}

async function comprasFornecedor(admin: any, p: any) {
    if (!p.fornecedor_nome) return { texto: "Não percebi de que fornecedor falavas.", dados: null };

    const { data: forn } = await admin.from("fornecedores")
        .select("id, nome").ilike("nome", `%${p.fornecedor_nome}%`).limit(1).maybeSingle();
    if (!forn) return { texto: `Não encontrei nenhum fornecedor parecido com "${p.fornecedor_nome}".`, dados: null };

    let q = admin.from("movimentos_financeiros")
        .select("valor_total, data_documento")
        .eq("fornecedor_id", forn.id).eq("tipo", "saida").eq("ativo", true);
    if (p.desde) q = q.gte("data_documento", p.desde);
    if (p.ate)   q = q.lte("data_documento", p.ate);

    const { data: movs } = await q;
    const total = (movs || []).reduce((s: number, m: any) => s + Number(m.valor_total || 0), 0);
    const periodo = p.desde || p.ate
        ? ` entre ${p.desde || "o início"} e ${p.ate || "hoje"}`
        : "";

    if (!movs?.length) return { texto: `Não há compras a ${forn.nome}${periodo}.`, dados: null };
    return {
        texto: `${forn.nome}: ${eur(total)}${periodo}, em ${movs.length} documento${movs.length === 1 ? "" : "s"}.`,
        dados: { total, documentos: movs.length },
    };
}

async function gastosPeriodo(admin: any, p: any) {
    let q = admin.from("movimentos_financeiros")
        .select("valor_total, obra_id").eq("tipo", "saida").eq("ativo", true);
    if (p.desde)   q = q.gte("data_documento", p.desde);
    if (p.ate)     q = q.lte("data_documento", p.ate);
    if (p.obra_id) q = q.eq("obra_id", p.obra_id);

    const { data: movs } = await q;
    if (!movs?.length) return { texto: "Não há despesas nesse período.", dados: null };

    const total = movs.reduce((s: number, m: any) => s + Number(m.valor_total || 0), 0);
    const periodo = p.desde || p.ate ? ` entre ${p.desde || "o início"} e ${p.ate || "hoje"}` : "";

    let onde = "";
    if (p.obra_id) {
        const { data: obra } = await admin.from("obras").select("nome").eq("id", p.obra_id).maybeSingle();
        if (obra) onde = ` na obra ${obra.nome}`;
    }
    return {
        texto: `${eur(total)}${onde}${periodo}, em ${movs.length} documento${movs.length === 1 ? "" : "s"}.`,
        dados: { total, documentos: movs.length },
    };
}

// =======================================================
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
        .from("admins").select("email").eq("email", user.email).maybeSingle();
    if (!ehAdmin) return resposta({ erro: "Sem permissão" }, 403);

    // ---- Teto diário ----
    const teto = Number(Deno.env.get("ASSISTENTE_TETO_DIA") || "50");
    const hoje = new Date().toISOString().slice(0, 10);
    const { count } = await admin
        .from("assistente_registo").select("id", { count: "exact", head: true })
        .eq("accao", "assistente").gte("criado_em", hoje);
    if ((count ?? 0) >= teto) {
        return resposta({ erro: `Limite diário atingido (${teto} pedidos).` }, 429);
    }

    // ---- Entrada ----
    let corpo: { texto?: string };
    try { corpo = await req.json(); } catch { return resposta({ erro: "JSON inválido" }, 400); }

    const texto = (corpo.texto || "").trim();
    if (!texto)              return resposta({ erro: "Falta o texto" }, 400);
    if (texto.length > 2000) return resposta({ erro: "Pedido demasiado longo." }, 413);

    // ---- Contexto: o que existe mesmo ----
    const [{ data: artigos }, { data: obras }, { data: fornecedores }, { data: sinonimos }] = await Promise.all([
        admin.from("artigos").select("id, descricao, codigo").eq("ativo", true).order("descricao").limit(MAX_ARTIGOS),
        admin.from("obras").select("id, nome, codigo").eq("estado", "ativa").order("nome"),
        admin.from("fornecedores").select("nome").order("nome").limit(200),
        admin.from("artigo_sinonimos").select("texto, artigo_id").limit(MAX_ARTIGOS),
    ]);

    const idsArtigos = new Set((artigos || []).map((a: any) => a.id));
    const idsObras   = new Set((obras   || []).map((o: any) => o.id));

    // ---- IA: decide o quê, nunca o como ----
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
                max_tokens: 2000,
                system: instrucoes(artigos || [], obras || [], fornecedores || [], sinonimos || []),
                messages: [{ role: "user", content: texto }],
            }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);

        tokIn  = j?.usage?.input_tokens  ?? 0;
        tokOut = j?.usage?.output_tokens ?? 0;

        const bruto = (j.content || []).filter((c: any) => c.type === "text")
                                       .map((c: any) => c.text).join("");
        const limpo = bruto.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
        dados = JSON.parse(limpo);
    } catch (e: any) {
        erro = String(e?.message || e);
    }

    await admin.from("assistente_registo").insert({
        accao: "assistente",
        utilizador: user.email,
        entrada: { texto },
        saida: erro ? null : dados,
        modelo: MODELO,
        tokens_entrada: tokIn,
        tokens_saida: tokOut,
        custo_estimado: tokIn * CUSTO_ENTRADA + tokOut * CUSTO_SAIDA,
        erro,
    });

    if (erro) return resposta({ erro: "Não foi possível perceber: " + erro }, 502);

    const uso = { tokens_entrada: tokIn, tokens_saida: tokOut };

    // ---- Pergunta: os números são do código ----
    if (dados?.tipo === "pergunta") {
        const p = dados.pergunta || {};
        if (p.obra_id   && !idsObras.has(p.obra_id))     p.obra_id   = null;
        if (p.artigo_id && !idsArtigos.has(p.artigo_id)) p.artigo_id = null;
        const r = await responderPergunta(admin, p);
        return resposta({ tipo: "pergunta", resposta: r.texto, dados: r.dados, consulta: p.consulta, uso });
    }

    // ---- Material: o rascunho, como antes ----
    if (dados?.tipo === "material") {
        const avisos: string[] = [];
        const m = dados.material || {};

        let obraId: string | null = m.obra_id || null;
        if (obraId && !idsObras.has(obraId)) {
            avisos.push("A obra indicada não foi reconhecida: escolhe-a à mão.");
            obraId = null;
        }

        const linhas = (Array.isArray(m.linhas) ? m.linhas : [])
            .map((l: any, i: number) => {
                let artigoId: string | null = l.artigo_id || null;
                if (artigoId && !idsArtigos.has(artigoId)) {
                    avisos.push(`"${l.descricao}": o artigo sugerido não existe, fica por escolher.`);
                    artigoId = null;
                }
                const q = Number(l.quantidade);
                return {
                    descricao:  String(l.descricao || "").slice(0, 300),
                    quantidade: Number.isFinite(q) && q > 0 ? q : null,
                    unidade:    l.unidade ? String(l.unidade).slice(0, 20) : null,
                    artigo_id:  artigoId,
                    confianca:  ["alta", "media", "baixa"].includes(l.confianca) ? l.confianca : "media",
                    ordem:      i,
                };
            })
            .filter((l: any) => l.descricao);

        if (!linhas.length) avisos.push("Não percebi nenhum material neste pedido.");
        linhas.filter((l: any) => l.quantidade == null)
              .forEach((l: any) => avisos.push(`"${l.descricao}": quantidade por indicar.`));

        return resposta({
            tipo: "material", obra_id: obraId, linhas,
            por_perceber: dados.por_perceber || null, avisos, uso,
        });
    }

    // ---- Contexto de obra: devolve o rascunho da nota, não grava ----
    // O texto é dele, palavra por palavra. O que pode estar errado é a
    // obra a que fica agarrado, e isso confirma-se no ecrã.
    if (dados?.tipo === "contexto_obra") {
        const n = dados.nota || {};
        let obraId: string | null = n.obra_id || null;
        if (obraId && !idsObras.has(obraId)) obraId = null;

        const tipos = ["ponto_situacao", "contexto", "projeto", "decisao"];
        return resposta({
            tipo: "contexto_obra",
            obra_id: obraId,
            tipo_nota: tipos.includes(n.tipo) ? n.tipo : "ponto_situacao",
            texto: String(n.texto || texto).slice(0, 4000),
            uso,
        });
    }

    // ---- Planear: o plano faz-se na função própria, com o dossiê todo ----
    if (dados?.tipo === "planear_obra") {
        let obraId: string | null = dados.planeamento?.obra_id || null;
        if (obraId && !idsObras.has(obraId)) obraId = null;
        if (!obraId) {
            return resposta({
                tipo: "fora_de_alcance",
                resposta: "De que obra queres o plano? Diz o nome e eu trato.",
                uso,
            });
        }
        return resposta({ tipo: "planear_obra", obra_id: obraId, uso });
    }

    // ---- Nem uma coisa nem outra ----
    return resposta({
        tipo: "fora_de_alcance",
        resposta: dados?.resposta || "Isso ainda não sei fazer.",
        uso,
    });
});
