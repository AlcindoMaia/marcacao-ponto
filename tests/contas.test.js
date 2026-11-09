// Testes das contas de dinheiro. Correm com:  node --test   (na raiz do repositório)
// Sem nada para instalar: lê os ficheiros da app como estão e executa as
// funções verdadeiras, em vez de as copiar para aqui.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.join(__dirname, "..");
const ler = f => fs.readFileSync(path.join(raiz, f), "utf8");

// rh.js não toca na página ao carregar: corre inteiro num contexto isolado
const rh = vm.createContext({});
vm.runInContext(ler("rh.js") + "\n;globalThis.__rh = { valorDoRegisto, basePagamento, rhValorOrdenado, rhDiasPagos, custoDiaFunc };", rh);
const { valorDoRegisto, basePagamento, rhValorOrdenado, rhDiasPagos, custoDiaFunc } = rh.__rh;

// admin.js mexe na página ao carregar: tiram-se só as funções que se testam
function funcaoDe(ficheiro, nome) {
    const src = ler(ficheiro);
    const i = src.indexOf(`function ${nome}(`);
    assert.ok(i >= 0, `${nome} não encontrada em ${ficheiro}`);
    let n = 0, j = src.indexOf("{", i);
    for (let k = j; k < src.length; k++) {
        if (src[k] === "{") n++;
        else if (src[k] === "}" && --n === 0) { j = k + 1; break; }
    }
    return src.slice(i, j);
}
const adm = vm.createContext({});
vm.runInContext([funcaoDe("admin.js", "semIva"), funcaoDe("admin.js", "orcSemIva")].join("\n")
    + "\n;globalThis.__adm = { semIva, orcSemIva };", adm);
const { semIva, orcSemIva } = adm.__adm;

const temporario  = { valor_dia: 50 };
const assalariado = { valor_dia: 45, salario_mensal: 1000 };

test("temporário: um dia inteiro numa obra vale o valor/dia", () => {
    assert.equal(valorDoRegisto(temporario, 8, 8), 50);
});

test("temporário: meio dia paga metade (decisão do Alcindo, 09/11)", () => {
    assert.equal(valorDoRegisto(temporario, 4, 4), 25);
});

test("temporário: mais de 8 h num dia paga um dia, não mais", () => {
    assert.equal(valorDoRegisto(temporario, 10, 10), 50);
});

test("temporário: um dia em duas obras reparte-se pelas horas e soma o valor/dia", () => {
    const a = valorDoRegisto(temporario, 6, 8), b = valorDoRegisto(temporario, 2, 8);
    assert.equal(a, 37.5);
    assert.equal(b, 12.5);
    assert.equal(a + b, 50);
});

test("com salário mensal não há valor por registo, mesmo com valor/dia preenchido", () => {
    assert.equal(valorDoRegisto(assalariado, 8, 8), null);
    assert.equal(basePagamento(assalariado), "salário mensal");
    assert.equal(basePagamento(temporario), "à jornada");
});

test("sem valor/dia nem horas não se inventa um valor", () => {
    assert.equal(valorDoRegisto({}, 8, 8), null);
    assert.equal(valorDoRegisto(temporario, 0, 0), null);
    assert.equal(valorDoRegisto(null, 8, 8), null);
});

test("Ordenados: temporário recebe dias pagos × valor/dia", () => {
    assert.equal(rhValorOrdenado(temporario, 20).valor, 1000);
    // 3 dias: um inteiro, um meio dia, um dia repartido por duas obras
    const pres = [{ data: "2026-11-02", horas: 8 }, { data: "2026-11-03", horas: 4 },
                  { data: "2026-11-04", horas: 6 }, { data: "2026-11-04", horas: 2 }];
    assert.equal(rhDiasPagos(pres), 2.5);
    assert.equal(rhValorOrdenado(temporario, 3, {}, rhDiasPagos(pres)).valor, 125);
    assert.match(rhValorOrdenado(temporario, 3, {}, 2.5).nota, /meio dia paga metade/);
});

test("Ordenados: assalariado recebe o salário, menos as injustificadas", () => {
    assert.equal(rhValorOrdenado(assalariado, 22).valor, 1000);
    const dia = 1000 * 12 / 260;
    assert.ok(Math.abs(rhValorOrdenado(assalariado, 21, { injustificada: 1 }).valor - (1000 - dia)) < 1e-9);
});

test("custo de um dia de quem tem salário: 14 meses + TSU ÷ 220 dias úteis", () => {
    assert.ok(Math.abs(custoDiaFunc(assalariado) - 1000 * 14 * 1.2375 / 220) < 1e-9);
    assert.equal(custoDiaFunc(temporario), 50);
});

test("semIva: IVA a 0 % (autoliquidação) fica com a base, não cai para o total", () => {
    assert.equal(semIva({ valor_base: 1000, valor_total: 1000 }), 1000);
    assert.equal(semIva({ valor_base: 0, valor_total: 0 }), 0);
    assert.equal(semIva({ valor_base: 100, valor_total: 123 }), 100);
});

test("orcSemIva: orçamento de PDF só com o total com IVA tira o IVA da taxa", () => {
    assert.ok(Math.abs(orcSemIva({ total_sem_iva: 0, total_com_iva: 1230, taxa_iva: 23 }) - 1000) < 1e-9);
    assert.equal(orcSemIva({ total_sem_iva: 500, total_com_iva: 615 }), 500);
    assert.ok(Math.abs(orcSemIva({ total_com_iva: 1060, taxa_iva: 6 }) - 1000) < 1e-9);
});
