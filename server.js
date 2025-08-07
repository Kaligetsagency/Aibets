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
        Act as a professional football match analyst. Your task is to analyze and predict the outcome of an upcoming football fixture. To do this, you must follow these steps:

        1.  **Identify the Teams and Match Details:**
            * Home Team: ${homeTeam}
            * Away Team: ${awayTeam}
            * Assume a future match date, a neutral venue, and that this is a league fixture.

        2.  **Gather and Analyze Key Variables for Both Teams:**
            * **Performance Metrics:**
                * Recent Form (last 5 matches): Generate plausible form based on team reputation and current standings.
                * Home and Away Records: Generate plausible records.
                * Head-to-head record: Generate a plausible head-to-head record.
                * Key offensive and defensive stats (e.g., goals scored/conceded): Generate plausible stats.
            * **Player Information:**
                * Significant injuries or suspensions: Generate plausible key player absences.
                * Key players in form: Identify plausible in-form players.
            * **Contextual Factors:**
                * Tactical style: Describe the plausible tactical style of each team.
                * Motivation: Describe the plausible motivation level for each team.
                * Rest period: Assume a standard rest period (e.g., 7 days).

        3.  **Synthesize the Data and Formulate a Prediction:**
            * Compare the strengths and weaknesses of each team.
            * Identify which team has the tactical advantage.
            * Consider any potential upsets or unexpected factors.
            * Provide a final prediction, including a most likely scoreline and a confidence level for your prediction (e.g., High, Medium, Low).

        4.  **Structure the Final Output:**
            * Provide your response in a single JSON object.
    `;

    // JSON schema for the desired response
    const jsonSchema = {
        type: "OBJECT",
        properties: {
            summary: {
                type: "STRING"
            },
            analysis: {
                type: "OBJECT",
                properties: {
                    homeTeam: {
                        type: "OBJECT",
                        properties: {
                            teamName: { type: "STRING" },
                            recentForm: { type: "STRING" },
                            homeRecord: { type: "STRING" },
                            keyPlayers: { type: "ARRAY", items: { type: "STRING" } },
                            tacticalStyle: { type: "STRING" },
                            motivation: { type: "STRING" }
                        }
                    },
                    awayTeam: {
                        type: "OBJECT",
                        properties: {
                            teamName: { type: "STRING" },
                            recentForm: { type: "STRING" },
                            awayRecord: { type: "STRING" },
                            keyPlayers: { type: "ARRAY", items: { type: "STRING" } },
                            tacticalStyle: { type: "STRING" },
                            motivation: { type: "STRING" }
                        }
                    },
                    headToHead: {
                        type: "STRING"
                    },
                    injuriesAndSuspensions: {
                        type: "STRING"
                    }
                }
            },
            prediction: {
                type: "OBJECT",
                properties: {
                    outcome: { type: "STRING" },
                    scoreline: { type: "STRING" },
                    confidence: { type: "STRING" }
                }
            },
            conclusion: {
                type: "STRING"
            }
        },
        "propertyOrdering": ["summary", "analysis", "prediction", "conclusion"]
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
                                         
