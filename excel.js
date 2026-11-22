// ═══════════════════════════════════════════════════════
// EXCEL — ficheiros .xlsx a sério (com colunas, números e datas)
// ═══════════════════════════════════════════════════════
// Os botões "📥 Excel" geravam CSV separado por vírgulas, que o Excel em
// português abre com tudo na coluna A. Aqui gera-se um .xlsx verdadeiro com
// o ExcelJS, que só se descarrega (≈ 900 KB) quando alguém carrega no botão.
//
// baixarExcel("nome.xlsx", [folha, ...]) — cada folha:
//   { nome, titulo, subtitulo, colunas: [{ t, w, f, alinhar }], linhas: [[...]],
//     total: [...], notas: ["..."], congelarColunas: n, filtro: true }
//   f (formato da coluna): "texto" | "data" | "num" | "num1" | "dias" | "euro" | "int"
//   Uma célula pode ser um valor simples ou { v, fundo, cor, negrito, nota }.

const EXCELJS_FONTES = [
    "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
    "https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js",
];
const EXCELJS_SRI = "sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz";
let _exceljsPromessa = null;

function carregarExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (_exceljsPromessa) return _exceljsPromessa;
    const tentar = i => new Promise((ok, falha) => {
        const s = document.createElement("script");
        s.src = EXCELJS_FONTES[i];
        s.integrity = EXCELJS_SRI;
        s.crossOrigin = "anonymous";
        s.referrerPolicy = "no-referrer";
        s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : falha(new Error("ExcelJS em falta"));
        s.onerror = () => { s.remove(); falha(new Error("sem rede")); };
        document.head.appendChild(s);
    }).catch(e => i + 1 < EXCELJS_FONTES.length ? tentar(i + 1) : Promise.reject(e));
    _exceljsPromessa = tentar(0).catch(e => { _exceljsPromessa = null; throw e; });
    return _exceljsPromessa;
}

// Cores da app (azul-noite + caramelo) e das marcas do mapa
const XL_COR = {
    cabecalho: "FF1C2B3A", cabecalhoTxt: "FFFFFFFF",
    titulo: "FF1C2B3A", subtitulo: "FF6B7280",
    total: "FFF3EAE2", totalBorda: "FFB58863",
    presente: "FFDCEFE3", meio: "FFEAF5EE", falta: "FFF8DDD8",
    fds: "FFEDEDED", feriado: "FFF3E3E0",
    verde: "FF2F6B4A", vermelho: "FFA5483D", cinza: "FF9CA3AF",
};

const XL_FORMATO = {
    data: "dd/mm/yyyy",
    num: "0.00",
    num1: "0.0",
    dias: "0.##",
    int: "0",
    euro: '#,##0.00 "€"',
};

// "2026-11-02" → data do Excel (sem desvio de fuso horário)
function xlData(iso) {
    if (!iso) return null;
    const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return a && m && d ? new Date(Date.UTC(a, m - 1, d)) : null;
}

// Nome de folha válido no Excel: máx. 31 caracteres, sem : \ / ? * [ ]
function xlNomeFolha(n, usados) {
    let base = String(n || "Folha").replace(/[:\\/?*\[\]]/g, " ").trim().slice(0, 31) || "Folha";
    let nome = base, i = 2;
    while (usados.has(nome.toLowerCase())) nome = base.slice(0, 28) + " " + i++;
    usados.add(nome.toLowerCase());
    return nome;
}

function xlPreencher(cel, cor) {
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
}

async function baixarExcel(nomeFicheiro, folhas) {
    let ExcelJS;
    try { ExcelJS = await carregarExcelJS(); }
    catch (e) {
        console.error(e);
        alert("Não foi possível preparar o Excel (sem ligação à internet?). Tenta outra vez.");
        return false;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = "Maia Solutions";
    wb.created = new Date();
    const usados = new Set();

    folhas.forEach(fo => {
        const nCol = fo.colunas.length;
        const ws = wb.addWorksheet(xlNomeFolha(fo.nome, usados), {
            pageSetup: { orientation: nCol > 10 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
        });
        ws.columns = fo.colunas.map(c => ({ width: c.w || 14 }));

        let r = 1;
        if (fo.titulo) {
            const c = ws.getCell(r, 1);
            c.value = fo.titulo;
            c.font = { bold: true, size: 14, color: { argb: XL_COR.titulo } };
            ws.getRow(r).height = 22;
            r++;
        }
        if (fo.subtitulo) {
            const c = ws.getCell(r, 1);
            c.value = fo.subtitulo;
            c.font = { italic: true, size: 10, color: { argb: XL_COR.subtitulo } };
            r++;
        }
        if (fo.titulo || fo.subtitulo) r++;   // linha em branco antes da tabela

        // Cabeçalho (uma ou duas linhas: a de cima opcional, ex. dia da semana)
        const linhasCab = fo.cabecalhoExtra ? [fo.cabecalhoExtra, fo.colunas.map(c => c.t)] : [fo.colunas.map(c => c.t)];
        linhasCab.forEach(vals => {
            const row = ws.getRow(r);
            vals.forEach((v, i) => {
                const cel = row.getCell(i + 1);
                const o = v && typeof v === "object" ? v : { v };
                cel.value = o.v ?? "";
                cel.font = { bold: true, color: { argb: o.cor || XL_COR.cabecalhoTxt }, size: 10 };
                xlPreencher(cel, o.fundo || XL_COR.cabecalho);
                cel.alignment = { vertical: "middle", horizontal: fo.colunas[i].alinhar || (["texto", "data"].includes(fo.colunas[i].f || "texto") ? "left" : "right"), wrapText: true };
            });
            row.height = 20;
            r++;
        });
        const linhaDados1 = r;

        const escrever = (vals, estiloLinha) => {
            const row = ws.getRow(r);
            vals.forEach((v, i) => {
                const col = fo.colunas[i] || {};
                const cel = row.getCell(i + 1);
                const o = v && typeof v === "object" && !(v instanceof Date) ? v : { v };
                let val = o.v;
                if (col.f === "data" && typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) val = xlData(val);
                if (val === undefined || val === "") val = null;
                cel.value = val;
                if (XL_FORMATO[col.f]) cel.numFmt = XL_FORMATO[col.f];
                cel.alignment = { vertical: "middle", horizontal: col.alinhar || (typeof val === "number" || val instanceof Date ? "right" : "left"), wrapText: !!col.quebrar };
                const fonte = { size: 10 };
                if (o.negrito || estiloLinha?.negrito) fonte.bold = true;
                if (o.cor) fonte.color = { argb: o.cor };
                cel.font = fonte;
                if (o.fundo) xlPreencher(cel, o.fundo);
                else if (estiloLinha?.fundo) xlPreencher(cel, estiloLinha.fundo);
                if (o.nota) cel.note = String(o.nota);
                cel.border = estiloLinha?.borda
                    ? { top: { style: "medium", color: { argb: XL_COR.totalBorda } } }
                    : { bottom: { style: "hair", color: { argb: "FFD1D5DB" } } };
            });
            r++;
        };
        fo.linhas.forEach(l => escrever(l));
        const linhaDadosFim = r - 1;
        if (fo.total) escrever(fo.total, { negrito: true, fundo: XL_COR.total, borda: true });

        if (fo.notas?.length) {
            r++;
            fo.notas.forEach(n => {
                const c = ws.getCell(r, 1);
                c.value = n;
                c.font = { size: 9, italic: true, color: { argb: XL_COR.subtitulo } };
                r++;
            });
        }

        // Cabeçalho e primeiras colunas ficam fixos ao deslizar (também no telemóvel)
        ws.views = [{ state: "frozen", xSplit: fo.congelarColunas || 0, ySplit: linhaDados1 - 1, showGridLines: fo.grelha !== false }];
        if (fo.filtro && fo.linhas.length)
            ws.autoFilter = { from: { row: linhaDados1 - 1, column: 1 }, to: { row: linhaDadosFim, column: nCol } };
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFicheiro;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
}

// Nome do mês em português: "novembro de 2026"
function xlNomeMes(ano, mes) {
    return new Date(Number(ano), Number(mes) - 1, 15).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}
const XL_DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
