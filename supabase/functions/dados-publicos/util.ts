// Contas que não precisam da internet, separadas para se poderem testar.

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano)
export function pascoa(ano: number): Date {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(ano, mes - 1, dia));
}

// Feriados nacionais obrigatórios (Código do Trabalho, art. 234.º).
// O Carnaval e o feriado municipal não são obrigatórios e ficam de fora.
export function feriadosCalculados(ano: number) {
    const p = pascoa(ano);
    const mais = (dias: number) => {
        const d = new Date(p);
        d.setUTCDate(d.getUTCDate() + dias);
        return d.toISOString().slice(0, 10);
    };
    const fixo = (mes: number, dia: number) =>
        `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    return [
        { data: fixo(1, 1),   nome: "Ano Novo" },
        { data: mais(-2),     nome: "Sexta-feira Santa" },
        { data: mais(0),      nome: "Páscoa" },
        { data: fixo(4, 25),  nome: "Dia da Liberdade" },
        { data: fixo(5, 1),   nome: "Dia do Trabalhador" },
        { data: mais(60),     nome: "Corpo de Deus" },
        { data: fixo(6, 10),  nome: "Dia de Portugal" },
        { data: fixo(8, 15),  nome: "Assunção de Nossa Senhora" },
        { data: fixo(10, 5),  nome: "Implantação da República" },
        { data: fixo(11, 1),  nome: "Dia de Todos-os-Santos" },
        { data: fixo(12, 1),  nome: "Restauração da Independência" },
        { data: fixo(12, 8),  nome: "Imaculada Conceição" },
        { data: fixo(12, 25), nome: "Natal" },
    ].sort((x, y) => x.data.localeCompare(y.data));
}

// NIF português: 9 dígitos, o último é o dígito de controlo (módulo 11).
export function nifValido(nif: string): boolean {
    if (!/^[1235689]\d{8}$/.test(nif) && !/^(45|70|71|72|74|75|77|79|90|91|98|99)\d{7}$/.test(nif)) {
        return false;
    }
    let soma = 0;
    for (let i = 0; i < 8; i++) soma += Number(nif[i]) * (9 - i);
    const resto = soma % 11;
    const controlo = resto < 2 ? 0 : 11 - resto;
    return controlo === Number(nif[8]);
}
