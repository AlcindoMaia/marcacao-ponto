
// =======================================================
// DARK MODE
// =======================================================
function toggleDark() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', isDark);
    const btn = document.getElementById('darkBtn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

function iniciarDarkMode() {
    const saved = localStorage.getItem('darkMode');
    // Ignorar dark mode guardado — usar sempre o design claro por defeito
    // (o utilizador pode activar manualmente)
    if (saved === 'true') {
        // Não activar automaticamente — reset para claro
        localStorage.removeItem('darkMode');
    }
    document.body.classList.remove('dark');
    const btn = document.getElementById('darkBtn');
    if (btn) btn.textContent = '🌙';
}

// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================

// =======================================================
// ESTADO GLOBAL
// =======================================================
let currentDate   = new Date();
let filtroDia     = null;
let artigoEditId  = null;
let movEditId     = null;
let movimentos    = [];
let funcEditId    = null;
let chartLinhas   = null;
let chartObras    = null;
let chartFuncs    = null;
let _paginaFluxo  = 0;
const _PAGINA_FLUXO_TAM = 50;

// =======================================================
// AUTH — Login com Supabase Auth (email + password)
// =======================================================
window.addEventListener("load", async () => {
    ligarEventosGlobais();

    // Verificar se já há sessão activa
    const { data: { session } } = await SB.auth.getSession();
    if (session) {
        mostrarPainel();
        return;
    }

    // Mostrar form de login
    const lb = document.getElementById("loginBox");
    if (lb) lb.style.display = "flex";
    document.getElementById("emailInput")?.focus();

    document.getElementById("btnLogin")?.addEventListener("click", fazerLogin);
    document.addEventListener("keydown", e => {
        if (e.key === "Enter" && !document.getElementById("loginBox").classList.contains("hidden")) {
            fazerLogin();
        }
    });
});

async function fazerLogin() {
    const email    = document.getElementById("emailInput")?.value?.trim();
    const password = document.getElementById("passwordInput")?.value;
    const msg      = document.getElementById("pinMsg");

    if (!email || !password) {
        msg.textContent = "Preencha email e password.";
        return;
    }

    msg.textContent = "A autenticar...";
    msg.style.color = "";

    const { error } = await SB.auth.signInWithPassword({ email, password });

    if (error) {
        msg.textContent = "Credenciais inválidas.";
        msg.style.color = "#ff7a7a";
        return;
    }

    mostrarPainel();
}

async function fazerLogout() {
    await SB.auth.signOut();
    document.getElementById("adminArea").classList.add("hidden");
    document.getElementById("loginBox").classList.remove("hidden");
    document.getElementById("emailInput").value    = "";
    document.getElementById("passwordInput").value = "";
    document.getElementById("pinMsg").textContent  = "";
}

function mostrarPainel() {
    const lb = document.getElementById("loginBox");
    if (lb) lb.style.display = "none";
    const aa = document.getElementById("adminArea");
    if (aa) aa.classList.remove("hidden");
    inicializarPainel();
}

// =======================================================
// INICIALIZAÇÃO / TABS
// =======================================================
function inicializarPainel() {
    ativarTabs();
    abrirTab("fluxo");
    carregarNotificacoes(); // Carregar alertas iniciais
}

function ativarTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
        btn.onclick = () => abrirTab(btn.dataset.tab);
    });
}

function abrirTab(nome) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    const tabBtn = document.querySelector(`.tab[data-tab="${nome}"]`);
    const tabDiv = document.getElementById("tab-" + nome);
    if (!tabBtn || !tabDiv) return;
    tabBtn.classList.add("active");
    tabDiv.classList.add("active");
    if (nome === "fluxo")        initFluxo();
    if (nome === "financeiro")   carregarFinanceiro();
    if (nome === "dashboard")    initDashboard();
    if (nome === "registos")     { gerarCalendario(); carregarRegistos(); }
    if (nome === "funcionarios") initFuncionarios();
    if (nome === "inventario")   initInventario();
    if (nome === "obras")        initObras();
    if (nome === "orcamentos")    initOrcamentos();
    if (nome === "config")        initConfig();
    if (nome === "gerarqr")       initGerarQr();
}

// =======================================================
// FINANCEIRO
// =======================================================

// =======================================================
// FINANCEIRO — sub-tabs switch + DRE + Fluxo + Orçado Real
// =======================================================
function switchFinTab(tab) {
    document.querySelectorAll(".fin-subtab").forEach(btn => {
        const active = btn.dataset.fintab === tab;
        btn.style.background   = active ? "rgba(244,185,66,.15)" : "none";
        btn.style.color        = active ? "var(--primary)" : "var(--text-muted)";
        btn.style.borderBottom = active ? "2px solid var(--primary)" : "2px solid transparent";
    });
    document.querySelectorAll(".fin-subtab-content").forEach(c => c.style.display = "none");
    const el = document.getElementById("finTab-" + tab);
    if (el) el.style.display = "block";
    if (tab === "ordenados")  carregarFinanceiro();
    if (tab === "dre")        carregarDRE();
    if (tab === "fluxo")      carregarFluxo();
    if (tab === "orcado")     carregarOrcadoReal();
}

async function carregarDRE() {
    const periodo = document.getElementById("drePeriodo")?.value || "ano";
    const obraId  = document.getElementById("dreObra")?.value || "";

    // Calcular datas
    const hoje = new Date();
    let dInicio, dFim;
    if (periodo === "mes") {
        dInicio = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-01`;
        dFim    = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-${new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).getDate()}`;
    } else if (periodo === "trimestre") {
        const q = Math.floor(hoje.getMonth() / 3);
        dInicio = `${hoje.getFullYear()}-${String(q*3+1).padStart(2,"0")}-01`;
        dFim    = `${hoje.getFullYear()}-${String(q*3+3).padStart(2,"0")}-${new Date(hoje.getFullYear(), q*3+3, 0).getDate()}`;
    } else if (periodo === "ano") {
        dInicio = `${hoje.getFullYear()}-01-01`;
        dFim    = `${hoje.getFullYear()}-12-31`;
    } else {
        dInicio = "2000-01-01"; dFim = "2099-12-31";
    }

    let q = SB.from("movimentos_financeiros")
        .select("tipo, valor_total, categorias_financeiras(nome)")
        .gte("data_documento", dInicio).lte("data_documento", dFim);
    if (obraId) q = q.eq("obra_id", obraId);
    const { data } = await q;
    if (!data) return;

    const receitas = data.filter(m => m.tipo === "entrada");
    const custos   = data.filter(m => m.tipo === "saida");
    const totRec   = receitas.reduce((s,m) => s+Number(m.valor_total||0), 0);
    const totCust  = custos.reduce((s,m)   => s+Number(m.valor_total||0), 0);
    const resultado = totRec - totCust;
    const margem    = totRec > 0 ? (resultado / totRec * 100) : 0;

    const fmt = v => v.toLocaleString("pt-PT", {minimumFractionDigits:2, maximumFractionDigits:2}) + " €";
    document.getElementById("dreReceitas").textContent  = fmt(totRec);
    document.getElementById("dreCustos").textContent    = fmt(totCust);
    document.getElementById("dreResultado").textContent = fmt(resultado);
    document.getElementById("dreResultado").style.color = resultado >= 0 ? "#5ad65a" : "#ff7a7a";
    document.getElementById("dreMargem").textContent    = margem.toFixed(1) + "%";

    // Detalhes por categoria
    const porCat = {};
    data.forEach(m => {
        const cat = m.categorias_financeiras?.nome || "Sem categoria";
        if (!porCat[cat]) porCat[cat] = { entrada:0, saida:0 };
        porCat[cat][m.tipo] += Number(m.valor_total||0);
    });

    document.getElementById("dreDetalheReceitas").innerHTML = Object.entries(porCat)
        .filter(([,v]) => v.entrada > 0).sort(([,a],[,b]) => b.entrada-a.entrada)
        .map(([cat,v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
            <span style="opacity:.8">${cat}</span><span style="color:#5ad65a">${fmt(v.entrada)}</span>
        </div>`).join("") || '<div style="opacity:.4;font-size:13px">Sem receitas</div>';

    document.getElementById("dreDetalheCustos").innerHTML = Object.entries(porCat)
        .filter(([,v]) => v.saida > 0).sort(([,a],[,b]) => b.saida-a.saida)
        .map(([cat,v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
            <span style="opacity:.8">${cat}</span><span style="color:#ff7a7a">${fmt(v.saida)}</span>
        </div>`).join("") || '<div style="opacity:.4;font-size:13px">Sem custos</div>';

    // Preencher select de obras se vazio
    const dreObraEl = document.getElementById("dreObra");
    if (dreObraEl && dreObraEl.options.length <= 1) {
        const { data: obras } = await SB.from("obras").select("id,nome").order("nome");
        (obras||[]).forEach(o => {
            const opt = document.createElement("option");
            opt.value = o.id; opt.textContent = o.nome;
            dreObraEl.appendChild(opt);
        });
    }
}

async function carregarFluxo() {
    const horizonte = parseInt(document.getElementById("fluxoHorizonte")?.value || "60");
    const hoje = new Date();
    const fim  = new Date(hoje); fim.setDate(fim.getDate() + horizonte);
    const dHoje = hoje.toISOString().split("T")[0];
    const dFim  = fim.toISOString().split("T")[0];

    const { data } = await SB.from("movimentos_financeiros")
        .select("tipo, valor_total, estado_pagamento, data_documento")
        .gte("data_documento", dHoje).lte("data_documento", dFim)
        .order("data_documento");
    if (!data) return;

    const fmt = v => v.toLocaleString("pt-PT", {minimumFractionDigits:2}) + " €";
    const entradas  = data.filter(m => m.tipo==="entrada").reduce((s,m)=>s+Number(m.valor_total||0),0);
    const saidas    = data.filter(m => m.tipo==="saida").reduce((s,m)=>s+Number(m.valor_total||0),0);
    const saldo     = entradas - saidas;
    const atraso    = data.filter(m => m.estado_pagamento==="por_pagar" && m.data_documento < dHoje);
    const totAtraso = atraso.reduce((s,m)=>s+Number(m.valor_total||0),0);

    document.getElementById("fluxoEntradas").textContent = fmt(entradas);
    document.getElementById("fluxoSaidas").textContent   = fmt(saidas);
    document.getElementById("fluxoSaldo").textContent    = fmt(saldo);
    document.getElementById("fluxoSaldo").style.color    = saldo >= 0 ? "#5ad65a" : "#ff7a7a";
    document.getElementById("fluxoAtraso").textContent   = fmt(totAtraso);

    const tabela = document.getElementById("fluxoTabela");
    if (tabela) {
        tabela.innerHTML = data.slice(0,30).map(m => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
                <span style="opacity:.6;min-width:90px">${m.data_documento}</span>
                <span style="flex:1;opacity:.8">${m.tipo==="entrada"?"Entrada":"Saída"}</span>
                <span style="color:${m.tipo==="entrada"?"#5ad65a":"#ff7a7a"};font-weight:500">${fmt(Number(m.valor_total||0))}</span>
                <span style="margin-left:8px;font-size:10px;opacity:.5">${m.estado_pagamento==="pago"?"✓":"⏳"}</span>
            </div>`).join("") || '<div style="opacity:.4;padding:20px;text-align:center">Sem movimentos no período</div>';
    }
}

async function carregarOrcadoReal() {
    const obraId = document.getElementById("orcadoObra")?.value || "";
    const fmt = v => v.toLocaleString("pt-PT", {minimumFractionDigits:2}) + " €";

    // Orçamento aprovado
    let qOrc = SB.from("orcamentos").select("valor_total").in("estado", ["aceite","enviado"]);
    if (obraId) qOrc = qOrc.eq("obra_id", obraId);
    const { data: orcs } = await qOrc;
    const totalOrcado = (orcs||[]).reduce((s,o)=>s+Number(o.valor_total||0),0);

    // Custos reais
    let qCusto = SB.from("movimentos_financeiros").select("valor_total").eq("tipo","saida");
    if (obraId) qCusto = qCusto.eq("obra_id", obraId);
    const { data: custos } = await qCusto;
    const totalReal = (custos||[]).reduce((s,m)=>s+Number(m.valor_total||0),0);

    const desvio = totalOrcado - totalReal;
    const pct    = totalOrcado > 0 ? (totalReal/totalOrcado*100) : 0;

    document.getElementById("orcadoTotal").textContent   = fmt(totalOrcado);
    document.getElementById("orcadoReal").textContent    = fmt(totalReal);
    document.getElementById("orcadoDesvio").textContent  = fmt(desvio);
    document.getElementById("orcadoDesvio").style.color  = desvio >= 0 ? "#5ad65a" : "#ff7a7a";
    document.getElementById("orcadoPercent").textContent = pct.toFixed(1) + "%";

    const bar = document.getElementById("orcadoBar");
    const barLabel = document.getElementById("orcadoBarLabel");
    if (bar) bar.style.width = Math.min(pct, 100) + "%";
    if (bar) bar.style.background = pct > 100 ? "#ff7a7a" : pct > 80 ? "#f97316" : "#5ad65a";
    if (barLabel) barLabel.textContent = pct.toFixed(0) + "% do orçamento consumido";

    // Preencher select obras
    const orcObraEl = document.getElementById("orcadoObra");
    if (orcObraEl && orcObraEl.options.length <= 1) {
        const { data: obras } = await SB.from("obras").select("id,nome").order("nome");
        (obras||[]).forEach(o => {
            const opt = document.createElement("option");
            opt.value = o.id; opt.textContent = o.nome;
            orcObraEl.appendChild(opt);
        });
    }
}

async function carregarFinanceiro() {
    // Determinar mês a consultar
    const filtroEl = document.getElementById("filtroMesFinanceiro");
    const hoje     = new Date();
    const anoMes   = filtroEl?.value || `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}`;
    const [ano, mes] = anoMes.split("-").map(Number);
    const inicio   = `${ano}-${String(mes).padStart(2,"0")}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fim      = `${ano}-${String(mes).padStart(2,"0")}-${ultimoDia}`;

    const tbody = document.querySelector("#tabelaFinanceira tbody");
    if (!tbody) return;

    // Buscar registos_admin do mês (fonte de verdade para salários)
    const [registosRes, funcsRes] = await Promise.all([
        SB.from("registos_admin")
            .select("funcionario_id, horas, data, tipo, obra_id, obras(nome)")
            .gte("data", inicio).lte("data", fim),
        SB.from("funcionarios")
            .select("id, nome, valor_dia, ativo").eq("ativo", true)
    ]);

    const registos = registosRes.data || [];
    const funcs    = funcsRes.data    || [];

    // Agrupar por funcionário — excluir só faltas
    const porFunc = {};
    registos.forEach(r => {
        if (r.tipo === "falta") return;     // faltas não contam
        const fid = r.funcionario_id;
        if (!porFunc[fid]) porFunc[fid] = { horas: 0, dias: new Set() };
        porFunc[fid].horas += Number(r.horas) || 0;
        porFunc[fid].dias.add(r.data);
    });

    let totalHoras = 0, totalDias = 0, totalPagar = 0;
    tbody.innerHTML = "";

    funcs.forEach(f => {
        const dados = porFunc[f.id];
        if (!dados) return;
        const horas = dados.horas;
        const dias  = dados.dias.size;
        const valor = f.valor_dia ? dias * f.valor_dia : 0;
        totalHoras += horas;
        totalDias  += dias;
        totalPagar += valor;
        tbody.innerHTML += `<tr>
            <td>${f.nome}</td>
            <td>${horas.toFixed(2)}h</td>
            <td>${dias}</td>
            <td>${valor.toFixed(2)} €</td>
        </tr>`;
    });

    // KPIs
    const kpiFEl = document.getElementById("kpiFuncionarios");
    const kpiHEl = document.getElementById("kpiHoras");
    const kpiDEl = document.getElementById("kpiDias");
    const kpiTEl = document.getElementById("kpiTotal");
    if (kpiFEl) kpiFEl.textContent = funcs.filter(f => porFunc[f.id]).length;
    if (kpiHEl) kpiHEl.textContent = totalHoras.toFixed(2) + "h";
    if (kpiDEl) kpiDEl.textContent = totalDias;
    if (kpiTEl) kpiTEl.textContent = totalPagar.toFixed(2) + " €";
}

// =======================================================
// CALENDÁRIO
// =======================================================
function gerarCalendario() {
    const grid  = document.getElementById("calendarGrid");
    const title = document.getElementById("calendarTitle");
    if (!grid || !title) return;
    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth();
    title.textContent = currentDate.toLocaleString("pt-PT", { month: "long", year: "numeric", timeZone: "Europe/Lisbon" });
    grid.innerHTML = "";
    const primeiroDia = new Date(ano, mes, 1).getDay();
    const diasNoMes   = new Date(ano, mes + 1, 0).getDate();
    for (let i = 0; i < primeiroDia; i++) grid.innerHTML += `<div></div>`;
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const div = document.createElement("div");
        div.classList.add("calendar-day");
        div.textContent = dia;
        div.onclick = () => {
            filtroDia = new Date(ano, mes, dia);
            document.querySelectorAll(".calendar-day").forEach(d => d.classList.remove("active"));
            div.classList.add("active");
            carregarRegistos();
        };
        grid.appendChild(div);
    }
    title.onclick = () => {
        filtroDia = null;
        document.querySelectorAll(".calendar-day").forEach(d => d.classList.remove("active"));
        carregarRegistos();
    };
    document.getElementById("prevMonth").onclick = () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        gerarCalendario(); carregarRegistos();
    };
    document.getElementById("nextMonth").onclick = () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        gerarCalendario(); carregarRegistos();
    };
}

// =======================================================
// REGISTOS DE PONTO
// =======================================================
// ═══════════════════════════════════════════════════════
// SUB-TABS REGISTOS
// ═══════════════════════════════════════════════════════
function switchRegTab(tab) {
    ["ponto","admin"].forEach(t => {
        const btn  = document.getElementById(`regTab-${t}`);
        const cont = document.getElementById(`regTabContent-${t}`);
        const active = t === tab;
        if (btn) {
            btn.style.background   = active ? "rgba(244,185,66,.15)" : "none";
            btn.style.color        = active ? "var(--primary)" : "var(--text-muted)";
            btn.style.borderBottom = active ? "2px solid var(--primary)" : "2px solid transparent";
        }
        if (cont) {
            cont.style.display    = active ? "block" : "none";
            cont.style.visibility = active ? "visible" : "hidden";
            cont.style.overflow   = "hidden";
        }
    });
    if (tab === "admin") {
        // Inicializar mês actual se não estiver definido
        const el = document.getElementById("raFiltroMes");
        if (el && !el.value) {
            const hoje = new Date();
            el.value = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}`;
        }
        carregarRegistosAdmin();
    }
}

// ═══════════════════════════════════════════════════════
// REGISTOS ADMIN — mapa por funcionário e por obra
// ═══════════════════════════════════════════════════════
let _raCache = [];

async function carregarRegistosAdmin() {
    const mesEl  = document.getElementById("raFiltroMes");
    const vista  = document.getElementById("raFiltroVista")?.value || "func";
    if (!mesEl?.value) return;

    const [ano, mes] = mesEl.value.split("-");
    const inicio = `${ano}-${mes}-01`;
    const fim    = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`;

    const raConteudo = document.getElementById("raConteudo");
    raConteudo.innerHTML = `<div style="padding:24px;text-align:center;opacity:.4">A carregar…</div>`;

    const { data, error } = await SB.from("registos_admin")
        .select("id, data, tipo, horas, obra_id, observacoes, funcionarios(id, nome, valor_dia), obras(id, nome)")
        .gte("data", inicio).lte("data", fim)
        .order("data").order("funcionarios(nome)");

    if (error) { raConteudo.innerHTML = `<div style="padding:24px;color:#f87171">Erro: ${error.message}</div>`; return; }
    _raCache = data || [];

    // KPIs
    const presMes   = _raCache.filter(r => r.tipo === "presenca");
    const faltasMes = _raCache.filter(r => r.tipo === "falta");
    const totalH    = presMes.reduce((s,r) => s + Number(r.horas||0), 0);
    const funcsUniq = new Set(presMes.map(r => r.funcionarios?.nome)).size;
    const obrasUniq = new Set(presMes.filter(r => r.obras?.nome).map(r => r.obras?.nome)).size;

    document.getElementById("raKpis").innerHTML = [
        { label:"Dias com registo", val: new Set(presMes.map(r=>r.data)).size, cor:"" },
        { label:"Total horas", val: totalH.toFixed(0)+"h", cor:"" },
        { label:"Faltas registadas", val: faltasMes.length, cor:"#f87171" },
        { label:"Obras activas", val: obrasUniq, cor:"" },
    ].map(k => `<div style="background:var(--bg-dark-panel,#2a2a2a);border-radius:10px;padding:14px 18px;border:1px solid rgba(255,255,255,.07)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.45;margin-bottom:4px">${k.label}</div>
        <div style="font-family:var(--font-title,sans-serif);font-size:22px;font-weight:500;color:${k.cor||"#fff"}">${k.val}</div>
    </div>`).join("");

    if (vista === "func") renderRaMapaFuncionario(ano, mes);
    else if (vista === "obra") renderRaMapaObra(ano, mes);
    else renderRaDetalhe();
}

function renderRaMapaFuncionario(ano, mes) {
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dias = Array.from({length: ultimoDia}, (_,i) => {
        const d = String(i+1).padStart(2,"0");
        return `${ano}-${String(mes).padStart(2,"0")}-${d}`;
    });

    // Agrupar por funcionário
    const porFunc = {};
    _raCache.forEach(r => {
        const nome = r.funcionarios?.nome || "—";
        if (!porFunc[nome]) porFunc[nome] = { vd: r.funcionarios?.valor_dia, dias: {}, totalH: 0, totalDias: 0 };
        porFunc[nome].dias[r.data] = { tipo: r.tipo, horas: Number(r.horas||0), obra: r.obras?.nome||"" };
        if (r.tipo === "presenca") {
            porFunc[nome].totalH += Number(r.horas||0);
            porFunc[nome].totalDias++;
        }
    });

    const funcs = Object.keys(porFunc).sort();
    const raConteudo = document.getElementById("raConteudo");

    let html = `<table style="border-collapse:collapse;font-size:12px;width:100%">
    <thead>
        <tr style="background:rgba(244,185,66,.1)">
            <th style="padding:8px 12px;text-align:left;position:sticky;left:0;background:var(--bg-dark-panel,#2a2a2a);z-index:2;min-width:140px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Funcionário</th>
            ${dias.map(d => {
                const dObj = new Date(d+"T12:00:00");
                const dow  = dObj.getDay();
                const isWE = dow===0||dow===6;
                return `<th style="padding:4px 2px;text-align:center;min-width:28px;font-size:10px;font-weight:500;${isWE?"opacity:.3":""}">${String(dObj.getDate()).padStart(2,"0")}</th>`;
            }).join("")}
            <th style="padding:8px 10px;text-align:right;min-width:60px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Dias</th>
            <th style="padding:8px 10px;text-align:right;min-width:60px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Horas</th>
            <th style="padding:8px 10px;text-align:right;min-width:70px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Valor €</th>
        </tr>
    </thead>
    <tbody>`;

    funcs.forEach((func, fi) => {
        const fd  = porFunc[func];
        const bg  = fi%2===1 ? "rgba(255,255,255,.02)" : "transparent";
        const vd  = fd.vd ? Number(fd.vd) : null;
        const val = vd ? (fd.totalDias * vd).toFixed(2)+"€" : "—";

        html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,.05)">
            <td style="padding:7px 12px;position:sticky;left:0;background:var(--bg-dark-panel,#2a2a2a);z-index:1;font-weight:500;white-space:nowrap;border-right:1px solid rgba(255,255,255,.07)">${func}</td>
            ${dias.map(d => {
                const dObj = new Date(d+"T12:00:00");
                const dow  = dObj.getDay();
                const isWE = dow===0||dow===6;
                const reg  = fd.dias[d];
                let bg2 = "transparent", sym = "", title = "";
                if (isWE) { bg2="rgba(255,255,255,.02)"; sym=""; }
                else if (!reg) { sym=""; }
                else if (reg.tipo === "falta") { bg2="rgba(248,113,113,.15)"; sym="✕"; title=reg.obra||"Falta"; }
                else if (reg.horas > 0) {
                    bg2="rgba(74,222,128,.15)"; sym=reg.horas<8?"½":"✓";
                    title = `${reg.obra||""} ${reg.horas}h`;
                }
                return `<td style="text-align:center;padding:3px 2px;background:${bg2};border:1px solid rgba(255,255,255,.04);font-size:11px" title="${title}">${sym}</td>`;
            }).join("")}
            <td style="padding:7px 10px;text-align:right;font-weight:600">${fd.totalDias}</td>
            <td style="padding:7px 10px;text-align:right">${fd.totalH.toFixed(1)}h</td>
            <td style="padding:7px 10px;text-align:right;color:#4ade80;font-weight:600">${val}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    raConteudo.innerHTML = html;
}

function renderRaMapaObra(ano, mes) {
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dias = Array.from({length: ultimoDia}, (_,i) => {
        const d = String(i+1).padStart(2,"0");
        return `${ano}-${String(mes).padStart(2,"0")}-${d}`;
    });

    // Agrupar por obra
    const porObra = {};
    _raCache.filter(r => r.tipo==="presenca" && r.obras?.nome).forEach(r => {
        const nome = r.obras.nome;
        const func = r.funcionarios?.nome || "—";
        if (!porObra[nome]) porObra[nome] = { dias: {}, totalH: 0, funcs: new Set() };
        if (!porObra[nome].dias[r.data]) porObra[nome].dias[r.data] = {};
        porObra[nome].dias[r.data][func] = (porObra[nome].dias[r.data][func]||0) + Number(r.horas||0);
        porObra[nome].totalH += Number(r.horas||0);
        porObra[nome].funcs.add(func);
    });

    const obras = Object.keys(porObra).sort();
    const raConteudo = document.getElementById("raConteudo");

    let html = `<table style="border-collapse:collapse;font-size:12px;width:100%">
    <thead>
        <tr style="background:rgba(244,185,66,.1)">
            <th style="padding:8px 12px;text-align:left;position:sticky;left:0;background:var(--bg-dark-panel,#2a2a2a);z-index:2;min-width:160px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Obra</th>
            ${dias.map(d => {
                const dObj = new Date(d+"T12:00:00");
                const dow  = dObj.getDay();
                const isWE = dow===0||dow===6;
                return `<th style="padding:4px 2px;text-align:center;min-width:28px;font-size:10px;font-weight:500;${isWE?"opacity:.3":""}">${String(dObj.getDate()).padStart(2,"0")}</th>`;
            }).join("")}
            <th style="padding:8px 10px;text-align:right;min-width:60px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Horas</th>
            <th style="padding:8px 10px;text-align:right;min-width:60px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Colabs.</th>
        </tr>
    </thead>
    <tbody>`;

    obras.forEach((obra, oi) => {
        const od  = porObra[obra];
        const bg  = oi%2===1 ? "rgba(255,255,255,.02)" : "transparent";

        html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,.05)">
            <td style="padding:7px 12px;position:sticky;left:0;background:var(--bg-dark-panel,#2a2a2a);z-index:1;font-weight:500;white-space:nowrap;border-right:1px solid rgba(255,255,255,.07)">${obra}</td>
            ${dias.map(d => {
                const dObj = new Date(d+"T12:00:00");
                const dow  = dObj.getDay();
                const isWE = dow===0||dow===6;
                const reg  = od.dias[d];
                let bg2 = "transparent", sym = "", title = "";
                if (isWE) { bg2="rgba(255,255,255,.02)"; }
                else if (reg) {
                    const nFunc = Object.keys(reg).length;
                    const totalH = Object.values(reg).reduce((s,v)=>s+v,0);
                    bg2 = `rgba(74,222,128,.${Math.min(10+nFunc*6,30)})`;
                    sym = nFunc.toString();
                    title = Object.entries(reg).map(([f,h])=>`${f}: ${h}h`).join(", ");
                }
                return `<td style="text-align:center;padding:3px 2px;background:${bg2};border:1px solid rgba(255,255,255,.04);font-size:11px;font-weight:${reg?"600":"400"}" title="${title}">${sym}</td>`;
            }).join("")}
            <td style="padding:7px 10px;text-align:right;font-weight:600">${od.totalH.toFixed(1)}h</td>
            <td style="padding:7px 10px;text-align:right;opacity:.7">${od.funcs.size}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    raConteudo.innerHTML = html;
}

function renderRaDetalhe() {
    const raConteudo = document.getElementById("raConteudo");
    const presencas = _raCache.filter(r => r.tipo === "presenca");
    const faltas    = _raCache.filter(r => r.tipo === "falta");

    let html = `<table style="border-collapse:collapse;font-size:13px;width:100%">
    <thead style="background:rgba(244,185,66,.1)">
        <tr>
            <th style="padding:8px 12px;text-align:left">Data</th>
            <th style="padding:8px 12px;text-align:left">Funcionário</th>
            <th style="padding:8px 12px;text-align:left">Obra</th>
            <th style="padding:8px 12px;text-align:center">Tipo</th>
            <th style="padding:8px 12px;text-align:right">Horas</th>
            <th style="padding:8px 12px;text-align:right">Valor</th>
        </tr>
    </thead><tbody>`;

    _raCache.forEach((r, i) => {
        const vd  = r.funcionarios?.valor_dia ? Number(r.funcionarios.valor_dia) : null;
        const val = (r.tipo==="presenca" && vd && r.horas) ? (Number(r.horas)/8*vd).toFixed(2)+"€" : "—";
        const bg  = i%2===1 ? "rgba(255,255,255,.02)" : "transparent";
        const dataFmt = r.data ? r.data.split("-").reverse().join("/") : "—";

        html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,.04)">
            <td style="padding:7px 12px;font-variant-numeric:tabular-nums">${dataFmt}</td>
            <td style="padding:7px 12px;font-weight:500">${r.funcionarios?.nome||"—"}</td>
            <td style="padding:7px 12px;opacity:.7">${r.obras?.nome||"—"}</td>
            <td style="padding:7px 12px;text-align:center">
                ${r.tipo==="presenca"
                    ? `<span style="background:rgba(74,222,128,.15);color:#4ade80;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">Presente</span>`
                    : `<span style="background:rgba(248,113,113,.15);color:#f87171;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">Falta</span>`}
            </td>
            <td style="padding:7px 12px;text-align:right">${r.tipo==="presenca"?Number(r.horas||0).toFixed(1)+"h":"—"}</td>
            <td style="padding:7px 12px;text-align:right;color:#4ade80">${val}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    raConteudo.innerHTML = html;
}

async function exportarRegistosAdminExcel() {
    if (!_raCache.length) { alert("Sem dados para exportar. Carrega primeiro."); return; }
    const mesEl = document.getElementById("raFiltroMes");
    const [ano, mes] = (mesEl?.value || "").split("-");
    const linhas = ["Data,Funcionário,Obra,Tipo,Horas,Valor/dia,Valor estimado"];
    _raCache.forEach(r => {
        const vd  = r.funcionarios?.valor_dia ? Number(r.funcionarios.valor_dia) : "";
        const val = (r.tipo==="presenca" && vd && r.horas) ? (Number(r.horas)/8*vd).toFixed(2) : "";
        linhas.push(`"${r.data}","${r.funcionarios?.nome||""}","${r.obras?.nome||""}","${r.tipo}","${r.horas||0}","${vd}","${val}"`);
    });
    const blob = new Blob(["\ufeff"+linhas.join("\n")], {type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registos_admin_${ano}_${mes}.csv`;
    a.click();
}

// =======================================================
function setVistaRegistos(v) {
    _vistaRegistos = v;
    const btnL = document.getElementById("btnVistaLista");
    const btnM = document.getElementById("btnVistaMapa");
    if (btnL) {
        btnL.style.background = v==="lista" ? "rgba(244,185,66,.15)" : "rgba(255,255,255,.06)";
        btnL.style.color      = v==="lista" ? "var(--primary)"        : "var(--text-muted)";
        btnL.style.borderColor= v==="lista" ? "rgba(244,185,66,.4)"  : "rgba(255,255,255,.1)";
    }
    if (btnM) {
        btnM.style.background = v==="mapa" ? "rgba(244,185,66,.15)" : "rgba(255,255,255,.06)";
        btnM.style.color      = v==="mapa" ? "var(--primary)"       : "var(--text-muted)";
        btnM.style.borderColor= v==="mapa" ? "rgba(244,185,66,.4)" : "rgba(255,255,255,.1)";
    }
    document.getElementById("vistaLista").style.display  = v==="lista" ? "block" : "none";
    document.getElementById("mapaPresencas").style.display = v==="mapa"  ? "block" : "none";
    if (v === "mapa") renderMapaPresencas();
}

let _todosRegistos = []; // cache para o mapa

async function carregarRegistos() {
    const table = document.getElementById("tabelaRegistos");
    let tbody = table.querySelector("tbody");
    if (!tbody) { tbody = document.createElement("tbody"); table.appendChild(tbody); }
    tbody.innerHTML = "";

    const ano       = currentDate.getFullYear();
    const mes       = currentDate.getMonth() + 1;
    const mesStr    = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();

    let query = SB.from("vw_registos_ponto").select("*")
        .gte("dia", `${ano}-${mesStr}-01`)
        .lte("dia", `${ano}-${mesStr}-${ultimoDia}`);
    if (filtroDia) query = query.eq("dia", filtroDia.toISOString().split("T")[0]);

    const { data, error } = await query.order("dia", { ascending: false });
    if (error) { alert("Erro: " + error.message); return; }

    _todosRegistos = data || [];

    // ---- KPIs Assiduidade ----
    if (!filtroDia) {
        // Dias úteis estimados (sem fins de semana)
        let diasUteis = 0;
        for (let d = 1; d <= ultimoDia; d++) {
            const dow = new Date(ano, mes-1, d).getDay();
            if (dow !== 0 && dow !== 6) diasUteis++;
        }
        const diasComRegisto = new Set((data||[]).map(r => r.dia)).size;
        const assid = diasUteis > 0 ? Math.round(diasComRegisto / diasUteis * 100) : 0;
        const incompletos = (data||[]).filter(r => r.estado === "Incompleto").length;

        // Calcular horas extras (registos com horas > 8)
        let totalExtras = 0;
        (data||[]).forEach(r => {
            if (!r.horas) return;
            let h = 0;
            if (typeof r.horas === "string" && r.horas.includes(":")) {
                const [hh,mm] = r.horas.split(":").map(Number); h = hh + mm/60;
            } else h = Number(r.horas) || 0;
            if (h > 8) totalExtras += (h - 8);
        });

        document.getElementById("kpiAssiduidade").textContent = assid + "%";
        document.getElementById("kpiAssiduidade").style.color = assid >= 80 ? "#5ad65a" : assid >= 60 ? "#f97316" : "#ff7a7a";
        document.getElementById("kpiDiasRegisto").textContent  = diasComRegisto + " / " + diasUteis;
        document.getElementById("kpiHorasExtras").textContent  = totalExtras.toFixed(1) + "h";
        document.getElementById("kpiIncompletos").textContent  = incompletos;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;opacity:.6">Sem registos neste período</td></tr>`;
        return;
    }

    const fmt = v => v ? new Date(v).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }) : "";

    data.forEach(r => {
        const tr = document.createElement("tr");
        const incompleto = r.estado === "Incompleto";

        // Highlight visual para registos incompletos
        if (incompleto) tr.style.borderLeft = "3px solid #ff7a7a";

        // Calcular horas extras (>8h) — destacar a laranja
        let horasNum = 0;
        if (r.horas && typeof r.horas === "string" && r.horas.includes(":")) {
            const [hh,mm] = r.horas.split(":").map(Number); horasNum = hh + mm/60;
        } else horasNum = Number(r.horas) || 0;
        const temExtras = horasNum > 8;
        const horasDisplay = r.horas || "–";

        tr.innerHTML = `
            <td>${r.funcionario}</td>
            <td>${r.obra}</td>
            <td>${r.dia}</td>
            <td contenteditable="true" class="editavel" data-id="${r.entrada_id || ""}" data-tipo="entrada">${fmt(r.entrada)}</td>
            <td contenteditable="true" class="editavel" data-id="${r.saida_id || ""}" data-tipo="saida">${fmt(r.saida)}</td>
            <td class="col-horas" style="${temExtras ? "color:#f97316;font-weight:700" : ""}">
                ${horasDisplay}${temExtras ? ` <span style="font-size:10px;background:rgba(249,115,22,.15);padding:1px 5px;border-radius:4px">+EXT</span>` : ""}
            </td>
            <td>${incompleto
                ? `<span class="estado-incompleto">Incompleto</span>`
                : `<span class="estado-ok">OK</span>`
            }</td>`;

        tr.querySelectorAll(".editavel").forEach(td => {
            td.addEventListener("blur", () => guardarEdicaoRegisto(tr, td));
        });

        tbody.appendChild(tr);
    });

    if (_vistaRegistos === "mapa") renderMapaPresencas();
}

// ---- Mapa de Presenças ----
function renderMapaPresencas() {
    const container = document.getElementById("mapaPresencas");
    if (!container) return;

    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth() + 1;
    const ultimoDia = new Date(ano, mes, 0).getDate();

    // Agrupar por funcionário e dia
    const porFunc = {};
    _todosRegistos.forEach(r => {
        if (!porFunc[r.funcionario]) porFunc[r.funcionario] = {};
        porFunc[r.funcionario][r.dia] = r.estado;
    });

    const dias = Array.from({length: ultimoDia}, (_,i) => {
        const d = `${ano}-${String(mes).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`;
        return d;
    });

    const funcs = Object.keys(porFunc).sort();
    if (funcs.length === 0) { container.innerHTML = `<p style="opacity:.4;text-align:center;padding:20px">Sem dados</p>`; return; }

    let html = `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px;width:100%">
        <thead><tr>
            <th style="padding:6px 10px;text-align:left;position:sticky;left:0;background:var(--bg-dark-panel,#2a2a2a);z-index:2;min-width:120px">Funcionário</th>
            ${dias.map(d => {
                const dObj = new Date(d + "T12:00:00");
                const dow = dObj.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const label = String(dObj.getDate()).padStart(2,"0");
                return `<th style="padding:4px 3px;text-align:center;min-width:24px;${isWeekend?"opacity:.35":""}">${label}</th>`;
            }).join("")}
        </tr></thead>
        <tbody>
        ${funcs.map(f => `
            <tr>
                <td style="padding:6px 10px;position:sticky;left:0;background:var(--bg-dark-panel,#2a2a2a);z-index:1;font-weight:500;white-space:nowrap">${f}</td>
                ${dias.map(d => {
                    const dObj = new Date(d + "T12:00:00");
                    const dow = dObj.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const estado = porFunc[f]?.[d];
                    let bg = "transparent", symbol = "";
                    if (isWeekend) { bg = "rgba(255,255,255,.03)"; symbol = ""; }
                    else if (estado === "OK") { bg = "rgba(90,214,90,.25)"; symbol = "✓"; }
                    else if (estado === "Incompleto") { bg = "rgba(249,115,22,.25)"; symbol = "⚠"; }
                    else { bg = "rgba(255,122,122,.12)"; symbol = "·"; }
                    return `<td style="text-align:center;padding:4px 2px;background:${bg};border:1px solid rgba(255,255,255,.05)">${symbol}</td>`;
                }).join("")}
            </tr>`).join("")}
        </tbody>
    </table></div>
    <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;opacity:.7">
        <span>✓ <span style="color:rgba(90,214,90,.8)">Presente</span></span>
        <span>⚠ <span style="color:rgba(249,115,22,.8)">Incompleto</span></span>
        <span>· Ausente</span>
    </div>`;

    container.innerHTML = html;
}

// ---- Exportar Excel do mês ----
function exportarPontoExcel() {
    if (!_todosRegistos.length) { alert("Sem dados para exportar"); return; }
    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth() + 1;
    const nomeFich = `ponto_${ano}_${String(mes).padStart(2,"0")}.csv`;
    const linhas = ["Funcionário,Obra,Dia,Entrada,Saída,Horas,Estado"];
    _todosRegistos.forEach(r => {
        const fmt = v => v ? new Date(v).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Lisbon"}) : "";
        linhas.push(`"${r.funcionario}","${r.obra}","${r.dia}","${fmt(r.entrada)}","${fmt(r.saida)}","${r.horas||""}","${r.estado}"`);
    });
    const blob = new Blob(["\ufeff" + linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = nomeFich; a.click();
    URL.revokeObjectURL(url);
}

// ---- Fechar mês (aprovação) ----
async function fecharMes() {
    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth() + 1;
    const label = `${String(mes).padStart(2,"0")}/${ano}`;
    if (!confirm(`Fechar o mês de ${label}?
Os registos completos serão marcados como aprovados.`)) return;
    // Por agora apenas informa — a coluna 'aprovado' pode ser adicionada futuramente
    alert(`✓ Mês ${label} fechado. Exporta o Excel para arquivo.`);
    exportarPontoExcel();
}

async function guardarEdicaoRegisto(tr, tdEditado) {
    const dia      = tr.children[2].textContent.trim();
    const tdEnt    = tr.children[3];
    const tdSai    = tr.children[4];
    const tdHoras  = tr.children[5];

    const entHora  = tdEnt.textContent.trim();
    const saiHora  = tdSai.textContent.trim();
    const entId    = tdEnt.dataset.id;
    const saiId    = tdSai.dataset.id;
    const tipo     = tdEditado.dataset.tipo;

    // Validar formato HH:MM
    const reHora = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const novaHora = tdEditado.textContent.trim();
    if (novaHora && !reHora.test(novaHora)) {
        tdEditado.style.color = "#ff7a7a";
        tdEditado.title = "Formato inválido — use HH:MM";
        return;
    }

    // Atualizar o registo correto na tabela ponto
    let erros = [];

    if (tipo === "entrada" && entId) {
        const novoTS = entHora ? `${dia}T${entHora}:00` : null;
        const { error } = await SB.from("ponto")
            .update({ created_at: novoTS })
            .eq("id", entId);
        if (error) erros.push("entrada: " + error.message);
    }

    if (tipo === "saida") {
        if (saiId) {
            // Actualizar saída existente
            const novoTS = saiHora ? `${dia}T${saiHora}:00` : null;
            const { error } = await SB.from("ponto")
                .update({ created_at: novoTS })
                .eq("id", saiId);
            if (error) erros.push("saída: " + error.message);
        } else if (saiHora && entId) {
            // Criar registo de saída que não existia (registo incompleto)
            // Primeiro buscar funcionario_id e obra_id da entrada
            const { data: entData } = await SB.from("ponto")
                .select("funcionario_id, obra_id")
                .eq("id", entId)
                .single();

            if (entData) {
                const { data: novo, error } = await SB.from("ponto")
                    .insert({
                        funcionario_id: entData.funcionario_id,
                        obra_id:        entData.obra_id,
                        tipo:           "saida",
                        created_at:     `${dia}T${saiHora}:00`,
                        datahora:       `${dia}T${saiHora}:00`,
                        latitude:       0,
                        longitude:      0
                    })
                    .select("id")
                    .single();
                if (error) erros.push("criar saída: " + error.message);
                else tdSai.dataset.id = novo.id;
            }
        }
    }

    if (erros.length > 0) {
        console.error(erros);
        tdEditado.style.color = "#ff7a7a";
        return;
    }

    // Recalcular horas no frontend
    if (entHora && saiHora && reHora.test(entHora) && reHora.test(saiHora)) {
        const [eh, em] = entHora.split(":").map(Number);
        const [sh, sm] = saiHora.split(":").map(Number);
        const totalMin = (sh * 60 + sm) - (eh * 60 + em);
        if (totalMin >= 0) {
            const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
            const mm = String(totalMin % 60).padStart(2, "0");
            tdHoras.textContent = `${hh}:${mm}`;
            // Actualizar estado visual
            const tdEstado = tr.children[6];
            const completo = totalMin > 0;
            tdEstado.innerHTML = completo
                ? `<span class="estado-ok">OK</span>`
                : `<span class="estado-incompleto">Incompleto</span>`;
            if (completo) tr.style.borderLeft = "";
        }
    }

    // Destacar células editadas — fica sempre amarelo
    tdEditado.classList.add("editado");
    tdEditado.style.cssText += "; background: rgba(244,185,66,0.25) !important; color: #f4b942 !important; outline: 2px solid rgba(244,185,66,0.4) !important; outline-offset: -2px !important;";
    tdEditado.title = "";
}

// =======================================================
// DASHBOARD
// =======================================================
function initDashboard() {
    // Popular seletor de anos (ano atual + 2 anteriores)
    const sel = document.getElementById("dashAno");
    if (sel && !sel.options.length) {
        const anoAtual = new Date().getFullYear();
        for (let a = anoAtual; a >= anoAtual - 2; a--) {
            sel.innerHTML += `<option value="${a}">${a}</option>`;
        }
    }
    carregarDashboard();
}

async function carregarDashboard() {
    const ano = parseInt(document.getElementById("dashAno")?.value) || new Date().getFullYear();
    const dataInicio = `${ano}-01-01`;
    const dataFim    = `${ano}-12-31`;

    // Carregar movimentos do ano
    const { data: movs } = await SB
        .from("movimentos_financeiros")
        .select("tipo, valor_total, data_documento, obra_id, obras(nome)")
        .gte("data_documento", dataInicio)
        .lte("data_documento", dataFim)
        .eq("ativo", true);

    // Carregar registos de ponto do ano (para horas por funcionário)
    const { data: registos } = await SB
        .from("vw_registos_ponto")
        .select("funcionario, horas, dia")
        .gte("dia", dataInicio)
        .lte("dia", dataFim);

    // Carregar obras ativas
    const { data: obras } = await SB.from("obras").select("id, nome");

    renderKpisDash(movs || []);
    renderChartLinhas(movs || [], ano);
    renderChartObras(movs || []);
    renderChartFuncionarios(registos || []);

    document.getElementById("dashObras").textContent = obras?.length || 0;
}

function renderKpisDash(movs) {
    const receita = movs.filter(m => m.tipo === "entrada").reduce((s, m) => s + Number(m.valor_total), 0);
    const despesa = movs.filter(m => m.tipo === "saida").reduce((s, m) => s + Number(m.valor_total), 0);
    const saldo   = receita - despesa;

    document.getElementById("dashReceita").textContent = receita.toFixed(2) + " €";
    document.getElementById("dashDespesa").textContent = despesa.toFixed(2) + " €";
    const saldoEl = document.getElementById("dashSaldo");
    saldoEl.textContent = saldo.toFixed(2) + " €";
    saldoEl.style.color = saldo >= 0 ? "#5ad65a" : "#ff7a7a";
}

function renderChartLinhas(movs, ano) {
    const meses     = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const entradas  = Array(12).fill(0);
    const saidas    = Array(12).fill(0);

    movs.forEach(m => {
        const mes = new Date(m.data_documento).getMonth();
        if (m.tipo === "entrada") entradas[mes] += Number(m.valor_total);
        else saidas[mes] += Number(m.valor_total);
    });

    const ctx = document.getElementById("chartLinhas");
    if (!ctx) return;
    if (chartLinhas) chartLinhas.destroy();

    chartLinhas = new Chart(ctx, {
        type: "line",
        data: {
            labels: meses,
            datasets: [
                {
                    label: "Entradas",
                    data: entradas,
                    borderColor: "#5ad65a",
                    backgroundColor: "rgba(90,214,90,.08)",
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3
                },
                {
                    label: "Saídas",
                    data: saidas,
                    borderColor: "#ff7a7a",
                    backgroundColor: "rgba(255,122,122,.08)",
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: "#aaa", font: { size: 12 } } },
                tooltip: { callbacks: { label: ctx => ctx.dataset.label + ": " + Number(ctx.raw).toFixed(2) + " €" } }
            },
            scales: {
                x: { ticks: { color: "#888", font: { size: 11 } }, grid: { color: "rgba(255,255,255,.05)" } },
                y: { ticks: { color: "#888", font: { size: 11 }, callback: v => v + " €" }, grid: { color: "rgba(255,255,255,.05)" } }
            }
        }
    });
}

function renderChartObras(movs) {
    // Agrupar saídas por obra
    const porObra = {};
    movs.filter(m => m.tipo === "saida" && m.obra_id).forEach(m => {
        const nome = m.obras?.nome || m.obra_id.substring(0, 8);
        porObra[nome] = (porObra[nome] || 0) + Number(m.valor_total);
    });

    const labels = Object.keys(porObra);
    const valores = Object.values(porObra);

    const cores = [
        "#f4b942","#5ad65a","#7b9cff","#ff7a7a","#c084fc",
        "#34d399","#fb923c","#60a5fa","#f472b6","#a3e635"
    ];

    const ctx = document.getElementById("chartObras");
    if (!ctx) return;
    if (chartObras) chartObras.destroy();

    if (labels.length === 0) {
        chartObras = new Chart(ctx, {
            type: "doughnut",
            data: { labels: ["Sem dados"], datasets: [{ data: [1], backgroundColor: ["rgba(255,255,255,.1)"] }] },
            options: { plugins: { legend: { display: false } } }
        });
        return;
    }

    chartObras = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: valores,
                backgroundColor: cores.slice(0, labels.length),
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: "right", labels: { color: "#aaa", font: { size: 11 }, padding: 12, boxWidth: 12 } },
                tooltip: { callbacks: { label: ctx => ctx.label + ": " + Number(ctx.raw).toFixed(2) + " €" } }
            }
        }
    });
}

function renderChartFuncionarios(registos) {
    // Agregar horas por funcionário
    const porFunc = {};
    registos.forEach(r => {
        if (!r.funcionario || !r.horas) return;
        // horas pode vir como "HH:MM" — converter para decimal
        let h = 0;
        if (typeof r.horas === "string" && r.horas.includes(":")) {
            const [hh, mm] = r.horas.split(":").map(Number);
            h = hh + mm / 60;
        } else {
            h = Number(r.horas) || 0;
        }
        porFunc[r.funcionario] = (porFunc[r.funcionario] || 0) + h;
    });

    // Ordenar por horas desc, top 8
    const sorted = Object.entries(porFunc)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    const labels = sorted.map(e => e[0]);
    const valores = sorted.map(e => parseFloat(e[1].toFixed(1)));

    const ctx = document.getElementById("chartFuncionarios");
    if (!ctx) return;
    if (chartFuncs) chartFuncs.destroy();

    if (labels.length === 0) {
        ctx.parentElement.innerHTML += `<p style="text-align:center;opacity:.5;font-size:13px">Sem dados de registos de ponto para este ano.</p>`;
        return;
    }

    chartFuncs = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Horas",
                data: valores,
                backgroundColor: "#f4b942",
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ctx.raw + "h" } }
            },
            scales: {
                x: { ticks: { color: "#888", font: { size: 11 }, callback: v => v + "h" }, grid: { color: "rgba(255,255,255,.05)" } },
                y: { ticks: { color: "#ccc", font: { size: 12 } }, grid: { display: false } }
            }
        }
    });
}

// =======================================================
// FUNCIONÁRIOS — CRUD COMPLETO
// =======================================================
async function initFuncionarios() {
    await carregarFuncionarios();
}

async function carregarFuncionarios() {
    const { data, error } = await SB
        .from("funcionarios")
        .select("*")
        .order("nome");

    const tbody = document.querySelector("#tabelaFuncionarios tbody");
    if (!tbody) return;

    if (error) {
        console.error("carregarArtigos error:", error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#ff7a7a">Erro: ${error.message}</td></tr>`;
        return;
    }

    // KPIs
    const total    = data?.length || 0;
    const ativos   = data?.filter(f => f.ativo !== false).length || 0;
    const inativos = total - ativos;
    document.getElementById("funcKpiTotal").textContent   = total;
    document.getElementById("funcKpiAtivos").textContent  = ativos;
    document.getElementById("funcKpiInativos").textContent = inativos;

    tbody.innerHTML = "";
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;opacity:.6">Sem funcionários. Clique + para adicionar.</td></tr>`;
        return;
    }

    data.forEach(f => {
        const ativo    = f.ativo !== false;
        const data_reg = f.created_at ? new Date(f.created_at).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—";
        const temDevice = !!f.device_id;

        const tr = document.createElement("tr");
        tr.style.opacity = ativo ? "1" : ".45";
        if (!temDevice) tr.style.borderLeft = "3px solid #f4b942";

        tr.innerHTML = `
            <td style="font-weight:500">
                ${f.nome || "—"}
                ${!temDevice ? '<span style="font-size:10px;color:#f4b942;margin-left:4px">⚠ sem QR</span>' : ""}
                ${f.tipo_contrato === 'temporario' ? '<span style="font-size:9px;font-weight:700;background:rgba(244,185,66,.15);color:#c8901e;padding:1px 6px;border-radius:8px;margin-left:4px">TEMP</span>' : ""}
            </td>
            <td style="font-size:12px;opacity:.7">${f.codigo || "—"}</td>
            <td>
                <span style="font-size:12px;opacity:.8">${f.categoria || "—"}</span>
            </td>
            <td>${f.valor_dia ? Number(f.valor_dia).toFixed(2) + " €" : "—"}</td>
            <td>
                <span class="badge-estado ${ativo ? "pago" : "por_pagar"}">${ativo ? "Ativo" : "Inativo"}</span>
            </td>
            <td class="acoes-td">
                <button class="btn-acao btn-hist-func" title="Histórico">📊</button>
                <button class="btn-acao btn-stock-func" title="${f.acesso_stock ? 'Revogar Stock' : 'Dar Stock'}" style="font-size:11px;color:${f.acesso_stock ? '#5ad65a' : '#888'}">📦</button>
                <button class="btn-acao btn-edit-func" title="Editar">✏️</button>
                <button class="btn-acao btn-toggle-func" title="${ativo ? "Desativar" : "Ativar"}">${ativo ? "🔴" : "🟢"}</button>
            </td>`;

        tr.querySelector(".btn-hist-func").onclick  = () => abrirHistoricoFuncionario(f);
        tr.querySelector(".btn-stock-func").onclick = () => toggleAcessoStock(f.id, f.nome, !!f.acesso_stock);
        tr.querySelector(".btn-edit-func").onclick  = () => abrirModalFuncionario(f);
        tr.querySelector(".btn-toggle-func").onclick= () => toggleAtivoFuncionario(f.id, f.nome, ativo);
        tbody.appendChild(tr);
    });
}

function abrirModalFuncionario(func = null) {
    funcEditId = func?.id || null;

    document.getElementById("modalFuncTitulo").textContent = func ? "Editar Funcionário" : "Novo Funcionário";
    document.getElementById("funcNome").value       = func?.nome || "";
    document.getElementById("funcCodigo").value     = func?.codigo || "";
    document.getElementById("funcValorDia").value   = func?.valor_dia || "";
    document.getElementById("funcAtivo").value      = func?.ativo === false ? "false" : "true";
    const tipoContEl = document.getElementById("funcTipoContrato");
    if (tipoContEl) tipoContEl.value = func?.tipo_contrato || "fixo";
    const setField = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
    setField("funcCategoria",  func?.categoria);
    setField("funcTelemovel",  func?.telemovel);
    setField("funcNif",        func?.nif);
    setField("funcIban",       func?.iban);

    // Info dispositivo — só em edição
    const deviceInfo = document.getElementById("funcDeviceInfo");
    const deviceIdEl = document.getElementById("funcDeviceId");
    if (func?.device_id) {
        deviceInfo.style.display = "block";
        deviceIdEl.textContent   = func.device_id;
    } else {
        deviceInfo.style.display = "none";
    }

    document.getElementById("modalFuncMsg").textContent = "";
    const _mf = document.getElementById("modalFuncionario");
    _mf.style.display = "";
    _mf.classList.remove("hidden");
}

function fecharModalFuncionario() {
    const m = document.getElementById("modalFuncionario");
    if (m) { m.style.display = "none"; m.classList.add("hidden"); }
    funcEditId = null;
}

async function guardarFuncionario() {
    const nome     = document.getElementById("funcNome").value.trim();
    const msg      = document.getElementById("modalFuncMsg");

    if (!nome) { msg.textContent = "O nome é obrigatório."; return; }

    const payload = {
        nome,
        codigo:    document.getElementById("funcCodigo").value.trim() || null,
        valor_dia: parseFloat(document.getElementById("funcValorDia").value) || null,
        ativo:     document.getElementById("funcAtivo").value === "true",
        tipo_contrato: document.getElementById("funcTipoContrato")?.value || "fixo",
        categoria: document.getElementById("funcCategoria")?.value || null,
        telemovel: document.getElementById("funcTelemovel")?.value.trim() || null,
        nif:       document.getElementById("funcNif")?.value.trim() || null,
        iban:      document.getElementById("funcIban")?.value.trim() || null,
    };

    if (funcEditId) {
        const { error } = await SB.from("funcionarios").update(payload).eq("id", funcEditId);
        if (error) { msg.textContent = "Erro: " + error.message; return; }
    } else {
        // Novo funcionário — device_id será atribuído quando o funcionário
        // fizer o cadastro no seu dispositivo via QR
        const { error } = await SB.from("funcionarios").insert({
            ...payload,
            device_id: crypto.randomUUID()  // placeholder — será substituído no cadastro
        });
        if (error) { msg.textContent = "Erro: " + error.message; return; }
    }

    fecharModalFuncionario();
    await carregarFuncionarios();
}

async function toggleAtivoFuncionario(id, nome, ativoAtual) {
    const acao = ativoAtual ? "desativar" : "ativar";
    if (!confirm(`${acao.charAt(0).toUpperCase() + acao.slice(1)} "${nome}"?`)) return;

    const { error } = await SB.from("funcionarios")
        .update({ ativo: !ativoAtual })
        .eq("id", id);

    if (error) { alert("Erro: " + error.message); return; }
    await carregarFuncionarios();
}


// =======================================================
// HISTÓRICO DE FUNCIONÁRIO
// =======================================================
async function abrirHistoricoFuncionario(func) {
    const hoje = new Date();
    const ano  = hoje.getFullYear();
    const inicio = `${ano}-01-01`;
    const fim    = `${ano}-12-31`;

    const [registosRes, movsRes] = await Promise.all([
        SB.from("vw_registos_ponto").select("funcionario, horas, dia, obra")
          .eq("funcionario_nome_match_placeholder", func.nome) // não existe — usamos filtro abaixo
          .gte("dia", inicio).lte("dia", fim),
        SB.from("movimentos_financeiros").select("valor_total, data_documento").eq("ativo", true)
    ]);

    // Buscar registos pelo nome (a view usa texto)
    const { data: registos } = await SB.from("vw_registos_ponto")
        .select("funcionario, horas, dia, obra")
        .ilike("funcionario", func.nome)
        .gte("dia", inicio).lte("dia", fim);

    const regs = registos || [];
    let totalH = 0, diasSet = new Set();
    regs.forEach(r => {
        let h = 0;
        if (r.horas && typeof r.horas === "string" && r.horas.includes(":")) {
            const [hh,mm] = r.horas.split(":").map(Number); h = hh+mm/60;
        } else h = Number(r.horas) || 0;
        totalH += h;
        if (r.dia) diasSet.add(r.dia);
    });
    const totalDias  = diasSet.size;
    const totalGanho = func.valor_dia ? totalDias * func.valor_dia : null;

    // Obras trabalhadas
    const obrasPorNome = {};
    regs.forEach(r => {
        if (!r.obra) return;
        obrasPorNome[r.obra] = (obrasPorNome[r.obra] || 0) + 1;
    });

    const modal = document.getElementById("modalHistFuncionario");
    if (!modal) {
        // criar modal dinamicamente
        const div = document.createElement("div");
        div.id = "modalHistFuncionario";
        div.style.cssText = "display:flex;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1100;align-items:center;justify-content:center";
        div.innerHTML = `<div id="modalHistFuncContent" style="background:var(--bg-dark-panel,#2a2a2a);border-radius:16px;padding:28px;width:100%;max-width:520px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.5)"></div>`;
        div.addEventListener("click", e => { if (e.target === div) div.remove(); });
        document.body.appendChild(div);
    }

    const content = document.getElementById("modalHistFuncContent");
    content.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <h3 style="font-family:var(--font-title,sans-serif);letter-spacing:.5px">${func.nome}</h3>
            <button onclick="document.getElementById('modalHistFuncionario').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;opacity:.5">×</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
            <div style="background:rgba(255,255,255,.05);border-radius:8px;padding:12px;text-align:center">
                <div style="font-size:11px;opacity:.5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Dias ${ano}</div>
                <div style="font-size:22px;font-weight:600">${totalDias}</div>
            </div>
            <div style="background:rgba(255,255,255,.05);border-radius:8px;padding:12px;text-align:center">
                <div style="font-size:11px;opacity:.5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Horas ${ano}</div>
                <div style="font-size:22px;font-weight:600">${totalH.toFixed(0)}h</div>
            </div>
            <div style="background:rgba(255,255,255,.05);border-radius:8px;padding:12px;text-align:center">
                <div style="font-size:11px;opacity:.5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Ganho est.</div>
                <div style="font-size:18px;font-weight:600;color:#f97316">${totalGanho != null ? totalGanho.toFixed(0)+"€" : "—"}</div>
            </div>
        </div>

        ${func.categoria || func.telemovel || func.nif || func.iban ? `
        <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px">
            ${func.categoria ? `<div style="margin-bottom:4px"><span style="opacity:.5">Categoria:</span> ${func.categoria}</div>` : ""}
            ${func.telemovel ? `<div style="margin-bottom:4px"><span style="opacity:.5">Telemóvel:</span> ${func.telemovel}</div>` : ""}
            ${func.nif       ? `<div style="margin-bottom:4px"><span style="opacity:.5">NIF:</span> ${func.nif}</div>` : ""}
            ${func.iban      ? `<div style="margin-bottom:4px"><span style="opacity:.5">IBAN:</span> <span style="font-family:monospace;font-size:11px">${func.iban}</span></div>` : ""}
        </div>` : ""}

        <div style="font-family:var(--font-title,sans-serif);font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:.5;margin-bottom:8px">Obras em ${ano}</div>
        ${Object.keys(obrasPorNome).length === 0 ? '<p style="opacity:.4;font-size:13px">Sem registos</p>' :
          Object.entries(obrasPorNome).sort((a,b)=>b[1]-a[1]).map(([obra, dias]) =>
            `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
                <span>${obra}</span>
                <span style="opacity:.6">${dias} dia(s)</span>
            </div>`
          ).join("")}

        <button onclick="exportarPDFFuncionario(${JSON.stringify(func).replace(/"/g,'&quot;')}, ${JSON.stringify(regs).replace(/"/g,'&quot;')})"
            style="margin-top:16px;width:100%;background:rgba(244,185,66,.12);border:1px solid rgba(244,185,66,.3);color:var(--primary,#f4b942);border-radius:8px;padding:10px;font-size:13px;cursor:pointer;font-weight:600">
            📄 Exportar PDF do Mês
        </button>`;

    document.getElementById("modalHistFuncionario").style.display = "flex";
}

// ---- Exportar PDF por funcionário ----
function exportarPDFFuncionario(func, registos) {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    const mesLabel = hoje.toLocaleString("pt-PT", { month:"long", year:"numeric" });

    const regsDoMes = registos.filter(r => {
        const d = r.dia || "";
        return d.startsWith(`${ano}-${String(mes).padStart(2,"0")}`);
    });

    let totalH = 0, totalDias = 0;
    regsDoMes.forEach(r => {
        let h = 0;
        if (r.horas && typeof r.horas === "string" && r.horas.includes(":")) {
            const [hh,mm] = r.horas.split(":").map(Number); h = hh+mm/60;
        } else h = Number(r.horas) || 0;
        totalH += h;
        totalDias++;
    });
    const totalGanho = func.valor_dia ? totalDias * func.valor_dia : null;

    const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8">
    <title>Ponto ${func.nome} — ${mesLabel}</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #222; padding: 32px; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .sub { color: #888; font-size: 13px; margin-bottom: 24px; }
        .kpis { display: flex; gap: 20px; margin-bottom: 24px; }
        .kpi { background: #f5f5f5; border-radius: 8px; padding: 12px 20px; text-align: center; }
        .kpi .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; }
        .kpi .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #f4b942; color: #1a1000; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
        td { padding: 7px 10px; border-bottom: 1px solid #eee; }
        tr:nth-child(even) td { background: #fafafa; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #aaa; text-align: center; }
    </style></head><body>
    <h1>${func.nome}</h1>
    <div class="sub">Registo de Ponto — ${mesLabel}${func.categoria ? " · " + func.categoria : ""}</div>
    <div class="kpis">
        <div class="kpi"><div class="label">Dias</div><div class="value">${totalDias}</div></div>
        <div class="kpi"><div class="label">Horas</div><div class="value">${totalH.toFixed(1)}h</div></div>
        ${func.valor_dia ? `<div class="kpi"><div class="label">Valor/dia</div><div class="value">${Number(func.valor_dia).toFixed(2)}€</div></div>` : ""}
        ${totalGanho != null ? `<div class="kpi"><div class="label">Total</div><div class="value" style="color:#c0392b">${totalGanho.toFixed(2)}€</div></div>` : ""}
    </div>
    <table>
        <thead><tr><th>Dia</th><th>Obra</th><th>Horas</th></tr></thead>
        <tbody>
            ${regsDoMes.sort((a,b)=>a.dia.localeCompare(b.dia)).map(r =>
                `<tr><td>${r.dia}</td><td>${r.obra||"—"}</td><td>${r.horas||"—"}</td></tr>`
            ).join("")}
        </tbody>
    </table>
    <div class="footer">Maia Solutions · Gerado em ${new Date().toLocaleDateString("pt-PT")}</div>
    <script>window.print();</script>
    </body></html>`;

    const win = window.open("", "_blank", "width=800,height=600");
    win.document.write(html);
    win.document.close();
}

async function toggleAcessoStock(id, nome, temAcesso) {
    const acao = temAcesso ? "revogar o acesso ao stock" : "dar acesso ao stock";
    if (!confirm(`${temAcesso ? "Revogar" : "Dar"} acesso ao stock a "${nome}"?`)) return;

    const { error } = await SB.from("funcionarios")
        .update({ acesso_stock: !temAcesso })
        .eq("id", id);

    if (error) { alert("Erro: " + error.message); return; }
    await carregarFuncionarios();
}

async function revogarDispositivoFuncionario() {
    if (!funcEditId) return;
    if (!confirm("Revogar o dispositivo deste funcionário?\nEle terá de fazer novo cadastro.")) return;

    const { error } = await SB.from("funcionarios")
        .update({ device_id: null })
        .eq("id", funcEditId);

    if (error) { alert("Erro: " + error.message); return; }

    document.getElementById("funcDeviceInfo").style.display = "none";
    document.getElementById("modalFuncMsg").textContent = "Dispositivo revogado. O funcionário terá de se registar novamente.";
    document.getElementById("modalFuncMsg").style.color = "#5ad65a";
    await carregarFuncionarios();
}

// =======================================================
// OBRAS — listagem, QR codes
// =======================================================
async function initObras() {
    await carregarObras();
}

async function carregarObras() {
    const { data, error } = await SB.from("obras").select("*").order("created_at", { ascending: false });
    const tbody = document.querySelector("#tabelaObras tbody");
    if (!tbody) return;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#ff7a7a">Erro: ${error.message}</td></tr>`;
        return;
    }

    // KPIs
    const total     = data?.length || 0;
    const ativas    = data?.filter(o => !o.estado || o.estado === "ativa").length || 0;
    const concluidas = data?.filter(o => o.estado === "concluida").length || 0;
    document.getElementById("obrasKpiTotal").textContent     = total;
    document.getElementById("obrasKpiAtivas").textContent    = ativas;
    document.getElementById("obrasKpiConcluidas").textContent = concluidas;

    tbody.innerHTML = "";
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;opacity:.6">Sem obras. Use "Gerar QR" para criar uma obra.</td></tr>`;
        return;
    }

    data.forEach(o => {
        const tr = document.createElement("tr");
        const estado = o.estado || "ativa";

        tr.innerHTML = `
            <td style="font-family:monospace;font-size:12px">${o.codigo || "—"}</td>
            <td style="font-weight:500">${o.nome || "—"}</td>
            <td style="font-size:12px;opacity:.7">${o.morada || "—"}</td>
            <td style="text-align:center">${o.raio || 120}</td>
            <td>
                <span class="badge-estado ${estado === "ativa" ? "pago" : "por_pagar"}">
                    ${estado.charAt(0).toUpperCase() + estado.slice(1)}
                </span>
            </td>
            <td>
                ${o.percentagem_conclusao != null ? `
                <div style="display:flex;align-items:center;gap:6px">
                    <div style="flex:1;background:rgba(255,255,255,.1);border-radius:4px;height:6px;overflow:hidden">
                        <div style="width:${Math.min(o.percentagem_conclusao,100)}%;height:100%;background:${o.percentagem_conclusao>=100?"#5ad65a":o.percentagem_conclusao>=75?"var(--primary)":"#a78bfa"};border-radius:4px"></div>
                    </div>
                    <span style="font-size:11px;opacity:.7;white-space:nowrap">${o.percentagem_conclusao}%</span>
                </div>
                ${o.data_conclusao_prevista ? `<div style="font-size:10px;opacity:.5;margin-top:2px;${new Date(o.data_conclusao_prevista) < new Date() && estado==="ativa" ? "color:#f97316;opacity:1;font-weight:600" : ""}">📅 ${o.data_conclusao_prevista}</div>` : ""}
                ` : "<span style='opacity:.3;font-size:11px'>—</span>"}
            </td>
            <td class="acoes-td" style="white-space:nowrap">
                <button class="btn-acao btn-painel-obra" title="Ver Painel">📊</button>
                <button class="btn-acao btn-editar-obra" title="Editar">✏️</button>
                <button class="btn-acao btn-qr-obra" title="Ver QR">🔲</button>
                <button class="btn-acao btn-estado-obra" title="${estado === "ativa" ? "Concluir" : "Reativar"}">${estado === "ativa" ? "✅" : "🔄"}</button>
                <button class="btn-acao btn-eliminar-obra" title="Eliminar" style="opacity:.5">🗑️</button>
            </td>`;

        // Usar classes em vez de querySelector composto — evita o bug
        tr.querySelector(".btn-painel-obra").onclick   = () => abrirPainelObra(o);
        tr.querySelector(".btn-editar-obra").onclick  = () => editarObra(o);
        tr.querySelector(".btn-qr-obra").onclick      = () => abrirModalQR(o);
        tr.querySelector(".btn-estado-obra").onclick  = () => toggleEstadoObra(o.id, o.nome, estado);
        tr.querySelector(".btn-eliminar-obra").onclick = () => eliminarObra(o.id, o.nome);
        tbody.appendChild(tr);
    });
}

function abrirModalQR(obra) {
    const url = `https://alcindomaia.github.io/marcacao-ponto/app.html?obra=${obra.id}`;
    document.getElementById("modalQRTitulo").textContent = obra.nome;
    document.getElementById("qrUrlAdmin").textContent    = url;

    const canvas = document.getElementById("qrCanvasAdmin");

    new QRious({
        element: canvas,
        size:    220,
        value:   url,
        level:   "H"
    });

    const dl = document.getElementById("qrDownloadAdmin");
    dl.href     = canvas.toDataURL("image/png");
    dl.download = "QR_" + obra.nome.replace(/\s+/g, "_") + ".png";

    document.getElementById("modalQR").classList.remove("hidden");
}

function fecharModalQR() {
    document.getElementById("modalQR").classList.add("hidden");
}

// ═══════════════════════════════════════════════════════
// MODAL OBRA — tabs Detalhes + Serviços
// ═══════════════════════════════════════════════════════
function switchObraTab(tab) {
    ["detalhes","servicos"].forEach(t => {
        const btn  = document.getElementById(`obraTab-${t}`);
        const cont = document.getElementById(`obraTabContent-${t}`);
        const active = t === tab;
        if (btn) {
            btn.style.background   = active ? "rgba(244,185,66,.15)" : "none";
            btn.style.color        = active ? "var(--primary,#f4b942)" : "rgba(255,255,255,.5)";
            btn.style.borderBottom = active ? "2px solid var(--primary,#f4b942)" : "2px solid transparent";
        }
        if (cont) cont.style.display = active ? "block" : "none";
    });
    if (tab === "servicos") carregarServicosModal();
}


// =======================================================
// OBRAS — guardarObra
// =======================================================
async function guardarObra() {
    const id     = document.getElementById("editObraId")?.value;
    const nome   = document.getElementById("editObraNome")?.value?.trim();
    const codigo = document.getElementById("editObraCodigo")?.value?.trim();
    const end    = document.getElementById("editObraEndereco")?.value?.trim();
    const estado = document.getElementById("editObraEstado")?.value || "ativa";
    const raio   = parseInt(document.getElementById("editObraRaio")?.value) || 120;

    if (!nome) { alert("O nome da obra é obrigatório."); return; }

    const payload = { nome, estado, raio };
    if (codigo) payload.codigo = codigo;
    if (end)    payload.endereco = end;

    let err;
    if (id) {
        const { error } = await SB.from("obras").update(payload).eq("id", id);
        err = error;
    } else {
        const { error } = await SB.from("obras").insert(payload);
        err = error;
    }

    if (err) { alert("Erro: " + err.message); return; }
    document.getElementById("modalEditarObra").style.display = "none";
    await carregarObras();
}

async function editarObra(obra) {
    if (!obra) {
        document.getElementById("editObraId").value      = "";
        document.getElementById("editObraNome").value    = "";
        document.getElementById("editObraMorada").value  = "";
        document.getElementById("editObraRaio").value    = "";
        document.getElementById("editObraPercent").value = "";
        document.getElementById("editObraData").value    = "";
        document.getElementById("editObraTitulo").textContent = "✏️ Nova Obra";
        switchObraTab("detalhes");
        const _mo = document.getElementById("modalEditarObra"); _mo.style.display = "flex"; _mo.classList.remove("hidden");
        return;
    }
    document.getElementById("editObraId").value      = obra.id;
    document.getElementById("editObraNome").value    = obra.nome || "";
    document.getElementById("editObraMorada").value  = obra.morada || "";
    document.getElementById("editObraRaio").value    = obra.raio || "";
    document.getElementById("editObraPercent").value = obra.percentagem_conclusao ?? "";
    document.getElementById("editObraData").value    = obra.data_conclusao_prevista || "";
    document.getElementById("editObraTitulo").textContent = `✏️ ${obra.nome || "Editar Obra"}`;
    switchObraTab("detalhes");
    document.getElementById("modalEditarObra").style.display = "flex";
}

async function guardarEditObra() {
    const id   = document.getElementById("editObraId").value;
    const nome = document.getElementById("editObraNome").value.trim();
    if (!nome) { alert("Nome obrigatório"); return; }
    const payload = {
        nome,
        morada:                  document.getElementById("editObraMorada").value.trim() || null,
        raio:                    parseInt(document.getElementById("editObraRaio").value) || 120,
        percentagem_conclusao:   parseInt(document.getElementById("editObraPercent").value) || null,
        data_conclusao_prevista: document.getElementById("editObraData").value || null,
    };
    if (id) {
        const { error } = await SB.from("obras").update(payload).eq("id", id);
        if (error) { alert("Erro: " + error.message); return; }
    } else {
        const { error } = await SB.from("obras").insert(payload);
        if (error) { alert("Erro: " + error.message); return; }
    }
    document.getElementById("modalEditarObra").style.display = "none";
    await carregarObras();
}

// ═══════════════════════════════════════════════════════
// SERVIÇOS DA OBRA
// ═══════════════════════════════════════════════════════
async function carregarServicosModal() {
    const obraId = document.getElementById("editObraId").value;
    if (!obraId) {
        document.getElementById("listaServicos").innerHTML =
            `<div style="opacity:.4;font-size:13px;text-align:center;padding:16px">Guarda a obra primeiro para adicionar serviços.</div>`;
        return;
    }
    const { data } = await SB.from("obra_servicos")
        .select("*").eq("obra_id", obraId).order("ordem").order("created_at");

    // Buscar horas e materiais em paralelo
    const ids = (data||[]).map(s=>s.id);
    const [regRes, movRes] = ids.length ? await Promise.all([
        SB.from("registo_servicos").select("obra_servico_id, horas").in("obra_servico_id", ids),
        SB.from("movimento_servicos").select("obra_servico_id, valor").in("obra_servico_id", ids),
    ]) : [{data:[]},{data:[]}];

    const horasP = {}, matP = {};
    (regRes.data||[]).forEach(r => horasP[r.obra_servico_id] = (horasP[r.obra_servico_id]||0)+Number(r.horas||0));
    (movRes.data||[]).forEach(r => matP[r.obra_servico_id]   = (matP[r.obra_servico_id]||0)+Number(r.valor||0));

    const lista = document.getElementById("listaServicos");
    if (!data?.length) {
        lista.innerHTML = `<div style="opacity:.4;font-size:13px;text-align:center;padding:16px">Sem serviços. Adicione o primeiro acima.</div>`;
        return;
    }
    lista.innerHTML = data.map(s => {
        const hR  = horasP[s.id]||0;
        const mR  = matP[s.id]||0;
        const pct = s.horas_orcamento > 0 ? Math.min(Math.round(hR/s.horas_orcamento*100),100) : null;
        const barCol = s.concluido ? "#4ade80" : pct>=75 ? "#fb923c" : "var(--primary,#f4b942)";
        return `<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:10px;border:1px solid ${s.concluido?"rgba(74,222,128,.2)":"rgba(255,255,255,.06)"}">
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                    <span style="font-size:13px;font-weight:600">${s.nome}</span>
                    ${s.extra?`<span style="font-size:10px;background:rgba(251,146,60,.15);color:#fb923c;padding:1px 6px;border-radius:10px">Extra</span>`:""}
                    ${s.concluido?`<span style="font-size:10px;background:rgba(74,222,128,.15);color:#4ade80;padding:1px 6px;border-radius:10px">✓ Concluído</span>`:""}
                </div>
                <div style="display:flex;gap:14px;font-size:11px;opacity:.6">
                    <span>🕐 ${hR.toFixed(1)}h${s.horas_orcamento?` / ${s.horas_orcamento}h`:""}</span>
                    <span>💶 ${mR.toFixed(0)}€ mat${s.valor_orcamento?` / ${s.valor_orcamento}€`:""}</span>
                </div>
                ${pct!==null?`<div style="margin-top:6px;background:rgba(255,255,255,.1);border-radius:3px;height:3px"><div style="width:${pct}%;height:100%;background:${barCol};border-radius:3px"></div></div>`:""}
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0">
                <button onclick="toggleServicoConcluido('${s.id}',${s.concluido})" style="background:${s.concluido?"rgba(74,222,128,.15)":"rgba(255,255,255,.07)"};border:none;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:13px" title="${s.concluido?"Reabrir":"Concluir"}">${s.concluido?"↩":"✓"}</button>
                <button onclick="eliminarServico('${s.id}','${s.nome.replace(/'/g,"")}')" style="background:rgba(248,113,113,.1);border:none;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:13px;opacity:.6">🗑</button>
            </div>
        </div>`;
    }).join("");
}

async function adicionarServico() {
    const obraId = document.getElementById("editObraId").value;
    if (!obraId) { alert("Guarda a obra primeiro."); return; }
    const nome = document.getElementById("novoServNome").value.trim();
    if (!nome) { alert("Nome do serviço obrigatório."); return; }
    const horas = parseFloat(document.getElementById("novoServHoras").value) || null;
    const valor = parseFloat(document.getElementById("novoServValor").value) || null;
    const extra = document.getElementById("novoServExtra").checked;
    const { error } = await SB.from("obra_servicos").insert({ obra_id: obraId, nome, horas_orcamento: horas, valor_orcamento: valor, extra });
    if (error) { alert("Erro: " + error.message); return; }
    document.getElementById("novoServNome").value  = "";
    document.getElementById("novoServHoras").value = "";
    document.getElementById("novoServValor").value = "";
    document.getElementById("novoServExtra").checked = false;
    await carregarServicosModal();
}

async function toggleServicoConcluido(id, concluido) {
    await SB.from("obra_servicos").update({ concluido: !concluido }).eq("id", id);
    await carregarServicosModal();
}

async function eliminarServico(id, nome) {
    if (!confirm(`Eliminar serviço "${nome}"?\nAs imputações associadas também serão removidas.`)) return;
    await SB.from("obra_servicos").delete().eq("id", id);
    await carregarServicosModal();
}

// ═══════════════════════════════════════════════════════
// PAINEL DE OBRA — orçamentado vs real
// ═══════════════════════════════════════════════════════
async function abrirPainelObra(obra) {
    const modal = document.getElementById("modalPainelObra");
    document.getElementById("painelObraNome").textContent = obra.nome;

    // Meta: data prevista + estado
    const metaEl = document.getElementById("painelObraMeta");
    const estadoBadge = obra.estado === "concluida"
        ? `<span style="background:rgba(74,222,128,.15);color:#4ade80;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">✓ Concluída</span>`
        : `<span style="background:rgba(244,185,66,.12);color:var(--primary,#f4b942);padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">Em curso</span>`;
    metaEl.innerHTML = `${estadoBadge}${obra.data_conclusao_prevista
        ? `<span style="color:rgba(255,255,255,.35)">📅 ${obra.data_conclusao_prevista}</span>` : ""}`;

    // Estado vazio enquanto carrega
    document.getElementById("painelObraKpis").innerHTML = "";
    document.getElementById("painelServicosTbody").innerHTML =
        `<div style="padding:40px;text-align:center;color:rgba(255,255,255,.25);font-size:13px">A carregar…</div>`;
    modal.style.display = "flex";

    const { data: servicos } = await SB.from("obra_servicos").select("*").eq("obra_id", obra.id).order("ordem").order("created_at");
    const ids = (servicos||[]).map(s=>s.id);

    if (!ids.length) {
        // Estado vazio elegante
        document.getElementById("painelObraKpis").innerHTML = "";
        document.getElementById("painelServicosTbody").innerHTML = `
            <div style="padding:48px 24px;text-align:center">
                <div style="font-size:36px;margin-bottom:12px;opacity:.3">📋</div>
                <div style="font-family:var(--font-title,'Oswald',sans-serif);font-size:14px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px">Sem serviços definidos</div>
                <div style="font-size:12px;color:rgba(255,255,255,.2)">Edita a obra e vai ao separador Serviços para começar</div>
            </div>`;
        return;
    }

    // Buscar horas imputadas por serviço
    const { data: regServs } = await SB.from("registo_servicos")
        .select("obra_servico_id, horas, registo_id")
        .in("obra_servico_id", ids);

    // Buscar valor_dia via registos_admin
    const registoIds = [...new Set((regServs||[]).map(r=>r.registo_id).filter(Boolean))];
    let valorDiaPorRegisto = {};
    if (registoIds.length) {
        const { data: regsAdmin } = await SB.from("registos_admin")
            .select("id, funcionarios(valor_dia)")
            .in("id", registoIds);
        (regsAdmin||[]).forEach(r => { valorDiaPorRegisto[r.id] = r.funcionarios?.valor_dia || 0; });
    }

    // Buscar materiais
    const { data: movServs } = await SB.from("movimento_servicos")
        .select("obra_servico_id, valor")
        .in("obra_servico_id", ids);

    const horasP = {}, moP = {}, matP = {};
    (regServs||[]).forEach(r => {
        const sid = r.obra_servico_id;
        const h   = Number(r.horas||0);
        horasP[sid] = (horasP[sid]||0) + h;
        const vd = valorDiaPorRegisto[r.registo_id] || 0;
        if (vd) moP[sid] = (moP[sid]||0) + h * (vd/8);
    });
    (movServs||[]).forEach(r => { matP[r.obra_servico_id] = (matP[r.obra_servico_id]||0)+Number(r.valor||0); });

    const totHOrç  = (servicos||[]).reduce((s,v)=>s+(v.horas_orcamento||0),0);
    const totHReal = Object.values(horasP).reduce((s,v)=>s+v,0);
    const totVOrç  = (servicos||[]).reduce((s,v)=>s+(v.valor_orcamento||0),0);
    const totMO    = Object.values(moP).reduce((s,v)=>s+v,0);
    const totMat   = Object.values(matP).reduce((s,v)=>s+v,0);
    const totReal  = totMO + totMat;
    const totDesvio = totVOrç > 0 ? totReal - totVOrç : null;
    const concluidosCount = (servicos||[]).filter(s=>s.concluido).length;

    // KPIs redesenhados
    const kpis = [
        {
            label: "Horas Orçadas",
            val: totHOrç > 0 ? totHOrç.toFixed(0)+"h" : "—",
            sub: totHReal > 0 ? `${totHReal.toFixed(1)}h realizadas` : "Sem registos",
            cor: totHReal > totHOrç && totHOrç > 0 ? "#fb923c" : totHReal > 0 ? "#4ade80" : "rgba(255,255,255,.6)",
            accent: "#f4b942"
        },
        {
            label: "Custo Mão de Obra",
            val: totMO > 0 ? totMO.toFixed(0)+"€" : "—",
            sub: totMat > 0 ? `+${totMat.toFixed(0)}€ material` : "Sem material",
            cor: "#f87171",
            accent: "#f87171"
        },
        {
            label: "Orçamento Total",
            val: totVOrç > 0 ? totVOrç.toFixed(0)+"€" : "—",
            sub: totDesvio !== null ? (totDesvio > 0 ? `▲ +${totDesvio.toFixed(0)}€ desvio` : `▼ ${totDesvio.toFixed(0)}€ dentro`) : "Sem orçamento",
            cor: totDesvio > 0 ? "#f87171" : "#4ade80",
            accent: "#a78bfa"
        },
        {
            label: "Serviços",
            val: `${concluidosCount}/${(servicos||[]).length}`,
            sub: "concluídos",
            cor: concluidosCount === (servicos||[]).length ? "#4ade80" : "rgba(255,255,255,.7)",
            accent: "#4ade80"
        },
    ];

    document.getElementById("painelObraKpis").innerHTML = kpis.map((k,i) => `
        <div class="painel-kpi" style="border-top:3px solid ${k.accent}">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-val" style="color:${k.cor}">${k.val}</div>
            <div class="kpi-sub">${k.sub}</div>
        </div>`).join("");

    // Progresso geral
    const progEl = document.getElementById("painelObraProgresso");
    if (progEl) {
        const pctGeral = totHOrç > 0 ? Math.min(Math.round(totHReal/totHOrç*100),100) : null;
        progEl.innerHTML = pctGeral !== null
            ? `<span style="color:rgba(255,255,255,.5)">Progresso geral:</span> <span style="color:var(--primary,#f4b942);font-weight:600">${pctGeral}%</span>`
            : "";
    }

    // Linhas de serviços
    const tbody = document.getElementById("painelServicosTbody");
    tbody.innerHTML = (servicos||[]).map(s => {
        const hR    = horasP[s.id]||0;
        const moR   = moP[s.id]||0;
        const matR  = matP[s.id]||0;
        const totR  = moR + matR;
        const desvio= s.valor_orcamento ? totR - s.valor_orcamento : null;
        const pct   = s.horas_orcamento > 0 ? Math.round(hR/s.horas_orcamento*100) : null;
        const barCol= s.concluido ? "#4ade80" : pct>=100 ? "#f87171" : pct>=75 ? "#fb923c" : "var(--primary,#f4b942)";

        const estadoBadge = s.concluido
            ? `<span style="background:rgba(74,222,128,.15);color:#4ade80;padding:2px 9px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap">✓ Feito</span>`
            : `<span style="background:rgba(255,255,255,.07);color:rgba(255,255,255,.4);padding:2px 9px;border-radius:10px;font-size:10px;white-space:nowrap">Em curso</span>`;

        const extraBadge = s.extra
            ? `<span style="background:rgba(251,146,60,.15);color:#fb923c;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:600;margin-left:4px">Extra</span>`
            : "";

        return `<div class="serv-row">
            <div>
                <div style="font-weight:500;font-size:13px;display:flex;align-items:center;flex-wrap:wrap;gap:4px">
                    ${s.nome}${extraBadge}
                </div>
                ${pct !== null ? `
                <div style="display:flex;align-items:center;gap:6px;margin-top:5px">
                    <div style="flex:1;max-width:100px;background:rgba(255,255,255,.08);border-radius:3px;height:3px">
                        <div style="width:${Math.min(pct,100)}%;height:100%;background:${barCol};border-radius:3px"></div>
                    </div>
                    <span style="font-size:10px;color:rgba(255,255,255,.35)">${pct}%</span>
                </div>` : ""}
            </div>
            <div style="color:rgba(255,255,255,.45);font-size:12px">${s.horas_orcamento ? s.horas_orcamento+"h" : "—"}</div>
            <div style="color:${hR>(s.horas_orcamento||9999)?"#fb923c":"rgba(255,255,255,.85)"};font-size:13px">${hR>0?hR.toFixed(1)+"h":"—"}</div>
            <div style="color:#f87171;font-size:13px">${moR>0?moR.toFixed(0)+"€":"—"}</div>
            <div style="color:#f87171;font-size:13px">${matR>0?matR.toFixed(0)+"€":"—"}</div>
            <div style="color:rgba(255,255,255,.45);font-size:12px">${s.valor_orcamento?s.valor_orcamento.toFixed(0)+"€":"—"}</div>
            <div style="font-weight:600;font-size:13px;color:${desvio===null?"rgba(255,255,255,.3)":desvio>0?"#f87171":"#4ade80"}">
                ${desvio===null?"—":(desvio>0?"+":"")+desvio.toFixed(0)+"€"}
            </div>
            <div style="text-align:center">${estadoBadge}</div>
        </div>`;
    }).join("");
}

async function toggleEstadoObra(id, nome, estadoAtual) {
    const novoEstado = estadoAtual === "ativa" ? "concluida" : "ativa";
    const acao = novoEstado === "concluida" ? "Concluir" : "Reativar";
    if (!confirm(`${acao} a obra "${nome}"?`)) return;

    const { error } = await SB.from("obras")
        .update({ estado: novoEstado })
        .eq("id", id);
    if (error) { alert("Erro ao actualizar estado: " + error.message); return; }
    await carregarObras();
}

async function eliminarObra(id, nome) {
    // Verificar se tem dados associados antes de eliminar
    const [{ count: nMovs }, { count: nPonto }, { count: nMovStock }] = await Promise.all([
        SB.from("movimentos_financeiros").select("id", { count: "exact", head: true }).eq("obra_id", id),
        SB.from("ponto").select("id", { count: "exact", head: true }).eq("obra_id", id),
        SB.from("movimentos_stock").select("id", { count: "exact", head: true })
            .or(`obra_origem_id.eq.${id},obra_destino_id.eq.${id}`)
    ]);

    const total = (nMovs || 0) + (nPonto || 0) + (nMovStock || 0);

    let aviso = `Eliminar a obra "${nome}"?`;
    if (total > 0) {
        aviso = `⚠️ A obra "${nome}" tem dados associados:\n`;
        if (nMovs)     aviso += `• ${nMovs} movimento(s) financeiro(s)\n`;
        if (nPonto)    aviso += `• ${nPonto} registo(s) de ponto\n`;
        if (nMovStock) aviso += `• ${nMovStock} movimento(s) de stock\n`;
        aviso += `\nEliminar a obra NÃO apaga esses registos — ficam sem obra associada.\nContinuar?`;
    }

    if (!confirm(aviso)) return;

    const { error } = await SB.from("obras").delete().eq("id", id);
    if (error) { alert("Erro ao eliminar: " + error.message); return; }
    await carregarObras();
}


// =======================================================
// SCANNER QR DE FATURAS PORTUGUESAS
// =======================================================
let qrStream    = null;
let qrAnimFrame = null;
let qrTorchOn   = false;

async function iniciarScanQR() {
    const wrap   = document.getElementById("qrReaderWrap");
    const video  = document.getElementById("qrVideo");
    const status = document.getElementById("qrStatusText");
    wrap.style.display = "flex";

    // Bloquear scroll do body enquanto scanner está aberto
    document.body.style.overflow = "hidden";

    try {
        // Pedir resolução alta e câmara traseira com foco contínuo
        const constraints = {
            video: {
                facingMode:  { ideal: "environment" },
                width:       { ideal: 1920, min: 640 },
                height:      { ideal: 1080, min: 480 },
                focusMode:   { ideal: "continuous" },
                advanced: [{ focusMode: "continuous" }]
            }
        };

        qrStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = qrStream;
        await video.play();

        // Aplicar foco contínuo via applyConstraints (para suporte mais alargado)
        const track = qrStream.getVideoTracks()[0];
        if (track?.getCapabilities) {
            const caps = track.getCapabilities();
            // Foco contínuo se suportado
            if (caps.focusMode?.includes("continuous")) {
                try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch(_) {}
            }
            // Mostrar botão da lanterna se suportado
            if (caps.torch) {
                document.getElementById("btnTorch").style.display = "inline-flex";
            }
        }

        if (status) status.textContent = "Aponte o QR Code da fatura para a moldura";
        qrAnimFrame = requestAnimationFrame(scanFrame);

    } catch(e) {
        if (status) status.textContent = "Câmara não disponível. Use 'Introduzir manual'.";
        console.warn("Câmara:", e);
    }
}

function scanFrame() {
    const video  = document.getElementById("qrVideo");
    const canvas = document.getElementById("qrCanvas");
    if (!video || video.readyState < video.HAVE_ENOUGH_DATA) {
        qrAnimFrame = requestAnimationFrame(scanFrame);
        return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { qrAnimFrame = requestAnimationFrame(scanFrame); return; }

    // Calcular a zona central correspondente à moldura (260×260 no ecrã)
    // A moldura ocupa aprox 260/min(screenW,screenH) da imagem
    const screenMin = Math.min(window.innerWidth, window.innerHeight);
    const ratio     = Math.min(vw, vh) / screenMin;
    const cropSize  = Math.round(260 * ratio * 1.1); // +10% margem
    const cropX     = Math.round((vw - cropSize) / 2);
    const cropY     = Math.round((vh - cropSize) / 2);

    // Só recortar a zona da moldura (melhora velocidade e precisão em QR pequenos)
    canvas.width  = cropSize;
    canvas.height = cropSize;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize);

    const imgData = ctx.getImageData(0, 0, cropSize, cropSize);
    const code    = jsQR(imgData.data, cropSize, cropSize, {
        inversionAttempts: "attemptBoth"  // tenta QR normal e invertido
    });

    if (code) {
        // Flash verde na moldura para feedback visual
        const moldura = document.getElementById("qrMoldura");
        if (moldura) {
            moldura.style.transition = "opacity .15s";
            moldura.style.opacity    = "0";
            setTimeout(() => { if(moldura) moldura.style.opacity="1"; }, 150);
        }
        parsearQRFatura(code.data);
        fecharScanQR();
        return;
    }
    qrAnimFrame = requestAnimationFrame(scanFrame);
}

function fecharScanQR() {
    if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
    if (qrAnimFrame) { cancelAnimationFrame(qrAnimFrame); qrAnimFrame = null; }
    qrTorchOn = false;
    document.body.style.overflow = "";
    const wrap = document.getElementById("qrReaderWrap");
    if (wrap) wrap.style.display = "none";
}

async function toggleTorch() {
    if (!qrStream) return;
    const track = qrStream.getVideoTracks()[0];
    if (!track) return;
    qrTorchOn = !qrTorchOn;
    try {
        await track.applyConstraints({ advanced: [{ torch: qrTorchOn }] });
        const btn = document.getElementById("btnTorch");
        if (btn) btn.style.background = qrTorchOn
            ? "rgba(244,185,66,.4)"
            : "rgba(255,255,255,.15)";
    } catch(e) { console.warn("Torch:", e); }
}

function colarQRManual() {
    fecharScanQR();
    const texto = prompt("Cole aqui o conteúdo do QR Code da fatura:");
    if (texto?.trim()) parsearQRFatura(texto.trim());
}

function parsearQRFatura(texto) {
    // ── Parser AT (Autoridade Tributária) ─────────────────
    // Formato: A:NIF_emit*B:NIF_adq*C:país*D:tipo*E:estado
    //          *F:YYYYMMDD*G:referência*H:ATCUD
    //          *I1:país_taxa*I7:base*I8:iva_valor
    //          *N:total_iva*O:total_doc*Q:hash*R:cert

    const isFormatoAT = texto.includes('*') && texto.includes(':') &&
                        (texto.includes('*A:') || texto.startsWith('A:'));

    if (!isFormatoAT) {
        // Formato não reconhecido — colocar no campo referência
        const refEl = document.getElementById("movReferencia");
        if (refEl) { refEl.value = texto.substring(0, 100); refEl.focus(); }
        mostrarFeedbackQR("⚠️ Formato não AT — texto colocado na referência", "warn");
        return;
    }

    try {
        const c = {};
        texto.split("*").forEach(par => {
            const sep = par.indexOf(":");
            if (sep > 0) c[par.substring(0, sep)] = par.substring(sep + 1);
        });

        // ── Referência (G = número doc, H = ATCUD) ──
        const ref = (c["G"] || "").trim();
        const atcud = (c["H"] || "").trim();
        if (ref) {
            document.getElementById("movReferencia").value = ref.substring(0, 80);
        }

        // ── Data (F = YYYYMMDD → YYYY-MM-DD) ──
        const f = c["F"] || "";
        if (f.length === 8) {
            document.getElementById("movData").value =
                `${f.substring(0,4)}-${f.substring(4,6)}-${f.substring(6,8)}`;
        }

        // ── Tipo de documento → tipo do movimento ──
        const tipoDoc = c["D"] || "";
        const tipoMov = ["NC","ND"].includes(tipoDoc) ? "entrada" : "saida";
        const tipoEl = document.getElementById("movTipo");
        if (tipoEl) tipoEl.value = tipoMov;

        // ── Valores ──
        // I7 = base tributável, I8 = valor de IVA, O = total c/IVA
        const base  = parseFloat((c["I7"] || "0").replace(",", ".")) || 0;
        const ivaV  = parseFloat((c["I8"] || c["N"] || "0").replace(",", ".")) || 0;
        const total = parseFloat((c["O"]  || "0").replace(",", ".")) || 0;

        if (total > 0) {
            document.getElementById("movTotal").value = total.toFixed(2);

            if (base > 0 && ivaV > 0) {
                document.getElementById("movBase").value = base.toFixed(2);
                const pct = Math.round((ivaV / base) * 100);
                document.getElementById("movIva").value = pct;
            } else if (ivaV > 0) {
                // Calcular base a partir do total e IVA
                const baseCalc = total - ivaV;
                document.getElementById("movBase").value = baseCalc.toFixed(2);
                const pct = Math.round((ivaV / baseCalc) * 100);
                document.getElementById("movIva").value = pct;
            }
        }

        // ── NIF do emitente + busca automática do fornecedor ──
        const nifEmit = (c["A"] || "").trim();
        if (nifEmit) {
            document.getElementById("movNif").value = nifEmit;
            // Buscar nome do fornecedor na BD
            SB.from("fornecedores").select("nome").eq("nif", nifEmit).maybeSingle()
                .then(({ data: forn }) => {
                    if (forn?.nome) {
                        document.getElementById("movFornecedor").value = forn.nome;
                    }
                });
        }

        // ── Observações: guardar ATCUD para referência futura ──
        const obsEl = document.getElementById("movObs");
        if (obsEl && atcud) {
            obsEl.value = `ATCUD: ${atcud}`;
        }

        // ── Feedback visual (sem alert) ──
        const camposPreench = [ref, f, total>0, nifEmit].filter(Boolean).length;
        mostrarFeedbackQR(
            `✅ Fatura lida — ${ref || atcud} · ${total.toFixed(2)}€ · NIF ${nifEmit}`,
            "ok"
        );

        // Focar no campo Obra para o utilizador completar
        setTimeout(() => document.getElementById("movObra")?.focus(), 200);

    } catch(e) {
        console.error("Erro parsearQRFatura:", e);
        mostrarFeedbackQR("❌ Erro ao ler QR: " + e.message, "err");
    }
}

function mostrarFeedbackQR(msg, tipo) {
    // Feedback visual no modal — sem alert()
    let el = document.getElementById("qrFeedbackBar");
    if (!el) {
        el = document.createElement("div");
        el.id = "qrFeedbackBar";
        el.style.cssText = "border-radius:8px;padding:10px 14px;font-size:13px;font-weight:500;margin-bottom:12px;transition:opacity .3s;display:flex;align-items:center;gap:8px";
        // Inserir no início do modal, depois do título
        const modal = document.getElementById("modalMovimento");
        const conteudo = modal?.querySelector(".modal-content, .modal-body") || modal;
        conteudo?.insertBefore(el, conteudo.firstChild);
    }
    const cores = {
        ok:   { bg: "rgba(74,222,128,.15)",  border: "rgba(74,222,128,.3)",  color: "#4ade80" },
        warn: { bg: "rgba(251,146,60,.15)",   border: "rgba(251,146,60,.3)",  color: "#fb923c" },
        err:  { bg: "rgba(248,113,113,.15)",  border: "rgba(248,113,113,.3)", color: "#f87171" },
    };
    const c = cores[tipo] || cores.warn;
    el.style.background   = c.bg;
    el.style.border       = `1px solid ${c.border}`;
    el.style.color        = c.color;
    el.style.opacity      = "1";
    el.textContent        = msg;
    el.style.display      = "flex";
    // Auto-esconder após 6s
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.style.display="none", 300); }, 6000);
}



// =======================================================
// INVENTÁRIO — CRUD COMPLETO
// =======================================================
async function initInventario() {
    try { await carregarUnidades(); } catch(e) { console.warn("carregarUnidades:", e); }
    // Sub-tabs do inventário
    document.querySelectorAll(".inv-subtab").forEach(btn => {
        btn.onclick = async () => {
            document.querySelectorAll(".inv-subtab").forEach(b => {
                b.classList.remove("active");
                b.style.borderBottomColor = "transparent";
                b.style.color = "var(--text-muted)";
            });
            document.querySelectorAll(".inv-subtab-content").forEach(c => c.style.display = "none");
            btn.classList.add("active");
            btn.style.borderBottomColor = "var(--primary)";
            btn.style.color = "var(--primary)";
            const target = document.getElementById("invTab-" + btn.dataset.invtab);
            if (target) target.style.display = "block";
            if (btn.dataset.invtab === "movimentos") {
                await carregarFiltrosMovStock();
                await carregarMovimentosStock();
            }
        };
    });
    await carregarArtigos();
}

async function abrirSubTabMovimentos() {
    document.querySelectorAll(".inv-subtab").forEach(b => {
        b.classList.remove("active");
        b.style.borderBottomColor = "transparent";
        b.style.color = "var(--text-muted)";
    });
    document.querySelectorAll(".inv-subtab-content").forEach(c => c.style.display = "none");
    const btnMov = document.querySelector('.inv-subtab[data-invtab="movimentos"]');
    if (btnMov) {
        btnMov.classList.add("active");
        btnMov.style.borderBottomColor = "var(--primary)";
        btnMov.style.color = "var(--primary)";
    }
    const tabMov = document.getElementById("invTab-movimentos");
    if (tabMov) tabMov.style.display = "block";
    await carregarFiltrosMovStock();
    await carregarMovimentosStock();
}

async function carregarUnidades() {
    const { data } = await SB.from("unidades_medida").select("*").order("codigo");
    const sel = document.getElementById("artUnidade");
    if (!sel) return;
    sel.innerHTML = "";
    data?.forEach(u => { sel.innerHTML += `<option value="${u.id}">${u.codigo}</option>`; });
}

async function carregarArtigos() {
    // Buscar artigos directamente + movimentos de stock para calcular stock actual
    const [{ data, error }, { data: movs }] = await Promise.all([
        SB.from("artigos").select("id, codigo, descricao, tipo_artigo, preco_atual, stock_inicial, local_armazenamento, ativo, stock_minimo").order("descricao"),
        SB.from("movimentos_stock").select("artigo_id, tipo_movimento, quantidade")
    ]);

    // Calcular stock actual por artigo
    const stockPorArtigo = {};
    if (movs) {
        movs.forEach(m => {
            if (!stockPorArtigo[m.artigo_id]) stockPorArtigo[m.artigo_id] = 0;
            if (m.tipo_movimento === "entrada" || m.tipo_movimento === "ajuste_entrada") {
                stockPorArtigo[m.artigo_id] += Number(m.quantidade);
            } else {
                stockPorArtigo[m.artigo_id] -= Number(m.quantidade);
            }
        });
    }

    // Adicionar stock calculado a cada artigo
    const dataComStock = (data || []).filter(a => a.ativo !== false).map(a => ({
        ...a,
        quantidade: (a.stock_inicial || 0) + (stockPorArtigo[a.id] || 0)
    }));

    // Substituir data pela versão calculada para o resto da função usar
    const _data = dataComStock;
    const tbody = document.querySelector("#tabelaArtigos tbody");
    if (!tbody) return;
    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#ff7a7a">Erro: ${error.message}</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    if (!_data || _data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;opacity:.6">Sem artigos. Clique + para adicionar.</td></tr>`;
        return;
    }
    _data.forEach(a => {
        const tr = document.createElement("tr");
        const stockBaixo = a.stock_minimo && a.quantidade < a.stock_minimo;
        tr.innerHTML = `
            <td>${a.codigo || ""}</td>
            <td>${a.descricao || ""}</td>
            <td>${a.tipo_artigo || ""}</td>
            <td>${Number(a.preco_atual || 0).toFixed(2)} €</td>
            <td style="color:${stockBaixo ? "#f97316" : "inherit"};font-weight:${stockBaixo ? "700" : "400"}">
                ${a.quantidade ?? 0}${stockBaixo ? " ⚠️" : ""}
                ${a.stock_minimo ? `<span style="font-size:10px;opacity:.5;margin-left:4px">(mín: ${a.stock_minimo})</span>` : ""}
            </td>
            <td>${a.local_armazenamento || ""}</td>
            <td class="acoes-td">
                <button class="btn-acao" title="Editar">✏️</button>
                <button class="btn-acao" title="Histórico">📋</button>
                <button class="btn-acao" title="Etiqueta QR">🏷️</button>
                <button class="btn-acao btn-apagar-art" title="Apagar">🗑️</button>
            </td>`;
        tr.querySelector("[title='Editar']").onclick      = () => abrirModalArtigo(a);
        tr.querySelector("[title='Histórico']").onclick   = () => abrirHistoricoStock(a.id, a.descricao);
        tr.querySelector("[title='Etiqueta QR']").onclick = () => abrirModalEtiqueta(a);
        tr.querySelector("[title='Apagar']").onclick      = () => apagarArtigo(a.id, a.descricao);
        tbody.appendChild(tr);
    });
}

async function abrirModalArtigo(artigo = null) {
    // Em modo edição, vai buscar os dados COMPLETOS à tabela artigos.
    // A vw_stock_atual só tem campos de stock — não tem taxa_iva, unidade_id, etc.
    let d = null;
    if (artigo?.id) {
        const { data } = await SB.from("artigos").select("*").eq("id", artigo.id).single();
        d = data;
    }

    artigoEditId = artigo?.id || null;

    document.getElementById("modalTitulo").textContent = artigo ? "Editar Artigo" : "Novo Artigo";
    document.getElementById("artCodigo").value         = d?.codigo || "";
    document.getElementById("artDescricao").value      = d?.descricao || "";
    document.getElementById("artPreco").value          = d?.preco_atual ?? "";
    document.getElementById("artIva").value            = d?.taxa_iva ?? 23;
    document.getElementById("artTipo").value           = d?.tipo_artigo || "consumivel";
    document.getElementById("artLocal").value          = d?.local_armazenamento || "";
    document.getElementById("artQtdInicial").value     = "";
    document.getElementById("artStockMin").value       = d?.stock_minimo ?? "";

    const selUnidade = document.getElementById("artUnidade");
    if (selUnidade && d?.unidade_id) selUnidade.value = d.unidade_id;

    // Modo edição: esconder qty inicial, mostrar ajuste de stock
    const qtdGrp = document.getElementById("artQtdInicial")?.closest(".form-group");
    if (qtdGrp) qtdGrp.style.display = artigo ? "none" : "";

    const secaoAjuste = document.getElementById("secaoAjusteStock");
    if (secaoAjuste) secaoAjuste.style.display = artigo ? "block" : "none";

    document.getElementById("artAjusteQtd").value    = "";
    document.getElementById("artAjusteMotivo").value = "";
    document.getElementById("artAjusteTipo").value   = "entrada";

    document.getElementById("modalArtigoMsg").textContent = "";
    const _ma = document.getElementById("modalArtigo"); _ma.style.display = ""; _ma.classList.remove("hidden");
}

// =======================================================
// HISTÓRICO DE STOCK
// =======================================================
async function abrirHistoricoStock(artigoId, descricao) {
    document.getElementById("histNomeArtigo").textContent = descricao;
    document.getElementById("histCorpo").innerHTML =
        `<tr><td colspan="5" style="text-align:center;padding:16px;opacity:.6">A carregar...</td></tr>`;
    document.getElementById("modalHistorico").classList.remove("hidden");

    const { data, error } = await SB
        .from("movimentos_stock")
        .select("tipo_movimento, quantidade, preco_unitario, data_movimento, observacoes")
        .eq("artigo_id", artigoId)
        .order("data_movimento", { ascending: false });

    const tbody = document.getElementById("histCorpo");

    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;opacity:.6">Sem movimentos registados.</td></tr>`;
        return;
    }

    // Calcular stock acumulado (do mais antigo para o mais recente)
    let acumulado = 0;
    const comSaldo = [...data].reverse().map(m => {
        const delta = m.tipo_movimento === "saida" ? -m.quantidade : Number(m.quantidade);
        acumulado += delta;
        return { ...m, saldo: acumulado };
    });
    comSaldo.reverse();

    const labels = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste", inicial: "Inicial" };
    const cores  = { entrada: "#5ad65a", saida: "#ff7a7a", ajuste: "#f4b942", inicial: "#85B7EB" };

    tbody.innerHTML = comSaldo.map(m => {
        const cor   = cores[m.tipo_movimento] || "#888";
        const label = labels[m.tipo_movimento] || m.tipo_movimento;
        const delta = m.tipo_movimento === "saida" ? -m.quantidade : +m.quantidade;
        const sinal = delta >= 0 ? "+" : "";
        return `<tr>
            <td>${m.data_movimento || "—"}</td>
            <td><span style="color:${cor};font-weight:600">${label}</span></td>
            <td style="text-align:right;color:${cor}">${sinal}${delta}</td>
            <td style="text-align:right;font-weight:500">${m.saldo}</td>
            <td style="opacity:.7;font-size:12px">${m.observacoes || "—"}</td>
        </tr>`;
    }).join("");
}

function fecharModalHistorico() {
    document.getElementById("modalHistorico").classList.add("hidden");
}

function fecharModalArtigo() {
    const m = document.getElementById("modalArtigo");
    if (m) { m.style.display = "none"; m.classList.add("hidden"); }
    artigoEditId = null;
}

async function guardarArtigo() {
    const descricao = document.getElementById("artDescricao").value.trim();
    const msg       = document.getElementById("modalArtigoMsg");
    if (!descricao) { msg.textContent = "A descrição é obrigatória."; return; }

    const unidadeVal = document.getElementById("artUnidade").value;

    const payload = {
        codigo:              document.getElementById("artCodigo").value.trim() || null,
        descricao,
        preco_atual:         parseFloat(document.getElementById("artPreco").value) || 0,
        taxa_iva:            parseInt(document.getElementById("artIva").value) || 23,
        tipo_artigo:         document.getElementById("artTipo").value,
        local_armazenamento: document.getElementById("artLocal").value.trim() || null,
        unidade_id:          unidadeVal ? parseInt(unidadeVal) : null
    };

    if (artigoEditId) {
        // EDITAR — actualizar dados do artigo
        const { error } = await SB.from("artigos").update(payload).eq("id", artigoEditId);
        if (error) { msg.textContent = "Erro: " + error.message; return; }

        // Movimento de ajuste de stock (só se quantidade preenchida)
        const qtdAjuste  = parseFloat(document.getElementById("artAjusteQtd").value);
        const tipoAjuste = document.getElementById("artAjusteTipo").value;
        const motivo     = document.getElementById("artAjusteMotivo").value.trim();

        if (!isNaN(qtdAjuste) && qtdAjuste > 0) {
            const { error: errMov } = await SB.from("movimentos_stock").insert({
                artigo_id:      artigoEditId,
                tipo_movimento: tipoAjuste,
                quantidade:     qtdAjuste,
                data_movimento: new Date().toISOString().split("T")[0],
                observacoes:    motivo || null
            });
            if (errMov) {
                msg.textContent = "Artigo guardado, mas erro no ajuste de stock: " + errMov.message;
                // Recarregar mesmo assim para reflectir a edição dos dados
                await carregarArtigos();
                return;
            }
        }

    } else {
        // CRIAR novo artigo
        const qtd = parseInt(document.getElementById("artQtdInicial").value) || 0;
        payload.stock_inicial = qtd;
        payload.ativo = true;

        const { data, error } = await SB.from("artigos").insert(payload).select("id").single();
        if (error) { msg.textContent = "Erro: " + error.message; return; }

        // Movimento inicial se stock > 0
        if (qtd > 0 && data?.id) {
            await SB.from("movimentos_stock").insert({
                artigo_id:      data.id,
                tipo_movimento: "entrada",
                quantidade:     qtd,
                data_movimento: new Date().toISOString().split("T")[0],
                observacoes:    "Stock inicial"
            });
        }
    }

    fecharModalArtigo();
    // Pequeno delay para garantir que a view do Supabase reflecte o novo movimento
    await new Promise(r => setTimeout(r, 300));
    await carregarArtigos(); // Stock actualizado via vw_stock_atual
}


// =======================================================
// ETIQUETAS QR — IMPRESSÃO
// =======================================================
let loteEtiquetas = []; // Lote de etiquetas acumuladas

function abrirModalEtiqueta(artigo) {
    document.getElementById("etqArtigoNome").textContent  = artigo.descricao;
    document.getElementById("etqArtigoCodigo").textContent = artigo.codigo || "—";
    document.getElementById("etqQuantidade").value        = 1;
    document.getElementById("etqTamanho").value           = "medio";
    document.getElementById("etqMsg").textContent         = "";
    // Guardar artigo no modal para uso posterior
    document.getElementById("modalEtiqueta").dataset.artigoId     = artigo.id;
    document.getElementById("modalEtiqueta").dataset.artigoCodigo = artigo.codigo;
    document.getElementById("modalEtiqueta").dataset.artigoNome   = artigo.descricao;
    document.getElementById("modalEtiqueta").dataset.artigoTipo   = artigo.tipo_artigo;
    document.getElementById("modalEtiqueta").classList.remove("hidden");
    actualizarPreviewLote();
}

function fecharModalEtiqueta() {
    document.getElementById("modalEtiqueta").classList.add("hidden");
}

function actualizarPreviewLote() {
    const n = loteEtiquetas.length;
    const btnLote = document.getElementById("btnImprimirLote");
    if (btnLote) {
        btnLote.textContent = n > 0 ? `🖨️ Imprimir Lote (${n})` : "🖨️ Imprimir Lote";
        btnLote.style.opacity = n > 0 ? "1" : ".4";
    }
}

function adicionarAoLote() {
    const modal = document.getElementById("modalEtiqueta");
    const qtd   = parseInt(document.getElementById("etqQuantidade").value) || 1;
    const tam   = document.getElementById("etqTamanho").value;
    loteEtiquetas.push({
        codigo: modal.dataset.artigoCodigo,
        nome:   modal.dataset.artigoNome,
        tipo:   modal.dataset.artigoTipo,
        qtd,
        tam
    });
    document.getElementById("etqMsg").textContent = `✓ Adicionado ao lote (${loteEtiquetas.length} artigo${loteEtiquetas.length > 1 ? "s" : ""})`;
    document.getElementById("etqMsg").style.color = "var(--color-ok)";
    actualizarPreviewLote();
}

function imprimirEtiquetaDirecta() {
    const modal = document.getElementById("modalEtiqueta");
    const qtd   = parseInt(document.getElementById("etqQuantidade").value) || 1;
    const tam   = document.getElementById("etqTamanho").value;
    const item  = { codigo: modal.dataset.artigoCodigo, nome: modal.dataset.artigoNome, tipo: modal.dataset.artigoTipo, qtd, tam };
    gerarPaginaImpressao([item]);
    fecharModalEtiqueta();
}

function imprimirLote() {
    if (loteEtiquetas.length === 0) { alert("O lote está vazio. Adiciona artigos primeiro."); return; }
    gerarPaginaImpressao(loteEtiquetas);
    loteEtiquetas = [];
    actualizarPreviewLote();
}

function gerarPaginaImpressao(itens) {
    // Tamanhos das etiquetas em mm
    const dims = { pequeno: [50, 30], medio: [90, 50], grande: [140, 90] };

    // Gerar HTML de cada etiqueta
    let etiquetasHTML = "";
    const url_base = "https://alcindomaia.github.io/marcacao-ponto/stock.html?artigo=";

    itens.forEach(item => {
        const [w, h] = dims[item.tam] || dims.medio;
        const url    = url_base + encodeURIComponent(item.codigo);
        const tipoLabel = { consumivel: "Consumível", mercadoria: "Mercadoria", equipamento: "Equipamento", ferramenta: "Ferramenta" }[item.tipo] || item.tipo;

        for (let i = 0; i < item.qtd; i++) {
            etiquetasHTML += `
            <div class="etiqueta etq-${item.tam}" style="width:${w}mm;height:${h}mm">
                <div class="etq-header">
                    <span class="etq-empresa">MAIA SOLUTIONS</span>
                    <span class="etq-tipo">${tipoLabel}</span>
                </div>
                <div class="etq-body">
                    <canvas class="etq-qr" data-url="${url}" width="100" height="100"></canvas>
                    <div class="etq-info">
                        <div class="etq-codigo">${item.codigo}</div>
                        <div class="etq-nome">${item.nome}</div>
                    </div>
                </div>
            </div>`;
        }
    });

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Etiquetas — Maia Solutions</title>
<script src="https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js"><\/script>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:#fff; font-family:'Inter',system-ui,sans-serif; }
  .pagina { display:flex; flex-wrap:wrap; gap:4mm; padding:8mm; }
  .etiqueta {
    border: 0.5mm solid #ccc;
    border-radius: 2mm;
    display: flex;
    flex-direction: column;
    padding: 2mm;
    page-break-inside: avoid;
    overflow: hidden;
  }
  .etq-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 0.3mm solid #eee;
    padding-bottom: 1mm;
    margin-bottom: 1.5mm;
  }
  .etq-empresa { font-size: 5pt; font-weight: 700; letter-spacing: .5pt; color: #f4b942; }
  .etq-tipo    { font-size: 4pt; color: #999; text-transform: uppercase; letter-spacing: .3pt; }
  .etq-body    { display: flex; flex: 1; align-items: center; gap: 2mm; }
  .etq-qr      { flex-shrink: 0; }
  .etq-info    { flex: 1; min-width: 0; }
  .etq-codigo  { font-size: 8pt; font-weight: 800; letter-spacing: .5pt; margin-bottom: 1mm; }
  .etq-nome    { font-size: 7pt; color: #333; line-height: 1.3; word-break: break-word; }

  /* Tamanhos de QR e texto por tamanho de etiqueta */
  .etq-pequeno .etq-qr   { width: 16mm; height: 16mm; }
  .etq-pequeno .etq-codigo { font-size: 6pt; }
  .etq-pequeno .etq-nome   { font-size: 5pt; }

  .etq-medio .etq-qr   { width: 26mm; height: 26mm; }
  .etq-medio .etq-codigo { font-size: 9pt; }
  .etq-medio .etq-nome   { font-size: 8pt; }

  .etq-grande .etq-qr   { width: 42mm; height: 42mm; }
  .etq-grande .etq-codigo { font-size: 12pt; }
  .etq-grande .etq-nome   { font-size: 11pt; }

  @media print {
    body { margin:0; }
    .pagina { gap:2mm; padding:5mm; }
  }
</style>
</head>
<body>
<div class="pagina">${etiquetasHTML}</div>
<script>
  document.querySelectorAll(".etq-qr").forEach(canvas => {
    const size = canvas.offsetWidth || parseInt(canvas.style.width) || 80;
    new QRious({ element: canvas, value: canvas.dataset.url, size: size * 3.78, level: "H", background: "#ffffff", foreground: "#000000" });
  });
  setTimeout(() => window.print(), 600);
<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    win.document.write(html);
    win.document.close();
}

// =======================================================
// MOVIMENTOS STOCK — sub-tab do inventário
// =======================================================
async function carregarMovimentosStock() {
    const tbody = document.querySelector("#tabelaMovStock tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;opacity:.6">A carregar…</td></tr>`;

    // Filtros
    const filtroArtigo = document.getElementById("filtroMovArtigo")?.value?.toLowerCase() || "";
    const filtroFunc   = document.getElementById("filtroMovFunc")?.value   || "";
    const filtroObra   = document.getElementById("filtroMovObra")?.value   || "";
    const filtroInicio = document.getElementById("filtroMovInicio")?.value || "";
    const filtroFim    = document.getElementById("filtroMovFim")?.value    || "";

    let query = SB.from("movimentos_stock")
        .select(`id, tipo_movimento, quantidade, data_movimento, observacoes, created_at,
                 artigos(codigo, descricao, tipo_artigo),
                 funcionarios(nome),
                 obra_origem:obras!movimentos_stock_obra_origem_id_fkey(nome),
                 obra_destino:obras!movimentos_stock_obra_destino_id_fkey(nome)`)
        .order("data_movimento", { ascending: false })
        .order("created_at",     { ascending: false })
        .limit(200);

    if (filtroFunc)   query = query.eq("funcionario_id", filtroFunc);
    if (filtroInicio) query = query.gte("data_movimento", filtroInicio);
    if (filtroFim)    query = query.lte("data_movimento", filtroFim);

    const { data, error } = await query;
    if (error) { tbody.innerHTML = `<tr><td colspan="8" style="color:#ff7a7a;text-align:center;padding:16px">Erro: ${error.message}</td></tr>`; return; }

    let lista = data || [];

    // Filtro de artigo (client-side por texto)
    if (filtroArtigo) {
        lista = lista.filter(m =>
            (m.artigos?.codigo || "").toLowerCase().includes(filtroArtigo) ||
            (m.artigos?.descricao || "").toLowerCase().includes(filtroArtigo)
        );
    }
    // Filtro de obra (client-side)
    if (filtroObra) {
        lista = lista.filter(m => m.obra_origem?.id === filtroObra || m.obra_destino?.id === filtroObra);
    }

    tbody.innerHTML = "";
    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;opacity:.6">Sem movimentos com estes filtros.</td></tr>`;
        return;
    }

    const tipoLabel = { entrada: "Entrada", saida: "Saída", ajuste_entrada: "Ajuste +", ajuste_saida: "Ajuste −", inicial: "Inicial" };
    const tipoCor   = { entrada: "#5ad65a", saida: "#ff7a7a", ajuste_entrada: "#f4b942", ajuste_saida: "#f4b942", inicial: "#85b7eb" };

    lista.forEach(m => {
        const cor    = tipoCor[m.tipo_movimento]   || "#888";
        const label  = tipoLabel[m.tipo_movimento] || m.tipo_movimento;
        const origem  = m.obra_origem?.nome  || (m.observacoes?.includes("Armazém") ? "Armazém" : "—");
        const destino = m.obra_destino?.nome || (m.observacoes?.includes("Armazém") ? "Armazém" : "—");
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-size:12px;opacity:.7">${m.data_movimento || "—"}</td>
            <td>
                <div style="font-weight:600;font-size:13px">${m.artigos?.descricao || "—"}</div>
                <div style="font-size:11px;opacity:.5;font-family:monospace">${m.artigos?.codigo || ""}</div>
            </td>
            <td><span style="color:${cor};font-weight:700;font-size:12px">${label}</span></td>
            <td style="text-align:right;font-weight:600">${m.quantidade ?? "—"}</td>
            <td style="font-size:13px">${m.funcionarios?.nome || "—"}</td>
            <td style="font-size:12px;opacity:.8">${origem}</td>
            <td style="font-size:12px;opacity:.8">${destino}</td>
            <td style="font-size:11px;opacity:.6">${m.observacoes || "—"}</td>`;
        tbody.appendChild(tr);
    });
}

async function carregarFiltrosMovStock() {
    // Preencher select de funcionários
    const selFunc = document.getElementById("filtroMovFunc");
    if (selFunc && selFunc.options.length <= 1) {
        const { data } = await SB.from("funcionarios").select("id, nome").order("nome");
        data?.forEach(f => { selFunc.innerHTML += `<option value="${f.id}">${f.nome}</option>`; });
    }
}

async function apagarArtigo(id, nome) {
    if (!confirm(`Apagar "${nome}"? Esta ação não pode ser revertida.`)) return;
    const { error } = await SB.from("artigos").delete().eq("id", id);
    if (error) { alert("Erro: " + error.message); return; }
    await carregarArtigos();
}

// =======================================================

// =======================================================
// PAINEL DE OBRA — modal completo com sub-tabs
// =======================================================
let _painelObraActual = null;


function fecharPainelObra() {
    document.getElementById("modalPainelObra").classList.add("hidden");
    _painelObraActual = null;
}

function abrirPainelTab(tab) {
    document.querySelectorAll(".painel-tab").forEach(b => {
        b.classList.remove("active");
        b.style.borderBottomColor = "transparent";
        b.style.color = "var(--text-muted)";
    });
    document.querySelectorAll(".painel-tab-content").forEach(c => c.style.display = "none");
    const btn = document.querySelector(`.painel-tab[data-tab="${tab}"]`);
    if (btn) { btn.classList.add("active"); btn.style.borderBottomColor = "var(--primary)"; btn.style.color = "var(--primary)"; }
    const el = document.getElementById(`painelTab-${tab}`);
    if (el) el.style.display = "block";
    if (tab === "resumo")     carregarPainelResumo();
    if (tab === "financeiro") carregarPainelFinanceiro();
    if (tab === "ponto")      carregarPainelPonto();
    if (tab === "stock")      carregarPainelStock();
}

async function carregarPainelResumo() {
    const obraId = _painelObraActual.id;
    const el = document.getElementById("painelTab-resumo");
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;

    const [movsRes, orcRes, pontoRes] = await Promise.all([
        SB.from("movimentos_financeiros").select("tipo, valor_total, categorias_financeiras(nome)").eq("obra_id", obraId).eq("ativo", true),
        SB.from("orcamentos").select("numero, estado, total_com_iva, total_sem_iva, subtotal_mao_obra, subtotal_materiais").eq("obra_id", obraId),
        SB.from("vw_registos_ponto").select("funcionario, horas, dia").eq("obra", _painelObraActual.nome)
    ]);

    const movs  = movsRes.data  || [];
    const orcs  = orcRes.data   || [];
    const ponto = pontoRes.data || [];

    const totalEntradas = movs.filter(m => m.tipo === "entrada").reduce((s,m) => s + Number(m.valor_total), 0);
    const totalSaidas   = movs.filter(m => m.tipo === "saida").reduce((s,m) => s + Number(m.valor_total), 0);
    const margem        = totalEntradas - totalSaidas;
    const margemPct     = totalEntradas > 0 ? ((margem / totalEntradas) * 100).toFixed(1) : null;
    const orcAceite     = orcs.filter(o => o.estado === "aceite");
    const totalOrc      = orcAceite.reduce((s,o) => s + Number(o.total_com_iva||0), 0);
    const desvio        = totalOrc > 0 ? totalOrc - totalSaidas : null;
    let totalHoras = 0;
    ponto.forEach(r => {
        if (r.horas && r.horas.includes(":")) { const [h,m] = r.horas.split(":").map(Number); totalHoras += h + m/60; }
    });

    const fmt = v => Number(v).toFixed(2) + " €";
    const corMargem = margem >= 0 ? "#5ad65a" : "#ff7a7a";

    el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
            <div class="card" style="padding:16px;text-align:center">
                <div style="font-size:11px;opacity:.5;margin-bottom:6px;font-family:var(--font-title);letter-spacing:.5px">RECEBIDO</div>
                <div style="font-size:20px;font-weight:800;color:#5ad65a">${fmt(totalEntradas)}</div>
            </div>
            <div class="card" style="padding:16px;text-align:center">
                <div style="font-size:11px;opacity:.5;margin-bottom:6px;font-family:var(--font-title);letter-spacing:.5px">GASTO</div>
                <div style="font-size:20px;font-weight:800;color:#ff7a7a">${fmt(totalSaidas)}</div>
            </div>
            <div class="card" style="padding:16px;text-align:center">
                <div style="font-size:11px;opacity:.5;margin-bottom:6px;font-family:var(--font-title);letter-spacing:.5px">MARGEM BRUTA</div>
                <div style="font-size:20px;font-weight:800;color:${corMargem}">${fmt(margem)}</div>
                ${margemPct ? `<div style="font-size:12px;color:${corMargem};opacity:.8">${margemPct}%</div>` : ""}
            </div>
            <div class="card" style="padding:16px;text-align:center">
                <div style="font-size:11px;opacity:.5;margin-bottom:6px;font-family:var(--font-title);letter-spacing:.5px">HORAS OBRA</div>
                <div style="font-size:20px;font-weight:800;color:var(--primary)">${totalHoras.toFixed(1)}h</div>
            </div>
        </div>
        ${totalOrc > 0 ? `
        <div class="card" style="padding:16px;margin-bottom:12px">
            <div style="font-size:11px;opacity:.5;margin-bottom:12px;font-family:var(--font-title);letter-spacing:.5px">ORÇAMENTO VS REAL</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px"><span style="opacity:.7">Orçamento aceite</span><span style="font-weight:700">${fmt(totalOrc)}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px"><span style="opacity:.7">Gasto real</span><span style="font-weight:700;color:#ff7a7a">${fmt(totalSaidas)}</span></div>
            <div style="border-top:1px solid var(--border);margin:8px 0;padding-top:8px;display:flex;justify-content:space-between;font-size:14px">
                <span style="font-weight:600">Desvio</span>
                <span style="font-weight:800;color:${desvio >= 0 ? "#5ad65a" : "#ff7a7a"}">${desvio >= 0 ? "+" : ""}${fmt(desvio)}</span>
            </div>
            <div style="background:rgba(255,255,255,.08);border-radius:4px;height:8px;margin-top:10px;overflow:hidden">
                <div style="height:100%;border-radius:4px;background:${totalSaidas <= totalOrc ? "#5ad65a" : "#ff7a7a"};width:${Math.min((totalSaidas/totalOrc)*100,100).toFixed(0)}%"></div>
            </div>
            <div style="font-size:11px;opacity:.5;margin-top:4px;text-align:right">${((totalSaidas/totalOrc)*100).toFixed(0)}% do orçamento utilizado</div>
        </div>` : `<div class="card" style="padding:14px;opacity:.5;font-size:13px;text-align:center;margin-bottom:12px">Sem orçamento aceite associado.</div>`}
        ${orcs.length > 0 ? `<div class="card" style="padding:14px"><div style="font-size:11px;opacity:.5;margin-bottom:10px;font-family:var(--font-title);letter-spacing:.5px">ORÇAMENTOS</div>${orcs.map(o => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)"><span style="font-size:12px;font-family:monospace">${o.numero}</span><span class="badge-estado ${o.estado === "aceite" ? "pago" : "por_pagar"}" style="font-size:10px">${o.estado}</span><span style="font-size:13px;font-weight:700">${fmt(o.total_com_iva)}</span></div>`).join("")}</div>` : ""}`;
}

async function carregarPainelFinanceiro() {
    const el = document.getElementById("painelTab-financeiro");
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;
    const { data } = await SB.from("movimentos_financeiros")
        .select("data_documento, tipo, referencia, valor_total, observacoes, fornecedores(nome), categorias_financeiras(nome)")
        .eq("obra_id", _painelObraActual.id).eq("ativo", true)
        .order("data_documento", { ascending: false });
    if (!data?.length) { el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">Sem movimentos financeiros.</div>`; return; }
    const porCat = {};
    data.forEach(m => {
        const cat = m.categorias_financeiras?.nome || "Sem categoria";
        if (!porCat[cat]) porCat[cat] = { entradas:0, saidas:0, items:[] };
        if (m.tipo === "entrada") porCat[cat].entradas += Number(m.valor_total);
        else porCat[cat].saidas += Number(m.valor_total);
        porCat[cat].items.push(m);
    });
    el.innerHTML = Object.entries(porCat).map(([cat, d]) => `
        <div class="card" style="margin-bottom:10px;padding:0;overflow:hidden">
            <div style="padding:10px 14px;background:rgba(244,185,66,.08);display:flex;justify-content:space-between;align-items:center">
                <span style="font-family:var(--font-title);font-size:11px;letter-spacing:.5px;text-transform:uppercase">${cat}</span>
                <span style="font-size:13px;font-weight:700;color:${d.saidas > 0 ? "#ff7a7a" : "#5ad65a"}">
                    ${d.entradas > 0 ? "+" + d.entradas.toFixed(2) + " € " : ""}${d.saidas > 0 ? "−" + d.saidas.toFixed(2) + " €" : ""}
                </span>
            </div>
            ${d.items.map(m => `<div style="padding:8px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:12px">
                <div><div style="opacity:.6">${m.data_documento}</div><div style="font-weight:500">${m.fornecedores?.nome || m.observacoes || m.referencia || "—"}</div></div>
                <div style="font-weight:700;color:${m.tipo === "entrada" ? "#5ad65a" : "#ff7a7a"}">${m.tipo === "entrada" ? "+" : "−"}${Number(m.valor_total).toFixed(2)} €</div>
            </div>`).join("")}
        </div>`).join("");
}

async function carregarPainelPonto() {
    const el = document.getElementById("painelTab-ponto");
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;
    const { data } = await SB.from("vw_registos_ponto")
        .select("funcionario, dia, horas, entrada, saida, estado")
        .eq("obra", _painelObraActual.nome)
        .order("dia", { ascending: false });
    if (!data?.length) { el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">Sem registos de ponto.</div>`; return; }
    const porFunc = {};
    data.forEach(r => {
        if (!porFunc[r.funcionario]) porFunc[r.funcionario] = { horas:0, dias:0 };
        if (r.horas?.includes(":")) { const [h,m] = r.horas.split(":").map(Number); porFunc[r.funcionario].horas += h + m/60; }
        porFunc[r.funcionario].dias++;
    });
    const fmt = iso => iso ? iso.substring(11,16) : "—";
    el.innerHTML = `
        <div class="card" style="margin-bottom:12px;padding:0;overflow:hidden">
            <div style="padding:10px 14px;background:rgba(244,185,66,.08);font-family:var(--font-title);font-size:11px;letter-spacing:.5px;text-transform:uppercase">Por Funcionário</div>
            ${Object.entries(porFunc).sort((a,b) => b[1].horas - a[1].horas).map(([nome, d]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border)">
                <span style="font-weight:600;font-size:13px">${nome}</span>
                <div style="text-align:right"><div style="font-weight:700;color:var(--primary)">${d.horas.toFixed(1)}h</div><div style="font-size:11px;opacity:.5">${d.dias} dia${d.dias!==1?"s":""}</div></div>
            </div>`).join("")}
        </div>
        <div class="card" style="overflow-x:auto;padding:0">
            <table class="display" style="margin:0">
                <thead><tr><th>Data</th><th>Funcionário</th><th>Entrada</th><th>Saída</th><th>Horas</th><th>Estado</th></tr></thead>
                <tbody>${data.slice(0,100).map(r => `<tr>
                    <td style="font-size:12px;opacity:.7">${r.dia}</td>
                    <td style="font-weight:500">${r.funcionario}</td>
                    <td>${fmt(r.entrada)}</td><td>${fmt(r.saida)}</td>
                    <td style="font-weight:700;color:var(--primary)">${r.horas||"—"}</td>
                    <td><span class="badge-estado ${r.estado==="OK"?"pago":"por_pagar"}" style="font-size:10px">${r.estado}</span></td>
                </tr>`).join("")}</tbody>
            </table>
        </div>`;
}

async function carregarPainelStock() {
    const el = document.getElementById("painelTab-stock");
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;
    const { data } = await SB.from("movimentos_stock")
        .select("data_movimento, tipo_movimento, quantidade, observacoes, artigos(codigo, descricao), funcionarios(nome)")
        .or(`obra_origem_id.eq.${_painelObraActual.id},obra_destino_id.eq.${_painelObraActual.id}`)
        .order("data_movimento", { ascending: false });
    if (!data?.length) { el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">Sem movimentos de stock.</div>`; return; }
    const tipoCor = { entrada:"#5ad65a", saida:"#ff7a7a", ajuste_entrada:"#f4b942", ajuste_saida:"#f4b942" };
    const tipoLabel = { entrada:"Entrada", saida:"Saída", ajuste_entrada:"Ajuste +", ajuste_saida:"Ajuste −" };
    el.innerHTML = `<div class="card" style="overflow-x:auto;padding:0">
        <table class="display" style="margin:0">
            <thead><tr><th>Data</th><th>Artigo</th><th>Tipo</th><th style="text-align:right">Qtd</th><th>Funcionário</th><th>Obs</th></tr></thead>
            <tbody>${data.map(m => `<tr>
                <td style="font-size:12px;opacity:.7">${m.data_movimento}</td>
                <td><div style="font-weight:600;font-size:13px">${m.artigos?.descricao||"—"}</div><div style="font-size:11px;opacity:.5;font-family:monospace">${m.artigos?.codigo||""}</div></td>
                <td><span style="color:${tipoCor[m.tipo_movimento]||"#888"};font-weight:700;font-size:12px">${tipoLabel[m.tipo_movimento]||m.tipo_movimento}</span></td>
                <td style="text-align:right;font-weight:700">${m.quantidade}</td>
                <td style="font-size:12px">${m.funcionarios?.nome||"—"}</td>
                <td style="font-size:11px;opacity:.6">${m.observacoes||"—"}</td>
            </tr>`).join("")}</tbody>
        </table>
    </div>`;
}

// FLUXO DE CAIXA — COMPLETO
// =======================================================
async function initFluxo() {
    await Promise.all([carregarCategoriasFinanceiras(), carregarObrasFluxo()]);
    ligarFiltrosFluxo();
    await carregarMovimentos();
}

async function carregarCategoriasFinanceiras() {
    const { data } = await SB.from("categorias_financeiras").select("*").order("nome");
    ["movCategoria", "filtroCategoria"].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const placeholder = id.startsWith("filtro") ? "— Todas —" : "— Selecionar —";
        sel.innerHTML = `<option value="">${placeholder}</option>`;
        data?.forEach(c => { sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`; });
    });
}

async function carregarObrasFluxo() {
    const { data } = await SB.from("obras").select("id, nome").order("nome");
    ["movObra", "filtroObra"].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const placeholder = id.startsWith("filtro") ? "— Todas —" : "— Sem obra —";
        sel.innerHTML = `<option value="">${placeholder}</option>`;
        data?.forEach(o => { sel.innerHTML += `<option value="${o.id}">${o.nome}</option>`; });
    });
}

let _todosMovimentos = []; // cache dos movimentos já filtrados (por ano/datas/obra/etc)

function filtrarPorEstado(estado) {
    const hoje  = new Date().toISOString().split("T")[0];
    const lista = estado === ""
        ? _todosMovimentos
        : estado === "atrasado"
            ? _todosMovimentos.filter(m => m.estado_pagamento === "por_pagar" && m.data_documento < hoje)
            : _todosMovimentos.filter(m => m.estado_pagamento === estado);

    // Actualizar KPIs com base na lista filtrada
    actualizarKpisFluxo(lista);

    // Re-renderizar tabela
    movimentos = lista;
    renderMovimentos();
}

function actualizarKpisFluxo(lista) {
    lista = lista || movimentos || [];
    const entradas = lista.filter(m => m.tipo === "entrada").reduce((s,m) => s + Number(m.valor_total), 0);
    const saidas   = lista.filter(m => m.tipo === "saida").reduce((s,m)   => s + Number(m.valor_total), 0);
    const saldo    = entradas - saidas;
    document.getElementById("totalEntradas").textContent = entradas.toFixed(2) + " €";
    document.getElementById("totalSaidas").textContent   = saidas.toFixed(2) + " €";
    const sEl = document.getElementById("saldoFluxo");
    if (sEl) { sEl.textContent = saldo.toFixed(2) + " €"; sEl.style.color = saldo >= 0 ? "#5ad65a" : "#ff7a7a"; }
}

async function carregarMovimentos() {
    const obra       = document.getElementById("filtroObra")?.value || "";
    const categoria  = document.getElementById("filtroCategoria")?.value || "";
    const tipo       = document.getElementById("filtroTipo")?.value || "";
    const dataInicio = document.getElementById("filtroDataInicio")?.value || "";
    const dataFim    = document.getElementById("filtroDataFim")?.value || "";
    const anoFiltro  = document.getElementById("filtroAnoFluxo")?.value || "";

    let dInicio = dataInicio;
    let dFim    = dataFim;
    if (!dInicio && !dFim && anoFiltro) {
        dInicio = `${anoFiltro}-01-01`;
        dFim    = `${anoFiltro}-12-31`;
    }

    let query = SB.from("movimentos_financeiros")
        .select(`id, referencia, data_documento, tipo,
                 valor_base, iva, valor_total, estado_pagamento, observacoes,
                 obra_id, categoria_id, fornecedor_id,
                 fornecedores(id, nome, nif), categorias_financeiras(id, nome), obras(id, nome)`)
        .order("data_documento", { ascending: false });

    if (obra)      query = query.eq("obra_id", obra);
    if (categoria) query = query.eq("categoria_id", categoria);
    if (tipo)      query = query.eq("tipo", tipo);
    if (dInicio)   query = query.gte("data_documento", dInicio);
    if (dFim)      query = query.lte("data_documento", dFim);

    const { data, error } = await query;
    if (error) { console.error(error); return; }
    movimentos = data || [];
    _todosMovimentos = data || [];
    actualizarKpisFluxo(movimentos);
    _paginaFluxo = 0;
    renderMovimentos();
}

function ligarFiltrosFluxo() {
    ["filtroObra","filtroCategoria","filtroTipo","filtroDataInicio","filtroDataFim","filtroAnoFluxo"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", carregarMovimentos);
        document.getElementById(id)?.addEventListener("input",  carregarMovimentos);
    });
    document.getElementById("btnLimparFiltros")?.addEventListener("click", () => {
        ["filtroObra","filtroCategoria","filtroTipo","filtroDataInicio","filtroDataFim"]
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        const anoEl = document.getElementById("filtroAnoFluxo");
        if (anoEl) anoEl.value = new Date().getFullYear().toString();
        carregarMovimentos();
    });
}


function renderMovimentos() {
    const tbody = document.querySelector("#tabelaMovimentos tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (movimentos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;opacity:.6">Sem movimentos com estes filtros.</td></tr>`;
        return;
    }
    // Paginação — max 50 registos por página
    const fim = (_paginaFluxo + 1) * _PAGINA_FLUXO_TAM;
    const visiveis = movimentos.slice(0, fim);
    const temMais = movimentos.length > fim;
    visiveis.forEach(m => {
        const ent = m.tipo === "entrada";
        const tr  = document.createElement("tr");
        tr.innerHTML = `
            <td>${m.data_documento || ""}</td>
            <td>${m.referencia || "—"}</td>
            <td><span class="badge-tipo ${ent ? "entrada" : "saida"}">${ent ? "Entrada" : "Saída"}</span></td>
            <td>${m.fornecedores?.nome || "—"}</td>
            <td>${m.categorias_financeiras?.nome || "—"}</td>
            <td>${m.obras?.nome || "—"}</td>
            <td style="text-align:right;font-weight:500;color:${ent ? "#5ad65a" : "#ff7a7a"}">${ent ? "+" : "–"}${Number(m.valor_total).toFixed(2)} €</td>
            <td><span class="badge-estado ${m.estado_pagamento}">${m.estado_pagamento === "pago" ? "Pago" : "Por pagar"}</span></td>
            <td class="acoes-td">
                <button class="btn-acao" title="Editar">✏️</button>
                <button class="btn-acao" title="Apagar">🗑️</button>
            </td>`;
        tr.querySelectorAll(".btn-acao")[0].onclick = () => abrirModalMovimento(m);
        tr.querySelectorAll(".btn-acao")[1].onclick = () => apagarMovimento(m.id, m.referencia);
        tbody.appendChild(tr);
    });
    // Botão "Ver mais" se houver mais registos
    if (temMais) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="9" style="text-align:center;padding:12px">
            <button onclick="_paginaFluxo++;renderMovimentos()" 
                style="background:rgba(244,185,66,.15);color:var(--primary,#b8860b);border:1px solid rgba(244,185,66,.3);
                       border-radius:20px;padding:7px 20px;cursor:pointer;font-size:13px;font-weight:600">
                Ver mais (${movimentos.length - fim} restantes)
            </button>
        </td>`;
        tbody.appendChild(tr);
    } else if (movimentos.length > _PAGINA_FLUXO_TAM) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="9" style="text-align:center;padding:8px;opacity:.4;font-size:12px">
            ${movimentos.length} registos carregados
        </td>`;
        tbody.appendChild(tr);
    }
}

function renderTotais() {
    actualizarKpisFluxo(movimentos);
}


async function carregarServicosImputacao(obraId) {
    let wrap = document.getElementById("imputacaoServicosWrap");
    if (!wrap) return;
    if (!obraId) { wrap.style.display = "none"; return; }

    const { data: servs } = await SB.from("obra_servicos")
        .select("id, nome, extra").eq("obra_id", obraId).order("ordem").order("created_at");

    if (!servs?.length) { wrap.style.display = "none"; return; }

    wrap.style.display = "block";
    const linhasDiv = document.getElementById("imputacaoLinhas");
    if (linhasDiv) linhasDiv.innerHTML = `
        <div style="font-size:11px;letter-spacing:.5px;opacity:.5;text-transform:uppercase;margin-bottom:8px">
            Imputar material a serviço(s) desta obra
        </div>
        <div id="imputLinhasInner"></div>
        <button type="button" onclick="adicionarLinhaImput(${JSON.stringify(servs).replace(/"/g,'&quot;')})"
            style="background:rgba(244,185,66,.1);border:1px solid rgba(244,185,66,.2);color:var(--primary,#f4b942);border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px;margin-top:6px">
            + Adicionar serviço
        </button>`;
    // Adicionar uma linha por defeito
    adicionarLinhaImput(servs);
}

function adicionarLinhaImput(servs) {
    const inner = document.getElementById("imputLinhasInner");
    if (!inner) return;
    const opts = servs.map(s => `<option value="${s.id}">${s.nome}${s.extra?" [Extra]":""}</option>`).join("");
    const div = document.createElement("div");
    div.className = "linha-imput-serv";
    div.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:6px";
    div.innerHTML = `
        <select class="imput-serv-sel" style="flex:1;padding:6px 8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#fff;font-size:13px">
            <option value="">— Serviço —</option>${opts}
        </select>
        <input class="imput-serv-val" type="number" step="0.01" min="0" placeholder="€"
            style="width:80px;padding:6px 8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#fff;font-size:13px">
        <button type="button" onclick="this.parentElement.remove()" style="background:rgba(248,113,113,.1);border:none;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:13px;flex-shrink:0">✕</button>`;
    inner.appendChild(div);
}

function fecharModalMovimento() {
    const modal = document.getElementById("modalMovimento");
    if (modal) {
        modal.style.display = "none";
        modal.classList.add("hidden");
    }
    movEditId = null;
    // Remover listener de barcode
    if (window._barcodeListener) {
        document.removeEventListener("keydown", window._barcodeListener);
        window._barcodeListener = null;
    }
}


// =======================================================
// MODAL MOVIMENTOS FINANCEIROS
// =======================================================

let _barcodeBuffer = "";
let _barcodeTimer  = null;

async function abrirModalMovimento(mov = null) {
    const modal = document.getElementById("modalMovimento");
    if (!modal) return;

    movEditId = mov?.id || null;

    // Título
    const titulo = modal.querySelector("h2, .modal-title, [id*='titulo'], [id*='Titulo']");
    if (titulo) titulo.textContent = mov ? "✏️ Editar Movimento" : "＋ Novo Movimento";

    // Reset dos campos
    const campos = ["movReferencia","movData","movNif","movFornecedor","movTotal","movIva","movBase","movObs"];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const movMsg = document.getElementById("movMsg");
    if (movMsg) movMsg.textContent = "";

    // Defaults para novo
    if (!mov) {
        const hoje = new Date().toISOString().split("T")[0];
        const dataEl = document.getElementById("movData");
        if (dataEl) dataEl.value = hoje;
        const tipoEl = document.getElementById("movTipo");
        if (tipoEl) tipoEl.value = "saida";
        const ivaEl = document.getElementById("movIva");
        if (ivaEl) ivaEl.value = "23";
        const estadoEl = document.getElementById("movEstado");
        if (estadoEl) estadoEl.value = "pago";
    } else {
        // Modo edição — preencher campos
        const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
        set("movReferencia", mov.referencia);
        set("movData",       mov.data_documento);
        set("movTipo",       mov.tipo);
        set("movTotal",      mov.valor_total);
        set("movIva",        mov.iva);
        set("movBase",       mov.valor_base);
        set("movEstado",     mov.estado_pagamento);
        set("movCategoria",  mov.categoria_id);
        set("movObra",       mov.obra_id);
        set("movObs",        mov.observacoes);

        // Preencher fornecedor
        if (mov.fornecedor_id) {
            const { data: forn } = await SB.from("fornecedores").select("nif, nome").eq("id", mov.fornecedor_id).maybeSingle();
            if (forn) {
                set("movNif",        forn.nif || "");
                set("movFornecedor", forn.nome || "");
            }
        }

        // Carregar imputações de serviços
        const contImput = document.getElementById("imputacaoServicosContainer");
        if (contImput && mov.obra_id) {
            await carregarServicosImputacao(mov.obra_id, mov.id);
        }
    }

    // Mostrar modal — igual ao padrão dos outros modais
    // Limpar display inline (pode ter ficado de um fechar anterior)
    modal.style.display = "";
    modal.classList.remove("hidden");

    // Focar referência para o leitor de barras
    setTimeout(() => {
        const refEl = document.getElementById("movReferencia");
        if (refEl) {
            refEl.focus();
            refEl.select();
        }
    }, 100);

    // ── Leitor de código de barras (USB/Bluetooth — funciona como teclado) ──
    // O leitor escreve os caracteres muito rápido e faz Enter no fim
    // Detectamos isso pelo intervalo entre keystrokes (< 50ms = leitor, > 100ms = humano)
    activarLeituraBarcode();
}

function activarLeituraBarcode() {
    // Limpar listener anterior se existir
    if (window._barcodeListener) {
        document.removeEventListener("keydown", window._barcodeListener);
    }

    const THRESHOLD_MS = 80; // keystroke mais rápido que isto = leitor

    window._barcodeListener = function(e) {
        // Só activo quando o modal está aberto
        const modal = document.getElementById("modalMovimento");
        if (!modal || modal.style.display === "none" || modal.classList.contains("hidden")) {
            document.removeEventListener("keydown", window._barcodeListener);
            window._barcodeListener = null;
            return;
        }

        // Ignorar se o foco está num input que não é a referência
        const active = document.activeElement;
        const isRefInput = active?.id === "movReferencia";

        // Enter = possível fim de scan
        if (e.key === "Enter" && _barcodeBuffer.length > 3) {
            e.preventDefault();
            const codigo = _barcodeBuffer.trim();
            _barcodeBuffer = "";

            // Detectar se é um QR AT de fatura (tem * e : no formato AT)
            const isQrAT = codigo.includes('*') && codigo.includes(':') &&
                           (codigo.startsWith('A:') || codigo.includes('*A:'));

            if (isQrAT) {
                // Parser completo AT — preenche todos os campos
                parsearQRFatura(codigo);
            } else {
                // Código simples (barras 1D, EAN, etc.) — vai para referência
                const refEl = document.getElementById("movReferencia");
                if (refEl) {
                    refEl.value = codigo;
                    refEl.style.background = "rgba(74,222,128,.1)";
                    refEl.style.borderColor = "rgba(74,222,128,.4)";
                    setTimeout(() => { refEl.style.background = ""; refEl.style.borderColor = ""; }, 1500);
                }
                setTimeout(() => document.getElementById("movNif")?.focus(), 50);
            }
            return;
        }

        // Acumular caracteres com timing rápido
        if (_barcodeTimer) clearTimeout(_barcodeTimer);

        if (e.key.length === 1 || e.key === "Shift") {
            if (e.key !== "Shift") _barcodeBuffer += e.key;
            _barcodeTimer = setTimeout(() => {
                // Se passou tempo suficiente sem novo caractere, era digitação humana
                _barcodeBuffer = "";
            }, THRESHOLD_MS * 3);
        } else if (e.key !== "Enter") {
            // Tecla especial que não é Enter — reset
            _barcodeBuffer = "";
        }
    };

    document.addEventListener("keydown", window._barcodeListener);
}

// Badge visual no campo referência para indicar que aceita barcode
function mostrarBadgeBarcode() {
    const refEl = document.getElementById("movReferencia");
    if (!refEl) return;
    const wrap = refEl.parentElement;
    if (!wrap || wrap.querySelector(".barcode-badge")) return;

    const badge = document.createElement("div");
    badge.className = "barcode-badge";
    badge.style.cssText = "font-size:11px;color:var(--text-muted,#888);margin-top:3px;display:flex;align-items:center;gap:4px";
    badge.innerHTML = `<span style="font-size:14px">📷</span> Aponta o leitor de barras para preencher automaticamente`;
    wrap.appendChild(badge);
}

// Chamar mostrarBadgeBarcode sempre que o modal abre (patch no abrirModalMovimento)
const _abrirModalMovOrig = abrirModalMovimento;

// =======================================================
async function guardarMovimento() {
    const dataDoc    = document.getElementById("movData")?.value;
    const valor_total = Number(document.getElementById("movTotal")?.value);
    const movMsg     = document.getElementById("movMsg");

    if (!dataDoc || isNaN(valor_total) || valor_total === 0) {
        movMsg.textContent = "Data e valor total são obrigatórios.";
        return;
    }

    const nif  = document.getElementById("movNif")?.value?.trim();
    const nome = document.getElementById("movFornecedor")?.value?.trim();
    let fornecedor_id = null;

    if (nif) {
        const { data: ex } = await SB.from("fornecedores").select("id").eq("nif", nif).maybeSingle();
        if (ex) {
            fornecedor_id = ex.id;
        } else {
            const { data: novo, error: ef } = await SB.from("fornecedores")
                .insert({ nif, nome }).select("id").single();
            if (ef) { movMsg.textContent = "Erro fornecedor: " + ef.message; return; }
            fornecedor_id = novo.id;
        }
    }

    const payload = {
        referencia:       document.getElementById("movReferencia")?.value?.trim() || null,
        data_documento:   dataDoc,
        tipo:             document.getElementById("movTipo")?.value,
        fornecedor_id,
        categoria_id:     document.getElementById("movCategoria")?.value || null,
        obra_id:          document.getElementById("movObra")?.value || null,
        valor_base:       Number(document.getElementById("movBase")?.value) || 0,
        iva:              Number(document.getElementById("movIva")?.value) || 0,
        valor_total,
        estado_pagamento: document.getElementById("movEstado")?.value,
        observacoes:      document.getElementById("movObs")?.value?.trim() || null
    };

    const { data: movSalvo, error } = movEditId
        ? await SB.from("movimentos_financeiros").update(payload).eq("id", movEditId).select("id").single()
        : await SB.from("movimentos_financeiros").insert(payload).select("id").single();

    if (error) { movMsg.textContent = "Erro: " + error.message; return; }

    // Imputar a serviços se existirem linhas de imputação
    const movId = movSalvo?.id || movEditId;
    const linhasImput = document.querySelectorAll(".linha-imput-serv");
    if (movId && linhasImput.length) {
        // Remover imputações anteriores se for edição
        if (movEditId) await SB.from("movimento_servicos").delete().eq("movimento_id", movEditId);
        const imputacoes = [];
        linhasImput.forEach(linha => {
            const sid = linha.querySelector(".imput-serv-sel")?.value;
            const val = parseFloat(linha.querySelector(".imput-serv-val")?.value);
            if (sid && val > 0) imputacoes.push({ movimento_id: movId, obra_servico_id: sid, valor: val });
        });
        if (imputacoes.length) await SB.from("movimento_servicos").insert(imputacoes);
    }

    fecharModalMovimento();
    await carregarMovimentos();
}

async function apagarMovimento(id, ref) {
    if (!confirm(`Apagar movimento "${ref || id}"?`)) return;
    const { error } = await SB.from("movimentos_financeiros").delete().eq("id", id);
    if (error) { alert("Erro: " + error.message); return; }
    await carregarMovimentos();
}

// =======================================================
// EVENTOS GLOBAIS
// =======================================================
function ligarEventosGlobais() {
    // Pesquisa inventário
    document.getElementById("pesquisaInventario")?.addEventListener("input", function () {
        const f = this.value.toLowerCase();
        document.querySelectorAll("#tabelaArtigos tbody tr")
            .forEach(tr => { tr.style.display = tr.innerText.toLowerCase().includes(f) ? "" : "none"; });
    });

    // Funcionários — modal
    document.getElementById("btnNovoFuncionario")?.addEventListener("click", () => abrirModalFuncionario());
    document.getElementById("guardarFuncionarioBtn")?.addEventListener("click", guardarFuncionario);
    document.getElementById("btnRevogarDispositivo")?.addEventListener("click", revogarDispositivoFuncionario);
    document.getElementById("modalFuncionario")?.addEventListener("click", e => {
        if (e.target.id === "modalFuncionario") fecharModalFuncionario();
    });

    // Pesquisa funcionários
    document.getElementById("pesquisaFuncionarios")?.addEventListener("input", function () {
        const f = this.value.toLowerCase();
        document.querySelectorAll("#tabelaFuncionarios tbody tr")
            .forEach(tr => { tr.style.display = tr.innerText.toLowerCase().includes(f) ? "" : "none"; });
    });

    // Obras — filtro e eventos
    document.getElementById("pesquisaObras")?.addEventListener("input", function () {
        const f = this.value.toLowerCase();
        document.querySelectorAll("#tabelaObras tbody tr")
            .forEach(tr => { tr.style.display = tr.innerText.toLowerCase().includes(f) ? "" : "none"; });
    });
    document.getElementById("btnNovaObra")?.addEventListener("click", () => abrirTab("gerarqr"));
    document.getElementById("modalQR")?.addEventListener("click", e => {
        if (e.target.id === "modalQR") fecharModalQR();
    });

    // Inventário — modal
    document.getElementById("btnNovoArtigo")?.addEventListener("click", () => abrirModalArtigo());
    document.getElementById("guardarArtigoBtn")?.addEventListener("click", guardarArtigo);
    document.getElementById("fecharModalBtn")?.addEventListener("click", fecharModalArtigo);

    // Etiquetas QR
    document.getElementById("btnImprimirDirecto")?.addEventListener("click", imprimirEtiquetaDirecta);
    document.getElementById("btnAdicionarLote")?.addEventListener("click", adicionarAoLote);
    document.getElementById("btnImprimirLote")?.addEventListener("click", imprimirLote);
    document.getElementById("fecharModalEtiquetaBtn")?.addEventListener("click", fecharModalEtiqueta);
    document.getElementById("modalEtiqueta")?.addEventListener("click", e => {
        if (e.target.id === "modalEtiqueta") fecharModalEtiqueta();
    });

    // Movimentos stock — filtros
    ["filtroMovArtigo","filtroMovFunc","filtroMovObra","filtroMovInicio","filtroMovFim"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", carregarMovimentosStock);
        document.getElementById(id)?.addEventListener("input",  carregarMovimentosStock);
    });
    document.getElementById("btnLimparFiltrosMov")?.addEventListener("click", () => {
        ["filtroMovArtigo","filtroMovFunc","filtroMovObra","filtroMovInicio","filtroMovFim"]
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        carregarMovimentosStock();
    });
    document.getElementById("modalArtigo")?.addEventListener("click", e => {
        if (e.target.id === "modalArtigo") fecharModalArtigo();
    });

    document.getElementById("modalHistorico")?.addEventListener("click", e => {
        if (e.target.id === "modalHistorico") fecharModalHistorico();
    });

    // Fluxo — modal
    document.getElementById("btnNovoMovimento")?.addEventListener("click", () => abrirModalMovimento());

    // Filtros rápidos de estado (Fluxo de Caixa)
    document.querySelectorAll(".btn-filtro-estado").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".btn-filtro-estado").forEach(b => {
                b.style.background = "rgba(255,255,255,.06)";
                b.style.color = "var(--text-muted)";
                b.style.borderColor = "rgba(255,255,255,.1)";
            });
            btn.style.background = "rgba(244,185,66,.15)";
            btn.style.color = "var(--primary)";
            btn.style.borderColor = "rgba(244,185,66,.4)";
            const estado = btn.dataset.estado;
            filtrarPorEstado(estado);
        });
    });
    document.getElementById("btnScanQR")?.addEventListener("click", iniciarScanQR);
    document.getElementById("btnGuardarMov")?.addEventListener("click", guardarMovimento);
    document.getElementById("fecharModalMovBtn")?.addEventListener("click", fecharModalMovimento);
    document.getElementById("modalMovimento")?.addEventListener("click", e => {
        if (e.target.id === "modalMovimento") fecharModalMovimento();
    });

    // Cálculo automático base
    function calcularBase() {
        const total = Number(document.getElementById("movTotal")?.value);
        const iva   = Number(document.getElementById("movIva")?.value);
        const base  = document.getElementById("movBase");
        if (base && !isNaN(total) && iva >= 0) base.value = (total / (1 + iva / 100)).toFixed(2);
    }
    document.getElementById("movTotal")?.addEventListener("input", calcularBase);
    document.getElementById("movIva")?.addEventListener("input", calcularBase);

    // Financeiro
    document.getElementById("btnRefreshFinanceiro")?.addEventListener("click", carregarFinanceiro);
    document.getElementById("filtroMesFinanceiro")?.addEventListener("change", carregarFinanceiro);

    // Sub-tabs Financeiro
    document.querySelectorAll(".fin-subtab").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.fintab;
            document.querySelectorAll(".fin-subtab").forEach(b => {
                b.style.borderBottomColor = "transparent";
                b.style.color = "var(--text-muted)";
            });
            btn.style.borderBottomColor = "var(--primary)";
            btn.style.color = "var(--primary)";
            document.querySelectorAll(".fin-subtab-content").forEach(c => c.style.display = "none");
            document.getElementById(`finTab-${tab}`).style.display = "block";
            if (tab === "dre")    carregarDRE();
            if (tab === "fluxo") carregarFluxo();
            if (tab === "orcado") iniciarOrcadoReal();
        });
    });
    // Definir mês actual por defeito
    const hoje2 = new Date();
    const mesDefault = `${hoje2.getFullYear()}-${String(hoje2.getMonth()+1).padStart(2,"0")}`;
    const filtroMesEl = document.getElementById("filtroMesFinanceiro");
    if (filtroMesEl) filtroMesEl.value = mesDefault;
}

// =======================================================
// ORÇAMENTOS — CRUD + PDF
// =======================================================

let _orcamentos      = [];
let _orcObras        = [];
let _orcEditId       = null;
let _catCounter      = 0;

const CATEGORIAS_DEFAULT = [
    'Demolição e Preparação',
    'Fundações e Estrutura',
    'Alvenaria e Rebocos',
    'Pavimentos e Revestimentos',
    'Carpintaria / Caixilharia',
    'Instalações Eléctricas',
    'Instalações Hidráulicas / AVAC',
    'Pladur',
    'Pintura e Acabamentos',
    'Outros Trabalhos',
];

async function initOrcamentos() {
    await carregarOrcamentos();

    // Ligar eventos
    document.getElementById('pesquisaOrcamentos')?.addEventListener('input', filtrarTabelaOrc);
    document.getElementById('filtroEstadoOrc')?.addEventListener('change', filtrarTabelaOrc);
    document.getElementById('btnNovoOrcamento')?.addEventListener('click', () => abrirModalOrcamento());
}

// ── Carregar lista ──────────────────────────────────────────
async function carregarOrcamentos() {
    const { data, error } = await SB.from('orcamentos')
        .select('*, obras(nome)')
        .order('created_at', { ascending: false });

    const tbody = document.querySelector('#tabelaOrcamentos tbody');
    if (!tbody) return;

    if (error) { tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:red">Erro: ${error.message}</td></tr>`; return; }

    _orcamentos = data || [];

    // KPIs
    const total     = _orcamentos.length;
    const aceites   = _orcamentos.filter(o => o.estado === 'aceite').length;
    const pendentes = _orcamentos.filter(o => ['rascunho','enviado'].includes(o.estado)).length;
    const valor     = _orcamentos.filter(o => o.estado === 'aceite').reduce((s,o) => s + Number(o.total_com_iva||0), 0);

    document.getElementById('orcKpiTotal').textContent    = total;
    document.getElementById('orcKpiAceites').textContent  = aceites;
    document.getElementById('orcKpiPendentes').textContent= pendentes;
    document.getElementById('orcKpiValor').textContent    = valor.toFixed(2) + ' €';

    renderTabelaOrc(_orcamentos);
}

function renderTabelaOrc(lista) {
    const tbody = document.querySelector('#tabelaOrcamentos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.4"><div style="font-size:28px;margin-bottom:8px">\u{1F4CB}</div><div>Sem orçamentos. Clique + para criar.</div></td></tr>';
        return;
    }

    const estadoStyle = {
        rascunho: { bg:'rgba(180,180,180,.12)', cor:'#999',    label:'Rascunho' },
        enviado:  { bg:'rgba(244,185,66,.15)',  cor:'#c8901e', label:'Enviado'  },
        aceite:   { bg:'rgba(42,138,42,.12)',   cor:'#2a8a2a', label:'Aceite'   },
        recusado: { bg:'rgba(229,92,92,.12)',   cor:'#c0392b', label:'Recusado' },
        cancelado:{ bg:'rgba(229,92,92,.08)',   cor:'#999',    label:'Cancelado'},
    };

    lista.forEach(o => {
        const hoje    = new Date().toISOString().split('T')[0];
        const vencido = o.validade && o.validade < hoje && o.estado === 'enviado';
        const est     = estadoStyle[o.estado] || estadoStyle.rascunho;
        const total   = Number(o.total_com_iva||0);
        const nomeObra= o.obras?.nome || o.obra_descricao || '';
        const dataFmt = d => d ? d.split('-').reverse().join('/') : '—';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onmouseenter = () => tr.style.background = 'rgba(244,185,66,.04)';
        tr.onmouseleave = () => tr.style.background = '';
        tr.innerHTML =
            `<td style="font-family:monospace;font-size:12px;font-weight:600;white-space:nowrap;width:100px;padding:10px 12px">${o.numero || '—'}</td>` +
            `<td style="font-size:12px;opacity:.65;white-space:nowrap;width:90px;padding:10px 12px">${dataFmt(o.data)}</td>` +
            `<td style="padding:10px 12px">
                <div style="font-weight:600;font-size:13px;margin-bottom:2px">${o.cliente_nome || '—'}</div>
                ${nomeObra ? `<div style="font-size:11px;opacity:.45;margin-top:1px">🏗 ${nomeObra}</div>` : ''}
            </td>` +
            `<td style="text-align:right;font-weight:700;font-size:14px;white-space:nowrap;width:120px;padding:10px 12px">
                ${total > 0 ? total.toLocaleString('pt-PT', {minimumFractionDigits:2}) + ' €' : '—'}
            </td>` +
            `<td style="width:120px;padding:10px 12px">
                <span style="background:${est.bg};color:${est.cor};padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600">${est.label}</span>
                ${vencido ? '<div style="font-size:10px;color:#dc2626;margin-top:3px">⚠ Vencido</div>' : ''}
            </td>` +
            `<td style="font-size:12px;white-space:nowrap;width:90px;padding:10px 12px;${vencido ? 'color:#dc2626' : 'opacity:.5'}">${dataFmt(o.validade)}</td>` +
            `<td style="white-space:nowrap;width:120px;padding:8px 12px">
                <div style="display:flex;gap:4px;justify-content:flex-end">
                    <button class="btn-acao btn-e" title="Editar">✏️</button>
                    <button class="btn-acao btn-d" title="Duplicar">📋</button>
                    <button class="btn-acao btn-p" title="PDF">📄</button>
                    <button class="btn-acao btn-x" title="Apagar" style="opacity:.4">🗑️</button>
                </div>
            </td>`;
        tr.querySelector('.btn-e').onclick = e => { e.stopPropagation(); abrirModalOrcamento(o.id); };
        tr.querySelector('.btn-d').onclick = e => { e.stopPropagation(); duplicarOrcamento(o.id); };
        tr.querySelector('.btn-p').onclick = e => { e.stopPropagation(); exportarPDFOrcamento(o.id); };
        tr.querySelector('.btn-x').onclick = e => { e.stopPropagation(); apagarOrcamento(o.id, o.numero); };
        tr.ondblclick = () => abrirModalOrcamento(o.id);
        tbody.appendChild(tr);
    });
;
}
function filtrarTabelaOrc() {
    const q      = document.getElementById('pesquisaOrcamentos')?.value.toLowerCase() || '';
    const estado = document.getElementById('filtroEstadoOrc')?.value || '';
    const filtrado = _orcamentos.filter(o =>
        (!q || (o.numero||'').toLowerCase().includes(q) || (o.cliente_nome||'').toLowerCase().includes(q) || (o.obra_descricao||'').toLowerCase().includes(q)) &&
        (!estado || o.estado === estado)
    );
    renderTabelaOrc(filtrado);
}

// ── Modal ───────────────────────────────────────────────────
async function abrirModalOrcamento(id = null) {
    _orcEditId = id;
    _catCounter = 0;
    document.getElementById('orcCategorias').innerHTML = '';
    document.getElementById('orcMsg').textContent = '';

    // Carregar obras para o select
    if (_orcObras.length === 0) {
        const { data } = await SB.from('obras').select('id, nome').order('nome');
        _orcObras = data || [];
    }
    const selObra = document.getElementById('orcObra');
    selObra.innerHTML = '<option value="">— Sem obra —</option>' +
        _orcObras.map(o => `<option value="${o.id}">${o.nome}</option>`).join('');

    if (id) {
        // Carregar dados do orçamento
        document.getElementById('modalOrcTitulo').textContent = 'Editar Orçamento';
        const [orcRes, catRes] = await Promise.all([
            SB.from('orcamentos').select('*').eq('id', id).single(),
            SB.from('orcamento_categorias').select('*, orcamento_linhas(*)').eq('orcamento_id', id).order('ordem'),
        ]);
        const o = orcRes.data;
        if (!o) return;

        document.getElementById('orcNumero').value    = o.numero || '';
        document.getElementById('orcData').value      = o.data || '';
        document.getElementById('orcValidade').value  = o.validade || '';
        document.getElementById('orcIva').value       = o.taxa_iva || 23;
        document.getElementById('orcObra').value      = o.obra_id || '';
        document.getElementById('orcObraDesc').value  = o.obra_descricao || '';
        document.getElementById('orcClienteNome').value   = o.cliente_nome || '';
        document.getElementById('orcClienteNif').value    = o.cliente_nif || '';
        document.getElementById('orcClienteMorada').value = o.cliente_morada || '';
        document.getElementById('orcClienteEmail').value  = o.cliente_email || '';
        document.getElementById('orcClienteTel').value    = o.cliente_tel || '';
        document.getElementById('orcPrazo').value     = o.prazo_obra || '';
        document.getElementById('orcCondicoes').value = o.condicoes_pag || '';
        document.getElementById('orcNotas').value     = o.notas || '';

        // Carregar categorias e linhas
        (catRes.data || []).forEach(cat => {
            const linhas = (cat.orcamento_linhas || []).sort((a,b) => a.ordem - b.ordem);
            adicionarCategoria(cat.nome, linhas, cat.id);
        });
    } else {
        document.getElementById('modalOrcTitulo').textContent = 'Novo Orçamento';
        document.getElementById('orcNumero').value    = '';
        document.getElementById('orcData').value      = new Date().toISOString().split('T')[0];
        document.getElementById('orcValidade').value  = '';
        document.getElementById('orcIva').value       = 23;
        document.getElementById('orcObra').value      = '';
        document.getElementById('orcObraDesc').value  = '';
        ['orcClienteNome','orcClienteNif','orcClienteMorada','orcClienteEmail','orcClienteTel','orcPrazo','orcCondicoes','orcNotas']
            .forEach(id => { document.getElementById(id).value = ''; });

        // Adicionar categorias default
        CATEGORIAS_DEFAULT.forEach(nome => adicionarCategoria(nome, []));
    }

    actualizarTotaisOrc();
    document.getElementById('modalOrcamento').classList.remove('hidden');
}

function fecharModalOrcamento() {
    document.getElementById('modalOrcamento').classList.add('hidden');
    _orcEditId = null;
}

// ── Categorias e Linhas ─────────────────────────────────────
function adicionarCategoria(nome = '', linhas = [], catDbId = null) {
    const cid = ++_catCounter;
    const container = document.getElementById('orcCategorias');
    const div = document.createElement('div');
    div.className = 'orc-categoria';
    div.dataset.cid = cid;
    if (catDbId) div.dataset.dbId = catDbId;
    div.style.cssText = 'border:1px solid rgba(0,0,0,.1);border-radius:var(--radius-sm);margin-bottom:12px;overflow:hidden';

    const nomeEsc = nome.replace(/"/g, '&quot;');
    div.innerHTML =
        '<div style="background:rgba(244,185,66,.12);padding:10px 14px;display:flex;align-items:center;gap:10px">' +
            '<input value="' + nomeEsc + '" placeholder="Nome da categoria" data-cid="' + cid + '" ' +
                'style="flex:1;border:none;background:transparent;font-family:var(--font-title);font-size:13px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;outline:none;color:var(--text-dark)">' +
            '<span class="cat-subtotal" style="font-family:var(--font-title);font-size:13px;font-weight:600;color:var(--primary-dk,#c8901e);white-space:nowrap;min-width:80px;text-align:right"></span>' +
            '<button onclick="adicionarLinha(' + cid + ',\'mao_obra\')" class="btn-secondary" style="font-size:11px;padding:4px 10px">+ M.O.</button>' +
            '<button onclick="adicionarLinha(' + cid + ',\'material\')" class="btn-secondary" style="font-size:11px;padding:4px 10px">+ Mat.</button>' +
            '<button onclick="adicionarLinha(' + cid + ',\'outro\')" class="btn-secondary" style="font-size:11px;padding:4px 10px">+ Outro</button>' +
            '<button onclick="this.closest(\'.orc-categoria\').remove();actualizarTotaisOrc()" style="background:none;border:none;cursor:pointer;opacity:.4;font-size:18px;padding:0 4px">×</button>' +
        '</div>' +
        '<div class="orc-linhas" data-cid="' + cid + '" style="padding:0"></div>';

    container.appendChild(div);
    linhas.forEach(l => adicionarLinha(cid, l.tipo, l));
    if (linhas.length === 0) {
        adicionarLinha(cid, 'mao_obra');
        adicionarLinha(cid, 'material');
    }
}
let _linhaCounter = 0;

function adicionarLinha(cid, tipo = 'material', dados = null) {
    const linhasDiv = document.querySelector(`.orc-linhas[data-cid="${cid}"]`);
    if (!linhasDiv) return;
    const lid = ++_linhaCounter;

    const tipoCor = {
        mao_obra: 'rgba(42,138,42,.07)',
        material: 'rgba(74,144,226,.07)',
        outro:    'rgba(244,185,66,.07)'
    };
    const tipoBadge = {
        mao_obra: { label:'Mão Obra', cor:'#4ade80' },
        material: { label:'Material', cor:'#60a5fa' },
        outro:    { label:'Outro',    cor:'#f4b942' }
    };

    const div = document.createElement('div');
    div.className = 'orc-linha';
    div.dataset.lid  = lid;
    div.dataset.tipo = tipo;
    if (dados?.id) div.dataset.dbId = dados.id;

    if (tipo === 'mao_obra') {
        // MO: Descrição | Nº Pessoas | Horas | €/hora | = Subtotal linha
        const nPessoas = dados?.n_pessoas || 1;
        const horas    = dados?.horas     || (dados?.quantidade || 1);
        const vHora    = dados?.preco_unitario || '';
        div.style.cssText = `background:${tipoCor.mao_obra};border-bottom:1px solid rgba(0,0,0,.04)`;
        div.innerHTML = `
        <div style="display:grid;grid-template-columns:24px 1fr 70px 70px 90px 100px 28px;gap:0;align-items:center;padding:5px 14px">
            <span style="font-size:10px;opacity:.3">${lid}</span>
            <input value="${dados?.descricao||''}" placeholder="Descrição do trabalho" data-field="descricao"
                style="border:none;background:transparent;font-size:13px;padding:3px 6px;outline:none">
            <input value="${nPessoas}" type="number" min="1" step="1" data-field="n_pessoas" placeholder="Pess."
                style="border:none;background:rgba(0,0,0,.06);border-radius:4px;font-size:12px;padding:3px 5px;text-align:center;outline:none;width:100%"
                oninput="calcLinhaMO(this)" title="Nº de pessoas">
            <input value="${horas}" type="number" min="0" step="0.5" data-field="quantidade" placeholder="Horas"
                style="border:none;background:rgba(0,0,0,.06);border-radius:4px;font-size:12px;padding:3px 5px;text-align:center;outline:none;width:100%"
                oninput="calcLinhaMO(this)" title="Nº de horas">
            <input value="${vHora}" type="number" min="0" step="0.01" data-field="preco_unitario" placeholder="€/hora"
                style="border:none;background:rgba(0,0,0,.06);border-radius:4px;font-size:12px;padding:3px 5px;text-align:right;outline:none;width:100%"
                oninput="calcLinhaMO(this)" title="Valor por hora">
            <div data-subtotal class="linha-subtotal"
                style="font-family:var(--font-title);font-size:13px;font-weight:500;text-align:right;padding:3px 6px;color:var(--primary-dk,#c8901e)">
                ${nPessoas && horas && vHora ? (nPessoas*horas*vHora).toFixed(2)+' €' : '—'}
            </div>
            <button onclick="this.closest('.orc-linha').remove();actualizarTotaisOrc()"
                style="background:none;border:none;cursor:pointer;opacity:.25;font-size:16px;padding:0;text-align:center">×</button>
        </div>
        <div style="padding:1px 14px 4px 48px;display:flex;gap:6px;align-items:center">
            <span style="font-size:10px;background:rgba(74,222,128,.15);color:#4ade80;padding:1px 7px;border-radius:6px;font-weight:600;letter-spacing:.3px">MO</span>
            <span style="font-size:10px;color:rgba(0,0,0,.3)">Pessoas × Horas × €/hora</span>
        </div>`;
    } else {
        // Material / Outro: Descrição | Unidade | Qtd | €/un | = Subtotal linha
        const qtd = dados?.quantidade || 1;
        const pu  = dados?.preco_unitario || '';
        const sub = qtd && pu ? (qtd * pu).toFixed(2)+' €' : '—';
        const badge = tipoBadge[tipo];
        div.style.cssText = `background:${tipoCor[tipo]||''};border-bottom:1px solid rgba(0,0,0,.04)`;
        div.innerHTML = `
        <div style="display:grid;grid-template-columns:24px 1fr 60px 80px 90px 100px 28px;gap:0;align-items:center;padding:5px 14px">
            <span style="font-size:10px;opacity:.3">${lid}</span>
            <input value="${dados?.descricao||''}" placeholder="Descrição do artigo / trabalho" data-field="descricao"
                style="border:none;background:transparent;font-size:13px;padding:3px 6px;outline:none">
            <input value="${dados?.unidade||'un'}" data-field="unidade"
                style="border:none;background:rgba(0,0,0,.06);border-radius:4px;font-size:12px;padding:3px 4px;text-align:center;outline:none;width:100%">
            <input value="${qtd}" type="number" min="0" step="0.01" data-field="quantidade"
                style="border:none;background:rgba(0,0,0,.06);border-radius:4px;font-size:12px;padding:3px 6px;text-align:right;outline:none;width:100%"
                oninput="calcLinhaMatOuOutro(this)">
            <input value="${pu}" type="number" min="0" step="0.01" placeholder="0.00" data-field="preco_unitario"
                style="border:none;background:rgba(0,0,0,.06);border-radius:4px;font-size:12px;padding:3px 6px;text-align:right;outline:none;width:100%"
                oninput="calcLinhaMatOuOutro(this)">
            <div data-subtotal class="linha-subtotal"
                style="font-family:var(--font-title);font-size:13px;font-weight:500;text-align:right;padding:3px 6px;color:var(--primary-dk,#c8901e)">
                ${sub}
            </div>
            <button onclick="this.closest('.orc-linha').remove();actualizarTotaisOrc()"
                style="background:none;border:none;cursor:pointer;opacity:.25;font-size:16px;padding:0;text-align:center">×</button>
        </div>
        <div style="padding:1px 14px 4px 48px">
            <span style="font-size:10px;background:rgba(${tipo==='material'?'74,144,226':'244,185,66'},.15);color:${badge.cor};padding:1px 7px;border-radius:6px;font-weight:600;letter-spacing:.3px">${badge.label.toUpperCase()}</span>
        </div>`;
    }

    linhasDiv.appendChild(div);
    // Ligar autocomplete da biblioteca ao input de descrição
    const descInput = div.querySelector('[data-field="descricao"]');
    if (descInput) ligarAutocompleteBiblioteca(descInput, cid);
    actualizarTotaisOrc();
}

// Calcular subtotal linha Mão de Obra
function calcLinhaMO(input) {
    const linha = input.closest('.orc-linha');
    if (!linha) return;
    const n = parseFloat(linha.querySelector('[data-field="n_pessoas"]')?.value) || 0;
    const h = parseFloat(linha.querySelector('[data-field="quantidade"]')?.value) || 0;
    const v = parseFloat(linha.querySelector('[data-field="preco_unitario"]')?.value) || 0;
    const sub = linha.querySelector('[data-subtotal]');
    if (sub) sub.textContent = (n > 0 && h > 0 && v > 0) ? (n*h*v).toFixed(2)+' €' : '—';
    actualizarTotaisOrc();
}

// Calcular subtotal linha Material/Outro
function calcLinhaMatOuOutro(input) {
    const linha = input.closest('.orc-linha');
    if (!linha) return;
    const q = parseFloat(linha.querySelector('[data-field="quantidade"]')?.value) || 0;
    const p = parseFloat(linha.querySelector('[data-field="preco_unitario"]')?.value) || 0;
    const sub = linha.querySelector('[data-subtotal]');
    if (sub) sub.textContent = (q > 0 && p > 0) ? (q*p).toFixed(2)+' €' : '—';
    actualizarTotaisOrc();
}

// ── Totais ──────────────────────────────────────────────────
function actualizarTotaisOrc() {
    let maoObra = 0, materiais = 0, outros = 0;

    document.querySelectorAll('.orc-linha').forEach(linha => {
        let total = 0;
        if (linha.dataset.tipo === 'mao_obra') {
            const n = parseFloat(linha.querySelector('[data-field="n_pessoas"]')?.value) || 0;
            const h = parseFloat(linha.querySelector('[data-field="quantidade"]')?.value) || 0;
            const v = parseFloat(linha.querySelector('[data-field="preco_unitario"]')?.value) || 0;
            total = n * h * v;
        } else {
            const qtd   = parseFloat(linha.querySelector('[data-field="quantidade"]')?.value) || 0;
            const preco = parseFloat(linha.querySelector('[data-field="preco_unitario"]')?.value) || 0;
            total = qtd * preco;
        }
        if (linha.dataset.tipo === 'mao_obra')  maoObra   += total;
        else if (linha.dataset.tipo === 'material') materiais += total;
        else outros += total;
    });

    const semIva  = maoObra + materiais + outros;
    const iva     = semIva * (parseFloat(document.getElementById('orcIva')?.value || 23) / 100);
    const comIva  = semIva + iva;

    const fmt = v => v.toFixed(2) + ' €';
    document.getElementById('totalMaoObra').textContent   = fmt(maoObra);
    document.getElementById('totalMateriais').textContent = fmt(materiais);
    document.getElementById('totalOutros').textContent    = fmt(outros);
    document.getElementById('totalSemIva').textContent    = fmt(semIva);
    document.getElementById('totalIva').textContent       = fmt(iva);
    document.getElementById('totalComIva').textContent    = fmt(comIva);

    // Subtotal por categoria
    document.querySelectorAll('.orc-categoria').forEach(cat => {
        let subCat = 0;
        cat.querySelectorAll('.orc-linha').forEach(linha => {
            if (linha.dataset.tipo === 'mao_obra') {
                const n = parseFloat(linha.querySelector('[data-field="n_pessoas"]')?.value) || 0;
                const h = parseFloat(linha.querySelector('[data-field="quantidade"]')?.value) || 0;
                const v = parseFloat(linha.querySelector('[data-field="preco_unitario"]')?.value) || 0;
                subCat += n * h * v;
            } else {
                const q = parseFloat(linha.querySelector('[data-field="quantidade"]')?.value) || 0;
                const p = parseFloat(linha.querySelector('[data-field="preco_unitario"]')?.value) || 0;
                subCat += q * p;
            }
        });
        const el = cat.querySelector('.cat-subtotal');
        if (el) el.textContent = subCat > 0 ? subCat.toFixed(2) + ' €' : '';
    });
}

document.getElementById('orcIva')?.addEventListener('input', actualizarTotaisOrc);

// ── Guardar ─────────────────────────────────────────────────
async function guardarOrcamento(estado = 'rascunho') {
    const msg = document.getElementById('orcMsg');
    const clienteNome = document.getElementById('orcClienteNome').value.trim();
    if (!clienteNome) { msg.textContent = 'O nome do cliente é obrigatório.'; msg.style.color='var(--color-err)'; return; }

    msg.textContent = 'A guardar...'; msg.style.color = '';

    // Calcular totais
    let maoObra = 0, materiais = 0, outros = 0;
    document.querySelectorAll('.orc-linha').forEach(l => {
        const qtd = parseFloat(l.querySelector('[data-field="quantidade"]')?.value)||0;
        const pu  = parseFloat(l.querySelector('[data-field="preco_unitario"]')?.value)||0;
        const t = qtd*pu;
        if (l.dataset.tipo==='mao_obra') maoObra+=t;
        else if (l.dataset.tipo==='material') materiais+=t;
        else outros+=t;
    });
    const semIva = maoObra+materiais+outros;
    const ivaP   = parseFloat(document.getElementById('orcIva').value)||23;
    const totalI = semIva*(ivaP/100);
    const comIva = semIva+totalI;

    const payload = {
        estado,
        cliente_nome:    clienteNome,
        cliente_nif:     document.getElementById('orcClienteNif').value.trim()||null,
        cliente_morada:  document.getElementById('orcClienteMorada').value.trim()||null,
        cliente_email:   document.getElementById('orcClienteEmail').value.trim()||null,
        cliente_tel:     document.getElementById('orcClienteTel').value.trim()||null,
        data:            document.getElementById('orcData').value||null,
        validade:        document.getElementById('orcValidade').value||null,
        taxa_iva:        ivaP,
        obra_id:         document.getElementById('orcObra').value||null,
        obra_descricao:  document.getElementById('orcObraDesc').value.trim()||null,
        prazo_obra:      document.getElementById('orcPrazo').value.trim()||null,
        condicoes_pag:   document.getElementById('orcCondicoes').value.trim()||null,
        notas:           document.getElementById('orcNotas').value.trim()||null,
        subtotal_mao_obra:  maoObra,
        subtotal_materiais: materiais,
        subtotal_outros:    outros,
        total_sem_iva:   semIva,
        total_iva:       totalI,
        total_com_iva:   comIva,
        updated_at:      new Date().toISOString(),
    };

    let orcId = _orcEditId;

    if (orcId) {
        const { error } = await SB.from('orcamentos').update(payload).eq('id', orcId);
        if (error) { msg.textContent='Erro: '+error.message; msg.style.color='var(--color-err)'; return; }
    } else {
        // Gerar número
        const { data: numData } = await SB.rpc('gerar_numero_orcamento');
        payload.numero = numData || ('ORC-' + Date.now());
        const { data: novo, error } = await SB.from('orcamentos').insert(payload).select('id').single();
        if (error) { msg.textContent='Erro: '+error.message; msg.style.color='var(--color-err)'; return; }
        orcId = novo.id;
        _orcEditId = orcId;
        document.getElementById('orcNumero').value = payload.numero;
    }

    // Guardar categorias e linhas
    // Apagar categorias existentes e reinserir
    if (_orcEditId) {
        await SB.from('orcamento_categorias').delete().eq('orcamento_id', orcId);
    }

    const cats = document.querySelectorAll('.orc-categoria');
    for (let i = 0; i < cats.length; i++) {
        const cat = cats[i];
        const nomeInput = cat.querySelector('input[data-cid]');
        const nomeCat = nomeInput?.value.trim() || 'Categoria';

        const { data: catData, error: catErr } = await SB.from('orcamento_categorias')
            .insert({ orcamento_id: orcId, nome: nomeCat, ordem: i })
            .select('id').single();
        if (catErr) continue;
        const catId = catData.id;

        const linhas = cat.querySelectorAll('.orc-linha');
        const linhasPayload = [];
        for (let j = 0; j < linhas.length; j++) {
            const l = linhas[j];
            const desc = l.querySelector('[data-field="descricao"]')?.value.trim();
            const qtd  = parseFloat(l.querySelector('[data-field="quantidade"]')?.value)||1;
            const pu   = parseFloat(l.querySelector('[data-field="preco_unitario"]')?.value)||0;
            const nPes = parseInt(l.querySelector('[data-field="n_pessoas"]')?.value)||1;
            if (!desc) continue;
            linhasPayload.push({
                orcamento_id: orcId, categoria_id: catId,
                tipo: l.dataset.tipo, descricao: desc,
                unidade: l.querySelector('[data-field="unidade"]')?.value || 'un',
                n_pessoas: nPes,
                quantidade: qtd, preco_unitario: pu, ordem: j
            });
        }
        if (linhasPayload.length) await SB.from('orcamento_linhas').insert(linhasPayload);
    }

    msg.textContent = '✓ Orçamento guardado!'; msg.style.color='var(--color-ok)';
    await carregarOrcamentos();
    // Não fechar — o utilizador permanece no orçamento para continuar a editar
    // Actualizar número se foi criado agora
    if (!_orcEditId && orcId) _orcEditId = orcId;
}

// ── Duplicar ────────────────────────────────────────────────
async function duplicarOrcamento(id) {
    if (!confirm('Duplicar este orçamento?')) return;
    const [orcRes, catRes] = await Promise.all([
        SB.from('orcamentos').select('*').eq('id', id).single(),
        SB.from('orcamento_categorias').select('*, orcamento_linhas(*)').eq('orcamento_id', id).order('ordem'),
    ]);
    const o = orcRes.data;
    if (!o) return;

    const { data: numData } = await SB.rpc('gerar_numero_orcamento');
    const novoPayload = { ...o, id: undefined, numero: numData, estado:'rascunho', duplicado_de: id, created_at: undefined, updated_at: undefined };
    const { data: novo } = await SB.from('orcamentos').insert(novoPayload).select('id').single();
    if (!novo) return;

    for (const cat of (catRes.data || [])) {
        const { data: newCat } = await SB.from('orcamento_categorias')
            .insert({ orcamento_id: novo.id, nome: cat.nome, ordem: cat.ordem }).select('id').single();
        if (!newCat) continue;
        const linhas = (cat.orcamento_linhas || []).map(l => ({
            orcamento_id: novo.id, categoria_id: newCat.id,
            tipo: l.tipo, descricao: l.descricao, unidade: l.unidade,
            quantidade: l.quantidade, preco_unitario: l.preco_unitario, ordem: l.ordem
        }));
        if (linhas.length) await SB.from('orcamento_linhas').insert(linhas);
    }

    await carregarOrcamentos();
}

// ── Apagar ──────────────────────────────────────────────────
async function apagarOrcamento(id, numero) {
    if (!confirm(`Apagar o orçamento ${numero}? Esta acção não pode ser revertida.`)) return;
    await SB.from('orcamentos').delete().eq('id', id);
    await carregarOrcamentos();
}

// ── Exportar PDF ────────────────────────────────────────────
async function exportarPDFOrcamento(id) {
    // Buscar todos os dados
    const [orcRes, catRes] = await Promise.all([
        SB.from('orcamentos').select('*, obras(nome)').eq('id', id).single(),
        SB.from('orcamento_categorias').select('*, orcamento_linhas(*)').eq('orcamento_id', id).order('ordem'),
    ]);
    const o   = orcRes.data;
    const cats = (catRes.data || []).map(c => ({
        ...c,
        linhas: (c.orcamento_linhas || []).sort((a,b) => a.ordem-b.ordem)
    }));

    if (!o) return;

    const fmt  = v => Number(v||0).toFixed(2);
    const ivaP = Number(o.taxa_iva||23);

    // Gerar HTML do PDF
    let tabelaHTML = '';
    cats.forEach(cat => {
        if (!cat.linhas.length) return;
        tabelaHTML += `
            <tr class="cat-header">
                <td colspan="6">${cat.nome.toUpperCase()}</td>
            </tr>`;
        cat.linhas.forEach(l => {
            const total = Number(l.quantidade) * Number(l.preco_unitario);
            const tipoLabel = { mao_obra:'M.O.', material:'Mat.', outro:'Outro' }[l.tipo] || '';
            tabelaHTML += `
            <tr>
                <td class="tipo-badge tipo-${l.tipo}">${tipoLabel}</td>
                <td>${l.descricao}</td>
                <td class="num">${l.unidade||'vg'}</td>
                <td class="num">${Number(l.quantidade).toFixed(2)}</td>
                <td class="num">${fmt(l.preco_unitario)} €</td>
                <td class="num">${fmt(total)} €</td>
            </tr>`;
        });
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>Orçamento ${o.numero}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Inter',sans-serif; font-size:11px; color:#222; background:#fff; padding:28px 32px; }

  /* Header */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px; padding-bottom:20px; border-bottom:2px solid #f4b942; }
  .logo-area { }
  .empresa-nome { font-family:'Oswald',sans-serif; font-size:22px; font-weight:500; letter-spacing:2px; text-transform:uppercase; color:#1a1a1a; }
  .empresa-sub  { font-size:10px; color:#888; letter-spacing:1px; text-transform:uppercase; margin-top:2px; }
  .orc-info { text-align:right; }
  .orc-numero { font-family:'Oswald',sans-serif; font-size:20px; font-weight:600; color:#f4b942; letter-spacing:1px; }
  .orc-estado { display:inline-block; padding:2px 10px; border-radius:4px; font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; margin-top:4px; background:rgba(244,185,66,.15); color:#a8845c; }
  .orc-datas  { font-size:10px; color:#888; margin-top:6px; line-height:1.6; }

  /* Cliente + Obra */
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px; }
  .info-box  { background:#faf8f4; border-radius:6px; padding:12px 16px; }
  .info-box h3 { font-family:'Oswald',sans-serif; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#a8845c; margin-bottom:8px; }
  .info-box p  { font-size:11px; line-height:1.7; color:#333; }
  .info-box .destaque { font-weight:600; font-size:12px; color:#1a1a1a; }

  /* Tabela de trabalhos */
  .tabela-titulo { font-family:'Oswald',sans-serif; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#888; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; margin-bottom:20px; }
  thead th { font-family:'Oswald',sans-serif; font-size:10px; letter-spacing:1px; text-transform:uppercase; background:#f4b942; color:#1a1000; padding:7px 10px; text-align:left; }
  thead th.num { text-align:right; }
  .cat-header td { font-family:'Oswald',sans-serif; font-size:11px; font-weight:500; letter-spacing:.8px; background:#f5f2ed; color:#a8845c; padding:6px 10px; border-bottom:1px solid rgba(0,0,0,.06); }
  tbody tr td { padding:5px 10px; border-bottom:1px solid rgba(0,0,0,.05); font-size:11px; vertical-align:middle; }
  tbody tr:last-child td { border-bottom:none; }
  .num { text-align:right; }
  .tipo-badge { font-size:9px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; padding:1px 5px; border-radius:3px; white-space:nowrap; }
  .tipo-mao_obra  { background:rgba(42,138,42,.12);  color:#2a8a2a; }
  .tipo-material  { background:rgba(74,144,226,.12); color:#2a5eb0; }
  .tipo-outro     { background:rgba(244,185,66,.15); color:#a8845c; }

  /* Totais */
  .totais-wrap { display:grid; grid-template-columns:1fr 280px; gap:20px; margin-bottom:24px; }
  .condicoes { background:#faf8f4; border-radius:6px; padding:14px 16px; }
  .condicoes h3 { font-family:'Oswald',sans-serif; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#a8845c; margin-bottom:8px; }
  .condicoes p { font-size:11px; line-height:1.7; color:#333; margin-bottom:6px; }
  .totais-box { }
  .totais-linha { display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid rgba(0,0,0,.06); font-size:11px; }
  .totais-linha.final { border-bottom:none; border-top:2px solid #f4b942; margin-top:4px; padding-top:8px; }
  .totais-linha.final .label { font-family:'Oswald',sans-serif; font-size:14px; font-weight:600; letter-spacing:.5px; }
  .totais-linha.final .valor { font-family:'Oswald',sans-serif; font-size:16px; font-weight:600; color:#a8845c; }
  .totais-linha .label { color:#555; }
  .totais-linha .valor { font-weight:600; }

  /* Assinatura */
  .assinatura-grid { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:32px; padding-top:20px; border-top:1px solid rgba(0,0,0,.1); }
  .assin-box h3 { font-family:'Oswald',sans-serif; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#888; margin-bottom:16px; }
  .assin-linha { border-bottom:1px solid #999; height:36px; margin-bottom:6px; }
  .assin-legenda { font-size:9px; color:#aaa; }

  /* Footer */
  .footer { text-align:center; font-size:9px; color:#aaa; margin-top:24px; padding-top:12px; border-top:1px solid rgba(0,0,0,.06); }

  @media print { body { padding:12px 16px; } }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
    <div class="logo-area">
        <div class="empresa-nome">Maia Solutions</div>
        <div class="empresa-sub">Construção Civil &amp; Remodelações</div>
    </div>
    <div class="orc-info">
        <div class="orc-numero">${o.numero}</div>
        <div class="orc-estado">${{rascunho:'Rascunho',enviado:'Enviado',aceite:'Aceite',recusado:'Recusado'}[o.estado]||o.estado}</div>
        <div class="orc-datas">
            Data: ${o.data || '—'}<br>
            ${o.validade ? 'Válido até: ' + o.validade : ''}
        </div>
    </div>
</div>

<!-- CLIENTE + OBRA -->
<div class="info-grid">
    <div class="info-box">
        <h3>Cliente</h3>
        <p class="destaque">${o.cliente_nome}</p>
        ${o.cliente_nif    ? `<p>NIF: ${o.cliente_nif}</p>` : ''}
        ${o.cliente_morada ? `<p>${o.cliente_morada}</p>` : ''}
        ${o.cliente_email  ? `<p>${o.cliente_email}</p>` : ''}
        ${o.cliente_tel    ? `<p>${o.cliente_tel}</p>` : ''}
    </div>
    <div class="info-box">
        <h3>Obra / Trabalho</h3>
        <p class="destaque">${o.obras?.nome || o.obra_descricao || '—'}</p>
        ${o.prazo_obra ? `<p>Prazo: ${o.prazo_obra}</p>` : ''}
    </div>
</div>

<!-- TABELA DE TRABALHOS -->
<div class="tabela-titulo">Discriminação dos Trabalhos</div>
<table>
    <thead>
        <tr>
            <th style="width:40px">Tipo</th>
            <th>Descrição</th>
            <th class="num" style="width:40px">Un</th>
            <th class="num" style="width:60px">Qtd</th>
            <th class="num" style="width:80px">Preço Un.</th>
            <th class="num" style="width:80px">Total</th>
        </tr>
    </thead>
    <tbody>${tabelaHTML}</tbody>
</table>

<!-- TOTAIS + CONDIÇÕES -->
<div class="totais-wrap">
    <div class="condicoes">
        ${o.condicoes_pag ? `<h3>Condições de Pagamento</h3><p>${o.condicoes_pag}</p>` : ''}
        ${o.notas ? `<h3 style="margin-top:10px">Notas</h3><p>${o.notas}</p>` : ''}
    </div>
    <div class="totais-box">
        <div class="totais-linha"><span class="label">Mão de Obra</span><span class="valor">${fmt(o.subtotal_mao_obra)} €</span></div>
        <div class="totais-linha"><span class="label">Materiais</span><span class="valor">${fmt(o.subtotal_materiais)} €</span></div>
        ${Number(o.subtotal_outros)>0 ? `<div class="totais-linha"><span class="label">Outros</span><span class="valor">${fmt(o.subtotal_outros)} €</span></div>` : ''}
        <div class="totais-linha"><span class="label">Subtotal s/ IVA</span><span class="valor">${fmt(o.total_sem_iva)} €</span></div>
        <div class="totais-linha"><span class="label">IVA ${ivaP}%</span><span class="valor">${fmt(o.total_iva)} €</span></div>
        <div class="totais-linha final"><span class="label">Total</span><span class="valor">${fmt(o.total_com_iva)} €</span></div>
    </div>
</div>

<!-- ASSINATURAS -->
<div class="assinatura-grid">
    <div class="assin-box">
        <h3>Maia Solutions</h3>
        <div class="assin-linha"></div>
        <div class="assin-legenda">Assinatura e carimbo</div>
    </div>
    <div class="assin-box">
        <h3>Cliente — ${o.cliente_nome}</h3>
        <div class="assin-linha"></div>
        <div class="assin-legenda">Assinatura (aceite do orçamento)</div>
    </div>
</div>

<div class="footer">
    Maia Solutions — Construção Civil &amp; Remodelações · ${o.numero} · ${o.data || ''}
</div>

<script>window.print();</script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(htmlContent);
    win.document.close();
}


// =======================================================
// CONFIG TAB
// =======================================================

// =======================================================
// GERAR QR — inicializar select de obras
// =======================================================

function gerarQrTab() {
    const sel = document.getElementById("selectObraQrTab");
    const obraId = sel?.value;
    const obraNome = sel?.options[sel.selectedIndex]?.text || "";
    const output = document.getElementById("qrTabOutput");
    const btnImprimir = document.getElementById("btnImprimirQrTab");
    if (!obraId || !output) return;

    output.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.id = "qrTabCanvas";
    canvas.style.cssText = "border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.3)";
    output.appendChild(canvas);

    const label = document.createElement("div");
    label.style.cssText = "font-size:14px;font-weight:600;opacity:.8;margin-top:8px";
    label.textContent = obraNome;
    output.appendChild(label);

    try {
        new QRious({
            element: canvas,
            value: obraId,
            size: 200,
            background: "#ffffff",
            foreground: "#1a1a1a",
            padding: 10
        });
        if (btnImprimir) btnImprimir.disabled = false;
    } catch(e) {
        output.innerHTML = '<div style="color:#f87171;font-size:13px">Erro ao gerar QR. Tenta o gerador avançado.</div>';
    }
}

function imprimirQrTab() {
    const canvas = document.getElementById("qrTabCanvas");
    const sel = document.getElementById("selectObraQrTab");
    if (!canvas || !sel) return;
    const nome = sel.options[sel.selectedIndex]?.text || "QR";
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>QR — ${nome}</title>
        <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;gap:16px}
        h2{font-size:18px;font-weight:600}@media print{button{display:none}}</style></head>
        <body><h2>${nome}</h2><img src="${canvas.toDataURL()}" style="width:250px;height:250px">
        <button onclick="window.print()">🖨️ Imprimir</button></body></html>`);
    win.document.close();
}

async function initGerarQr() {
    // Preencher select de obras no tab gerar QR (se existir)
    const sel = document.getElementById("selectObraQrTab");
    if (!sel || sel.dataset.loaded) return;
    const { data } = await SB.from("obras").select("id,nome,codigo").eq("estado","ativa").order("nome");
    sel.innerHTML = '<option value="">— Seleccionar obra —</option>' +
        (data||[]).map(o => `<option value="${o.id}" data-codigo="${o.codigo||''}">${o.codigo ? o.codigo+' — ' : ''}${o.nome}</option>`).join("");
    sel.dataset.loaded = "1";
}



function abrirSyncTOC() {
    // Atalho — vai para a tab config
    abrirTab('config');
}



// Auto-complete nos orçamentos: activar quando o modal abre
const _origAbrirModal = abrirModalOrcamento;
abrirModalOrcamento = async function(id) {
    await _origAbrirModal(id);
    setTimeout(iniciarAutoCompleteClientes, 200);
};

// =======================================================


async function importarFornecedoresTOC() {
    const msg = document.getElementById('tocSincMsg');
    msg.textContent = 'A importar fornecedores…'; msg.style.color = '';
    try {
        const forns = await null // TOConline_removido removido();
        for (const f of forns) {
            await SB.from('fornecedores').upsert(
                { nome: f.nome, nif: f.nif || null },
                { onConflict: 'nome' }
            );
        }
        msg.textContent = `✓ ${forns.length} fornecedores sincronizados.`;
        msg.style.color = 'var(--color-ok)';
    } catch(e) {
        msg.textContent = '✗ ' + e.message;
        msg.style.color = 'var(--color-err)';
    }
}

window.addEventListener("load", () => {
    setTimeout(actualizarEstadoTOC, 500);
});
// =======================================================
// DRE — DEMONSTRAÇÃO DE RESULTADOS
// =======================================================
async function carregarDRE() {
    const periodo = document.getElementById("drePeriodo")?.value || "ano";
    const obraId  = document.getElementById("dreObra")?.value || "";
    const hoje = new Date();
    let inicio, fim;
    if (periodo === "mes") {
        inicio = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-01`;
        fim    = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-31`;
    } else if (periodo === "trimestre") {
        const tri = Math.floor(hoje.getMonth() / 3);
        inicio = `${hoje.getFullYear()}-${String(tri*3+1).padStart(2,"0")}-01`;
        fim    = `${hoje.getFullYear()}-${String(Math.min(tri*3+3,12)).padStart(2,"0")}-31`;
    } else if (periodo === "ano") {
        inicio = `${hoje.getFullYear()}-01-01`;
        fim    = `${hoje.getFullYear()}-12-31`;
    } else { inicio = "2000-01-01"; fim = "2099-12-31"; }

    let query = SB.from("movimentos_financeiros")
        .select("tipo, valor_total, categoria_id, categorias_financeiras(nome), estado_pagamento")
        .eq("ativo", true).gte("data_documento", inicio).lte("data_documento", fim);
    if (obraId) query = query.eq("obra_id", obraId);
    const { data } = await query;
    if (!data) return;

    const receitas  = data.filter(m => m.tipo === "entrada");
    const custos    = data.filter(m => m.tipo === "saida");
    const totalRec  = receitas.reduce((s,m) => s + Number(m.valor_total), 0);
    const totalCus  = custos.reduce((s,m) => s + Number(m.valor_total), 0);

    // Custo mão de obra dos registos_admin no mesmo período
    const { data: regAdmin } = await SB.from("registos_admin")
        .select("funcionario_id, data, tipo, obra_id")
        .gte("data", inicio).lte("data", fim);
    const { data: funcsD } = await SB.from("funcionarios").select("id, valor_dia").eq("ativo", true);
    const dpf = {};
    (regAdmin||[]).forEach(r => {
        if (r.tipo === "falta" || !r.obra_id) return;
        if (!dpf[r.funcionario_id]) dpf[r.funcionario_id] = new Set();
        dpf[r.funcionario_id].add(r.data);
    });
    let custoMO = 0;
    (funcsD||[]).forEach(f => { if (f.valor_dia) custoMO += (dpf[f.id]?.size||0) * f.valor_dia; });

    const custoTotal = totalCus + custoMO;
    const resultado  = totalRec - custoTotal;
    const margem     = totalRec > 0 ? (resultado / totalRec * 100) : 0;

    document.getElementById("dreReceitas").textContent = totalRec.toFixed(2) + " €";
    document.getElementById("dreCustos").textContent   = custoTotal.toFixed(2) + " €";
    document.getElementById("dreCustos").title         = `Fornecedores: ${totalCus.toFixed(2)}€ + Mão obra: ${custoMO.toFixed(2)}€`;
    const resEl = document.getElementById("dreResultado");
    resEl.textContent = resultado.toFixed(2) + " €";
    resEl.style.color = resultado >= 0 ? "#5ad65a" : "#ff7a7a";
    document.getElementById("dreMargem").textContent = margem.toFixed(1) + "%";

    const recByCat = {};
    receitas.forEach(m => { const c = m.categorias_financeiras?.nome || "Sem categoria"; recByCat[c] = (recByCat[c]||0) + Number(m.valor_total); });
    document.getElementById("dreDetalheReceitas").innerHTML = Object.entries(recByCat).sort((a,b)=>b[1]-a[1]).map(([cat,val]) =>
        `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
            <span style="opacity:.8">${cat}</span><span style="color:#5ad65a;font-weight:600">${val.toFixed(2)} €</span></div>`
    ).join("") || "<p style='opacity:.4;font-size:13px'>Sem receitas no período</p>";

    const cusByCat = {};
    custos.forEach(m => { const c = m.categorias_financeiras?.nome || "Sem categoria"; cusByCat[c] = (cusByCat[c]||0) + Number(m.valor_total); });
    document.getElementById("dreDetalheCustos").innerHTML = Object.entries(cusByCat).sort((a,b)=>b[1]-a[1]).map(([cat,val]) =>
        `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
            <span style="opacity:.8">${cat}</span><span style="color:#ff7a7a;font-weight:600">${val.toFixed(2)} €</span></div>`
    ).join("") || "<p style='opacity:.4;font-size:13px'>Sem custos no período</p>";

    // Popular select de obras no DRE
    const dreObraEl = document.getElementById("dreObra");
    if (dreObraEl && dreObraEl.options.length <= 1) {
        const { data: obras } = await SB.from("obras").select("id, nome").eq("ativo", true).order("nome");
        (obras||[]).forEach(o => { const opt = document.createElement("option"); opt.value=o.id; opt.textContent=o.nome; dreObraEl.appendChild(opt); });
    }
}

// =======================================================
// FLUXO DE CAIXA — PREVISÃO
// =======================================================
async function carregarFluxo() {
    const horizonte = parseInt(document.getElementById("fluxoHorizonte")?.value || "60");
    const hoje = new Date();
    const fim  = new Date(hoje); fim.setDate(fim.getDate() + horizonte);
    const hojeStr = hoje.toISOString().split("T")[0];
    const fimStr  = fim.toISOString().split("T")[0];

    const [prevRes, atrRes] = await Promise.all([
        SB.from("movimentos_financeiros").select("tipo,valor_total,data_documento,observacoes,fornecedores(nome),obras(nome),referencia")
          .eq("estado_pagamento","por_pagar").eq("ativo",true).gte("data_documento",hojeStr).lte("data_documento",fimStr).order("data_documento"),
        SB.from("movimentos_financeiros").select("tipo,valor_total,data_documento,observacoes,fornecedores(nome),obras(nome),referencia")
          .eq("estado_pagamento","por_pagar").eq("ativo",true).lt("data_documento",hojeStr).order("data_documento")
    ]);

    const previstos = prevRes.data || [];
    const atrasados = atrRes.data  || [];
    const totalEnt  = previstos.filter(m=>m.tipo==="entrada").reduce((s,m)=>s+Number(m.valor_total),0);
    const totalSai  = previstos.filter(m=>m.tipo==="saida").reduce((s,m)=>s+Number(m.valor_total),0);
    const totalAtr  = atrasados.reduce((s,m)=>s+Number(m.valor_total),0);

    document.getElementById("fluxoEntradas").textContent = totalEnt.toFixed(2) + " €";
    document.getElementById("fluxoSaidas").textContent   = totalSai.toFixed(2) + " €";
    document.getElementById("fluxoAtraso").textContent   = totalAtr.toFixed(2) + " €";
    const saldoEl = document.getElementById("fluxoSaldo");
    const saldo = totalEnt - totalSai;
    saldoEl.textContent = saldo.toFixed(2) + " €";
    saldoEl.style.color = saldo >= 0 ? "#5ad65a" : "#ff7a7a";

    const tbody = document.getElementById("fluxoTabela");
    const todos = [...atrasados.map(m=>({...m,atrasado:true})), ...previstos];
    tbody.innerHTML = todos.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:20px;opacity:.4">Sem movimentos pendentes</td></tr>`
        : todos.map(m => {
            const ent = m.tipo==="entrada", atr = m.atrasado;
            const desc = m.fornecedores?.nome || m.observacoes || m.referencia || "—";
            return `<tr style="border-bottom:1px solid rgba(255,255,255,.05)">
                <td style="padding:8px;font-size:13px;${atr?"color:#f97316":""}">${m.data_documento}</td>
                <td style="padding:8px;font-size:13px">${desc}</td>
                <td style="padding:8px;font-size:13px;opacity:.7">${m.obras?.nome||"—"}</td>
                <td style="padding:8px;font-size:13px;text-align:right;color:${ent?"#5ad65a":"#ff7a7a"};font-weight:600">${ent?"+":"–"}${Number(m.valor_total).toFixed(2)} €</td>
                <td style="padding:8px;text-align:center"><span style="font-size:11px;padding:2px 8px;border-radius:12px;background:${atr?"rgba(249,115,22,.15)":"rgba(255,255,255,.08)"};color:${atr?"#f97316":"var(--text-muted)"}">
                    ${atr?"ATRASADO":"Previsto"}</span></td>
            </tr>`;
        }).join("");
}

// =======================================================
// ORÇADO VS. REAL
// =======================================================
async function iniciarOrcadoReal() {
    const sel = document.getElementById("orcadoObra");
    if (sel && sel.options.length <= 1) {
        const { data: obras } = await SB.from("obras").select("id, nome").eq("ativo", true).order("nome");
        (obras||[]).forEach(o => { const opt = document.createElement("option"); opt.value=o.id; opt.textContent=o.nome; sel.appendChild(opt); });
    }
}

async function carregarOrcadoReal() {
    const obraId = document.getElementById("orcadoObra")?.value;
    if (!obraId) { alert("Seleciona uma obra"); return; }

    const [orcRes, gastosRes] = await Promise.all([
        SB.from("orcamentos").select("valor_total").eq("obra_id",obraId).eq("ativo",true).order("criado_em",{ascending:false}).limit(1).maybeSingle(),
        SB.from("movimentos_financeiros").select("valor_total,categoria_id,categorias_financeiras(nome)").eq("obra_id",obraId).eq("tipo","saida").eq("ativo",true)
    ]);

    const totalOrcado = orcRes.data?.valor_total || 0;
    const gastos      = gastosRes.data || [];
    const totalReal   = gastos.reduce((s,m) => s+Number(m.valor_total), 0);
    const desvio      = totalReal - totalOrcado;
    const percent     = totalOrcado > 0 ? (totalReal / totalOrcado * 100) : 0;

    document.getElementById("orcadoTotal").textContent   = totalOrcado > 0 ? totalOrcado.toFixed(2)+" €" : "Sem orçamento";
    document.getElementById("orcadoReal").textContent    = totalReal.toFixed(2) + " €";
    const devEl = document.getElementById("orcadoDesvio");
    devEl.textContent = (desvio>=0?"+":"")+desvio.toFixed(2)+" €";
    devEl.style.color = desvio<=0 ? "#5ad65a" : "#ff7a7a";
    document.getElementById("orcadoPercent").textContent = percent.toFixed(1)+"%";

    const pct = Math.min(percent,100);
    const bar = document.getElementById("orcadoBar");
    bar.style.width      = pct+"%";
    bar.style.background = pct<80?"var(--primary)":pct<100?"#f97316":"#ff7a7a";
    document.getElementById("orcadoBarLabel").textContent = percent.toFixed(1)+"% executado";

    const catMap = {};
    gastos.forEach(m => { const c=m.categorias_financeiras?.nome||"Sem categoria"; catMap[c]=(catMap[c]||0)+Number(m.valor_total); });
    document.getElementById("orcadoTabela").innerHTML = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,val]) =>
        `<tr style="border-bottom:1px solid rgba(255,255,255,.05)">
            <td style="padding:8px;font-size:13px">${cat}</td>
            <td style="padding:8px;font-size:13px;text-align:right;color:#ff7a7a;font-weight:600">${val.toFixed(2)} €</td>
            <td style="padding:8px;font-size:13px;text-align:right;opacity:.6">${totalReal>0?(val/totalReal*100).toFixed(1):0}%</td>
        </tr>`).join("") || `<tr><td colspan="3" style="padding:20px;text-align:center;opacity:.4">Sem gastos registados</td></tr>`;
}

// =======================================================
// NOTIFICAÇÕES — Alertas de pagamentos em atraso + stock baixo
// =======================================================
async function carregarNotificacoes() {
    const hoje = new Date().toISOString().split("T")[0];

    const [atrasadosRes, stockRes] = await Promise.all([
        SB.from("movimentos_financeiros")
            .select("id, tipo, valor_total, data_documento, fornecedores(nome), obras(nome), observacoes")
            .eq("estado_pagamento", "por_pagar")
            .eq("ativo", true)
            .lt("data_documento", hoje)
            .order("data_documento"),
        SB.from("artigos")
            .select("id, descricao, stock_minimo, stock_inicial")
            .not("stock_minimo", "is", null)
            .gt("stock_minimo", 0)
    ]);

    const atrasados = atrasadosRes.data || [];
    const artigos   = stockRes.data    || [];

    // Calcular stock actual para artigos com mínimo
    let stockAlertas = [];
    if (artigos.length > 0) {
        const { data: movs } = await SB.from("movimentos_stock")
            .select("artigo_id, tipo_movimento, quantidade")
            .in("artigo_id", artigos.map(a => a.id));
        const stockPor = {};
        (movs || []).forEach(m => {
            if (!stockPor[m.artigo_id]) stockPor[m.artigo_id] = 0;
            if (m.tipo_movimento === "entrada" || m.tipo_movimento === "ajuste_entrada")
                stockPor[m.artigo_id] += Number(m.quantidade);
            else stockPor[m.artigo_id] -= Number(m.quantidade);
        });
        stockAlertas = artigos.filter(a => {
            const actual = (a.stock_inicial || 0) + (stockPor[a.id] || 0);
            return actual < (a.stock_minimo || 0);
        });
    }

    const total = atrasados.length + stockAlertas.length;
    const badge = document.getElementById("notifBadge");
    const painel = document.getElementById("notifPainel");
    if (!badge || !painel) return;

    if (total === 0) {
        badge.style.display = "none";
        painel.innerHTML = `<div style="padding:20px;text-align:center;opacity:.5;font-size:13px">Sem alertas 👍</div>`;
        return;
    }

    badge.style.display = "flex";
    badge.textContent   = total > 9 ? "9+" : total;

    let html = "";

    if (atrasados.length > 0) {
        const totalAtr = atrasados.reduce((s,m) => s + Number(m.valor_total), 0);
        html += `<div style="padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.08);font-size:11px;font-weight:700;letter-spacing:.05em;opacity:.5;text-transform:uppercase">
            💸 ${atrasados.length} Pagamento(s) em Atraso — ${totalAtr.toFixed(2)} €</div>`;
        atrasados.forEach(m => {
            const desc = m.fornecedores?.nome || m.observacoes || "—";
            const dias = Math.floor((new Date() - new Date(m.data_documento)) / 86400000);
            html += `<div style="padding:10px 16px;border-bottom:1px solid rgba(0,0,0,.06);display:flex;justify-content:space-between;align-items:center;cursor:pointer;transition:background .1s"
                onmouseenter="this.style.background='rgba(0,0,0,.04)'" onmouseleave="this.style.background=''"
                onclick="activarTab('fluxo')">
                <div>
                    <div style="font-size:13px;font-weight:500;color:#1a1a1a">${desc}</div>
                    <div style="font-size:11px;color:#e05c5c;margin-top:2px">${m.data_documento} · ${dias} dia(s) atraso</div>
                </div>
                <div style="font-size:13px;font-weight:700;color:#e05c5c;white-space:nowrap;margin-left:12px">–${Number(m.valor_total).toFixed(2)} €</div>
            </div>`;
        });
    }

    if (stockAlertas.length > 0) {
        html += `<div style="padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.08);font-size:11px;font-weight:700;letter-spacing:.05em;opacity:.5;text-transform:uppercase">
            📦 ${stockAlertas.length} Artigo(s) com Stock Baixo</div>`;
        stockAlertas.forEach(a => {
            html += `<div style="padding:10px 16px;border-bottom:1px solid rgba(0,0,0,.06);display:flex;justify-content:space-between;align-items:center;cursor:pointer"
                onclick="activarTab('inventario')">
                <div style="font-size:13px;font-weight:500;color:#1a1a1a">${a.descricao}</div>
                <div style="font-size:11px;color:#f97316;white-space:nowrap;margin-left:12px">Abaixo do mínimo (${a.stock_minimo})</div>
            </div>`;
        });
    }

    // Adicionar alerta de funcionários sem registo hoje
    const hojeStr = new Date().toISOString().split("T")[0];
    const { data: funcAtivos }    = await SB.from("funcionarios").select("id, nome").eq("ativo", true);
    const { data: registosHoje }  = await SB.from("vw_registos_ponto").select("funcionario").eq("dia", hojeStr);
    const comRegisto = new Set((registosHoje||[]).map(r => r.funcionario));
    const semRegisto = (funcAtivos||[]).filter(f => !comRegisto.has(f.nome));

    if (semRegisto.length > 0) {
        html += `<div style="padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.08);font-size:11px;font-weight:700;letter-spacing:.05em;opacity:.5;text-transform:uppercase">
            👷 ${semRegisto.length} Colaborador(es) Sem Registo Hoje</div>`;
        semRegisto.forEach(f => {
            html += `<div style="padding:8px 16px;border-bottom:1px solid rgba(0,0,0,.06);font-size:13px;color:#1a1a1a;opacity:.7">${f.nome}</div>`;
        });
        badge.style.display = "flex";
        badge.textContent = Math.min(parseInt(badge.textContent||0) + semRegisto.length, 99);
    }

    painel.innerHTML = html;
}

function toggleNotificacoes() {
    const painel = document.getElementById("notifPainel");
    if (!painel) return;
    const visivel = painel.style.display !== "none" && painel.style.display !== "";
    painel.style.display = visivel ? "none" : "block";
}

// Fechar painel ao clicar fora
document.addEventListener("click", e => {
    const wrap = document.getElementById("notifWrap");
    if (wrap && !wrap.contains(e.target)) {
        const painel = document.getElementById("notifPainel");
        if (painel) painel.style.display = "none";
    }
});

// =======================================================
// autorizarTOC — versão definitiva (usa Edge Function para obter URL)
// =======================================================


// =======================================================
// CONFIG — sub-tabs
// =======================================================

// =======================================================
// CONFIG
// =======================================================
function initConfig() {
    initBiblioteca();
}

function switchCfgTab(tab) {
    ["toc","biblioteca"].forEach(t => {
        const btn  = document.getElementById(`cfgTab-${t}`);
        const cont = document.getElementById(`cfgTabContent-${t}`);
        const active = t === tab;
        if (btn) {
            btn.style.background   = active ? "rgba(244,185,66,.15)" : "none";
            btn.style.color        = active ? "var(--primary)" : "var(--text-muted)";
            btn.style.borderBottom = active ? "2px solid var(--primary)" : "2px solid transparent";
        }
        if (cont) cont.style.display = active ? "block" : "none";
    });
    if (tab === "biblioteca") initBiblioteca();
}

// =======================================================
// BIBLIOTECA DE SERVIÇOS
// =======================================================
let _bibServicos = [];
let _bibMateriais = {};

async function initBiblioteca() {
    if (_bibServicos.length) { renderBiblioteca(); return; }
    await carregarBiblioteca();
}

async function carregarBiblioteca() {
    const [sRes, mRes] = await Promise.all([
        SB.from("biblioteca_servicos").select("*").order("categoria").order("ordem").order("nome"),
        SB.from("biblioteca_materiais").select("*").order("ordem")
    ]);
    _bibServicos = sRes.data || [];
    _bibMateriais = {};
    (mRes.data||[]).forEach(m => {
        if (!_bibMateriais[m.servico_id]) _bibMateriais[m.servico_id] = [];
        _bibMateriais[m.servico_id].push(m);
    });
    const cats = [...new Set(_bibServicos.map(s => s.categoria))].sort();
    const sel  = document.getElementById("bibFiltroCategoria");
    if (sel) {
        const atual = sel.value;
        sel.innerHTML = '<option value="">— Todas —</option>' +
            cats.map(c => `<option value="${c}" ${c===atual?'selected':''}>${c}</option>`).join("");
    }
    renderBiblioteca();
}

function renderBiblioteca() {
    const filtro = document.getElementById("bibFiltroCategoria")?.value || "";
    const lista  = filtro ? _bibServicos.filter(s => s.categoria === filtro) : _bibServicos;
    const porCat = {};
    lista.forEach(s => { if (!porCat[s.categoria]) porCat[s.categoria] = []; porCat[s.categoria].push(s); });
    const div = document.getElementById("bibLista");
    if (!div) return;
    if (!lista.length) { div.innerHTML = `<div style="padding:32px;text-align:center;opacity:.4">Sem serviços.</div>`; return; }
    div.innerHTML = Object.entries(porCat).map(([cat, servs]) => `
        <div style="margin-bottom:20px">
            <div style="font-family:var(--font-title);font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.5;margin-bottom:8px;padding-left:4px">${cat}</div>
            <div style="display:flex;flex-direction:column;gap:3px">
                ${servs.map(s => {
                    const mats = _bibMateriais[s.id] || [];
                    const op   = !s.ativo ? 'opacity:.4;' : '';
                    return `<div style="${op}background:var(--bg-dark-panel,#2a2a2a);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px">
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:600;font-size:13px;margin-bottom:4px;display:flex;align-items:center;gap:8px">
                                ${s.nome}
                                <span style="font-size:10px;background:rgba(255,255,255,.08);padding:1px 7px;border-radius:8px;color:rgba(255,255,255,.5);font-weight:400">${s.unidade}</span>
                                ${!s.ativo ? '<span style="font-size:10px;color:#f87171;background:rgba(248,113,113,.1);padding:1px 7px;border-radius:8px">Inactivo</span>' : ''}
                            </div>
                            <div style="font-size:11px;opacity:.5">
                                ${s.rendimento_mo ? `⚡ ${s.rendimento_mo} ${s.unidade}/dia · ` : ''}
                                ${mats.length ? mats.slice(0,3).map(m=>`${m.descricao} ${m.quantidade}${m.unidade}`).join(' · ')+(mats.length>3?'…':'') : 'Sem materiais'}
                            </div>
                        </div>
                        <div style="display:flex;gap:4px;flex-shrink:0">
                            <button onclick="abrirModalBibServico('${s.id}')" style="background:rgba(255,255,255,.08);border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px">✏️</button>
                            <button onclick="toggleBibAtivo('${s.id}',${s.ativo})" style="background:rgba(255,255,255,.05);border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;opacity:.6" title="${s.ativo?'Desactivar':'Activar'}">${s.ativo?'🔕':'🔔'}</button>
                        </div>
                    </div>`;
                }).join("")}
            </div>
        </div>`).join("");
}

function abrirModalBibServico(id) {
    const modal = document.getElementById("modalBibServico");
    const s = id ? _bibServicos.find(s => s.id === id) : null;
    document.getElementById("bibServId").value         = s?.id || "";
    document.getElementById("bibServNome").value       = s?.nome || "";
    document.getElementById("bibServCategoria").value  = s?.categoria || "";
    document.getElementById("bibServUnidade").value    = s?.unidade || "m²";
    document.getElementById("bibServRendimento").value = s?.rendimento_mo || "";
    document.getElementById("modalBibTitulo").textContent = s ? `✏️ ${s.nome}` : "Novo Serviço";
    const cats = [...new Set(_bibServicos.map(s => s.categoria))].sort();
    const dl = document.getElementById("bibCatList");
    if (dl) dl.innerHTML = cats.map(c => `<option value="${c}">`).join("");
    const mats = s ? (_bibMateriais[s.id] || []) : [];
    document.getElementById("bibMatLinhas").innerHTML = "";
    if (mats.length) mats.forEach(m => adicionarLinhaBibMat(m));
    else adicionarLinhaBibMat();
    modal.style.display = "flex";
}

function fecharModalBibServico() {
    document.getElementById("modalBibServico").style.display = "none";
}

function adicionarLinhaBibMat(mat = null) {
    const cont = document.getElementById("bibMatLinhas");
    const div  = document.createElement("div");
    div.className = "bib-mat-linha";
    div.style.cssText = "display:grid;grid-template-columns:1fr 80px 70px 28px;gap:6px;align-items:center";
    if (mat?.id) div.dataset.id = mat.id;
    div.innerHTML = `
        <input value="${mat?.descricao||''}" placeholder="Nome do material" data-field="descricao"
            style="padding:6px 8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#fff;font-size:12px;outline:none">
        <input value="${mat?.quantidade||''}" type="number" step="0.001" min="0" placeholder="Qtd" data-field="quantidade"
            style="padding:6px 8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#fff;font-size:12px;text-align:right;outline:none">
        <select data-field="unidade"
            style="padding:6px 4px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#fff;font-size:12px">
            ${["kg","L","m²","ml","m³","un","saco","rolo","cx"].map(u=>`<option ${u===(mat?.unidade||'un')?'selected':''}>${u}</option>`).join("")}
        </select>
        <button onclick="this.closest('.bib-mat-linha').remove()" style="background:rgba(248,113,113,.1);border:none;border-radius:6px;padding:5px;cursor:pointer;font-size:14px;opacity:.7">×</button>`;
    cont.appendChild(div);
}

async function guardarBibServico() {
    const id        = document.getElementById("bibServId").value;
    const nome      = document.getElementById("bibServNome").value.trim();
    const categoria = document.getElementById("bibServCategoria").value.trim();
    const unidade   = document.getElementById("bibServUnidade").value;
    const rend      = parseFloat(document.getElementById("bibServRendimento").value) || null;
    if (!nome || !categoria) { alert("Nome e categoria são obrigatórios."); return; }
    const payload = { nome, categoria, unidade, rendimento_mo: rend };
    let servId = id;
    if (id) {
        await SB.from("biblioteca_servicos").update(payload).eq("id", id);
    } else {
        const { data } = await SB.from("biblioteca_servicos").insert(payload).select("id").single();
        servId = data?.id;
    }
    if (!servId) { alert("Erro ao guardar."); return; }
    await SB.from("biblioteca_materiais").delete().eq("servico_id", servId);
    const mats = [];
    let ordem = 1;
    document.querySelectorAll(".bib-mat-linha").forEach(l => {
        const desc = l.querySelector('[data-field="descricao"]')?.value?.trim();
        const qtd  = parseFloat(l.querySelector('[data-field="quantidade"]')?.value);
        const un   = l.querySelector('[data-field="unidade"]')?.value;
        if (desc && qtd > 0) mats.push({ servico_id: servId, descricao: desc, quantidade: qtd, unidade: un, ordem: ordem++ });
    });
    if (mats.length) await SB.from("biblioteca_materiais").insert(mats);
    fecharModalBibServico();
    _bibServicos = [];
    await carregarBiblioteca();
}

async function toggleBibAtivo(id, ativo) {
    await SB.from("biblioteca_servicos").update({ ativo: !ativo }).eq("id", id);
    _bibServicos = [];
    await carregarBiblioteca();
}

// =======================================================
// INTEGRAÇÃO NO ORÇAMENTO — autocomplete biblioteca
// =======================================================
async function garantirBibliotecaCarregada() {
    if (_bibServicos.length) return;
    const [sRes, mRes] = await Promise.all([
        SB.from("biblioteca_servicos").select("*").eq("ativo", true).order("categoria").order("ordem"),
        SB.from("biblioteca_materiais").select("*").order("ordem")
    ]);
    _bibServicos = sRes.data || [];
    _bibMateriais = {};
    (mRes.data||[]).forEach(m => {
        if (!_bibMateriais[m.servico_id]) _bibMateriais[m.servico_id] = [];
        _bibMateriais[m.servico_id].push(m);
    });
}

function ligarAutocompleteBiblioteca(inputEl, cid) {
    let popup = null;
    const removePopup = () => { if (popup) { popup.remove(); popup = null; } };

    inputEl.addEventListener("input", async () => {
        const q = inputEl.value.trim().toLowerCase();
        if (q.length < 2) { removePopup(); return; }
        await garantirBibliotecaCarregada();
        const matches = _bibServicos.filter(s => s.ativo && (s.nome.toLowerCase().includes(q) || s.categoria.toLowerCase().includes(q))).slice(0, 8);
        if (!matches.length) { removePopup(); return; }
        removePopup();
        popup = document.createElement("div");
        popup.style.cssText = "position:fixed;z-index:9999;background:#1e1e1e;border:1px solid rgba(255,255,255,.12);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.6);min-width:320px;max-width:420px;overflow:hidden";
        const rect = inputEl.getBoundingClientRect();
        popup.style.top  = (rect.bottom + 4) + "px";
        popup.style.left = rect.left + "px";
        popup.innerHTML =
            '<div style="padding:6px 12px;font-size:10px;letter-spacing:1px;text-transform:uppercase;opacity:.4;border-bottom:1px solid rgba(255,255,255,.06)">🔧 Biblioteca</div>' +
            matches.map(s => `<div class="bib-pp" data-id="${s.id}" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.04)" onmouseenter="this.style.background='rgba(244,185,66,.1)'" onmouseleave="this.style.background=''"><div><div style="font-size:13px;font-weight:500">${s.nome}</div><div style="font-size:11px;opacity:.4">${s.categoria}${s.rendimento_mo?' · '+s.rendimento_mo+' '+s.unidade+'/dia':''}</div></div><span style="font-size:10px;background:rgba(255,255,255,.08);padding:2px 8px;border-radius:8px;color:rgba(255,255,255,.5);margin-left:8px;flex-shrink:0">${s.unidade}</span></div>`).join("");
        document.body.appendChild(popup);
        popup.querySelectorAll(".bib-pp").forEach(el => {
            el.addEventListener("mousedown", e => {
                e.preventDefault();
                aplicarServicoBiblioteca(el.dataset.id, inputEl, cid);
                removePopup();
            });
        });
    });
    inputEl.addEventListener("blur", () => setTimeout(removePopup, 200));
}

async function aplicarServicoBiblioteca(servicoId, inputDescricao, cid) {
    await garantirBibliotecaCarregada();
    const serv = _bibServicos.find(s => s.id === servicoId);
    if (!serv) return;
    inputDescricao.value = serv.nome;
    const linha = inputDescricao.closest(".orc-linha");
    if (linha) {
        const unInput = linha.querySelector('[data-field="unidade"]');
        if (unInput) unInput.value = serv.unidade;
    }
    const mats = _bibMateriais[servicoId] || [];
    if (!mats.length) return;
    const linhasDiv = document.querySelector(`.orc-linhas[data-cid="${cid}"]`);
    if (!linhasDiv) return;
    mats.forEach(m => adicionarLinha(cid, "material", { descricao: `${m.descricao}  [${m.quantidade} ${m.unidade}/un]`, unidade: m.unidade, quantidade: 1, preco_unitario: "" }));
    const info = document.createElement("div");
    info.style.cssText = "background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);border-radius:8px;padding:8px 14px;font-size:12px;color:#4ade80;margin:6px 0";
    info.innerHTML = `✓ <strong>${mats.length} material${mats.length>1?'is':''}</strong> adicionado${mats.length>1?'s':''} da biblioteca. Ajusta a quantidade total do serviço.`;
    linhasDiv.insertBefore(info, linhasDiv.firstChild);
    setTimeout(() => info.remove(), 5000);
}

