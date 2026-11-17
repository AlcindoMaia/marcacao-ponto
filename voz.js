// =======================================================
// RELATÓRIO DO DIA POR VOZ (estudo DDC, 2026-11-17)
// Ditar para uma caixa de texto com a voz do Chrome (no Android funciona sem
// conta nem custo). O texto ditado junta-se ao que já lá está. Depois, o
// botão "Arrumar" pede ao assistente para separar em Trabalho feito /
// Problemas / Material em falta, com as palavras de quem falou.
// Usado no Registo diário e no diário da obra (Andamento).
// Precisa de: SB, SUPABASE_URL (config.js).
// =======================================================

const vozDisponivel = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// Liga um botão 🎤 a uma textarea. Carregar começa a ouvir; carregar outra vez
// pára. O Chrome pára sozinho depois de uns segundos de silêncio: volta a
// começar enquanto o botão estiver ligado, até 3 minutos.
function ligarDitado(botao, caixa, aoMudar) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec || !botao || !caixa) { if (botao) botao.style.display = "none"; return; }
    let rec = null, ligado = false, base = "", limite = 0;
    const parar = () => {
        ligado = false;
        botao.textContent = "🎤 Ditar";
        botao.classList.remove("a-ouvir");
        try { rec?.stop(); } catch { /* já parado */ }
    };
    const comecar = () => {
        rec = new Rec();
        rec.lang = "pt-PT";
        rec.continuous = true;
        rec.interimResults = true;
        base = caixa.value.trim();
        rec.onresult = e => {
            let fala = "";
            for (const r of e.results) fala += r[0].transcript;
            caixa.value = (base ? base + " " : "") + fala.trim();
            aoMudar?.();
        };
        rec.onerror = e => {
            if (e.error === "not-allowed" || e.error === "service-not-allowed") {
                parar();
                alert("O browser não deixou usar o microfone. Em Chrome: cadeado ao lado do endereço › Microfone › Permitir.");
            }
        };
        rec.onend = () => {
            if (ligado && Date.now() < limite) { try { comecar(); } catch { parar(); } }
            else parar();
        };
        rec.start();
    };
    botao.style.display = "";
    botao.addEventListener("click", () => {
        if (ligado) return parar();
        try {
            ligado = true;
            limite = Date.now() + 3 * 60 * 1000;
            botao.textContent = "⏹ Parar";
            botao.classList.add("a-ouvir");
            comecar();
        } catch { parar(); }
    });
}

// Pede ao assistente para arrumar o texto ditado. Devolve o texto arrumado,
// ou lança um erro (e o texto original fica como estava).
async function arrumarRelatorioDia(texto, obraNome) {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) throw new Error("A sessão expirou. Volta a entrar.");
    const r = await fetch(`${SUPABASE_URL}/functions/v1/assistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ modo: "relatorio_dia", texto, obra: obraNome || null }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
    // Função antiga (ainda não publicada): responde noutro formato
    if (!j.relatorio) throw new Error("o assistente ainda não sabe arrumar relatórios (falta publicar a função). O texto fica como ditaste.");
    const sec = (titulo, l) => Array.isArray(l) && l.length ? `${titulo}:\n${l.map(x => "- " + x).join("\n")}` : "";
    const out = [sec("Trabalho feito", j.relatorio.feito), sec("Problemas", j.relatorio.problemas),
                 sec("Material em falta", j.relatorio.material), sec("Outras notas", j.relatorio.outras)].filter(Boolean).join("\n\n");
    if (!out) throw new Error("o assistente não encontrou nada para arrumar.");
    return out;
}
