// =======================================================
// ASSISTENTE — planear-obra
// Recebe uma obra e devolve um plano PROPOSTO: que tarefas, por que
// ordem, em que dias, com que duração e para quem.
//
// NÃO grava nada. O plano vai ao ecrã, o Alcindo corta o que não presta,
// e só então é criado no planeamento. Um plano automático que entra
// sozinho na agenda de sete pessoas é pior do que não ter plano nenhum.
//
// O dossiê que vai para o modelo é o que a plataforma já sabe da obra:
// os serviços orçamentados, as tarefas que lá estão, as horas já gastas,
// os funcionários disponíveis, e as notas que o Alcindo foi ditando —
// que é onde está o que nenhuma tabela sabe.
//
// Segredos: ANTHROPIC_API_KEY, ASSISTENTE_TETO_DIA (defeito 50)
// =======================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELO = "claude-sonnet-5";
const CUSTO_ENTRADA = 3 / 1_000_000;
const CUSTO_SAIDA   = 15 / 1_000_000;

const MAX_TAREFAS = 40;      // um plano maior do que isto não se lê
const MAX_NOTAS   = 20;

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

function instrucoes(d: any) {
    const servicos = (d.servicos || []).length
        ? d.servicos.map((s: any) =>
            `- ${s.nome}${s.concluido ? " [CONCLUÍDO]" : ""}` +
            `${s.horas_orcamento ? ` · ${s.horas_orcamento}h orçamentadas` : ""}` +
            `${s.valor_orcamento ? ` · ${s.valor_orcamento}€` : ""}`).join("\n")
        : "(a obra não tem serviços definidos)";

    const tarefas = (d.tarefas || []).length
        ? d.tarefas.map((t: any) =>
            `- ${t.data_prevista || "sem data"}: ${t.descricao}` +
            `${t.duracao_horas ? ` (${t.duracao_horas}h)` : ""} [${t.estado || "por fazer"}]`).join("\n")
        : "(não há tarefas marcadas)";

    const notas = (d.notas || []).length
        ? d.notas.map((n: any) =>
            `- ${n.criado_em.slice(0, 10)} [${n.tipo}]: ${n.texto}`).join("\n")
        : "(ainda não há notas sobre esta obra)";

    const equipa = (d.funcionarios || []).length
        ? d.funcionarios.map((f: any) =>
            `${f.id} | ${f.nome}${f.categoria ? " | " + f.categoria : ""}`).join("\n")
        : "(não há funcionários activos)";

    return `És o encarregado de planeamento de uma empresa de construção civil
em Portugal. Fazes o plano de ataque de uma obra: o que se faz, por que
ordem, em que dias, e por quem.

OBRA: ${d.obra.nome}${d.obra.local ? ` (${d.obra.local})` : ""}
Conclusão declarada: ${d.obra.percentagem_conclusao ?? "não indicada"}%
Data prevista de fim: ${d.obra.data_conclusao_prevista || "não definida"}
Horas já registadas nesta obra: ${d.horasGastas}

SERVIÇOS ORÇAMENTADOS:
${servicos}

TAREFAS JÁ MARCADAS:
${tarefas}

O QUE O GERENTE FOI DIZENDO SOBRE ESTA OBRA (do mais recente para o mais
antigo) — é aqui que está o que as tabelas não sabem, e vale mais do que
elas quando houver contradição:
${notas}

EQUIPA DISPONÍVEL (id | nome | categoria):
${equipa}

Hoje é ${d.hoje} (${d.diaSemana}).

Devolves SEMPRE este JSON, sem texto à volta:
{
  "resumo": string,
  "tarefas": [
    { "descricao": string,
      "data_prevista": "AAAA-MM-DD",
      "duracao_horas": number,
      "ordem": number,
      "funcionario_ids": [string],
      "porque": string }
  ],
  "riscos": [string],
  "pressupostos": [string]
}

Regras, e são para cumprir:
- Só dias úteis, de segunda a sexta. Nunca marques nada ao sábado ou ao
  domingo, nem antes de ${d.hoje}.
- Um dia de trabalho são 8 horas. Uma tarefa de 16h ocupa dois dias: ou a
  partes em duas, ou lhe pões 16 e a ordem certa.
- Não marques duas tarefas ao mesmo funcionário no mesmo dia se a soma
  passar as 8 horas.
- "funcionario_ids" só com ids COPIADOS da lista da equipa. Nunca
  inventes um id nem um nome. Se não houver quem faça, deixa a lista
  vazia e diz porquê em "riscos".
- A ordem dos trabalhos é a da construção, não a do orçamento: o que tem
  de secar seca antes, o que suja faz-se antes do que fica limpo, o que
  tapa vem depois do que é tapado. Explica cada escolha em "porque", numa
  linha.
- Não repitas tarefas que já estão marcadas. Se uma delas estiver na
  altura errada, diz isso em "riscos" em vez de a marcares outra vez.
- "pressupostos": o que assumiste por não saber. Sê honesto — um plano com
  pressupostos escritos vale mais do que um plano que finge certezas.
- Se a informação for pouca para planear, devolve "tarefas": [] e explica
  em "pressupostos" o que precisas de saber.
- No máximo ${MAX_TAREFAS} tarefas.`;
}

const DIAS = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];

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

    const hoje = new Date().toISOString().slice(0, 10);
    const teto = Number(Deno.env.get("ASSISTENTE_TETO_DIA") || "50");
    const { count } = await admin.from("assistente_registo")
        .select("id", { count: "exact", head: true })
        .eq("accao", "planear_obra").gte("criado_em", hoje);
    if ((count ?? 0) >= teto) {
        return resposta({ erro: `Limite diário atingido (${teto} planos).` }, 429);
    }

    let corpo: { obra_id?: string };
    try { corpo = await req.json(); } catch { return resposta({ erro: "JSON inválido" }, 400); }
    const obraId = corpo.obra_id;
    if (!obraId) return resposta({ erro: "Falta a obra" }, 400);

    // ---- O dossiê ----
    const [{ data: obra }, { data: servicos }, { data: tarefas },
           { data: notas }, { data: funcionarios }, { data: registos }] = await Promise.all([
        admin.from("obras").select("id, nome, local, percentagem_conclusao, data_conclusao_prevista")
             .eq("id", obraId).maybeSingle(),
        admin.from("obra_servicos").select("nome, horas_orcamento, valor_orcamento, concluido, ordem")
             .eq("obra_id", obraId).order("ordem"),
        admin.from("tarefas").select("descricao, data_prevista, duracao_horas, estado")
             .eq("obra_id", obraId).neq("estado", "concluida").order("data_prevista"),
        admin.from("obra_notas").select("tipo, texto, criado_em")
             .eq("obra_id", obraId).order("criado_em", { ascending: false }).limit(MAX_NOTAS),
        admin.from("funcionarios").select("id, nome, categoria").eq("ativo", true).order("nome"),
        admin.from("registos_admin").select("horas").eq("obra_id", obraId),
    ]);

    if (!obra) return resposta({ erro: "Obra não encontrada" }, 404);

    const horasGastas = (registos || []).reduce((s: number, r: any) => s + Number(r.horas || 0), 0);
    const idsFunc = new Set((funcionarios || []).map((f: any) => f.id));

    const dossie = {
        obra, servicos, tarefas, notas, funcionarios, horasGastas,
        hoje, diaSemana: DIAS[new Date().getDay()],
    };

    // ---- O plano ----
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
                max_tokens: 4000,
                system: instrucoes(dossie),
                messages: [{ role: "user", content:
                    `Faz o plano de ataque da obra ${obra.nome}.` }],
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
        accao: "planear_obra",
        utilizador: user.email,
        entrada: { obra_id: obraId, obra: obra.nome },
        saida: erro ? null : dados,
        modelo: MODELO,
        tokens_entrada: tokIn,
        tokens_saida: tokOut,
        custo_estimado: tokIn * CUSTO_ENTRADA + tokOut * CUSTO_SAIDA,
        erro,
    });

    if (erro) return resposta({ erro: "Não foi possível fazer o plano: " + erro }, 502);

    // ---- Validação: o calendário e a equipa são verificados por código ----
    const avisos: string[] = [];
    const eFimDeSemana = (iso: string) => {
        const dia = new Date(iso + "T00:00:00").getDay();
        return dia === 0 || dia === 6;
    };

    const propostas = (Array.isArray(dados?.tarefas) ? dados.tarefas : [])
        .slice(0, MAX_TAREFAS)
        .map((t: any, i: number) => {
            let data = typeof t.data_prevista === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.data_prevista)
                ? t.data_prevista : null;

            if (data && data < hoje) {
                avisos.push(`"${t.descricao}" vinha marcada para ${data}, que já passou.`);
                data = hoje;
            }
            if (data && eFimDeSemana(data)) {
                avisos.push(`"${t.descricao}" vinha marcada para um fim de semana (${data}).`);
            }

            const ids = (Array.isArray(t.funcionario_ids) ? t.funcionario_ids : [])
                .filter((id: string) => {
                    if (idsFunc.has(id)) return true;
                    avisos.push(`"${t.descricao}": foi sugerido alguém que não está na equipa.`);
                    return false;
                });

            const h = Number(t.duracao_horas);
            return {
                descricao:       String(t.descricao || "").slice(0, 300),
                data_prevista:   data,
                duracao_horas:   Number.isFinite(h) && h > 0 ? Math.min(h, 80) : 8,
                ordem:           Number.isFinite(Number(t.ordem)) ? Number(t.ordem) : i,
                funcionario_ids: ids,
                porque:          String(t.porque || "").slice(0, 300),
            };
        })
        .filter((t: any) => t.descricao);

    // Ninguém em dois sítios ao mesmo tempo: soma por pessoa e por dia
    const carga: Record<string, number> = {};
    propostas.forEach((t: any) => {
        if (!t.data_prevista) return;
        t.funcionario_ids.forEach((id: string) => {
            const k = `${id}|${t.data_prevista}`;
            carga[k] = (carga[k] || 0) + t.duracao_horas;
        });
    });
    Object.entries(carga).forEach(([k, horas]) => {
        if (horas > 8) {
            const [id, data] = k.split("|");
            const nome = (funcionarios || []).find((f: any) => f.id === id)?.nome || "alguém";
            avisos.push(`${nome} fica com ${horas}h marcadas em ${data}.`);
        }
    });

    if (!propostas.length) avisos.push("Não saiu nenhuma tarefa deste plano.");

    return resposta({
        obra:         { id: obra.id, nome: obra.nome },
        resumo:       dados?.resumo || null,
        tarefas:      propostas,
        riscos:       Array.isArray(dados?.riscos) ? dados.riscos.slice(0, 10) : [],
        pressupostos: Array.isArray(dados?.pressupostos) ? dados.pressupostos.slice(0, 10) : [],
        avisos,
        uso: { tokens_entrada: tokIn, tokens_saida: tokOut },
    });
});
