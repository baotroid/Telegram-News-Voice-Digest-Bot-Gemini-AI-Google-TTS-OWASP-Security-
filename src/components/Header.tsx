import React from 'react';
import { 
  Radio, 
  Bot, 
  Code2, 
  BookOpen, 
  Settings2, 
  Sparkles, 
  Download,
  Volume2,
  Cpu,
  Image as ImageIcon
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'digest' | 'simulator' | 'code' | 'guide' | 'channels';
  setActiveTab: (tab: 'digest' | 'simulator' | 'code' | 'guide' | 'channels') => void;
  onQuickGenerate: () => void;
  onDownloadZip: () => void;
  onOpenIconModal: () => void;
  selectedIconSrc?: string;
  isGenerating?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onQuickGenerate,
  onDownloadZip,
  onOpenIconModal,
  selectedIconSrc,
  isGenerating = false,
}) => {
  return (
    <header id="main-app-header" className="border-b border-white/10 backdrop-blur-2xl bg-[#020617]/75 text-white sticky top-0 z-40 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto w-full">
        <div className="h-20 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3.5 cursor-pointer" onClick={() => setActiveTab('digest')}>
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 via-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 border border-white/20 shrink-0 overflow-hidden">
              {selectedIconSrc ? (
                <img src={selectedIconSrc} alt="Bot Icon" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <Radio className="w-5 h-5 text-white animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="font-semibold text-lg sm:text-xl tracking-tight text-white">
                  Gemini <span className="text-blue-400">Voice Digest</span>
                </h1>
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 bg-green-500/10 border border-green-500/20 rounded-full">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-[10px] font-medium text-green-400 uppercase tracking-widest">Bot Active</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                ИИ-дайджест Telegram-каналов & Python Bot Hub
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1.5 bg-white/5 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10">
            <button
              id="nav-tab-digest"
              onClick={() => setActiveTab('digest')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'digest'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>Дайджест</span>
            </button>

            <button
              id="nav-tab-simulator"
              onClick={() => setActiveTab('simulator')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'simulator'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>Симулятор</span>
            </button>

            <button
              id="nav-tab-code"
              onClick={() => setActiveTab('code')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'code'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span>Python-код</span>
            </button>

            <button
              id="nav-tab-guide"
              onClick={() => setActiveTab('guide')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'guide'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Гайд</span>
            </button>

            <button
              id="nav-tab-channels"
              onClick={() => setActiveTab('channels')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'channels'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span>Каналы</span>
            </button>
          </nav>

          {/* Quick Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              id="btn-bot-avatar"
              onClick={onOpenIconModal}
              title="Выбрать и скачать аватарку для @BotFather"
              className="flex items-center space-x-1.5 px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-amber-300 hover:text-amber-200 text-xs font-medium border border-amber-400/20 backdrop-blur-md transition-all shadow-sm"
            >
              <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Аватарка</span>
            </button>

            <button
              id="btn-quick-generate"
              onClick={onQuickGenerate}
              disabled={isGenerating}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all border ${
                isGenerating
                  ? 'bg-white/5 border-white/10 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 border-blue-400/30 active:scale-95'
              }`}
            >
              {isGenerating ? (
                <>
                  <Cpu className="w-3.5 h-3.5 animate-spin text-blue-300" />
                  <span className="hidden sm:inline">Gemini думает...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                  <span className="hidden sm:inline">Дайджест</span>
                </>
              )}
            </button>

            <button
              id="btn-download-bot-zip"
              onClick={onDownloadZip}
              title="Скачать исходный код Python-бота (ZIP)"
              className="flex items-center space-x-1.5 px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white text-xs font-medium border border-white/10 backdrop-blur-md transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden lg:inline">.ZIP</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden overflow-x-auto py-2.5 space-x-2 border-t border-white/10 no-scrollbar">
          <button
            onClick={() => setActiveTab('digest')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
              activeTab === 'digest' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'bg-white/5 border border-white/10 text-slate-300'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" /> Дайджест
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
              activeTab === 'simulator' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'bg-white/5 border border-white/10 text-slate-300'
            }`}
          >
            <Bot className="w-3.5 h-3.5" /> Бот
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
              activeTab === 'code' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'bg-white/5 border border-white/10 text-slate-300'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" /> Код
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
              activeTab === 'guide' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'bg-white/5 border border-white/10 text-slate-300'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" /> Гайд
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
              activeTab === 'channels' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'bg-white/5 border border-white/10 text-slate-300'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" /> Каналы
          </button>
          <button
            onClick={onOpenIconModal}
            className="px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-300"
          >
            <ImageIcon className="w-3.5 h-3.5" /> Аватарка
          </button>
        </div>
      </div>
    </header>
  );
};
