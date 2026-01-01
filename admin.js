// =======================================================
// SUPABASE (CHAVE CORRETA)
// =======================================================
const SB = supabase.createClient(
  "https://npyosbigynxmxdakcymg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M"
);

const PIN_ADMIN = "1810";

// =======================================================
// LOGIN
// =======================================================
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("pinInput").focus();
});

function validarPIN() {
    const pin = document.getElementById("pinInput").value.trim();
    const msg = document.getElementById("pinMsg");

    if (pin !== PIN_ADMIN) {
        msg.textContent = "PIN incorreto";
        return;
    }

    msg.textContent = "";
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");

    inicializarPainel();
}

// ENTER no PIN
document.addEventListener("keydown", e => {
    if (e.key === "Enter") validarPIN();
});

// =======================================================
// PAINEL
// =======================================================
function inicializarPainel() {
    ativarTabs();
    abrirTab("financeiro");
}

// =======================================================
// TABS
// =======================================================
function ativarTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
        btn.onclick = () => abrirTab(btn.dataset.tab);
    });
}

function abrirTab(nome) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    document.querySelector(`.tab[data-tab="${nome}"]`).classList.add("active");
    document.getElementById("tab-" + nome).classList.add("active");

    if (nome === "financeiro") carregarFinanceiro();
    if (nome === "registos") carregarRegistos();
}

// =======================================================
// FINANCEIRO
// =======================================================
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
            </tr>
        `;
    });
}

// =======================================================
// REGISTOS (RENDER DIRETO)
// =======================================================
async function carregarRegistos() {
    try {
        const table = document.getElementById("tabelaRegistos");
        let tbody = table.querySelector("tbody");

        if (!tbody) {
            tbody = document.createElement("tbody");
            table.appendChild(tbody);
        }

        tbody.innerHTML = "";

        const { data, error } = await SB
            .from("vw_registos_ponto")
            .select("*");

        if (error) {
            console.error("ERRO SUPABASE REAL:", error);
            alert(
              "Erro Supabase:\n" +
              error.message +
              (error.details ? "\n" + error.details : "")
            );
            return;
        }

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7">Sem registos</td></tr>`;
            return;
        }

        data.forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.funcionario}</td>
                <td>${r.obra}</td>
                <td>${r.dia}</td>
                <td>${r.entrada}</td>
                <td>${r.saida}</td>
                <td>${r.horas}</td>
                <td>${r.estado}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("ERRO JS:", e);
        alert("Erro JavaScript ao carregar tabela");
    }
}
