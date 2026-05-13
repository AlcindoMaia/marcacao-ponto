// =======================================================
// CARGA.JS — Sessão de transporte de artigos
// Supabase disponível via config.js (SB)
// =======================================================

const TZ = "Europe/Lisbon";

// --- Estado global ---
let funcionario = null;
let obras       = [];
let sessao      = null;   // { id, origem, destino, inicio, itens: [] }
let artigoModal = null;   // artigo actualmente no modal
let qrStream    = null;
let qrAnimFrame = null;
let qrPausado   = false;  // pausa durante modal aberto

// --- Helpers de UI ---
function mostrarEcrã(id) {
  ["ecrãLoading","ecrãBloqueio","ecrãContexto","ecrãSessao","ecrãResumo"].forEach(e => {
    const el = document.getElementById(e);
    if (el) el.style.display = e === id ? "flex" : "none";
  });
}

function mostrarBloqueio(titulo, msg) {
  document.getElementById("bloqueioTitulo").textContent = titulo;
  document.getElementById("bloqueioMsg").innerHTML = msg;
  mostrarEcrã("ecrãBloqueio");
}

function tipoIcon(tipo) {
  return { consumivel: "📦", mercadoria: "📦", equipamento: "🔧", ferramenta: "🔨" }[tipo] || "📦";
}

function tipoLabel(tipo) {
  return { consumivel: "Consumível", mercadoria: "Mercadoria", equipamento: "Equipamento", ferramenta: "Ferramenta" }[tipo] || tipo;
}

function temStock(tipo) {
  return tipo === "consumivel" || tipo === "mercadoria";
}

function diaLocal() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
}

// --- Device ID ---
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("deviceId", id); }
  return id;
}

// =======================================================
// ECRÃ CONTEXTO — Origem / Destino
// =======================================================
function popularSelects() {
  const opcoes = `<option value="">— Selecionar —</option>
    <option value="armazem">📦 Armazém</option>
    ${obras.map(o => `<option value="${o.id}">${o.nome}</option>`).join("")}`;
  document.getElementById("selOrigem").innerHTML = opcoes;
  document.getElementById("selDestino").innerHTML = opcoes;
}

function aplicarOrigemURL() {
  const params = new URLSearchParams(window.location.search);
  const origem = params.get("origem");
  if (!origem) return;
  const sel = document.getElementById("selOrigem");
  // Tentar seleccionar pelo valor
  for (const opt of sel.options) {
    if (opt.value === origem) { sel.value = origem; return; }
  }
  // Se não encontrou (ex: ID de obra não carregado ainda), tentar de novo depois
}

function nomePorId(id) {
  if (!id || id === "armazem") return "Armazém";
  return obras.find(o => o.id === id)?.nome || id;
}

function iniciarSessao() {
  const origemId  = document.getElementById("selOrigem").value;
  const destinoId = document.getElementById("selDestino").value;
  const msg       = document.getElementById("ctxMsg");

  if (!origemId)  { msg.textContent = "Seleciona a origem.";  msg.className = "feedback erro"; return; }
  if (!destinoId) { msg.textContent = "Seleciona o destino."; msg.className = "feedback erro"; return; }
  if (origemId === destinoId) { msg.textContent = "Origem e destino têm de ser diferentes."; msg.className = "feedback erro"; return; }

  sessao = {
    id:      crypto.randomUUID(),
    origem:  { id: origemId,  nome: nomePorId(origemId) },
    destino: { id: destinoId, nome: nomePorId(destinoId) },
    inicio:  new Date(),
    itens:   []
  };

  // Header da sessão
  document.getElementById("sessRota").innerHTML =
    `<span>${sessao.origem.nome}</span> → <span>${sessao.destino.nome}</span>`;

  mostrarEcrã("ecrãSessao");
  iniciarQR();
  renderListaItens();
}

// =======================================================
// LEITOR QR
// =======================================================
async function iniciarQR() {
  const video   = document.getElementById("qrVideo");
  const status  = document.getElementById("qrStatus");

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = qrStream;
    await video.play();
    status.textContent = "Aponta para o QR do artigo…";
    scanFrame();
  } catch(e) {
    status.textContent = "Câmara não disponível — usa o campo manual.";
  }
}

function pararQR() {
  if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
  if (qrAnimFrame) { cancelAnimationFrame(qrAnimFrame); qrAnimFrame = null; }
}

function scanFrame() {
  if (qrPausado) { qrAnimFrame = requestAnimationFrame(scanFrame); return; }

  const video  = document.getElementById("qrVideo");
  const canvas = document.getElementById("qrCanvas");
  if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
    qrAnimFrame = requestAnimationFrame(scanFrame); return;
  }

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx  = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });

  if (code) {
    // Extrair código do artigo do URL (stock.html?artigo=CODIGO)
    let codigo = code.data;
    try {
      const url = new URL(code.data);
      const param = url.searchParams.get("artigo");
      if (param) codigo = param;
    } catch(e) { /* não é URL, usar como código directo */ }

    processarCodigo(codigo);
    return; // pausar scan enquanto modal está aberto
  }

  qrAnimFrame = requestAnimationFrame(scanFrame);
}

// =======================================================
// PROCESSAR ARTIGO (por QR ou manual)
// =======================================================
async function processarCodigo(codigo) {
  if (!codigo?.trim()) return;
  codigo = codigo.trim().toUpperCase();
  qrPausado = true;
  document.getElementById("qrStatus").textContent = `A verificar ${codigo}…`;

  const { data: artigo, error } = await SB.from("artigos")
    .select("id, codigo, descricao, tipo_artigo")
    .eq("codigo", codigo)
    .eq("ativo", true)
    .maybeSingle();

  if (error || !artigo) {
    document.getElementById("qrStatus").textContent = `⚠️ Artigo "${codigo}" não encontrado. Tenta de novo.`;
    qrPausado = false;
    qrAnimFrame = requestAnimationFrame(scanFrame);
    return;
  }

  abrirModalArtigo(artigo);
}

// =======================================================
// MODAL — artigo detectado
// =======================================================
function abrirModalArtigo(artigo) {
  artigoModal = artigo;

  document.getElementById("modalCodigo").textContent = artigo.codigo;
  document.getElementById("modalNome").textContent   = artigo.descricao;
  document.getElementById("modalTipo").textContent   = tipoLabel(artigo.tipo_artigo);

  // Verificar se já está na lista
  const existente = sessao.itens.find(i => i.artigo.id === artigo.id);
  const avisoEl   = document.getElementById("avisoRepetido");
  const btnAdicEl = document.getElementById("btnAdicionarQtd");

  if (existente) {
    avisoEl.style.display   = "block";
    btnAdicEl.style.display = "block";
    document.getElementById("avisoRepetidoQtd").textContent =
      `Já tens ${existente.quantidade} ${existente.artigo.tipo_artigo === "consumivel" || existente.artigo.tipo_artigo === "mercadoria" ? "un." : ""} na lista.`;
  } else {
    avisoEl.style.display   = "none";
    btnAdicEl.style.display = "none";
  }

  // Mostrar/esconder campo quantidade
  const qtdArea = document.getElementById("qtdArea");
  if (temStock(artigo.tipo_artigo)) {
    qtdArea.style.display = "block";
    document.getElementById("modalQtdInput").value = "1";
  } else {
    qtdArea.style.display = "none";
  }

  document.getElementById("modalArtigo").classList.add("open");
}

function fecharModal() {
  document.getElementById("modalArtigo").classList.remove("open");
  artigoModal  = null;
  qrPausado    = false;
  document.getElementById("codigoManual").value = "";
  document.getElementById("qrStatus").textContent = "Aponta para o QR do artigo…";
  if (qrStream) qrAnimFrame = requestAnimationFrame(scanFrame);
}

function confirmarArtigo(adicionarAExistente = false) {
  if (!artigoModal) return;

  const qtd = temStock(artigoModal.tipo_artigo)
    ? parseFloat(document.getElementById("modalQtdInput").value) || 0
    : 1;

  if (temStock(artigoModal.tipo_artigo) && qtd <= 0) {
    document.getElementById("modalQtdInput").style.borderColor = "var(--err)";
    return;
  }

  const existente = sessao.itens.find(i => i.artigo.id === artigoModal.id);

  if (existente && adicionarAExistente) {
    existente.quantidade = parseFloat((existente.quantidade + qtd).toFixed(3));
  } else if (existente && !adicionarAExistente) {
    // Registar como item separado (permite dois registos do mesmo)
    sessao.itens.push({ artigo: artigoModal, quantidade: qtd });
  } else {
    sessao.itens.push({ artigo: artigoModal, quantidade: qtd });
  }

  renderListaItens();
  fecharModal();
}

// =======================================================
// LISTA DE ITENS
// =======================================================
function renderListaItens() {
  const lista  = document.getElementById("listaItens");
  const counter = document.getElementById("contadorItens");
  const total  = sessao.itens.length;
  counter.textContent = `${total} ${total === 1 ? "item" : "itens"}`;

  if (total === 0) {
    lista.innerHTML = `<div class="lista-vazia">Lê um QR ou digita o código<br>para adicionar artigos à carga</div>`;
    return;
  }

  lista.innerHTML = sessao.itens.map((item, idx) => `
    <div class="item-carga">
      <div class="item-tipo">${tipoIcon(item.artigo.tipo_artigo)}</div>
      <div class="item-info">
        <div class="item-nome">${item.artigo.descricao}</div>
        <div class="item-codigo">${item.artigo.codigo}</div>
      </div>
      <div class="item-qtd">${temStock(item.artigo.tipo_artigo) ? item.quantidade : "1×"}</div>
      <button class="item-remover" onclick="removerItem(${idx})">✕</button>
    </div>`).join("");
}

function removerItem(idx) {
  sessao.itens.splice(idx, 1);
  renderListaItens();
}

// =======================================================
// TERMINAR SESSÃO — gravar na BD + mostrar resumo
// =======================================================
async function terminarSessao() {
  if (sessao.itens.length === 0) {
    if (!confirm("Não adicionaste nenhum artigo. Terminar mesmo assim?")) return;
    mostrarResumo();
    return;
  }

  // Gravar movimentos na BD
  const data_mov = diaLocal();
  const obs_base = `Carga: ${sessao.origem.nome} → ${sessao.destino.nome}`;

  const movimentos = sessao.itens.map(item => ({
    artigo_id:       item.artigo.id,
    tipo_movimento:  "saida",
    quantidade:      item.quantidade,
    data_movimento:  data_mov,
    funcionario_id:  funcionario.id,
    obra_origem_id:  sessao.origem.id  !== "armazem" ? sessao.origem.id  : null,
    obra_destino_id: sessao.destino.id !== "armazem" ? sessao.destino.id : null,
    sessao_id:       sessao.id,
    observacoes:     obs_base
  }));

  const { error } = await SB.from("movimentos_stock").insert(movimentos);

  if (error) {
    alert("Erro ao gravar: " + error.message);
    return;
  }

  // Actualizar local_armazenamento de todos os artigos para o destino
  const nomeDestino = sessao.destino.nome;
  const idsUnicos   = [...new Set(sessao.itens.map(i => i.artigo.id))];
  await SB.from("artigos")
    .update({ local_armazenamento: nomeDestino })
    .in("id", idsUnicos);

  pararQR();
  mostrarResumo();
}

// =======================================================
// ECRÃ RESUMO
// =======================================================
function mostrarResumo() {
  document.getElementById("resumoRota").textContent =
    `${sessao.origem.nome} → ${sessao.destino.nome}`;

  const hora = sessao.inicio.toLocaleTimeString("pt-PT", { hour:"2-digit", minute:"2-digit", timeZone: TZ });
  const data = sessao.inicio.toLocaleDateString("pt-PT", { day:"2-digit", month:"2-digit", year:"numeric", timeZone: TZ });
  document.getElementById("resumoMeta").textContent =
    `${funcionario.nome} · ${data} às ${hora}`;

  const lista = document.getElementById("resumoLista");
  if (sessao.itens.length === 0) {
    lista.innerHTML = `<div class="lista-vazia">Nenhum artigo registado.</div>`;
  } else {
    lista.innerHTML = sessao.itens.map(item => `
      <div class="resumo-item">
        <div class="resumo-item-info">
          <div class="nome">${item.artigo.descricao}</div>
          <div class="codigo">${item.artigo.codigo} · ${tipoLabel(item.artigo.tipo_artigo)}</div>
        </div>
        <div class="resumo-item-qtd">${temStock(item.artigo.tipo_artigo) ? item.quantidade + " un." : "1×"}</div>
      </div>`).join("");
  }

  mostrarEcrã("ecrãResumo");
}

// =======================================================
// PDF — Guia de Transporte
// =======================================================
function imprimirGuia() {
  const data = sessao.inicio.toLocaleDateString("pt-PT", { day:"2-digit", month:"2-digit", year:"numeric", timeZone: TZ });
  const hora = sessao.inicio.toLocaleTimeString("pt-PT", { hour:"2-digit", minute:"2-digit", timeZone: TZ });
  const numGuia = `GT-${sessao.inicio.getFullYear()}${String(sessao.inicio.getMonth()+1).padStart(2,"0")}${String(sessao.inicio.getDate()).padStart(2,"0")}-${sessao.id.substring(0,6).toUpperCase()}`;

  const linhas = sessao.itens.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td style="font-family:monospace;font-size:10pt">${item.artigo.codigo}</td>
      <td>${item.artigo.descricao}</td>
      <td>${tipoLabel(item.artigo.tipo_artigo)}</td>
      <td style="text-align:right;font-weight:700">${temStock(item.artigo.tipo_artigo) ? item.quantidade + " un." : "1×"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Guia de Transporte ${numGuia}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;600&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Inter',sans-serif; font-size:11pt; color:#222; padding:24px 32px; background:#fff; }

  .header { display:flex; justify-content:space-between; align-items:flex-start;
    padding-bottom:16px; border-bottom:2px solid #f4b942; margin-bottom:20px; }
  .empresa { font-family:'Oswald',sans-serif; font-size:22pt; font-weight:600;
    letter-spacing:2px; text-transform:uppercase; color:#1a1a1a; }
  .empresa-sub { font-size:9pt; color:#888; letter-spacing:1px; text-transform:uppercase; }
  .guia-num { text-align:right; }
  .guia-num .num { font-family:'Oswald',sans-serif; font-size:16pt; font-weight:600; color:#f4b942; }
  .guia-num .data { font-size:10pt; color:#666; margin-top:4px; }

  .rota-box { background:#faf8f4; border-radius:8px; padding:16px 20px;
    display:flex; align-items:center; gap:16px; margin-bottom:20px; }
  .rota-local { flex:1; }
  .rota-local label { font-size:9pt; text-transform:uppercase; letter-spacing:1px; color:#a8845c; font-weight:600; }
  .rota-local span { display:block; font-size:14pt; font-weight:700; margin-top:2px; }
  .rota-seta { font-size:22pt; color:#f4b942; }

  .info-linha { display:flex; gap:24px; margin-bottom:20px; font-size:10pt; }
  .info-item label { color:#888; font-size:9pt; text-transform:uppercase; letter-spacing:.5px; display:block; }
  .info-item span { font-weight:600; }

  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead th { background:#f4b942; color:#1a1000; padding:8px 10px; text-align:left;
    font-family:'Oswald',sans-serif; font-size:10pt; letter-spacing:.5px; text-transform:uppercase; }
  thead th:last-child { text-align:right; }
  tbody tr:nth-child(even) { background:#faf8f4; }
  tbody td { padding:8px 10px; border-bottom:1px solid #eee; font-size:10pt; }
  tbody tr:last-child td { border-bottom:none; }

  .assinaturas { display:grid; grid-template-columns:1fr 1fr; gap:40px;
    margin-top:32px; padding-top:20px; border-top:1px solid #ddd; }
  .assin h3 { font-family:'Oswald',sans-serif; font-size:10pt; letter-spacing:1px;
    text-transform:uppercase; color:#888; margin-bottom:24px; }
  .assin-linha { border-bottom:1px solid #999; height:32px; margin-bottom:6px; }
  .assin-leg { font-size:9pt; color:#aaa; }

  .rodape { text-align:center; font-size:9pt; color:#aaa; margin-top:20px;
    padding-top:12px; border-top:1px solid #eee; }

  @media print { body { padding:12px 16px; } }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="empresa">Maia Solutions</div>
    <div class="empresa-sub">Construção Civil & Remodelações</div>
  </div>
  <div class="guia-num">
    <div class="num">${numGuia}</div>
    <div class="data">${data} às ${hora}</div>
  </div>
</div>

<div class="rota-box">
  <div class="rota-local">
    <label>Origem</label>
    <span>${sessao.origem.nome}</span>
  </div>
  <div class="rota-seta">→</div>
  <div class="rota-local">
    <label>Destino</label>
    <span>${sessao.destino.nome}</span>
  </div>
</div>

<div class="info-linha">
  <div class="info-item">
    <label>Responsável</label>
    <span>${funcionario.nome}</span>
  </div>
  <div class="info-item">
    <label>Total de artigos</label>
    <span>${sessao.itens.length}</span>
  </div>
  <div class="info-item">
    <label>Referência da sessão</label>
    <span style="font-family:monospace">${sessao.id.substring(0,8).toUpperCase()}</span>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Código</th>
      <th>Descrição</th>
      <th>Tipo</th>
      <th style="text-align:right">Quantidade</th>
    </tr>
  </thead>
  <tbody>${linhas}</tbody>
</table>

<div class="assinaturas">
  <div class="assin">
    <h3>Entregue por</h3>
    <div class="assin-linha"></div>
    <div class="assin-leg">${funcionario.nome} — Assinatura</div>
  </div>
  <div class="assin">
    <h3>Recebido por</h3>
    <div class="assin-linha"></div>
    <div class="assin-leg">Nome e assinatura de quem recebe</div>
  </div>
</div>

<div class="rodape">
  Maia Solutions · Guia de Transporte ${numGuia} · ${data}
</div>

<script>setTimeout(() => window.print(), 400);<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  win.document.write(html);
  win.document.close();
}

// =======================================================
// INIT
// =======================================================
document.addEventListener("DOMContentLoaded", async () => {
  mostrarEcrã("ecrãLoading");

  // Verificar dispositivo
  const { data: func } = await SB.from("funcionarios")
    .select("id, nome, acesso_stock, ativo")
    .eq("device_id", getDeviceId())
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
  document.getElementById("ctxFuncNome").textContent = func.nome;

  // Carregar obras activas
  const { data: obrasData } = await SB.from("obras")
    .select("id, nome")
    .eq("estado", "ativa")
    .order("nome");
  obras = obrasData || [];

  popularSelects();
  aplicarOrigemURL(); // pré-preencher origem se vier no URL
  mostrarEcrã("ecrãContexto");

  // --- Eventos ---
  document.getElementById("btnIniciarSessao").addEventListener("click", iniciarSessao);
  document.getElementById("btnTerminar").addEventListener("click", () => {
    if (confirm("Terminar a sessão e gravar os movimentos?")) terminarSessao();
  });

  // Modal
  document.getElementById("btnConfirmarArtigo").addEventListener("click", () => confirmarArtigo(false));
  document.getElementById("btnAdicionarAQtd").addEventListener("click", () => confirmarArtigo(true));
  document.getElementById("btnCancelarModal").addEventListener("click", fecharModal);
  document.getElementById("modalArtigo").addEventListener("click", e => {
    if (e.target.id === "modalArtigo") fecharModal();
  });

  // Quantidade +/-
  document.getElementById("btnMais").addEventListener("click", () => {
    const el = document.getElementById("modalQtdInput");
    el.value = parseFloat((parseFloat(el.value||0) + 1).toFixed(2));
  });
  document.getElementById("btnMenos").addEventListener("click", () => {
    const el = document.getElementById("modalQtdInput");
    const v = parseFloat(el.value||0) - 1;
    el.value = v > 0 ? parseFloat(v.toFixed(2)) : 1;
  });

  // Input manual
  document.getElementById("btnManual").addEventListener("click", () => {
    const codigo = document.getElementById("codigoManual").value.trim();
    if (codigo) processarCodigo(codigo);
  });
  document.getElementById("codigoManual").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const codigo = document.getElementById("codigoManual").value.trim();
      if (codigo) processarCodigo(codigo);
    }
  });

  // Resumo
  document.getElementById("btnImprimirGuia").addEventListener("click", imprimirGuia);
  document.getElementById("btnNovaSessao").addEventListener("click", () => {
    sessao = null;
    popularSelects();
    aplicarOrigemURL();
    mostrarEcrã("ecrãContexto");
  });
});
