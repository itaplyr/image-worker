import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import fetch from 'node-fetch';
let itemDataCache = {};

const IMAGE_CACHE_DIR = path.join(process.cwd(), 'image-cache');
const MAX_CACHE_SIZE_MB = 50;
const MAX_CACHE_FILES = 1000;

if (!fs.existsSync(IMAGE_CACHE_DIR)) {
    fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

function manageCacheSize() {
    try {
        const files = fs.readdirSync(IMAGE_CACHE_DIR)
            .map(file => ({
                name: file,
                path: path.join(IMAGE_CACHE_DIR, file),
                stats: fs.statSync(path.join(IMAGE_CACHE_DIR, file))
            }))
            .filter(file => file.stats.isFile())
            .sort((a, b) => b.stats.mtime - a.stats.mtime);

        if (files.length > MAX_CACHE_FILES) {
            const toDelete = files.slice(MAX_CACHE_FILES);
            toDelete.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                } catch (e) {
                    console.error('[ImageGen] Error deleting cache file:', e);
                }
            });
        }

        let totalSize = files.reduce((sum, file) => sum + file.stats.size, 0);
        const maxSizeBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;

        if (totalSize > maxSizeBytes) {
            const sortedByAge = files.sort((a, b) => a.stats.mtime - b.stats.mtime);
            let deletedSize = 0;

            for (const file of sortedByAge) {
                if (totalSize - deletedSize <= maxSizeBytes) break;
                try {
                    fs.unlinkSync(file.path);
                    deletedSize += file.stats.size;
                } catch (e) {
                    console.error('[ImageGen] Error deleting cache file:', e);
                }
            }
        }
    } catch (e) {
        console.error('[ImageGen] Error managing cache:', e);
    }
}

let activeImageGenerations = 0;
const MAX_CONCURRENT_GENERATIONS = 1;
const generationQueue = [];

function processQueue() {
    if (activeImageGenerations < MAX_CONCURRENT_GENERATIONS && generationQueue.length > 0) {
        activeImageGenerations++;
        console.log(`[ImageGen] Starting generation (${activeImageGenerations}/${MAX_CONCURRENT_GENERATIONS} active, ${generationQueue.length} queued)`);
        const task = generationQueue.shift();
        task().finally(() => {
            activeImageGenerations--;
            console.log(`[ImageGen] Completed generation (${activeImageGenerations}/${MAX_CONCURRENT_GENERATIONS} active, ${generationQueue.length} queued)`);
            processQueue();
        });
    }
}

function queueImageGeneration(task) {
    return new Promise((resolve, reject) => {
        generationQueue.push(async () => {
            try {
                const result = await task();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
        processQueue();
    });
}

function formatNumber(value) {
    const num = Number(value) || 0;
    return num.toLocaleString();
}

export const tagMap = {
    1: { label: "ANY", color: "#22c55e", imageUrl: "https://www.rolimons.com/images/tradetagany-420.png" },
    2: { label: "DEMAND", color: "#7c3aed", imageUrl: "https://www.rolimons.com/images/tradetagdemand-420.png" },
    4: { label: "RARES", color: "#10b981", imageUrl: "https://www.rolimons.com/images/tradetagrares-420.png" },
    5: { label: "RAP", color: "#22c55e", imageUrl: "https://www.rolimons.com/images/tradetagrap-420.png" },
    6: { label: "WHISHLIST", color: "#3b82f6", imageUrl: "https://www.rolimons.com/images/tradetagwishlist-420.png" },
    7: { label: "ROBUX", color: "#6366f1", imageUrl: "https://www.rolimons.com/images/tradetagrobux-420.png" },
    8: { label: "UPGRADE", color: "#ef4444", imageUrl: "https://www.rolimons.com/images/tradetagupgrade-420.png" },
    9: { label: "DOWNGRADES", color: "#f59e0b", imageUrl: "https://www.rolimons.com/images/tradetagdowngrade-420.png" },
    10: { label: "ADDS", color: "#f59e0b", imageUrl: "https://www.rolimons.com/images/tradetagadds-420.png" }
};

export async function downloadImageAsBase64(url) {
    if (!url) return '';

    const cacheKey = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
    const cachePath = path.join(IMAGE_CACHE_DIR, `${cacheKey}.png`);

    try {
        if (fs.existsSync(cachePath)) {
            const pngBuffer = fs.readFileSync(cachePath);
            const base64 = pngBuffer.toString('base64');
            return `data:image/png;base64,${base64}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const pngBuffer = await sharp(buffer).png().toBuffer();
        fs.writeFileSync(cachePath, pngBuffer);

        manageCacheSize();

        const base64 = pngBuffer.toString('base64');
        return `data:image/png;base64,${base64}`;
    } catch (e) {
        console.warn(`Failed to download/convert image from ${url}:`, e.message);
        return '';
    }
}


export async function fetchRolimonsItems() {
    return itemDataCache
}

export function calculateValueAndRap(tradeData) {
    const offerObj = tradeData[4];
    const requestObj = tradeData[5];

    const sum = (ids, key) =>
        (ids || []).reduce((acc, id) => {
            const item = itemDataCache[id];
            if (!item) return acc;

            if (key === "value") {
                return acc + (item.value ?? item.rap ?? 0);
            }
            return acc + (item.rap ?? 0);
        }, 0);

    return {
        offerValue: sum(offerObj.items, "value"),
        offerRap: sum(offerObj.items, "rap"),
        requestValue: sum(requestObj.items, "value"),
        requestRap: sum(requestObj.items, "rap")
    };
}


export function layout4(items, startX) {
    return items.map((item, i) => ({ ...item, x: startX + i * 140, y: 70 }));
}

export function padToFour(arr) {
    while (arr.length < 4) arr.push({ type: "empty", id: null, icon: "" });
    return arr;
}

export function getCenterX(items) {
    if (!items.length) return 0;
    const firstX = items[0].x;
    const lastX = items[items.length - 1].x + 120;
    return firstX + (lastX - firstX) / 2;
}

export function loadFontAsBase64(fontPath) {
    const fontBuffer = fs.readFileSync(fontPath);
    return fontBuffer.toString('base64');
}

export function renderItemCards(items) {
    return items.map(item => {
        const imageTag = item.icon
            ? `<image href="${item.icon}" x="10" y="10" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>`
            : "";

        return `<g transform="translate(${item.x}, ${item.y})">
<rect width="120" height="120" rx="14" fill="#2a2f36"/>
${imageTag}
</g>`;
    }).join("");
}


export function buildOfferArray(offerObj, itemIcons) {
    const items = offerObj.items.slice(0, 4).map(id => ({
        type: "item",
        id,
        icon: itemIcons[id] || ""
    }));
    const padded = padToFour(items);
    return padded;
}

export function buildRequestArray(requestObj, itemIcons, tagIcons) {
    const tagItems = (requestObj.tags || []).map(tagId => ({
        type: "tag",
        tag: tagMap[tagId] || { label: "UNKNOWN", color: "#555", imageUrl: "" },
        icon: tagIcons[tagId] || ""
    }));
    const normalItems = (requestObj.items || []).map(id => ({
        type: "item",
        id,
        icon: itemIcons[id] || ""
    }));
    const combined = [...tagItems, ...normalItems].slice(0, 4);
    const padded = padToFour(combined);
    return padded;
}

export function buildSVGFromTemplate(
    tradeData,
    templateStr,
    itemIcons,
    tagIcons,
    valueAndRap
) {
    const offerObj = tradeData[4];
    const requestObj = tradeData[5];

    const offerSide = layout4(buildOfferArray(offerObj, itemIcons), 60);
    const requestSide = layout4(buildRequestArray(requestObj, itemIcons, tagIcons), 640);

    const replacements = {
        offerItems: renderItemCards(offerSide),
        requestItems: renderItemCards(requestSide),
        offerValue: formatNumber(valueAndRap.offerValue),
        offerRap: formatNumber(valueAndRap.offerRap),
        requestValue: formatNumber(valueAndRap.requestValue),
        requestRap: formatNumber(valueAndRap.requestRap),
        offerStatsX: getCenterX(offerSide),
        requestStatsX: getCenterX(requestSide)
    };

    let svg = templateStr;

    for (const key in replacements) {
        svg = svg.replace(new RegExp(`{{${key}}}`, "g"), replacements[key]);
    }

    return svg;
}

export async function renderTradeAd(svg) {
    return sharp(Buffer.from(svg), {
        density: 300
    })
        .png()
        .toBuffer();
}

export async function generateTradePNG(tradeData) {
    return queueImageGeneration(async () => {
        const loadStartTime = Date.now();
        if (Object.keys(itemDataCache).length === 0) {
            await fetchItemData();
        }
        const loadEndTime = Date.now();
        console.log(`[Worker] Loaded item data in ${loadEndTime - loadStartTime}ms`);

        const allItemIds = [...(tradeData[4].items || []), ...(tradeData[5].items || [])];
        const uniqueTagIds = [...new Set(tradeData[5].tags || [])];

        const startTime = Date.now();
        const itemIcons = {};
        for (const id of allItemIds) {
            const iconUrl = itemDataCache[id]?.icon;
            if (iconUrl) {
                itemIcons[id] = await downloadImageAsBase64(iconUrl);
            } else {
                itemIcons[id] = "";
            }
        }
        const halfTime = Date.now();
        console.log(`[Worker] Fetched ${allItemIds.length} item icons in ${halfTime - startTime}ms`);
        const tagIcons = {};
        for (const tagId of uniqueTagIds) {
            const imageUrl = tagMap[tagId]?.imageUrl;
            if (imageUrl) {
                tagIcons[tagId] = await downloadImageAsBase64(imageUrl);
            } else {
                tagIcons[tagId] = "";
            }
        }
        const endTime = Date.now();
        console.log(`[Worker] Fetched ${uniqueTagIds.length} tag icons in ${endTime - halfTime}ms`);

        const templatePath = "./template2.svg";
        const templateStr = fs.readFileSync(path.resolve(templatePath), 'utf-8');
        const valueAndRap = await calculateValueAndRap(tradeData);
        const svg = buildSVGFromTemplate(tradeData, templateStr, itemIcons, tagIcons, valueAndRap);

        fs.writeFileSync("./debug.svg", svg);

        const pngBuffer = await sharp(Buffer.from(svg), {
            density: 150,
            limitInputPixels: 10000000
        })
            .png({
                quality: 80,
                compressionLevel: 6
            })
            .toBuffer();

        return pngBuffer;
    });
}

async function fetchItemData() {
    if (fs.existsSync('./items.json')) {
        itemDataCache = JSON.parse(fs.readFileSync('./items.json', 'utf-8'));
        console.log(`[Worker] Loaded ${Object.keys(itemDataCache).length} items from local file`);
        return;
    }
    try {
        const response = await fetch('https://rolimons.reklaw.dev/api/items');
        const responseData = await response.json();
        itemDataCache = responseData.data || {};
        fs.writeFileSync('./items.json', JSON.stringify(itemDataCache));
        console.log(`[Worker] Loaded ${Object.keys(itemDataCache).length} items from Rolimons API`);
    } catch (error) {
        console.error('[Worker] Failed to fetch item data:', error);
        itemDataCache = {};
    }
}
