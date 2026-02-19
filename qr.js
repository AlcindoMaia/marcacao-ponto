// =======================================================
// CONFIG SUPABASE
// =======================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// =======================================================
// HAVERSINE (DISTÂNCIA GPS)
// =======================================================
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const toRad = d => d * Math.PI / 180;

    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);

    const a =
        Math.sin(Δφ/2)**2 +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ/2)**2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}


// =======================================================
// OBTER LOCALIZAÇÃO
// =======================================================
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


// =======================================================
// VERIFICAR DUPLICAÇÃO
// =======================================================
async function obraDuplicada(nome, morada, lat, lon, raioNovo) {

    const { data, error } = await SB
        .from("obras")
        .select("*");

    if (error) {
        console.error(error);
        return false;
    }

    for (const ob of data) {

        // Mesmo nome
        if (ob.nome.toLowerCase() === nome.toLowerCase()) {
            return "Já existe uma obra com este nome.";
        }

        // Mesma morada
        if (morada && ob.morada &&
            ob.morada.toLowerCase() === morada.toLowerCase()) {
            return "Já existe uma obra com esta morada.";
        }

        // Proximidade GPS
        if (ob.latitude && ob.longitude) {
            const dist = haversine(lat, lon, ob.latitude, ob.longitude);

            if (dist <= (ob.raio || 0) || dist <= raioNovo) {
                return `Obra demasiado próxima de "${ob.nome}" (${Math.round(dist)}m).`;
            }
        }
    }

    return false;
}


// =======================================================
// GERAR PDF
// =======================================================
function gerarPDF(nomeObra, morada) {

    const canvas = document.getElementById("qrCanvas");
    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("portrait", "mm", "a4");

    pdf.setFontSize(20);
    pdf.text("QR Code da Obra", 105, 20, { align: "center" });

    pdf.setFontSize(14);
    pdf.text(nomeObra, 105, 30, { align: "center" });

    if (morada) {
        pdf.setFontSize(11);
        pdf.text(morada, 105, 36, { align: "center" });
    }

    pdf.addImage(imgData, "PNG", 45, 50, 120, 120);

    pdf.save(`QR_${nomeObra.replace(/\s+/g, "_")}.pdf`);
}


// =======================================================
// CRIAR OBRA + GERAR QR
// =======================================================
document.getElementById("btnGerar").onclick = async () => {

    const nome = document.getElementById("nomeObra").value.trim();
    const morada = document.getElementById("morada").value.trim();

    const raioInput = document.getElementById("raio").value.trim();
    const latInput = document.getElementById("latitude").value.trim();
    const lonInput = document.getElementById("longitude").value.trim();

    const raio = raioInput ? parseInt(raioInput) : 120;
    const latitude = latInput ? parseFloat(latInput) : null;
    const longitude = lonInput ? parseFloat(lonInput) : null;

    if (!nome) return alert("Nome obrigatório.");
    if (latitude === null || longitude === null)
        return alert("Coordenadas obrigatórias.");

    // Verificar duplicação
    const duplicado = await obraDuplicada(
        nome,
        morada,
        latitude,
        longitude,
        raio
    );

    if (duplicado) {
        alert(duplicado);
        return;
    }

    // Inserir obra
    const { data, error } = await SB
        .from("obras")
        .insert({
            nome,
            morada: morada || null,
            latitude,
            longitude,
            raio
        })
        .select()
        .single();

    if (error || !data) {
        alert("Erro ao criar obra:\n" + error.message);
        console.error(error);
        return;
    }

    const obraID = data.id;

    // Criar URL
    const qrURL =
        `https://alcindomaia.github.io/marcacao-ponto/?obra=${obraID}`;

    // Gerar QR
    const canvas = document.getElementById("qrCanvas");

    new QRious({
        element: canvas,
        size: 300,
        level: "H",
        value: qrURL
    });

    // Inserir logotipo
    const ctx = canvas.getContext("2d");
    const logo = new Image();
    logo.src = "Logo.png";

    logo.onload = () => {
        const size = 60;
        ctx.drawImage(
            logo,
            (canvas.width - size) / 2,
            (canvas.height - size) / 2,
            size,
            size
        );

        const download = document.getElementById("downloadBtn");
        download.href = canvas.toDataURL("image/png");
        download.download =
            "QR_" + nome.replace(/\s+/g, "_") + ".png";

        document.getElementById("qrBox").style.display = "block";
    };

    alert("Obra criada com sucesso!");
};
