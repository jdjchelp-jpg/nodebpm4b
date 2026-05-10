/**
 * AI Engine Module (OpenRouter API)
 * Provides text analysis, metadata generation, and narration planning.
 * BPM4B - Professional Multimedia Converter
 */

const https = require('https');

/**
 * Call OpenRouter API for chat completions
 * @param {Array} messages - Chat messages
 * @param {Object} options - API options
 * @returns {Promise<string>} - The AI response
 */
async function callOpenRouter(messages, options = {}) {
    const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OpenRouter API key is missing. Please provide it in settings.');
    }

    const model = options.model || 'google/gemini-2.0-flash-001';
    const payload = JSON.stringify({
        model: model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000
    });

    const requestOptions = {
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/jdjchelp/nodebpm4b',
            'X-Title': 'BPM4B Audiobook Studio'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        reject(new Error(`OpenRouter Error: ${json.error.message || JSON.stringify(json.error)}`));
                    } else if (json.choices && json.choices.length > 0) {
                        resolve(json.choices[0].message.content);
                    } else {
                        reject(new Error('Invalid response from OpenRouter'));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse OpenRouter response: ${e.message}`));
                }
            });
        });

        req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
        req.write(payload);
        req.end();
    });
}

/**
 * Fetch available models from OpenRouter
 * @param {string} apiKey - API Key
 * @returns {Promise<Array>} - List of models
 */
async function getModels(apiKey) {
    if (!apiKey) return [];

    const requestOptions = {
        hostname: 'openrouter.ai',
        path: '/api/v1/models',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/jdjchelp/nodebpm4b',
            'X-Title': 'BPM4B Audiobook Studio'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.data) {
                        resolve(json.data.map(m => ({
                            id: m.id,
                            name: m.name,
                            price: m.pricing,
                            context_length: m.context_length
                        })));
                    } else {
                        resolve([]);
                    }
                } catch (e) {
                    resolve([]);
                }
            });
        });

        req.on('error', () => resolve([]));
        req.end();
    });
}

/**
 * Generate book metadata from title/author
 */
async function generateMetadata(title, author, apiKey) {
    const prompt = `Generate professional audiobook metadata for a book titled "${title}"${author ? ` by ${author}` : ''}. 
    Return a JSON object with: title, author, genre, description (blurb), and search_query (for cover art).`;

    const response = await callOpenRouter([
        { role: 'system', content: 'You are a professional librarian and audiobook metadata specialist. Always return valid JSON.' },
        { role: 'user', content: prompt }
    ], { apiKey, temperature: 0.3 });

    try {
        // Extract JSON if AI wrapped it in markdown
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : response);
    } catch (e) {
        throw new Error('AI returned invalid metadata format');
    }
}

/**
 * Analyze text to identify speakers and suggest voices
 */
async function analyzeNarration(text, apiKey) {
    const prompt = `Analyze the following text fragment and identify the main narrator and any distinct character voices needed for dialogue. 
    Return a JSON array of objects: { name, gender, traits, suggested_voice_type }. 
    Text: "${text.substring(0, 2000)}..."`;

    const response = await callOpenRouter([
        { role: 'system', content: 'You are a professional voice director for audiobooks. Always return valid JSON.' },
        { role: 'user', content: prompt }
    ], { apiKey, temperature: 0.4 });

    try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : response);
    } catch (e) {
        throw new Error('AI returned invalid narration plan format');
    }
}

module.exports = {
    callOpenRouter,
    generateMetadata,
    analyzeNarration,
    getModels
};
