// cadastro.js - FIX FINAL

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_67e1zdXpV7_PXZ-0_ZmmSw__9ddgDKF";
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
