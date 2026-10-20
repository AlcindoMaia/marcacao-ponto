// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================

// =======================================================
// LÓGICA DE CADASTRO
//
// O administrador gera um código de inscrição no painel e entrega-o à
// pessoa. A pessoa abre esta página, escreve o código, e o dispositivo
// fica associado ao registo dela.
//
// Antes pedia-se o NOME, e o nome era o único segredo exigido: quem
// soubesse o nome de alguém activo ainda sem dispositivo — um ex-colega,
// quem tivesse visto uma lista — ficava com a identidade dessa pessoa,
// marcava-lhe ponto, lia-lhe o histórico e, com acesso ao stock,
// movimentava inventário. Um nome não é um segredo.
//
// O código é de uso único, expira em 48 horas, e é consumido no servidor.
// =======================================================

function getDeviceId() {
    let id = localStorage.getItem("deviceId");
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("deviceId", id);
    }
    return id;
}

document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("frmCadastro");
    const msg  = document.getElementById("msg");
    if (!form) return;

    const deviceId = getDeviceId();

    const deviceInfo = document.getElementById("deviceInfo");
    if (deviceInfo) {
        deviceInfo.textContent = "ID: " + deviceId.substring(0, 8) + "...";
    }

    // Já registado? Dizê-lo logo, em vez de pedir um código à toa.
    const { data: jaRegistado } = await SB.rpc("funcionario_por_dispositivo", {
        p_device: deviceId
    });
    const jr = Array.isArray(jaRegistado) ? jaRegistado[0] : jaRegistado;
    if (jr) {
        msg.textContent = "Este dispositivo já está registado como " + jr.nome + ".";
        msg.style.color = "#2a8a2a";
        form.querySelector("button[type=submit]").disabled = true;
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const codigo = document.getElementById("codigo").value.trim().toUpperCase();
        if (!codigo) {
            msg.textContent = "Introduza o código que o administrador lhe deu.";
            msg.style.color = "#c0392b";
            return;
        }

        msg.textContent = "A verificar...";
        msg.style.color = "";

        // A associação é feita no servidor. Esta página corre sem login e não
        // tem permissão para escrever na tabela: a função só associa quando o
        // código existe, está dentro do prazo, e a pessoa está activa e ainda
        // sem dispositivo. Ao associar, apaga o código.
        const { data, error } = await SB.rpc("registar_dispositivo_por_codigo", {
            p_codigo: codigo,
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
            // A mesma mensagem para código errado, expirado e já usado: não
            // há nada a ganhar em dizer a quem tenta qual dos três é.
            msg.textContent = "Código inválido ou expirado. Peça um novo ao administrador.";
            msg.style.color = "#c0392b";
            return;
        }

        msg.textContent = "✓ Dispositivo registado como " + func.nome + "! Já pode marcar ponto.";
        msg.style.color = "#2a8a2a";
        form.querySelector("button[type=submit]").disabled = true;
    });
});
