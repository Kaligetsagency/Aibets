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
const APIFOOTBALL_HOST = 'v3.football.api-sports.io';
const APIFOOTBALL_URL = `https://v3.football.api-sports.io`;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;


const apiFootballHeaders = {
    'x-rapidapi-host': APIFOOTBALL_HOST,
    'x-rapidapi-key': APIFOOTBALL_KEY,
};

// --- NEW: Endpoint to get the list of soccer leagues ---
app.get('/api/leagues', async (req, res) => {
    try {
        const response = await fetch(`${APIFOOTBALL_URL}/leagues?current=true`, { headers: apiFootballHeaders });
        if (!response.ok) {
            throw new Error(`APIfootball responded with status: ${response.status}`);
        }
        const data = await response.json();
        // Filter for top leagues for brevity, but you can adjust this
        const topLeagues = data.response.filter(l => ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "UEFA Champions League"].includes(l.league.name));
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
        const response = await fetch(`${APIFOOTBALL_URL}/fixtures?league=${leagueId}&season=2024&from=${today}&to=2024-12-31`, { headers: apiFootballHeaders });
        
        if (!response.ok) {
            throw new Error(`APIfootball responded with status: ${response.status}`);
        }
        const data = await response.json();
        res.json(data.response);
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
        const fixtureResponse = await fetch(`${APIFOOTBALL_URL}/fixtures?id=${fixtureId}`, { headers: apiFootballHeaders });
        if (!fixtureResponse.ok) throw new Error(`APIfootball fixtures request failed: ${fixtureResponse.statusText}`);
        const fixtureData = await fixtureResponse.json();
        const fixture = fixtureData.response[0];
        if (!fixture) return res.status(404).json({ error: 'Fixture not found.' });

        const oddsResponse = await fetch(`${APIFOOTBALL_URL}/odds?fixture=${fixtureId}&bookmaker=8`, { headers: apiFootballHeaders }); // 8 = Bet365, a common bookmaker
        if (!oddsResponse.ok) throw new Error(`APIfootball odds request failed: ${oddsResponse.statusText}`);
        const oddsData = await oddsResponse.json();
        const bookmaker = oddsData.response[0]?.bookmakers[0];
        const moneyline = bookmaker?.bets.find(b => b.name === 'Match Winner');
        const totals = bookmaker?.bets.find(b => b.name === 'Over/Under');
        const bothToScore = bookmaker?.bets.find(b => b.name === 'Both Teams Score');


        // --- STEP 2: Fetch Team Statistics (this replaces the hardcoded data) ---
        const fetchStats = async (teamId) => {
            const statsResponse = await fetch(`${APIFOOTBALL_URL}/teams/statistics?league=${leagueId}&season=2024&team=${teamId}`, { headers: apiFootballHeaders });
            if (!statsResponse.ok) return { form: "N/A", goals_for: "N/A", goals_against: "N/A" };
            const statsData = await statsResponse.json();
            return {
                form: statsData.response?.form || "N/A",
                goalsFor: statsData.response?.goals.for.total.total || "N/A",
                goalsAgainst: statsData.response?.goals.against.total.total || "N/A",
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
