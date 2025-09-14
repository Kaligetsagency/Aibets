const express = require('express');
const fetch = require('node-fetch');
const WebSocket = require('ws');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const PORT = 3000;

// Get API keys from environment variables
const DERIV_APP_ID = process.env.DERIV_APP_ID || 1089; // Default to a public test ID
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY is not set in the .env file.');
    process.exit(1);
}

app.use(express.static('public')); // Serve the index.html from a 'public' directory
app.use(express.json());

// Main analysis endpoint
app.post('/analyze', async (req, res) => {
    const { symbol } = req.body;
    if (!symbol) {
        return res.status(400).json({ error: 'Asset symbol is required.' });
    }

    try {
        const data = await getHistoricalTicks(symbol);
        const analysis = await analyzeWithGemini(data);
        res.json({ analysis });
    } catch (error) {
        console.error('Error during analysis:', error);
        res.status(500).json({ error: 'Failed to analyze the market data.' });
    }
});

// Function to fetch historical tick data from Deriv
function getHistoricalTicks(symbol) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
        const historicalTicks = [];
        const maxTicks = 200; // Limit the number of ticks for the analysis

        ws.onopen = () => {
            console.log('Connected to Deriv WebSocket.');
            // Request historical data
            ws.send(JSON.stringify({
                ticks_history: symbol,
                adjust_start_time: 1,
                end: 'latest',
                start: 1,
                count: maxTicks,
                style: 'ticks'
            }));
        };

        ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.msg_type === 'history') {
                const prices = data.history.prices;
                const times = data.history.times;
                for (let i = 0; i < prices.length; i++) {
                    historicalTicks.push({
                        time: new Date(times[i] * 1000).toISOString(),
                        price: parseFloat(prices[i])
                    });
                }
                ws.close();
                resolve(historicalTicks);
            } else if (data.error) {
                reject(new Error(data.error.message));
                ws.close();
            }
        };

        ws.onerror = (error) => {
            reject(new Error('WebSocket error: ' + error.message));
        };
    });
}

// Function to call the Gemini API for analysis
async function analyzeWithGemini(data) {
    const dataPrompt = data.map(tick => `(${tick.time}, ${tick.price})`).join('\n');
    
    const userPrompt = `
        Analyze the provided market data by following the steps below.

        **Part 1: Initial Setup and Liquidity**
        * **Asset and Timeframe:** The asset is from the Deriv platform. The data represents historical ticks.
        * **Liquidity Identification:** Locate and identify key areas of **buyside liquidity** (above old highs) and **sellside liquidity** (below old lows) based on the provided price points. Explain what the potential "smart money" objective might be for these zones.

        **Part 2: Structure and Imbalance**
        * **Fair Value Gap (FVG):** Identify any recent **unmitigated fair value gaps** and describe them. Explain their significance, considering their size and whether they formed after a break in market structure.
        * **Order Blocks:** Identify any valid **order blocks**. To be valid, the order block must meet the three rules discussed in the video: it must have an imbalance, be untouched, and have led to a break in market structure.

        **Part 3: Price Action Narrative**
        * **The Power of Three:** Analyze the recent price action to determine if it fits the "Power of Three" pattern (consolidation, manipulation, and acceleration). State which phase the market is currently in.
        * **Synthesize and Conclude:** Combine your findings from the liquidity, FVG, order block, and Power of Three analyses to provide a comprehensive narrative of the market's current state. Based on this confluence, provide a potential future direction for the price and the reasoning behind your prediction.

        ---
        Market Data:
        ${dataPrompt}
    `;

    const payload = {
        contents: [{
            parts: [{ text: userPrompt }]
        }]
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        const analysisText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis available.';
        return analysisText;
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return 'Failed to get a response from the analysis service.';
    }
}

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
