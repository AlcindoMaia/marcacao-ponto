// =======================================================
// DADOS PÚBLICOS — feriados, morada → GPS, previsão do tempo e NIF
// Tudo passa pela função dados-publicos do Supabase, que fala com a
// Nager.Date, a Nominatim (OpenStreetMap), o IPMA e o VIES.
// Se um serviço falhar, a página continua a funcionar sem esse dado.
// Depende de: config.js (SB, SUPABASE_URL)
// =======================================================

async function dadosPublicos(corpo) {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) throw new Error("Sessão expirada");
    const r = await fetch(`${SUPABASE_URL}/functions/v1/dados-publicos`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
    return j;
}

// ── Feriados ────────────────────────────────────────────────
// FERIADOS["2026-12-25"] = "Natal". Carrega-se uma vez por ano e fica em
// memória; as grelhas consultam-no ao desenhar.
const FERIADOS = {};
const _feriadosAnos = {};

function carregarFeriados(...anos) {
    return Promise.all([...new Set(anos.map(Number))].map(ano => {
        if (!_feriadosAnos[ano]) {
            _feriadosAnos[ano] = dadosPublicos({ acao: "feriados", ano })
                .then(j => j.feriados.forEach(f => { FERIADOS[f.data] = f.nome; }))
                .catch(e => {
                    console.error("feriados:", e);
                    delete _feriadosAnos[ano];   // tenta outra vez da próxima
                });
        }
        return _feriadosAnos[ano];
    }));
}

// "2026-12-25" → "Natal" (ou undefined)
function feriadoEm(dataStr) {
    return FERIADOS[dataStr];
}

// ── Previsão do tempo (IPMA) ────────────────────────────────
// pontos: { chave: [lat, lon] } → { chave: { local, dias: { "AAAA-MM-DD": dia } } }
async function previsaoTempo(pontos) {
    if (!Object.keys(pontos).length) return {};
    const j = await dadosPublicos({ acao: "tempo", pontos });
    const res = {};
    for (const [chave, id] of Object.entries(j.pontos || {})) {
        const p = j.previsoes[id];
        if (!p) continue;
        res[chave] = { local: p.local, dias: Object.fromEntries(p.dias.map(d => [d.data, d])) };
    }
    return res;
}

// Códigos de tempo do IPMA → ícone e descrição curta
function tempoIcone(tipo) {
    if ([19, 20, 23].includes(tipo))            return ["⛈️", "Trovoada"];
    if ([18, 21, 22, 28, 29, 30].includes(tipo)) return ["🌨️", "Neve ou granizo"];
    if ([6, 7, 8, 9, 10, 11, 12, 13, 14, 15].includes(tipo)) return ["🌧️", "Chuva"];
    if ([16, 17, 26].includes(tipo))             return ["🌫️", "Nevoeiro"];
    if (tipo === 1)                              return ["☀️", "Céu limpo"];
    if ([2, 3, 25].includes(tipo))               return ["⛅", "Pouco nublado"];
    return ["☁️", "Nublado"];
}

// ── Morada → GPS (Nominatim) ────────────────────────────────
async function procurarMorada(texto) {
    const j = await dadosPublicos({ acao: "morada", texto });
    return j.resultados || [];
}

// ── NIF (dígito de controlo + VIES) ─────────────────────────
// Mostra o resultado em elInfo. Se o VIES devolver o nome e a morada,
// preenche os campos indicados quando estão vazios.
async function verificarNif(nif, elInfo, campos = {}) {
    nif = String(nif || "").trim();
    if (!elInfo) return;
    if (!nif) { elInfo.textContent = ""; return; }
    elInfo.style.color = "";
    elInfo.textContent = "A verificar o NIF…";
    try {
        const r = await dadosPublicos({ acao: "nif", nif });
        if (!r.valido) {
            elInfo.style.color = "#f87171";
            elInfo.textContent = "⚠ Este NIF não é válido. Confirme se não há um dígito trocado.";
            return;
        }
        const v = r.vies || {};
        if (v.registado) {
            elInfo.style.color = "#4ade80";
            elInfo.textContent = `✓ NIF válido${v.nome ? ` · ${v.nome}` : ""} (VIES)`;
            const preencher = (id, valor) => {
                const el = id && document.getElementById(id);
                if (el && valor && !el.value.trim()) el.value = valor;
            };
            preencher(campos.nome, v.nome);
            preencher(campos.morada, v.morada);
        } else if (v.erro) {
            elInfo.textContent = "✓ NIF válido. O VIES não respondeu, por isso não foi possível confirmar o nome.";
        } else {
            elInfo.textContent = "✓ NIF válido. Não está no VIES, o que é normal em particulares e em empresas sem IVA intracomunitário.";
        }
    } catch (e) {
        console.error("nif:", e);
        elInfo.textContent = "";
    }
}
