// =======================================================
// SUPABASE
// =======================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PIN_ADMIN = "1810";

// =======================================================
// LOGIN
// =======================================================
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("pinInput")?.focus();
    ligarEventosGlobais();
});

function validarPIN() {

    const pinInput = document.getElementById("pinInput");
    const msg = document.getElementById("pinMsg");

    if (!pinInput) return;

    const pin = pinInput.value.trim();

    if (pin !== PIN_ADMIN) {
        msg.textContent = "PIN incorreto";
        return;
    }

    msg.textContent = "";

    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("adminArea").classList.remove("hidden");

    inicializarPainel();
}

document.addEventListener("keydown", e => {
    if (e.key === "Enter" &&
        !document.getElementById("loginBox").classList.contains("hidden")) {
        validarPIN();
    }
});

// =======================================================
// INICIALIZAÇÃO
// =======================================================
function inicializarPainel() {
    ativarTabs();
    abrirTab("financeiro");
}

// =======================================================
// TABS (CORRIGIDO)
// =======================================================
function ativarTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
        btn.onclick = () => abrirTab(btn.dataset.tab);
    });
}

function abrirTab(nome) {

    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    const tabBtn = document.querySelector(`.tab[data-tab="${nome}"]`);
    const tabDiv = document.getElementById("tab-" + nome);

    if (!tabBtn || !tabDiv) return;

    tabBtn.classList.add("active");
    tabDiv.classList.add("active");

    if (nome === "inventario") initInventario();
    if (nome === "registos") carregarRegistos();
    if (nome === "financeiro") carregarFinanceiro();
    if (nome === "fluxo") initFluxo();
}
