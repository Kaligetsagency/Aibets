// A simple Express.js server to handle API calls
const express = require('express');
const https = require('https'); // Use Node.js's built-in https module
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public')); // Serve static HTML files from a 'public' directory

// Retrieve the Gemini API key from the environment variables
const apiKey = process.env.GEMINI_API_KEY;

// API endpoint to generate betting advice
app.post('/api/predict', (req, res) => {
    const { team1, team2, matchData } = req.body;

    const detailedPrompt = `
    You are a professional sports data analyst with access to the most advanced football analytics. Analyze the provided data for a match between ${team1} and ${team2} and provide a detailed prediction.

    **Goal:** Generate a comprehensive betting analysis for the upcoming match.

    **Instructions:**
    1.  **Analyze and Explain:** Break down the analysis into a few key sections:
        * **Team Performance (Tactical & Positional):** Look at recent form, home/away advantage, and head-to-head records. Include a deep dive into advanced metrics like expected goals (xG), expected assists (xA), and possession-adjusted tackles.
        * **Player Analysis (Form & Fitness):** Evaluate key player performance using metrics like player ratings, heat maps, and recent goal/assist contributions. Note any injuries, suspensions, or returns from injury.
        * **In-Game Dynamics & Psychological Factors:** Consider team morale, recent performance in high-pressure situations, and tactical trends (e.g., set-piece effectiveness, pressing intensity, passing networks).
        * **Referee & Environmental Factors:** Include the referee's historical officiating style, the impact of the crowd, and potential weather conditions.

    2.  **Provide a Confidence Score:** Based on your analysis, provide a confidence score from 0-100% for the predicted outcome. Do not output 100%. State that a 100% prediction is impossible due to the nature of sports.

    3.  **Final Prediction:** Conclude with a clear prediction (e.g., "Home Win," "Draw," "Away Win") and a summary of the key reasons behind it.

    **Match Data for Analysis:**
    ${matchData}

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
        path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };

    const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => {
            data += chunk;
        });
        apiRes.on('end', () => {
            try {
                const result = JSON.parse(data);
                if (result.candidates && result.candidates.length > 0) {
                    const text = result.candidates[0].content.parts[0].text;
                    res.json({ prediction: text });
                } else {
                    console.error('API response was empty or malformed:', result);
                    res.status(500).json({ error: 'Failed to get a valid prediction from the API.' });
                }
            } catch (error) {
                console.error('Error parsing API response:', error);
                res.status(500).json({ error: 'Failed to parse the prediction data.' });
            }
        });
    });

    apiReq.on('error', (error) => {
        console.error('Error with API request:', error);
        res.status(500).json({ error: `API request failed: ${error.message}` });
    });

    apiReq.write(postData);
    apiReq.end();
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
      
