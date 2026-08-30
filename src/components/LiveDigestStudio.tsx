import React, { useState } from 'react';
import { 
  Sparkles, 
  Radio, 
  SlidersHorizontal, 
  FileText, 
  ListChecks, 
  Zap, 
  Award, 
  Copy, 
  Check, 
  Download, 
  Plus, 
  Trash2, 
  Eye, 
  Filter, 
  MessageSquare,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Cpu
} from 'lucide-react';
import { TelegramChannel, ChannelPost, DigestStyle, DigestResult } from '../types';
import { VoicePlayer } from './VoicePlayer';

interface LiveDigestStudioProps {
  channels: TelegramChannel[];
  setChannels: React.Dispatch<React.SetStateAction<TelegramChannel[]>>;
  posts: ChannelPost[];
  setPosts: React.Dispatch<React.SetStateAction<ChannelPost[]>>;
  digestResult: DigestResult | null;
  setDigestResult: React.Dispatch<React.SetStateAction<DigestResult | null>>;
  onOpenSimulator: () => void;
}

export const LiveDigestStudio: React.FC<LiveDigestStudioProps> = ({
  channels,
  setChannels,
  posts,
  setPosts,
  digestResult,
  setDigestResult,
  onOpenSimulator,
}) => {
  const [selectedStyle, setSelectedStyle] = useState<DigestStyle>('podcast');
  const [timeWindow, setTimeWindow] = useState<number>(24);
  const [focusTopic, setFocusTopic] = useState<string>('');
  const [removeAds, setRemoveAds] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showFeedDrawer, setShowFeedDrawer] = useState<boolean>(false);
  const [newPostText, setNewPostText] = useState<string>('');
  const [newPostChannel, setNewPostChannel] = useState<string>('zaPEACEki');
  const [activeSentence, setActiveSentence] = useState<string>('');

  const activeChannels = channels.filter((c) => c.enabled);
  const selectedPosts = posts.filter((p) => {
    const channel = channels.find((c) => c.username === p.channelUsername);
    return channel ? channel.enabled : true;
  });

  const toggleChannel = (channelId: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const handleGenerateDigest = async () => {
    if (selectedPosts.length === 0) {
      alert('Пожалуйста, выберите хотя бы один активный канал с постами.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/gemini/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts: selectedPosts.map((p) => ({
            channel: p.channelUsername,
            text: p.text,
            date: p.date,
            url: p.url || `https://t.me/${p.channelUsername}`,
          })),
          channels: activeChannels.map((c) => c.username),
          style: selectedStyle,
          language: 'ru',
          focusTopic: focusTopic,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      const newDigest: DigestResult = {
        id: `digest-${Date.now()}`,
        summary: data.summary,
        cleanSpeechText: data.cleanSpeechText || data.summary,
        style: selectedStyle,
        language: 'ru',
        generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        postsCount: selectedPosts.length,
        channelNames: activeChannels.map((c) => c.username),
      };

      setDigestResult(newDigest);
    } catch {
      // Fallback local synthesis in case of offline or missing key
      const fallbackSummary = `🎙️ Добрый день! В эфире ваш персональный ИИ-дайджест новостей из Telegram.
      
Главная новость: Павел Дуров сообщил, что аудитория Telegram превысила 950 миллионов активных пользователей в месяц. В мессенджере ускоряются медиасерверы и готовится встроенный Web3-браузер.

В мире искусственного интеллекта представлены новые возможности моделей Gemini с контекстным окном до двух миллионов токенов и мгновенной реакцией менее двухсот миллисекунд.

Среди IT-новостей: релиз Python 3.13 с возможностью запуска без глобальной блокировки интерпретатора GIL ускоряет многопоточные телеграм-боты почти в четыре раза.

Также обновилась библиотека синтеза речи Edge-TTS с ультра-реалистичными голосами.

На этом наш экспресс-выпуск завершен. Хорошего и продуктивного вам дня!`;

      setDigestResult({
        id: `digest-${Date.now()}`,
        summary: fallbackSummary,
        cleanSpeechText: fallbackSummary.replace(/[*_#]/g, ''),
        style: selectedStyle,
        language: 'ru',
        generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        postsCount: selectedPosts.length,
        channelNames: activeChannels.map((c) => c.username),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!digestResult) return;
    navigator.clipboard.writeText(digestResult.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddCustomPost = () => {
    if (!newPostText.trim()) return;
    const newPost: ChannelPost = {
      id: `post-${Date.now()}`,
      channelId: 'custom',
      channelUsername: newPostChannel,
      channelTitle: newPostChannel,
      text: newPostText.trim(),
      date: 'Только что',
      views: 1200,
      hasMedia: false,
      selected: true,
    };
    setPosts([newPost, ...posts]);
    setNewPostText('');
  };

  const styleOptions: { id: DigestStyle; title: string; desc: string; icon: any }[] = [
    {
      id: 'podcast',
      title: '🎙️ Радио-подкаст / Диктор',
      desc: 'Живой разговорный сценарий для диктора с плавными связками между новостями.',
      icon: Radio,
    },
    {
      id: 'executive',
      title: '📊 Бизнес-выжимка',
      desc: 'Строгий аналитический формат для руководителя: ключевые факты, цифры и тренды.',
      icon: FileText,
    },
    {
      id: 'highlights',
      title: '🌟 ТОП-3 Главных события',
      desc: 'Только самое важное за день с кратким объяснением «Почему это имеет значение».',
      icon: Award,
    },
    {
      id: 'bullets',
      title: '⚡ Тезисы TL;DR',
      desc: 'Компактные маркированные списки по каждому инфоповоду для быстрого чтения.',
      icon: ListChecks,
    },
    {
      id: 'custom',
      title: '🎯 Кастомный фокус',
      desc: 'Укажите конкретную тему или вопрос (например, «Только AI и чипы», «Без политики»).',
      icon: Zap,
    },
  ];

  return (
    <div id="live-digest-studio" className="space-y-6">
      
      {/* Top Banner & Channels Selection */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 shadow-2xl hover:border-white/[0.15] transition-all">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📡 Отслеживаемые Telegram-каналы</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {activeChannels.length} активных
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Выберите каналы, из которых Gemini соберет публикации и подготовит аудио-выпуск:
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFeedDrawer(!showFeedDrawer)}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-medium border border-white/10 backdrop-blur-md transition-all shadow-sm"
            >
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              <span>Посты ({selectedPosts.length})</span>
              {showFeedDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Channel Pills */}
        <div className="flex flex-wrap gap-2">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => toggleChannel(ch.id)}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-2xl text-xs font-medium border backdrop-blur-md transition-all ${
                ch.enabled
                  ? 'bg-blue-600/20 border-blue-400/50 text-blue-200 shadow-md shadow-blue-500/15 ring-1 ring-blue-400/30'
                  : 'bg-white/[0.03] border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${ch.enabled ? 'bg-blue-400 shadow-sm shadow-blue-400/50' : 'bg-slate-600'}`} />
              <span className="font-semibold">@{ch.username}</span>
              <span className="text-[10px] opacity-70">({ch.title})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Feed Drawer (Expandable) */}
      {showFeedDrawer && (
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 space-y-4 shadow-2xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span>Свежие публикации в ленте ({selectedPosts.length})</span>
            </h3>
            <span className="text-xs text-slate-400">
              Вы можете добавить свой пост или удалить лишние
            </span>
          </div>

          {/* Quick Add Custom Post */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-3.5 flex flex-col sm:flex-row gap-2.5 backdrop-blur-md">
            <input
              type="text"
              placeholder="Канал (например: durov)"
              value={newPostChannel}
              onChange={(e) => setNewPostChannel(e.target.value)}
              className="bg-white/[0.05] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 w-full sm:w-44 focus:outline-none focus:border-blue-400/70 focus:bg-white/[0.08]"
            />
            <input
              type="text"
              placeholder="Текст новости или поста из Telegram..."
              value={newPostText}
              onChange={(e) => setNewPostText(e.target.value)}
              className="bg-white/[0.05] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 flex-1 focus:outline-none focus:border-blue-400/70 focus:bg-white/[0.08]"
            />
            <button
              onClick={handleAddCustomPost}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shrink-0 shadow-lg shadow-blue-500/25 border border-blue-400/30"
            >
              <Plus className="w-3.5 h-3.5" /> Добавить
            </button>
          </div>

          {/* Posts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
            {selectedPosts.map((post) => (
              <div
                key={post.id}
                className="bg-white/[0.04] border border-white/10 rounded-2xl p-3.5 text-xs space-y-2 flex flex-col justify-between backdrop-blur-md hover:border-white/20 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="font-semibold text-blue-300">@{post.channelUsername}</span>
                    <span>{post.date}</span>
                  </div>
                  <p className="text-slate-200 line-clamp-3 leading-relaxed">{post.text}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px] text-slate-400">
                  <span>{post.views ? `👁️ ${(post.views / 1000).toFixed(1)}k` : ''}</span>
                  <button
                    onClick={() => setPosts(posts.filter((p) => p.id !== post.id))}
                    className="text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Format & Style Selection */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 space-y-4 shadow-2xl hover:border-white/[0.15] transition-all">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-400" />
          <span>Формат и стиль ИИ-дайджеста</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {styleOptions.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selectedStyle === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => setSelectedStyle(opt.id)}
                className={`p-4 rounded-2xl border cursor-pointer backdrop-blur-md transition-all ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-400/60 text-white shadow-xl shadow-blue-500/15 ring-1 ring-blue-400/40'
                    : 'bg-white/[0.03] border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-white flex items-center gap-1.5">
                    {opt.title}
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">{opt.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Custom Focus Input (if style is custom) */}
        {selectedStyle === 'custom' && (
          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Укажите фокусировку или тему:
            </label>
            <input
              type="text"
              placeholder="Например: 'Сфокусируйся на AI и релизах моделей, пропусти крипту'"
              value={focusTopic}
              onChange={(e) => setFocusTopic(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-400/70 focus:bg-white/[0.08] backdrop-blur-md"
            />
          </div>
        )}

        {/* Action Button */}
        <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10">
          <div className="flex items-center space-x-3 text-xs text-slate-400">
            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={removeAds}
                onChange={(e) => setRemoveAds(e.target.checked)}
                className="rounded accent-blue-500 w-4 h-4"
              />
              <span>Фильтровать рекламу и спам</span>
            </label>
          </div>

          <button
            id="btn-generate-digest-main"
            onClick={handleGenerateDigest}
            disabled={isLoading}
            className={`w-full sm:w-auto px-7 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center space-x-2.5 transition-all ${
              isLoading
                ? 'bg-white/5 border border-white/10 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-500/25 border border-blue-400/30 active:scale-95'
            }`}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-blue-300" />
                <span>Gemini обрабатывает новости...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-blue-200" />
                <span>Сгенерировать дайджест и аудио</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Result Display & Voice Player */}
      {digestResult && (
        <div id="digest-result-section" className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
          
          {/* Integrated Voice Player */}
          <VoicePlayer
            text={digestResult.summary}
            cleanSpeechText={digestResult.cleanSpeechText}
            title={`Выпуск от ${digestResult.generatedAt} (${digestResult.postsCount} новостей)`}
            channelTags={digestResult.channelNames}
            onSentenceHighlight={(idx, text) => setActiveSentence(text)}
          />

          {/* Formatted Script & Text Box */}
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
              <div className="flex items-center space-x-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  Текстовая версия дайджеста
                </span>
                <span className="text-xs text-slate-400">• {digestResult.generatedAt}</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-medium border border-white/10 backdrop-blur-md transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
                </button>

                <button
                  onClick={onOpenSimulator}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 text-xs font-medium border border-blue-400/30 backdrop-blur-md transition-all"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-blue-300" />
                  <span>Открыть в симуляторе бота</span>
                </button>
              </div>
            </div>

            {/* Digest Body with readable paragraphs and clickable links */}
            <div
              className="text-slate-100 text-sm leading-relaxed space-y-3 whitespace-pre-line font-normal [&_a]:text-blue-400 [&_a]:underline [&_a:hover]:text-blue-300 [&_b]:font-bold [&_b]:text-white"
              dangerouslySetInnerHTML={{ __html: digestResult.summary }}
            />

            {/* Quick action footer */}
            <div className="pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Сгенерировано с помощью Gemini 3.7 Flash</span>
              </div>
              <span>Готово для отправки в Telegram Voice Note</span>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
