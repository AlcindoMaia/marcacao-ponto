// =======================================================
// PLANEAMENTO OPERACIONAL
// Grelha semanal: funcionários em linhas, dias em colunas.
// Depende de: config.js (SB global)
// =======================================================

let _planSemana   = null;   // segunda-feira da semana visível (Date local)
let _planFuncs    = [];      // todos, incluindo inativos (para não perder tarefas antigas)
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

    let html = "<thead><tr><th class='plan-col-func'>Funcionário</th>";
    dias.forEach((d, i) => {
        const ds = planDataStr(d);
        html += `<th class="${ds === hoje ? "plan-hoje" : ""}">
                    ${PLAN_DIAS[i]}<span>${d.getDate()}/${d.getMonth() + 1}</span>
                 </th>`;
    });
    html += "</tr></thead><tbody>";

    // Linha por funcionário: os ativos, mais os inativos que ainda têm tarefas nesta semana
    const comTarefas = new Set(_planTarefas.flatMap(t =>
        (t.tarefa_funcionarios || []).map(tf => tf.funcionario_id)));
    _planFuncs.filter(f => f.ativo !== false || comTarefas.has(f.id)).forEach(f => {
        const nome = escapeHtmlPlan(f.nome) + (f.ativo === false ? " <em>(inativo)</em>" : "");
        html += `<tr><td class="plan-col-func">${nome}</td>`;
        dias.forEach(d => {
            const ds = planDataStr(d);
            const tarefas = _planTarefas.filter(t =>
                t.data_prevista === ds &&
                (t.tarefa_funcionarios || []).some(tf => tf.funcionario_id === f.id)
            );
            const horas = tarefas
                .filter(t => t.estado !== "cancelada")
                .reduce((s, t) => s + planHorasEfetivas(t), 0);
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
        const real  = t.duracao_real_horas != null ? ` · real ${Number(t.duracao_real_horas)}h` : "";
        const resp  = funcId && (t.tarefa_funcionarios || [])
            .some(tf => tf.funcionario_id === funcId && tf.responsavel);
        return `<div class="plan-cartao plan-estado-${t.estado}"
                     draggable="true" data-id="${t.id}">
                    <strong>${resp ? '<span class="plan-resp" title="Responsável">★</span>' : ""}${escapeHtmlPlan(t.descricao)}</strong>
                    <span>${escapeHtmlPlan(obra)}</span>
                    <span>${hora}${Number(t.duracao_horas)}h${real}</span>
                </div>`;
    }).join("");

    return `<td class="plan-celula ${excesso ? "plan-excesso" : ""}"
                data-data="${dataStr}" data-func="${funcId || ""}">
                ${horas > 0 ? `<div class="plan-horas">${horas}h</div>` : ""}
                ${cartoes}
                <button class="plan-add" title="Nova tarefa">+</button>
            </td>`;
}

// Horas que contam para a carga do dia: as reais, se já foram registadas
function planHorasEfetivas(t) {
    return Number(t.duracao_real_horas != null ? t.duracao_real_horas : (t.duracao_horas || 0));
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
            // Largado em cima de outro cartão → fica antes dele; senão vai para o fim
            const alvo = e.target.closest(".plan-cartao");
            const antesDe = alvo && alvo.dataset.id !== _planDragId ? alvo.dataset.id : null;
            await moverTarefa(_planDragId, td.dataset.data, _planDragOrigem, td.dataset.func || null, antesDe);
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
async function moverTarefa(id, novaData, funcOrigem, funcDestino, antesDe = null) {
    const t = _planTarefas.find(x => x.id === id);
    if (!t) return;

    const mudouData   = t.data_prevista !== novaData;
    const mudouPessoa = funcOrigem !== funcDestino;
    if (!mudouData && !mudouPessoa) {
        // Mesma célula: só muda a ordem
        if (antesDe) {
            await planReordenar(id, novaData, funcDestino, antesDe);
            await carregarPlaneamento();
        }
        return;
    }

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
            // Se quem saiu era o responsável, a responsabilidade passa para quem entra
            const eraResp = (t.tarefa_funcionarios || [])
                .some(tf => tf.funcionario_id === funcOrigem && tf.responsavel);
            if (!error && funcOrigem && eraResp) {
                ({ error } = await SB.from("tarefa_funcionarios").update({ responsavel: true })
                    .eq("tarefa_id", id).eq("funcionario_id", funcDestino));
            }
        }
        if (error) {
            console.error(error);
            alert("A tarefa foi movida, mas não foi possível atualizar a atribuição.");
        }
    }
    await planReordenar(id, novaData, funcDestino, antesDe);
    await carregarPlaneamento();
}

// Renumera a ordem das tarefas da célula de destino, com a tarefa movida
// antes de "antesDe" (ou no fim). Só grava as que mudam.
async function planReordenar(id, data, funcId, antesDe) {
    const naCelula = _planTarefas.filter(t =>
        t.id !== id && t.data_prevista === data &&
        (funcId
            ? (t.tarefa_funcionarios || []).some(tf => tf.funcionario_id === funcId)
            : (t.tarefa_funcionarios || []).length === 0)
    );
    const ids = naCelula.map(t => t.id);
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
function abrirModalTarefa(id, dataPre = null, funcPre = null) {
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
    const atribuidos = t ? (t.tarefa_funcionarios || []).map(x => x.funcionario_id) : (funcPre ? [funcPre] : []);
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
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
