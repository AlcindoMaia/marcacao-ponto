alert("JS carregado");

// cadastro.js - Registo de dispositivo + funcionário

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
  const deviceId = getDeviceId();
  document.getElementById("deviceInfo").textContent =
    "Identificador do dispositivo: " + deviceId;

  document
    .getElementById("frmCadastro")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const nome = document.getElementById("nome").value.trim();
      const codigo = document.getElementById("codigo").value.trim();

      if (!nome) {
        alert("Introduza o nome do funcionário.");
        return;
      }

      const { data: existente } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();

      if (existente) {
        await supabase
          .from("funcionarios")
          .update({ nome, codigo })
          .eq("device_id", deviceId);

        document.getElementById("msg").textContent =
          "Registo atualizado com sucesso!";
        return;
      }

      await supabase.from("funcionarios").insert({
        nome,
        codigo,
        device_id: deviceId,
      });

      document.getElementById("msg").textContent =
        "Registado com sucesso! Pode fechar a página.";
    });
});
