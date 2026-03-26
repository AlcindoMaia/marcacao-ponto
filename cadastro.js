// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================

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

    const form = document.getElementById("frmCadastro");
    const msg = document.getElementById("msg");

    if (!form) {
        console.error("Formulário não encontrado");
        return;
    }

    const deviceId = getDeviceId();

    const deviceInfo = document.getElementById("deviceInfo");
    if (deviceInfo) {
        deviceInfo.textContent = "ID Dispositivo: " + deviceId;
    }

    form.addEventListener("submit", async (e) => {

        e.preventDefault();

        const nome = document.getElementById("nome").value.trim();
        const codigo = document.getElementById("codigo").value.trim();

        if (!nome) {
            msg.textContent = "Introduza o nome do funcionário.";
            return;
        }

        msg.textContent = "A registar...";

        // Verificar se já existe
        const { data: existente, error: erroSelect } = await SB
            .from("funcionarios")
            .select("*")
            .eq("device_id", deviceId)
            .maybeSingle();

        if (erroSelect) {
            msg.textContent = "Erro ao verificar registo.";
            console.error(erroSelect);
            return;
        }

        // UPDATE
        if (existente) {

            const { error: errUpdate } = await SB
                .from("funcionarios")
                .update({ nome, codigo })
                .eq("device_id", deviceId);

            if (errUpdate) {
                msg.textContent = "Erro ao atualizar.";
                console.error(errUpdate);
                return;
            }

            msg.textContent = "Registo atualizado com sucesso.";
            return;
        }

        // INSERT
        const { error: errInsert } = await SB
            .from("funcionarios")
            .insert({
                nome,
                codigo,
                device_id: deviceId
            });

        if (errInsert) {
            msg.textContent = "Erro ao registar.";
            console.error(errInsert);
            return;
        }

        msg.textContent = "Registado com sucesso.";
    });
});
