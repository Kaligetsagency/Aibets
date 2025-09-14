const express = require('express');
const fetch = require('node-fetch');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const PORT = 3000;

const DERIV_APP_ID = process.env.DERIV_APP_ID || 1089;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY is not set in the .env file.');
    process.exit(1);
}

app.use(express.static('public'));
app.use(express.json());

// Endpoint to get active symbols from Deriv
app.get('/assets', (req, res) => {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
    ws.onopen = () => {
        ws.send(JSON.stringify({ active_symbols: 'brief' }));
    };
    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.msg_type === 'active_symbols') {
            const assets = data.active_symbols
                .filter(asset => asset.market === 'forex' || asset.market === 'synthetic_index')
                .map(asset => ({
                    symbol: asset.symbol,
                    name: asset.display_name
                }));
            res.json(assets);
            ws.close();
        } else if (data.error) {
            res.status(500).json({ error: data.error.message });
            ws.close();
        }
    };
    ws.onerror = (error) => {
        res.status(500).json({ error: 'WebSocket error: ' + error.message });
    };
});

// Main analysis endpoint
app.post('/analyze', async (req, res) => {
    const { symbol, timeframe } = req.body;
    if (!symbol || !timeframe) {
        return res.status(400).json({ error: 'Asset symbol and timeframe are required.' });
    }

    try {
        const data = await getHistoricalOHLC(symbol, timeframe);
        const analysis = await analyzeWithGemini(data, timeframe);
        res.json({ analysis });
    } catch (error) {
        console.error('Error during analysis:', error);
        res.status(500).json({ error: 'Failed to analyze the market data.' });
    }
});

// Function to fetch historical OHLC data (candlesticks) from Deriv
function getHistoricalOHLC(symbol, timeframe) {
    return new Promise((resolve, reject) => {
        const granularityMap = {
            '1m': 60,
            '5m': 300,
            '15m': 900,
            '30m': 1800,
            '1h': 3600,
            '4h': 14400,
            '1d': 86400,
            '1w': 604800,
        };

        const granularity = granularityMap[timeframe];
        if (!granularity) {
            return reject(new Error('Invalid timeframe selected.'));
        }

        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
        ws.onopen = () => {
            console.log('Connected to Deriv WebSocket for OHLC.');
            // Corrected WebSocket request for historical data
            ws.send(JSON.stringify({
                ticks_history: symbol,
                adjust_start_time: 1,
                end: 'latest',
                start: 1,
                count: 100, // Fetching 100 data points
                style: 'candles',
                granularity: granularity
            }));
        };

        ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.msg_type === 'history') {
                const ohlcData = data.candles.map(d => ({
                    time: new Date(d.epoch * 1000).toISOString(),
                    open: parseFloat(d.open),
                    high: parseFloat(d.high),
                    low: parseFloat(d.low),
                    close: parseFloat(d.close)
                }));
                ws.close();
                resolve(ohlcData);
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

// Function to call the Gemini API for analysis with a structured JSON response
async function analyzeWithGemini(data, timeframe) {
    const dataPrompt = data.map(tick => `Time: ${tick.time}, Open: ${tick.open}, High: ${tick.high}, Low: ${tick.low}, Close: ${tick.close}`).join('\n');
    
    const userPrompt = `
        You are a seasoned financial analyst. Analyze the provided candlestick market data for an asset from the Deriv platform, with a timeframe of ${timeframe}.
        
        **Part 1: In-depth Technical Analysis**
        * **Identify Liquidity:** Identify key areas of buyside liquidity (above old highs) and sellside liquidity (below old lows). Explain what the potential "smart money" objective might be for these zones.
        * **Fair Value Gaps (FVG):** Identify any unmitigated fair value gaps and their significance.
        * **Order Blocks:** Identify any valid order blocks. A valid order block must be untouched, have an imbalance, and lead to a break in market structure.
        * **Price Action Narrative:** Analyze the recent price action to determine if it fits the "Power of Three" pattern (consolidation, manipulation, and acceleration).
        
        **Part 2: Conclusive Trade Recommendation**
        * Synthesize your findings from the technical analysis to provide a comprehensive narrative of the market's current state.
        * Based on this confluence, provide a potential future direction for the price.
        * Provide a specific trade recommendation with clear entry, take profit (TP), and stop loss (SL) prices.

        ---
        Market Data:
        ${dataPrompt}
    `;

    const payload = {
        contents: [{
            parts: [{ text: userPrompt }]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    analysis: { type: "STRING" },
                    entry: { type: "NUMBER" },
                    takeProfit: { type: "NUMBER" },
                    stopLoss: { type: "NUMBER" }
                }
            }
        }
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonText) {
            // Handle cases where no text part is returned from the API
            return {
                analysis: 'Analysis failed. No text response from Gemini API. Please try again.',
                entry: null,
                takeProfit: null,
                stopLoss: null
            };
        }

        try {
            // Attempt to parse the JSON
            return JSON.parse(jsonText);
        } catch (jsonError) {
            // If parsing fails, return the raw text as the analysis
            console.error('JSON parsing failed. Returning raw text as analysis:', jsonError);
            return {
                analysis: jsonText,
                entry: null,
                takeProfit: null,
                stopLoss: null
            };
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return {
            analysis: 'Failed to get a response from the analysis service. Please check your API key and network connection.',
            entry: null,
            takeProfit: null,
            stopLoss: null
        };
    }
}

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
