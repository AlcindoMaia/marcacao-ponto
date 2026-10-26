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
