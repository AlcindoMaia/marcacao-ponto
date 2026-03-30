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
window.addEventListener("DOMContentLoaded", async () => {
    ligarEventosGlobais();

    // Verificar se já há sessão activa
    const { data: { session } } = await SB.auth.getSession();
    if (session) {
        mostrarPainel();
        return;
    }

    // Mostrar form de login
    document.getElementById("loginBox").classList.remove("hidden");
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
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");
    inicializarPainel();
}

// =======================================================
// INICIALIZAÇÃO / TABS
// =======================================================
function inicializarPainel() {
    ativarTabs();
    abrirTab("fluxo");
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
}

// =======================================================
// FINANCEIRO
// =======================================================
async function carregarFinanceiro() {
    // Determinar mês a consultar (filtro ou mês actual)
    const filtroEl = document.getElementById("filtroMesFinanceiro");
    const hoje     = new Date();
    const anoMes   = filtroEl?.value || `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}`;
    const [ano, mes] = anoMes.split("-").map(Number);
    const inicio = `${ano}-${String(mes).padStart(2,"0")}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fim    = `${ano}-${String(mes).padStart(2,"0")}-${ultimoDia}`;

    // Buscar registos de ponto do mês seleccionado
    const { data: registos } = await SB.from("vw_registos_ponto").select("*")
        .gte("dia", inicio).lte("dia", fim);

    const tbody = document.querySelector("#tabelaFinanceira tbody");
    if (!tbody) return;

    // Buscar funcionários com valor_dia
    const { data: funcs } = await SB.from("funcionarios")
        .select("id, nome, valor_dia, ativo").eq("ativo", true);

    if (!registos || !funcs) { tbody.innerHTML = ""; return; }

    // Agrupar por funcionário
    const porFunc = {};
    registos.forEach(r => {
        if (!r.funcionario) return;
        if (!porFunc[r.funcionario]) porFunc[r.funcionario] = { horas: 0, dias: 0 };
        // Converter horas HH:MM → decimal, descontando 1h de almoço por dia
        let h = 0;
        if (r.horas && typeof r.horas === "string" && r.horas.includes(":")) {
            const [hh, mm] = r.horas.split(":").map(Number);
            h = hh + mm / 60;
        } else {
            h = Number(r.horas) || 0;
        }
        // Desconto de 1h de almoço por dia com registo de saída
        if (h > 0) h = Math.max(0, h - 1);
        porFunc[r.funcionario].horas += h;
        porFunc[r.funcionario].dias  += 1;
    });

    // KPIs totais
    let totalHoras = 0, totalDias = 0, totalPagar = 0;

    tbody.innerHTML = "";
    funcs.forEach(f => {
        const dados = porFunc[f.nome];
        if (!dados) return;
        const horas = dados.horas;
        const dias  = dados.dias;
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

    // Actualizar KPIs
    const kpiFEl = document.getElementById("kpiFuncionarios");
    const kpiHEl = document.getElementById("kpiHoras");
    const kpiDEl = document.getElementById("kpiDias");
    const kpiTEl = document.getElementById("kpiTotal");
    if (kpiFEl) kpiFEl.textContent = funcs.filter(f => porFunc[f.nome]).length;
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
    title.textContent = currentDate.toLocaleString("pt-PT", { month: "long", year: "numeric" });
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

    const fmt = v => v ? v.substring(11, 16) : "";

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
    tdEditado.style.setProperty("background", "rgba(244,185,66,0.18)", "important");
    tdEditado.style.setProperty("color", "#f4b942", "important");
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
        const data_reg = f.created_at ? new Date(f.created_at).toLocaleDateString("pt-PT") : "—";
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
    const url = `https://alcindomaia.github.io/marcacao-ponto/?obra=${obra.id}`;
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
    const { data, error } = await SB.from("vw_stock_atual").select("*").order("descricao");
    const tbody = document.querySelector("#tabelaArtigos tbody");
    if (!tbody) return;
    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#ff7a7a">Erro: ${error.message}</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;opacity:.6">Sem artigos. Clique + para adicionar.</td></tr>`;
        return;
    }
    data.forEach(a => {
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
