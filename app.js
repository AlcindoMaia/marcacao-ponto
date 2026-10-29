// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================

function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("deviceId", id); }
  return id;
}

// A tabela obras não é legível sem login: tinha morada, coordenadas GPS e
// raio de todas as obras — inteligência comercial, e as coordenadas exactas
// para falsificar uma marcação. Esta função do servidor devolve só o nome, e
// só a quem tiver um dispositivo registado.
async function getObra(id) {
  const { data, error } = await SB.rpc("obra_por_dispositivo", {
    p_device: getDeviceId(), p_obra_id: id
  });
  if (error) { console.error(error); return null; }
  return Array.isArray(data) ? (data[0] || null) : data;
}

// A tabela funcionarios não é legível sem login (tem salários, IBAN e NIF).
// Esta função do servidor devolve só o necessário para o dispositivo actual.
async function getFuncionario(deviceId) {
  const { data, error } = await SB.rpc("funcionario_por_dispositivo", { p_device: deviceId });
  if (error) { console.error(error); return null; }
  return Array.isArray(data) ? (data[0] || null) : data;
}

// =======================================================
// FUSO HORÁRIO — todas as datas em Europe/Lisbon
// =======================================================
const TZ = "Europe/Lisbon";

// Devolve "HH:MM" no fuso de Lisboa
const fmtHora = iso => new Date(iso).toLocaleTimeString("pt-PT", {
  hour: "2-digit", minute: "2-digit", timeZone: TZ
});

// Devolve "seg, 03/04" no fuso de Lisboa
const fmtDia = iso => new Date(iso).toLocaleDateString("pt-PT", {
  weekday: "short", day: "2-digit", month: "2-digit", timeZone: TZ
});

// Devolve "YYYY-MM-DD" no fuso de Lisboa (para agrupar por dia)
function diaLocal(iso) {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ }); // sv-SE dá formato ISO
}

// Devolve o início da semana (segunda) em UTC, calculado com base na hora local
function startOfWeek() {
  const agora = new Date();
  // Obter a data local em Lisboa
  const dataLocal = new Date(agora.toLocaleDateString("sv-SE", { timeZone: TZ }));
  dataLocal.setDate(dataLocal.getDate() - ((dataLocal.getDay() + 6) % 7));
  return dataLocal;
}

function calcHoras(entIso, saiIso) {
  const diff = new Date(saiIso) - new Date(entIso);
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
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
  const icon = document.getElementById("btnIcon");
  const label = document.getElementById("btnLabel");
  const sublabel = document.getElementById("btnSublabel");
  const btn = document.getElementById("btnMarcacao");
  if (ultimoTipo === "entrada") {
    icon.textContent="⏹"; label.textContent="SAÍDA"; sublabel.textContent="Toca para registar saída";
    btn.style.background = "conic-gradient(from 200deg at 40% 60%, #e09486, #a5483d, #e09486)";
  } else {
    icon.textContent="▶"; label.textContent="ENTRADA"; sublabel.textContent="Toca para registar entrada";
    btn.style.background = "conic-gradient(from 200deg at 40% 60%, #c49a76, #9a7150, #c49a76)";
  }
}

function actualizarEstado(registos) {
  const dot = document.getElementById("estadoDot");
  const label = document.getElementById("estadoLabel");
  const hora = document.getElementById("estadoHora");
  if (!registos || registos.length === 0) {
    dot.className="estado-dot"; label.textContent="Sem registos hoje"; hora.textContent=""; return;
  }
  const u = registos[0];
  dot.className = "estado-dot " + u.tipo;
  label.textContent = u.tipo === "entrada" ? "Em obra" : "Fora de obra";
  hora.textContent = "desde " + fmtHora(u.datahora);
}

// =======================================================
// HISTÓRICO
// =======================================================
async function carregarHistorico(funcId) {
  const inicio = startOfWeek();
  // A tabela ponto não é acessível sem login: a função devolve apenas as
  // marcações do funcionário deste dispositivo.
  const { data, error } = await SB.rpc("ponto_historico", {
    p_device: getDeviceId(),
    p_desde:  inicio.toISOString()
  });
  if (error) console.error(error);

  // Usar diaLocal() para comparar dias em hora de Lisboa (não UTC)
  const hoje = diaLocal(new Date().toISOString());
  const hojeRegs = (data||[]).filter(r => diaLocal(r.datahora) === hoje);
  actualizarEstado(hojeRegs);
  ultimoTipoAtual = data?.[0]?.tipo ?? null;
  actualizarBotao(ultimoTipoAtual);

  const lista = document.getElementById("histLista");
  if (!data || data.length === 0) {
    lista.innerHTML = `<div class="hist-vazio">Sem registos esta semana</div>`;
    return;
  }

  // Agrupar registos por dia LOCAL (Lisboa)
  const porDia = {};
  data.forEach(r => {
    const dia = diaLocal(r.datahora);
    if (!porDia[dia]) porDia[dia] = [];
    porDia[dia].push(r);
  });

  const diasOrdenados = Object.keys(porDia).sort().reverse();
  const dOntem = diaLocal(new Date(Date.now() - 86400000).toISOString());

  lista.innerHTML = diasOrdenados.map(dia => {
    const registosDia = porDia[dia];
    const diaLabel = dia === hoje ? "Hoje" : dia === dOntem ? "Ontem" : fmtDia(registosDia[0].datahora);
    const entrada = registosDia.find(r => r.tipo === "entrada");
    const saida   = registosDia.find(r => r.tipo === "saida");
    const horas   = (entrada && saida) ? calcHoras(entrada.datahora, saida.datahora) : null;
    return `<div class="hist-item">
      <div class="hist-dot ${entrada ? "entrada" : "saida"}"></div>
      <div class="hist-mid">
        <div class="hist-dia">${diaLabel}</div>
        <div class="hist-horas-line">${entrada ? fmtHora(entrada.datahora) : "—"} → ${saida ? fmtHora(saida.datahora) : "—"}</div>
      </div>
      <div class="hist-total">${horas || ""}</div>
    </div>`;
  }).join("");
}

// =======================================================
// MARCAÇÃO
// =======================================================
async function confirmarMarcacao() {
  if (!navigator.geolocation) { mostrarFeedback("GPS não disponível.", "erro"); return; }
  const btn = document.getElementById("btnMarcacao");
  btn.classList.add("disabled");
  document.getElementById("btnLabel").textContent = "A localizar…";
  document.getElementById("btnSublabel").textContent = "";
  mostrarFeedback("A verificar localização…", "info");

  navigator.geolocation.getCurrentPosition(
    async pos => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;

        // Não há aviso antecipado de perímetro: para o dar, o cliente tinha
        // de conhecer as coordenadas e o raio da obra, e isso obrigava a
        // publicá-los a quem tivesse a chave anon. Quem decide é o servidor,
        // dentro de ponto_marcar, e a mensagem de recusa dele é mostrada
        // abaixo tal como vem.

        // O funcionário e o tipo (entrada/saída) são determinados no servidor.
        // Na área do funcionário a obra vem da lista e a distância não
        // impede a marcação: fica "a rever" para o Alcindo.
        const obraEscolhida = MODO_AREA ? document.getElementById("obraEscolha").value : obraID;
        if (!obraEscolhida) { mostrarFeedback("Escolhe a obra onde estás.", "erro"); return; }
        const { data, error } = MODO_AREA
          ? await SB.rpc("ponto_marcar_area", {
              p_device:   getDeviceId(),
              p_obra_id:  obraEscolhida,
              p_lat:      lat,
              p_lon:      lon,
              p_precisao: pos.coords.accuracy
            })
          : await SB.rpc("ponto_marcar", {
              p_device:  getDeviceId(),
              p_obra_id: obraID,
              p_lat:     lat,
              p_lon:     lon
            });
        if (error) {
          console.error(error);
          const m = error.message || "";
          mostrarFeedback(
            m.startsWith("Fora do perímetro") ? m : "Erro ao registar. Tente novamente.",
            "erro"
          );
          return;
        }
        const r = Array.isArray(data) ? data[0] : data;
        const tipo = r?.tipo;
        const feito = tipo==="entrada" ? "✓ Entrada registada" : "✓ Saída registada";
        if (r?.a_rever) {
          mostrarFeedback(feito + (r.distancia_m != null
            ? ` a ${r.distancia_m} m da obra. Fica para o Alcindo confirmar.`
            : ". Esta obra ainda não tem localização: fica para o Alcindo confirmar."), "info");
        } else {
          mostrarFeedback(feito + "!", "ok");
        }
        await carregarHistorico(funcionario.id);
      } finally {
        btn.classList.remove("disabled");
        // Se a marcação falhou, o botão volta a dizer Entrada/Saída
        if (document.getElementById("btnLabel").textContent === "A localizar…") actualizarBotao(ultimoTipoAtual);
      }
    },
    () => {
      mostrarFeedback("Não foi possível obter a localização. Verifique o GPS.", "erro");
      btn.classList.remove("disabled");
      actualizarBotao(ultimoTipoAtual);
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

// =======================================================
// INIT
// =======================================================
const urlParams = new URLSearchParams(window.location.search);
const obraID = urlParams.get("obra");
// Sem ?obra= no endereço é a área do funcionário: escolhe a obra numa lista
const MODO_AREA = !obraID;
let funcionario = null;
let obra = null;
let ultimoTipoAtual = null;

// Lista das obras ativas (só nomes), com a última obra já escolhida
async function carregarObrasArea() {
  const { data, error } = await SB.rpc("obras_para_marcar", { p_device: getDeviceId() });
  if (error) { console.error(error); return false; }
  const sel = document.getElementById("obraEscolha");
  const lista = data || [];
  sel.innerHTML = `<option value="">Em que obra estás?</option>` +
    lista.map(o => `<option value="${esc(o.id)}"${o.ultima ? " selected" : ""}>${esc(o.nome)}</option>`).join("");
  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  mostrarEcrã("ecrãLoading");

  funcionario = await getFuncionario(getDeviceId());
  if (!funcionario || !funcionario.ativo) {
    mostrarBloqueio("Dispositivo não autorizado", "Este dispositivo não está registado no sistema.<br><br>Contacte o administrador.");
    return;
  }

  if (MODO_AREA) {
    if (!(await carregarObrasArea())) {
      mostrarBloqueio("Sem ligação", "Não foi possível carregar as obras.<br>Tente novamente daqui a pouco.");
      return;
    }
    document.getElementById("obraNome").style.display = "none";
    document.getElementById("obraEscolha").style.display = "";
  } else {
    obra = await getObra(obraID);
    if (!obra) {
      mostrarBloqueio("Obra não encontrada", "Este QR Code é inválido ou a obra foi removida.");
      return;
    }
    document.getElementById("obraNome").textContent = obra.nome;
  }

  mostrarEcrã("ecrãPrincipal");
  const av = document.getElementById("funcAvatar");
  if (av) av.textContent = (funcionario.nome || "?").charAt(0).toUpperCase();
  document.getElementById("funcNome").textContent = funcionario.nome;
  document.getElementById("btnMarcacao").addEventListener("click", confirmarMarcacao);
  // Botão de carga — pré-preenche a obra como origem
  const btnCarga = document.getElementById("btnCarga");
  if (btnCarga && obraID) btnCarga.href = "carga.html?origem=" + obraID;
  await carregarHistorico(funcionario.id);

  // Relógio em tempo real — hora de Lisboa
  function actualizarRelogio() {
    const el = document.getElementById("horaActual");
    if (el) el.textContent = new Date().toLocaleTimeString("pt-PT", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ
    });
  }
  actualizarRelogio();
  setInterval(actualizarRelogio, 1000);
});
