// =======================================================
// ANDAMENTO DA OBRA (separador do painel da obra)
// Três partes, todas visíveis ao cliente na Área do cliente:
//   - Fases: linha do tempo simples com datas e estado (sem percentagens).
//     Uma obra sem fases pode começar com as fases-tipo de cada tipo de obra.
//   - Autos de medição: a % feita (acumulada) de cada serviço da obra; o
//     valor do auto é o que essa % acrescenta ao auto anterior, sem IVA.
//     A fatura continua a sair do TOCONLINE: o auto é o pedido de pagamento.
//   - Diário: monta-se sozinho com as presenças, as tarefas do planeamento e
//     as fotos de cada dia; só a nota do dia se escreve (o cliente vê as
//     notas marcadas como visíveis).
// Tabelas em andamento.sql. Usa _painelObraActual, SB e esc do admin.js /
// config.js.
// =======================================================

// Fases-tipo por tipo de obra: só um ponto de partida, editam-se à vontade
const FASES_TIPO = {
    alvenaria: { nome: "Construção nova (alvenaria)", fases: [
        "Estaleiro e implantação", "Fundações", "Estrutura", "Alvenarias", "Cobertura",
        "Redes (águas, esgotos, eletricidade)", "Caixilharia", "Isolamento e capoto",
        "Rebocos e estuques", "Revestimentos e pavimentos", "Carpintarias e loiças",
        "Pinturas", "Arranjos exteriores e limpeza final"] },
    remodelacao: { nome: "Remodelação", fases: [
        "Demolições e remoções", "Redes (águas, esgotos, eletricidade)", "Paredes e alvenarias",
        "Tetos e estuques", "Revestimentos e pavimentos", "Cozinha e casas de banho",
        "Carpintarias e caixilharia", "Pinturas", "Limpeza e entrega"] },
    steelframe: { nome: "Steel frame", fases: [
        "Fundações / laje", "Estrutura LSF", "Cobertura", "Fechamento exterior (OSB e membrana)",
        "Caixilharia", "Redes (águas, esgotos, eletricidade)", "Isolamento e placas interiores",
        "Capoto / revestimento exterior", "Acabamentos interiores", "Pinturas", "Limpeza e entrega"] },
};

const ESTADOS_FASE = {
    por_fazer:  { nome: "Por fazer",  cor: "rgba(255,255,255,.45)", bg: "rgba(255,255,255,.07)" },
    a_decorrer: { nome: "A decorrer", cor: "var(--primary)",        bg: "rgba(181,136,99,.15)" },
    concluida:  { nome: "Concluída",  cor: "#8fbfa0",               bg: "rgba(143,191,160,.15)" },
};

const ESTADOS_AUTO = {
    rascunho: { nome: "Rascunho", dica: "Só tu vês" },
    enviado:  { nome: "Enviado",  dica: "O cliente vê na Área do cliente" },
    faturado: { nome: "Faturado", dica: "Já tem fatura no TOCONLINE; o cliente continua a ver" },
};

let _andamento = { fases: [], autos: [], servicos: [], diario: [], registos: [], tarefas: [], fotos: [] };
const DIAS_DIARIO = 30;
let _autoEmEdicao = null;   // null, ou { id|null, numero, data, taxa_iva, notas, estado, pct: {servico_id: %} }

// "50/30/20" -> [50, 80, 100] (% acumulada no fim de cada prestação)
function planoAcumulado(txt) {
    const partes = String(txt || "").split(/[\/;+ ]+/).map(Number).filter(n => n > 0);
    let acum = 0;
    return partes.map(p => (acum = Math.min(100, acum + p)));
}

const eurAnd = v => Number(v || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const dataAnd = d => d ? d.split("-").reverse().join("/") : "";
const arred2 = v => Math.round(Number(v || 0) * 100) / 100;

function msgAndamento(texto, tipo = "ok") {
    const el = document.getElementById("andamentoMsg");
    if (!el) return;
    el.textContent = texto;
    el.style.color = tipo === "err" ? "#e09486" : "#8fbfa0";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ""; }, 5000);
}

async function carregarPainelAndamento() {
    const obraId = _painelObraActual?.id;
    const el = document.getElementById("painelTab-andamento");
    if (!obraId || !el) return;
    if (_andamento.obraId !== obraId) _autoEmEdicao = null;   // outra obra: fecha o auto aberto
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;

    const desde = new Date(Date.now() - DIAS_DIARIO * 86400000).toISOString().slice(0, 10);
    const hoje  = new Date().toISOString().slice(0, 10);
    const [fasesRes, autosRes, servRes, diarioRes, regRes, tarRes, fotRes] = await Promise.all([
        SB.from("obra_fases").select("*").eq("obra_id", obraId).order("ordem").order("created_at"),
        SB.from("autos_medicao").select("*, auto_linhas(obra_servico_id, percentagem, valor)").eq("obra_id", obraId).order("numero"),
        SB.from("obra_servicos").select("id, nome, valor_orcamento, ordem").eq("obra_id", obraId).order("ordem").order("created_at"),
        SB.from("obra_diario").select("*").eq("obra_id", obraId).gte("data", desde),
        SB.from("registos_admin").select("data, horas, observacoes, funcionarios(nome)")
            .eq("obra_id", obraId).eq("tipo", "presenca").gte("data", desde).lte("data", hoje),
        SB.from("tarefas").select("data_prevista, descricao, estado")
            .eq("obra_id", obraId).gte("data_prevista", desde).lte("data_prevista", hoje).neq("estado", "cancelada"),
        SB.from("obra_documentos").select("id, nome_ficheiro, created_at")
            .eq("obra_id", obraId).eq("tipo", "foto").gte("created_at", desde),
    ]);
    const erro = fasesRes.error || autosRes.error || servRes.error || diarioRes.error;
    if (erro) {
        el.innerHTML = `<div style="padding:24px;text-align:center;color:#e09486">Não foi possível carregar o andamento: ${esc(erro.message)}</div>`;
        return;
    }
    _andamento = { obraId, fases: fasesRes.data || [], autos: autosRes.data || [], servicos: servRes.data || [],
        diario: diarioRes.data || [], registos: regRes.data || [], tarefas: tarRes.data || [], fotos: fotRes.data || [] };
    desenharAndamento();
}

function desenharAndamento() {
    const el = document.getElementById("painelTab-andamento");
    if (!el) return;
    el.innerHTML = `
        <div id="andamentoMsg" style="font-size:12px;min-height:16px;margin:4px 0"></div>
        <div class="card" style="margin:0 0 14px">${htmlFases()}</div>
        <div class="card" style="margin:0 0 14px">${_autoEmEdicao ? htmlEditorAuto() : htmlAutos()}</div>
        <div class="card" style="margin:0">${htmlDiario()}</div>`;
    if (_autoEmEdicao) recalcularAuto();
}

// ── Fases ────────────────────────────────────────────────────
function htmlFases() {
    const titulo = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-family:var(--font-title,sans-serif);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.6">Fases da obra</div>
        ${_andamento.fases.length ? `<div style="display:flex;gap:6px">
            <button class="btn-secondary" style="padding:4px 12px;font-size:12px" onclick="mostrarTrocaFases()" title="Substituir pelas fases de outro tipo de obra">Trocar fases</button>
            <button class="btn-secondary" style="padding:4px 12px;font-size:12px" onclick="novaFase()">+ Fase</button>
        </div>` : ""}
    </div>
    ${_andamento.fases.length ? `<div id="trocaFases" style="display:none;margin-bottom:10px;padding:10px;border-radius:8px;background:rgba(255,255,255,.04)">
        <div style="font-size:12px;opacity:.75;margin-bottom:8px">Substituir as fases desta obra pelas de:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${Object.entries(FASES_TIPO).map(([k, t]) =>
                `<button class="btn-secondary" style="font-size:12px" onclick="trocarFasesTipo('${k}')">${esc(t.nome)}</button>`).join("")}
            <button class="btn-secondary" style="font-size:12px;opacity:.7" onclick="desenharAndamento()">Cancelar</button>
        </div>
    </div>` : ""}`;

    if (!_andamento.fases.length) {
        return titulo + `<div style="font-size:13px;opacity:.7;margin-bottom:10px">Esta obra ainda não tem fases. Começa com as fases habituais e depois ajusta:</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${Object.entries(FASES_TIPO).map(([k, t]) =>
                    `<button class="btn-secondary" style="font-size:12px" onclick="criarFasesTipo('${k}')">${esc(t.nome)}</button>`).join("")}
                <button class="btn-secondary" style="font-size:12px;opacity:.7" onclick="novaFase()">Uma fase de cada vez</button>
            </div>`;
    }

    const linhas = _andamento.fases.map((f, i) => {
        const e = ESTADOS_FASE[f.estado] || ESTADOS_FASE.por_fazer;
        return `<div class="fase-linha" style="display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center;padding:9px 0;border-top:${i ? "1px solid rgba(255,255,255,.06)" : "none"}">
            <div style="min-width:0">
                <div style="font-weight:600;font-size:13px">${esc(f.nome)}${f.visivel_cliente ? "" : ` <span title="O cliente não vê esta fase" style="opacity:.5;font-size:11px">🔒</span>`}</div>
                <div style="font-size:11px;opacity:.55">${f.data_inicio || f.data_fim
                    ? `${dataAnd(f.data_inicio) || "?"} → ${dataAnd(f.data_fim) || "?"}` : "Sem datas"}</div>
            </div>
            <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
                <select onchange="mudarEstadoFase('${f.id}', this.value)" style="font-size:12px;padding:3px 6px;color:${e.cor};background:${e.bg};border-radius:8px;width:auto">
                    ${Object.entries(ESTADOS_FASE).map(([k, v]) => `<option value="${k}"${k === f.estado ? " selected" : ""}>${v.nome}</option>`).join("")}
                </select>
                <button class="btn-acao" title="Subir" onclick="moverFase('${f.id}', -1)"${i ? "" : " disabled style=\"opacity:.25\""}>↑</button>
                <button class="btn-acao" title="Editar" onclick="editarFase('${f.id}')">✏️</button>
                <button class="btn-acao" title="Apagar" style="opacity:.5" onclick="apagarFase('${f.id}')">🗑️</button>
            </div>
            <div id="faseEd-${f.id}" style="grid-column:1/-1;display:none"></div>
        </div>`;
    }).join("");
    return titulo + linhas + `<div id="faseEd-nova" style="display:none"></div>`;
}

async function criarFasesTipo(tipo) {
    const t = FASES_TIPO[tipo];
    if (!t || _andamento.fases.length) return;
    const { error } = await SB.from("obra_fases").insert(t.fases.map((nome, i) => ({
        obra_id: _painelObraActual.id, nome, ordem: i + 1,
    })));
    if (error) return msgAndamento("Não foi possível criar as fases: " + error.message, "err");
    await carregarPainelAndamento();
    msgAndamento(`${t.fases.length} fases criadas. Apaga as que não se aplicam e põe as datas.`);
}

function mostrarTrocaFases() {
    const el = document.getElementById("trocaFases");
    if (el) el.style.display = el.style.display === "none" ? "block" : "none";
}

// Escolheu o tipo de obra errado: apaga as fases e cria as do tipo certo
async function trocarFasesTipo(tipo) {
    const t = FASES_TIPO[tipo];
    if (!t) return;
    const n = _andamento.fases.length;
    const mexidas = _andamento.fases.filter(f => f.estado !== "por_fazer" || f.data_inicio || f.data_fim).length;
    if (!confirm(`Trocar as ${n} fases atuais pelas ${t.fases.length} de "${t.nome}"?` +
        (mexidas ? `\n\n${mexidas} fase(s) já têm estado ou datas: perdem-se e tens de as marcar outra vez.` : ""))) return;
    const { error: errDel } = await SB.from("obra_fases").delete().eq("obra_id", _painelObraActual.id);
    if (errDel) return msgAndamento("Não foi possível apagar as fases atuais: " + errDel.message, "err");
    _andamento.fases = [];
    await criarFasesTipo(tipo);
}

function formFase(f) {
    const id = f?.id || "nova";
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;padding:10px;margin-top:6px;border-radius:8px;background:rgba(255,255,255,.04)">
        <label style="grid-column:1/-1;font-size:11px;opacity:.7">Nome<input id="faseNome-${id}" value="${esc(f?.nome || "")}" maxlength="120"></label>
        <label style="font-size:11px;opacity:.7">Início<input type="date" id="faseIni-${id}" value="${f?.data_inicio || ""}"></label>
        <label style="font-size:11px;opacity:.7">Fim previsto<input type="date" id="faseFim-${id}" value="${f?.data_fim || ""}"></label>
        <label style="grid-column:1/-1;font-size:12px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="faseVis-${id}" style="width:auto"${f?.visivel_cliente === false ? "" : " checked"}> O cliente vê esta fase</label>
        <div style="grid-column:1/-1;display:flex;gap:6px">
            <button class="btn-primary" style="padding:5px 14px;font-size:12px" onclick="gravarFase('${f?.id || ""}')">Gravar</button>
            <button class="btn-secondary" style="padding:5px 14px;font-size:12px" onclick="desenharAndamento()">Cancelar</button>
        </div>
    </div>`;
}

function novaFase() {
    desenharAndamento();
    const box = document.getElementById("faseEd-nova");
    if (box) {
        box.innerHTML = formFase(null);
        box.style.display = "block";
    } else {
        // Ainda sem fases: o formulário entra no lugar dos botões
        document.querySelector("#painelTab-andamento .card").insertAdjacentHTML("beforeend", formFase(null));
    }
    document.getElementById("faseNome-nova")?.focus();
}

function editarFase(id) {
    desenharAndamento();
    const f = _andamento.fases.find(x => x.id === id);
    const box = document.getElementById("faseEd-" + id);
    if (!f || !box) return;
    box.innerHTML = formFase(f);
    box.style.display = "block";
}

async function gravarFase(id) {
    const k = id || "nova";
    const v = s => document.getElementById(`${s}-${k}`);
    const nome = v("faseNome").value.trim();
    if (!nome) return msgAndamento("Escreve o nome da fase.", "err");
    const ini = v("faseIni").value || null, fim = v("faseFim").value || null;
    if (ini && fim && fim < ini) return msgAndamento("A data de fim é anterior à de início.", "err");
    const dados = { nome, data_inicio: ini, data_fim: fim, visivel_cliente: v("faseVis").checked };
    const { error } = id
        ? await SB.from("obra_fases").update(dados).eq("id", id)
        : await SB.from("obra_fases").insert({ ...dados, obra_id: _painelObraActual.id,
            ordem: Math.max(0, ..._andamento.fases.map(f => f.ordem || 0)) + 1 });
    if (error) return msgAndamento("Não foi possível gravar a fase: " + error.message, "err");
    await carregarPainelAndamento();
}

async function mudarEstadoFase(id, estado) {
    const { error } = await SB.from("obra_fases").update({ estado }).eq("id", id);
    if (error) return msgAndamento("Não foi possível mudar o estado: " + error.message, "err");
    const f = _andamento.fases.find(x => x.id === id);
    if (f) f.estado = estado;
    desenharAndamento();
}

async function moverFase(id, dir) {
    const lista = _andamento.fases;
    const i = lista.findIndex(f => f.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    // Renumera tudo: as fases-tipo e as novas podem ter ordens repetidas
    const res = await Promise.all(lista.map((f, n) => SB.from("obra_fases").update({ ordem: n + 1 }).eq("id", f.id)));
    const erro = res.find(r => r.error)?.error;
    if (erro) msgAndamento("Não foi possível mudar a ordem: " + erro.message, "err");
    await carregarPainelAndamento();
}

async function apagarFase(id) {
    const f = _andamento.fases.find(x => x.id === id);
    if (!f || !confirm(`Apagar a fase "${f.nome}"?`)) return;
    const { error } = await SB.from("obra_fases").delete().eq("id", id);
    if (error) return msgAndamento("Não foi possível apagar: " + error.message, "err");
    await carregarPainelAndamento();
}

// ── Autos de medição ─────────────────────────────────────────
function totaisAuto(a) {
    const base = (a.auto_linhas || []).reduce((s, l) => s + Number(l.valor || 0), 0);
    const iva  = arred2(base * Number(a.taxa_iva || 0) / 100);
    return { base: arred2(base), iva, total: arred2(base + iva) };
}

// % acumulada de cada serviço nos autos antes do número dado
function pctAnteriores(numero) {
    const pct = {};
    _andamento.autos.filter(a => a.numero < numero).forEach(a =>
        (a.auto_linhas || []).forEach(l => {
            pct[l.obra_servico_id] = Math.max(pct[l.obra_servico_id] || 0, Number(l.percentagem || 0));
        }));
    return pct;
}

function htmlAutos() {
    const servs = _andamento.servicos;
    const totalServ = servs.reduce((s, x) => s + Number(x.valor_orcamento || 0), 0);
    const pedido = _andamento.autos.reduce((s, a) => s + totaisAuto(a).base, 0);

    const titulo = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-family:var(--font-title,sans-serif);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.6">Autos de medição</div>
        ${servs.length ? `<button class="btn-secondary" style="padding:4px 12px;font-size:12px" onclick="novoAuto()">+ Novo auto</button>` : ""}
    </div>`;

    if (!servs.length) {
        return titulo + `<div style="font-size:13px;opacity:.7">Os autos medem os serviços da obra. Esta obra ainda não tem serviços: aceita o orçamento ou cria os serviços em ✏️ Editar obra › Serviços.</div>`;
    }

    const plano = _painelObraActual.plano_pagamentos ?? "50/30/20";
    const linhaPlano = `<div style="font-size:12px;margin-bottom:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span style="opacity:.7">Plano de pagamentos:</span>
        <input id="planoPag" value="${esc(plano)}" placeholder="ex.: 50/30/20" style="width:120px;padding:3px 8px;font-size:12px"
            onchange="gravarPlanoPagamentos(this.value)" title="% de cada prestação, separadas por /. Vazio = sem plano.">
        <span style="opacity:.5">% de cada prestação</span>
    </div>`;
    const resumo = linhaPlano + `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-bottom:10px;opacity:.85">
        <span>Valor dos serviços: <b>${eurAnd(totalServ)}</b></span>
        <span>Já pedido: <b>${eurAnd(pedido)}</b>${totalServ > 0 ? ` (${Math.round(pedido / totalServ * 100)}%)` : ""}</span>
        <span>Falta: <b>${eurAnd(totalServ - pedido)}</b></span>
        <span style="opacity:.6">sem IVA</span>
    </div>`;

    if (!_andamento.autos.length) {
        return titulo + resumo + `<div style="font-size:13px;opacity:.7">Ainda não há autos. Num auto marcas a percentagem feita de cada serviço (ou a mesma % para todos, se cobras por fases) e a app calcula quanto pedir.</div>`;
    }

    return titulo + resumo + _andamento.autos.slice().reverse().map((a, i) => {
        const t = totaisAuto(a);
        const e = ESTADOS_AUTO[a.estado] || ESTADOS_AUTO.rascunho;
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0;border-top:${i ? "1px solid rgba(255,255,255,.06)" : "none"}">
            <div>
                <div style="font-weight:600;font-size:13px">Auto nº ${a.numero} · ${dataAnd(a.data)}</div>
                <div style="font-size:11px;opacity:.6" title="${esc(e.dica)}">${e.nome} · ${eurAnd(t.base)} + IVA ${Number(a.taxa_iva)}% = <b>${eurAnd(t.total)}</b></div>
            </div>
            <div style="display:flex;gap:4px">
                <button class="btn-acao" title="Abrir" onclick="editarAuto('${a.id}')">✏️</button>
                <button class="btn-acao" title="PDF" onclick="pdfAuto('${a.id}')">📄</button>
                <button class="btn-acao" title="Apagar" style="opacity:.5" onclick="apagarAuto('${a.id}')">🗑️</button>
            </div>
        </div>`;
    }).join("");
}

async function gravarPlanoPagamentos(txt) {
    const plano = txt.trim();
    const soma = plano.split(/[\/;+ ]+/).map(Number).reduce((s, n) => s + (n > 0 ? n : 0), 0);
    if (plano && Math.abs(soma - 100) > 0.01) msgAndamento(`Atenção: as prestações somam ${soma}% em vez de 100%.`, "err");
    const { error } = await SB.from("obras").update({ plano_pagamentos: plano || null }).eq("id", _painelObraActual.id);
    if (error) return msgAndamento("Não foi possível gravar o plano: " + error.message, "err");
    _painelObraActual.plano_pagamentos = plano || null;
}

function novoAuto() {
    const ultimo = _andamento.autos[_andamento.autos.length - 1];
    const numero = (ultimo?.numero || 0) + 1;
    const ant = pctAnteriores(numero);
    // Com plano, o auto começa na % acumulada da prestação correspondente
    const prest = planoAcumulado(_painelObraActual.plano_pagamentos ?? "50/30/20")[numero - 1];
    _autoEmEdicao = {
        id: null, numero, data: new Date().toISOString().slice(0, 10), estado: "rascunho",
        taxa_iva: ultimo ? Number(ultimo.taxa_iva) : 23, notas: "",
        pct: Object.fromEntries(_andamento.servicos.map(s => [s.id, Math.max(ant[s.id] || 0, prest || 0)])),
        prestacao: prest ? `Prestação ${numero} do plano: ${prest}% acumulado. Ajusta se o combinado for outro.` : "",
    };
    desenharAndamento();
}

function editarAuto(id) {
    const a = _andamento.autos.find(x => x.id === id);
    if (!a) return;
    const ant = pctAnteriores(a.numero);
    const pct = Object.fromEntries(_andamento.servicos.map(s => [s.id, ant[s.id] || 0]));
    (a.auto_linhas || []).forEach(l => { pct[l.obra_servico_id] = Number(l.percentagem); });
    // Com autos seguintes, as % ficam fechadas: os seguintes contam a partir destas
    const fechado = _andamento.autos.some(x => x.numero > a.numero);
    _autoEmEdicao = { id: a.id, numero: a.numero, data: a.data, estado: a.estado,
        taxa_iva: Number(a.taxa_iva), notas: a.notas || "", pct, fechado };
    desenharAndamento();
}

function fecharEditorAuto() {
    _autoEmEdicao = null;
    desenharAndamento();
}

function htmlEditorAuto() {
    const a = _autoEmEdicao;
    const ant = pctAnteriores(a.numero);
    const linhas = _andamento.servicos.map(s => `
        <tr data-serv="${s.id}">
            <td style="padding:6px 4px;font-size:13px">${esc(s.nome)}<div style="font-size:11px;opacity:.5">${eurAnd(s.valor_orcamento)}</div></td>
            <td style="padding:6px 4px;font-size:12px;text-align:right;opacity:.6">${Number(ant[s.id] || 0)}%</td>
            <td style="padding:6px 4px;text-align:right"><input type="number" class="auto-pct" min="${Number(ant[s.id] || 0)}" max="100" step="1"
                value="${Number(a.pct[s.id] || 0)}" style="width:72px;text-align:right" oninput="recalcularAuto()"${a.fechado ? " disabled" : ""}></td>
            <td class="auto-valor" style="padding:6px 4px;font-size:13px;text-align:right;white-space:nowrap"></td>
        </tr>`).join("");

    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px">
            <div style="font-family:var(--font-title,sans-serif);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.6">Auto de medição nº ${a.numero}</div>
            <button class="btn-secondary" style="padding:4px 12px;font-size:12px" onclick="fecharEditorAuto()">Fechar</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px">
            <label style="font-size:11px;opacity:.7">Data<input type="date" id="autoData" value="${a.data}"></label>
            <label style="font-size:11px;opacity:.7">IVA %<input type="number" id="autoIva" value="${a.taxa_iva}" min="0" max="23" step="1" oninput="recalcularAuto()"${a.fechado ? " disabled" : ""}></label>
            <label style="font-size:11px;opacity:.7">Estado<select id="autoEstado">
                ${Object.entries(ESTADOS_AUTO).map(([k, v]) => `<option value="${k}"${k === a.estado ? " selected" : ""} title="${esc(v.dica)}">${v.nome}</option>`).join("")}
            </select></label>
            ${a.fechado ? `<div style="font-size:11px;opacity:.6;align-self:end">Já há autos depois deste: só a data, o estado e as notas se podem mudar.</div>` : `<label style="font-size:11px;opacity:.7">Mesma % para todos
                <div style="display:flex;gap:4px"><input type="number" id="autoPctTodos" min="0" max="100" step="1" placeholder="ex.: 30">
                <button class="btn-secondary" style="padding:4px 10px;font-size:12px" onclick="aplicarPctTodos()">Aplicar</button></div></label>`}
        </div>
        ${a.prestacao ? `<div style="font-size:12px;opacity:.7;margin-bottom:8px">${esc(a.prestacao)}</div>` : ""}
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
            <thead><tr style="font-size:11px;opacity:.55;text-align:right">
                <th style="text-align:left;padding:4px">Serviço</th><th style="padding:4px">Até agora</th><th style="padding:4px">Feito (acumulado)</th><th style="padding:4px">Este auto</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>
        <div id="autoTotais" style="text-align:right;font-size:13px;margin:10px 0"></div>
        <label style="font-size:11px;opacity:.7;display:block">Notas para o cliente<textarea id="autoNotas" rows="2" maxlength="1000">${esc(a.notas)}</textarea></label>
        <div style="font-size:11px;opacity:.55;margin:6px 0 10px">Em "Rascunho" só tu vês. Em "Enviado" ou "Faturado" o cliente vê o auto na Área do cliente.</div>
        <button class="btn-primary" onclick="gravarAuto()">Gravar auto</button>`;
}

function aplicarPctTodos() {
    const v = Number(document.getElementById("autoPctTodos").value);
    if (!(v >= 0 && v <= 100)) return msgAndamento("A percentagem tem de estar entre 0 e 100.", "err");
    document.querySelectorAll("#painelTab-andamento .auto-pct").forEach(inp => {
        inp.value = Math.max(v, Number(inp.min || 0));   // nunca abaixo do que já foi pedido
    });
    recalcularAuto();
}

function recalcularAuto() {
    if (!_autoEmEdicao) return;
    const ant = pctAnteriores(_autoEmEdicao.numero);
    let base = 0;
    document.querySelectorAll("#painelTab-andamento tr[data-serv]").forEach(tr => {
        const s = _andamento.servicos.find(x => x.id === tr.dataset.serv);
        const pct = Math.min(100, Math.max(0, Number(tr.querySelector(".auto-pct").value) || 0));
        _autoEmEdicao.pct[s.id] = pct;
        const valor = arred2(Number(s.valor_orcamento || 0) * (pct - (ant[s.id] || 0)) / 100);
        base += valor;
        const td = tr.querySelector(".auto-valor");
        td.textContent = eurAnd(valor);
        td.style.color = valor < 0 ? "#e09486" : "";
    });
    const taxa = Number(document.getElementById("autoIva")?.value) || 0;
    const iva = arred2(base * taxa / 100);
    const el = document.getElementById("autoTotais");
    if (el) el.innerHTML = `${eurAnd(base)} + IVA ${taxa}% ${eurAnd(iva)} = <b style="font-size:15px">${eurAnd(base + iva)}</b>`;
}

async function gravarAuto() {
    const a = _autoEmEdicao;
    if (!a) return;
    recalcularAuto();
    const ant = pctAnteriores(a.numero);
    const baixou = _andamento.servicos.find(s => (a.pct[s.id] || 0) < (ant[s.id] || 0));
    if (baixou) return msgAndamento(`"${baixou.nome}" fica abaixo do que já foi pedido em autos anteriores.`, "err");

    const linhas = _andamento.servicos
        .filter(s => (a.pct[s.id] || 0) > 0)
        .map(s => ({ obra_servico_id: s.id, percentagem: a.pct[s.id],
            valor: arred2(Number(s.valor_orcamento || 0) * (a.pct[s.id] - (ant[s.id] || 0)) / 100) }));
    if (!linhas.some(l => l.valor !== 0)) return msgAndamento("Este auto não acrescenta nada aos anteriores.", "err");

    const dados = {
        data: document.getElementById("autoData").value || new Date().toISOString().slice(0, 10),
        taxa_iva: Number(document.getElementById("autoIva").value) || 0,
        estado: document.getElementById("autoEstado").value,
        notas: document.getElementById("autoNotas").value.trim() || null,
    };

    if (a.fechado) {
        const { error } = await SB.from("autos_medicao").update({ data: dados.data, estado: dados.estado, notas: dados.notas }).eq("id", a.id);
        if (error) return msgAndamento("Não foi possível gravar: " + error.message, "err");
        _autoEmEdicao = null;
        await carregarPainelAndamento();
        return msgAndamento(`Auto nº ${a.numero} gravado.`);
    }

    let id = a.id;
    if (id) {
        const { error } = await SB.from("autos_medicao").update(dados).eq("id", id);
        if (error) return msgAndamento("Não foi possível gravar: " + error.message, "err");
        const { error: errDel } = await SB.from("auto_linhas").delete().eq("auto_id", id);
        if (errDel) return msgAndamento("Não foi possível gravar as linhas: " + errDel.message, "err");
    } else {
        const { data, error } = await SB.from("autos_medicao")
            .insert({ ...dados, obra_id: _painelObraActual.id, numero: a.numero }).select("id").single();
        if (error) return msgAndamento("Não foi possível criar o auto: " + error.message, "err");
        id = data.id;
    }
    const { error: errLin } = await SB.from("auto_linhas").insert(linhas.map(l => ({ ...l, auto_id: id })));
    if (errLin) return msgAndamento("O auto ficou sem linhas: " + errLin.message, "err");

    _autoEmEdicao = null;
    await carregarPainelAndamento();
    msgAndamento(`Auto nº ${a.numero} gravado.`);
}

async function apagarAuto(id) {
    const a = _andamento.autos.find(x => x.id === id);
    if (!a) return;
    if (_andamento.autos.some(x => x.numero > a.numero))
        return msgAndamento("Só se pode apagar o último auto: os seguintes contam a partir deste.", "err");
    if (!confirm(`Apagar o auto nº ${a.numero}?${a.estado !== "rascunho" ? " O cliente deixa de o ver." : ""}`)) return;
    const { error } = await SB.from("autos_medicao").delete().eq("id", id);
    if (error) return msgAndamento("Não foi possível apagar: " + error.message, "err");
    await carregarPainelAndamento();
}

// ── Diário de obra ───────────────────────────────────────────
function diasDoDiario() {
    const dias = {};
    const dia = d => (dias[d] ??= { data: d, equipa: {}, obs: [], tarefas: [], fotos: [], nota: null });
    _andamento.registos.forEach(r => {
        const d = dia(r.data), nome = r.funcionarios?.nome || "?";
        d.equipa[nome] = (d.equipa[nome] || 0) + Number(r.horas || 0);
        if (r.observacoes) d.obs.push(r.observacoes);
    });
    _andamento.tarefas.forEach(t => dia(t.data_prevista).tarefas.push(t));
    _andamento.fotos.forEach(f => dia(f.created_at.slice(0, 10)).fotos.push(f));
    _andamento.diario.forEach(n => { dia(n.data).nota = n; });
    return Object.values(dias).sort((a, b) => b.data.localeCompare(a.data));
}

function htmlDiario() {
    const dias = diasDoDiario();
    const hoje = new Date().toISOString().slice(0, 10);
    const titulo = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-family:var(--font-title,sans-serif);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.6">Diário de obra · últimos ${DIAS_DIARIO} dias</div>
        ${dias.some(d => d.data === hoje) ? "" : `<button class="btn-secondary" style="padding:4px 12px;font-size:12px" onclick="editarNotaDia('${hoje}')">+ Nota de hoje</button>`}
    </div>
    <div id="diarioEd-${hoje}-novo"></div>`;
    if (!dias.length) {
        return titulo + `<div style="font-size:13px;opacity:.7">Nada registado nesta obra nos últimos ${DIAS_DIARIO} dias. O diário enche-se sozinho com as presenças do registo diário, as tarefas do planeamento e as fotos carregadas na obra.</div>`;
    }
    const sem = d => new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" });
    return titulo + dias.map((d, i) => {
        const equipa = Object.entries(d.equipa).map(([n, h]) => `${esc(n)} ${Number(h.toFixed(1))}h`).join(", ");
        const tar = d.tarefas.map(t => `${t.estado === "concluida" ? "✓" : "•"} ${esc(t.descricao)}`).join("<br>");
        const fotos = d.fotos.map(f => `<a href="#" onclick="abrirDocumentoObra('${f.id}');return false" title="${esc(f.nome_ficheiro)}">📷</a>`).join(" ");
        const nota = d.nota;
        return `<div style="padding:9px 0;border-top:${i ? "1px solid rgba(255,255,255,.06)" : "none"};font-size:12px">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
                <b style="font-size:13px;text-transform:capitalize">${sem(d.data)}</b>
                <button class="btn-acao" title="${nota ? "Editar a nota" : "Escrever nota"}" onclick="editarNotaDia('${d.data}')">✏️</button>
            </div>
            ${equipa ? `<div style="opacity:.75">👷 ${equipa}</div>` : ""}
            ${tar ? `<div style="opacity:.75;margin-top:2px">${tar}</div>` : ""}
            ${d.obs.length ? `<div style="opacity:.6;margin-top:2px">${d.obs.map(esc).join(" · ")}</div>` : ""}
            ${fotos ? `<div style="margin-top:2px">${fotos}</div>` : ""}
            ${nota ? `<div style="margin-top:4px;padding:6px 8px;border-radius:6px;background:rgba(181,136,99,.1);white-space:pre-wrap">${esc(nota.notas)}${nota.visivel_cliente ? "" : ` <span title="O cliente não vê esta nota" style="opacity:.5">🔒</span>`}</div>` : ""}
            <div id="diarioEd-${d.data}"></div>
        </div>`;
    }).join("");
}

function editarNotaDia(data) {
    desenharAndamento();
    const box = document.getElementById("diarioEd-" + data) || document.getElementById(`diarioEd-${data}-novo`);
    if (!box) return;
    const n = _andamento.diario.find(x => x.data === data);
    box.innerHTML = `<div style="padding:8px;margin-top:6px;border-radius:8px;background:rgba(255,255,255,.04)">
        <textarea id="diarioTxt" rows="3" maxlength="4000" placeholder="Ocorrências, atrasos, visitas, o que ficou feito…">${esc(n?.notas || "")}</textarea>
        <label style="font-size:12px;display:flex;gap:6px;align-items:center;margin:6px 0"><input type="checkbox" id="diarioVis" style="width:auto"${n?.visivel_cliente ? " checked" : ""}> O cliente vê esta nota</label>
        <div style="display:flex;gap:6px">
            <button class="btn-primary" style="padding:5px 14px;font-size:12px" onclick="gravarNotaDia('${data}')">Gravar</button>
            <button class="btn-secondary" style="padding:5px 14px;font-size:12px" onclick="desenharAndamento()">Cancelar</button>
        </div></div>`;
    document.getElementById("diarioTxt").focus();
}

async function gravarNotaDia(data) {
    const notas = document.getElementById("diarioTxt").value.trim();
    const visivel_cliente = document.getElementById("diarioVis").checked;
    const n = _andamento.diario.find(x => x.data === data);
    let error;
    if (!notas) {
        if (n) ({ error } = await SB.from("obra_diario").delete().eq("id", n.id));
    } else if (n) {
        ({ error } = await SB.from("obra_diario").update({ notas, visivel_cliente }).eq("id", n.id));
    } else {
        ({ error } = await SB.from("obra_diario").insert({ obra_id: _painelObraActual.id, data, notas, visivel_cliente }));
    }
    if (error) return msgAndamento("Não foi possível gravar a nota: " + error.message, "err");
    await carregarPainelAndamento();
}

// PDF do auto para enviar ao cliente (jsPDF, carregado pelo admin.js)
async function pdfAuto(id) {
    const a = _andamento.autos.find(x => x.id === id);
    if (!a) return;
    let jsPDF;
    try { ({ jsPDF } = await carregarJsPDF()); }
    catch (e) { return msgAndamento("Não foi possível preparar o PDF: " + e.message, "err"); }

    const obra = _painelObraActual;
    const ant = pctAnteriores(a.numero);
    const t = totaisAuto(a);
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const W = pdf.internal.pageSize.getWidth(), M = 48;
    let y = 60;
    const eur = v => Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";

    const emp = dadosEmpresaDeclaracao();
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    pdf.text(`${emp.empresa} · NIF ${emp.nif}`, M, y); y += 24;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(16);
    pdf.text(`Auto de medição nº ${a.numero}`, M, y); y += 20;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    pdf.text(`Obra: ${obra.nome}${obra.local ? " · " + obra.local : ""}`, M, y); y += 14;
    pdf.text(`Data: ${dataAnd(a.data)}`, M, y); y += 26;

    const col = [M, W - M - 250, W - M - 170, W - M - 90, W - M];
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
    pdf.text("Serviço", col[0], y);
    pdf.text("Valor", col[1], y, { align: "right" });
    pdf.text("Anterior", col[2], y, { align: "right" });
    pdf.text("Acumulado", col[3], y, { align: "right" });
    pdf.text("Este auto", col[4], y, { align: "right" });
    y += 6; pdf.line(M, y, W - M, y); y += 14;
    pdf.setFont("helvetica", "normal");

    const porServ = Object.fromEntries((a.auto_linhas || []).map(l => [l.obra_servico_id, l]));
    _andamento.servicos.filter(s => porServ[s.id]).forEach(s => {
        const l = porServ[s.id];
        const nome = pdf.splitTextToSize(s.nome, col[1] - col[0] - 60);
        if (y + nome.length * 12 > 760) { pdf.addPage(); y = 60; }
        pdf.text(nome, col[0], y);
        pdf.text(eur(s.valor_orcamento), col[1], y, { align: "right" });
        pdf.text(`${Number(ant[s.id] || 0)}%`, col[2], y, { align: "right" });
        pdf.text(`${Number(l.percentagem)}%`, col[3], y, { align: "right" });
        pdf.text(eur(l.valor), col[4], y, { align: "right" });
        y += nome.length * 12 + 4;
    });

    y += 4; pdf.line(M, y, W - M, y); y += 18;
    pdf.text("Total sem IVA", col[3], y, { align: "right" }); pdf.text(eur(t.base), col[4], y, { align: "right" }); y += 14;
    pdf.text(`IVA ${Number(a.taxa_iva)}%`, col[3], y, { align: "right" }); pdf.text(eur(t.iva), col[4], y, { align: "right" }); y += 16;
    pdf.setFont("helvetica", "bold");
    pdf.text("Total a pagar", col[3], y, { align: "right" }); pdf.text(eur(t.total), col[4], y, { align: "right" }); y += 30;
    pdf.setFont("helvetica", "normal");
    if (a.notas) { pdf.text(pdf.splitTextToSize(a.notas, W - 2 * M), M, y); y += 30; }
    pdf.setFontSize(8);
    pdf.text("Este auto não é uma fatura. A fatura correspondente é emitida em separado.", M, Math.max(y, 780));

    pdf.save(`Auto ${a.numero} - ${obra.nome}.pdf`);
}
