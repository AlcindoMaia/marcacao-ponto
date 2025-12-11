// app.js — Marcação automática entrada/saída + histórico semanal (modo A + histórico B)

// ---------------- CONFIG SUPABASE ----------------
const SUPABASE_URL = "https://npyosbigynxmxdakcymg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weW9zYmlneW54bXhkYWtjeW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzYyMjYsImV4cCI6MjA4MDQxMjIyNn0.CErd5a_-9HS4qPB99SFyO-airsNnS3b8dvWWrSPE4_M";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------- HELPERS ----------------
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

function fmtDateTime(dt) {
  return new Date(dt).toLocaleString();
}

function startOfWeek(d = new Date()) {
  const day = d.getDay(); // 0..6 Sun..Sat
  const res = new Date(d);
  res.setHours(0,0,0,0);
  res.setDate(res.getDate() - day);
  return res;
}

function endOfWeek(d = new Date()) {
  const s = startOfWeek(d);
  s.setDate(s.getDate() + 7);
  return s;
}

// ---------------- ESTADO ----------------
let currentFuncionario = null; // objeto funcionario do supabase
let html5qr = null;

// ---------------- INICIALIZAÇÃO ----------------
document.addEventListener("DOMContentLoaded", () => {
  console.log("index.js carregado");
  initPage();
  document.getElementById('btnScanner').addEventListener('click', startScanner);
});

async function initPage() {
  const deviceId = getDeviceId();
  // obter funcionario
  try {
    const { data: func, error } = await supabase
      .from('funcionarios')
      .select('*')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error) {
      console.error('Erro ao carregar funcionário:', error);
      alert('Erro ao carregar dados do dispositivo.');
      return;
    }

    if (!func) {
      document.getElementById('notRegistered').classList.remove('hidden');
      document.getElementById('userBlock').classList.add('hidden');
      return;
    }

    currentFuncionario = func;
    document.getElementById('nomeFuncionario').textContent = func.nome;
    document.getElementById('metaInfo').textContent = 'Dispositivo reconhecido';
    document.getElementById('userBlock').classList.remove('hidden');
    document.getElementById('notRegistered').classList.add('hidden');

    await carregarHistoricoSemanal(func.id);
    await mostrarUltimaAcao(func.id);
  } catch (e) {
    console.error(e);
    alert('Erro inesperado ao inicializar.');
  }
}

// ---------------- SCANNER QR ----------------
function startScanner() {
  document.getElementById("qr-reader").classList.remove("hidden");
  if (html5qr) {
    html5qr.stop().catch(()=>{});
  }
  html5qr = new Html5Qrcode("qr-reader");

  html5qr.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    async (qrText) => {
      // Parar scanner
      try { await html5qr.stop(); } catch(e) {}
      document.getElementById("qr-reader").classList.add("hidden");

      // Se o QR for o link de cadastro -> redireciona
      if (qrText.includes('cadastro')) {
        window.location.href = qrText;
        return;
      }

      // Caso normal: qrText contém obra_id ou URL com obra param
      let obra_id = qrText;
      try {
        const u = new URL(qrText);
        const obraParam = u.searchParams.get('obra');
        if (obraParam) obra_id = obraParam;
      } catch(_) { /* qrText não é URL, assume ID simples */ }

      // registar ponto
      await registrarPonto(obra_id);
    },
    (err) => {
      // leitura intermitente - ignorar
      // console.debug('QR read error', err);
    }
  ).catch(err=>{
    console.error('Erro ao iniciar scanner:', err);
    alert('Não foi possível iniciar o leitor de QR.');
    document.getElementById("qr-reader").classList.add("hidden");
  });
}

// ---------------- REGISTRAR PONTO ----------------
async function registrarPonto(obra_id) {
  if (!currentFuncionario) {
    alert('Dispositivo não registado. Use o QR de cadastro.');
    return;
  }

  // obter GPS
  if (!navigator.geolocation) {
    alert('Geolocalização não suportada no seu navegador.');
    return;
  }

  document.getElementById('metaInfo').textContent = 'A obter localização...';

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;

    try {
      // determinar tipo (alternar) — obter último registo deste funcionário na obra (ou global)
      const { data: ultima, error: errUlt } = await supabase
        .from('ponto')
        .select('tipo,datahora')
        .eq('funcionario_id', currentFuncionario.id)
        .order('datahora', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errUlt) {
        console.error('Erro ao obter último registo:', errUlt);
        alert('Erro ao processar registo.');
        return;
      }

      // Alternância: se última for 'entrada' -> agora será 'saida', do contrário 'entrada'
      let tipo = 'entrada';
      if (ultima && ultima.tipo === 'entrada') tipo = 'saida';

      // Inserir
      const payload = {
        funcionario_id: currentFuncionario.id,
        obra_id: obra_id,
        datahora: new Date().toISOString(),
        latitude,
        longitude,
        tipo
      };

      const { data, error } = await supabase.from('ponto').insert(payload).select().maybeSingle();

      if (error) {
        console.error('Erro ao inserir ponto:', error);
        alert('Erro ao registar ponto: ' + (error.message || JSON.stringify(error)));
        return;
      }

      document.getElementById('metaInfo').textContent = `Ponto ${tipo} registado: ${fmtDateTime(data.datahora)}`;
      alert(`Ponto ${tipo} registado com sucesso!`);

      // atualizar histórico e última ação
      await carregarHistoricoSemanal(currentFuncionario.id);
      await mostrarUltimaAcao(currentFuncionario.id);

    } catch (e) {
      console.error(e);
      alert('Erro ao registar ponto.');
    }
  }, (err) => {
    console.error('Erro GPS:', err);
    alert('Não foi possível obter localização. Ative o GPS e tente novamente.');
    document.getElementById('metaInfo').textContent = 'Falha na localização';
  }, { enableHighAccuracy: true, timeout: 15000 });
}

// ---------------- MOSTRAR ÚLTIMA AÇÃO ----------------
async function mostrarUltimaAcao(funcId) {
  try {
    const { data: ultima, error } = await supabase
      .from('ponto')
      .select('tipo,datahora,obra_id')
      .eq('funcionario_id', funcId)
      .order('datahora', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao obter última ação:', error);
      return;
    }

    const el = document.getElementById('lastAction');
    if (!ultima) {
      el.innerHTML = '<div class="small">Ainda não existem registos.</div>';
      return;
    }
    el.innerHTML = `<div class="small">Última ação: <strong>${ultima.tipo.toUpperCase()}</strong> — ${fmtDateTime(ultima.datahora)} (Obra: ${ultima.obra_id})</div>`;
  } catch (e) {
    console.error(e);
  }
}

// ---------------- CARREGAR HISTÓRICO SEMANAL E CALCULAR HORAS POR DIA ----------------
async function carregarHistoricoSemanal(funcId) {
  // intervalo da semana
  const inicio = startOfWeek(new Date());
  const fim = endOfWeek(new Date());

  try {
    const { data, error } = await supabase
      .from('ponto')
      .select('id, tipo, datahora, obra_id, latitude, longitude')
      .eq('funcionario_id', funcId)
      .gte('datahora', inicio.toISOString())
      .lt('datahora', fim.toISOString())
      .order('datahora', { ascending: true });

    if (error) {
      console.error('Erro ao obter histórico semana:', error);
      document.getElementById('historico').innerHTML = '<div class="small">Erro ao obter histórico.</div>';
      return;
    }

    // Mostrar registos detalhados
    const detalhesDiv = document.getElementById('historico');
    detalhesDiv.innerHTML = '';
    if (!data || data.length === 0) {
      detalhesDiv.innerHTML = '<div class="small">Sem registos esta semana.</div>';
    } else {
      data.slice().reverse().forEach(r => {
        const d = new Date(r.datahora);
        const item = document.createElement('div');
        item.className = 'regItem';
        item.innerHTML = `<strong>${r.tipo.toUpperCase()}</strong> — ${d.toLocaleString()} <br> Obra: ${r.obra_id}`;
        detalhesDiv.appendChild(item);
      });
    }

    // Calcular horas por dia
    // Assumimos alternância: pairs (entrada -> saída). Se par incompleto, ignorar último.
    const byDay = {}; // key YYYY-MM-DD -> seconds
    let lastEntrada = null; // store Date of last entrada

    data.forEach(rec => {
      if (rec.tipo === 'entrada') {
        // start new entrada (store timestamp)
        lastEntrada = new Date(rec.datahora);
      } else if (rec.tipo === 'saida') {
        if (lastEntrada) {
          const saidaTime = new Date(rec.datahora);
          // If saída is earlier than entrada then ignore
          if (saidaTime > lastEntrada) {
            // allocate seconds to the day(s) that the work spans
            // We'll split by day boundaries: iterate date from entrada to saída by days
            let cur = new Date(lastEntrada);
            cur.setHours(0,0,0,0);
            const end = new Date(saidaTime);
            // If entrada and saida on same day: add direct
            const keyEntrada = lastEntrada.toISOString().slice(0,10);
            const keySaida = saidaTime.toISOString().slice(0,10);

            if (keyEntrada === keySaida) {
              const secs = (saidaTime - lastEntrada) / 1000;
              byDay[keyEntrada] = (byDay[keyEntrada] || 0) + secs;
            } else {
              // split across days
              // first day: from entrada to midnight
              const midnight = new Date(lastEntrada);
              midnight.setHours(24,0,0,0);
              let secsFirst = (midnight - lastEntrada) / 1000;
              byDay[keyEntrada] = (byDay[keyEntrada] || 0) + secsFirst;

              // middle full days
              let iter = new Date(midnight);
              iter.setHours(0,0,0,0);
              while (iter < end && iter.toISOString().slice(0,10) !== keySaida) {
                const key = iter.toISOString().slice(0,10);
                byDay[key] = (byDay[key] || 0) + 24*3600;
                iter.setDate(iter.getDate()+1);
              }

              // last day: from midnight to saida
              const keyLast = keySaida;
              const midnightLast = new Date(saidaTime);
              midnightLast.setHours(0,0,0,0);
              const secsLast = (saidaTime - midnightLast) / 1000;
              byDay[keyLast] = (byDay[keyLast] || 0) + secsLast;
            }
          }
        }
        // reset lastEntrada after pairing
        lastEntrada = null;
      }
    });

    // Mostrar resumo por dia (para toda a semana)
    const resumoDiv = document.getElementById('histResumo');
    resumoDiv.innerHTML = '';

    // iterate from start of week to end-1
    const days = [];
    const it = new Date(inicio);
    for (let i = 0; i < 7; i++) {
      const key = it.toISOString().slice(0,10);
      days.push(key);
      it.setDate(it.getDate() + 1);
    }

    days.forEach(k => {
      const secs = Math.round(byDay[k] || 0);
      const hours = Math.floor(secs / 3600);
      const mins = Math.floor((secs % 3600) / 60);
      const display = secs === 0 ? '0h 00m' : `${hours}h ${mins.toString().padStart(2,'0')}m`;
      const el = document.createElement('div');
      el.className = 'regItem';
      const d = new Date(k + 'T00:00:00');
      el.innerHTML = `<strong>${d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' })}</strong> — ${display}`;
      resumoDiv.appendChild(el);
    });

  } catch (e) {
    console.error(e);
    document.getElementById('historico').innerHTML = '<div class="small">Erro ao carregar histórico.</div>';
  }
}
