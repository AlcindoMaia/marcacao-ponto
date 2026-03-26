// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================
const PIN_ADMIN = "1810";

// =======================================================
// ESTADO
// =======================================================
let currentDate = new Date();
let filtroDia   = null;

// =======================================================
// LOGIN
// =======================================================
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btnLogin")?.addEventListener("click", validarPIN);
    document.getElementById("pinInput")?.focus();
    ligarEventosGlobais();
});

function validarPIN() {
    const pinInput = document.getElementById("pinInput");
    const msg      = document.getElementById("pinMsg");

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
    if (nome === "registos")   { gerarCalendario(); carregarRegistos(); }
    if (nome === "financeiro") carregarFinanceiro();
    if (nome === "fluxo")      initFluxo();
}

// =======================================================
// FINANCEIRO — KPIs e tabela
// =======================================================
async function carregarFinanceiro() {
    const { data } = await SB
        .from("vw_kpis_financeiros_mes")
        .select("*")
        .single();

    if (data) {
        document.getElementById("kpiFuncionarios").textContent   = data.total_funcionarios   ?? "–";
        document.getElementById("kpiHoras").textContent          = data.total_horas_mes       ?? "–";
        document.getElementById("kpiDias").textContent           = data.total_dias_trabalhados ?? "–";
        document.getElementById("kpiDiasIncompletos").textContent = data.total_dias_nao_completos ?? "–";
        document.getElementById("kpiTotal").textContent          = Number(data.total_a_pagar || 0).toFixed(2) + " €";
    }

    const { data: linhas } = await SB
        .from("vw_dashboard_mes_atual")
        .select("*");

    const tbody = document.querySelector("#tabelaFinanceira tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    linhas?.forEach(r => {
        tbody.innerHTML += `
            <tr>
                <td>${r.funcionario}</td>
                <td>${r.horas_trabalhadas}</td>
                <td>${r.dias_trabalhados}</td>
                <td>${r.dias_nao_completos}</td>
                <td>${Number(r.valor_a_receber || 0).toFixed(2)} €</td>
            </tr>`;
    });
}

// =======================================================
// CALENDÁRIO
// =======================================================
function gerarCalendario() {
    const grid  = document.getElementById("calendarGrid");
    const title = document.getElementById("calendarTitle");
    if (!grid || !title) return;

    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth();

    title.textContent = currentDate.toLocaleString("pt-PT", {
        month: "long", year: "numeric"
    });

    grid.innerHTML = "";

    const primeiroDia = new Date(ano, mes, 1).getDay();
    const diasNoMes   = new Date(ano, mes + 1, 0).getDate();

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

    // Clique no título do mês → mostra todos os dias
    title.onclick = () => {
        filtroDia = null;
        document.querySelectorAll(".calendar-day")
            .forEach(d => d.classList.remove("active"));
        carregarRegistos();
    };

    // Navegação de mês — os listeners são definidos aqui apenas uma vez
    // (re-assignar onclick não acumula listeners ao contrário do addEventListener)
    const prevBtn = document.getElementById("prevMonth");
    if (prevBtn) {
        prevBtn.onclick = () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            gerarCalendario();
            carregarRegistos();
        };
    }

    const nextBtn = document.getElementById("nextMonth");
    if (nextBtn) {
        nextBtn.onclick = () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            gerarCalendario();
            carregarRegistos();
        };
    }
}

// =======================================================
// REGISTOS DE PONTO
// FIX: listener de blur era duplicado e aninhado — corrigido
// FIX: o update agora usa os campos correctos da view
// =======================================================
async function carregarRegistos() {
    const table = document.getElementById("tabelaRegistos");
    let tbody   = table.querySelector("tbody");

    if (!tbody) {
        tbody = document.createElement("tbody");
        table.appendChild(tbody);
    }

    tbody.innerHTML = "";

    const ano      = currentDate.getFullYear();
    const mes      = currentDate.getMonth() + 1;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const mesStr   = String(mes).padStart(2, "0");

    let query = SB.from("vw_registos_ponto").select("*")
        .gte("dia", `${ano}-${mesStr}-01`)
        .lte("dia", `${ano}-${mesStr}-${ultimoDia}`);

    if (filtroDia) {
        const d = filtroDia.toISOString().split("T")[0];
        query = query.eq("dia", d);
    }

    const { data, error } = await query.order("dia", { ascending: false });

    if (error) {
        alert("Erro ao carregar registos: " + error.message);
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px">Sem registos neste período</td></tr>`;
        return;
    }

    const formatHora = v => (v ? v.substring(11, 16) : "");

    data.forEach(r => {
        const tr = document.createElement("tr");
        tr.dataset.id = r.id;

        tr.innerHTML = `
            <td>${r.funcionario}</td>
            <td>${r.obra}</td>
            <td>${r.dia}</td>
            <td contenteditable="true" class="editavel" data-campo="entrada">${formatHora(r.entrada)}</td>
            <td contenteditable="true" class="editavel" data-campo="saida">${formatHora(r.saida)}</td>
            <td class="col-horas">${r.horas || ""}</td>
            <td contenteditable="true" class="editavel" data-campo="estado">${r.estado || ""}</td>
        `;

        // FIX: um único listener por célula, sem aninhamento
        tr.querySelectorAll(".editavel").forEach(td => {
            td.addEventListener("blur", () => guardarEdicaoRegisto(tr, r.id));
        });

        tbody.appendChild(tr);
    });
}

// Função separada para guardar edição — mais limpa e reutilizável
async function guardarEdicaoRegisto(tr, registoId) {
    const dia        = tr.children[2].textContent.trim();
    const entradaHora = tr.children[3].textContent.trim();
    const saidaHora  = tr.children[4].textContent.trim();
    const estado     = tr.children[6].textContent.trim();

    // Monta timestamps completos a partir do dia + hora editada
    const entradaISO = entradaHora ? `${dia}T${entradaHora}:00` : null;
    const saidaISO   = saidaHora   ? `${dia}T${saidaHora}:00`   : null;

    const { error } = await SB
        .from("registos_ponto")
        .update({ entrada: entradaISO, saida: saidaISO, estado })
        .eq("id", registoId);

    if (error) {
        console.error("Erro ao guardar edição:", error.message);
        return;
    }

    // Destaque visual na linha editada
    tr.querySelectorAll(".editavel").forEach(td => td.classList.add("editado"));
    tr.classList.add("linha-editada");
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
        sel.innerHTML += `<option value="${u.id}">${u.codigo}</option>`;
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
                <td>${a.codigo || ""}</td>
                <td>${a.descricao || ""}</td>
                <td>${a.tipo_artigo || ""}</td>
                <td>${Number(a.preco_atual || 0).toFixed(2)} €</td>
                <td>${a.quantidade ?? 0}</td>
                <td>${a.local_armazenamento || ""}</td>
            </tr>`;
    });
}

// =======================================================
// FLUXO DE CAIXA
// =======================================================
async function initFluxo() {
    await carregarCategoriasFinanceiras();
    await carregarObrasFluxo();
}

async function carregarCategoriasFinanceiras() {
    const sel = document.getElementById("movCategoria");
    if (!sel) return;

    const { data } = await SB
        .from("categorias_financeiras")
        .select("*")
        .order("nome");

    sel.innerHTML = `<option value="">— Selecionar —</option>`;
    data?.forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });
}

async function carregarObrasFluxo() {
    const sel = document.getElementById("movObra");
    if (!sel) return;

    const { data } = await SB
        .from("obras")
        .select("id, nome")
        .order("nome");

    sel.innerHTML = `<option value="">— Sem obra —</option>`;
    data?.forEach(o => {
        sel.innerHTML += `<option value="${o.id}">${o.nome}</option>`;
    });
}

async function guardarMovimento() {
    const referencia     = document.getElementById("movReferencia")?.value?.trim();
    const dataDoc        = document.getElementById("movData")?.value;
    const tipo           = document.getElementById("movTipo")?.value;
    const nif            = document.getElementById("movNif")?.value?.trim();
    const nomeFornecedor = document.getElementById("movFornecedor")?.value?.trim();
    const categoria_id   = document.getElementById("movCategoria")?.value || null;
    const obra_id        = document.getElementById("movObra")?.value || null;
    const valor_base     = Number(document.getElementById("movBase")?.value);
    const iva            = Number(document.getElementById("movIva")?.value);
    const valor_total    = Number(document.getElementById("movTotal")?.value);
    const estado         = document.getElementById("movEstado")?.value;
    const obs            = document.getElementById("movObs")?.value?.trim();
    const movMsg         = document.getElementById("movMsg");

    if (!referencia || !dataDoc || isNaN(valor_total) || valor_total === 0) {
        movMsg.textContent = "Preencha os campos obrigatórios (referência, data e total).";
        return;
    }

    let fornecedor_id = null;

    if (nif) {
        const { data: existente } = await SB
            .from("fornecedores")
            .select("id")
            .eq("nif", nif)
            .maybeSingle();

        if (existente) {
            fornecedor_id = existente.id;
        } else {
            const { data: novo, error: errForn } = await SB
                .from("fornecedores")
                .insert({ nif, nome: nomeFornecedor })
                .select("id")
                .single();

            if (errForn) {
                movMsg.textContent = "Erro ao criar fornecedor: " + errForn.message;
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

    movMsg.textContent = "✓ Movimento registado com sucesso.";
    movMsg.style.color = "#5ad65a";
}

// =======================================================
// EVENTOS GLOBAIS
// =======================================================
function ligarEventosGlobais() {

    // Pesquisa inventário
    document.getElementById("pesquisaInventario")
        ?.addEventListener("input", function () {
            const filtro = this.value.toLowerCase();
            document.querySelectorAll("#tabelaArtigos tbody tr").forEach(tr => {
                tr.style.display = tr.innerText.toLowerCase().includes(filtro) ? "" : "none";
            });
        });

    // Abrir modal novo artigo
    document.getElementById("btnNovoArtigo")
        ?.addEventListener("click", () => {
            document.getElementById("modalArtigo").classList.remove("hidden");
        });

    // Fechar modal
    document.getElementById("fecharModalBtn")
        ?.addEventListener("click", () => {
            document.getElementById("modalArtigo").classList.add("hidden");
        });

    // Guardar movimento
    document.getElementById("btnGuardarMov")
        ?.addEventListener("click", guardarMovimento);

    // Cálculo automático base a partir de total + IVA
    const totalInput = document.getElementById("movTotal");
    const ivaInput   = document.getElementById("movIva");
    const baseInput  = document.getElementById("movBase");

    function calcularBase() {
        const total = Number(totalInput?.value);
        const iva   = Number(ivaInput?.value);
        if (!isNaN(total) && !isNaN(iva) && iva >= 0) {
            if (baseInput) baseInput.value = (total / (1 + iva / 100)).toFixed(2);
        }
    }

    totalInput?.addEventListener("input", calcularBase);
    ivaInput?.addEventListener("input", calcularBase);

    // Atualizar financeiro
    document.getElementById("btnRefreshFinanceiro")
        ?.addEventListener("click", carregarFinanceiro);
}
