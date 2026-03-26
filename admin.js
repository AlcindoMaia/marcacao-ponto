// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================
const PIN_ADMIN = "1810";

// =======================================================
// ESTADO GLOBAL
// =======================================================
let currentDate   = new Date();
let filtroDia     = null;
let artigoEditId  = null;
let movEditId     = null;
let movimentos    = [];

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
    if (pinInput.value.trim() !== PIN_ADMIN) {
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
// INICIALIZAÇÃO / TABS
// =======================================================
function inicializarPainel() {
    ativarTabs();
    abrirTab("financeiro");
}

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
    if (nome === "financeiro") carregarFinanceiro();
    if (nome === "registos")   { gerarCalendario(); carregarRegistos(); }
    if (nome === "inventario") initInventario();
    if (nome === "fluxo")      initFluxo();
}

// =======================================================
// FINANCEIRO
// =======================================================
async function carregarFinanceiro() {
    const { data } = await SB.from("vw_kpis_financeiros_mes").select("*").single();
    if (data) {
        document.getElementById("kpiFuncionarios").textContent    = data.total_funcionarios ?? "–";
        document.getElementById("kpiHoras").textContent           = data.total_horas_mes ?? "–";
        document.getElementById("kpiDias").textContent            = data.total_dias_trabalhados ?? "–";
        document.getElementById("kpiDiasIncompletos").textContent = data.total_dias_nao_completos ?? "–";
        document.getElementById("kpiTotal").textContent           = Number(data.total_a_pagar || 0).toFixed(2) + " €";
    }
    const { data: linhas } = await SB.from("vw_dashboard_mes_atual").select("*");
    const tbody = document.querySelector("#tabelaFinanceira tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    linhas?.forEach(r => {
        tbody.innerHTML += `<tr>
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
    title.textContent = currentDate.toLocaleString("pt-PT", { month: "long", year: "numeric" });
    grid.innerHTML = "";
    const primeiroDia = new Date(ano, mes, 1).getDay();
    const diasNoMes   = new Date(ano, mes + 1, 0).getDate();
    for (let i = 0; i < primeiroDia; i++) grid.innerHTML += `<div></div>`;
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const div = document.createElement("div");
        div.classList.add("calendar-day");
        div.textContent = dia;
        div.onclick = () => {
            filtroDia = new Date(ano, mes, dia);
            document.querySelectorAll(".calendar-day").forEach(d => d.classList.remove("active"));
            div.classList.add("active");
            carregarRegistos();
        };
        grid.appendChild(div);
    }
    title.onclick = () => {
        filtroDia = null;
        document.querySelectorAll(".calendar-day").forEach(d => d.classList.remove("active"));
        carregarRegistos();
    };
    document.getElementById("prevMonth").onclick = () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        gerarCalendario(); carregarRegistos();
    };
    document.getElementById("nextMonth").onclick = () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        gerarCalendario(); carregarRegistos();
    };
}

// =======================================================
// REGISTOS DE PONTO
// =======================================================
async function carregarRegistos() {
    const table = document.getElementById("tabelaRegistos");
    let tbody = table.querySelector("tbody");
    if (!tbody) { tbody = document.createElement("tbody"); table.appendChild(tbody); }
    tbody.innerHTML = "";
    const ano    = currentDate.getFullYear();
    const mes    = currentDate.getMonth() + 1;
    const mesStr = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();
    let query = SB.from("vw_registos_ponto").select("*")
        .gte("dia", `${ano}-${mesStr}-01`)
        .lte("dia", `${ano}-${mesStr}-${ultimoDia}`);
    if (filtroDia) query = query.eq("dia", filtroDia.toISOString().split("T")[0]);
    const { data, error } = await query.order("dia", { ascending: false });
    if (error) { alert("Erro: " + error.message); return; }
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;opacity:.6">Sem registos neste período</td></tr>`;
        return;
    }
    const fmt = v => v ? v.substring(11, 16) : "";
    data.forEach(r => {
        const tr = document.createElement("tr");
        tr.dataset.id = r.id;
        tr.innerHTML = `
            <td>${r.funcionario}</td>
            <td>${r.obra}</td>
            <td>${r.dia}</td>
            <td contenteditable="true" class="editavel">${fmt(r.entrada)}</td>
            <td contenteditable="true" class="editavel">${fmt(r.saida)}</td>
            <td>${r.horas || ""}</td>
            <td contenteditable="true" class="editavel">${r.estado || ""}</td>`;
        tr.querySelectorAll(".editavel").forEach(td => {
            td.addEventListener("blur", () => guardarEdicaoRegisto(tr, r.id));
        });
        tbody.appendChild(tr);
    });
}

async function guardarEdicaoRegisto(tr, id) {
    const dia    = tr.children[2].textContent.trim();
    const ent    = tr.children[3].textContent.trim();
    const sai    = tr.children[4].textContent.trim();
    const estado = tr.children[6].textContent.trim();
    const { error } = await SB.from("registos_ponto").update({
        entrada: ent ? `${dia}T${ent}:00` : null,
        saida:   sai ? `${dia}T${sai}:00` : null,
        estado
    }).eq("id", id);
    if (error) { console.error(error.message); return; }
    tr.querySelectorAll(".editavel").forEach(td => td.classList.add("editado"));
    tr.classList.add("linha-editada");
}

// =======================================================
// INVENTÁRIO — CRUD COMPLETO
// =======================================================
async function initInventario() {
    await carregarUnidades();
    await carregarArtigos();
}

async function carregarUnidades() {
    const { data } = await SB.from("unidades_medida").select("*").order("codigo");
    const sel = document.getElementById("artUnidade");
    if (!sel) return;
    sel.innerHTML = "";
    data?.forEach(u => { sel.innerHTML += `<option value="${u.id}">${u.codigo}</option>`; });
}

async function carregarArtigos() {
    const { data, error } = await SB.from("vw_stock_atual").select("*").order("descricao");
    const tbody = document.querySelector("#tabelaArtigos tbody");
    if (!tbody) return;
    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#ff7a7a">Erro: ${error.message}</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;opacity:.6">Sem artigos. Clique + para adicionar.</td></tr>`;
        return;
    }
    data.forEach(a => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${a.codigo || ""}</td>
            <td>${a.descricao || ""}</td>
            <td>${a.tipo_artigo || ""}</td>
            <td>${Number(a.preco_atual || 0).toFixed(2)} €</td>
            <td>${a.quantidade ?? 0}</td>
            <td>${a.local_armazenamento || ""}</td>
            <td class="acoes-td">
                <button class="btn-acao" title="Editar">✏️</button>
                <button class="btn-acao" title="Histórico">📋</button>
                <button class="btn-acao btn-apagar-art" title="Apagar">🗑️</button>
            </td>`;
        tr.querySelector("[title='Editar']").onclick    = () => abrirModalArtigo(a);
        tr.querySelector("[title='Histórico']").onclick = () => abrirHistoricoStock(a.id, a.descricao);
        tr.querySelector("[title='Apagar']").onclick    = () => apagarArtigo(a.id, a.descricao);
        tbody.appendChild(tr);
    });
}

async function abrirModalArtigo(artigo = null) {
    // Em modo edição, vai buscar os dados COMPLETOS à tabela artigos.
    // A vw_stock_atual só tem campos de stock — não tem taxa_iva, unidade_id, etc.
    let d = null;
    if (artigo?.id) {
        const { data } = await SB.from("artigos").select("*").eq("id", artigo.id).single();
        d = data;
    }

    artigoEditId = artigo?.id || null;

    document.getElementById("modalTitulo").textContent = artigo ? "Editar Artigo" : "Novo Artigo";
    document.getElementById("artCodigo").value         = d?.codigo || "";
    document.getElementById("artDescricao").value      = d?.descricao || "";
    document.getElementById("artPreco").value          = d?.preco_atual ?? "";
    document.getElementById("artIva").value            = d?.taxa_iva ?? 23;
    document.getElementById("artTipo").value           = d?.tipo_artigo || "consumivel";
    document.getElementById("artLocal").value          = d?.local_armazenamento || "";
    document.getElementById("artQtdInicial").value     = "";

    const selUnidade = document.getElementById("artUnidade");
    if (selUnidade && d?.unidade_id) selUnidade.value = d.unidade_id;

    // Modo edição: esconder qty inicial, mostrar ajuste de stock
    const qtdGrp = document.getElementById("artQtdInicial")?.closest(".form-group");
    if (qtdGrp) qtdGrp.style.display = artigo ? "none" : "";

    const secaoAjuste = document.getElementById("secaoAjusteStock");
    if (secaoAjuste) secaoAjuste.style.display = artigo ? "block" : "none";

    document.getElementById("artAjusteQtd").value    = "";
    document.getElementById("artAjusteMotivo").value = "";
    document.getElementById("artAjusteTipo").value   = "entrada";

    document.getElementById("modalArtigoMsg").textContent = "";
    document.getElementById("modalArtigo").classList.remove("hidden");
}

// =======================================================
// HISTÓRICO DE STOCK
// =======================================================
async function abrirHistoricoStock(artigoId, descricao) {
    document.getElementById("histNomeArtigo").textContent = descricao;
    document.getElementById("histCorpo").innerHTML =
        `<tr><td colspan="5" style="text-align:center;padding:16px;opacity:.6">A carregar...</td></tr>`;
    document.getElementById("modalHistorico").classList.remove("hidden");

    const { data, error } = await SB
        .from("movimentos_stock")
        .select("tipo_movimento, quantidade, preco_unitario, data_movimento, observacoes")
        .eq("artigo_id", artigoId)
        .order("data_movimento", { ascending: false });

    const tbody = document.getElementById("histCorpo");

    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;opacity:.6">Sem movimentos registados.</td></tr>`;
        return;
    }

    // Calcular stock acumulado (do mais antigo para o mais recente)
    let acumulado = 0;
    const comSaldo = [...data].reverse().map(m => {
        const delta = m.tipo_movimento === "saida" ? -m.quantidade : Number(m.quantidade);
        acumulado += delta;
        return { ...m, saldo: acumulado };
    });
    comSaldo.reverse();

    const labels = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste", inicial: "Inicial" };
    const cores  = { entrada: "#5ad65a", saida: "#ff7a7a", ajuste: "#f4b942", inicial: "#85B7EB" };

    tbody.innerHTML = comSaldo.map(m => {
        const cor   = cores[m.tipo_movimento] || "#888";
        const label = labels[m.tipo_movimento] || m.tipo_movimento;
        const delta = m.tipo_movimento === "saida" ? -m.quantidade : +m.quantidade;
        const sinal = delta >= 0 ? "+" : "";
        return `<tr>
            <td>${m.data_movimento || "—"}</td>
            <td><span style="color:${cor};font-weight:600">${label}</span></td>
            <td style="text-align:right;color:${cor}">${sinal}${delta}</td>
            <td style="text-align:right;font-weight:500">${m.saldo}</td>
            <td style="opacity:.7;font-size:12px">${m.observacoes || "—"}</td>
        </tr>`;
    }).join("");
}

function fecharModalHistorico() {
    document.getElementById("modalHistorico").classList.add("hidden");
}

function fecharModalArtigo() {
    document.getElementById("modalArtigo").classList.add("hidden");
    artigoEditId = null;
}

async function guardarArtigo() {
    const descricao = document.getElementById("artDescricao").value.trim();
    const msg       = document.getElementById("modalArtigoMsg");
    if (!descricao) { msg.textContent = "A descrição é obrigatória."; return; }

    const unidadeVal = document.getElementById("artUnidade").value;

    const payload = {
        codigo:              document.getElementById("artCodigo").value.trim() || null,
        descricao,
        preco_atual:         parseFloat(document.getElementById("artPreco").value) || 0,
        taxa_iva:            parseInt(document.getElementById("artIva").value) || 23,
        tipo_artigo:         document.getElementById("artTipo").value,
        local_armazenamento: document.getElementById("artLocal").value.trim() || null,
        unidade_id:          unidadeVal ? parseInt(unidadeVal) : null
    };

    if (artigoEditId) {
        // EDITAR — actualizar dados do artigo
        const { error } = await SB.from("artigos").update(payload).eq("id", artigoEditId);
        if (error) { msg.textContent = "Erro: " + error.message; return; }

        // Movimento de ajuste de stock (só se quantidade preenchida)
        const qtdAjuste  = parseFloat(document.getElementById("artAjusteQtd").value);
        const tipoAjuste = document.getElementById("artAjusteTipo").value;
        const motivo     = document.getElementById("artAjusteMotivo").value.trim();

        if (!isNaN(qtdAjuste) && qtdAjuste > 0) {
            const { error: errMov } = await SB.from("movimentos_stock").insert({
                artigo_id:      artigoEditId,
                tipo_movimento: tipoAjuste,
                quantidade:     qtdAjuste,
                data_movimento: new Date().toISOString().split("T")[0],
                observacoes:    motivo || null
            });
            if (errMov) {
                msg.textContent = "Artigo guardado, mas erro no ajuste de stock: " + errMov.message;
                // Recarregar mesmo assim para reflectir a edição dos dados
                await carregarArtigos();
                return;
            }
        }

    } else {
        // CRIAR novo artigo
        const qtd = parseInt(document.getElementById("artQtdInicial").value) || 0;
        payload.stock_inicial = qtd;
        payload.ativo = true;

        const { data, error } = await SB.from("artigos").insert(payload).select("id").single();
        if (error) { msg.textContent = "Erro: " + error.message; return; }

        // Movimento inicial se stock > 0
        if (qtd > 0 && data?.id) {
            await SB.from("movimentos_stock").insert({
                artigo_id:      data.id,
                tipo_movimento: "entrada",
                quantidade:     qtd,
                data_movimento: new Date().toISOString().split("T")[0],
                observacoes:    "Stock inicial"
            });
        }
    }

    fecharModalArtigo();
    // Pequeno delay para garantir que a view do Supabase reflecte o novo movimento
    await new Promise(r => setTimeout(r, 300));
    await carregarArtigos();
}

async function apagarArtigo(id, nome) {
    if (!confirm(`Apagar "${nome}"? Esta ação não pode ser revertida.`)) return;
    const { error } = await SB.from("artigos").delete().eq("id", id);
    if (error) { alert("Erro: " + error.message); return; }
    await carregarArtigos();
}

// =======================================================
// FLUXO DE CAIXA — COMPLETO
// =======================================================
async function initFluxo() {
    await Promise.all([carregarCategoriasFinanceiras(), carregarObrasFluxo()]);
    ligarFiltrosFluxo();
    await carregarMovimentos();
}

async function carregarCategoriasFinanceiras() {
    const { data } = await SB.from("categorias_financeiras").select("*").order("nome");
    ["movCategoria", "filtroCategoria"].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const placeholder = id.startsWith("filtro") ? "— Todas —" : "— Selecionar —";
        sel.innerHTML = `<option value="">${placeholder}</option>`;
        data?.forEach(c => { sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`; });
    });
}

async function carregarObrasFluxo() {
    const { data } = await SB.from("obras").select("id, nome").order("nome");
    ["movObra", "filtroObra"].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const placeholder = id.startsWith("filtro") ? "— Todas —" : "— Sem obra —";
        sel.innerHTML = `<option value="">${placeholder}</option>`;
        data?.forEach(o => { sel.innerHTML += `<option value="${o.id}">${o.nome}</option>`; });
    });
}

async function carregarMovimentos() {
    const obra       = document.getElementById("filtroObra")?.value || "";
    const categoria  = document.getElementById("filtroCategoria")?.value || "";
    const tipo       = document.getElementById("filtroTipo")?.value || "";
    const dataInicio = document.getElementById("filtroDataInicio")?.value || "";
    const dataFim    = document.getElementById("filtroDataFim")?.value || "";

    let query = SB.from("movimentos_financeiros")
        .select(`id, referencia, data_documento, tipo,
                 valor_base, iva, valor_total, estado_pagamento, observacoes,
                 fornecedores(nome), categorias_financeiras(nome), obras(nome)`)
        .order("data_documento", { ascending: false });

    if (obra)        query = query.eq("obra_id", obra);
    if (categoria)   query = query.eq("categoria_id", categoria);
    if (tipo)        query = query.eq("tipo", tipo);
    if (dataInicio)  query = query.gte("data_documento", dataInicio);
    if (dataFim)     query = query.lte("data_documento", dataFim);

    const { data, error } = await query;
    if (error) { console.error(error); return; }
    movimentos = data || [];
    renderMovimentos();
    renderTotais();
}

function renderMovimentos() {
    const tbody = document.querySelector("#tabelaMovimentos tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (movimentos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;opacity:.6">Sem movimentos com estes filtros.</td></tr>`;
        return;
    }
    movimentos.forEach(m => {
        const ent = m.tipo === "entrada";
        const tr  = document.createElement("tr");
        tr.innerHTML = `
            <td>${m.data_documento || ""}</td>
            <td>${m.referencia || "—"}</td>
            <td><span class="badge-tipo ${ent ? "entrada" : "saida"}">${ent ? "Entrada" : "Saída"}</span></td>
            <td>${m.fornecedores?.nome || "—"}</td>
            <td>${m.categorias_financeiras?.nome || "—"}</td>
            <td>${m.obras?.nome || "—"}</td>
            <td style="text-align:right;font-weight:500;color:${ent ? "#5ad65a" : "#ff7a7a"}">${ent ? "+" : "–"}${Number(m.valor_total).toFixed(2)} €</td>
            <td><span class="badge-estado ${m.estado_pagamento}">${m.estado_pagamento === "pago" ? "Pago" : "Por pagar"}</span></td>
            <td class="acoes-td">
                <button class="btn-acao" title="Editar">✏️</button>
                <button class="btn-acao" title="Apagar">🗑️</button>
            </td>`;
        tr.querySelectorAll(".btn-acao")[0].onclick = () => abrirModalMovimento(m);
        tr.querySelectorAll(".btn-acao")[1].onclick = () => apagarMovimento(m.id, m.referencia);
        tbody.appendChild(tr);
    });
}

function renderTotais() {
    const entradas = movimentos.filter(m => m.tipo === "entrada").reduce((s, m) => s + Number(m.valor_total), 0);
    const saidas   = movimentos.filter(m => m.tipo === "saida").reduce((s, m) => s + Number(m.valor_total), 0);
    const saldo    = entradas - saidas;
    document.getElementById("totalEntradas").textContent = entradas.toFixed(2) + " €";
    document.getElementById("totalSaidas").textContent   = saidas.toFixed(2) + " €";
    const saldoEl = document.getElementById("saldoFluxo");
    saldoEl.textContent  = saldo.toFixed(2) + " €";
    saldoEl.style.color  = saldo >= 0 ? "#5ad65a" : "#ff7a7a";
}

function ligarFiltrosFluxo() {
    ["filtroObra","filtroCategoria","filtroTipo","filtroDataInicio","filtroDataFim"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", carregarMovimentos);
    });
    document.getElementById("btnLimparFiltros")?.addEventListener("click", () => {
        ["filtroObra","filtroCategoria","filtroTipo","filtroDataInicio","filtroDataFim"]
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        carregarMovimentos();
    });
}

function abrirModalMovimento(mov = null) {
    movEditId = mov?.id || null;
    document.getElementById("modalMovTitulo").textContent = mov ? "Editar Movimento" : "Novo Movimento";
    document.getElementById("movReferencia").value = mov?.referencia || "";
    document.getElementById("movData").value       = mov?.data_documento || new Date().toISOString().split("T")[0];
    document.getElementById("movTipo").value       = mov?.tipo || "saida";
    document.getElementById("movBase").value       = mov?.valor_base || "";
    document.getElementById("movIva").value        = mov?.iva ?? "";
    document.getElementById("movTotal").value      = mov?.valor_total || "";
    document.getElementById("movEstado").value     = mov?.estado_pagamento || "por_pagar";
    document.getElementById("movObs").value        = mov?.observacoes || "";
    document.getElementById("movNif").value        = "";
    document.getElementById("movFornecedor").value = mov?.fornecedores?.nome || "";
    document.getElementById("movMsg").textContent  = "";
    document.getElementById("modalMovimento").classList.remove("hidden");
}

function fecharModalMovimento() {
    document.getElementById("modalMovimento").classList.add("hidden");
    movEditId = null;
}

async function guardarMovimento() {
    const dataDoc    = document.getElementById("movData")?.value;
    const valor_total = Number(document.getElementById("movTotal")?.value);
    const movMsg     = document.getElementById("movMsg");

    if (!dataDoc || isNaN(valor_total) || valor_total === 0) {
        movMsg.textContent = "Data e valor total são obrigatórios.";
        return;
    }

    const nif  = document.getElementById("movNif")?.value?.trim();
    const nome = document.getElementById("movFornecedor")?.value?.trim();
    let fornecedor_id = null;

    if (nif) {
        const { data: ex } = await SB.from("fornecedores").select("id").eq("nif", nif).maybeSingle();
        if (ex) {
            fornecedor_id = ex.id;
        } else {
            const { data: novo, error: ef } = await SB.from("fornecedores")
                .insert({ nif, nome }).select("id").single();
            if (ef) { movMsg.textContent = "Erro fornecedor: " + ef.message; return; }
            fornecedor_id = novo.id;
        }
    }

    const payload = {
        referencia:       document.getElementById("movReferencia")?.value?.trim() || null,
        data_documento:   dataDoc,
        tipo:             document.getElementById("movTipo")?.value,
        fornecedor_id,
        categoria_id:     document.getElementById("movCategoria")?.value || null,
        obra_id:          document.getElementById("movObra")?.value || null,
        valor_base:       Number(document.getElementById("movBase")?.value) || 0,
        iva:              Number(document.getElementById("movIva")?.value) || 0,
        valor_total,
        estado_pagamento: document.getElementById("movEstado")?.value,
        observacoes:      document.getElementById("movObs")?.value?.trim() || null
    };

    const { error } = movEditId
        ? await SB.from("movimentos_financeiros").update(payload).eq("id", movEditId)
        : await SB.from("movimentos_financeiros").insert(payload);

    if (error) { movMsg.textContent = "Erro: " + error.message; return; }

    fecharModalMovimento();
    await carregarMovimentos();
}

async function apagarMovimento(id, ref) {
    if (!confirm(`Apagar movimento "${ref || id}"?`)) return;
    const { error } = await SB.from("movimentos_financeiros").delete().eq("id", id);
    if (error) { alert("Erro: " + error.message); return; }
    await carregarMovimentos();
}

// =======================================================
// EVENTOS GLOBAIS
// =======================================================
function ligarEventosGlobais() {
    // Pesquisa inventário
    document.getElementById("pesquisaInventario")?.addEventListener("input", function () {
        const f = this.value.toLowerCase();
        document.querySelectorAll("#tabelaArtigos tbody tr")
            .forEach(tr => { tr.style.display = tr.innerText.toLowerCase().includes(f) ? "" : "none"; });
    });

    // Inventário — modal
    document.getElementById("btnNovoArtigo")?.addEventListener("click", () => abrirModalArtigo());
    document.getElementById("guardarArtigoBtn")?.addEventListener("click", guardarArtigo);
    document.getElementById("fecharModalBtn")?.addEventListener("click", fecharModalArtigo);
    document.getElementById("modalArtigo")?.addEventListener("click", e => {
        if (e.target.id === "modalArtigo") fecharModalArtigo();
    });

    document.getElementById("modalHistorico")?.addEventListener("click", e => {
        if (e.target.id === "modalHistorico") fecharModalHistorico();
    });

    // Fluxo — modal
    document.getElementById("btnNovoMovimento")?.addEventListener("click", () => abrirModalMovimento());
    document.getElementById("btnGuardarMov")?.addEventListener("click", guardarMovimento);
    document.getElementById("fecharModalMovBtn")?.addEventListener("click", fecharModalMovimento);
    document.getElementById("modalMovimento")?.addEventListener("click", e => {
        if (e.target.id === "modalMovimento") fecharModalMovimento();
    });

    // Cálculo automático base
    function calcularBase() {
        const total = Number(document.getElementById("movTotal")?.value);
        const iva   = Number(document.getElementById("movIva")?.value);
        const base  = document.getElementById("movBase");
        if (base && !isNaN(total) && iva >= 0) base.value = (total / (1 + iva / 100)).toFixed(2);
    }
    document.getElementById("movTotal")?.addEventListener("input", calcularBase);
    document.getElementById("movIva")?.addEventListener("input", calcularBase);

    // Financeiro
    document.getElementById("btnRefreshFinanceiro")?.addEventListener("click", carregarFinanceiro);
}
