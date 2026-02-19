// =======================================================
// CONFIG SUPABASE
// =======================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// =======================================================
// HAVERSINE — cálculo distância GPS
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
// GPS
// =======================================================
document.getElementById("btnGPS")?.addEventListener("click", () => {

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

});


// =======================================================
// VERIFICAR DUPLICAÇÃO
// =======================================================
async function obraDuplicada(nome, morada, lat, lon, raioNovo) {

    const { data: obras, error } = await SB
        .from("obras")
        .select("*");

    if (error || !obras) return false;

    for (const ob of obras) {

        if (ob.nome.toLowerCase() === nome.toLowerCase()) {
            return "Já existe uma obra com este nome.";
        }

        if (morada && ob.morada &&
            ob.morada.toLowerCase() === morada.toLowerCase()) {
            return "Já existe uma obra com esta morada.";
        }

        if (ob.latitude && ob.longitude) {

            const dist = haversine(
                lat, lon,
                ob.latitude,
                ob.longitude
            );

            if (dist <= ob.raio || dist <= raioNovo) {
                return `Localização demasiado próxima da obra "${ob.nome}" (${Math.round(dist)}m).`;
            }
        }
    }

    return false;
}


// =======================================================
// GERAR PDF
// =======================================================
async function gerarPDF(nomeObra, morada) {

    if (!window.jspdf) return;

    const canvas = document.getElementById("qrCanvas");
    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    pdf.setFontSize(22);
    pdf.text("QR Code da Obra", 105, 20, { align: "center" });

    pdf.setFontSize(16);
    pdf.text(nomeObra, 105, 30, { align: "center" });

    if (morada) {
        pdf.setFontSize(12);
        pdf.text(morada, 105, 36, { align: "center" });
    }

    pdf.addImage(imgData, "PNG", 45, 50, 120, 120);

    pdf.setFontSize(10);
    pdf.text("Gerado automaticamente por Maia Solutions", 105, 285, { align: "center" });

    pdf.save(`QR_${nomeObra.replace(/\s+/g, "_")}.pdf`);
}


let ultimaObraCriada = null;


// =======================================================
// CRIAR OBRA + GERAR QR
// =======================================================
document.getElementById("btnGerar")?.addEventListener("click", async () => {

    const nome = document.getElementById("nomeObra").value.trim();
    const morada = document.getElementById("morada").value.trim();
    const raio = parseInt(document.getElementById("raio").value);
    const latitude = parseFloat(document.getElementById("latitude").value);
    const longitude = parseFloat(document.getElementById("longitude").value);

    if (!nome) return alert("Nome obrigatório.");
    if (isNaN(latitude) || isNaN(longitude))
        return alert("Coordenadas obrigatórias.");
    if (isNaN(raio))
        return alert("Raio inválido.");

    const duplicado = await obraDuplicada(
        nome, morada, latitude, longitude, raio
    );

    if (duplicado) {
        alert(duplicado);
        return;
    }

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

    if (error) {
        alert("Erro ao criar obra:\n" + error.message);
        return;
    }

    ultimaObraCriada = data;

    const qrURL =
        `https://alcindomaia.github.io/marcacao-ponto/?obra=${data.id}`;

    const canvas = document.getElementById("qrCanvas");

    new QRious({
        element: canvas,
        size: 300,
        level: "H",
        value: qrURL
    });

    const download = document.getElementById("downloadBtn");
    download.href = canvas.toDataURL("image/png");
    download.download = "QR_" + nome + ".png";

    document.getElementById("qrBox").style.display = "block";

    alert("Obra criada com sucesso.");
});


// =======================================================
// GERAR PDF (APENAS SE JÁ EXISTIR OBRA)
// =======================================================
document.getElementById("btnPDF")?.addEventListener("click", () => {

    if (!ultimaObraCriada) {
        alert("Primeiro crie a obra.");
        return;
    }

    gerarPDF(
        ultimaObraCriada.nome,
        ultimaObraCriada.morada
    );
});
