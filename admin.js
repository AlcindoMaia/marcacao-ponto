// -------------------------------------------------------
// Supabase
// -------------------------------------------------------

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let tabela = null;

// -------------------------------------------------------
// LOGIN
// -------------------------------------------------------
async function validarPIN() {
    const pin = document.getElementById("pinInput").value.trim();
    const msg = document.getElementById("pinMsg");

    if (pin !== "1810") {
        msg.textContent = "PIN incorreto";
        return;
    }

    msg.textContent = "";

    // Guardar sessão
    localStorage.setItem("admin_autenticado", "1");

    entrarAdmin();
}

// Login automático se já autenticado
document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem("admin_autenticado") === "1") {
        entrarAdmin();
    }
});

// ENTER no input PIN
document.addEventListener("DOMContentLoaded", () => {
    const pinInput = document.getElementById("pinInput");
    if (pinInput) {
        pinInput.addEventListener("keydown", e => {
            if (e.key === "Enter") validarPIN();
        });
    }
});

async function entrarAdmin() {
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");

    await carregarFiltros();
    await carregarMetricas();
    await carregarTabela();

    // GARANTIA de carga financeira
    ativarTab("financeiro");
}

// -------------------------------------------------------
// FILTROS
// -------------------------------------------------------
async function carregarFiltros() {
    const selFunc = document.getElementById("filtroFunc");
    const selObra = document.getElementById("filtroObra");

    selFunc.innerHTML = "<option value=''>Todos</option>";
    selObra.innerHTML = "<option value=''>Todas</option>";

    const { data: funcs } = await SB.from("funcionarios").select("*").order("nome");
    const { data: obras } = await SB.from("obras").select("*").order("nome");

    funcs?.forEach(f => {
        selFunc.innerHTML += `<option value="${f.id}">${f.nome}</option>`;
    });

    obras?.forEach(o => {
        selObra.innerHTML += `<option value="${o.id}">${o.nome}</option>`;
    });
}

// -------------------------------------------------------
// TABELA REGISTOS
// -------------------------------------------------------
async function carregarTabela() {

    if (tabela) {
        tabela.destroy();
        tabela = null;
    }

    const { data } = await SB.from("vw_registos_ponto").select("*");

    tabela = $("#tabelaRegistos").DataTable({
        data: data || [],
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
}

// -------------------------------------------------------
// MÉTRICAS OPERACIONAIS
// -------------------------------------------------------
async function carregarMetricas() {
    const { data, error } = await SB.rpc("get_metrica_admin");

    if (error || !data || data.length === 0) {
        document.getElementById("mHorasHoje").textContent = "00:00";
        document.getElementById("mHorasSemana").textContent = "00:00";
        document.getElementById("mHorasMes").textContent = "00:00";
        return;
    }

    const m = data[0];

    document.getElementById("mHorasHoje").textContent = m.horas_hoje || "00:00";
    document.getElementById("mHorasSemana").textContent = m.horas_semana || "00:00";
    document.getElementById("mHorasMes").textContent = m.horas_mes || "00:00";
}

// -------------------------------------------------------
// AÇÕES
// -------------------------------------------------------
function aplicarFiltros() {
    carregarTabela();
}

function limparFiltros() {
    document.getElementById("filtroFunc").value = "";
    document.getElementById("filtroObra").value = "";
    carregarTabela();
}

// =======================================================
// FINANCEIRO
// =======================================================

async function carregarKPIsFinanceiros() {
    const { data, error } = await SB
        .from("vw_kpis_financeiros_mes")
        .select("*")
        .single();

    if (error || !data) {
        console.error("Erro KPIs financeiros:", error);
        return;
    }

    document.getElementById("kpiFuncionarios").textContent = data.total_funcionarios;
    document.getElementById("kpiHoras").textContent = data.total_horas_mes;
    document.getElementById("kpiDias").textContent = data.total_dias_trabalhados;
    document.getElementById("kpiDiasIncompletos").textContent = data.total_dias_nao_completos;
    document.getElementById("kpiTotal").textContent =
        Number(data.total_a_pagar || 0).toFixed(2) + " €";
}

async function carregarTabelaFinanceira() {

    const tbody = document.querySelector("#tabelaFinanceira tbody");
    tbody.innerHTML = "";

    const { data, error } = await SB
        .from("vw_dashboard_mes_atual")
        .select("*")
        .order("valor_a_receber", { ascending: false });

    if (error || !data) {
        console.error("Erro tabela financeira:", error);
        return;
    }

    data.forEach(r => {
        const tr = document.createElement("tr");

        if (r.dias_nao_completos > 0) {
            tr.style.backgroundColor = "#402";
        }

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

// -------------------------------------------------------
// TABS
// -------------------------------------------------------
function ativarTab(nome) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    const tabBtn = document.querySelector(`.tab[data-tab="${nome}"]`);
    const tabDiv = document.getElementById("tab-" + nome);

    if (!tabBtn || !tabDiv) return;

    tabBtn.classList.add("active");
    tabDiv.classList.add("active");

    if (nome === "financeiro") {
        carregarKPIsFinanceiros();
        carregarTabelaFinanceira();
    }
}

document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
        ativarTab(tab.dataset.tab);
    });
});
