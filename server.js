// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

const apiKey = process.env.GEMINI_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to analyze the match
app.post('/analyze', async (req, res) => {
    const { homeTeam, awayTeam } = req.body;

    if (!homeTeam || !awayTeam) {
        return res.status(400).json({ error: 'Please provide both home and away team names.' });
    }

    // This is the detailed prompt for the Gemini API, combining user instructions with dynamic data
    const prompt = `
        Act as an expert sports analyst and betting strategist, provide a detailed betting recommendation for a specific football match. Your analysis must be data-driven, considering a wide range of factors, and your final recommendation must include a suggested bet type and stake level.



**Match Details:**

* **League:** [e.g., Premier League, La Liga, Champions League]

* **Match Importance:** [e.g., Title Decider, Relegation Battle, Rivalry Match, Mid-table Clash]

* **Home Team:** [Home Team Name]

* **Away Team:** [Away Team Name]



**Data to Analyze:**

* **Team Form:** Recent performance (e.g., W-D-L record over the last 5 matches) for both teams, including home/away form.

* **Player Data:**

    * **Key Player Form:** Identify and analyze the performance of key players in both teams who are in good form.

    * **Injuries/Suspensions:** List any key players who are confirmed to be injured or suspended.

    * **Likely Starting XI:** Provide a predicted starting lineup for both teams.

* **Betting Market Analysis:**

    * **Pre-match Odds:** Analyze the initial and current betting odds from multiple sources.

    * **Line Movement:** Describe how the odds have changed over time and what this suggests about market sentiment.

    * **Specific Markets:** Analyze specific markets like "Over/Under Goals" and "Both Teams to Score."

* **Key Narratives:** Identify and analyze any external factors or narratives surrounding the match (e.g., a new coach, a team's winning streak, a major rivalry).



**Betting Strategy & Recommendation:**

* **Betting Recommendation:** Based on your analysis, provide a specific betting recommendation (e.g., "Home Team to Win," "Over 2.5 Goals," "Both Teams to Score - Yes").

* **Stake Level:** Assign a confidence level to your recommendation using a stake level (e.g., "Small," "Medium," "Large").

* **Justification:** Provide a clear, step-by-step justification for your recommendation, highlighting the most important factors that led to your decision.



**Output Format:**

Present the final analysis in a structured JSON object with the following schema:

json

{

  "leagueName": "string",

  "matchImportance": "string",

  "homeTeam": "string",

  "awayTeam": "string",

  "analysis": {

    "teamForm": {

      "homeTeam": "string",

      "awayTeam": "string"

    },

    "playerData": {

      "keyPlayerForm": "string",

      "injuriesOrSuspensions": "string",

      "likelyStartingXI": {

        "homeTeam": "string",

        "awayTeam": "string"

      }

    },

    "bettingMarketAnalysis": {

      "preMatchOdds": "string",

      "lineMovement": "string",

      "specificMarkets": "string"

    },

    "keyNarratives": "string"

  },

  "bettingRecommendation": {

    "betType": "string",

    "stakeLevel": "string",

    "justification": "string"

  }

};

    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema
        }
    };

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const jsonText = result.candidates[0].content.parts[0].text;
            const parsedJson = JSON.parse(jsonText);
            res.json(parsedJson);
        } else {
            res.status(500).json({ error: 'Unexpected API response structure.' });
        }
    } catch (error) {
        console.error('Error during API call:', error);
        res.status(500).json({ error: 'Failed to get prediction from the API.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

                    
