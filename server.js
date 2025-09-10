// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = 3000;

// Configure Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/analyze', upload.single('matchesFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send({ error: 'No file uploaded.' });
  }

  try {
    const fileContent = await fs.readFile(req.file.path, 'utf8');
    const prompt = `Here are the matches from the file: ${fileContent}\n\nwho won`;

    const result = await model.generateContent(prompt);
    const responseText = await result.response.text();

    await fs.unlink(req.file.path); // Clean up the uploaded file

    // Format the response similarly to the previous model response
    const formattedResponse = responseText.replace(/\*/g, '').split('\n').map(line => {
      // Simple heuristic to detect if a winner is found
      if (line.includes('won against')) {
        return `*   **${line.trim()}**`;
      }
      return `*   ${line.trim()}`;
    }).join('\n');

    res.send({ result: formattedResponse });
  } catch (error) {
    console.error('Error:', error);
    if (req.file) {
      await fs.unlink(req.file.path).catch(e => console.error("Cleanup failed:", e));
    }
    res.status(500).send({ error: 'Failed to process the request.' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
