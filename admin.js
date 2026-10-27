
// =======================================================
// DARK MODE
// =======================================================
function toggleDark() {
    const isDark = document.body.classList.toggle('dark');
    // O tema escuro é o de arranque; só fica guardado quando alguém escolhe o claro
    try { localStorage.setItem('tema', isDark ? 'escuro' : 'claro'); } catch (e) {}
    const btn = document.getElementById('darkBtn');
    if (btn) { btn.textContent = isDark ? '☀️' : '🌙'; btn.title = isDark ? 'Modo claro' : 'Modo escuro'; }
}

function iniciarDarkMode() {
    let isDark = true;
    try { isDark = localStorage.getItem('tema') !== 'claro'; } catch (e) {}
    document.body.classList.toggle('dark', isDark);
    const btn = document.getElementById('darkBtn');
    if (btn) { btn.textContent = isDark ? '☀️' : '🌙'; btn.title = isDark ? 'Modo claro' : 'Modo escuro'; }
}
iniciarDarkMode();

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
        msg.style.color = "#e09486";
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
    abrirTab(tabPedidaNoEndereco() || "visaogeral");
    carregarNotificacoes(); // Carregar alertas iniciais
    tratarAccaoNoEndereco();
}

// O assistente manda para aqui com #tab=financeiro ou #ler-fatura.
// Sem hash, nada muda: abre o fluxo como sempre.
function tabPedidaNoEndereco() {
    const m = (location.hash || "").match(/^#tab=([a-z-]+)$/);
    if (!m) return null;
    if (SEPARADOR_ANTIGO[m[1]]) return m[1];
    return document.querySelector(`.tab[data-tab="${m[1]}"]`) ? m[1] : null;
}

function tratarAccaoNoEndereco() {
    if ((location.hash || "") !== "#ler-fatura") return;
    abrirTab("financeiro");
    setTimeout(async () => {
        await abrirModalMovimento();
        // O picker não abre sozinho — os browsers exigem um clique teu.
        const btn = document.getElementById("btnLerFatura");
        if (!btn) return;
        btn.style.transition = "box-shadow .3s";
        btn.style.boxShadow  = "0 0 0 4px rgba(181,136,99,.5)";
        setTimeout(() => { btn.style.boxShadow = ""; }, 2500);
    }, 400);
}

function ativarTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
        btn.onclick = () => abrirTab(btn.dataset.tab);
    });
    document.querySelectorAll(".sec-subtab").forEach(btn => {
        btn.onclick = () => abrirTab(btn.dataset.grupo === "func" ? "funcionarios" : "obras", btn.dataset.sub);
    });
}

// Separadores que passaram a ser sub-separadores de outros.
// Os nomes antigos continuam a funcionar (atalhos, links do "Hoje").
const SEPARADOR_ANTIGO = {
    fluxo:    ["financeiro", "fluxo"],
    registos: ["funcionarios", "registos"],
    gerarqr:  ["obras", "qr"],
};

// Mostra um sub-separador das Obras ("obras") ou dos Funcionários ("func")
function mostrarSecSub(grupo, sub) {
    document.querySelectorAll(`.sec-subtab[data-grupo="${grupo}"]`).forEach(b =>
        b.classList.toggle("active", b.dataset.sub === sub));
    const prefixo = grupo === "func" ? "funcSub-" : "obrasSub-";
    document.querySelectorAll(`[id^="${prefixo}"]`).forEach(c =>
        c.style.display = c.id === prefixo + sub ? "block" : "none");
}

function abrirTab(nome, sub) {
    if (SEPARADOR_ANTIGO[nome]) [nome, sub] = SEPARADOR_ANTIGO[nome];
    const subFin = sub;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    // Esconder sub-conteúdos que usam style.display inline (fin-subtab, reg-subtab)
    document.querySelectorAll(".fin-subtab-content").forEach(c => c.style.display = "none");
    document.querySelectorAll(".reg-subtab-content, [id^='regTabContent-']").forEach(c => c.style.display = "none");
    const tabBtn = document.querySelector(`.tab[data-tab="${nome}"]`);
    const tabDiv = document.getElementById("tab-" + nome);
    if (!tabBtn || !tabDiv) return;
    tabBtn.classList.add("active");
    tabDiv.classList.add("active");
    if (nome === "visaogeral")   initVisaoGeral();
    if (nome === "financeiro")   { switchFinTab(subFin || "ordenados"); }
    if (nome === "dashboard")    initDashboard();
    if (nome === "funcionarios") {
        mostrarSecSub("func", sub || "equipa");
        if (sub === "registos") switchRegTab("ponto");
        else initFuncionarios();
    }
    if (nome === "inventario")   initInventario();
    if (nome === "obras") {
        mostrarSecSub("obras", sub || "lista");
        if (sub === "qr") initGerarQr();
        else initObras();
    }
    if (nome === "orcamentos")    initOrcamentos();
    if (nome === "config")        initConfig();
    if (nome === "planeamento")   initPlaneamento();
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
        btn.style.background   = active ? "rgba(181,136,99,.15)" : "none";
        btn.style.color        = active ? "var(--primary)" : "var(--text-muted)";
        btn.style.borderBottom = active ? "2px solid var(--primary)" : "2px solid transparent";
    });
    document.querySelectorAll(".fin-subtab-content").forEach(c => c.style.display = "none");
    const el = document.getElementById("finTab-" + tab);
    if (el) el.style.display = "block";
    if (tab === "ordenados")  carregarFinanceiro();
    if (tab === "dre")        carregarDRE();
    if (tab === "fluxo")      initFluxo();
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
    document.getElementById("dreResultado").style.color = resultado >= 0 ? "#8fbfa0" : "#e09486";
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
            <span style="opacity:.8">${cat}</span><span style="color:#8fbfa0">${fmt(v.entrada)}</span>
        </div>`).join("") || '<div style="opacity:.4;font-size:13px">Sem receitas</div>';

    document.getElementById("dreDetalheCustos").innerHTML = Object.entries(porCat)
        .filter(([,v]) => v.saida > 0).sort(([,a],[,b]) => b.saida-a.saida)
        .map(([cat,v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
            <span style="opacity:.8">${cat}</span><span style="color:#e09486">${fmt(v.saida)}</span>
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
    document.getElementById("orcadoDesvio").style.color  = desvio >= 0 ? "#8fbfa0" : "#e09486";
    document.getElementById("orcadoPercent").textContent = pct.toFixed(1) + "%";

    const bar = document.getElementById("orcadoBar");
    const barLabel = document.getElementById("orcadoBarLabel");
    if (bar) bar.style.width = Math.min(pct, 100) + "%";
    if (bar) bar.style.background = pct > 100 ? "#e09486" : pct > 80 ? "#f97316" : "#8fbfa0";
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
        div.dataset.data = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        div.onclick = () => {
            filtroDia = new Date(ano, mes, dia);
            document.querySelectorAll(".calendar-day").forEach(d => d.classList.remove("active"));
            div.classList.add("active");
            carregarRegistos();
        };
        grid.appendChild(div);
    }
    // Feriados a vermelho, quando chegarem
    carregarFeriados(ano).then(() => grid.querySelectorAll(".calendar-day").forEach(el => {
        const fer = feriadoEm(el.dataset.data);
        if (fer) { el.style.color = "#e09486"; el.title = `Feriado: ${fer}`; }
    }));
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
            btn.style.background   = active ? "rgba(181,136,99,.15)" : "none";
            btn.style.color        = active ? "var(--primary)" : "var(--text-muted)";
            btn.style.borderBottom = active ? "2px solid var(--primary)" : "2px solid transparent";
        }
        if (cont) {
            cont.style.display    = active ? "block" : "none";
            cont.style.visibility = active ? "visible" : "hidden";
            cont.style.overflow   = "hidden";
        }
    });
    if (tab === "ponto") {
        gerarCalendario();
        carregarRegistos();
    }
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

// Nome de um temporário (funcionario_id null) a partir de observacoes "[TEMP] Nome"
function nomeTempRA(obs) {
    if (!obs) return "Temporário";
    const m = obs.match(/^\[TEMP\]\s*(.*)$/);
    return (m && m[1].trim()) || "Temporário";
}

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
        .select("id, data, tipo, horas, funcionario_id, obra_id, observacoes, funcionarios(id, nome, valor_dia), obras(id, nome)")
        .gte("data", inicio).lte("data", fim)
        .order("data").order("funcionarios(nome)");

    if (error) { raConteudo.innerHTML = `<div style="padding:24px;color:#e09486">Erro: ${error.message}</div>`; return; }
    _raCache = data || [];
    await carregarFeriados(ano);

    // KPIs
    const presMes   = _raCache.filter(r => r.tipo === "presenca");
    const faltasMes = _raCache.filter(r => r.tipo === "falta");
    const totalH    = presMes.reduce((s,r) => s + Number(r.horas||0), 0);
    const funcsUniq = new Set(presMes.map(r => r.funcionarios?.nome)).size;
    const obrasUniq = new Set(presMes.filter(r => r.obras?.nome).map(r => r.obras?.nome)).size;

    document.getElementById("raKpis").innerHTML = [
        { label:"Dias com registo", val: new Set(presMes.map(r=>r.data)).size, cor:"" },
        { label:"Total horas", val: totalH.toFixed(0)+"h", cor:"" },
        { label:"Faltas registadas", val: faltasMes.length, cor:"#a5483d" },
        { label:"Obras activas", val: obrasUniq, cor:"" },
    ].map(k => `<div class="card metric">
        <h3>${k.label}</h3>
        <div class="value"${k.cor?` style="color:${k.cor}"`:""}>${k.val}</div>
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
        const nome = r.funcionarios?.nome || (r.funcionario_id ? "—" : nomeTempRA(r.observacoes));
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
        <tr style="background:var(--primary-lt)">
            <th style="padding:8px 12px;text-align:left;position:sticky;left:0;background:var(--panel-solid);z-index:2;min-width:140px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Funcionário</th>
            ${dias.map(d => {
                const dObj = new Date(d+"T12:00:00");
                const dow  = dObj.getDay();
                const fer  = feriadoEm(d);
                const isWE = dow===0||dow===6||!!fer;
                return `<th style="padding:4px 2px;text-align:center;min-width:28px;font-size:10px;font-weight:500;${isWE?"opacity:.3":""}${fer?";color:#a5483d":""}"${fer?` title="Feriado: ${escHtml(fer)}"`:""}>${String(dObj.getDate()).padStart(2,"0")}</th>`;
            }).join("")}
            <th style="padding:8px 10px;text-align:right;min-width:60px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Dias</th>
            <th style="padding:8px 10px;text-align:right;min-width:60px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Horas</th>
            <th style="padding:8px 10px;text-align:right;min-width:70px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Valor €</th>
        </tr>
    </thead>
    <tbody>`;

    funcs.forEach((func, fi) => {
        const fd  = porFunc[func];
        const bg  = fi%2===1 ? "rgba(0,0,0,.03)" : "transparent";
        const vd  = fd.vd ? Number(fd.vd) : null;
        const val = vd ? (fd.totalDias * vd).toFixed(2)+"€" : "—";

        html += `<tr style="background:${bg};border-bottom:1px solid rgba(0,0,0,.07)">
            <td style="padding:7px 12px;position:sticky;left:0;background:var(--panel-solid);z-index:1;font-weight:500;white-space:nowrap;border-right:1px solid rgba(0,0,0,.1)">${func}</td>
            ${dias.map(d => {
                const dObj = new Date(d+"T12:00:00");
                const dow  = dObj.getDay();
                const isWE = dow===0||dow===6;
                const fer  = feriadoEm(d);
                const reg  = fd.dias[d];
                let bg2 = "transparent", sym = "", title = "";
                if (isWE) { bg2="rgba(0,0,0,.03)"; sym=""; }
                else if (!reg) { if (fer) { bg2="rgba(0,0,0,.03)"; title=`Feriado: ${fer}`; } }
                else if (reg.tipo === "falta") { bg2="rgba(224,148,134,.15)"; sym="✕"; title=reg.obra||"Falta"; }
                else if (reg.horas > 0) {
                    bg2="rgba(143,191,160,.15)"; sym=reg.horas<8?"½":"✓";
                    title = `${reg.obra||""} ${reg.horas}h`;
                }
                return `<td style="text-align:center;padding:3px 2px;background:${bg2};border:1px solid rgba(0,0,0,.05);font-size:11px" title="${escHtml(title)}">${sym}</td>`;
            }).join("")}
            <td style="padding:7px 10px;text-align:right;font-weight:600">${fd.totalDias}</td>
            <td style="padding:7px 10px;text-align:right">${fd.totalH.toFixed(1)}h</td>
            <td style="padding:7px 10px;text-align:right;color:#4f7a63;font-weight:600">${val}</td>
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
        const func = r.funcionarios?.nome || (r.funcionario_id ? "—" : nomeTempRA(r.observacoes));
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
        <tr style="background:var(--primary-lt)">
            <th style="padding:8px 12px;text-align:left;position:sticky;left:0;background:var(--panel-solid);z-index:2;min-width:160px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Obra</th>
            ${dias.map(d => {
                const dObj = new Date(d+"T12:00:00");
                const dow  = dObj.getDay();
                const fer  = feriadoEm(d);
                const isWE = dow===0||dow===6||!!fer;
                return `<th style="padding:4px 2px;text-align:center;min-width:28px;font-size:10px;font-weight:500;${isWE?"opacity:.3":""}${fer?";color:#a5483d":""}"${fer?` title="Feriado: ${escHtml(fer)}"`:""}>${String(dObj.getDate()).padStart(2,"0")}</th>`;
            }).join("")}
            <th style="padding:8px 10px;text-align:right;min-width:60px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Horas</th>
            <th style="padding:8px 10px;text-align:right;min-width:60px;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Colabs.</th>
        </tr>
    </thead>
    <tbody>`;

    obras.forEach((obra, oi) => {
        const od  = porObra[obra];
        const bg  = oi%2===1 ? "rgba(0,0,0,.03)" : "transparent";

        html += `<tr style="background:${bg};border-bottom:1px solid rgba(0,0,0,.07)">
            <td style="padding:7px 12px;position:sticky;left:0;background:var(--panel-solid);z-index:1;font-weight:500;white-space:nowrap;border-right:1px solid rgba(0,0,0,.1)">${obra}</td>
            ${dias.map(d => {
                const dObj = new Date(d+"T12:00:00");
                const dow  = dObj.getDay();
                const isWE = dow===0||dow===6;
                const fer  = feriadoEm(d);
                const reg  = od.dias[d];
                let bg2 = "transparent", sym = "", title = "";
                if (isWE) { bg2="rgba(0,0,0,.03)"; }
                else if (!reg && fer) { bg2="rgba(0,0,0,.03)"; title=`Feriado: ${fer}`; }
                else if (reg) {
                    const nFunc = Object.keys(reg).length;
                    const totalH = Object.values(reg).reduce((s,v)=>s+v,0);
                    bg2 = `rgba(143,191,160,.${Math.min(10+nFunc*6,30)})`;
                    sym = nFunc.toString();
                    title = Object.entries(reg).map(([f,h])=>`${f}: ${h}h`).join(", ");
                }
                return `<td style="text-align:center;padding:3px 2px;background:${bg2};border:1px solid rgba(0,0,0,.05);font-size:11px;font-weight:${reg?"600":"400"}" title="${escHtml(title)}">${sym}</td>`;
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
    <thead style="background:var(--primary-lt)">
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
        const bg  = i%2===1 ? "rgba(0,0,0,.03)" : "transparent";
        const dataFmt = r.data ? r.data.split("-").reverse().join("/") : "—";

        html += `<tr style="background:${bg};border-bottom:1px solid rgba(0,0,0,.05)">
            <td style="padding:7px 12px;font-variant-numeric:tabular-nums">${dataFmt}</td>
            <td style="padding:7px 12px;font-weight:500">${escHtml(r.funcionarios?.nome || (r.funcionario_id ? "—" : nomeTempRA(r.observacoes)))}</td>
            <td style="padding:7px 12px;opacity:.7">${escHtml(r.obras?.nome||"—")}</td>
            <td style="padding:7px 12px;text-align:center">
                ${r.tipo==="presenca"
                    ? `<span style="background:rgba(143,191,160,.15);color:#4f7a63;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">Presente</span>`
                    : `<span style="background:rgba(224,148,134,.15);color:#a5483d;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">Falta</span>`}
            </td>
            <td style="padding:7px 12px;text-align:right">${r.tipo==="presenca"?Number(r.horas||0).toFixed(1)+"h":"—"}</td>
            <td style="padding:7px 12px;text-align:right;color:#4f7a63">${val}</td>
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
let _vistaRegistos = "lista";   // "lista" ou "mapa"
function setVistaRegistos(v) {
    _vistaRegistos = v;
    const btnL = document.getElementById("btnVistaLista");
    const btnM = document.getElementById("btnVistaMapa");
    if (btnL) {
        btnL.style.background = v==="lista" ? "rgba(181,136,99,.15)" : "rgba(255,255,255,.06)";
        btnL.style.color      = v==="lista" ? "var(--primary)"        : "var(--text-muted)";
        btnL.style.borderColor= v==="lista" ? "rgba(181,136,99,.4)"  : "rgba(255,255,255,.1)";
    }
    if (btnM) {
        btnM.style.background = v==="mapa" ? "rgba(181,136,99,.15)" : "rgba(255,255,255,.06)";
        btnM.style.color      = v==="mapa" ? "var(--primary)"       : "var(--text-muted)";
        btnM.style.borderColor= v==="mapa" ? "rgba(181,136,99,.4)" : "rgba(255,255,255,.1)";
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
    if (error) { { console.error(error); alert("Não foi possível concluir a operação."); }; return; }

    _todosRegistos = data || [];
    await carregarFeriados(ano);

    // ---- KPIs Assiduidade ----
    if (!filtroDia) {
        // Dias úteis: sem fins de semana nem feriados nacionais
        let diasUteis = 0;
        for (let d = 1; d <= ultimoDia; d++) {
            const dow = new Date(ano, mes-1, d).getDay();
            const ds  = `${ano}-${mesStr}-${String(d).padStart(2, "0")}`;
            if (dow !== 0 && dow !== 6 && !feriadoEm(ds)) diasUteis++;
        }
        const diasComRegisto = new Set((data||[]).map(r => r.dia)).size;
        // Dias trabalhados ao fim de semana ou num feriado não passam dos 100%
        const assid = diasUteis > 0 ? Math.min(100, Math.round(diasComRegisto / diasUteis * 100)) : 0;
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
        document.getElementById("kpiAssiduidade").style.color = assid >= 80 ? "#8fbfa0" : assid >= 60 ? "#f97316" : "#e09486";
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
        if (incompleto) tr.style.borderLeft = "3px solid #e09486";

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
            <th style="padding:6px 10px;text-align:left;position:sticky;left:0;background:var(--bg-dark-panel,#3d4d55);z-index:2;min-width:120px">Funcionário</th>
            ${dias.map(d => {
                const dObj = new Date(d + "T12:00:00");
                const dow = dObj.getDay();
                const fer = feriadoEm(d);
                const isWeekend = dow === 0 || dow === 6 || !!fer;
                const label = String(dObj.getDate()).padStart(2,"0");
                return `<th style="padding:4px 3px;text-align:center;min-width:24px;${isWeekend?"opacity:.35":""}${fer?";color:#e09486":""}"${fer?` title="Feriado: ${escHtml(fer)}"`:""}>${label}</th>`;
            }).join("")}
        </tr></thead>
        <tbody>
        ${funcs.map(f => `
            <tr>
                <td style="padding:6px 10px;position:sticky;left:0;background:var(--bg-dark-panel,#3d4d55);z-index:1;font-weight:500;white-space:nowrap">${f}</td>
                ${dias.map(d => {
                    const dObj = new Date(d + "T12:00:00");
                    const dow = dObj.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const estado = porFunc[f]?.[d];
                    let bg = "transparent", symbol = "";
                    if (isWeekend) { bg = "rgba(255,255,255,.03)"; symbol = ""; }
                    else if (!estado && feriadoEm(d)) { bg = "rgba(255,255,255,.03)"; symbol = ""; }
                    else if (estado === "OK") { bg = "rgba(143,191,160,.25)"; symbol = "✓"; }
                    else if (estado === "Incompleto") { bg = "rgba(249,115,22,.25)"; symbol = "⚠"; }
                    else { bg = "rgba(224,148,134,.12)"; symbol = "·"; }
                    return `<td style="text-align:center;padding:4px 2px;background:${bg};border:1px solid rgba(255,255,255,.05)">${symbol}</td>`;
                }).join("")}
            </tr>`).join("")}
        </tbody>
    </table></div>
    <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;opacity:.7">
        <span>✓ <span style="color:rgba(143,191,160,.8)">Presente</span></span>
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
        tdEditado.style.color = "#e09486";
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
        tdEditado.style.color = "#e09486";
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
    tdEditado.style.cssText += "; background: rgba(181,136,99,0.25) !important; color: #b58863 !important; outline: 2px solid rgba(181,136,99,0.4) !important; outline-offset: -2px !important;";
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
            sel.innerHTML += `<option value="${escHtml(a)}">${escHtml(a)}</option>`;
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
    saldoEl.style.color = saldo >= 0 ? "#8fbfa0" : "#e09486";
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
                    borderColor: "#8fbfa0",
                    backgroundColor: "rgba(143,191,160,.08)",
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3
                },
                {
                    label: "Saídas",
                    data: saidas,
                    borderColor: "#e09486",
                    backgroundColor: "rgba(224,148,134,.08)",
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
        "#b58863","#8fbfa0","#7b9cff","#e09486","#c084fc",
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
                backgroundColor: "#b58863",
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#e09486">Erro: ${error.message}</td></tr>`;
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
        if (!temDevice) tr.style.borderLeft = "3px solid #b58863";

        tr.innerHTML = `
            <td style="font-weight:500">
                ${f.nome || "—"}
                ${!temDevice ? '<span style="font-size:10px;color:#b58863;margin-left:4px">⚠ sem QR</span>' : ""}
                ${f.tipo_contrato === 'temporario' ? '<span style="font-size:9px;font-weight:700;background:rgba(181,136,99,.15);color:#c8901e;padding:1px 6px;border-radius:8px;margin-left:4px">TEMP</span>' : ""}
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
                <button class="btn-acao btn-stock-func" title="${f.acesso_stock ? 'Revogar Stock' : 'Dar Stock'}" style="font-size:11px;color:${f.acesso_stock ? '#8fbfa0' : '#888'}">📦</button>
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
    const semDisp    = document.getElementById("funcSemDispositivo");
    const codGerado  = document.getElementById("funcCodigoGerado");

    if (codGerado) codGerado.style.display = "none";

    if (func?.device_id) {
        deviceInfo.style.display = "block";
        deviceIdEl.textContent   = func.device_id;
        if (semDisp) semDisp.style.display = "none";
    } else {
        deviceInfo.style.display = "none";
        // Em edição de alguém sem dispositivo, oferecer o código de inscrição.
        // Em criação (sem func) não faz sentido: ainda não há id.
        if (semDisp) semDisp.style.display = func?.id ? "block" : "none";
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
        if (error) { console.error(error); msg.textContent = "Não foi possível gravar."; return; }
    } else {
        // Novo funcionário — device_id fica vazio até o funcionário fazer o
        // cadastro no seu dispositivo via QR (é assim que o cadastro o encontra)
        const { error } = await SB.from("funcionarios").insert(payload);
        if (error) { console.error(error); msg.textContent = "Não foi possível gravar."; return; }
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

    if (error) { { console.error(error); alert("Não foi possível concluir a operação."); }; return; }
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
        div.innerHTML = `<div id="modalHistFuncContent" style="background:var(--bg-dark-panel,#3d4d55);border-radius:16px;padding:28px;width:100%;max-width:520px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.5)"></div>`;
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

        <button id="btnPDFFuncionario"
            style="margin-top:16px;width:100%;background:rgba(181,136,99,.12);border:1px solid rgba(181,136,99,.3);color:var(--primary,#b58863);border-radius:8px;padding:10px;font-size:13px;cursor:pointer;font-weight:600">
            📄 Exportar PDF do Mês
        </button>`;

    // Os dados vão pelo ouvinte, não por dentro do onclick: um nome que
    // contenha &quot; fechava a string do atributo e corria o que quisesse.
    const btnPDFFunc = document.getElementById("btnPDFFuncionario");
    if (btnPDFFunc) btnPDFFunc.addEventListener("click", () => exportarPDFFuncionario(func, regs));

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
        th { background: #b58863; color: #ffffff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
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
        ${totalGanho != null ? `<div class="kpi"><div class="label">Total</div><div class="value" style="color:#a5483d">${totalGanho.toFixed(2)}€</div></div>` : ""}
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

    if (error) { { console.error(error); alert("Não foi possível concluir a operação."); }; return; }
    await carregarFuncionarios();
}

// Gera o código que substitui o nome como credencial no cadastro. O nome não
// é um segredo: quem o soubesse ficava com a identidade de quem ainda não
// tinha dispositivo associado.
async function gerarCodigoInscricao() {
    if (!funcEditId) return;

    const caixa = document.getElementById("funcCodigoGerado");
    const btn   = document.getElementById("btnGerarCodigo");
    const msgEl = document.getElementById("modalFuncMsg");

    if (btn) { btn.disabled = true; btn.textContent = "A gerar…"; }

    const { data: codigo, error } = await SB.rpc("gerar_codigo_inscricao", {
        p_funcionario: funcEditId
    });

    if (btn) { btn.disabled = false; btn.textContent = "Gerar outro código"; }

    if (error || !codigo) {
        console.error(error);
        msgEl.textContent = "Não foi possível gerar o código.";
        msgEl.style.color = "#e09486";
        return;
    }

    // textContent, não innerHTML: nada aqui precisa de marcação.
    caixa.querySelector("div").textContent = codigo;
    caixa.style.display = "block";
    msgEl.textContent = "";
}

async function revogarDispositivoFuncionario() {
    if (!funcEditId) return;
    if (!confirm("Revogar o dispositivo deste funcionário?\nEle terá de fazer novo cadastro.")) return;

    const { error } = await SB.from("funcionarios")
        .update({ device_id: null })
        .eq("id", funcEditId);

    if (error) { { console.error(error); alert("Não foi possível concluir a operação."); }; return; }

    document.getElementById("funcDeviceInfo").style.display = "none";
    // Aparece a caixa do código, para se poder gerar um logo a seguir.
    const _semDisp = document.getElementById("funcSemDispositivo");
    if (_semDisp) _semDisp.style.display = "block";
    const _cod = document.getElementById("funcCodigoGerado");
    if (_cod) _cod.style.display = "none";
    document.getElementById("modalFuncMsg").textContent = "Dispositivo revogado. Gere um código de inscrição para esta pessoa se registar de novo.";
    document.getElementById("modalFuncMsg").style.color = "#8fbfa0";
    await carregarFuncionarios();
}

// =======================================================
// OBRAS — listagem, QR codes
// =======================================================
async function initObras() {
    await carregarObras();
}

// Pesquisa + "Só as ativas" (é o que abre por defeito) ou "Todas as obras"
function filtrarObras() {
    const f      = (document.getElementById("pesquisaObras")?.value || "").toLowerCase();
    const estado = document.getElementById("filtroEstadoObras")?.value || "";
    const linhas = [...document.querySelectorAll("#tabelaObras tbody tr[data-estado]")];
    linhas.forEach(tr => {
        const ok = (!estado || tr.dataset.estado === estado) && tr.innerText.toLowerCase().includes(f);
        tr.style.display = ok ? "" : "none";
    });
    const tbody = document.querySelector("#tabelaObras tbody");
    let vazio = tbody?.querySelector(".obras-sem-resultados");
    if (linhas.length && !linhas.some(tr => tr.style.display !== "none")) {
        if (!vazio && tbody) {
            vazio = document.createElement("tr");
            vazio.className = "obras-sem-resultados";
            vazio.innerHTML = `<td colspan="7" style="text-align:center;padding:20px;opacity:.6">Nenhuma obra com este filtro.</td>`;
            tbody.appendChild(vazio);
        }
    } else vazio?.remove();
}

async function carregarObras() {
    const { data, error } = await SB.from("obras").select("*").order("created_at", { ascending: false });
    const tbody = document.querySelector("#tabelaObras tbody");
    if (!tbody) return;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#e09486">Erro: ${error.message}</td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;opacity:.6">Sem obras. Use o botão + para criar uma obra.</td></tr>`;
        return;
    }

    data.forEach(o => {
        const tr = document.createElement("tr");
        const estado = o.estado || "ativa";
        tr.dataset.estado = estado;

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
                        <div style="width:${Math.min(o.percentagem_conclusao,100)}%;height:100%;background:${o.percentagem_conclusao>=100?"#8fbfa0":o.percentagem_conclusao>=75?"var(--primary)":"#a78bfa"};border-radius:4px"></div>
                    </div>
                    <span style="font-size:11px;opacity:.7;white-space:nowrap">${o.percentagem_conclusao}%</span>
                </div>
                ${o.data_conclusao_prevista ? `<div style="font-size:10px;opacity:.5;margin-top:2px;${new Date(o.data_conclusao_prevista) < new Date() && estado==="ativa" ? "color:#f97316;opacity:1;font-weight:600" : ""}">📅 ${o.data_conclusao_prevista}</div>` : ""}
                ` : "<span style='opacity:.3;font-size:11px'>—</span>"}
            </td>
            <td class="acoes-td" style="white-space:nowrap">
                <button class="btn-acao btn-painel-obra" title="Ver Painel">📊</button>
                <button class="btn-acao btn-drive-obra" title="${o.drive_pastas?.pasta ? "Abrir pasta no Google Drive" : "Sem pasta no Google Drive"}" style="${o.drive_pastas?.pasta ? "" : "opacity:.3"}">📁</button>
                <button class="btn-acao btn-editar-obra" title="Editar">✏️</button>
                <button class="btn-acao btn-qr-obra" title="Ver QR">🔲</button>
                <button class="btn-acao btn-estado-obra" title="${estado === "ativa" ? "Concluir" : "Reativar"}">${estado === "ativa" ? "✅" : "🔄"}</button>
                <button class="btn-acao btn-eliminar-obra" title="Eliminar" style="opacity:.5">🗑️</button>
            </td>`;

        // Usar classes em vez de querySelector composto — evita o bug
        tr.querySelector(".btn-painel-obra").onclick   = () => abrirPainelObra(o);
        tr.querySelector(".btn-drive-obra").onclick    = () => o.drive_pastas?.pasta
            ? window.open(urlPastaDrive(o.drive_pastas.pasta), "_blank")
            : alert("Esta obra ainda não tem pasta no Google Drive. Edita a obra e cola o link da pasta.");
        tr.querySelector(".btn-editar-obra").onclick  = () => editarObra(o);
        tr.querySelector(".btn-qr-obra").onclick      = () => abrirModalQR(o);
        tr.querySelector(".btn-estado-obra").onclick  = () => toggleEstadoObra(o.id, o.nome, estado);
        tr.querySelector(".btn-eliminar-obra").onclick = () => eliminarObra(o.id, o.nome);
        tbody.appendChild(tr);
    });
    filtrarObras();
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
            btn.style.background   = active ? "rgba(181,136,99,.15)" : "none";
            btn.style.color        = active ? "var(--primary,#b58863)" : "rgba(255,255,255,.5)";
            btn.style.borderBottom = active ? "2px solid var(--primary,#b58863)" : "2px solid transparent";
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
    const morada = document.getElementById("editObraMorada")?.value?.trim();
    const estado = document.getElementById("editObraEstado")?.value || "ativa";
    const raio   = parseInt(document.getElementById("editObraRaio")?.value) || 120;
    const percent = document.getElementById("editObraPercent")?.value;
    const dataFim = document.getElementById("editObraData")?.value;

    if (!nome) { alert("O nome da obra é obrigatório."); return; }

    const gps = lerGpsDaObra();
    if (gps === false) return;

    // A coluna chama-se "morada". Até aqui gravava-se "endereco", que não
    // existe na tabela, e por isso guardar uma obra com morada dava erro.
    const payload = {
        nome, estado, raio,
        morada:                  morada || null,
        percentagem_conclusao:   percent !== "" && percent != null ? parseInt(percent) : null,
        data_conclusao_prevista: dataFim || null,
        latitude:                gps.lat,
        longitude:               gps.lon,
    };
    if (codigo) payload.codigo = codigo;

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
        const _mor0 = document.getElementById("editObraMorada"); if (_mor0) _mor0.value = "";
        const _rai0 = document.getElementById("editObraRaio"); if (_rai0) _rai0.value = "";
        const _est0 = document.getElementById("editObraEstado"); if (_est0) _est0.value = "ativa";
        const _cod0 = document.getElementById("editObraCodigo"); if (_cod0) _cod0.value = "";
        const _pct0 = document.getElementById("editObraPercent"); if (_pct0) _pct0.value = "";
        const _dat0 = document.getElementById("editObraData"); if (_dat0) _dat0.value = "";
        const _drv0 = document.getElementById("editObraDrive"); if (_drv0) _drv0.value = "";
        mostrarGpsDaObra(null, null);
        document.getElementById("editObraTitulo").textContent = "✏️ Nova Obra";
        switchObraTab("detalhes");
        const _mo = document.getElementById("modalEditarObra"); _mo.style.display = "flex"; _mo.classList.remove("hidden");
        return;
    }
    document.getElementById("editObraId").value = obra.id;
    document.getElementById("editObraNome").value = obra.nome || "";
    const _morE = document.getElementById("editObraMorada"); if (_morE) _morE.value = obra.morada || "";
    const _pctE = document.getElementById("editObraPercent"); if (_pctE) _pctE.value = obra.percentagem_conclusao ?? "";
    const _datE = document.getElementById("editObraData"); if (_datE) _datE.value = obra.data_conclusao_prevista || "";
    const _drvE = document.getElementById("editObraDrive"); if (_drvE) _drvE.value = obra.drive_pastas?.pasta ? urlPastaDrive(obra.drive_pastas.pasta) : "";
    const _raiE = document.getElementById("editObraRaio"); if (_raiE) _raiE.value = obra.raio || "";
    const _estE = document.getElementById("editObraEstado"); if (_estE) _estE.value = obra.estado || "ativa";
    const _codE = document.getElementById("editObraCodigo"); if (_codE) _codE.value = obra.codigo || "";
    mostrarGpsDaObra(obra.latitude, obra.longitude);
    document.getElementById("editObraTitulo").textContent = `✏️ ${obra.nome || "Editar Obra"}`;
    switchObraTab("detalhes");
    const _moE = document.getElementById("modalEditarObra"); _moE.style.display = "flex"; _moE.classList.remove("hidden");
}

// ── Localização GPS da obra ─────────────────────────────────
// Sem latitude e longitude, o ponto_marcar não verifica a distância e aceita
// a marcação em qualquer sítio. O painel não tinha onde as pôr: só se
// conseguiam gravar pela base de dados. O botão "Estou na obra" lê a posição
// do telemóvel de quem está no local, que é a forma mais fiável de a acertar.
function mostrarGpsDaObra(lat, lon) {
    const res = document.getElementById("editObraMoradaResultados");
    if (res) res.textContent = "";
    const elLat = document.getElementById("editObraLat");
    const elLon = document.getElementById("editObraLon");
    if (!elLat || !elLon) return;
    elLat.value = lat ?? "";
    elLon.value = lon ?? "";
    actualizarInfoGpsDaObra();
}

function actualizarInfoGpsDaObra(precisao) {
    const info = document.getElementById("editObraGpsInfo");
    if (!info) return;
    const lat = document.getElementById("editObraLat").value.trim();
    const lon = document.getElementById("editObraLon").value.trim();
    if (!lat || !lon) {
        info.textContent = "Sem localização, o ponto aceita marcações em qualquer sítio.";
        return;
    }
    const mapa = `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`;
    info.innerHTML = (precisao ? `Precisão do telemóvel: ±${Math.round(precisao)} m. ` : "") +
        `<a href="${mapa}" target="_blank" rel="noopener" style="color:var(--primary)">Ver no mapa</a>`;
}

function usarLocalizacaoActualNaObra() {
    const info = document.getElementById("editObraGpsInfo");
    if (!navigator.geolocation) { alert("Este dispositivo não dá a localização."); return; }
    info.textContent = "A obter a localização…";
    navigator.geolocation.getCurrentPosition(
        pos => {
            document.getElementById("editObraLat").value = pos.coords.latitude.toFixed(7);
            document.getElementById("editObraLon").value = pos.coords.longitude.toFixed(7);
            actualizarInfoGpsDaObra(pos.coords.accuracy);
            // Um raio mais pequeno do que o erro do GPS recusa marcações de
            // quem está mesmo dentro da obra.
            const elRaio = document.getElementById("editObraRaio");
            const minimo = Math.max(100, Math.ceil(pos.coords.accuracy * 2));
            if (elRaio && (parseInt(elRaio.value) || 0) < minimo) elRaio.value = minimo;
        },
        err => {
            info.textContent = err.code === 1
                ? "Sem autorização para usar a localização. Ativa-a nas definições do browser."
                : "Não foi possível obter a localização. Tenta outra vez ao ar livre.";
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
}

// Procura a morada no OpenStreetMap (Nominatim) e mostra até 5 sítios para
// escolher. É uma posição aproximada, por isso o raio sobe para 150 m; o
// botão "Estou na obra" continua a ser o mais exato.
let _resultadosMorada = [];

async function procurarGpsPelaMorada() {
    const caixa  = document.getElementById("editObraMoradaResultados");
    const texto  = document.getElementById("editObraMorada").value.trim();
    if (texto.length < 3) { caixa.textContent = "Escreva primeiro a morada da obra."; return; }
    caixa.textContent = "A procurar…";
    try {
        _resultadosMorada = await procurarMorada(texto);
    } catch (e) {
        console.error(e);
        caixa.textContent = "Não foi possível procurar agora. Tente daqui a pouco.";
        return;
    }
    if (!_resultadosMorada.length) {
        caixa.textContent = "Não encontrei esta morada. Experimente só a rua e a localidade.";
        return;
    }
    caixa.innerHTML = `<div style="opacity:.6;margin-bottom:2px">Escolha o sítio certo:</div>` +
        _resultadosMorada.map((r, i) =>
            `<a href="#" onclick="usarResultadoMorada(${i});return false" style="display:block;padding:3px 0;color:var(--primary)">📍 ${escHtml(r.nome)}</a>`
        ).join("") +
        `<div style="opacity:.45;font-size:10px;margin-top:2px">Dados © colaboradores do OpenStreetMap</div>`;
}

function usarResultadoMorada(i) {
    const r = _resultadosMorada[i];
    if (!r) return;
    document.getElementById("editObraLat").value = r.lat.toFixed(7);
    document.getElementById("editObraLon").value = r.lon.toFixed(7);
    const elRaio = document.getElementById("editObraRaio");
    if (elRaio && (parseInt(elRaio.value) || 0) < 150) elRaio.value = 150;
    document.getElementById("editObraMoradaResultados").textContent =
        "Posição aproximada pela morada. Confirme no mapa e, quando estiver na obra, use \"Estou na obra\" para a acertar.";
    actualizarInfoGpsDaObra();
}

// Devolve { lat, lon } (ambos null quando vazios) ou false se forem inválidos.
function lerGpsDaObra() {
    const elLat = document.getElementById("editObraLat");
    const elLon = document.getElementById("editObraLon");
    if (!elLat || !elLon) return { lat: undefined, lon: undefined };
    const tLat = elLat.value.trim().replace(",", ".");
    const tLon = elLon.value.trim().replace(",", ".");
    if (!tLat && !tLon) return { lat: null, lon: null };
    const lat = Number(tLat), lon = Number(tLon);
    if (!tLat || !tLon || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        alert("A localização GPS não é válida. Preenche latitude e longitude, ou deixa as duas vazias.");
        return false;
    }
    return { lat, lon };
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
    // Pasta do Google Drive: guarda-se o ID da pasta. As subpastas (fotos,
    // orçamentos...) só se mantêm se a pasta principal não mudou.
    const linkDrive = document.getElementById("editObraDrive")?.value.trim() || "";
    const pastaId = idPastaDrive(linkDrive);
    if (linkDrive && !pastaId) { alert("O link da pasta do Google Drive não parece válido."); return; }
    const obraAntes = id ? (await SB.from("obras").select("drive_pastas").eq("id", id).maybeSingle()).data : null;
    const pastasAntes = obraAntes?.drive_pastas || null;
    payload.drive_pastas = !pastaId ? null
        : pastasAntes?.pasta === pastaId ? pastasAntes
        : { pasta: pastaId };
    if (id) {
        const { error } = await SB.from("obras").update(payload).eq("id", id);
        if (error) { { console.error(error); alert("Não foi possível concluir a operação."); }; return; }
    } else {
        const { error } = await SB.from("obras").insert(payload);
        if (error) { { console.error(error); alert("Não foi possível concluir a operação."); }; return; }
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
        const barCol = s.concluido ? "#8fbfa0" : pct>=75 ? "#fb923c" : "var(--primary,#b58863)";
        return `<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:10px;border:1px solid ${s.concluido?"rgba(143,191,160,.2)":"rgba(255,255,255,.06)"}">
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                    <span style="font-size:13px;font-weight:600">${escHtml(s.nome)}</span>
                    ${s.extra?`<span style="font-size:10px;background:rgba(251,146,60,.15);color:#fb923c;padding:1px 6px;border-radius:10px">Extra</span>`:""}
                    ${s.concluido?`<span style="font-size:10px;background:rgba(143,191,160,.15);color:#8fbfa0;padding:1px 6px;border-radius:10px">✓ Concluído</span>`:""}
                </div>
                <div style="display:flex;gap:14px;font-size:11px;opacity:.6">
                    <span>🕐 ${hR.toFixed(1)}h${s.horas_orcamento?` / ${s.horas_orcamento}h`:""}</span>
                    <span>💶 ${mR.toFixed(0)}€ mat${s.valor_orcamento?` / ${s.valor_orcamento}€`:""}</span>
                </div>
                ${pct!==null?`<div style="margin-top:6px;background:rgba(255,255,255,.1);border-radius:3px;height:3px"><div style="width:${pct}%;height:100%;background:${barCol};border-radius:3px"></div></div>`:""}
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0">
                <button onclick="toggleServicoConcluido('${s.id}',${s.concluido})" style="background:${s.concluido?"rgba(143,191,160,.15)":"rgba(255,255,255,.07)"};border:none;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:13px" title="${s.concluido?"Reabrir":"Concluir"}">${s.concluido?"↩":"✓"}</button>
                <button data-servico-id="${escHtml(s.id)}" data-servico-nome="${escHtml(s.nome)}" class="btn-elim-servico" style="background:rgba(224,148,134,.1);border:none;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:13px;opacity:.6">🗑</button>
            </div>
        </div>`;
    }).join("");

    // O nome do serviço ia interpolado dentro do onclick; agora vem do dataset.
    lista.querySelectorAll(".btn-elim-servico").forEach(b => {
        b.addEventListener("click", () => eliminarServico(b.dataset.servicoId, b.dataset.servicoNome));
    });
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
    if (error) { { console.error(error); alert("Não foi possível concluir a operação."); }; return; }
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
    _painelObraActual = obra;   // os separadores (resumo, financeiro, ponto,
                                // stock) leem a obra daqui
    document.getElementById("painelObraNome").textContent = obra.nome;

    // Meta: data prevista + estado
    const metaEl = document.getElementById("painelObraMeta");
    const estadoBadge = obra.estado === "concluida"
        ? `<span style="background:rgba(143,191,160,.15);color:#8fbfa0;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">✓ Concluída</span>`
        : `<span style="background:rgba(181,136,99,.12);color:var(--primary,#b58863);padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">Em curso</span>`;
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
        // Sem serviços, os separadores continuam a ter conteúdo útil
        // (financeiro, ponto e stock não dependem dos serviços)
        abrirPainelTab("resumo");
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
            cor: totHReal > totHOrç && totHOrç > 0 ? "#fb923c" : totHReal > 0 ? "#8fbfa0" : "rgba(255,255,255,.6)",
            accent: "#b58863"
        },
        {
            label: "Custo Mão de Obra",
            val: totMO > 0 ? totMO.toFixed(0)+"€" : "—",
            sub: totMat > 0 ? `+${totMat.toFixed(0)}€ material` : "Sem material",
            cor: "#e09486",
            accent: "#e09486"
        },
        {
            label: "Orçamento Total",
            val: totVOrç > 0 ? totVOrç.toFixed(0)+"€" : "—",
            sub: totDesvio !== null ? (totDesvio > 0 ? `▲ +${totDesvio.toFixed(0)}€ desvio` : `▼ ${totDesvio.toFixed(0)}€ dentro`) : "Sem orçamento",
            cor: totDesvio > 0 ? "#e09486" : "#8fbfa0",
            accent: "#a78bfa"
        },
        {
            label: "Serviços",
            val: `${concluidosCount}/${(servicos||[]).length}`,
            sub: "concluídos",
            cor: concluidosCount === (servicos||[]).length ? "#8fbfa0" : "rgba(255,255,255,.7)",
            accent: "#8fbfa0"
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
            ? `<span style="color:rgba(255,255,255,.5)">Progresso geral:</span> <span style="color:var(--primary,#b58863);font-weight:600">${pctGeral}%</span>`
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
        const barCol= s.concluido ? "#8fbfa0" : pct>=100 ? "#e09486" : pct>=75 ? "#fb923c" : "var(--primary,#b58863)";

        const estadoBadge = s.concluido
            ? `<span style="background:rgba(143,191,160,.15);color:#8fbfa0;padding:2px 9px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap">✓ Feito</span>`
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
            <div style="color:#e09486;font-size:13px">${moR>0?moR.toFixed(0)+"€":"—"}</div>
            <div style="color:#e09486;font-size:13px">${matR>0?matR.toFixed(0)+"€":"—"}</div>
            <div style="color:rgba(255,255,255,.45);font-size:12px">${s.valor_orcamento?s.valor_orcamento.toFixed(0)+"€":"—"}</div>
            <div style="font-weight:600;font-size:13px;color:${desvio===null?"rgba(255,255,255,.3)":desvio>0?"#e09486":"#8fbfa0"}">
                ${desvio===null?"—":(desvio>0?"+":"")+desvio.toFixed(0)+"€"}
            </div>
            <div style="text-align:center">${estadoBadge}</div>
        </div>`;
    }).join("");

    // Abrir o primeiro separador: é o que dispara o carregamento do resumo
    abrirPainelTab("resumo");
}

async function toggleEstadoObra(id, nome, estadoAtual) {
    const novoEstado = estadoAtual === "ativa" ? "concluida" : "ativa";
    const acao = novoEstado === "concluida" ? "Concluir" : "Reativar";
    if (!confirm(`${acao} a obra "${nome}"?`)) return;

    const { error } = await SB.from("obras")
        .update({ estado: novoEstado })
        .eq("id", id);
    if (error) { { console.error(error); alert("Não foi possível actualizar o estado."); }; return; }
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
    if (error) { { console.error(error); alert("Não foi possível eliminar."); }; return; }
    await carregarObras();
}


// =======================================================
// SCANNER QR DE FATURAS PORTUGUESAS
// =======================================================
let qrStream    = null;
let qrAnimFrame = null;
let qrTorchOn   = false;

async function iniciarScanQR() {
    prepararLeitorQR();   // adianta o carregamento do leitor
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
                // Sem o "?." um botão em falta rebentava aqui dentro do try,
                // e o utilizador via um erro de câmara que não era real
                const btnT = document.getElementById("btnTorch");
                if (btnT) btnT.style.display = "inline-flex";
            }
        }

        if (status) status.textContent = "Aponte o QR Code da fatura para a moldura";
        qrAnimFrame = requestAnimationFrame(scanFrame);

    } catch(e) {
        if (status) status.textContent = "Câmara não disponível. Use 'Introduzir manual'.";
        console.warn("Câmara:", e);
    }
}

async function scanFrame() {
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
    const valorQR = await lerQR(canvas, imgData);

    if (valorQR) {
        // Flash verde na moldura para feedback visual
        const moldura = document.getElementById("qrMoldura");
        if (moldura) {
            moldura.style.transition = "opacity .15s";
            moldura.style.opacity    = "0";
            setTimeout(() => { if(moldura) moldura.style.opacity="1"; }, 150);
        }
        parsearQRFatura(valorQR);
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
            ? "rgba(181,136,99,.4)"
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
            verificarNif(nifEmit, document.getElementById("movNifInfo"), { nome: "movFornecedor" });
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

// =======================================================
// LER FATURA (PDF ou foto) — assistente
// Mesmo destino do QR: preenche o formulário do movimento. A diferença é
// que o QR só traz os totais, e isto traz também as LINHAS.
// A leitura é feita por uma Edge Function; a chave da IA fica no servidor.
// =======================================================
let _linhasFaturaLidas = [];   // guardadas até o movimento ser gravado

// -------------------------------------------------------
// ARTIGOS, SINÓNIMOS E PREÇOS
// Cada linha de fatura pode apontar para um artigo do inventário.
// A ligação é guardada em artigo_sinonimos: da próxima vez que a mesma
// descrição aparecer, o artigo é reconhecido sem gastar IA.
// Com artigo + fornecedor + data, grava-se o preço em "precos" — é daí
// que sai o aviso de material que subiu de preço.
// -------------------------------------------------------
let _artigosFatura   = [];   // artigos activos, para as listas
let _sinonimosFatura = {};   // texto normalizado -> artigo_id (o que está gravado)
let _ultimosPrecos   = {};   // artigo_id -> último preço conhecido
let _unidadesFatura  = [];   // unidades_medida, para criar artigos novos

// Mesma normalização do lado do ecrã e do lado do que se grava:
// minúsculas, sem acentos, sem pontuação, sem espaços a mais.
function normalizarTextoArtigo(s) {
    return String(s == null ? "" : s)
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9%.\/ ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

async function carregarArtigosESinonimos(forcar = false) {
    if (_artigosFatura.length && !forcar) return;
    const [{ data: arts }, { data: sins }, { data: uns }] = await Promise.all([
        SB.from("artigos").select("id, codigo, descricao, unidade_compra, preco_atual")
          .eq("ativo", true).order("descricao"),
        SB.from("artigo_sinonimos").select("texto, artigo_id"),
        SB.from("unidades_medida").select("id, codigo"),
    ]);
    _artigosFatura   = arts || [];
    _unidadesFatura  = uns  || [];
    _sinonimosFatura = {};
    (sins || []).forEach(s => { _sinonimosFatura[s.texto] = s.artigo_id; });
}

// A fatura traz "UN", "M2", "sc", "vg"... e o inventário só tem quatro
// unidades. Guarda-se o texto original em unidade_compra e aproxima-se
// à unidade mais parecida; na dúvida, unidade.
function unidadeIdPorTexto(texto) {
    const n = normalizarTextoArtigo(texto).replace(/\s/g, "");
    const porCodigo = (c) => _unidadesFatura.find(u => u.codigo === c)?.id;
    if (/^(m2|mt2|metroquadrado)$/.test(n)) return porCodigo("m2") || 1;
    if (/^(kg|kgs|quilo|quilograma)$/.test(n)) return porCodigo("kg") || 1;
    if (/^(m|ml|mt|metro|metrolinear)$/.test(n)) return porCodigo("m") || 1;
    return porCodigo("un") || _unidadesFatura[0]?.id || 1;
}

// Dar entrada em stock faz sentido quando o material foi comprado para o
// armazém. Quando a fatura já está imputada a uma obra, o material foi
// quase sempre entregue lá: dar entrada encheria o inventário de coisas
// que não estão cá. Fica por isso só sugerido — a decisão é de quem lança.
function sugerirEntradaStock(artigoId, l) {
    if (!artigoId) return false;
    if (!(Number(l.quantidade) > 0)) return false;
    if (document.getElementById("movTipo")?.value === "entrada") return false;   // nota de crédito
    return !document.getElementById("movObra")?.value;
}

// Reconhece pelo sinónimo gravado e, se não houver, pelo próprio nome
// ou código do artigo.
function artigoParaTexto(texto) {
    const n = normalizarTextoArtigo(texto);
    if (!n) return null;
    if (_sinonimosFatura[n]) return _sinonimosFatura[n];
    const a = _artigosFatura.find(x =>
        normalizarTextoArtigo(x.descricao) === n ||
        (x.codigo && normalizarTextoArtigo(x.codigo) === n));
    return a ? a.id : null;
}

async function carregarUltimosPrecos(ids) {
    const falta = [...new Set((ids || []).filter(id => id && !(id in _ultimosPrecos)))];
    if (!falta.length) return;
    falta.forEach(id => { _ultimosPrecos[id] = null; });   // já procurado
    const { data } = await SB.from("precos")
        .select("artigo_id, preco, unidade, data")
        .in("artigo_id", falta)
        .order("data", { ascending: false });
    (data || []).forEach(p => { if (!_ultimosPrecos[p.artigo_id]) _ultimosPrecos[p.artigo_id] = p; });
}

function opcoesArtigos(escolhido) {
    const sel = (v) => (String(escolhido || "") === String(v) ? " selected" : "");
    return `<option value=""${sel("")}>— sem artigo —</option>` +
           `<option value="__novo__">➕ criar artigo novo…</option>` +
           _artigosFatura.map(a =>
               `<option value="${a.id}"${sel(a.id)}>${escHtml(a.descricao || a.codigo || "(sem nome)")}</option>`
           ).join("");
}

// Mostra, por baixo da lista, o último preço pago e quanto variou.
// É isto que depois alimenta o aviso "fatura acima do cotado".
function actualizarPrecoAnterior(tr) {
    const el = tr?.querySelector(".linha-preco-ant");
    if (!el) return;
    const artigoId = tr.querySelector('[data-campo="artigo"]')?.value;
    const preco    = parseFloat(tr.querySelector('[data-campo="preco_unitario"]')?.value);
    const ant      = artigoId ? _ultimosPrecos[artigoId] : null;

    if (!artigoId || !ant || !(ant.preco > 0)) { el.textContent = ""; return; }

    const antigo = Number(ant.preco);
    if (!(preco > 0)) {
        el.innerHTML = `<span style="opacity:.7">último: ${antigo.toFixed(2)} €</span>`;
        return;
    }
    const var_pc = ((preco - antigo) / antigo) * 100;
    if (Math.abs(var_pc) < 1) {
        el.innerHTML = `<span style="opacity:.7">igual ao último (${antigo.toFixed(2)} €)</span>`;
    } else if (var_pc > 0) {
        el.innerHTML = `<span style="color:#b45309;font-weight:600">▲ ${var_pc.toFixed(0)}%</span>` +
                       `<span style="opacity:.7"> — era ${antigo.toFixed(2)} € em ${ant.data}</span>`;
    } else {
        el.innerHTML = `<span style="color:#15803d;font-weight:600">▼ ${Math.abs(var_pc).toFixed(0)}%</span>` +
                       `<span style="opacity:.7"> — era ${antigo.toFixed(2)} € em ${ant.data}</span>`;
    }
}

// Escolher o artigo de uma linha; "criar artigo novo" cria-o já no inventário.
async function aoEscolherArtigoLinha(sel) {
    const tr = sel.closest("tr");

    if (sel.value === "__novo__") {
        sel.value = "";
        const desc = tr.querySelector('[data-campo="descricao"]')?.value?.trim();
        if (!desc) { alert("Escreve primeiro a descrição da linha."); return; }
        if (!confirm(`Criar o artigo "${desc}" no inventário?`)) return;

        const preco   = parseFloat(tr.querySelector('[data-campo="preco_unitario"]')?.value) || 0;
        const unidade = tr.querySelector('[data-campo="unidade"]')?.value?.trim() || null;
        const { data: novo, error } = await SB.from("artigos").insert({
            descricao:      desc,
            preco_atual:    preco,
            tipo_artigo:    "consumivel",
            unidade_id:     unidadeIdPorTexto(unidade),
            unidade_compra: unidade,
            stock_inicial:  0,
            ativo:          true,
        }).select("id, codigo, descricao, unidade_compra, preco_atual").single();

        if (error) { { console.error(error); alert("Não foi possível criar o artigo."); }; return; }

        _artigosFatura.push(novo);
        _artigosFatura.sort((a, b) => (a.descricao || "").localeCompare(b.descricao || "", "pt"));

        // Refazer as listas de todas as linhas sem perder as escolhas já feitas
        const selects  = [...document.querySelectorAll('#tabelaFaturaLinhas [data-campo="artigo"]')];
        const escolhas = selects.map(s => (s === sel ? novo.id : s.value));
        selects.forEach((s, i) => { s.innerHTML = opcoesArtigos(escolhas[i]); });
    }

    await carregarUltimosPrecos([sel.value]);
    actualizarPrecoAnterior(tr);
}

// -------------------------------------------------------
// FILA DE FATURAS
// Um ficheiro do scanner traz várias faturas, e podes escolher vários
// ficheiros de uma vez. Lança-se uma de cada vez: a primeira preenche o
// formulário, as outras ficam em fila e entram à medida que gravas.
// -------------------------------------------------------
let _filaFaturas = [];   // faturas lidas e ainda por lançar
let _filaTotal   = 0;    // quantas vieram no lote, para o "3 de 7"

function limparFilaFaturas() {
    _filaFaturas = [];
    _filaTotal   = 0;
    const barra = document.getElementById("filaFaturasBarra");
    if (barra) barra.style.display = "none";
}

function actualizarBarraFila() {
    let barra = document.getElementById("filaFaturasBarra");
    if (!barra) {
        barra = document.createElement("div");
        barra.id = "filaFaturasBarra";
        barra.style.cssText = "display:none;align-items:center;gap:10px;background:rgba(181,136,99,.12);" +
            "border:1px solid rgba(181,136,99,.35);border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:12px";
        const modal = document.getElementById("modalMovimento");
        const conteudo = modal?.querySelector(".modal-content, .modal-body") || modal;
        conteudo?.insertBefore(barra, conteudo.firstChild);
    }

    if (!_filaTotal) { barra.style.display = "none"; return; }

    const actual = _filaTotal - _filaFaturas.length;   // a que está no ecrã
    barra.innerHTML =
        `<span style="font-weight:600">Fatura ${actual} de ${_filaTotal}</span>` +
        `<span style="opacity:.7;flex:1">${_filaFaturas.length} por lançar neste lote</span>` +
        `<button type="button" id="btnSaltarFatura" class="btn-secondary" style="font-size:12px;padding:3px 10px">Saltar esta</button>` +
        `<button type="button" id="btnDescartarFila" class="btn-secondary" style="font-size:12px;padding:3px 10px">Descartar lote</button>`;
    barra.style.display = "flex";

    document.getElementById("btnSaltarFatura").onclick = async () => {
        if (!_filaFaturas.length) { limparFilaFaturas(); mostrarFeedbackQR("Era a última do lote.", "warn"); return; }
        await proximaFaturaDaFila();
    };
    document.getElementById("btnDescartarFila").onclick = () => {
        limparFilaFaturas();
        mostrarFeedbackQR("Lote descartado. O que já gravaste fica.", "warn");
    };
}

// Tira a próxima da fila e põe-na no formulário.
async function proximaFaturaDaFila() {
    const doc = _filaFaturas.shift();
    if (!doc) { limparFilaFaturas(); return; }

    preencherMovimentoComFatura(doc);
    await mostrarLinhasFatura(doc);
    actualizarBarraFila();

    mostrarFeedbackQR(
        `${doc.numero_documento || "Fatura"} · ${doc.fornecedor_nome || "fornecedor por identificar"} · ` +
        `${Number(doc.total_com_iva || 0).toFixed(2)}€ · ${(doc.linhas || []).length} linhas`,
        doc.avisos?.length ? "warn" : "ok"
    );
}

// Vários ficheiros de uma vez: lê-se um a um e junta-se tudo à mesma fila.
async function lerFicheirosFatura(ficheiros) {
    const lista = [...(ficheiros || [])];
    if (!lista.length) return;

    const todas = [];
    for (let i = 0; i < lista.length; i++) {
        if (lista.length > 1) {
            mostrarFeedbackQR(`A ler ficheiro ${i + 1} de ${lista.length}…`, "warn");
        }
        const docs = await lerFicheiroFatura(lista[i], true);
        todas.push(...(docs || []));
    }

    if (!todas.length) {
        mostrarFeedbackQR("Não foi reconhecida nenhuma fatura.", "err");
        return;
    }

    _filaFaturas = todas;
    _filaTotal   = todas.length;
    await proximaFaturaDaFila();

    if (todas.length > 1) {
        mostrarFeedbackQR(`${todas.length} faturas lidas. Grava esta e a seguinte entra sozinha.`, "ok");
    }
}

// Lê um ficheiro. Com emFila=true devolve as faturas em vez de as mostrar.
async function lerFicheiroFatura(ficheiro, emFila = false) {
    if (!ficheiro) return null;

    const MAX = 8 * 1024 * 1024;
    if (ficheiro.size > MAX) {
        mostrarFeedbackQR(`"${ficheiro.name}" tem mais de 8 MB. Digitaliza com menos qualidade.`, "err");
        return null;
    }

    const btn = document.getElementById("btnLerFatura");
    const textoBtn = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ A ler…"; }
    if (!emFila) mostrarFeedbackQR("A ler a fatura… demora alguns segundos.", "warn");

    try {
        const base64 = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload  = () => resolve(String(fr.result).split(",")[1]);
            fr.onerror = () => reject(new Error("Não foi possível abrir o ficheiro."));
            fr.readAsDataURL(ficheiro);
        });

        const { data: { session } } = await SB.auth.getSession();
        if (!session) throw new Error("Sessão expirada. Volta a entrar.");

        const r = await fetch(`${SUPABASE_URL}/functions/v1/ler-fatura`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ ficheiro_base64: base64, tipo: ficheiro.type || "image/jpeg" }),
        });

        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);

        const docs = j.documentos || [];

        // Em lote, quem chamou é que trata das faturas todas.
        if (emFila) return docs;

        if (!docs.length) {
            mostrarFeedbackQR("Não foi reconhecida nenhuma fatura neste ficheiro.", "err");
            return null;
        }

        // Um ficheiro do scanner pode trazer várias: a primeira entra já,
        // as outras ficam em fila.
        _filaFaturas = docs;
        _filaTotal   = docs.length;
        await proximaFaturaDaFila();
        return docs;

    } catch (e) {
        console.error("lerFicheiroFatura:", e);
        mostrarFeedbackQR("Não foi possível ler: " + e.message, "err");
        return null;
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
        const inp = document.getElementById("ficheiroFatura");
        if (inp) inp.value = "";   // permite reler o mesmo ficheiro
    }
}

function preencherMovimentoComFatura(d) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== "") el.value = v; };

    set("movReferencia", (d.numero_documento || "").substring(0, 80));
    set("movData", d.data);
    set("movTipo", d.tipo_documento === "NC" ? "entrada" : "saida");
    set("movNif", d.fornecedor_nif);
    set("movFornecedor", d.fornecedor_conhecido?.nome || d.fornecedor_nome);
    if (d.fornecedor_nif) verificarNif(d.fornecedor_nif, document.getElementById("movNifInfo"));

    const total = Number(d.total_com_iva);
    const base  = Number(d.total_sem_iva);
    const iva   = Number(d.total_iva);
    if (total > 0) {
        set("movTotal", total.toFixed(2));
        if (base > 0) {
            set("movBase", base.toFixed(2));
            set("movIva", iva > 0 ? Math.round((iva / base) * 100) : 0);
        }
    }

    const obs = [];
    if (d.atcud) obs.push(`ATCUD: ${d.atcud}`);
    if (d.motivo_isencao_iva) obs.push(d.motivo_isencao_iva);
    if (obs.length) set("movObs", obs.join(" · "));

    setTimeout(() => document.getElementById("movObra")?.focus(), 200);
}

async function mostrarLinhasFatura(d) {
    await carregarArtigosESinonimos();

    // Cada linha já chega com artigo, ou tenta-se reconhecer pela descrição
    _linhasFaturaLidas = (d.linhas || []).map((l, i) => {
        const artigoId = l.artigo_id || artigoParaTexto(l.descricao);
        return { ...l, ordem: i, artigo_id: artigoId, stock: l.stock ?? sugerirEntradaStock(artigoId, l) };
    });
    await carregarUltimosPrecos(_linhasFaturaLidas.map(l => l.artigo_id));

    const wrap  = document.getElementById("faturaLinhasWrap");
    const tbody = document.querySelector("#tabelaFaturaLinhas tbody");
    const avisosEl = document.getElementById("faturaAvisos");
    if (!wrap || !tbody) return;

    // Avisos do servidor: totais que não batem, fatura repetida, IBAN diferente
    if (d.avisos?.length) {
        avisosEl.innerHTML = d.avisos.map(a => `
            <div style="background:rgba(251,146,60,.12);border:1px solid rgba(251,146,60,.3);color:#9a5b04;border-radius:6px;padding:6px 10px;font-size:12px;margin-bottom:4px">
                ${escHtml(a)}
            </div>`).join("");
        avisosEl.style.display = "block";
    } else {
        avisosEl.style.display = "none";
        avisosEl.innerHTML = "";
    }

    tbody.innerHTML = _linhasFaturaLidas.map((l, i) => `
        <tr data-i="${i}">
            <td style="padding:3px 6px"><input value="${escHtml(l.descricao || "")}" data-campo="descricao"
                style="width:100%;padding:4px 6px;border:1px solid rgba(0,0,0,.12);border-radius:5px;font-size:12px;background:#fff;color:var(--text-dark)"></td>
            <td style="padding:3px 6px">
                <select data-campo="artigo" onchange="aoEscolherArtigoLinha(this)"
                    style="width:100%;padding:4px 6px;border:1px solid rgba(0,0,0,.12);border-radius:5px;font-size:12px;background:#fff;color:var(--text-dark)">
                    ${opcoesArtigos(l.artigo_id)}
                </select>
                <div class="linha-preco-ant" style="font-size:10px;margin-top:2px;line-height:1.3"></div>
            </td>
            <td style="padding:3px 6px"><input type="number" step="0.001" value="${l.quantidade ?? ""}" data-campo="quantidade"
                style="width:100%;padding:4px 6px;border:1px solid rgba(0,0,0,.12);border-radius:5px;font-size:12px;text-align:right;background:#fff;color:var(--text-dark)"></td>
            <td style="padding:3px 6px"><input value="${escHtml(l.unidade || "")}" data-campo="unidade"
                style="width:100%;padding:4px 6px;border:1px solid rgba(0,0,0,.12);border-radius:5px;font-size:12px;background:#fff;color:var(--text-dark)"></td>
            <td style="padding:3px 6px"><input type="number" step="0.01" value="${l.preco_unitario ?? ""}" data-campo="preco_unitario"
                style="width:100%;padding:4px 6px;border:1px solid rgba(0,0,0,.12);border-radius:5px;font-size:12px;text-align:right;background:#fff;color:var(--text-dark)"></td>
            <td style="padding:3px 6px"><input type="number" step="0.01" value="${l.valor_total ?? ""}" data-campo="valor_total"
                style="width:100%;padding:4px 6px;border:1px solid rgba(0,0,0,.12);border-radius:5px;font-size:12px;text-align:right;background:#fff;color:var(--text-dark)"></td>
            <td style="padding:3px 6px;text-align:center">
                <input type="checkbox" data-campo="stock" ${l.stock ? "checked" : ""}
                    title="Dar entrada desta quantidade no inventário"
                    style="width:16px;height:16px;cursor:pointer">
            </td>
            <td style="padding:3px 6px;text-align:center">
                <button type="button" onclick="this.closest('tr').remove(); actualizarResumoLinhas()"
                    style="background:rgba(224,148,134,.1);border:none;border-radius:5px;padding:3px 6px;cursor:pointer;font-size:12px">✕</button>
            </td>
        </tr>`).join("");

    // Comparação com o último preço pago, e a recalcular enquanto se corrige
    tbody.querySelectorAll("tr").forEach(tr => {
        actualizarPrecoAnterior(tr);
        tr.querySelector('[data-campo="preco_unitario"]')
          ?.addEventListener("input", () => actualizarPrecoAnterior(tr));
        tr.querySelector('[data-campo="stock"]')
          ?.addEventListener("change", actualizarResumoLinhas);
    });

    wrap.style.display = "block";
    actualizarResumoLinhas();
}

// Lê as linhas tal como estão no ecrã (já com as correções do utilizador)
function linhasFaturaDoEcra() {
    return [...document.querySelectorAll("#tabelaFaturaLinhas tbody tr")].map((tr, i) => {
        const v = (campo) => tr.querySelector(`[data-campo="${campo}"]`)?.value ?? "";
        const artigo = v("artigo");
        return {
            descricao_original: v("descricao").trim(),
            artigo_id:      artigo && artigo !== "__novo__" ? artigo : null,
            quantidade:     v("quantidade")     !== "" ? parseFloat(v("quantidade"))     : null,
            unidade:        v("unidade").trim() || null,
            preco_unitario: v("preco_unitario") !== "" ? parseFloat(v("preco_unitario")) : null,
            valor_total:    v("valor_total")    !== "" ? parseFloat(v("valor_total"))    : null,
            ordem: i,
            // Só para o ecrã: não é coluna de fatura_linhas, é retirado
            // antes de gravar e usado para a entrada em inventário.
            stock: !!tr.querySelector('[data-campo="stock"]')?.checked,
        };
    }).filter(l => l.descricao_original);
}

function actualizarResumoLinhas() {
    const el = document.getElementById("faturaLinhasResumo");
    if (!el) return;
    const linhas = linhasFaturaDoEcra();
    const soma   = linhas.reduce((s, l) => s + (l.valor_total || 0), 0);
    const base   = parseFloat(document.getElementById("movBase")?.value) || 0;
    const difere = base > 0 && Math.abs(soma - base) > 0.05;
    const paraStock = linhas.filter(l => l.stock && l.artigo_id && Number(l.quantidade) > 0).length;
    el.innerHTML = `${linhas.length} linha${linhas.length === 1 ? "" : "s"} · soma ${soma.toFixed(2)} €` +
        (difere ? ` <span style="color:#9a5b04">— não bate com a base de ${base.toFixed(2)} €</span>` : "") +
        (paraStock ? ` · ${paraStock} ${paraStock === 1 ? "dá" : "dão"} entrada em stock` : "");
}

function limparLinhasFatura() {
    _linhasFaturaLidas = [];
    const wrap = document.getElementById("faturaLinhasWrap");
    const tbody = document.querySelector("#tabelaFaturaLinhas tbody");
    if (tbody) tbody.innerHTML = "";
    if (wrap) wrap.style.display = "none";
}

// Depois de as linhas estarem gravadas: aprender os sinónimos e registar
// os preços. Corre sempre a seguir ao movimento, nunca antes — precisa
// dos ids das linhas e do fornecedor.
async function gravarSinonimosEPrecos(linhas, fornecedor_id, dataDoc) {
    const comArtigo = (linhas || []).filter(l => l.artigo_id);
    if (!comArtigo.length) return;

    // 1) Aprender: a descrição desta fatura passa a reconhecer o artigo
    const sinonimos = [];
    comArtigo.forEach(l => {
        const n = normalizarTextoArtigo(l.descricao_original);
        if (!n) return;
        if (_sinonimosFatura[n] === l.artigo_id) return;            // já aprendido
        const art = _artigosFatura.find(a => a.id === l.artigo_id);
        if (art && normalizarTextoArtigo(art.descricao) === n) return;  // é o próprio nome
        sinonimos.push({ texto: n, artigo_id: l.artigo_id, origem: "correcao" });
    });
    if (sinonimos.length) {
        const { error } = await SB.from("artigo_sinonimos")
            .upsert(sinonimos, { onConflict: "texto" });
        if (error) console.error("sinónimos:", error);
        else sinonimos.forEach(s => { _sinonimosFatura[s.texto] = s.artigo_id; });
    }

    // 2) Histórico de preços
    const precos = comArtigo
        .filter(l => Number(l.preco_unitario) > 0)
        .map(l => ({
            artigo_id:       l.artigo_id,
            fornecedor_id:   fornecedor_id || null,
            preco:           Number(l.preco_unitario),
            unidade:         l.unidade || null,
            data:            dataDoc,
            origem:          "fatura",
            fatura_linha_id: l.id,
        }));
    if (!precos.length) return;

    const { error: errP } = await SB.from("precos").insert(precos);
    if (errP) { console.error("preços:", errP); return; }

    // 3) O preço actual do artigo passa a ser o mais recente que conhecemos.
    //    Pergunta-se à base de dados em vez de assumir que esta fatura é a
    //    mais recente — pode estar a lançar-se uma fatura atrasada.
    for (const artigoId of [...new Set(precos.map(p => p.artigo_id))]) {
        delete _ultimosPrecos[artigoId];
        const { data: recente } = await SB.from("precos")
            .select("preco, data").eq("artigo_id", artigoId)
            .order("data", { ascending: false })
            .order("criado_em", { ascending: false })
            .limit(1).maybeSingle();
        if (!(Number(recente?.preco) > 0)) continue;
        await SB.from("artigos").update({ preco_atual: recente.preco }).eq("id", artigoId);
        const a = _artigosFatura.find(x => x.id === artigoId);
        if (a) a.preco_atual = recente.preco;
    }
}

// Entrada em inventário das linhas marcadas. Fica ligada à fatura e à
// linha, para se poder desfazer quando a fatura for corrigida e para se
// saber sempre de onde veio este material.
async function gravarEntradasStock(movId, gravadas, linhasEcra, dataDoc, referencia) {
    const porOrdem = {};
    (gravadas || []).forEach(g => { porOrdem[g.ordem] = g.id; });

    const entradas = (linhasEcra || [])
        .filter(l => l.stock && l.artigo_id && Number(l.quantidade) > 0)
        .map(l => ({
            artigo_id:       l.artigo_id,
            tipo_movimento:  "entrada",
            quantidade:      Number(l.quantidade),
            preco_unitario:  l.preco_unitario ?? null,
            data_movimento:  dataDoc,
            observacoes:     referencia ? `Fatura ${referencia}` : "Entrada por fatura",
            movimento_id:    movId,
            fatura_linha_id: porOrdem[l.ordem] || null,
        }));
    if (!entradas.length) return;

    const { error } = await SB.from("movimentos_stock").insert(entradas);
    if (error) {
        console.error("entradas de stock:", error);
        { console.error(error); alert("O movimento ficou gravado, mas a entrada em inventário não."); };
    }
}

// Escape de HTML, para usar em TODO o sítio onde um dado da base de dados
// entra numa string de HTML.
//
// A regra é escapar na LEITURA, não na entrada. O texto que vem de uma
// fatura lida — nome do fornecedor, referência, descrição de linha — é
// escolhido por quem manda a fatura, e basta conseguir enviar uma à empresa.
// Escapá-lo só no ecrã de revisão não chega: ele fica gravado e volta a
// aparecer em todos os ecrãs que o mostrem.
//
// Escapa também a plica, que faltava: sem ela, um atributo delimitado por
// plicas fica aberto a quem souber disso.
function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
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
        ok:   { bg: "rgba(143,191,160,.15)",  border: "rgba(143,191,160,.3)",  color: "#8fbfa0" },
        warn: { bg: "rgba(251,146,60,.15)",   border: "rgba(251,146,60,.3)",  color: "#fb923c" },
        err:  { bg: "rgba(224,148,134,.15)",  border: "rgba(224,148,134,.3)", color: "#e09486" },
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
// VISÃO GERAL
// O primeiro separador: o estado da casa num ecrã. O que precisa de
// decisão em cima, os números do mês a seguir, as obras, e os caminhos
// para o resto. Nada aqui é novo — é o que já está noutros separadores,
// reunido para não se ter de ir a cada um ver se há alguma coisa.
// =======================================================
const VG_SUBIDA_PC = 5;    // a partir daqui, um preço que sobe é para avisar

async function initVisaoGeral() {
    document.getElementById("vgActualizar")?.addEventListener("click", carregarVisaoGeral, { once: true });
    await carregarVisaoGeral();
}

async function carregarVisaoGeral() {
    const btn = document.getElementById("vgActualizar");
    if (btn) { btn.disabled = true; btn.textContent = "A ler…"; }

    await Promise.all([vgCarregarAlertas(), vgCarregarNumeros(), vgCarregarObras(), vgCarregarAtalhos()]);

    if (btn) {
        btn.disabled = false;
        btn.textContent = "Actualizar";
        btn.addEventListener("click", carregarVisaoGeral, { once: true });
    }
}

const vgEuros = (n) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

// ---------- O que precisa de decisão ----------
async function vgCarregarAlertas() {
    const cont = document.getElementById("vgAlertas");
    if (!cont) return;
    cont.innerHTML = '<div style="padding:14px 0;font-size:13px;opacity:.6">A ver…</div>';

    const alertas = [];
    for (const procurar of [vgPedidosPorValidar, vgPrecosSubiram, vgDespesasSemObra,
                            vgFaturasPorPagar, vgStockAbaixoMinimo, vgTarefasAtrasadas]) {
        try { const a = await procurar(); if (a) alertas.push(a); }
        catch (e) { console.warn(procurar.name, e); }
    }

    if (!alertas.length) {
        cont.innerHTML = '<div style="padding:14px 0;font-size:13.5px;opacity:.7">' +
            'Nada à tua espera. Nem preços fora do normal, nem faturas por imputar, nem tarefas atrasadas.</div>';
        return;
    }

    cont.innerHTML = alertas.map((a, i) => `
        <div style="display:flex;align-items:center;gap:14px;padding:13px 0;${i ? "border-top:1px solid rgba(0,0,0,.07)" : ""}">
            <span style="width:36px;height:36px;border-radius:9px;background:${a.cor};display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">${a.icone}</span>
            <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14.5px">${escHtml(a.titulo)}</div>
                <div style="font-size:12.5px;opacity:.65;margin-top:1px">${escHtml(a.sub)}</div>
            </div>
            ${a.fluxo || a.tab || a.ir ? `<button class="btn-secondary" style="font-size:12px;padding:4px 12px;flex-shrink:0"
                        onclick="${a.fluxo ? `abrirFluxoFiltrado(${escHtml(JSON.stringify(a.fluxo))})`
                                 : a.tab ? `abrirTab('${a.tab}')` : `location.href='${a.ir}'`}">Ver</button>` : ""}
        </div>`).join("");
}

async function vgPedidosPorValidar() {
    const { count } = await SB.from("pedidos").select("id", { count: "exact", head: true }).eq("estado", "rascunho");
    if (!count) return null;
    return { icone: "🛒", cor: "rgba(0,0,0,.06)",
             titulo: count === 1 ? "1 pedido de material por validar" : `${count} pedidos de material por validar`,
             sub: "Vieram do assistente e estão à espera de ti", ir: "assistente.html?f=pedidos" };
}

async function vgPrecosSubiram() {
    const { data } = await SB.from("precos")
        .select("artigo_id, preco, data, artigos(descricao)")
        .order("data", { ascending: false }).limit(400);
    if (!data?.length) return null;

    const porArtigo = {};
    data.forEach(p => { (porArtigo[p.artigo_id] ||= []).push(p); });

    const subidas = [];
    Object.values(porArtigo).forEach(lista => {
        if (lista.length < 2) return;
        const [novo, anterior] = lista;
        const a = Number(anterior.preco), n = Number(novo.preco);
        if (!(a > 0) || !(n > a)) return;
        const pc = ((n - a) / a) * 100;
        if (pc >= VG_SUBIDA_PC) subidas.push({ nome: novo.artigos?.descricao || "artigo", pc });
    });
    if (!subidas.length) return null;

    subidas.sort((x, y) => y.pc - x.pc);
    return { icone: "📄", cor: "rgba(181,136,99,.22)",
             titulo: subidas.length === 1 ? "Preço acima do anterior" : `${subidas.length} preços acima do anterior`,
             sub: `+${subidas[0].pc.toFixed(0)}% em ${subidas[0].nome}`, tab: "inventario" };
}

async function vgDespesasSemObra() {
    const { count } = await SB.from("movimentos_financeiros")
        .select("id", { count: "exact", head: true })
        .is("obra_id", null).eq("tipo", "saida").eq("ativo", true);
    if (!count) return null;
    return { icone: "🧾", cor: "rgba(0,0,0,.06)",
             titulo: count === 1 ? "1 despesa sem obra" : `${count} despesas sem obra`,
             sub: "Não entram no custo de nenhuma obra",
             fluxo: { filtroObra: SEM_OBRA, filtroTipo: "saida" } };
}

async function vgFaturasPorPagar() {
    const { data, count } = await SB.from("movimentos_financeiros")
        .select("valor_total", { count: "exact" })
        .neq("estado_pagamento", "pago").eq("tipo", "saida").eq("ativo", true).limit(200);
    if (!count) return null;
    const soma = (data || []).reduce((s, m) => s + Number(m.valor_total || 0), 0);
    return { icone: "💶", cor: "rgba(165,72,61,.10)",
             titulo: count === 1 ? "1 fatura por pagar" : `${count} faturas por pagar`,
             sub: vgEuros(soma),
             fluxo: { filtroEstadoPag: "por_pagar", filtroTipo: "saida" } };
}

async function vgStockAbaixoMinimo() {
    const [{ data: arts }, { data: movs }] = await Promise.all([
        SB.from("artigos").select("id, descricao, stock_inicial, stock_minimo").eq("ativo", true).gt("stock_minimo", 0),
        SB.from("movimentos_stock").select("artigo_id, tipo_movimento, quantidade"),
    ]);
    if (!arts?.length) return null;

    const saldo = {};
    (movs || []).forEach(m => {
        const q = Number(m.quantidade) || 0;
        const entra = m.tipo_movimento === "entrada" || m.tipo_movimento === "ajuste_entrada";
        saldo[m.artigo_id] = (saldo[m.artigo_id] || 0) + (entra ? q : -q);
    });
    const abaixo = arts.filter(a => (Number(a.stock_inicial) || 0) + (saldo[a.id] || 0) < Number(a.stock_minimo));
    if (!abaixo.length) return null;

    return { icone: "📦", cor: "rgba(0,0,0,.06)",
             titulo: abaixo.length === 1 ? "1 artigo abaixo do mínimo" : `${abaixo.length} artigos abaixo do mínimo`,
             sub: abaixo.slice(0, 3).map(a => a.descricao).join(", ") + (abaixo.length > 3 ? "…" : ""),
             tab: "inventario" };
}

async function vgTarefasAtrasadas() {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, count } = await SB.from("tarefas")
        .select("descricao, obras(nome)", { count: "exact" })
        .lt("data_prevista", hoje).neq("estado", "concluida").limit(5);
    if (!count) return null;
    return { icone: "⏰", cor: "rgba(181,136,99,.22)",
             titulo: count === 1 ? "1 tarefa atrasada" : `${count} tarefas atrasadas`,
             sub: data?.[0]?.obras?.nome || "sem obra", tab: "planeamento" };
}

// ---------- Números do mês ----------
async function vgCarregarNumeros() {
    const cont = document.getElementById("vgNumeros");
    if (!cont) return;

    const hoje = new Date();
    const mes  = hoje.toISOString().slice(0, 7) + "-01";
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().slice(0, 10);

    const [{ data: esteMes }, { data: anterior }, { count: obras }, { count: funcs }] = await Promise.all([
        SB.from("movimentos_financeiros").select("valor_total, tipo").gte("data_documento", mes).eq("ativo", true),
        SB.from("movimentos_financeiros").select("valor_total, tipo")
          .gte("data_documento", mesAnterior).lt("data_documento", mes).eq("ativo", true),
        SB.from("obras").select("id", { count: "exact", head: true }).eq("estado", "ativa"),
        SB.from("funcionarios").select("id", { count: "exact", head: true }).eq("ativo", true),
    ]);

    const somaPor = (lista, tipo) => (lista || [])
        .filter(m => m.tipo === tipo).reduce((s, m) => s + Number(m.valor_total || 0), 0);

    const saidas    = somaPor(esteMes, "saida");
    const entradas  = somaPor(esteMes, "entrada");
    const saidasAnt = somaPor(anterior, "saida");

    // A comparação só se mostra quando o mês anterior teve movimento;
    // "subiu infinito por cento" não diz nada a ninguém.
    let variacao = "";
    if (saidasAnt > 0) {
        const pc = ((saidas - saidasAnt) / saidasAnt) * 100;
        if (Math.abs(pc) < 1) {
            variacao = `<div style="font-size:11.5px;margin-top:4px;opacity:.6">como no mês passado</div>`;
        } else {
            const sobe = pc > 0;
            variacao = `<div style="font-size:11.5px;margin-top:4px;color:${sobe ? "#b45309" : "#15803d"}">
                ${sobe ? "▲" : "▼"} ${Math.abs(pc).toFixed(0)}% do que no mês passado</div>`;
        }
    }

    const cartao = (titulo, valor, extra = "") => `
        <div class="card metric">
            <h3>${titulo}</h3>
            <div class="value">${valor}</div>
            ${extra}
        </div>`;

    cont.innerHTML =
        cartao("Saídas este mês",   vgEuros(saidas), variacao) +
        cartao("Entradas este mês", vgEuros(entradas)) +
        cartao("Obras activas",     obras ?? "–") +
        cartao("Funcionários",      funcs ?? "–");
}

// ---------- Obras ----------
async function vgCarregarObras() {
    const cont = document.getElementById("vgObras");
    if (!cont) return;

    // Tudo da obra: os atalhos da gaveta abrem o painel, que precisa da
    // ficha inteira (pastas da Drive, datas, GPS).
    const { data: obras } = await SB.from("obras")
        .select("*")
        .eq("estado", "ativa").order("nome");

    if (!obras?.length) {
        cont.innerHTML = '<div style="padding:14px 0;font-size:13px;opacity:.6">Nenhuma obra activa.</div>';
        return;
    }

    const ids = obras.map(o => o.id);
    const [{ data: servicos }, { data: gastos }, { data: horas }] = await Promise.all([
        SB.from("obra_servicos").select("obra_id, nome, valor_orcamento, horas_orcamento, concluido, ordem").in("obra_id", ids),
        SB.from("movimentos_financeiros").select("obra_id, valor_total").in("obra_id", ids).eq("tipo", "saida").eq("ativo", true),
        SB.from("registos_admin").select("obra_id, horas").in("obra_id", ids),
    ]);

    const somar = (lista, campo) => (lista || []).reduce((acc, r) => {
        acc[r.obra_id] = (acc[r.obra_id] || 0) + (Number(r[campo]) || 0); return acc;
    }, {});
    const orcamento  = somar(servicos, "valor_orcamento");
    const horasOrc   = somar(servicos, "horas_orcamento");
    const gasto      = somar(gastos,   "valor_total");
    const horasReais = somar(horas,    "horas");

    const fase = {};
    (servicos || []).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .forEach(s => { if (!s.concluido && !fase[s.obra_id]) fase[s.obra_id] = s.nome; });

    cont.innerHTML = obras.map((o, i) => {
        const pc  = Math.max(0, Math.min(100, Number(o.percentagem_conclusao) || 0));
        const sub = [fase[o.id] || o.local || o.codigo, pc ? `${pc}%` : null].filter(Boolean).join(" · ");
        const g   = gasto[o.id] || 0, orc = orcamento[o.id] || 0;
        return `<div class="vg-obra" style="${i ? "border-top:1px solid rgba(0,0,0,.07)" : ""}">
            <div class="vg-obra-linha" role="button" tabindex="0" aria-expanded="false" data-id="${escHtml(o.id)}">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                <div style="min-width:0;flex:1">
                    <div style="font-weight:600;font-size:14.5px">${escHtml(o.nome)}</div>
                    <div style="font-size:12.5px;opacity:.65;margin-top:1px">${escHtml(sub || "sem fase definida")}</div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:13px;font-weight:600">${vgEuros(g)}</div>
                    ${orc > 0 ? `<div style="font-size:11.5px;opacity:.6">de ${vgEuros(orc)}</div>` : ""}
                </div>
                ${vgEtiqueta(o.id, orcamento, gasto, horasOrc, horasReais)}
                <span class="vg-obra-seta" aria-hidden="true">▾</span>
            </div>
            <div style="height:5px;border-radius:3px;background:rgba(0,0,0,.08);margin-top:9px;overflow:hidden">
                <i style="display:block;height:100%;width:${pc}%;background:var(--text-dark);border-radius:3px"></i>
            </div>
            </div>
            <div class="vg-gaveta"><div class="vg-gaveta-dentro">${vgAtalhosObra(o)}</div></div>
        </div>`;
    }).join("");

    const porId = Object.fromEntries(obras.map(o => [String(o.id), o]));
    cont.querySelectorAll(".vg-obra-linha").forEach(linha => {
        const alternar = () => vgAlternarGaveta(linha);
        linha.addEventListener("click", alternar);
        linha.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); }
        });
    });
    cont.querySelectorAll(".vg-atalho-obra").forEach(b => {
        b.addEventListener("click", () => vgIrParaObra(b.dataset.acao, porId[b.dataset.id]));
    });
}

// ---------- Gaveta de atalhos de cada obra ----------
// Tocar na linha abre por baixo os caminhos para essa obra. Só uma gaveta
// aberta de cada vez, para a lista não crescer sem se dar por isso.
function vgAlternarGaveta(linha) {
    const abrir = linha.getAttribute("aria-expanded") !== "true";
    document.querySelectorAll("#vgObras .vg-obra-linha[aria-expanded='true']").forEach(l => {
        l.setAttribute("aria-expanded", "false");
        l.parentElement.classList.remove("aberta");
    });
    if (abrir) {
        linha.setAttribute("aria-expanded", "true");
        linha.parentElement.classList.add("aberta");
    }
}

function vgAtalhosObra(o) {
    const temDrive = !!o.drive_pastas?.pasta;
    const temGps   = o.latitude != null && o.longitude != null;
    const atalhos = [
        { acao: "painel",     ic: "📊", nome: "Painel da obra" },
        { acao: "movimentos", ic: "💶", nome: "Movimentos" },
        { acao: "orcamentos", ic: "🧾", nome: "Orçamentos" },
        { acao: "tarefa",     ic: "🗓", nome: "Nova tarefa" },
        { acao: "drive",      ic: "📁", nome: "Pasta Drive", off: !temDrive },
        { acao: "mapa",       ic: "📍", nome: "Ver no mapa", off: !temGps },
    ];
    return atalhos.map(a => `
        <button type="button" class="vg-atalho-obra${a.off ? " off" : ""}" data-acao="${a.acao}" data-id="${escHtml(o.id)}">
            <span aria-hidden="true">${a.ic}</span>${a.nome}
        </button>`).join("");
}

// Pedidos que outro separador aplica quando acaba de carregar as listas.
let _fluxoObraPedida = null;

async function vgIrParaObra(acao, o) {
    if (!o) return;
    if (acao === "painel") return abrirPainelObra(o);
    if (acao === "drive") {
        if (!o.drive_pastas?.pasta) return alert("Esta obra ainda não tem pasta no Google Drive. Edita a obra e cola o link da pasta.");
        return window.open(urlPastaDrive(o.drive_pastas.pasta), "_blank");
    }
    if (acao === "mapa") {
        if (o.latitude == null || o.longitude == null) return alert("Esta obra ainda não tem localização GPS. Edita a obra para a marcar.");
        return window.open(`https://www.google.com/maps?q=${encodeURIComponent(o.latitude)},${encodeURIComponent(o.longitude)}`, "_blank");
    }
    if (acao === "movimentos") {
        _fluxoObraPedida = String(o.id);
        return abrirTab("financeiro", "fluxo");
    }
    if (acao === "orcamentos") {
        const pesq = document.getElementById("pesquisaOrcamentos");
        if (pesq) pesq.value = o.nome || "";
        abrirTab("orcamentos");
        if (typeof switchOrcSub === "function") switchOrcSub("clientes");
        return;
    }
    if (acao === "tarefa") {
        abrirTab("planeamento");
        if (!_planObras.length) await carregarPlanObras();
        abrirModalTarefa(null);
        const sel = document.getElementById("planObra");
        if (sel) { sel.value = String(o.id); sel.dispatchEvent(new Event("change")); }
    }
}

function vgEtiqueta(id, orcamento, gasto, horasOrc, horasReais) {
    const et = (texto, bg, cor) =>
        `<span style="font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:20px;white-space:nowrap;background:${bg};color:${cor}">${texto}</span>`;

    const orc = orcamento[id] || 0, g = gasto[id] || 0;
    const ho  = horasOrc[id] || 0, hr = horasReais[id] || 0;

    if (orc > 0) {
        const pc = (g / orc) * 100;
        if (pc > 100) return et(`Acima ${(pc - 100).toFixed(0)}%`, "rgba(165,72,61,.14)", "var(--etq-erro,#a4332a)");
        if (pc >= 90) return et(`Orçamento a ${pc.toFixed(0)}%`, "rgba(181,136,99,.22)", "var(--etq-aviso,#8a5e06)");
    }
    if (ho > 0) {
        const pc = (hr / ho) * 100;
        if (pc >= 80) return et(`Horas a ${pc.toFixed(0)}%`, "rgba(181,136,99,.22)", "var(--etq-aviso,#8a5e06)");
    }
    if (orc > 0) return et("No orçamento", "rgba(79,122,99,.14)", "var(--etq-ok,#1f6b1f)");
    return et("Sem orçamento", "rgba(128,128,128,.14)", "var(--text-muted)");
}

// ---------- Para onde ir ----------
async function vgCarregarAtalhos() {
    const cont = document.getElementById("vgAtalhos");
    if (!cont) return;

    const hoje = new Date().toISOString().slice(0, 10);
    const mes  = hoje.slice(0, 7) + "-01";

    const conta = async (tabela, afinar) => {
        try {
            let q = SB.from(tabela).select("id", { count: "exact", head: true });
            if (afinar) q = afinar(q);
            const { count, error } = await q;
            return error ? null : (count ?? 0);
        } catch { return null; }
    };

    const [docsMes, artigos, tarefas, registosHoje] = await Promise.all([
        conta("movimentos_financeiros", q => q.gte("data_documento", mes).eq("ativo", true)),
        conta("artigos",        q => q.eq("ativo", true)),
        conta("tarefas",        q => q.neq("estado", "concluida")),
        conta("registos_admin", q => q.eq("data", hoje)),
    ]);

    const plural = (n, um, muitos) => n == null ? "ver" : `${n} ${n === 1 ? um : muitos}`;

    const atalhos = [
        { ic: "💶", nome: "Financeiro",  sub: plural(docsMes, "documento este mês", "documentos este mês"), tab: "financeiro" },
        { ic: "📦", nome: "Stock",       sub: plural(artigos, "artigo", "artigos"),                          tab: "inventario" },
        { ic: "🗓", nome: "Planeamento", sub: plural(tarefas, "tarefa por fazer", "tarefas por fazer"),      tab: "planeamento" },
        { ic: "🏗", nome: "Obras",       sub: "fichas e serviços",                                           tab: "obras" },
        { ic: "👷", nome: "Funcionários",sub: "fichas e dispositivos",                                       tab: "funcionarios" },
        { ic: "📊", nome: "Fluxo de caixa", sub: "entradas e saídas",                                        tab: "fluxo" },
        { ic: "📋", nome: "Registo diário", sub: plural(registosHoje, "registo hoje", "registos hoje"),      ir: "registo-admin.html" },
        { ic: "✨", nome: "Assistente",   sub: "faturas, material, planos",                                   ir: "assistente.html" },
    ];

    cont.innerHTML = atalhos.map(a => {
        const accao = a.tab ? `onclick="abrirTab('${a.tab}')"` : `onclick="location.href='${a.ir}'"`;
        return `<button class="card" ${accao}
            style="text-align:left;border:none;cursor:pointer;padding:14px 16px;display:flex;flex-direction:column;gap:3px;font:inherit">
            <span style="font-size:19px;line-height:1;margin-bottom:3px">${a.ic}</span>
            <span style="font-weight:600;font-size:14px">${a.nome}</span>
            <span style="font-size:11.5px;opacity:.6">${escHtml(a.sub)}</span>
        </button>`;
    }).join("");
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
    data?.forEach(u => { sel.innerHTML += `<option value="${escHtml(u.id)}">${escHtml(u.codigo)}</option>`; });
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#e09486">Erro: ${error.message}</td></tr>`;
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
            <td>${escHtml(a.codigo || "")}</td>
            <td class="largo">${escHtml(a.descricao || "")}</td>
            <td>${escHtml(a.tipo_artigo || "")}</td>
            <td>${Number(a.preco_atual || 0).toFixed(2)} €</td>
            <td style="color:${stockBaixo ? "#f97316" : "inherit"};font-weight:${stockBaixo ? "700" : "400"}">
                <span>${a.quantidade ?? 0}${stockBaixo ? " ⚠️" : ""}${a.stock_minimo ? `<span style="font-size:10px;opacity:.5;margin-left:4px">(mín: ${a.stock_minimo})</span>` : ""}</span>
            </td>
            <td>${escHtml(a.local_armazenamento || "")}</td>
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
    document.getElementById("artQtdInicial").value = "";
    const _asm = document.getElementById("artStockMin"); if (_asm) _asm.value = d?.stock_minimo ?? "";

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

    await carregarHistoricoPrecos(artigoEditId);
}

// Preços que este artigo já teve, mais recente primeiro, com a variação
// em relação à compra anterior. Vem do que foi lido nas faturas.
async function carregarHistoricoPrecos(artigoId) {
    const wrap  = document.getElementById("artPrecosWrap");
    const lista = document.getElementById("artPrecosLista");
    if (!wrap || !lista) return;

    if (!artigoId) { wrap.style.display = "none"; lista.innerHTML = ""; return; }

    const { data, error } = await SB.from("precos")
        .select("preco, unidade, data, origem, fornecedores(nome)")
        .eq("artigo_id", artigoId)
        .order("data", { ascending: false })
        .limit(12);

    if (error) { wrap.style.display = "none"; console.warn("histórico de preços:", error); return; }

    if (!data.length) {
        lista.innerHTML = '<div style="font-size:12px;opacity:.6">Ainda sem preços registados. Aparecem aqui à medida que as faturas forem lidas.</div>';
        wrap.style.display = "block";
        return;
    }

    lista.innerHTML = data.map((p, i) => {
        const ant = data[i + 1];                 // a compra anterior (data mais antiga)
        let variacao = "";
        if (ant && Number(ant.preco) > 0) {
            const pc = ((Number(p.preco) - Number(ant.preco)) / Number(ant.preco)) * 100;
            if (Math.abs(pc) >= 1) {
                const sobe = pc > 0;
                variacao = `<span style="color:${sobe ? "#b45309" : "#15803d"};font-weight:600;font-size:11px">
                    ${sobe ? "▲" : "▼"} ${Math.abs(pc).toFixed(0)}%</span>`;
            }
        }
        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-top:${i ? "1px solid rgba(0,0,0,.06)" : "none"};font-size:12px">
            <span style="width:84px;opacity:.7">${p.data}</span>
            <span style="font-weight:600;width:84px">${Number(p.preco).toFixed(2)} €${p.unidade ? "/" + escHtml(p.unidade) : ""}</span>
            ${variacao}
            <span style="flex:1;text-align:right;opacity:.6">${escHtml(p.fornecedores?.nome || (p.origem === "manual" ? "manual" : "—"))}</span>
        </div>`;
    }).join("");
    wrap.style.display = "block";
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
    const cores  = { entrada: "#8fbfa0", saida: "#e09486", ajuste: "#b58863", inicial: "#85B7EB" };

    tbody.innerHTML = comSaldo.map(m => {
        const cor   = cores[m.tipo_movimento] || "#888";
        const label = labels[m.tipo_movimento] || m.tipo_movimento;
        const delta = m.tipo_movimento === "saida" ? -m.quantidade : +m.quantidade;
        const sinal = delta >= 0 ? "+" : "";
        return `<tr>
            <td>${escHtml(m.data_movimento || "—")}</td>
            <td><span style="color:${cor};font-weight:600">${label}</span></td>
            <td style="text-align:right;color:${cor}">${sinal}${delta}</td>
            <td style="text-align:right;font-weight:500">${m.saldo}</td>
            <td style="opacity:.7;font-size:12px">${escHtml(m.observacoes || "—")}</td>
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
        unidade_id:          unidadeVal ? parseInt(unidadeVal) : null,
        stock_minimo:        parseInt(document.getElementById("artStockMin")?.value) || null
    };

    if (artigoEditId) {
        // EDITAR — actualizar dados do artigo
        const { error } = await SB.from("artigos").update(payload).eq("id", artigoEditId);
        if (error) { console.error(error); msg.textContent = "Não foi possível gravar."; return; }

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
        if (error) { console.error(error); msg.textContent = "Não foi possível gravar."; return; }

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
                    <span class="etq-tipo">${escHtml(tipoLabel)}</span>
                </div>
                <div class="etq-body">
                    <canvas class="etq-qr" data-url="${url}" width="100" height="100"></canvas>
                    <div class="etq-info">
                        <div class="etq-codigo">${escHtml(item.codigo)}</div>
                        <div class="etq-nome">${escHtml(item.nome)}</div>
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
  .etq-empresa { font-size: 5pt; font-weight: 700; letter-spacing: .5pt; color: #b58863; }
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
                 obra_origem:obras!movimentos_stock_obra_origem_id_fkey(id, nome),
                 obra_destino:obras!movimentos_stock_obra_destino_id_fkey(id, nome)`)
        .order("data_movimento", { ascending: false })
        .order("created_at",     { ascending: false })
        .limit(200);

    if (filtroFunc)   query = query.eq("funcionario_id", filtroFunc);
    if (filtroInicio) query = query.gte("data_movimento", filtroInicio);
    if (filtroFim)    query = query.lte("data_movimento", filtroFim);

    const { data, error } = await query;
    if (error) { tbody.innerHTML = `<tr><td colspan="8" style="color:#e09486;text-align:center;padding:16px">Erro: ${error.message}</td></tr>`; return; }

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
    const tipoCor   = { entrada: "#8fbfa0", saida: "#e09486", ajuste_entrada: "#b58863", ajuste_saida: "#b58863", inicial: "#85b7eb" };

    lista.forEach(m => {
        const cor    = tipoCor[m.tipo_movimento]   || "#888";
        const label  = tipoLabel[m.tipo_movimento] || m.tipo_movimento;
        const origem  = m.obra_origem?.nome  || (m.observacoes?.includes("Armazém") ? "Armazém" : "—");
        const destino = m.obra_destino?.nome || (m.observacoes?.includes("Armazém") ? "Armazém" : "—");
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-size:12px;opacity:.7">${m.data_movimento ? escHtml(String(m.data_movimento).slice(0, 10).split("-").reverse().join("/")) : "—"}</td>
            <td class="largo"><div>
                <div style="font-weight:600;font-size:13px">${escHtml(m.artigos?.descricao || "—")}</div>
                <div style="font-size:11px;opacity:.5;font-family:monospace">${escHtml(m.artigos?.codigo || "")}</div>
            </div></td>
            <td><span style="color:${cor};font-weight:700;font-size:12px">${label}</span></td>
            <td style="text-align:right;font-weight:600">${m.quantidade ?? "—"}</td>
            <td style="font-size:13px">${escHtml(m.funcionarios?.nome || "—")}</td>
            <td style="font-size:12px;opacity:.8">${escHtml(origem)}</td>
            <td style="font-size:12px;opacity:.8">${escHtml(destino)}</td>
            <td class="largo" style="font-size:11px;opacity:.6">${escHtml(m.observacoes || "")}</td>`;
        tbody.appendChild(tr);
    });
}

async function carregarFiltrosMovStock() {
    // Preencher select de funcionários
    const selFunc = document.getElementById("filtroMovFunc");
    if (selFunc && selFunc.options.length <= 1) {
        const { data } = await SB.from("funcionarios").select("id, nome").order("nome");
        data?.forEach(f => { selFunc.innerHTML += `<option value="${escHtml(f.id)}">${escHtml(f.nome)}</option>`; });
    }
    // Preencher select de obras
    const selObra = document.getElementById("filtroMovObra");
    if (selObra && selObra.options.length <= 1) {
        const { data } = await SB.from("obras").select("id, nome, codigo").order("nome");
        data?.forEach(o => {
            const etiqueta = o.codigo ? `${o.codigo} · ${o.nome}` : o.nome;
            selObra.innerHTML += `<option value="${escHtml(o.id)}">${escHtml(etiqueta)}</option>`;
        });
    }
}

async function apagarArtigo(id, nome) {
    if (!confirm(`Apagar "${nome}"? Esta ação não pode ser revertida.`)) return;
    const { error } = await SB.from("artigos").delete().eq("id", id);
    if (error) { { console.error(error); alert("Não foi possível concluir a operação."); }; return; }
    await carregarArtigos();
}

// =======================================================

// =======================================================
// PAINEL DE OBRA — modal completo com sub-tabs
// =======================================================
let _painelObraActual = null;


function fecharPainelObra() {
    const m = document.getElementById("modalPainelObra");
    // O painel é aberto com style.display = "flex". Um estilo em linha ganha
    // sempre à classe, por isso só acrescentar "hidden" não o fechava.
    if (m) { m.style.display = "none"; m.classList.add("hidden"); }
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
    if (tab === "documentos") carregarPainelDocumentos();
}

// ── Documentos da obra (Google Drive) ────────────────────────
// Cada obra tem uma pasta no Google Drive (Maia Solutions › Obras) com
// subpastas por tipo. Guardam-se os IDs em obras.drive_pastas. Os ficheiros
// adicionam-se na própria Drive: no telemóvel o link abre a app Google Drive.
const DRIVE_SUBPASTAS = [
    { chave: "fotos",      icone: "📷", nome: "Fotos",                              dica: "Fotos da obra, por data" },
    { chave: "orcamentos", icone: "🧾", nome: "Orçamentos e mapas de quantidades", dica: "Orçamentos, mapas e comparações de fornecedores" },
    { chave: "projeto",    icone: "📐", nome: "Projeto e desenhos",                 dica: "Projetos, plantas e desenhos" },
    { chave: "faturas",    icone: "💶", nome: "Faturas",                            dica: "Faturas de fornecedores e ao cliente" },
    { chave: "documentos", icone: "📄", nome: "Declarações e outros documentos",    dica: "Declarações, licenças, contratos, autos" },
];

function urlPastaDrive(id) {
    return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

function idPastaDrive(link) {
    if (!link) return null;
    const m = link.match(/\/folders\/([\w-]{10,})/) || link.match(/[?&]id=([\w-]{10,})/);
    if (m) return m[1];
    return /^[\w-]{10,}$/.test(link) ? link : null;
}

// HTML das pastas da obra no Google Drive (ficheiros internos da empresa).
function htmlPastasDrive() {
    const pastas = _painelObraActual?.drive_pastas;
    if (!pastas?.pasta) {
        return `<div style="padding:16px;text-align:center;opacity:.6;font-size:13px">
            Esta obra ainda não tem pasta no Google Drive.<br>
            <span style="font-size:12px">Cria a pasta na Drive e cola o link em ✏️ Editar obra › Pasta no Google Drive.</span></div>`;
    }
    const cartao = (icone, nome, dica, id) => `
        <a href="${urlPastaDrive(id)}" target="_blank" rel="noopener" class="card"
           style="display:flex;align-items:center;gap:12px;padding:14px;text-decoration:none;color:inherit;margin:0">
            <span style="font-size:24px">${icone}</span>
            <span style="flex:1;min-width:0">
                <span style="display:block;font-weight:600;font-size:13px">${nome}</span>
                <span style="display:block;font-size:11px;opacity:.55">${dica}</span>
            </span>
            <span style="font-size:11px;color:var(--primary);white-space:nowrap">Abrir ↗</span>
        </a>`;
    const subs = DRIVE_SUBPASTAS.filter(s => pastas[s.chave]);
    return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 12px">
            <div style="font-size:12px;opacity:.6">Para adicionar ficheiros, abre a pasta e usa <b>+ Novo › Carregar</b> (computador) ou <b>+</b> (app Google Drive no telemóvel).</div>
            <a href="${urlPastaDrive(pastas.pasta)}" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;white-space:nowrap">📁 Abrir pasta da obra</a>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
            ${subs.map(s => cartao(s.icone, s.nome, s.dica, pastas[s.chave])).join("")}
        </div>`;
}

// ── Documentos carregados na obra (Storage do Supabase) ──────
// Os PDFs que saem do TOCONLINE (orçamentos, faturas de venda, recibos),
// fotos e outros documentos. Ficam no bucket privado "obra-documentos", em
// <obra_id>/<ficheiro>. O assistente lê os PDFs e propõe o registo; nada é
// gravado sem confirmação. "Visível ao cliente" marca o que a futura Área do
// cliente vai mostrar.
const BUCKET_DOCS_OBRA = "obra-documentos";
const MAX_DOC_OBRA     = 20 * 1024 * 1024;   // limite do bucket
const MAX_LER_DOC      = 8 * 1024 * 1024;    // limite da leitura pelo assistente

const TIPOS_DOC_OBRA = {
    orcamento: { icone: "🧾", nome: "Orçamento",       ler: true,  visivel: true  },
    fatura:    { icone: "💶", nome: "Fatura de venda", ler: true,  visivel: true  },
    recibo:    { icone: "✅", nome: "Recibo",          ler: true,  visivel: true  },
    foto:      { icone: "📷", nome: "Foto",            ler: false, visivel: false },
    outro:     { icone: "📄", nome: "Outro documento", ler: false, visivel: false },
};

const escDoc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtEurDoc = v => v == null || v === "" ? "—" : Number(v).toFixed(2).replace(".", ",") + " €";

function msgDocObra(texto, tipo = "ok") {
    const el = document.getElementById("docObraMsg");
    if (!el) return;
    const cores = { ok: "#8fbfa0", warn: "#fb923c", err: "#e09486" };
    el.style.display = texto ? "block" : "none";
    el.style.color = cores[tipo] || cores.ok;
    el.textContent = texto || "";
}

async function carregarPainelDocumentos() {
    const el = document.getElementById("painelTab-documentos");
    const obra = _painelObraActual;
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;

    const [docsRes, cliRes] = await Promise.all([
        SB.from("obra_documentos").select("*").eq("obra_id", obra.id).order("created_at", { ascending: false }),
        obra.cliente_id
            ? SB.from("clientes").select("*").eq("id", obra.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    if (_painelObraActual?.id !== obra.id) return;   // mudou de obra entretanto

    const docs    = docsRes.data || [];
    const cliente = cliRes.data;
    const erroTabela = docsRes.error
        ? `<div style="color:#e09486;font-size:12px;margin-bottom:8px">Não foi possível ler os documentos: ${escDoc(docsRes.error.message)}</div>` : "";

    const fotosHeic = docs.filter(d => ehHeic({ name: d.nome_ficheiro, type: d.mime }));

    const opcoesTipo = Object.entries(TIPOS_DOC_OBRA)
        .map(([k, t]) => `<option value="${k}">${t.icone} ${t.nome}</option>`).join("");

    const linha = d => {
        const t = TIPOS_DOC_OBRA[d.tipo] || TIPOS_DOC_OBRA.outro;
        const estado = d.estado === "registado"
            ? `<span style="color:#8fbfa0;font-size:11px">✓ Registado</span>`
            : d.estado === "por_tratar"
                ? `<button class="btn-secondary" style="font-size:11px;padding:4px 8px" onclick="tratarDocumentoObra('${d.id}')">🤖 Ler e registar</button>`
                : `<span style="opacity:.45;font-size:11px">Guardado</span>`;
        const info = [d.numero_documento, d.data_documento].filter(Boolean).map(escDoc).join(" · ");
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap">
            <span style="font-size:20px">${t.icone}</span>
            <span style="flex:1;min-width:160px">
                <a href="#" onclick="abrirDocumentoObra('${d.id}');return false" style="color:inherit;font-weight:600;font-size:13px;word-break:break-all">${escDoc(d.nome_ficheiro)}</a>
                <span style="display:block;font-size:11px;opacity:.5">${t.nome}${info ? " · " + info : ""} · carregado ${new Date(d.created_at).toLocaleDateString("pt-PT")}</span>
            </span>
            ${estado}
            <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;opacity:.85;color:inherit;text-transform:none;letter-spacing:0;white-space:nowrap;width:auto;margin:0" title="A futura Área do cliente mostra este documento">
                <input type="checkbox" style="width:auto;margin:0" ${d.visivel_cliente ? "checked" : ""} onchange="alternarVisivelDocObra('${d.id}', this.checked)"> Visível ao cliente
            </label>
            <button onclick="apagarDocumentoObra('${d.id}')" title="Apagar" style="background:none;border:none;cursor:pointer;font-size:14px;opacity:.6">🗑</button>
        </div>`;
    };

    el.innerHTML = `
        <div class="card" style="padding:14px;margin:4px 0 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:20px">👤</span>
            <span style="flex:1;min-width:160px">
                <span style="display:block;font-size:11px;opacity:.5;text-transform:uppercase;letter-spacing:1px">Cliente da obra</span>
                ${cliente
                    ? `<span style="font-weight:600">${escDoc(cliente.nome)}</span>
                       <span style="font-size:12px;opacity:.6">${[cliente.nif && "NIF " + cliente.nif, cliente.email, cliente.telefone].filter(Boolean).map(escDoc).join(" · ")}</span>
                       <span style="display:block;font-size:11px;margin-top:2px;color:${cliente.acesso_ativo ? "#8fbfa0" : "rgba(255,255,255,.4)"}">🔗 Área do cliente: ${cliente.acesso_ativo ? "ligada" : "sem link"}</span>`
                    : `<span style="opacity:.6;font-size:13px">Sem cliente. Fica ligado ao carregar o primeiro orçamento ou fatura, ou define-o já.</span>`}
            </span>
            <button class="btn-secondary" onclick="abrirFichaClienteObra()">${cliente ? "✏️ Cliente e link" : "+ Definir cliente"}</button>
        </div>

        <div class="card doc-carregar">
            <div class="doc-carregar-titulo">⬆ Carregar documento</div>
            <div class="barra-filtros" style="margin:0">
                <select id="docObraTipo" onchange="document.getElementById('docObraVisivel').checked = TIPOS_DOC_OBRA[this.value].visivel">${opcoesTipo}</select>
                <input type="file" id="docObraFicheiro" multiple accept="application/pdf,image/*,.heic,.heif" hidden onchange="mostrarFicheirosDocObra(this)">
                <label for="docObraFicheiro" class="btn-pequeno doc-escolher" id="docObraEscolhidos">📎 Escolher ficheiro</label>
                <label class="doc-visivel">
                    <input type="checkbox" id="docObraVisivel" checked> Visível ao cliente
                </label>
                <button class="btn-icone" id="btnCarregarDocObra" onclick="carregarDocumentoObra()" title="Carregar">⬆</button>
            </div>
            <div style="font-size:11px;opacity:.5;margin-top:6px">O assistente lê orçamentos, faturas e recibos antes de gravar. Fotos passam a JPG. Máx. 20 MB.</div>
            <div id="docObraMsg" style="display:none;font-size:12px;margin-top:6px"></div>
        </div>
        ${fotosHeic.length ? `
        <div class="card doc-carregar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="flex:1;min-width:180px;font-size:12.5px">📷 ${fotosHeic.length === 1 ? "1 foto está" : fotosHeic.length + " fotos estão"} em HEIC e não aparece${fotosHeic.length === 1 ? "" : "m"} no Android nem na Área do cliente.</span>
            <button class="btn-pequeno" id="btnConverterHeic" onclick="converterFotosHeicObra()">Converter para JPG</button>
        </div>` : ""}

        ${erroTabela}
        <div class="card" style="padding:0;margin:0 0 20px;overflow:hidden">
            ${docs.length ? docs.map(linha).join("")
                : `<div style="padding:20px;text-align:center;opacity:.5;font-size:13px">Ainda não há documentos carregados nesta obra.</div>`}
        </div>

        <div style="font-family:var(--font-title,sans-serif);font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:8px">Pastas da empresa no Google Drive (o cliente não vê)</div>
        ${htmlPastasDrive()}`;
}

function nomeSeguroFicheiro(nome) {
    return (nome || "ficheiro")
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-80);
}

function mostrarFicheirosDocObra(inp) {
    const n = inp.files?.length || 0;
    const el = document.getElementById("docObraEscolhidos");
    if (!el) return;
    el.textContent = n === 0 ? "📎 Escolher ficheiro" : n === 1 ? "📎 " + inp.files[0].name : `📎 ${n} ficheiros`;
    el.title = [...(inp.files || [])].map(f => f.name).join("\n");
}

async function carregarDocumentoObra() {
    const obra = _painelObraActual;
    const inp  = document.getElementById("docObraFicheiro");
    const tipo = document.getElementById("docObraTipo").value;
    const visivel = document.getElementById("docObraVisivel").checked;
    let ficheiros = [...(inp.files || [])];
    if (!ficheiros.length) { msgDocObra("Escolhe primeiro o ficheiro.", "warn"); return; }

    const btn = document.getElementById("btnCarregarDocObra");
    btn.disabled = true; btn.textContent = "⏳";

    // Fotos (e qualquer HEIC) passam a JPEG reduzido antes de gravar
    try {
        const novos = [];
        for (const f of ficheiros) {
            if (tipo === "foto" || ehHeic(f)) {
                msgDocObra(`A preparar "${f.name}"…`, "warn");
                novos.push(await prepararFoto(f));
            } else novos.push(f);
        }
        ficheiros = novos;
    } catch (e) {
        console.error("prepararFoto:", e);
        btn.disabled = false; btn.textContent = "⬆";
        msgDocObra("Não foi possível converter a foto: " + e.message, "err");
        return;
    }

    const grandes = ficheiros.filter(f => f.size > MAX_DOC_OBRA);
    if (grandes.length) {
        btn.disabled = false; btn.textContent = "⬆";
        msgDocObra(`"${grandes[0].name}" tem mais de 20 MB.`, "err"); return;
    }

    const { data: { session } } = await SB.auth.getSession();
    const ler = TIPOS_DOC_OBRA[tipo].ler;
    const criados = [];

    try {
        for (const f of ficheiros) {
            msgDocObra(`A carregar "${f.name}"…`, "warn");
            const caminho = `${obra.id}/${Date.now()}-${nomeSeguroFicheiro(f.name)}`;
            const up = await SB.storage.from(BUCKET_DOCS_OBRA).upload(caminho, f, { contentType: f.type || undefined });
            if (up.error) throw new Error(up.error.message);

            const { data: doc, error } = await SB.from("obra_documentos").insert({
                obra_id: obra.id, tipo, nome_ficheiro: f.name, caminho,
                mime: f.type || null, tamanho: f.size, visivel_cliente: visivel,
                estado: ler ? "por_tratar" : "arquivado",
                criado_por: session?.user?.email || null,
            }).select().single();
            if (error) {
                await SB.storage.from(BUCKET_DOCS_OBRA).remove([caminho]);
                throw new Error(error.message);
            }
            criados.push({ doc, ficheiro: f });
        }
    } catch (e) {
        console.error("carregarDocumentoObra:", e);
        await carregarPainelDocumentos();
        msgDocObra("Não foi possível carregar: " + e.message, "err");
        return;
    } finally {
        btn.disabled = false; btn.textContent = "⬆";
    }

    await carregarPainelDocumentos();
    if (ler && criados.length === 1) {
        await tratarDocumentoObra(criados[0].doc.id, criados[0].ficheiro);
    } else {
        msgDocObra(ler
            ? `${criados.length} documentos carregados. Usa "Ler e registar" em cada um.`
            : `${criados.length === 1 ? "Documento carregado" : criados.length + " documentos carregados"}.`);
    }
}

// Fotos antigas em HEIC: troca cada ficheiro por um JPEG no mesmo sítio
// do armazenamento e atualiza a linha. O ficheiro HEIC só se apaga depois
// de o JPEG e a linha estarem gravados.
async function converterFotosHeicObra() {
    const obra = _painelObraActual;
    const btn = document.getElementById("btnConverterHeic");
    const { data: docs, error } = await SB.from("obra_documentos").select("*").eq("obra_id", obra.id);
    if (error) { msgDocObra("Não foi possível ler os documentos: " + error.message, "err"); return; }
    const heic = (docs || []).filter(d => ehHeic({ name: d.nome_ficheiro, type: d.mime }));
    if (!heic.length) return carregarPainelDocumentos();
    if (btn) btn.disabled = true;

    let feitas = 0;
    try {
        for (const d of heic) {
            if (btn) btn.textContent = `⏳ ${feitas + 1}/${heic.length}`;
            const dl = await SB.storage.from(BUCKET_DOCS_OBRA).download(d.caminho);
            if (dl.error) throw new Error(dl.error.message);
            const jpg = await prepararFoto(new File([dl.data], d.nome_ficheiro, { type: d.mime || "image/heic" }));
            const caminho = d.caminho.replace(/\.[^./]+$/, "") + ".jpg";
            const up = await SB.storage.from(BUCKET_DOCS_OBRA).upload(caminho, jpg, { contentType: "image/jpeg", upsert: true });
            if (up.error) throw new Error(up.error.message);
            const { error: e2 } = await SB.from("obra_documentos").update({
                caminho, nome_ficheiro: jpg.name, mime: "image/jpeg", tamanho: jpg.size,
            }).eq("id", d.id);
            if (e2) {
                await SB.storage.from(BUCKET_DOCS_OBRA).remove([caminho]);
                throw new Error(e2.message);
            }
            await SB.storage.from(BUCKET_DOCS_OBRA).remove([d.caminho]);
            feitas++;
        }
    } catch (e) {
        console.error("converterFotosHeicObra:", e);
        await carregarPainelDocumentos();
        msgDocObra(`Converti ${feitas} de ${heic.length}. Falhou: ${e.message}`, "err");
        return;
    }
    await carregarPainelDocumentos();
    msgDocObra(feitas === 1 ? "1 foto convertida para JPG." : `${feitas} fotos convertidas para JPG.`);
}

async function abrirDocumentoObra(id) {
    const { data: doc } = await SB.from("obra_documentos").select("caminho").eq("id", id).single();
    if (!doc) return;
    const { data, error } = await SB.storage.from(BUCKET_DOCS_OBRA).createSignedUrl(doc.caminho, 600);
    if (error) { msgDocObra("Não foi possível abrir: " + error.message, "err"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
}

async function alternarVisivelDocObra(id, visivel) {
    const { error } = await SB.from("obra_documentos").update({ visivel_cliente: visivel }).eq("id", id);
    if (error) { msgDocObra("Não foi possível alterar: " + error.message, "err"); carregarPainelDocumentos(); }
}

async function apagarDocumentoObra(id) {
    const { data: doc } = await SB.from("obra_documentos").select("*").eq("id", id).single();
    if (!doc) return;
    const aviso = doc.estado === "registado"
        ? "\n\nO que já foi registado (orçamento ou movimento no Financeiro) fica como está." : "";
    if (!confirm(`Apagar "${doc.nome_ficheiro}"?${aviso}`)) return;
    const { error } = await SB.from("obra_documentos").delete().eq("id", id);
    if (error) { msgDocObra("Não foi possível apagar: " + error.message, "err"); return; }
    const rm = await SB.storage.from(BUCKET_DOCS_OBRA).remove([doc.caminho]);
    if (rm.error) console.warn("apagarDocumentoObra: ficheiro ficou no bucket:", doc.caminho, rm.error.message);
    await carregarPainelDocumentos();
    msgDocObra("Documento apagado.");
}

function blobParaBase64(blob) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload  = () => resolve(String(fr.result).split(",")[1]);
        fr.onerror = () => reject(new Error("Não foi possível abrir o ficheiro."));
        fr.readAsDataURL(blob);
    });
}

// Lê o documento com o assistente e abre a proposta para confirmar.
let _lendoDocObra = false;

async function tratarDocumentoObra(id, ficheiro = null) {
    if (_lendoDocObra || _propostaDoc) return;   // um documento de cada vez
    const { data: doc } = await SB.from("obra_documentos").select("*").eq("id", id).single();
    if (!doc) return;

    _lendoDocObra = true;
    try {
        let blob = ficheiro;
        if (!blob) {
            const dl = await SB.storage.from(BUCKET_DOCS_OBRA).download(doc.caminho);
            if (dl.error) throw new Error(dl.error.message);
            blob = dl.data;
        }
        if (blob.size > MAX_LER_DOC) throw new Error("o assistente só lê ficheiros até 8 MB.");

        msgDocObra("🤖 O assistente está a ler o documento… demora alguns segundos.", "warn");
        const base64 = await blobParaBase64(blob);
        const { data: { session } } = await SB.auth.getSession();
        if (!session) throw new Error("Sessão expirada. Volta a entrar.");

        const r = await fetch(`${SUPABASE_URL}/functions/v1/ler-documento-obra`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
            body: JSON.stringify({
                ficheiro_base64: base64,
                tipo: doc.mime || blob.type || "application/pdf",
                tipo_esperado: doc.tipo,
                obra_id: doc.obra_id,
            }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
        msgDocObra("");
        await abrirPropostaDocumento(doc, j.documento);
    } catch (e) {
        console.error("tratarDocumentoObra:", e);
        msgDocObra("Não foi possível ler: " + e.message + ' O documento ficou guardado; podes tentar outra vez em "Ler e registar".', "err");
    } finally {
        _lendoDocObra = false;
    }
}

// ── Proposta: o que o assistente leu, para confirmar e gravar ─
let _propostaDoc = null;

function fecharPropostaDocumento() {
    document.getElementById("modalPropostaDoc")?.remove();
    _propostaDoc = null;
}

async function abrirPropostaDocumento(doc, lido) {
    fecharPropostaDocumento();
    const tipo = ["orcamento", "fatura", "recibo"].includes(lido.tipo) ? lido.tipo : doc.tipo;
    const cli  = lido.cliente_conhecido || lido.cliente_da_obra || {};
    const c    = { ...cli, ...Object.fromEntries(Object.entries(lido.cliente || {}).filter(([, v]) => v)) };
    _propostaDoc = { doc, lido };

    const { data: cats } = await SB.from("categorias_financeiras").select("id, nome").eq("tipo", "entrada").order("nome");
    const catDefeito = (cats || []).find(x => /servi/i.test(x.nome))?.id;
    const ehFR = lido.tipo_documento === "FR";

    const campo = (rot, id, valor, tipoInput = "text", extra = "") => `
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;opacity:.9">${rot}
            <input id="${id}" type="${tipoInput}" value="${escDoc(valor ?? "")}" ${tipoInput === "number" ? 'step="0.01"' : ""} ${extra}>
        </label>`;

    const blocoOrc = `
        <div data-tipo="orcamento" class="prop-bloco" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
            ${campo("Validade", "propValidade", lido.validade, "date")}
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px">Estado
                <select id="propEstadoOrc"><option value="enviado">Enviado</option><option value="aceite">Aceite</option></select>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;grid-column:1/-1">
                <input type="checkbox" style="width:auto;margin:0" id="propRevisao" ${lido.e_revisao_ou_extra ? "checked" : ""}> É uma revisão ou um extra
            </label>
        </div>`;
    const blocoFat = `
        <div data-tipo="fatura" class="prop-bloco" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px">Categoria
                <select id="propCategoria">${(cats || []).map(x => `<option value="${x.id}" ${x.id === catDefeito ? "selected" : ""}>${escDoc(x.nome)}</option>`).join("")}</select>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px">Pagamento
                <select id="propPagamento">
                    <option value="por_pagar" ${ehFR ? "" : "selected"}>Por pagar</option>
                    <option value="pago" ${ehFR ? "selected" : ""}>Pago${ehFR ? " (fatura-recibo)" : ""}</option>
                </select>
            </label>
        </div>`;
    const encontradas = lido.faturas_encontradas || [];
    const blocoRec = `
        <div data-tipo="recibo" class="prop-bloco">
            <div style="font-size:12px;margin-bottom:6px">Valor recebido: <b>${fmtEurDoc(lido.valor_recebido)}</b>. Marcar como pagas:</div>
            ${encontradas.length ? encontradas.map(f => `
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;padding:4px 0">
                    <input type="checkbox" style="width:auto;margin:0" class="propFaturaPaga" value="${f.id}" ${f.estado_pagamento === "pago" ? "" : "checked"}>
                    Fatura ${escDoc(f.referencia)} de ${escDoc(f.data_documento)}, ${fmtEurDoc(f.valor_total)}${f.estado_pagamento === "pago" ? " (já paga)" : ""}
                </label>`).join("")
                : `<div style="font-size:12px;opacity:.6">Nenhuma das faturas deste recibo está na app. O recibo fica guardado na obra sem marcar nada.</div>`}
        </div>`;

    const avisos = (lido.avisos || []).map(a => `<li>${escDoc(a)}</li>`).join("");
    const ligarObra = !_painelObraActual?.cliente_id
        ? `<div style="font-size:12px;opacity:.7;margin-top:6px">Ao gravar, esta obra fica ligada a este cliente.</div>` : "";

    const m = document.createElement("div");
    m.id = "modalPropostaDoc";
    m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px";
    m.innerHTML = `
    <div style="background:#25363f;border-radius:14px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;padding:22px;border:1px solid rgba(255,255,255,.08)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="font-family:var(--font-title,sans-serif);font-size:18px">🤖 O que o assistente leu</div>
            <button onclick="fecharPropostaDocumento()" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer">×</button>
        </div>
        <div style="font-size:12px;opacity:.55;margin-bottom:14px">${escDoc(doc.nome_ficheiro)} · confirma ou corrige antes de gravar.</div>
        ${avisos ? `<ul style="background:rgba(251,146,60,.12);border:1px solid rgba(251,146,60,.3);color:#fb923c;border-radius:8px;padding:10px 10px 10px 28px;font-size:12px;margin:0 0 14px">${avisos}</ul>` : ""}

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:14px">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px">Tipo
                <select id="propTipo" onchange="mostrarBlocoProposta()">
                    <option value="orcamento" ${tipo === "orcamento" ? "selected" : ""}>🧾 Orçamento</option>
                    <option value="fatura" ${tipo === "fatura" ? "selected" : ""}>💶 Fatura de venda</option>
                    <option value="recibo" ${tipo === "recibo" ? "selected" : ""}>✅ Recibo</option>
                </select>
            </label>
            ${campo("Número", "propNumero", lido.numero_documento)}
            ${campo("Data", "propData", lido.data, "date")}
            ${campo("Descrição", "propDescricao", lido.descricao)}
        </div>

        <div class="prop-totais" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
            ${campo("Total sem IVA (€)", "propSemIva", lido.total_sem_iva, "number")}
            ${campo("IVA (€)", "propIva", lido.total_iva, "number")}
            ${campo("Total com IVA (€)", "propComIva", lido.total_com_iva, "number")}
        </div>

        <div style="margin-bottom:14px">${blocoOrc}${blocoFat}${blocoRec}</div>

        <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:12px">
            <div style="font-size:12px;font-weight:600;margin-bottom:8px">👤 Cliente${lido.cliente_conhecido ? ' <span style="opacity:.5;font-weight:400">(já existe na app)</span>' : ""}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
                ${campo("Nome", "propCliNome", c.nome)}
                ${campo("NIF", "propCliNif", c.nif)}
                ${campo("Email", "propCliEmail", c.email, "email")}
                ${campo("Telefone", "propCliTel", c.telefone)}
                ${campo("Morada", "propCliMorada", c.morada)}
            </div>
            ${ligarObra}
        </div>

        <div id="propMsg" style="display:none;color:#e09486;font-size:12px;margin-top:10px"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
            <button class="btn-secondary" onclick="fecharPropostaDocumento()">Agora não</button>
            <button class="btn-primary" id="btnGravarProposta" onclick="gravarPropostaDocumento()">✓ Gravar</button>
        </div>
    </div>`;
    document.body.appendChild(m);
    mostrarBlocoProposta();
}

function mostrarBlocoProposta() {
    const tipo = document.getElementById("propTipo").value;
    document.querySelectorAll("#modalPropostaDoc .prop-bloco").forEach(b => b.style.display = b.dataset.tipo === tipo ? "" : "none");
    document.querySelector("#modalPropostaDoc .prop-totais").style.display = tipo === "recibo" ? "none" : "grid";
}

// Encontra ou cria o cliente e devolve o id. Atualiza os contactos com o que
// foi confirmado, sem apagar o que já lá estava.
async function guardarClienteDaProposta(v) {
    if (!v.nome) return null;
    const nif = (v.nif || "").replace(/\D/g, "") || null;
    const campos = { nome: v.nome, nif, email: v.email || null, telefone: v.telefone || null, morada: v.morada || null };
    let existente = null, mesmoNif = false;
    if (nif) {
        existente = (await SB.from("clientes").select("*").eq("nif", nif).maybeSingle()).data;
        mesmoNif = !!existente;
    }
    // Sem cliente com este NIF: só se usa o cliente da obra se não houver
    // nada que mostre que é outra pessoa (NIF diferente ou nome diferente).
    if (!existente && _painelObraActual?.cliente_id) {
        const daObra = (await SB.from("clientes").select("*").eq("id", _painelObraActual.cliente_id).maybeSingle()).data;
        const mesmoNome = daObra && daObra.nome.trim().toLowerCase() === v.nome.trim().toLowerCase();
        if (daObra && !(daObra.nif && nif) && (mesmoNome || !nif)) existente = daObra;
    }
    if (existente) {
        // Com o mesmo NIF é a mesma pessoa: atualizam-se os contactos. Pelo
        // cliente da obra só se preenche o que estava vazio, para nunca
        // escrever por cima dos dados de outro cliente.
        const mudar = Object.fromEntries(Object.entries(campos).filter(([k, x]) =>
            x && x !== existente[k] && (mesmoNif ? k !== "nif" : !existente[k])));
        if (Object.keys(mudar).length) {
            const { error } = await SB.from("clientes").update(mudar).eq("id", existente.id);
            if (error) throw new Error("cliente: " + error.message);
        }
        return existente.id;
    }
    const { data, error } = await SB.from("clientes").insert(campos).select("id").single();
    if (error) throw new Error("cliente: " + error.message);
    return data.id;
}

async function gravarPropostaDocumento() {
    if (!_propostaDoc) return;
    const { doc, lido } = _propostaDoc;
    const obra = _painelObraActual;
    const val  = id => document.getElementById(id)?.value.trim() || "";
    const num  = id => {
        let x = val(id).replace(/\s/g, "");
        if (x === "") return null;
        if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");   // "1.230,50"
        return Number(x);
    };
    const erroEl = document.getElementById("propMsg");
    const falha = t => { erroEl.style.display = "block"; erroEl.textContent = t; };

    const tipo   = val("propTipo");
    const numero = val("propNumero");
    const data   = val("propData") || null;
    const semIva = num("propSemIva"), iva = num("propIva"), comIva = num("propComIva");
    const cli = { nome: val("propCliNome"), nif: val("propCliNif"), email: val("propCliEmail"), telefone: val("propCliTel"), morada: val("propCliMorada") };

    if ([semIva, iva, comIva].some(x => x != null && !Number.isFinite(x))) return falha("Há um valor que não é um número.");
    if (tipo !== "recibo") {
        if (!numero) return falha("Falta o número do documento.");
        if (comIva == null) return falha("Falta o total com IVA.");
        if (!cli.nome) return falha("Falta o nome do cliente.");
    }

    const btn = document.getElementById("btnGravarProposta");
    btn.disabled = true; btn.textContent = "⏳ A gravar…";

    try {
        const clienteId = await guardarClienteDaProposta(cli);
        if (clienteId && !obra.cliente_id) {
            const { error } = await SB.from("obras").update({ cliente_id: clienteId }).eq("id", obra.id);
            if (error) throw new Error("obra: " + error.message);
            obra.cliente_id = clienteId;
        }

        const ligacao = { orcamento_id: null, movimento_id: null };

        if (tipo === "orcamento") {
            const taxa = semIva && iva != null ? Math.round(iva / semIva * 100) : 23;
            const notas = "Importado do PDF do TOCONLINE" + (document.getElementById("propRevisao").checked ? " · revisão ou extra" : "");
            const { data: o, error } = await SB.from("orcamentos").insert({
                numero, data: data || undefined, validade: val("propValidade") || null,
                estado: val("propEstadoOrc"),
                cliente_nome: cli.nome, cliente_nif: cli.nif || null, cliente_morada: cli.morada || null,
                cliente_email: cli.email || null, cliente_tel: cli.telefone || null, cliente_id: clienteId,
                obra_id: obra.id, obra_descricao: val("propDescricao") || null, notas,
                taxa_iva: taxa, total_sem_iva: semIva ?? 0, total_iva: iva ?? 0, total_com_iva: comIva,
            }).select("id").single();
            if (error) throw new Error(error.code === "23505" ? `já existe um orçamento com o número ${numero}.` : error.message);
            ligacao.orcamento_id = o.id;
        }

        if (tipo === "fatura") {
            if (!data) throw new Error("falta a data da fatura.");
            // Se uma tentativa anterior já lançou o movimento e falhou depois,
            // reaproveita-se em vez de o lançar duas vezes.
            const { data: ja } = await SB.from("movimentos_financeiros").select("id")
                .eq("fonte", "documento_obra").eq("fonte_id", doc.id).eq("ativo", true).limit(1);
            const { data: mv, error } = ja?.[0] ? { data: ja[0], error: null } : await SB.from("movimentos_financeiros").insert({
                referencia: numero, data_documento: data, tipo: "entrada",
                cliente_nome: cli.nome, cliente_id: clienteId,
                categoria_id: val("propCategoria") || null, obra_id: obra.id,
                valor_base: semIva ?? comIva, iva: iva ?? 0, valor_total: comIva,
                estado_pagamento: val("propPagamento"),
                observacoes: "Fatura de venda carregada na obra (TOCONLINE)" + (val("propDescricao") ? " · " + val("propDescricao") : ""),
                ativo: true, fonte: "documento_obra", fonte_id: doc.id,
            }).select("id").single();
            if (error) throw new Error(error.message);
            ligacao.movimento_id = mv.id;
        }

        if (tipo === "recibo") {
            const ids = [...document.querySelectorAll("#modalPropostaDoc .propFaturaPaga:checked")].map(x => x.value);
            if (ids.length) {
                const { error } = await SB.from("movimentos_financeiros").update({ estado_pagamento: "pago" }).in("id", ids);
                if (error) throw new Error(error.message);
                ligacao.movimento_id = ids[0];
            }
        }

        const { error: errDoc } = await SB.from("obra_documentos").update({
            tipo, estado: "registado",
            numero_documento: numero || null, data_documento: data,
            dados_lidos: { ...lido, confirmado: { tipo, numero, data, total_sem_iva: semIva, total_iva: iva, total_com_iva: comIva, cliente: cli } },
            ...ligacao,
        }).eq("id", doc.id);
        if (errDoc) throw new Error(errDoc.message);

        fecharPropostaDocumento();
        await carregarPainelDocumentos();
        msgDocObra({
            orcamento: `Orçamento ${numero} registado na obra.`,
            fatura:    `Fatura ${numero} lançada no Financeiro.`,
            recibo:    "Recibo registado" + (ligacao.movimento_id ? " e fatura marcada como paga." : "."),
        }[tipo]);
    } catch (e) {
        console.error("gravarPropostaDocumento:", e);
        falha("Não foi possível gravar: " + e.message);
        btn.disabled = false; btn.textContent = "✓ Gravar";
    }
}

// ── Ficha de cliente da obra ─────────────────────────────────
async function abrirFichaClienteObra() {
    const obra = _painelObraActual;
    const { data: todos } = await SB.from("clientes").select("*").order("nome");
    const atual = (todos || []).find(x => x.id === obra.cliente_id) || {};

    document.getElementById("modalFichaCliente")?.remove();
    const m = document.createElement("div");
    m.id = "modalFichaCliente";
    m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px";
    const campo = (rot, id, v, t = "text") => `
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px">${rot}<input id="${id}" type="${t}" value="${escDoc(v ?? "")}"></label>`;
    m.innerHTML = `
    <div style="background:#25363f;border-radius:14px;width:100%;max-width:520px;padding:22px;border:1px solid rgba(255,255,255,.08)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div style="font-family:var(--font-title,sans-serif);font-size:18px">👤 Cliente da obra</div>
            <button onclick="document.getElementById('modalFichaCliente').remove()" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer">×</button>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;margin-bottom:12px">Escolher cliente
            <select id="fcEscolha" onchange="preencherFichaCliente(this.value)">
                <option value="">+ Cliente novo</option>
                ${(todos || []).map(x => `<option value="${x.id}" ${x.id === obra.cliente_id ? "selected" : ""}>${escDoc(x.nome)}${x.nif ? " · " + escDoc(x.nif) : ""}</option>`).join("")}
            </select>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            ${campo("Nome", "fcNome", atual.nome)}
            ${campo("NIF", "fcNif", atual.nif)}
            ${campo("Email", "fcEmail", atual.email, "email")}
            ${campo("Telefone", "fcTel", atual.telefone)}
        </div>
        <div style="margin-top:10px">${campo("Morada", "fcMorada", atual.morada)}</div>
        <div id="fcAcesso" style="margin-top:16px;border-top:1px solid rgba(255,255,255,.08);padding-top:14px"></div>
        <div id="fcMsg" style="display:none;color:#e09486;font-size:12px;margin-top:10px"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
            <button class="btn-secondary" onclick="document.getElementById('modalFichaCliente').remove()">Cancelar</button>
            <button class="btn-primary" onclick="gravarFichaClienteObra()">Gravar</button>
        </div>
    </div>`;
    m._clientes = todos || [];
    document.body.appendChild(m);
    mostrarAcessoCliente(atual.id ? atual : null);
}

function preencherFichaCliente(id) {
    const c = (document.getElementById("modalFichaCliente")._clientes || []).find(x => x.id === id) || {};
    [["fcNome", "nome"], ["fcNif", "nif"], ["fcEmail", "email"], ["fcTel", "telefone"], ["fcMorada", "morada"]]
        .forEach(([el, k]) => document.getElementById(el).value = c[k] || "");
    mostrarAcessoCliente(c.id ? c : null);
}

// ── Área do cliente: link fixo por cliente ──────────────────
// cliente.html?t=<código>. O código são 24 bytes aleatórios em base64url (32
// caracteres): impossível de adivinhar. Desligar corta o acesso logo; gerar
// novo link invalida o anterior (para quando um link foi reencaminhado).
function novoCodigoAcesso() {
    const b = crypto.getRandomValues(new Uint8Array(24));
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function linkAreaCliente(token) {
    return new URL("cliente.html?t=" + encodeURIComponent(token), location.href).href;
}

function telefoneWhatsApp(tel) {
    const d = String(tel || "").replace(/\D/g, "").replace(/^00/, "");
    if (!d) return "";
    return d.length === 9 ? "351" + d : d;   // número português sem indicativo
}

function mostrarAcessoCliente(c) {
    const el = document.getElementById("fcAcesso");
    if (!el) return;
    const titulo = `<div style="font-size:12px;font-weight:600;margin-bottom:8px">🔗 Área do cliente</div>`;
    if (!c) {
        el.innerHTML = titulo + `<div style="font-size:12px;opacity:.6">Grava primeiro o cliente para criar o link de acesso.</div>`;
        return;
    }
    if (!c.acesso_ativo || !c.token_acesso) {
        el.innerHTML = titulo + `
            <div style="font-size:12px;opacity:.6;margin-bottom:8px">${c.token_acesso ? "O acesso está desligado." : "Este cliente ainda não tem link."}
                O cliente vê as obras dele e os documentos marcados "Visível ao cliente".</div>
            <button class="btn-primary" onclick="ativarAcessoCliente('${c.id}', ${c.token_acesso ? "false" : "true"})">${c.token_acesso ? "Voltar a ligar o mesmo link" : "Criar link de acesso"}</button>
            ${c.token_acesso ? `<button class="btn-secondary" onclick="ativarAcessoCliente('${c.id}', true)">Criar link novo</button>` : ""}`;
        return;
    }
    const link = linkAreaCliente(c.token_acesso);
    const tel  = telefoneWhatsApp(c.telefone);
    const ultimo = c.ultimo_acesso ? "Última visita: " + new Date(c.ultimo_acesso).toLocaleString("pt-PT") : "Ainda não abriu o link.";
    el.innerHTML = titulo + `
        <input id="fcLink" readonly value="${escDoc(link)}" onclick="this.select()" style="width:100%;font-size:12px;margin-bottom:8px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${tel
                ? `<a class="btn-primary" href="${escDoc(linkWhatsApp(c))}" ${eTelemovel() ? "" : 'target="_blank" rel="noopener"'} style="text-decoration:none">📲 Enviar por WhatsApp</a>`
                : `<button class="btn-primary" disabled title="Falta o telefone do cliente">📲 Enviar por WhatsApp</button>`}
            <button class="btn-secondary" onclick="navigator.clipboard.writeText(document.getElementById('fcLink').value).then(() => this.textContent = '✓ Copiado')">Copiar</button>
            <a class="btn-secondary" href="${escDoc(link)}" target="_blank" rel="noopener" style="text-decoration:none">Ver como o cliente</a>
            <button class="btn-secondary" onclick="desligarAcessoCliente('${c.id}')">Desligar</button>
            <button class="btn-secondary" onclick="ativarAcessoCliente('${c.id}', true)">Criar link novo</button>
        </div>
        <div style="font-size:11px;opacity:.5;margin-top:8px">${escDoc(ultimo)}${tel ? "" : " · Para enviar por WhatsApp, preenche o telefone e grava."}</div>`;
}

async function recarregarAcessoCliente(id) {
    const { data } = await SB.from("clientes").select("*").eq("id", id).maybeSingle();
    const m = document.getElementById("modalFichaCliente");
    if (m && data) m._clientes = (m._clientes || []).map(x => x.id === id ? data : x);
    mostrarAcessoCliente(data);
}

function erroFichaCliente(t) {
    const msg = document.getElementById("fcMsg");
    if (msg) { msg.style.display = "block"; msg.textContent = t; }
}

async function ativarAcessoCliente(id, novo) {
    if (novo) {
        // Só se pergunta quando já havia um link, que deixa de funcionar.
        const { data } = await SB.from("clientes").select("token_acesso").eq("id", id).single();
        if (data?.token_acesso && !confirm("Criar um link novo? O link anterior deixa de funcionar.")) return;
    }
    const mudar = { acesso_ativo: true };
    if (novo) { mudar.token_acesso = novoCodigoAcesso(); mudar.acesso_criado_em = new Date().toISOString(); }
    const { error } = await SB.from("clientes").update(mudar).eq("id", id);
    if (error) { erroFichaCliente("Não foi possível criar o link: " + error.message); return; }
    await recarregarAcessoCliente(id);
}

async function desligarAcessoCliente(id) {
    if (!confirm("Desligar o acesso? O cliente deixa de conseguir abrir a Área do cliente até voltares a ligar.")) return;
    const { error } = await SB.from("clientes").update({ acesso_ativo: false }).eq("id", id);
    if (error) { erroFichaCliente("Não foi possível desligar: " + error.message); return; }
    await recarregarAcessoCliente(id);
}

const eTelemovel = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Link para o WhatsApp com a mensagem pronta. É um link normal (<a href>) e
// não um window.open depois de ir à base de dados: o browser do telemóvel
// bloqueia janelas abertas fora do toque do utilizador. No telemóvel usa-se
// whatsapp://, que abre logo a app; o wa.me ficava na página do WhatsApp com
// um botão "Abrir app". No computador fica o wa.me (WhatsApp Web).
function linkWhatsApp(c) {
    const primeiro = (c.nome || "").trim().split(/\s+/)[0];
    const texto = `Olá ${primeiro}, a Maia Solutions criou a sua Área do cliente. ` +
        `Pode acompanhar a sua obra e consultar orçamentos, faturas, recibos e fotografias neste link:\n` +
        `${linkAreaCliente(c.token_acesso)}\n\nGuarde esta mensagem: o link é pessoal, por favor não o partilhe.`;
    const tel = telefoneWhatsApp(c.telefone), msg = encodeURIComponent(texto);
    return eTelemovel()
        ? `whatsapp://send?phone=${tel}&text=${msg}`
        : `https://wa.me/${tel}?text=${msg}`;
}

async function gravarFichaClienteObra() {
    const obra = _painelObraActual;
    const v = id => document.getElementById(id).value.trim();
    const msg = document.getElementById("fcMsg");
    const campos = {
        nome: v("fcNome"), nif: v("fcNif").replace(/\D/g, "") || null,
        email: v("fcEmail") || null, telefone: v("fcTel") || null, morada: v("fcMorada") || null,
    };
    if (!campos.nome) { msg.style.display = "block"; msg.textContent = "Falta o nome."; return; }

    let id = v("fcEscolha");
    const r = id
        ? await SB.from("clientes").update(campos).eq("id", id).select("id").single()
        : await SB.from("clientes").insert(campos).select("id").single();
    if (r.error) {
        msg.style.display = "block";
        msg.textContent = r.error.code === "23505" ? "Já existe um cliente com este NIF: escolhe-o na lista." : r.error.message;
        return;
    }
    id = r.data.id;
    if (obra.cliente_id !== id) {
        const { error } = await SB.from("obras").update({ cliente_id: id }).eq("id", obra.id);
        if (error) { msg.style.display = "block"; msg.textContent = error.message; return; }
        obra.cliente_id = id;
    }
    document.getElementById("modalFichaCliente").remove();
    await carregarPainelDocumentos();
}

async function carregarPainelResumo() {
    const obraId = _painelObraActual.id;
    const el = document.getElementById("painelTab-resumo");
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;

    const [movsRes, orcRes, pontoRes, regRes] = await Promise.all([
        SB.from("movimentos_financeiros").select("tipo, valor_total, categorias_financeiras(nome)").eq("obra_id", obraId).eq("ativo", true),
        SB.from("orcamentos").select("numero, estado, total_com_iva, total_sem_iva, subtotal_mao_obra, subtotal_materiais").eq("obra_id", obraId),
        SB.from("vw_registos_ponto").select("funcionario, horas, dia").eq("obra", _painelObraActual.nome),
        // registos_admin é a fonte de verdade das horas pagas (é daí que
        // saem os salários), por isso é daí que sai o custo de mão de obra.
        SB.from("registos_admin").select("horas, funcionarios(valor_dia)").eq("obra_id", obraId).eq("tipo", "presenca")
    ]);

    const movs  = movsRes.data  || [];
    const orcs  = orcRes.data   || [];
    const ponto = pontoRes.data || [];
    const regs  = regRes.data   || [];

    const totalEntradas = movs.filter(m => m.tipo === "entrada").reduce((s,m) => s + Number(m.valor_total), 0);
    const totalFaturas  = movs.filter(m => m.tipo === "saida").reduce((s,m) => s + Number(m.valor_total), 0);
    const horasRegistos = regs.reduce((s,r) => s + Number(r.horas || 0), 0);
    const custoMaoObra  = regs.reduce((s,r) => s + Number(r.horas || 0) * Number(r.funcionarios?.valor_dia || 0) / 8, 0);
    const totalSaidas   = totalFaturas + custoMaoObra;
    const margem        = totalEntradas - totalSaidas;
    const margemPct     = totalEntradas > 0 ? ((margem / totalEntradas) * 100).toFixed(1) : null;
    const orcAceite     = orcs.filter(o => o.estado === "aceite");
    const totalOrc      = orcAceite.reduce((s,o) => s + Number(o.total_com_iva||0), 0);
    const desvio        = totalOrc > 0 ? totalOrc - totalSaidas : null;
    let horasPonto = 0;
    ponto.forEach(r => {
        if (r.horas && r.horas.includes(":")) { const [h,m] = r.horas.split(":").map(Number); horasPonto += h + m/60; }
    });
    const totalHoras = horasRegistos || horasPonto;

    const fmt = v => Number(v).toFixed(2) + " €";
    const corMargem = margem >= 0 ? "#8fbfa0" : "#e09486";

    el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
            <div class="card" style="padding:16px;text-align:center">
                <div style="font-size:11px;opacity:.5;margin-bottom:6px;font-family:var(--font-title);letter-spacing:.5px">RECEBIDO</div>
                <div style="font-size:20px;font-weight:800;color:#8fbfa0">${fmt(totalEntradas)}</div>
            </div>
            <div class="card" style="padding:16px;text-align:center">
                <div style="font-size:11px;opacity:.5;margin-bottom:6px;font-family:var(--font-title);letter-spacing:.5px">GASTO</div>
                <div style="font-size:20px;font-weight:800;color:#e09486">${fmt(totalSaidas)}</div>
                <div style="font-size:11px;opacity:.55;margin-top:4px">${fmt(totalFaturas)} faturas · ${fmt(custoMaoObra)} mão de obra</div>
            </div>
            <div class="card" style="padding:16px;text-align:center">
                <div style="font-size:11px;opacity:.5;margin-bottom:6px;font-family:var(--font-title);letter-spacing:.5px">MARGEM BRUTA</div>
                <div style="font-size:20px;font-weight:800;color:${corMargem}">${fmt(margem)}</div>
                ${margemPct ? `<div style="font-size:12px;color:${corMargem};opacity:.8">${margemPct}%</div>` : ""}
            </div>
            <div class="card" style="padding:16px;text-align:center">
                <div style="font-size:11px;opacity:.5;margin-bottom:6px;font-family:var(--font-title);letter-spacing:.5px">HORAS OBRA</div>
                <div style="font-size:20px;font-weight:800;color:var(--primary)">${totalHoras.toFixed(1)}h</div>
                <div style="font-size:11px;opacity:.55;margin-top:4px">${horasRegistos ? `registos · ${horasPonto.toFixed(1)}h no ponto` : "do ponto"}</div>
            </div>
        </div>
        ${totalOrc > 0 ? `
        <div class="card" style="padding:16px;margin-bottom:12px">
            <div style="font-size:11px;opacity:.5;margin-bottom:12px;font-family:var(--font-title);letter-spacing:.5px">ORÇAMENTO VS REAL</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px"><span style="opacity:.7">Orçamento aceite</span><span style="font-weight:700">${fmt(totalOrc)}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px"><span style="opacity:.7">Faturas</span><span style="font-weight:700">${fmt(totalFaturas)}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px"><span style="opacity:.7">Mão de obra (${horasRegistos.toFixed(0)}h)</span><span style="font-weight:700">${fmt(custoMaoObra)}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px"><span style="opacity:.7">Gasto real</span><span style="font-weight:700;color:#e09486">${fmt(totalSaidas)}</span></div>
            <div style="border-top:1px solid var(--border);margin:8px 0;padding-top:8px;display:flex;justify-content:space-between;font-size:14px">
                <span style="font-weight:600">Desvio</span>
                <span style="font-weight:800;color:${desvio >= 0 ? "#8fbfa0" : "#e09486"}">${desvio >= 0 ? "+" : ""}${fmt(desvio)}</span>
            </div>
            <div style="background:rgba(255,255,255,.08);border-radius:4px;height:8px;margin-top:10px;overflow:hidden">
                <div style="height:100%;border-radius:4px;background:${totalSaidas <= totalOrc ? "#8fbfa0" : "#e09486"};width:${Math.min((totalSaidas/totalOrc)*100,100).toFixed(0)}%"></div>
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
            <div style="padding:10px 14px;background:rgba(181,136,99,.08);display:flex;justify-content:space-between;align-items:center">
                <span style="font-family:var(--font-title);font-size:11px;letter-spacing:.5px;text-transform:uppercase">${cat}</span>
                <span style="font-size:13px;font-weight:700;color:${d.saidas > 0 ? "#e09486" : "#8fbfa0"}">
                    ${d.entradas > 0 ? "+" + d.entradas.toFixed(2) + " € " : ""}${d.saidas > 0 ? "−" + d.saidas.toFixed(2) + " €" : ""}
                </span>
            </div>
            ${d.items.map(m => `<div style="padding:8px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:12px">
                <div><div style="opacity:.6">${escHtml(m.data_documento)}</div><div style="font-weight:500">${escHtml(m.fornecedores?.nome || m.observacoes || m.referencia || "—")}</div></div>
                <div style="font-weight:700;color:${m.tipo === "entrada" ? "#8fbfa0" : "#e09486"}">${m.tipo === "entrada" ? "+" : "−"}${Number(m.valor_total).toFixed(2)} €</div>
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
            <div style="padding:10px 14px;background:rgba(181,136,99,.08);font-family:var(--font-title);font-size:11px;letter-spacing:.5px;text-transform:uppercase">Por Funcionário</div>
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
    const tipoCor = { entrada:"#8fbfa0", saida:"#e09486", ajuste_entrada:"#b58863", ajuste_saida:"#b58863" };
    const tipoLabel = { entrada:"Entrada", saida:"Saída", ajuste_entrada:"Ajuste +", ajuste_saida:"Ajuste −" };
    el.innerHTML = `<div class="card" style="overflow-x:auto;padding:0">
        <table class="display" style="margin:0">
            <thead><tr><th>Data</th><th>Artigo</th><th>Tipo</th><th style="text-align:right">Qtd</th><th>Funcionário</th><th>Obs</th></tr></thead>
            <tbody>${data.map(m => `<tr>
                <td style="font-size:12px;opacity:.7">${escHtml(m.data_movimento)}</td>
                <td><div style="font-weight:600;font-size:13px">${escHtml(m.artigos?.descricao||"—")}</div><div style="font-size:11px;opacity:.5;font-family:monospace">${escHtml(m.artigos?.codigo||"")}</div></td>
                <td><span style="color:${tipoCor[m.tipo_movimento]||"#888"};font-weight:700;font-size:12px">${escHtml(tipoLabel[m.tipo_movimento]||m.tipo_movimento)}</span></td>
                <td style="text-align:right;font-weight:700">${m.quantidade}</td>
                <td style="font-size:12px">${escHtml(m.funcionarios?.nome||"—")}</td>
                <td style="font-size:11px;opacity:.6">${escHtml(m.observacoes||"—")}</td>
            </tr>`).join("")}</tbody>
        </table>
    </div>`;
}

// FLUXO DE CAIXA — COMPLETO
// =======================================================
async function initFluxo() {
    preencherAnosFluxo();
    await Promise.all([carregarCategoriasFinanceiras(), carregarObrasFluxo()]);
    ligarFiltrosFluxo();
    // Vindo de uma obra da Visão geral: só essa obra, de todos os anos.
    if (_fluxoObraPedida) {
        const sel = document.getElementById("filtroObra");
        if (sel) sel.value = _fluxoObraPedida;
        const ano = document.getElementById("filtroAnoFluxo");
        if (ano) ano.value = "";
        _fluxoObraPedida = null;
    }
    // Vindo de um aviso da Visão geral (faturas por pagar, despesas sem obra):
    // limpa os outros filtros, mostra todos os anos e aplica só o pedido.
    if (_fluxoFiltroPedido) {
        ["filtroObra","filtroCategoria","filtroTipo","filtroEstadoPag","filtroDataInicio","filtroDataFim","filtroAnoFluxo"]
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        Object.entries(_fluxoFiltroPedido).forEach(([id, v]) => {
            const el = document.getElementById(id); if (el) el.value = v;
        });
        _fluxoFiltroPedido = null;
    }
    await carregarMovimentos();
}

let _fluxoFiltroPedido = null;
function abrirFluxoFiltrado(filtro) {
    _fluxoFiltroPedido = filtro;
    abrirTab("financeiro", "fluxo");
}

// O filtro de ano é lido pelo carregarMovimentos, mas ninguém o preenchia.
// Mostra o ano actual e os quatro anteriores, começando no ano actual.
function preencherAnosFluxo() {
    const sel = document.getElementById("filtroAnoFluxo");
    if (!sel || sel.options.length) return;
    const atual = new Date().getFullYear();
    sel.innerHTML = `<option value="">— Todos —</option>`;
    for (let a = atual; a >= atual - 4; a--) {
        sel.innerHTML += `<option value="${escHtml(a)}">${escHtml(a)}</option>`;
    }
    sel.value = String(atual);
}

async function carregarCategoriasFinanceiras() {
    const { data } = await SB.from("categorias_financeiras").select("*").order("nome");
    ["movCategoria", "filtroCategoria"].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const placeholder = id.startsWith("filtro") ? "— Todas —" : "— Selecionar —";
        sel.innerHTML = `<option value="">${placeholder}</option>`;
        data?.forEach(c => { sel.innerHTML += `<option value="${escHtml(c.id)}">${escHtml(c.nome)}</option>`; });
    });
}

// Valor do filtro de obra para as despesas que ainda não têm obra.
const SEM_OBRA = "sem_obra";

async function carregarObrasFluxo() {
    const { data } = await SB.from("obras").select("id, nome").order("nome");
    ["movObra", "filtroObra"].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        // No movimento a obra é obrigatória (a base recusa-o sem obra); para
        // despesas da empresa há a obra GERAL / EMPRESA.
        const placeholder = id.startsWith("filtro") ? "— Todas —" : "— Escolher obra —";
        sel.innerHTML = `<option value="">${placeholder}</option>`;
        if (id === "filtroObra") sel.innerHTML += `<option value="${SEM_OBRA}">— Sem obra —</option>`;
        data?.forEach(o => { sel.innerHTML += `<option value="${escHtml(o.id)}">${escHtml(o.nome)}</option>`; });
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
    if (sEl) { sEl.textContent = saldo.toFixed(2) + " €"; sEl.style.color = saldo >= 0 ? "#8fbfa0" : "#e09486"; }
}

async function carregarMovimentos() {
    const obra       = document.getElementById("filtroObra")?.value || "";
    const categoria  = document.getElementById("filtroCategoria")?.value || "";
    const tipo       = document.getElementById("filtroTipo")?.value || "";
    const estadoPag  = document.getElementById("filtroEstadoPag")?.value || "";
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

    if (obra === SEM_OBRA) query = query.is("obra_id", null);
    else if (obra) query = query.eq("obra_id", obra);
    if (categoria) query = query.eq("categoria_id", categoria);
    if (tipo)      query = query.eq("tipo", tipo);
    if (estadoPag) query = query.eq("estado_pagamento", estadoPag);
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

// O fluxo abre sempre que se entra na sub-tab: liga os filtros só uma vez.
let _filtrosFluxoLigados = false;
function ligarFiltrosFluxo() {
    if (_filtrosFluxoLigados) return;
    _filtrosFluxoLigados = true;
    ["filtroObra","filtroCategoria","filtroTipo","filtroEstadoPag","filtroDataInicio","filtroDataFim","filtroAnoFluxo"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", carregarMovimentos);
        document.getElementById(id)?.addEventListener("input",  carregarMovimentos);
    });
    document.getElementById("btnLimparFiltros")?.addEventListener("click", () => {
        ["filtroObra","filtroCategoria","filtroTipo","filtroEstadoPag","filtroDataInicio","filtroDataFim"]
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
            <td>${escHtml(m.data_documento || "")}</td>
            <td>${escHtml(m.referencia || "—")}</td>
            <td><span class="badge-tipo ${ent ? "entrada" : "saida"}">${ent ? "Entrada" : "Saída"}</span></td>
            <td>${escHtml(m.fornecedores?.nome || "—")}</td>
            <td>${escHtml(m.categorias_financeiras?.nome || "—")}</td>
            <td>${escHtml(m.obras?.nome || "—")}</td>
            <td style="text-align:right;font-weight:500;color:${ent ? "#8fbfa0" : "#e09486"}">${ent ? "+" : "–"}${Number(m.valor_total).toFixed(2)} €</td>
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
                style="background:rgba(181,136,99,.15);color:var(--primary,#b8860b);border:1px solid rgba(181,136,99,.3);
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


// movId opcional: em edição, repõe as imputações já gravadas. Sem isto,
// guardar um movimento editado apagava as imputações existentes, porque o
// guardarMovimento apaga as antigas e volta a inserir o que estiver no ecrã.
async function carregarServicosImputacao(obraId, movId = null) {
    let wrap = document.getElementById("imputacaoServicosWrap");
    if (!wrap) return;
    if (!obraId) { wrap.style.display = "none"; return; }

    const { data: servs } = await SB.from("obra_servicos")
        .select("id, nome, extra").eq("obra_id", obraId).order("ordem").order("created_at");

    if (!servs?.length) { wrap.style.display = "none"; return; }

    let guardadas = [];
    if (movId) {
        const { data } = await SB.from("movimento_servicos")
            .select("obra_servico_id, valor").eq("movimento_id", movId);
        guardadas = data || [];
    }

    wrap.style.display = "block";
    const linhasDiv = document.getElementById("imputacaoLinhas");
    if (linhasDiv) linhasDiv.innerHTML = `
        <div style="font-size:11px;letter-spacing:.5px;opacity:.5;text-transform:uppercase;margin-bottom:8px">
            Imputar material a serviço(s) desta obra
        </div>
        <div id="imputLinhasInner"></div>
        <button type="button" id="btnAddImput"
            style="background:rgba(181,136,99,.1);border:1px solid rgba(181,136,99,.2);color:var(--primary,#b58863);border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px;margin-top:6px">
            + Adicionar serviço
        </button>`;

    const btnAddImput = document.getElementById("btnAddImput");
    if (btnAddImput) btnAddImput.addEventListener("click", () => adicionarLinhaImput(servs));

    if (guardadas.length) {
        // Repor o que já estava imputado a este movimento
        guardadas.forEach(g => adicionarLinhaImput(servs, g.obra_servico_id, g.valor));
    } else {
        adicionarLinhaImput(servs);   // uma linha vazia por defeito
    }
}

function adicionarLinhaImput(servs, servicoId = null, valor = null) {
    const inner = document.getElementById("imputLinhasInner");
    if (!inner) return;
    const opts = servs.map(s => `<option value="${s.id}">${s.nome}${s.extra?" [Extra]":""}</option>`).join("");
    const div = document.createElement("div");
    div.className = "linha-imput-serv";
    div.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:6px";
    div.innerHTML = `
        <select class="imput-serv-sel" style="flex:1;padding:6px 8px;background:#fff;border:1px solid rgba(0,0,0,.15);border-radius:6px;color:var(--text-dark);font-size:13px">
            <option value="">— Serviço —</option>${opts}
        </select>
        <input class="imput-serv-val" type="number" step="0.01" min="0" placeholder="€"
            style="width:80px;padding:6px 8px;background:#fff;border:1px solid rgba(0,0,0,.15);border-radius:6px;color:var(--text-dark);font-size:13px">
        <button type="button" onclick="this.parentElement.remove()" style="background:rgba(224,148,134,.1);border:none;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:13px;flex-shrink:0">✕</button>`;
    inner.appendChild(div);

    if (servicoId) div.querySelector(".imput-serv-sel").value = servicoId;
    if (valor != null) div.querySelector(".imput-serv-val").value = valor;
}

function fecharModalMovimento() {
    const modal = document.getElementById("modalMovimento");
    if (modal) {
        modal.style.display = "none";
        modal.classList.add("hidden");
    }
    limparLinhasFatura();   // não deixar linhas de uma fatura anterior
    limparFilaFaturas();    // fechar à mão desiste do lote que estava a meio
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

    // As listas de Categoria e Obra só se enchiam ao abrir a sub-tab Fluxo.
    // Vindo do "Hoje" (Ler fatura) abre-se o Financeiro noutra sub-tab, e as
    // caixas ficavam vazias: não abriam e a gravação falhava sem obra.
    const semOpcoes = id => (document.getElementById(id)?.options.length || 0) < 2;
    if (semOpcoes("movCategoria") || semOpcoes("movObra")) {
        await Promise.all([carregarCategoriasFinanceiras(), carregarObrasFluxo()]);
    }

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
    const movNifInfo = document.getElementById("movNifInfo");
    if (movNifInfo) movNifInfo.textContent = "";
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

        // Linhas da fatura já gravadas, para poderem ser revistas
        const [{ data: linhasGravadas }, { data: stockDaFatura }] = await Promise.all([
            SB.from("fatura_linhas")
              .select("id, descricao_original, artigo_id, quantidade, unidade, preco_unitario, valor_total")
              .eq("movimento_id", mov.id).order("ordem"),
            SB.from("movimentos_stock").select("fatura_linha_id").eq("movimento_id", mov.id),
        ]);
        // Linhas que já deram entrada em inventário aparecem marcadas
        const comStock = new Set((stockDaFatura || []).map(s => s.fatura_linha_id).filter(Boolean));

        if (linhasGravadas?.length) {
            await mostrarLinhasFatura({
                linhas: linhasGravadas.map(l => ({
                    descricao: l.descricao_original,
                    artigo_id: l.artigo_id,
                    stock: comStock.has(l.id),
                    quantidade: l.quantidade,
                    unidade: l.unidade,
                    preco_unitario: l.preco_unitario,
                    valor_total: l.valor_total,
                })),
                avisos: [],
            });
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
                    refEl.style.background = "rgba(143,191,160,.1)";
                    refEl.style.borderColor = "rgba(143,191,160,.4)";
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
    if (!document.getElementById("movObra")?.value) {
        movMsg.textContent = "Escolha a obra. Para despesas da empresa use GERAL / EMPRESA.";
        document.getElementById("movObra")?.focus();
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
            // Um fornecedor novo era criado em silêncio ao gravar. Juntando isso
            // ao aviso de IBAN, que só disparava quando o NIF casava, bastava
            // uma fatura com um dígito trocado no NIF para passar sem nada:
            // nenhum aviso, e um fornecedor novo parecido com o verdadeiro.
            // Criar um fornecedor passa a ser uma decisão, não um efeito.
            if (!confirm(
                `Não conheço o NIF ${nif}.\n\n` +
                `Criar o fornecedor "${nome || "(sem nome)"}" com este NIF?\n\n` +
                `Se esperavas que já existisse, cancela e confirma o NIF e o ` +
                `IBAN da fatura — uma fatura falsa imita um fornecedor ` +
                `conhecido com um dígito trocado.`
            )) {
                movMsg.textContent = "Gravação cancelada. Confirme o fornecedor.";
                return;
            }
            const { data: novo, error: ef } = await SB.from("fornecedores")
                .insert({ nif, nome }).select("id").single();
            if (ef) {
                console.error(ef);
                movMsg.textContent = "Não foi possível criar o fornecedor.";
                return;
            }
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

    if (error) {
        console.error(error);
        // 23505: o índice movimentos_financeiros_ref_unica recusa a mesma
        // referência duas vezes para o mesmo fornecedor.
        movMsg.textContent = error.code === "23505"
            ? `Já existe um movimento com a referência ${payload.referencia} deste fornecedor. Não foi gravado outra vez.`
            : "Não foi possível gravar o movimento.";
        return;
    }

    // Linhas da fatura lidas pelo assistente
    const movIdLinhas = movSalvo?.id || movEditId;
    const linhasFatura = linhasFaturaDoEcra();
    if (movIdLinhas && linhasFatura.length) {
        // Em edição, substitui as linhas lidas antes (as manuais ficam).
        // Os preços saem primeiro: se saíssem depois das linhas, ficavam
        // órfãos, sem se saber de que fatura vieram.
        if (movEditId) {
            const { data: antigas } = await SB.from("fatura_linhas")
                .select("id").eq("movimento_id", movEditId).eq("origem", "ia");
            const ids = (antigas || []).map(l => l.id);
            if (ids.length) {
                await SB.from("precos").delete().in("fatura_linha_id", ids);
                await SB.from("fatura_linhas").delete().in("id", ids);
            }
            // As entradas em stock desta fatura também saem: senão, editar
            // a fatura duplicava o material no inventário.
            await SB.from("movimentos_stock").delete().eq("movimento_id", movEditId);
        }
        const { data: gravadas, error: errLinhas } = await SB.from("fatura_linhas").insert(
            linhasFatura.map(({ stock, ...l }) => ({ ...l, movimento_id: movIdLinhas, origem: "ia" }))
        ).select("id, artigo_id, descricao_original, preco_unitario, unidade, ordem");

        if (errLinhas) {
            console.error(errLinhas);
            alert("O movimento foi guardado, mas as linhas da fatura não: " + errLinhas.message);
        } else {
            await gravarSinonimosEPrecos(gravadas, fornecedor_id, dataDoc);
            await gravarEntradasStock(movIdLinhas, gravadas, linhasFatura, dataDoc, payload.referencia);
        }
    }

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

    // Lote em curso: guardar esta não fecha, abre a seguinte já preenchida
    const restantes = _filaFaturas.slice();
    const totalLote = _filaTotal;

    fecharModalMovimento();
    await carregarMovimentos();

    if (restantes.length) {
        _filaFaturas = restantes;
        _filaTotal   = totalLote;
        await abrirModalMovimento();
        await proximaFaturaDaFila();
    }
}

async function apagarMovimento(id, ref) {
    if (!confirm(`Apagar movimento "${ref || id}"?`)) return;
    const { error } = await SB.from("movimentos_financeiros").delete().eq("id", id);
    if (error) { { console.error(error); alert("Não foi possível concluir a operação."); }; return; }
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
    document.getElementById("btnGerarCodigo")?.addEventListener("click", gerarCodigoInscricao);
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
    document.getElementById("pesquisaObras")?.addEventListener("input", filtrarObras);
    document.getElementById("filtroEstadoObras")?.addEventListener("change", filtrarObras);
    document.getElementById("btnNovaObra")?.addEventListener("click", () => editarObra(null));
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

    // Ler fatura em PDF ou foto — mesmo destino do QR
    document.getElementById("btnLerFatura")?.addEventListener("click", () => {
        document.getElementById("ficheiroFatura")?.click();
    });
    document.getElementById("ficheiroFatura")?.addEventListener("change", function () {
        lerFicheirosFatura(this.files);
    });
    document.getElementById("btnLimparLinhasFatura")?.addEventListener("click", limparLinhasFatura);

    // Fluxo de caixa — ao escolher a obra, mostrar os serviços dela para
    // imputação. Num movimento novo não há mais nada que dispare isto.
    document.getElementById("movObra")?.addEventListener("change", function () {
        carregarServicosImputacao(this.value || null, movEditId);
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
            btn.style.background = "rgba(181,136,99,.15)";
            btn.style.color = "var(--primary)";
            btn.style.borderColor = "rgba(181,136,99,.4)";
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
    document.querySelectorAll(".orc-subtab").forEach(b => b.onclick = () => switchOrcSub(b.dataset.orcsub));
    await carregarOrcamentos();

    // Ligar eventos
    document.getElementById('pesquisaOrcamentos')?.addEventListener('input', filtrarTabelaOrc);
    document.querySelectorAll('#chipsEstadoOrc .chip-estado').forEach(b => b.onclick = () => {
        document.getElementById('filtroEstadoOrc').value = b.dataset.estado;
        document.querySelectorAll('#chipsEstadoOrc .chip-estado').forEach(c => c.classList.toggle('ativo', c === b));
        filtrarTabelaOrc();
    });
    document.getElementById('btnNovoOrcamento')?.addEventListener('click', () => abrirModalOrcamento());
}

// Botões rápidos ✓ / ✕ do cartão: marcam o orçamento como aceite ou
// não aceite (recusado). Carregar outra vez no mesmo botão volta a "enviado".
async function mudarEstadoOrcamento(o, novo) {
    const estado = o.estado === novo ? 'enviado' : novo;
    const { error } = await SB.from('orcamentos').update({ estado }).eq('id', o.id);
    if (error) { alert('Não foi possível mudar o estado: ' + error.message); return; }
    await carregarOrcamentos();
}

// Sub-separadores: orçamentos a clientes · comparar fornecedores (cotacoes.js)
function switchOrcSub(sub) {
    document.querySelectorAll(".orc-subtab").forEach(b => b.classList.toggle("active", b.dataset.orcsub === sub));
    document.querySelectorAll(".orc-sub").forEach(d => d.style.display = d.id === "orcSub-" + sub ? "" : "none");
    if (sub === "fornecedores") initCotacoes();
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
    document.getElementById('orcKpiValor').textContent    = Math.round(valor).toLocaleString('pt-PT') + ' €';

    // Respeita a pesquisa já escrita (a Visão geral escreve o nome da obra)
    filtrarTabelaOrc();
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
        enviado:  { bg:'rgba(181,136,99,.15)',  cor:'#c8901e', label:'Enviado'  },
        aceite:   { bg:'rgba(79,122,99,.12)',   cor:'#4f7a63', label:'Aceite'   },
        recusado: { bg:'rgba(229,92,92,.12)',   cor:'#a5483d', label:'Recusado' },
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
        tr.onmouseenter = () => tr.style.background = 'rgba(181,136,99,.04)';
        tr.onmouseleave = () => tr.style.background = '';
        tr.innerHTML =
            `<td style="font-family:monospace;font-size:12px;font-weight:600;white-space:nowrap;width:100px;padding:10px 12px">${o.numero || '—'}</td>` +
            `<td style="font-size:12px;opacity:.65;white-space:nowrap;width:90px;padding:10px 12px">${dataFmt(o.data)}</td>` +
            `<td class="largo" style="padding:10px 12px"><div>
                <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escHtml(o.cliente_nome || '—')}</div>
                ${nomeObra ? `<div style="font-size:11px;opacity:.45;margin-top:1px">🏗 ${escHtml(nomeObra)}</div>` : ''}
            </div></td>` +
            `<td style="text-align:right;font-weight:700;font-size:14px;white-space:nowrap;width:120px;padding:10px 12px">
                ${total > 0 ? total.toLocaleString('pt-PT', {minimumFractionDigits:2}) + ' €' : '—'}
            </td>` +
            `<td class="largo" style="width:170px;padding:10px 12px">
                <div class="orc-estado">
                    <span style="background:${est.bg};color:${est.cor};padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600">${est.label}</span>
                    <button class="btn-estado-rapido sim${o.estado === 'aceite' ? ' ativo' : ''}" title="${o.estado === 'aceite' ? 'Tirar aceite' : 'Marcar como aceite'}">✓</button>
                    <button class="btn-estado-rapido nao${o.estado === 'recusado' ? ' ativo' : ''}" title="${o.estado === 'recusado' ? 'Tirar não aceite' : 'Marcar como não aceite'}">✕</button>
                </div>
                ${vencido ? '<div style="font-size:10px;color:#a5483d;margin-top:3px">⚠ Vencido</div>' : ''}
            </td>` +
            `<td style="font-size:12px;white-space:nowrap;width:90px;padding:10px 12px;${vencido ? 'color:#a5483d' : 'opacity:.5'}">${dataFmt(o.validade)}</td>` +
            `<td class="acoes-td" style="white-space:nowrap;width:120px;padding:8px 12px">
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
        tr.querySelector('.btn-estado-rapido.sim').onclick = e => { e.stopPropagation(); mudarEstadoOrcamento(o, 'aceite'); };
        tr.querySelector('.btn-estado-rapido.nao').onclick = e => { e.stopPropagation(); mudarEstadoOrcamento(o, 'recusado'); };
        tr.ondblclick = () => abrirModalOrcamento(o.id);
        tbody.appendChild(tr);
    });
;
}
function filtrarTabelaOrc() {
    const q      = document.getElementById('pesquisaOrcamentos')?.value.toLowerCase() || '';
    const estado = document.getElementById('filtroEstadoOrc')?.value || '';
    const filtrado = _orcamentos.filter(o =>
        (!q || (o.numero||'').toLowerCase().includes(q) || (o.cliente_nome||'').toLowerCase().includes(q) || (o.obra_descricao||'').toLowerCase().includes(q) || (o.obras?.nome||'').toLowerCase().includes(q)) &&
        (!estado || o.estado === estado || (estado === 'pendentes' && ['rascunho','enviado'].includes(o.estado)))
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
        _orcObras.map(o => `<option value="${escHtml(o.id)}">${escHtml(o.nome)}</option>`).join('');

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
        document.getElementById('orcClienteNifInfo').textContent = '';
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
        document.getElementById('orcClienteNifInfo').textContent = '';

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
        '<div style="background:rgba(181,136,99,.12);padding:10px 14px;display:flex;align-items:center;gap:10px">' +
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
        mao_obra: 'rgba(79,122,99,.07)',
        material: 'rgba(74,144,226,.07)',
        outro:    'rgba(181,136,99,.07)'
    };
    const tipoBadge = {
        mao_obra: { label:'Mão Obra', cor:'#8fbfa0' },
        material: { label:'Material', cor:'#60a5fa' },
        outro:    { label:'Outro',    cor:'#b58863' }
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
            <input value="${escHtml(dados?.descricao||'')}" placeholder="Descrição do trabalho" data-field="descricao"
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
            <span style="font-size:10px;background:rgba(143,191,160,.15);color:#8fbfa0;padding:1px 7px;border-radius:6px;font-weight:600;letter-spacing:.3px">MO</span>
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
            <input value="${escHtml(dados?.descricao||'')}" placeholder="Descrição do artigo / trabalho" data-field="descricao"
                style="border:none;background:transparent;font-size:13px;padding:3px 6px;outline:none">
            <input value="${escHtml(dados?.unidade||'un')}" data-field="unidade"
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
        const nPes = l.dataset.tipo==='mao_obra'
            ? (parseFloat(l.querySelector('[data-field="n_pessoas"]')?.value)||1)
            : 1;
        const t = qtd*pu*nPes;
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
        if (error) { msg.textContent = (console.error(error), "Não foi possível concluir."); msg.style.color='var(--color-err)'; return; }
    } else {
        // Gerar número
        const { data: numData } = await SB.rpc('gerar_numero_orcamento');
        payload.numero = numData || ('ORC-' + Date.now());
        const { data: novo, error } = await SB.from('orcamentos').insert(payload).select('id').single();
        if (error) { msg.textContent = (console.error(error), "Não foi possível concluir."); msg.style.color='var(--color-err)'; return; }
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
// O HTML deste PDF leva dados da base de dados. São escritos por quem já é
// administrador, pelo que não há caminho de terceiro até aqui — mas o PDF
// abre numa janela da mesma origem, e um nome de cliente com marcação lá
// dentro corria no contexto do painel. Escapa-se por igual.
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

    // Recalcular subtotais a partir das linhas (inclui nº de pessoas na M.O.)
    let pdfMaoObra = 0, pdfMateriais = 0, pdfOutros = 0;

    // Gerar HTML do PDF
    let tabelaHTML = '';
    cats.forEach(cat => {
        if (!cat.linhas.length) return;
        tabelaHTML += `
            <tr class="cat-header">
                <td colspan="6">${escHtml(cat.nome.toUpperCase())}</td>
            </tr>`;
        cat.linhas.forEach(l => {
            const nPes  = l.tipo==='mao_obra' ? (Number(l.n_pessoas)||1) : 1;
            const total = Number(l.quantidade) * Number(l.preco_unitario) * nPes;
            if (l.tipo==='mao_obra') pdfMaoObra += total;
            else if (l.tipo==='material') pdfMateriais += total;
            else pdfOutros += total;
            const tipoLabel = { mao_obra:'M.O.', material:'Mat.', outro:'Outro' }[l.tipo] || '';
            const descExtra = (l.tipo==='mao_obra' && nPes>1) ? ` <span style="opacity:.55">(${nPes} pessoas × ${Number(l.quantidade).toFixed(1)}h)</span>` : '';
            tabelaHTML += `
            <tr>
                <td class="tipo-badge tipo-${escHtml(l.tipo)}">${escHtml(tipoLabel)}</td>
                <td>${escHtml(l.descricao)}${descExtra}</td>
                <td class="num">${escHtml(l.unidade||'vg')}</td>
                <td class="num">${Number(l.quantidade).toFixed(2)}</td>
                <td class="num">${fmt(l.preco_unitario)} €</td>
                <td class="num">${fmt(total)} €</td>
            </tr>`;
        });
    });

    const pdfSemIva = pdfMaoObra + pdfMateriais + pdfOutros;
    const pdfIva    = pdfSemIva * (ivaP/100);
    const pdfComIva = pdfSemIva + pdfIva;

    const htmlContent = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>Orçamento ${escHtml(o.numero)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Inter',sans-serif; font-size:11px; color:#222; background:#fff; padding:28px 32px; }

  /* Header */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px; padding-bottom:20px; border-bottom:2px solid #b58863; }
  .logo-area { }
  .empresa-nome { font-family:'Oswald',sans-serif; font-size:22px; font-weight:500; letter-spacing:2px; text-transform:uppercase; color:#1a1a1a; }
  .empresa-sub  { font-size:10px; color:#888; letter-spacing:1px; text-transform:uppercase; margin-top:2px; }
  .orc-info { text-align:right; }
  .orc-numero { font-family:'Oswald',sans-serif; font-size:20px; font-weight:600; color:#b58863; letter-spacing:1px; }
  .orc-estado { display:inline-block; padding:2px 10px; border-radius:4px; font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; margin-top:4px; background:rgba(181,136,99,.15); color:#9a7150; }
  .orc-datas  { font-size:10px; color:#888; margin-top:6px; line-height:1.6; }

  /* Cliente + Obra */
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px; }
  .info-box  { background:#f4f1ec; border-radius:6px; padding:12px 16px; }
  .info-box h3 { font-family:'Oswald',sans-serif; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#9a7150; margin-bottom:8px; }
  .info-box p  { font-size:11px; line-height:1.7; color:#333; }
  .info-box .destaque { font-weight:600; font-size:12px; color:#1a1a1a; }

  /* Tabela de trabalhos */
  .tabela-titulo { font-family:'Oswald',sans-serif; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#888; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; margin-bottom:20px; }
  thead th { font-family:'Oswald',sans-serif; font-size:10px; letter-spacing:1px; text-transform:uppercase; background:#b58863; color:#ffffff; padding:7px 10px; text-align:left; }
  thead th.num { text-align:right; }
  .cat-header td { font-family:'Oswald',sans-serif; font-size:11px; font-weight:500; letter-spacing:.8px; background:#f5f2ed; color:#9a7150; padding:6px 10px; border-bottom:1px solid rgba(0,0,0,.06); }
  tbody tr td { padding:5px 10px; border-bottom:1px solid rgba(0,0,0,.05); font-size:11px; vertical-align:middle; }
  tbody tr:last-child td { border-bottom:none; }
  .num { text-align:right; }
  .tipo-badge { font-size:9px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; padding:1px 5px; border-radius:3px; white-space:nowrap; }
  .tipo-mao_obra  { background:rgba(79,122,99,.12);  color:#4f7a63; }
  .tipo-material  { background:rgba(74,144,226,.12); color:#2a5eb0; }
  .tipo-outro     { background:rgba(181,136,99,.15); color:#9a7150; }

  /* Totais */
  .totais-wrap { display:grid; grid-template-columns:1fr 280px; gap:20px; margin-bottom:24px; }
  .condicoes { background:#f4f1ec; border-radius:6px; padding:14px 16px; }
  .condicoes h3 { font-family:'Oswald',sans-serif; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#9a7150; margin-bottom:8px; }
  .condicoes p { font-size:11px; line-height:1.7; color:#333; margin-bottom:6px; }
  .totais-box { }
  .totais-linha { display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid rgba(0,0,0,.06); font-size:11px; }
  .totais-linha.final { border-bottom:none; border-top:2px solid #b58863; margin-top:4px; padding-top:8px; }
  .totais-linha.final .label { font-family:'Oswald',sans-serif; font-size:14px; font-weight:600; letter-spacing:.5px; }
  .totais-linha.final .valor { font-family:'Oswald',sans-serif; font-size:16px; font-weight:600; color:#9a7150; }
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
        <div class="orc-numero">${escHtml(o.numero)}</div>
        <div class="orc-estado">${{rascunho:'Rascunho',enviado:'Enviado',aceite:'Aceite',recusado:'Recusado'}[o.estado]||o.estado}</div>
        <div class="orc-datas">
            Data: ${escHtml(o.data || '—')}<br>
            ${o.validade ? 'Válido até: ' + escHtml(o.validade) : ''}
        </div>
    </div>
</div>

<!-- CLIENTE + OBRA -->
<div class="info-grid">
    <div class="info-box">
        <h3>Cliente</h3>
        <p class="destaque">${escHtml(o.cliente_nome)}</p>
        ${o.cliente_nif    ? `<p>NIF: ${escHtml(o.cliente_nif)}</p>` : ''}
        ${o.cliente_morada ? `<p>${escHtml(o.cliente_morada)}</p>` : ''}
        ${o.cliente_email  ? `<p>${escHtml(o.cliente_email)}</p>` : ''}
        ${o.cliente_tel    ? `<p>${escHtml(o.cliente_tel)}</p>` : ''}
    </div>
    <div class="info-box">
        <h3>Obra / Trabalho</h3>
        <p class="destaque">${escHtml(o.obras?.nome || o.obra_descricao || '—')}</p>
        ${o.prazo_obra ? `<p>Prazo: ${escHtml(o.prazo_obra)}</p>` : ''}
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
        ${o.condicoes_pag ? `<h3>Condições de Pagamento</h3><p>${escHtml(o.condicoes_pag)}</p>` : ''}
        ${o.notas ? `<h3 style="margin-top:10px">Notas</h3><p>${escHtml(o.notas)}</p>` : ''}
    </div>
    <div class="totais-box">
        <div class="totais-linha"><span class="label">Mão de Obra</span><span class="valor">${fmt(pdfMaoObra)} €</span></div>
        <div class="totais-linha"><span class="label">Materiais</span><span class="valor">${fmt(pdfMateriais)} €</span></div>
        ${pdfOutros>0 ? `<div class="totais-linha"><span class="label">Outros</span><span class="valor">${fmt(pdfOutros)} €</span></div>` : ''}
        <div class="totais-linha"><span class="label">Subtotal s/ IVA</span><span class="valor">${fmt(pdfSemIva)} €</span></div>
        <div class="totais-linha"><span class="label">IVA ${ivaP}%</span><span class="valor">${fmt(pdfIva)} €</span></div>
        <div class="totais-linha final"><span class="label">Total</span><span class="valor">${fmt(pdfComIva)} €</span></div>
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
        <h3>Cliente — ${escHtml(o.cliente_nome)}</h3>
        <div class="assin-linha"></div>
        <div class="assin-legenda">Assinatura (aceite do orçamento)</div>
    </div>
</div>

<div class="footer">
    Maia Solutions — Construção Civil &amp; Remodelações · ${escHtml(o.numero)} · ${escHtml(o.data || '')}
</div>

<script>window.print();</script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
        alert('Não foi possível abrir o PDF. Permite janelas de pop-up para este site e tenta novamente.');
        return;
    }
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
        output.innerHTML = '<div style="color:#e09486;font-size:13px">Erro ao gerar QR. Tenta o gerador avançado.</div>';
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
    // Esta função nunca chegou a ser escrita: sem a guarda, rebenta em
    // todos os carregamentos e mata o que vier a seguir neste handler.
    if (typeof actualizarEstadoTOC === "function") setTimeout(actualizarEstadoTOC, 500);
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
    resEl.style.color = resultado >= 0 ? "#8fbfa0" : "#e09486";
    document.getElementById("dreMargem").textContent = margem.toFixed(1) + "%";

    const recByCat = {};
    receitas.forEach(m => { const c = m.categorias_financeiras?.nome || "Sem categoria"; recByCat[c] = (recByCat[c]||0) + Number(m.valor_total); });
    document.getElementById("dreDetalheReceitas").innerHTML = Object.entries(recByCat).sort((a,b)=>b[1]-a[1]).map(([cat,val]) =>
        `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
            <span style="opacity:.8">${cat}</span><span style="color:#8fbfa0;font-weight:600">${val.toFixed(2)} €</span></div>`
    ).join("") || "<p style='opacity:.4;font-size:13px'>Sem receitas no período</p>";

    const cusByCat = {};
    custos.forEach(m => { const c = m.categorias_financeiras?.nome || "Sem categoria"; cusByCat[c] = (cusByCat[c]||0) + Number(m.valor_total); });
    document.getElementById("dreDetalheCustos").innerHTML = Object.entries(cusByCat).sort((a,b)=>b[1]-a[1]).map(([cat,val]) =>
        `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px">
            <span style="opacity:.8">${cat}</span><span style="color:#e09486;font-weight:600">${val.toFixed(2)} €</span></div>`
    ).join("") || "<p style='opacity:.4;font-size:13px'>Sem custos no período</p>";

    // Popular select de obras no DRE
    const dreObraEl = document.getElementById("dreObra");
    if (dreObraEl && dreObraEl.options.length <= 1) {
        const { data: obras } = await SB.from("obras").select("id, nome").eq("ativo", true).order("nome");
        (obras||[]).forEach(o => { const opt = document.createElement("option"); opt.value=o.id; opt.textContent=o.nome; dreObraEl.appendChild(opt); });
    }
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
    devEl.style.color = desvio<=0 ? "#8fbfa0" : "#e09486";
    document.getElementById("orcadoPercent").textContent = percent.toFixed(1)+"%";

    const pct = Math.min(percent,100);
    const bar = document.getElementById("orcadoBar");
    bar.style.width      = pct+"%";
    bar.style.background = pct<80?"var(--primary)":pct<100?"#f97316":"#e09486";
    document.getElementById("orcadoBarLabel").textContent = percent.toFixed(1)+"% executado";

    const catMap = {};
    gastos.forEach(m => { const c=m.categorias_financeiras?.nome||"Sem categoria"; catMap[c]=(catMap[c]||0)+Number(m.valor_total); });
    document.getElementById("orcadoTabela").innerHTML = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,val]) =>
        `<tr style="border-bottom:1px solid rgba(255,255,255,.05)">
            <td style="padding:8px;font-size:13px">${cat}</td>
            <td style="padding:8px;font-size:13px;text-align:right;color:#e09486;font-weight:600">${val.toFixed(2)} €</td>
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
                onclick="abrirTab('fluxo')">
                <div>
                    <div style="font-size:13px;font-weight:500;color:var(--text-dark)">${escHtml(desc)}</div>
                    <div style="font-size:11px;color:#e05c5c;margin-top:2px">${escHtml(m.data_documento)} · ${dias} dia(s) atraso</div>
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
                onclick="abrirTab('inventario')">
                <div style="font-size:13px;font-weight:500;color:var(--text-dark)">${escHtml(a.descricao)}</div>
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
            html += `<div style="padding:8px 16px;border-bottom:1px solid rgba(0,0,0,.06);font-size:13px;color:var(--text-dark);opacity:.7">${escHtml(f.nome)}</div>`;
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

// Fechar painéis ao clicar fora
document.addEventListener("click", e => {
    for (const [wrapId, painelId] of [["notifWrap", "notifPainel"], ["assistWrap", "assistPainel"]]) {
        const wrap = document.getElementById(wrapId);
        if (wrap && !wrap.contains(e.target)) {
            const painel = document.getElementById(painelId);
            if (painel) painel.style.display = "none";
        }
    }
});

// =======================================================
// BOTÃO DO ASSISTENTE (ao lado do sino)
// Atalhos para o que o assistente sabe fazer. Ler fatura faz-se aqui
// mesmo; o resto abre a página do assistente já no sítio certo.
// =======================================================
const ATALHOS_ASSISTENTE = [
    { id: "fatura",   ic: "📷", nome: "Ler fatura" },
    { id: "material", ic: "🛒", nome: "Pedir material" },
    { id: "pedidos",  ic: "✅", nome: "Pedidos por validar" },
    { id: "nota",     ic: "📝", nome: "Contar como está uma obra" },
    { id: "plano",    ic: "🗓", nome: "Planear uma obra" },
    { id: "pergunta", ic: "❓", nome: "Perguntar" },
    { id: "obras",    ic: "🏗", nome: "O que sei de cada obra" },
];

function toggleAssistente() {
    const painel = document.getElementById("assistPainel");
    if (!painel) return;
    if (painel.style.display === "block") { painel.style.display = "none"; return; }

    painel.innerHTML = `
        <a class="assist-item assist-abrir" href="assistente.html">
            <span>✨</span><span>Falar com o assistente</span>
        </a>` +
        ATALHOS_ASSISTENTE.map(a => `
        <button class="assist-item" onclick="usarAtalhoAssistente('${a.id}')">
            <span>${a.ic}</span><span>${escHtml(a.nome)}</span>
        </button>`).join("");
    painel.style.display = "block";
}

function usarAtalhoAssistente(id) {
    document.getElementById("assistPainel").style.display = "none";
    if (id === "fatura") {
        location.hash = "#ler-fatura";
        tratarAccaoNoEndereco();
        return;
    }
    location.href = `assistente.html?f=${encodeURIComponent(id)}`;
}

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
            btn.style.background   = active ? "rgba(181,136,99,.15)" : "none";
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
                    return `<div style="${op}background:var(--panel);border:1px solid rgba(0,0,0,.08);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px">
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:600;font-size:13px;margin-bottom:4px;display:flex;align-items:center;gap:8px">
                                ${s.nome}
                                <span style="font-size:10px;background:rgba(0,0,0,.06);padding:1px 7px;border-radius:8px;color:var(--text-muted);font-weight:400">${s.unidade}</span>
                                ${!s.ativo ? '<span style="font-size:10px;color:#a5483d;background:rgba(224,148,134,.1);padding:1px 7px;border-radius:8px">Inactivo</span>' : ''}
                            </div>
                            <div style="font-size:11px;opacity:.5">
                                ${s.rendimento_mo ? `⚡ ${s.rendimento_mo} ${s.unidade}/dia · ` : ''}
                                ${mats.length ? mats.slice(0,3).map(m=>`${m.descricao} ${m.quantidade}${m.unidade}`).join(' · ')+(mats.length>3?'…':'') : 'Sem materiais'}
                            </div>
                        </div>
                        <div style="display:flex;gap:4px;flex-shrink:0">
                            <button onclick="abrirModalBibServico('${s.id}')" style="background:rgba(0,0,0,.06);border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px">✏️</button>
                            <button onclick="toggleBibAtivo('${s.id}',${s.ativo})" style="background:rgba(0,0,0,.05);border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;opacity:.6" title="${s.ativo?'Desactivar':'Activar'}">${s.ativo?'🔕':'🔔'}</button>
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
        <input value="${escHtml(mat?.descricao||'')}" placeholder="Nome do material" data-field="descricao"
            style="padding:6px 8px;background:#fff;border:1px solid rgba(0,0,0,.15);border-radius:6px;color:var(--text-dark);font-size:12px;outline:none">
        <input value="${mat?.quantidade||''}" type="number" step="0.001" min="0" placeholder="Qtd" data-field="quantidade"
            style="padding:6px 8px;background:#fff;border:1px solid rgba(0,0,0,.15);border-radius:6px;color:var(--text-dark);font-size:12px;text-align:right;outline:none">
        <select data-field="unidade"
            style="padding:6px 4px;background:#fff;border:1px solid rgba(0,0,0,.15);border-radius:6px;color:var(--text-dark);font-size:12px">
            ${["kg","L","m²","ml","m³","un","saco","rolo","cx"].map(u=>`<option ${u===(mat?.unidade||'un')?'selected':''}>${u}</option>`).join("")}
        </select>
        <button onclick="this.closest('.bib-mat-linha').remove()" style="background:rgba(165,72,61,.1);border:none;border-radius:6px;padding:5px;cursor:pointer;font-size:14px;opacity:.7">×</button>`;
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
        popup.style.cssText = "position:fixed;z-index:9999;background:#25363f;border:1px solid rgba(255,255,255,.12);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.6);min-width:320px;max-width:420px;overflow:hidden";
        const rect = inputEl.getBoundingClientRect();
        popup.style.top  = (rect.bottom + 4) + "px";
        popup.style.left = rect.left + "px";
        popup.innerHTML =
            '<div style="padding:6px 12px;font-size:10px;letter-spacing:1px;text-transform:uppercase;opacity:.4;border-bottom:1px solid rgba(255,255,255,.06)">🔧 Biblioteca</div>' +
            matches.map(s => `<div class="bib-pp" data-id="${s.id}" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.04)" onmouseenter="this.style.background='rgba(181,136,99,.1)'" onmouseleave="this.style.background=''"><div><div style="font-size:13px;font-weight:500">${s.nome}</div><div style="font-size:11px;opacity:.4">${s.categoria}${s.rendimento_mo?' · '+s.rendimento_mo+' '+s.unidade+'/dia':''}</div></div><span style="font-size:10px;background:rgba(255,255,255,.08);padding:2px 8px;border-radius:8px;color:rgba(255,255,255,.5);margin-left:8px;flex-shrink:0">${s.unidade}</span></div>`).join("");
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
    info.style.cssText = "background:rgba(143,191,160,.1);border:1px solid rgba(143,191,160,.2);border-radius:8px;padding:8px 14px;font-size:12px;color:#8fbfa0;margin:6px 0";
    info.innerHTML = `✓ <strong>${mats.length} material${mats.length>1?'is':''}</strong> adicionado${mats.length>1?'s':''} da biblioteca. Ajusta a quantidade total do serviço.`;
    linhasDiv.insertBefore(info, linhasDiv.firstChild);
    setTimeout(() => info.remove(), 5000);
}

