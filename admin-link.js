(function () {
    const LOCAL_ADMIN = 'http://localhost:3000/admin/';
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

    function localServerUp() {
        return new Promise((resolve) => {
            const controller = new AbortController();
            const timer = setTimeout(() => {
                controller.abort();
                resolve(false);
            }, 1200);
            fetch('http://localhost:3000/api/health', {
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal
            }).then(() => {
                clearTimeout(timer);
                resolve(true);
            }).catch(() => {
                clearTimeout(timer);
                resolve(false);
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        // On localhost the plain relative links already point at the local admin.
        if (localHosts.has(window.location.hostname)) return;

        document.querySelectorAll('a[href$="admin/"]').forEach((link) => {
            link.addEventListener('click', async (event) => {
                event.preventDefault();
                const fallback = link.href;
                window.location.href = (await localServerUp()) ? LOCAL_ADMIN : fallback;
            });
        });
    });
})();
