// ================================
// CONFIGURAÇÃO SUPABASE
// ================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
        const { data: existente, error: erroSelect } = await supabaseClient
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

            const { error: errUpdate } = await supabaseClient
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
        const { error: errInsert } = await supabaseClient
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
