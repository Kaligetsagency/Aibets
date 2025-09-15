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
        volume: candles.map(c => c.volume || 0),
        period: 14,
    };

    const sma20 = ti.SMA.calculate({ period: 20, values: input.close });
    const ema50 = ti.EMA.calculate({ period: 50, values: input.close });
    const rsi = ti.RSI.calculate({ period: 14, values: input.close });
    const macd = ti.MACD.calculate({
        values: input.close,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    const bollingerBands = ti.BollingerBands.calculate({
        period: 20,
        values: input.close,
        stdDev: 2
    });
    const stochastic = ti.Stochastic.calculate({
        high: input.high,
        low: input.low,
        close: input.close,
        period: 14,
        signalPeriod: 3
    });
    const adx = ti.ADX.calculate({
        high: input.high,
        low: input.low,
        close: input.close,
        period: 14
    });

    const candlesWithIndicators = candles.map((candle, index) => {
        const newCandle = { ...candle };
        const smaIndex = index - (candles.length - sma20.length);
        const emaIndex = index - (candles.length - ema50.length);
        const rsiIndex = index - (candles.length - rsi.length);
        const macdIndex = index - (candles.length - macd.length);
        const bbIndex = index - (candles.length - bollingerBands.length);
        const stochIndex = index - (candles.length - stochastic.length);
        const adxIndex = index - (candles.length - adx.length);

        if (smaIndex >= 0) newCandle.sma20 = parseFloat(sma20[smaIndex].toFixed(4));
        if (emaIndex >= 0) newCandle.ema50 = parseFloat(ema50[emaIndex].toFixed(4));
        if (rsiIndex >= 0) newCandle.rsi = parseFloat(rsi[rsiIndex].toFixed(2));
        if (macdIndex >= 0) newCandle.macd = macd[macdIndex];
        if (bbIndex >= 0) newCandle.bollingerBands = bollingerBands[bbIndex];
        if (stochIndex >= 0) newCandle.stochastic = stochastic[stochIndex];
        if (adxIndex >= 0) newCandle.adx = adx[adxIndex];

        return newCandle;
    });

    return candlesWithIndicators;
}

/**
 * Deriv API communication via WebSocket to fetch historical candle data.
 * @param {string} asset - The financial asset to fetch data for.
 * @param {string} timeframe - The timeframe for the data.
 * @returns {Promise<any>} A promise that resolves with the fetched candles data, including indicators.
 */
function getMarketData(asset, timeframe) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');

        ws.onopen = () => {
            ws.send(JSON.stringify({
                "ticks_history": asset,
                "end": "latest",
                "count": 35000,
                "style": "candles",
                "granularity": getTimeframeInSeconds(timeframe)
            }));
        };

        ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.error) {
                reject(new Error(data.error.message));
                ws.close();
            } else if (data.msg_type === 'candles') {
                if (data.candles && data.candles.length > 0) {
                    const candlesWithIndicators = calculateAllIndicators(data.candles);
                    resolve(candlesWithIndicators);
                } else {
                    reject(new Error(`No candle data returned for asset ${asset} and timeframe.`));
                }
                ws.close();
            }
        };

        ws.onclose = () => {};
        ws.onerror = (err) => {
            reject(new Error('WebSocket error: ' + err.message));
        };
    });
}

// API endpoint to analyze market data
app.post('/api/analyze', async (req, res) => {
    const { asset, timeframe } = req.body;

    if (!asset || !timeframe) {
        return res.status(400).json({ error: 'Asset and timeframe are required.' });
    }

    try {
        const marketDataWithIndicators = await getMarketData(asset, timeframe);

        // This new prompt guides the AI to use a professional trading strategy.
        const prompt = `You are an expert financial market analyst with extensive experience in technical analysis and price action trading. Your task is to analyze the provided candlestick data for a financial asset and provide a trading recommendation.

Analyze the market based on the following:
- **Trend Identification:** Determine the current market trend (bullish, bearish, or sideways) across multiple time horizons.
- **Key Levels:** Identify significant support and resistance levels.
- **Momentum:** Assess the strength and direction of the price movement.
- **Price Action Patterns:** Look for common candlestick and chart patterns that indicate potential market reversals or continuations.

Based on your analysis, provide a concrete trading recommendation. This recommendation must be a single, structured JSON object containing a potential entry point, a take-profit level, and a stop-loss level. Your output should contain only this JSON object and nothing else'
Data (last 100 candles for context): ${JSON.stringify(marketDataWithIndicators.slice(-100))}`;

        const apiKey = process.env.GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const aiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`Gemini API request failed with status ${aiResponse.status}: ${errorBody}`);
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
