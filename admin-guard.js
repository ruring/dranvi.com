(function () {
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (localHosts.has(window.location.hostname)) return;

    document.addEventListener('DOMContentLoaded', () => {
        document.body.className = 'family-os';
        document.body.innerHTML = `
            <div class="family-shell">
                <main class="family-panel">
                    <p class="eyebrow">Admin Locked</p>
                    <h1>관리자 페이지는 로컬 서버에서만 사용합니다.</h1>
                    <p class="plant-copy">DRANVI FAMILY 원장은 이 PC 또는 NAS 서버에 보관됩니다. 공개 도메인에서는 관리자 기능을 열지 않습니다.</p>
                    <p><a class="soft-button" href="../family/">Family로 돌아가기</a></p>
                </main>
            </div>
        `;
    });
})();
