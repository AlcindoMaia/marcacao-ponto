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

        // A associação é feita no servidor pela função registar_dispositivo:
        // esta página corre sem login e não tem permissão para escrever na
        // tabela. A função só associa quando o nome corresponde a um único
        // funcionário ativo ainda sem dispositivo, e devolve quem ficou
        // associado (ou o registo existente, se este dispositivo já estiver
        // registado). Sem correspondência, devolve vazio.
        const { data, error } = await SB.rpc("registar_dispositivo", {
            p_nome:   nome,
            p_device: deviceId
        });

        if (error) {
            msg.textContent = "Erro de ligação. Tente novamente.";
            msg.style.color = "#c0392b";
            console.error(error);
            return;
        }

        const func = Array.isArray(data) ? data[0] : data;

        if (!func) {
            msg.textContent = "Nome não encontrado ou já registado noutro dispositivo. Contacte o administrador.";
            msg.style.color = "#c0392b";
            return;
        }

        msg.textContent = "✓ Dispositivo registado como " + func.nome + "! Já pode marcar ponto.";
        msg.style.color = "#2a8a2a";
    });
});
