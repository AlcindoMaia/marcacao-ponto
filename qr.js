// ===================================================================
// CONFIG SUPABASE
// ===================================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ===================================================================
// OBTER LOCALIZAÇÃO ATUAL
// ===================================================================
document.getElementById("btnGPS").onclick = () => {
    navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById("latitude").value = pos.coords.latitude;
        document.getElementById("longitude").value = pos.coords.longitude;
    }, err => {
        alert("Erro ao obter localização. Ative o GPS.");
        console.error(err);
    }, {
        enableHighAccuracy: true,
        timeout: 15000
    });
};


// ===================================================================
// CRIAR OBRA + GERAR QR
// ===================================================================
document.getElementById("formObra").onsubmit = async (e) => {
    e.preventDefault();

    const nome = document.getElementById("nomeObra").value.trim();
    const morada = document.getElementById("morada").value.trim();
    const raio = parseInt(document.getElementById("raio").value);
    const latitude = parseFloat(document.getElementById("latitude").value);
    const longitude = parseFloat(document.getElementById("longitude").value);

    if (!nome) {
        alert("O nome da obra é obrigatório.");
        return;
    }
    if (isNaN(latitude) || isNaN(longitude)) {
        alert("As coordenadas GPS são obrigatórias.");
        return;
    }

    // Criar obra no Supabase
    const { data, error } = await supabaseClient
        .from("obras")
        .insert({
            nome,
            morada,
            latitude,
            longitude,
            raio
        })
        .select()
        .maybeSingle();

    if (error || !data) {
        alert("ERRO AO CRIAR OBRA:\n" + JSON.stringify(error));
        console.error(error);
        return;
    }

    const obraID = data.id;

    // URL final da obra
    const qrURL = `https://alcindomaia.github.io/marcacao-ponto/?obra=${obraID}`;

    // Gerar QR
    const canvas = document.getElementById("qrCanvas");
    const qr = new QRious({
        element: canvas,
        size: 300,
        level: "H",
        value: qrURL
    });

    // Inserir LOGO no centro do QR
    const ctx = canvas.getContext("2d");
    const logo = new Image();
    logo.src = "Logo.png";  // O teu logótipo deve estar na raiz do repo

    logo.onload = () => {
        const size = 60;
        const x = (canvas.width - size) / 2;
        const y = (canvas.height - size) / 2;
        ctx.drawImage(logo, x, y, size, size);

        // Nome do ficheiro de download
        const nomeArquivo = "QR_" + nome.replace(/\s+/g, "_") + ".png";

        const download = document.getElementById("downloadBtn");
        download.href = canvas.toDataURL("image/png");
        download.download = nomeArquivo;
    };

    document.getElementById("qrBox").classList.remove("hidden");

    alert("Obra criada com sucesso! QR gerado.");
};
