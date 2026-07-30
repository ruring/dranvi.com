(function () {
    const family = window.DRANVI_FAMILY || { plants: [] };
    let serverReady = false;
    let serverPlants = [];
    let editingSlug = '';

    function byId(id) {
        return document.getElementById(id);
    }

    function readJson(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
        } catch (error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
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

    function publicOrigin() {
        return 'https://dranvi.com';
    }

    function qrSrc(url) {
        return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`;
    }

    function todayText() {
        return new Date().toISOString().slice(0, 10).replaceAll('-', '.');
    }

    function makeKey(number) {
        const bytes = new Uint8Array(9);
        crypto.getRandomValues(bytes);
        const token = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 14);
        const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
        return `dra${String(number || '000').toLowerCase()}-${date}-${token}`;
    }

    async function loadServerPlants() {
        try {
            const response = await fetch('/api/admin/plants', { cache: 'no-store' });
            if (response.status === 401) {
                renderLogin();
                throw new Error('login required');
            }
            if (!response.ok) throw new Error('API unavailable');
            const data = await response.json();
            serverPlants = data.plants || [];
            serverReady = true;
            renderAdminShell(true);
        } catch (error) {
            serverReady = false;
            serverPlants = [];
        }
    }

    async function importMissingFamilyPlants() {
        if (!serverReady) return;

        const existing = new Set(serverPlants.map((plant) => plant.slug));
        const missing = family.plants.filter((plant) => plant.slug && !existing.has(plant.slug));
        if (!missing.length) return;

        for (const plant of missing) {
            await fetch('/api/admin/plants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: plant.number,
                    slug: plant.slug,
                    name: (plant.nameLines && plant.nameLines.length ? plant.nameLines : [plant.name]).join('\n'),
                    nameLines: plant.nameLines || [plant.name],
                    guardian: plant.guardian,
                    location: plant.location,
                    adoptionDate: plant.adoptionDate,
                    description: plant.description || [],
                    currentPhotoLabel: plant.currentPhotoLabel || '현재 사진 준비 중',
                    guardianKey: makeKey(plant.number),
                    logs: []
                })
            });
        }

        await loadServerPlants();
    }

    function renderAdminShell(isLoggedIn) {
        const login = byId('admin-login');
        const content = byId('admin-content');
        if (login) login.hidden = Boolean(isLoggedIn);
        if (content) content.hidden = !isLoggedIn;
    }

    function renderLogin(message) {
        renderAdminShell(false);
        const note = byId('admin-login-note');
        if (note && message) note.textContent = message;
    }

    async function loginAdmin(event) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const note = byId('admin-login-note');
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: formData.get('user'),
                password: formData.get('password')
            })
        });

        if (!response.ok) {
            if (note) note.textContent = '비밀번호를 다시 확인해 주세요.';
            return;
        }

        if (note) note.textContent = '로그인되었습니다.';
        await loadServerPlants();
        renderManagedPlants();
        bindEditor();
    }

    function getManagedPlants() {
        const sourcePlants = serverReady ? serverPlants : readJson('dranvi-admin-plants', []);
        const bySlug = new Map();
        [...family.plants, ...sourcePlants].forEach((plant) => {
            if (plant && plant.slug) bySlug.set(plant.slug, plant);
        });
        return Array.from(bySlug.values());
    }

    function plantLink(plant) {
        if (plant.guardianUrl) {
            return `${publicOrigin()}${plant.guardianUrl}`;
        }

        const staticPlant = family.plants.some((item) => item.slug === plant.slug);
        const path = staticPlant ? `/dra/${plant.slug}/` : `/dra/?n=${encodeURIComponent(plant.slug)}`;
        const key = plant.guardianKey || plant.key || '';
        return key ? `${publicOrigin()}${path}?k=${encodeURIComponent(key)}` : `${publicOrigin()}${path}`;
    }

    function buildPlant(formData) {
        const number = String(formData.get('number') || '').trim();
        const name = String(formData.get('name') || '').trim() || `드란비 ${number}호`;
        const guardian = String(formData.get('guardian') || '').trim() || '보호자';
        const letter = String(formData.get('letter') || '').trim();
        const description = String(formData.get('description') || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

        return {
            number,
            slug: number.toLowerCase(),
            name,
            nameLines: name.split('\n').map((line) => line.trim()).filter(Boolean),
            guardian,
            location: String(formData.get('location') || '').trim() || 'Guardian Space',
            adoptionDate: String(formData.get('adoptionDate') || '').trim() || todayText(),
            description: description.length ? description : ['입양 준비 완료', '보호자 전달 예정'],
            currentPhotoLabel: '현재 사진 준비 중',
            guardianKey: String(formData.get('key') || '').trim(),
            logs: [
                {
                    date: String(formData.get('adoptionDate') || '').trim() || todayText(),
                    title: String(formData.get('firstTitle') || '').trim() || '입양 준비 완료!',
                    content: letter || '보호자에게 전달되기 전, 첫 기록을 남겼습니다.',
                    hasPhoto: false
                }
            ]
        };
    }

    async function savePlant(plant) {
        if (serverReady) {
            const existsInServer = editingSlug
                ? serverPlants.some((item) => item.slug === editingSlug)
                : false;
            const shouldUpdate = Boolean(editingSlug && existsInServer);

            if (editingSlug && !existsInServer && !plant.guardianKey) {
                plant.guardianKey = makeKey(plant.number);
            }

            const url = shouldUpdate
                ? `/api/admin/plants/${encodeURIComponent(editingSlug)}`
                : '/api/admin/plants';
            const response = await fetch(url, {
                method: shouldUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(plant)
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || '서버에 저장하지 못했습니다.');
            }
            await loadServerPlants();
            editingSlug = '';
            renderManagedPlants();
            return;
        }

        const plants = readJson('dranvi-admin-plants', []);
        const targetSlug = editingSlug || plant.slug;
        const withoutSame = plants.filter((item) => item.slug !== targetSlug && item.slug !== plant.slug);
        withoutSame.unshift(plant);
        writeJson('dranvi-admin-plants', withoutSame);
        editingSlug = '';
        renderManagedPlants();
    }

    function renderManagedPlants() {
        const list = byId('managed-plants');
        if (!list) return;

        const plants = getManagedPlants();
        if (!plants.length) {
            list.innerHTML = `
                <article class="managed-empty">
                    <p>아직 만들어진 개체가 없습니다.</p>
                    <p>아래에서 첫 개체를 만들면 이곳에 게시판처럼 쌓입니다.</p>
                </article>
            `;
            return;
        }

        list.innerHTML = `
            <div class="admin-board">
                ${plants.map((plant) => {
                    const url = plantLink(plant);
                    const isSeed = !serverPlants.some((item) => item.slug === plant.slug);
                    const logCount = (plant.logs || []).length;
                    return `
                        <article class="board-row">
                            <div class="board-main">
                                <div class="plant-number">No.${escapeHtml(plant.number)}</div>
                                <h3>${escapeHtml(plant.name)}</h3>
                                <p>${escapeHtml(plant.guardian)} · ${escapeHtml(plant.adoptionDate)} · 기록 ${logCount}${isSeed ? ' · 기본 데이터' : ''}</p>
                                <div class="link-output">${escapeHtml(url)}</div>
                            </div>
                            <img src="${qrSrc(url)}" alt="No.${escapeHtml(plant.number)} QR">
                            <div class="board-actions">
                                <button class="soft-button edit-plant" type="button" data-slug="${escapeHtml(plant.slug)}">수정</button>
                                <button class="soft-button copy-link" type="button" data-url="${escapeHtml(url)}">링크 복사</button>
                                <a class="soft-button" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">열기</a>
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>
        `;

        document.querySelectorAll('.copy-link').forEach((button) => {
            button.addEventListener('click', async () => {
                await navigator.clipboard.writeText(button.dataset.url || '');
                button.textContent = '복사됨';
                setTimeout(() => {
                    button.textContent = '링크 복사';
                }, 1200);
            });
        });

        document.querySelectorAll('.edit-plant').forEach((button) => {
            button.addEventListener('click', () => startEdit(button.dataset.slug || ''));
        });
    }

    function setMode(mode, plant) {
        const title = byId('editor-title');
        const submit = byId('admin-submit');
        const cancel = byId('cancel-edit');
        const keyHint = byId('key-hint');
        const keyInput = byId('admin-key-input');
        const makeKeyButton = byId('make-key');
        const firstLogFields = document.querySelectorAll('[data-create-only]');

        if (mode === 'edit') {
            if (title) title.textContent = `개체 수정 · No.${plant.number}`;
            if (submit) submit.textContent = '수정 저장';
            if (cancel) cancel.hidden = false;
            if (keyHint) keyHint.textContent = '수정 모드에서는 기존 QR 키를 유지합니다. 키 변경은 별도 기능으로 분리합니다.';
            if (keyInput) {
                keyInput.required = false;
                keyInput.disabled = true;
                keyInput.value = '기존 접근 키 유지';
            }
            if (makeKeyButton) makeKeyButton.disabled = true;
            firstLogFields.forEach((node) => { node.hidden = true; });
            return;
        }

        if (title) title.textContent = '새 개체 만들기';
        if (submit) submit.textContent = '개체 생성 + QR 등록';
        if (cancel) cancel.hidden = true;
        if (keyHint) keyHint.textContent = '생성하면 위 목록에서 QR을 다시 확인할 수 있습니다.';
        if (keyInput) {
            keyInput.disabled = false;
            keyInput.required = true;
        }
        if (makeKeyButton) makeKeyButton.disabled = false;
        firstLogFields.forEach((node) => { node.hidden = false; });
    }

    function fillForm(plant) {
        const form = byId('admin-form');
        form.elements.number.value = plant.number || '';
        form.elements.name.value = (plant.nameLines && plant.nameLines.length ? plant.nameLines : [plant.name || '']).join('\n');
        form.elements.guardian.value = plant.guardian || '';
        form.elements.location.value = plant.location || '';
        form.elements.adoptionDate.value = plant.adoptionDate || todayText();
        form.elements.description.value = (plant.description || []).join('\n');
        form.elements.firstTitle.value = '입양 준비 완료!';
        form.elements.letter.value = '';
    }

    function resetForm() {
        editingSlug = '';
        const form = byId('admin-form');
        form.reset();
        byId('admin-date').value = todayText();
        byId('admin-key-input').value = makeKey('004');
        setMode('create');
    }

    function startEdit(slug) {
        const plant = getManagedPlants().find((item) => item.slug === slug);
        if (!plant) return;
        editingSlug = slug;
        fillForm(plant);
        setMode('edit', plant);
        byId('admin-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderOutput(plant) {
        const output = byId('admin-output');
        const url = plantLink(plant);
        output.hidden = false;
        byId('admin-link').textContent = url;
        byId('admin-qr').src = qrSrc(url);
        byId('admin-qr').alt = `QR for ${url}`;
    }

    function downloadJson() {
        const plants = getManagedPlants();
        const blob = new Blob([JSON.stringify(plants, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'dranvi-family-admin-plants.json';
        anchor.click();
        URL.revokeObjectURL(url);
    }

    function bindEditor() {
        const form = byId('admin-form');
        const keyInput = byId('admin-key-input');
        byId('admin-date').value = todayText();
        keyInput.value = makeKey('004');

        byId('make-key').addEventListener('click', () => {
            keyInput.value = makeKey(byId('admin-number').value || '004');
        });

        byId('cancel-edit').addEventListener('click', resetForm);

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const plant = buildPlant(new FormData(form));
            const note = form.querySelector('.form-note');
            try {
                await savePlant(plant);
                const saved = serverPlants.find((item) => item.slug === plant.slug);
                renderOutput(saved || plant);
                if (note) note.textContent = editingSlug
                    ? '수정되었습니다. 위 게시판 목록에서 확인할 수 있습니다.'
                    : '생성되었습니다. 위 게시판 목록에서 QR을 다시 관리할 수 있습니다.';
                resetForm();
            } catch (error) {
                if (note) note.textContent = error.message || '저장하지 못했습니다.';
            }
        });

        setMode('create');
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const loginForm = byId('admin-login-form');
        if (loginForm) loginForm.addEventListener('submit', loginAdmin);

        await loadServerPlants();
        if (!serverReady) return;
        await importMissingFamilyPlants();

        byId('download-admin-json').addEventListener('click', downloadJson);
        renderManagedPlants();
        bindEditor();
    });
})();
