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
// Note: Ultravox requires HTTPS for tool webhooks. Set BASE_URL in your environment (e.g., https://your-app.render.com).
const BASE_URL = process.env.BASE_URL || 'MISSING_BASE_URL_FOR_TOOLS';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------
// Configuration from Environment Variables
// ------------------------------------------------------------
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const DESTINATION_PHONE_NUMBER = process.env.DESTINATION_PHONE_NUMBER;
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

// Validates all required config vars are set
function validateConfiguration() {
    const requiredConfig = [
        { name: 'TWILIO_ACCOUNT_SID', value: TWILIO_ACCOUNT_SID, pattern: /^AC[a-zA-Z0-9]{32}$/ },
        { name: 'TWILIO_AUTH_TOKEN', value: TWILIO_AUTH_TOKEN, pattern: /^[a-zA-Z0-9]{32}$/ },
        { name: 'TWILIO_PHONE_NUMBER', value: TWILIO_PHONE_NUMBER, pattern: /^\+[1-9]\d{1,14}$/ },
        { name: 'DESTINATION_PHONE_NUMBER', value: DESTINATION_PHONE_NUMBER, pattern: /^\+[1-9]\d{1,14}$/ },
        { name: 'ULTRAVOX_API_KEY', value: ULTRAVOX_API_KEY, pattern: /^[a-zA-Z0-9]{8}\.[a-zA-Z0-9]{32}$/ }
    ];

    const errors = [];
    for (const config of requiredConfig) {
        if (!config.value || config.value.includes('your_')) {
            errors.push(`❌ ${config.name} is not set correctly in .env`);
        } else if (config.pattern && !config.pattern.test(config.value)) {
            errors.push(`❌ ${config.name} format appears invalid`);
        }
    }
    return errors;
}

// Creates the Ultravox call
async function createUltravoxCall(systemPrompt) {
    const ULTRAVOX_API_URL = 'https://api.ultravox.ai/api/calls';
    
    const config = {
        ...ULTRAVOX_CALL_CONFIG,
        systemPrompt: systemPrompt
    };

    // Only include tools if we have a valid HTTPS BASE_URL
    if (!BASE_URL || !BASE_URL.startsWith('https://') || BASE_URL.includes('MISSING')) {
        console.warn('⚠️ Tool calling disabled: BASE_URL must be a valid https:// URL.');
        delete config.selectedTools;
    }

    const request = https.request(ULTRAVOX_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ULTRAVOX_API_KEY
        }
    });

    return new Promise((resolve, reject) => {
        let data = '';
        request.on('response', (response) => {
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        resolve(parsedData);
                    } else {
                        reject(new Error(`Ultravox API error (${response.statusCode}): ${data}`));
                    }
                } catch (parseError) {
                    reject(new Error(`Failed to parse Ultravox response`));
                }
            });
        });
        request.on('error', (error) => reject(new Error(`Network error: ${error.message}`)));
        request.write(JSON.stringify(config));
        request.end();
    });
}

// Fetches coordinates for a location via Open-Meteo Geocoding API
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
                    } else {
                        resolve(null);
                    }
                } catch { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// Fetches weather using coordinates
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
                    } else { resolve('unavailable'); }
                } catch { resolve('unavailable'); }
            });
        }).on('error', () => resolve('unavailable'));
    });
}

// Ultravox Webhook for tool calls
app.post('/api/tools/weather-info', async (req, res) => {
    const { location } = req.body;
    console.log(`\n🤖 --- Tool Call Received ---`);
    console.log(`📍 Location requested: "${location}"`);
    
    if (!location) {
        console.error('❌ Error: No location provided in tool call body.');
        return res.json({ result: "I need a location name to check the weather." });
    }

    try {
        console.log(`🔍 Fetching geocoding for "${location}"...`);
        const geo = await getGeocoding(location);
        if (!geo) {
            console.warn(`⚠️ Warning: Location "${location}" not found by geocoding API.`);
            return res.json({ result: `I'm sorry, I couldn't find the location "${location}". Please try a more specific city name.` });
        }

        console.log(`🌍 Found: ${geo.name}, ${geo.country} (${geo.latitude}, ${geo.longitude})`);
        console.log(`⛅ Fetching weather...`);
        const weather = await getWeather(geo.latitude, geo.longitude);
        
        const now = new Date();
        const localTime = now.toLocaleString('en-IN', { timeZone: geo.timezone, hour: '2-digit', minute: '2-digit', hour12: true });

        const result = `In ${geo.name}, ${geo.country || ''}, the current local time is ${localTime} and the weather is ${weather}.`;
        console.log(`✅ Success: ${result}`);
        res.json({ result });
    } catch (error) {
        console.error('💥 Error in tool call logic:', error.message);
        res.json({ result: "I encountered a technical error while fetching that information. Please try again in a moment." });
    }
});

// API Endpoint to start the call
app.post('/api/start-call', async (req, res) => {
    console.log('\n🚀 --- Call Initiation Request ---');
    if (BASE_URL.includes('your-app-name')) {
        console.warn('⚠️ WARNING: BASE_URL is still set to placeholder. Tool calling will fail unless you set BASE_URL in environment variables.');
    } else {
        console.log(`🔗 Webhook BASE_URL: ${BASE_URL}`);
    }

    const errors = validateConfiguration();
    if (errors.length > 0) {
        console.error('❌ Configuration errors detected:', errors.join(', '));
        return res.status(500).json({ success: false, errors });
    }

    try {
        const now = new Date();
        const kolkataTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

        const dynamicPrompt = `${SYSTEM_PROMPT}

IMPORTANT CONTEXT:
- Your current local time is ${kolkataTime} (Kolkata).
- **Barpeta Road, Assam**: Time is ${kolkataTime}, Weather is mostly cloudy, 19°C, humidity 90%.
- **Guwahati, Assam**: Time is ${kolkataTime}, Weather is misty, 22°C, humidity 94%.

If the user asks for weather or time in these specific locations, use the data above. If they ask for ANY other location, politely explain that you are being configured for global awareness and will have it ready shortly.`;

        console.log('🤖 Creating Ultravox call with dynamic prompt...');
        const ultravoxResponse = await createUltravoxCall(dynamicPrompt);
        
        if (!ultravoxResponse.joinUrl) {
            throw new Error('No joinUrl received from Ultravox API');
        }

        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        const call = await client.calls.create({
            twiml: `<Response><Connect><Stream url="${ultravoxResponse.joinUrl}"/></Connect></Response>`,
            to: DESTINATION_PHONE_NUMBER,
            from: TWILIO_PHONE_NUMBER
        });

        console.log('🎉 Call SID created:', call.sid);
        res.json({ success: true, callSid: call.sid });
    } catch (error) {
        console.error('💥 Error starting call:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n-----------------------------------------`);
    console.log(`✨ Server running on http://localhost:${PORT}`);
    console.log(`🚀 Ready to start outbound calls!`);
    console.log(`-----------------------------------------\n`);
});
