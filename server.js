// server.js
import express from 'express';
import { WebSocket } from 'ws';
import 'dotenv/config'; // Load environment variables from .env
import path from 'path';
import { fileURLToPath } from 'url';

// Utility for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration and Initialization ---
const app = express();
const port = 3000;

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = 'gemini-2.5-flash';

// Deriv API Configuration
const DERIV_WS_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089'; // Public App ID

// Middleware
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper Functions ---

/**
 * Fetches OHLC (candles) data from the Deriv WebSocket API.
 * @param {string} symbol - The market symbol (e.g., 'frxEURUSD').
 * @param {string} granularity - The timeframe in seconds (e.g., '60' for 1m).
 * @returns {Promise<object[]>} - A promise that resolves with the OHLC data.
 */
function fetchOHLCData(symbol, granularity) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(DERIV_WS_URL);
        const candleCount = 200; // Requesting 200 candles for solid analysis

        ws.on('open', () => {
            console.log(`WebSocket connected. Requesting ${symbol} data at ${granularity}s granularity.`);
            ws.send(JSON.stringify({
                "candles_history": symbol,
                "end": "latest",
                "start": 1,
                "style": "candles",
                "count": candleCount,
                "granularity": granularity
            }));
        });

        ws.on('message', (data) => {
            const response = JSON.parse(data);

            if (response.error) {
                ws.close();
                return reject(new Error(`Deriv API Error: ${response.error.message}`));
            }

            if (response.msg_type === 'candles_history') {
                ws.close();
                // Format data for easier Gemini consumption: time, open, high, low, close
                const candles = response.candles.map(c => ({
                    time: new Date(c.epoch * 1000).toISOString(),
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close)
                }));
                resolve(candles);
            }
        });

        ws.on('error', (error) => {
            reject(error);
        });

        ws.on('close', () => {
            console.log('WebSocket closed.');
        });
    });
}

/**
 * Fetches the current market price (latest tick) from the Deriv WebSocket API.
 * @param {string} symbol - The market symbol (e.g., 'frxEURUSD').
 * @returns {Promise<number>} - A promise that resolves with the current price.
 */
function fetchCurrentPrice(symbol) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(DERIV_WS_URL);

        ws.on('open', () => {
            ws.send(JSON.stringify({
                "ticks": symbol,
                "subscribe": 0
            }));
        });

        ws.on('message', (data) => {
            const response = JSON.parse(data);

            if (response.error) {
                ws.close();
                return reject(new Error(`Deriv API Error: ${response.error.message}`));
            }

            if (response.msg_type === 'tick') {
                ws.close();
                resolve(parseFloat(response.tick.quote));
            }
        });

        ws.on('error', (error) => {
            reject(error);
        });
    });
}

/**
 * Maps timeframes (e.g., '1m') to their granularity in seconds (e.g., 60).
 */
const TIME_FRAME_MAP = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
    '1w': 604800
};

// --- API Route ---

app.post('/analyze', async (req, res) => {
    const { asset, timeframes } = req.body;

    if (!asset || !timeframes || timeframes.length === 0) {
        return res.status(400).json({ error: "Missing asset or timeframe selection." });
    }

    // Deriv symbols are prefixed with 'frx' for forex
    const derivSymbol = `frx${asset.replace('/', '').toUpperCase()}`;
    
    try {
        // 1. Fetch current price first
        const currentPrice = await fetchCurrentPrice(derivSymbol);

        // 2. Fetch OHLC data for all selected timeframes concurrently
        const dataFetchPromises = timeframes.map(tf => 
            fetchOHLCData(derivSymbol, TIME_FRAME_MAP[tf])
                .then(data => ({ timeframe: tf, data: data }))
                .catch(err => {
                    console.error(`Error fetching data for ${tf}:`, err.message);
                    return { timeframe: tf, data: [], error: err.message }; // Return empty data on error
                })
        );
        
        const allOhlcData = await Promise.all(dataFetchPromises);
        
        // 3. Prepare the Prompt for Gemini
        const dataForGemini = allOhlcData
            .filter(item => item.data.length > 0) // Only include successful fetches
            .map(item => ({
                timeframe: item.timeframe,
                candles: item.data // The array of candle objects
            }));

        if (dataForGemini.length === 0) {
             return res.status(500).json({ error: "Could not fetch any market data for analysis." });
        }

        const prompt = `
            You are an expert forex technical analyst.
            Analyze the provided OHLC data for the asset **${asset}**.
            The current market price is **${currentPrice}**.
            
            **Technical Analysis Goal:**
            Perform a multi-timeframe analysis (looking for support/resistance, momentum, and volatility) to calculate three conservative take-profit levels (TP1, TP2, TP3).
            
            **Rules for Take-Profits:**
            1. **TP1 (Closest):** A short-term target (e.g., based on recent short-term S/R or 1m/5m/15m volatility).
            2. **TP2 (Medium):** A medium-term target (e.g., based on 1h/4h S/R or Fibonacci extension).
            3. **TP3 (Farthest):** A long-term, high-probability target (e.g., based on 1d/1w S/R or major swing points).
            4. The TPs can be either above or below the current price, indicating a potential long or short trade.
            5. **Crucially, the output must be ONLY a single JSON object** that conforms strictly to the following structure:
            
            \`\`\`json
            {
              "analysis_summary": "A brief summary of your technical analysis, e.g., 'Strong bullish momentum across all timeframes targeting a major weekly resistance.'",
              "tp_levels": {
                "TP1": 0.0000,
                "TP2": 0.0000,
                "TP3": 0.0000
              }
            }
            \`\`\`

            **Input OHLC Data (JSON Array):**
            ${JSON.stringify(dataForGemini)}
        `;
        
        console.log(`Sending prompt to Gemini for analysis of ${asset}...`);
        
        // 4. Call Gemini API
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: "object",
                  properties: {
                    analysis_summary: { type: "string" },
                    tp_levels: {
                      type: "object",
                      properties: {
                        TP1: { type: "number" },
                        TP2: { type: "number" },
                        TP3: { type: "number" }
                      },
                      required: ["TP1", "TP2", "TP3"]
                    }
                  },
                  required: ["analysis_summary", "tp_levels"]
                }
            }
        });
        
        // Extract the JSON object from the response
        const geminiResult = JSON.parse(response.text.trim());

        // 5. Send successful response to client
        res.json({
            asset: asset,
            timeframes: timeframes,
            currentPrice: currentPrice,
            analysis: geminiResult,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Analysis error:', error.message);
        res.status(500).json({ error: 'Failed to complete analysis: ' + error.message });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Ensure you have a .env file with GEMINI_API_KEY set.');
});
