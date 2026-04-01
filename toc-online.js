// =======================================================
// INTEGRAÇÃO TOC ONLINE — Maia Solutions
// OAuth2 client_credentials → Clientes, Fornecedores, Faturas
// =======================================================

const TOC = (() => {

    let _config = {
        clientId: '', clientSecret: '',
        apiBase: '', oauthUrl: '',
    };
    let _token = null, _tokenExp = 0;

    function carregarConfig() {
        const s = localStorage.getItem('toc_config');
        if (s) _config = { ..._config, ...JSON.parse(s) };
    }
    function guardarConfig(cfg) {
        _config = { ..._config, ...cfg };
        localStorage.setItem('toc_config', JSON.stringify(_config));
    }
    function estaConfigurado() {
        return !!(_config.clientId && _config.clientSecret && _config.apiBase && _config.oauthUrl);
    }

    async function obterToken() {
        if (_token && Date.now() < _tokenExp - 60000) return _token;
        const r = await fetch(_config.oauthUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: _config.clientId,
                client_secret: _config.clientSecret,
                scope: 'openid'
            })
        });
        if (!r.ok) throw new Error('TOC auth falhou: ' + r.status);
        const d = await r.json();
        _token = d.access_token;
        _tokenExp = Date.now() + (d.expires_in || 3600) * 1000;
        return _token;
    }

    async function api(path, opts = {}) {
        const token = await obterToken();
        const r = await fetch(_config.apiBase + path, {
            ...opts,
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) }
        });
        if (!r.ok) throw new Error('TOC API ' + path + ': ' + r.status);
        return r.json();
    }

    async function listarClientes(q = '') {
        const p = q ? '?filter[search]=' + encodeURIComponent(q) : '';
        const d = await api('/customers' + p);
        return (d.data || []).map(c => ({
            id: c.id,
            nome: c.attributes?.name || '',
            nif: c.attributes?.tax_registration_number || '',
            email: c.attributes?.email || '',
            tel: c.attributes?.phone || '',
            morada: [c.attributes?.address, c.attributes?.city, c.attributes?.postal_code].filter(Boolean).join(', '),
        }));
    }

    async function listarFornecedores(q = '') {
        const p = q ? '?filter[search]=' + encodeURIComponent(q) : '';
        const d = await api('/suppliers' + p);
        return (d.data || []).map(f => ({
            id: f.id, nome: f.attributes?.name || '',
            nif: f.attributes?.tax_registration_number || '', email: f.attributes?.email || '',
        }));
    }

    async function listarServicos(q = '') {
        const p = q ? '?filter[search]=' + encodeURIComponent(q) : '';
        const d = await api('/items' + p);
        return (d.data || []).map(s => ({
            id: s.id, codigo: s.attributes?.item_code || '',
            descricao: s.attributes?.name || '',
            preco: parseFloat(s.attributes?.price || 0),
            unidade: s.attributes?.unit || 'un',
        }));
    }

    async function listarFaturasVenda(ini, fim) {
        const d = await api('/sale_invoices?filter[date][from]=' + ini + '&filter[date][to]=' + fim);
        return (d.data || []).map(f => ({
            id: f.id, numero: f.attributes?.document_number || '',
            data: f.attributes?.date || '', cliente: f.attributes?.customer_name || '',
            valor_base: parseFloat(f.attributes?.net_amount || 0),
            iva: parseFloat(f.attributes?.tax_amount || 0),
            valor_total: parseFloat(f.attributes?.gross_amount || 0),
            pago: f.attributes?.payment_status === 'paid',
        }));
    }

    async function listarFaturasCompra(ini, fim) {
        const d = await api('/purchase_invoices?filter[date][from]=' + ini + '&filter[date][to]=' + fim);
        return (d.data || []).map(f => ({
            id: f.id, numero: f.attributes?.document_number || '',
            data: f.attributes?.date || '', fornecedor: f.attributes?.supplier_name || '',
            valor_base: parseFloat(f.attributes?.net_amount || 0),
            iva: parseFloat(f.attributes?.tax_amount || 0),
            valor_total: parseFloat(f.attributes?.gross_amount || 0),
            pago: f.attributes?.payment_status === 'paid',
        }));
    }

    async function sincronizarMes(ano, mes) {
        const ini = `${ano}-${String(mes).padStart(2,'0')}-01`;
        const fim = `${ano}-${String(mes).padStart(2,'0')}-${new Date(ano, mes, 0).getDate()}`;
        const [fv, fc] = await Promise.all([listarFaturasVenda(ini, fim), listarFaturasCompra(ini, fim)]);
        const { data: fornsSB } = await SB.from('fornecedores').select('id, nome');
        const fornMap = {};
        (fornsSB || []).forEach(f => { fornMap[f.nome.toLowerCase()] = f.id; });

        const movs = [
            ...fv.map(f => ({
                referencia: f.numero, data_documento: f.data, tipo: 'entrada',
                cliente_nome: f.cliente, valor_base: f.valor_base, iva: f.iva,
                valor_total: f.valor_total, estado_pagamento: f.pago ? 'pago' : 'por_pagar',
                ativo: true, fonte: 'toc_online', fonte_id: String(f.id),
            })),
            ...fc.map(f => ({
                referencia: f.numero, data_documento: f.data, tipo: 'saida',
                fornecedor_id: fornMap[f.fornecedor.toLowerCase()] || null,
                valor_base: f.valor_base, iva: f.iva, valor_total: f.valor_total,
                estado_pagamento: f.pago ? 'pago' : 'por_pagar',
                ativo: true, fonte: 'toc_online', fonte_id: String(f.id),
            })),
        ];

        if (!movs.length) return { ok: true, importados: 0 };

        // Remover registos TOC deste mês antes de reinserir
        await SB.from('movimentos_financeiros').delete()
            .eq('fonte', 'toc_online').gte('data_documento', ini).lte('data_documento', fim);

        const { error } = await SB.from('movimentos_financeiros').insert(movs);
        if (error) throw new Error(error.message);
        return { ok: true, importados: movs.length, entradas: fv.length, saidas: fc.length };
    }

    return { carregarConfig, guardarConfig, estaConfigurado, listarClientes, listarFornecedores, listarServicos, listarFaturasVenda, listarFaturasCompra, sincronizarMes };
})();

TOC.carregarConfig();
