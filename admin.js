// -------------------------------------------------------
// Supabase
// -------------------------------------------------------

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";
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

    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");

    await carregarFiltros();
    await carregarMetricas();
    await carregarTabela();
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
// TABELA
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
// MÉTRICAS (CORRIGIDO)
// -------------------------------------------------------
async function carregarMetricas() {
    const { data, error } = await SB.rpc("get_metrica_admin");

    if (error || !data || data.length === 0) {
        document.getElementById("mHorasHoje").textContent = "00:00";
        document.getElementById("mHorasSemana").textContent = "00:00";
        document.getElementById("mHorasMes").textContent = "00:00";
        return;
    }

    const m = data[0]; // ← RPC devolve array

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
