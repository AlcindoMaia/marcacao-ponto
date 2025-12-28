// -------------------------------------------------------
// SUPABASE
// -------------------------------------------------------
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PIN_ADMIN = "1810";
let tabela = null;

// -------------------------------------------------------
// BOOT
// -------------------------------------------------------
window.addEventListener("load", () => {
    if (localStorage.getItem("admin_auth") === "1") {
        entrarAdmin();
    }

    const pinInput = document.getElementById("pinInput");
    if (pinInput) {
        pinInput.addEventListener("keydown", e => {
            if (e.key === "Enter") validarPIN();
        });
    }
});

// -------------------------------------------------------
// LOGIN
// -------------------------------------------------------
function validarPIN() {
    const pin = document.getElementById("pinInput").value.trim();
    const msg = document.getElementById("pinMsg");

    if (pin !== PIN_ADMIN) {
        msg.textContent = "PIN incorreto";
        return;
    }

    msg.textContent = "";
    localStorage.setItem("admin_auth", "1");
    entrarAdmin();
}

async function entrarAdmin() {
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");

    await carregarFiltros();
    await carregarMetricas();
    await carregarTabela();

    // 🔥 FINANCEIRO CARREGA SEM TAB
    await carregarKPIsFinanceiros();
    await carregarTabelaFinanceira();

    // ativar tab visual
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

    funcs?.forEach(f => selFunc.innerHTML += `<option value="${f.id}">${f.nome}</option>`);
    obras?.forEach(o => selObra.innerHTML += `<option value="${o.id}">${o.nome}</option>`);
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
    const { data } = await SB.rpc("get_metrica_admin");

    if (!data || !data.length) return;

    const m = data[0];
    mHorasHoje.textContent = m.horas_hoje || "00:00";
    mHorasSemana.textContent = m.horas_semana || "00:00";
    mHorasMes.textContent = m.horas_mes || "00:00";
}

// -------------------------------------------------------
// FINANCEIRO
// -------------------------------------------------------
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

// -------------------------------------------------------
// TABS (VISUAL)
// -------------------------------------------------------
function ativarTab(nome) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    const btn = document.querySelector(`.tab[data-tab="${nome}"]`);
    const div = document.getElementById("tab-" + nome);

    if (btn && div) {
        btn.classList.add("active");
        div.classList.add("active");
    }
}
