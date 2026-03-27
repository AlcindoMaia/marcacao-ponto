// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================

// =======================================================
// HELPERS
// =======================================================
function getDeviceId() {
    let id = localStorage.getItem("deviceId");
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("deviceId", id);
    }
    return id;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R    = 6371e3;
    const toRad = d => d * Math.PI / 180;
    const φ1   = toRad(lat1), φ2 = toRad(lat2);
    const Δφ   = toRad(lat2 - lat1);
    const Δλ   = toRad(lon2 - lon1);
    const a    = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getObra(obra_id) {
    const { data, error } = await SB
        .from("obras")
        .select("*")
        .eq("id", obra_id)
        .maybeSingle();
    if (error) return null;
    return data;
}

async function getFuncionario(deviceId) {
    const { data, error } = await SB
        .from("funcionarios")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();
    if (error) return null;
    return data;
}

function startOfWeek() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function endOfWeek() {
    const s = startOfWeek();
    s.setDate(s.getDate() + 7);
    return s;
}

// =======================================================
// MOSTRAR BLOQUEIO — sem link de cadastro
// O cadastro é controlado pelo administrador
// =======================================================
function mostrarBloqueio(titulo, mensagem) {
    const el = document.getElementById("bloqueado");
    el.classList.remove("hidden");
    el.innerHTML = `
        <h3 class="error-title">${titulo}</h3>
        <p>${mensagem}</p>
    `;
}

// =======================================================
// MAIN INIT
// =======================================================
const urlParams = new URLSearchParams(window.location.search);
const obraID    = urlParams.get("obra");

let funcionario = null;
let obra        = null;

document.addEventListener("DOMContentLoaded", async () => {

    if (!obraID) {
        mostrarBloqueio("QR inválido", "Este QR não contém referência de obra.");
        return;
    }

    const deviceId = getDeviceId();

    // 1) Validar funcionário
    funcionario = await getFuncionario(deviceId);
    if (!funcionario) {
        mostrarBloqueio(
            "Dispositivo não reconhecido",
            "Este dispositivo não está autorizado. Contacte o administrador."
        );
        return;
    }

    // 2) Validar obra
    obra = await getObra(obraID);
    if (!obra) {
        mostrarBloqueio("Obra não encontrada", "Este QR está inválido ou foi removido.");
        return;
    }

    // Mostrar interface principal
    document.getElementById("conteudo").classList.remove("hidden");
    document.getElementById("msgOla").innerHTML   = `Olá <strong>${funcionario.nome}</strong>`;
    document.getElementById("msgObra").innerHTML  = `Obra: <strong>${obra.nome}</strong>`;
    document.getElementById("btnConfirmar").onclick = confirmarMarcacao;

    carregarHistorico(funcionario.id);
});

// =======================================================
// MARCAÇÃO DE PONTO
// FIX: usa obra.raio em vez do valor fixo 120m
// =======================================================
async function confirmarMarcacao() {
    if (!navigator.geolocation) {
        alert("Geolocalização indisponível neste dispositivo.");
        return;
    }

    // Desactivar botão durante o processo para evitar duplos cliques
    const btn = document.getElementById("btnConfirmar");
    btn.disabled = true;
    btn.textContent = "A verificar localização...";

    navigator.geolocation.getCurrentPosition(
        async pos => {
            try {
                const lat  = pos.coords.latitude;
                const lon  = pos.coords.longitude;
                const dist = haversineDistance(lat, lon, obra.latitude, obra.longitude);

                // FIX: usa o raio definido na obra, com fallback de 120m
                const raio = obra.raio || 120;

                if (dist > raio) {
                    alert(`Fora do perímetro autorizado.\nDistância: ${Math.round(dist)}m\nMáximo: ${raio}m`);
                    return;
                }

                // Obter último registo para alternância entrada/saída
                const { data: ult } = await SB
                    .from("ponto")
                    .select("tipo, datahora")
                    .eq("funcionario_id", funcionario.id)
                    .order("datahora", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const tipo = (ult?.tipo === "entrada") ? "saida" : "entrada";

                const { error } = await SB
                    .from("ponto")
                    .insert({
                        funcionario_id: funcionario.id,
                        obra_id:        obraID,
                        datahora:       new Date().toISOString(),
                        latitude:       lat,
                        longitude:      lon,
                        tipo
                    });

                if (error) {
                    alert("Erro ao registar ponto:\n" + error.message);
                    console.error(error);
                    return;
                }

                btn.textContent = tipo === "entrada" ? "✓ Entrada registada!" : "✓ Saída registada!";
                setTimeout(() => {
                    btn.textContent = "Confirmar Registo";
                }, 2500);

                carregarHistorico(funcionario.id);

            } finally {
                btn.disabled = false;
            }
        },
        err => {
            alert("Não foi possível obter a localização. Verifique se o GPS está ativo.");
            console.error(err);
            btn.disabled = false;
            btn.textContent = "Confirmar Registo";
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

// =======================================================
// HISTÓRICO SEMANAL
// =======================================================
async function carregarHistorico(funcId) {
    const inicio = startOfWeek();
    const fim    = endOfWeek();

    const { data } = await SB
        .from("ponto")
        .select("*")
        .eq("funcionario_id", funcId)
        .gte("datahora", inicio.toISOString())
        .lt("datahora", fim.toISOString())
        .order("datahora", { ascending: false });

    const histDiv  = document.getElementById("histSemanal");
    const lastDiv  = document.getElementById("ultimaAcao");

    if (data && data.length > 0) {
        const u = data[0];
        const label = u.tipo === "entrada" ? "Entrada" : "Saída";
        lastDiv.innerHTML = `<strong>${label}</strong> — ${new Date(u.datahora).toLocaleString("pt-PT")}`;
    } else {
        lastDiv.innerHTML = "Sem registos esta semana.";
    }

    histDiv.innerHTML = "";
    if (!data || data.length === 0) {
        histDiv.innerHTML = "Sem registos esta semana.";
        return;
    }

    data.forEach(r => {
        const label = r.tipo === "entrada" ? "▶ Entrada" : "■ Saída";
        histDiv.innerHTML += `
            <div class="regItem">
                <strong>${label}</strong> — ${new Date(r.datahora).toLocaleString("pt-PT")}
            </div>`;
    });
}
