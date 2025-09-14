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
    
    // Updated prompt to specifically request ICT analysis
    const userPrompt = `
        You are a seasoned financial analyst specializing in Inner Circle Trader (ICT) concepts. Analyze the provided candlestick market data for an asset from the Deriv platform, with a timeframe of ${timeframe}.
        
        Using ICT methodologies, identify and explain the following elements:
        - **Buyside and Sellside Liquidity:** Identify key areas of liquidity that could be targeted by "smart money".
        - **Fair Value Gaps (FVG):** Pinpoint any unmitigated fair value gaps and explain their significance.
        - **Order Blocks:** Identify valid order blocks and their role in the current price action.
        
        Based on the confluence of these factors, provide a concise summary of the market's current state and a specific trade recommendation.
        
        Provide your analysis in the following JSON format. If no clear instance of an ICT element is found, you can state so in the corresponding field.
        
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
                    buysideLiquidity: { type: "STRING" },
                    sellsideLiquidity: { type: "STRING" },
                    fairValueGaps: { type: "STRING" },
                    orderBlocks: { type: "STRING" },
                    entry: { type: "NUMBER" },
                    takeProfit: { type: "NUMBER" },
                    stopLoss: { type: "NUMBER" }
                }
            }
        }
    };
    
    // Use an AbortController to set a timeout for the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal // Add the signal to the fetch options
        });
        
        clearTimeout(timeoutId); // Clear the timeout if the request is successful

        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonText) {
            return {
                analysis: 'Analysis failed. No text response from Gemini API. Please try again.',
                entry: null,
                takeProfit: null,
                stopLoss: null
            };
        }

        try {
            return JSON.parse(jsonText);
        } catch (jsonError) {
            console.error('JSON parsing failed. Returning raw text as analysis:', jsonError);
            return {
                analysis: jsonText,
                entry: null,
                takeProfit: null,
                stopLoss: null
            };
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error('API call timed out:', error);
            return {
                analysis: 'Analysis request timed out. Please try again.',
                entry: null,
                takeProfit: null,
                stopLoss: null
            };
        }
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
