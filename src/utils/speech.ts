export interface SpeechOptions {
  voiceName?: string;
  voiceGender?: 'male' | 'female';
  voiceLang?: 'ru' | 'en';
  rate?: number; // 0.8 to 1.5
  pitch?: number; // 0.8 to 1.3
  volume?: number; // 0 to 1
  onSentence?: (index: number, text: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

export interface PresetVoiceConfig {
  id: string;
  name: string;
  gender: 'male' | 'female';
  lang: 'ru' | 'en';
  label: string;
  description: string;
  samplePhrase: string;
  recommendedPitch: number;
  recommendedRate: number;
}

// 2 official female voice choices for Google TTS (Russian and English):
export const FOUR_OFFICIAL_VOICES: PresetVoiceConfig[] = [
  {
    id: 'gtts-ru',
    name: '1. Русский — Женский голос (Google TTS)',
    gender: 'female',
    lang: 'ru',
    label: '1. Русский — Женский голос (Google TTS)',
    description: 'Стабильный женский голос Google Text-To-Speech на русском языке',
    samplePhrase: 'Здравствуйте! Это диктор Google TTS, надежный синтез речи без блокировок.',
    recommendedPitch: 1.0,
    recommendedRate: 1.0,
  },
  {
    id: 'gtts-en',
    name: '2. English — Female Voice (Google TTS)',
    gender: 'female',
    lang: 'en',
    label: '2. English — Female Voice (Google TTS)',
    description: 'Reliable Google Text-To-Speech female voice in English',
    samplePhrase: 'Hello! This is Google Text-to-Speech news anchor in English.',
    recommendedPitch: 1.0,
    recommendedRate: 1.0,
  },
];

/**
 * Text humanizer for Speech Synthesis:
 * Removes markdown artifacts, expands common numbers/abbreviations, and adds subtle phrasing pauses
 * to prevent robotic staccato cadence.
 */
export function humanizeTextForSpeech(text: string, lang: 'ru' | 'en' = 'ru'): string {
  if (!text) return '';

  let cleaned = text
    // Filter boilerplate mirror signatures
    .replace(/(?:дублируем\s+(?:все\s+)?посты\s+в\s+max[^\n.!]*)/gi, "")
    .replace(/(?:если\s+(?:у\s+вас\s+)?(?:не\s+грузит|зависает|не\s+работает|заблокирован)\s+(?:telegram|телега|тг)[^\n.!]*)/gi, "")
    .replace(/(?:наш\s+(?:канал|чат|зеркало|резерв|паблик)\s+в\s+(?:max|vk|вконтакте|дзен|telegram|телеге)[^\n]*)/gi, "")
    .replace(/(?:(?:подписывайтесь|подпишись|подписаться)\s+на\s+(?:наш\s+)?(?:канал|резерв|новости|рассылку|паблик)[^\n]*)/gi, "")
    .replace(/(?:по\s+вопросам\s+рекламы[^\n]*)/gi, "")
    // Remove markdown asterisks, hashes, backticks, brackets
    .replace(/[*#_`~[\]]/g, ' ')
    // Remove raw URLs
    .replace(/https?:\/\/\S+/gi, '')
    // Remove emoji bullets or special signs that cause robotic stutter
    .replace(/[•●►▶🎙️📰⚡💡👉✅❌🎉🎧]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (lang === 'ru') {
    // Humanize common units and abbreviations in Russian
    cleaned = cleaned
      .replace(/(\d+)\s*млн/gi, '$1 миллионов')
      .replace(/(\d+)\s*тыс/gi, '$1 тысяч')
      .replace(/(\d+)\s*млрд/gi, '$1 миллиардов')
      .replace(/(\d+)\s*мс\b/gi, '$1 миллисекунд')
      .replace(/(\d+)\s*мин\b/gi, '$1 минут')
      .replace(/(\d+)\s*сек\b/gi, '$1 секунд')
      .replace(/(\d+)\s*гб\b/gi, '$1 гигабайт')
      .replace(/(\d+)\s*мб\b/gi, '$1 мегабайт')
      .replace(/(\d+)\s*кб\b/gi, '$1 килобайт')
      .replace(/(\d+)\s*ч\b/gi, '$1 часов')
      .replace(/(\d+)\s*x\b/gi, '$1 икс')
      .replace(/3\.13\b/g, '3 точка 13')
      .replace(/3\.7\b/g, '3 точка 7')
      .replace(/(\d+)\s*%/g, '$1 процентов')
      // Smooth out transitions
      .replace(/\s*—\s*/g, ', ')
      .replace(/\s*–\s*/g, ', ')
      .replace(/\s*:\s*/g, ': ');
  } else {
    // English abbreviations
    cleaned = cleaned
      .replace(/(\d+)\s*m\b/gi, '$1 million')
      .replace(/(\d+)\s*k\b/gi, '$1 thousand')
      .replace(/(\d+)\s*ms\b/gi, '$1 milliseconds')
      .replace(/(\d+)\s*min\b/gi, '$1 minutes')
      .replace(/(\d+)\s*%\b/g, '$1 percent');
  }

  return cleaned;
}

class SpeechController {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isSpeaking = false;
  private isPaused = false;
  private voices: SpeechSynthesisVoice[] = [];
  private isInitialized = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      try {
        window.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
        };
      } catch {
        // Safe ignore
      }
    }
  }

  public loadVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    try {
      this.voices = window.speechSynthesis.getVoices() || [];
      this.isInitialized = true;
    } catch {
      this.voices = [];
    }
    return this.voices;
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 || !this.isInitialized) {
      this.loadVoices();
    }
    return this.voices;
  }

  /**
   * Intelligently finds the best, most human-sounding voice in the user's browser
   * prioritizing Neural / Online Natural / Google / Apple voices over 90s robotic synth.
   */
  public findBestVoice(gender: 'male' | 'female' = 'male', lang: 'ru' | 'en' = 'ru'): SpeechSynthesisVoice | null {
    const all = this.getAvailableVoices();
    if (all.length === 0) return null;

    const langCode = lang === 'ru' ? 'ru' : 'en';
    const langVoices = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith(langCode));
    const targetPool = langVoices.length > 0 ? langVoices : all;

    // Quality ranking keywords for natural human voices
    const premiumKeywords = ['natural', 'online', 'neural', 'google', 'premium', 'enhanced', 'siri'];

    // Gender keywords in voice names
    const maleKeywords = ['dmitry', 'pavel', 'yuri', 'aleksandr', 'guy', 'david', 'mark', 'george', 'daniel', 'alex', 'male', 'man', 'муж'];
    const femaleKeywords = ['svetlana', 'dariya', 'daria', 'elena', 'tatyana', 'milena', 'jenny', 'aria', 'samantha', 'victoria', 'karen', 'female', 'woman', 'жен'];

    const targetKeywords = gender === 'male' ? maleKeywords : femaleKeywords;

    // 1. Check for high-quality premium voice matching gender & lang
    const bestPremiumGender = targetPool.find((v) => {
      const name = v.name.toLowerCase();
      const isPremium = premiumKeywords.some((k) => name.includes(k));
      const isGender = targetKeywords.some((k) => name.includes(k));
      return isPremium && isGender;
    });
    if (bestPremiumGender) return bestPremiumGender;

    // 2. Check for matching gender in language
    const bestGender = targetPool.find((v) => {
      const name = v.name.toLowerCase();
      return targetKeywords.some((k) => name.includes(k));
    });
    if (bestGender) return bestGender;

    // 3. Check for any premium natural voice in language
    const anyPremium = targetPool.find((v) => {
      const name = v.name.toLowerCase();
      return premiumKeywords.some((k) => name.includes(k));
    });
    if (anyPremium) return anyPremium;

    // 4. Default to first available for language
    return targetPool[0] || null;
  }

  public speak(rawText: string, options: SpeechOptions = {}) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (options.onError) options.onError(new Error('Speech Synthesis not supported in this browser.'));
      return;
    }

    this.stop();

    const lang: 'ru' | 'en' = options.voiceLang || (options.voiceName?.includes('en-') || options.voiceName?.toLowerCase().includes('english') ? 'en' : 'ru');
    const gender: 'male' | 'female' = options.voiceGender || (options.voiceName?.toLowerCase().includes('svetlana') || options.voiceName?.toLowerCase().includes('jenny') || options.voiceName?.toLowerCase().includes('жен') ? 'female' : 'male');

    // Humanize text
    const processedText = humanizeTextForSpeech(rawText, lang);

    // Split text into coherent, natural sentences
    const sentences = processedText
      .split(/(?<=[.!?…\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length === 0) {
      if (options.onEnd) options.onEnd();
      return;
    }

    let currentIndex = 0;
    const selectedVoice = this.findBestVoice(gender, lang);

    // Fine-tuned rate & pitch for human broadcaster delivery
    let tunedRate = options.rate ?? (gender === 'male' ? 1.0 : 1.02);
    let tunedPitch = options.pitch ?? (gender === 'male' ? 1.0 : 1.04);

    // Bound values safely
    tunedRate = Math.min(Math.max(tunedRate, 0.85), 1.3);
    tunedPitch = Math.min(Math.max(tunedPitch, 0.9), 1.25);

    const speakNext = () => {
      if (currentIndex >= sentences.length) {
        this.isSpeaking = false;
        this.isPaused = false;
        this.currentUtterance = null;
        if (options.onEnd) options.onEnd();
        return;
      }

      const sentence = sentences[currentIndex];
      if (options.onSentence) {
        options.onSentence(currentIndex, sentence);
      }

      const utterance = new SpeechSynthesisUtterance(sentence);
      this.currentUtterance = utterance;

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
      }

      utterance.rate = tunedRate;
      utterance.pitch = tunedPitch;
      utterance.volume = options.volume !== undefined ? options.volume : 1.0;

      utterance.onstart = () => {
        if (currentIndex === 0 && options.onStart) {
          options.onStart();
        }
      };

      utterance.onend = () => {
        currentIndex++;
        // Natural human breath pause between sentences (60ms)
        setTimeout(() => {
          if (this.isSpeaking && !this.isPaused) {
            speakNext();
          }
        }, 60);
      };

      utterance.onerror = (e) => {
        // Suppress expected intentional interruptions and cancellations to keep debug panel clean
        if (e.error === 'interrupted' || e.error === 'canceled') {
          return;
        }
        if (options.onError) {
          options.onError(e);
        }
        this.isSpeaking = false;
        this.isPaused = false;
      };

      this.isSpeaking = true;
      this.isPaused = false;

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        // Prevent uncaught errors in debug console
        this.isSpeaking = false;
        if (options.onError) options.onError(err);
      }
    };

    speakNext();
  }

  public pause() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        try {
          window.speechSynthesis.pause();
          this.isPaused = true;
        } catch {
          // Safe ignore
        }
      }
    }
  }

  public resume() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        try {
          window.speechSynthesis.resume();
          this.isPaused = false;
        } catch {
          // Safe ignore
        }
      }
    }
  }

  public stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Safe ignore
      }
      this.isSpeaking = false;
      this.isPaused = false;
      this.currentUtterance = null;
    }
  }

  public getStatus() {
    return {
      isSpeaking: this.isSpeaking,
      isPaused: this.isPaused,
    };
  }
}

export const speechController = new SpeechController();

