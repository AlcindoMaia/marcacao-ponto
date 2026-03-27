// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================

// =======================================================
// LÓGICA DE CADASTRO
// O admin cria o funcionário no painel com o nome correto.
// O funcionário abre esta página, escreve o seu nome EXATO
// e o sistema associa o device_id ao registo existente.
// Se o nome não existir, não é permitido o registo.
// =======================================================

function getDeviceId() {
    let id = localStorage.getItem("deviceId");
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("deviceId", id);
    }
    return id;
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("frmCadastro");
    const msg  = document.getElementById("msg");
    if (!form) return;

    const deviceId = getDeviceId();

    // Mostrar device ID (info para o admin se necessário)
    const deviceInfo = document.getElementById("deviceInfo");
    if (deviceInfo) {
        deviceInfo.textContent = "ID: " + deviceId.substring(0,8) + "...";
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nome   = document.getElementById("nome").value.trim();
        if (!nome) {
            msg.textContent = "Introduza o seu nome completo.";
            msg.style.color = "#c0392b";
            return;
        }

        msg.textContent = "A verificar...";
        msg.style.color = "";

        // 1) Verificar se já há um registo com este device_id
        const { data: jaRegis } = await SB
            .from("funcionarios")
            .select("id, nome, device_id")
            .eq("device_id", deviceId)
            .maybeSingle();

        if (jaRegis) {
            msg.textContent = "✓ Este dispositivo já está registado como " + jaRegis.nome + ".";
            msg.style.color = "#2a8a2a";
            return;
        }

        // 2) Procurar o funcionário pelo nome EXATO (criado pelo admin)
        // Apenas funcionários sem device_id associado (ainda não registados)
        const { data: func, error } = await SB
            .from("funcionarios")
            .select("id, nome, device_id")
            .ilike("nome", nome)
            .is("device_id", null)
            .maybeSingle();

        if (error) {
            msg.textContent = "Erro de ligação. Tente novamente.";
            msg.style.color = "#c0392b";
            return;
        }

        if (!func) {
            msg.textContent = "Nome não encontrado ou já registado noutro dispositivo. Contacte o administrador.";
            msg.style.color = "#c0392b";
            return;
        }

        // 3) Associar este device_id ao funcionário
        const { error: errUpdate } = await SB
            .from("funcionarios")
            .update({ device_id: deviceId })
            .eq("id", func.id);

        if (errUpdate) {
            msg.textContent = "Erro ao registar. Tente novamente.";
            msg.style.color = "#c0392b";
            console.error(errUpdate);
            return;
        }

        msg.textContent = "✓ Dispositivo registado com sucesso! Já pode marcar ponto.";
        msg.style.color = "#2a8a2a";
    });
});
