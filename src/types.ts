export type DigestStyle = 'podcast' | 'executive' | 'bullets' | 'highlights' | 'custom';

export type TTSEngineType = 'edge-tts' | 'gtts' | 'gemini-tts';

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  engine: TTSEngineType;
  lang: string;
  description: string;
  samplePhrase: string;
}

export interface TelegramChannel {
  id: string;
  username: string; // e.g. "durov"
  title: string;
  category: 'tech' | 'news' | 'ai' | 'business' | 'crypto' | 'custom';
  avatarUrl?: string;
  subscriberCount?: string;
  description?: string;
  enabled: boolean;
  isPrivate?: boolean;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  channelUsername: string;
  channelTitle: string;
  text: string;
  date: string; // Display date/time e.g. "Сегодня, 14:10"
  timestamp?: number; // Epoch timestamp for precise time filtering
  url?: string; // Direct link to the post in Telegram, e.g. "https://t.me/durov/42"
  views?: number;
  hasMedia?: boolean;
  mediaType?: 'photo' | 'video' | 'document' | 'none';
  selected?: boolean;
}

export interface DigestGenerationConfig {
  style: DigestStyle;
  language: 'ru' | 'en';
  timeWindowHours: number;
  focusTopic?: string;
  customPrompt?: string;
  removeAds: boolean;
  voiceName: string;
  ttsEngine: TTSEngineType;
  speechRate: number;
  speechPitch: number;
}

export interface DigestResult {
  id: string;
  summary: string;
  cleanSpeechText: string;
  style: DigestStyle;
  language: string;
  generatedAt: string;
  postsCount: number;
  channelNames: string[];
  audioBlobUrl?: string;
  durationEstimateSec?: number;
  voiceUsed?: string;
  ttsEngineUsed?: TTSEngineType;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  isAudio?: boolean;
  audioDuration?: string;
  audioText?: string;
  digestData?: DigestResult;
  buttons?: { text: string; callbackData: string }[];
}

export interface PythonProjectConfig {
  telegramApiId: string;
  telegramApiHash: string;
  botToken: string;
  geminiApiKey: string;
  channels: string[];
  digestTime: string;
  defaultStyle: DigestStyle;
  ttsEngine: TTSEngineType;
  edgeVoice: string;
}

export interface PythonFile {
  name: string;
  path: string;
  description: string;
  language: string;
  content: string;
}

