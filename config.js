// =======================================================
// CONFIGURAÇÃO GLOBAL SUPABASE
// Importar este ficheiro em TODAS as páginas que usam Supabase.
// Se mudares de projeto, altera apenas aqui.
// =======================================================

const SUPABASE_URL  = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

// Trinco da sessão partilhado entre separadores. O do Supabase espera para
// sempre: se outro separador da app ficar congelado com o trinco (comum no
// telemóvel, com o browser em segundo plano), o login passa mas nenhum dado
// carrega e ao atualizar volta ao login. Aqui espera-se no máximo 5 s e
// depois segue sem trinco.
let _trincoPreso = false;
async function trincoComLimite(nome, espera, fn) {
    if (!navigator.locks?.request) return await fn();
    // Pedido "só se estiver livre": a renovação automática do token (espera 0)
    // e, depois de o trinco ter ficado preso uma vez, todos os outros, para não
    // se esperar 5 s em cada pedido.
    if (espera === 0 || _trincoPreso) {
        return await navigator.locks.request(nome, { mode: "exclusive", ifAvailable: true }, async trinco => {
            if (trinco) _trincoPreso = false;
            else if (espera === 0) {
                const e = new Error(`Trinco ${nome} ocupado`);
                e.isAcquireTimeout = true;
                throw e;
            }
            return await fn();
        });
    }
    const ctrl = new AbortController();
    const relogio = setTimeout(() => ctrl.abort(), 5000);
    let entrou = false;
    try {
        return await navigator.locks.request(nome, { mode: "exclusive", signal: ctrl.signal }, async () => {
            entrou = true;
            clearTimeout(relogio);
            return await fn();
        });
    } catch (e) {
        if (entrou) throw e;
        clearTimeout(relogio);
        _trincoPreso = true;
        console.warn(`Trinco ${nome} preso noutro separador; a seguir sem ele.`);
        return await fn();
    }
}

// Instância partilhada — usar SB em todos os ficheiros
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { lock: trincoComLimite },
});

// Escape de HTML, partilhado por todas as páginas. Usar em TODO o sítio onde
// um dado da base de dados entra numa string de HTML.
//
// A regra é escapar na LEITURA, não na entrada. O texto que vem de uma
// fatura lida — nome do fornecedor, referência, descrição de linha — é
// escolhido por quem manda a fatura, e basta conseguir enviar uma à empresa.
// Escapá-lo só no ecrã de revisão não chega: ele fica gravado e volta a
// aparecer em todos os ecrãs que o mostrem.
//
// Escapa também a plica: sem ela, um atributo delimitado por plicas fica
// aberto a quem souber disso.
function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
