// =======================================================
// SUPABASE
// =======================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PIN_ADMIN = "1810";

// =======================================================
// CALENDÁRIO REGISTOS
// =======================================================

let currentDate = new Date();
let filtroDia = null;

// =======================================================
// LOGIN
// =======================================================
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("pinInput")?.focus();
    ligarEventosGlobais();
});

function validarPIN() {

    const pinInput = document.getElementById("pinInput");
    const msg = document.getElementById("pinMsg");

    if (!pinInput) return;

    const pin = pinInput.value.trim();

    if (pin !== PIN_ADMIN) {
        msg.textContent = "PIN incorreto";
        return;
    }

    msg.textContent = "";

    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");

    inicializarPainel();
}

document.addEventListener("keydown", e => {
    if (e.key === "Enter" &&
        !document.getElementById("loginBox").classList.contains("hidden")) {
        validarPIN();
    }
});

// =======================================================
// INICIALIZAÇÃO
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

    const tabBtn = document.querySelector(`.tab[data-tab="${nome}"]`);
    const tabDiv = document.getElementById("tab-" + nome);

    if (!tabBtn || !tabDiv) return;

    tabBtn.classList.add("active");
    tabDiv.classList.add("active");

    if (nome === "inventario") initInventario();

    if (nome === "registos") {
        gerarCalendario();
        carregarRegistos();
    }

    if (nome === "financeiro") carregarFinanceiro();
    if (nome === "fluxo") initFluxo();
}

// =======================================================
// FINANCEIRO
// =======================================================
async function carregarFinanceiro() {

    const { data } = await SB
        .from("vw_kpis_financeiros_mes")
        .select("*")
        .single();

    if (data) {
        kpiFuncionarios.textContent = data.total_funcionarios;
        kpiHoras.textContent = data.total_horas_mes;
        kpiDias.textContent = data.total_dias_trabalhados;
        kpiDiasIncompletos.textContent = data.total_dias_nao_completos;
        kpiTotal.textContent =
            Number(data.total_a_pagar).toFixed(2) + " €";
    }

    const { data: linhas } = await SB
        .from("vw_dashboard_mes_atual")
        .select("*");

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
// CALENDÁRIO
// =======================================================
function gerarCalendario() {

    const grid = document.getElementById("calendarGrid");
    const title = document.getElementById("calendarTitle");

    if (!grid || !title) return;

    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth();

    title.textContent = currentDate.toLocaleString("pt-PT", {
        month: "long",
        year: "numeric"
    });

    grid.innerHTML = "";

    const primeiroDia = new Date(ano, mes, 1).getDay();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();

    for (let i = 0; i < primeiroDia; i++) {
        grid.innerHTML += `<div></div>`;
    }

    for (let dia = 1; dia <= diasNoMes; dia++) {

        const div = document.createElement("div");
        div.classList.add("calendar-day");
        div.textContent = dia;

        div.onclick = () => {

            filtroDia = new Date(ano, mes, dia);

            document.querySelectorAll(".calendar-day")
                .forEach(d => d.classList.remove("active"));

            div.classList.add("active");

            carregarRegistos();
        };

        grid.appendChild(div);
    }

    title.onclick = () => {

        filtroDia = null;

        document.querySelectorAll(".calendar-day")
            .forEach(d => d.classList.remove("active"));

        carregarRegistos();
    };

    document.getElementById("prevMonth")?.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        gerarCalendario();
        carregarRegistos();
    };

    document.getElementById("nextMonth")?.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        gerarCalendario();
        carregarRegistos();
    };
}

// =======================================================
// REGISTOS
// =======================================================
async function carregarRegistos() {

    const table = document.getElementById("tabelaRegistos");
    let tbody = table.querySelector("tbody");

    if (!tbody) {
        tbody = document.createElement("tbody");
        table.appendChild(tbody);
    }

    tbody.innerHTML = "";

    let query = SB.from("vw_registos_ponto").select("*");

    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth() + 1;

    query = query
        .gte("dia", `${ano}-${String(mes).padStart(2,"0")}-01`)
        .lt("dia", `${ano}-${String(mes).padStart(2,"0")}-32`);

    if (filtroDia) {
        const d = filtroDia.toISOString().split("T")[0];
        query = query.eq("dia", d);
    }

    const { data, error } = await query.order("dia", { ascending: false });

    if (error) {
        alert("Erro Supabase: " + error.message);
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">Sem registos</td></tr>`;
        return;
    }

    const formatHora = (valor) => {
        if (!valor) return "";
        return valor.substring(11,16);
    };

    data.forEach(r => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${r.funcionario}</td>
            <td>${r.obra}</td>
            <td>${r.dia}</td>
            <td contenteditable="true" class="editavel">${formatHora(r.entrada)}</td>
            <td contenteditable="true" class="editavel">${formatHora(r.saida)}</td>
            <td>${r.horas || ""}</td>
            <td contenteditable="true" class="editavel">${r.estado}</td>
        `;

        tr.querySelectorAll(".editavel").forEach(td => {

            td.addEventListener("blur", async () => {

                td.classList.add("editado");
                tr.classList.add("linha-editada");

                await SB
                    .from("registos_ponto")
                    .update({
                        entrada: r.entrada,
                        saida: r.saida,
                        estado: r.estado
                    })
                    .eq("id", r.id);
            });

        });

        tbody.appendChild(tr);
    });
}

// =======================================================
// INVENTÁRIO
// =======================================================
async function initInventario() {
    await carregarUnidades();
    await carregarArtigos();
}

async function carregarUnidades() {

    const { data } = await SB
        .from("unidades_medida")
        .select("*")
        .order("codigo");

    const sel = document.getElementById("artUnidade");
    if (!sel) return;

    sel.innerHTML = "";

    data?.forEach(u => {
        sel.innerHTML +=
            `<option value="${u.id}">${u.codigo}</option>`;
    });
}

async function carregarArtigos() {

    const { data } = await SB
        .from("vw_stock_atual")
        .select("*")
        .order("descricao");

    const tbody = document.querySelector("#tabelaArtigos tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    data?.forEach(a => {
        tbody.innerHTML += `
            <tr>
                <td>${a.codigo}</td>
                <td>${a.descricao}</td>
                <td>${a.tipo_artigo || ""}</td>
                <td>${Number(a.preco_atual || 0).toFixed(2)} €</td>
                <td>${a.quantidade}</td>
                <td>${a.local_armazenamento || ""}</td>
            </tr>
        `;
    });
}

// =======================================================
// FLUXO DE CAIXA
// =======================================================
async function initFluxo() {
    await carregarCategoriasFinanceiras();
    await carregarObrasFluxo();
}

// =======================================================
// EVENTOS GLOBAIS
// =======================================================
function ligarEventosGlobais() {

    document.getElementById("btnNovoArtigo")
        ?.addEventListener("click", () => {
            document.getElementById("modalArtigo")
                .classList.remove("hidden");
        });

    document.getElementById("btnGuardarMov")
        ?.addEventListener("click", guardarMovimento);

    const totalInput = document.getElementById("movTotal");
    const ivaInput = document.getElementById("movIva");
    const baseInput = document.getElementById("movBase");

    function calcularBase() {
        const total = Number(totalInput?.value);
        const iva = Number(ivaInput?.value);

        if (!isNaN(total) && !isNaN(iva)) {
            const base = total / (1 + iva / 100);
            if (baseInput) baseInput.value = base.toFixed(2);
        }
    }

    totalInput?.addEventListener("input", calcularBase);
    ivaInput?.addEventListener("input", calcularBase);
}
