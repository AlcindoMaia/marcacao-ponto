// cadastro.js - Registo de dispositivo + funcionário

const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_67e1zdXpV7_PXZ-0_ZmmSw__9ddgDKF";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Gera ou obtém o ID único do dispositivo
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

document.addEventListener("DOMContentLoaded", () => {
  const deviceId = getDeviceId();

  // Mostrar Device ID no ecrã
  document.getElementById("deviceInfo").textContent =
    "Identificador do dispositivo: " + deviceId;

  // Evento de submissão do formulário
  document.getElementById("frmCadastro").addEventListener("submit", async (e) => {
    e.preventDefault();

    const nome = document.getElementById("nome").value.trim();
    const codigo = document.getElementById("codigo").value.trim();

    if (!nome) {
      alert("Introduza o nome do funcionário.");
      return;
    }

    // Verificar se já existe um funcionário com este device_id
    const { data: existente, error: errSelect } = await supabase
      .from("funcionarios")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (errSelect) {
      document.getElementById("msg").textContent = "Erro ao verificar registo.";
      console.error(errSelect);
      return;
    }

    // Se já existir → atualizar
    if (existente) {
      const { error: errUpdate } = await supabase
        .from("funcionarios")
        .update({ nome, codigo })
        .eq("device_id", deviceId);

      if (errUpdate) {
        document.getElementById("msg").textContent = "Erro ao atualizar registo.";
        console.error(errUpdate);
      } else {
        document.getElementById("msg").textContent = "Registo atualizado com sucesso!";
      }

      return;
    }

    // Se não existir → inserir
    const { error: errInsert } = await supabase.from("funcionarios").insert({
      nome,
      codigo,
      device_id: deviceId,
    });

    if (errInsert) {
      document.getElementById("msg").textContent = "Erro ao registar funcionário.";
      console.error(errInsert);
    } else {
      document.getElementById("msg").textContent =
        "Registado com sucesso! Pode fechar esta página.";
    }
  });
});
