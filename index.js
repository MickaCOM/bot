import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

dotenv.config();
const openai = new OpenAI({ apiKey: PROCESS.ENV.OPENAI_API_KEY });

const app = express();
const port = 3000;

// Configure Multer pour l'upload d'images
const upload = multer({ dest: 'uploads/' });

// Middleware pour parser le JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

let sessions = {};

// Fonction pour encoder l'image en base64 avec Buffer
function encodeImage(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');  // Encodage en base64
}

// Endpoint pour créer une nouvelle session avec un message système et un message de bienvenue
app.post('/api/new-session', (req, res) => {
    const sessionId = uuidv4();

    sessions[sessionId] = [
        {
            role: 'system',
            content: "This GPT serves as an adoption advisor for users considering bringing animals into their lives. It supports open conversations, answering user questions about adopting animals and helping guide them through factors to consider in their choice. By gathering information about user preferences (such as living environment, lifestyle, size, and care requirements), this GPT will recommend animals suitable for adoption based on the specifics the user provides. The GPT also presents animal profiles in a standardized format that includes details like species, age, specific needs, temperament, and adaptability to the user’s situation. If users upload a photo of an animal, the GPT offers guidance on the breed and characteristics. The tone is supportive, informed, and practical, aiming to assist users in making thoughtful adoption decisions."
        },
        {
            role: 'assistant',
            content: "Bonjour ! Je suis votre conseiller en adoption d'animaux. Posez-moi vos questions pour obtenir des conseils sur l'adoption de votre futur compagnon !"
        }
    ];

    res.json({ sessionId });
});

// Endpoint pour envoyer des messages
app.post('/api/chat/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    if (!sessions[sessionId]) sessions[sessionId] = [];

    sessions[sessionId].push({ role: 'user', content: message });

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: process.env.MODEL,
                messages: sessions[sessionId]
            },
            {
                headers: {
                    'Authorization': `Bearer ${PROCESS.ENV.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const botMessage = response.data.choices[0].message.content;
        sessions[sessionId].push({ role: 'assistant', content: botMessage });

        res.json({ botMessage });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred. Please try again later.' });
    }
});

// Endpoint pour uploader une image
app.post('/api/upload-image/:sessionId', upload.single('image'), async (req, res) => {
    const { sessionId } = req.params;

    if (!req.file) {
        return res.status(400).json({ error: 'Image is required' });
    }

    const base64Image = encodeImage(req.file.path);

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: process.env.MODEL,
                messages: [
                    {
                        role: "user",
                        content: "Que peux-tu me dire sur cet animal ?",
                    },
                    {
                        role: "user",
                        content: `data:image/jpeg;base64,${base64Image}`,
                    },
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${PROCESS.ENV.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const botMessage = response.data.choices[0].message.content;
        sessions[sessionId].push({ role: 'assistant', content: botMessage });
        res.json({ botMessage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred. Please try again later.' });
    }
});

// Démarrer le serveur
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
