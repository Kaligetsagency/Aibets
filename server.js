const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public'))); 

const DERIV_APP_ID = process.env.DERIV_APP_ID || 1089;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash'; // Using a stable model

// Define the schema for the Gemini's JSON response
const analysisSchema = {
    type: "object",
    properties: {
        sentiment: {
            type: "string",
            description: "Overall sentiment: Bullish, Bearish, or Neutral."
        },
        confidence_score: {
            type: "integer",
            description: "Confidence in the prediction (1-10).",
            minimum: 1,
            maximum: 10
        },
        trend_prediction: {
            type: "string",
            description: "Short-term trend prediction for the next 4-8 hours."
        },
        justification: {
            type: "string",
            description: "A brief justification based on the provided daily price data."
        },
        support_levels: {
            type: "array",
            items: { type: "number" },
            description: "2-3 key support price levels."
        },
        resistance_levels: {
            type: "array",
            items: { type: "number" },
            description: "2-3 key resistance price levels."
        },
        trade_idea: {
            type: "string",
            description: "A hypothetical trade setup."
        }
    },
    required: ["sentiment", "confidence_score", "trend_prediction", "justification", "support_levels", "resistance_levels", "trade_idea"]
};


/**
 * Fetches historical 1-day candles from Deriv's WebSocket API.
 * @param {string} asset - The asset symbol (e.g., R_100).
 * @returns {Promise<object>} - Object containing currentPrice, priceSummary for AI, and chartData.
 */
function fetchDerivCandles(asset) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
        
        let candles_data = [];

        ws.on('open', () => {
            const candleRequest = {
                "ticks_history": asset,
                "end": "latest",
                "start": 1, 
                "style": "candles",
                "granularity": 86400, // 1 Day candles
                "count": 30 // 30 candles for analysis and chart
            };
            ws.send(JSON.stringify(candleRequest));
        });

        ws.on('message', (data) => {
            const response = JSON.parse(data);

            if (response.error) {
                ws.close();
                return reject(new Error(`Deriv API Error: ${response.error.message}`));
            }

            if (response.msg_type === 'candles' && response.candles) {
                candles_data = response.candles.map(c => ({
                    epoch: c.epoch,
                    date: new Date(c.epoch * 1000).toISOString().split('T')[0],
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close)
                }));
                
                const currentPrice = candles_data.length > 0 ? candles_data[candles_data.length - 1].close : 'N/A';
                
                // Prepare a summary of the last 5 candles for the AI prompt
                const lastFiveCandles = candles_data.slice(-5).map(c => ({
                    date: c.date,
                    open: c.open.toFixed(5),
                    close: c.close.toFixed(5)
                }));

                ws.close();
                resolve({ 
                    currentPrice, 
                    priceSummary: JSON.stringify(lastFiveCandles, null, 2), 
                    chartData: candles_data 
                });
            }
        });

        ws.on('error', (err) => {
            reject(new Error(`WebSocket connection error: ${err.message}`));
        });
        
        ws.on('close', () => {
             // Connection closed
        });
    });
}

// Endpoint to retrieve a list of tradable Deriv assets (for frontend population)
app.get('/assets', async (req, res) => {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
    
    ws.on('open', () => {
        // Request the list of active symbols
        ws.send(JSON.stringify({ "active_symbols": "brief", "product_type": "all" }));
    });

    ws.on('message', (data) => {
        const response = JSON.parse(data);
        ws.close();

        if (response.error) {
            return res.status(503).json({ message: `Deriv API Error fetching assets: ${response.error.message}` });
        }

        if (response.msg_type === 'active_symbols' && response.active_symbols) {
            // Filter and map to get Synthetic and Forex symbols
            const assets = response.active_symbols
                .filter(s => s.market === 'synthetic_index' || s.market === 'forex')
                .map(s => ({
                    symbol: s.symbol,
                    name: s.display_name
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            return res.json(assets);
        }
    });

    ws.on('error', (err) => {
        res.status(503).json({ message: `Failed to connect to Deriv WS to fetch assets: ${err.message}` });
    });
});


app.post('/analyze', async (req, res) => {
    const { asset } = req.body;

    if (!asset) {
        return res.status(400).json({ message: 'Asset symbol is required.' });
    }

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ message: 'Gemini API key is not configured on the server.' });
    }

    let marketData;
    try {
        marketData = await fetchDerivCandles(asset);
    } catch (error) {
        return res.status(503).json({ message: `Data retrieval failed: ${error.message}` });
    }

    const prompt = `
        You are a veteran Foreign Exchange market analyst with 15 years of experience specializing in synthetic indices and forex. Your analysis must be objective, based solely on the provided market data (daily candles), and focus on short-term actionable insights.
        
        Analyze the asset ${asset} given the following summary of the last 5 daily candles:
        
        ${marketData.priceSummary}

        Provide a concise but comprehensive analysis according to the required JSON schema.
        
        - The trend prediction is for the next 4-8 hours (intraday) based on the daily context.
        - Key price levels should be relevant to the current trading range and have 3 decimal places for synthetic indices.
    `;

    // FIX FOR ERROR: Use the correct endpoint and structured output field
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await axios.post(apiUrl, {
            contents: [{
                parts: [{ text: prompt }]
            }],
            config: {
                // Correct field name for structured output
                responseMimeType: "application/json",
                responseSchema: analysisSchema
            }
        });
        
        const jsonResponseText = response.data.candidates[0].content.parts[0].text;
        const analysisData = JSON.parse(jsonResponseText);

        // Send the structured analysis AND the chart data back to the client
        res.json({ 
            analysis: analysisData,
            chartData: marketData.chartData,
            currentPrice: marketData.currentPrice
        });

    } catch (error) {
        console.error('Error calling Gemini API:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Failed to retrieve analysis from AI service. Check Gemini API key and prompt structure.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
