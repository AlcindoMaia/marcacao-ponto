// =======================================================
// RECURSOS HUMANOS
// Ficha do trabalhador com separadores (Dados · Documentos · Férias e
// ausências · Obras), documentos com validade e semáforo, documentos da
// empresa, avisos no sino, ordenado mensal, avisos no Planeamento e o PDF
// do registo de trabalhadores da obra (DL 273/2003, art. 21.º).
//
// Tabelas: funcionarios (campos novos), registos_admin.motivo, rh_documentos.
// Ficheiros no bucket privado "rh-documentos": <funcionario_id>/… ou
// empresa/…. São dados pessoais: só administradores lhes chegam.
// Usa do admin.js: SB, esc, blobParaBase64, nomeSeguroFicheiro,
// dadosEmpresaDeclaracao, carregarJsPDF, _painelObraActual, SUPABASE_URL;
// do fotos.js: prepararFoto, ehHeic; do dados-publicos.js: feriados.
// =======================================================

const BUCKET_RH   = "rh-documentos";
const MAX_DOC_RH  = 20 * 1024 * 1024;   // limite do bucket
const MAX_LER_RH  = 8 * 1024 * 1024;    // limite da leitura pelo assistente
const DIAS_AVISO  = 30;                 // avisar quantos dias antes de caducar

// O que cada trabalhador tem de ter. "obrigatorio" entra no semáforo.
const TIPOS_DOC_RH = {
    identificacao: { icone: "🪪", nome: "Cartão de cidadão ou título de residência", obrigatorio: true,  validade: true  },
    contrato:      { icone: "📝", nome: "Contrato de trabalho assinado",             obrigatorio: true,  validade: false },
    admissao_ss:   { icone: "🏛", nome: "Comunicação de admissão à Segurança Social", obrigatorio: true, validade: false },
    medicina:      { icone: "🩺", nome: "Ficha de aptidão (medicina do trabalho)",   obrigatorio: true,  validade: true  },
    formacao_sst:  { icone: "🦺", nome: "Formação de acolhimento e segurança",       obrigatorio: true,  validade: false },
    epi:           { icone: "⛑", nome: "Registo de entrega de EPI",                 obrigatorio: true,  validade: false },
    formacao:      { icone: "🎓", nome: "Formação específica (andaimes, máquinas, altura…)", obrigatorio: false, validade: true },
    outro:         { icone: "📄", nome: "Outro documento",                           obrigatorio: false, validade: false },
};

// Os da empresa entram no registo de cada obra e os donos de obra pedem-nos.
const TIPOS_DOC_EMPRESA = {
    seguro_at:     { icone: "🛡", nome: "Apólice do seguro de acidentes de trabalho", obrigatorio: true,  validade: true, dica: "Na descrição, o n.º da apólice e a seguradora: vão para o registo de trabalhadores da obra." },
    seguro_recibo: { icone: "🧾", nome: "Recibo do seguro de acidentes (último pago)", obrigatorio: true, validade: true, dica: "Validade = até quando cobre." },
    sst:           { icone: "🩺", nome: "Contrato com serviço de SST e medicina do trabalho", obrigatorio: true, validade: true },
    alvara:        { icone: "🏗", nome: "Alvará ou certificado do IMPIC",             obrigatorio: true,  validade: true },
    nao_divida_at: { icone: "💶", nome: "Declaração de não dívida às Finanças",       obrigatorio: false, validade: true },
    nao_divida_ss: { icone: "🏛", nome: "Declaração de não dívida à Segurança Social", obrigatorio: false, validade: true },
    outro:         { icone: "📄", nome: "Outro documento",                           obrigatorio: false, validade: false },
};

const MOTIVOS_FALTA_RH = {
    ferias:        "🏖 Férias",
    baixa:         "🩺 Baixa médica",
    justificada:   "📄 Justificada",
    injustificada: "⛔ Injustificada",
    sem_motivo:    "❔ Sem motivo",
};

let _rhFunc = null;            // trabalhador aberto na ficha
let _rhLendo = false;

// ---------- datas ----------
const rhHoje = () => rhIso(new Date());
function rhIso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function rhData(iso) {
    if (!iso) return "—";
    const [a, m, d] = String(iso).slice(0, 10).split("-");
    return `${d}/${m}/${a}`;
}
function rhDiasAte(iso) {
    return Math.round((new Date(iso + "T12:00:00") - new Date(rhHoje() + "T12:00:00")) / 86400000);
}
function rhSomarAnos(iso, anos) {
    const d = new Date(iso + "T12:00:00");
    d.setFullYear(d.getFullYear() + anos);
    return rhIso(d);
}
function rhIdade(nascimento, emIso = rhHoje()) {
    if (!nascimento) return null;
    const [a, m, d] = nascimento.split("-").map(Number);
    const [A, M, D] = emIso.split("-").map(Number);
    return A - a - ((M < m || (M === m && D < d)) ? 1 : 0);
}

// Medicina do trabalho: exames de 2 em 2 anos; anuais para menores de 18 e
// maiores de 50 (Lei 102/2009, art. 108.º). Usado quando só há data do exame.
function rhValidadeMedicina(dataExame, nascimento) {
    if (!dataExame) return null;
    const idade = rhIdade(nascimento, dataExame);
    return rhSomarAnos(dataExame, idade != null && (idade < 18 || idade > 50) ? 1 : 2);
}

// ---------- estado de um tipo de documento ----------
// Devolve { cor: "verde"|"amarelo"|"vermelho"|"cinza", texto, doc }
function rhEstadoTipo(docs, tipo, def) {
    const deste = docs.filter(d => d.tipo === tipo);
    if (!deste.length) {
        return def.obrigatorio ? { cor: "vermelho", texto: "Em falta" } : { cor: "cinza", texto: "—" };
    }
    // O mais recente que vale: sem validade conta como "não caduca"
    const ordenados = [...deste].sort((a, b) => (b.validade || "9999") .localeCompare(a.validade || "9999"));
    const doc = ordenados[0];
    if (!doc.validade) return { cor: "verde", texto: "Entregue", doc };
    const dias = rhDiasAte(doc.validade);
    if (dias < 0)           return { cor: "vermelho", texto: `Caducou a ${rhData(doc.validade)}`, doc };
    if (dias <= DIAS_AVISO) return { cor: "amarelo",  texto: `Caduca a ${rhData(doc.validade)} (${dias} dia${dias === 1 ? "" : "s"})`, doc };
    return { cor: "verde", texto: `Válido até ${rhData(doc.validade)}`, doc };
}

const RH_ICONE = { verde: "🟢", amarelo: "🟡", vermelho: "🔴", cinza: "⚪" };
const RH_PESO  = { vermelho: 3, amarelo: 2, verde: 1, cinza: 0 };

// O contrato a termo também caduca: conta para o semáforo
function rhEstadoContrato(f) {
    if (!f.data_fim_contrato || f.data_saida) return null;
    const dias = rhDiasAte(f.data_fim_contrato);
    if (dias < 0)           return { cor: "vermelho", texto: `Contrato terminou a ${rhData(f.data_fim_contrato)}` };
    if (dias <= DIAS_AVISO) return { cor: "amarelo",  texto: `Contrato termina a ${rhData(f.data_fim_contrato)}` };
    return null;
}

// Problemas de um trabalhador (para semáforo e sino)
function rhProblemasFunc(f, docs) {
    const meus = docs.filter(d => d.funcionario_id === f.id);
    const prob = [];
    Object.entries(TIPOS_DOC_RH).forEach(([k, t]) => {
        const e = rhEstadoTipo(meus, k, t);
        if (e.cor === "vermelho" || e.cor === "amarelo") prob.push({ cor: e.cor, texto: `${t.nome}: ${e.texto.toLowerCase()}` });
    });
    // Formações específicas: cada uma tem a sua validade
    meus.filter(d => d.tipo === "formacao" && d.validade).forEach(d => {
        const dias = rhDiasAte(d.validade);
        if (dias < 0) prob.push({ cor: "vermelho", texto: `${d.descricao || "Formação"}: caducou a ${rhData(d.validade)}` });
        else if (dias <= DIAS_AVISO) prob.push({ cor: "amarelo", texto: `${d.descricao || "Formação"}: caduca a ${rhData(d.validade)}` });
    });
    const c = rhEstadoContrato(f);
    if (c) prob.push(c);
    return prob;
}

// ---------- semáforo na lista de funcionários ----------
async function rhSemaforos(funcs) {
    const { data: docs, error } = await SB.from("rh_documentos")
        .select("funcionario_id, tipo, descricao, validade").not("funcionario_id", "is", null);
    if (error) return {};
    const res = {};
    funcs.filter(f => f.ativo !== false).forEach(f => {
        const prob = rhProblemasFunc(f, docs || []);
        if (!prob.length) { res[f.id] = { icone: "🟢", dica: "Documentos em dia" }; return; }
        const pior = prob.reduce((p, x) => RH_PESO[x.cor] > RH_PESO[p] ? x.cor : p, "verde");
        res[f.id] = { icone: RH_ICONE[pior], dica: prob.map(p => p.texto).join("\n") };
    });
    return res;
}

// ---------- ficha: separadores ----------
function rhPrepararFicha(func) {
    _rhFunc = func?.id ? func : null;
    document.querySelectorAll("#fichaTabs .ficha-tab").forEach(b => {
        b.disabled = b.dataset.ficha !== "dados" && !_rhFunc;
        b.title = b.disabled ? "Grava primeiro o funcionário" : "";
        b.onclick = () => rhMostrarFichaTab(b.dataset.ficha);
    });
    rhMostrarFichaTab("dados");
}

function rhMostrarFichaTab(tab) {
    document.querySelectorAll("#fichaTabs .ficha-tab").forEach(b => b.classList.toggle("active", b.dataset.ficha === tab));
    document.querySelectorAll("#modalFuncionario .ficha-conteudo").forEach(c =>
        c.style.display = c.id === "fichaTab-" + tab ? "" : "none");
    if (tab === "documentos") rhCarregarDocsFunc();
    if (tab === "ausencias")  rhCarregarAusencias();
    if (tab === "obras")      rhCarregarObrasFunc();
}

// Os campos novos do separador Dados, para o guardarFuncionario()
function rhCamposFicha() {
    const v = id => (document.getElementById(id)?.value || "").trim() || null;
    const n = id => { const x = parseFloat(document.getElementById(id)?.value); return Number.isFinite(x) ? x : null; };
    return {
        niss:                v("funcNiss"),
        data_nascimento:     v("funcDataNascimento"),
        nacionalidade:       v("funcNacionalidade"),
        morada:              v("funcMorada"),
        data_admissao:       v("funcDataAdmissao"),
        data_fim_contrato:   v("funcDataFimContrato"),
        data_saida:          v("funcDataSaida"),
        salario_mensal:      n("funcSalarioMensal"),
        emergencia_nome:     v("funcEmergenciaNome"),
        emergencia_telefone: v("funcEmergenciaTel"),
    };
}

// ---------- documentos (trabalhador ou empresa) ----------
function rhMsg(alvo, texto, tipo = "ok") {
    const el = document.getElementById(`rhMsg-${alvo}`);
    if (!el) return;
    const cores = { ok: "#8fbfa0", warn: "#fb923c", err: "#e09486" };
    el.style.display = texto ? "block" : "none";
    el.style.color = cores[tipo] || cores.ok;
    el.textContent = texto || "";
}

async function rhCarregarDocsFunc() {
    const el = document.getElementById("fichaTab-documentos");
    if (!_rhFunc || !el) return;
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;
    const { data: docs, error } = await SB.from("rh_documentos").select("*")
        .eq("funcionario_id", _rhFunc.id).order("created_at", { ascending: false });
    if (error) {
        el.innerHTML = `<div style="color:#e09486;font-size:13px;padding:12px">Não foi possível ler os documentos: ${esc(error.message)}.<br>
            <span style="opacity:.7">Se ainda não correste o SQL rh.sql no Supabase, é isso que falta.</span></div>`;
        return;
    }
    el.innerHTML = rhHtmlPasta("func", TIPOS_DOC_RH, docs || [], rhEstadoContrato(_rhFunc));
}

async function carregarDocsEmpresa() {
    const el = document.getElementById("rhEmpresa");
    if (!el) return;
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;
    const { data: docs, error } = await SB.from("rh_documentos").select("*")
        .is("funcionario_id", null).order("created_at", { ascending: false });
    if (error) {
        el.innerHTML = `<div class="card" style="color:#e09486;font-size:13px">Não foi possível ler os documentos: ${esc(error.message)}.<br>
            <span style="opacity:.7">Se ainda não correste o SQL rh.sql no Supabase, é isso que falta.</span></div>`;
        return;
    }
    el.innerHTML = `
        <div style="font-size:12px;opacity:.65;margin-bottom:10px;line-height:1.5">
            Documentos da empresa que entram no registo de cada obra e que os donos de obra costumam pedir.
            O sino avisa ${DIAS_AVISO} dias antes de caducarem. Só os administradores os veem.
        </div>
        <div class="card">${rhHtmlPasta("empresa", TIPOS_DOC_EMPRESA, docs || [], null)}</div>`;
}

// A pasta: lista fixa com semáforo + formulário para carregar + todos os ficheiros
function rhHtmlPasta(alvo, tipos, docs, extra) {
    const linhasEstado = Object.entries(tipos).filter(([k]) => k !== "outro").map(([k, t]) => {
        const e = rhEstadoTipo(docs, k, t);
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid rgba(127,127,127,.12)">
            <span>${RH_ICONE[e.cor]}</span>
            <span style="flex:1;min-width:0;font-size:13px">${t.icone} ${esc(t.nome)}${t.obrigatorio ? "" : ' <span style="opacity:.45;font-size:11px">(se aplicável)</span>'}</span>
            <span style="font-size:12px;opacity:.75;white-space:nowrap">${esc(e.texto)}</span>
            <button class="btn-pequeno" onclick="rhEscolherTipo('${alvo}','${k}')" title="Carregar ${esc(t.nome)}">+</button>
        </div>`;
    }).join("");
    const linhaContrato = extra
        ? `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid rgba(127,127,127,.12)">
            <span>${RH_ICONE[extra.cor]}</span><span style="flex:1;font-size:13px">📅 ${esc(extra.texto)}</span>
            <span style="font-size:11px;opacity:.6">Altera em 👤 Dados</span></div>` : "";

    const opcoes = Object.entries(tipos).map(([k, t]) => `<option value="${k}">${t.icone} ${esc(t.nome)}</option>`).join("");

    const linhaDoc = d => {
        const t = tipos[d.tipo] || tipos.outro;
        const val = d.validade ? (rhDiasAte(d.validade) < 0
            ? `<span style="color:#e09486">caducou ${rhData(d.validade)}</span>`
            : `válido até ${rhData(d.validade)}`) : "sem validade";
        return `<div style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid rgba(127,127,127,.12);flex-wrap:wrap">
            <span style="font-size:18px">${t.icone}</span>
            <span style="flex:1;min-width:160px">
                ${d.caminho
                    ? `<a href="#" onclick="rhAbrirDoc('${d.id}');return false" style="color:inherit;font-weight:600;font-size:13px;word-break:break-all">${esc(d.descricao || t.nome)}</a>`
                    : `<span style="font-weight:600;font-size:13px">${esc(d.descricao || t.nome)}</span> <span style="font-size:11px;opacity:.5">(sem ficheiro)</span>`}
                <span style="display:block;font-size:11px;opacity:.55">${esc(t.nome)}${d.data_emissao ? " · emitido " + rhData(d.data_emissao) : ""} · ${val}</span>
            </span>
            <button class="btn-icone" onclick="rhEditarValidade('${alvo}','${d.id}','${d.validade || ""}')" title="Alterar validade">📅</button>
            <button class="btn-icone" onclick="rhApagarDoc('${alvo}','${d.id}')" title="Apagar">🗑</button>
        </div>`;
    };

    return `
        <div class="rh-secao" style="margin-top:4px">O que tem de estar em dia</div>
        ${linhasEstado}${linhaContrato}

        <div class="rh-secao">Carregar documento</div>
        <div class="form-row">
            <div class="form-group"><label>Tipo</label>
                <select id="rhTipo-${alvo}" onchange="rhDicaTipo('${alvo}')">${opcoes}</select></div>
        </div>
        <div id="rhDica-${alvo}" style="font-size:11px;opacity:.6;margin:-6px 0 6px;display:none"></div>
        <div class="form-row">
            <div class="form-group"><label>Descrição <span style="opacity:.5">(opcional)</span></label>
                <input id="rhDesc-${alvo}" placeholder="Ex.: Montagem de andaimes · Apólice n.º …"></div>
        </div>
        <div class="form-row">
            <div class="form-group input-sm"><label>Data do documento</label>
                <input id="rhEmissao-${alvo}" type="date" onchange="rhSugerirValidade('${alvo}')"></div>
            <div class="form-group input-sm"><label>Válido até <span style="opacity:.5">(vazio = não caduca)</span></label>
                <input id="rhValidade-${alvo}" type="date"></div>
        </div>
        <div class="barra-filtros" style="margin:0">
            <label class="btn-secondary" style="cursor:pointer;margin:0;text-transform:none;letter-spacing:0;font-size:12px;width:auto" id="rhEscolhido-${alvo}">📎 Escolher ficheiro
                <input type="file" id="rhFicheiro-${alvo}" accept="application/pdf,image/*,.heic,.heif" style="display:none"
                    onchange="document.getElementById('rhEscolhido-${alvo}').firstChild.textContent = this.files[0] ? '📎 ' + this.files[0].name + ' ' : '📎 Escolher ficheiro '"></label>
            <button class="btn-secondary" style="font-size:12px" onclick="rhLerDatas('${alvo}')" title="O assistente lê o tipo e as datas do ficheiro; confirmas antes de gravar">🤖 Ler datas</button>
            <button class="btn-primary" style="font-size:12px" id="rhGuardar-${alvo}" onclick="rhGuardarDoc('${alvo}')">Guardar</button>
        </div>
        <div id="rhMsg-${alvo}" style="display:none;font-size:12px;margin-top:8px"></div>

        <div class="rh-secao">Ficheiros guardados (${docs.length})</div>
        ${docs.length ? docs.map(linhaDoc).join("") : `<div style="padding:12px;text-align:center;opacity:.5;font-size:13px">Ainda não há documentos.</div>`}`;
}

function rhEscolherTipo(alvo, tipo) {
    const sel = document.getElementById(`rhTipo-${alvo}`);
    if (!sel) return;
    sel.value = tipo;
    rhDicaTipo(alvo);
    sel.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById(`rhEmissao-${alvo}`)?.focus();
}

function rhDicaTipo(alvo) {
    const tipos = alvo === "empresa" ? TIPOS_DOC_EMPRESA : TIPOS_DOC_RH;
    const t = tipos[document.getElementById(`rhTipo-${alvo}`)?.value];
    const el = document.getElementById(`rhDica-${alvo}`);
    if (!el) return;
    let dica = t?.dica || "";
    if (alvo === "func" && document.getElementById(`rhTipo-${alvo}`).value === "medicina")
        dica = "Basta a data do exame: a validade é calculada (2 anos; 1 ano abaixo dos 18 e acima dos 50).";
    el.style.display = dica ? "block" : "none";
    el.textContent = dica;
    rhSugerirValidade(alvo);
}

// Medicina do trabalho: propõe a validade a partir da data do exame
function rhSugerirValidade(alvo) {
    if (alvo !== "func") return;
    const tipo = document.getElementById("rhTipo-func")?.value;
    const em   = document.getElementById("rhEmissao-func")?.value;
    const val  = document.getElementById("rhValidade-func");
    if (tipo === "medicina" && em && val && !val.value)
        val.value = rhValidadeMedicina(em, _rhFunc?.data_nascimento) || "";
}

async function rhPrepararFicheiro(f) {
    if (f && (f.type?.startsWith("image/") || ehHeic(f))) return prepararFoto(f);
    return f;
}

// O assistente lê o ficheiro e preenche o formulário; nada é gravado aqui
async function rhLerDatas(alvo) {
    if (_rhLendo) return;
    const inp = document.getElementById(`rhFicheiro-${alvo}`);
    let f = inp?.files?.[0];
    if (!f) return rhMsg(alvo, "Escolhe primeiro o ficheiro.", "warn");
    _rhLendo = true;
    try {
        rhMsg(alvo, "🤖 O assistente está a ler o documento… demora alguns segundos.", "warn");
        f = await rhPrepararFicheiro(f);
        if (f.size > MAX_LER_RH) throw new Error("o assistente só lê ficheiros até 8 MB.");
        const { data: { session } } = await SB.auth.getSession();
        if (!session) throw new Error("Sessão expirada. Volta a entrar.");
        const r = await fetch(`${SUPABASE_URL}/functions/v1/ler-documento-rh`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
            body: JSON.stringify({
                ficheiro_base64: await blobParaBase64(f),
                tipo: f.type || "application/pdf",
                ambito: alvo === "empresa" ? "empresa" : "trabalhador",
                nome_esperado: alvo === "func" ? _rhFunc?.nome : null,
            }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
        const d = j.documento || {};
        const tipos = alvo === "empresa" ? TIPOS_DOC_EMPRESA : TIPOS_DOC_RH;
        if (d.tipo && tipos[d.tipo]) document.getElementById(`rhTipo-${alvo}`).value = d.tipo;
        if (d.descricao)    document.getElementById(`rhDesc-${alvo}`).value = d.descricao;
        if (d.data_emissao) document.getElementById(`rhEmissao-${alvo}`).value = d.data_emissao;
        document.getElementById(`rhValidade-${alvo}`).value = d.validade || "";
        rhDicaTipo(alvo);
        const avisos = (d.avisos || []).join(" ");
        rhMsg(alvo, "Lido. Confirma o tipo e as datas e carrega em Guardar." + (avisos ? " ⚠ " + avisos : ""), avisos ? "warn" : "ok");
    } catch (e) {
        console.error("rhLerDatas:", e);
        rhMsg(alvo, "Não foi possível ler: " + e.message + " Podes preencher as datas à mão.", "err");
    } finally {
        _rhLendo = false;
    }
}

async function rhGuardarDoc(alvo) {
    const funcId = alvo === "func" ? _rhFunc?.id : null;
    if (alvo === "func" && !funcId) return;
    const tipo     = document.getElementById(`rhTipo-${alvo}`).value;
    const descricao = document.getElementById(`rhDesc-${alvo}`).value.trim() || null;
    const emissao  = document.getElementById(`rhEmissao-${alvo}`).value || null;
    let validade   = document.getElementById(`rhValidade-${alvo}`).value || null;
    if (alvo === "func" && tipo === "medicina" && !validade) validade = rhValidadeMedicina(emissao, _rhFunc?.data_nascimento);
    let f = document.getElementById(`rhFicheiro-${alvo}`)?.files?.[0] || null;

    if (!f && !emissao && !validade && !descricao)
        return rhMsg(alvo, "Escolhe o ficheiro ou preenche pelo menos uma data.", "warn");
    if (validade && emissao && validade < emissao)
        return rhMsg(alvo, "A validade é anterior à data do documento.", "warn");

    const btn = document.getElementById(`rhGuardar-${alvo}`);
    btn.disabled = true;
    try {
        const linha = { funcionario_id: funcId, tipo, descricao, data_emissao: emissao, validade };
        if (f) {
            rhMsg(alvo, "A carregar o ficheiro…", "warn");
            f = await rhPrepararFicheiro(f);
            if (f.size > MAX_DOC_RH) throw new Error("o ficheiro tem mais de 20 MB.");
            const caminho = `${funcId || "empresa"}/${Date.now()}_${nomeSeguroFicheiro(f.name)}`;
            const up = await SB.storage.from(BUCKET_RH).upload(caminho, f, { contentType: f.type || undefined });
            if (up.error) throw new Error(up.error.message);
            Object.assign(linha, { caminho, nome_ficheiro: f.name, mime: f.type || null, tamanho: f.size });
        }
        const { data: { user } } = await SB.auth.getUser();
        linha.criado_por = user?.email || null;
        const { error } = await SB.from("rh_documentos").insert(linha);
        if (error) {
            if (linha.caminho) await SB.storage.from(BUCKET_RH).remove([linha.caminho]);
            throw new Error(error.message);
        }
        await rhRecarregar(alvo);
        rhMsg(alvo, "Guardado.", "ok");
        rhAtualizarFora();
    } catch (e) {
        console.error("rhGuardarDoc:", e);
        rhMsg(alvo, "Não foi possível guardar: " + e.message, "err");
    } finally {
        btn.disabled = false;
    }
}

async function rhRecarregar(alvo) {
    if (alvo === "empresa") await carregarDocsEmpresa();
    else await rhCarregarDocsFunc();
}

// Sino e semáforo da lista ficam a par do que mudou
function rhAtualizarFora() {
    if (typeof carregarNotificacoes === "function") carregarNotificacoes();
    if (typeof carregarFuncionarios === "function" && document.getElementById("tabelaFuncionarios")) carregarFuncionarios();
}

async function rhAbrirDoc(id) {
    const { data: doc } = await SB.from("rh_documentos").select("caminho").eq("id", id).single();
    if (!doc?.caminho) return;
    const { data, error } = await SB.storage.from(BUCKET_RH).createSignedUrl(doc.caminho, 600);
    if (error) { alert("Não foi possível abrir: " + error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
}

async function rhEditarValidade(alvo, id, atual) {
    const novo = prompt("Válido até (AAAA-MM-DD). Deixa vazio se não caduca:", atual || "");
    if (novo === null) return;
    const v = novo.trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { alert("Escreve a data como AAAA-MM-DD, ex.: 2027-03-15."); return; }
    const { error } = await SB.from("rh_documentos").update({ validade: v || null }).eq("id", id);
    if (error) { alert("Não foi possível gravar: " + error.message); return; }
    await rhRecarregar(alvo);
    rhAtualizarFora();
}

async function rhApagarDoc(alvo, id) {
    if (!confirm("Apagar este documento? O ficheiro também é apagado.")) return;
    const { data: doc } = await SB.from("rh_documentos").select("caminho").eq("id", id).single();
    const { error } = await SB.from("rh_documentos").delete().eq("id", id);
    if (error) { alert("Não foi possível apagar: " + error.message); return; }
    if (doc?.caminho) await SB.storage.from(BUCKET_RH).remove([doc.caminho]);
    await rhRecarregar(alvo);
    rhAtualizarFora();
}

// ---------- férias e ausências ----------
// Direito a férias no ano: 22 dias úteis (Código do Trabalho, art. 238.º).
// No ano de admissão: 2 dias úteis por mês completo de contrato, até 20
// (art. 239.º). Não conta dias transitados do ano anterior.
function rhDireitoFerias(f, ano) {
    if (!f.data_admissao) return { dias: 22, nota: "sem data de admissão: contei 22" };
    const [a, m, d] = f.data_admissao.split("-").map(Number);
    if (a > ano) return { dias: 0, nota: "admitido depois deste ano" };
    if (a < ano) return { dias: 22, nota: "" };
    // Meses completos entre a admissão e 31/12 (ou hoje, se ainda é este ano)
    const fim = ano === new Date().getFullYear() ? new Date() : new Date(ano, 11, 31);
    let meses = (fim.getFullYear() - a) * 12 + (fim.getMonth() + 1 - m) - (fim.getDate() < d ? 1 : 0);
    meses = Math.max(0, meses);
    return { dias: Math.min(20, meses * 2), nota: `ano de admissão: ${meses} mês(es) completo(s) × 2 dias` };
}

async function rhCarregarAusencias(ano = new Date().getFullYear()) {
    const el = document.getElementById("fichaTab-ausencias");
    if (!_rhFunc || !el) return;
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;
    const { data, error } = await SB.from("registos_admin").select("data, motivo")
        .eq("funcionario_id", _rhFunc.id).eq("tipo", "falta")
        .gte("data", `${ano}-01-01`).lte("data", `${ano}-12-31`).order("data");
    if (error) {
        el.innerHTML = `<div style="color:#e09486;font-size:13px;padding:12px">Não foi possível ler as faltas: ${esc(error.message)}</div>`;
        return;
    }
    const faltas = data || [];
    const porMotivo = {};
    faltas.forEach(r => (porMotivo[r.motivo || "sem_motivo"] ||= []).push(r.data));
    const direito = rhDireitoFerias(_rhFunc, ano);
    const gozados = (porMotivo.ferias || []).length;
    const restam  = direito.dias - gozados;

    const cartao = (titulo, valor, cor = "") => `<div class="card metric" style="margin:0"><h3>${titulo}</h3><div class="value" ${cor ? `style="color:${cor}"` : ""}>${valor}</div></div>`;
    const anoAtual = new Date().getFullYear();

    el.innerHTML = `
        <div class="barra-filtros" style="margin:4px 0 12px">
            <button class="btn-icone" onclick="rhCarregarAusencias(${ano - 1})" title="Ano anterior">‹</button>
            <strong style="font-size:14px">${ano}</strong>
            <button class="btn-icone" onclick="rhCarregarAusencias(${ano + 1})" title="Ano seguinte" ${ano >= anoAtual + 1 ? "disabled" : ""}>›</button>
        </div>
        <div class="grid-cards" style="margin-bottom:8px">
            ${cartao("Direito a férias", direito.dias + " dias")}
            ${cartao("Gozados", gozados + " dias")}
            ${cartao("Por gozar", restam + " dias", restam < 0 ? "#e09486" : "#8fbfa0")}
        </div>
        <div style="font-size:11px;opacity:.55;margin-bottom:12px">Dias úteis, contados a partir das faltas marcadas como 🏖 Férias no registo diário${direito.nota ? " · " + esc(direito.nota) : ""}.</div>
        ${porMotivo.sem_motivo?.length ? `<div style="font-size:12px;color:#fb923c;margin-bottom:10px">⚠ ${porMotivo.sem_motivo.length} falta(s) sem motivo. Marca o motivo no registo diário: decide se desconta no ordenado e se conta como férias.</div>` : ""}
        ${Object.entries(MOTIVOS_FALTA_RH).filter(([k]) => porMotivo[k]?.length).map(([k, nome]) => `
            <div class="rh-secao">${nome} · ${porMotivo[k].length} dia(s)</div>
            <div style="font-size:12px;opacity:.8;line-height:1.7">${porMotivo[k].map(rhData).join(" · ")}</div>`).join("")
          || `<div style="padding:12px;text-align:center;opacity:.5;font-size:13px">Sem faltas registadas em ${ano}.</div>`}
        <div style="font-size:11px;opacity:.5;margin-top:14px">As férias e faltas marcam-se no Registo diário: botão ✕ Falta e depois o motivo.</div>`;
}

// ---------- obras onde trabalhou ----------
async function rhCarregarObrasFunc() {
    const el = document.getElementById("fichaTab-obras");
    if (!_rhFunc || !el) return;
    el.innerHTML = `<div style="padding:24px;text-align:center;opacity:.5">A carregar...</div>`;
    const { data, error } = await SB.from("registos_admin").select("data, horas, obra_id, obras(nome, codigo)")
        .eq("funcionario_id", _rhFunc.id).neq("tipo", "falta").not("obra_id", "is", null)
        .order("data").limit(5000);
    if (error) {
        el.innerHTML = `<div style="color:#e09486;font-size:13px;padding:12px">Não foi possível ler os registos: ${esc(error.message)}</div>`;
        return;
    }
    const porObra = {};
    (data || []).forEach(r => {
        const o = porObra[r.obra_id] ||= { nome: r.obras?.nome || "—", codigo: r.obras?.codigo || "", dias: new Set(), horas: 0, primeiro: r.data, ultimo: r.data };
        o.dias.add(r.data); o.horas += Number(r.horas) || 0;
        if (r.data < o.primeiro) o.primeiro = r.data;
        if (r.data > o.ultimo)   o.ultimo = r.data;
    });
    const lista = Object.values(porObra).sort((a, b) => b.ultimo.localeCompare(a.ultimo));
    el.innerHTML = lista.length ? `
        <table style="width:100%;font-size:13px">
            <thead><tr><th style="text-align:left">Obra</th><th>Dias</th><th>Horas</th><th>De</th><th>Até</th></tr></thead>
            <tbody>${lista.map(o => `<tr>
                <td>${esc(o.codigo ? o.codigo + " · " : "")}${esc(o.nome)}</td>
                <td style="text-align:center">${o.dias.size}</td>
                <td style="text-align:center">${o.horas.toFixed(1)}h</td>
                <td style="text-align:center">${rhData(o.primeiro)}</td>
                <td style="text-align:center">${rhData(o.ultimo)}</td></tr>`).join("")}</tbody>
        </table>
        <div style="font-size:11px;opacity:.5;margin-top:10px">Do registo diário. O PDF do registo de trabalhadores de cada obra está na obra › Documentos.</div>`
        : `<div style="padding:16px;text-align:center;opacity:.5;font-size:13px">Ainda não há dias registados em obras.</div>`;
}

// ---------- ordenados ----------
// Com salário mensal: o salário, menos as faltas que não são pagas pelo
// empregador (injustificadas e baixa, que é paga pela Segurança Social).
// Valor de um dia = salário × 12 / (52 × 5) (Código do Trabalho, art. 271.º,
// semana de 5 dias). Sem salário mensal: dias trabalhados × valor por dia.
function rhValorOrdenado(f, dias, faltas = {}) {
    if (!f.salario_mensal) {
        return { valor: f.valor_dia ? dias * f.valor_dia : 0, nota: f.valor_dia ? "" : "sem valor por dia" };
    }
    const sal = Number(f.salario_mensal);
    const dia = sal * 12 / (52 * 5);
    const inj = faltas.injustificada || 0, bx = faltas.baixa || 0, sm = faltas.sem_motivo || 0;
    const valor = Math.max(0, sal - (inj + bx) * dia);
    const notas = ["salário mensal"];
    if (inj) notas.push(`−${inj} falta(s) injustificada(s)`);
    if (bx)  notas.push(`−${bx} dia(s) de baixa (paga pela Seg. Social)`);
    if (faltas.ferias) notas.push(`${faltas.ferias} dia(s) de férias`);
    if (sm)  notas.push(`⚠ ${sm} falta(s) sem motivo, não descontadas`);
    return { valor, nota: notas.join(" · ") };
}

// ---------- sino ----------
async function rhAlertas() {
    const hoje = new Date();
    const segAtual = new Date(hoje); segAtual.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    const segAnt = new Date(segAtual); segAnt.setDate(segAtual.getDate() - 7);
    const domAtual = new Date(segAtual); domAtual.setDate(segAtual.getDate() + 6);
    const ha30 = new Date(hoje); ha30.setDate(hoje.getDate() - 30);

    const [funcsRes, docsRes, regsRes] = await Promise.all([
        SB.from("funcionarios").select("id, nome, ativo, tipo_contrato, data_fim_contrato, data_saida").eq("ativo", true),
        SB.from("rh_documentos").select("funcionario_id, tipo, descricao, validade"),
        SB.from("registos_admin").select("data, funcionario_id, tipo, motivo")
            .gte("data", rhIso(segAnt < ha30 ? segAnt : ha30)).lte("data", rhIso(domAtual)),
    ]);
    if (docsRes.error) return { total: 0, html: "" };   // SQL ainda não corrido
    const funcs = funcsRes.data || [], docs = docsRes.data || [], regs = regsRes.data || [];

    const cab = (t) => `<div style="padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.08);font-size:11px;font-weight:700;letter-spacing:.05em;opacity:.5;text-transform:uppercase">${t}</div>`;
    const item = (titulo, sub, cor, onclick) => `<div style="padding:10px 16px;border-bottom:1px solid rgba(0,0,0,.06);cursor:pointer" onclick="${onclick}">
        <div style="font-size:13px;font-weight:500;color:var(--text-dark)">${titulo}</div>
        <div style="font-size:11px;color:${cor};margin-top:2px;white-space:pre-line">${sub}</div></div>`;

    let total = 0, html = "";

    // 1. Documentos: um aviso por trabalhador com problemas, mais os da empresa
    const linhasDocs = [];
    funcs.forEach(f => {
        const prob = rhProblemasFunc(f, docs);
        if (!prob.length) return;
        const vermelhos = prob.filter(p => p.cor === "vermelho").length;
        linhasDocs.push(item(`${vermelhos ? "🔴" : "🟡"} ${esc(f.nome)}`, esc(prob.map(p => p.texto).slice(0, 4).join("\n") + (prob.length > 4 ? `\n… e mais ${prob.length - 4}` : "")),
            vermelhos ? "#e05c5c" : "#f97316", "abrirTab('funcionarios')"));
    });
    const docsEmp = docs.filter(d => !d.funcionario_id);
    Object.entries(TIPOS_DOC_EMPRESA).forEach(([k, t]) => {
        if (k === "outro") return;
        const e = rhEstadoTipo(docsEmp, k, t);
        if (e.cor === "vermelho" || e.cor === "amarelo")
            linhasDocs.push(item(`${RH_ICONE[e.cor]} Empresa: ${esc(t.nome)}`, esc(e.texto), e.cor === "vermelho" ? "#e05c5c" : "#f97316", "abrirTab('funcionarios','empresa')"));
    });
    if (linhasDocs.length) { total += linhasDocs.length; html += cab(`🗂 ${linhasDocs.length} Documento(s) de RH por tratar`) + linhasDocs.join(""); }

    // 2. Dias úteis da semana passada sem nenhum registo diário (prova legal das horas)
    if (typeof carregarFeriados === "function") await carregarFeriados(segAnt.getFullYear()).catch(() => {});
    const comRegisto = new Set(regs.map(r => r.data));
    const semReg = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date(segAnt); d.setDate(segAnt.getDate() + i);
        const iso = rhIso(d);
        const fer = typeof feriadoEm === "function" ? feriadoEm(iso) : null;
        if (!fer && !comRegisto.has(iso)) semReg.push(d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric" }));
    }
    if (semReg.length && funcs.length) {
        total += 1;
        html += cab("📋 Registo diário da semana passada") +
            item(`${semReg.length} dia(s) útil(eis) sem registo`, esc(semReg.join(" · ") + "\nÉ a prova das horas (Código do Trabalho, art. 202.º)."), "#f97316", "abrirTab('funcionarios','registos')");
    }

    // 3. Ausências marcadas para esta semana
    const nomes = Object.fromEntries(funcs.map(f => [f.id, f.nome]));
    const ausentes = {};
    regs.filter(r => r.tipo === "falta" && r.data >= rhIso(segAtual) && r.data <= rhIso(domAtual) && nomes[r.funcionario_id])
        .forEach(r => (ausentes[r.funcionario_id] ||= []).push(r));
    const idsAus = Object.keys(ausentes);
    if (idsAus.length) {
        total += idsAus.length;
        html += cab(`🏖 ${idsAus.length} Ausente(s) esta semana`) + idsAus.map(id => {
            const rs = ausentes[id];
            const mot = [...new Set(rs.map(r => (MOTIVOS_FALTA_RH[r.motivo || "sem_motivo"] || "").replace(/^\S+\s/, "")))].join(", ");
            return item(esc(nomes[id]), esc(`${mot}: ${rs.map(r => rhData(r.data).slice(0, 5)).join(", ")}`), "#5b8fd6", "abrirTab('planeamento')");
        }).join("");
    }

    // 4. Faltas sem motivo nos últimos 30 dias
    const semMotivo = regs.filter(r => r.tipo === "falta" && !r.motivo && r.data >= rhIso(ha30) && r.data <= rhIso(hoje));
    if (semMotivo.length) {
        total += 1;
        html += item(`❔ ${semMotivo.length} falta(s) sem motivo (30 dias)`, "Marca o motivo no registo diário: decide o ordenado e as férias.", "#f97316", "abrirTab('funcionarios','registos')");
    }

    return { total, html };
}

// ---------- planeamento: avisos ao atribuir pessoas ----------
async function rhAvisosTarefa(ids, dataIso) {
    if (!ids?.length) return [];
    const [funcsRes, docsRes, faltasRes] = await Promise.all([
        SB.from("funcionarios").select("id, nome, data_fim_contrato, data_saida").in("id", ids),
        SB.from("rh_documentos").select("funcionario_id, tipo, validade").in("funcionario_id", ids).eq("tipo", "medicina"),
        dataIso ? SB.from("registos_admin").select("funcionario_id, motivo").in("funcionario_id", ids).eq("tipo", "falta").eq("data", dataIso)
                : Promise.resolve({ data: [] }),
    ]);
    if (docsRes.error) return [];
    const avisos = [];
    (funcsRes.data || []).forEach(f => {
        const falta = (faltasRes.data || []).find(r => r.funcionario_id === f.id);
        if (falta) avisos.push(`${f.nome} está ausente nesse dia (${(MOTIVOS_FALTA_RH[falta.motivo || "sem_motivo"] || "").replace(/^\S+\s/, "").toLowerCase()}).`);
        const med = rhEstadoTipo((docsRes.data || []).filter(d => d.funcionario_id === f.id), "medicina", TIPOS_DOC_RH.medicina);
        if (med.cor === "vermelho") avisos.push(`${f.nome}: ficha da medicina do trabalho ${med.texto.toLowerCase()}.`);
        if (f.data_saida && dataIso && dataIso > f.data_saida) avisos.push(`${f.nome} saiu da empresa a ${rhData(f.data_saida)}.`);
        else if (f.data_fim_contrato && dataIso && dataIso > f.data_fim_contrato) avisos.push(`${f.nome}: o contrato termina a ${rhData(f.data_fim_contrato)}.`);
    });
    return avisos;
}

// ---------- PDF: registo de trabalhadores da obra (DL 273/2003, art. 21.º) ----------
async function pdfRegistoTrabalhadoresObra() {
    const obra = _painelObraActual;
    if (!obra) return;
    let jsPDF;
    try { ({ jsPDF } = await carregarJsPDF()); }
    catch (e) { alert("Não foi possível preparar o PDF: " + e.message); return; }

    const [regsRes, docsRes] = await Promise.all([
        SB.from("registos_admin").select("data, funcionario_id, observacoes, funcionarios(nome, nif, niss, morada, categoria, data_nascimento)")
            .eq("obra_id", obra.id).neq("tipo", "falta").order("data").limit(10000),
        SB.from("rh_documentos").select("tipo, descricao, validade, data_emissao").is("funcionario_id", null).eq("tipo", "seguro_at"),
    ]);
    if (regsRes.error) { alert("Não foi possível ler o registo diário: " + regsRes.error.message); return; }

    const porFunc = {};
    let semFicha = 0;
    (regsRes.data || []).forEach(r => {
        if (!r.funcionario_id) { semFicha++; return; }
        const p = porFunc[r.funcionario_id] ||= { f: r.funcionarios || {}, dias: new Set(), inicio: r.data, fim: r.data };
        p.dias.add(r.data);
        if (r.data < p.inicio) p.inicio = r.data;
        if (r.data > p.fim)    p.fim = r.data;
    });
    const linhas = Object.values(porFunc).sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (!linhas.length) { alert("Ainda não há dias registados nesta obra no registo diário."); return; }

    const seguro = (docsRes.data || []).sort((a, b) => (b.validade || "").localeCompare(a.validade || ""))[0];
    const emp = dadosEmpresaDeclaracao();
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 36;
    let y = 46;

    pdf.setFont("helvetica", "bold"); pdf.setFontSize(15);
    pdf.text("Registo de trabalhadores no estaleiro", M, y); y += 16;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    pdf.text("Decreto-Lei n.º 273/2003, artigo 21.º, n.º 2", M, y); y += 20;
    pdf.setFontSize(10);
    pdf.text(`Empregador: ${emp.empresa} · NIF ${emp.nif}`, M, y); y += 14;
    pdf.text(`Obra: ${obra.codigo ? obra.codigo + " · " : ""}${obra.nome}${obra.morada ? " · " + obra.morada : obra.local ? " · " + obra.local : ""}`, M, y); y += 14;
    pdf.text(seguro
        ? `Seguro de acidentes de trabalho: ${seguro.descricao || "apólice em arquivo"}${seguro.validade ? " · válido até " + rhData(seguro.validade) : ""}`
        : "Seguro de acidentes de trabalho: (apólice não registada em Funcionários › Documentos da empresa)", M, y); y += 22;

    const cols = [
        { t: "Nome",            x: M,       w: 150 },
        { t: "NIF",             x: M + 150, w: 62 },
        { t: "N.º Seg. Social", x: M + 212, w: 72 },
        { t: "Categoria",       x: M + 284, w: 80 },
        { t: "Residência",      x: M + 364, w: 230 },
        { t: "Início",          x: M + 594, w: 58 },
        { t: "Fim",             x: M + 652, w: 58 },
        { t: "Dias",            x: M + 710, w: 30 },
    ];
    const cabecalho = () => {
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5);
        cols.forEach(c => pdf.text(c.t, c.x, y));
        y += 5; pdf.line(M, y, W - M, y); y += 12;
        pdf.setFont("helvetica", "normal");
    };
    cabecalho();
    const emFalta = [];
    linhas.forEach(p => {
        const f = p.f;
        ["nif", "niss", "morada", "categoria"].forEach(k => { if (!f[k]) emFalta.push(`${f.nome}: ${k === "niss" ? "n.º Seg. Social" : k}`); });
        const vals = [f.nome || "—", f.nif || "—", f.niss || "—", f.categoria || "—", f.morada || "—", rhData(p.inicio), rhData(p.fim), String(p.dias.size)];
        const partidos = vals.map((v, i) => pdf.splitTextToSize(String(v), cols[i].w - 6));
        const alt = Math.max(...partidos.map(x => x.length)) * 10;
        if (y + alt > H - 60) { pdf.addPage(); y = 46; cabecalho(); }
        partidos.forEach((txt, i) => pdf.text(txt, cols[i].x, y));
        y += alt + 6;
    });
    pdf.line(M, y - 2, W - M, y - 2); y += 14;
    pdf.setFontSize(8);
    const notas = [
        `Início e fim: primeiro e último dia registados nesta obra no registo diário, até ${rhData(rhHoje())}.`,
        semFicha ? `${semFicha} registo(s) de trabalhadores temporários sem ficha não entram nesta lista.` : "",
        emFalta.length ? `Dados em falta na ficha: ${emFalta.join("; ")}.` : "",
        "Os recibos do seguro de acidentes de trabalho estão em arquivo na empresa. Conservar este registo até 1 ano após o fim dos trabalhos (art. 21.º, n.º 4).",
    ].filter(Boolean);
    notas.forEach(n => {
        const t = pdf.splitTextToSize(n, W - 2 * M);
        if (y + t.length * 10 > H - 30) { pdf.addPage(); y = 46; }
        pdf.text(t, M, y); y += t.length * 10 + 2;
    });
    pdf.save(`Registo de trabalhadores - ${(obra.codigo || "").replace("/", "-")} ${obra.nome}.pdf`);
}
