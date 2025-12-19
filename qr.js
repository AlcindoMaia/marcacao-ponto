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
    }, { enableHighAccuracy: true, timeout:15000 });
};


// ===================================================================
// CRIAR OBRA + GERAR QR
// ===================================================================
document.getElementById("formObra").onsubmit = async (e) => {
    e.preventDefault();

    const nome = document.getElementById("nomeObra").value.trim();
    const morada = document.getElementById("morada").value.trim();
    const raio = parseInt(document.getElementById("raio").value);
    const lat = parseFloat(document.getElementById("latitude").value);
    const lon = parseFloat(document.getElementById("longitude").value);

    if (!nome || !lat || !lon) {
        alert("Preencha nome e localização.");
        return;
    }

    // Criar obra no Supabase
    const { data, error } = await supabaseClient
        .from("obras")
        .insert({
            nome,
            morada,
            latitude: lat,
            longitude: lon,
            raio: raio
        })
        .select()
        .maybeSingle();

    if (error || !data) {
        alert("Erro ao criar obra.");
        console.error(error);
        return;
    }

    const obraID = data.id;
    const urlObra = `https://alcindomaia.github.io/marcacao-ponto/?obra=${obraID}`;

    // Gerar QR
    const qr = new QRious({
        element: document.getElementById("qrCanvas"),
        size: 300,
        level: 'H',
        value: urlObra
    });

    // Inserir logótipo no centro
    const canvas = document.getElementById("qrCanvas");
    const ctx = canvas.getContext("2d");

    const logo = new Image();
    logo.src = "Logo.png";  // Tens de colocar este ficheiro no repo
    logo.onload = () => {
        const s = 60;
        const x = (canvas.width - s) / 2;
        const y = (canvas.height - s) / 2;
        ctx.drawImage(logo, x, y, s, s);

        // Botão para download
        document.getElementById("downloadBtn").href =
            canvas.toDataURL("image/png");
    };

    document.getElementById("qrBox").classList.remove("hidden");

    alert("Obra criada e QR gerado com sucesso!");
};
