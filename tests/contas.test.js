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
vm.runInContext(ler("rh.js") + "\n;globalThis.__rh = { valorDoRegisto, basePagamento, rhValorOrdenado, rhDiasPagos, custoDiaFunc, rhFaltasPorMotivo, rhFracaoFalta, rhPagaDiaInteiro, ePagamentoOrdenado, rhPagamentosDoMes, rhEstadoPagamento, rhChaveNome };", rh);
const { valorDoRegisto, basePagamento, rhValorOrdenado, rhDiasPagos, custoDiaFunc, rhFaltasPorMotivo, rhFracaoFalta, rhPagaDiaInteiro, ePagamentoOrdenado, rhPagamentosDoMes, rhEstadoPagamento, rhChaveNome } = rh.__rh;

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

// Pagamentos parciais: um recibo de metade não dá a fatura como paga
const parc = vm.createContext({});
vm.runInContext(["semIva", "valorPagoMov", "semIvaPago", "mesmaRef", "valorDoReciboParaFatura"].map(n => funcaoDe("admin.js", n)).join("\n")
    + "\n;globalThis.__p = { valorPagoMov, semIvaPago, valorDoReciboParaFatura };", parc);
const { valorPagoMov, semIvaPago, valorDoReciboParaFatura } = parc.__p;
const ft12 = { id: "ft12", valor_base: 3135, valor_total: 3856.05, estado_pagamento: "por_pagar" };

test("fatura por receber sem recibos: recebido 0", () => {
    assert.equal(valorPagoMov(ft12, {}), 0);
    assert.equal(semIvaPago(ft12, {}), 0);
});
test("recibo parcial de 1930 €: conta só a parte recebida, sem IVA na mesma proporção", () => {
    const p = { ft12: [{ valor: 1930 }] };
    assert.equal(valorPagoMov(ft12, p), 1930);
    assert.ok(Math.abs(semIvaPago(ft12, p) - 3135 * 1930 / 3856.05) < 0.001);
});
test("fatura paga conta por inteiro, mesmo sem recibos registados", () => {
    const paga = { ...ft12, estado_pagamento: "pago" };
    assert.equal(valorPagoMov(paga, {}), 3856.05);
    assert.equal(semIvaPago(paga, {}), 3135);
});
test("recibos a mais nunca passam o total da fatura", () => {
    assert.equal(valorPagoMov(ft12, { ft12: [{ valor: 3000 }, { valor: 3000 }] }), 3856.05);
});
test("valor do recibo por fatura: o da linha da fatura, senão o total quando só paga uma", () => {
    const rc9 = { valor_recebido: 1930, faturas_liquidadas: [{ numero: "FT 2026/12", valor: 1930 }] };
    assert.equal(valorDoReciboParaFatura(rc9, "FT2026/12"), 1930);
    assert.equal(valorDoReciboParaFatura({ valor_recebido: 500, faturas_liquidadas: [{ numero: "FT 1", valor: null }] }, "FT 1"), 500);
    assert.equal(valorDoReciboParaFatura({ valor_recebido: 900, faturas_liquidadas: [{ numero: "FT 1" }, { numero: "FT 2" }] }, "FT 1"), null);
});

// Regra do meio dia (Alcindo, 17/11): a contrato (salário mensal) recebe
// 100% e o resto do dia é falta; à jornada recebe a parte do dia.
test("meio dia: só quem tem salário mensal leva falta no resto do dia", () => {
    assert.equal(rhPagaDiaInteiro({ salario_mensal: 920 }), true);
    assert.equal(rhPagaDiaInteiro({ valor_dia: 60 }), false);
});

test("falta de parte do dia vale (8 − horas) ÷ 8; sem presença vale 1", () => {
    assert.equal(rhFracaoFalta(4), 0.5);
    assert.equal(rhFracaoFalta(6), 0.25);
    assert.equal(rhFracaoFalta(0), 1);
    assert.equal(rhFracaoFalta(9), 0);
});

test("faltas por motivo somam meios dias; um dia em duas obras conta as horas juntas", () => {
    const regs = [
        { data: "2026-11-02", tipo: "falta", horas: 0, motivo: "injustificada" },            // dia inteiro
        { data: "2026-11-03", tipo: "presenca", horas: 4 },
        { data: "2026-11-03", tipo: "falta", horas: 0, motivo: "injustificada" },            // meio dia
        { data: "2026-11-04", tipo: "presenca", horas: 3 }, { data: "2026-11-04", tipo: "presenca", horas: 3 },
        { data: "2026-11-04", tipo: "falta", horas: 0 },                                     // 2 h sem motivo
    ];
    const f = rhFaltasPorMotivo(regs);
    assert.equal(f.injustificada, 1.5);
    assert.equal(f.sem_motivo, 0.25);
});

test("salário mensal: meio dia sem motivo não desconta; injustificada desconta meio dia", () => {
    const fixo = { salario_mensal: 1300 };
    const dia = 1300 * 12 / 260;
    assert.equal(rhValorOrdenado(fixo, 20, { sem_motivo: 0.5 }).valor, 1300);
    assert.equal(rhValorOrdenado(fixo, 20, { injustificada: 0.5 }).valor, 1300 - dia / 2);
    assert.match(rhValorOrdenado(fixo, 20, { injustificada: 0.5 }).nota, /−0,5 falta/);
});

// Composição de custo da Biblioteca de serviços (estrutura DDC, preços nossos)
const comp = vm.createContext({ _bibArtigos: [{ id: "a1", preco_atual: 8 }, { id: "a2", preco_atual: null }] });
vm.runInContext(funcaoDe("admin.js", "custoComposicao") + "\n;globalThis.__c = custoComposicao;", comp);
const custoComposicao = comp.__c;

test("composição: MO por dia ÷ rendimento + material com perdas + equipamento, vezes a margem", () => {
    const s = { rendimento_mo: 20, custo_mo_dia: 240, equipamento_unidade: 1, margem: 1.3 };
    const mats = [
        { descricao: "Cola", quantidade: 5, artigo_id: "a1", perdas_pct: 10 },      // 5 × 1,1 × 8 = 44
        { descricao: "Rede", quantidade: 1.1, preco_manual: 2 },                     // 2,2
    ];
    const c = custoComposicao(s, mats);
    assert.equal(c.mo, 12);
    assert.equal(c.mat, 46.2);
    assert.equal(c.custo, 59.2);
    assert.equal(c.preco, 76.96);
    assert.equal(JSON.stringify(c.faltam), "[]");
});

test("composição: diz o que falta (rendimento, preço do artigo) e não inventa", () => {
    const c = custoComposicao({ rendimento_mo: null }, [{ descricao: "Tinta", quantidade: 0.3, artigo_id: "a2" }]);
    assert.equal(c.mo, null);
    assert.equal(c.custo, 0);
    assert.equal(JSON.stringify(c.faltam), JSON.stringify(["rendimento da mão de obra", "preço de Tinta"]));
});

// Assistente › "faturas por pagar": o que falta pagar de cada fatura.
// A função está em TypeScript (Edge Function): tiram-se os ": any" para correr aqui.
const assist = vm.createContext({});
vm.runInContext(funcaoDe("supabase/functions/assistente/index.ts", "emFaltaFatura").replace(/: any/g, "")
    + "\n;globalThis.__f = emFaltaFatura;", assist);
const emFaltaFatura = assist.__f;

test("assistente: fatura por pagar sem recibos fica em falta pelo total", () => {
    assert.equal(emFaltaFatura("1230.50", undefined), 1230.5);
});

test("assistente: pagamentos parciais descontam, em cêntimos certos", () => {
    assert.equal(emFaltaFatura(100.1, 33.4), 66.7);      // 100,1 − 33,4 dava 66,69999…
    assert.equal(emFaltaFatura(500, 500), 0);
});

test("assistente: pago a mais nunca dá valor negativo em falta", () => {
    assert.equal(emFaltaFatura(100, 120), 0);
});

// ---- Pagamentos de ordenados no Fluxo de caixa ----
test("recibos e pagamentos dos Ordenados não somam no DRE; uma fatura normal soma", () => {
    assert.equal(ePagamentoOrdenado({ fonte: "email_recibos" }), true);
    assert.equal(ePagamentoOrdenado({ fonte: "ordenados" }), true);
    assert.equal(ePagamentoOrdenado({ referencia: "Recibo vencimento 10/2026" }), true);
    assert.equal(ePagamentoOrdenado({ fonte: null, referencia: "Mão de obra extra" }), false);
});

test("o nome do recibo do e-mail é o primeiro nome sem acentos", () => {
    assert.equal(rhChaveNome("Gabriel Cândido"), "gabriel");
    assert.equal(rhChaveNome("Ângelo Sá"), "angelo");
});

test("pagamentos do mês: só os da pessoa e do mês certos", () => {
    const f = { id: "f1", nome: "Jacob Lucas" }, t = { id: "t1", nome: "Pai" };
    const movs = [
        { fonte: "email_recibos", fonte_id: "abc#jacob", referencia: "Recibo vencimento 10/2026", valor_total: 876 },
        { fonte: "email_recibos", fonte_id: "abd#jacob", referencia: "Recibo vencimento 09/2026", valor_total: 870 },
        { fonte: "ordenados", fonte_id: "2026-10#t1#1", valor_total: 500 },
        { fonte: "ordenados", fonte_id: "2026-10#t1#2", valor_total: 100, ativo: false },
        { fonte: "ordenados", fonte_id: "2026-11#t1#3", valor_total: 300 },
    ];
    assert.equal(rhPagamentosDoMes(f, "2026-10", movs).length, 1);
    assert.deepEqual(rhPagamentosDoMes(t, "2026-10", movs).map(m => m.valor_total), [500]);
});

test("estado do pagamento à jornada: por pagar, parte, pago, a mais", () => {
    const t = { valor_dia: 100 };
    assert.equal(rhEstadoPagamento(t, 600, [], true).estado, "por_pagar");
    const parte = rhEstadoPagamento(t, 600, [{ valor_total: 500 }], true);
    assert.equal(parte.estado, "parte"); assert.equal(parte.falta, 100);
    assert.equal(rhEstadoPagamento(t, 600, [{ valor_total: 600 }], true).estado, "pago");
    assert.equal(rhEstadoPagamento(t, 600, [{ valor_total: 700 }], true).estado, "a_mais");
    assert.equal(rhEstadoPagamento(t, 0, [], true).estado, "nada");
});

test("com salário mensal só se diz se o recibo foi lançado (o recibo traz o líquido)", () => {
    const s = { salario_mensal: 1000 };
    assert.equal(rhEstadoPagamento(s, 1000, [{ valor_total: 876 }], true).estado, "recibo");
    assert.equal(rhEstadoPagamento(s, 1000, [], true).estado, "recibo_em_falta");
    assert.equal(rhEstadoPagamento(s, 1000, [], false).estado, "recibo_fim_mes");
});
