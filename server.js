const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Deriv.com WebSocket Connection ---
const derivWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
const api = new DerivAPIBasic({ connection: derivWs });

let availableAssets = [];

const fetchAssets = async () => {
    try {
        const response = await api.activeSymbols({ active_symbols: 'brief', product_type: 'basic' });
        if (response.error) {
            console.error('Error fetching assets:', response.error.message);
            return;
        }
        // Filter for major forex pairs
        availableAssets = response.active_symbols
            .filter(symbol => symbol.market === 'forex' && symbol.submarket === 'major_pairs')
            .map(symbol => ({
                symbol: symbol.symbol,
                displayName: symbol.display_name
            }));
        console.log('Successfully fetched forex assets.');
    } catch (error) {
        console.error('Failed to fetch assets from Deriv API:', error);
    }
};

// Fetch assets on server start and then periodically
fetchAssets();
setInterval(fetchAssets, 3600000); // Refresh every hour

// Endpoint to provide the asset list to the frontend
app.get('/api/assets', (req, res) => {
    if (availableAssets.length > 0) {
        res.json(availableAssets);
    } else {
        res.status(503).json({ error: 'Asset list is not available yet. Please try again in a moment.' });
    }
});


// --- Gemini API Proxy Endpoint ---
app.post('/api/analyze-asset', async (req, res) => {
    const { assetData } = req.body;

    if (!assetData) {
        return res.status(400).json({ error: 'Asset data is required.' });
    }

    const prompt = `
        Act as a professional forex market analyst with expertise in quantitative trading and AI-driven predictive analytics.

        Analyze the following real-time forex asset data. Provide a detailed, easy-to-understand analysis that includes a price forecast, potential trend reversal alerts, and a sentiment score (bullish, bearish, or neutral). Justify your analysis with specific points based on the provided data.

        The data provided is a JSON object representing the latest tick for the asset: ${JSON.stringify(assetData)}

        Return the analysis in a structured JSON format with the following keys: "forecast" (a summary of the price forecast), "reversalAlerts" (a boolean), "sentiment" (string: "Bullish", "Bearish", or "Neutral"), and "analysisDetails" (a detailed, markdown-formatted explanation). Do not wrap the JSON in markdown code blocks.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Ensure the response is valid JSON before parsing
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResponse = JSON.parse(cleanedText);

        res.json(jsonResponse);

    } catch (error) {
        console.error('Error calling Gemini API:', error);
        res.status(500).json({ error: 'Failed to get analysis from AI model.' });
    }
});


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
