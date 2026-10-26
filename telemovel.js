// =======================================================
// TELEMÓVEL — tabelas em cartões
// No telemóvel cada linha de uma tabela passa a ser um
// cartão: cada célula mostra o nome da sua coluna (vindo
// do cabeçalho) e o valor ao lado. Assim nada anda para o
// lado. O aspeto está no style.css (.tabela-cartoes).
//
// Este ficheiro só escreve o atributo data-label em cada
// célula; no computador o atributo não faz nada.
//
// Ficam de fora:
//  - mapas mensais (mais de 12 colunas, um dia por coluna):
//    continuam em grelha com a 1.ª coluna fixa;
//  - tabelas sem cabeçalho;
//  - tabelas com a classe "sem-cartoes".
// =======================================================
(function () {
    const MAX_COLUNAS = 12;

    // Texto do cabeçalho numa só linha ("Segunda 19/10"),
    // mesmo quando o cabeçalho está escondido.
    function textoDe(el) {
        const partes = [];
        const andar = n => {
            if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) partes.push(t); }
            else if (n.nodeType === 1 && !/^(BUTTON|INPUT|SELECT|SCRIPT|STYLE)$/.test(n.tagName)) n.childNodes.forEach(andar);
        };
        andar(el);
        return partes.join(" ");
    }

    function rotular(tabela) {
        if (tabela.classList.contains("sem-cartoes")) return;
        const cab = tabela.tHead && tabela.tHead.rows.length ? tabela.tHead.rows[tabela.tHead.rows.length - 1] : null;
        if (!cab) return;
        const nomes = [];
        for (const th of cab.cells) {
            const t = textoDe(th);
            for (let i = 0; i < (th.colSpan || 1); i++) nomes.push(t);
        }
        if (nomes.length > MAX_COLUNAS) {
            tabela.classList.add("tabela-mapa");
            tabela.classList.remove("tabela-cartoes");
            return;
        }
        tabela.classList.remove("tabela-mapa");
        tabela.classList.add("tabela-cartoes");
        for (const corpo of [...tabela.tBodies, ...(tabela.tFoot ? [tabela.tFoot] : [])]) {
            for (const tr of corpo.rows) {
                let c = 0;
                for (const td of tr.cells) {
                    const nome = (td.colSpan || 1) > 1 ? "" : (nomes[c] || "");
                    if (td.getAttribute("data-label") !== nome) td.setAttribute("data-label", nome);
                    c += td.colSpan || 1;
                }
            }
        }
    }

    let agendado = false;
    function rotularTudo() {
        agendado = false;
        document.querySelectorAll("table").forEach(rotular);
    }
    function agendar() {
        if (agendado) return;
        agendado = true;
        requestAnimationFrame(rotularTudo);
    }

    function iniciar() {
        rotularTudo();
        // As tabelas são preenchidas depois (dados do Supabase):
        // voltar a rotular sempre que o conteúdo muda.
        new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();

// =======================================================
// TELEMÓVEL — menu lateral (☰)
// No telemóvel os separadores do painel e os botões do
// cabeçalho (Hoje, Registo Diário, Sair) vivem numa barra
// lateral que abre com o botão ☰. No computador nada disto
// aparece (CSS).
//
// Os botões do menu não são cópias com lógica própria:
// carregam no botão original, por isso abrirTab() e o
// resto continuam a funcionar como sempre.
// No painel, deslizar o dedo para o lado muda de separador.
// =======================================================
(function () {
    function el(tag, attrs, html) {
        const e = document.createElement(tag);
        Object.assign(e, attrs || {});
        if (html != null) e.innerHTML = html;
        return e;
    }

    function iniciar() {
        const header = document.querySelector("header.header");
        if (!header || document.getElementById("menuBotao")) return;

        let sincronizar = () => {};   // no painel admin passa a marcar a secção aberta
        const fundo = el("div", { id: "menuFundo", className: "menu-fundo" });
        const abrir  = () => { document.body.classList.add("menu-aberto"); sincronizar(); };
        const fechar = () => document.body.classList.remove("menu-aberto");
        fundo.onclick = fechar;
        document.addEventListener("keydown", e => { if (e.key === "Escape") fechar(); });

        const botao = el("button", { id: "menuBotao", className: "menu-botao", type: "button", title: "Menu" }, "☰");
        botao.setAttribute("aria-label", "Abrir menu");
        botao.onclick = () => document.body.classList.contains("menu-aberto") ? fechar() : abrir();
        header.insertBefore(botao, header.firstChild);
        document.body.appendChild(fundo);

        // ── Painel admin: montar a barra com os separadores e os atalhos ──
        const tabs = [...document.querySelectorAll(".tabs .tab")];
        if (!tabs.length) { botao.remove(); fundo.remove(); return; }
        const menu = el("nav", { id: "menuLateral", className: "menu-lateral" });

        const titulo = el("div", { className: "menu-titulo" }, "Painel");
        menu.appendChild(titulo);
        const itens = tabs.map(t => {
            const b = el("button", { type: "button", className: "menu-item" }, t.innerHTML);
            b.dataset.ir = t.dataset.tab;
            b.onclick = () => { t.click(); fechar(); window.scrollTo(0, 0); };
            menu.appendChild(b);
            return b;
        });

        const atalhos = [...header.querySelectorAll(":scope > a.btn-secondary, :scope > button.btn-secondary")];
        if (atalhos.length) {
            menu.appendChild(el("div", { className: "menu-titulo" }, "Atalhos"));
            atalhos.forEach(a => {
                const b = el("button", { type: "button", className: "menu-item menu-atalho" }, a.innerHTML);
                if (a.style.background) b.classList.add("menu-destaque");
                b.onclick = () => { fechar(); a.click(); };
                menu.appendChild(b);
            });
        }
        document.body.appendChild(menu);
        // Só agora o CSS esconde os separadores e os botões do cabeçalho
        document.body.classList.add("tem-menu-lateral");

        // Nome da secção aberta no cabeçalho, ao lado do ☰
        const atual = el("span", { id: "menuAtual", className: "menu-atual" });
        header.insertBefore(atual, botao.nextSibling);

        sincronizar = () => {
            const ativo = tabs.find(t => t.classList.contains("active"));
            itens.forEach((b, i) => b.classList.toggle("active", tabs[i] === ativo));
            atual.textContent = ativo ? ativo.textContent.replace(/[⚙\s]+/, " ").trim() : "";
        };
        ligarDeslizar(tabs, () => document.body.classList.contains("menu-aberto"));

        // abrirTab() muda a classe "active" dos separadores originais
        new MutationObserver(sincronizar).observe(document.querySelector(".tabs"), { attributes: true, subtree: true, attributeFilter: ["class"] });
        sincronizar();
    }

    // ── Deslizar para o lado muda de separador ──
    // Com o dedo para a esquerda vai para o separador seguinte, para a
    // direita volta ao anterior (a mesma ordem do menu). Não conta quando
    // o gesto começa num campo, num mapa com scroll próprio, no quadro do
    // planeamento (lá o dedo anda entre os dias e arrasta cartões) ou com
    // uma janela aberta.
    function ligarDeslizar(tabs, menuAberto) {
        const telemovel = window.matchMedia("(max-width: 700px)");
        const area = document.getElementById("adminArea");
        if (!area) return;
        const IGNORAR = "input, textarea, select, button, a, canvas, .tabela-mapa, .plan-quadro, .plan-cartao, [draggable='true'], .cot-tabela-wrap";
        let x0 = null, y0 = 0, t0 = 0;

        area.addEventListener("touchstart", e => {
            x0 = null;
            if (!telemovel.matches || menuAberto() || e.touches.length !== 1) return;
            const t = e.touches[0];
            // Junto às margens o telemóvel usa o gesto para "voltar atrás"
            if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;
            if (e.target.closest(IGNORAR)) return;
            if (document.querySelector(".modal:not(.hidden), [id^='modal'][style*='display: flex'], #modalFichaCliente")) return;
            x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
        }, { passive: true });

        area.addEventListener("touchend", e => {
            if (x0 === null) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - x0, dy = t.clientY - y0;
            x0 = null;
            // Gesto claramente na horizontal, com pelo menos 70px e rápido
            if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - t0 > 700) return;
            const i = tabs.findIndex(b => b.classList.contains("active"));
            const j = i + (dx < 0 ? 1 : -1);
            if (i < 0 || j < 0 || j >= tabs.length) return;
            document.body.classList.remove("desliza-esq", "desliza-dir");
            void document.body.offsetWidth;   // reiniciar a animação
            document.body.classList.add(dx < 0 ? "desliza-esq" : "desliza-dir");
            tabs[j].click();
            window.scrollTo(0, 0);
        }, { passive: true });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();
