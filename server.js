const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public'))); 

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
            description: "A brief justification based on the provided data."
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
            description: "A hypothetical trade setup (e.g., 'Consider a long position if price breaks above X')."
        }
    },
    required: ["sentiment", "confidence_score", "trend_prediction", "justification", "support_levels", "resistance_levels"]
};


// Function to fetch historical and current data from Alpha Vantage
async function fetchAssetData(asset) {
    const avApiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!avApiKey) {
        throw new Error('Alpha Vantage API key is not configured.');
    }

    // Alpha Vantage uses symbols like 'FX_BTCUSD' or 'FX_EURUSD' for forex/crypto
    // We assume the frontend passes a standard symbol like EURUSD
    const symbol = `FX_${asset}`.replace('FX_FX_', 'FX_'); // Handle potential double FX_ if asset is already FX_EURUSD
    
    // Fetch 1-hour data for historical chart
    const url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${asset.substring(0, 3)}&to_symbol=${asset.substring(3)}&outputsize=full&apikey=${avApiKey}`;

    try {
        const response = await axios.get(url);
        const data = response.data['Time Series FX (Daily)'];
        
        if (!data) {
            throw new Error('Could not retrieve valid data from Alpha Vantage. Check asset symbol and API key.');
        }

        // Get the latest 5 days of data for the prompt and the chart
        const timeSeriesKeys = Object.keys(data).sort().reverse();
        const latestDataKeys = timeSeriesKeys.slice(0, 5); 
        
        const latestDataPoints = latestDataKeys.map(key => ({
            date: key,
            open: parseFloat(data[key]['1. open']),
            high: parseFloat(data[key]['2. high']),
            low: parseFloat(data[key]['3. low']),
            close: parseFloat(data[key]['4. close']),
        }));

        const currentPrice = latestDataPoints[0] ? latestDataPoints[0].close : 'N/A';
        const latestPriceSummary = JSON.stringify(latestDataPoints.slice(0, 3), null, 2); // Send last 3 days to AI

        return { currentPrice, latestPriceSummary, chartData: latestDataPoints.reverse() };

    } catch (error) {
        console.error('Error fetching data from Alpha Vantage:', error.message);
        throw new Error('Failed to retrieve market data for analysis.');
    }
}


app.post('/analyze', async (req, res) => {
    const { asset } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!asset) {
        return res.status(400).json({ message: 'Asset symbol is required.' });
    }

    if (!apiKey) {
        return res.status(500).json({ message: 'API key is not configured on the server.' });
    }

    let marketData;
    try {
        marketData = await fetchAssetData(asset);
    } catch (error) {
        return res.status(503).json({ message: error.message });
    }

    const prompt = `
        You are a veteran Foreign Exchange market analyst with 15 years of experience. Your analysis must be objective, based solely on the provided market data, and focus on short-term actionable insights.
        
        Analyze the forex asset ${asset} given the following daily price summary (last 3 trading days):
        
        ${marketData.latestPriceSummary}

        Provide a concise but comprehensive analysis according to the required JSON schema.
        
        - The sentiment must be justified using trends or price action from the provided data.
        - The trend prediction is for the next 4-8 hours (intraday).
        - Key price levels should be relevant to the current trading range.
    `;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(apiUrl, {
            contents: [{
                parts: [{ text: prompt }]
            }],
            config: {
                // Enforce JSON output using the defined schema
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
        res.status(500).json({ message: 'Failed to retrieve analysis from AI service.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
