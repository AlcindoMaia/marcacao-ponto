// -------------------------------------------------------
// Supabase
// -------------------------------------------------------

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===== CONFIG ===== */
const PIN_ADMIN = "1810"; // <-- confirma se é este

/* ===== LOGIN ===== */
document.getElementById("btnLogin").addEventListener("click", () => {
  const pin = document.getElementById("pin").value.trim();

  if (pin !== PIN_ADMIN) {
    alert("PIN incorreto");
    return;
  }

  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("painelAdmin").classList.remove("hidden");

  ativarTab("financeiro");
  carregarFinanceiro();
});

/* ===== TABS ===== */
function ativarTab(nome) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  document.querySelector(`.tab[data-tab="${nome}"]`).classList.add("active");
  document.getElementById("tab-" + nome).classList.add("active");
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    ativarTab(tab.dataset.tab);
    if (tab.dataset.tab === "financeiro") carregarFinanceiro();
  });
});

/* ===== FINANCEIRO ===== */
async function carregarFinanceiro() {
  /* KPIs */
  const { data: kpi, error: kpiErr } = await supabase
    .from("vw_kpis_financeiros_mes")
    .select("*")
    .single();

  if (kpiErr) {
    console.error(kpiErr);
    alert("Erro ao carregar KPIs");
    return;
  }

  document.getElementById("kpiFuncionarios").textContent = kpi.total_funcionarios;
  document.getElementById("kpiHoras").textContent = kpi.total_horas_mes;
  document.getElementById("kpiDias").textContent = kpi.total_dias_trabalhados;
  document.getElementById("kpiDiasIncompletos").textContent = kpi.total_dias_nao_completos;
  document.getElementById("kpiTotal").textContent = kpi.total_a_pagar.toFixed(2) + " €";

  /* TABELA */
  const { data, error } = await supabase
    .from("vw_dashboard_mes_atual")
    .select("*")
    .order("valor_a_receber", { ascending: false });

  if (error) {
    console.error(error);
    alert("Erro ao carregar tabela financeira");
    return;
  }

  const tbody = document.querySelector("#tabelaFinanceira tbody");
  tbody.innerHTML = "";

  data.forEach(r => {
    const tr = document.createElement("tr");
    if (r.dias_nao_completos > 0) tr.style.background = "#402";

    tr.innerHTML = `
      <td>${r.funcionario}</td>
      <td>${r.horas_trabalhadas}</td>
      <td>${r.dias_trabalhados}</td>
      <td>${r.dias_nao_completos}</td>
      <td>${r.valor_a_receber.toFixed(2)} €</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ===== BOTÕES ===== */
document.getElementById("btnRefreshFinanceiro")
  .addEventListener("click", carregarFinanceiro);

document.getElementById("btnExportExcel")
  .addEventListener("click", () => {
    alert("Exportação Excel será implementada a seguir.");
  });
