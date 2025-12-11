// ================================
// CONFIGURAÇÃO DO SUPABASE
// ================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("Supabase inicializado");


// ================================
// DEVICE ID PERMANENTE
// ================================
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}


// ================================
// MAIN
// ================================
document.addEventListener("DOMContentLoaded", () => {

  console.log("cadastro.js carregado");

  const deviceId = getDeviceId();
  document.getElementById("deviceInfo").textContent =
    "Identificador do dispositivo: " + deviceId;

  const form = document.getElementById("frmCadastro");

  // INTERCEPTAR SUBMIT
  form.onsubmit = async function (e) {
    e.preventDefault();
    e.stopPropagation();

    console.log("SUBMIT INTERCEPTADO");

    const nome = document.getElementById("nome").value.trim();
    const codigo = document.getElementById("codigo").value.trim();

    if (!nome) {
      alert("Introduza o nome do funcionário.");
      return;
    }

    // ================================
    // VERIFICAR SE JÁ EXISTE (SELECT)
    // ================================
    const { data: existente, error: erroSelect } = await supabaseClient
      .from("funcionarios")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (erroSelect) {
      alert("ERRO AO LER DA BASE DE DADOS:\n" + JSON.stringify(erroSelect));
      console.error(erroSelect);
      return;
    }

    // ================================
    // UPDATE SE EXISTE
    // ================================
    if (existente) {

      const { error: errUpdate } = await supabaseClient
        .from("funcionarios")
        .update({ nome, codigo })
        .eq("device_id", deviceId);

      if (errUpdate) {
        alert("ERRO AO ATUALIZAR:\n" + JSON.stringify(errUpdate));
        console.error(errUpdate);
        return;
      }

      document.getElementById("msg").textContent =
        "Registo atualizado com sucesso!";
      console.log("UPDATE OK");
      return;
    }

    // ================================
    // INSERT SE NÃO EXISTE
    // ================================
    const { error: errInsert } = await supabaseClient
      .from("funcionarios")
      .insert({
        nome,
        codigo,
        device_id: deviceId
      });

    if (errInsert) {
      alert("ERRO AO INSERIR:\n" + JSON.stringify(errInsert));
      console.error(errInsert);
      return;
    }

    console.log("INSERT OK");
    document.getElementById("msg").textContent =
      "Registado com sucesso! Pode fechar a página.";
  };
});
