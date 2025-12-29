// SUPABASE
const SB = supabase.createClient(
  "https://npyosbigynxmxdakcymg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M"
);

const PIN = "1810";
let tabelaRegistos = null;

// LOGIN
function validarPIN() {
    if (pinInput.value !== PIN) {
        pinMsg.textContent = "PIN incorreto";
        return;
    }
    loginBox.classList.add("hidden");
    adminArea.classList.remove("hidden");
    initTabs();
    carregarFinanceiro();
}

// TABS
function initTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById("tab-" + btn.dataset.tab).classList.add("active");

            if (btn.dataset.tab === "registos") carregarRegistos();
            if (btn.dataset.tab === "financeiro") carregarFinanceiro();
        };
    });
}

// FINANCEIRO
async function carregarFinanceiro() {
    const { data } = await SB.from("vw_kpis_financeiros_mes").select("*").single();
    if (!data) return;

    kpiFuncionarios.textContent = data.total_funcionarios;
    kpiHoras.textContent = data.total_horas_mes;
    kpiDias.textContent = data.total_dias_trabalhados;
    kpiDiasIncompletos.textContent = data.total_dias_nao_completos;
    kpiTotal.textContent = Number(data.total_a_pagar).toFixed(2) + " €";

    const { data: linhas } = await SB.from("vw_dashboard_mes_atual").select("*");
    const tbody = document.querySelector("#tabelaFinanceira tbody");
    tbody.innerHTML = "";

    linhas?.forEach(r => {
        tbody.innerHTML += `
            <tr>
                <td>${r.funcionario}</td>
                <td>${r.horas_trabalhadas}</td>
                <td>${r.dias_trabalhados}</td>
                <td>${r.dias_nao_completos}</td>
                <td>${Number(r.valor_a_receber).toFixed(2)} €</td>
            </tr>`;
    });
}

// REGISTOS
async function carregarRegistos() {
    if (tabelaRegistos) return;

    const { data } = await SB.from("vw_registos_ponto").select("*");

    tabelaRegistos = $("#tabelaRegistos").DataTable({
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
        order: [[2, "desc"]]
    });
}
