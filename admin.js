// =======================================================
// SUPABASE (CHAVE CORRETA)
// =======================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

// =======================================================
// INVENTÁRIO
// =======================================================

async function initInventario() {
    await carregarUnidades();
    await carregarArtigos();
}

async function carregarUnidades() {
    const { data } = await SB.from("unidades_medida").select("*");
    const sel = document.getElementById("artUnidade");
    sel.innerHTML = "";
    data?.forEach(u => {
        sel.innerHTML += `<option value="${u.id}">${u.codigo}</option>`;
    });
}

async function carregarArtigos() {

    const { data } = await SB
        .from("vw_stock_atual")
        .select("*")
        .order("descricao");

    const tbody = document.querySelector("#tabelaArtigos tbody");
    tbody.innerHTML = "";

    data?.forEach(a => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${a.codigo}</td>
            <td>${a.descricao}</td>
            <td>${a.tipo_artigo || ""}</td>
            <td>${Number(a.preco_atual || 0).toFixed(2)} €</td>
            <td>${a.quantidade}</td>
            <td>${a.local_armazenamento || ""}</td>
        `;

        tbody.appendChild(tr);
    });
}

async function guardarArtigo() {

    const codigo = artCodigo.value.trim();
    const descricao = artDescricao.value.trim();
    const preco = Number(artPreco.value);
    const iva = Number(artIva.value);
    const unidade = artUnidade.value;
    const tipo = artTipo.value;
    const qtdInicial = Number(artQtdInicial.value || 0);
    const local = artLocal.value.trim();

    if (!codigo || !descricao || !preco || !unidade) {
        alert("Campos obrigatórios em falta");
        return;
    }

    const { data: artigo, error } = await SB
        .from("artigos")
        .insert({
            codigo,
            descricao,
            unidade_id: unidade,
            tipo_artigo: tipo,
            taxa_iva: iva,
            preco_atual: preco,
            stock_inicial: qtdInicial,
            local_armazenamento: local
        })
        .select()
        .single();

    if (error) {
        alert(error.message);
        return;
    }

    if (qtdInicial > 0) {
        await SB.from("movimentos_stock").insert({
            artigo_id: artigo.id,
            tipo_movimento: "INVENTARIO_INICIAL",
            quantidade: qtdInicial
        });
    }

    document.getElementById("modalArtigo").classList.add("hidden");
    carregarArtigos();
}

// Eventos

document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("btnNovoArtigo")
        ?.addEventListener("click", () => {
            document.getElementById("modalArtigo")
                .classList.remove("hidden");
        });

    document.getElementById("fecharModalBtn")
        ?.addEventListener("click", () => {
            document.getElementById("modalArtigo")
                .classList.add("hidden");
        });

    document.getElementById("guardarArtigoBtn")
        ?.addEventListener("click", guardarArtigo);

});


// Integrar na função mostrarTab

if (nome === "inventario") {
    initInventario();
}






