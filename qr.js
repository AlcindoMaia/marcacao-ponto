// ===================================================================
// CONFIG SUPABASE
// ===================================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ===================================================================
// HAVERSINE — distância entre dois pontos GPS
// ===================================================================
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
// VERIFICAÇÃO DE DUPLICAÇÃO DE OBRAS
// ===================================================================
async function obraDuplicada(nome, morada, lat, lon, raioNovo) {

    const { data: obras, error } = await supabaseClient
        .from("obras")
        .select("*");

    if (error) return false; // fallback

    for (const ob of obras) {

        // A) MESMO NOME
        if (ob.nome.toLowerCase() === nome.toLowerCase()) {
            return "Já existe uma obra com este nome.";
        }

        // B) MESMA MORADA
        if (morada && ob.morada && ob.morada.toLowerCase() === morada.toLowerCase()) {
            return "Já existe uma obra com esta morada.";
        }

        // C) MESMA LOCALIZAÇÃO / RAIO
        if (ob.latitude && ob.longitude) {
            const dist = haversine(lat, lon, ob.latitude, ob.longitude);
            if (dist <= ob.raio || dist <= raioNovo) {
                return `A localização indicada está demasiado próxima da obra "${ob.nome}". Distância: ${Math.round(dist)}m`;
            }
        }
    }

    return false; // sem duplicação
}


// ===================================================================
// EXPORTAR QR COMO PDF A4 (com logótipo)
// ===================================================================
async function gerarPDF(nomeObra, morada) {

    const canvas = document.getElementById("qrCanvas");
    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    // Título
    pdf.setFontSize(22);
    pdf.text("QR Code da Obra", 105, 20, { align: "center" });

    // Nome da obra
    pdf.setFontSize(16);
    pdf.text(nomeObra, 105, 30, { align: "center" });

    if (morada) {
        pdf.setFontSize(12);
        pdf.text(morada, 105, 36, { align: "center" });
    }

    // Inserir QR no centro da folha
    pdf.addImage(imgData, "PNG", 45, 50, 120, 120);

    // Rodapé
    pdf.setFontSize(10);
    pdf.text("Gerado automaticamente por Maia Solutions", 105, 285, { align: "center" });

    pdf.save(`QR_${nomeObra.replace(/\s+/g, "_")}.pdf`);
}


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

    if (!nome) return alert("O nome da obra é obrigatório.");
    if (isNaN(latitude) || isNaN(longitude))
        return alert("As coordenadas GPS são obrigatórias.");

    // 1 — VERIFICAR DUPLICAÇÃO
    const duplicado = await obraDuplicada(nome, morada, latitude, longitude, raio);
    if (duplicado) {
        alert(duplicado);
        return;
    }

    // 2 — CRIAR A OBRA
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

    // 3 — URL da obra
    const qrURL = `https://alcindomaia.github.io/marcacao-ponto/?obra=${obraID}`;

    // 4 — GERAR QR
    const canvas = document.getElementById("qrCanvas");
    new QRious({
        element: canvas,
        size: 300,
        level: "H",
        value: qrURL
    });

    // 5 — LOGÓTIPO NO CENTRO
    const ctx = canvas.getContext("2d");
    const logo = new Image();
    logo.src = "Logo.png";

    logo.onload = () => {
        const size = 60;
        ctx.drawImage(logo, (canvas.width - size)/2, (canvas.height - size)/2, size, size);

        // Botão PNG
        const download = document.getElementById("downloadBtn");
        download.href = canvas.toDataURL("image/png");
        download.download = "QR_" + nome.replace(/\s+/g, "_") + ".png";

        document.getElementById("qrBox").classList.remove("hidden");
    };

    // 6 — PDF AUTOMÁTICO
    document.getElementById("btnPDF").onclick = () => gerarPDF(nome, morada);

    alert("Obra criada com sucesso! QR gerado.");
};
