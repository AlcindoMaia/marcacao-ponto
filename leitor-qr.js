// =======================================================
// LEITOR DE QR — usado pelo admin.html (QR de faturas) e
// pelo carga.html (QR de artigos).
//
// Ordem de preferência:
//   1. BarcodeDetector nativo — Android Chrome. Rápido, sem descarregar nada.
//   2. Ponyfill ZXing em WebAssembly — iPhone, onde a Apple ainda não
//      implementou a API. Carregado só quando é preciso.
//   3. jsQR — rede de segurança enquanto a troca não estiver testada
//      nos telemóveis da equipa. O jsQR está sem manutenção desde 2021.
// =======================================================

let _qrDetector = null;      // instância reutilizada (criar por frame é lento)
let _qrPonyfill = null;      // promessa do carregamento do ponyfill
let _qrModo     = null;      // "nativo" | "wasm" | "jsqr" — para diagnóstico

// Versão fixada de propósito: na versão 3 o ficheiro passou a chamar-se
// ponyfill.js (antes era side-effects.min.js) e um URL sem versão parte
// quando o pacote se reorganiza.
const QR_PONYFILL_URL =
    "https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/dist/es/ponyfill.js";

function qrModo() { return _qrModo; }

// Carrega o ponyfill uma única vez e devolve a classe que ele exporta.
// Usa-se a versão "ponyfill" e não a "polyfill" para não mexer em globais.
function carregarPonyfill() {
    if (!_qrPonyfill) {
        _qrPonyfill = import(QR_PONYFILL_URL)
            .then(mod => mod.BarcodeDetector)
            .catch(e => {
                console.warn("Não foi possível carregar o leitor WebAssembly:", e);
                return null;
            });
    }
    return _qrPonyfill;
}

async function obterDetector() {
    if (_qrDetector) return _qrDetector;

    // 1. Nativo
    if (typeof BarcodeDetector !== "undefined") {
        try {
            const suportados = await BarcodeDetector.getSupportedFormats();
            if (suportados.includes("qr_code")) {
                _qrDetector = new BarcodeDetector({ formats: ["qr_code"] });
                _qrModo = "nativo";
                return _qrDetector;
            }
        } catch (e) { /* segue para o ponyfill */ }
    }

    // 2. WebAssembly (iPhone, e qualquer browser sem a API nativa)
    const Classe = await carregarPonyfill();
    if (Classe) {
        try {
            _qrDetector = new Classe({ formats: ["qr_code"] });
            _qrModo = "wasm";
            return _qrDetector;
        } catch (e) { /* segue para o jsQR */ }
    }

    return null;
}

// Lê um QR de um canvas já desenhado.
// Devolve o texto do QR, ou null se não houver nenhum.
// imgData é opcional: só é usado pelo jsQR, para não repetir getImageData.
async function lerQR(canvas, imgData = null) {
    const detector = await obterDetector();

    if (detector) {
        try {
            const codigos = await detector.detect(canvas);
            if (codigos && codigos.length) return codigos[0].rawValue;
            return null;
        } catch (e) {
            // Um frame que falha não deve matar a leitura: cai para o jsQR
            console.warn("Falha na deteção, a usar o leitor antigo:", e);
        }
    }

    // 3. jsQR
    if (typeof jsQR === "function") {
        _qrModo = "jsqr";
        const d = imgData || canvas.getContext("2d", { willReadFrequently: true })
                                  .getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(d.data, canvas.width, canvas.height, {
            inversionAttempts: "attemptBoth"
        });
        return code ? code.data : null;
    }

    return null;
}

// Pré-carrega o leitor ao abrir a câmara, para o primeiro frame não esperar
// pelo download do WebAssembly no iPhone.
function prepararLeitorQR() { obterDetector(); }
