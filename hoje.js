// =======================================================
// ECRÃ HOJE
// O que a plataforma te traz sem teres de ir procurar:
// o que precisa de decisão, como estão as obras, o que aí vem.
//
// Regra desta página: nada de números inventados. Quando uma secção
// está vazia, diz porquê e o que falta preencher para passar a ter
// conteúdo — vazio por falta de dados não é o mesmo que vazio por
// estar tudo em ordem.
// =======================================================

const HOJE_ADMIN = "admin.html";

// Subida de preço a partir da qual vale a pena avisar
const LIMIAR_SUBIDA_PC = 5;
// Percentagem de horas gastas a partir da qual a obra fica em aviso
const LIMIAR_HORAS_PC  = 80;

document.addEventListener("DOMContentLoaded", async () => {
    const { data: { session } } = await SB.auth.getSession();
    if (session) { arrancar(); return; }

    document.getElementById("hojeLogin").style.display = "block";
    document.getElementById("hojeEntrar").addEventListener("click", entrar);
    document.getElementById("hojePass").addEventListener("keydown", e => {
        if (e.key === "Enter") entrar();
    });
});

async function entrar() {
    const email    = document.getElementById("hojeEmail").value.trim();
    const password = document.getElementById("hojePass").value;
    const msg      = document.getElementById("hojeMsg");
    if (!email || !password) { msg.textContent = "Preenche o email e a password."; return; }

    msg.textContent = "A entrar…";
    const { error } = await SB.auth.signInWithPassword({ email, password });
    if (error) { msg.textContent = "Credenciais inválidas."; return; }

    document.getElementById("hojeLogin").style.display = "none";
    arrancar();
}

function arrancar() {
    document.getElementById("hojeFolha").style.display  = "block";
    document.getElementById("hojeBarraIA").style.display = "flex";
    document.getElementById("hojeData").textContent = dataPorExtenso(new Date());

    document.getElementById("hojeActualizar").addEventListener("click", carregarTudo);
    document.getElementById("hojeCamara").addEventListener("click", () => {
        location.href = `${HOJE_ADMIN}#ler-fatura`;
    });

    ligarBarraPedido();
    carregarTudo();
}

async function carregarTudo() {
    const btn = document.getElementById("hojeActualizar");
    btn.style.opacity = ".3";
    await Promise.all([carregarAlertas(), carregarObras(), carregarAgenda()]);
    btn.style.opacity = "";
}

// =======================================================
// PRECISA DE TI
// =======================================================
async function carregarAlertas() {
    const cont = document.getElementById("hojeAlertas");
    const tit  = document.getElementById("hojeAlertasTitulo");
    cont.innerHTML = '<div class="hoje-vazio">A ver…</div>';

    const alertas = [];
    for (const procurar of [alertaPedidosPorValidar, alertaPrecosSubiram, alertaMovimentosSemObra,
                            alertaPorPagar, alertaStockAbaixoMinimo, alertaTarefasAtrasadas]) {
        try {
            const a = await procurar();
            if (a) alertas.push(a);
        } catch (e) { console.warn(procurar.name, e); }
    }

    tit.textContent = alertas.length ? `Precisa de ti · ${alertas.length}` : "Precisa de ti";

    if (!alertas.length) {
        cont.innerHTML = '<div class="hoje-vazio">Nada à tua espera. Nem preços fora do normal, nem faturas por imputar, nem tarefas atrasadas.</div>';
        return;
    }

    cont.innerHTML = alertas.map(a => `
        <button class="hoje-alerta" ${a.accao ? `data-accao="${a.accao}"` : `data-ir="${a.ir}"`}>
            <span class="hoje-icone" style="background:${a.cor}">${a.icone}</span>
            <span class="hoje-alerta-txt">
                <span class="hoje-alerta-tit">${esc(a.titulo)}</span>
                <span class="hoje-alerta-sub">${esc(a.sub)}</span>
            </span>
            <span class="hoje-seta">›</span>
        </button>`).join("");

    // Uns levam a outra página, outros abrem um painel aqui mesmo
    cont.querySelectorAll("[data-ir]").forEach(b => {
        b.addEventListener("click", () => { location.href = b.dataset.ir; });
    });
    cont.querySelectorAll('[data-accao="pedidos"]').forEach(b => {
        b.addEventListener("click", abrirPedidosPorValidar);
    });
}

// Material que ficou mais caro do que da última vez.
// É a razão de existir do histórico de preços.
async function alertaPrecosSubiram() {
    const { data } = await SB.from("precos")
        .select("artigo_id, preco, data, artigos(descricao)")
        .order("data", { ascending: false })
        .limit(400);
    if (!data?.length) return null;

    const porArtigo = {};
    data.forEach(p => { (porArtigo[p.artigo_id] ||= []).push(p); });

    const subidas = [];
    Object.values(porArtigo).forEach(lista => {
        if (lista.length < 2) return;                      // sem termo de comparação
        const [novo, anterior] = lista;                    // já vêm da mais recente
        const a = Number(anterior.preco), n = Number(novo.preco);
        if (!(a > 0) || !(n > a)) return;
        const pc = ((n - a) / a) * 100;
        if (pc < LIMIAR_SUBIDA_PC) return;
        subidas.push({ nome: novo.artigos?.descricao || "artigo", pc, delta: n - a });
    });
    if (!subidas.length) return null;

    subidas.sort((x, y) => y.pc - x.pc);
    const pior = subidas[0];
    return {
        icone: "📄", cor: "rgba(244,185,66,.22)",
        titulo: subidas.length === 1 ? "Preço acima do anterior" : `${subidas.length} preços acima do anterior`,
        sub: `Financeiro · +${pior.pc.toFixed(0)}% em ${pior.nome}`,
        ir: `${HOJE_ADMIN}#tab=inventario`,
    };
}

// Despesa que não foi atribuída a nenhuma obra: não entra em custo de obra nenhuma.
async function alertaMovimentosSemObra() {
    const { count } = await SB.from("movimentos_financeiros")
        .select("id", { count: "exact", head: true })
        .is("obra_id", null).eq("tipo", "saida").eq("ativo", true);
    if (!count) return null;
    return {
        icone: "🧾", cor: "rgba(0,0,0,.06)",
        titulo: count === 1 ? "1 despesa sem obra" : `${count} despesas sem obra`,
        sub: "Financeiro · não entram no custo de nenhuma obra",
        ir: `${HOJE_ADMIN}#tab=financeiro`,
    };
}

async function alertaPorPagar() {
    const { data, count } = await SB.from("movimentos_financeiros")
        .select("valor_total", { count: "exact" })
        .neq("estado_pagamento", "pago").eq("tipo", "saida").eq("ativo", true)
        .limit(200);
    if (!count) return null;
    const soma = (data || []).reduce((s, m) => s + Number(m.valor_total || 0), 0);
    return {
        icone: "💶", cor: "rgba(192,57,43,.10)",
        titulo: count === 1 ? "1 fatura por pagar" : `${count} faturas por pagar`,
        sub: `Financeiro · ${euros(soma)}`,
        ir: `${HOJE_ADMIN}#tab=financeiro`,
    };
}

// Stock abaixo do mínimo definido no artigo.
async function alertaStockAbaixoMinimo() {
    const [{ data: arts }, { data: movs }] = await Promise.all([
        SB.from("artigos").select("id, descricao, stock_inicial, stock_minimo")
          .eq("ativo", true).gt("stock_minimo", 0),
        SB.from("movimentos_stock").select("artigo_id, tipo_movimento, quantidade"),
    ]);
    if (!arts?.length) return null;

    const saldo = {};
    (movs || []).forEach(m => {
        const q = Number(m.quantidade) || 0;
        const entra = m.tipo_movimento === "entrada" || m.tipo_movimento === "ajuste_entrada";
        saldo[m.artigo_id] = (saldo[m.artigo_id] || 0) + (entra ? q : -q);
    });

    const abaixo = arts.filter(a =>
        (Number(a.stock_inicial) || 0) + (saldo[a.id] || 0) < Number(a.stock_minimo));
    if (!abaixo.length) return null;

    return {
        icone: "📦", cor: "rgba(0,0,0,.06)",
        titulo: abaixo.length === 1 ? "1 artigo abaixo do mínimo" : `${abaixo.length} artigos abaixo do mínimo`,
        sub: `Stock · ${abaixo.slice(0, 2).map(a => a.descricao).join(", ")}${abaixo.length > 2 ? "…" : ""}`,
        ir: `${HOJE_ADMIN}#tab=inventario`,
    };
}

async function alertaTarefasAtrasadas() {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, count } = await SB.from("tarefas")
        .select("descricao, obras(nome)", { count: "exact" })
        .lt("data_prevista", hoje).neq("estado", "concluida").limit(5);
    if (!count) return null;
    return {
        icone: "⏰", cor: "rgba(244,185,66,.22)",
        titulo: count === 1 ? "1 tarefa atrasada" : `${count} tarefas atrasadas`,
        sub: `Planeamento · ${data?.[0]?.obras?.nome || "sem obra"}`,
        ir: `${HOJE_ADMIN}#tab=planeamento`,
    };
}

// =======================================================
// OBRAS
// =======================================================
async function carregarObras() {
    const cont = document.getElementById("hojeObras");
    const tit  = document.getElementById("hojeObrasTitulo");

    const { data: obras, error } = await SB.from("obras")
        .select("id, nome, codigo, local, percentagem_conclusao, data_conclusao_prevista")
        .eq("estado", "ativa").order("nome");

    if (error) { cont.innerHTML = '<div class="hoje-vazio">Não foi possível ler as obras.</div>'; return; }
    if (!obras?.length) {
        tit.textContent = "Obras";
        cont.innerHTML = '<div class="hoje-vazio">Nenhuma obra activa.</div>';
        return;
    }
    tit.textContent = `Obras · ${obras.length} ${obras.length === 1 ? "activa" : "activas"}`;

    const ids = obras.map(o => o.id);
    const [{ data: servicos }, { data: gastos }, { data: horas }] = await Promise.all([
        SB.from("obra_servicos").select("obra_id, nome, valor_orcamento, horas_orcamento, concluido, ordem").in("obra_id", ids),
        SB.from("movimentos_financeiros").select("obra_id, valor_total").in("obra_id", ids).eq("tipo", "saida").eq("ativo", true),
        SB.from("registos_admin").select("obra_id, horas").in("obra_id", ids),
    ]);

    const soma = (lista, chave, campo) => (lista || []).reduce((acc, r) => {
        acc[r[chave]] = (acc[r[chave]] || 0) + (Number(r[campo]) || 0); return acc;
    }, {});

    const orcamento   = soma(servicos, "obra_id", "valor_orcamento");
    const horasOrc    = soma(servicos, "obra_id", "horas_orcamento");
    const gasto       = soma(gastos,   "obra_id", "valor_total");
    const horasReais  = soma(horas,    "obra_id", "horas");

    // Fase em curso: o primeiro serviço por concluir
    const fase = {};
    (servicos || []).slice()
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .forEach(s => { if (!s.concluido && !fase[s.obra_id]) fase[s.obra_id] = s.nome; });

    cont.innerHTML = obras.map(o => {
        const pc = Math.max(0, Math.min(100, Number(o.percentagem_conclusao) || 0));
        const sub = [fase[o.id] || o.local || o.codigo, pc ? `${pc}%` : null]
            .filter(Boolean).join(" · ");
        return `<button class="hoje-obra" data-obra="${o.id}">
            <div class="hoje-obra-linha">
                <div style="min-width:0">
                    <div class="hoje-obra-nome">${esc(o.nome)}</div>
                    <div class="hoje-obra-sub">${esc(sub || "sem fase definida")}</div>
                </div>
                ${etiquetaObra(o.id, orcamento, gasto, horasOrc, horasReais)}
            </div>
            <div class="hoje-barra"><i style="width:${pc}%"></i></div>
        </button>`;
    }).join("");

    cont.querySelectorAll("[data-obra]").forEach(b =>
        aoClicar(b, () => abrirObra(b.dataset.obra)));
}

// =======================================================
// O DOSSIÊ DE UMA OBRA
// O que a plataforma sabe dela num sítio só: como vai de dinheiro e de
// horas, o que vem a seguir, e o que lhe foste contando. É daqui que se
// lhe acrescenta contexto ou se lhe pede um plano.
// =======================================================
async function abrirObra(obraId) {
    abrirPainel("…", '<div class="hoje-vazio">A ler.</div>', "");

    const hoje = new Date().toISOString().slice(0, 10);
    const [{ data: obra }, { data: servicos }, { data: movs },
           { data: horas }, { data: tarefas }, { data: notas }] = await Promise.all([
        SB.from("obras").select("id, nome, local, percentagem_conclusao, data_conclusao_prevista").eq("id", obraId).maybeSingle(),
        SB.from("obra_servicos").select("nome, valor_orcamento, horas_orcamento, concluido, ordem").eq("obra_id", obraId).order("ordem"),
        SB.from("movimentos_financeiros").select("valor_total").eq("obra_id", obraId).eq("tipo", "saida").eq("ativo", true),
        SB.from("registos_admin").select("horas").eq("obra_id", obraId),
        SB.from("tarefas").select("descricao, data_prevista, duracao_horas").eq("obra_id", obraId)
          .neq("estado", "concluida").gte("data_prevista", hoje).order("data_prevista").limit(4),
        SB.from("obra_notas").select("id, tipo, texto, criado_em").eq("obra_id", obraId)
          .order("criado_em", { ascending: false }).limit(8),
    ]);

    if (!obra) {
        abrirPainel("Obra", '<div class="hoje-avisos">Não consegui ler esta obra.</div>',
            `<button class="btn-secondary" onclick="fecharPainel()">Fechar</button>`);
        return;
    }

    const soma = (lista, campo) => (lista || []).reduce((s, x) => s + (Number(x[campo]) || 0), 0);
    const gasto    = soma(movs, "valor_total");
    const hs       = soma(horas, "horas");
    const orc      = soma(servicos, "valor_orcamento");
    const orcHoras = soma(servicos, "horas_orcamento");

    const linha = (rotulo, valor) =>
        `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid rgba(0,0,0,.06);font-size:13px">
            <span style="color:var(--text-muted)">${rotulo}</span><span style="font-weight:600">${valor}</span>
        </div>`;

    const rotulosNota = { ponto_situacao: "ponto de situação", contexto: "contexto", projeto: "projeto", decisao: "decisão" };

    const corpo = `
        ${obra.local ? `<div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px">${esc(obra.local)}</div>` : ""}

        <div class="hoje-campo">
            <label>Como vai</label>
            ${linha("Gasto", euros(gasto) + (orc > 0 ? ` de ${euros(orc)}` : ""))}
            ${orc > 0 ? linha("Orçamento consumido", `${((gasto / orc) * 100).toFixed(0)}%`) : ""}
            ${linha("Horas registadas", hs ? `${hs}${orcHoras > 0 ? ` de ${orcHoras}` : ""}` : "nenhuma")}
            ${obra.percentagem_conclusao != null ? linha("Conclusão declarada", obra.percentagem_conclusao + "%") : ""}
            ${obra.data_conclusao_prevista ? linha("Fim previsto", obra.data_conclusao_prevista) : ""}
        </div>

        <div class="hoje-campo">
            <label>A seguir</label>
            ${(tarefas || []).length
                ? tarefas.map(t => `<div style="font-size:13px;padding:4px 0;border-top:1px solid rgba(0,0,0,.06)">
                      <span style="color:var(--text-muted)">${t.data_prevista}</span> · ${esc(t.descricao)}
                      <span style="color:var(--text-muted)">(${t.duracao_horas}h)</span></div>`).join("")
                : '<div class="hoje-vazio">Sem tarefas marcadas.</div>'}
        </div>

        <div class="hoje-campo">
            <label>O que me contaste</label>
            <div id="obraNotas">
            ${(notas || []).length
                ? notas.map(n => `<div style="font-size:13px;padding:7px 0;border-top:1px solid rgba(0,0,0,.06);display:flex;gap:8px" data-nota="${n.id}">
                      <div style="flex:1;min-width:0">
                          <div style="font-size:11px;color:var(--text-muted)">${n.criado_em.slice(0,10)} · ${rotulosNota[n.tipo] || n.tipo}</div>
                          <div style="line-height:1.5">${esc(n.texto)}</div>
                      </div>
                      <button class="hoje-acao" data-apagar="${n.id}" title="Apagar nota">✕</button>
                  </div>`).join("")
                : '<div class="hoje-vazio">Ainda não me contaste nada sobre esta obra. É isto que faz a diferença num plano.</div>'}
            </div>
        </div>`;

    abrirPainel(obra.nome, corpo,
        `<button class="btn-secondary" id="obraContar">Contar como está</button>
         <button class="btn-primary" id="obraPlano">Pedir plano</button>`);

    aoClicar(document.getElementById("obraContar"), () =>
        mostrarNotaDeObra("", { obra_id: obra.id, tipo_nota: "ponto_situacao", texto: "" }));
    aoClicar(document.getElementById("obraPlano"), () => pedirPlano(obra.id));

    document.querySelectorAll("[data-apagar]").forEach(b =>
        aoClicar(b, () => apagarNota(b.dataset.apagar)));
}

async function apagarNota(id) {
    if (!confirm("Apagar esta nota? O assistente deixa de a ter em conta.")) return;
    const { error } = await SB.from("obra_notas").delete().eq("id", id);
    if (error) { alert("Não foi possível apagar: " + error.message); return; }
    document.querySelector(`[data-nota="${id}"]`)?.remove();
    if (!document.querySelector("#obraNotas [data-nota]")) {
        document.getElementById("obraNotas").innerHTML =
            '<div class="hoje-vazio">Já não há nada guardado sobre esta obra.</div>';
    }
}

// A etiqueta diz a coisa mais urgente que se sabe sobre a obra:
// estouro de orçamento primeiro, horas depois. Sem orçamento definido,
// diz-se isso em vez de inventar um estado.
function etiquetaObra(id, orcamento, gasto, horasOrc, horasReais) {
    const orc = orcamento[id] || 0;
    const g   = gasto[id] || 0;
    const ho  = horasOrc[id] || 0;
    const hr  = horasReais[id] || 0;

    if (orc > 0) {
        const pc = (g / orc) * 100;
        if (pc > 100) return `<span class="hoje-etiqueta et-mau">Acima ${(pc - 100).toFixed(0)}%</span>`;
        if (pc >= 90) return `<span class="hoje-etiqueta et-aviso">Orçamento a ${pc.toFixed(0)}%</span>`;
    }
    if (ho > 0) {
        const pc = (hr / ho) * 100;
        if (pc >= LIMIAR_HORAS_PC) return `<span class="hoje-etiqueta et-aviso">Horas a ${pc.toFixed(0)}%</span>`;
    }
    if (orc > 0) return `<span class="hoje-etiqueta et-ok">No orçamento</span>`;
    return `<span class="hoje-etiqueta et-neutra">Sem orçamento</span>`;
}

// =======================================================
// HOJE E A SEGUIR
// =======================================================
async function carregarAgenda() {
    const cont = document.getElementById("hojeAgenda");
    const hoje = new Date().toISOString().slice(0, 10);

    const { data, error } = await SB.from("tarefas")
        .select("descricao, data_prevista, hora_inicio, estado, obras(nome), tarefa_funcionarios(responsavel, funcionarios(nome))")
        .gte("data_prevista", hoje).neq("estado", "concluida")
        .order("data_prevista").order("hora_inicio", { nullsFirst: false })
        .limit(6);

    if (error) { cont.innerHTML = '<div class="hoje-vazio">Não foi possível ler as tarefas.</div>'; return; }

    if (!data?.length) {
        cont.innerHTML = '<div class="hoje-vazio">Sem nada marcado. Esta lista enche-se a partir das tarefas do planeamento — enquanto não criares tarefas, fica vazia.</div>';
        return;
    }

    cont.innerHTML = data.map(t => {
        // O responsável (se houver) aparece primeiro
        const quem = [...(t.tarefa_funcionarios || [])]
            .sort((a, b) => (b.responsavel ? 1 : 0) - (a.responsavel ? 1 : 0))
            .map(tf => tf.funcionarios?.nome).filter(Boolean);
        const sub = [t.obras?.nome, quem.length ? `recebe o ${quem[0].split(" ")[0]}` : null]
            .filter(Boolean).join(" · ");
        return `<div class="hoje-evento">
            <div class="hoje-quando">${quando(t.data_prevista, t.hora_inicio, hoje)}</div>
            <div style="min-width:0">
                <div class="hoje-evento-tit">${esc(t.descricao)}</div>
                <div class="hoje-evento-sub">${esc(sub)}</div>
            </div>
        </div>`;
    }).join("");
}

// =======================================================
// FALAR COM O ASSISTENTE
// Escreves ou ditas em português corrente. Ele percebe se é material para
// comprar, uma pergunta sobre os dados, ou coisa que ainda não sabe fazer
// — e nesse caso diz-te, em vez de inventar.
//
// Material: devolve um rascunho que tu confirmas. Nada é gravado sem
// passares os olhos. Pergunta: os números vêm da base de dados, nunca do
// modelo. A IA percebe, o código valida, a decisão é tua.
// =======================================================
let _obrasHoje   = [];   // obras activas, para as listas
let _artigosHoje = [];   // artigos activos, para corrigir linhas
let _rascunho    = null; // o pedido que está em cima da mesa

function ligarBarraPedido() {
    const campo  = document.getElementById("hojePedido");
    const enviar = document.getElementById("hojeEnviar");
    const mic    = document.getElementById("hojeMic");

    campo.addEventListener("input", () => {
        enviar.style.display = campo.value.trim() ? "" : "none";
    });
    campo.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); falarComAssistente(); }
    });
    enviar.addEventListener("click", falarComAssistente);

    document.getElementById("hojePainelFechar").addEventListener("click", fecharPainel);
    document.getElementById("hojePainel").addEventListener("click", e => {
        if (e.target.id === "hojePainel") fecharPainel();
    });

    ligarMicrofone(campo, mic, enviar);
}

// Ditar em vez de escrever. Só aparece onde o browser sabe fazê-lo —
// em Chrome no telemóvel, que é onde isto interessa.
function ligarMicrofone(campo, mic, enviar) {
    const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Reconhecimento) return;

    mic.style.display = "";
    let a_ouvir = false;
    const rec = new Reconhecimento();
    rec.lang = "pt-PT";
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (e) => {
        campo.value = [...e.results].map(r => r[0].transcript).join("");
        enviar.style.display = campo.value.trim() ? "" : "none";
    };
    rec.onend = () => { a_ouvir = false; mic.textContent = "🎤"; mic.style.opacity = ""; };
    rec.onerror = () => { a_ouvir = false; mic.textContent = "🎤"; mic.style.opacity = ""; };

    mic.addEventListener("click", () => {
        if (a_ouvir) { rec.stop(); return; }
        try {
            rec.start();
            a_ouvir = true;
            mic.textContent = "⏺";
            mic.style.opacity = "1";
        } catch { /* já estava a ouvir */ }
    });
}

// O assistente decide o que lhe pediste: material para comprar, uma
// pergunta sobre os dados, ou coisa que ainda não sabe fazer.
async function falarComAssistente() {
    const campo = document.getElementById("hojePedido");
    const texto = campo.value.trim();
    if (!texto) return;

    const enviar = document.getElementById("hojeEnviar");
    enviar.disabled = true;
    enviar.textContent = "…";

    try {
        const { data: { session } } = await SB.auth.getSession();
        if (!session) throw new Error("A sessão expirou. Volta a entrar.");

        const r = await fetch(`${SUPABASE_URL}/functions/v1/assistente`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ texto }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);

        campo.value = "";
        enviar.style.display = "none";

        if (j.tipo === "material") {
            await carregarListasPedido();
            _rascunho = { texto, ...j };
            mostrarRascunho();
            return;
        }

        if (j.tipo === "pergunta") {
            mostrarResposta(texto, j.resposta);
            return;
        }

        if (j.tipo === "contexto_obra") {
            await mostrarNotaDeObra(texto, j);
            return;
        }

        if (j.tipo === "planear_obra") {
            await pedirPlano(j.obra_id);
            return;
        }

        // fora_de_alcance, ou qualquer coisa que não se reconheça
        mostrarResposta(texto, j.resposta || "Isso ainda não sei fazer.");

    } catch (e) {
        console.error("falarComAssistente:", e);
        abrirPainel("Não deu", `<div class="hoje-avisos">${esc(e.message)}</div>`, "");
    } finally {
        enviar.disabled = false;
        enviar.textContent = "➤";
    }
}

// Resposta a uma pergunta. Os números vieram da base de dados, não do
// modelo — por isso é que podem ir assim para o ecrã.
function mostrarResposta(pergunta, resposta) {
    abrirPainel("Assistente", `
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">${esc(pergunta)}</div>
        <div style="font-size:15px;line-height:1.6">${esc(resposta)}</div>`,
        `<button class="btn-secondary" onclick="fecharPainel()">Fechar</button>`);
}

async function carregarListasPedido() {
    if (_obrasHoje.length && _artigosHoje.length) return;
    const [{ data: o }, { data: a }] = await Promise.all([
        SB.from("obras").select("id, nome").eq("estado", "ativa").order("nome"),
        SB.from("artigos").select("id, descricao").eq("ativo", true).order("descricao"),
    ]);
    _obrasHoje   = Array.isArray(o) ? o : [];
    _artigosHoje = Array.isArray(a) ? a : [];
}

// Um clique que falha em silêncio é pior do que um erro à vista: fica-se
// a carregar no botão sem perceber porquê. Isto diz sempre alguma coisa.
function aoClicar(elemento, accao) {
    elemento?.addEventListener("click", async () => {
        try { await accao(); }
        catch (e) {
            console.error(e);
            abrirPainel("Não deu", `<div class="hoje-avisos">${esc(e.message || String(e))}</div>`,
                `<button class="btn-secondary" onclick="fecharPainel()">Fechar</button>`);
        }
    });
}

function mostrarRascunho() {
    const d = _rascunho;
    const avisos = [...(d.avisos || [])];
    if (d.por_perceber) avisos.unshift(d.por_perceber);

    const opcoesObra = `<option value="">— escolhe a obra —</option>` +
        _obrasHoje.map(o => `<option value="${o.id}"${o.id === d.obra_id ? " selected" : ""}>${esc(o.nome)}</option>`).join("");

    const corpo = `
        ${avisos.length ? `<div class="hoje-avisos">${avisos.map(esc).join("<br>")}</div>` : ""}
        <div class="hoje-campo">
            <label>Obra</label>
            <select id="pedObra">${opcoesObra}</select>
        </div>
        <div class="hoje-campo" style="margin-bottom:4px"><label>Material</label></div>
        <div id="pedLinhas">${d.linhas.map((l, i) => linhaPedidoHTML(l, i)).join("")}</div>
        <div class="hoje-campo" style="margin-top:12px">
            <label>Nota (opcional)</label>
            <input id="pedNota" placeholder="Ex: para segunda de manhã">
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:10px">
            Pedido original: "${esc(d.texto)}"
        </div>`;

    abrirPainel("Pedido de material", corpo,
        `<button class="btn-secondary" onclick="fecharPainel()">Cancelar</button>
         <button class="btn-primary" id="pedGuardar">Guardar pedido</button>`);

    document.getElementById("pedGuardar").addEventListener("click", guardarPedido);
}

function linhaPedidoHTML(l, i) {
    const opcoes = `<option value="">— sem artigo —</option>` +
        _artigosHoje.map(a => `<option value="${a.id}"${a.id === l.artigo_id ? " selected" : ""}>${esc(a.descricao)}</option>`).join("");
    const rotulo = { alta: "reconhecido", media: "parecido", baixa: "a confirmar" }[l.confianca] || l.confianca;
    return `<div class="hoje-linha-pedido" data-i="${i}">
        <div class="hoje-linha-topo">
            <span class="hoje-linha-desc">${esc(l.descricao)}</span>
            <span class="hoje-conf conf-${l.confianca}">${rotulo}</span>
        </div>
        <div class="hoje-linha-topo">
            <input type="number" step="0.01" min="0" class="qtd" value="${l.quantidade ?? ""}" placeholder="qtd">
            <input class="un" value="${esc(l.unidade || "")}" placeholder="un">
            <select class="art" style="flex:1;min-width:0;padding:6px 8px;font:inherit;font-size:13px;border:1px solid rgba(0,0,0,.15);border-radius:8px;background:#fff;color:var(--text-dark)">${opcoes}</select>
            <button class="hoje-acao" onclick="this.closest('.hoje-linha-pedido').remove()" title="Tirar">✕</button>
        </div>
    </div>`;
}

async function guardarPedido() {
    const btn = document.getElementById("pedGuardar");
    btn.disabled = true;
    btn.textContent = "A guardar…";

    try {
        const linhas = [...document.querySelectorAll("#pedLinhas .hoje-linha-pedido")].map((el, i) => {
            const i0 = Number(el.dataset.i);
            const q  = el.querySelector(".qtd").value;
            return {
                descricao:  _rascunho.linhas[i0].descricao,
                artigo_id:  el.querySelector(".art").value || null,
                quantidade: q !== "" ? Number(q) : null,
                unidade:    el.querySelector(".un").value.trim() || null,
                confianca:  _rascunho.linhas[i0].confianca,
                ordem:      i,
            };
        });
        if (!linhas.length) throw new Error("O pedido ficou sem material.");

        const { data: { user } } = await SB.auth.getUser();
        const { data: pedido, error } = await SB.from("pedidos").insert({
            obra_id:        document.getElementById("pedObra").value || null,
            pedido_por:     user?.email || null,
            texto_original: _rascunho.texto,
            notas:          document.getElementById("pedNota").value.trim() || null,
            estado:         "rascunho",
        }).select("id").single();
        if (error) throw error;

        const { error: errL } = await SB.from("pedido_linhas")
            .insert(linhas.map(l => ({ ...l, pedido_id: pedido.id })));
        if (errL) throw errL;

        _rascunho = null;
        fecharPainel();
        await carregarAlertas();

    } catch (e) {
        console.error("guardarPedido:", e);
        alert("Não foi possível guardar: " + (e.message || e));
    } finally {
        btn.disabled = false;
        btn.textContent = "Guardar pedido";
    }
}

// =======================================================
// CONTEXTO DAS OBRAS
// O que se vai sabendo de cada obra e não cabe numa coluna. É daqui
// que o plano parte: sem isto, planear é adivinhar.
// =======================================================
async function mostrarNotaDeObra(original, j) {
    await carregarListasPedido();   // precisa da lista de obras
    const tipos = [
        ["ponto_situacao", "Ponto de situação — como está agora"],
        ["contexto",       "Contexto — condição a ter em conta"],
        ["projeto",        "Projeto — vem do projeto ou do caderno"],
        ["decisao",        "Decisão — ficou assente"],
    ];
    const opcoesObra = `<option value="">— escolhe a obra —</option>` +
        _obrasHoje.map(o => `<option value="${o.id}"${o.id === j.obra_id ? " selected" : ""}>${esc(o.nome)}</option>`).join("");

    abrirPainel("Nota de obra", `
        <div class="hoje-campo">
            <label>Obra</label>
            <select id="notaObra">${opcoesObra}</select>
        </div>
        <div class="hoje-campo">
            <label>Tipo</label>
            <select id="notaTipo">${tipos.map(([v, t]) =>
                `<option value="${v}"${v === j.tipo_nota ? " selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <div class="hoje-campo">
            <label>Nota</label>
            <textarea id="notaTexto" rows="5">${esc(j.texto)}</textarea>
        </div>
        <div style="font-size:11.5px;color:var(--text-muted)">
            Fica guardada nesta obra e entra no plano da próxima vez que pedires um.
        </div>`,
        `<button class="btn-secondary" onclick="fecharPainel()">Cancelar</button>
         <button class="btn-primary" id="notaGuardar">Guardar nota</button>`);

    document.getElementById("notaGuardar").addEventListener("click", guardarNotaDeObra);
}

async function guardarNotaDeObra() {
    const btn = document.getElementById("notaGuardar");
    const obra = document.getElementById("notaObra").value;
    const texto = document.getElementById("notaTexto").value.trim();

    if (!obra)  { alert("Escolhe a obra."); return; }
    if (!texto) { alert("A nota está vazia."); return; }

    btn.disabled = true; btn.textContent = "A guardar…";
    try {
        const { data: { user } } = await SB.auth.getUser();
        const { error } = await SB.from("obra_notas").insert({
            obra_id: obra,
            tipo:    document.getElementById("notaTipo").value,
            texto,
            autor:   user?.email || null,
        });
        if (error) throw error;
        fecharPainel();
    } catch (e) {
        console.error("guardarNotaDeObra:", e);
        alert("Não foi possível guardar: " + (e.message || e));
    } finally {
        btn.disabled = false; btn.textContent = "Guardar nota";
    }
}

// =======================================================
// O PLANO DE ATAQUE
// Proposto pelo assistente, cortado por ti, e só depois criado no
// planeamento. Nada entra na agenda de ninguém sem passar por aqui.
// =======================================================
let _plano = null;

async function pedirPlano(obraId) {
    abrirPainel("A fazer o plano…",
        '<div class="hoje-vazio">A ler os serviços, as tarefas, as horas e as notas desta obra. Demora alguns segundos.</div>', "");

    try {
        const { data: { session } } = await SB.auth.getSession();
        if (!session) throw new Error("A sessão expirou. Volta a entrar.");

        const r = await fetch(`${SUPABASE_URL}/functions/v1/planear-obra`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ obra_id: obraId }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);

        _plano = j;
        await carregarEquipa();
        mostrarPlano();

    } catch (e) {
        console.error("pedirPlano:", e);
        abrirPainel("Não deu", `<div class="hoje-avisos">${esc(e.message)}</div>`,
            `<button class="btn-secondary" onclick="fecharPainel()">Fechar</button>`);
    }
}

let _equipaHoje = [];
async function carregarEquipa() {
    if (_equipaHoje.length) return;
    const { data } = await SB.from("funcionarios").select("id, nome").eq("ativo", true).order("nome");
    _equipaHoje = data || [];
}

function mostrarPlano() {
    const p = _plano;
    const nomes = (ids) => (ids || [])
        .map(id => _equipaHoje.find(f => f.id === id)?.nome?.split(" ")[0])
        .filter(Boolean).join(", ");

    const listas = (titulo, itens, cor) => (itens || []).length ? `
        <div class="hoje-campo">
            <label>${titulo}</label>
            <div style="font-size:12.5px;line-height:1.6;color:${cor}">
                ${itens.map(i => "• " + esc(i)).join("<br>")}
            </div>
        </div>` : "";

    const corpo = `
        ${p.resumo ? `<div style="font-size:14px;line-height:1.6;margin-bottom:14px">${esc(p.resumo)}</div>` : ""}
        ${(p.avisos || []).length ? `<div class="hoje-avisos">${p.avisos.map(esc).join("<br>")}</div>` : ""}
        <div class="hoje-campo" style="margin-bottom:4px"><label>Tarefas propostas</label></div>
        <div id="planoTarefas">${(p.tarefas || []).map((t, i) => `
            <div class="hoje-linha-pedido" data-i="${i}">
                <div class="hoje-linha-topo">
                    <span class="hoje-linha-desc">${esc(t.descricao)}</span>
                    <button class="hoje-acao" onclick="this.closest('.hoje-linha-pedido').remove()" title="Tirar">✕</button>
                </div>
                <div style="font-size:12px;color:var(--text-muted)">
                    ${t.data_prevista || "sem data"} · ${t.duracao_horas}h${nomes(t.funcionario_ids) ? " · " + esc(nomes(t.funcionario_ids)) : " · sem ninguém atribuído"}
                </div>
                ${t.porque ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:3px;font-style:italic">${esc(t.porque)}</div>` : ""}
            </div>`).join("")}
        </div>
        ${listas("Riscos", p.riscos, "#8a5e06")}
        ${listas("Pressupostos", p.pressupostos, "var(--text-muted)")}`;

    abrirPainel(`Plano · ${p.obra?.nome || "obra"}`, corpo,
        (p.tarefas || []).length
            ? `<button class="btn-secondary" onclick="fecharPainel()">Deitar fora</button>
               <button class="btn-primary" id="planoCriar">Criar no planeamento</button>`
            : `<button class="btn-secondary" onclick="fecharPainel()">Fechar</button>`);

    document.getElementById("planoCriar")?.addEventListener("click", criarPlano);
}

async function criarPlano() {
    const btn = document.getElementById("planoCriar");
    btn.disabled = true; btn.textContent = "A criar…";

    try {
        const escolhidas = [...document.querySelectorAll("#planoTarefas .hoje-linha-pedido")]
            .map(el => _plano.tarefas[Number(el.dataset.i)]);
        if (!escolhidas.length) throw new Error("Não sobrou nenhuma tarefa.");

        const { data: criadas, error } = await SB.from("tarefas").insert(
            escolhidas.map((t, i) => ({
                obra_id:       _plano.obra.id,
                descricao:     t.descricao,
                data_prevista: t.data_prevista,
                duracao_horas: t.duracao_horas,
                ordem:         i,
                estado:        "planeada",
                notas:         t.porque || null,
            }))
        ).select("id");
        if (error) throw error;

        // Quem faz cada uma. As linhas voltam pela ordem em que entraram,
        // mas se vier um número diferente do que mandámos não se adivinha:
        // deixa-se a tarefa sem gente em vez de a dar à pessoa errada.
        const ligacoes = [];
        if ((criadas || []).length === escolhidas.length) {
            criadas.forEach((tarefa, i) => {
                (escolhidas[i]?.funcionario_ids || []).forEach((fid, k) => {
                    ligacoes.push({ tarefa_id: tarefa.id, funcionario_id: fid, responsavel: k === 0 });
                });
            });
        } else {
            console.warn("criarPlano: vieram", criadas?.length, "tarefas para", escolhidas.length, "enviadas");
            alert("As tarefas foram criadas, mas não consegui atribuir as pessoas com segurança. Abre o planeamento e atribui à mão.");
        }
        if (ligacoes.length) {
            const { error: errL } = await SB.from("tarefa_funcionarios").insert(ligacoes);
            if (errL) console.error("tarefa_funcionarios:", errL);
        }

        _plano = null;
        fecharPainel();
        await carregarAgenda();

    } catch (e) {
        console.error("criarPlano:", e);
        alert("Não foi possível criar: " + (e.message || e));
    } finally {
        btn.disabled = false; btn.textContent = "Criar no planeamento";
    }
}

// --- Pedidos à espera de validação ---
async function alertaPedidosPorValidar() {
    const { data, count } = await SB.from("pedidos")
        .select("obras(nome)", { count: "exact" })
        .eq("estado", "rascunho").order("criado_em", { ascending: false }).limit(3);
    if (!count) return null;
    const obras = [...new Set((data || []).map(p => p.obras?.nome).filter(Boolean))];
    return {
        icone: "🛒", cor: "rgba(0,0,0,.06)",
        titulo: count === 1 ? "1 pedido por validar" : `${count} pedidos por validar`,
        sub: `Compras · ${obras.join(", ") || "sem obra indicada"}`,
        accao: "pedidos",
    };
}

async function abrirPedidosPorValidar() {
    abrirPainel("Pedidos por validar", '<div class="hoje-vazio">A carregar…</div>', "");

    const { data, error } = await SB.from("pedidos")
        .select("id, texto_original, notas, criado_em, pedido_por, obras(nome), pedido_linhas(descricao, quantidade, unidade, confianca, ordem)")
        .eq("estado", "rascunho").order("criado_em", { ascending: false }).limit(20);

    const corpo = document.getElementById("hojePainelCorpo");
    if (error)       { corpo.innerHTML = '<div class="hoje-avisos">Não foi possível ler os pedidos.</div>'; return; }
    if (!data.length) { corpo.innerHTML = '<div class="hoje-vazio">Nenhum pedido à espera.</div>'; return; }

    corpo.innerHTML = data.map(p => {
        const linhas = (p.pedido_linhas || []).sort((a, b) => a.ordem - b.ordem);
        return `<div class="hoje-linha-pedido" data-pedido="${p.id}">
            <div class="hoje-linha-topo">
                <span class="hoje-linha-desc">${esc(p.obras?.nome || "sem obra")}</span>
                <span style="font-size:11.5px;color:var(--text-muted)">${p.criado_em.slice(0, 10)}</span>
            </div>
            <div style="font-size:13px;line-height:1.6">
                ${linhas.map(l => `• ${l.quantidade ?? "?"} ${esc(l.unidade || "")} ${esc(l.descricao)}`).join("<br>")}
            </div>
            ${p.notas ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${esc(p.notas)}</div>` : ""}
            <div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn-primary" style="font-size:12px;padding:4px 12px" data-validar="${p.id}">Validar</button>
                <button class="btn-secondary" style="font-size:12px;padding:4px 12px" data-cancelar="${p.id}">Cancelar</button>
            </div>
        </div>`;
    }).join("");

    corpo.querySelectorAll("[data-validar]").forEach(b =>
        b.addEventListener("click", () => mudarEstadoPedido(b.dataset.validar, "validado")));
    corpo.querySelectorAll("[data-cancelar]").forEach(b =>
        b.addEventListener("click", () => mudarEstadoPedido(b.dataset.cancelar, "cancelado")));
}

async function mudarEstadoPedido(id, estado) {
    const { data: { user } } = await SB.auth.getUser();
    const { error } = await SB.from("pedidos").update({
        estado,
        validado_em:  new Date().toISOString(),
        validado_por: user?.email || null,
    }).eq("id", id);
    if (error) { alert("Não foi possível: " + error.message); return; }

    document.querySelector(`[data-pedido="${id}"]`)?.remove();
    if (!document.querySelector("[data-pedido]")) {
        document.getElementById("hojePainelCorpo").innerHTML =
            '<div class="hoje-vazio">Tratado. Não ficou nenhum à espera.</div>';
    }
    await carregarAlertas();
}

// --- Painel ---
function abrirPainel(titulo, corpoHTML, accoesHTML) {
    document.getElementById("hojePainelTitulo").textContent = titulo;
    document.getElementById("hojePainelCorpo").innerHTML    = corpoHTML;
    document.getElementById("hojePainelAccoes").innerHTML   = accoesHTML || "";
    document.getElementById("hojePainel").style.display     = "flex";
}

function fecharPainel() {
    document.getElementById("hojePainel").style.display = "none";
    _rascunho = null;
}

// =======================================================
// APOIO
// =======================================================
const DIAS  = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const DIAS3 = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

function dataPorExtenso(d) {
    return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
}

// Hoje mostra a hora; os próximos dias mostram o dia da semana.
function quando(dataISO, hora, hojeISO) {
    if (dataISO === hojeISO) return hora ? String(hora).slice(0, 5) : "hoje";
    const d = new Date(dataISO + "T00:00:00");
    return DIAS3[d.getDay()];
}

// Dinheiro escreve-se à portuguesa: vírgula decimal, espaço nos milhares.
function euros(n) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}

function esc(s) {
    // Escapa também a plica: sem ela, um atributo delimitado por plicas
    // fica aberto a quem souber disso.
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
