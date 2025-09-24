const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path'); // Import the 'path' module
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// --- ADD THIS LINE ---
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// --------------------

app.post('/analyze', async (req, res) => {
    const { asset } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!asset) {
        return res.status(400).json({ message: 'Asset symbol is required.' });
    }

    if (!apiKey) {
        return res.status(500).json({ message: 'API key is not configured on the server.' });
    }

    const prompt = `
        Analyze the forex asset ${asset} based on current market conditions. 
        Provide a concise but comprehensive analysis covering the following points.
        Format the entire response in a single block of well-structured HTML.

        <h3>Overall Sentiment</h3>
        <p>Your assessment of whether the sentiment is Bullish, Bearish, or Neutral, with a brief justification.</p>
        
        <h3>Short-Term Trend Prediction (Next 4-8 hours)</h3>
        <p>Your prediction for the trend with a confidence score from 1 (low) to 10 (high).</p>
        
        <h3>Key Price Levels</h3>
        <ul>
            <li><strong>Support:</strong> Identify 2-3 key support levels.</li>
            <li><strong>Resistance:</strong> Identify 2-3 key resistance levels.</li>
        </ul>

        <h3>Potential Trade Idea</h3>
        <p>A brief, hypothetical trade setup (e.g., 'Consider a long position if price breaks above X with a target of Y'). This is for informational purposes only and not financial advice.</p>
    `;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(apiUrl, {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        });
        
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

    
