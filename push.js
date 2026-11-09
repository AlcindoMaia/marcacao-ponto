// =======================================================
// AVISOS NO TELEMÓVEL — ativar, escolher os tipos e testar.
// O envio é feito pela função "avisos" do Supabase (ver avisos_push.sql).
//
// iPhone: só funciona com a app adicionada ao ecrã principal
// (Safari › Partilhar › Adicionar ao ecrã principal) e aberta por esse
// ícone. Android/computador: funciona no Chrome/Edge com a página normal.
// =======================================================

const AVISOS_TIPOS = [
    ["clientes", "Clientes", "Quando um cliente responde a um orçamento ou faz um pedido. Na hora."],
    ["resumo",   "Precisa de ti", "Resumo às 8h do que está à tua espera (só se houver)."],
    ["registo",  "Registo diário", "Às 19h, se ainda não houver Registo diário do dia (seg a sáb)."],
    ["ponto",    "Saída esquecida", "Às 19h, quem marcou entrada e não marcou saída."],
    ["rh",       "Documentos de RH", "Segunda às 8h, documentos caducados ou a caducar em 30 dias."],
];

// O service worker é registado em todas as visitas: é ele que recebe os
// avisos e é ele que permite instalar a app no telemóvel.
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(e => console.warn("service worker", e));
    });
}

const avisosIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const avisosInstalada = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const avisosSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function avisosChaveBytes(b64) {
    const pad = "=".repeat((4 - b64.length % 4) % 4);
    const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function avisosSubAtual() {
    if (!avisosSuportado()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
}

async function abrirAvisosTelemovel() {
    document.getElementById("modalLista")?.remove();
    const painel = document.getElementById("notifPainel");
    if (painel) painel.style.display = "none";
    const m = document.createElement("div");
    m.id = "modalLista";
    m.innerHTML = `<div class="card lista-caixa" role="dialog" aria-label="Avisos no telemóvel">
        <div class="lista-topo">
            <h3>📲 Avisos no telemóvel</h3>
            <button type="button" class="btn-secondary" style="padding:2px 10px" onclick="fecharListaRapida()" aria-label="Fechar">×</button>
        </div>
        <div id="avisosCorpo"><div style="opacity:.6;font-size:13px;padding:10px 0">A ver…</div></div>
    </div>`;
    m.onclick = e => { if (e.target === m) fecharListaRapida(); };
    document.body.appendChild(m);
    await avisosDesenhar();
}

async function avisosDesenhar(msg = "") {
    const c = document.getElementById("avisosCorpo");
    if (!c) return;
    const nota = msg ? `<div class="lista-sub" style="opacity:.9;margin:8px 0">${esc(msg)}</div>` : "";

    if (avisosIOS() && !avisosInstalada()) {
        c.innerHTML = `<div class="lista-sub" style="opacity:.85">No iPhone, os avisos só funcionam com a app no ecrã principal:</div>
            <ol style="font-size:13.5px;line-height:1.6;padding-left:20px;margin:6px 0 10px">
                <li>Nesta página, toca em <b>Partilhar</b> (o quadrado com a seta para cima).</li>
                <li>Escolhe <b>Adicionar ao ecrã principal</b>.</li>
                <li>Abre a app pelo novo ícone <b>Maia</b> e volta aqui ao 🔔 › Avisos no telemóvel.</li>
            </ol>
            <div class="lista-sub">Precisa do iOS 16.4 ou mais recente.</div>`;
        return;
    }
    if (!avisosSuportado()) {
        c.innerHTML = `<div class="lista-sub" style="opacity:.85">Este navegador não recebe avisos. No Android usa o Chrome; no computador, o Chrome ou o Edge.</div>`;
        return;
    }
    if (Notification.permission === "denied") {
        c.innerHTML = `<div class="lista-sub" style="opacity:.85">Os avisos estão bloqueados para esta app. Desbloqueia nas definições do telemóvel
            (iPhone: Definições › Notificações › Maia; Android: toca no cadeado ao lado do endereço › Notificações) e volta aqui.</div>`;
        return;
    }

    const sub = await avisosSubAtual();
    let linha = null;
    if (sub) {
        const { data } = await SB.from("push_subscricoes").select("tipos").eq("endpoint", sub.endpoint).maybeSingle();
        linha = data;
    }
    if (!sub || !linha) {
        c.innerHTML = `${nota}<div class="lista-sub" style="opacity:.85">Este aparelho ainda não recebe avisos. Ativa e escolhe depois quais queres.</div>
            <div class="lista-accoes" style="justify-content:flex-start;margin-top:10px">
                <button type="button" class="btn-primary" onclick="avisosAtivar(this)">🔔 Ativar avisos neste aparelho</button>
            </div>`;
        return;
    }
    const tipos = new Set(linha.tipos || []);
    c.innerHTML = `${nota}<div class="lista-sub" style="opacity:.85">Este aparelho recebe avisos. Desliga os que não quiseres.</div>
        ${AVISOS_TIPOS.map(([k, nome, desc]) => `<label class="lista-linha" style="cursor:pointer;align-items:flex-start">
            <input type="checkbox" style="margin-top:3px" ${tipos.has(k) ? "checked" : ""} onchange="avisosTipo('${k}', this)">
            <div class="lista-txt" style="flex:1"><b>${esc(nome)}</b><div class="lista-det" style="white-space:normal">${esc(desc)}</div></div>
        </label>`).join("")}
        <div class="lista-rodape" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <button type="button" class="btn-primary" onclick="avisosTeste(this)">Enviar aviso de teste</button>
            <button type="button" class="btn-secondary" onclick="avisosDesativar(this)">Desativar neste aparelho</button>
        </div>`;
}

async function avisosAtivar(btn) {
    btn.disabled = true;
    btn.textContent = "A ativar…";
    try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { await avisosDesenhar("Sem autorização, a app não pode enviar avisos."); return; }
        const { data, error } = await SB.functions.invoke("avisos", { body: { acao: "chave" } });
        if (error || !data?.publica) throw error || new Error("sem chave");
        const reg = await navigator.serviceWorker.register("sw.js");
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: avisosChaveBytes(data.publica) });
        const j = sub.toJSON();
        const aparelho = avisosIOS() ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Computador";
        const { error: e2 } = await SB.from("push_subscricoes")
            .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, aparelho }, { onConflict: "endpoint" });
        if (e2) throw e2;
        await avisosDesenhar("Ativado ✓ Experimenta o aviso de teste.");
    } catch (e) {
        console.error("avisosAtivar", e);
        await avisosDesenhar("Não foi possível ativar. Se acabaste de atualizar a app, tenta outra vez daqui a um minuto.");
    }
}

async function avisosTipo(tipo, cb) {
    const sub = await avisosSubAtual();
    if (!sub) return avisosDesenhar();
    const { data } = await SB.from("push_subscricoes").select("tipos").eq("endpoint", sub.endpoint).maybeSingle();
    const tipos = new Set(data?.tipos || []);
    cb.checked ? tipos.add(tipo) : tipos.delete(tipo);
    const { error } = await SB.from("push_subscricoes").update({ tipos: [...tipos] }).eq("endpoint", sub.endpoint);
    if (error) { console.error(error); cb.checked = !cb.checked; alert("Não foi possível gravar."); }
}

async function avisosTeste(btn) {
    btn.disabled = true;
    const { data, error } = await SB.functions.invoke("avisos", { body: { acao: "teste" } });
    btn.disabled = false;
    if (error) { console.error(error); return avisosDesenhar("O teste falhou. Tenta outra vez daqui a pouco."); }
    avisosDesenhar(data?.enviados ? "Enviado. Deve aparecer dentro de segundos." : "Não há aparelhos ativos para enviar.");
}

async function avisosDesativar(btn) {
    btn.disabled = true;
    const sub = await avisosSubAtual();
    if (sub) {
        await SB.from("push_subscricoes").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe().catch(() => {});
    }
    avisosDesenhar("Desativado. Este aparelho deixa de receber avisos.");
}
