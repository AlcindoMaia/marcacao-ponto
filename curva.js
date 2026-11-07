// =======================================================
// CURVA REAL VS PLANEADO (Área do cliente e relatório semanal)
// Recebe os pontos semanais { semana, real, previsto } (0–100) calculados
// na função area-cliente e devolve um gráfico SVG simples, sem bibliotecas.
// Cores por parâmetro: no ecrã escuro e no papel branco.
// =======================================================
function htmlCurva(pontos, cores = {}) {
    if (!Array.isArray(pontos) || pontos.length < 2) return "";
    const c = { real: "#d0a47f", previsto: "#8a9aa8", grelha: "rgba(127,127,127,.25)", texto: "#a79e9c", ...cores };
    // No telemóvel desenha-se mais estreito, para o texto não ficar minúsculo ao encolher.
    const L = c.largura || (typeof innerWidth === "number" && innerWidth < 600 ? 360 : 640), A = L < 500 ? 200 : 220, m = { e: 34, d: 10, t: 10, b: 26 };
    const w = L - m.e - m.d, h = A - m.t - m.b, n = pontos.length;
    const x = i => m.e + (n === 1 ? 0 : i * w / (n - 1));
    const y = v => m.t + h - (Math.max(0, Math.min(100, Number(v) || 0)) / 100) * h;
    const linha = k => {
        const pts = pontos.map((p, i) => p[k] == null ? null : `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).filter(Boolean);
        return pts.length > 1 ? `<polyline fill="none" stroke="${c[k]}" stroke-width="${k === "real" ? 3 : 2}" ${k === "previsto" ? 'stroke-dasharray="6 5"' : ""} stroke-linejoin="round" stroke-linecap="round" points="${pts.join(" ")}"/>` : "";
    };
    const dm = s => s.slice(8, 10) + "/" + s.slice(5, 7);
    const passo = Math.max(1, Math.ceil(n / (L < 500 ? 4 : 6)));
    const ultimoReal = [...pontos].reverse().findIndex(p => p.real != null);
    const iReal = ultimoReal < 0 ? -1 : n - 1 - ultimoReal;
    return `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Avanço real e previsto por semana" style="width:100%;height:auto;display:block">
        ${[0, 25, 50, 75, 100].map(v => `<line x1="${m.e}" x2="${L - m.d}" y1="${y(v)}" y2="${y(v)}" stroke="${c.grelha}" stroke-width="1"/>
            <text x="${m.e - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${c.texto}">${v}%</text>`).join("")}
        ${pontos.map((p, i) => i % passo === 0 || i === n - 1
            ? `<text x="${x(i)}" y="${A - 8}" text-anchor="${i === n - 1 ? "end" : "middle"}" font-size="11" fill="${c.texto}">${dm(p.semana)}</text>` : "").join("")}
        ${linha("previsto")}${linha("real")}
        ${iReal >= 0 ? `<circle cx="${x(iReal)}" cy="${y(pontos[iReal].real)}" r="4.5" fill="${c.real}"/>` : ""}
    </svg>
    <div style="display:flex;gap:16px;font-size:12px;color:${c.texto};margin-top:4px">
        <span><span style="display:inline-block;width:18px;height:3px;background:${c.real};vertical-align:middle;margin-right:5px"></span>Feito</span>
        ${pontos.some(p => p.previsto != null) ? `<span><span style="display:inline-block;width:18px;border-top:2px dashed ${c.previsto};vertical-align:middle;margin-right:5px"></span>Previsto</span>` : ""}
    </div>`;
}
