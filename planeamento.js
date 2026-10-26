// =======================================================
// PLANEAMENTO OPERACIONAL
// Quadro semanal estilo Trello: uma coluna por dia, tarefas em cartões.
// Quem está atribuído aparece em iniciais no canto do cartão.
// Depende de: config.js (SB global), dados-publicos.js (feriados e tempo)
// =======================================================

let _planSemana   = null;   // segunda-feira da semana visível (Date local)
let _planFuncs    = [];      // todos, incluindo inativos (para não perder tarefas antigas)
let _planObras    = [];
let _planTarefas  = [];
let _planReunioes = [];     // do Google Calendar, só leitura
let _planTempo    = {};     // previsão do IPMA: { "base" | "t:<id>": { local, dias } }
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
        .select("id, nome, codigo, morada, estado, latitude, longitude")
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

    const pedidoReunioes = planCarregarReunioes(de, ate);
    const pedidoFeriados = carregarFeriados(dias[0].getFullYear(), dias[6].getFullYear());
    const { data, error } = await SB.from("tarefas")
        .select(`
            id, descricao, notas, data_prevista, hora_inicio, duracao_horas,
            duracao_real_horas, ordem,
            estado, usar_morada_obra, morada, latitude, longitude, obra_id,
            obras ( nome, codigo, morada, latitude, longitude ),
            tarefa_funcionarios ( funcionario_id, responsavel )
        `)
        .gte("data_prevista", de)
        .lte("data_prevista", ate)
        .order("ordem", { ascending: true })
        .order("hora_inicio", { ascending: true, nullsFirst: true });
    const reunioes = await pedidoReunioes;
    await pedidoFeriados;

    if (pedido !== _planPedido) return;   // entretanto mudou-se de semana
    if (error) { console.error(error); alert("Erro ao carregar tarefas."); return; }

    _planTarefas  = data || [];
    _planReunioes = reunioes.lista;
    _planTempo    = {};
    const label = document.getElementById("planLabelSemana");
    if (reunioes.aviso) {
        label.textContent += " · ⚠ calendário";
        label.title = reunioes.aviso;
    } else {
        label.title = "";
    }
    desenharGrelha();
    planCarregarTempo(pedido, dias);
}

// Previsão do IPMA para os próximos 5 dias. Chega depois do quadro, que se
// redesenha quando ela vem; se falhar, o quadro fica igual, só sem tempo.
// O cabeçalho mostra o tempo da zona das obras; cada cartão usa o sítio da
// tarefa ou da obra, quando tem GPS.
async function planCarregarTempo(pedido, dias) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje); limite.setDate(limite.getDate() + 5);
    if (dias[6] < hoje || dias[0] >= limite) return;

    const pontos = { base: planZonaDasObras() };
    _planTarefas.forEach(t => {
        const p = planCoordenadas(t);
        if (p) pontos["t:" + t.id] = p;
    });
    try {
        const tempo = await previsaoTempo(pontos);
        if (pedido !== _planPedido) return;
        _planTempo = tempo;
        desenharGrelha();
    } catch (e) {
        console.error("tempo:", e);
    }
}

// Centro das obras ativas com GPS; sem nenhuma, Braga.
function planZonaDasObras() {
    const comGps = _planObras.filter(o => o.estado === "ativa" && o.latitude != null && o.longitude != null);
    if (!comGps.length) return [41.5475, -8.4227];
    const media = k => comGps.reduce((s, o) => s + Number(o[k]), 0) / comGps.length;
    return [media("latitude"), media("longitude")];
}

function planCoordenadas(t) {
    if (!t.usar_morada_obra && t.latitude != null && t.longitude != null) return [t.latitude, t.longitude];
    if (t.obras?.latitude != null && t.obras?.longitude != null) return [t.obras.latitude, t.obras.longitude];
    return null;
}

function planTempoHtml(dia, local) {
    if (!dia) return "";
    const [icone, texto] = tempoIcone(dia.tipo);
    const dica = `${texto} em ${local} · chuva ${dia.prob}% · ${Math.round(dia.tMin)}–${Math.round(dia.tMax)} °C (IPMA)`;
    return `<span class="plan-tempo" title="${escapeHtmlPlan(dica)}">${icone} ${Math.round(dia.tMax)}° · 💧${dia.prob}%</span>`;
}

// Reuniões do Google Calendar (função calendario-google). Se falhar, o quadro
// abre na mesma, só sem reuniões.
async function planCarregarReunioes(de, ate) {
    try {
        const { data: { session } } = await SB.auth.getSession();
        if (!session) return { lista: [] };
        const r = await fetch(`${SUPABASE_URL}/functions/v1/calendario-google`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ de, ate }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
        return { lista: j.reunioes || [], aviso: (j.falhas || []).join(" ") || null };
    } catch (e) {
        console.error("calendario-google:", e);
        return { lista: [], aviso: "Não foi possível ler as reuniões do Google Calendar." };
    }
}

function desenharGrelha() {
    const dias  = planDiasSemana();
    const hoje  = planDataStr(new Date());
    const tabela = document.getElementById("planGrelha");

    let html = "<thead><tr>";
    dias.forEach((d, i) => {
        const ds = planDataStr(d);
        const feriado = feriadoEm(ds);
        const base = _planTempo.base;
        html += `<th class="${ds === hoje ? "plan-hoje" : ""}">
                    ${PLAN_DIAS[i]}<span>${d.getDate()}/${d.getMonth() + 1}</span>
                    ${feriado ? `<span class="plan-feriado">🎉 ${escapeHtmlPlan(feriado)}</span>` : ""}
                    ${base ? planTempoHtml(base.dias[ds], base.local) : ""}
                 </th>`;
    });
    html += "</tr></thead><tbody><tr>";

    // Uma coluna por dia, com os cartões empilhados pela ordem (como no Trello)
    dias.forEach(d => {
        const ds = planDataStr(d);
        html += colunaHtml(ds, planTarefasDoDia(ds),
                           _planReunioes.filter(r => r.data === ds));
    });
    html += "</tr></tbody>";

    tabela.innerHTML = html;
    ligarEventosGrelha();
}

function colunaHtml(dataStr, tarefas, reunioes = []) {
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
        // Aviso de chuva a partir de 60%, que é quando vale a pena mudar
        // um trabalho de exterior
        const tempo = _planTempo["t:" + t.id] || _planTempo.base;
        const prev  = tempo?.dias[dataStr];
        const chuva = prev && prev.prob >= 60 && t.estado !== "concluida" && t.estado !== "cancelada"
            ? `<span class="plan-chuva" title="${escapeHtmlPlan(`Chuva ${prev.prob}% em ${tempo.local} (IPMA)`)}">🌧️ ${prev.prob}%</span> ` : "";
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
                        <span>${chuva}${hora}${Number(t.duracao_horas)}h${real}</span>
                        <div class="plan-avatares">${iniciais}</div>
                    </div>
                </div>`;
    }).join("");

    // Reuniões no topo do dia, pela hora; não se arrastam (mudam-se no Google)
    const cartoesReuniao = reunioes.map(r => {
        const hora = r.dia_inteiro ? "Dia inteiro"
            : r.hora_inicio + (r.hora_fim ? "–" + r.hora_fim : "");
        const dica = [r.titulo, hora, r.local, r.notas].filter(Boolean).join("\n");
        return `<div class="plan-reuniao" title="${escapeHtmlPlan(dica)}">
                    <strong>📅 ${escapeHtmlPlan(r.titulo)}</strong>
                    ${r.local ? `<span>${escapeHtmlPlan(r.local)}</span>` : ""}
                    <span>${escapeHtmlPlan(hora)}</span>
                </div>`;
    }).join("");

    const classes = [excesso.length ? "plan-excesso" : "", feriadoEm(dataStr) ? "plan-dia-feriado" : ""].join(" ");
    return `<td class="plan-celula ${classes}" data-data="${dataStr}">
                ${excesso.length ? `<div class="plan-aviso" title="Mais de 8h no dia">⚠ ${escapeHtmlPlan(excesso.join(", "))}</div>` : ""}
                ${cartoesReuniao}
                ${cartoes}
                <button class="plan-add" title="Nova tarefa">+ Tarefa</button>
            </td>`;
}

// Cartões do dia ordenados pela hora de início; os que não têm hora
// ficam no fim, pela ordem em que foram arrastados.
function planTarefasDoDia(dataStr) {
    return _planTarefas
        .filter(t => t.data_prevista === dataStr)
        .sort((a, b) => {
            if (a.hora_inicio && b.hora_inicio && a.hora_inicio !== b.hora_inicio)
                return a.hora_inicio < b.hora_inicio ? -1 : 1;
            if (!a.hora_inicio !== !b.hora_inicio) return a.hora_inicio ? -1 : 1;
            return (a.ordem || 0) - (b.ordem || 0);
        });
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
        el.addEventListener("click", () => {
            if (Date.now() - _planToqueFim < 400) return;   // acabou de ser largado com o dedo
            abrirModalTarefa(el.dataset.id);
        });
        ligarArrastarComDedo(el);
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
// ARRASTAR COM O DEDO (telemóvel e tablet)
// O arrastar do computador não funciona no ecrã tátil. Aqui, manter o
// dedo premido no cartão meio segundo "pega" nele; depois leva-se para
// outro dia e larga-se. A hora fica a mesma e o dia volta a ordenar-se
// pela hora (planTarefasDoDia). Se o dedo mexer antes do meio segundo,
// é só scroll normal.
// =======================================================
let _planToqueFim = 0;      // quando terminou o último arrasto com o dedo

function ligarArrastarComDedo(el) {
    let espera = null, fantasma = null, alvo = null, x0 = 0, y0 = 0, dx = 0, dy = 0, rolar = null;

    const celulaEm = (x, y) => document.elementFromPoint(x, y)?.closest(".plan-celula") || null;
    const marcarAlvo = td => {
        if (td === alvo) return;
        alvo?.classList.remove("plan-alvo");
        alvo = td;
        alvo?.classList.add("plan-alvo");
    };
    const limpar = () => {
        clearTimeout(espera); espera = null;
        cancelAnimationFrame(rolar); rolar = null;
        fantasma?.remove(); fantasma = null;
        alvo?.classList.remove("plan-alvo"); alvo = null;
        el.classList.remove("plan-a-arrastar");
        el.draggable = true;
    };

    el.addEventListener("touchstart", e => {
        if (e.touches.length !== 1) return limpar();
        const t = e.touches[0];
        x0 = t.clientX; y0 = t.clientY;
        // Sem isto o browser pode começar o arrastar dele e cancelar o nosso
        el.draggable = false;
        espera = setTimeout(() => {
            espera = null;
            const r = el.getBoundingClientRect();
            dx = x0 - r.left; dy = y0 - r.top;
            fantasma = el.cloneNode(true);
            fantasma.classList.add("plan-fantasma");
            fantasma.style.width = r.width + "px";
            fantasma.style.left  = r.left + "px";
            fantasma.style.top   = r.top + "px";
            document.body.appendChild(fantasma);
            el.classList.add("plan-a-arrastar");
            navigator.vibrate?.(25);
            marcarAlvo(celulaEm(x0, y0));
        }, 450);
    }, { passive: true });

    el.addEventListener("touchmove", e => {
        const t = e.touches[0];
        if (!fantasma) {
            // Mexeu antes do tempo: é scroll, não arrastar
            if (espera && Math.hypot(t.clientX - x0, t.clientY - y0) > 10) limpar();
            return;
        }
        e.preventDefault();   // a página não rola enquanto o cartão está pegado
        fantasma.style.left = (t.clientX - dx) + "px";
        fantasma.style.top  = (t.clientY - dy) + "px";
        marcarAlvo(celulaEm(t.clientX, t.clientY));
        // Junto ao topo ou ao fundo do ecrã, a página rola sozinha
        const margem = 70, h = window.innerHeight;
        const vel = t.clientY < margem ? -12 : t.clientY > h - margem ? 12 : 0;
        cancelAnimationFrame(rolar); rolar = null;
        if (vel) {
            const passo = () => {
                window.scrollBy(0, vel);
                marcarAlvo(celulaEm(t.clientX, t.clientY));
                rolar = requestAnimationFrame(passo);
            };
            rolar = requestAnimationFrame(passo);
        }
    }, { passive: false });

    el.addEventListener("touchend", async e => {
        if (!fantasma) return limpar();
        const t = e.changedTouches[0];
        const td = celulaEm(t.clientX, t.clientY);
        const sobre = document.elementFromPoint(t.clientX, t.clientY)?.closest(".plan-cartao");
        limpar();
        _planToqueFim = Date.now();
        if (!td) return;
        const antesDe = sobre && sobre.dataset.id !== el.dataset.id ? sobre.dataset.id : null;
        await moverTarefa(el.dataset.id, td.dataset.data, antesDe);
    });

    el.addEventListener("touchcancel", limpar);
    // O toque longo abre o menu do browser (copiar, etc.) — aqui não
    el.addEventListener("contextmenu", e => { if (espera || fantasma) e.preventDefault(); });
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
    const ids = planTarefasDoDia(data).filter(t => t.id !== id).map(t => t.id);
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
