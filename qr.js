// =======================================================
// SUPABASE — vem de config.js (SB já está disponível)
// =======================================================

// =======================================================
// GPS — obter coordenadas actuais
// =======================================================
document.getElementById("btnGPS").addEventListener("click", () => {
    navigator.geolocation.getCurrentPosition(
        pos => {
            document.getElementById("latitude").value  = pos.coords.latitude.toFixed(8);
            document.getElementById("longitude").value = pos.coords.longitude.toFixed(8);
        },
        err => {
            alert("Erro ao obter localização. Verifique se o GPS está ativo.");
            console.error(err);
        },
        { enableHighAccuracy: true }
    );
});

// =======================================================
// CRIAR OBRA + GERAR QR
// =======================================================
document.getElementById("btnGerar").addEventListener("click", async () => {
    const nome     = document.getElementById("nomeObra").value.trim();
    const morada   = document.getElementById("morada").value.trim();
    const latitude = parseFloat(document.getElementById("latitude").value);
    const longitude = parseFloat(document.getElementById("longitude").value);
    const raioInput = document.getElementById("raio").value;

    if (!nome) {
        alert("O nome da obra é obrigatório.");
        return;
    }

    if (isNaN(latitude) || isNaN(longitude)) {
        alert("Latitude e Longitude são obrigatórias. Use o botão 'Obter Localização'.");
        return;
    }

    const dados = {
        nome,
        morada: morada || null,
        latitude,
        longitude
    };

    if (raioInput !== "" && !isNaN(parseInt(raioInput))) {
        dados.raio = parseInt(raioInput);
    }

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

    // Gerar QR code
    const qrURL = "https://alcindomaia.github.io/marcacao-ponto/?obra=" + obraID;
    const canvas = document.getElementById("qrCanvas");

    new QRious({
        element: canvas,
        size:    300,
        value:   qrURL,
        level:   "H"
    });

    // Configurar botão de download PNG
    const downloadBtn = document.getElementById("downloadBtn");
    downloadBtn.href     = canvas.toDataURL("image/png");
    downloadBtn.download = "QR_" + nome.replace(/\s+/g, "_") + ".png";

    // Guardar nome da obra para o PDF
    document.getElementById("qrBox").style.display = "block";
    document.getElementById("qrBox").dataset.nomeObra = nome;

    alert(`Obra "${nome}" criada com sucesso!`);
});

// =======================================================
// GERAR PDF
// FIX: listener definido UMA VEZ fora do callback de criar obra.
// Antes estava dentro — acumulava um listener por cada obra criada.
// =======================================================
document.getElementById("btnPDF").addEventListener("click", () => {
    const canvas = document.getElementById("qrCanvas");

    // Verificar se o QR foi gerado (canvas com conteúdo)
    const ctx = canvas.getContext("2d");
    const pixels = ctx.getImageData(0, 0, 1, 1).data;
    const vazio  = pixels[0] === 0 && pixels[1] === 0 && pixels[2] === 0 && pixels[3] === 0;

    if (vazio) {
        alert("Crie primeiro uma obra para gerar o QR.");
        return;
    }

    const nomeObra = document.getElementById("qrBox").dataset.nomeObra || "Obra";
    const imgData  = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();

    pdf.setFontSize(18);
    pdf.text("QR Code — " + nomeObra, 105, 20, { align: "center" });

    pdf.setFontSize(11);
    pdf.setTextColor(100);
    pdf.text("Marcação de Ponto · Maia Solutions", 105, 30, { align: "center" });

    pdf.addImage(imgData, "PNG", 55, 45, 100, 100);

    pdf.save("QR_" + nomeObra.replace(/\s+/g, "_") + ".pdf");
});
