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
        Act as a professional football match analyst and sports betting expert. Your task is to analyze and predict the outcome of an upcoming football fixture, with a specific focus on providing a precise and actionable betting recommendation. To do this, you must follow these steps:

        1.  **Identify the Teams and Match Details:**
            * Home Team: ${homeTeam}
            * Away Team: ${awayTeam}
            * Assume a future match date, a neutral venue, and that this is a league fixture.

        2.  **Gather and Analyze Key Variables for Both Teams:**
            * **Performance Metrics:**
                * Recent Form (last 5 matches): Generate plausible form based on team reputation and current standings. Describe this using a W-D-L (Win-Draw-Loss) format.
                * Home and Away Records: Generate plausible records (e.g., "3 wins, 1 draw, 1 loss").
                * Head-to-head record: Generate a plausible head-to-head record. Specify the results of the last 5 encounters.
                * Key offensive and defensive stats: Generate plausible stats such as goals scored per game, goals conceded per game, clean sheets, and average possession.
            * **Player Information:**
                * Significant injuries or suspensions: Generate plausible key player absences and describe their likely impact on the team's performance.
                * Key players in form: Identify plausible in-form players and their contributions (e.g., goals, assists).
            * **Contextual Factors:**
                * Tactical style: Describe the plausible tactical style of each team (e.g., "Possession-based, attacking football" or "Defensive, counter-attacking").
                * Motivation: Describe the plausible motivation level for each team (e.g., "Fighting for a top 4 spot" or "Safe in mid-table with little to play for").
                * Rest period: Assume a standard rest period (e.g., 7 days).
            * **Betting Odds from Top 10 Bookmakers:**
                * Historical Odds (last 5 matches): Describe plausible win, draw, loss odds for each match, noting any significant discrepancies or value bets.
                * Pre-match Odds: Generate plausible odds for win, draw, and loss for the upcoming match.

        3.  **Synthesize the Data and Formulate a Precise Betting Recommendation:**
            * **Comparison:** Compare the strengths and weaknesses of each team, focusing on statistical advantages (e.g., "Team A's high scoring rate versus Team B's poor defensive record").
            * **Tactical Advantage:** Identify which team has the tactical advantage and explain why based on the styles of play.
            * **Value Assessment:** Identify where the most betting value lies. Is the favorite over-priced or is there a good chance of an upset?
            * **Betting Market Analysis:** Go beyond just the final outcome. Consider other markets such as:
                * Over/Under Goals (e.g., Over 2.5 goals)
                * Both Teams to Score (BTTS)
                * Correct Score
                * Handicap Betting
            * **Final Prediction and Confidence:** Provide a final prediction, a most likely scoreline, and a confidence level (e.g., High, Medium, Low) for the core outcome.

        4.  **Structure the Final Output:**
            * Provide your response in a single JSON object. The 'summary' field should be a concise overview of your betting thesis. The 'conclusion' should summarize the recommended bet and its rationale.
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
