const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads', 'plants');
const DB_FILE = path.join(DATA_DIR, 'dranvi-family.json');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.ico': 'image/x-icon'
};

function ensureStorage() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
        writeDb({ plants: [], logs: [], keys: [] });
    }
}

function readDb() {
    ensureStorage();
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function keyHash(key) {
    return crypto.createHash('sha256').update(String(key || ''), 'utf8').digest('hex');
}

function slugifyNumber(number) {
    return String(number || '').trim().toLowerCase();
}

function publicPlant(plant, db) {
    return {
        number: plant.number,
        slug: plant.slug,
        name: plant.name,
        nameLines: plant.nameLines,
        guardian: plant.guardian,
        location: plant.location,
        adoptionDate: plant.adoptionDate,
        description: plant.description,
        currentPhotoLabel: plant.currentPhotoLabel || '현재 사진 준비 중',
        currentPhotoUrl: plant.currentPhotoUrl || '',
        logs: db.logs
            .filter((log) => log.plantSlug === plant.slug)
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .map((log) => ({
                id: log.id,
                date: log.date,
                title: log.title,
                content: log.content,
                photoUrl: log.photoUrl || '',
                hasPhoto: Boolean(log.photoUrl),
                createdAt: log.createdAt
            }))
    };
}

function sendJson(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data)
    });
    res.end(data);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 25 * 1024 * 1024) {
                reject(new Error('Payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

async function readJsonBody(req) {
    const raw = await readBody(req);
    return raw ? JSON.parse(raw) : {};
}

function saveDataUrlPhoto(plantSlug, photoDataUrl, originalName) {
    if (!photoDataUrl) return '';
    const match = String(photoDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return '';

    const mime = match[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const safeName = String(originalName || `photo.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '-');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(UPLOAD_DIR, plantSlug);
    const fileName = `${stamp}-${safeName}`.slice(0, 180);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), Buffer.from(match[2], 'base64'));
    return `/uploads/plants/${encodeURIComponent(plantSlug)}/${encodeURIComponent(fileName)}`;
}

function verifyKey(db, plantSlug, key) {
    const activeKey = db.keys.find((item) => item.plantSlug === plantSlug && !item.revokedAt);
    if (!activeKey) return false;
    return crypto.timingSafeEqual(Buffer.from(activeKey.keyHash), Buffer.from(keyHash(key)));
}

function handleGetPlants(req, res) {
    const db = readDb();
    sendJson(res, 200, {
        plants: db.plants.map((plant) => publicPlant(plant, db))
    });
}

async function handleCreatePlant(req, res) {
    const body = await readJsonBody(req);
    const db = readDb();
    const number = String(body.number || '').trim();
    const slug = slugifyNumber(body.slug || number);
    const guardianKey = String(body.guardianKey || body.key || '').trim();

    if (!number || !slug || !body.name || !guardianKey) {
        sendJson(res, 400, { error: 'number, name, and guardianKey are required' });
        return;
    }

    const now = new Date().toISOString();
    const plant = {
        number,
        slug,
        name: String(body.name),
        nameLines: Array.isArray(body.nameLines) && body.nameLines.length ? body.nameLines : [String(body.name)],
        guardian: String(body.guardian || '보호자'),
        location: String(body.location || 'Guardian Space'),
        adoptionDate: String(body.adoptionDate || now.slice(0, 10)),
        description: Array.isArray(body.description) ? body.description : [],
        currentPhotoLabel: String(body.currentPhotoLabel || '현재 사진 준비 중'),
        currentPhotoUrl: '',
        createdAt: now,
        updatedAt: now
    };

    db.plants = db.plants.filter((item) => item.slug !== slug);
    db.logs = db.logs.filter((item) => item.plantSlug !== slug);
    db.keys = db.keys.filter((item) => item.plantSlug !== slug);

    db.plants.push(plant);
    db.keys.push({
        plantSlug: slug,
        keyHash: keyHash(guardianKey),
        createdAt: now,
        revokedAt: null
    });

    const firstLog = (body.logs || [])[0];
    if (firstLog) {
        db.logs.push({
            id: crypto.randomUUID(),
            plantSlug: slug,
            date: String(firstLog.date || plant.adoptionDate),
            title: String(firstLog.title || '입양 준비 완료!'),
            content: String(firstLog.content || ''),
            photoUrl: '',
            createdAt: now
        });
    }

    writeDb(db);
    sendJson(res, 201, {
        plant: publicPlant(plant, db),
        guardianUrl: `/dra/?n=${encodeURIComponent(slug)}&k=${encodeURIComponent(guardianKey)}`
    });
}

async function handleCreateLog(req, res, plantSlug) {
    const body = await readJsonBody(req);
    const db = readDb();
    const plant = db.plants.find((item) => item.slug === plantSlug);

    if (!plant) {
        sendJson(res, 404, { error: 'plant not found' });
        return;
    }

    if (!verifyKey(db, plantSlug, body.key)) {
        sendJson(res, 403, { error: 'invalid guardian key' });
        return;
    }

    const now = new Date().toISOString();
    const photoUrl = saveDataUrlPhoto(plantSlug, body.photoDataUrl, body.photoName);
    const log = {
        id: crypto.randomUUID(),
        plantSlug,
        date: String(body.date || now.slice(0, 10).replaceAll('-', '.')),
        title: String(body.title || '새 기록'),
        content: String(body.content || ''),
        photoUrl,
        createdAt: now
    };

    db.logs.push(log);
    writeDb(db);
    sendJson(res, 201, { log });
}

async function handleUpdateLog(req, res, plantSlug, logId) {
    const body = await readJsonBody(req);
    const db = readDb();
    const plant = db.plants.find((item) => item.slug === plantSlug);
    const log = db.logs.find((item) => item.plantSlug === plantSlug && item.id === logId);

    if (!plant || !log) {
        sendJson(res, 404, { error: 'log not found' });
        return;
    }

    if (!verifyKey(db, plantSlug, body.key)) {
        sendJson(res, 403, { error: 'invalid guardian key' });
        return;
    }

    log.title = String(body.title || log.title);
    log.content = String(body.content || log.content);
    log.updatedAt = new Date().toISOString();

    writeDb(db);
    sendJson(res, 200, { log });
}

async function handleDeleteLog(req, res, plantSlug, logId) {
    const body = await readJsonBody(req);
    const db = readDb();
    const exists = db.logs.some((item) => item.plantSlug === plantSlug && item.id === logId);

    if (!exists) {
        sendJson(res, 404, { error: 'log not found' });
        return;
    }

    if (!verifyKey(db, plantSlug, body.key)) {
        sendJson(res, 403, { error: 'invalid guardian key' });
        return;
    }

    db.logs = db.logs.filter((item) => !(item.plantSlug === plantSlug && item.id === logId));
    writeDb(db);
    sendJson(res, 200, { ok: true });
}

function serveStatic(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = path.normalize(path.join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
    });
}

async function handle(req, res) {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);

        if (req.method === 'GET' && url.pathname === '/api/health') {
            sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === 'GET' && url.pathname === '/api/plants') {
            handleGetPlants(req, res);
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/admin/plants') {
            await handleCreatePlant(req, res);
            return;
        }

        const logMatch = url.pathname.match(/^\/api\/plants\/([^/]+)\/logs$/);
        if (req.method === 'POST' && logMatch) {
            await handleCreateLog(req, res, decodeURIComponent(logMatch[1]));
            return;
        }

        const logItemMatch = url.pathname.match(/^\/api\/plants\/([^/]+)\/logs\/([^/]+)$/);
        if (req.method === 'PUT' && logItemMatch) {
            await handleUpdateLog(req, res, decodeURIComponent(logItemMatch[1]), decodeURIComponent(logItemMatch[2]));
            return;
        }

        if (req.method === 'DELETE' && logItemMatch) {
            await handleDeleteLog(req, res, decodeURIComponent(logItemMatch[1]), decodeURIComponent(logItemMatch[2]));
            return;
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
            serveStatic(req, res);
            return;
        }

        sendJson(res, 405, { error: 'method not allowed' });
    } catch (error) {
        sendJson(res, 500, { error: error.message || 'server error' });
    }
}

ensureStorage();
http.createServer(handle).listen(PORT, () => {
    console.log(`DRANVI FAMILY local server: http://localhost:${PORT}`);
    console.log(`DB file: ${DB_FILE}`);
});
