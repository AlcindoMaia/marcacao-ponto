// ===================================================================
// CONFIG SUPABASE
// ===================================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================================================================
// HELPERS
// ===================================================================
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = d => d * Math.PI / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ/2)**2 +
    Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function getObra(obra_id) {
  const { data, error } = await supabaseClient
    .from("obras")
    .select("*")
    .eq("id", obra_id)
    .maybeSingle();

  if (error) return null;
  return data;
}

async function getFuncionario(deviceId) {
  const { data, error } = await supabaseClient
    .from("funcionarios")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) return null;
  return data;
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const s = new Date(d);
  s.setHours(0,0,0,0);
  s.setDate(s.getDate() - day);
  return s;
}
function endOfWeek() {
  const s = startOfWeek();
  s.setDate(s.getDate() + 7);
  return s;
}

// ===================================================================
// MAIN INIT
// ===================================================================
const urlParams = new URLSearchParams(window.location.search);
const obraID = urlParams.get("obra");

let funcionario = null;
let obra = null;

document.addEventListener("DOMContentLoaded", async () => {

  if (!obraID) {
    document.getElementById("bloqueado").classList.remove("hidden");
    document.getElementById("bloqueado").innerHTML =
      "<h3>QR inválido</h3><p>Este QR não contém referência de obra.</p>";
    return;
  }

  const deviceId = getDeviceId();

  // 1) validar funcionário
  funcionario = await getFuncionario(deviceId);
  if (!funcionario) {
    document.getElementById("bloqueado").classList.remove("hidden");
    return;
  }

  // 2) validar obra
  obra = await getObra(obraID);
  if (!obra) {
    document.getElementById("bloqueado").classList.remove("hidden");
    document.getElementById("bloqueado").innerHTML =
      "<h3>Obra não encontrada</h3><p>Este QR está inválido.</p>";
    return;
  }

  // Ok — mostrar interface
  document.getElementById("conteudo").classList.remove("hidden");

  document.getElementById("msgOla").innerHTML =
    `Olá <strong>${funcionario.nome}</strong>`;

  document.getElementById("msgObra").innerHTML =
    `Detectámos a obra: <strong>${obra.nome}</strong>.`;

  document.getElementById("btnConfirmar").onclick = confirmarMarcacao;

  carregarHistorico(funcionario.id);
});

// ===================================================================
// MARCAÇÃO DE PONTO (APÓS CONFIRMAR)
// ===================================================================
async function confirmarMarcacao() {

  if (!navigator.geolocation) {
    alert("Geolocalização indisponível.");
    return;
  }

  navigator.geolocation.getCurrentPosition(async pos => {

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    // validar distância
    const dist = haversineDistance(
      lat, lon,
      obra.latitude, obra.longitude
    );

    const RAIO = 120;  

    if (dist > RAIO) {
      alert(`Não autorizado: distância ${Math.round(dist)}m (máximo ${RAIO}m).`);
      return;
    }

    // obter último registo para alternância
    const { data: ult, error: errUlt } = await supabaseClient
      .from("ponto")
      .select("tipo,datahora")
      .eq("funcionario_id", funcionario.id)
      .order("datahora", { ascending: false })
      .limit(1)
      .maybeSingle();

    let tipo = "entrada";
    if (ult && ult.tipo === "entrada") tipo = "saida";

    // inserir registo
    const payload = {
      funcionario_id: funcionario.id,
      obra_id: obraID,
      datahora: new Date().toISOString(),
      latitude: lat,
      longitude: lon,
      tipo
    };

    const { error: errIns } = await supabaseClient
      .from("ponto")
      .insert(payload);

    if (errIns) {
      alert("Erro ao registar ponto.");
      return;
    }

    alert(`Registo ${tipo.toUpperCase()} efetuado com sucesso!`);
    carregarHistorico(funcionario.id);

  }, err => {
    alert("Erro ao obter localização. Ative o GPS.");
    console.error(err);
  }, {
    enableHighAccuracy: true, timeout: 15000
  });
}

// ===================================================================
// HISTÓRICO
// ===================================================================
async function carregarHistorico(funcId) {
  const inicio = startOfWeek();
  const fim = endOfWeek();

  const { data, error } = await supabaseClient
    .from("ponto")
    .select("*")
    .eq("funcionario_id", funcId)
    .gte("datahora", inicio.toISOString())
    .lt("datahora", fim.toISOString())
    .order("datahora", { ascending: true });

  const histDiv = document.getElementById("histSemanal");
  const lastDiv = document.getElementById("ultimaAcao");

  // última ação
  if (data && data.length > 0) {
    const u = data[data.length - 1];
    lastDiv.innerHTML =
      `<strong>${u.tipo.toUpperCase()}</strong> — ${new Date(u.datahora).toLocaleString()}`;
  } else {
    lastDiv.innerHTML = "Sem registos";
  }

  // histórico detalhado
  histDiv.innerHTML = "";
  if (!data || data.length === 0) {
    histDiv.innerHTML = "Sem registos esta semana.";
    return;
  }

  data.forEach(r => {
    histDiv.innerHTML +=
      `<div class="regItem"><strong>${r.tipo}</strong> — ${new Date(r.datahora).toLocaleString()}</div>`;
  });
}
