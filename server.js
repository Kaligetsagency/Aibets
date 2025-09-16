// server.js
// Backend Express server for the trading analysis application.

const express = require('express');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const ti = require('technicalindicators');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static('public'));

/**
 * Converts human-readable timeframe to seconds for the Deriv API.
 * @param {string} timeframe - The timeframe string (e.g., '1m', '5m', '1H').
 * @returns {number} The timeframe in seconds.
 */
function getTimeframeInSeconds(timeframe) {
    const unit = timeframe.slice(-1).toLowerCase();
    const value = parseInt(timeframe.slice(0, -1));
    switch (unit) {
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 24 * 3600;
        default: return 60; // Default to 1 minute
    }
}

/**
 * Calculates a comprehensive set of technical indicators using the 'technicalindicators' library.
 * @param {Array<Object>} candles - Array of candle objects with open, high, low, close, and volume properties.
 * @returns {Array<Object>} Candles with added technical indicator properties.
 */
function calculateAllIndicators(candles) {
    const input = {
        open: candles.map(c => c.open),
        high: candles.map(c => c.high),
        low: candles.map(c => c.low),
        close: candles.map(c => c.close),
        volume: candles.map(c => c.volume)
    };

    const period = 14;
    const rsi = ti.RSI.calculate({ values: input.close, period: period });
    const macdInput = {
        values: input.close,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAonSignal: false,
        SimpleMAonPrice: false
    };
    const macd = ti.MACD.calculate(macdInput);
    const bollingerBands = ti.BollingerBands.calculate({ period: 20, values: input.close, stdDev: 2 });
    const ichimokuCloud = ti.IchimokuCloud.calculate({
        high: input.high,
        low: input.low,
        conversionPeriod: 9,
        basePeriod: 26,
        laggingSpan: 52,
        displacement: 26
    });

    return candles.map((candle, index) => {
        return {
            ...candle,
            rsi: rsi[index - (period - 1)],
            macd: macd[index - (26 - 1)],
            bollingerBands: bollingerBands[index - (20 - 1)],
            ichimokuCloud: ichimokuCloud[index - (52 - 1)]
        };
    });
}

// Global variable to store live candle data
let liveCandles = [];
let ws;
let currentAsset = '';
let currentInterval = 60;

// Function to connect to the Deriv WebSocket API
function connectToDeriv(asset, interval) {
    // Close existing connection if it's open
    if (ws) {
        ws.close();
    }
    liveCandles = [];
    currentAsset = asset;
    currentInterval = interval;

    ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');

    ws.onopen = function (evt) {
        console.log("WebSocket connection opened.");
        // Request historical data (e.g., last 200 candles)
        ws.send(JSON.stringify({
            "ticks_history": asset,
            "end": "latest",
            "count": 200,
            "style": "candles",
            "granularity": interval
        }));
    };

    ws.onmessage = function (msg) {
        const data = JSON.parse(msg.data);
        if (data.history) {
            // Initial historical data
            const newCandles = data.history.times.map((time, index) => ({
                epoch: parseInt(time),
                open: data.history.open[index],
                high: data.history.high[index],
                low: data.history.low[index],
                close: data.history.close[index],
                volume: 0 // Deriv ticks_history doesn't provide volume for candles
            }));
            liveCandles = newCandles;
            console.log(`Received initial ${liveCandles.length} candles.`);
        } else if (data.candles) {
            // A new candle has been received
            const latestCandle = data.candles[0];
            const newCandle = {
                epoch: parseInt(latestCandle.epoch),
                open: latestCandle.open,
                high: latestCandle.high,
                low: latestCandle.low,
                close: latestCandle.close,
                volume: 0
            };

            // Check if we already have this candle (e.g., if it's a re-tick)
            if (liveCandles.length > 0 && liveCandles[liveCandles.length - 1].epoch === newCandle.epoch) {
                // Update the last candle
                liveCandles[liveCandles.length - 1] = newCandle;
            } else {
                // Add new candle and maintain a limited history
                liveCandles.push(newCandle);
                if (liveCandles.length > 200) {
                    liveCandles.shift();
                }
            }
            console.log("Received new candle. Total candles:", liveCandles.length);
        }
    };

    ws.onclose = function (evt) {
        console.log("WebSocket connection closed.");
    };

    ws.onerror = function (err) {
        console.error("WebSocket error:", err);
    };
}

// API endpoint to trigger analysis
app.post('/api/analyze', async (req, res) => {
    const { asset, timeframe } = req.body;

    if (!asset || !timeframe) {
        return res.status(400).json({ error: 'Asset and timeframe are required.' });
    }

    try {
        const interval = getTimeframeInSeconds(timeframe);

        // Disconnect and reconnect to fetch new data for the selected asset/timeframe
        connectToDeriv(asset, interval);

        // Wait a few seconds to ensure we have a good number of candles
        await new Promise(resolve => setTimeout(resolve, 5000));

        if (liveCandles.length < 50) {
            throw new Error('Not enough historical data to perform a proper analysis. Please try again or with a different asset/timeframe.');
        }

        const candlesWithIndicators = calculateAllIndicators(liveCandles);

        const analysisPrompt = `
You are an expert financial market analyst with extensive experience in technical analysis and price action trading. Your task is to analyze the provided candlestick data for a financial asset and provide a trading recommendation.

Analyze the market based on the following:
- **Trend Identification:** Determine the current market trend (bullish, bearish, or sideways) across multiple time horizons.
- **Key Levels:** Identify significant support and resistance levels.
- **Momentum:** Assess the strength and direction of the price movement.
- **Price Action Patterns:** Look for common candlestick and chart patterns that indicate potential market reversals or continuations.

Based on your analysis, provide a concrete trading recommendation. This recommendation must be a single, structured JSON object containing a potential entry point, a take-profit level, and a stop-loss level. Your output should contain only this JSON object and nothing else
`;

        const requestBody = {
            model: "deepseek-coder",
            messages: [
                {
                    role: "system",
                    content: analysisPrompt
                },
                {
                    role: "user",
                    content: `Here is the candle data with technical indicators for ${asset} on a ${timeframe} timeframe:\n\n` +
                        JSON.stringify(candlesWithIndicators, null, 2)
                }
            ],
            stream: false
        };

        const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`AI API responded with status ${aiResponse.status}: ${errorBody}`);
        }

        const aiResult = await aiResponse.json();

        if (!aiResult.candidates || !aiResult.candidates[0] || !aiResult.candidates[0].content || !aiResult.candidates[0].content.parts || !aiResult.candidates[0].content.parts[0] || !aiResult.candidates[0].content.parts[0].text) {
            throw new Error('Invalid response structure from Gemini API.');
        }

        const responseText = aiResult.candidates[0].content.parts[0].text;
        const jsonStartIndex = responseText.indexOf('{');
        const jsonEndIndex = responseText.lastIndexOf('}');

        if (jsonStartIndex === -1 || jsonEndIndex === -1) {
            console.error("Could not find JSON object in response:", responseText);
            throw new Error('Could not find a valid JSON object in the AI response.');
        }

        const jsonString = responseText.substring(jsonStartIndex, jsonEndIndex + 1);

        try {
            const analysis = JSON.parse(jsonString);
            res.json(analysis);
        } catch (e) {
            console.error("Final attempt to parse JSON failed. String was:", jsonString);
            throw new Error('Could not parse the JSON analysis from the AI response.');
        }

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
