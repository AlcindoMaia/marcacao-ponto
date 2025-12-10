// cadastro.js - Registo de dispositivo + funcionário (versão corrigida + debug)

// =====================================================
//  CONFIG SUPABASE
// =====================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_67e1zdXpV7_PXZ-0_ZmmSw__9ddgDKF";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================================================
//  GERAR OU OBTER DEVICE ID
// =====================================================
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

// =====================================================
//  MAIN
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("cadastro.js carregado"); // confirmação que JS está a funcionar
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

    // =====================================================
    //  VERIFICAR SE JÁ EXISTE UM FUNCIONÁRIO COM ESTE DEVICE ID
    // =====================================================
    const { data: existente, error: erroSelect } = await supabase
      .from("funcionarios")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (erroSelect) {
      console.error("ERRO SELECT:", erroSelect);
      alert("ERRO SELECT: " + JSON.stringify(erroSelect));
      return;
    }

    // =====================================================
    //  SE EXISTIR → ATUALIZAR
    // =====================================================
    if (existente) {
      const { error: errUpdate } = await supabase
        .from("funcionarios")
        .update({ nome, codigo })
        .eq("device_id", deviceId);

      if (errUpdate) {
        console.error("ERRO UPDATE:", errUpdate);
        alert("ERRO UPDATE: " + JSON.stringify(errUpdate));
        return;
      }

      document.getElementById("msg").textContent =
        "Registo atualizado com sucesso!";
      return;
    }

    // =====================================================
    //  SE NÃO EXISTIR → INSERIR
    // =====================================================
    const { error: errInsert } = await supabase.from("funcionarios").insert({
      nome,
      codigo,
      device_id: deviceId,
    });

    if (errInsert) {
      console.error("ERRO INSERT:", errInsert);
      alert("ERRO INSERT: " + JSON.stringify(errInsert)); // agora mostra sempre
      return;
    }

    // =====================================================
    //  SUCESSO
    // =====================================================
    document.getElementById("msg").textContent =
      "Registado com sucesso! Pode fechar esta página.";
  });
});
