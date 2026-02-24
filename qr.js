// ===================================================
// CONFIG
// ===================================================
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let ultimoQR = null;
let ultimoNome = "";

// ===================================================
// GPS
// ===================================================
document.getElementById("btnGPS").onclick = () => {
navigator.geolocation.getCurrentPosition(pos => {
latitude.value = pos.coords.latitude;
longitude.value = pos.coords.longitude;
}, () => alert("Erro ao obter GPS"));
};

// ===================================================
// CRIAR OBRA + QR
// ===================================================
document.getElementById("formObra").addEventListener("submit", async (e) => {

e.preventDefault();

const nome = nomeObra.value.trim();
const morada = morada.value.trim();
const raio = parseInt(raio.value);
const lat = parseFloat(latitude.value);
const lon = parseFloat(longitude.value);

if (!nome) return alert("Nome obrigatório");
if (!lat || !lon) return alert("GPS obrigatório");

const { data, error } = await SB
.from("obras")
.insert({
nome,
morada,
latitude: lat,
longitude: lon,
raio
})
.select()
.single();

if (error) {
alert("Erro ao criar obra:\n" + error.message);
return;
}

const obraID = data.id;

const url = `https://alcindomaia.github.io/marcacao-ponto/?obra=${obraID}`;<br/><br/> const canvas = document.getElementById("qrCanvas");

ultimoQR = new QRious({
element: canvas,
