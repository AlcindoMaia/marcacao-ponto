// -------------------------------------------------------
// Supabase
// -------------------------------------------------------

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// LOGIN
document.getElementById("btnLogin").onclick = () => {
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("painelAdmin").classList.remove("hidden");
  carregarFinanceiro();
};

// TABS
document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");

    if (tab.dataset.tab === "financeiro") carregarFinanceiro();
  };
});

// FINANCEIRO
async function carregarFinanceiro() {

  // KPIs
  const { data: kpi } = await supabase
    .from("vw_kpis_financeiros_mes")
    .select("*")
    .single();

  if (kpi) {
    kpiFuncionarios.textContent = kpi.total_funcionarios;
    kpiHoras.textContent = kpi.total_horas_mes;
    kpiDias.textContent = kpi.total_dias_trabalhados;
    kpiDiasIncompletos.textContent = kpi.total_dias_nao_completos;
    kpiTotal.textContent = kpi.total_a_pagar.toFixed(2);
  }

  // TABELA
  const { data } = await supabase
    .from("vw_dashboard_mes_atual")
    .select("*")
    .order("valor_a_receber", { ascending: false });

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

// BOTÕES
btnRefreshFinanceiro.onclick = carregarFinanceiro;

btnExportExcel.onclick = () => {
  alert("Exportação Excel será adicionada na próxima fase.");
};
