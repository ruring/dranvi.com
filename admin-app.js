(function () {
    const family = window.DRANVI_FAMILY || { plants: [] };
    let serverReady = false;
    let serverPlants = [];

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

    async function loadServerPlants() {
        try {
            const response = await fetch('/api/plants', { cache: 'no-store' });
            if (!response.ok) throw new Error('API unavailable');
            const data = await response.json();
            serverPlants = data.plants || [];
            serverReady = true;
        } catch (error) {
            serverReady = false;
            serverPlants = [];
        }
    }

    function makeKey(number) {
        const bytes = new Uint8Array(9);
        crypto.getRandomValues(bytes);
        const token = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 14);
        const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
        return `dra${String(number || '000').toLowerCase()}-${date}-${token}`;
    }

    function todayText() {
        return new Date().toISOString().slice(0, 10).replaceAll('-', '.');
    }

    function publicOrigin() {
        return 'https://dranvi.com';
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

    function plantLink(plant) {
        const staticPlant = family.plants.some((item) => item.slug === plant.slug);
        const path = staticPlant ? `/dra/${plant.slug}/` : `/dra/?n=${encodeURIComponent(plant.slug)}`;
        return `${publicOrigin()}${path}?k=${encodeURIComponent(plant.guardianKey || plant.key || '')}`;
    }

    function qrSrc(url) {
        return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`;
    }

    function renderOutput(plant) {
        const output = byId('admin-output');
        const url = plantLink(plant);
        output.hidden = false;
        byId('admin-link').textContent = url;
        byId('admin-qr').src = qrSrc(url);
        byId('admin-qr').alt = `QR for ${url}`;
        byId('admin-snippet').value = JSON.stringify({
            number: plant.number,
            slug: plant.slug,
            name: plant.name,
            nameLines: plant.nameLines,
            guardian: plant.guardian,
            location: plant.location,
            adoptionDate: plant.adoptionDate,
            description: plant.description,
            currentPhotoLabel: plant.currentPhotoLabel,
            logs: plant.logs
        }, null, 4);
    }

    async function savePlant(plant) {
        if (serverReady) {
            const response = await fetch('/api/admin/plants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(plant)
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || '서버에 저장하지 못했습니다.');
            }
            await loadServerPlants();
            renderManagedPlants();
            return;
        }

        const plants = readJson('dranvi-admin-plants', []);
        const withoutSame = plants.filter((item) => item.slug !== plant.slug);
        withoutSame.unshift(plant);
        writeJson('dranvi-admin-plants', withoutSame);
        renderManagedPlants();
    }

    function getManagedPlants() {
        if (serverReady) return serverPlants;
        return readJson('dranvi-admin-plants', []);
    }

    function renderManagedPlants() {
        const list = byId('managed-plants');
        if (!list) return;

        const plants = getManagedPlants();
        if (!plants.length) {
            list.innerHTML = `<p class="form-note">${serverReady ? '아직 이 PC 원장에 생성한 개체가 없습니다.' : '로컬 서버가 아니어서 브라우저 임시 저장만 사용할 수 있습니다.'}</p>`;
            return;
        }

        list.innerHTML = plants.map((plant) => {
            const publicUrl = plant.guardianKey || plant.key ? plantLink(plant) : `${publicOrigin()}/dra/?n=${encodeURIComponent(plant.slug)}`;
            return `
                <article class="managed-card">
                    <div>
                        <div class="plant-number">No.${escapeHtml(plant.number)}</div>
                        <h3>${escapeHtml(plant.name)}</h3>
                        <p>${escapeHtml(plant.guardian)} · ${escapeHtml(plant.adoptionDate)}</p>
                        <div class="link-output">${escapeHtml(publicUrl)}</div>
                    </div>
                    <img src="${qrSrc(publicUrl)}" alt="No.${escapeHtml(plant.number)} QR">
                </article>
            `;
        }).join('');
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

    document.addEventListener('DOMContentLoaded', async () => {
        await loadServerPlants();

        const form = byId('admin-form');
        const keyInput = byId('admin-key-input');
        const today = todayText();

        byId('admin-date').value = today;
        keyInput.value = makeKey('004');

        byId('make-key').addEventListener('click', () => {
            keyInput.value = makeKey(byId('admin-number').value || '004');
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const plant = buildPlant(new FormData(form));
            const note = form.querySelector('.form-note');
            try {
                await savePlant(plant);
                renderOutput(plant);
                if (note) note.textContent = serverReady
                    ? '이 PC의 DRANVI FAMILY 원장에 저장되었습니다.'
                    : '브라우저에 임시 저장되었습니다. START_FAMILY_OS.cmd로 서버를 켜면 원장에 저장됩니다.';
            } catch (error) {
                if (note) note.textContent = error.message || '저장하지 못했습니다.';
            }
        });

        byId('download-admin-json').addEventListener('click', downloadJson);
        renderManagedPlants();
    });
})();
