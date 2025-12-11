alert("TESTE: cadastro.js carregado do servidor real");

// cadastro.js - FIX FINAL

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

document.addEventListener("DOMContentLoaded", () => {
  console.log("cadastro.js carregado");
  const deviceId = getDeviceId();

  document.getElementById("deviceInfo").textContent =
    "Identificador do dispositivo: " + deviceId;

  document.getElementById("frmCadastro").onsubmit = async function(e){
    e.preventDefault();
    e.stopPropagation();
    console.log("SUBMIT INTERCEPTADO");

    const nome = document.getElementById("nome").value.trim();
    const codigo = document.getElementById("codigo").value.trim();

    if (!nome) {
      alert("Introduza o nome do funcionário.");
      return;
    }

    // VERIFICAR SE EXISTE
    const { data: existente, error: erroSelect } = await supabase
      .from("funcionarios")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (erroSelect) {
      alert("ERRO SELECT: " + JSON.stringify(erroSelect));
      return;
    }
    
console.log("SELECT retorno:", existente, erroSelect);
alert("SELECT retorno: " + JSON.stringify({ existente, erroSelect }));

    // ATUALIZAR REGISTO EXISTENTE
    if (existente) {
      const { error: errUpdate } = await supabase
        .from("funcionarios")
        .update({ nome, codigo })
        .eq("device_id", deviceId);

      if (errUpdate) {
        alert("ERRO UPDATE: " + JSON.stringify(errUpdate));
        return;
      }

      document.getElementById("msg").textContent =
        "Registo atualizado com sucesso!";
      console.log("UPDATE OK");
      return;
    }

    // INSERIR NOVO
    const { error: errInsert } = await supabase
      .from("funcionarios")
      .insert({
        nome,
        codigo,
        device_id: deviceId
      });

    if (errInsert) {
      alert("ERRO INSERT: " + JSON.stringify(errInsert));
      return;
    }
console.log("INSERT retorno:", errInsert);
alert("INSERT retorno: " + JSON.stringify(errInsert));

    console.log("INSERT OK");
    document.getElementById("msg").textContent =
      "Registado com sucesso! Pode fechar a página.";
  };
});
