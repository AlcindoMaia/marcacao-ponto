// =======================================================
// PLANEAMENTO OPERACIONAL
// Grelha semanal: funcionários em linhas, dias em colunas.
// Depende de: config.js (SB global)
// =======================================================

let _planSemana   = null;   // segunda-feira da semana visível (Date local)
let _planFuncs    = [];
let _planObras    = [];
let _planTarefas  = [];
let _planDragId   = null;
let _planDragOrigem = null; // funcionário da linha de onde o cartão saiu
let _planEditId   = null;
let _planPedido   = 0;      // descarta respostas de semanas antigas

const PLAN_DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// ── Datas em hora local (nunca toISOString — dá o dia errado) ──
function planDataStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

function planSegundaDe(data) {
    const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    const diff = (d.getDay() + 6) % 7;          // 0 = segunda
    d.setDate(d.getDate() - diff);
    return d;
}

function planDiasSemana() {
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(_planSemana);
        d.setDate(d.getDate() + i);
        return d;
    });
}

// =======================================================
// INIT
// =======================================================
async function initPlaneamento() {
    if (!_planSemana) _planSemana = planSegundaDe(new Date());

    document.getElementById("planSemanaAnterior").onclick = () => planMudarSemana(-7);
    document.getElementById("planSemanaSeguinte").onclick = () => planMudarSemana(7);
    document.getElementById("planSemanaHoje").onclick     = () => {
        _planSemana = planSegundaDe(new Date());
        carregarPlaneamento();
    };
    document.getElementById("btnNovaTarefa").onclick = () => abrirModalTarefa(null);
    document.getElementById("planModalGuardar").onclick = guardarTarefa;
    document.getElementById("planModalEliminar").onclick = eliminarTarefa;
    document.getElementById("planModalFechar").onclick = fecharModalTarefa;
    document.getElementById("planUsarMoradaObra").onchange = planToggleMorada;
    document.getElementById("planBtnGps").onclick = planApanharGps;

    await Promise.all([carregarPlanFuncionarios(), carregarPlanObras()]);
    await carregarPlaneamento();
}

function planMudarSemana(dias) {
    _planSemana.setDate(_planSemana.getDate() + dias);
    carregarPlaneamento();
}

async function carregarPlanFuncionarios() {
    const { data, error } = await SB.from("funcionarios")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
    if (error) { console.error(error); return; }
    _planFuncs = data || [];
}

async function carregarPlanObras() {
    const { data, error } = await SB.from("obras")
        .select("id, nome, codigo, morada")
        .order("nome");
    if (error) { console.error(error); return; }
    _planObras = data || [];
}

// =======================================================
// CARREGAR E DESENHAR
// =======================================================
async function carregarPlaneamento() {
    const pedido = ++_planPedido;
    const dias = planDiasSemana();
    const de   = planDataStr(dias[0]);
    const ate  = planDataStr(dias[6]);

    document.getElementById("planLabelSemana").textContent =
        `${dias[0].toLocaleDateString("pt-PT")} — ${dias[6].toLocaleDateString("pt-PT")}`;

    const { data, error } = await SB.from("tarefas")
        .select(`
            id, descricao, notas, data_prevista, hora_inicio, duracao_horas,
            estado, usar_morada_obra, morada, latitude, longitude, obra_id,
            obras ( nome, codigo, morada ),
            tarefa_funcionarios ( funcionario_id )
        `)
        .gte("data_prevista", de)
        .lte("data_prevista", ate)
        .order("hora_inicio", { ascending: true, nullsFirst: true });

    if (pedido !== _planPedido) return;   // entretanto mudou-se de semana
    if (error) { console.error(error); alert("Erro ao carregar tarefas."); return; }

    _planTarefas = data || [];
    desenharGrelha();
}

function desenharGrelha() {
    const dias  = planDiasSemana();
    const hoje  = planDataStr(new Date());
    const tabela = document.getElementById("planGrelha");

    let html = "<thead><tr><th class='plan-col-func'>Funcionário</th>";
    dias.forEach((d, i) => {
        const ds = planDataStr(d);
        html += `<th class="${ds === hoje ? "plan-hoje" : ""}">
                    ${PLAN_DIAS[i]}<span>${d.getDate()}/${d.getMonth() + 1}</span>
                 </th>`;
    });
    html += "</tr></thead><tbody>";

    // Linha por funcionário
    _planFuncs.forEach(f => {
        html += `<tr><td class="plan-col-func">${escapeHtmlPlan(f.nome)}</td>`;
        dias.forEach(d => {
            const ds = planDataStr(d);
            const tarefas = _planTarefas.filter(t =>
                t.data_prevista === ds &&
                (t.tarefa_funcionarios || []).some(tf => tf.funcionario_id === f.id)
            );
            const horas = tarefas
                .filter(t => t.estado !== "cancelada")
                .reduce((s, t) => s + Number(t.duracao_horas || 0), 0);
            html += celulaHtml(ds, f.id, tarefas, horas);
        });
        html += "</tr>";
    });

    // Linha de tarefas sem ninguém atribuído
    html += `<tr class="plan-linha-livre"><td class="plan-col-func">Por atribuir</td>`;
    dias.forEach(d => {
        const ds = planDataStr(d);
        const tarefas = _planTarefas.filter(t =>
            t.data_prevista === ds && (t.tarefa_funcionarios || []).length === 0
        );
        html += celulaHtml(ds, null, tarefas, 0);
    });
    html += "</tr></tbody>";

    tabela.innerHTML = html;
    ligarEventosGrelha();
}

function celulaHtml(dataStr, funcId, tarefas, horas) {
    const excesso = horas > 8;
    const cartoes = tarefas.map(t => {
        const obra  = t.obras ? (t.obras.codigo || t.obras.nome) : "Sem obra";
        const hora  = t.hora_inicio ? t.hora_inicio.slice(0, 5) + " · " : "";
        return `<div class="plan-cartao plan-estado-${t.estado}"
                     draggable="true" data-id="${t.id}">
                    <strong>${escapeHtmlPlan(t.descricao)}</strong>
                    <span>${escapeHtmlPlan(obra)}</span>
                    <span>${hora}${Number(t.duracao_horas)}h</span>
                </div>`;
    }).join("");

    return `<td class="plan-celula ${excesso ? "plan-excesso" : ""}"
                data-data="${dataStr}" data-func="${funcId || ""}">
                ${horas > 0 ? `<div class="plan-horas">${horas}h</div>` : ""}
                ${cartoes}
                <button class="plan-add" title="Nova tarefa">+</button>
            </td>`;
}

function ligarEventosGrelha() {
    document.querySelectorAll(".plan-cartao").forEach(el => {
        el.addEventListener("dragstart", e => {
            _planDragId = el.dataset.id;
            _planDragOrigem = el.closest(".plan-celula").dataset.func || null;
            el.classList.add("plan-a-arrastar");
            e.dataTransfer.effectAllowed = "move";
        });
        el.addEventListener("dragend", () => {
            el.classList.remove("plan-a-arrastar");
            _planDragId = null;
            _planDragOrigem = null;
        });
        el.addEventListener("click", () => abrirModalTarefa(el.dataset.id));
    });

    document.querySelectorAll(".plan-celula").forEach(td => {
        td.addEventListener("dragover", e => {
            e.preventDefault();
            td.classList.add("plan-alvo");
        });
        td.addEventListener("dragleave", () => td.classList.remove("plan-alvo"));
        td.addEventListener("drop", async e => {
            e.preventDefault();
            td.classList.remove("plan-alvo");
            if (!_planDragId) return;
            await moverTarefa(_planDragId, td.dataset.data, _planDragOrigem, td.dataset.func || null);
        });
        td.querySelector(".plan-add").addEventListener("click", e => {
            e.stopPropagation();
            abrirModalTarefa(null, td.dataset.data, td.dataset.func || null);
        });
    });
}

// =======================================================
// MOVER (arrastar entre dias / funcionários)
// =======================================================
async function moverTarefa(id, novaData, funcOrigem, funcDestino) {
    const t = _planTarefas.find(x => x.id === id);
    if (!t) return;

    const mudouData   = t.data_prevista !== novaData;
    const mudouPessoa = funcOrigem !== funcDestino;
    if (!mudouData && !mudouPessoa) return;   // largado na própria célula

    if (mudouData) {
        const { error } = await SB.from("tarefas")
            .update({ data_prevista: novaData })
            .eq("id", id);
        if (error) { console.error(error); alert("Não foi possível mover a tarefa."); return; }
    }

    if (mudouPessoa) {
        let error = null;
        if (!funcDestino) {
            // Largada em "Por atribuir": a tarefa fica sem ninguém
            ({ error } = await SB.from("tarefa_funcionarios").delete().eq("tarefa_id", id));
        } else {
            // Troca só a pessoa da linha de origem; os restantes atribuídos mantêm-se.
            // Primeiro acrescenta o destino, para nunca ficar sem ninguém se algo falhar.
            ({ error } = await SB.from("tarefa_funcionarios").upsert(
                { tarefa_id: id, funcionario_id: funcDestino },
                { onConflict: "tarefa_id,funcionario_id", ignoreDuplicates: true }
            ));
            if (!error && funcOrigem) {
                ({ error } = await SB.from("tarefa_funcionarios").delete()
                    .eq("tarefa_id", id).eq("funcionario_id", funcOrigem));
            }
        }
        if (error) {
            console.error(error);
            alert("A tarefa foi movida, mas não foi possível atualizar a atribuição.");
        }
    }
    await carregarPlaneamento();
}

// =======================================================
// MODAL
// =======================================================
function abrirModalTarefa(id, dataPre = null, funcPre = null) {
    _planEditId = id;
    const t = id ? _planTarefas.find(x => x.id === id) : null;

    document.getElementById("planModalTitulo").textContent = t ? "Editar tarefa" : "Nova tarefa";
    document.getElementById("planDescricao").value   = t ? t.descricao : "";
    document.getElementById("planNotas").value       = t && t.notas ? t.notas : "";
    document.getElementById("planData").value        = t ? t.data_prevista : (dataPre || planDataStr(new Date()));
    document.getElementById("planHora").value        = t && t.hora_inicio ? t.hora_inicio.slice(0, 5) : "";
    document.getElementById("planDuracao").value     = t ? t.duracao_horas : 8;
    document.getElementById("planEstado").value      = t ? t.estado : "planeada";

    // Obras
    const selObra = document.getElementById("planObra");
    selObra.innerHTML = `<option value="">— Sem obra —</option>` +
        _planObras.map(o => `<option value="${o.id}">${escapeHtmlPlan(o.codigo ? o.codigo + " · " + o.nome : o.nome)}</option>`).join("");
    selObra.value = t && t.obra_id ? t.obra_id : "";

    // Localização
    const usar = t ? t.usar_morada_obra : true;
    document.getElementById("planUsarMoradaObra").checked = usar;
    document.getElementById("planMorada").value    = t && t.morada ? t.morada : "";
    document.getElementById("planLat").value       = t && t.latitude  != null ? t.latitude  : "";
    document.getElementById("planLng").value       = t && t.longitude != null ? t.longitude : "";
    planToggleMorada();

    // Funcionários
    const atribuidos = t ? (t.tarefa_funcionarios || []).map(x => x.funcionario_id) : (funcPre ? [funcPre] : []);
    document.getElementById("planFuncionarios").innerHTML = _planFuncs.map(f => `
        <label class="plan-check">
            <input type="checkbox" value="${f.id}" ${atribuidos.includes(f.id) ? "checked" : ""}>
            ${escapeHtmlPlan(f.nome)}
        </label>`).join("");

    document.getElementById("planModalEliminar").style.display = t ? "inline-block" : "none";

    const m = document.getElementById("modalTarefa");
    m.style.display = "flex";
    m.classList.remove("hidden");
}

function fecharModalTarefa() {
    const m = document.getElementById("modalTarefa");
    m.style.display = "none";
    m.classList.add("hidden");
    _planEditId = null;
}

function planToggleMorada() {
    const usar = document.getElementById("planUsarMoradaObra").checked;
    document.getElementById("planBlocoMorada").style.display = usar ? "none" : "block";
}

function planApanharGps() {
    if (!navigator.geolocation) { alert("O dispositivo não fornece localização."); return; }
    navigator.geolocation.getCurrentPosition(
        pos => {
            document.getElementById("planLat").value = pos.coords.latitude.toFixed(6);
            document.getElementById("planLng").value = pos.coords.longitude.toFixed(6);
        },
        () => alert("Não foi possível obter a localização.")
    );
}

// Aceita vírgula ou ponto decimal ("38,7" ou "38.7"). Vazio → null, inválido → NaN.
function planNumero(txt) {
    const s = String(txt).trim().replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

async function guardarTarefa() {
    const btn = document.getElementById("planModalGuardar");
    if (btn.disabled) return;          // evita tarefas duplicadas com duplo clique
    btn.disabled = true;
    try {
        await _guardarTarefa();
    } finally {
        btn.disabled = false;
    }
}

async function _guardarTarefa() {
    const descricao = document.getElementById("planDescricao").value.trim();
    if (!descricao) { alert("A descrição é obrigatória."); return; }

    const dataPrevista = document.getElementById("planData").value;
    if (!dataPrevista) { alert("A data é obrigatória."); return; }

    const duracao = planNumero(document.getElementById("planDuracao").value);
    if (!(duracao > 0)) { alert("A duração tem de ser maior que zero."); return; }

    const usarObra = document.getElementById("planUsarMoradaObra").checked;
    const lat = usarObra ? null : planNumero(document.getElementById("planLat").value);
    const lng = usarObra ? null : planNumero(document.getElementById("planLng").value);
    if (Number.isNaN(lat) || (lat !== null && Math.abs(lat) > 90)) {
        alert("Latitude inválida."); return;
    }
    if (Number.isNaN(lng) || (lng !== null && Math.abs(lng) > 180)) {
        alert("Longitude inválida."); return;
    }

    const anterior = _planEditId ? _planTarefas.find(x => x.id === _planEditId) : null;

    const payload = {
        descricao,
        notas:            document.getElementById("planNotas").value.trim() || null,
        obra_id:          document.getElementById("planObra").value || null,
        data_prevista:    dataPrevista,
        hora_inicio:      document.getElementById("planHora").value || null,
        duracao_horas:    duracao,
        estado:           document.getElementById("planEstado").value,
        usar_morada_obra: usarObra,
        morada:           usarObra ? null : (document.getElementById("planMorada").value.trim() || null),
        latitude:         lat,
        longitude:        lng
    };
    // Guarda a data de conclusão só na transição para "concluída"
    if (payload.estado !== "concluida") {
        payload.concluida_em = null;
    } else if (!anterior || anterior.estado !== "concluida") {
        payload.concluida_em = new Date().toISOString();
    }

    let tarefaId = _planEditId;

    if (tarefaId) {
        const { error } = await SB.from("tarefas").update(payload).eq("id", tarefaId);
        if (error) { console.error(error); alert("Erro ao guardar."); return; }
    } else {
        const { data, error } = await SB.from("tarefas").insert(payload).select("id").single();
        if (error) { console.error(error); alert("Erro ao criar tarefa."); return; }
        tarefaId = data.id;
    }

    // Atribuições: só mexe no que mudou (mantém as linhas existentes intactas)
    const escolhidos = [...document.querySelectorAll("#planFuncionarios input:checked")].map(i => i.value);
    const atuais     = anterior ? (anterior.tarefa_funcionarios || []).map(x => x.funcionario_id) : [];
    const adicionar  = escolhidos.filter(fid => !atuais.includes(fid));
    const remover    = atuais.filter(fid => !escolhidos.includes(fid));

    let erroAtrib = null;
    if (adicionar.length) {
        const { error } = await SB.from("tarefa_funcionarios")
            .insert(adicionar.map(fid => ({ tarefa_id: tarefaId, funcionario_id: fid })));
        erroAtrib = error;
    }
    if (!erroAtrib && remover.length) {
        const { error } = await SB.from("tarefa_funcionarios").delete()
            .eq("tarefa_id", tarefaId).in("funcionario_id", remover);
        erroAtrib = error;
    }
    if (erroAtrib) {
        console.error(erroAtrib);
        alert("A tarefa foi guardada, mas não foi possível atualizar os funcionários atribuídos.");
    }

    fecharModalTarefa();
    await carregarPlaneamento();
}

async function eliminarTarefa() {
    if (!_planEditId) return;
    if (!confirm("Eliminar esta tarefa?")) return;
    const { error } = await SB.from("tarefas").delete().eq("id", _planEditId);
    if (error) { console.error(error); alert("Erro ao eliminar."); return; }
    fecharModalTarefa();
    await carregarPlaneamento();
}

function escapeHtmlPlan(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
