// =======================================================
// Lê um calendário em formato iCal (.ics) e devolve as reuniões que
// caem entre duas datas, já na hora de Lisboa.
//
// Recebe a biblioteca ICAL por parâmetro para se poder testar fora do Deno.
// Trata reuniões que se repetem (semanais, mensais…), as exceções
// ("esta semana passa para quinta") e as datas apagadas de uma série.
// =======================================================

const FUSO = "Europe/Lisbon";
const MAX_REPETICOES = 5000;   // uma série diária de 10 anos ainda cabe

export type Reuniao = {
    id: string;
    data: string;            // AAAA-MM-DD, em Lisboa
    hora_inicio: string | null;   // HH:MM, null se for o dia todo
    hora_fim: string | null;
    dia_inteiro: boolean;
    titulo: string;
    local: string | null;
    notas: string | null;
};

const formatoLisboa = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function emLisboa(d: Date) {
    const p: Record<string, string> = {};
    for (const x of formatoLisboa.formatToParts(d)) p[x.type] = x.value;
    return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

function pad(n: number) { return String(n).padStart(2, "0"); }

// Data e hora de uma ICAL.Time em Lisboa. As horas "flutuantes" (sem fuso)
// já são hora local, por isso não se convertem.
function local(t: any) {
    if (t.isDate) return { data: `${t.year}-${pad(t.month)}-${pad(t.day)}`, hora: null };
    if (!t.zone || t.zone.tzid === "floating") {
        return { data: `${t.year}-${pad(t.month)}-${pad(t.day)}`, hora: `${pad(t.hour)}:${pad(t.minute)}` };
    }
    return emLisboa(t.toJSDate());
}

function somarDias(data: string, n: number) {
    const d = new Date(data + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

function texto(v: unknown) {
    const s = v == null ? "" : String(v).trim();
    return s || null;
}

// Séries diárias ou semanais sem COUNT: em vez de percorrer anos de
// repetições até chegar à semana pedida, salta o início da série um número
// inteiro de períodos para a frente. O padrão (dias da semana, intervalo)
// fica igual porque o salto é múltiplo do período.
function avancar(ev: any, deN: number) {
    const inicio = ev.startDate;
    const regras = ev.component.getAllProperties("rrule");
    if (regras.length !== 1 || ev.component.hasProperty("rdate")) return inicio;
    const r = regras[0].getFirstValue();
    if (r.count || (r.freq !== "DAILY" && r.freq !== "WEEKLY")) return inicio;
    const periodo = (r.freq === "DAILY" ? 1 : 7) * (r.interval || 1);
    const alvo = Date.UTC(Math.floor(deN / 10000), Math.floor(deN / 100) % 100 - 1, deN % 100) - 7 * 86_400_000;
    const atual = Date.UTC(inicio.year, inicio.month - 1, inicio.day);
    const dias = Math.floor((alvo - atual) / 86_400_000 / periodo) * periodo;
    if (dias <= 0) return inicio;
    const novo = inicio.clone();
    novo.adjust(dias, 0, 0, 0);
    return novo;
}

export function lerReunioes(ICAL: any, ics: string, de: string, ate: string): Reuniao[] {
    const cal = new ICAL.Component(ICAL.parse(ics));
    for (const tz of cal.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

    // Exceções de uma série vêm como VEVENT com RECURRENCE-ID e o mesmo UID
    const vevents = cal.getAllSubcomponents("vevent");
    const excecoes: Record<string, any[]> = {};
    const mestres: any[] = [];
    for (const v of vevents) {
        const uid = v.getFirstPropertyValue("uid") || "";
        if (v.hasProperty("recurrence-id")) (excecoes[uid] ||= []).push(v);
        else mestres.push(v);
    }

    // Corte grosso pela data "de parede" de cada evento, com dois dias de
    // folga para os fusos; o corte certo faz-se depois, em Lisboa. Comparar
    // ICAL.Time com fusos é caro, e um calendário com anos de histórico
    // passa o limite de CPU que o servidor dá a cada pedido.
    const dia = (t: any) => t.year * 10000 + t.month * 100 + t.day;
    const deN  = Number(somarDias(de, -2).replaceAll("-", ""));
    const ateN = Number(somarDias(ate, 2).replaceAll("-", ""));
    const naJanela = (inicio: any, fim: any) =>
        dia(inicio) <= ateN && dia(fim || inicio) >= deN;
    const saida: Reuniao[] = [];

    const juntar = (uid: string, item: any, inicio: any, fim: any) => {
        if (String(item.component.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED") return;
        const a = local(inicio);
        const base = {
            titulo: texto(item.summary) || "(sem título)",
            local: texto(item.location),
            notas: texto(item.description),
        };
        if (inicio.isDate) {
            // Dia inteiro: o fim é exclusivo; aparece em cada dia que ocupa
            const ultimo = fim ? somarDias(local(fim).data, -1) : a.data;
            for (let d = a.data; d <= ultimo && d <= ate; d = somarDias(d, 1)) {
                if (d < de) continue;
                saida.push({ id: `${uid}|${d}`, data: d, hora_inicio: null, hora_fim: null, dia_inteiro: true, ...base });
            }
            return;
        }
        if (a.data < de || a.data > ate) return;
        const b = fim ? local(fim) : null;
        saida.push({
            id: `${uid}|${a.data}T${a.hora}`,
            data: a.data,
            hora_inicio: a.hora,
            hora_fim: b && b.data === a.data ? b.hora : null,
            dia_inteiro: false,
            ...base,
        });
    };

    for (const v of mestres) {
        // new ICAL.Event é caro: os eventos soltos fora da janela ficam logo de fora
        if (!v.hasProperty("rrule") && !v.hasProperty("rdate") && !excecoes[v.getFirstPropertyValue("uid") || ""]) {
            const ini = v.getFirstPropertyValue("dtstart");
            const fim = v.getFirstPropertyValue("dtend");
            // Sem DTEND (só DURATION) não se sabe aqui até onde vai: segue para o ICAL.Event
            if (!ini || (fim || !v.hasProperty("duration")) && !naJanela(ini, fim)) continue;
        }
        const ev = new ICAL.Event(v);
        const uid = ev.uid || "";
        for (const x of excecoes[uid] || []) ev.relateException(x);
        delete excecoes[uid];

        if (!ev.startDate) continue;
        if (!ev.isRecurring()) {
            if (naJanela(ev.startDate, ev.endDate)) juntar(uid, ev, ev.startDate, ev.endDate);
            continue;
        }
        // Repetições de vários dias que começam antes da janela ainda a tocam
        const durDias = Math.ceil(Math.max(0, ev.duration?.toSeconds?.() || 0) / 86_400);
        let desde = Number(somarDias(de, -2 - durDias).replaceAll("-", ""));
        // Uma exceção dentro da janela pode vir de uma data antiga da série:
        // a série tem de começar antes dessa data original
        for (const x of Object.values<any>(ev.exceptions || {})) {
            if (naJanela(x.startDate, x.endDate)) desde = Math.min(desde, dia(x.recurrenceId));
        }
        const it = ev.iterator(avancar(ev, desde));
        let t, n = 0;
        while ((t = it.next()) && n++ < MAX_REPETICOES) {
            const d = dia(t);
            if (d > ateN) break;
            if (d < desde) continue;
            const o = ev.getOccurrenceDetails(t);
            if (naJanela(o.startDate, o.endDate)) juntar(uid, o.item, o.startDate, o.endDate);
        }
    }

    // Exceções cuja série não veio no ficheiro: mostram-se tal como estão
    for (const [uid, lista] of Object.entries(excecoes)) {
        for (const v of lista) {
            const ev = new ICAL.Event(v);
            if (ev.startDate && naJanela(ev.startDate, ev.endDate)) juntar(uid, ev, ev.startDate, ev.endDate);
        }
    }

    return saida.sort((x, y) =>
        x.data.localeCompare(y.data) ||
        (x.hora_inicio || "").localeCompare(y.hora_inicio || "") ||
        x.titulo.localeCompare(y.titulo));
}
