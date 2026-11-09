// =======================================================
// SERVICE WORKER — só para os avisos no telemóvel.
// Não guarda páginas em cache: a app continua a vir sempre do GitHub
// Pages, como até aqui (assim nunca fica presa numa versão antiga).
//
// Recebe o aviso enviado pela função "avisos" do Supabase e mostra-o.
// Ao tocar no aviso, abre (ou traz para a frente) a página indicada.
// =======================================================

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; }
    catch { d = { corpo: e.data ? e.data.text() : "" }; }
    const titulo = d.titulo || "Maia Solutions";
    e.waitUntil(self.registration.showNotification(titulo, {
        body: d.corpo || "",
        icon: "img/icone-192.png",
        badge: "img/icone-192.png",
        tag: d.tag || undefined,
        data: { url: d.url || "admin.html" },
    }));
});

self.addEventListener("notificationclick", e => {
    e.notification.close();
    // Só abre páginas da própria app (o endereço vem da nossa função, mas
    // confirma-se na mesma que fica dentro do sítio da app)
    const alvo = new URL(e.notification.data?.url || "admin.html", self.registration.scope);
    const url = alvo.href.startsWith(self.registration.scope) ? alvo.href : self.registration.scope + "admin.html";
    e.waitUntil((async () => {
        const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of abertas) {
            if (c.url.split("#")[0].split("?")[0] === url.split("#")[0].split("?")[0] && "focus" in c) return c.focus();
        }
        return self.clients.openWindow(url);
    })());
});
