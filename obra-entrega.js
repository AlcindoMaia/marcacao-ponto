// =======================================================
// OBRA EM CURSO — trabalhos a mais, remates e auto de entrega
// (separador Andamento do painel da obra; estudo DDC, 2026-11-17)
//
// Trabalhos a mais: pedido → preço → enviado ao cliente → o cliente aceita
// ou recusa na Área do cliente (fica o nome, a data, o IP). Ao aceitar, a
// base de dados cria um serviço "extra" na obra com o mesmo valor, e o valor
// da obra sobe sozinho. Aceite por telefone também se regista aqui.
//
// Remates: defeitos da vistoria final por divisão, com foto antes/depois,
// responsável e prazo. O cliente vê-os e confirma os resolvidos. No fim,
// o auto de entrega em PDF com os remates e os trabalhos a mais aceites.
//
// Precisa do obra_em_curso.sql. Sem ele, os cartões dizem o que falta.
// Usa do admin.js/andamento.js: SB, esc, _painelObraActual, msgAndamento,
// eurAnd, dataAnd, carregarJsPDF, dadosEmpresaDeclaracao, linkAreaCliente,
// linkWhatsAppTexto, linkEmailCliente, funcionariosParaPacotes; do fotos.js:
// prepararFoto, nomeSeguroFicheiro.
// =======================================================

let _entrega = { obraId: null, extras: [], remates: [], funcs: [], cliente: null, semSQL: false, entrega: null };
let _extraEmEdicao = null;    // null | {} (novo) | trabalho
let _remateEmEdicao = null;   // null | {} (novo) | remate
const BUCKET_REMATES = "obra-documentos";

const ESTADOS_EXTRA = {
    rascunho:  { txt: "Rascunho",           cor: "rgba(255,255,255,.12)" },
    enviado:   { txt: "À espera do cliente", cor: "rgba(224,176,122,.22)" },
    aceite:    { txt: "Aceite",             cor: "rgba(143,191,160,.25)" },
    recusado:  { txt: "Recusado",           cor: "rgba(224,148,134,.22)" },
    cancelado: { txt: "Cancelado",          cor: "rgba(255,255,255,.08)" },
};

async function carregarEntrega(obraId) {
    const [ex, rm, ob, funcs] = await Promise.all([
        SB.from("trabalhos_mais").select("*").eq("obra_id", obraId).order("created_at"),
        SB.from("obra_remates").select("*").eq("obra_id", obraId).order("created_at"),
        SB.from("obras").select("data_entrega, clientes(nome, telefone, email, token_acesso, acesso_ativo)").eq("id", obraId).maybeSingle(),
        funcionariosParaPacotes(),
    ]);
    if (_entrega.obraId !== obraId) { _extraEmEdicao = null; _remateEmEdicao = null; }
    _entrega = {
        obraId,
        semSQL: !!(ex.error || rm.error),
        extras: ex.data || [],
        remates: rm.data || [],
        funcs: funcs || [],
        cliente: ob.data?.clientes || null,
        entrega: ob.error ? null : (ob.data?.data_entrega || null),
    };
}

function htmlCartoesEntrega() {
    if (_entrega.obraId !== _painelObraActual?.id) return "";
    if (_entrega.semSQL) {
        return `<div class="card" style="margin:14px 0 0;font-size:13px;opacity:.8">
            <b>Trabalhos a mais e remates</b><br>Falta correr o ficheiro <code>obra_em_curso.sql</code> no SQL Editor do Supabase.</div>`;
    }
    return `<div class="card" style="margin:14px 0 0" id="cardExtras">${htmlExtras()}</div>
        <div class="card" style="margin:14px 0 0" id="cardRemates">${htmlRemates()}</div>`;
}

const tituloCartao = (txt, botao = "") => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <div style="font-family:var(--font-title,sans-serif);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.6">${txt}</div>${botao}</div>`;
const selo = (txt, cor) => `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${cor};white-space:nowrap">${esc(txt)}</span>`;
const dataHoraCurta = d => d ? new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";

// ── Trabalhos a mais ─────────────────────────────────────────
function htmlExtras() {
    const lista = _entrega.extras;
    const aceites = lista.filter(x => x.estado === "aceite");
    const soma = aceites.reduce((t, x) => t + Number(x.valor_sem_iva || 0), 0);
    const pend = lista.filter(x => x.estado === "enviado").length;
    let h = tituloCartao("Trabalhos a mais",
        _extraEmEdicao ? "" : `<button class="btn-secondary" style="padding:4px 12px;font-size:12px" onclick="novoExtra()">+ Trabalho a mais</button>`);
    if (_extraEmEdicao) h += htmlFormExtra(_extraEmEdicao);
    if (!lista.length && !_extraEmEdicao) {
        return h + `<div style="font-size:13px;opacity:.7">Nenhum. Quando o cliente pedir um extra (ou o pedir pela Área do cliente), faz aqui o preço e envia-lho para aceitar. Ao aceitar, soma ao valor da obra.</div>`;
    }
    if (lista.length) {
        h += `<div style="font-size:12.5px;opacity:.75;margin-bottom:6px">${aceites.length} aceite${aceites.length === 1 ? "" : "s"}: <b>${eurAnd(soma)}</b> sem IVA${pend ? ` · ${pend} à espera do cliente` : ""}</div>`;
    }
    h += lista.map((x, i) => {
        const e = ESTADOS_EXTRA[x.estado] || ESTADOS_EXTRA.rascunho;
        const resp = x.estado === "aceite"
            ? `Aceite por ${esc(x.resposta_nome || "cliente")}${x.resposta_por === "alcindo" ? " (registado por ti)" : " na Área do cliente"} a ${dataHoraCurta(x.resposta_em)}`
            : x.estado === "recusado" ? `Recusado a ${dataHoraCurta(x.resposta_em)}${x.motivo_recusa ? `: «${esc(x.motivo_recusa)}»` : ""}`
            : x.estado === "enviado" ? `Enviado a ${dataHoraCurta(x.enviado_em)}` : "";
        const botoes = [];
        if (x.estado === "rascunho") {
            botoes.push(`<button class="btn-primary" style="padding:4px 10px;font-size:12px" onclick="enviarExtra('${x.id}')">Enviar ao cliente</button>`);
            botoes.push(`<button class="btn-acao" title="Editar" onclick="editarExtra('${x.id}')">✏️</button>`);
            botoes.push(`<button class="btn-acao" title="Apagar" onclick="apagarExtra('${x.id}')">🗑</button>`);
        } else if (x.estado === "enviado") {
            botoes.push(...linksAvisarExtra(x));
            botoes.push(`<button class="btn-secondary" style="padding:4px 10px;font-size:12px" onclick="aceiteAoTelefone('${x.id}')">Aceitou ao telefone</button>`);
            botoes.push(`<button class="btn-secondary" style="padding:4px 10px;font-size:12px" onclick="mudarEstadoExtra('${x.id}','rascunho')">Voltar a rascunho</button>`);
        } else if (x.estado === "recusado" || x.estado === "cancelado") {
            botoes.push(`<button class="btn-acao" title="Apagar" onclick="apagarExtra('${x.id}')">🗑</button>`);
        }
        return `<div style="padding:9px 0;border-top:${i || _extraEmEdicao ? "1px solid rgba(255,255,255,.06)" : "none"};font-size:13px">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">
                <div style="flex:1;min-width:180px;white-space:pre-wrap">${esc(x.descricao)}</div>
                <div style="display:flex;gap:6px;align-items:center"><b>${eurAnd(x.valor_sem_iva)}</b>${selo(e.txt, e.cor)}</div>
            </div>
            <div style="font-size:12px;opacity:.65;margin-top:2px">+ IVA ${Number(x.taxa_iva)}%${x.dias_prazo ? ` · +${x.dias_prazo} dia(s) no prazo` : ""}${resp ? " · " + resp : ""}${x.servico_id ? " · já está nos serviços da obra" : ""}</div>
            ${botoes.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${botoes.join("")}</div>` : ""}
        </div>`;
    }).join("");
    return h;
}

function htmlFormExtra(x) {
    return `<div style="padding:10px;margin-bottom:10px;border-radius:8px;background:rgba(255,255,255,.04);font-size:13px">
        <label style="font-size:12px;opacity:.7">O que é (o cliente lê isto tal como está)</label>
        <textarea id="extraDesc" rows="3" maxlength="2000" placeholder="Ex.: Abrir roço e pôr 2 tomadas novas na cozinha, com caixa e acabamento">${esc(x.descricao || "")}</textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            <label style="flex:1;min-width:110px;font-size:12px">Preço sem IVA (€)<input id="extraValor" type="number" step="0.01" min="0" inputmode="decimal" value="${x.valor_sem_iva ?? ""}"></label>
            <label style="width:90px;font-size:12px">IVA (%)<input id="extraIva" type="number" step="1" min="0" max="23" value="${x.taxa_iva ?? 23}"></label>
            <label style="width:120px;font-size:12px">Dias a mais no prazo<input id="extraDias" type="number" step="1" min="0" max="365" value="${x.dias_prazo ?? ""}"></label>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <button class="btn-primary" style="padding:5px 14px;font-size:12px" onclick="gravarExtra(true)">Gravar e enviar ao cliente</button>
            <button class="btn-secondary" style="padding:5px 14px;font-size:12px" onclick="gravarExtra(false)">Só gravar (rascunho)</button>
            <button class="btn-secondary" style="padding:5px 14px;font-size:12px" onclick="fecharFormExtra()">Cancelar</button>
        </div></div>`;
}

function redesenharEntrega() {
    const a = document.getElementById("cardExtras"), b = document.getElementById("cardRemates");
    if (a) a.innerHTML = htmlExtras();
    if (b) b.innerHTML = htmlRemates();
}

function novoExtra(dados = {}) { _extraEmEdicao = { ...dados }; redesenharEntrega(); document.getElementById("extraDesc")?.focus(); }
function editarExtra(id) { const x = _entrega.extras.find(e => e.id === id); if (x) { _extraEmEdicao = { ...x }; redesenharEntrega(); } }
function fecharFormExtra() { _extraEmEdicao = null; redesenharEntrega(); }

async function gravarExtra(enviar) {
    const descricao = document.getElementById("extraDesc").value.trim();
    const valor = Number(document.getElementById("extraValor").value);
    const iva = Number(document.getElementById("extraIva").value);
    const diasTxt = document.getElementById("extraDias").value.trim();
    if (!descricao) return msgAndamento("Escreve o que é o trabalho a mais.", "err");
    if (!(valor > 0)) return msgAndamento("Põe o preço sem IVA.", "err");
    if (!(iva >= 0 && iva <= 23)) return msgAndamento("O IVA tem de estar entre 0 e 23%.", "err");
    if (enviar && !_entrega.cliente) return msgAndamento("Esta obra não tem cliente ligado: liga-o em Editar obra antes de enviar.", "err");
    const reg = {
        descricao, valor_sem_iva: Math.round(valor * 100) / 100, taxa_iva: iva,
        dias_prazo: diasTxt === "" ? null : Math.max(0, Math.round(Number(diasTxt))),
        ...(enviar ? { estado: "enviado", enviado_em: new Date().toISOString() } : {}),
    };
    const x = _extraEmEdicao || {};
    let error;
    if (x.id) ({ error } = await SB.from("trabalhos_mais").update(reg).eq("id", x.id).eq("estado", "rascunho"));
    else ({ error } = await SB.from("trabalhos_mais").insert({ obra_id: _painelObraActual.id, pedido_id: x.pedido_id || null, ...reg }));
    if (error) return msgAndamento("Não foi possível gravar: " + error.message, "err");
    _extraEmEdicao = null;
    await carregarEntrega(_painelObraActual.id);
    redesenharEntrega();
    msgAndamento(enviar ? "Enviado. O cliente já o vê na Área do cliente; avisa-o pelo WhatsApp ou e-mail." : "Gravado como rascunho.");
}

async function enviarExtra(id) {
    if (!_entrega.cliente) return msgAndamento("Esta obra não tem cliente ligado: liga-o em Editar obra antes de enviar.", "err");
    await mudarEstadoExtra(id, "enviado", { enviado_em: new Date().toISOString() });
    msgAndamento("Enviado. O cliente já o vê na Área do cliente; avisa-o pelo WhatsApp ou e-mail.");
}

async function mudarEstadoExtra(id, estado, extra = {}) {
    const { error } = await SB.from("trabalhos_mais").update({ estado, ...extra }).eq("id", id);
    if (error) return msgAndamento("Não foi possível gravar: " + error.message, "err");
    await carregarEntrega(_painelObraActual.id);
    redesenharEntrega();
}

// O cliente aceitou de viva voz: fica registado como aceite por ele, mas
// "registado por ti", e o serviço extra é criado na mesma
async function aceiteAoTelefone(id) {
    const nome = prompt("Quem aceitou? (nome do cliente)", _entrega.cliente?.nome || "");
    if (nome == null) return;
    if (nome.trim().length < 2) return msgAndamento("Escreve o nome de quem aceitou.", "err");
    await mudarEstadoExtra(id, "aceite", { resposta_em: new Date().toISOString(), resposta_nome: nome.trim().slice(0, 120),
                                            resposta_por: "alcindo", visto_em: new Date().toISOString() });
    msgAndamento("Aceite. Já está nos serviços da obra e soma ao valor.");
    if (typeof carregarPainelAndamento === "function") carregarPainelAndamento();
}

async function apagarExtra(id) {
    if (!confirm("Apagar este trabalho a mais?")) return;
    const { error } = await SB.from("trabalhos_mais").delete().eq("id", id).in("estado", ["rascunho", "recusado", "cancelado"]);
    if (error) return msgAndamento("Não foi possível apagar: " + error.message, "err");
    await carregarEntrega(_painelObraActual.id);
    redesenharEntrega();
}

function linksAvisarExtra(x) {
    const c = _entrega.cliente;
    if (!c) return [];
    const primeiro = (c.nome || "").trim().split(/\s+/)[0];
    const link = c.token_acesso && c.acesso_ativo !== false ? linkAreaCliente(c.token_acesso) : "";
    const texto = `Olá ${primeiro}, enviámos o preço de um trabalho a mais na obra ${_painelObraActual?.nome || ""} para aceitar na Área do cliente${link ? ": " + link : "."}`;
    const wa = linkWhatsAppTexto(c.telefone, texto);
    const mail = linkEmailCliente(c.email, "Trabalho a mais para aceitar", `${texto}\n\n${x.descricao}\n${eurAnd(x.valor_sem_iva)} + IVA\n\nMaia Solutions`);
    return [
        wa ? `<a class="btn-secondary" style="padding:4px 10px;font-size:12px;text-decoration:none" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">📲 Avisar</a>` : "",
        mail ? `<a class="btn-secondary" style="padding:4px 10px;font-size:12px;text-decoration:none" href="${esc(mail)}" target="_blank" rel="noopener noreferrer">✉️ E-mail</a>` : "",
    ].filter(Boolean);
}

// Do "Precisa de ti": um pedido de extra do cliente vira rascunho de trabalho
// a mais nesta obra, com o texto dele
async function extraDoPedido(pedidoId, obraId, mensagem) {
    await reabrirObraLembrada(obraId, "andamento");
    const esperar = async () => { for (let i = 0; i < 40 && _entrega.obraId !== obraId; i++) await new Promise(r => setTimeout(r, 150)); };
    await esperar();
    if (_entrega.semSQL) return;
    novoExtra({ pedido_id: pedidoId, descricao: mensagem });
    document.getElementById("cardExtras")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Remates ──────────────────────────────────────────────────
function htmlRemates() {
    const lista = _entrega.remates;
    const hoje = new Date().toISOString().slice(0, 10);
    const abertos = lista.filter(r => r.estado === "aberto");
    const confirmados = lista.filter(r => r.cliente_confirmou_em).length;
    let h = tituloCartao("Remates e entrega da obra",
        _remateEmEdicao ? "" : `<button class="btn-secondary" style="padding:4px 12px;font-size:12px" onclick="novoRemate()">+ Remate</button>`);
    if (_remateEmEdicao) h += htmlFormRemate(_remateEmEdicao);
    if (!lista.length && !_remateEmEdicao) {
        h += `<div style="font-size:13px;opacity:.7;margin-bottom:10px">Na vistoria final, regista aqui cada coisa por acertar, divisão a divisão, com foto. O cliente vê a lista e confirma o que ficou resolvido.</div>`;
    } else if (lista.length) {
        h += `<div style="font-size:12.5px;opacity:.75;margin-bottom:6px">${abertos.length} por resolver · ${lista.length - abertos.length} resolvido(s) · ${confirmados} confirmado(s) pelo cliente</div>`;
    }
    // Agrupados por divisão, os abertos primeiro
    const ord = [...lista].sort((a, b) => String(a.divisao || "").localeCompare(String(b.divisao || ""), "pt")
        || (a.estado === "aberto" ? 0 : 1) - (b.estado === "aberto" ? 0 : 1));
    let divAnt = null;
    h += ord.map(r => {
        const cab = r.divisao !== divAnt ? `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:.55;margin:10px 0 2px">${esc(r.divisao || "Sem divisão")}</div>` : "";
        divAnt = r.divisao;
        const quem = r.responsavel_funcionario_id ? (_entrega.funcs.find(f => f.id === r.responsavel_funcionario_id)?.nome || "funcionário") : (r.responsavel_externo || "");
        const atrasado = r.estado === "aberto" && r.prazo && r.prazo < hoje;
        return `${cab}<div style="padding:7px 0;border-top:1px solid rgba(255,255,255,.06);font-size:13px">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">
                <div style="flex:1;min-width:160px;white-space:pre-wrap">${r.estado === "resolvido" ? "✓ " : ""}${esc(r.descricao)}</div>
                ${r.estado === "aberto" ? selo(atrasado ? "Atrasado" : "Por resolver", atrasado ? "rgba(224,148,134,.25)" : "rgba(224,176,122,.22)")
                    : selo(r.cliente_confirmou_em ? "Confirmado pelo cliente" : "Resolvido", "rgba(143,191,160,.25)")}
            </div>
            <div style="font-size:12px;opacity:.65;margin-top:2px">${[quem ? "👷 " + esc(quem) : "", r.prazo ? "Prazo " + dataAnd(r.prazo) : "",
                r.resolvido_em ? "Resolvido " + dataAnd(r.resolvido_em) : "", r.visivel_cliente ? "" : "🔒 o cliente não vê"].filter(Boolean).join(" · ")}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center">
                ${r.foto_antes ? `<button class="btn-acao" title="Foto antes" onclick="abrirFotoRemate('${r.id}','antes')">📷 Antes</button>` : ""}
                ${r.foto_depois ? `<button class="btn-acao" title="Foto depois" onclick="abrirFotoRemate('${r.id}','depois')">📷 Depois</button>` : ""}
                ${r.estado === "aberto"
                    ? `<label class="btn-primary" style="padding:4px 10px;font-size:12px;cursor:pointer">✓ Resolvido (com foto)<input type="file" accept="image/*,.heic,.heif" hidden onchange="resolverRemate('${r.id}', this)"></label>
                       <button class="btn-secondary" style="padding:4px 10px;font-size:12px" onclick="resolverRemate('${r.id}', null)">✓ Sem foto</button>`
                    : `<button class="btn-secondary" style="padding:4px 10px;font-size:12px" onclick="reabrirRemate('${r.id}')">Reabrir</button>`}
                <button class="btn-acao" title="Editar" onclick="editarRemate('${r.id}')">✏️</button>
                <button class="btn-acao" title="Apagar" onclick="apagarRemate('${r.id}')">🗑</button>
            </div>
        </div>`;
    }).join("");
    // Auto de entrega
    const entrega = _entrega.entrega;
    h += `<div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <label style="font-size:12px">Data da entrega<input id="dataEntrega" type="date" value="${entrega || new Date().toISOString().slice(0, 10)}" style="width:auto"></label>
        <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="pdfAutoEntrega()">📄 Auto de entrega (PDF)</button>
        <div style="font-size:12px;opacity:.65;flex-basis:100%">${entrega ? `Obra entregue a ${dataAnd(entrega)}.` : "O PDF leva os remates, os trabalhos a mais aceites e as assinaturas. Ao gerar, fica guardada a data da entrega."}${abertos.length ? ` Atenção: ${abertos.length} remate(s) ainda por resolver vão no auto como pendentes.` : ""}</div>
    </div>`;
    return h;
}

function htmlFormRemate(r) {
    const divisoes = [...new Set(_entrega.remates.map(x => x.divisao).filter(Boolean))];
    const opts = _entrega.funcs.map(f => `<option value="${f.id}"${r.responsavel_funcionario_id === f.id ? " selected" : ""}>${esc(f.nome)}</option>`).join("");
    return `<div style="padding:10px;margin-bottom:10px;border-radius:8px;background:rgba(255,255,255,.04);font-size:13px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
            <label style="flex:1;min-width:130px;font-size:12px">Divisão<input id="remDiv" list="remDivs" maxlength="120" placeholder="Ex.: Cozinha, WC suite" value="${esc(r.divisao || "")}"></label>
            <datalist id="remDivs">${divisoes.map(d => `<option value="${esc(d)}">`).join("")}</datalist>
            <label style="width:140px;font-size:12px">Prazo<input id="remPrazo" type="date" value="${r.prazo || ""}"></label>
        </div>
        <label style="font-size:12px;opacity:.7;display:block;margin-top:6px">O que está por acertar</label>
        <textarea id="remDesc" rows="2" maxlength="2000" placeholder="Ex.: Retocar pintura junto ao interruptor">${esc(r.descricao || "")}</textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            <label style="flex:1;min-width:140px;font-size:12px">Quem resolve<select id="remFunc"><option value="">— Outro / subempreiteiro —</option>${opts}</select></label>
            <label style="flex:1;min-width:140px;font-size:12px">Se for outro, quem<input id="remExt" maxlength="120" value="${esc(r.responsavel_externo || "")}"></label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;align-items:center">
            <label class="btn-secondary" style="padding:4px 10px;font-size:12px;cursor:pointer" id="remFotoLbl">📷 ${r.foto_antes ? "Trocar foto (antes)" : "Foto (antes)"}<input id="remFoto" type="file" accept="image/*,.heic,.heif" hidden onchange="document.getElementById('remFotoLbl').firstChild.textContent='📷 ' + (this.files[0]?.name || 'Foto (antes)')"></label>
            <label style="font-size:12px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="remVis" style="width:auto"${r.visivel_cliente === false ? "" : " checked"}> O cliente vê</label>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <button class="btn-primary" style="padding:5px 14px;font-size:12px" id="btnGravarRemate" onclick="gravarRemate()">Gravar</button>
            <button class="btn-secondary" style="padding:5px 14px;font-size:12px" onclick="fecharFormRemate()">Cancelar</button>
        </div></div>`;
}

function novoRemate() {
    const ult = _entrega.remates[_entrega.remates.length - 1];
    _remateEmEdicao = { divisao: ult?.divisao || "", visivel_cliente: true };
    redesenharEntrega();
    document.getElementById("remDesc")?.focus();
}
function editarRemate(id) { const r = _entrega.remates.find(x => x.id === id); if (r) { _remateEmEdicao = { ...r }; redesenharEntrega(); } }
function fecharFormRemate() { _remateEmEdicao = null; redesenharEntrega(); }

async function carregarFotoRemate(ficheiro) {
    let f = ficheiro;
    try { f = await prepararFoto(ficheiro); } catch (e) { console.warn("prepararFoto:", e); }
    const caminho = `${_painelObraActual.id}/remates/${Date.now()}-${nomeSeguroFicheiro(f.name || "foto.jpg")}`;
    const { error } = await SB.storage.from(BUCKET_REMATES).upload(caminho, f, { contentType: f.type || "image/jpeg" });
    if (error) throw error;
    return caminho;
}

async function gravarRemate() {
    const descricao = document.getElementById("remDesc").value.trim();
    if (!descricao) return msgAndamento("Escreve o que está por acertar.", "err");
    const btn = document.getElementById("btnGravarRemate");
    btn.disabled = true;
    const r = _remateEmEdicao || {};
    const reg = {
        divisao: document.getElementById("remDiv").value.trim() || null,
        descricao,
        prazo: document.getElementById("remPrazo").value || null,
        responsavel_funcionario_id: document.getElementById("remFunc").value || null,
        responsavel_externo: document.getElementById("remFunc").value ? null : (document.getElementById("remExt").value.trim() || null),
        visivel_cliente: document.getElementById("remVis").checked,
    };
    try {
        const ficheiro = document.getElementById("remFoto").files[0];
        if (ficheiro) { msgAndamento("A carregar a foto…"); reg.foto_antes = await carregarFotoRemate(ficheiro); }
        const { error } = r.id
            ? await SB.from("obra_remates").update(reg).eq("id", r.id)
            : await SB.from("obra_remates").insert({ obra_id: _painelObraActual.id, ...reg });
        if (error) throw error;
        if (ficheiro && r.foto_antes) await SB.storage.from(BUCKET_REMATES).remove([r.foto_antes]);
    } catch (e) {
        btn.disabled = false;
        return msgAndamento("Não foi possível gravar o remate: " + (e.message || e), "err");
    }
    _remateEmEdicao = null;
    await carregarEntrega(_painelObraActual.id);
    redesenharEntrega();
    msgAndamento("Remate gravado.");
}

async function resolverRemate(id, input) {
    const ficheiro = input?.files?.[0] || null;
    const upd = { estado: "resolvido", resolvido_em: new Date().toISOString().slice(0, 10), cliente_confirmou_em: null };
    try {
        if (ficheiro) { msgAndamento("A carregar a foto…"); upd.foto_depois = await carregarFotoRemate(ficheiro); }
        const { error } = await SB.from("obra_remates").update(upd).eq("id", id);
        if (error) throw error;
    } catch (e) { return msgAndamento("Não foi possível gravar: " + (e.message || e), "err"); }
    await carregarEntrega(_painelObraActual.id);
    redesenharEntrega();
    msgAndamento("Resolvido. O cliente vai poder confirmar na Área do cliente.");
}

async function reabrirRemate(id) {
    const { error } = await SB.from("obra_remates").update({ estado: "aberto", resolvido_em: null, cliente_confirmou_em: null }).eq("id", id);
    if (error) return msgAndamento("Não foi possível reabrir: " + error.message, "err");
    await carregarEntrega(_painelObraActual.id);
    redesenharEntrega();
}

async function apagarRemate(id) {
    const r = _entrega.remates.find(x => x.id === id);
    if (!r || !confirm("Apagar este remate?")) return;
    const { error } = await SB.from("obra_remates").delete().eq("id", id);
    if (error) return msgAndamento("Não foi possível apagar: " + error.message, "err");
    const fotos = [r.foto_antes, r.foto_depois].filter(Boolean);
    if (fotos.length) await SB.storage.from(BUCKET_REMATES).remove(fotos);
    await carregarEntrega(_painelObraActual.id);
    redesenharEntrega();
}

async function abrirFotoRemate(id, qual) {
    const r = _entrega.remates.find(x => x.id === id);
    const caminho = qual === "antes" ? r?.foto_antes : r?.foto_depois;
    if (!caminho) return;
    const janela = window.open("", "_blank");
    const { data, error } = await SB.storage.from(BUCKET_REMATES).createSignedUrl(caminho, 600);
    if (error || !data?.signedUrl) { janela?.close(); return msgAndamento("Não foi possível abrir a foto.", "err"); }
    if (janela) janela.location = data.signedUrl; else location.href = data.signedUrl;
}

// ── Auto de entrega (PDF) ────────────────────────────────────
async function pdfAutoEntrega() {
    const data = document.getElementById("dataEntrega")?.value || new Date().toISOString().slice(0, 10);
    let jsPDF;
    try { ({ jsPDF } = await carregarJsPDF()); }
    catch (e) { return msgAndamento("Não foi possível preparar o PDF: " + e.message, "err"); }

    const obra = _painelObraActual, cli = _entrega.cliente;
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const W = pdf.internal.pageSize.getWidth(), M = 48, FIM = 780;
    let y = 60;
    const eur = v => Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";
    const linha = (txt, opts = {}) => {
        pdf.setFont("helvetica", opts.bold ? "bold" : "normal"); pdf.setFontSize(opts.size || 10);
        const l = pdf.splitTextToSize(txt, (opts.largura || W - 2 * M));
        if (y + l.length * 13 > FIM) { pdf.addPage(); y = 60; }
        pdf.text(l, opts.x || M, y); y += l.length * 13 + (opts.depois ?? 2);
    };

    const emp = dadosEmpresaDeclaracao();
    linha(`${emp.empresa} · NIF ${emp.nif}`, { size: 9, depois: 14 });
    linha("Auto de entrega da obra", { bold: true, size: 16, depois: 8 });
    linha(`Obra: ${obra.nome}${obra.local ? " · " + obra.local : ""}${obra.morada ? " · " + obra.morada : ""}`);
    if (cli?.nome) linha(`Dono de obra: ${cli.nome}`);
    linha(`Data da entrega: ${dataAnd(data)}`, { depois: 14 });
    linha(`Nesta data, ${emp.empresa} entrega ao dono de obra os trabalhos da obra acima identificada, que foram vistoriados por ambas as partes. ` +
          `Os remates abaixo marcados como pendentes ficam a cargo de ${emp.empresa}, nos prazos indicados.`, { depois: 14 });

    const rem = [..._entrega.remates].sort((a, b) => String(a.divisao || "").localeCompare(String(b.divisao || ""), "pt"));
    linha(`Remates da vistoria (${rem.length})`, { bold: true, size: 11, depois: 6 });
    if (!rem.length) linha("Sem remates registados.", { depois: 10 });
    rem.forEach(r => {
        const estado = r.estado === "aberto" ? `PENDENTE${r.prazo ? " · prazo " + dataAnd(r.prazo) : ""}`
            : `Resolvido${r.resolvido_em ? " a " + dataAnd(r.resolvido_em) : ""}${r.cliente_confirmou_em ? " · confirmado pelo cliente" : ""}`;
        linha(`• ${r.divisao ? r.divisao + ": " : ""}${r.descricao}`, { depois: 0 });
        linha(estado, { size: 9, x: M + 12, depois: 6 });
    });

    const aceites = _entrega.extras.filter(x => x.estado === "aceite");
    y += 6;
    linha(`Trabalhos a mais aceites (${aceites.length})`, { bold: true, size: 11, depois: 6 });
    if (!aceites.length) linha("Nenhum.", { depois: 10 });
    aceites.forEach(x => {
        linha(`• ${x.descricao}`, { depois: 0 });
        linha(`${eur(x.valor_sem_iva)} + IVA ${Number(x.taxa_iva)}% · aceite por ${x.resposta_nome || "cliente"} a ${dataHoraCurta(x.resposta_em)}`, { size: 9, x: M + 12, depois: 6 });
    });
    if (aceites.length) linha(`Total dos trabalhos a mais: ${eur(aceites.reduce((t, x) => t + Number(x.valor_sem_iva || 0), 0))} sem IVA`, { bold: true, depois: 10 });

    if (y + 120 > FIM) { pdf.addPage(); y = 60; }
    y += 50;
    const meio = W / 2;
    pdf.line(M, y, meio - 20, y); pdf.line(meio + 20, y, W - M, y);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    pdf.text(`Pelo empreiteiro (${emp.empresa})`, M, y + 14);
    pdf.text(`O dono de obra${cli?.nome ? " (" + cli.nome + ")" : ""}`, meio + 20, y + 14);

    pdf.save(`Auto de entrega - ${obra.nome}.pdf`.replace(/[\\/:*?"<>|]/g, "-"));

    if (_entrega.entrega !== data) {
        const { error } = await SB.from("obras").update({ data_entrega: data }).eq("id", obra.id);
        if (error) return msgAndamento("PDF feito, mas não foi possível guardar a data da entrega: " + error.message, "err");
        _entrega.entrega = data;
        redesenharEntrega();
    }
    msgAndamento("Auto de entrega gerado. Imprime, assinem os dois e carrega a cópia assinada nos Documentos da obra.");
}

// ── Precisa de ti: respostas dos clientes a trabalhos a mais ─────
async function vgExtrasRespondidos() {
    const { data, error } = await SB.from("trabalhos_mais")
        .select("id, obra_id, estado, resposta_nome, obras(nome)")
        .in("estado", ["aceite", "recusado"]).eq("resposta_por", "cliente").is("visto_em", null).order("resposta_em");
    if (error || !data?.length) return null;
    const ac = data.filter(x => x.estado === "aceite").length, rc = data.length - ac;
    const obras = [...new Set(data.map(x => x.obras?.nome).filter(Boolean))];
    return { icone: "💶", cor: "rgba(143,191,160,.22)",
             titulo: [ac ? `${ac} trabalho(s) a mais aceite(s)` : "", rc ? `${rc} recusado(s)` : ""].filter(Boolean).join(" e ") + " pelo cliente",
             sub: obras.join(", ") || "Ver no Andamento da obra",
             accao: { fn: "abrirExtrasRespondidos", arg: data[0].obra_id } };
}

async function abrirExtrasRespondidos(obraId) {
    await SB.from("trabalhos_mais").update({ visto_em: new Date().toISOString() })
        .eq("obra_id", obraId).in("estado", ["aceite", "recusado"]).is("visto_em", null);
    await reabrirObraLembrada(obraId, "andamento");
    if (typeof vgCarregarAlertas === "function") vgCarregarAlertas();
}
