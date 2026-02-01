import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { generateTradePNG } from './imageGenerator.js';

const app = express();
const PORT = process.env.PORT || 3001;

// =======================
// CONFIG
// =======================
const RAM_LIMIT_MB = Number(process.env.RAM_LIMIT_MB) || 400;
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_JOBS) || 1;
const RAM_SAMPLE_INTERVAL_MS = 50;

// =======================
// STATE
// =======================
let activeJobs = 0;

// =======================
// HELPERS
// =======================
function getRamUsageMB() {
    return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Samples RAM while a job is running
async function monitorRam(shouldRun) {
    let peak = getRamUsageMB();

    while (shouldRun()) {
        const current = getRamUsageMB();
        if (current > peak) peak = current;
        await sleep(RAM_SAMPLE_INTERVAL_MS);
    }

    return peak;
}

// =======================
// ROUTES
// =======================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
    const ramUsage = getRamUsageMB();

    res.json({
        status: 'healthy',
        worker: true,
        ramUsage,
        ramLimit: RAM_LIMIT_MB,
        activeJobs,
        maxJobs: MAX_CONCURRENT_JOBS
    });
});

app.post('/generate', async (req, res) => {
    const ramBefore = getRamUsageMB();

    // 🚫 Reject if already overloaded
    if (ramBefore > RAM_LIMIT_MB) {
        console.warn(
            `[Worker] Rejecting job — RAM ${ramBefore}MB > ${RAM_LIMIT_MB}MB`
        );

        return res.status(367).json({
            error: 'Worker overloaded',
            stage: 'pre-check',
            ramUsage: ramBefore,
            ramLimit: RAM_LIMIT_MB
        });
    }

    // 🚫 Reject if too many concurrent jobs
    if (activeJobs >= MAX_CONCURRENT_JOBS) {
        console.warn('[Worker] Rejecting job — max concurrency reached');

        return res.status(367).json({
            error: 'Worker busy',
            stage: 'concurrency',
            activeJobs,
            maxJobs: MAX_CONCURRENT_JOBS
        });
    }

    const { tradeData } = req.body;

    if (!tradeData) {
        return res.status(400).json({ error: 'Missing tradeData' });
    }

    activeJobs++;

    let running = true;
    const ramMonitor = monitorRam(() => running);

    try {

        const imageBuffer = await generateTradePNG(tradeData);

        running = false;
        const ramPeak = await ramMonitor;
        const ramAfter = getRamUsageMB();

        console.log(
            `[Worker] RAM peak: ${ramPeak}MB | RAM after: ${ramAfter}MB | Δ${ramAfter - ramBefore}MB`
        );

        // 🚨 If we crossed limit mid-render, warn but still return result
        if (ramPeak > RAM_LIMIT_MB) {
            console.warn(
                `[Worker] RAM exceeded limit during render (${ramPeak}MB)`
            );
        }

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', imageBuffer.length);
        res.send(imageBuffer);

    } catch (error) {
        running = false;

        console.error('[Worker] Error generating image:', error);

        res.status(500).json({
            error: 'Failed to generate image',
            details: error.message
        });

    } finally {
        activeJobs--;

        // Optional manual GC (run node with --expose-gc)
        if (global.gc) {
            global.gc();
            console.log('[Worker] Forced garbage collection');
        }
    }
});

// =======================
// START
// =======================
app.listen(PORT, () => {
    console.log(`Image Worker running on port ${PORT}`);
    console.log(`RAM limit: ${RAM_LIMIT_MB} MB`);
    console.log(`Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);
});

export default app;
