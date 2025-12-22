// -------------------------------------------------------
// Supabase
// -------------------------------------------------------

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("loginBox").classList.remove("hidden");
});

// -------------------------------------------------------
// Login
// -------------------------------------------------------

async function validarPIN() {
    const pin = document.getElementById("pinInput").value.trim();

    if (pin !== "1810") {
        document.getElementById("pinMsg").textContent = "PIN incorreto";
        return;
    }

    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");

    await carregarFiltros();
    await carregarMetricas();
    await carregarTabela();
}

// -------------------------------------------------------
// Filtros
// -------------------------------------------------------

async function carregarFiltros() {
    const selFunc = document.getElementById("filtroFunc");
    const selObra = document.getElementById("filtroObra");

    selFunc.innerHTML = "<option value=''>Todos</option>";
    selObra.innerHTML = "<option value=''>Todas</option>";

    const { data: funcs } = await SB.from("funcionarios").select("*").order("nome");
    const { data: obras } = await SB.from("obras").select("*").order("nome");

    if (funcs) funcs.forEach(f => selFunc.innerHTML += `<option value="${f.id}">${f.nome}</option>`);
    if (obras) obras.forEach(o => selObra.innerHTML += `<option value="${o.id}">${o.nome}</option>`);
}

// -------------------------------------------------------
// Tabela (DataTables)
// -------------------------------------------------------

let tabela = null;

async function carregarTabela() {

    if (tabela) tabela.destroy();

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
        ]
    });
}

// -------------------------------------------------------
// Métricas
// -------------------------------------------------------

async function carregarMetricas() {
    const { data } = await SB.rpc("get_metrica_admin");

    if (!data) return;

    document.getElementById("mHorasHoje").textContent = data.horas_hoje || "00:00";
    document.getElementById("mHorasSemana").textContent = data.horas_semana || "00:00";
    document.getElementById("mHorasMes").textContent = data.horas_mes || "00:00";
}

// -------------------------------------------------------
// Filtros
// -------------------------------------------------------

function aplicarFiltros() {
    carregarTabela();
}

function limparFiltros() {
    document.getElementById("filtroFunc").value = "";
    document.getElementById("filtroObra").value = "";
    carregarTabela();
}
