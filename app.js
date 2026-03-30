// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================

function getDeviceId() {
    let id = localStorage.getItem("deviceId");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("deviceId", id); }
    return id;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3, toRad = d => d * Math.PI / 180;
    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δφ = toRad(lat2-lat1), Δλ = toRad(lon2-lon1);
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function getObra(id) {
    const { data } = await SB.from("obras").select("*").eq("id", id).maybeSingle();
    return data;
}

async function getFuncionario(deviceId) {
    const { data } = await SB.from("funcionarios").select("*").eq("device_id", deviceId).maybeSingle();
    return data;
}

function startOfWeek() {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - ((d.getDay()+6)%7));
    return d;
}

const fmtHora = iso => new Date(iso).toLocaleTimeString("pt-PT", { hour:"2-digit", minute:"2-digit" });
const fmtDia  = iso => new Date(iso).toLocaleDateString("pt-PT", { weekday:"short", day:"2-digit", month:"2-digit" });

function calcHoras(entIso, saiIso) {
    const diff = new Date(saiIso) - new Date(entIso);
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h${m > 0 ? String(m).padStart(2,"0") : ""}`;
}

// =======================================================
// UI
// =======================================================
function mostrarEcrã(id) {
    ["ecrãLoading","ecrãBloqueio","ecrãPrincipal"].forEach(e => {
        const el = document.getElementById(e);
        if (el) el.style.display = e === id ? "flex" : "none";
    });
}

function mostrarBloqueio(titulo, msg) {
    document.getElementById("bloqueioTitulo").textContent = titulo;
    document.getElementById("bloqueioMsg").innerHTML = msg;
    mostrarEcrã("ecrãBloqueio");
}

function mostrarFeedback(msg, tipo = "info") {
    const el = document.getElementById("feedback");
    el.textContent = msg;
    el.className = "feedback " + tipo;
    if (tipo === "ok") setTimeout(() => { el.textContent=""; el.className="feedback"; }, 3000);
}

function actualizarBotao(ultimoTipo) {
    const icon     = document.getElementById("btnIcon");
    const label    = document.getElementById("btnLabel");
    const sublabel = document.getElementById("btnSublabel");
    if (ultimoTipo === "entrada") {
        icon.textContent="⏹"; label.textContent="SAÍDA"; sublabel.textContent="Toca para registar saída";
    } else {
        icon.textContent="▶"; label.textContent="ENTRADA"; sublabel.textContent="Toca para registar entrada";
    }
}

function actualizarEstado(registos) {
    const dot   = document.getElementById("estadoDot");
    const label = document.getElementById("estadoLabel");
    const hora  = document.getElementById("estadoHora");
    if (!registos || registos.length === 0) {
        dot.className="estado-dot"; label.textContent="Sem registos hoje"; hora.textContent="";
        return;
    }
    const u = registos[0];
    dot.className   = "estado-dot " + u.tipo;
    label.textContent = u.tipo === "entrada" ? "Em obra" : "Fora de obra";
    hora.textContent  = "desde " + fmtHora(u.datahora);
}

// =======================================================
// HISTÓRICO
// =======================================================
async function carregarHistorico(funcId) {
    const inicio = startOfWeek();
    const { data } = await SB.from("ponto").select("*")
        .eq("funcionario_id", funcId)
        .gte("datahora", inicio.toISOString())
        .order("datahora", { ascending: false })
        .limit(12);

    const hoje = new Date().toISOString().split("T")[0];
    const hojeRegs = (data||[]).filter(r => r.datahora.startsWith(hoje));
    actualizarEstado(hojeRegs);
    actualizarBotao(data?.[0]?.tipo ?? null);

    const lista = document.getElementById("histLista");
    if (!data || data.length === 0) {
        lista.innerHTML = `<div style="padding:16px 0;font-size:13px;color:var(--text-muted);text-align:center">Sem registos esta semana</div>`;
        return;
    }
    // Agrupar registos por dia
    const porDia = {};
    data.forEach(r => {
        const dia = r.datahora.split("T")[0];
        if (!porDia[dia]) porDia[dia] = [];
        porDia[dia].push(r);
    });

    const diasOrdenados = Object.keys(porDia).sort().reverse();
    const dHoje = new Date().toISOString().split("T")[0];
    const dOntem = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    lista.innerHTML = diasOrdenados.map(dia => {
        const registosDia = porDia[dia];
        const diaLabel = dia === dHoje ? "Hoje" : dia === dOntem ? "Ontem" : fmtDia(registosDia[0].datahora);
        const entrada = registosDia.find(r => r.tipo === "entrada");
        const saida   = registosDia.find(r => r.tipo === "saida");
        const horas   = (entrada && saida) ? calcHoras(entrada.datahora, saida.datahora) : null;

        return `<div class="hist-item">
            <div class="hist-tipo ${entrada ? "entrada" : "saida"}"></div>
            <div class="hist-texto">${diaLabel}</div>
            <div class="hist-data">${entrada ? fmtHora(entrada.datahora) : "—"} → ${saida ? fmtHora(saida.datahora) : "—"}</div>
            <div class="hist-hora">${horas || ""}</div>
        </div>`;
    }).join("");
}

// =======================================================
// MARCAÇÃO
// =======================================================
async function confirmarMarcacao() {
    if (!navigator.geolocation) {
        mostrarFeedback("GPS não disponível.", "erro"); return;
    }
    const btn = document.getElementById("btnMarcacao");
    btn.classList.add("disabled");
    document.getElementById("btnLabel").textContent  = "A localizar…";
    document.getElementById("btnSublabel").textContent = "";
    mostrarFeedback("A verificar localização…", "info");

    navigator.geolocation.getCurrentPosition(
        async pos => {
            try {
                const { latitude: lat, longitude: lon } = pos.coords;
                const dist = haversineDistance(lat, lon, obra.latitude, obra.longitude);
                const raio = obra.raio || 120;
                if (dist > raio) {
                    mostrarFeedback(`Fora do perímetro. ${Math.round(dist)}m (máx. ${raio}m)`, "erro");
                    return;
                }
                const { data: ult } = await SB.from("ponto").select("tipo")
                    .eq("funcionario_id", funcionario.id)
                    .order("datahora", { ascending: false }).limit(1).maybeSingle();
                const tipo = ult?.tipo === "entrada" ? "saida" : "entrada";
                const { error } = await SB.from("ponto").insert({
                    funcionario_id: funcionario.id,
                    obra_id: obraID,
                    datahora: new Date().toISOString(),
                    latitude: lat, longitude: lon, tipo
                });
                if (error) { mostrarFeedback("Erro ao registar. Tente novamente.", "erro"); return; }
                mostrarFeedback(tipo==="entrada" ? "✓ Entrada registada!" : "✓ Saída registada!", "ok");
                await carregarHistorico(funcionario.id);
            } finally {
                btn.classList.remove("disabled");
            }
        },
        () => {
            mostrarFeedback("Não foi possível obter a localização. Verifique o GPS.", "erro");
            btn.classList.remove("disabled");
            actualizarBotao(null);
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

// =======================================================
// INIT
// =======================================================
const urlParams  = new URLSearchParams(window.location.search);
const obraID     = urlParams.get("obra");
let funcionario  = null;
let obra         = null;

document.addEventListener("DOMContentLoaded", async () => {
    mostrarEcrã("ecrãLoading");

    if (!obraID) {
        mostrarBloqueio("QR inválido", "Este QR não contém uma referência de obra válida.<br>Peça ao responsável um novo QR Code.");
        return;
    }

    funcionario = await getFuncionario(getDeviceId());
    if (!funcionario) {
        mostrarBloqueio("Dispositivo não autorizado",
            "Este dispositivo não está registado no sistema.<br><br>Contacte o administrador.");
        return;
    }

    obra = await getObra(obraID);
    if (!obra) {
        mostrarBloqueio("Obra não encontrada", "Este QR Code é inválido ou a obra foi removida.");
        return;
    }

    mostrarEcrã("ecrãPrincipal");
    document.getElementById("funcNome").textContent = funcionario.nome;
    document.getElementById("obraNome").textContent = obra.nome;
    document.getElementById("btnMarcacao").addEventListener("click", confirmarMarcacao);
    await carregarHistorico(funcionario.id);

    // Relógio em tempo real
    function actualizarRelogio() {
        const el = document.getElementById("horaActual");
        if (el) el.textContent = new Date().toLocaleTimeString("pt-PT", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    }
    actualizarRelogio();
    setInterval(actualizarRelogio, 1000);
});
