// =======================================================
// FOTOS — preparar antes de carregar
// As fotos do telemóvel chegam com 4–7 MB e, nos iPhone/Samsung recentes,
// em HEIC, que o Chrome e o Android não mostram. Antes de gravar, cada foto
// passa a JPEG com no máximo 2000 px no lado maior (≈ 0,5 MB): abre em
// qualquer telemóvel e a Área do cliente carrega depressa.
// =======================================================
const FOTO_LADO_MAX  = 2000;
const FOTO_QUALIDADE = 0.85;
const LIBHEIF_URL = "https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif-wasm/libheif-bundle.js";
const LIBHEIF_SRI = "sha384-HXIRij9wEcFbMeYe8lcO83/544aNPhd8574RnlD/cQVbNPdq5iBkjgGPpxtsycNv";

// Nome de ficheiro sem acentos nem espaços, para o caminho no armazenamento.
function nomeSeguroFicheiro(nome) {
    return (nome || "ficheiro")
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-80);
}

const ehHeic = f => /image\/hei[cf]/i.test(f.type || "") || /\.hei[cf]$/i.test(f.name || "");
const ehImagem = f => /^image\//i.test(f.type || "") || /\.(jpe?g|png|webp|hei[cf])$/i.test(f.name || "");

// O descodificador de HEIC tem 1,5 MB: só se carrega quando aparece um HEIC.
let _libheif = null;
function carregarLibheif() {
    if (!_libheif) _libheif = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = LIBHEIF_URL;
        s.integrity = LIBHEIF_SRI;
        s.crossOrigin = "anonymous";
        s.referrerPolicy = "no-referrer";
        s.onload = () => Promise.resolve(window.libheif()).then(resolve, reject);
        s.onerror = () => { _libheif = null; reject(new Error("Não foi possível carregar o leitor de HEIC.")); };
        document.head.appendChild(s);
    });
    return _libheif;
}

// Desenha a imagem num canvas já reduzido ao tamanho final.
function canvasReduzido(largura, altura) {
    const escala = Math.min(1, FOTO_LADO_MAX / Math.max(largura, altura));
    const c = document.createElement("canvas");
    c.width  = Math.round(largura * escala);
    c.height = Math.round(altura * escala);
    return c;
}

async function heicParaCanvas(ficheiro) {
    const lib = await carregarLibheif();
    const imagens = new lib.HeifDecoder().decode(new Uint8Array(await ficheiro.arrayBuffer()));
    if (!imagens?.length) throw new Error("O ficheiro HEIC não tem imagem.");
    const img = imagens[0];
    const w = img.get_width(), h = img.get_height();
    const total = document.createElement("canvas");
    total.width = w; total.height = h;
    const ctx = total.getContext("2d");
    const dados = ctx.createImageData(w, h);
    await new Promise((resolve, reject) =>
        img.display(dados, d => d ? resolve() : reject(new Error("Não foi possível ler o HEIC."))));
    ctx.putImageData(dados, 0, 0);
    imagens.forEach(i => i.free?.());
    const c = canvasReduzido(w, h);
    c.getContext("2d").drawImage(total, 0, 0, c.width, c.height);
    return c;
}

async function imagemParaCanvas(ficheiro) {
    const bmp = await createImageBitmap(ficheiro, { imageOrientation: "from-image" });
    const c = canvasReduzido(bmp.width, bmp.height);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c;
}

// Devolve um File JPEG pronto a carregar. Se não for imagem, devolve o
// próprio ficheiro. Um JPEG já pequeno também fica como está.
async function prepararFoto(ficheiro) {
    if (!ehImagem(ficheiro)) return ficheiro;
    const heic = ehHeic(ficheiro);
    if (!heic && /jpe?g$/i.test(ficheiro.type) && ficheiro.size < 800 * 1024) return ficheiro;
    const canvas = heic ? await heicParaCanvas(ficheiro) : await imagemParaCanvas(ficheiro);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", FOTO_QUALIDADE));
    if (!blob) throw new Error("Não foi possível converter a foto.");
    const nome = (ficheiro.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg", lastModified: ficheiro.lastModified });
}

// =======================================================
// VÍDEOS — comprimir antes de carregar
// Um vídeo do telemóvel tem 50–150 MB por minuto. Antes de gravar, passa a
// 720p a cerca de 1,5 Mbit/s (≈ 11 MB por minuto): o vídeo toca no próprio
// telemóvel e é regravado ao mesmo tempo, por isso demora o que o vídeo
// dura. Não é preciso descarregar nenhum programa.
// =======================================================
const VIDEO_LADO_MAX  = 1280;        // 720p
const VIDEO_SEG_MAX   = 60;
const VIDEO_BITS_SEG  = 1_500_000;
const VIDEO_AUDIO_BITS = 96_000;

const ehVideo = f => /^video\//i.test(f.type || "") || /\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name || "");

// O primeiro formato que este telemóvel consegue gravar. MP4 primeiro:
// abre em qualquer telemóvel; WebM só se não houver alternativa.
function formatoGravacaoVideo() {
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) return null;
    return ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4",
            "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find(t => MediaRecorder.isTypeSupported(t)) || null;
}

// O som cria-se dentro do clique (o iPhone só deixa ligar o som aí).
// Quem chama prepararVideo deve criar isto logo no início do clique.
function criarSomParaVideo() {
    const C = window.AudioContext || window.webkitAudioContext;
    try { return C ? new C() : null; } catch { return null; }
}

function abrirVideo(url) {
    return new Promise((resolve, reject) => {
        const v = document.createElement("video");
        v.muted = true;              // o som vai à parte (ver abaixo)
        v.playsInline = true;
        v.preload = "auto";
        v.onloadedmetadata = () => resolve(v);
        v.onerror = () => reject(new Error("este telemóvel não consegue abrir o vídeo"));
        v.src = url;
    });
}

// Devolve um File comprimido. Se não for vídeo, devolve o próprio ficheiro.
// Se o telemóvel não souber comprimir, ou o resultado não ficar mais
// pequeno, devolve o original. Lança erro se o vídeo for longo de mais.
// aoAvancar(0..1) mostra o progresso; som = criarSomParaVideo().
async function prepararVideo(ficheiro, aoAvancar, som) {
    if (!ehVideo(ficheiro)) return ficheiro;
    const formato = formatoGravacaoVideo();
    if (!formato) return ficheiro;

    const url = URL.createObjectURL(ficheiro);
    let v = null, rec = null, fonte = null, desenhar = true, vigia = null;
    try {
        v = await abrirVideo(url);
        const dur = v.duration;
        if (Number.isFinite(dur) && dur > VIDEO_SEG_MAX + 0.5)
            throw Object.assign(new Error(`o vídeo tem ${Math.round(dur)} s; o máximo são ${VIDEO_SEG_MAX} s. Corta-o no telemóvel e volta a carregar.`), { longo: true });
        if (!v.videoWidth || !v.videoHeight) throw new Error("este telemóvel não consegue ler a imagem do vídeo");

        const escala = Math.min(1, VIDEO_LADO_MAX / Math.max(v.videoWidth, v.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(v.videoWidth  * escala / 2) * 2;   // números pares: os codificadores pedem
        canvas.height = Math.round(v.videoHeight * escala / 2) * 2;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

        const faixas = [...canvas.captureStream(30).getVideoTracks()];

        // Som: lê-se a faixa de áudio do ficheiro e toca-se só para a
        // gravação (não sai pelo altifalante). Sem som, o vídeo fica mudo.
        if (som) {
            try {
                if (som.state === "suspended") await som.resume();
                const audio = await som.decodeAudioData(await ficheiro.arrayBuffer());
                const destino = som.createMediaStreamDestination();
                fonte = som.createBufferSource();
                fonte.buffer = audio;
                fonte.connect(destino);
                faixas.push(...destino.stream.getAudioTracks());
            } catch (e) {
                console.warn("prepararVideo: sem som", e);
                fonte = null;
            }
        }

        const partes = [];
        rec = new MediaRecorder(new MediaStream(faixas), {
            mimeType: formato, videoBitsPerSecond: VIDEO_BITS_SEG, audioBitsPerSecond: VIDEO_AUDIO_BITS,
        });
        rec.ondataavailable = e => { if (e.data?.size) partes.push(e.data); };
        const parado = new Promise(r => { rec.onstop = r; });

        const proximo = cb => v.requestVideoFrameCallback ? v.requestVideoFrameCallback(cb) : requestAnimationFrame(cb);
        const passo = () => {
            if (!desenhar) return;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            if (aoAvancar && Number.isFinite(dur) && dur > 0) aoAvancar(Math.min(1, v.currentTime / dur));
            proximo(passo);
        };

        // Se o vídeo encravar (ecrã bloqueado, separador escondido), desiste.
        let ultimoTempo = -1, encravado = 0;
        vigia = setInterval(() => {
            if (v.currentTime === ultimoTempo) encravado++; else encravado = 0;
            ultimoTempo = v.currentTime;
            if (encravado >= 10) v.dispatchEvent(new Event("error"));
        }, 1000);

        const acabou = new Promise((resolve, reject) => {
            v.onended = resolve;
            v.onerror = () => reject(new Error("a compressão parou. Mantém o ecrã ligado e esta página aberta enquanto o vídeo é preparado."));
        });
        acabou.catch(() => {});   // se o play() falhar, ninguém espera por isto

        rec.start(1000);
        await v.play();
        fonte?.start();
        proximo(passo);
        await acabou;
        clearInterval(vigia);
        desenhar = false;

        rec.stop();
        await parado;
        faixas.forEach(t => t.stop());
        aoAvancar?.(1);

        const tipo = formato.split(";")[0];
        const blob = new Blob(partes, { type: tipo });
        if (!blob.size || blob.size >= ficheiro.size) return ficheiro;
        const nome = (ficheiro.name || "video").replace(/\.[^.]+$/, "") + (tipo === "video/mp4" ? ".mp4" : ".webm");
        return new File([blob], nome, { type: tipo, lastModified: ficheiro.lastModified });
    } finally {
        desenhar = false;
        clearInterval(vigia);
        try { fonte?.stop(); } catch { /* já tinha parado */ }
        if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* nada */ } }
        if (v) { v.onerror = v.onended = null; v.pause(); v.removeAttribute("src"); v.load(); }
        URL.revokeObjectURL(url);
    }
}
