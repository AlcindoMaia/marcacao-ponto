// =======================================================
// CONFIGURAÇÃO GLOBAL SUPABASE
// Importar este ficheiro em TODAS as páginas que usam Supabase.
// Se mudares de projeto, altera apenas aqui.
// =======================================================

const SUPABASE_URL  = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

// Instância partilhada — usar SB em todos os ficheiros
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
