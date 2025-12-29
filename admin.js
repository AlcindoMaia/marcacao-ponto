// =======================================================
// SUPABASE
// =======================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PIN_ADMIN = "1810";
const SESSION_TIMEOUT = 30 * 60 * 1000;

let tabela = null;
let inactivityTimer = null;

// =======================================================
// BOOT
// =======================================================
window.addEventListener("load", () => {
    restaurarSessao();
    prepararEventosGlobais();
});

// =======================================================
// LOGIN
// =======================================================
function validarPIN() {
    const pin = document.getElementById("pinInput").value.trim();
    const msg = document.getElementById("pinMsg");

    if (pin !== PIN_ADMIN) {
        msg.textContent = "PIN incorreto";
        return;
    }

    msg.textContent = "";
    localStorage.setItem("admin_auth", "1");
    localStorage.setItem("admin_last", Date.now());

    entrarAdmin();
}

function entrarAdmin() {
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");

    // 🔥 AGORA as tabs EXISTEM — ligar eventos aqui
    document.querySelectorAll(".tab").forEach(tab => {
        tab.onclick = () => mostrarTab(tab.dataset.tab);
    });

    carregarTudo();
    mostrarTab("financeiro");
}

function sairAdmin() {
    localStorage.clear();
    location.reload();
}

function restaurarSessao() {
    const auth = localStorage.getItem("admin_auth");
    const last = Number(localStorage.getItem("admin_last") || 0);

    if (auth === "1" && Date.now() - last < SESSION_TIMEOUT) {
        entrarAdmin();
    }
}

// ENTER no PIN
document.addEventListener("keydown", e => {
    if (e.key === "Enter" && !document.getElementById("loginBox").classList.contains("hidden")) {
        validarPIN();
    }
});

// =======================================================
// INATIVIDADE
// =======================================================
function resetInactivity() {
    clearTimeout(inactivityTimer);
    localStorage.setItem("admin_last", Date.now());

    inactivityTimer = setTimeout(() => {
        alert("Sessão expirada por inatividade.");
        sairAdmin();
    }, SESSION_TIMEOUT);
}

function prepararEventosGlobais() {
    ["click", "mousemove", "keydown", "scroll", "touchstart"].forEach(evt => {
        document.addEventListener(evt, resetInactivity);
    });
}

// =======================================================
// TABS
// =======================================================
function mostrarTab(nome) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => {
        c.style.position = "absolute";
        c.style.visibility = "hidden";
        c.style.left = "-9999px";
    });

    const tabBtn = document.querySelector(`.tab[data-tab="${nome}"]`);
    const tabDiv = document.getElementById("tab-" + nome);

    if (!tabBtn || !tabDiv) return;

    tabBtn.classList.add("active");
    tabDiv.style.position = "relative";
    tabDiv.style.visibility = "visible";
    tabDiv.style.left = "0";

    if (nome === "financeiro") {
        carregarKPIsFinanceiros();
        carregarTabelaFinanceira();
    }

    if (nome === "registos") {
        setTimeout(() => carregarTabela(), 50);
    }
}

// =======================================================
// CARREGAMENTO GLOBAL
// =======================================================
async function carregarTudo() {
    await carregarFiltros();
    await carregarMetricas();
    await carregarKPIsFinanceiros();
    await carregarTabelaFinanceira();
}

// =======================================================
// FILTROS
// =======================================================
async function carregarFiltros() {
    const selFunc = document.getElementById("filtroFunc");
    const selObra = document.getElementById("filtroObra");

    selFunc.innerHTML = "<option value=''>Todos</option>";
    selObra.innerHTML = "<option value=''>Todas</option>";

    const { data: funcs } = await SB.from("funcionarios").select("*").order("nome");
    const { data: obras } = await SB.from("obras").select("*").order("nome");

    funcs?.forEach(f => selFunc.innerHTML += `<option value="${f.id}">${f.nome}</option>`);
    obras?.forEach(o => selObra.innerHTML += `<option value="${o.id}">${o.nome}</option>`);
}

// =======================================================
// TABELA REGISTOS
// =======================================================
async function carregarTabela() {
    if (tabela) {
        tabela.destroy(true);
        tabela = null;
    }

    const { data } = await SB.from("vw_registos_ponto").select("*");

    tabela = $("#tabelaRegistos").DataTable({
        data: data || [],
        destroy: true,
        deferRender: true,
        autoWidth: false,
        columns: [
            { data: "funcionario" },
            { data: "obra" },
            { data: "dia" },
            { data: "entrada" },
            { data: "saida" },
            { data: "horas" },
            { data: "estado" }
        ],
        order: [[2, "desc"]],
        pageLength: 10
    });

    setTimeout(() => tabela.columns.adjust().draw(false), 100);
}

// =======================================================
// MÉTRICAS
// =======================================================
async function carregarMetricas() {
    const { data } = await SB.rpc("get_metrica_admin");
    if (!data || !data.length) return;

    const m = data[0];
    mHorasHoje.textContent = m.horas_hoje || "00:00";
    mHorasSemana.textContent = m.horas_semana || "00:00";
    mHorasMes.textContent = m.horas_mes || "00:00";
}

// =======================================================
// FINANCEIRO
// =======================================================
async function carregarKPIsFinanceiros() {
    const { data } = await SB.from("vw_kpis_financeiros_mes").select("*").single();
    if (!data) return;

    kpiFuncionarios.textContent = data.total_funcionarios;
    kpiHoras.textContent = data.total_horas_mes;
    kpiDias.textContent = data.total_dias_trabalhados;
    kpiDiasIncompletos.textContent = data.total_dias_nao_completos;
    kpiTotal.textContent = Number(data.total_a_pagar).toFixed(2) + " €";
}

async function carregarTabelaFinanceira() {
    const tbody = document.querySelector("#tabelaFinanceira tbody");
    tbody.innerHTML = "";

    const { data } = await SB
        .from("vw_dashboard_mes_atual")
        .select("*")
        .order("valor_a_receber", { ascending: false });

    data?.forEach(r => {
        const tr = document.createElement("tr");
        if (r.dias_nao_completos > 0) tr.style.background = "#402";

        tr.innerHTML = `
            <td>${r.funcionario}</td>
            <td>${r.horas_trabalhadas}</td>
            <td>${r.dias_trabalhados}</td>
            <td>${r.dias_nao_completos}</td>
            <td>${Number(r.valor_a_receber).toFixed(2)} €</td>
        `;
        tbody.appendChild(tr);
    });
}
