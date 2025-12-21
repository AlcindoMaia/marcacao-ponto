// ===========================================
//  CONFIGURAÇÃO SUPABASE
// ===========================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_67e1zdXpV7_PXZ-0_ZmmSw__9ddgDKF";
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===========================================
//  DEVICE ID
// ===========================================
function getDeviceId() {
    let id = localStorage.getItem("deviceId");
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("deviceId", id);
    }
    return id;
}

const deviceId = getDeviceId();


// ===========================================
//  CHECK ADMIN
// ===========================================
async function verificarAdmin() {
    const { data, error } = await SB
        .from("admins")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();

    if (data) {
        abrirAdmin();
        return;
    }

    document.getElementById("loginBox").style.display = "block";
}

document.addEventListener("DOMContentLoaded", verificarAdmin);


// ===========================================
//  LOGIN VIA PIN
// ===========================================
async function validarPIN() {
    const pin = document.getElementById("pinInput").value.trim();

    if (pin !== "1810") {
        document.getElementById("pinMsg").textContent = "PIN incorreto.";
        return;
    }

    await SB.from("admins").insert({
        device_id: deviceId,
        nome: "Administrador"
    });

    abrirAdmin();
}

function abrirAdmin() {
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("adminArea").style.display = "block";
    carregarFiltros();
    carregarTabela();
    carregarMetricas();
}


// ===========================================
//  FILTROS
// ===========================================
async function carregarFiltros() {
    const fSel = document.getElementById("filtroFunc");
    const oSel = document.getElementById("filtroObra");

    const fData = await SB.from("funcionarios").select("id, nome").order("nome");
    fSel.innerHTML = `<option value="">(Todos)</option>` +
        fData.data.map(f => `<option value="${f.id}">${f.nome}</option>`).join("");

    const oData = await SB.from("obras").select("id, nome").order("nome");
    oSel.innerHTML = `<option value="">(Todas)</option>` +
        oData.data.map(o => `<option value="${o.id}">${o.nome}</option>`).join("");
}


// ===========================================
//  TABELA
// ===========================================
let tabela;

async function carregarTabela() {
    const { data } = await SB
        .from("vw_horas_detalhadas")
        .select("*");

    const processado = processarEntradasSaidas(data);
    montarDataTable(processado);
}


// ===========================================
//  PROCESSAMENTO DAS HORAS
// ===========================================
function processarEntradasSaidas(registos) {

    const grupos = {};

    for (const r of registos) {
        const key = `${r.funcionario}_${r.obra}_${r.marcacao.split("T")[0]}`;

        if (!grupos[key]) grupos[key] = [];
        grupos[key].push(r);
    }

    const linhas = [];

    for (const key in grupos) {
        const grupo = grupos[key].sort((a, b) =>
            new Date(a.marcacao) - new Date(b.marcacao)
        );

        for (let i = 0; i < grupo.length; i++) {

            const entrada = grupo[i];
            if (entrada.tipo !== "entrada") continue;

            const saida = grupo[i + 1];

            if (!saida || saida.tipo !== "saida") {
                linhas.push({
                    funcionario: entrada.funcionario,
                    obra: entrada.obra,
                    data: entrada.marcacao.split("T")[0],
                    entrada: entrada.marcacao,
                    saída: "-",
                    horas: "-",
                    estado: "Incompleto"
                });
                continue;
            }

            const h1 = new Date(entrada.marcacao);
            const h2 = new Date(saida.marcacao);
            const difSeg = Math.floor((h2 - h1) / 1000);

            const horas = Math.floor(difSeg / 3600).toString().padStart(2, "0");
            const min = Math.floor((difSeg % 3600) / 60).toString().padStart(2, "0");

            linhas.push({
                funcionario: entrada.funcionario,
                obra: entrada.obra,
                data: entrada.marcacao.split("T")[0],
                entrada: entrada.marcacao,
                saída: saida.marcacao,
                horas: `${horas}:${min}`,
                estado: "OK"
            });
        }
    }

    return linhas;
}


// ===========================================
//  DATATABLE
// ===========================================
function montarDataTable(linhas) {
    if (tabela) tabela.destroy();

    tabela = $('#tabelaRegistos').DataTable({
        data: linhas,
        columns: [
            { data: "funcionario" },
            { data: "obra" },
            { data: "data" },
            { data: "entrada" },
            { data: "saída" },
            { data: "horas" },
            { data: "estado" }
        ],
        order: [[2, "desc"]],
        pageLength: 20
    });
}


// ===========================================
//  MÉTRICAS
// ===========================================
async function carregarMetricas() {

    const hoje = new Date().toISOString().split("T")[0];

    const d = await SB.rpc("horas_totais_dia", { p_data: hoje });
    const s = await SB.rpc("horas_totais_semana");
    const m = await SB.rpc("horas_totais_mes");

    document.getElementById("mHorasHoje").textContent = d.data ?? "00:00";
    document.getElementById("mHorasSemana").textContent = s.data ?? "00:00";
    document.getElementById("mHorasMes").textContent = m.data ?? "00:00";
}
