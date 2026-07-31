(function () {
    const family = window.DRANVI_FAMILY || { plants: [] };
    // localStorage drafts are a local-server convenience only; on the public
    // site they can shadow freshly published data, so ignore them there.
    const isLocalRun = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    // On the public site, write through the tunnel endpoint when configured.
    const API_BASE = isLocalRun ? '' : (window.DRANVI_FAMILY_API || '');
    let serverPlants = [];
    let serverReady = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);
    }

    function readJson(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
        } catch (error) {
            return fallback;
        }
    }

    function getKeyFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('k') || params.get('key') || '';
    }

    function publicOrigin() {
        return 'https://dranvi.com';
    }

    // Photos saved by the live server are addressed relative to it (/uploads/...).
    // When the page runs on the public site, point those at the API host instead.
    function photoSrc(url) {
        if (!url) return '';
        return String(url).startsWith('/uploads/') ? `${API_BASE}${url}` : String(url);
    }

    async function loadServerPlants() {
        try {
            if (!isLocalRun && !API_BASE) throw new Error('no public API');
            const response = await fetch(`${API_BASE}/api/plants`, { cache: 'no-store' });
            if (!response.ok) throw new Error('API unavailable');
            const data = await response.json();
            serverPlants = data.plants || [];
            serverReady = true;
        } catch (error) {
            serverPlants = [];
            serverReady = false;
        }
    }

    function getPlants() {
        const adminPlants = isLocalRun ? readJson('dranvi-admin-plants', []) : [];
        const bySlug = new Map();
        [...family.plants, ...adminPlants, ...serverPlants].forEach((plant) => {
            if (plant && plant.slug) bySlug.set(plant.slug, plant);
        });
        return Array.from(bySlug.values());
    }

    function plantUrl(slug) {
        const existsAsFolder = family.plants.some((plant) => plant.slug === slug);
        return existsAsFolder ? `../dra/${slug}/` : `../dra/?n=${encodeURIComponent(slug)}`;
    }

    function getPlantFromPath() {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get('n') || params.get('plant');
        const fromPath = (window.location.pathname.match(/\/dra\/([^/]+)/) || [])[1];
        const slug = fromQuery || fromPath;
        return getPlants().find((plant) => plant.slug === slug);
    }

    function getDraftLogs(plantNumber) {
        if (!isLocalRun) return [];
        return readJson('dranvi-log-drafts', [])
            .filter((log) => log.plant === plantNumber)
            .map((log) => ({
                id: log.id,
                date: (log.createdAt || '').slice(0, 10).replaceAll('-', '.') || '오늘',
                title: log.title,
                content: log.content,
                hasPhoto: Boolean(log.hasPhoto),
                photoUrl: ''
            }));
    }

    function imageToDataUrl(file) {
        return new Promise((resolve, reject) => {
            if (!file || !file.name) {
                resolve('');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function renderFamily() {
        const grid = byId('plant-grid');
        if (!grid) return;

        grid.innerHTML = getPlants().map((plant) => `
            <a class="plant-card" href="${plantUrl(escapeHtml(plant.slug))}">
                <div>
                    <div class="plant-number">No.${escapeHtml(plant.number)}</div>
                    <h2>${escapeHtml(plant.name)}</h2>
                    <p>${escapeHtml(plant.guardian)}</p>
                    <p>${escapeHtml((plant.description || [])[0] || '')}</p>
                </div>
                <span class="view-label">보기</span>
            </a>
        `).join('');
    }

    function renderTimeline() {
        const feed = byId('timeline-feed');
        if (!feed) return;

        const localPlants = isLocalRun ? readJson('dranvi-admin-plants', []) : [];
        const authoredPlants = serverReady
            ? serverPlants
            : localPlants.length
                ? localPlants
                : family.plants;

        const logs = authoredPlants
            .flatMap((plant) => [...(plant.logs || []), ...getDraftLogs(plant.number)].map((log) => ({ plant, log })))
            .sort((a, b) => String(b.log.createdAt || b.log.date).localeCompare(String(a.log.createdAt || a.log.date)));

        if (!logs.length) {
            feed.innerHTML = '';
            return;
        }

        const limit = Number(feed.dataset.limit || 0);
        const shown = limit > 0 ? logs.slice(0, limit) : logs;

        feed.innerHTML = shown.map(({ plant, log }) => `
            <article class="timeline-item">
                <div>
                    <div class="timeline-number">No.${escapeHtml(plant.number)}</div>
                    <time>${escapeHtml(log.date)}</time>
                </div>
                <div>
                    <h2>${escapeHtml(log.title)}</h2>
                    <p>${escapeHtml(plant.name)} · ${escapeHtml(log.content)}</p>
                    ${log.photoUrl ? `<img class="log-photo" src="${escapeHtml(photoSrc(log.photoUrl))}" alt="">` : ''}
                    ${log.hasPhoto && !log.photoUrl ? '<span class="photo-chip">사진 기록</span>' : ''}
                </div>
            </article>
        `).join('');
    }

    function renderPlant() {
        const mount = byId('plant-page');
        if (!mount) return;

        const plant = getPlantFromPath();
        if (!plant) {
            mount.innerHTML = `
                <section class="family-panel">
                    <p class="eyebrow">DRANVI FAMILY</p>
                    <h1>등록되지 않은 개체</h1>
                    <p class="plant-copy">아직 이 번호의 식물 기록이 없습니다.</p>
                    <p><a class="soft-button" href="../../family/">Family로 돌아가기</a></p>
                </section>
            `;
            return;
        }

        const description = (plant.description || []).map((item) => `<div>${escapeHtml(item)}</div>`).join('');
        const serverPlant = serverPlants.find((item) => item.slug === plant.slug);
        const localPlant = readJson('dranvi-admin-plants', []).find((item) => item.slug === plant.slug);
        const authoredLogs = serverPlant ? (serverPlant.logs || []) : localPlant ? (localPlant.logs || []) : [];
        const editable = Boolean(getKeyFromUrl());
        const logs = [...authoredLogs, ...getDraftLogs(plant.number)].map((log) => `
            <article class="log-item">
                <time>${escapeHtml(log.date)}</time>
                <h3>${escapeHtml(log.title)}</h3>
                <p>${escapeHtml(log.content)}</p>
                ${log.photoUrl ? `<img class="log-photo" src="${escapeHtml(photoSrc(log.photoUrl))}" alt="">` : ''}
                ${log.hasPhoto && !log.photoUrl ? '<span class="photo-chip">사진 기록</span>' : ''}
                ${editable && log.id ? `
                    <div class="log-actions">
                        <button class="soft-button log-edit" type="button" data-log-id="${escapeHtml(log.id)}">수정</button>
                        <button class="soft-button log-delete" type="button" data-log-id="${escapeHtml(log.id)}">삭제</button>
                    </div>
                ` : ''}
            </article>
        `).join('');

        const currentPhoto = plant.currentPhotoUrl
            ? `<img class="current-photo" src="${escapeHtml(photoSrc(plant.currentPhotoUrl))}" alt="현재 사진">`
            : `<div><strong>현재 사진</strong><span>${escapeHtml(plant.currentPhotoLabel || '현재 사진 준비 중')}</span></div>`;

        mount.innerHTML = `
            <aside class="plant-title">
                <p class="eyebrow">No.${escapeHtml(plant.number)}</p>
                <h1>DRANVI<br>FAMILY</h1>
                <div class="plant-name-lines">
                    ${(plant.nameLines || [plant.name]).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
                </div>
                <dl class="info-list">
                    <div class="info-row">
                        <dt>보호자</dt>
                        <dd>${escapeHtml(plant.guardian)}</dd>
                    </div>
                    <div class="info-row">
                        <dt>입양일</dt>
                        <dd>${escapeHtml(plant.adoptionDate)}</dd>
                    </div>
                    <div class="info-row">
                        <dt>특이사항</dt>
                        <dd>${description}</dd>
                    </div>
                </dl>
            </aside>
            <section>
                <div class="plant-photo">${currentPhoto}</div>

                ${logs ? `
                    <h2 class="section-label">기록</h2>
                    <div class="log-list">${logs}</div>
                ` : ''}

                <section class="guardian-box" id="guardian-box" hidden>
                    <h2>새 기록 작성</h2>
                    <form class="family-form" id="log-form">
                        <label>
                            제목
                            <input name="title" type="text" placeholder="새 잎이 났어요 :)" required>
                        </label>
                        <label>
                            내용
                            <textarea name="content" placeholder="오늘의 관계 시간을 남겨주세요." required></textarea>
                        </label>
                        <label>
                            사진 첨부
                            <input name="photo" type="file" accept="image/*">
                        </label>
                        <button class="primary-button" type="submit">업로드</button>
                        <p class="form-note" id="form-note">
                            ${serverReady ? '이 PC의 DRANVI FAMILY 원장에 저장됩니다.' : '로컬 서버가 아니어서 이 브라우저에 임시 저장됩니다.'}
                        </p>
                    </form>
                </section>
            </section>
        `;

        const guardianBox = byId('guardian-box');
        if (guardianBox && getKeyFromUrl()) guardianBox.hidden = false;

        const form = byId('log-form');
        if (form) {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const formData = new FormData(form);
                const note = byId('form-note');
                const photo = formData.get('photo');

                if (serverReady) {
                    try {
                        const response = await fetch(`${API_BASE}/api/plants/${encodeURIComponent(plant.slug)}/logs`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                key: getKeyFromUrl(),
                                title: formData.get('title'),
                                content: formData.get('content'),
                                photoName: photo && photo.name ? photo.name : '',
                                photoDataUrl: await imageToDataUrl(photo)
                            })
                        });
                        if (!response.ok) throw new Error('저장 권한을 확인해 주세요.');
                        form.reset();
                        if (note) note.textContent = '저장되었습니다. 기록을 다시 불러옵니다.';
                        await loadServerPlants();
                        renderPlant();
                    } catch (error) {
                        if (note) note.textContent = error.message || '저장하지 못했습니다.';
                    }
                    return;
                }

                const drafts = readJson('dranvi-log-drafts', []);
                drafts.unshift({
                    plant: plant.number,
                    title: formData.get('title'),
                    content: formData.get('content'),
                    hasPhoto: Boolean(photo && photo.name),
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString()
                });
                localStorage.setItem('dranvi-log-drafts', JSON.stringify(drafts));
                form.reset();
                if (note) note.textContent = '임시 저장되었습니다. START_FAMILY_OS.cmd로 서버를 켜면 원장에 저장됩니다.';
            });
        }

        document.querySelectorAll('.log-edit').forEach((button) => {
            button.addEventListener('click', async () => {
                const logId = button.dataset.logId;
                const log = [...authoredLogs, ...getDraftLogs(plant.number)].find((item) => item.id === logId);
                if (!log) return;

                const title = prompt('제목을 수정해 주세요.', log.title);
                if (title === null) return;
                const content = prompt('내용을 수정해 주세요.', log.content);
                if (content === null) return;

                if (serverReady && serverPlant) {
                    const response = await fetch(`${API_BASE}/api/plants/${encodeURIComponent(plant.slug)}/logs/${encodeURIComponent(logId)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: getKeyFromUrl(), title, content })
                    });
                    if (!response.ok) {
                        alert('수정 권한을 확인해 주세요.');
                        return;
                    }
                    await loadServerPlants();
                    renderPlant();
                    return;
                }

                const drafts = readJson('dranvi-log-drafts', []);
                const nextDrafts = drafts.map((item) => item.id === logId ? { ...item, title, content } : item);
                localStorage.setItem('dranvi-log-drafts', JSON.stringify(nextDrafts));
                renderPlant();
            });
        });

        document.querySelectorAll('.log-delete').forEach((button) => {
            button.addEventListener('click', async () => {
                const logId = button.dataset.logId;
                if (!confirm('이 기록을 삭제할까요?')) return;

                if (serverReady && serverPlant) {
                    const response = await fetch(`${API_BASE}/api/plants/${encodeURIComponent(plant.slug)}/logs/${encodeURIComponent(logId)}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: getKeyFromUrl() })
                    });
                    if (!response.ok) {
                        alert('삭제 권한을 확인해 주세요.');
                        return;
                    }
                    await loadServerPlants();
                    renderPlant();
                    return;
                }

                const drafts = readJson('dranvi-log-drafts', []);
                localStorage.setItem('dranvi-log-drafts', JSON.stringify(drafts.filter((item) => item.id !== logId)));
                renderPlant();
            });
        });
    }

    function renderQr() {
        const form = byId('qr-form');
        if (!form) return;

        const plantSelect = byId('qr-plant');
        const keyInput = byId('qr-key');
        const output = byId('qr-output');
        const image = byId('qr-image');

        plantSelect.innerHTML = getPlants().map((plant) => `
            <option value="${escapeHtml(plant.slug)}">No.${escapeHtml(plant.number)} · ${escapeHtml(plant.name)}</option>
        `).join('');

        function updateQr() {
            const slug = plantSelect.value || '004';
            const key = keyInput.value.trim() || 'guardian-key';
            const staticPlant = family.plants.some((plant) => plant.slug === slug);
            const path = staticPlant ? `/dra/${slug}/` : `/dra/?n=${encodeURIComponent(slug)}`;
            const url = `${publicOrigin()}${path}?k=${encodeURIComponent(key)}`;
            output.textContent = url;
            image.src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`;
            image.alt = `QR for ${url}`;
        }

        form.addEventListener('input', updateQr);
        form.addEventListener('submit', (event) => event.preventDefault());
        updateQr();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        await loadServerPlants();
        renderFamily();
        renderTimeline();
        renderPlant();
        renderQr();
    });
})();
