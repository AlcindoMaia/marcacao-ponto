console.log("ADMIN.JS: ficheiro carregado");   // DEBUG 1

// -------------------------------------------------------
// 1. Inicializar Supabase
// -------------------------------------------------------

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("ADMIN.JS: Supabase inicializado");   // DEBUG 2


// -------------------------------------------------------
// 2. Mostrar Login ao carregar página
// -------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    console.log("ADMIN.JS: DOM carregado");      // DEBUG 3

    document.getElementById("loginBox").classList.remove("hidden");
});


// -------------------------------------------------------
// 3. Validar PIN
// -------------------------------------------------------

async function validarPIN() {
    console.log("ADMIN.JS: validarPIN chamado");  // DEBUG 4

    const pin = document.getElementById("pinInput").value.trim();

    if (pin !== "1810") {
        document.getElementById("pinMsg").textContent = "PIN incorreto";
        return;
    }

    console.log("ADMIN.JS: PIN correto");         // DEBUG 5

    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");

    await carregarFiltros();
    await carregarTabela();
    await carregarMetricas();
}


// -------------------------------------------------------
// 4. Carregar lista de Funcionários e Obras
// -------------------------------------------------------

async function carregarFiltros() {
    console.log("ADMIN.JS: carregarFiltros");     // DEBUG 6

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
// 5. Carregar tabela DataTables
// -------------------------------------------------------

let tabela = null;

async function carregarTabela() {
    console.log("ADMIN.JS: carregarTabela");       // DEBUG 7

    if (tabela) tabela.destroy();

    const { data } = await SB.from("vw_registos_ponto").select("*");

    console.log("ADMIN.JS: registos carregados:", data?.length); // DEBUG 8

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
// 6. Carregar métricas
// -------------------------------------------------------

async function carregarMetricas() {
    console.log("ADMIN.JS: carregarMetricas");     // DEBUG 9

    const { data } = await SB.rpc("get_metrica_admin");

    if (!data) return;

    document.getElementById("mHorasHoje").textContent = data.horas_hoje;
    document.getElementById("mHorasSemana").textContent = data.horas_semana;
    document.getElementById("mHorasMes").textContent = data.horas_mes;
}


// -------------------------------------------------------
// 7. Aplicar filtros
// -------------------------------------------------------

function aplicarFiltros() {
    carregarTabela();
}

function limparFiltros() {
    document.getElementById("filtroFunc").value = "";
    document.getElementById("filtroObra").value = "";
    carregarTabela();
}

