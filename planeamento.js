// =======================================================
// PLANEAMENTO OPERACIONAL
// Quadro semanal estilo Trello: uma coluna por dia, tarefas em cartões.
// Quem está atribuído aparece em iniciais no canto do cartão.
// Depende de: config.js (SB global)
// =======================================================

let _planSemana   = null;   // segunda-feira da semana visível (Date local)
let _planFuncs    = [];      // todos, incluindo inativos (para não perder tarefas antigas)
let _planObras    = [];
let _planTarefas  = [];
let _planDragId   = null;
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
        .select("id, nome, ativo")
        .order("nome");
    if (error) { console.error(error); return; }
    _planFuncs = data || [];
}

async function carregarPlanObras() {
    const { data, error } = await SB.from("obras")
        .select("id, nome, codigo, morada, estado")
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
            duracao_real_horas, ordem,
            estado, usar_morada_obra, morada, latitude, longitude, obra_id,
            obras ( nome, codigo, morada ),
            tarefa_funcionarios ( funcionario_id, responsavel )
        `)
        .gte("data_prevista", de)
        .lte("data_prevista", ate)
        .order("ordem", { ascending: true })
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

    let html = "<thead><tr>";
    dias.forEach((d, i) => {
        const ds = planDataStr(d);
        html += `<th class="${ds === hoje ? "plan-hoje" : ""}">
                    ${PLAN_DIAS[i]}<span>${d.getDate()}/${d.getMonth() + 1}</span>
                 </th>`;
    });
    html += "</tr></thead><tbody><tr>";

    // Uma coluna por dia, com os cartões empilhados pela ordem (como no Trello)
    dias.forEach(d => {
        const ds = planDataStr(d);
        html += colunaHtml(ds, _planTarefas.filter(t => t.data_prevista === ds));
    });
    html += "</tr></tbody>";

    tabela.innerHTML = html;
    ligarEventosGrelha();
}

function colunaHtml(dataStr, tarefas) {
    // Quem passa das 8h neste dia (soma das tarefas não canceladas)
    const horasPorFunc = {};
    tarefas.filter(t => t.estado !== "cancelada").forEach(t =>
        (t.tarefa_funcionarios || []).forEach(tf => {
            horasPorFunc[tf.funcionario_id] = (horasPorFunc[tf.funcionario_id] || 0) + planHorasEfetivas(t);
        }));
    const excesso = Object.entries(horasPorFunc).filter(([, h]) => h > 8)
        .map(([fid, h]) => `${planNomeFunc(fid)} ${h}h`);

    const cartoes = tarefas.map(t => {
        const obra  = t.obras ? (t.obras.codigo || t.obras.nome) : "Sem obra";
        const hora  = t.hora_inicio ? t.hora_inicio.slice(0, 5) + " · " : "";
        const real  = t.duracao_real_horas != null ? ` · real ${Number(t.duracao_real_horas)}h` : "";
        // Responsável primeiro, depois os restantes por nome
        const atrib = [...(t.tarefa_funcionarios || [])].sort((a, b) =>
            (b.responsavel - a.responsavel) || planNomeFunc(a.funcionario_id).localeCompare(planNomeFunc(b.funcionario_id)));
        const iniciais = atrib.map(tf => {
            const nome = planNomeFunc(tf.funcionario_id);
            return `<span class="plan-avatar ${tf.responsavel ? "plan-avatar-resp" : ""}"
                          title="${escapeHtmlPlan(nome)}${tf.responsavel ? " (responsável)" : ""}">${escapeHtmlPlan(planIniciais(nome))}</span>`;
        }).join("");
        return `<div class="plan-cartao plan-estado-${t.estado}"
                     draggable="true" data-id="${t.id}">
                    <strong>${escapeHtmlPlan(t.descricao)}</strong>
                    <span>${escapeHtmlPlan(obra)}</span>
                    <div class="plan-cartao-rodape">
                        <span>${hora}${Number(t.duracao_horas)}h${real}</span>
                        <div class="plan-avatares">${iniciais}</div>
                    </div>
                </div>`;
    }).join("");

    return `<td class="plan-celula ${excesso.length ? "plan-excesso" : ""}" data-data="${dataStr}">
                ${excesso.length ? `<div class="plan-aviso" title="Mais de 8h no dia">⚠ ${escapeHtmlPlan(excesso.join(", "))}</div>` : ""}
                ${cartoes}
                <button class="plan-add" title="Nova tarefa">+ Tarefa</button>
            </td>`;
}

function planNomeFunc(id) {
    const f = _planFuncs.find(x => x.id === id);
    return f ? f.nome : "?";
}

// "Alcindo Maia" → "AM"; "Ramiro" → "RA"
function planIniciais(nome) {
    const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "?";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// Horas que contam para a carga do dia: as reais, se já foram registadas
function planHorasEfetivas(t) {
    return Number(t.duracao_real_horas != null ? t.duracao_real_horas : (t.duracao_horas || 0));
}

function ligarEventosGrelha() {
    document.querySelectorAll(".plan-cartao").forEach(el => {
        el.addEventListener("dragstart", e => {
            _planDragId = el.dataset.id;
            el.classList.add("plan-a-arrastar");
            e.dataTransfer.effectAllowed = "move";
        });
        el.addEventListener("dragend", () => {
            el.classList.remove("plan-a-arrastar");
            _planDragId = null;
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
            // Largado em cima de outro cartão → fica antes dele; senão vai para o fim
            const alvo = e.target.closest(".plan-cartao");
            const antesDe = alvo && alvo.dataset.id !== _planDragId ? alvo.dataset.id : null;
            await moverTarefa(_planDragId, td.dataset.data, antesDe);
        });
        td.querySelector(".plan-add").addEventListener("click", e => {
            e.stopPropagation();
            abrirModalTarefa(null, td.dataset.data);
        });
    });
}

// =======================================================
// MOVER (arrastar entre dias / mudar a ordem no dia)
// As pessoas atribuídas mudam-se no cartão, não ao arrastar.
// =======================================================
async function moverTarefa(id, novaData, antesDe = null) {
    const t = _planTarefas.find(x => x.id === id);
    if (!t) return;

    if (t.data_prevista === novaData) {
        // Mesmo dia: só muda a ordem
        if (antesDe) {
            await planReordenar(id, novaData, antesDe);
            await carregarPlaneamento();
        }
        return;
    }

    const { error } = await SB.from("tarefas")
        .update({ data_prevista: novaData })
        .eq("id", id);
    if (error) { console.error(error); alert("Não foi possível mover a tarefa."); return; }

    await planReordenar(id, novaData, antesDe);
    await carregarPlaneamento();
}

// Renumera a ordem das tarefas do dia de destino, com a tarefa movida
// antes de "antesDe" (ou no fim). Só grava as que mudam.
async function planReordenar(id, data, antesDe) {
    const ids = _planTarefas.filter(t => t.id !== id && t.data_prevista === data).map(t => t.id);
    const pos = antesDe ? ids.indexOf(antesDe) : -1;
    ids.splice(pos >= 0 ? pos : ids.length, 0, id);

    const mudancas = ids
        .map((tid, i) => ({ tid, i, atual: (_planTarefas.find(t => t.id === tid) || {}).ordem }))
        .filter(x => x.atual !== x.i);
    const resultados = await Promise.all(mudancas.map(x =>
        SB.from("tarefas").update({ ordem: x.i }).eq("id", x.tid)));
    const falhou = resultados.find(r => r.error);
    if (falhou) console.error(falhou.error);
}

// =======================================================
// MODAL
// =======================================================
function abrirModalTarefa(id, dataPre = null) {
    _planEditId = id;
    const t = id ? _planTarefas.find(x => x.id === id) : null;

    document.getElementById("planModalTitulo").textContent = t ? "Editar tarefa" : "Nova tarefa";
    document.getElementById("planDescricao").value   = t ? t.descricao : "";
    document.getElementById("planNotas").value       = t && t.notas ? t.notas : "";
    document.getElementById("planData").value        = t ? t.data_prevista : (dataPre || planDataStr(new Date()));
    document.getElementById("planHora").value        = t && t.hora_inicio ? t.hora_inicio.slice(0, 5) : "";
    document.getElementById("planDuracao").value     = t ? t.duracao_horas : 8;
    document.getElementById("planDuracaoReal").value = t && t.duracao_real_horas != null ? t.duracao_real_horas : "";
    document.getElementById("planEstado").value      = t ? t.estado : "planeada";

    // Obras
    const selObra = document.getElementById("planObra");
    // Obras concluídas ficam de fora, exceto a que a tarefa já tem
    selObra.innerHTML = `<option value="">— Sem obra —</option>` +
        _planObras.filter(o => o.estado !== "concluida" || (t && t.obra_id === o.id)).map(o => `<option value="${o.id}">${escapeHtmlPlan(o.codigo ? o.codigo + " · " + o.nome : o.nome)}</option>`).join("");
    selObra.value = t && t.obra_id ? t.obra_id : "";

    // Localização
    const usar = t ? t.usar_morada_obra : true;
    document.getElementById("planUsarMoradaObra").checked = usar;
    document.getElementById("planMorada").value    = t && t.morada ? t.morada : "";
    document.getElementById("planLat").value       = t && t.latitude  != null ? t.latitude  : "";
    document.getElementById("planLng").value       = t && t.longitude != null ? t.longitude : "";
    planToggleMorada();

    // Funcionários
    const atribuidos = t ? (t.tarefa_funcionarios || []).map(x => x.funcionario_id) : [];
    const respAtual  = t ? ((t.tarefa_funcionarios || []).find(x => x.responsavel) || {}).funcionario_id : null;
    const listaFuncs = document.getElementById("planFuncionarios");
    listaFuncs.innerHTML = _planFuncs
        .filter(f => f.ativo !== false || atribuidos.includes(f.id))
        .map(f => `
        <div class="plan-func-linha">
            <label class="plan-check">
                <input type="checkbox" value="${f.id}" ${atribuidos.includes(f.id) ? "checked" : ""}>
                ${escapeHtmlPlan(f.nome)}${f.ativo === false ? " (inativo)" : ""}
            </label>
            <label class="plan-check plan-resp-opcao" title="Responsável pela tarefa">
                <input type="radio" name="planResp" value="${f.id}" ${respAtual === f.id ? "checked" : ""}
                       ${atribuidos.includes(f.id) ? "" : "disabled"}>
                responsável
            </label>
        </div>`).join("");
    // Só quem está atribuído pode ser responsável
    listaFuncs.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.onchange = () => {
            const radio = listaFuncs.querySelector(`input[name="planResp"][value="${cb.value}"]`);
            radio.disabled = !cb.checked;
            if (!cb.checked) radio.checked = false;
        };
    });

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

    const duracaoReal = planNumero(document.getElementById("planDuracaoReal").value);
    if (Number.isNaN(duracaoReal) || (duracaoReal !== null && duracaoReal < 0)) {
        alert("As horas reais têm de ser um número igual ou maior que zero."); return;
    }

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
        duracao_real_horas: duracaoReal,
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
        // Nova tarefa vai para o fim do dia
        const doDia = _planTarefas.filter(x => x.data_prevista === dataPrevista);
        payload.ordem = doDia.length ? Math.max(...doDia.map(x => x.ordem || 0)) + 1 : 0;
        const { data, error } = await SB.from("tarefas").insert(payload).select("id").single();
        if (error) { console.error(error); alert("Erro ao criar tarefa."); return; }
        tarefaId = data.id;
    }

    // Atribuições: só mexe no que mudou (mantém as linhas existentes intactas)
    const escolhidos = [...document.querySelectorAll('#planFuncionarios input[type="checkbox"]:checked')].map(i => i.value);
    const radioResp  = document.querySelector('#planFuncionarios input[name="planResp"]:checked');
    const resp       = radioResp && escolhidos.includes(radioResp.value) ? radioResp.value : null;
    const respAntes  = anterior ? ((anterior.tarefa_funcionarios || []).find(x => x.responsavel) || {}).funcionario_id || null : null;
    const atuais     = anterior ? (anterior.tarefa_funcionarios || []).map(x => x.funcionario_id) : [];
    const adicionar  = escolhidos.filter(fid => !atuais.includes(fid));
    const remover    = atuais.filter(fid => !escolhidos.includes(fid));

    let erroAtrib = null;
    if (adicionar.length) {
        const { error } = await SB.from("tarefa_funcionarios")
            .insert(adicionar.map(fid => ({ tarefa_id: tarefaId, funcionario_id: fid, responsavel: fid === resp })));
        erroAtrib = error;
    }
    if (!erroAtrib && remover.length) {
        const { error } = await SB.from("tarefa_funcionarios").delete()
            .eq("tarefa_id", tarefaId).in("funcionario_id", remover);
        erroAtrib = error;
    }
    // Responsável: limpa o anterior e marca o novo (os recém-inseridos já vêm marcados)
    if (!erroAtrib && resp !== respAntes) {
        if (respAntes && escolhidos.includes(respAntes)) {
            const { error } = await SB.from("tarefa_funcionarios").update({ responsavel: false })
                .eq("tarefa_id", tarefaId).eq("funcionario_id", respAntes);
            erroAtrib = error;
        }
        if (!erroAtrib && resp && !adicionar.includes(resp)) {
            const { error } = await SB.from("tarefa_funcionarios").update({ responsavel: true })
                .eq("tarefa_id", tarefaId).eq("funcionario_id", resp);
            erroAtrib = error;
        }
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
    // Escapa também a plica: sem ela, um atributo delimitado por plicas
    // fica aberto a quem souber disso.
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
