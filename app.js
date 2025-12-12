// ===============================================================
// app.js — Marcação de Ponto com:
// - Identificação automática por device_id
// - Alternância automática entrada/saida
// - Validação por distância à obra (Haversine)
// - Histórico semanal com cálculo de horas/dia
// ===============================================================

// ---------------- CONFIG SUPABASE ----------------
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===============================================================
// HELPERS
// ===============================================================

function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

function fmtDateTime(dt) {
  return new Date(dt).toLocaleString();
}

function startOfWeek(d = new Date()) {
  const day = d.getDay();
  const res = new Date(d);
  res.setHours(0,0,0,0);
  res.setDate(res.getDate() - day);
  return res;
}

function endOfWeek(d = new Date()) {
  const s = startOfWeek(d);
  s.setDate(s.getDate() + 7);
  return s;
}

// ===============================================================
// HAVERSINE — DISTÂNCIA ENTRE DOIS PONTOS GPS
// ===============================================================

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metros
  const toRad = deg => deg * Math.PI / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ/2)**2 +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ/2)**2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

// ===============================================================
// OBTER COORDENADAS DA OBRA
// ===============================================================

async function getObraCoordenadas(obra_id) {
  const { data, error } = await supabase
    .from("obras")
    .select("latitude, longitude")
    .eq("id", obra_id)
    .maybeSingle();

  if (error) {
    console.error("Erro ao obter coordenadas da obra:", error);
    return null;
  }
  return data;
}

// ===============================================================
// ESTADO GLOBAL
// ===============================================================

let currentFuncionario = null;
let html5qr = null;

// ===============================================================
// INICIALIZAÇÃO
// ===============================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("index.js carregado");
  initPage();
  document.getElementById("btnScanner").addEventListener("click", startScanner);
});

async function initPage() {
  const deviceId = getDeviceId();

  const { data: func, error } = await supabase
    .from("funcionarios")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    alert("Erro ao carregar dados do dispositivo.");
    return;
  }

  if (!func) {
    document.getElementById("notRegistered").classList.remove("hidden");
    document.getElementById("userBlock").classList.add("hidden");
    return;
  }

  currentFuncionario = func;

  document.getElementById("nomeFuncionario").textContent = func.nome;
  document.getElementById("metaInfo").textContent = "Dispositivo reconhecido";
  document.getElementById("userBlock").classList.remove("hidden");
  document.getElementById("notRegistered").classList.add("hidden");

  await carregarHistoricoSemanal(func.id);
  await mostrarUltimaAcao(func.id);
}

// ===============================================================
// QR SCANNER
// ===============================================================

function startScanner() {
  document.getElementById("qr-reader").classList.remove("hidden");

  if (html5qr) {
    html5qr.stop().catch(()=>{});
  }

  html5qr = new Html5Qrcode("qr-reader");

  html5qr.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },

    async (qrText) => {
      await html5qr.stop().catch(()=>{});
      document.getElementById("qr-reader").classList.add("hidden");

      // Se QR é de cadastro → redirecionar
      if (qrText.includes("cadastro")) {
        window.location.href = qrText;
        return;
      }

      // extrair obra_id
      let obra_id = qrText;
      try {
        const u = new URL(qrText);
        const p = u.searchParams.get("obra");
        if (p) obra_id = p;
      } catch (_) {}

      await registrarPonto(obra_id);
    },

    () => {} // erros intermitentes ignorados
  )
  .catch(err => {
    alert("Não foi possível iniciar o leitor de QR.");
    console.error(err);
  });
}

// ===============================================================
// REGISTAR PONTO (COM VALIDAÇÃO DE DISTÂNCIA)
// ===============================================================

async function registrarPonto(obra_id) {
  if (!currentFuncionario) {
    alert("Dispositivo não registado.");
    return;
  }

  // 1) Coordenadas da obra
  const obraCoords = await getObraCoordenadas(obra_id);
  if (!obraCoords || !obraCoords.latitude || !obraCoords.longitude) {
    alert("Erro: obra sem coordenadas registadas.");
    return;
  }

  // 2) GPS do utilizador
  document.getElementById("metaInfo").textContent = "A obter localização...";

  navigator.geolocation.getCurrentPosition(async pos => {

    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;

    // 3) calcular distância à obra
    const dist = haversineDistance(
      latitude,
      longitude,
      obraCoords.latitude,
      obraCoords.longitude
    );

    console.log("Distância à obra:", dist);

    const RAIO_MAX = 120; // METROS

    if (dist > RAIO_MAX) {
      alert(
        `Registo negado.\nDistância até à obra: ${Math.round(dist)}m\nMáximo permitido: ${RAIO_MAX}m`
      );
      document.getElementById("metaInfo").textContent = "Fora do perímetro da obra";
      return;
    }

    // 4) Determinar tipo (entrada/saida)
    const { data: ultima, error: errUlt } = await supabase
      .from("ponto")
      .select("tipo, datahora")
      .eq("funcionario_id", currentFuncionario.id)
      .order("datahora", { ascending: false })
      .limit(1)
      .maybeSingle();

    let tipo = "entrada";
    if (ultima && ultima.tipo === "entrada") tipo = "saida";

    // 5) Inserir registo
    const payload = {
      funcionario_id: currentFuncionario.id,
      obra_id,
      datahora: new Date().toISOString(),
      latitude,
      longitude,
      tipo
    };

    const { data, error } = await supabase
      .from("ponto")
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Erro ao inserir ponto:", error);
      alert("Erro ao registar ponto.");
      return;
    }

    alert(`Ponto ${tipo.toUpperCase()} registado com sucesso!`);
    document.getElementById("metaInfo").textContent =
      `Ponto ${tipo} registado: ${fmtDateTime(data.datahora)}`;

    await carregarHistoricoSemanal(currentFuncionario.id);
    await mostrarUltimaAcao(currentFuncionario.id);

  }, (err) => {
    console.error("Erro GPS:", err);
    alert("Não foi possível obter localização. Ative o GPS.");
    document.getElementById("metaInfo").textContent = "Falha na localização";
  }, {
    enableHighAccuracy: true,
    timeout: 15000
  });
}

// ===============================================================
// MOSTRAR ÚLTIMA AÇÃO
// ===============================================================

async function mostrarUltimaAcao(funcId) {
  const { data, error } = await supabase
    .from("ponto")
    .select("tipo, datahora, obra_id")
    .eq("funcionario_id", funcId)
    .order("datahora", { ascending: false })
    .limit(1)
    .maybeSingle();

  const el = document.getElementById("lastAction");

  if (!data) {
    el.innerHTML = "<div class='small'>Ainda sem registos.</div>";
    return;
  }

  el.innerHTML =
    `<div class='small'>Última ação: <strong>${data.tipo.toUpperCase()}</strong> — ${fmtDateTime(data.datahora)} (Obra: ${data.obra_id})</div>`;
}

// ===============================================================
// HISTÓRICO SEMANAL + HORAS POR DIA
// ===============================================================

async function carregarHistoricoSemanal(funcId) {
  const inicio = startOfWeek();
  const fim = endOfWeek();

  const { data, error } = await supabase
    .from("ponto")
    .select("tipo, datahora, obra_id")
    .eq("funcionario_id", funcId)
    .gte("datahora", inicio.toISOString())
    .lt("datahora", fim.toISOString())
    .order("datahora", { ascending: true });

  const detalhesDiv = document.getElementById("historico");
  const resumoDiv = document.getElementById("histResumo");

  // Detalhes semanais
  detalhesDiv.innerHTML = "";
  if (!data || data.length === 0) {
    detalhesDiv.innerHTML = "<div class='small'>Sem registos esta semana.</div>";
  } else {
    data.slice().reverse().forEach(r => {
      const d = new Date(r.datahora);
      const el = document.createElement("div");
      el.className = "regItem";
      el.innerHTML = `<strong>${r.tipo.toUpperCase()}</strong> — ${d.toLocaleString()}<br>Obra: ${r.obra_id}`;
      detalhesDiv.appendChild(el);
    });
  }

  // Calcular horas por dia
  const byDay = {};
  let lastEntrada = null;

  data.forEach(rec => {
    if (rec.tipo === "entrada") {
      lastEntrada = new Date(rec.datahora);
    } else if (rec.tipo === "saida" && lastEntrada) {
      const saida = new Date(rec.datahora);
      if (saida > lastEntrada) {
        const key = saida.toISOString().slice(0,10);
        const secs = (saida - lastEntrada) / 1000;
        byDay[key] = (byDay[key] || 0) + secs;
      }
      lastEntrada = null;
    }
  });

  // Resumo semanal
  resumoDiv.innerHTML = "";
  const it = new Date(inicio);
  for (let i = 0; i < 7; i++) {
    const key = it.toISOString().slice(0,10);
    const secs = Math.round(byDay[key] || 0);
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const display = `${hours}h ${mins.toString().padStart(2,"0")}m`;

    const el = document.createElement("div");
    el.className = "regItem";
    el.innerHTML =
      `<strong>${it.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'2-digit'})}</strong> — ${display}`;

    resumoDiv.appendChild(el);
    it.setDate(it.getDate() + 1);
  }
}
