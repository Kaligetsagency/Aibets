// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch'); // Make sure you have this dependency installed: npm install node-fetch
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

    // A prompt to instruct the model on its role
    const prompt = `
        You are a football match analyst and sports betting expert. Your task is to provide a detailed analysis and a betting recommendation for an upcoming match between ${homeTeam} and ${awayTeam}.

        Use your tools to find the following information:
        - The actual date, time, venue, and competition of the upcoming match.
        - The recent form (W-D-L) of both teams in their last five matches.
        - The home record of ${homeTeam} and the away record of ${awayTeam}.
        - The head-to-head record between the two teams, including the results of their last five encounters.
        - Key offensive and defensive stats, such as goals scored, goals conceded, and clean sheets per game.
        - Any confirmed key player injuries or suspensions.
        - The latest betting odds for win, draw, and loss from reputable bookmakers.

        After gathering this information, synthesize the data and provide a precise betting recommendation. Consider markets like Over/Under Goals, Both Teams to Score (BTTS), and Handicap Betting.

        Conclude with a final prediction, a most likely scoreline, and a confidence level (e.g., High, Medium, Low). The final output should be a single JSON object.
    `;

    // JSON schema for the desired response
    const jsonSchema = {
        type: "OBJECT",
        properties: {
            summary: {
                type: "STRING",
                description: "A concise overview of the betting thesis."
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
                type: "STRING",
                description: "A summary of the recommended bet and its rationale."
            }
        },
        "propertyOrdering": ["summary", "analysis", "prediction", "conclusion"]
    };

    const tools = [
        {
            functionDeclarations: [
                {
                    name: "search",
                    description: "Search Google for information.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            queries: {
                                type: "ARRAY",
                                items: {
                                    type: "STRING"
                                }
                            }
                        },
                        required: ["queries"]
                    }
                }
            ]
        }
    ];

    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: prompt }]
        }],
        tools: tools,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema
        }
    };

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                const jsonText = candidate.content.parts[0].text;
                try {
                    const parsedJson = JSON.parse(jsonText);
                    res.json(parsedJson);
                } catch (jsonError) {
                    // This handles cases where the model might not return valid JSON directly
                    console.error('Failed to parse JSON from API response:', jsonError);
                    res.status(500).json({ error: 'Failed to parse JSON from the API response.' });
                }
            } else {
                res.status(500).json({ error: 'Unexpected API response structure or empty content.' });
            }
        } else if (result.error) {
            res.status(result.error.code || 500).json({ error: result.error.message });
        } else {
            res.status(500).json({ error: 'Unexpected API response.' });
        }

    } catch (error) {
        console.error('Error during API call:', error);
        res.status(500).json({ error: 'Failed to get prediction from the API.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
