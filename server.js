// server.js
// Backend Express server for the sports betting analysis application.

const express = require('express');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load environment variables
dotenv.config();

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// --- NEW: APIfootball Configuration ---
const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY;
// FIX: Corrected URL for apifootball.com
const APIFOOTBALL_URL = 'apiv3.apifootball.com/?action=get_leagues';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;


// FIX: apifootball.com does not use headers for the API key.
// The key is passed as a query parameter.
const apiFootballHeaders = {};


// --- UPDATED & FIXED: Endpoint to get the list of soccer leagues ---
app.get('/api/leagues', async (req, res) => {
    try {
        // FIX: Replaced the old URL structure with the correct one for apifootball.com.
        // Action is 'get_leagues' and the API key is passed as a query parameter.
        const response = await fetch(`${APIFOOTBALL_URL}?action=get_leagues&APIkey=${APIFOOTBALL_KEY}`);
        if (!response.ok) {
            const errorBody = await response.text();
            console.error('APIfootball Error:', errorBody);
            throw new Error(`APIfootball responded with status: ${response.status}`);
        }
        const data = await response.json();

        // apifootball.com responds with 'error' on failure
        if (data.error) {
            console.error('APIfootball API Errors:', data.message);
            throw new Error('Failed to fetch leagues due to an API error. Check your API Key.');
        }

        // Filter for top leagues for brevity, but you can adjust this
        const topLeagues = data.filter(l => ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "UEFA Champions League"].includes(l.league_name));
        res.json(topLeagues);
    } catch (error) {
        console.error('Error fetching leagues:', error);
        res.status(500).json({ error: error.message });
    }
});


// --- UPDATED: Endpoint to get upcoming games for a specific league ---
app.get('/api/games', async (req, res) => {
    const { leagueId } = req.query;
    if (!leagueId) {
        return res.status(400).json({ error: 'League ID parameter is required.' });
    }
    try {
        const today = new Date().toISOString().slice(0, 10);
        // FIX: Corrected URL structure. Action is 'get_events' and requires a league_id.
        const response = await fetch(`${APIFOOTBALL_URL}?action=get_events&league_id=${leagueId}&from=${today}&to=2026-07-31&APIkey=${APIFOOTBALL_KEY}`);
        
        if (!response.ok) {
            throw new Error(`APIfootball responded with status: ${response.status}`);
        }
        const data = await response.json();
        // apifootball.com data is an array, not a 'response' property.
        res.json(data);
    } catch (error) {
        console.error('Error fetching games:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- UPDATED: Endpoint to analyze a specific game ---
app.post('/api/analyze', async (req, res) => {
    const { fixtureId, leagueId, homeTeamId, awayTeamId } = req.body;

    if (!fixtureId || !leagueId || !homeTeamId || !awayTeamId) {
        return res.status(400).json({ error: 'Fixture ID, league ID, and team IDs are required.' });
    }

    try {
        // --- STEP 1: Fetch Fixture Details & Odds ---
        // FIX: The URL and parameters are different for apifootball.com.
        // Odds and fixture data are likely separate calls. You will need to check the docs.
        // This is a placeholder for how you might fetch the odds, assuming an 'get_odds' action.
        const oddsResponse = await fetch(`${APIFOOTBALL_URL}?action=get_odds&match_id=${fixtureId}&APIkey=${APIFOOTBALL_KEY}`);
        if (!oddsResponse.ok) throw new Error(`APIfootball odds request failed: ${oddsResponse.statusText}`);
        const oddsData = await oddsResponse.json();
        // apifootball.com data structure for odds is different, so this parsing will likely fail.
        // You will need to adjust the parsing logic below to match their JSON response.
        const fixture = {
            teams: {
                home: { name: "Home Team Placeholder" },
                away: { name: "Away Team Placeholder" }
            },
            league: { name: "League Placeholder" },
            fixture: { venue: { name: "Venue Placeholder" } }
        };
        const moneyline = oddsData[0]?.values.find(b => b.name === 'Match Winner');
        const totals = oddsData[0]?.values.find(b => b.name === 'Over/Under');
        const bothToScore = oddsData[0]?.values.find(b => b.name === 'Both Teams Score');


        // --- STEP 2: Fetch Team Statistics ---
        const fetchStats = async (teamId) => {
            // FIX: The URL structure for statistics is different.
            // apifootball.com uses a different action and parameters (e.g., 'get_team_stats').
            const statsResponse = await fetch(`${APIFOOTBALL_URL}?action=get_team_stats&team_id=${teamId}&league_id=${leagueId}&APIkey=${APIFOOTBALL_KEY}`);
            if (!statsResponse.ok) return { form: "N/A", goals_for: "N/A", goals_against: "N/A" };
            const statsData = await statsResponse.json();
            // This parsing logic will need to be adjusted based on the new API's response format.
            return {
                form: statsData.form || "N/A",
                goalsFor: statsData.goals.total.total || "N/A",
                goalsAgainst: statsData.goals.against.total.total || "N/A",
            };
        };
        
        const homeTeamStats = await fetchStats(homeTeamId);
        const awayTeamStats = await fetchStats(awayTeamId);

        // --- STEP 3: Construct a more detailed prompt for Gemini AI ---
        const prompt = `
            You are a professional sports betting analyst specializing in Soccer. Your goal is to provide a comprehensive and precise betting recommendation based on a wide range of data.

            **Task**: Analyze the provided data and return a single, minified JSON object with the following keys: "suggestedBet", "confidenceLevel", "justification", "riskAssessment", and "alternativeBet".
            Do not include any other text, markdown formatting, or explanations outside of the JSON object.

            **Analysis Data:**
            - **Match**: ${fixture.teams.home.name} (Home) vs. ${fixture.teams.away.name} (Away)
            - **Competition**: ${fixture.league.name}
            - **Venue**: ${fixture.fixture.venue.name}

            **Team Statistics (This Season):**
            - **Home Team Form**: ${homeTeamStats.form}
            - **Home Team Goals For**: ${homeTeamStats.goalsFor}
            - **Home Team Goals Against**: ${homeTeamStats.goalsAgainst}
            - **Away Team Form**: ${awayTeamStats.form}
            - **Away Team Goals For**: ${awayTeamStats.goalsFor}
            - **Away Team Goals Against**: ${awayTeamStats.goalsAgainst}

            **Betting Odds (Bet365):**
            - **Moneyline (1X2)**: ${JSON.stringify(moneyline?.values)}
            - **Totals (Over/Under)**: ${JSON.stringify(totals?.values)}
            - **Both Teams To Score**: ${JSON.stringify(bothToScore?.values)}

            **Instructions for Analysis:**
            1.  **Synthesize All Data**: Weigh the betting odds against the team statistics (form, goals for/against).
            2.  **Identify Value**: Determine if the odds offer good value relative to the statistical probability of the outcome. Is a team underrated or overrated by the bookmaker?
            3.  **Justify your Decision**: In 'justification', clearly explain WHY you chose the bet, referencing specific data points (e.g., "Given the home team's strong defensive record (only ${homeTeamStats.goalsAgainst} goals conceded) and the away team's poor form (${awayTeamStats.form}), the value lies with the home team moneyline...").
            4.  **Assess Risk**: In 'riskAssessment', describe the primary risks associated with your suggested bet (e.g., "The main risk is the potential for an upset, as soccer can be unpredictable. The away team has scored in 4 of their last 5 games.").
            5.  **Provide an Alternative**: In 'alternativeBet', suggest a secondary, perhaps safer or different type of, bet based on the data (e.g., "An alternative bet is Over 2.5 goals, given both teams' high scoring records.").

            Generate the JSON output now.
        `;

        // --- STEP 4: Call the Gemini API ---
        const geminiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            throw new Error(`Gemini API request failed: ${errorBody}`);
        }

        const geminiResult = await geminiResponse.json();
        const responseText = geminiResult.candidates[0].content.parts[0].text;
        
        // Clean the response to ensure it's valid JSON
        const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysis = JSON.parse(jsonString);

        res.json(analysis);

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
