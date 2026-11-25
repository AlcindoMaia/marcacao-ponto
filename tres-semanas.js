// =======================================================
// PLANEAMENTO › 3 SEMANAS: "ESTÁ TUDO PRONTO?" (estudo DDC, 2026-11-17)
// As tarefas dos próximos 21 dias, semana a semana, com três verificações:
//   📦 material       marcado à mão (por ver / falta / pronto / não precisa)
//   🙋 cliente        decisão do cliente, marcada à mão (idem)
//   👷 equipa         calculada: tem gente atribuída, ninguém de folga
//                     (falta registada nesse dia) e ninguém inativo
// Uma tarefa com alguma coisa em falta fica a vermelho; com algo por ver, a
// amarelo; tudo tratado, a verde. Tocar no texto abre a tarefa.
// Precisa do planear.sql (colunas material_estado e decisao_estado). Usa do
// planeamento.js: _planFuncs, planNomeFunc, planDataStr, abrirModalTarefa.
// =======================================================

let _tresSem = { aberto: false, tarefas: [], faltas: new Set(), semSQL: false };
const TS_DIAS = 21;
const TS_ESTADOS = ["por_ver", "pronto", "falta", "nao_precisa"];   // ordem do toque
const TS_TXT = { por_ver: "por ver", pronto: "pronto", falta: "falta", nao_precisa: "não precisa" };
const TS_COR = { por_ver: "rgba(224,176,122,.25)", pronto: "rgba(143,191,160,.28)", falta: "rgba(224,148,134,.32)", nao_precisa: "rgba(143,191,160,.14)" };

async function alternarTresSemanas() {
    _tresSem.aberto = !_tresSem.aberto;
    const el = document.getElementById("planTresSemanas");
    const btn = document.getElementById("btnTresSemanas");
    if (btn) btn.classList.toggle("ativo", _tresSem.aberto);
    if (!el) return;
    el.style.display = _tresSem.aberto ? "" : "none";
    if (_tresSem.aberto) await carregarTresSemanas();
}

async function carregarTresSemanas() {
    const el = document.getElementById("planTresSemanas");
    if (!el) return;
    el.innerHTML = `<div style="padding:16px;opacity:.6">A ver as próximas 3 semanas…</div>`;
    const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
    const de = planDataStr(hoje);
    const fim = new Date(hoje); fim.setDate(fim.getDate() + TS_DIAS - 1);
    const ate = planDataStr(fim);
    const [t, f] = await Promise.all([
        SB.from("tarefas")
            .select("id, descricao, data_prevista, hora_inicio, estado, material_estado, decisao_estado, obras(nome, codigo), tarefa_funcionarios(funcionario_id, responsavel)")
            .gte("data_prevista", de).lte("data_prevista", ate).in("estado", ["planeada", "em_curso"])
            .order("data_prevista").order("ordem").order("hora_inicio", { nullsFirst: true }),
        SB.from("registos_admin").select("funcionario_id, data").eq("tipo", "falta").gte("data", de).lte("data", ate),
    ]);
    if (t.error) {
        _tresSem.semSQL = /material_estado|decisao_estado/.test(t.error.message || "");
        el.innerHTML = `<div style="padding:16px;font-size:13px">${_tresSem.semSQL
            ? "Falta correr o ficheiro <code>planear.sql</code> no SQL Editor do Supabase."
            : "Não foi possível carregar: " + esc(t.error.message)}</div>`;
        return;
    }
    _tresSem.tarefas = t.data || [];
    _tresSem.faltas = new Set((f.data || []).map(x => x.funcionario_id + "|" + x.data));
    desenharTresSemanas();
}

// Equipa: { ok, txt }
function tsEquipa(t) {
    const fs = t.tarefa_funcionarios || [];
    if (!fs.length) return { ok: false, txt: "sem ninguém" };
    const folga = fs.filter(x => _tresSem.faltas.has(x.funcionario_id + "|" + t.data_prevista)).map(x => planNomeFunc(x.funcionario_id));
    const inativos = fs.filter(x => _planFuncs.find(p => p.id === x.funcionario_id)?.ativo === false).map(x => planNomeFunc(x.funcionario_id));
    if (folga.length) return { ok: false, txt: "de folga: " + folga.join(", ") };
    if (inativos.length) return { ok: false, txt: "inativo: " + inativos.join(", ") };
    return { ok: true, txt: fs.map(x => planNomeFunc(x.funcionario_id).split(" ")[0]).join(", ") };
}

function tsEstadoTarefa(t) {
    const eq = tsEquipa(t);
    if (!eq.ok || t.material_estado === "falta" || t.decisao_estado === "falta") return "falta";
    if (t.material_estado === "por_ver" || t.decisao_estado === "por_ver") return "por_ver";
    return "pronto";
}

function desenharTresSemanas() {
    const el = document.getElementById("planTresSemanas");
    if (!el) return;
    const lista = _tresSem.tarefas;
    const n = { falta: 0, por_ver: 0, pronto: 0 };
    lista.forEach(t => n[tsEstadoTarefa(t)]++);
    const cab = `<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline;margin-bottom:8px">
        <div style="font-family:var(--font-title,sans-serif);font-size:12px;opacity:.65">Próximas 3 semanas · está tudo pronto?</div>
        <div style="font-size:13px">${lista.length ? `<b style="color:#8fbfa0">${n.pronto} prontas</b> · <b style="color:#e0b07a">${n.por_ver} por ver</b> · <b style="color:#e09486">${n.falta} com falhas</b>` : ""}</div>
    </div>
    <div style="font-size:12px;opacity:.65;margin-bottom:8px">Toca em 📦 material ou 🙋 cliente para mudar (por ver → pronto → falta → não precisa). A 👷 equipa vem das pessoas atribuídas e das faltas registadas.</div>`;
    if (!lista.length) {
        el.innerHTML = cab + `<div style="font-size:13px;opacity:.75">Não há tarefas planeadas para os próximos 21 dias. Põe-nas no quadro (ou pede um plano ao assistente) e voltam aqui.</div>`;
        return;
    }
    // Agrupadas por semana (segunda-feira)
    const semanas = {};
    lista.forEach(t => {
        const d = new Date(t.data_prevista + "T12:00:00");
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        (semanas[planDataStr(d)] ??= []).push(t);
    });
    const chip = (t, campo, icone, titulo) => {
        const v = t[campo] || "por_ver";
        return `<button type="button" class="ts-chip" style="background:${TS_COR[v]}" title="${titulo}: ${TS_TXT[v]}"
                    onclick="tsMudar('${t.id}','${campo}')">${icone} ${TS_TXT[v]}</button>`;
    };
    el.innerHTML = cab + Object.entries(semanas).map(([seg, ts]) => {
        const s = new Date(seg + "T12:00:00");
        return `<div class="ts-semana">Semana de ${s.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })}</div>` + ts.map(t => {
            const est = tsEstadoTarefa(t), eq = tsEquipa(t);
            const dia = new Date(t.data_prevista + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" });
            return `<div class="ts-linha ts-${est}">
                <div class="ts-txt" onclick="abrirModalTarefa('${t.id}')" title="Abrir a tarefa">
                    <b>${esc(dia)}</b>${t.hora_inicio ? " " + t.hora_inicio.slice(0, 5) : ""} · ${esc(t.descricao)}
                    <span style="opacity:.6"> · ${esc(t.obras ? (t.obras.codigo || t.obras.nome) : "Sem obra")}</span>
                </div>
                <div class="ts-chips">
                    ${chip(t, "material_estado", "📦", "Material")}
                    <span class="ts-chip" style="background:${eq.ok ? TS_COR.pronto : TS_COR.falta};cursor:default" title="Equipa">👷 ${esc(eq.txt)}</span>
                    ${chip(t, "decisao_estado", "🙋", "Decisão do cliente")}
                </div>
            </div>`;
        }).join("");
    }).join("");
}

async function tsMudar(id, campo) {
    const t = _tresSem.tarefas.find(x => x.id === id);
    if (!t) return;
    const antes = t[campo] || "por_ver";
    const depois = TS_ESTADOS[(TS_ESTADOS.indexOf(antes) + 1) % TS_ESTADOS.length];
    t[campo] = depois;
    desenharTresSemanas();
    const { error } = await SB.from("tarefas").update({ [campo]: depois }).eq("id", id);
    if (error) { t[campo] = antes; desenharTresSemanas(); alert("Não foi possível gravar: " + error.message); }
}
