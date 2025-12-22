// -------------------------------------------------------
// Supabase
// -------------------------------------------------------

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let tabela;

async function validarPIN() {
    if (pinInput.value !== "1810") {
        pinMsg.textContent = "PIN incorreto";
        return;
    }
    loginBox.classList.add("hidden");
    adminArea.classList.remove("hidden");
    await carregarFiltros();
    await carregarMetricas();
    await carregarTabela();
}

async function carregarFiltros() {
    filtroFunc.innerHTML = "<option value=''>Todos</option>";
    filtroObra.innerHTML = "<option value=''>Todas</option>";

    const { data: f } = await SB.from("funcionarios").select("*").order("nome");
    const { data: o } = await SB.from("obras").select("*").order("nome");

    f?.forEach(x => filtroFunc.innerHTML += `<option value="${x.id}">${x.nome}</option>`);
    o?.forEach(x => filtroObra.innerHTML += `<option value="${x.id}">${x.nome}</option>`);
}

async function carregarTabela() {
    if (tabela) tabela.destroy();
    const { data } = await SB.from("vw_registos_ponto").select("*");

    tabela = $("#tabelaRegistos").DataTable({
        data,
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

async function carregarMetricas() {
    const { data } = await SB.rpc("get_metrica_admin");
    mHorasHoje.textContent = data.horas_hoje;
    mHorasSemana.textContent = data.horas_semana;
    mHorasMes.textContent = data.horas_mes;
}

function aplicarFiltros() { carregarTabela(); }
function limparFiltros() {
    filtroFunc.value = "";
    filtroObra.value = "";
    carregarTabela();
}
