const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static files from the same directory

// --- Gemini API Configuration ---
// Note: This API key is left empty to be populated by the runtime environment.
const API_KEY = "";
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=" + API_KEY;

// Root route to serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// POST endpoint for AI analysis
app.post('/analyze', async (req, res) => {
  try {
    const { asset, data } = req.body;
    if (!asset || !data) {
      return res.status(400).json({ error: 'Missing asset or data in request body.' });
    }

    console.log(`Received analysis request for ${asset} with ${data.length} ticks.`);

    // Format the tick data for the prompt
    const formattedData = data.map(tick => `(${tick.epoch}, ${tick.price})`).join(', ');

    // Construct the prompt for the Gemini API
    const prompt = {
      contents: [{
        parts: [{
          text: `You are an expert forex and derived indices analyst. Analyze the following real-time price tick data for the asset "${asset}" to provide a concise, one-sentence market sentiment (Bullish, Bearish, or Neutral) and a short-term price prediction for the next 5-10 minutes. The data is in (timestamp, price) format: [${formattedData}]. Focus only on sentiment and prediction, no fluff. Do not provide disclaimers.`
        }]
      }]
    };

    const geminiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prompt),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API Error:', errorText);
      return res.status(geminiResponse.status).json({ error: 'Failed to get analysis from AI.' });
    }

    const geminiResult = await geminiResponse.json();
    const analysisText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis available.';

    console.log(`Analysis for ${asset}: ${analysisText}`);

    res.json({ analysis: analysisText });

  } catch (error) {
    console.error('Server error during analysis:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
          
