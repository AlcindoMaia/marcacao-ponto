
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
}

// =======================================================
// FINANCEIRO
// =======================================================
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
            .select("funcionario_id, horas, data, obras(nome)")
            .gte("data", inicio).lte("data", fim),
        SB.from("funcionarios")
            .select("id, nome, valor_dia, ativo").eq("ativo", true)
    ]);

    const registos = registosRes.data || [];
    const funcs    = funcsRes.data    || [];

    // Agrupar por funcionário — somar horas e dias únicos
    const porFunc = {};
    registos.forEach(r => {
        const fid = r.funcionario_id;
        if (!porFunc[fid]) porFunc[fid] = { horas: 0, dias: new Set() };
        porFunc[fid].horas += Number(r.horas) || 0;
        porFunc[fid].dias.add(r.data); // dias únicos trabalhados
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

        tr.innerHTML = `
            <td>${r.funcionario}</td>
            <td>${r.obra}</td>
            <td>${r.dia}</td>
            <td contenteditable="true" class="editavel" data-id="${r.entrada_id || ""}" data-tipo="entrada">${fmt(r.entrada)}</td>
            <td contenteditable="true" class="editavel" data-id="${r.saida_id || ""}" data-tipo="saida">${fmt(r.saida)}</td>
            <td class="col-horas">${r.horas || "–"}</td>
            <td>${incompleto
                ? `<span class="estado-incompleto">Incompleto</span>`
                : `<span class="estado-ok">OK</span>`
            }</td>`;

        // Edição inline — atualiza tabela ponto pelo ID correto
        tr.querySelectorAll(".editavel").forEach(td => {
            td.addEventListener("blur", () => guardarEdicaoRegisto(tr, td));
        });

        tbody.appendChild(tr);
    });
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
            <td style="font-weight:500">${f.nome || "—"}</td>
            <td>${f.codigo || "—"}</td>
            <td>${f.valor_dia ? Number(f.valor_dia).toFixed(2) + " €" : "—"}</td>
            <td>
                <span class="badge-estado ${ativo ? "pago" : "por_pagar"}">${ativo ? "Ativo" : "Inativo"}</span>
            </td>
            <td>
                ${temDevice
                    ? `<span style="font-size:11px;opacity:.5;font-family:monospace">${f.device_id.substring(0,8)}…</span>`
                    : `<span style="font-size:11px;color:#f4b942">Sem dispositivo</span>`}
            </td>
            <td class="acoes-td">
                <button class="btn-acao" title="Editar">✏️</button>
                <button class="btn-acao" title="${ativo ? "Desativar" : "Ativar"}">${ativo ? "🔴" : "🟢"}</button>
            </td>`;

        tr.querySelectorAll(".btn-acao")[0].onclick = () => abrirModalFuncionario(f);
        tr.querySelectorAll(".btn-acao")[1].onclick = () => toggleAtivoFuncionario(f.id, f.nome, ativo);
        tbody.appendChild(tr);
    });
}

function abrirModalFuncionario(func = null) {
    funcEditId = func?.id || null;

    document.getElementById("modalFuncTitulo").textContent = func ? "Editar Funcionário" : "Novo Funcionário";
    document.getElementById("funcNome").value      = func?.nome || "";
    document.getElementById("funcCodigo").value    = func?.codigo || "";
    document.getElementById("funcValorDia").value  = func?.valor_dia || "";
    document.getElementById("funcAtivo").value     = func?.ativo === false ? "false" : "true";

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
    document.getElementById("modalFuncionario").classList.remove("hidden");
}

function fecharModalFuncionario() {
    document.getElementById("modalFuncionario").classList.add("hidden");
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
        ativo:     document.getElementById("funcAtivo").value === "true"
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
            <td class="acoes-td" style="white-space:nowrap">
                <button class="btn-acao" title="Editar">✏️</button>
                <button class="btn-acao" title="Ver QR">🔲</button>
                <button class="btn-acao" title="${estado === "ativa" ? "Concluir" : "Reativar"}">${estado === "ativa" ? "✅" : "🔄"}</button>
            </td>`;

        tr.querySelector("[title='Editar']").onclick  = () => editarObra(o);
        tr.querySelector("[title='Ver QR']").onclick  = () => abrirModalQR(o);
        tr.querySelector("[title='Concluir'], [title='Reativar']").onclick = () => toggleEstadoObra(o.id, o.nome, estado);
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

async function editarObra(obra) {
    const nome   = prompt("Nome da obra:", obra.nome);
    if (nome === null) return;
    const morada = prompt("Morada:", obra.morada || "");
    if (morada === null) return;
    const raio   = prompt("Raio GPS (metros):", obra.raio || 120);
    if (raio === null) return;

    const { error } = await SB.from("obras").update({
        nome:   nome.trim(),
        morada: morada.trim(),
        raio:   parseInt(raio) || 120,
    }).eq("id", obra.id);

    if (error) { alert("Erro ao guardar: " + error.message); return; }
    await carregarObras();
}

async function toggleEstadoObra(id, nome, estadoAtual) {
    const novoEstado = estadoAtual === "ativa" ? "concluida" : "ativa";
    const acao = novoEstado === "concluida" ? "concluir" : "reativar";
    if (!confirm(`${acao.charAt(0).toUpperCase() + acao.slice(1)} a obra "${nome}"?`)) return;

    const { error } = await SB.from("obras").update({ estado: novoEstado }).eq("id", id);
    if (error) { alert("Erro: " + error.message); return; }
    await carregarObras();
}


// =======================================================
// SCANNER QR DE FATURAS PORTUGUESAS
// =======================================================
let qrStream = null;
let qrAnimFrame = null;

async function iniciarScanQR() {
    const wrap  = document.getElementById("qrReaderWrap");
    const video = document.getElementById("qrVideo");
    const status = document.getElementById("qrStatus");
    wrap.style.display = "block";

    try {
        qrStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });
        video.srcObject = qrStream;
        await video.play();
        status.textContent = "Aponte para o QR Code da fatura...";
        scanFrame();
    } catch(e) {
        status.textContent = "Câmara não disponível. Cole o código manualmente.";
    }
}

function scanFrame() {
    const video  = document.getElementById("qrVideo");
    const canvas = document.getElementById("qrCanvas");
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        qrAnimFrame = requestAnimationFrame(scanFrame);
        return;
    }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });

    if (code) {
        parsearQRFatura(code.data);
        fecharScanQR();
        return;
    }
    qrAnimFrame = requestAnimationFrame(scanFrame);
}

function fecharScanQR() {
    if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
    if (qrAnimFrame) { cancelAnimationFrame(qrAnimFrame); qrAnimFrame = null; }
    const wrap = document.getElementById("qrReaderWrap");
    if (wrap) wrap.style.display = "none";
}

function parsearQRFatura(texto) {
    // Formato AT: A:NIF_EMITENTE*B:NIF_ADQUIRENTE*C:PAIS*D:TIPO*E:ESTADO*F:DATA*G:ATCUD*H:REF*I1:BASE*I2:IVA%*N:IVA_TOTAL*O:TOTAL_IVA*P:DESCONTO*Q:HASH*R:NUM_CERT
    const status = document.getElementById("qrStatus");

    try {
        // Tentar parsing do formato AT
        const campos = {};
        texto.split("*").forEach(par => {
            const sep = par.indexOf(":");
            if (sep > 0) {
                campos[par.substring(0, sep)] = par.substring(sep + 1);
            }
        });

        let preenchido = 0;

        // NIF fornecedor (campo A)
        if (campos["A"]) {
            document.getElementById("movNif").value = campos["A"];
            preenchido++;
        }

        // Data (campo F — formato YYYYMMDD)
        if (campos["F"] && campos["F"].length === 8) {
            const ano = campos["F"].substring(0,4);
            const mes = campos["F"].substring(4,6);
            const dia = campos["F"].substring(6,8);
            document.getElementById("movData").value = `${ano}-${mes}-${dia}`;
            preenchido++;
        }

        // Referência (campo G = ATCUD ou H)
        const ref = campos["G"] || campos["H"] || "";
        if (ref) {
            document.getElementById("movReferencia").value = ref.substring(0, 50);
            preenchido++;
        }

        // Total com IVA (campo O)
        if (campos["O"]) {
            const total = parseFloat(campos["O"].replace(",", "."));
            if (!isNaN(total)) {
                document.getElementById("movTotal").value = total.toFixed(2);
                // IVA % (campo I2 se existir)
                if (campos["I2"]) {
                    document.getElementById("movIva").value = campos["I2"];
                    const base = total / (1 + parseFloat(campos["I2"]) / 100);
                    document.getElementById("movBase").value = base.toFixed(2);
                } else {
                    // Tentar calcular pelo campo N (total IVA)
                    if (campos["N"]) {
                        const ivaVal = parseFloat(campos["N"].replace(",", "."));
                        const base = total - ivaVal;
                        const pct  = Math.round((ivaVal / base) * 100);
                        document.getElementById("movIva").value   = pct;
                        document.getElementById("movBase").value  = base.toFixed(2);
                    }
                }
                preenchido++;
            }
        }

        if (preenchido > 0) {
            alert(`✓ QR lido com sucesso! ${preenchido} campo(s) preenchido(s).
Completa a obra, categoria e estado manualmente.`);
        } else {
            // Tentar formato simples (texto livre)
            alert("QR lido mas formato não reconhecido como fatura AT. Conteúdo: " + texto.substring(0, 100));
        }

    } catch(e) {
        console.error("Erro a parsear QR:", e);
        alert("Erro ao ler o QR. Verifique se é um QR de fatura portuguesa.");
    }
}

// =======================================================
// INVENTÁRIO — CRUD COMPLETO
// =======================================================
async function initInventario() {
    await carregarUnidades();
    await carregarArtigos();
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
        SB.from("artigos").select("id, codigo, descricao, tipo_artigo, preco_atual, stock_inicial, local_armazenamento, ativo").order("descricao"),
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
        tr.innerHTML = `
            <td>${a.codigo || ""}</td>
            <td>${a.descricao || ""}</td>
            <td>${a.tipo_artigo || ""}</td>
            <td>${Number(a.preco_atual || 0).toFixed(2)} €</td>
            <td>${a.quantidade ?? 0}</td>
            <td>${a.local_armazenamento || ""}</td>
            <td class="acoes-td">
                <button class="btn-acao" title="Editar">✏️</button>
                <button class="btn-acao" title="Histórico">📋</button>
                <button class="btn-acao btn-apagar-art" title="Apagar">🗑️</button>
            </td>`;
        tr.querySelector("[title='Editar']").onclick    = () => abrirModalArtigo(a);
        tr.querySelector("[title='Histórico']").onclick = () => abrirHistoricoStock(a.id, a.descricao);
        tr.querySelector("[title='Apagar']").onclick    = () => apagarArtigo(a.id, a.descricao);
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
    document.getElementById("modalArtigo").classList.remove("hidden");
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
    document.getElementById("modalArtigo").classList.add("hidden");
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

async function apagarArtigo(id, nome) {
    if (!confirm(`Apagar "${nome}"? Esta ação não pode ser revertida.`)) return;
    const { error } = await SB.from("artigos").delete().eq("id", id);
    if (error) { alert("Erro: " + error.message); return; }
    await carregarArtigos();
}

// =======================================================
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

async function carregarMovimentos() {
    const obra       = document.getElementById("filtroObra")?.value || "";
    const categoria  = document.getElementById("filtroCategoria")?.value || "";
    const tipo       = document.getElementById("filtroTipo")?.value || "";
    const dataInicio = document.getElementById("filtroDataInicio")?.value || "";
    const dataFim    = document.getElementById("filtroDataFim")?.value || "";

    let query = SB.from("movimentos_financeiros")
        .select(`id, referencia, data_documento, tipo,
                 valor_base, iva, valor_total, estado_pagamento, observacoes,
                 fornecedores(nome), categorias_financeiras(nome), obras(nome)`)
        .order("data_documento", { ascending: false });

    if (obra)        query = query.eq("obra_id", obra);
    if (categoria)   query = query.eq("categoria_id", categoria);
    if (tipo)        query = query.eq("tipo", tipo);
    if (dataInicio)  query = query.gte("data_documento", dataInicio);
    if (dataFim)     query = query.lte("data_documento", dataFim);

    const { data, error } = await query;
    if (error) { console.error(error); return; }
    movimentos = data || [];
    renderMovimentos();
    renderTotais();
}

function renderMovimentos() {
    const tbody = document.querySelector("#tabelaMovimentos tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (movimentos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;opacity:.6">Sem movimentos com estes filtros.</td></tr>`;
        return;
    }
    movimentos.forEach(m => {
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
}

function renderTotais() {
    const entradas = movimentos.filter(m => m.tipo === "entrada").reduce((s, m) => s + Number(m.valor_total), 0);
    const saidas   = movimentos.filter(m => m.tipo === "saida").reduce((s, m) => s + Number(m.valor_total), 0);
    const saldo    = entradas - saidas;
    document.getElementById("totalEntradas").textContent = entradas.toFixed(2) + " €";
    document.getElementById("totalSaidas").textContent   = saidas.toFixed(2) + " €";
    const saldoEl = document.getElementById("saldoFluxo");
    saldoEl.textContent  = saldo.toFixed(2) + " €";
    saldoEl.style.color  = saldo >= 0 ? "#5ad65a" : "#ff7a7a";
}

function ligarFiltrosFluxo() {
    ["filtroObra","filtroCategoria","filtroTipo","filtroDataInicio","filtroDataFim"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", carregarMovimentos);
    });
    document.getElementById("btnLimparFiltros")?.addEventListener("click", () => {
        ["filtroObra","filtroCategoria","filtroTipo","filtroDataInicio","filtroDataFim"]
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        carregarMovimentos();
    });
}

function abrirModalMovimento(mov = null) {
    movEditId = mov?.id || null;
    document.getElementById("modalMovTitulo").textContent = mov ? "Editar Movimento" : "Novo Movimento";
    document.getElementById("movReferencia").value = mov?.referencia || "";
    document.getElementById("movData").value       = mov?.data_documento || new Date().toISOString().split("T")[0];
    document.getElementById("movTipo").value       = mov?.tipo || "saida";
    document.getElementById("movBase").value       = mov?.valor_base || "";
    document.getElementById("movIva").value        = mov?.iva ?? "";
    document.getElementById("movTotal").value      = mov?.valor_total || "";
    document.getElementById("movEstado").value     = mov?.estado_pagamento || "por_pagar";
    document.getElementById("movObs").value        = mov?.observacoes || "";
    document.getElementById("movNif").value        = "";
    document.getElementById("movFornecedor").value = mov?.fornecedores?.nome || "";
    document.getElementById("movMsg").textContent  = "";
    document.getElementById("modalMovimento").classList.remove("hidden");
}

function fecharModalMovimento() {
    document.getElementById("modalMovimento").classList.add("hidden");
    movEditId = null;
}

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

    const { error } = movEditId
        ? await SB.from("movimentos_financeiros").update(payload).eq("id", movEditId)
        : await SB.from("movimentos_financeiros").insert(payload);

    if (error) { movMsg.textContent = "Erro: " + error.message; return; }

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
    document.getElementById("modalArtigo")?.addEventListener("click", e => {
        if (e.target.id === "modalArtigo") fecharModalArtigo();
    });

    document.getElementById("modalHistorico")?.addEventListener("click", e => {
        if (e.target.id === "modalHistorico") fecharModalHistorico();
    });

    // Fluxo — modal
    document.getElementById("btnNovoMovimento")?.addEventListener("click", () => abrirModalMovimento());
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
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;opacity:.5">Sem orçamentos. Clique + para criar.</td></tr>`;
        return;
    }

    const estadoCores = { rascunho:'por_pagar', enviado:'por_pagar', aceite:'pago', recusado:'vencido', cancelado:'vencido' };
    const estadoLabels = { rascunho:'Rascunho', enviado:'Enviado', aceite:'Aceite', recusado:'Recusado', cancelado:'Cancelado' };

    lista.forEach(o => {
        const tr = document.createElement('tr');
        const vencido = o.validade && o.validade < new Date().toISOString().split('T')[0] && o.estado === 'enviado';
        tr.innerHTML = `
            <td style="font-family:monospace;font-size:12px;font-weight:600">${o.numero || '—'}</td>
            <td>${o.data || '—'}</td>
            <td style="font-weight:500">${o.cliente_nome || '—'}</td>
            <td style="font-size:12px;opacity:.7">${o.obras?.nome || o.obra_descricao || '—'}</td>
            <td style="text-align:right;font-weight:600">${Number(o.total_com_iva||0).toFixed(2)} €</td>
            <td><span class="badge-estado ${estadoCores[o.estado]||'por_pagar'}">${estadoLabels[o.estado]||o.estado}</span></td>
            <td style="font-size:12px;${vencido?'color:var(--color-err)':''}">${o.validade||'—'}</td>
            <td class="acoes-td">
                <button class="btn-acao" title="Editar">✏️</button>
                <button class="btn-acao" title="Duplicar">📋</button>
                <button class="btn-acao" title="PDF">📄</button>
                <button class="btn-acao" title="Apagar">🗑️</button>
            </td>`;
        tr.querySelector("[title='Editar']").onclick  = () => abrirModalOrcamento(o.id);
        tr.querySelector("[title='Duplicar']").onclick= () => duplicarOrcamento(o.id);
        tr.querySelector("[title='PDF']").onclick     = () => exportarPDFOrcamento(o.id);
        tr.querySelector("[title='Apagar']").onclick  = () => apagarOrcamento(o.id, o.numero);
        tbody.appendChild(tr);
    });
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

    div.innerHTML = `
        <div style="background:rgba(244,185,66,.12);padding:10px 14px;display:flex;align-items:center;gap:10px">
            <input value="${nome}" placeholder="Nome da categoria" data-cid="${cid}"
                style="flex:1;border:none;background:transparent;font-family:var(--font-title);font-size:13px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;outline:none;color:var(--text-dark)">
            <button onclick="adicionarLinha(${cid},'mao_obra')" class="btn-secondary" style="font-size:11px;padding:4px 10px">+ M.O.</button>
            <button onclick="adicionarLinha(${cid},'material')" class="btn-secondary" style="font-size:11px;padding:4px 10px">+ Mat.</button>
            <button onclick="adicionarLinha(${cid},'outro')" class="btn-secondary" style="font-size:11px;padding:4px 10px">+ Outro</button>
            <button onclick="this.closest('.orc-categoria').remove();actualizarTotaisOrc()" style="background:none;border:none;cursor:pointer;opacity:.4;font-size:18px;padding:0 4px">×</button>
        </div>
        <div class="orc-linhas" data-cid="${cid}" style="padding:0">
            <div style="display:grid;grid-template-columns:24px 120px 1fr 70px 90px 90px 32px;gap:0;background:rgba(244,185,66,.25);font-family:var(--font-title);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);padding:5px 14px">
                <span></span><span>Tipo</span><span>Descrição</span><span>Un</span><span style="text-align:right">Qtd</span><span style="text-align:right">Preço Un.</span><span></span>
            </div>
        </div>`;

    container.appendChild(div);

    // Adicionar linhas existentes
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

    const tipoLabel  = { mao_obra:'Mão Obra', material:'Material', outro:'Outro' };
    const tipoCor    = { mao_obra:'rgba(42,138,42,.15)', material:'rgba(74,144,226,.12)', outro:'rgba(244,185,66,.12)' };

    const div = document.createElement('div');
    div.className = 'orc-linha';
    div.dataset.lid = lid;
    div.dataset.tipo = tipo;
    if (dados?.id) div.dataset.dbId = dados.id;
    div.style.cssText = `display:grid;grid-template-columns:24px 120px 1fr 70px 90px 90px 32px;gap:0;align-items:center;padding:5px 14px;border-bottom:1px solid rgba(0,0,0,.04);background:${tipoCor[tipo]||''}`;

    div.innerHTML = `
        <span style="font-size:10px;opacity:.4">${lid}</span>
        <span style="font-family:var(--font-title);font-size:10px;letter-spacing:.5px;color:var(--text-muted)">${tipoLabel[tipo]}</span>
        <input value="${dados?.descricao||''}" placeholder="Descrição do trabalho / artigo" data-field="descricao"
            style="border:none;background:transparent;font-size:13px;padding:3px 6px;outline:none;border-radius:4px">
        <input value="${dados?.unidade||'vg'}" data-field="unidade"
            style="border:none;background:transparent;font-size:12px;padding:3px 4px;text-align:center;outline:none;width:100%;border-radius:4px">
        <input value="${dados?.quantidade||1}" type="number" min="0" step="0.01" data-field="quantidade"
            style="border:none;background:transparent;font-size:12px;padding:3px 6px;text-align:right;outline:none;border-radius:4px"
            oninput="actualizarTotaisOrc()">
        <input value="${dados?.preco_unitario||''}" type="number" min="0" step="0.01" placeholder="0.00" data-field="preco_unitario"
            style="border:none;background:transparent;font-size:12px;padding:3px 6px;text-align:right;outline:none;border-radius:4px"
            oninput="actualizarTotaisOrc()">
        <button onclick="this.closest('.orc-linha').remove();actualizarTotaisOrc()"
            style="background:none;border:none;cursor:pointer;opacity:.3;font-size:16px;padding:0;text-align:center">×</button>`;

    linhasDiv.appendChild(div);
}

// ── Totais ──────────────────────────────────────────────────
function actualizarTotaisOrc() {
    let maoObra = 0, materiais = 0, outros = 0;

    document.querySelectorAll('.orc-linha').forEach(linha => {
        const qtd   = parseFloat(linha.querySelector('[data-field="quantidade"]')?.value) || 0;
        const preco = parseFloat(linha.querySelector('[data-field="preco_unitario"]')?.value) || 0;
        const total = qtd * preco;
        const tipo  = linha.dataset.tipo;
        if (tipo === 'mao_obra')  maoObra   += total;
        else if (tipo === 'material') materiais += total;
        else outros += total;
    });

    const semIva  = maoObra + materiais + outros;
    const iva     = semIva * (parseFloat(document.getElementById('orcIva')?.value || 23) / 100);
    const comIva  = semIva + iva;

    const fmt = v => v.toFixed(2) + ' €';
    document.getElementById('totalMaoObra').textContent  = fmt(maoObra);
    document.getElementById('totalMateriais').textContent= fmt(materiais);
    document.getElementById('totalOutros').textContent   = fmt(outros);
    document.getElementById('totalSemIva').textContent   = fmt(semIva);
    document.getElementById('totalIva').textContent      = fmt(iva);
    document.getElementById('totalComIva').textContent   = fmt(comIva);
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
            if (!desc) continue;
            linhasPayload.push({
                orcamento_id: orcId, categoria_id: catId,
                tipo: l.dataset.tipo, descricao: desc,
                unidade: l.querySelector('[data-field="unidade"]')?.value || 'vg',
                quantidade: qtd, preco_unitario: pu, ordem: j
            });
        }
        if (linhasPayload.length) await SB.from('orcamento_linhas').insert(linhasPayload);
    }

    msg.textContent = '✓ Orçamento guardado!'; msg.style.color='var(--color-ok)';
    await carregarOrcamentos();

    if (estado === 'enviado') {
        setTimeout(() => exportarPDFOrcamento(orcId), 500);
    } else {
        setTimeout(fecharModalOrcamento, 1200);
    }
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
function initConfig() {
    const area = document.getElementById('configTOCArea');
    if (area) area.innerHTML = renderPainelTOC();

    // Definir datas default do sync (mês actual)
    const hoje = new Date();
    const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
    const fim    = hoje.toISOString().split('T')[0];
    const elI = document.getElementById('tocSyncInicio');
    const elF = document.getElementById('tocSyncFim');
    if (elI && !elI.value) elI.value = inicio;
    if (elF && !elF.value) elF.value = fim;
}

function abrirSyncTOC() {
    // Atalho — vai para a tab config
    abrirTab('config');
}

async function executarSyncTOC() {
    const inicio = document.getElementById('tocSyncInicio')?.value;
    const fim    = document.getElementById('tocSyncFim')?.value;
    const status = document.getElementById('tocSyncStatusConfig');
    if (!inicio || !fim) {
        if (status) { status.textContent = 'Define as datas antes de sincronizar.'; status.style.color = 'var(--color-err)'; }
        return;
    }
    if (status) status.textContent = '';
    // Usar o status do fluxo de caixa durante o sync
    const tocStatus = document.getElementById('tocSyncStatus');
    await tocSincronizarFluxo(inicio, fim);
    // Copiar resultado para o status local
    if (status && tocStatus) { status.textContent = tocStatus.textContent; status.style.color = tocStatus.style.color; }
}

// Auto-complete nos orçamentos: activar quando o modal abre
const _origAbrirModal = abrirModalOrcamento;
abrirModalOrcamento = async function(id) {
    await _origAbrirModal(id);
    setTimeout(iniciarAutoCompleteClientes, 200);
};

// =======================================================
// INTEGRAÇÃO TOC ONLINE — UI do admin
// =======================================================

function abrirSettingsTOC() {
    // Pré-preencher com valores guardados
    const cfg = JSON.parse(localStorage.getItem('toc_config') || '{}');
    document.getElementById('tocClientId').value     = cfg.clientId  || '';
    document.getElementById('tocClientSecret').value = cfg.clientSecret || '';
    document.getElementById('tocOauthUrl').value     = cfg.oauthUrl  || 'https://app35.toconline.pt/oauth';
    document.getElementById('tocApiBase').value      = cfg.apiBase   || 'https://api35.toconline.pt';

    // Mês actual
    const agora = new Date();
    document.getElementById('tocSincMes').value =
        `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;

    document.getElementById('tocMsg').textContent     = '';
    document.getElementById('tocSincMsg').textContent = '';
    document.getElementById('modalTOC').classList.remove('hidden');
}

function fecharModalTOC() {
    document.getElementById('modalTOC').classList.add('hidden');
    document.getElementById('tocMsg').textContent     = '';
    document.getElementById('tocSincMsg').textContent = '';
}

function guardarConfigTOC() {
    const cfg = {
        clientId:     document.getElementById('tocClientId').value.trim(),
        clientSecret: document.getElementById('tocClientSecret').value.trim(),
        oauthUrl:     document.getElementById('tocOauthUrl').value.trim(),
        apiBase:      document.getElementById('tocApiBase').value.trim(),
    };
    TOC.guardarConfig(cfg);
    const msg = document.getElementById('tocMsg');
    msg.textContent = '✓ Configuração guardada.';
    msg.style.color = 'var(--color-ok)';
    actualizarEstadoTOC();
}

function actualizarEstadoTOC() {
    const dot = document.getElementById('tocStatusDot');
    if (!dot) return;
    dot.style.background = TOC.estaConfigurado() ? '#4caf7d' : '#ccc';
}

async function testarConexaoTOC() {
    const msg = document.getElementById('tocMsg');
    msg.textContent = 'A testar…'; msg.style.color = '';
    try {
        const clientes = await TOC.listarClientes();
        msg.textContent = `✓ Ligação OK — ${clientes.length} clientes encontrados.`;
        msg.style.color = 'var(--color-ok)';
        actualizarEstadoTOC();
    } catch(e) {
        if (e.message.includes('fetch') || e.message.includes('CORS')) {
            msg.textContent = '✗ CORS: a API do TOC Online não permite pedidos directos do browser. Necessário proxy ou integração server-side.';
        } else {
            msg.textContent = '✗ Erro: ' + e.message;
        }
        msg.style.color = 'var(--color-err)';
    }
}

async function sincronizarTOC() {
    const msg = document.getElementById('tocSincMsg');
    const mesVal = document.getElementById('tocSincMes').value;
    if (!mesVal) { msg.textContent = 'Selecciona um mês.'; return; }
    const [ano, mes] = mesVal.split('-').map(Number);
    msg.textContent = `A importar ${mes}/${ano}…`; msg.style.color = '';
    try {
        const r = await TOC.sincronizarMes(ano, mes);
        msg.textContent = `✓ ${r.importados} movimentos importados (${r.entradas} entradas, ${r.saidas} saídas).`;
        msg.style.color = 'var(--color-ok)';
        // Actualizar fluxo de caixa se estiver na tab
        if (document.getElementById('tab-fluxo')?.classList.contains('active')) initFluxo();
    } catch(e) {
        msg.textContent = '✗ ' + e.message;
        msg.style.color = 'var(--color-err)';
    }
}

async function importarClientesTOC() {
    const msg = document.getElementById('tocSincMsg');
    msg.textContent = 'A importar clientes…'; msg.style.color = '';
    try {
        const clientes = await TOC.listarClientes();
        // Guardar na tabela clientes_toc do Supabase (ou usar como cache local)
        localStorage.setItem('toc_clientes', JSON.stringify(clientes));
        msg.textContent = `✓ ${clientes.length} clientes importados e disponíveis nos orçamentos.`;
        msg.style.color = 'var(--color-ok)';
    } catch(e) {
        msg.textContent = '✗ ' + e.message;
        msg.style.color = 'var(--color-err)';
    }
}

async function importarFornecedoresTOC() {
    const msg = document.getElementById('tocSincMsg');
    msg.textContent = 'A importar fornecedores…'; msg.style.color = '';
    try {
        const forns = await TOC.listarFornecedores();
        // Actualizar tabela fornecedores no Supabase
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

// Actualizar estado do botão TOC ao carregar
window.addEventListener("load", () => {
    setTimeout(actualizarEstadoTOC, 500);
});



// =======================================================
// INTEGRAÇÃO TOC ONLINE — UI do admin (fluxo OAuth2 correcto)
// =======================================================

function actualizarEstadoTOC() {
    const dot = document.getElementById('tocStatusDot');
    if (!dot) return;
    // Verde se autenticado, amarelo se configurado mas não autenticado, cinzento se não configurado
    if (TOC.estaAutenticado()) {
        dot.style.background = '#4caf7d';
        dot.title = 'TOC Online ligado';
    } else {
        dot.style.background = '#f4b942';
        dot.title = 'TOC Online não autenticado';
    }
}

function abrirSettingsTOC() {
    // Pré-preencher credenciais guardadas
    const cfg = JSON.parse(localStorage.getItem('toc_config') || '{}');
    const elId = document.getElementById('tocClientId');
    const elOu = document.getElementById('tocOauthUrl');
    if (elId) elId.value = cfg.clientId  || '';
    if (elOu) elOu.value = cfg.oauthUrl  || 'https://app35.toconline.pt/oauth';

    const agora = new Date();
    document.getElementById('tocSincMes').value =
        `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;
    document.getElementById('tocMsg').textContent     = '';
    document.getElementById('tocSincMsg').textContent = '';
    actualizarEstadoTOC();
    document.getElementById('modalTOC').classList.remove('hidden');
}

function guardarConfigTOC() {
    const cfg = {
        clientId: (document.getElementById('tocClientId')?.value || '').trim(),
        oauthUrl: (document.getElementById('tocOauthUrl')?.value || 'https://app35.toconline.pt/oauth').trim(),
    };
    localStorage.setItem('toc_config', JSON.stringify(cfg));
    const msg = document.getElementById('tocMsg');
    msg.textContent = '✓ Credenciais guardadas. Agora clica em "Autorizar TOC Online".';
    msg.style.color = 'var(--color-ok)';
}

function fecharModalTOC() {
    document.getElementById('modalTOC').classList.add('hidden');
    document.getElementById('tocMsg').textContent     = '';
    document.getElementById('tocSincMsg').textContent = '';
}


function desligarTOC() {
    TOC.desligar();
    actualizarEstadoTOC();
    const msg = document.getElementById('tocMsg');
    msg.textContent = 'Desligado do TOC Online.'; msg.style.color = 'var(--text-muted)';
}

async function testarConexaoTOC() {
    const msg = document.getElementById('tocMsg');
    msg.textContent = 'A testar…'; msg.style.color = '';
    try {
        const clientes = await TOC.listarClientes();
        msg.textContent = `✓ Ligação OK — ${clientes.length} clientes encontrados.`;
        msg.style.color = 'var(--color-ok)';
        actualizarEstadoTOC();
    } catch(e) {
        msg.textContent = '✗ ' + e.message;
        msg.style.color = 'var(--color-err)';
    }
}

async function sincronizarTOC() {
    const msg = document.getElementById('tocSincMsg');
    const mesVal = document.getElementById('tocSincMes').value;
    if (!mesVal) { msg.textContent = 'Selecciona um mês.'; return; }
    const [ano, mes] = mesVal.split('-').map(Number);
    msg.textContent = `A importar ${mes}/${ano}…`; msg.style.color = '';
    try {
        const r = await TOC.sincronizarMes(ano, mes);
        msg.textContent = `✓ ${r.importados} movimentos importados (${r.entradas} entradas, ${r.saidas} saídas).`;
        msg.style.color = 'var(--color-ok)';
        if (document.getElementById('tab-fluxo')?.classList.contains('active')) initFluxo();
    } catch(e) {
        msg.textContent = '✗ ' + e.message;
        msg.style.color = 'var(--color-err)';
    }
}

async function importarClientesTOC() {
    const msg = document.getElementById('tocSincMsg');
    msg.textContent = 'A importar clientes…'; msg.style.color = '';
    try {
        const clientes = await TOC.listarClientes();
        localStorage.setItem('toc_clientes', JSON.stringify(clientes));
        msg.textContent = `✓ ${clientes.length} clientes importados.`;
        msg.style.color = 'var(--color-ok)';
    } catch(e) {
        msg.textContent = '✗ ' + e.message;
        msg.style.color = 'var(--color-err)';
    }
}

async function importarFornecedoresTOC() {
    const msg = document.getElementById('tocSincMsg');
    msg.textContent = 'A importar fornecedores…'; msg.style.color = '';
    try {
        const forns = await TOC.listarFornecedores();
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
// autorizarTOC — versão definitiva (usa Edge Function para obter URL)
// =======================================================
function autorizarTOC() {
    const msg = document.getElementById('tocMsg');
    if (msg) { msg.textContent = 'A conectar ao TOC Online…'; msg.style.color = ''; }

    fetch('https://npyosbigynxmxdakcymg.supabase.co/functions/v1/toc-proxy?action=auth_url')
    .then(r => r.json())
    .then(d => {
        if (d.auth_url) {
            sessionStorage.setItem('toc_return_url', window.location.href.split('#')[0]);
            window.location.href = d.auth_url;
        } else {
            if (msg) { msg.textContent = '✗ Erro: ' + JSON.stringify(d); msg.style.color = 'var(--color-err)'; }
        }
    })
    .catch(e => {
        if (msg) { msg.textContent = '✗ ' + e.message; msg.style.color = 'var(--color-err)'; }
    });
}
