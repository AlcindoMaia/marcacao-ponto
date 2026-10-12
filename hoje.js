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
    document.getElementById("hojePedido").addEventListener("focus", avisoAssistente);

    carregarTudo();
}

function avisoAssistente() {
    const barra = document.getElementById("hojeBarraIA");
    if (document.getElementById("hojeAvisoIA")) return;
    const aviso = document.createElement("div");
    aviso.id = "hojeAvisoIA";
    aviso.className = "hoje-aviso-ia";
    aviso.textContent = "Pedidos por texto ainda não estão ligados. A câmara já lê faturas.";
    barra.insertBefore(aviso, barra.firstChild);
    setTimeout(() => aviso.remove(), 6000);
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
    for (const procurar of [alertaPrecosSubiram, alertaMovimentosSemObra,
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

    cont.innerHTML = alertas.map((a, i) => `
        <button class="hoje-alerta" data-ir="${a.ir}">
            <span class="hoje-icone" style="background:${a.cor}">${a.icone}</span>
            <span class="hoje-alerta-txt">
                <span class="hoje-alerta-tit">${esc(a.titulo)}</span>
                <span class="hoje-alerta-sub">${esc(a.sub)}</span>
            </span>
            <span class="hoje-seta">›</span>
        </button>`).join("");

    cont.querySelectorAll("[data-ir]").forEach(b => {
        b.addEventListener("click", () => { location.href = b.dataset.ir; });
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
        sub: `Financeiro · ${soma.toFixed(2)} €`,
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
        return `<div class="hoje-obra">
            <div class="hoje-obra-linha">
                <div style="min-width:0">
                    <div class="hoje-obra-nome">${esc(o.nome)}</div>
                    <div class="hoje-obra-sub">${esc(sub || "sem fase definida")}</div>
                </div>
                ${etiquetaObra(o.id, orcamento, gasto, horasOrc, horasReais)}
            </div>
            <div class="hoje-barra"><i style="width:${pc}%"></i></div>
        </div>`;
    }).join("");
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
        const quem = (t.tarefa_funcionarios || [])
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

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
