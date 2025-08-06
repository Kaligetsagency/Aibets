// A simple Express.js server to handle API calls
const express = require('express');
const https = require('https');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

const apiKey = process.env.GEMINI_API_KEY;

app.post('/api/predict', (req, res) => {
    const { team1, team2 } = req.body; // Removed 'matchData' since it's no longer used

    // Updated prompt to rely on the AI's internal knowledge
    const detailedPrompt = `
    You are a professional sports data analyst with access to a vast database of football analytics. Analyze a match between ${team1} and ${team2} and provide a detailed prediction. Do not use external data. Use your internal knowledge base to generate the analysis.

    **Goal:** Generate a comprehensive betting analysis for the upcoming match.

    **Instructions:**
    1.  **Analyze and Explain:** Break down the analysis into a few key sections based on your knowledge:
        * **Team Performance (Tactical & Positional):** Discuss recent form, home/away advantage, and head-to-head records.
        * **Player Analysis (Form & Fitness):** Evaluate key player performance and note any known injuries or suspensions.
        * **In-Game Dynamics & Psychological Factors:** Consider team morale and tactical trends.

    2.  **Provide a Confidence Score:** Based on your analysis, provide a confidence score from 0-100% for the predicted outcome. Do not output 100%. State that a 100% prediction is impossible due to the nature of sports.

    3.  **Final Prediction:** Conclude with a clear prediction (e.g., "Home Win," "Draw," "Away Win") and a summary of the key reasons behind it.

    **Example Output Structure:**
    - **Analysis:** [Detailed breakdown of the above points]
    - **Confidence Score:** [A number from 0-99]%
    - **Prediction:** [Final outcome and rationale]
    `;

    const postData = JSON.stringify({
        contents: [{
            parts: [{
                text: detailedPrompt
            }]
        }]
    });

    const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`, // Updated model name
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };

    const apiReq = https.request(options, (apiRes) => {
        // ... (rest of the code remains the same)
    });

    // ... (rest of the code remains the same)
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
