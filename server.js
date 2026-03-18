import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'database.json');

// Helper DB
const readDB = () => {
    try {
        if (!fs.existsSync(DB_FILE)) return { users: {} };
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        // Migrate old flat structure to new user-isolated structure
        if (!data.users) {
            return { users: { default: { profile: data.profile || {}, meals: data.meals || [], checkins: data.checkins || {}, chatHistory: data.chatHistory || [], workoutProgress: data.workoutProgress || {}, onboarding: data.onboarding || {} } } };
        }
        return data;
    } catch (e) {
        return { users: {} };
    }
};

const writeDB = (data) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Erro ao salvar DB:', e);
    }
};

const getUserEmail = (req) => (req.headers['x-user-email'] || req.query.email || req.body?.email || 'default');

const readUserDB = (email) => {
    const db = readDB();
    return db.users?.[email] || { profile: {}, meals: [], checkins: {}, chatHistory: [], workoutProgress: {}, onboarding: {} };
};

const writeUserDB = (email, data) => {
    const db = readDB();
    if (!db.users) db.users = {};
    db.users[email] = data;
    writeDB(db);
};

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// --- ENDPOINTS DE PERSISTÊNCIA (Sync) ---

// 1. Perfil
app.get('/api/profile', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    res.json(userData.profile || {});
});

app.post('/api/profile', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    userData.profile = { ...userData.profile, ...req.body };
    writeUserDB(email, userData);
    res.json({ success: true, profile: userData.profile });
});

// 2. Onboarding
app.post('/api/onboarding', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    userData.onboarding = req.body;
    // Também atualiza perfil básico se disponível
    if (req.body.data) {
        const d = req.body.data;
        userData.profile = {
            ...userData.profile,
            name: d.name || userData.profile.name,
            email: d.email || userData.profile.email,
            weight: d.weight || userData.profile.weight,
            height: d.height || userData.profile.height,
            age: d.age || userData.profile.age,
            gender: d.gender || userData.profile.gender,
            goal: d.goal || userData.profile.goal
        };
    }
    writeUserDB(email, userData);
    res.json({ success: true });
});

// 3. Refeições
app.get('/api/meals', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    res.json(userData.meals || []);
});

app.post('/api/meals', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    userData.meals = userData.meals || [];

    let meal;
    if (req.body.id) {
        const index = userData.meals.findIndex(m => m.id === req.body.id);
        if (index !== -1) {
            userData.meals[index] = { ...userData.meals[index], ...req.body, timestamp: new Date().toISOString() };
            meal = userData.meals[index];
        } else {
            meal = { ...req.body, timestamp: new Date().toISOString() };
            userData.meals.unshift(meal);
        }
    } else {
        meal = { id: Date.now().toString(), ...req.body, timestamp: new Date().toISOString() };
        userData.meals.unshift(meal);
    }

    // Manter apenas últimas 100
    if (userData.meals.length > 100) userData.meals = userData.meals.slice(0, 100);
    writeUserDB(email, userData);
    res.json({ success: true, meal });
});

// 4. Check-ins
app.get('/api/checkins', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    res.json(userData.checkins || {});
});

app.post('/api/checkins', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    userData.checkins = userData.checkins || {};
    userData.checkins = { ...userData.checkins, ...req.body };
    writeUserDB(email, userData);
    res.json({ success: true });
});

// 5. Chat History
app.get('/api/chat/history', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    res.json(userData.chatHistory || []);
});

app.post('/api/chat/history', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    userData.chatHistory = req.body.messages || [];
    writeUserDB(email, userData);
    res.json({ success: true });
});

// 6. Reset Data (New Account)
app.post('/api/reset', (req, res) => {
    const email = getUserEmail(req);
    const emptyUser = {
        profile: {},
        meals: [],
        checkins: {},
        chatHistory: [],
        workoutProgress: {},
        onboarding: {}
    };
    writeUserDB(email, emptyUser);
    res.json({ success: true });
});

// Endpoint para verificar status das chaves de API
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        providers: {
            groq: !!process.env.GROQ_API_KEY,
            gemini: !!process.env.GEMINI_API_KEY,
            openai: !!process.env.OPENAI_API_KEY,
            huggingface: !!process.env.HF_API_KEY
        }
    });
});

// Endpoint de Chat (Proxy para Groq)
app.post('/api/chat', async (req, res) => {
    try {
        const { message, context, history } = req.body;
        const groqKey = process.env.GROQ_API_KEY;

        if (!groqKey) {
            return res.status(401).json({ error: 'Chave Groq não configurada no servidor (.env)' });
        }

        const systemPrompt = `You are the conversational engine of the app "Macro AI".
You are connected to the internal user data system.

USER DATA CONTEXT:
${JSON.stringify(context || {}, null, 2)}

Your job is to:
1. Detect user intent.
2. Fetch relevant internal data (provided above).
3. Generate contextual, data-driven responses.
4. Always prioritize user metrics before generic text.

Rules:
- If greeting: Respond with current contextual data summary.
- If suggest diet: Provide 3 distinct meal options (Varieties) that fit the remaining macros. Use favorite foods if possible.
- If analyze: Generate consistency summary.
- Tone: Human, Direct, Motivational, Data-driven. No robotic responses.
- Language: Portuguese (Brazil).`;

        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        if (history && Array.isArray(history)) {
            const recent = history.slice(-10);
            for (const h of recent) {
                messages.push({
                    role: h.role === 'assistant' ? 'assistant' : 'user',
                    content: h.text
                });
            }
        }

        messages.push({ role: 'user', content: message });

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages,
                max_tokens: 500,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erro Groq API: ${response.status} - ${errText}`);
        }

        const json = await response.json();
        const text = json.choices?.[0]?.message?.content || '';

        res.json({ text });

    } catch (error) {
        console.error('Chat Error:', error);
        res.status(500).json({ error: 'Erro ao processar mensagem', details: error.message });
    }
});

// Base de dados simples para fallback (Food101 labels -> Macros aproximados por 100g)
const FOOD_DB = {
    'pizza': { cal: 266, p: 11, c: 33, f: 10 },
    'hamburger': { cal: 295, p: 17, c: 24, f: 14 },
    'sushi': { cal: 140, p: 5, c: 28, f: 1 },
    'salad': { cal: 30, p: 1, c: 4, f: 0 },
    'steak': { cal: 271, p: 26, c: 0, f: 19 },
    'chicken_wings': { cal: 203, p: 30, c: 0, f: 8 },
    'spaghetti_bolognese': { cal: 150, p: 7, c: 20, f: 5 },
    'chocolate_cake': { cal: 371, p: 5, c: 53, f: 15 },
    'default': { cal: 150, p: 10, c: 15, f: 5 }
};

app.get('/api/foods', (req, res) => {
    res.json(FOOD_DB);
});

// Workouts Database
const WORKOUTS_DB = {
    'chest-triceps': {
        title: 'Peito & Tríceps',
        subtitle: '4 séries • 8-12 reps',
        exercises: [
            { name: 'Supino Reto', sets: 4, reps: '8-12', weight: 60, done: false },
            { name: 'Supino Inclinado Halteres', sets: 3, reps: '10-12', weight: 24, done: false },
            { name: 'Crucifixo Máquina', sets: 3, reps: '12-15', weight: 40, done: false },
            { name: 'Tríceps Corda', sets: 4, reps: '12-15', weight: 20, done: false },
            { name: 'Tríceps Francês', sets: 3, reps: '10-12', weight: 18, done: false }
        ]
    },
    'back-biceps': {
        title: 'Costas & Bíceps',
        subtitle: '4 séries • 8-12 reps',
        exercises: [
            { name: 'Puxada Frente', sets: 4, reps: '8-12', weight: 50, done: false },
            { name: 'Remada Curvada', sets: 4, reps: '8-10', weight: 60, done: false },
            { name: 'Pulldown', sets: 3, reps: '12-15', weight: 25, done: false },
            { name: 'Rosca Direta', sets: 4, reps: '10-12', weight: 15, done: false },
            { name: 'Rosca Martelo', sets: 3, reps: '12', weight: 14, done: false }
        ]
    },
    'legs-shoulders': {
        title: 'Pernas & Ombros',
        subtitle: '4 séries • 10-15 reps',
        exercises: [
            { name: 'Agachamento Livre', sets: 4, reps: '8-10', weight: 80, done: false },
            { name: 'Leg Press 45', sets: 4, reps: '10-12', weight: 120, done: false },
            { name: 'Cadeira Extensora', sets: 3, reps: '12-15', weight: 50, done: false },
            { name: 'Desenvolvimento Militar', sets: 4, reps: '8-12', weight: 40, done: false },
            { name: 'Elevação Lateral', sets: 3, reps: '15', weight: 12, done: false }
        ]
    }
};

app.get('/api/workouts', (req, res) => {
    res.json(WORKOUTS_DB);
});


app.post('/api/analyze-image', async (req, res) => {
    try {
        let { image, audio, apiKey, provider, endpoint } = req.body;

        // Auto-detecção com prioridade: Groq > Gemini > OpenAI > HuggingFace
        if (!provider) {
            if (process.env.GROQ_API_KEY) {
                provider = 'groq';
                apiKey = process.env.GROQ_API_KEY;
            } else if (process.env.GEMINI_API_KEY) {
                provider = 'gemini';
                apiKey = process.env.GEMINI_API_KEY;
            } else if (process.env.OPENAI_API_KEY) {
                provider = 'openai';
                apiKey = process.env.OPENAI_API_KEY;
            } else {
                provider = 'huggingface';
                apiKey = process.env.HF_API_KEY;
            }
        } else if (!apiKey) {
            if (provider === 'groq') apiKey = process.env.GROQ_API_KEY;
            else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
            else if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
            else if (provider === 'huggingface') apiKey = process.env.HF_API_KEY;
        }

        console.log(`Analisando com ${provider}...`);

        // --- GROQ VISION ---
        if (provider === 'groq') {
            if (!apiKey) throw new Error('Chave Groq não configurada (.env)');

            let prompt = 'Você é um nutricionista. Analise a imagem e identifique os alimentos, estime o peso (em gramas) e calcule calorias e macros. Retorne APENAS um JSON: {"items":[{"name":"Alimento","grams":100,"calories":0,"protein":0,"carbs":0,"fat":0}],"confidence":0.9}';

            const base64Data = image && image.includes('base64,') ? image.split('base64,')[1] : image;
            const imageUrl = image && image.startsWith('data:') ? image : `data:image/jpeg;base64,${base64Data}`;

            const payload = {
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]
                    }
                ],
                max_tokens: 500
            };

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Erro Groq Vision API: ${response.status} - ${errText}`);
            }

            const json = await response.json();
            const content = json.choices?.[0]?.message?.content || '{}';
            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();

            return res.json({ provider: 'groq', result: JSON.parse(cleanContent) });
        }

        // --- GOOGLE GEMINI ---
        if (provider === 'gemini') {
            if (!apiKey) throw new Error('Chave Gemini não configurada (.env)');

            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);
            let modelName = "gemini-1.5-flash";
            let model = genAI.getGenerativeModel({ model: modelName });

            let prompt = 'Você é um nutricionista. Analise a imagem e identifique os alimentos, estime o peso (em gramas) e calcule calorias e macros. Retorne APENAS um JSON: {"items":[{"name":"Alimento","grams":100,"calories":0,"protein":0,"carbs":0,"fat":0}],"confidence":0.9}';

            const parts = [];

            if (audio) {
                if (req.body.search) {
                    prompt = 'Você é um nutricionista. Analise o áudio. Se o usuário listou vários alimentos (ex: "arroz, feijão e frango"), identifique cada um deles separadamente com seus macros estimados para uma porção média. Se o usuário falou apenas um alimento genérico (ex: "maçã"), forneça 3 a 5 variações ou tamanhos comuns. Retorne APENAS um JSON: {"options":[{"name":"Nome do Alimento","grams":100,"calories":0,"protein":0,"carbs":0,"fat":0}]}.';
                } else {
                    prompt = 'Você é um nutricionista. Analise o áudio com a descrição da refeição. Identifique os alimentos mencionados, estime o peso (em gramas) se não especificado (use porções médias), e calcule calorias e macros. Retorne APENAS um JSON: {"items":[{"name":"Alimento","grams":100,"calories":0,"protein":0,"carbs":0,"fat":0}],"confidence":0.9}';
                }
                parts.push(prompt);
                parts.push({ inlineData: { data: audio, mimeType: "audio/webm" } });
            } else if (image) {
                const base64Data = image.includes('base64,') ? image.split('base64,')[1] : image;
                parts.push(prompt);
                parts.push({ inlineData: { data: base64Data, mimeType: "image/jpeg" } });
            } else {
                throw new Error('Nenhuma imagem ou áudio fornecido.');
            }

            let result;
            try {
                result = await model.generateContent(parts);
            } catch (e) {
                console.log(`Erro com ${modelName}: ${e.message}`);
                if (e.message.includes('404') || e.message.includes('not found')) {
                    const fallback = "gemini-1.5-flash";
                    console.log(`Tentando fallback ${fallback}`);
                    const model2 = genAI.getGenerativeModel({ model: fallback });
                    result = await model2.generateContent(parts);
                } else {
                    throw e;
                }
            }

            const response = await result.response;
            const text = response.text();
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return res.json({ provider: 'gemini', result: JSON.parse(cleanText) });
        }

        // --- OPENAI / COMPATIBLE ---
        if (provider === 'openai' || provider === 'custom') {
            if (!apiKey) throw new Error('Chave de API não configurada no servidor (.env)');

            const apiUrl = endpoint || 'https://api.openai.com/v1/chat/completions';
            const model = provider === 'openai' ? 'gpt-4o-mini' : (req.body.model || 'gpt-3.5-turbo');

            const payload = {
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'Você é um nutricionista expert. Identifique os alimentos na imagem, estime o peso em gramas visualmente e calcule as calorias e macros. Retorne APENAS um JSON estrito com o seguinte formato, sem markdown ou explicações: {"items":[{"name":"nome do alimento","grams":150,"calories":200,"protein":30,"carbs":10,"fat":5}],"confidence":0.95}'
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Analise este prato.' },
                            { type: 'image_url', image_url: { url: image } }
                        ]
                    }
                ],
                max_tokens: 500,
                temperature: 0.1
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Erro API ${provider}: ${response.status} - ${errText}`);
            }

            const json = await response.json();
            const content = json.choices?.[0]?.message?.content || '{}';
            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();

            return res.json({ provider: provider, result: JSON.parse(cleanContent) });
        }

        // --- HUGGING FACE (Fallback) ---
        console.log('Usando fallback Hugging Face...');
        const headers = {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        };

        const clsRes = await fetch('https://api-inference.huggingface.co/models/nateraw/food101', {
            method: 'POST',
            headers,
            body: JSON.stringify({ inputs: image })
        });

        let items = [];
        let confidence = 0.5;

        if (clsRes.ok) {
            const classification = await clsRes.json().catch(() => []);
            const top3 = Array.isArray(classification) ? classification.slice(0, 3) : [];

            if (top3.length > 0) {
                confidence = top3[0].score;
                items = top3.map(item => {
                    const label = item.label;
                    const ref = Object.entries(FOOD_DB).find(([k]) => label.includes(k))?.[1] || FOOD_DB.default;
                    const grams = 100;

                    return {
                        name: label.replace(/_/g, ' '),
                        grams: grams,
                        calories: Math.round(ref.cal * (grams / 100)),
                        protein: Math.round(ref.p * (grams / 100)),
                        carbs: Math.round(ref.c * (grams / 100)),
                        fat: Math.round(ref.f * (grams / 100))
                    };
                });
            }
        } else {
            console.warn('HF Food101 falhou, tentando apenas caption...');
        }

        if (items.length === 0) {
            const blipRes = await fetch('https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large', {
                method: 'POST',
                headers,
                body: JSON.stringify({ inputs: image })
            });

            if (blipRes.ok) {
                const blipJson = await blipRes.json();
                const text = Array.isArray(blipJson) ? blipJson[0]?.generated_text : blipJson?.generated_text;
                if (text) {
                    items.push({ name: text, grams: 100, ...FOOD_DB.default });
                }
            }
        }

        if (items.length === 0) {
            throw new Error('Não foi possível identificar alimentos na imagem.');
        }

        res.json({ provider: 'huggingface', result: { items: items, confidence: confidence } });

    } catch (error) {
        console.error('Erro no proxy:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- WORKOUT PROGRESS ENDPOINTS ---
app.get('/api/workouts/progress', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    res.json(userData.workoutProgress || {});
});

app.post('/api/workouts/progress', (req, res) => {
    const email = getUserEmail(req);
    const userData = readUserDB(email);
    userData.workoutProgress = userData.workoutProgress || {};

    Object.keys(req.body).forEach(date => {
        userData.workoutProgress[date] = {
            ...(userData.workoutProgress[date] || {}),
            ...req.body[date]
        };
    });

    writeUserDB(email, userData);
    res.json({ success: true });
});

// Exporta o app para Vercel (serverless)
export default app;

// Inicia servidor apenas se não estiver em ambiente serverless (Vercel)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
}
