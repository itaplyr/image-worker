import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { generateTradePNG } from './imageGenerator.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', worker: true });
});

app.post('/generate', async (req, res) => {
    try {
        const { tradeData } = req.body;

        if (!tradeData) {
            return res.status(400).json({ error: 'Missing tradeData' });
        }

        console.log(`[Worker] Generating image for trade ad ${tradeData[0]}`);

        const imageBuffer = await generateTradePNG(tradeData);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', imageBuffer.length);
        res.send(imageBuffer);

        console.log(`[Worker] Successfully generated image for trade ad ${tradeData[0]}`);

    } catch (error) {
        console.error('[Worker] Error generating image:', error);
        res.status(500).json({ error: 'Failed to generate image', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Image Worker running on port ${PORT}`);
});

export default app;