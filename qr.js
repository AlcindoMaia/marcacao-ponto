// =======================================================
// CONFIG SUPABASE
// =======================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// =======================================================
// GPS
// =======================================================
document.getElementById("btnGPS").addEventListener("click", () => {

    navigator.geolocation.getCurrentPosition(
        pos => {
            document.getElementById("latitude").value =
                pos.coords.latitude.toFixed(8);

            document.getElementById("longitude").value =
                pos.coords.longitude.toFixed(8);
        },
        err => {
            alert("Erro ao obter localização.");
            console.error(err);
        },
        { enableHighAccuracy: true }
    );
});


// =======================================================
// CRIAR OBRA + QR
// =======================================================
document.getElementById("btnGerar").addEventListener("click", async () => {

    const nome = document.getElementById("nomeObra").value.trim();
    const morada = document.getElementById("morada").value.trim();

    const latitude = parseFloat(document.getElementById("latitude").value);
    const longitude = parseFloat(document.getElementById("longitude").value);

    const raioInput = document.getElementById("raio").value;

    if (!nome) {
        alert("Nome obrigatório.");
        return;
    }

    if (isNaN(latitude) || isNaN(longitude)) {
        alert("Latitude e Longitude obrigatórias.");
        return;
    }

    // ===================================================
    // CONSTRUÇÃO SEGURA DO OBJECTO
    // ===================================================
    const dados = {
        nome: nome,
        morada: morada || null,
        latitude: latitude,
        longitude: longitude
    };

    // 👇 Só adiciona raio se existir valor válido
    if (raioInput !== "" && !isNaN(parseInt(raioInput))) {
        dados.raio = parseInt(raioInput);
    }

    console.log("OBJETO ENVIADO:", dados);

    const { data, error } = await SB
        .from("obras")
        .insert(dados)
        .select()
        .single();

    if (error) {
        alert("Erro ao criar obra:\n" + error.message);
        console.error(error);
        return;
    }

    const obraID = data.id;

    // ===================================================
    // GERAR QR
    // ===================================================
    const qrURL =
        "https://alcindomaia.github.io/marcacao-ponto/?obra=" + obraID;

    const canvas = document.getElementById("qrCanvas");

    new QRious({
        element: canvas,
        size: 300,
        value: qrURL,
        level: "H"
    });

    const downloadBtn = document.getElementById("downloadBtn");
    downloadBtn.href = canvas.toDataURL("image/png");
    downloadBtn.download =
        "QR_" + nome.replace(/\s+/g, "_") + ".png";

    document.getElementById("qrBox")
        .classList.remove("hidden");

    alert("Obra criada com sucesso!");
});
