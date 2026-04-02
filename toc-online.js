// =======================================================
// INTEGRAÇÃO TOC ONLINE — Maia Solutions
// Fluxo OAuth2 Authorization Code via Supabase Edge Function
// =======================================================

const TOC = (() => {

    const SUPABASE_PROJECT = 'npyosbigynxmxdakcymg';
    const PROXY_URL = `https://${SUPABASE_PROJECT}.supabase.co/functions/v1/toc-proxy`;

    let _token = null;

    // ── Guardar/carregar token ────────────────────────────────────
    function carregarToken() {
        _token = localStorage.getItem('toc_access_token');
        // Ver se veio no URL fragment após o callback OAuth
        const hash = window.location.hash;
        if (hash.includes('toc_token=')) {
            const m = hash.match(/toc_token=([^&]+)/);
            if (m) {
                _token = decodeURIComponent(m[1]);
                localStorage.setItem('toc_access_token', _token);
                // Limpar o fragment do URL
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    }

    function estaAutenticado() { return !!_token; }
    function estaConfigurado() { return true; } // configuração está na Edge Function

    // ── Iniciar fluxo de autorização ─────────────────────────────
    function iniciarAutorizacao() {
        // Construir o URL de autorização directamente (sem fetch para não bloquear popup)
        const cfg = JSON.parse(localStorage.getItem('toc_config') || '{}');
        const clientId  = cfg.clientId  || '';
        const oauthUrl  = cfg.oauthUrl  || 'https://app35.toconline.pt/oauth';
        const redirectUri = PROXY_URL; // URI limpo sem query string — obrigatório no TOC Online

        if (!clientId) {
            throw new Error('Client ID não configurado. Guarda as credenciais primeiro.');
        }

        const params = new URLSearchParams({
            client_id:     clientId,
            redirect_uri:  redirectUri,
            response_type: 'code',
            scope:         'commercial',
        });

        const authUrl = `${oauthUrl}/auth?${params}`;

        // Abrir popup IMEDIATAMENTE (no mesmo tick do click — não pode ser após await)
        const popup = window.open(authUrl, 'toc_auth', 'width=620,height=720,left=200,top=100');

        if (!popup) {
            throw new Error('Popup bloqueado pelo browser. Permite popups para este site e tenta novamente.');
        }

        // Monitorizar o fecho do popup — quando fecha, verificar se o token chegou
        const check = setInterval(() => {
            try {
                // Tentar ler o URL do popup quando redireciona para o admin
                if (popup.location?.hash?.includes('toc_token=')) {
                    carregarToken();
                    clearInterval(check);
                    popup.close();
                }
            } catch(e) { /* cross-origin — popup ainda está no TOC */ }

            if (popup.closed) {
                clearInterval(check);
                carregarToken(); // Tentar carregar token mesmo assim
            }
        }, 500);

        // Timeout 3 minutos
        setTimeout(() => clearInterval(check), 180000);
    }

    function desligar() {
        _token = null;
        localStorage.removeItem('toc_access_token');
    }

    // ── Pedido autenticado via proxy ──────────────────────────────
    async function api(path) {
        if (!_token) throw new Error('Não autenticado no TOC Online. Clica em "Autorizar TOC".');
        const resp = await fetch(PROXY_URL, {
            headers: {
                'x-toc-path':  path,
                'x-toc-token': _token,
                'x-toc-action': 'api',
            }
        });
        if (resp.status === 401) {
            _token = null;
            localStorage.removeItem('toc_access_token');
            throw new Error('Token expirado. Autoriza novamente o TOC Online.');
        }
        if (!resp.ok) throw new Error('TOC API ' + path + ': ' + resp.status);
        return resp.json();
    }

    // ── CLIENTES ──────────────────────────────────────────────────
    async function listarClientes(q = '') {
        const p = q ? '?filter[search]=' + encodeURIComponent(q) : '';
        const d = await api('/customers' + p);
        return (d.data || []).map(c => ({
            id:     c.id,
            nome:   c.attributes?.name || '',
            nif:    c.attributes?.tax_registration_number || '',
            email:  c.attributes?.email || '',
            tel:    c.attributes?.phone || '',
            morada: [c.attributes?.address, c.attributes?.city, c.attributes?.postal_code].filter(Boolean).join(', '),
        }));
    }

    // ── FORNECEDORES ──────────────────────────────────────────────
    async function listarFornecedores(q = '') {
        const p = q ? '?filter[search]=' + encodeURIComponent(q) : '';
        const d = await api('/suppliers' + p);
        return (d.data || []).map(f => ({
            id:    f.id,
            nome:  f.attributes?.name || '',
            nif:   f.attributes?.tax_registration_number || '',
            email: f.attributes?.email || '',
        }));
    }

    // ── SERVIÇOS / ARTIGOS ────────────────────────────────────────
    async function listarServicos(q = '') {
        const p = q ? '?filter[search]=' + encodeURIComponent(q) : '';
        const d = await api('/items' + p);
        return (d.data || []).map(s => ({
            id:        s.id,
            codigo:    s.attributes?.item_code || '',
            descricao: s.attributes?.name || '',
            preco:     parseFloat(s.attributes?.price || 0),
            unidade:   s.attributes?.unit || 'un',
        }));
    }

    // ── FATURAS EMITIDAS ──────────────────────────────────────────
    async function listarFaturasVenda(ini, fim) {
        const d = await api(`/sale_invoices?filter[date][from]=${ini}&filter[date][to]=${fim}`);
        return (d.data || []).map(f => ({
            id:          f.id,
            numero:      f.attributes?.document_number || '',
            data:        f.attributes?.date || '',
            cliente:     f.attributes?.customer_name || '',
            valor_base:  parseFloat(f.attributes?.net_amount || 0),
            iva:         parseFloat(f.attributes?.tax_amount || 0),
            valor_total: parseFloat(f.attributes?.gross_amount || 0),
            pago:        f.attributes?.payment_status === 'paid',
        }));
    }

    // ── FATURAS DE COMPRA ─────────────────────────────────────────
    async function listarFaturasCompra(ini, fim) {
        const d = await api(`/purchase_invoices?filter[date][from]=${ini}&filter[date][to]=${fim}`);
        return (d.data || []).map(f => ({
            id:          f.id,
            numero:      f.attributes?.document_number || '',
            data:        f.attributes?.date || '',
            fornecedor:  f.attributes?.supplier_name || '',
            valor_base:  parseFloat(f.attributes?.net_amount || 0),
            iva:         parseFloat(f.attributes?.tax_amount || 0),
            valor_total: parseFloat(f.attributes?.gross_amount || 0),
            pago:        f.attributes?.payment_status === 'paid',
        }));
    }

    // ── SINCRONIZAR MÊS → Supabase ────────────────────────────────
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

        if (!movs.length) return { ok: true, importados: 0, entradas: 0, saidas: 0 };

        await SB.from('movimentos_financeiros').delete()
            .eq('fonte', 'toc_online').gte('data_documento', ini).lte('data_documento', fim);

        const { error } = await SB.from('movimentos_financeiros').insert(movs);
        if (error) throw new Error(error.message);
        return { ok: true, importados: movs.length, entradas: fv.length, saidas: fc.length };
    }

    // Carregar token ao iniciar (inclui verificar URL fragment)
    carregarToken();

    return {
        estaAutenticado, estaConfigurado,
        iniciarAutorizacao, desligar, carregarToken,
        listarClientes, listarFornecedores, listarServicos,
        listarFaturasVenda, listarFaturasCompra, sincronizarMes,
    };
})();
