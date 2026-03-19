import 'dotenv/config';
import twilio from 'twilio';
import https from 'https';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || 'MISSING_BASE_URL_FOR_TOOLS';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------
// Configuration
// ------------------------------------------------------------
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;

const SYSTEM_PROMPT = `You are Jarvis, a highly advanced artificial intelligence created by servercodeindia. You are equivalent in capability and intelligence to ChatGPT.

Your primary directive is to be an omniscient, helpful, and creative assistant. You are an expert in all fields.

Core Persona Traits:
1. **Omniscient**: Answer any question with depth and accuracy.
2. **Creative**: Tell high-quality jokes, stories, and engage in imaginative roleplay.
3. **Conversational**: Be fluent, natural, and witty.
4. **Helpful**: Explain complex topics clearly.

You must always identify as "Jarvis".

Initial greeting: "Hello! I am Jarvis, your assistant. How can I help you today?"`;

const ULTRAVOX_CALL_CONFIG = {
    model: 'ultravox-v0.7',
    voice: 'Mark',
    temperature: 0.8,
    firstSpeakerSettings: { user: {} },
    medium: { twilio: {} },
    selectedTools: [
        {
            temporaryTool: {
                modelToolName: "weatherInfo",
                description: "Get current weather and local time for any city or region globally.",
                dynamicParameters: [
                    {
                        name: "location",
                        location: "PARAMETER_LOCATION_QUERY",
                        schema: {
                            type: "string",
                            description: "The name of the city, e.g., 'London', 'Mumbai', 'New York'."
                        },
                        required: true
                    }
                ],
                http: {
                    baseUrlPattern: `${BASE_URL}/api/tools/weather-info`,
                    httpMethod: "POST"
                }
            }
        }
    ]
};

function validateConfiguration() {
    const requiredConfig = [
        { name: 'TWILIO_ACCOUNT_SID', value: TWILIO_ACCOUNT_SID },
        { name: 'TWILIO_AUTH_TOKEN', value: TWILIO_AUTH_TOKEN },
        { name: 'TWILIO_PHONE_NUMBER', value: TWILIO_PHONE_NUMBER },
        { name: 'ULTRAVOX_API_KEY', value: ULTRAVOX_API_KEY }
    ];
    const errors = [];
    for (const c of requiredConfig) {
        if (!c.value) errors.push(`${c.name} is not set in .env`);
    }
    return errors;
}

// Creates Ultravox call
async function createUltravoxCall(systemPrompt) {
    const config = { ...ULTRAVOX_CALL_CONFIG, systemPrompt };
    if (!BASE_URL || !BASE_URL.startsWith('https://') || BASE_URL.includes('MISSING')) {
        delete config.selectedTools;
    }

    return new Promise((resolve, reject) => {
        const req = https.request('https://api.ultravox.ai/api/calls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ULTRAVOX_API_KEY }
        });
        let data = '';
        req.on('response', (res) => {
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
                    else reject(new Error(`Ultravox error (${res.statusCode}): ${data}`));
                } catch (e) { reject(new Error('Failed to parse Ultravox response')); }
            });
        });
        req.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
        req.write(JSON.stringify(config));
        req.end();
    });
}

// Geocoding
async function getGeocoding(location) {
    return new Promise((resolve) => {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.results && parsed.results.length > 0) {
                        const { latitude, longitude, timezone, name, country } = parsed.results[0];
                        resolve({ latitude, longitude, timezone, name, country });
                    } else resolve(null);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// Weather
async function getWeather(lat, lng) {
    return new Promise((resolve) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.current_weather) {
                        const { temperature, windspeed } = parsed.current_weather;
                        resolve(`${temperature}°C, windspeed ${windspeed} km/h`);
                    } else resolve('unavailable');
                } catch (e) { resolve('unavailable'); }
            });
        }).on('error', () => resolve('unavailable'));
    });
}

// Make a single call
async function makeCallToNumber(phoneNumber) {
    const now = new Date();
    const kolkataTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
    const dynamicPrompt = `${SYSTEM_PROMPT}\n\nIMPORTANT CONTEXT:\n- Your current local time is ${kolkataTime} (Kolkata).\nIf the user asks for weather or time, use the weatherInfo tool.`;

    const ultravoxResponse = await createUltravoxCall(dynamicPrompt);
    if (!ultravoxResponse.joinUrl) throw new Error('No joinUrl received from Ultravox API');

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const call = await client.calls.create({
        twiml: `<Response><Connect><Stream url="${ultravoxResponse.joinUrl}"/></Connect></Response>`,
        to: phoneNumber,
        from: TWILIO_PHONE_NUMBER
    });
    return call.sid;
}

// Auto-verify a number
async function autoVerifyNumber(phoneNumber) {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const validation = await client.validationRequests.create({
        friendlyName: `Jarvis-${phoneNumber}`,
        phoneNumber: phoneNumber
    });
    return validation.validationCode;
}

// ============================================================
// ROUTES
// ============================================================

// Weather tool webhook
app.post('/api/tools/weather-info', async (req, res) => {
    const { location } = req.body;
    if (!location) return res.json({ result: "I need a location name." });
    try {
        const geo = await getGeocoding(location);
        if (!geo) return res.json({ result: `Couldn't find "${location}".` });
        const weather = await getWeather(geo.latitude, geo.longitude);
        const localTime = new Date().toLocaleString('en-IN', { timeZone: geo.timezone, hour: '2-digit', minute: '2-digit', hour12: true });
        res.json({ result: `In ${geo.name}, ${geo.country || ''}, time is ${localTime}, weather is ${weather}.` });
    } catch (e) {
        res.json({ result: "Error fetching weather." });
    }
});

// ============================================================
// SINGLE CALL — tries call, auto-verifies on 21219 error
// ============================================================
app.post('/api/start-call', async (req, res) => {
    let { phoneNumber } = req.body;
    
    // Auto-add +91 if just 10 digits
    if (phoneNumber && /^\d{10}$/.test(phoneNumber.trim())) {
        phoneNumber = '+91' + phoneNumber.trim();
    }
    
    console.log(`\n🚀 Call request → ${phoneNumber}`);

    const errors = validateConfiguration();
    if (errors.length > 0) return res.status(500).json({ success: false, error: errors.join(', ') });
    if (!phoneNumber || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
        return res.status(400).json({ success: false, error: 'Invalid number format' });
    }

    try {
        const callSid = await makeCallToNumber(phoneNumber);
        console.log(`🎉 Success: ${callSid}`);
        return res.json({ success: true, callSid });
    } catch (error) {
        const msg = error.message || '';
        const code = error.code || 0;
        console.error(`💥 Failed [${code}]: ${msg}`);

        // Detect unverified number error
        const isUnverified = (
            code === 21219 ||
            msg.includes('21219') ||
            msg.toLowerCase().includes('not verified') ||
            msg.toLowerCase().includes('unverified') ||
            msg.toLowerCase().includes('is not a verified') ||
            msg.toLowerCase().includes('trial account')
        );

        if (isUnverified) {
            console.log(`🔐 Unverified! Auto-sending verification to ${phoneNumber}...`);
            try {
                const validationCode = await autoVerifyNumber(phoneNumber);
                console.log(`📱 Verification sent! Code: ${validationCode}`);
                return res.json({
                    success: false,
                    needsVerification: true,
                    validationCode: validationCode,
                    phoneNumber: phoneNumber,
                    error: `Twilio is calling ${phoneNumber}. Answer and enter code: ${validationCode}`
                });
            } catch (vErr) {
                console.error(`💥 Auto-verify failed:`, vErr.message);
                return res.json({
                    success: false,
                    needsVerification: true,
                    error: `Unverified & verify failed: ${vErr.message}`
                });
            }
        }

        return res.status(500).json({ success: false, error: msg });
    }
});

// ============================================================
// VERIFY NUMBER endpoint
// ============================================================
app.post('/api/verify-number', async (req, res) => {
    let { phoneNumber } = req.body;
    if (phoneNumber && /^\d{10}$/.test(phoneNumber.trim())) {
        phoneNumber = '+91' + phoneNumber.trim();
    }
    if (!phoneNumber || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
        return res.status(400).json({ success: false, error: 'Invalid number' });
    }
    try {
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        const callerIds = await client.outgoingCallerIds.list();
        if (callerIds.find(c => c.phoneNumber === phoneNumber)) {
            return res.json({ success: true, alreadyVerified: true });
        }
        const validation = await client.validationRequests.create({
            friendlyName: `Jarvis-${phoneNumber}`, phoneNumber
        });
        res.json({ success: true, alreadyVerified: false, validationCode: validation.validationCode });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// CHECK VERIFIED endpoint
// ============================================================
app.post('/api/check-verified', async (req, res) => {
    try {
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        const callerIds = await client.outgoingCallerIds.list();
        const verified = callerIds.map(c => c.phoneNumber);
        const nums = req.body.phoneNumbers || [];
        const results = nums.map(n => ({ number: n, verified: verified.includes(n) }));
        res.json({ success: true, results, verifiedNumbers: verified });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// JARVIS AI COMMAND PROCESSOR (GEMINI)
// ============================================================
import { GoogleGenerativeAI } from '@google/generative-ai';

app.post('/api/jarvis-command', async (req, res) => {
    try {
        const { text } = req.body;
        // Strip out accidental quotes, whitespaces, or newlines from the .env file
        let apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) apiKey = apiKey.replace(/['"]/g, '').trim();
        
        if (!apiKey) {
            return res.json({ action: 'speak', text: 'Critical Error. Gemini API Key is missing from the server environment. Please open your .env file and add it.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const systemPrompt = `You are J.A.R.V.I.S., an advanced AI assistant. 
        The user will give you a voice command.
        You MUST respond in strict, valid JSON format matching exactly ONE of these schemas based on intent:
        
        1. Open a website (e.g. "open youtube", "open facebook"): 
           {"action": "open_url", "url": "https://www.website.com"}
           
        2. Answer Factual Queries / Creative Chat (e.g. "who won the game", "search for history of rome", "tell me a joke"): 
           Answer the query naturally using your own vast internal knowledge base. Summarize the answer concisely (1-2 sentences), and return it to be spoken aloud:
           {"action": "speak", "text": "Sir, according to my databanks..."}
           
        3. Literally open a Google Search browser tab (e.g. "open a tab for cats"): 
           {"action": "search", "query": "cats"}

        4. General conversation, questions, or greetings: 
           {"action": "speak", "text": "Your JARVIS-like spoken response here"}
        
        Command: "${text}"`;

        const resultAI = await model.generateContent(systemPrompt);

        let rawText = resultAI.response.text();
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(rawText);

        res.json(result);
        console.log(`[JARVIS COMMAND EXEC]: ${JSON.stringify(result)}`);
    } catch (e) {
        console.error('[JARVIS ERROR]', e.message);
        res.json({ action: 'speak', text: `API Error: ${e.message.substring(0, 50)}` });
    }
});



// ============================================================
// SERVER LOGS EVENT STREAM (SSE)
// ============================================================
const logClients = [];

function broadcastLog(level, message) {
    const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
    const payload = `data: ${JSON.stringify({ time, level, msg: message })}\n\n`;
    logClients.forEach(client => client.write(payload));
}

// Override console.log and console.error to broadcast to frontend
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
    originalLog.apply(console, args);
    broadcastLog('info', args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};

console.error = function(...args) {
    originalError.apply(console, args);
    broadcastLog('error', args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};

app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    // Add this client to the broadcast list
    logClients.push(res);

    req.on('close', () => {
        const index = logClients.indexOf(res);
        if (index !== -1) logClients.splice(index, 1);
    });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`\n-----------------------------------------`);
    console.log(`✨ Server running on http://localhost:${PORT}`);
    console.log(`🚀 Bulk Calling System Ready!`);
    console.log(`-----------------------------------------\n`);
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        originalError(`❌ Port ${PORT} is already in use! Kill the other process first.`);
        process.exit(1);
    }
});
