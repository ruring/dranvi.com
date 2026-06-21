const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'dranvi-family.json');
const OUT_FILE = path.join(ROOT, 'family-data.js');
const DRA_DIR = path.join(ROOT, 'dra');

function routeTemplate(slug) {
    const titleSlug = String(slug).toUpperCase();
    return `<!DOCTYPE html>
<html lang="ko">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DRANVI FAMILY No.${titleSlug}</title>
    <link rel="stylesheet" href="../../family-os.css">
</head>

<body class="family-os">
    <div class="family-shell">
        <nav class="family-nav">
            <a class="family-brand" href="../../"><img src="../../logo.svg" alt="Dranvi"></a>
            <div class="family-nav-links"><a href="../../family/">Family</a><a href="../../timeline/">Timeline</a><a href="../../admin/">Admin</a></div>
        </nav>
        <main class="plant-page" id="plant-page"></main>
    </div>
    <script src="../../family-data.js"></script>
    <script src="../../family-app.js"></script>
</body>

</html>
`;
}

function sortPlant(a, b) {
    return String(a.number).localeCompare(String(b.number), 'en', { numeric: true, sensitivity: 'base' });
}

function exportPlant(plant, logs) {
    return {
        number: plant.number,
        slug: plant.slug,
        name: plant.name,
        nameLines: plant.nameLines && plant.nameLines.length ? plant.nameLines : [plant.name],
        guardian: plant.guardian,
        location: plant.location,
        adoptionDate: plant.adoptionDate,
        description: plant.description || [],
        currentPhotoLabel: plant.currentPhotoLabel || '현재 사진 준비 중',
        currentPhotoUrl: plant.currentPhotoUrl || '',
        logs: logs
            .filter((log) => log.plantSlug === plant.slug)
            .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))
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

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const exported = {
    plants: (db.plants || [])
        .slice()
        .sort(sortPlant)
        .map((plant) => exportPlant(plant, db.logs || []))
};

fs.writeFileSync(
    OUT_FILE,
    `window.DRANVI_FAMILY = ${JSON.stringify(exported, null, 4)};\n`,
    'utf8'
);

for (const plant of exported.plants) {
    const routeDir = path.join(DRA_DIR, plant.slug);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(path.join(routeDir, 'index.html'), routeTemplate(plant.slug), 'utf8');
}

console.log(`Exported ${exported.plants.length} plants to ${OUT_FILE}`);
console.log(`Exported ${exported.plants.length} plant routes to ${DRA_DIR}`);
