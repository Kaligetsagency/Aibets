const express = require('express');
const cors =require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

// Import technical indicators library
const ti = require('technicalindicators');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

app.post('/analyze', async (req, res) => {
    const { asset, timeframe, candles } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!asset || !timeframe || !candles || candles.length < 20) {
        return res.status(400).json({ message: 'Asset, timeframe, and sufficient candle data are required.' });
    }
    if (!apiKey) {
        return res.status(500).json({ message: 'API key is not configured on the server.' });
    }

    // --- Prepare data for analysis ---
    const closePrices = candles.map(c => c.close);
    const highPrices = candles.map(c => c.high);
    const lowPrices = candles.map(c => c.low);

    // --- Calculate Technical Indicators ---
    const rsi = ti.RSI.calculate({ period: 14, values: closePrices }).slice(-1)[0];
    const macd = ti.MACD.calculate({
        values: closePrices,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    }).slice(-1)[0];
    const sma9 = ti.SMA.calculate({ period: 9, values: closePrices }).slice(-1)[0];
    const sma21 = ti.SMA.calculate({ period: 21, values: closePrices }).slice(-1)[0];
    const bbands = ti.BollingerBands.calculate({
        period: 20,
        values: closePrices,
        stdDev: 2
    }).slice(-1)[0];
    
    const latestCandle = candles[candles.length - 1];

    // --- Improved Prompt Engineering ---
    const prompt = `
        As an expert financial market analyst, provide a concise, data-driven technical analysis for the asset ${asset} on the ${timeframe} timeframe.
        Your analysis must be based *only* on the data provided below. Do not use any external knowledge.
        Format the entire response in a single block of well-structured HTML.

        **Current Market Data:**
        - **Latest Close Price:** ${latestCandle.close.toFixed(5)}
        - **Latest Candlestick:** Open: ${latestCandle.open}, High: ${latestCandle.high}, Low: ${latestCandle.low}, Close: ${latestCandle.close}
        
        **Calculated Technical Indicators:**
        - **RSI (14):** ${rsi.toFixed(2)}
        - **MACD Line:** ${macd.MACD.toFixed(5)}, **Signal Line:** ${macd.signal.toFixed(5)}, **Histogram:** ${macd.histogram.toFixed(5)}
        - **SMA (9):** ${sma9.toFixed(5)}
        - **SMA (21):** ${sma21.toFixed(5)}
        - **Bollinger Bands (20, 2):** Upper: ${bbands.upper.toFixed(5)}, Middle: ${bbands.middle.toFixed(5)}, Lower: ${bbands.lower.toFixed(5)}

        ---
        
        <h3>Overall Sentiment</h3>
        <p>Assess the market sentiment (e.g., Bullish, Bearish, Neutral/Ranging) by interpreting the relationship between the current price, moving averages (SMA 9 vs SMA 21), and Bollinger Bands.</p>
        
        <h3>Indicator Analysis</h3>
        <ul>
            <li><strong>RSI:</strong> Is the asset overbought (>70), oversold (<30), or in a neutral zone? What momentum does this suggest?</li>
            <li><strong>MACD:</strong> Is the MACD line above or below the signal line? Is the histogram positive or negative? What does this imply for the trend's momentum?</li>
        </ul>

        <h3>Key Price Levels</h3>
        <p>Based on the provided Bollinger Bands and recent price action, identify the most immediate support and resistance levels.</p>
        <ul>
            <li><strong>Support:</strong> (e.g., Bollinger Band Lower, recent low)</li>
            <li><strong>Resistance:</strong> (e.g., Bollinger Band Upper, recent high)</li>
        </ul>

        <h3>Potential Trade Idea</h3>
        <p>Formulate a brief, hypothetical trade idea based *strictly* on the confluence of the indicators provided. (e.g., 'A bearish signal might be forming as the price is near the upper Bollinger Band while the RSI shows potential divergence...'). This is for informational purposes only and is not financial advice.</p>
    `;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(apiUrl, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        
        // Handle cases where the model might return no content
        if (!response.data.candidates || response.data.candidates.length === 0) {
             throw new Error("The AI model returned an empty response.");
        }
        
        const htmlContent = response.data.candidates[0].content.parts[0].text;
        res.json({ htmlContent });

    } catch (error) {
        console.error('Error calling Gemini API:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Failed to retrieve analysis from AI service.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
