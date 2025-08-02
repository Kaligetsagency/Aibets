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

// Base URL for the apifootball.com API
const FOOTBALL_API_URL = 'https://apiv2.apifootball.com/';

// Helper function to make requests to the apifootball.com API
async function fetchFootballData(params) {
    const queryParams = new URLSearchParams({
        ...params,
        APIkey: FOOTBALL_API_KEY
    });

    const response = await fetch(`${FOOTBALL_API_URL}?${queryParams.toString()}`);

    if (!response.ok) {
        throw new Error(`Football API error! Status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
        console.error('Football API returned an error:', data.error);
        throw new Error(`Football API Error: ${data.error}`);
    }

    return data;
}

/**
 * Endpoint to get a list of leagues from standings, which is more reliable.
 */
app.get('/api/leagues', async (req, res) => {
    try {
        const standings = await fetchFootballData({ action: 'get_standings' });
        // apifootball.com API returns all leagues by default, we need to extract them from the standings data.
        const uniqueLeagues = new Map();
        if (Array.isArray(standings)) {
            standings.forEach(s => {
                if (s.league_id && !uniqueLeagues.has(s.league_id)) {
                    uniqueLeagues.set(s.league_id, {
                        league_id: s.league_id,
                        league_name: s.league_name
                    });
                }
            });
        }
        res.json(Array.from(uniqueLeagues.values()));
    } catch (error) {
        console.error('Failed to fetch leagues:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to get a list of teams for a specific league (from standings).
 */
app.get('/api/teams/:leagueId', async (req, res) => {
    const { leagueId } = req.params;
    try {
        const standings = await fetchFootballData({ action: 'get_standings', league_id: leagueId });
        const teams = standings.map(team => ({
            id: team.team_id,
            name: team.team_name,
        }));
        res.json(teams);
    } catch (error) {
        console.error('Failed to fetch teams:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to get upcoming fixtures for a specific league.
 */
app.get('/api/fixtures/:leagueId', async (req, res) => {
    const { leagueId } = req.params;
    // Get fixtures for the next 7 days
    const fromDate = new Date().toISOString().slice(0, 10);
    const toDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
        const fixtures = await fetchFootballData({
            action: 'get_events',
            league_id: leagueId,
            from: fromDate,
            to: toDate,
        });

        // Filter for upcoming (not started) matches
        const upcomingFixtures = fixtures.filter(fixture => fixture.match_status === '');

        res.json(upcomingFixtures);
    } catch (error) {
        console.error('Failed to fetch fixtures:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint for AI analysis.
 * Takes fixture ID and league ID as input.
 * Fetches data, constructs a prompt, and sends to Gemini.
 */
app.post('/api/analyze', async (req, res) => {
    const { fixtureId, leagueId } = req.body;

    if (!fixtureId || !leagueId) {
        return res.status(400).json({ error: 'Missing required parameters for analysis.' });
    }

    try {
        // Fetch specific fixture details
        const fixtureResponse = await fetchFootballData({
            action: 'get_events',
            match_id: fixtureId
        });
        const fixture = fixtureResponse.length > 0 ? fixtureResponse[0] : null;

        if (!fixture) {
            return res.status(404).json({ error: 'Fixture not found.' });
        }

        // Fetch standings to get home/away team stats
        const standings = await fetchFootballData({ action: 'get_standings', league_id: leagueId });

        const homeTeamStats = standings.find(s => s.team_id === fixture.match_hometeam_id);
        const awayTeamStats = standings.find(s => s.team_id === fixture.match_awayteam_id);

        if (!homeTeamStats || !awayTeamStats) {
            return res.status(404).json({ error: 'Could not retrieve team standings for analysis.' });
        }

        // Fetch recent matches for head-to-head
        const h2hResponse = await fetchFootballData({
            action: 'get_events',
            from: '2023-01-01', // Example date range
            to: new Date().toISOString().slice(0, 10), // Up to today
            league_id: leagueId,
        });

        const h2hData = h2hResponse
            .filter(match =>
                (match.match_hometeam_id === homeTeamStats.team_id && match.match_awayteam_id === awayTeamStats.team_id) ||
                (match.match_hometeam_id === awayTeamStats.team_id && match.match_awayteam_id === homeTeamStats.team_id)
            )
            .slice(0, 5); // Get last 5 matches

        const prompt = `
            Analyze the following football match and provide a betting recommendation.
            
            Match Details:
            - Home Team: ${fixture.match_hometeam_name}
            - Away Team: ${fixture.match_awayteam_name}
            - Date: ${fixture.match_date}
            
            Recent Head-to-Head (last 5 matches):
            ${h2hData.length > 0 ? h2hData.map(match => `  - ${match.match_hometeam_name} ${match.match_hometeam_score} - ${match.match_awayteam_score} ${match.match_awayteam_name}`).join('\n') : '  - No recent head-to-head data available.'}
            
            Home Team Statistics:
            - League Position: ${homeTeamStats.overall_league_position}
            - Overall Points: ${homeTeamStats.overall_league_points}
            - Goals For: ${homeTeamStats.overall_league_GF}
            - Goals Against: ${homeTeamStats.overall_league_GA}
            
            Away Team Statistics:
            - League Position: ${awayTeamStats.overall_league_position}
            - Overall Points: ${awayTeamStats.overall_league_points}
            - Goals For: ${awayTeamStats.overall_league_GF}
            - Goals Against: ${awayTeamStats.overall_league_GA}
            
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
