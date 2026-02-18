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
    document.querySelectorAll(".tab-content").forEach(c => {
        c.style.display = "none";
    });

    const tabBtn = document.querySelector(`.tab[data-tab="${nome}"]`);
    const tabDiv = document.getElementById("tab-" + nome);

    if (!tabBtn || !tabDiv) return;

    tabBtn.classList.add("active");
    tabDiv.style.display = "block";

    if (nome === "inventario") {
        initInventario();   // ← AGORA É SEMPRE CHAMADO
    }

    if (nome === "registos") {
        carregarTabela();
    }

    if (nome === "financeiro") {
        carregarKPIsFinanceiros();
        carregarTabelaFinanceira();
    }
    
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

// =======================================================
// FLUXO DE CAIXA
// =======================================================
    await carregarCategoriasFinanceiras();
    await carregarObrasFluxo();

    async function carregarCategoriasFinanceiras() {
    const sel = document.getElementById("movCategoria");
    sel.innerHTML = "";

    const { data } = await SB
        .from("categorias_financeiras")
        .select("*")
        .order("nome");

    data?.forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });
}
    
async function carregarObrasFluxo() {
    const sel = document.getElementById("movObra");
    sel.innerHTML = "";

    const { data } = await SB
        .from("obras")
        .select("*")
        .order("nome");

    data?.forEach(o => {
        sel.innerHTML += `<option value="${o.id}">${o.nome}</option>`;
    });
}

document.getElementById("btnGuardarMov")?.addEventListener("click", guardarMovimento);

async function guardarMovimento() {

    const referencia = movReferencia.value.trim();
    const dataDoc = movData.value;
    const tipo = movTipo.value;
    const nif = movNif.value.trim();
    const nomeFornecedor = movFornecedor.value.trim();
    const categoria_id = movCategoria.value;
    const obra_id = movObra.value;
    const valor_base = Number(movBase.value);
    const iva = Number(movIva.value);
    const valor_total = Number(movTotal.value);
    const estado = movEstado.value;
    const obs = movObs.value;

    if (!referencia || !dataDoc || !valor_total) {
        movMsg.textContent = "Preencha os campos obrigatórios.";
        return;
    }

    // Criar ou obter fornecedor
    let fornecedor_id = null;

    if (nif) {
        const { data: existente } = await SB
            .from("fornecedores")
            .select("*")
            .eq("nif", nif)
            .maybeSingle();

        if (existente) {
            fornecedor_id = existente.id;
        } else {
            const { data: novo, error } = await SB
                .from("fornecedores")
                .insert({ nif, nome: nomeFornecedor })
                .select()
                .single();

            if (error) {
                movMsg.textContent = "Erro ao criar fornecedor.";
                return;
            }

            fornecedor_id = novo.id;
        }
    }

    const { error } = await SB
        .from("movimentos_financeiros")
        .insert({
            referencia,
            data_documento: dataDoc,
            tipo,
            fornecedor_id,
            categoria_id,
            obra_id,
            valor_base,
            iva,
            valor_total,
            estado_pagamento: estado,
            observacoes: obs
        });

    if (error) {
        movMsg.textContent = "Erro: " + error.message;
        return;
    }

    movMsg.textContent = "Movimento registado com sucesso.";

    // limpar
    document.querySelectorAll("#tab-fluxo input").forEach(i => i.value = "");
}

});











