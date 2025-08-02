// server.js
// Backend Express server for the AI betting analysis application.

const express = require('express');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

// Middleware to parse JSON bodies and serve static files
app.use(express.json());
app.use(express.static('public'));

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Base URL for the Football API
const FOOTBALL_API_URL = 'https://v3.football.api-sports.io';

// Helper function to make requests to the Football API
async function fetchFootballData(endpoint) {
    const response = await fetch(`${FOOTBALL_API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
            'x-rapidapi-key': FOOTBALL_API_KEY
        }
    });

    if (!response.ok) {
        throw new Error(`Football API error! Status: ${response.status}`);
    }

    const data = await response.json();
    if (data.errors && Object.keys(data.errors).length > 0) {
        console.error('Football API returned an error:', data.errors);
        throw new Error(`Football API Error: ${JSON.stringify(data.errors)}`);
    }

    return data.response;
}

/**
 * Endpoint to get a list of leagues
 */
app.get('/api/leagues', async (req, res) => {
    try {
        const leagues = await fetchFootballData('/leagues');
        res.json(leagues);
    } catch (error) {
        console.error('Failed to fetch leagues:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to get a list of teams for a specific league and season
 */
app.get('/api/teams/:leagueId/:season', async (req, res) => {
    const { leagueId, season } = req.params;
    try {
        const teams = await fetchFootballData(`/teams?league=${leagueId}&season=${season}`);
        res.json(teams);
    } catch (error) {
        console.error('Failed to fetch teams:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to get upcoming fixtures for a specific team, league and season
 */
app.get('/api/fixtures/:teamId/:leagueId/:season', async (req, res) => {
    const { teamId, leagueId, season } = req.params;
    try {
        const fixtures = await fetchFootballData(`/fixtures?league=${leagueId}&season=${season}&team=${teamId}&status=NS`); // status=NS means Not Started
        res.json(fixtures);
    } catch (error) {
        console.error('Failed to fetch fixtures:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint for AI analysis
 * Takes league ID, fixture ID as input.
 * Fetches data, constructs a prompt, and sends to Gemini.
 */
app.post('/api/analyze', async (req, res) => {
    const { fixtureId, homeTeamId, awayTeamId, leagueId, season } = req.body;

    if (!fixtureId || !homeTeamId || !awayTeamId || !leagueId || !season) {
        return res.status(400).json({ error: 'Missing required parameters for analysis.' });
    }

    try {
        // Fetch specific fixture details
        const fixtureResponse = await fetchFootballData(`/fixtures?id=${fixtureId}`);
        const fixture = fixtureResponse.length > 0 ? fixtureResponse[0] : null;

        // Fetch head-to-head statistics
        const h2hResponse = await fetchFootballData(`/fixtures/headtohead?h2h=${homeTeamId}-${awayTeamId}`);
        const h2hData = h2hResponse.slice(0, 5); // Get last 5 matches

        // Fetch team statistics for both teams
        const homeTeamStats = await fetchFootballData(`/teams/statistics?league=${leagueId}&season=${season}&team=${homeTeamId}`);
        const awayTeamStats = await fetchFootballData(`/teams/statistics?league=${leagueId}&season=${season}&team=${awayTeamId}`);

        if (!fixture || !homeTeamStats || !awayTeamStats) {
            return res.status(404).json({ error: 'Could not retrieve all necessary data for analysis.' });
        }

        const prompt = `
            Analyze the following football match and provide a betting recommendation.
            
            Match Details:
            - Home Team: ${fixture.teams.home.name}
            - Away Team: ${fixture.teams.away.name}
            - Date: ${new Date(fixture.fixture.date).toLocaleString()}
            
            Recent Head-to-Head (last 5 matches):
            ${h2hData.map(match => `  - ${match.teams.home.name} ${match.goals.home} - ${match.goals.away} ${match.teams.away.name} (Winner: ${match.teams.home.winner === true ? match.teams.home.name : match.teams.away.name})`).join('\n')}
            
            Home Team Statistics:
            - Form: ${homeTeamStats.form}
            - Goals For (Total): ${homeTeamStats.goals.for.total.total}
            - Goals Against (Total): ${homeTeamStats.goals.against.total.total}
            
            Away Team Statistics:
            - Form: ${awayTeamStats.form}
            - Goals For (Total): ${awayTeamStats.goals.for.total.total}
            - Goals Against (Total): ${awayTeamStats.goals.against.total.total}
            
            Based on this data, provide a structured JSON response with a predicted outcome (e.g., "Home Win", "Away Win", "Draw"), a recommended bet (e.g., "Moneyline - Home Team", "Over 2.5 Goals"), and a confidence score (from 0 to 100).
        `;

        const chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        
        // Define the JSON schema for the response
        const payload = {
            contents: chatHistory,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "predictedOutcome": { "type": "STRING" },
                        "recommendedBet": { "type": "STRING" },
                        "confidenceScore": { "type": "NUMBER" }
                    },
                    "propertyOrdering": ["predictedOutcome", "recommendedBet", "confidenceScore"]
                }
            }
        };

        const geminiApiKey = GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

        const aiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`AI API call failed with status ${aiResponse.status}: ${errorBody}`);
        }

        const aiResult = await aiResponse.json();
        
        if (aiResult.candidates && aiResult.candidates.length > 0 &&
            aiResult.candidates[0].content && aiResult.candidates[0].content.parts &&
            aiResult.candidates[0].content.parts.length > 0) {
            const jsonString = aiResult.candidates[0].content.parts[0].text;
            const analysis = JSON.parse(jsonString);
            res.json(analysis);
        } else {
            throw new Error('Invalid response structure from Gemini API.');
        }

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
