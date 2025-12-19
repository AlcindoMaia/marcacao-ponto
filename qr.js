// ===================================================================
// CONFIG SUPABASE
// ===================================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================================================================
// CARREGAR LISTA DE OBRAS
// ===================================================================
async function carregarObras() {
    const { data, error } = await supabaseClient
        .from("obras")
        .select("id, nome")
        .order("nome");

    const lista = document.getElementById("listaObras");

    if (error) {
        alert("Erro ao carregar obras.");
        return;
    }

    lista.innerHTML = data.map(o =>
        `<option value="${o.id}">${o.nome}</option>`
    ).join("");
}

carregarObras();

// ===================================================================
// GERAR QR
// ===================================================================
document.getElementById("gerar").onclick = () => {
    const obraId = document.getElementById("listaObras").value;
    const qrUrl = `https://alcindomaia.github.io/marcacao-ponto/?obra=${obraId}`;

    const qr = new QRious({
        element: document.getElementById("qrCanvas"),
        size: 300,
        level: 'H',
        value: qrUrl
    });

    // Criar imagem final com o logo no centro
    const canvas = document.getElementById("qrCanvas");
    const ctx = canvas.getContext("2d");

    const logo = new Image();
    logo.src = "Logo.png"; // coloca aqui o nome da imagem do teu logótipo na raiz do projeto
    logo.onload = () => {
        const size = 60;
        const x = (canvas.width - size) / 2;
        const y = (canvas.height - size) / 2;
        ctx.drawImage(logo, x, y, size, size);

        // Botão de download
        const download = document.getElementById("downloadBtn");
        download.href = canvas.toDataURL("image/png");
    };
};
