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

    // Margem de um dia para os fusos: o corte certo faz-se depois, em Lisboa
    const limite = ICAL.Time.fromDateString(somarDias(ate, 2));
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
        const ev = new ICAL.Event(v);
        const uid = ev.uid || "";
        for (const x of excecoes[uid] || []) ev.relateException(x);
        delete excecoes[uid];

        if (!ev.startDate) continue;
        if (!ev.isRecurring()) {
            juntar(uid, ev, ev.startDate, ev.endDate);
            continue;
        }
        const it = ev.iterator();
        let t, n = 0;
        while ((t = it.next()) && n++ < MAX_REPETICOES) {
            if (t.compare(limite) > 0) break;
            const o = ev.getOccurrenceDetails(t);
            juntar(uid, o.item, o.startDate, o.endDate);
        }
    }

    // Exceções cuja série não veio no ficheiro: mostram-se tal como estão
    for (const [uid, lista] of Object.entries(excecoes)) {
        for (const v of lista) {
            const ev = new ICAL.Event(v);
            if (ev.startDate) juntar(uid, ev, ev.startDate, ev.endDate);
        }
    }

    return saida.sort((x, y) =>
        x.data.localeCompare(y.data) ||
        (x.hora_inicio || "").localeCompare(y.hora_inicio || "") ||
        x.titulo.localeCompare(y.titulo));
}
