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
