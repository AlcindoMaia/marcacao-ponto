// ===========================================
//  CONFIGURAÇÃO SUPABASE
// ===========================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_67e1zdXpV7_PXZ-0_ZmmSw__9ddgDKF";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===========================================
//  OBTÉM OU CRIA DEVICE ID
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
//  AUTENTICAÇÃO AUTOMÁTICA VIA DEVICE_ID
// ===========================================
async function verificarAdmin() {
    const { data, error } = await supabase
        .from("admins")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();

    if (data) {
        abrirAdmin();
        return;
    }

    // Senão for admin → mostrar login por PIN
    document.getElementById("loginBox").style.display = "block";
}

document.addEventListener("DOMContentLoaded", verificarAdmin);


// ===========================================
//  LOGIN POR PIN (1810) — REGISTA ADMIN
// ===========================================
async function validarPIN() {
    const pin = document.getElementById("pinInput").value.trim();

    if (pin !== "1810") {
        document.getElementById("pinMsg").textContent = "PIN incorreto.";
        return;
    }

    // Registar este dispositivo como admin
    await supabase.from("admins").insert({
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
//  CARREGAR FILTROS (Funcionários e Obras)
// ===========================================
async function carregarFiltros() {
    const fSel = document.getElementById("filtroFunc");
    const oSel = document.getElementById("filtroObra");

    // Funcionários
    const fData = await supabase.from("funcionarios").select("id, nome").order("nome");
    fSel.innerHTML = `<option value="">(Todos)</option>` +
        fData.data.map(f => `<option value="${f.id}">${f.nome}</option>`).join("");

    // Obras
    const oData = await supabase.from("obras").select("id, nome").order("nome");
    oSel.innerHTML = `<option value="">(Todas)</option>` +
        oData.data.map(o => `<option value="${o.id}">${o.nome}</option>`).join("");
}


// ===========================================
//  CARREGAR TABELA PRINCIPAL
// ===========================================
let tabela;

async function carregarTabela() {
    const { data, error } = await supabase
        .from("vw_horas_detalhadas")
        .select("*");

    if (error) {
        console.error("Erro ao carregar tabela:", error);
        return;
    }

    const linhasProcessadas = processarEntradasSaidas(data);

    montarDataTable(linhasProcessadas);
}


// ===========================================
//  PROCESSAR ENTRADAS E SAÍDAS (A + C)
// ===========================================
function processarEntradasSaidas(registos) {

    const agrupado = {};

    for (const r of registos) {
        const key = `${r.funcionario}_${r.obra}_${r.marcacao.split("T")[0]}`;

        if (!agrupado[key]) agrupado[key] = [];
        agrupado[key].push(r);
    }

    const linhas = [];

    for (const key in agrupado) {
        const grupo = agrupado[key].sort((a, b) =>
            new Date(a.marcacao) - new Date(b.marcacao)
        );

        for (let i = 0; i < grupo.length; i++) {
            const entrada = grupo[i];
            if (entrada.tipo !== "entrada") continue;

            const saida = grupo[i + 1];

            if (!saida || saida.tipo !== "saida") {
                // Registo INCOMPLETO
                linhas.push({
                    funcionario: entrada.funcionario,
                    obra: entrada.obra,
                    data: entrada.marcacao.split("T")[0],
                    entrada: entrada.marcacao,
                    saída: "-",
                    horas: "-",
                    distancia: entrada.distancia ?? "",
                    estado: "Incompleto"
                });
                continue;
            }

            const hEntrada = new Date(entrada.marcacao);
            const hSaida = new Date(saida.marcacao);
            const dif = (hSaida - hEntrada) / 1000 / 3600;

            linhas.push({
                funcionario: entrada.funcionario,
                obra: entrada.obra,
                data: entrada.marcacao.split("T")[0],
                entrada: entrada.marcacao,
                saída: saida.marcacao,
                horas: dif.toFixed(2),
                distancia: entrada.distancia ?? "",
                estado: entrada.distancia > entrada.raio ? "Fora do raio" : "OK"
            });
        }
    }

    return linhas;
}


// ===========================================
//  MONTAR DATATABLE PREMIUM
// ===========================================
function montarDataTable(linhas) {
    if (tabela) {
        tabela.destroy();
    }

    tabela = $('#tabelaRegistos').DataTable({
        data: linhas,
        columns: [
            { data: 'funcionario' },
            { data: 'obra' },
            { data: 'data' },
            { data: 'entrada' },
            { data: 'saída' },
            { data: 'horas' },
            { data: 'distancia', render: d => d ? d + " m" : "-" },
            { data: 'estado', render: e =>
                e === "OK"
                    ? `<span class="badge-ok">OK</span>`
                    : `<span class="badge-erro">${e}</span>`
            }
        ],
        pageLength: 20,
        order: [[2, "desc"]]
    });
}


// ===========================================
//  APLICAR E LIMPAR FILTROS
// ===========================================
function aplicarFiltros() {
    const func = document.getElementById("filtroFunc").value;
    const obra = document.getElementById("filtroObra").value;

    tabela.column(0).search(func ? func : "", true, false);
    tabela.column(1).search(obra ? obra : "", true, false);

    tabela.draw();
}

function limparFiltros() {
    document.getElementById("filtroFunc").value = "";
    document.getElementById("filtroObra").value = "";
    document.getElementById("fDataIni").value = "";
    document.getElementById("fDataFim").value = "";

    tabela.search("").columns().search("").draw();
}


// ===========================================
//  CARREGAR MÉTRICAS SUPERIORES
// ===========================================
async function carregarMetricas() {
    const hoje = new Date().toISOString().split("T")[0];

    const { data: hojeData } = await supabase.rpc("horas_totais_dia", { p_data: hoje });
    const { data: semanaData } = await supabase.rpc("horas_totais_semana");
    const { data: mesData } = await supabase.rpc("horas_totais_mes");

    document.getElementById("mHorasHoje").textContent = (hojeData || 0) + " h";
    document.getElementById("mHorasSemana").textContent = (semanaData || 0) + " h";
    document.getElementById("mHorasMes").textContent = (mesData || 0) + " h";
}
