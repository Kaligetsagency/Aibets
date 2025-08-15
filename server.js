const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = 3000;

// Serve static files from the "public" directory
app.use(express.static('public'));

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Route to handle file upload and analysis
app.post('/analyze', upload.single('matchFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const filePath = path.join(__dirname, req.file.path);

    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');

        // Prepare the prompt for the Gemini API
        const prompt = `
            You are a football match analyst and sports betting expert. Your task is to provide a detailed analysis and a betting recommendation for the upcoming matches found in the following text:

            ${fileContent}

            Use Google to find the following information for each match:
            - The actual date, time, venue, and competition of the upcoming match.
            - The recent form (W-D-L) of both teams in their last five matches.
            - The home record of the home team and the away record of the away team.
            - The head-to-head record between the two teams, including the results of their last five encounters.
            - Key offensive and defensive stats, such as goals scored, goals conceded, and clean sheets per game.
            - Any confirmed key player injuries or suspensions.
            - The latest betting odds for win, draw, and loss from reputable bookmakers.

            After gathering this information, synthesize the data and provide a precise betting recommendation for each match. Consider markets like Double chance.

            Conclude with a final prediction, a most likely scoreline, and a confidence level (e.g., High, Medium, Low) for each match. Make sure you provide the results in a list showing all the upcoming matches, your betting recommendation, and your confidence.
        `;

        // Call the Gemini API
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt,
                    }],
                }],
            }),
        });

        if (!geminiResponse.ok) {
            throw new Error(`Gemini API request failed with status ${geminiResponse.status}`);
        }

        const geminiData = await geminiResponse.json();
        const analysis = geminiData.candidates[0].content.parts[0].text;

        res.json({ analysis });

    } catch (error) {
        console.error('Error during analysis:', error);
        res.status(500).json({ error: 'Failed to analyze the match file.' });
    } finally {
        // Clean up the uploaded file
        fs.unlinkSync(filePath);
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
                                     
