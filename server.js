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

        1.  **Identify the Teams and Match Details from live data:**
            * Home Team: ${homeTeam}
            * Away Team: ${awayTeam}
            * Make sure you search and describe for the actual date, time, venue, and competition type of the upcoming match. Make sure you do not make any assumptions.

        2.  **Gather and Analyze Key Variables for Both Teams from live data:**
            * **Performance Metrics:**
                * **Recent Form (last 5 matches):** Make sure you search for the actual recent form (Win-Draw-Loss) for both teams in their last five matches.
                * **Home and Away Records:** Make sure you search for the actual home record of the home team and the away record of the away team.
                * **Head-to-head record:** Make sure you search for the actual head-to-head record between the two teams, including the results of their last five encounters.
                * **Key offensive and defensive stats:** Make sure you search for real stats such as goals scored per game, goals conceded per game, clean sheets, and average possession for both teams.
            * **Player Information:**
                * **Significant injuries or suspensions:** Make sure you search for any real and confirmed key player absences for the upcoming match and describe their likely impact.
                * **Key players in form:** Make sure you identify real in-form players and their actual contributions (e.g., goals, assists).
            * **Contextual Factors:**
                * **Tactical style:** Make sure you describe the actual tactical style of each team based on their recent performances and coaching strategy.
                * **Motivation:** Make sure you search for the actual current league standings, cup implications, or other factors that would influence each team's motivation.
                * **Rest period:** Make sure you search for the actual date of the teams' last matches to determine the actual rest period.
            * **Betting Odds from Top 10 Bookmakers:**
                * **Pre-match Odds:** Make sure you search for the actual latest odds for win, draw, and loss from 10 reputable bookmakers for the upcoming match.

        3.  **Synthesize the Data and Formulate a Precise Betting Recommendation:**
            * **Comparison:** Compare the strengths and weaknesses of each team using the live statistical data, focusing on statistical advantages (e.g., "Team A's high scoring rate versus Team B's poor defensive record").
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
