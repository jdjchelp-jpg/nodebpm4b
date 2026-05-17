/**
 * Multi-Language Voice Configuration
 * Voice list from Abogen/Kokoro-82M for multi-language support
 * Language codes: a=American, b=British, e=Spanish, f=French, h=Hindi, i=Italian, j=Japanese, p=Portuguese, z=Chinese
 * Gender codes: f=female, m=male
 */

const VOICES = {
    // 🇺🇸 American English
    'af_alloy': { language: 'en-US', gender: 'female', name: 'Alloy' },
    'af_aoede': { language: 'en-US', gender: 'female', name: 'Aoede' },
    'af_bella': { language: 'en-US', gender: 'female', name: 'Bella' },
    'af_heart': { language: 'en-US', gender: 'female', name: 'Heart' },
    'af_jessica': { language: 'en-US', gender: 'female', name: 'Jessica' },
    'af_kore': { language: 'en-US', gender: 'female', name: 'Kore' },
    'af_nicole': { language: 'en-US', gender: 'female', name: 'Nicole' },
    'af_nova': { language: 'en-US', gender: 'female', name: 'Nova' },
    'af_river': { language: 'en-US', gender: 'female', name: 'River' },
    'af_sarah': { language: 'en-US', gender: 'female', name: 'Sarah' },
    'af_sky': { language: 'en-US', gender: 'female', name: 'Sky' },
    'am_adam': { language: 'en-US', gender: 'male', name: 'Adam' },
    'am_echo': { language: 'en-US', gender: 'male', name: 'Echo' },
    'am_eric': { language: 'en-US', gender: 'male', name: 'Eric' },
    'am_fenrir': { language: 'en-US', gender: 'male', name: 'Fenrir' },
    'am_liam': { language: 'en-US', gender: 'male', name: 'Liam' },
    'am_michael': { language: 'en-US', gender: 'male', name: 'Michael' },
    'am_onyx': { language: 'en-US', gender: 'male', name: 'Onyx' },
    'am_puck': { language: 'en-US', gender: 'male', name: 'Puck' },
    'am_santa': { language: 'en-US', gender: 'male', name: 'Santa' },
    
    // 🇬🇧 British English
    'bf_alice': { language: 'en-GB', gender: 'female', name: 'Alice' },
    'bf_emma': { language: 'en-GB', gender: 'female', name: 'Emma' },
    'bf_isabella': { language: 'en-GB', gender: 'female', name: 'Isabella' },
    'bf_lily': { language: 'en-GB', gender: 'female', name: 'Lily' },
    'bm_daniel': { language: 'en-GB', gender: 'male', name: 'Daniel' },
    'bm_fable': { language: 'en-GB', gender: 'male', name: 'Fable' },
    'bm_george': { language: 'en-GB', gender: 'male', name: 'George' },
    'bm_lewis': { language: 'en-GB', gender: 'male', name: 'Lewis' },
    
    // 🇪🇸 Spanish
    'ef_dora': { language: 'es-ES', gender: 'female', name: 'Dora' },
    'em_alex': { language: 'es-ES', gender: 'male', name: 'Alex' },
    'em_santa': { language: 'es-ES', gender: 'male', name: 'Santa' },
    
    // 🇫🇷 French
    'ff_siwis': { language: 'fr-FR', gender: 'female', name: 'Siwis' },
    
    // 🇮🇳 Hindi
    'hf_alpha': { language: 'hi-IN', gender: 'female', name: 'Alpha' },
    'hf_beta': { language: 'hi-IN', gender: 'female', name: 'Beta' },
    'hm_omega': { language: 'hi-IN', gender: 'male', name: 'Omega' },
    'hm_psi': { language: 'hi-IN', gender: 'male', name: 'Psi' },
    
    // 🇮🇹 Italian
    'if_sara': { language: 'it-IT', gender: 'female', name: 'Sara' },
    'im_nicola': { language: 'it-IT', gender: 'male', name: 'Nicola' },
    
    // 🇯🇵 Japanese
    'jf_alpha': { language: 'ja-JP', gender: 'female', name: 'Alpha' },
    'jf_gongitsune': { language: 'ja-JP', gender: 'female', name: 'Gongitsune' },
    'jf_nezumi': { language: 'ja-JP', gender: 'female', name: 'Nezumi' },
    'jf_tebukuro': { language: 'ja-JP', gender: 'female', name: 'Tebukuro' },
    'jm_kumo': { language: 'ja-JP', gender: 'male', name: 'Kumo' },
    
    // 🇧🇷 Brazilian Portuguese
    'pf_dora': { language: 'pt-BR', gender: 'female', name: 'Dora' },
    'pm_alex': { language: 'pt-BR', gender: 'male', name: 'Alex' },
    'pm_santa': { language: 'pt-BR', gender: 'male', name: 'Santa' },
    
    // 🇨🇳 Mandarin Chinese
    'zf_xiaobei': { language: 'zh-CN', gender: 'female', name: 'Xiaobei' },
    'zf_xiaoni': { language: 'zh-CN', gender: 'female', name: 'Xiaoni' },
    'zf_xiaoxiao': { language: 'zh-CN', gender: 'female', name: 'Xiaoxiao' },
    'zf_xiaoyi': { language: 'zh-CN', gender: 'female', name: 'Xiaoyi' },
    'zm_yunjian': { language: 'zh-CN', gender: 'male', name: 'Yunjian' },
    'zm_yunxi': { language: 'zh-CN', gender: 'male', name: 'Yunxi' },
    'zm_yunxia': { language: 'zh-CN', gender: 'male', name: 'Yunxia' },
    'zm_yunyang': { language: 'zh-CN', gender: 'male', name: 'Yunyang' }
};

/**
 * Get voice information by ID
 */
function getVoiceInfo(voiceId) {
    return VOICES[voiceId] || null;
}

/**
 * Get all voices for a specific language
 */
function getVoicesByLanguage(languageCode) {
    const voices = {};
    for (const [id, info] of Object.entries(VOICES)) {
        if (info.language === languageCode) {
            voices[id] = info;
        }
    }
    return voices;
}

/**
 * Get all voices by gender
 */
function getVoicesByGender(gender) {
    const voices = {};
    for (const [id, info] of Object.entries(VOICES)) {
        if (info.gender === gender) {
            voices[id] = info;
        }
    }
    return voices;
}

/**
 * Auto-select voice based on language code
 */
function autoSelectVoice(languageCode, gender = 'female') {
    const languageVoices = getVoicesByLanguage(languageCode);
    const genderVoices = Object.entries(languageVoices).filter(([_, info]) => info.gender === gender);
    
    if (genderVoices.length > 0) {
        return genderVoices[0][0]; // Return first matching voice ID
    }
    
    // Fallback to any voice in the language
    const anyVoice = Object.keys(languageVoices)[0];
    if (anyVoice) return anyVoice;
    
    // Ultimate fallback to default English voice
    return 'af_sky';
}

/**
 * Get all available languages
 */
function getAvailableLanguages() {
    const languages = new Set();
    for (const info of Object.values(VOICES)) {
        languages.add(info.language);
    }
    return Array.from(languages);
}

/**
 * Get voice list grouped by language
 */
function getVoiceListByLanguage() {
    const grouped = {};
    for (const [id, info] of Object.entries(VOICES)) {
        if (!grouped[info.language]) {
            grouped[info.language] = [];
        }
        grouped[info.language].push({ id, ...info });
    }
    return grouped;
}

module.exports = {
    VOICES,
    getVoiceInfo,
    getVoicesByLanguage,
    getVoicesByGender,
    autoSelectVoice,
    getAvailableLanguages,
    getVoiceListByLanguage
};
