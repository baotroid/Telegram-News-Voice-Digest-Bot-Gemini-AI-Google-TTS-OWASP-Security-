import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Header } from './components/Header';
import { LiveDigestStudio } from './components/LiveDigestStudio';
import { TelegramSimulator } from './components/TelegramSimulator';
import { CodeCenter } from './components/CodeCenter';
import { ArchitectureGuide } from './components/ArchitectureGuide';
import { ChannelManager } from './components/ChannelManagerModal';
import { BotIconModal } from './components/BotIconModal';
import { BOT_ICON_VARIANTS } from './data/botIcons';
import { TelegramChannel, ChannelPost, DigestResult } from './types';
import { INITIAL_CHANNELS, INITIAL_POSTS } from './data/sampleChannels';
import { generatePythonProjectFiles } from './data/pythonTemplates';
import { downloadProjectZip } from './utils/exportZip';
import { Radio, Bot, Code2, BookOpen, Volume2, Sparkles, Download, Check } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'digest' | 'simulator' | 'code' | 'guide' | 'channels'>('digest');
  const [channels, setChannels] = useState<TelegramChannel[]>(INITIAL_CHANNELS);
  const [posts, setPosts] = useState<ChannelPost[]>(INITIAL_POSTS);
  const [digestResult, setDigestResult] = useState<DigestResult | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isIconModalOpen, setIsIconModalOpen] = useState<boolean>(false);
  const [selectedIconId, setSelectedIconId] = useState<string>('variant-1');

  const selectedIcon = BOT_ICON_VARIANTS.find((v) => v.id === selectedIconId) || BOT_ICON_VARIANTS[0];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Quick generation from Header button
  const handleQuickGenerate = async () => {
    setActiveTab('digest');
    setIsGenerating(true);

    try {
      const activeChannels = channels.filter((c) => c.enabled);
      const activePosts = posts.filter((p) => {
        const channel = channels.find((c) => c.username === p.channelUsername);
        return channel ? channel.enabled : true;
      });

      const response = await fetch('/api/gemini/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts: activePosts.map((p) => ({
            channel: p.channelUsername,
            text: p.text,
            date: p.date,
          })),
          channels: activeChannels.map((c) => c.username),
          style: 'podcast',
          language: 'ru',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setDigestResult({
          id: `digest-${Date.now()}`,
          summary: data.summary,
          cleanSpeechText: data.cleanSpeechText || data.summary,
          style: 'podcast',
          language: 'ru',
          generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          postsCount: activePosts.length,
          channelNames: activeChannels.map((c) => c.username),
        });
        showToast('✨ Аудио-дайджест успешно сгенерирован с Gemini 3.7!');
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
      } else {
        throw new Error('Server error');
      }
    } catch (e) {
      // Fallback digest
      const fallback = `🎙️ Добрый день! В эфире ваш персональный ИИ-дайджест новостей из Telegram.
      
Главная новость: Павел Дуров сообщил, что аудитория Telegram превысила 950 миллионов активных пользователей. В приложении готовится запуск встроенного браузера с поддержкой Web3 страниц.

В мире искусственного интеллекта представлены новые возможности моделей Gemini с контекстным окном до двух миллионов токенов и мгновенной реакцией менее двухсот миллисекунд.

Среди IT-новостей: релиз Python 3.13 с возможностью запуска без GIL ускоряет многопоточные телеграм-боты почти в четыре раза.

Также обновилась библиотека синтеза речи Edge-TTS с ультра-реалистичными голосами.

На этом наш экспресс-выпуск завершен. Хорошего и продуктивного вам дня!`;

      setDigestResult({
        id: `digest-${Date.now()}`,
        summary: fallback,
        cleanSpeechText: fallback.replace(/[*_#]/g, ''),
        style: 'podcast',
        language: 'ru',
        generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        postsCount: posts.length,
        channelNames: channels.filter((c) => c.enabled).map((c) => c.username),
      });
      showToast('🎙️ Сгенерирован демонстрационный выпуск новостей!');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadZip = async () => {
    try {
      const files = generatePythonProjectFiles({
        telegramApiId: '',
        telegramApiHash: '',
        botToken: '',
        geminiApiKey: '',
        channels: channels.filter((c) => c.enabled).map((c) => c.username),
        digestTime: '09:00',
        defaultStyle: 'podcast',
        ttsEngine: 'gtts',
        edgeVoice: 'gtts-ru',
      });
      await downloadProjectZip(files, 'telegram-gemini-news-bot.zip', selectedIcon?.src);
      showToast('📦 Архив с Python-проектом и аватаркой бота успешно скачан!');
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.7 } });
    } catch (err) {
      console.error(err);
    }
  };

  // Initial welcome digest generator on first load if empty
  useEffect(() => {
    if (!digestResult) {
      const initialSummary = `🎙️ Добрый день! В эфире ваш персональный ИИ-дайджест новостей из Telegram.
      
Главная новость: Павел Дуров сообщил, что аудитория Telegram превысила 950 миллионов активных пользователей в месяц. В мессенджере ускоряются медиасерверы и готовится встроенный Web3-браузер.

В мире искусственного интеллекта представлены новые возможности моделей Gemini с контекстным окном до двух миллионов токенов и мгновенной реакцией менее двухсот миллисекунд.

Среди IT-новостей: релиз Python 3.13 с возможностью запуска без глобальной блокировки интерпретатора GIL ускоряет многопоточные телеграм-боты почти в четыре раза.

Также обновилась библиотека синтеза речи Edge-TTS с ультра-реалистичными голосами.

На этом наш экспресс-выпуск завершен. Хорошего и продуктивного вам дня!`;

      setDigestResult({
        id: 'digest-initial',
        summary: initialSummary,
        cleanSpeechText: initialSummary.replace(/[*_#]/g, ''),
        style: 'podcast',
        language: 'ru',
        generatedAt: '12:00',
        postsCount: 6,
        channelNames: ['durov', 'habr_pop', 'ai_revolution', 'tech_insider_ru'],
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white relative overflow-x-hidden">
      
      {/* Frosted Glass Ambient Lighting Orbs */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/15 rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/15 rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="fixed top-1/4 right-1/4 w-[35%] h-[35%] bg-cyan-400/10 rounded-full blur-[110px] pointer-events-none z-0" />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-white/10 backdrop-blur-2xl border border-white/20 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <Sparkles className="w-4 h-4 text-blue-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onQuickGenerate={handleQuickGenerate}
        onDownloadZip={handleDownloadZip}
        onOpenIconModal={() => setIsIconModalOpen(true)}
        selectedIconSrc={selectedIcon?.src}
        isGenerating={isGenerating}
      />

      {/* Bot Icon Selection Modal */}
      <BotIconModal
        isOpen={isIconModalOpen}
        onClose={() => setIsIconModalOpen(false)}
        selectedIconId={selectedIconId}
        onSelectIcon={(id) => {
          setSelectedIconId(id);
          showToast('🖼️ Выбрана новая аватарка для бота!');
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 relative z-10">
        {activeTab === 'digest' && (
          <LiveDigestStudio
            channels={channels}
            setChannels={setChannels}
            posts={posts}
            setPosts={setPosts}
            digestResult={digestResult}
            setDigestResult={setDigestResult}
            onOpenSimulator={() => setActiveTab('simulator')}
          />
        )}

        {activeTab === 'simulator' && (
          <div className="space-y-4">
            <div className="text-center max-w-xl mx-auto space-y-1 mb-2">
              <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                <Bot className="w-5 h-5 text-blue-400" />
                <span>Интерактивный симулятор Telegram-бота</span>
              </h2>
              <p className="text-xs text-slate-400">
                Протестируйте реальное взаимодействие с ботом: отправьте <code>/news</code> и прослушайте голосовое сообщение прямо в чате!
              </p>
            </div>

            <TelegramSimulator
              channels={channels}
              posts={posts}
              digestResult={digestResult}
              onGenerateDigest={handleQuickGenerate}
            />
          </div>
        )}

        {activeTab === 'code' && (
          <CodeCenter
            initialChannels={channels.filter((c) => c.enabled).map((c) => c.username)}
            avatarSrc={selectedIcon?.src}
          />
        )}

        {activeTab === 'guide' && <ArchitectureGuide />}

        {activeTab === 'channels' && (
          <ChannelManager channels={channels} setChannels={setChannels} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-white/[0.02] backdrop-blur-2xl py-6 text-xs text-slate-400 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-slate-200">
              Telegram News Voice Digest & Bot Studio
            </span>
            <span className="text-slate-500">• Powered by Google Gemini 3.7 & Edge-TTS</span>
          </div>

          <div className="flex items-center space-x-4 text-slate-400">
            <button onClick={() => setActiveTab('guide')} className="hover:text-blue-300 transition-colors">
              Архитектура
            </button>
            <button onClick={() => setActiveTab('code')} className="hover:text-blue-300 transition-colors">
              Python-код
            </button>
            <button onClick={handleDownloadZip} className="hover:text-emerald-300 transition-colors flex items-center gap-1">
              <Download className="w-3 h-3" /> Скачать ZIP
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}
