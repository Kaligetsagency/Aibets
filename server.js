const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const WebSocket = require('ws'); // <-- Add WebSocket dependency
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const DERIV_APP_ID = 1089; // Use your Deriv App ID

// Function to fetch historical data from Deriv
const getTickHistory = (asset, timeframe, count = 60) => {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);

        ws.onopen = () => {
            ws.send(JSON.stringify({
                ticks_history: asset,
                style: "candles",
                end: "latest",
                count: count,
                granularity: parseInt(timeframe), // Timeframe in seconds
            }));
        };

        ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.error) {
                reject(data.error.message);
            } else if (data.msg_type === 'candles') {
                resolve(data.candles);
                ws.close();
            }
        };

        ws.onerror = (err) => {
            reject(err);
        };
    });
};


app.post('/analyze', async (req, res) => {
    const { asset, timeframe } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!asset || !timeframe) {
        return res.status(400).json({ message: 'Asset symbol and timeframe are required.' });
    }
    if (!apiKey) {
        return res.status(500).json({ message: 'API key is not configured.' });
    }

    try {
        // 1. Fetch historical data
        const candles = await getTickHistory(asset, timeframe);
        const ohlcData = candles.map(c => `(O: ${c.open}, H: ${c.high}, L: ${c.low}, C: ${c.close})`).join(', ');

        // 2. Create a more detailed prompt
        const prompt = `
            Analyze the forex asset ${asset} on the ${timeframe}-second timeframe.
            Here are the last 60 OHLC candles: ${ohlcData}.

            Based ONLY on this data, provide a concise but comprehensive technical analysis.
            Format the entire response in a single block of well-structured HTML.

            <h3>Overall Sentiment</h3>
            <p>Your assessment of whether the sentiment is Bullish, Bearish, or Neutral, with a brief justification based on the provided candle data.</p>

            <h3>Short-Term Trend Prediction (Next 10-15 candles)</h3>
            <p>Your prediction for the trend with a confidence score from 1 (low) to 10 (high).</p>

            <h3>Key Price Levels</h3>
            <ul>
                <li><strong>Support:</strong> Identify 2-3 key support levels derived from the candle data.</li>
                <li><strong>Resistance:</strong> Identify 2-3 key resistance levels derived from the candle data.</li>
            </ul>

            <h3>Potential Trade Idea</h3>
            <p>A brief, hypothetical trade setup (e.g., 'Consider a long position if price breaks above X with a target of Y'). This is for informational purposes only and not financial advice.</p>
        `;

        // 3. Call Gemini API
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const response = await axios.post(apiUrl, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        
        const htmlContent = response.data.candidates[0].content.parts[0].text;
        res.json({ htmlContent });

    } catch (error) {
        console.error('Error in /analyze:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Failed to retrieve analysis from AI service.' });
    }
});


app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
