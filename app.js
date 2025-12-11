// app.js - Marcação de Ponto

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

async function loadFuncionario() {
  const deviceId = getDeviceId();
  const { data } = await supabase
    .from("funcionarios")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  return data;
}

async function initPage() {
  const func = await loadFuncionario();

  if (func) {
    document.getElementById("userCard").classList.remove("hidden");
    document.getElementById("nomeFuncionario").textContent = func.nome;
    document.getElementById("notRegistered").classList.add("hidden");

    loadHistorico(func.id);
  } else {
    document.getElementById("notRegistered").classList.remove("hidden");
  }
}

async function loadHistorico(funcId) {
  const inicio = new Date();
  const weekday = inicio.getDay();
  inicio.setDate(inicio.getDate() - weekday);
  const semana = inicio.toISOString();

  const { data } = await supabase
    .from("ponto")
    .select("*")
    .eq("funcionario_id", funcId)
    .gte("datahora", semana)
    .order("datahora", { ascending: false });

  const div = document.getElementById("historico");
  div.innerHTML = "";

  if (!data || data.length === 0) {
    div.innerHTML = "<div class='small'>Sem registos esta semana.</div>";
    return;
  }

  data.forEach((r) => {
    const d = new Date(r.datahora);
    const box = document.createElement("div");
    box.className = "regItem";
    box.innerHTML = `
      <strong>${d.toLocaleString()}</strong><br>
      Obra: ${r.obra_id}<br>
      GPS: ${r.latitude || "-"}, ${r.longitude || "-"}
    `;
    div.appendChild(box);
  });
}

document.getElementById("btnScanner").addEventListener("click", () => {
  startScanner();
});

let scanner;

async function startScanner() {
  document.getElementById("qr-reader").classList.remove("hidden");

  scanner = new Html5Qrcode("qr-reader");

  scanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    async (qrText) => {
      await scanner.stop();
      document.getElementById("qr-reader").classList.add("hidden");

      if (qrText.includes("cadastro")) {
        window.location.href = qrText;
        return;
      }

      const func = await loadFuncionario();
      if (!func) {
        alert("Dispositivo não registado.");
        return;
      }

      const obra_id = qrText;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const payload = {
            funcionario_id: func.id,
            obra_id,
            datahora: new Date().toISOString(),
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };

          await supabase.from("ponto").insert(payload);
          alert("Ponto registado com sucesso!");
          loadHistorico(func.id);
        },
        () => alert("Não foi possível obter a localização.")
      );
    }
  );
}

document
  .getElementById("btnEditRegistration")
  .addEventListener("click", () => (window.location.href = "cadastro.html"));

initPage();
