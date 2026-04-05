// =======================================================
// STOCK.JS — Movimento rápido de stock via QR
// Supabase disponível via config.js (SB)
// =======================================================

const TZ = "Europe/Lisbon";

// --- Estado global ---
let funcionario = null;
let artigo      = null;
let obras       = [];

// --- Device ID (igual ao app.html) ---
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("deviceId", id); }
  return id;
}

// --- UI helpers ---
function mostrarEcrã(id) {
  ["ecrãLoading","ecrãBloqueio","ecrãPrincipal"].forEach(e => {
    const el = document.getElementById(e);
    if (el) el.style.display = e === id ? "flex" : "none";
  });
}

function mostrarBloqueio(titulo, msg) {
  document.getElementById("bloqueioTitulo").textContent = titulo;
  document.getElementById("bloqueioMsg").innerHTML = msg;
  mostrarEcrã("ecrãBloqueio");
}

function mostrarFeedback(msg, tipo = "info") {
  const el = document.getElementById("feedback");
  el.textContent = msg;
  el.className = "feedback " + tipo;
  if (tipo === "ok") setTimeout(() => { el.textContent = ""; el.className = "feedback"; }, 3000);
}

// --- Tipos com stock variável ---
function temStock(tipo) {
  return tipo === "consumivel" || tipo === "mercadoria";
}

// --- Calcular stock actual ---
async function calcularStock(artigoId) {
  const { data } = await SB.from("movimentos_stock")
    .select("tipo_movimento, quantidade")
    .eq("artigo_id", artigoId);
  if (!data) return 0;
  let stock = artigo.stock_inicial || 0;
  data.forEach(m => {
    const q = Number(m.quantidade) || 0;
    if (m.tipo_movimento === "entrada" || m.tipo_movimento === "ajuste_entrada") stock += q;
    else stock -= q;
  });
  return stock;
}

// --- Renderizar formulário consoante tipo ---
async function renderFormulario() {
  const stockEl     = document.getElementById("stockActual");
  const formStock   = document.getElementById("formStock");
  const formMovim   = document.getElementById("formMovimentacao");

  // Preencher selects de obra
  const opcoesObra = `<option value="">— Selecionar —</option>
    <option value="armazem">📦 Armazém</option>
    ${obras.map(o => `<option value="${o.id}">${o.nome}</option>`).join("")}`;

  document.querySelectorAll(".selectObra").forEach(sel => sel.innerHTML = opcoesObra);

  if (temStock(artigo.tipo_artigo)) {
    // Materiais / consumíveis — entrada ou saída com quantidade
    const stock = await calcularStock(artigo.id);
    stockEl.textContent = `Stock actual: ${stock}`;
    stockEl.style.display = "block";
    formStock.style.display = "block";
    formMovim.style.display = "none";
  } else {
    // Equipamentos / ferramentas — só movimentação de local
    stockEl.style.display = "none";
    formStock.style.display = "none";
    formMovim.style.display = "block";
  }
}

// --- Confirmar movimento (materiais/consumíveis) ---
async function confirmarMovimentoStock() {
  const tipo = document.querySelector('input[name="tipoMov"]:checked')?.value;
  const qtd  = parseFloat(document.getElementById("quantidade").value);
  const obra = document.getElementById("obraStock").value;

  if (!tipo)           { mostrarFeedback("Seleciona entrada ou saída.", "erro"); return; }
  if (!qtd || qtd <= 0) { mostrarFeedback("Quantidade obrigatória.", "erro"); return; }
  if (!obra)           { mostrarFeedback("Seleciona uma obra ou Armazém.", "erro"); return; }

  const btn = document.getElementById("btnConfirmarStock");
  btn.disabled = true;
  btn.textContent = "A registar…";

  const { error } = await SB.from("movimentos_stock").insert({
    artigo_id:      artigo.id,
    tipo_movimento: tipo,
    quantidade:     qtd,
    data_movimento: new Date().toLocaleDateString("sv-SE", { timeZone: TZ }),
    funcionario_id: funcionario.id,
    obra_destino_id: tipo === "entrada"  ? (obra !== "armazem" ? obra : null) : null,
    obra_origem_id:  tipo === "saida"    ? (obra !== "armazem" ? obra : null) : null,
    observacoes:    `Via QR — ${tipo === "entrada" ? "Entrou de" : "Saiu para"}: ${obra === "armazem" ? "Armazém" : obras.find(o=>o.id===obra)?.nome || obra}`
  });

  btn.disabled = false;
  btn.textContent = "Confirmar";

  if (error) { mostrarFeedback("Erro ao registar. Tente novamente.", "erro"); return; }

  mostrarFeedback(`✓ ${tipo === "entrada" ? "Entrada" : "Saída"} de ${qtd} registada!`, "ok");
  document.getElementById("quantidade").value = "";
  document.querySelector('input[name="tipoMov"]')?.parentElement?.querySelectorAll('input').forEach(r => r.checked = false);
  // Actualizar stock
  renderFormulario();
}

// --- Confirmar movimentação (equipamentos/ferramentas) ---
async function confirmarMovimentacao() {
  const origem  = document.getElementById("obraOrigem").value;
  const destino = document.getElementById("obraDestino").value;

  if (!origem)  { mostrarFeedback("Seleciona a origem.", "erro"); return; }
  if (!destino) { mostrarFeedback("Seleciona o destino.", "erro"); return; }
  if (origem === destino) { mostrarFeedback("Origem e destino não podem ser iguais.", "erro"); return; }

  const btn = document.getElementById("btnConfirmarMovim");
  btn.disabled = true;
  btn.textContent = "A registar…";

  const nomeOrigem  = origem  === "armazem" ? "Armazém" : obras.find(o=>o.id===origem)?.nome  || origem;
  const nomeDestino = destino === "armazem" ? "Armazém" : obras.find(o=>o.id===destino)?.nome || destino;

  const { error } = await SB.from("movimentos_stock").insert({
    artigo_id:       artigo.id,
    tipo_movimento:  "saida",
    quantidade:      1,
    data_movimento:  new Date().toLocaleDateString("sv-SE", { timeZone: TZ }),
    funcionario_id:  funcionario.id,
    obra_origem_id:  origem  !== "armazem" ? origem  : null,
    obra_destino_id: destino !== "armazem" ? destino : null,
    observacoes:     `Movimentação: ${nomeOrigem} → ${nomeDestino}`
  });

  btn.disabled = false;
  btn.textContent = "Confirmar Movimentação";

  if (error) { mostrarFeedback("Erro ao registar. Tente novamente.", "erro"); return; }

  mostrarFeedback(`✓ ${artigo.descricao} movido para ${nomeDestino}!`, "ok");
  document.getElementById("obraOrigem").value  = "";
  document.getElementById("obraDestino").value = "";
}

// =======================================================
// INIT
// =======================================================
const urlParams = new URLSearchParams(window.location.search);
const codigoArtigo = urlParams.get("artigo");

document.addEventListener("DOMContentLoaded", async () => {
  mostrarEcrã("ecrãLoading");

  if (!codigoArtigo) {
    mostrarBloqueio("QR inválido", "Este QR não contém uma referência de artigo válida.<br>Contacte o responsável.");
    return;
  }

  // Verificar dispositivo
  const deviceId = getDeviceId();
  const { data: func } = await SB.from("funcionarios")
    .select("id, nome, acesso_stock, ativo")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!func || !func.ativo) {
    mostrarBloqueio("Dispositivo não autorizado", "Este dispositivo não está registado no sistema.<br>Contacte o administrador.");
    return;
  }

  if (!func.acesso_stock) {
    mostrarBloqueio("Sem permissão", "Não tens acesso ao registo de stock.<br>Pede ao administrador para activar o teu acesso.");
    return;
  }

  funcionario = func;

  // Carregar artigo pelo código
  const { data: art } = await SB.from("artigos")
    .select("*")
    .eq("codigo", codigoArtigo)
    .eq("ativo", true)
    .maybeSingle();

  if (!art) {
    mostrarBloqueio("Artigo não encontrado", `Não existe nenhum artigo com o código <strong>${codigoArtigo}</strong>.<br>Verifique se o QR está actualizado.`);
    return;
  }

  artigo = art;

  // Carregar obras activas
  const { data: obrasData } = await SB.from("obras")
    .select("id, nome")
    .eq("estado", "ativa")
    .order("nome");
  obras = obrasData || [];

  // Preencher UI
  document.getElementById("funcNome").textContent   = funcionario.nome;
  document.getElementById("artigoCodigo").textContent = artigo.codigo || "—";
  document.getElementById("artigoNome").textContent   = artigo.descricao;
  document.getElementById("artigoTipo").textContent   = {
    consumivel: "Consumível",
    mercadoria: "Mercadoria",
    equipamento: "Equipamento",
    ferramenta: "Ferramenta"
  }[artigo.tipo_artigo] || artigo.tipo_artigo;

  await renderFormulario();
  mostrarEcrã("ecrãPrincipal");

  // Eventos
  document.getElementById("btnConfirmarStock")?.addEventListener("click", confirmarMovimentoStock);
  document.getElementById("btnConfirmarMovim")?.addEventListener("click", confirmarMovimentacao);
});
