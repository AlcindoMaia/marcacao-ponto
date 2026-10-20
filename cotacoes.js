// =======================================================
// COMPARAR FORNECEDORES — orçamentos pedidos a vários fornecedores
// Para qualquer pedido de orçamento a vários fornecedores (material ou serviço).
// Cada comparação abre com 5 vistas:
// Resumo · Preços unitários · Como está cotado · Cesto normalizado · Faltas e riscos
// Depende de: config.js (SB global), tabelas de cotacoes.sql
// =======================================================

let _cotLista     = [];
let _cotObras     = [];
let _cotFornecs   = [];
let _cotAtual     = null;   // { comp, propostas, artigos, cotacoes, riscos }
let _cotVista     = "resumo";
let _cotEd        = null;   // cópia de trabalho no editor
let _cotEdOrig    = null;   // ids carregados, para saber o que apagar
let _cotIniciado  = false;

const COT_VISTAS = [
    ["resumo",   "Resumo"],
    ["precos",   "Preços unitários"],
    ["cotado",   "Como está cotado"],
    ["cesto",    "Cesto normalizado"],
    ["riscos",   "Faltas e riscos"],
];

const COT_ESTADOS = { aberta: "Aberta", decidida: "Decidida", arquivada: "Arquivada" };

// Linhas do resumo que aceitam nota (chave → rótulo)
const COT_LINHAS_RESUMO = [
    ["data",        "Data do orçamento"],
    ["documento",   "Nº do documento"],
    ["validade",    "Validade"],
    ["sistema",     "Sistema / marca"],
    ["total",       "TOTAL s/IVA (como está cotado)"],
    ["total_iva",   "TOTAL c/IVA"],
    ["base",        "€/base s/IVA (como está cotado)"],
    ["cesto",       "TOTAL s/IVA — mesma especificação"],
    ["cesto_base",  "€/base s/IVA — mesma especificação"],
];

// ── Formatação ──
function cotEsc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function cotNum(v, dec = 2) {
    if (v == null || v === "" || isNaN(v)) return "";
    return Number(v).toLocaleString("pt-PT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function cotEur(v, dec = 2) {
    const s = cotNum(v, dec);
    return s ? s + " €" : "";
}
function cotQtd(v) {
    if (v == null || v === "") return "";
    return Number(v).toLocaleString("pt-PT", { maximumFractionDigits: 3 });
}
function cotData(d) {
    if (!d) return "";
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${y}`;
}
function cotNumInput(v) {
    // aceita "1.234,56" e "1234.56"
    if (v == null) return null;
    let s = String(v).trim().replace(/\s|€/g, "");
    if (!s) return null;
    if (s.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return isNaN(n) ? null : n;
}
function cotUid() {
    return crypto.randomUUID();
}

// =======================================================
// CÁLCULOS
// =======================================================
function cotCotacao(d, artigoId, propostaId) {
    return d.cotacoes.find(c => c.artigo_id === artigoId && c.proposta_id === propostaId) || null;
}

// Preço unitário líquido s/IVA, ou null se não cotou / sem preço
function cotPreco(d, a, p) {
    const c = cotCotacao(d, a.id, p.id);
    if (!c || c.nao_cotou || c.preco_unitario == null) return null;
    return Number(c.preco_unitario);
}

function cotMelhorPreco(d, a) {
    const ps = d.propostas.map(p => cotPreco(d, a, p)).filter(v => v != null);
    return ps.length ? Math.min(...ps) : null;
}

// Valor de um artigo no cesto normalizado para um fornecedor.
// Sem preço → usa o melhor preço dos outros e marca como preenchido.
function cotValorCesto(d, a, p) {
    if (!a.no_cesto || a.qtd_correta == null) return { valor: null, preenchido: false };
    let preco = cotPreco(d, a, p), preenchido = false;
    if (preco == null) { preco = cotMelhorPreco(d, a); preenchido = preco != null; }
    if (preco == null) return { valor: null, preenchido: false };
    return { valor: Math.round(Number(a.qtd_correta) * preco * 100) / 100, preenchido };
}

function cotTotalCesto(d, p) {
    return d.artigos.reduce((s, a) => s + (cotValorCesto(d, a, p).valor || 0), 0);
}

function cotCompraRepartida(d) {
    return d.artigos.reduce((s, a) => {
        if (!a.no_cesto || a.qtd_correta == null) return s;
        const m = cotMelhorPreco(d, a);
        return s + (m == null ? 0 : Math.round(Number(a.qtd_correta) * m * 100) / 100);
    }, 0);
}

// Índices dos valores mínimos (ignora vazios)
function cotMinIdx(vals) {
    const v = vals.filter(x => x != null && !isNaN(x));
    if (!v.length) return [];
    const m = Math.min(...v);
    return vals.map((x, i) => (x != null && Math.abs(x - m) < 0.00005 ? i : -1)).filter(i => i >= 0);
}

// =======================================================
// INIT / LISTA
// =======================================================
async function initCotacoes() {
    if (!_cotIniciado) {
        _cotIniciado = true;
        document.getElementById("btnNovaComparacao").onclick = () => cotAbrirEditor(null);
        document.getElementById("cotVoltar").onclick = cotMostrarLista;
        document.getElementById("cotEditar").onclick = () => cotAbrirEditor(_cotAtual);
        document.getElementById("cotImprimir").onclick = () => {
            // Imprime as cinco vistas seguidas, como as folhas do Excel
            const el = document.getElementById("cotConteudo");
            const fs = { resumo: cotVistaResumo, precos: cotVistaPrecos, cotado: cotVistaCotado, cesto: cotVistaCesto, riscos: cotVistaRiscos };
            if (_cotAtual && _cotAtual.propostas.length)
                el.innerHTML = COT_VISTAS.map(([k, n]) => `<h3 class="cot-ed-h cot-quebra">${n}</h3>${fs[k](_cotAtual)}`).join("");
            document.body.classList.add("cot-imprimir");
            window.print();
            document.body.classList.remove("cot-imprimir");
            cotMudarVista(_cotVista);
        };
        document.getElementById("pesquisaCotacoes").oninput = cotRenderLista;
        document.getElementById("cotEdFechar").onclick = cotFecharEditor;
        document.getElementById("cotEdCancelar").onclick = cotFecharEditor;
        document.getElementById("cotEdGuardar").onclick = cotGuardar;
        document.getElementById("cotEdEliminar").onclick = cotEliminar;
        document.getElementById("cotCarregar").onclick = () => document.getElementById("cotFicheiros").click();
        document.getElementById("cotFicheiros").onchange = (ev) => {
            const fs = Array.from(ev.target.files || []);
            ev.target.value = "";
            cotLerFicheiros(fs);
        };
        document.getElementById("cotVistas").innerHTML = COT_VISTAS.map(([k, n]) =>
            `<button class="cot-vista" data-vista="${k}">${n}</button>`).join("");
        document.querySelectorAll(".cot-vista").forEach(b => b.onclick = () => cotMudarVista(b.dataset.vista));
    }
    const [o, f] = await Promise.all([
        SB.from("obras").select("id,codigo,nome,estado").order("codigo"),
        SB.from("fornecedores").select("id,nome").order("nome"),
    ]);
    _cotObras   = o.data || [];
    _cotFornecs = (f.data || []).filter(x => x.nome);
    if (_cotAtual) await cotAbrir(_cotAtual.comp.id);
    else await cotCarregarLista();
}

async function cotCarregarLista() {
    const { data, error } = await SB.from("comparacoes")
        .select("*, obras(codigo,nome), comparacao_propostas(id,fornecedor,total_sem_iva)")
        .order("criado_em", { ascending: false });
    const tb = document.querySelector("#tabelaCotacoes tbody");
    if (error) {
        tb.innerHTML = `<tr><td colspan="6" style="color:var(--color-err)">Erro ao carregar: ${cotEsc(error.message)}</td></tr>`;
        return;
    }
    _cotLista = data || [];
    cotRenderLista();
}

function cotRenderLista() {
    const q = (document.getElementById("pesquisaCotacoes").value || "").toLowerCase();
    const tb = document.querySelector("#tabelaCotacoes tbody");
    const rows = _cotLista.filter(c => {
        const txt = [c.titulo, c.obras?.codigo, c.obras?.nome, ...(c.comparacao_propostas || []).map(p => p.fornecedor)].join(" ").toLowerCase();
        return !q || txt.includes(q);
    });
    if (!rows.length) {
        tb.innerHTML = `<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:24px">Ainda não há comparações. Carrega em + para criar.</td></tr>`;
        return;
    }
    tb.innerHTML = rows.map(c => {
        const ps = c.comparacao_propostas || [];
        const obra = c.obras ? `${c.obras.codigo || ""} ${c.obras.nome || ""}`.trim() : "—";
        return `<tr class="cot-linha" data-id="${c.id}" style="cursor:pointer">
            <td><strong>${cotEsc(c.titulo)}</strong></td>
            <td>${cotEsc(obra)}</td>
            <td>${ps.map(p => cotEsc(p.fornecedor)).join(", ") || "—"}</td>
            <td>${c.quantidade_base ? cotQtd(c.quantidade_base) + " " + cotEsc(c.unidade_base) : "—"}</td>
            <td><span class="cot-estado ${c.estado}">${COT_ESTADOS[c.estado] || c.estado}</span></td>
            <td>${cotData((c.criado_em || "").slice(0, 10))}</td>
        </tr>`;
    }).join("");
    tb.querySelectorAll(".cot-linha").forEach(tr => tr.onclick = () => cotAbrir(tr.dataset.id));
}

function cotMostrarLista() {
    _cotAtual = null;
    document.getElementById("cotDetalhe").style.display = "none";
    document.getElementById("cotListaWrap").style.display = "";
    cotCarregarLista();
}

// =======================================================
// DETALHE
// =======================================================
async function cotCarregar(id) {
    const [c, p, a, r] = await Promise.all([
        SB.from("comparacoes").select("*, obras(codigo,nome)").eq("id", id).single(),
        SB.from("comparacao_propostas").select("*").eq("comparacao_id", id).order("ordem"),
        SB.from("comparacao_artigos").select("*").eq("comparacao_id", id).order("ordem"),
        SB.from("comparacao_riscos").select("*").eq("comparacao_id", id).order("ordem"),
    ]);
    const erro = [c, p, a, r].find(x => x.error);
    if (erro) throw erro.error;
    const artigoIds = (a.data || []).map(x => x.id);
    let cotacoes = [];
    if (artigoIds.length) {
        const q = await SB.from("comparacao_cotacoes").select("*").in("artigo_id", artigoIds);
        if (q.error) throw q.error;
        cotacoes = q.data || [];
    }
    return { comp: c.data, propostas: p.data || [], artigos: a.data || [], cotacoes, riscos: r.data || [] };
}

async function cotAbrir(id) {
    try {
        _cotAtual = await cotCarregar(id);
    } catch (e) {
        alert("Não foi possível abrir a comparação: " + e.message);
        return;
    }
    document.getElementById("cotListaWrap").style.display = "none";
    document.getElementById("cotDetalhe").style.display = "";
    const c = _cotAtual.comp;
    document.getElementById("cotTitulo").textContent = c.titulo;
    const obra = c.obras ? `Obra ${c.obras.codigo || ""} · ${c.obras.nome || ""}` : "Sem obra associada";
    const base = c.quantidade_base ? ` · ${cotQtd(c.quantidade_base)} ${c.unidade_base}` : "";
    document.getElementById("cotSubtitulo").innerHTML =
        `${cotEsc(obra)}${cotEsc(base)} · <span class="cot-estado ${c.estado}">${COT_ESTADOS[c.estado] || c.estado}</span>`;
    cotMudarVista(_cotVista);
}

function cotMudarVista(v) {
    _cotVista = v;
    document.querySelectorAll(".cot-vista").forEach(b => b.classList.toggle("active", b.dataset.vista === v));
    const el = document.getElementById("cotConteudo");
    const d = _cotAtual;
    if (!d) return;
    if (!d.propostas.length) {
        el.innerHTML = `<p style="color:var(--text-muted);padding:20px">Ainda não há fornecedores. Carrega em «📄 Carregar orçamentos» para ler os PDFs, ou em Editar para os meter à mão.</p>`;
        return;
    }
    const f = { resumo: cotVistaResumo, precos: cotVistaPrecos, cotado: cotVistaCotado, cesto: cotVistaCesto, riscos: cotVistaRiscos }[v];
    el.innerHTML = f(d);
}

function cotCabecalho(d, antes, depois) {
    return `<thead><tr>${antes.map(h => `<th>${h}</th>`).join("")}${d.propostas.map(p => `<th class="num">${cotEsc(p.fornecedor)}</th>`).join("")}${depois.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
}

function cotLegendaBase(c) {
    return c.unidade_base ? `€/${cotEsc(c.unidade_base)}` : "€/base";
}

// ── 1. Resumo ──
function cotVistaResumo(d) {
    const c = d.comp, notas = c.notas_resumo || {}, base = Number(c.quantidade_base) || null;
    const ps = d.propostas;
    const cesto = ps.map(p => cotTotalCesto(d, p));
    const linhas = [
        ["data",       ps.map(p => cotData(p.data_documento)), null],
        ["documento",  ps.map(p => cotEsc(p.documento)), null],
        ["validade",   ps.map(p => cotEsc(p.validade)), null],
        ["sistema",    ps.map(p => cotEsc(p.sistema)), null],
        ["total",      null, ps.map(p => p.total_sem_iva == null ? null : Number(p.total_sem_iva)), true],
        ["total_iva",  null, ps.map(p => p.total_com_iva == null ? null : Number(p.total_com_iva)), true],
        ["base",       null, ps.map(p => base && p.total_sem_iva != null ? p.total_sem_iva / base : null), true],
        ["cesto",      null, cesto, true],
        ["cesto_base", null, cesto.map(v => base ? v / base : null), true],
    ];
    // Nota automática no cesto: quem tem artigos preenchidos com o melhor preço
    const preench = ps.map(p => d.artigos.filter(a => cotValorCesto(d, a, p).preenchido).map(a => a.nome))
        .map((arts, i) => arts.length ? `${ps[i].fornecedor}: ${arts.join(", ")} ao melhor preço (não cotou)` : null).filter(Boolean);

    const rot = Object.fromEntries(COT_LINHAS_RESUMO);
    rot.base = `${cotLegendaBase(c)} s/IVA (como está cotado)`;
    rot.cesto_base = `${cotLegendaBase(c)} s/IVA — mesma especificação`;

    let h = `<div class="cot-tabela-wrap"><table class="display cot-tabela">${cotCabecalho(d, ["", ], ["Melhor", "Nota"])}<tbody>`;
    for (const [k, txt, nums, forte] of linhas) {
        if ((k === "base" || k === "cesto_base") && !base) continue;
        const min = nums ? cotMinIdx(nums) : [];
        const destaqueNota = k === "cesto_base" ? " cot-nota-forte" : "";
        let nota = cotEsc(notas[k] || "");
        if (k === "cesto" && preench.length) nota = [nota, cotEsc(preench.join(" · "))].filter(Boolean).join("<br>");
        h += `<tr class="${forte ? "cot-forte" : ""}"><td>${rot[k]}</td>`;
        h += ps.map((_, i) => nums
            ? `<td class="num ${min.includes(i) ? "cot-melhor" : ""}">${cotEur(nums[i])}</td>`
            : `<td class="num">${txt[i] || ""}</td>`).join("");
        h += `<td class="num">${nums && min.length ? cotEur(nums[min[0]]) : ""}</td><td class="cot-nota${destaqueNota}">${nota}</td></tr>`;
    }
    h += `</tbody></table></div>`;

    // Compra repartida
    const rep = cotCompraRepartida(d);
    const melhorCesto = Math.min(...cesto);
    const iMelhor = cesto.indexOf(melhorCesto);
    if (rep > 0) {
        h += `<div class="cot-repartida card">
            <div><div class="cot-rotulo">Compra repartida — melhor preço de cada artigo</div>
            <div class="cot-repartida-valor">${cotEur(rep)}${base ? ` <span>· ${cotEur(rep / base)}/${cotEsc(c.unidade_base)}</span>` : ""}</div></div>
            <div class="cot-repartida-nota">${melhorCesto - rep > 0.005
                ? `Poupa ${cotEur(melhorCesto - rep)} face a comprar tudo na ${cotEsc(ps[iMelhor].fornecedor)}.`
                : `Igual a comprar tudo na ${cotEsc(ps[iMelhor].fornecedor)}.`}</div>
        </div>`;
    }
    h += cotListaConclusoes(c.conclusao);
    return h;
}

function cotListaConclusoes(txt) {
    const ls = String(txt || "").split("\n").map(s => s.replace(/^\s*[•\-]\s*/, "").trim()).filter(Boolean);
    if (!ls.length) return "";
    return `<ul class="cot-bullets">${ls.map(l => `<li>${cotEsc(l)}</li>`).join("")}</ul>`;
}

// ── 2. Preços unitários ──
function cotVistaPrecos(d) {
    let h = `<div class="cot-legenda">Preços unitários líquidos, já com descontos e sem IVA.</div>
        <div class="cot-tabela-wrap"><table class="display cot-tabela">${cotCabecalho(d, ["Artigo", "Unid."], ["Mais barato", "Difer. pior/melhor"])}<tbody>`;
    for (const a of d.artigos) {
        if (!a.no_cesto) continue;
        const vals = d.propostas.map(p => cotPreco(d, a, p));
        const min = cotMinIdx(vals);
        const ok = vals.filter(v => v != null);
        const dif = ok.length > 1 ? Math.max(...ok) / Math.min(...ok) - 1 : null;
        h += `<tr><td>${cotEsc(a.nome)}</td><td>€/${cotEsc(a.unidade)}</td>`;
        h += d.propostas.map((p, i) => {
            const c = cotCotacao(d, a.id, p.id);
            if (c && c.nao_cotou) return `<td class="num cot-falta">não cotou</td>`;
            return `<td class="num ${min.includes(i) ? "cot-melhor" : ""}">${vals[i] == null ? "" : cotNum(vals[i], 4)}</td>`;
        }).join("");
        h += `<td><strong>${min.map(i => cotEsc(d.propostas[i].fornecedor)).join(", ")}</strong></td>
              <td class="num">${dif == null ? "" : cotNum(dif * 100, 0) + "%"}</td></tr>`;
    }
    h += `</tbody></table></div>`;
    const obs = d.propostas.filter(p => p.observacoes);
    if (obs.length) h += `<ul class="cot-bullets">${obs.map(p => `<li><strong>${cotEsc(p.fornecedor)}:</strong> ${cotEsc(p.observacoes)}</li>`).join("")}</ul>`;
    return h;
}

// ── 3. Como está cotado ──
function cotVistaCotado(d) {
    const c = d.comp;
    let h = `<div class="cot-legenda">Quantidades orçamentadas por cada fornecedor${c.quantidade_base ? ` (${cotQtd(c.quantidade_base)} ${cotEsc(c.unidade_base)})` : ""}.</div>
        <div class="cot-tabela-wrap"><table class="display cot-tabela">${cotCabecalho(d, ["Artigo", "Unid."], ["Quantidade correta e porquê"])}<tbody>`;
    for (const a of d.artigos) {
        h += `<tr class="${a.destacar ? "cot-destacar" : ""}"><td>${cotEsc(a.nome)}</td><td>${cotEsc(a.unidade)}</td>`;
        h += d.propostas.map(p => {
            const q = cotCotacao(d, a.id, p.id);
            if (!q || q.nao_cotou) return `<td class="num cot-falta">${q ? "não cotou" : ""}</td>`;
            const v = q.quantidade_txt || cotQtd(q.quantidade);
            return `<td class="num">${cotEsc(v)}</td>`;
        }).join("");
        const certa = a.qtd_correta != null && a.no_cesto ? `<strong>${cotQtd(a.qtd_correta)} ${cotEsc(a.unidade)}.</strong> ` : "";
        h += `<td class="cot-nota">${certa}${cotEsc(a.nota || "")}</td></tr>`;
    }
    return h + `</tbody></table></div>`;
}

// ── 4. Cesto normalizado ──
function cotVistaCesto(d) {
    const c = d.comp, base = Number(c.quantidade_base) || null;
    let h = `<div class="cot-legenda">Mesma especificação aplicada a todos${base ? ` — ${cotQtd(base)} ${cotEsc(c.unidade_base)}` : ""}. A coluna «Melhor» é a compra repartida. Valores em itálico: o fornecedor não cotou, conta o melhor preço dos outros.</div>
        <div class="cot-tabela-wrap"><table class="display cot-tabela">${cotCabecalho(d, ["Artigo", "Unid.", "Qtd. correta"], ["Melhor"])}<tbody>`;
    const tot = d.propostas.map(() => 0);
    let totMelhor = 0;
    for (const a of d.artigos) {
        if (!a.no_cesto || a.qtd_correta == null) continue;
        const vs = d.propostas.map(p => cotValorCesto(d, a, p));
        const min = cotMinIdx(vs.map(v => v.valor));
        const m = min.length ? vs[min[0]].valor : null;
        totMelhor += m || 0;
        h += `<tr><td>${cotEsc(a.nome)}</td><td>${cotEsc(a.unidade)}</td><td class="num"><strong>${cotQtd(a.qtd_correta)}</strong></td>`;
        h += vs.map((v, i) => {
            tot[i] += v.valor || 0;
            return `<td class="num ${min.includes(i) ? "cot-melhor" : ""} ${v.preenchido ? "cot-preenchido" : ""}" ${v.preenchido ? 'title="Não cotou: preço do melhor"' : ""}>${cotEur(v.valor)}</td>`;
        }).join("");
        h += `<td class="num"><strong>${cotEur(m)}</strong></td></tr>`;
    }
    const minT = cotMinIdx(tot);
    h += `<tr class="cot-total"><td colspan="3">TOTAL s/IVA</td>${tot.map((t, i) => `<td class="num ${minT.includes(i) ? "cot-melhor" : ""}">${cotEur(t)}</td>`).join("")}<td class="num">${cotEur(totMelhor)}</td></tr>`;
    if (base) h += `<tr class="cot-forte"><td colspan="3">${cotLegendaBase(c)}</td>${tot.map(t => `<td class="num">${cotEur(t / base)}</td>`).join("")}<td class="num">${cotEur(totMelhor / base)}</td></tr>`;
    return h + `</tbody></table></div>`;
}

// ── 5. Faltas e riscos ──
function cotVistaRiscos(d) {
    if (!d.riscos.length) return `<p style="color:var(--text-muted);padding:20px">Sem faltas ou riscos registados.</p>`;
    let h = `<div class="cot-legenda">O que falta e o que perguntar antes de encomendar.</div>
        <div class="cot-tabela-wrap"><table class="display cot-tabela"><thead><tr><th>#</th><th>Ponto</th><th>Impacto</th><th>O que fazer</th></tr></thead><tbody>`;
    d.riscos.forEach((r, i) => {
        h += `<tr class="${r.grave ? "cot-destacar" : ""}"><td><strong>${i + 1}</strong></td><td>${cotEsc(r.ponto)}</td>
              <td style="white-space:nowrap"><strong>${cotEsc(r.impacto || "")}</strong></td><td class="cot-nota">${cotEsc(r.acao || "")}</td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

// =======================================================
// EDITOR
// =======================================================
function cotAbrirEditor(d) {
    const novo = !d;
    _cotEd = novo
        ? { comp: { id: cotUid(), titulo: "", obra_id: null, quantidade_base: null, unidade_base: "m²", estado: "aberta", conclusao: "", notas_resumo: {} },
            propostas: [], artigos: [], cotacoes: [], riscos: [], novo: true }
        : JSON.parse(JSON.stringify({ comp: d.comp, propostas: d.propostas, artigos: d.artigos, cotacoes: d.cotacoes, riscos: d.riscos, novo: false }));
    delete _cotEd.comp.obras;
    _cotEd.comp.notas_resumo = _cotEd.comp.notas_resumo || {};
    _cotEdOrig = novo ? { propostas: [], artigos: [], riscos: [], cotacoes: [] } : {
        propostas: d.propostas.map(x => x.id), artigos: d.artigos.map(x => x.id),
        riscos: d.riscos.map(x => x.id), cotacoes: d.cotacoes.map(x => x.id),
    };
    document.getElementById("cotEdTitulo").textContent = novo ? "Nova comparação" : "Editar comparação";
    document.getElementById("cotEdEliminar").style.display = novo ? "none" : "";
    cotRenderEditor();
    document.getElementById("modalCotacao").classList.remove("hidden");
}

function cotFecharEditor() {
    document.getElementById("modalCotacao").classList.add("hidden");
    _cotEd = null;
}

function cotInp(campo, valor, extra = "") {
    return `<input data-campo="${campo}" value="${cotEsc(valor ?? "")}" ${extra}>`;
}

function cotRenderEditor() {
    const e = _cotEd, c = e.comp;
    const obras = `<option value="">— Sem obra —</option>` + _cotObras
        .filter(o => o.estado !== "concluida" || o.id === c.obra_id)
        .map(o => `<option value="${o.id}" ${o.id === c.obra_id ? "selected" : ""}>${cotEsc((o.codigo ? o.codigo + " · " : "") + (o.nome || ""))}</option>`).join("");
    const estados = Object.entries(COT_ESTADOS).map(([k, n]) => `<option value="${k}" ${k === c.estado ? "selected" : ""}>${n}</option>`).join("");

    let h = `<div class="cot-ed-sec" data-sec="comp">
        <div class="form-row">
            <div class="form-group"><label>Título *</label>${cotInp("titulo", c.titulo, 'placeholder="Ex.: Pladur obra Sara Cepa, capoto 200 m², caixilharia..."')}</div>
            <div class="form-group"><label>Obra</label><select data-campo="obra_id">${obras}</select></div>
        </div>
        <div class="form-row">
            <div class="form-group input-sm"><label>Quantidade base</label>${cotInp("quantidade_base", c.quantidade_base == null ? "" : cotQtd(c.quantidade_base), 'placeholder="200"')}</div>
            <div class="form-group input-sm"><label>Unidade</label>${cotInp("unidade_base", c.unidade_base)}</div>
            <div class="form-group input-md"><label>Estado</label><select data-campo="estado">${estados}</select></div>
        </div>
        <div class="form-row"><div class="form-group"><label>Conclusão (uma ideia por linha)</label>
            <textarea data-campo="conclusao" rows="4">${cotEsc(c.conclusao || "")}</textarea></div></div>
        <details><summary>Notas das linhas do resumo</summary>
            ${COT_LINHAS_RESUMO.map(([k, n]) => `<div class="form-row"><div class="form-group"><label>${n}</label><input data-nota="${k}" value="${cotEsc(c.notas_resumo[k] || "")}"></div></div>`).join("")}
        </details>
    </div>`;

    // Fornecedores
    h += `<h3 class="cot-ed-h">Fornecedores</h3><datalist id="cotFornecsList">${_cotFornecs.map(f => `<option value="${cotEsc(f.nome)}">`).join("")}</datalist>
        <div class="cot-tabela-wrap"><table class="cot-ed-tabela"><thead><tr>
        <th>Fornecedor *</th><th>Nº doc.</th><th>Data</th><th>Validade</th><th>Sistema / marca</th><th>Total s/IVA</th><th>Total c/IVA</th><th>Pagamento</th><th>Entrega</th><th>Observações</th><th></th></tr></thead><tbody>`;
    e.propostas.forEach((p, i) => {
        h += `<tr data-sec="propostas" data-i="${i}">
            <td>${cotInp("fornecedor", p.fornecedor, 'list="cotFornecsList" style="min-width:130px"')}</td>
            <td>${cotInp("documento", p.documento)}</td>
            <td><input type="date" data-campo="data_documento" value="${cotEsc(p.data_documento || "")}"></td>
            <td>${cotInp("validade", p.validade)}</td>
            <td>${cotInp("sistema", p.sistema)}</td>
            <td>${cotInp("total_sem_iva", p.total_sem_iva == null ? "" : cotNum(p.total_sem_iva), 'class="num"')}</td>
            <td>${cotInp("total_com_iva", p.total_com_iva == null ? "" : cotNum(p.total_com_iva), 'class="num"')}</td>
            <td>${cotInp("pagamento", p.pagamento)}</td>
            <td>${cotInp("entrega", p.entrega)}</td>
            <td>${cotInp("observacoes", p.observacoes, 'style="min-width:200px"')}</td>
            <td><button class="btn-acao" data-remover="propostas" data-i="${i}" title="Remover">✕</button></td></tr>`;
    });
    h += `</tbody></table></div><button class="btn-secondary cot-ed-add" data-add="propostas">+ Fornecedor</button>`;

    // Artigos
    h += `<h3 class="cot-ed-h">Artigos a comparar</h3>
        <div class="cot-tabela-wrap"><table class="cot-ed-tabela"><thead><tr>
        <th>Artigo *</th><th>Unid.</th><th>Qtd. correta</th><th>Quantidade correta e porquê</th><th title="Linha a vermelho em Como está cotado">Destacar</th><th title="Desmarcar para taxas e extras">No cesto</th><th></th></tr></thead><tbody>`;
    e.artigos.forEach((a, i) => {
        h += `<tr data-sec="artigos" data-i="${i}">
            <td>${cotInp("nome", a.nome, 'style="min-width:200px"')}</td>
            <td>${cotInp("unidade", a.unidade, 'style="width:60px"')}</td>
            <td>${cotInp("qtd_correta", a.qtd_correta == null ? "" : cotQtd(a.qtd_correta), 'class="num" style="width:90px"')}</td>
            <td>${cotInp("nota", a.nota, 'style="min-width:280px"')}</td>
            <td style="text-align:center"><input type="checkbox" data-campo="destacar" ${a.destacar ? "checked" : ""}></td>
            <td style="text-align:center"><input type="checkbox" data-campo="no_cesto" ${a.no_cesto ? "checked" : ""}></td>
            <td><button class="btn-acao" data-remover="artigos" data-i="${i}" title="Remover">✕</button></td></tr>`;
    });
    h += `</tbody></table></div><button class="btn-secondary cot-ed-add" data-add="artigos">+ Artigo</button>`;

    // Matriz de preços
    h += `<h3 class="cot-ed-h">O que cada fornecedor cotou</h3>
        <div class="cot-legenda">Preço líquido por unidade do artigo, já com descontos e sem IVA. "Qtd. a mostrar" é opcional (ex.: 45 L quando a unidade é kg).</div>`;
    if (e.artigos.length && e.propostas.length) {
        h += `<div class="cot-tabela-wrap"><table class="cot-ed-tabela cot-ed-matriz"><thead><tr><th>Artigo</th>${e.propostas.map(p => `<th>${cotEsc(p.fornecedor || "(sem nome)")}</th>`).join("")}</tr></thead><tbody>`;
        e.artigos.forEach(a => {
            h += `<tr><td><strong>${cotEsc(a.nome || "(sem nome)")}</strong><br><span style="color:var(--text-muted)">${cotEsc(a.unidade || "")}</span></td>`;
            h += e.propostas.map(p => {
                const q = cotCotacao(e, a.id, p.id) || {};
                const k = `data-a="${a.id}" data-p="${p.id}"`;
                return `<td class="cot-ed-cel ${q.nao_cotou ? "cot-falta-bg" : ""}">
                    <label>Qtd.</label><input ${k} data-cc="quantidade" value="${q.quantidade == null ? "" : cotQtd(q.quantidade)}" class="num">
                    <label>Preço</label><input ${k} data-cc="preco_unitario" value="${q.preco_unitario == null ? "" : cotNum(q.preco_unitario, 4)}" class="num">
                    <label>Qtd. a mostrar</label><input ${k} data-cc="quantidade_txt" value="${cotEsc(q.quantidade_txt || "")}">
                    <label class="cot-ed-chk"><input type="checkbox" ${k} data-cc="nao_cotou" ${q.nao_cotou ? "checked" : ""}> não cotou</label>
                </td>`;
            }).join("");
            h += `</tr>`;
        });
        h += `</tbody></table></div>`;
    } else {
        h += `<p style="color:var(--text-muted)">Acrescenta fornecedores e artigos para preencher os preços.</p>`;
    }

    // Riscos
    h += `<h3 class="cot-ed-h">Faltas e riscos</h3>
        <div class="cot-tabela-wrap"><table class="cot-ed-tabela"><thead><tr><th>Ponto *</th><th>Impacto</th><th>O que fazer</th><th>Grave</th><th></th></tr></thead><tbody>`;
    e.riscos.forEach((r, i) => {
        h += `<tr data-sec="riscos" data-i="${i}">
            <td>${cotInp("ponto", r.ponto, 'style="min-width:220px"')}</td>
            <td>${cotInp("impacto", r.impacto, 'style="width:110px"')}</td>
            <td>${cotInp("acao", r.acao, 'style="min-width:320px"')}</td>
            <td style="text-align:center"><input type="checkbox" data-campo="grave" ${r.grave ? "checked" : ""}></td>
            <td><button class="btn-acao" data-remover="riscos" data-i="${i}" title="Remover">✕</button></td></tr>`;
    });
    h += `</tbody></table></div><button class="btn-secondary cot-ed-add" data-add="riscos">+ Ponto</button>`;

    const el = document.getElementById("cotEdCorpo");
    el.innerHTML = h;
    cotLigarEditor(el);
}

const COT_CAMPOS_NUM = ["quantidade_base", "total_sem_iva", "total_com_iva", "qtd_correta"];

function cotLigarEditor(el) {
    const e = _cotEd;
    // Campos da comparação e das linhas
    el.querySelectorAll("[data-campo]").forEach(inp => {
        const ev = inp.type === "checkbox" || inp.tagName === "SELECT" ? "change" : "input";
        inp.addEventListener(ev, () => {
            const tr = inp.closest("tr[data-sec]");
            const alvo = tr ? e[tr.dataset.sec][Number(tr.dataset.i)] : e.comp;
            const campo = inp.dataset.campo;
            let v = inp.type === "checkbox" ? inp.checked : inp.value;
            if (COT_CAMPOS_NUM.includes(campo)) v = cotNumInput(v);
            else if (typeof v === "string" && !v.trim()) v = null;
            alvo[campo] = v;
        });
        // nomes de fornecedores/artigos aparecem na matriz: redesenhar ao sair do campo
        if (["fornecedor", "nome", "unidade"].includes(inp.dataset.campo)) inp.addEventListener("change", cotRenderEditorMantendoScroll);
    });
    el.querySelectorAll("[data-nota]").forEach(inp => inp.addEventListener("input", () => {
        if (inp.value.trim()) e.comp.notas_resumo[inp.dataset.nota] = inp.value.trim();
        else delete e.comp.notas_resumo[inp.dataset.nota];
    }));
    // Matriz
    el.querySelectorAll("[data-cc]").forEach(inp => {
        const ev = inp.type === "checkbox" ? "change" : "input";
        inp.addEventListener(ev, () => {
            let q = cotCotacao(e, inp.dataset.a, inp.dataset.p);
            if (!q) {
                q = { id: cotUid(), artigo_id: inp.dataset.a, proposta_id: inp.dataset.p, nao_cotou: false, quantidade: null, quantidade_txt: null, preco_unitario: null, descricao: null };
                e.cotacoes.push(q);
            }
            const campo = inp.dataset.cc;
            if (campo === "nao_cotou") {
                q.nao_cotou = inp.checked;
                inp.closest("td").classList.toggle("cot-falta-bg", inp.checked);
            } else if (campo === "quantidade_txt") q.quantidade_txt = inp.value.trim() || null;
            else q[campo] = cotNumInput(inp.value);
        });
    });
    el.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
        const sec = b.dataset.add, n = e[sec].length;
        if (sec === "propostas") e.propostas.push({ id: cotUid(), comparacao_id: e.comp.id, fornecedor: "", ordem: n });
        if (sec === "artigos")   e.artigos.push({ id: cotUid(), comparacao_id: e.comp.id, nome: "", unidade: e.artigos[n - 1]?.unidade || "un", qtd_correta: null, destacar: false, no_cesto: true, ordem: n });
        if (sec === "riscos")    e.riscos.push({ id: cotUid(), comparacao_id: e.comp.id, ponto: "", grave: false, ordem: n });
        cotRenderEditorMantendoScroll();
    });
    el.querySelectorAll("[data-remover]").forEach(b => b.onclick = () => {
        const sec = b.dataset.remover, i = Number(b.dataset.i);
        const item = e[sec][i];
        const nome = item.fornecedor || item.nome || item.ponto;
        if (nome && !confirm(`Remover "${nome}"?`)) return;
        e[sec].splice(i, 1);
        if (sec === "propostas") e.cotacoes = e.cotacoes.filter(q => q.proposta_id !== item.id);
        if (sec === "artigos")   e.cotacoes = e.cotacoes.filter(q => q.artigo_id !== item.id);
        cotRenderEditorMantendoScroll();
    });
}

function cotRenderEditorMantendoScroll() {
    const box = document.querySelector("#modalCotacao .modal-content");
    const y = box.scrollTop;
    cotRenderEditor();
    box.scrollTop = y;
}

async function cotGuardar() {
    const e = _cotEd, c = e.comp;
    if (!c.titulo || !String(c.titulo).trim()) { alert("Falta o título."); return; }
    if (e.propostas.some(p => !p.fornecedor || !p.fornecedor.trim())) { alert("Há um fornecedor sem nome."); return; }
    if (e.artigos.some(a => !a.nome || !a.nome.trim() || !a.unidade)) { alert("Há um artigo sem nome ou sem unidade."); return; }
    if (e.riscos.some(r => !r.ponto || !r.ponto.trim())) { alert("Há uma falta/risco sem texto."); return; }

    const btn = document.getElementById("cotEdGuardar");
    btn.disabled = true; btn.textContent = "A guardar…";
    try {
        const ordem = (arr) => arr.map((x, i) => ({ ...x, ordem: i, comparacao_id: c.id }));
        const forn = (nome) => _cotFornecs.find(f => f.nome.trim().toLowerCase() === nome.trim().toLowerCase())?.id || null;
        const propostas = ordem(e.propostas).map(p => ({
            id: p.id, comparacao_id: c.id, ordem: p.ordem, fornecedor: p.fornecedor.trim(),
            fornecedor_id: p.fornecedor_id || forn(p.fornecedor),
            documento: p.documento || null, data_documento: p.data_documento || null, validade: p.validade || null,
            sistema: p.sistema || null, total_sem_iva: p.total_sem_iva ?? null, total_com_iva: p.total_com_iva ?? null,
            pagamento: p.pagamento || null, entrega: p.entrega || null, observacoes: p.observacoes || null,
        }));
        const artigos = ordem(e.artigos).map(a => ({
            id: a.id, comparacao_id: c.id, ordem: a.ordem, nome: a.nome.trim(), unidade: a.unidade,
            qtd_correta: a.qtd_correta ?? null, nota: a.nota || null, destacar: !!a.destacar, no_cesto: !!a.no_cesto,
        }));
        const riscos = ordem(e.riscos).map(r => ({
            id: r.id, comparacao_id: c.id, ordem: r.ordem, ponto: r.ponto.trim(),
            impacto: r.impacto || null, acao: r.acao || null, grave: !!r.grave,
        }));
        const vazia = q => !q.nao_cotou && q.quantidade == null && q.preco_unitario == null && !q.quantidade_txt;
        const cotacoes = e.cotacoes.filter(q => !vazia(q)).map(q => ({
            id: q.id, artigo_id: q.artigo_id, proposta_id: q.proposta_id, nao_cotou: !!q.nao_cotou,
            quantidade: q.quantidade ?? null, quantidade_txt: q.quantidade_txt || null,
            preco_unitario: q.preco_unitario ?? null, descricao: q.descricao || null,
        }));

        const chk = r => { if (r.error) throw r.error; return r; };
        chk(await SB.from("comparacoes").upsert({
            id: c.id, titulo: c.titulo.trim(), obra_id: c.obra_id || null, quantidade_base: c.quantidade_base ?? null,
            unidade_base: c.unidade_base || "m²", estado: c.estado, conclusao: c.conclusao || null, notas_resumo: c.notas_resumo || {},
        }));

        // Apagar o que saiu (as cotações de artigos/fornecedores removidos vão em cascata)
        const fora = (orig, atuais) => orig.filter(id => !atuais.some(x => x.id === id));
        const apagar = async (tabela, ids) => { if (ids.length) chk(await SB.from(tabela).delete().in("id", ids)); };
        await apagar("comparacao_propostas", fora(_cotEdOrig.propostas, propostas));
        await apagar("comparacao_artigos",   fora(_cotEdOrig.artigos, artigos));
        await apagar("comparacao_riscos",    fora(_cotEdOrig.riscos, riscos));
        const vivos = new Set([...propostas.map(p => p.id), ...artigos.map(a => a.id)]);
        const cotFora = e.cotacoes.filter(q => vazia(q) && _cotEdOrig.cotacoes.includes(q.id) && vivos.has(q.artigo_id) && vivos.has(q.proposta_id)).map(q => q.id);
        await apagar("comparacao_cotacoes", cotFora);

        if (propostas.length) chk(await SB.from("comparacao_propostas").upsert(propostas));
        if (artigos.length)   chk(await SB.from("comparacao_artigos").upsert(artigos));
        if (cotacoes.length)  chk(await SB.from("comparacao_cotacoes").upsert(cotacoes));
        if (riscos.length)    chk(await SB.from("comparacao_riscos").upsert(riscos));

        cotFecharEditor();
        await cotAbrir(c.id);
    } catch (err) {
        alert("Erro ao guardar: " + (err.message || err));
    } finally {
        btn.disabled = false; btn.textContent = "Guardar";
    }
}

async function cotEliminar() {
    const c = _cotEd?.comp;
    if (!c || !confirm(`Apagar a comparação "${c.titulo}" e todos os preços dela?`)) return;
    const { error } = await SB.from("comparacoes").delete().eq("id", c.id);
    if (error) { alert("Erro ao apagar: " + error.message); return; }
    cotFecharEditor();
    cotMostrarLista();
}

// =======================================================
// CARREGAR ORÇAMENTOS (PDF / foto) — leitura pela Edge Function
// ler-orcamento-fornecedor; nada é gravado sem confirmação.
// =======================================================
let _cotLe = null;          // { ficheiro, orc, fornecedor_conhecido, avisos, linhas }

async function cotLerFicheiros(ficheiros) {
    if (!ficheiros.length || !_cotAtual) return;
    const btn = document.getElementById("cotCarregar");
    const texto = btn.textContent;
    for (let i = 0; i < ficheiros.length; i++) {
        const f = ficheiros[i];
        btn.disabled = true;
        btn.textContent = ficheiros.length > 1 ? `⏳ A ler ${i + 1} de ${ficheiros.length}…` : "⏳ A ler…";
        let r;
        try {
            r = await cotLerUm(f);
        } catch (e) {
            alert(`"${f.name}": ${e.message}`);
            continue;
        } finally {
            btn.disabled = false;
            btn.textContent = texto;
        }
        await cotRever(f, r, i + 1, ficheiros.length);
    }
}

async function cotLerUm(ficheiro) {
    if (ficheiro.size > 8 * 1024 * 1024) throw new Error("tem mais de 8 MB. Digitaliza com menos qualidade.");
    const base64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload  = () => resolve(String(fr.result).split(",")[1]);
        fr.onerror = () => reject(new Error("não foi possível abrir o ficheiro."));
        fr.readAsDataURL(ficheiro);
    });
    const { data: { session } } = await SB.auth.getSession();
    if (!session) throw new Error("a sessão expirou. Volta a entrar.");
    const r = await fetch(`${SUPABASE_URL}/functions/v1/ler-orcamento-fornecedor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({
            ficheiro_base64: base64,
            tipo: ficheiro.type || "application/pdf",
            artigos: _cotAtual.artigos.map(a => ({ nome: a.nome, unidade: a.unidade })),
        }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
    return j;
}

// Abre a revisão de um ficheiro; resolve quando o Alcindo acrescenta ou ignora.
function cotRever(ficheiro, r, n, total) {
    const o = r.orcamento || {};
    const arts = _cotAtual.artigos;
    _cotLe = {
        ficheiro, avisos: r.avisos || [],
        cab: {
            fornecedor: r.fornecedor_conhecido?.nome || o.fornecedor_nome || "",
            fornecedor_id: r.fornecedor_conhecido?.id || null,
            documento: o.documento || "", data_documento: o.data || "", validade: o.validade || "",
            sistema: o.sistema || "", total_sem_iva: o.total_sem_iva, total_com_iva: o.total_com_iva,
            pagamento: o.pagamento || "", entrega: o.entrega || "", observacoes: o.observacoes || "",
        },
        linhas: (o.linhas || []).map(l => {
            let destino = "ignorar", novoNome = "", novaUn = "";
            if (l.artigo != null && arts[l.artigo]) destino = "a:" + arts[l.artigo].id;
            else if (l.novo_artigo || l.fora_do_cesto) {
                destino = "novo";
                novoNome = l.novo_artigo?.nome || l.descricao || "";
                novaUn = l.novo_artigo?.unidade || (l.fora_do_cesto ? "€" : (l.unidade || "un"));
            }
            return {
                descricao: l.descricao || "", doc: [l.quantidade != null ? cotQtd(l.quantidade) : "", l.unidade || ""].join(" ").trim(),
                valor: l.valor_liquido_sem_iva, conversao: l.conversao || "", fora: !!l.fora_do_cesto,
                destino, novoNome, novaUn,
                qtd: l.fora_do_cesto && l.quantidade_comparavel == null ? 1 : l.quantidade_comparavel,
                preco: l.fora_do_cesto && l.preco_comparavel == null ? l.valor_liquido_sem_iva : l.preco_comparavel,
            };
        }).map(l => ({ ...l, qtdOrig: l.qtd, precoOrig: l.preco })),
        marcarFaltas: true,
    };
    document.getElementById("cotLeTitulo").textContent =
        `Orçamento lido${total > 1 ? ` (${n} de ${total})` : ""} · ${ficheiro.name}`;
    cotRenderRevisao();
    document.getElementById("modalCotLeitura").classList.remove("hidden");
    return new Promise(resolve => {
        const fechar = () => { document.getElementById("modalCotLeitura").classList.add("hidden"); _cotLe = null; resolve(); };
        document.getElementById("cotLeFechar").onclick  = fechar;
        document.getElementById("cotLeIgnorar").onclick = fechar;
        document.getElementById("cotLeAcrescentar").onclick = async () => {
            if (await cotAcrescentar()) fechar();
        };
    });
}

function cotRenderRevisao() {
    const L = _cotLe, c = L.cab, arts = _cotAtual.artigos;
    const campo = (k, rot, extra = "") => `<div class="form-group ${extra}"><label>${rot}</label><input data-le="${k}" value="${cotEsc(c[k] ?? "")}"></div>`;
    let h = "";
    if (L.avisos.length) h += `<div class="cot-avisos">${L.avisos.map(a => `<div>⚠ ${cotEsc(a)}</div>`).join("")}</div>`;
    h += `<div class="form-row">${campo("fornecedor", "Fornecedor *")}${campo("documento", "Nº doc.", "input-md")}
            <div class="form-group input-md"><label>Data</label><input type="date" data-le="data_documento" value="${cotEsc(c.data_documento)}"></div>
            ${campo("validade", "Validade", "input-md")}</div>
          <div class="form-row">${campo("sistema", "Sistema / marca")}
            <div class="form-group input-md"><label>Total s/IVA</label><input data-le="total_sem_iva" class="num" value="${c.total_sem_iva == null ? "" : cotNum(c.total_sem_iva)}"></div>
            <div class="form-group input-md"><label>Total c/IVA</label><input data-le="total_com_iva" class="num" value="${c.total_com_iva == null ? "" : cotNum(c.total_com_iva)}"></div>
            ${campo("pagamento", "Pagamento", "input-md")}${campo("entrega", "Entrega", "input-md")}</div>
          <div class="form-row">${campo("observacoes", "Observações")}</div>`;

    const opcoes = (l) => `<option value="ignorar" ${l.destino === "ignorar" ? "selected" : ""}>— Ignorar esta linha —</option>` +
        arts.map(a => `<option value="a:${a.id}" ${l.destino === "a:" + a.id ? "selected" : ""}>${cotEsc(a.nome)} (${cotEsc(a.unidade)})</option>`).join("") +
        `<option value="novo" ${l.destino === "novo" ? "selected" : ""}>+ Novo artigo…</option>`;
    h += `<h3 class="cot-ed-h">Linhas do orçamento</h3>
        <div class="cot-legenda">Confirma a que artigo da comparação corresponde cada linha. Quantidade e preço já estão na unidade do artigo, líquidos e sem IVA.</div>
        <div class="cot-tabela-wrap"><table class="cot-ed-tabela"><thead><tr>
            <th>No documento</th><th>Valor líq. s/IVA</th><th>Artigo da comparação</th><th>Qtd.</th><th>Preço unit.</th><th>Conversão</th></tr></thead><tbody>`;
    L.linhas.forEach((l, i) => {
        const novo = l.destino === "novo";
        const un = novo ? l.novaUn : (arts.find(a => "a:" + a.id === l.destino)?.unidade || "");
        h += `<tr data-li="${i}" class="${l.destino === "ignorar" ? "cot-le-ignorada" : ""}">
            <td style="min-width:240px"><strong>${cotEsc(l.descricao)}</strong><br><span style="color:var(--text-muted)">${cotEsc(l.doc)}</span></td>
            <td class="num" style="white-space:nowrap">${cotEur(l.valor)}</td>
            <td style="min-width:220px"><select data-ll="destino">${opcoes(l)}</select>
                ${novo ? `<div style="display:flex;gap:4px;margin-top:4px"><input data-ll="novoNome" value="${cotEsc(l.novoNome)}" placeholder="Nome do artigo"><input data-ll="novaUn" value="${cotEsc(l.novaUn)}" style="width:60px;min-width:60px" placeholder="un"></div>
                <label class="cot-ed-chk" style="font-size:11px"><input type="checkbox" data-ll="fora" ${l.fora ? "checked" : ""}> fora do cesto (portes, taxas)</label>` : ""}</td>
            <td><input data-ll="qtd" class="num" style="width:90px;min-width:90px" value="${l.qtd == null ? "" : cotQtd(l.qtd)}"><div style="font-size:10px;color:var(--text-muted)">${cotEsc(un)}</div></td>
            <td><input data-ll="preco" class="num" style="width:90px;min-width:90px" value="${l.preco == null ? "" : cotNum(l.preco, 4)}"><div style="font-size:10px;color:var(--text-muted)">€/${cotEsc(un)}</div></td>
            <td class="cot-nota" style="min-width:180px">${cotEsc(l.conversao)}</td></tr>`;
    });
    h += `</tbody></table></div>`;
    if (arts.length) h += `<label class="cot-ed-chk" style="margin-top:12px;font-size:13px"><input type="checkbox" id="cotLeFaltas" ${L.marcarFaltas ? "checked" : ""}> Marcar como «não cotou» os artigos da comparação que este fornecedor não tem</label>`;

    const el = document.getElementById("cotLeCorpo");
    el.innerHTML = h;
    el.querySelectorAll("[data-le]").forEach(inp => inp.oninput = () => {
        const k = inp.dataset.le;
        c[k] = ["total_sem_iva", "total_com_iva"].includes(k) ? cotNumInput(inp.value) : inp.value;
        if (k === "fornecedor") c.fornecedor_id = null;
    });
    el.querySelectorAll("[data-ll]").forEach(inp => {
        const ev = inp.tagName === "SELECT" || inp.type === "checkbox" ? "change" : "input";
        inp.addEventListener(ev, () => {
            const l = L.linhas[Number(inp.closest("tr").dataset.li)], k = inp.dataset.ll;
            if (k === "destino") {
                l.destino = inp.value;
                if (l.destino === "novo" && !l.novoNome) { l.novoNome = l.descricao; l.novaUn = l.novaUn || "un"; }
                const box = document.querySelector("#modalCotLeitura .modal-content"), y = box.scrollTop;
                cotRenderRevisao(); box.scrollTop = y;
            } else if (k === "fora") l.fora = inp.checked;
            else if (k === "qtd" || k === "preco") l[k] = cotNumInput(inp.value);
            else l[k] = inp.value;
        });
    });
    const chk = document.getElementById("cotLeFaltas");
    if (chk) chk.onchange = () => { L.marcarFaltas = chk.checked; };
}

async function cotAcrescentar() {
    const L = _cotLe, c = L.cab, d = _cotAtual, compId = d.comp.id;
    if (!String(c.fornecedor || "").trim()) { alert("Falta o nome do fornecedor."); return false; }
    const usadas = L.linhas.filter(l => l.destino !== "ignorar");
    if (usadas.some(l => l.destino === "novo" && !String(l.novoNome || "").trim())) { alert("Há um artigo novo sem nome."); return false; }

    const btn = document.getElementById("cotLeAcrescentar");
    btn.disabled = true; btn.textContent = "A gravar…";
    try {
        const chk = r => { if (r.error) throw r.error; return r; };
        const nomeForn = c.fornecedor.trim();
        const proposta = {
            id: cotUid(), comparacao_id: compId, ordem: d.propostas.length, fornecedor: nomeForn,
            fornecedor_id: c.fornecedor_id || _cotFornecs.find(f => f.nome.trim().toLowerCase() === nomeForn.toLowerCase())?.id || null,
            documento: c.documento || null, data_documento: c.data_documento || null, validade: c.validade || null,
            sistema: c.sistema || null, total_sem_iva: c.total_sem_iva ?? null, total_com_iva: c.total_com_iva ?? null,
            pagamento: c.pagamento || null, entrega: c.entrega || null, observacoes: c.observacoes || null,
        };

        // Artigos novos (linhas com o mesmo nome juntam-se num só)
        const novos = {};
        let ordem = d.artigos.length;
        for (const l of usadas.filter(l => l.destino === "novo")) {
            const k = l.novoNome.trim().toLowerCase();
            if (!novos[k]) novos[k] = {
                id: cotUid(), comparacao_id: compId, nome: l.novoNome.trim(), unidade: (l.novaUn || "un").trim(),
                qtd_correta: null, nota: l.fora ? null : "Quantidade do primeiro orçamento lido: confirmar.",
                destacar: false, no_cesto: !l.fora, ordem: ordem++,
            };
            l.artigoId = novos[k].id;
        }
        usadas.filter(l => l.destino.startsWith("a:")).forEach(l => { l.artigoId = l.destino.slice(2); });

        // Uma cotação por artigo: soma as linhas que lhe correspondem
        const porArtigo = {};
        for (const l of usadas) {
            const q = Number(l.qtd) || 0, p = Number(l.preco);
            const a = porArtigo[l.artigoId] = porArtigo[l.artigoId] || { qtd: 0, valor: 0, semPreco: false, desc: [], fora: false };
            a.qtd += q;
            a.fora = a.fora || l.fora || !!d.artigos.find(x => x.id === l.artigoId && !x.no_cesto);
            // Sem alterações, usa o valor do documento (evita arredondar o preço duas vezes)
            const doDoc = l.valor != null && l.qtd === l.qtdOrig && l.preco === l.precoOrig;
            if (isNaN(p) || l.preco == null) a.semPreco = true; else a.valor += doDoc ? Number(l.valor) : q * p;
            a.desc.push(l.descricao);
        }
        // Artigo novo sem quantidade certa: usa a deste primeiro orçamento
        Object.values(novos).forEach(a => { if (a.no_cesto && porArtigo[a.id]?.qtd) a.qtd_correta = porArtigo[a.id].qtd; });

        const cotacoes = Object.entries(porArtigo).map(([artigoId, a]) => ({
            id: cotUid(), artigo_id: artigoId, proposta_id: proposta.id, nao_cotou: false,
            quantidade: a.qtd || null, quantidade_txt: a.fora && !a.semPreco ? cotEur(a.valor) : null,
            preco_unitario: a.semPreco || !a.qtd ? null : Math.round(a.valor / a.qtd * 1e6) / 1e6,
            descricao: a.desc.join(" · ").slice(0, 500),
        }));
        if (L.marcarFaltas) {
            d.artigos.filter(a => !porArtigo[a.id]).forEach(a => cotacoes.push({
                id: cotUid(), artigo_id: a.id, proposta_id: proposta.id, nao_cotou: true,
                quantidade: null, quantidade_txt: null, preco_unitario: null, descricao: null,
            }));
        }

        chk(await SB.from("comparacao_propostas").insert(proposta));
        try {
            if (Object.keys(novos).length) chk(await SB.from("comparacao_artigos").insert(Object.values(novos)));
            if (cotacoes.length) chk(await SB.from("comparacao_cotacoes").insert(cotacoes));
        } catch (e) {
            // não deixar uma proposta a meio
            await SB.from("comparacao_artigos").delete().in("id", Object.values(novos).map(a => a.id));
            await SB.from("comparacao_propostas").delete().eq("id", proposta.id);
            throw e;
        }
        await cotAbrir(compId);
        return true;
    } catch (e) {
        alert("Erro ao gravar: " + (e.message || e));
        return false;
    } finally {
        btn.disabled = false; btn.textContent = "Acrescentar à comparação";
    }
}
