// =======================================================
// CONFIGURAÇÃO GLOBAL SUPABASE
// Importar este ficheiro em TODAS as páginas que usam Supabase.
// Se mudares de projeto, altera apenas aqui.
// =======================================================

const SUPABASE_URL  = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

// Instância partilhada — usar SB em todos os ficheiros
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
