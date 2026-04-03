// =======================================================
// IMPORTADOR SAF-T — Maia Solutions
// Lê o ficheiro SAF-T (XML) exportado do TOC Online
// e importa as faturas para o Fluxo de Caixa no Supabase
// =======================================================

async function importarSAFT(ficheiro) {
    const msg = document.getElementById('saftMsg');
    if (!ficheiro) { msg.textContent = 'Selecciona um ficheiro SAF-T (.xml)'; return; }

    msg.textContent = 'A ler ficheiro…'; msg.style.color = '';

    try {
        const texto = await ficheiro.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(texto, 'text/xml');

        // Verificar se é SAF-T válido
        const root = xml.documentElement;
        if (!root || root.tagName !== 'AuditFile') {
            msg.textContent = '✗ Ficheiro inválido. Selecciona um SAF-T exportado do TOC Online.';
            msg.style.color = 'var(--color-err)'; return;
        }

        // ── Extrair faturas de venda ──────────────────────────────
        const faturasVenda = [];
        xml.querySelectorAll('SalesInvoices > Invoice').forEach(inv => {
            const num    = inv.querySelector('InvoiceNo')?.textContent || '';
            const data   = inv.querySelector('InvoiceDate')?.textContent || '';
            const tipo   = inv.querySelector('InvoiceType')?.textContent || '';
            const total  = parseFloat(inv.querySelector('DocumentTotals > GrossTotal')?.textContent || 0);
            const base   = parseFloat(inv.querySelector('DocumentTotals > NetTotal')?.textContent || 0);
            const iva    = parseFloat(inv.querySelector('DocumentTotals > TaxPayable')?.textContent || 0);
            const cliente = inv.querySelector('CustomerID')?.textContent || '';
            const estado = inv.querySelector('DocumentStatus > InvoiceStatus')?.textContent || 'N';

            if (tipo === 'FT' || tipo === 'FR' || tipo === 'FS' || tipo === 'VD') {
                faturasVenda.push({
                    referencia: num,
                    data_documento: data,
                    tipo: 'entrada',
                    cliente_nome: cliente,
                    valor_base: base,
                    iva: iva,
                    valor_total: total,
                    estado_pagamento: estado === 'N' ? 'pago' : 'por_pagar',
                    ativo: true,
                    fonte: 'saft',
                    fonte_id: num,
                    observacoes: `SAF-T import — ${tipo}`
                });
            }
        });

        // ── Extrair faturas de compra (pagamentos a fornecedores) ──
        const faturasCompra = [];
        const { data: fornsSB } = await SB.from('fornecedores').select('id, nome');
        const fornMap = {};
        (fornsSB || []).forEach(f => { fornMap[f.nome.toLowerCase()] = f.id; });

        xml.querySelectorAll('Payments > Payment').forEach(pag => {
            const num   = pag.querySelector('PaymentRefNo')?.textContent || '';
            const data  = pag.querySelector('TransactionDate')?.textContent || '';
            const total = parseFloat(pag.querySelector('DocumentTotals > GrossTotal')?.textContent || 0);
            const base  = parseFloat(pag.querySelector('DocumentTotals > NetTotal')?.textContent || 0);
            const iva   = parseFloat(pag.querySelector('DocumentTotals > TaxPayable')?.textContent || 0);
            const tipo  = pag.querySelector('PaymentType')?.textContent || '';
            const estado = pag.querySelector('DocumentStatus > PaymentStatus')?.textContent || 'N';

            if (tipo === 'RC' || tipo === 'RG') {
                faturasCompra.push({
                    referencia: num,
                    data_documento: data,
                    tipo: 'saida',
                    valor_base: base,
                    iva: iva,
                    valor_total: total,
                    estado_pagamento: estado === 'N' ? 'pago' : 'por_pagar',
                    ativo: true,
                    fonte: 'saft',
                    fonte_id: num,
                });
            }
        });

        const todos = [...faturasVenda, ...faturasCompra]
            .filter(m => m.valor_total > 0 && m.data_documento);

        if (todos.length === 0) {
            msg.textContent = '⚠ Nenhuma fatura encontrada no ficheiro SAF-T.';
            msg.style.color = 'var(--color-warn)'; return;
        }

        // Remover importações SAF-T anteriores e reinserir
        await SB.from('movimentos_financeiros').delete().eq('fonte', 'saft');

        const { error } = await SB.from('movimentos_financeiros').insert(todos);
        if (error) throw new Error(error.message);

        msg.textContent = `✓ ${todos.length} movimentos importados (${faturasVenda.length} vendas, ${faturasCompra.length} compras)`;
        msg.style.color = 'var(--color-ok)';

        // Actualizar fluxo de caixa
        if (typeof initFluxo === 'function') initFluxo();

    } catch(e) {
        msg.textContent = '✗ Erro: ' + e.message;
        msg.style.color = 'var(--color-err)';
    }
}
