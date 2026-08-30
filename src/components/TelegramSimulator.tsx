import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Mic, 
  Play, 
  Pause, 
  Radio, 
  RotateCcw, 
  Sparkles, 
  CheckCheck, 
  Bot, 
  User, 
  MoreVertical,
  Paperclip,
  Smile,
  List,
  Flame,
  Volume2,
  Plus,
  Trash2,
  Settings2,
  Headphones,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  Sun,
  Moon,
  Zap,
  Gauge
} from 'lucide-react';
import { ChatMessage, DigestResult, TelegramChannel, VoiceOption, ChannelPost } from '../types';
import { speechController } from '../utils/speech';

export interface SessionDigestItem {
  id: string;
  createdAt: number;
  timeStr: string;
  summaryText: string;
  cleanSpeechText: string;
  voiceName: string;
  voiceId: string;
  channels: string[];
  msgTextId?: string;
  msgVoiceId?: string;
}

export const SIMULATOR_VOICES: VoiceOption[] = [
  {
    id: 'gtts-ru',
    name: '1. Русский — Женский голос (Google TTS)',
    gender: 'female',
    engine: 'gtts',
    lang: 'ru',
    description: 'Женский голос Google Text-To-Speech на русском языке',
    samplePhrase: 'Здравствуйте! Это диктор Google TTS, надежный синтез речи без блокировок.',
  },
  {
    id: 'gtts-en',
    name: '2. English — Female Voice (Google TTS)',
    gender: 'female',
    engine: 'gtts',
    lang: 'en',
    description: 'Google Text-To-Speech female voice in English',
    samplePhrase: 'Hello! This is Google Text-to-Speech news anchor in English.',
  },
];

export const SPEECH_RATE_OPTIONS = [
  { label: '1.0x (Нормально)', value: 1.0 },
  { label: '1.1x (Бодро)', value: 1.1 },
  { label: '1.25x (Оптимально)', value: 1.25 },
  { label: '1.35x (Быстро)', value: 1.35 },
  { label: '1.5x (Максимум)', value: 1.5 },
];

interface TelegramSimulatorProps {
  channels: TelegramChannel[];
  posts?: ChannelPost[];
  digestResult: DigestResult | null;
  onGenerateDigest: () => Promise<void>;
  onUpdateChannels?: (channels: TelegramChannel[]) => void;
}

export const TelegramSimulator: React.FC<TelegramSimulatorProps> = ({
  channels: initialChannels,
  posts: initialPosts = [],
  digestResult,
  onGenerateDigest,
  onUpdateChannels,
}) => {
  // Telegram Theme State: dark vs light (reflects user's Telegram client theme settings)
  const [telegramTheme, setTelegramTheme] = useState<'dark' | 'light'>('dark');

  // Local user state inside the bot
  const [userChannels, setUserChannels] = useState<string[]>(
    initialChannels.filter((c) => c.enabled).map((c) => c.username)
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('gtts-ru');
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [isWaitingForChannelInput, setIsWaitingForChannelInput] = useState<boolean>(false);
  const [lastNewsCommandTimestamp, setLastNewsCommandTimestamp] = useState<number | null>(null);

  // Session Digest History (allows browsing previous generated digests via back/forward buttons)
  const [digestHistory, setDigestHistory] = useState<SessionDigestItem[]>([
    {
      id: 'digest-sample-1',
      createdAt: Date.now() - 3600 * 1000 * 2,
      timeStr: '09:30',
      summaryText: `🎙️ <b>Утренний новостной выпуск (Архив):</b>\n\n1. <b>Telegram:</b> Аудитория мессенджера превысила 950 миллионов активных пользователей.\n👉 <a href="https://t.me/durov/312">Читать в @durov ↗</a>\n\n2. <b>Google Gemini:</b> Представлена ультра-быстрая модель с поддержкой 2 млн токенов.\n👉 <a href="https://t.me/ai_revolution/1458">Читать в @ai_revolution ↗</a>\n\n3. <b>Python 3.13:</b> Новая архитектура без GIL ускоряет бэкенды.\n👉 <a href="https://t.me/habr_pop/8921">Читать в @habr_pop ↗</a>`,
      cleanSpeechText: 'Доброе утро! В эфире утренний новостной дайджест. Аудитория Telegram превысила девятьсот пятьдесят миллионов пользователей. Выпущены обновленные модели Gemini.',
      voiceName: '1. Русский — Женский голос (Google TTS)',
      voiceId: 'gtts-ru',
      channels: ['zaPEACEki'],
    },
  ]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(0);

  // Sync external digestResult into session history if updated
  useEffect(() => {
    if (digestResult && digestResult.summary) {
      setDigestHistory((prev) => {
        const alreadyExists = prev.some((d) => d.summaryText === digestResult.summary);
        if (alreadyExists) return prev;
        const newItem: SessionDigestItem = {
          id: `digest-${Date.now()}`,
          createdAt: Date.now(),
          timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          summaryText: digestResult.summary,
          cleanSpeechText: digestResult.cleanSpeechText || digestResult.summary,
          voiceName: SIMULATOR_VOICES.find((v) => v.id === selectedVoiceId)?.name || '1. Русский — Женский голос (Google TTS)',
          voiceId: selectedVoiceId,
          channels: userChannels,
        };
        const nextList = [...prev, newItem];
        setCurrentHistoryIndex(nextList.length - 1);
        return nextList;
      });
    }
  }, [digestResult]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'bot',
      text: `👋 <b>Привет!</b> Я твой персональный <b>ИИ-диктор новостей</b> на базе <b>Google Gemini</b> и Google TTS.\n\n✨ <b>Возможности:</b>\n• Голос по умолчанию: <b>Русский женский (Google TTS)</b>\n• Отслеживаемый канал: <b>@zaPEACEki</b>\n• Управление каналами: <code>/add @канал</code> и <code>/del @канал</code>\n• Запуск дайджеста: <code>/news</code>\n\nНажми кнопку ниже или напиши команду:`,
      time: '12:00',
      buttons: [
        { text: '🎙️ Получить аудио-дайджест', callbackData: '/news' },
        { text: '📋 Мои каналы', callbackData: '/channels' },
        { text: '🗣️ Выбрать голос', callbackData: '/voice' },
        { text: '➕ Добавить канал', callbackData: '/add' },
      ],
    },
  ]);

  const [inputVal, setInputVal] = useState<string>('');
  const [isBotTyping, setIsBotTyping] = useState<boolean>(false);
  const [typingStep, setTypingStep] = useState<string>('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBotTyping]);

  const currentVoiceObj = SIMULATOR_VOICES.find((v) => v.id === selectedVoiceId) || SIMULATOR_VOICES[0];

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputVal;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');

    const lower = text.toLowerCase().trim();

    // Check for internal history jump commands
    if (lower.startsWith('__history_goto_')) {
      const targetIdx = parseInt(lower.replace('__history_goto_', ''), 10);
      if (!isNaN(targetIdx)) {
        handleJumpToDigest(targetIdx);
        return;
      }
    }

    // Check if we were waiting for FSM channel input
    if (isWaitingForChannelInput && !lower.startsWith('/')) {
      setIsWaitingForChannelInput(false);
      executeAddChannel(text);
      return;
    }

    // 1. Command: /channels or /mychannels
    if (lower === '/channels' || lower === '/mychannels') {
      setTimeout(() => {
        if (userChannels.length === 0) {
          const botMsg: ChatMessage = {
            id: `msg-${Date.now() + 1}`,
            sender: 'bot',
            text: `📋 <b>Ваш список каналов пуст!</b>\n\nДобавьте канал командой <code>/add @username</code> или нажмите кнопку ниже:`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            buttons: [
              { text: '➕ Добавить канал', callbackData: '/add' },
              { text: '🔄 Сбросить к стандартным', callbackData: '/reset_channels' },
            ],
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }

        const channelsList = userChannels.map((c) => `• <b>@${c}</b>`).join('\n');
        const buttons = userChannels.map((c) => ({
          text: `❌ Удалить @${c}`,
          callbackData: `/del @${c}`,
        }));
        buttons.push({ text: '➕ Добавить канал', callbackData: '/add' });
        buttons.push({ text: '🎙️ Собрать /news', callbackData: '/news' });

        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `📋 <b>Ваши отслеживаемые каналы (${userChannels.length}):</b>\n\n${channelsList}\n\n💡 <i>Нажмите «❌ Удалить @канал» или используйте <code>/add @username</code>:</i>`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: buttons,
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 350);
      return;
    }

    // 2. Command: /add or /addchannel
    if (lower.startsWith('/add')) {
      const parts = text.split(/\s+/);
      if (parts.length > 1) {
        executeAddChannel(parts.slice(1).join(' '));
      } else {
        setIsWaitingForChannelInput(true);
        setTimeout(() => {
          const botMsg: ChatMessage = {
            id: `msg-${Date.now() + 1}`,
            sender: 'bot',
            text: `✍️ <b>Введите username или ссылку на канал:</b>\n\nНапример: <code>@durov</code> или <code>habr_pop</code> или <code>https://t.me/ai_revolution</code>`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            buttons: [{ text: '❌ Отмена', callbackData: '/cancel' }],
          };
          setMessages((prev) => [...prev, botMsg]);
        }, 300);
      }
      return;
    }

    // 3. Command: /del or /removechannel
    if (lower.startsWith('/del') || lower.startsWith('/removechannel')) {
      const parts = text.split(/\s+/);
      if (parts.length > 1) {
        executeRemoveChannel(parts.slice(1).join(' '));
      } else {
        setTimeout(() => {
          const buttons = userChannels.map((c) => ({
            text: `❌ @${c}`,
            callbackData: `/del @${c}`,
          }));
          const botMsg: ChatMessage = {
            id: `msg-${Date.now() + 1}`,
            sender: 'bot',
            text: `Укажите канал для удаления (например: <code>/del @durov</code>) или выберите из списка:`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            buttons: buttons,
          };
          setMessages((prev) => [...prev, botMsg]);
        }, 300);
      }
      return;
    }

    // 4. Command: /voice or /tts or /setvoice or /settings
    if (lower === '/voice' || lower === '/setvoice' || lower === '/tts' || lower === '/settings') {
      setTimeout(() => {
        const voiceButtons = SIMULATOR_VOICES.map((v) => ({
          text: `${v.id === selectedVoiceId ? '✅ ' : ''}👩 ${v.name}`,
          callbackData: `/select_voice ${v.id}`,
        }));

        const buttons = [
          ...voiceButtons,
          { text: '🎧 Прослушать образец', callbackData: '/test_voice' },
          { text: '🎙️ Собрать /news', callbackData: '/news' },
        ];

        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `🗣️ <b>Настройка голоса диктора (Google TTS)</b>\n\n` +
            `• <b>Текущий голос:</b> ${currentVoiceObj.name}\n` +
            `• <b>Движок:</b> Google Text-To-Speech (100% стабильный без ограничений)\n` +
            `• <b>Описание:</b> <i>${currentVoiceObj.description}</i>\n\n` +
            `Выберите язык и голос озвучки ниже:`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: buttons,
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 350);
      return;
    }

    // 4.1 Command: /speed or /setspeed
    if (lower.startsWith('/speed') || lower.startsWith('/setspeed')) {
      const parts = text.split(/\s+/);
      if (parts.length > 1) {
        const val = parseFloat(parts[1]);
        if (!isNaN(val) && val >= 1.0 && val <= 1.5) {
          setSpeechRate(val);
          setTimeout(() => {
            const botMsg: ChatMessage = {
              id: `msg-${Date.now() + 1}`,
              sender: 'bot',
              text: `⚡ <b>Скорость озвучки установлена: ${val}x</b>\n\nТеперь все выпуски новостей будут воспроизводиться с этой скоростью.`,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              buttons: [
                { text: '🎧 Прослушать образец', callbackData: '/test_voice' },
                { text: '🎙️ Запустить /news', callbackData: '/news' },
                { text: '🗣️ Сменить голос', callbackData: '/voice' },
              ],
            };
            setMessages((prev) => [...prev, botMsg]);
          }, 250);
          return;
        }
      }

      setTimeout(() => {
        const speedButtons = SPEECH_RATE_OPTIONS.map((opt) => ({
          text: `${speechRate === opt.value ? '✅ ' : ''}${opt.label}`,
          callbackData: `/set_speed ${opt.value}`,
        }));
        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `⚡ <b>Выбор скорости озвучки (от 1.0x до 1.5x):</b>\n\nТекущая скорость: <b>${speechRate}x</b>\n\nВыберите желаемое значение:`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [
            ...speedButtons,
            { text: '🎧 Прослушать образец', callbackData: '/test_voice' },
          ],
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 250);
      return;
    }

    // 4.2 Action: Set Speed Callback
    if (lower.startsWith('/set_speed')) {
      const val = parseFloat(text.split(/\s+/)[1]);
      if (!isNaN(val)) {
        setSpeechRate(val);
        setTimeout(() => {
          const botMsg: ChatMessage = {
            id: `msg-${Date.now() + 1}`,
            sender: 'bot',
            text: `⚡ <b>Скорость озвучки изменена: ${val}x</b>\n\nГолос: <b>${currentVoiceObj.name}</b>`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            buttons: [
              { text: '🎧 Прослушать образец', callbackData: '/test_voice' },
              { text: '🎙️ Запустить /news', callbackData: '/news' },
              { text: '🗣️ Все настройки', callbackData: '/voice' },
            ],
          };
          setMessages((prev) => [...prev, botMsg]);
        }, 250);
      }
      return;
    }

    // 5. Action: Select Voice
    if (lower.startsWith('/select_voice')) {
      const voiceId = text.split(/\s+/)[1];
      const targetVoice = SIMULATOR_VOICES.find((v) => v.id === voiceId);
      if (targetVoice) {
        setSelectedVoiceId(targetVoice.id);
        setTimeout(() => {
          const botMsg: ChatMessage = {
            id: `msg-${Date.now() + 1}`,
            sender: 'bot',
            text: `✅ <b>Установлен голос:</b> ${targetVoice.name}\n` +
              `Движок: <b>${targetVoice.engine}</b>\n\n` +
              `Теперь дайджесты будут озвучиваться этим голосом.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            buttons: [
              { text: '🎧 Прослушать образец', callbackData: '/test_voice' },
              { text: '🎙️ Запустить /news', callbackData: '/news' },
              { text: '📋 Каналы', callbackData: '/channels' },
            ],
          };
          setMessages((prev) => [...prev, botMsg]);
        }, 300);
      }
      return;
    }

    // 6. Action: Test Voice
    if (lower === '/test_voice') {
      setTimeout(() => {
        const sampleText = currentVoiceObj.samplePhrase;
        const voiceMsg: ChatMessage = {
          id: `sample-${Date.now() + 1}`,
          sender: 'bot',
          text: `🎧 <b>Образец голоса:</b> ${currentVoiceObj.name} (${currentVoiceObj.engine})`,
          isAudio: true,
          audioDuration: '0:06',
          audioText: sampleText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [
            { text: '🗣️ Сменить голос', callbackData: '/voice' },
            { text: '🎙️ Получить /news', callbackData: '/news' },
          ],
        };
        setMessages((prev) => [...prev, voiceMsg]);

        // Auto-play sample with selected voice and rate
        playAudioWithSelectedVoice(`sample-${Date.now() + 1}`, sampleText, currentVoiceObj);
      }, 300);
      return;
    }

    // 7. Action: Reset channels
    if (lower === '/reset_channels') {
      const defaultList = ['zaPEACEki'];
      setUserChannels(defaultList);
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `🔄 <b>Список каналов сброшен к стандартному (@zaPEACEki):</b>\n\n` +
            defaultList.map((c) => `• <b>@${c}</b>`).join('\n'),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [
            { text: '🎙️ Получить дайджест', callbackData: '/news' },
            { text: '📋 Управление', callbackData: '/channels' },
          ],
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 300);
      return;
    }

    // 8. Cancel FSM
    if (lower === '/cancel') {
      setIsWaitingForChannelInput(false);
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `👌 Действие отменено. Чем могу помочь?`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [
            { text: '🎙️ Дайджест', callbackData: '/news' },
            { text: '📋 Каналы', callbackData: '/channels' },
          ],
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 200);
      return;
    }

    // 9. Command: /help or /start
    if (lower === '/help' || lower === '/start') {
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `📖 <b>Список команд Telegram-бота:</b>\n\n` +
            `• <code>/news</code> — Собрать свежий аудио-дайджест из ваших каналов\n` +
            `• <code>/channels</code> — Список ваших каналов с кнопками удаления\n` +
            `• <code>/add @channel</code> — Добавить канал в список\n` +
            `• <code>/del @channel</code> — Удалить канал из списка\n` +
            `• <code>/voice</code> — Выбор голоса (Edge-TTS / gTTS, мужской/женский)\n` +
            `• <code>/text</code> — Текстовая выжимка без аудио\n` +
            `• <code>/top3</code> — ТОП-3 события дня\n`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [
            { text: '🎙️ /news', callbackData: '/news' },
            { text: '📋 /channels', callbackData: '/channels' },
            { text: '🗣️ /voice', callbackData: '/voice' },
          ],
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 350);
      return;
    }

    // 10. Main /news digestion flow
    if (userChannels.length === 0) {
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `⚠️ <b>У вас нет добавленных каналов для чтения!</b>\n\nДобавьте хотя бы один канал через <code>/add @username</code>.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [{ text: '➕ Добавить канал', callbackData: '/add' }],
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 300);
      return;
    }

    setIsBotTyping(true);

    // Calculate time threshold: posts strictly after last /news, capped at 2 days (48h) lookback max
    const now = Date.now();
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const timeThreshold = lastNewsCommandTimestamp
      ? Math.max(lastNewsCommandTimestamp, now - TWO_DAYS_MS)
      : now - TWO_DAYS_MS;

    // Filter relevant channel posts based on active channels and time window
    const matchingPosts = (initialPosts.length > 0 ? initialPosts : [])
      .filter((p) => userChannels.includes(p.channelUsername))
      .filter((p) => !p.timestamp || p.timestamp >= timeThreshold);

    // Update last /news command timestamp for subsequent calls
    setLastNewsCommandTimestamp(now);

    setTypingStep(`Шаг 1/3: Telethon читает свежие посты за ${lastNewsCommandTimestamp ? 'время с прошлой команды' : 'последние 2 дня'} (${userChannels.map((c) => '@' + c).join(', ')})...`);

    try {
      setTimeout(() => {
        setTypingStep('Шаг 2/3: Gemini 3.7 Flash формирует связный сценарий с кликабельными ссылками...');
      }, 1000);

      // Prepare payload with actual posts or fallback channel references with direct URLs
      const postsPayload = matchingPosts.length > 0
        ? matchingPosts.map((p) => ({
            channel: p.channelUsername,
            text: p.text,
            date: p.date,
            url: p.url || `https://t.me/${p.channelUsername}`,
          }))
        : userChannels.map((ch) => ({
            channel: ch,
            text: `Свежее обновление в канале @${ch}: важные технологические новости, ИИ-инновации и тренды индустрии.`,
            date: 'Сегодня',
            url: `https://t.me/${ch}`,
          }));

      const response = await fetch('/api/gemini/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts: postsPayload,
          channels: userChannels,
          style: lower.includes('top') ? 'highlights' : 'podcast',
          language: 'ru',
        }),
      });

      let summaryText = '';
      let cleanSpeech = '';

      if (response.ok) {
        const data = await response.json();
        summaryText = data.summary;
        cleanSpeech = data.cleanSpeechText || data.summary;
      } else {
        summaryText = `🎙️ <b>Главные новости из ваших каналов:</b>

1. <b>Telegram:</b> Аудитория мессенджера превысила 950 миллионов активных пользователей. В приложении готовится новый встроенный браузер.
👉 <a href="https://t.me/durov/312">Читать в @durov ↗</a>

2. <b>AI & Инновации:</b> Google обновил модели Gemini с ультра-быстрым голосовым откликом.
👉 <a href="https://t.me/ai_revolution/1458">Читать в @ai_revolution ↗</a>

3. <b>Python 3.13:</b> Новая архитектура без GIL ускоряет параллельные вычисления.
👉 <a href="https://t.me/habr_pop/8921">Читать в @habr_pop ↗</a>`;
        cleanSpeech = "Добрый день! Главные новости из ваших каналов: Аудитория Telegram превысила 950 миллионов пользователей. В мире ИИ обновлены модели Gemini. Разработчики выпустили релиз Python 3.13.";
      }

      setTimeout(() => {
        setTypingStep(`Шаг 3/3: Озвучка голосом ${currentVoiceObj.name}...`);
      }, 2000);

      setTimeout(() => {
        setIsBotTyping(false);

        const newMsgTextId = `msg-${Date.now() + 2}`;
        const newMsgVoiceId = `voice-${Date.now() + 3}`;

        const textMsg: ChatMessage = {
          id: newMsgTextId,
          sender: 'bot',
          text: `📰 <b>Сводка новостей (${userChannels.length} каналов, срез за ${lastNewsCommandTimestamp ? 'период с прошлого запроса' : '2 дня'}):</b>\n\n${summaryText}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        const newDigestItem: SessionDigestItem = {
          id: `digest-${Date.now()}`,
          createdAt: Date.now(),
          timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          summaryText: summaryText,
          cleanSpeechText: cleanSpeech,
          voiceName: currentVoiceObj.name,
          voiceId: currentVoiceObj.id,
          channels: [...userChannels],
          msgTextId: newMsgTextId,
          msgVoiceId: newMsgVoiceId,
        };

        setDigestHistory((prev) => {
          const nextHistory = [...prev, newDigestItem];
          setCurrentHistoryIndex(nextHistory.length - 1);
          return nextHistory;
        });

        const voiceMsg: ChatMessage = {
          id: newMsgVoiceId,
          sender: 'bot',
          text: `🎙️ Голосовой дайджест (${currentVoiceObj.name})`,
          isAudio: true,
          audioDuration: '1:14',
          audioText: cleanSpeech,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [
            { text: '🔄 Обновить /news', callbackData: '/news' },
            ...(digestHistory.length > 0
              ? [{ text: `◀ Пред. выпуск (#${digestHistory.length})`, callbackData: `__history_goto_${digestHistory.length - 1}` }]
              : []),
            { text: '🗣️ Сменить голос', callbackData: '/voice' },
            { text: '📋 Мои каналы', callbackData: '/channels' },
          ],
        };

        setMessages((prev) => [...prev, textMsg, voiceMsg]);

        // Auto-play the digest
        playAudioWithSelectedVoice(newMsgVoiceId, cleanSpeech, currentVoiceObj);
      }, 2800);
    } catch {
      setIsBotTyping(false);
      const errMsg: ChatMessage = {
        id: `msg-${Date.now() + 2}`,
        sender: 'bot',
        text: '⚠️ Не удалось получить данные. Попробуйте еще раз: <code>/news</code>',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  };

  const handlePrevDigest = () => {
    if (currentHistoryIndex > 0) {
      const targetIdx = currentHistoryIndex - 1;
      setCurrentHistoryIndex(targetIdx);
      postHistoricalDigestMessage(targetIdx);
    }
  };

  const handleNextDigest = () => {
    if (currentHistoryIndex < digestHistory.length - 1) {
      const targetIdx = currentHistoryIndex + 1;
      setCurrentHistoryIndex(targetIdx);
      postHistoricalDigestMessage(targetIdx);
    }
  };

  const handleJumpToDigest = (targetIdx: number) => {
    if (targetIdx >= 0 && targetIdx < digestHistory.length) {
      setCurrentHistoryIndex(targetIdx);
      postHistoricalDigestMessage(targetIdx);
    }
  };

  const postHistoricalDigestMessage = (targetIdx: number) => {
    const item = digestHistory[targetIdx];
    if (!item) return;

    const histTextMsg: ChatMessage = {
      id: `hist-msg-${Date.now()}`,
      sender: 'bot',
      text: `📖 <b>Архив сессии: Выпуск #${targetIdx + 1} из ${digestHistory.length}</b> <i>(${item.timeStr})</i>:\n\n${item.summaryText}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const targetVoiceObj = SIMULATOR_VOICES.find((v) => v.id === item.voiceId) || currentVoiceObj;

    const histVoiceMsg: ChatMessage = {
      id: `hist-voice-${Date.now() + 1}`,
      sender: 'bot',
      text: `🎙️ Аудиозапись выпуска #${targetIdx + 1} (${item.voiceName})`,
      isAudio: true,
      audioDuration: '1:14',
      audioText: item.cleanSpeechText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      buttons: [
        ...(targetIdx > 0
          ? [{ text: `◀ Назад (#${targetIdx})`, callbackData: `__history_goto_${targetIdx - 1}` }]
          : []),
        ...(targetIdx < digestHistory.length - 1
          ? [{ text: `Вперед (#${targetIdx + 2}) ▶`, callbackData: `__history_goto_${targetIdx + 1}` }]
          : []),
        { text: '🔄 Свежий /news', callbackData: '/news' },
        { text: '🗣️ Сменить голос', callbackData: '/voice' },
      ],
    };

    setMessages((prev) => [...prev, histTextMsg, histVoiceMsg]);
    playAudioWithSelectedVoice(`hist-voice-${Date.now() + 1}`, item.cleanSpeechText, targetVoiceObj);
  };

  const executeAddChannel = (rawInput: string) => {
    const cleaned = rawInput.replace(/https?:\/\/t\.me\/|@/g, '').trim().toLowerCase();
    if (!cleaned || cleaned.length < 3) {
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `❌ <b>Некорректный юзернейм канала!</b>\nПожалуйста, укажите имя канала, например: <code>@durov</code>.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 200);
      return;
    }

    if (userChannels.includes(cleaned)) {
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `ℹ️ Канал <b>@${cleaned}</b> уже находится в вашем списке!`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [
            { text: '📋 Показать каналы', callbackData: '/channels' },
            { text: '🎙️ Запустить /news', callbackData: '/news' },
          ],
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 200);
      return;
    }

    const updated = [...userChannels, cleaned];
    setUserChannels(updated);

    setTimeout(() => {
      const botMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'bot',
        text: `🎉 Канал <b>@${cleaned}</b> успешно добавлен в ваш список!\n\nВсего отслеживаемых каналов: <b>${updated.length}</b>.\nТеперь бот будет читать посты и из этого источника при команде <code>/news</code>.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        buttons: [
          { text: '🎙️ Собрать /news с новым каналом', callbackData: '/news' },
          { text: '📋 Список каналов', callbackData: '/channels' },
          { text: '➕ Добавить еще', callbackData: '/add' },
        ],
      };
      setMessages((prev) => [...prev, botMsg]);
    }, 250);
  };

  const executeRemoveChannel = (rawInput: string) => {
    const cleaned = rawInput.replace(/https?:\/\/t\.me\/|@/g, '').trim().toLowerCase();
    if (!userChannels.includes(cleaned)) {
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `⚠️ Канал <b>@${cleaned}</b> не найден в вашем списке.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [{ text: '📋 Мои каналы', callbackData: '/channels' }],
        };
        setMessages((prev) => [...prev, botMsg]);
      }, 200);
      return;
    }

    const updated = userChannels.filter((c) => c !== cleaned);
    setUserChannels(updated);

    setTimeout(() => {
      const botMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'bot',
        text: `🗑️ Канал <b>@${cleaned}</b> удален из вашего списка новостей.\nОсталось каналов: <b>${updated.length}</b>.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        buttons: [
          { text: '📋 Мои каналы', callbackData: '/channels' },
          { text: '🎙️ Запустить /news', callbackData: '/news' },
        ],
      };
      setMessages((prev) => [...prev, botMsg]);
    }, 250);
  };

  const playAudioWithSelectedVoice = (msgId: string, audioText: string, voiceObj: VoiceOption) => {
    speechController.stop();
    setPlayingVoiceId(msgId);

    const isRu = voiceObj.lang === 'ru';
    const isMale = voiceObj.gender === 'male';

    speechController.speak(audioText, {
      voiceGender: isMale ? 'male' : 'female',
      voiceLang: isRu ? 'ru' : 'en',
      pitch: isMale ? 1.0 : 1.04,
      rate: speechRate, // Applies selected speed (1.0x to 1.5x)
      onEnd: () => setPlayingVoiceId(null),
      onError: () => setPlayingVoiceId(null),
    });
  };

  const handleToggleVoicePlayback = (msgId: string, audioText?: string) => {
    if (!audioText) return;

    if (playingVoiceId === msgId) {
      speechController.stop();
      setPlayingVoiceId(null);
    } else {
      playAudioWithSelectedVoice(msgId, audioText, currentVoiceObj);
    }
  };

  const isDark = telegramTheme === 'dark';

  return (
    <div 
      id="telegram-simulator-container" 
      className={`max-w-3xl mx-auto rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[670px] transition-colors duration-300 border ${
        isDark 
          ? 'bg-[#0e1621] border-slate-800 text-slate-100' 
          : 'bg-[#eef2f5] border-slate-300 text-slate-800'
      }`}
    >
      
      {/* Telegram Chat Header */}
      <div 
        className={`px-4 sm:px-5 py-3 flex items-center justify-between z-10 border-b transition-colors ${
          isDark 
            ? 'bg-[#17212b] border-[#0f1722] text-white' 
            : 'bg-white border-slate-200 text-slate-900 shadow-xs'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/25">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#17212b]" />
          </div>
          <div>
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <span className={isDark ? 'text-white' : 'text-slate-900'}>Gemini News Voice Bot</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                isDark 
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                  : 'bg-blue-100 text-blue-700 border border-blue-200'
              }`}>
                бот
              </span>
            </h3>
            <p className={`text-xs font-medium truncate max-w-[190px] sm:max-w-xs ${
              isDark ? 'text-blue-400' : 'text-blue-600'
            }`}>
              {isBotTyping ? typingStep : `${currentVoiceObj.name} • ${speechRate}x • ${userChannels.length} кан.`}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Telegram Theme Simulator Switcher */}
          <button
            onClick={() => setTelegramTheme(isDark ? 'light' : 'dark')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 shadow-sm ${
              isDark 
                ? 'bg-[#242f3d] hover:bg-[#2e3c4d] text-amber-300 border-slate-700' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
            }`}
            title="Переключить тему оформления Telegram (светлая/темная)"
          >
            {isDark ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Светлая тема</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Темная тема</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleSendMessage('/voice')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              isDark 
                ? 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="Голос и скорость"
          >
            <Headphones className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline font-mono">{speechRate}x</span>
          </button>

          <button
            onClick={() => handleSendMessage('/news')}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1 active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5" /> /news
          </button>
        </div>
      </div>

      {/* Session Digest History Bar (Back/Forward Navigation) */}
      <div 
        className={`px-3.5 sm:px-5 py-2 flex items-center justify-between gap-2 text-xs border-b transition-colors z-10 ${
          isDark 
            ? 'bg-[#0f1722] border-[#202b36] text-slate-300' 
            : 'bg-[#f4f7f9] border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border shadow-xs ${
            isDark 
              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
              : 'bg-blue-100 text-blue-600 border-blue-200'
          }`}>
            <History className="w-3.5 h-3.5" />
          </div>
          <div className="truncate text-xs">
            <span className="text-slate-500 font-medium hidden xs:inline">История: </span>
            <span className={`font-bold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
              Выпуск #{currentHistoryIndex + 1} из {digestHistory.length}
            </span>
            {digestHistory[currentHistoryIndex] && (
              <span className="text-slate-400 text-[11px] ml-1.5 hidden sm:inline font-mono">
                • {digestHistory[currentHistoryIndex].timeStr}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handlePrevDigest}
            disabled={currentHistoryIndex <= 0}
            className={`px-2.5 py-1 rounded-xl text-xs font-medium flex items-center gap-1 transition-all ${
              currentHistoryIndex <= 0
                ? 'opacity-40 cursor-not-allowed text-slate-500 border border-transparent'
                : isDark 
                  ? 'bg-white/10 hover:bg-white/20 text-slate-100 border border-white/15 active:scale-95' 
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-xs active:scale-95'
            }`}
            title="Предыдущий дайджест в истории"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Назад</span>
          </button>

          <button
            onClick={handleNextDigest}
            disabled={currentHistoryIndex >= digestHistory.length - 1}
            className={`px-2.5 py-1 rounded-xl text-xs font-medium flex items-center gap-1 transition-all ${
              currentHistoryIndex >= digestHistory.length - 1
                ? 'opacity-40 cursor-not-allowed text-slate-500 border border-transparent'
                : isDark 
                  ? 'bg-white/10 hover:bg-white/20 text-slate-100 border border-white/15 active:scale-95' 
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-xs active:scale-95'
            }`}
            title="Следующий дайджест в истории"
          >
            <span className="hidden xs:inline">Вперед</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {digestHistory[currentHistoryIndex] && (
            <button
              onClick={() => {
                const item = digestHistory[currentHistoryIndex];
                handleToggleVoicePlayback(`hist-bar-${item.id}`, item.cleanSpeechText);
              }}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium flex items-center gap-1 border transition-all ${
                playingVoiceId === `hist-bar-${digestHistory[currentHistoryIndex]?.id}`
                  ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse font-semibold shadow-amber-500/30'
                  : isDark 
                    ? 'bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border-blue-400/30 active:scale-95' 
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300 shadow-xs active:scale-95'
              }`}
              title="Прослушать выбранный выпуск"
            >
              {playingVoiceId === `hist-bar-${digestHistory[currentHistoryIndex]?.id}` ? (
                <>
                  <Pause className="w-3 h-3 fill-current" />
                  <span className="hidden sm:inline">Пауза</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span className="hidden sm:inline">Слушать ({speechRate}x)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Telegram Message Stream */}
      <div className={`flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 transition-colors ${
        isDark ? 'bg-[#0e1621]' : 'bg-[#e4ebf1]/60'
      }`}>
        
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5 animate-in fade-in duration-200`}
            >
              <div
                className={`max-w-[88%] sm:max-w-[78%] rounded-2xl p-4 text-xs sm:text-sm shadow-md transition-colors ${
                  isUser
                    ? isDark
                      ? 'bg-[#2b5278] text-white rounded-br-none border border-[#3b6694] shadow-sm'
                      : 'bg-[#eeffde] text-slate-900 rounded-br-none border border-[#cbe8aa] shadow-xs'
                    : isDark
                      ? 'bg-[#182533] border border-[#243343] text-slate-100 rounded-bl-none shadow-sm'
                      : 'bg-white border border-slate-200/90 text-slate-900 rounded-bl-none shadow-sm'
                }`}
              >
                {/* Text Body */}
                {!msg.isAudio ? (
                  <div
                    className={`leading-relaxed whitespace-pre-line ${
                      !isDark && !isUser ? 'text-slate-800' : ''
                    }`}
                    dangerouslySetInnerHTML={{ __html: msg.text }}
                  />
                ) : (
                  /* Telegram Voice Message Bubble */
                  <div className="space-y-2.5">
                    <div className="flex items-center space-x-3 py-1">
                      <button
                        onClick={() => handleToggleVoicePlayback(msg.id, msg.audioText)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                          playingVoiceId === msg.id
                            ? 'bg-amber-500 text-slate-950 animate-pulse shadow-md'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/25 active:scale-95'
                        }`}
                      >
                        {playingVoiceId === msg.id ? (
                          <Pause className="w-4 h-4 fill-slate-950" />
                        ) : (
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        )}
                      </button>

                      {/* Waveform */}
                      <div className="flex-1 flex items-center gap-0.5 h-6">
                        {Array.from({ length: 24 }).map((_, i) => (
                          <span
                            key={i}
                            className={`w-1 rounded-full transition-all ${
                              playingVoiceId === msg.id
                                ? 'bg-blue-500 animate-pulse'
                                : isDark ? 'bg-white/25' : 'bg-slate-300'
                            }`}
                            style={{
                              height: `${Math.max(25, ((i * 19) % 80) + 15)}%`,
                            }}
                          />
                        ))}
                      </div>

                      <span className={`text-xs font-mono shrink-0 ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        {msg.audioDuration || '1:14'}
                      </span>
                    </div>

                    <div className={`flex items-center justify-between text-[11px] pt-1 border-t ${
                      isDark ? 'border-white/10 text-slate-400' : 'border-slate-100 text-slate-500'
                    }`}>
                      <span className={`flex items-center gap-1 font-medium ${
                        isDark ? 'text-blue-300' : 'text-blue-600'
                      }`}>
                        <Volume2 className="w-3 h-3" />
                        {currentVoiceObj.name} ({speechRate}x)
                      </span>
                      <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        OGG Opus
                      </span>
                    </div>
                  </div>
                )}

                {/* Time & Read Status */}
                <div className={`flex items-center justify-end space-x-1 text-[10px] mt-1.5 ${
                  isDark ? 'text-slate-400' : isUser ? 'text-emerald-700' : 'text-slate-400'
                }`}>
                  <span>{msg.time}</span>
                  {isUser && <CheckCheck className="w-3 h-3 text-blue-400" />}
                </div>
              </div>

              {/* Inline Buttons */}
              {msg.buttons && msg.buttons.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full max-w-[88%] sm:max-w-[78%] pt-1">
                  {msg.buttons.map((btn, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(btn.callbackData)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-medium text-center transition-all shadow-xs flex items-center justify-center gap-1.5 border active:scale-95 ${
                        isDark
                          ? 'bg-[#242f3d] hover:bg-[#2b394a] border-[#314052] text-[#64b5f6] hover:text-white'
                          : 'bg-white hover:bg-slate-50 border-slate-300 text-[#2481cc] hover:text-blue-700 shadow-sm'
                      }`}
                    >
                      {btn.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {isBotTyping && (
          <div className={`flex items-center space-x-2 text-xs rounded-2xl px-4 py-2.5 w-fit animate-pulse border shadow-xs ${
            isDark
              ? 'bg-[#182533] border-[#243343] text-blue-300'
              : 'bg-white border-slate-200 text-blue-600'
          }`}>
            <Bot className="w-3.5 h-3.5 animate-spin text-blue-500" />
            <span>{typingStep}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips Bar */}
      <div className={`border-t px-3.5 py-2 flex items-center space-x-2 overflow-x-auto no-scrollbar transition-colors ${
        isDark ? 'bg-[#17212b] border-[#202b36]' : 'bg-[#f4f7f9] border-slate-200'
      }`}>
        <button
          onClick={() => handleSendMessage('/news')}
          className={`px-3 py-1 rounded-full text-xs whitespace-nowrap flex items-center gap-1.5 font-semibold transition-all ${
            isDark
              ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30'
              : 'bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300'
          }`}
        >
          <Volume2 className="w-3 h-3" /> /news ({speechRate}x)
        </button>
        <button
          onClick={() => handleSendMessage('/voice')}
          className={`px-3 py-1 rounded-full text-xs whitespace-nowrap flex items-center gap-1 border transition-all ${
            isDark
              ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-xs'
          }`}
        >
          <Headphones className="w-3 h-3 text-indigo-400" /> /voice
        </button>
        <button
          onClick={() => handleSendMessage('/speed')}
          className={`px-3 py-1 rounded-full text-xs whitespace-nowrap flex items-center gap-1 border transition-all ${
            isDark
              ? 'bg-white/5 hover:bg-white/10 text-amber-300 border-amber-500/30'
              : 'bg-white hover:bg-slate-100 text-amber-700 border-amber-300 shadow-xs'
          }`}
        >
          <Zap className="w-3 h-3 text-amber-400" /> /speed ({speechRate}x)
        </button>
        <button
          onClick={() => handleSendMessage('/channels')}
          className={`px-3 py-1 rounded-full text-xs whitespace-nowrap flex items-center gap-1 border transition-all ${
            isDark
              ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-xs'
          }`}
        >
          <List className="w-3 h-3" /> /channels ({userChannels.length})
        </button>
        <button
          onClick={() => handleSendMessage('/add')}
          className={`px-3 py-1 rounded-full text-xs whitespace-nowrap flex items-center gap-1 border transition-all ${
            isDark
              ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-xs'
          }`}
        >
          <Plus className="w-3 h-3 text-emerald-400" /> /add
        </button>
        <button
          onClick={() => handleSendMessage('/top3')}
          className={`px-3 py-1 rounded-full text-xs whitespace-nowrap flex items-center gap-1 border transition-all ${
            isDark
              ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-xs'
          }`}
        >
          <Flame className="w-3 h-3 text-rose-400" /> /top3
        </button>
      </div>

      {/* Input Bar */}
      <div className={`p-3 sm:p-3.5 flex items-center space-x-2.5 border-t transition-colors ${
        isDark ? 'bg-[#17212b] border-[#202b36]' : 'bg-white border-slate-200'
      }`}>
        <input
          type="text"
          placeholder={
            isWaitingForChannelInput
              ? "Введите username канала (например: @durov)..."
              : "Напишите команду (/news, /voice, /speed, /add @канал)..."
          }
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          className={`flex-1 rounded-2xl px-4 py-2.5 text-xs sm:text-sm focus:outline-none transition-colors border ${
            isDark
              ? 'bg-[#242f3d] border-[#314052] text-slate-100 placeholder:text-slate-500 focus:border-blue-400'
              : 'bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white'
          }`}
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={!inputVal.trim()}
          className={`p-2.5 rounded-2xl transition-all ${
            inputVal.trim()
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/25 active:scale-95'
              : isDark 
                ? 'bg-white/5 text-slate-600 border border-white/10 cursor-not-allowed'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
          }`}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
};
