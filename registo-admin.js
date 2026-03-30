// =======================================================
// REGISTO DIÁRIO DO ENCARREGADO
// =======================================================

let _obras     = [];
let _funcs     = [];
let _dataActual = hoje();

// =======================================================
// UTILS
// =======================================================
function hoje() {
    return new Date().toISOString().split("T")[0];
}

function fmtDataLabel(iso) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
}

function mostrarEcrã(id) {
    ["ecrãLogin", "ecrãLoading", "ecrãPrincipal", "ecrãComparacao"]
        .forEach(e => {
            const el = document.getElementById(e);
            if (el) el.style.display = e === id ? "flex" : "none";
        });
    if (id === "ecrãPrincipal") {
        document.getElementById("ecrãPrincipal").style.display = "flex";
        document.getElementById("ecrãPrincipal").style.flexDirection = "column";
    }
}

function feedback(msg, tipo = "ok") {
    const el = document.getElementById("feedbackGeral");
    if (!el) return;
    el.textContent = msg;
    el.className   = "feedback-geral " + tipo;
    if (tipo === "ok") setTimeout(() => { el.textContent = ""; el.className = "feedback-geral"; }, 3000);
}

// =======================================================
// AUTH
// =======================================================
document.getElementById("loginBtn").addEventListener("click", fazerLogin);
document.getElementById("loginPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") fazerLogin();
});

async function fazerLogin() {
    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const msg      = document.getElementById("loginMsg");
    msg.textContent = "A autenticar…";

    const { data, error } = await SB.auth.signInWithPassword({ email, password });
    if (error) { msg.textContent = "Credenciais inválidas."; return; }

    await iniciarApp();
}

async function fazerLogout() {
    await SB.auth.signOut();
    mostrarEcrã("ecrãLogin");
}

async function init() {
    mostrarEcrã("ecrãLoading");
    const { data: { session } } = await SB.auth.getSession();
    if (session) {
        await iniciarApp();
    } else {
        mostrarEcrã("ecrãLogin");
    }
}

async function iniciarApp() {
    mostrarEcrã("ecrãLoading");

    // Carregar dados base
    const [obrasRes, funcsRes] = await Promise.all([
        SB.from("obras").select("id, nome").order("nome"),
        SB.from("funcionarios").select("id, nome, valor_dia").eq("ativo", true).order("nome")
    ]);

    _obras = obrasRes.data || [];
    _funcs = funcsRes.data || [];

    // Definir data de hoje
    const dataEl = document.getElementById("dataRegisto");
    dataEl.value = _dataActual;
    document.getElementById("heroData").textContent = fmtDataLabel(_dataActual);

    mostrarEcrã("ecrãPrincipal");
    await carregarParaData();

    // Pedir permissão de notificações
    pedirPermissaoNotificacoes();
}

// =======================================================
// CARREGAR PARA UMA DATA
// =======================================================
async function carregarParaData() {
    const data = document.getElementById("dataRegisto").value;
    if (!data) return;
    _dataActual = data;
    document.getElementById("heroData").textContent = fmtDataLabel(data);

    // Buscar registos já existentes para esta data
    const { data: existentes } = await SB.from("registos_admin")
        .select("id, funcionario_id, obra_id, horas, observacoes")
        .eq("data", data);

    renderFuncionarios(existentes || []);
}

// =======================================================
// RENDER LISTA DE FUNCIONÁRIOS
// =======================================================
function renderFuncionarios(existentes) {
    const lista = document.getElementById("funcLista");
    lista.innerHTML = "";

    _funcs.forEach(f => {
        // Registos existentes para este funcionário
        const registosFunc = existentes.filter(r => r.funcionario_id === f.id);

        const card = document.createElement("div");
        card.className = "func-card";
        card.dataset.funcId = f.id;
        if (registosFunc.length > 0) card.classList.add("guardado");

        // Resumo das horas já registadas
        const totalH = registosFunc.reduce((s, r) => s + Number(r.horas), 0);
        const resumo = registosFunc.length > 0
            ? `${totalH.toFixed(1)}h · ${registosFunc.length} obra(s)`
            : "Sem registo";

        card.innerHTML = `
            <div class="func-card-header">
                <div class="func-avatar">${f.nome.charAt(0).toUpperCase()}</div>
                <div class="func-info">
                    <div class="func-nome">${f.nome}</div>
                    <div class="func-resumo">${resumo}</div>
                </div>
                <div class="func-toggle">▼</div>
            </div>
            <div class="func-linhas" id="linhas-${f.id}"></div>
        `;

        // Toggle
        card.querySelector(".func-card-header").addEventListener("click", () => {
            card.classList.toggle("aberto");
        });

        lista.appendChild(card);

        // Adicionar linhas de registo
        const linhasDiv = document.getElementById(`linhas-${f.id}`);

        if (registosFunc.length > 0) {
            registosFunc.forEach(r => adicionarLinha(linhasDiv, f.id, r));
        } else {
            adicionarLinha(linhasDiv, f.id, null);
        }

        // Botão adicionar linha
        const btnAdd = document.createElement("button");
        btnAdd.className = "btn-add-linha";
        btnAdd.textContent = "+ Adicionar outra obra";
        btnAdd.onclick = () => adicionarLinha(linhasDiv, f.id, null, btnAdd);
        linhasDiv.appendChild(btnAdd);
    });
}

function adicionarLinha(container, funcId, registo = null, btnAdd = null) {
    const linha = document.createElement("div");
    linha.className = "linha-registo";
    linha.dataset.funcId = funcId;
    if (registo) linha.dataset.registoId = registo.id;

    // Select de obras
    const selectObra = document.createElement("select");
    selectObra.innerHTML = `<option value="">— Obra —</option>` +
        _obras.map(o => `<option value="${o.id}" ${registo?.obra_id === o.id ? "selected" : ""}>${o.nome}</option>`).join("");

    // Input de horas
    const inputHoras = document.createElement("input");
    inputHoras.type        = "number";
    inputHoras.min         = "0";
    inputHoras.max         = "24";
    inputHoras.step        = "0.5";
    inputHoras.placeholder = "h";
    inputHoras.value       = registo ? Number(registo.horas).toString() : "";

    // Botão remover
    const btnRm = document.createElement("button");
    btnRm.className = "btn-rm-linha";
    btnRm.innerHTML = "×";
    btnRm.onclick = () => {
        linha.remove();
        // Se era o último, reabrir com uma linha vazia
        const restantes = container.querySelectorAll(".linha-registo");
        if (restantes.length === 0) adicionarLinha(container, funcId, null, container.querySelector(".btn-add-linha"));
    };

    linha.appendChild(selectObra);
    linha.appendChild(inputHoras);
    linha.appendChild(btnRm);

    // Inserir antes do botão de adicionar
    if (btnAdd) container.insertBefore(linha, btnAdd);
    else container.appendChild(linha);
}

// =======================================================
// GUARDAR TUDO
// =======================================================
async function guardarTudo() {
    const data = _dataActual;
    const linhas = document.querySelectorAll(".linha-registo");
    const registos = [];

    for (const linha of linhas) {
        const funcId = linha.dataset.funcId;
        const obraId = linha.querySelector("select").value || null;
        const horas  = parseFloat(linha.querySelector("input").value);
        if (!horas || horas <= 0) continue; // ignorar linhas sem horas
        registos.push({
            data,
            funcionario_id: funcId,
            obra_id:        obraId,
            horas:          horas
        });
    }

    if (registos.length === 0) {
        feedback("Nenhuma hora preenchida.", "erro");
        return;
    }

    // Buscar IDs existentes para esta data e apagar individualmente
    const { data: existentes } = await SB.from("registos_admin")
        .select("id")
        .eq("data", data);

    if (existentes && existentes.length > 0) {
        const ids = existentes.map(r => r.id);
        const { error: errDel } = await SB.from("registos_admin")
            .delete()
            .in("id", ids);
        if (errDel) { feedback("Erro ao atualizar: " + errDel.message, "erro"); return; }
    }

    const { error } = await SB.from("registos_admin").insert(registos);
    if (error) { feedback("Erro ao guardar: " + error.message, "erro"); return; }

    feedback(`✓ ${registos.length} linha(s) guardada(s) com sucesso!`, "ok");

    // Actualizar visual dos cards
    document.querySelectorAll(".func-card").forEach(card => {
        const funcId = card.dataset.funcId;
        const temLinhas = [...document.querySelectorAll(`.linha-registo[data-func-id="${funcId}"]`)]
            .some(l => parseFloat(l.querySelector("input").value) > 0);
        card.classList.toggle("guardado", temLinhas);
        // Actualizar resumo
        const totalH = [...document.querySelectorAll(`.linha-registo[data-func-id="${funcId}"]`)]
            .reduce((s, l) => s + (parseFloat(l.querySelector("input").value) || 0), 0);
        const nObras = [...document.querySelectorAll(`.linha-registo[data-func-id="${funcId}"]`)]
            .filter(l => parseFloat(l.querySelector("input").value) > 0).length;
        if (temLinhas) card.querySelector(".func-resumo").textContent = `${totalH.toFixed(1)}h · ${nObras} obra(s)`;
    });
}

// =======================================================
// COMPARAÇÃO COM REGISTOS DO COLABORADOR
// =======================================================
async function mostrarComparacao() {
    mostrarEcrã("ecrãComparacao");
    const lista = document.getElementById("compLista");
    lista.innerHTML = `<div style="padding:32px;text-align:center;opacity:.4;font-size:13px">A carregar…</div>`;

    const data = _dataActual;

    // Buscar registos admin + registos ponto do mesmo dia
    const [adminRes, pontoRes] = await Promise.all([
        SB.from("registos_admin")
            .select("funcionario_id, obra_id, horas, funcionarios(nome), obras(nome)")
            .eq("data", data),
        SB.from("vw_registos_ponto")
            .select("funcionario, obra, horas, estado")
            .eq("dia", data)
    ]);

    const admin = adminRes.data || [];
    const ponto = pontoRes.data || [];

    if (admin.length === 0) {
        lista.innerHTML = `<div style="padding:32px;text-align:center;opacity:.4;font-size:13px;font-family:var(--fh);letter-spacing:1px">SEM REGISTO ADMIN PARA ESTA DATA</div>`;
        return;
    }

    let html = `<div style="font-family:var(--fh);font-size:11px;letter-spacing:1.5px;text-transform:uppercase;opacity:.4;margin-bottom:8px">${fmtDataLabel(data)}</div>`;

    let nOk = 0, nAvisos = 0, nErros = 0;

    admin.forEach(ra => {
        const nomeFunc  = ra.funcionarios?.nome || "?";
        const nomeObra  = ra.obras?.nome || "Sem obra";
        const horasAdmin = Number(ra.horas);

        // Procurar registo do colaborador para o mesmo funcionário e data
        const regColab = ponto.find(p => p.funcionario === nomeFunc);

        let divergencia = "ok";
        let detalhes = "";

        if (!regColab) {
            divergencia = "sem_registo_colab";
            detalhes = `Sem registo de ponto · Admin: ${horasAdmin}h em ${nomeObra}`;
            nErros++;
        } else if (regColab.estado === "Incompleto") {
            divergencia = "registo_incompleto";
            detalhes = `Registo incompleto (sem saída) · Admin: ${horasAdmin}h`;
            nErros++;
        } else {
            // Converter horas do colaborador para decimal
            let horasColab = 0;
            if (regColab.horas && typeof regColab.horas === "string" && regColab.horas.includes(":")) {
                const [hh, mm] = regColab.horas.split(":").map(Number);
                horasColab = hh + mm / 60;
            } else {
                horasColab = Number(regColab.horas) || 0;
            }
            // Desconto almoço
            if (horasColab > 0) horasColab = Math.max(0, horasColab - 1);

            const diffH = Math.abs(horasAdmin - horasColab);
            const obrasDif = regColab.obra && nomeObra !== regColab.obra;

            if (diffH > 0.5 && obrasDif) {
                divergencia = "obra_diferente";
                detalhes = `Admin: ${horasAdmin}h · ${nomeObra} | Colab: ${horasColab.toFixed(1)}h · ${regColab.obra}`;
                nAvisos++;
            } else if (diffH > 0.5) {
                divergencia = "horas_diferentes";
                detalhes = `Admin: ${horasAdmin}h | Colaborador: ${horasColab.toFixed(1)}h (dif. ${diffH.toFixed(1)}h)`;
                nAvisos++;
            } else if (obrasDif) {
                divergencia = "obra_diferente";
                detalhes = `Admin: ${nomeObra} | Colaborador: ${regColab.obra}`;
                nAvisos++;
            } else {
                divergencia = "ok";
                detalhes = `${horasAdmin}h · ${nomeObra} ✓`;
                nOk++;
            }
        }

        const badgeClass = divergencia === "ok" ? "badge-ok" : divergencia === "sem_registo_colab" || divergencia === "registo_incompleto" ? "badge-erro" : "badge-aviso";
        const badgeLabel = {
            ok: "OK",
            sem_registo_colab: "Sem ponto",
            registo_incompleto: "Incompleto",
            horas_diferentes: "Horas ≠",
            obra_diferente: "Obra ≠"
        }[divergencia] || divergencia;

        html += `
            <div class="comp-item ${divergencia}">
                <div class="comp-nome">${nomeFunc}</div>
                <div class="comp-detalhe">${detalhes}</div>
                <span class="comp-badge ${badgeClass}">${badgeLabel}</span>
            </div>`;
    });

    // Resumo no topo
    const resumo = `
        <div style="display:flex;gap:8px;margin-bottom:12px">
            <div style="flex:1;background:rgba(76,175,125,.1);border-radius:8px;padding:10px 12px;text-align:center">
                <div style="font-family:var(--fh);font-size:22px;font-weight:600;color:var(--green)">${nOk}</div>
                <div style="font-size:10px;opacity:.5;font-family:var(--fh);letter-spacing:1px;text-transform:uppercase;margin-top:2px">OK</div>
            </div>
            <div style="flex:1;background:rgba(244,185,66,.1);border-radius:8px;padding:10px 12px;text-align:center">
                <div style="font-family:var(--fh);font-size:22px;font-weight:600;color:var(--orange)">${nAvisos}</div>
                <div style="font-size:10px;opacity:.5;font-family:var(--fh);letter-spacing:1px;text-transform:uppercase;margin-top:2px">Avisos</div>
            </div>
            <div style="flex:1;background:rgba(224,92,92,.1);border-radius:8px;padding:10px 12px;text-align:center">
                <div style="font-family:var(--fh);font-size:22px;font-weight:600;color:var(--red)">${nErros}</div>
                <div style="font-size:10px;opacity:.5;font-family:var(--fh);letter-spacing:1px;text-transform:uppercase;margin-top:2px">Erros</div>
            </div>
        </div>`;

    lista.innerHTML = resumo + html;
}

function voltarPrincipal() {
    mostrarEcrã("ecrãPrincipal");
}

// =======================================================
// NOTIFICAÇÕES PUSH — lembrete às 19h (seg-sab)
// =======================================================
async function pedirPermissaoNotificacoes() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
        agendarLembrete();
        return;
    }
    if (Notification.permission !== "denied") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") agendarLembrete();
    }
}

function agendarLembrete() {
    // Calcular quantos ms faltam para as 19h de hoje (ou amanhã se já passou)
    const agora   = new Date();
    const diaSem  = agora.getDay(); // 0=Dom, 6=Sab

    // Não agendar ao domingo
    if (diaSem === 0) return;

    let alvo = new Date();
    alvo.setHours(19, 0, 0, 0);

    // Se já são mais de 19h, agendar para o próximo dia útil
    if (agora >= alvo) {
        alvo.setDate(alvo.getDate() + 1);
        // Saltar domingo
        if (alvo.getDay() === 0) alvo.setDate(alvo.getDate() + 1);
    }

    const msAte19h = alvo.getTime() - agora.getTime();

    setTimeout(() => {
        const n = new Notification("Maia Solutions — Registo Diário", {
            body: "Está na hora de registar quem trabalhou hoje. Toca para abrir.",
            icon: "Logo.png",
            badge: "Logo.png",
            tag: "registo-diario",
            requireInteraction: true
        });
        n.onclick = () => { window.focus(); mostrarEcrã("ecrãPrincipal"); };

        // Re-agendar para o dia seguinte
        setTimeout(agendarLembrete, 60 * 1000); // 1 min depois, re-calcular
    }, msAte19h);

    console.log(`Lembrete agendado para ${alvo.toLocaleString("pt-PT")}`);
}

// =======================================================
// ARRANQUE
// =======================================================
document.addEventListener("DOMContentLoaded", init);
