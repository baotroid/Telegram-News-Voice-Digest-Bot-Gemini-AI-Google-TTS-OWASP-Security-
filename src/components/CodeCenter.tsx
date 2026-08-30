import React, { useState } from 'react';
import { 
  Code2, 
  Copy, 
  Check, 
  Download, 
  FolderTree, 
  FileCode, 
  Sliders, 
  Terminal, 
  Sparkles,
  ExternalLink,
  Shield,
  Layers
} from 'lucide-react';
import { PythonProjectConfig, PythonFile } from '../types';
import { generatePythonProjectFiles } from '../data/pythonTemplates';
import { downloadProjectZip } from '../utils/exportZip';
import { SetupChecklist } from './SetupChecklist';

interface CodeCenterProps {
  initialChannels: string[];
  avatarSrc?: string;
}

export const CodeCenter: React.FC<CodeCenterProps> = ({ initialChannels, avatarSrc }) => {
  const [config, setConfig] = useState<PythonProjectConfig>({
    telegramApiId: '',
    telegramApiHash: '',
    botToken: '',
    geminiApiKey: '',
    channels: initialChannels.length > 0 ? initialChannels : ['zaPEACEki'],
    digestTime: '09:00',
    defaultStyle: 'podcast',
    ttsEngine: 'gtts',
    edgeVoice: 'gtts-ru',
  });

  const [selectedFilePath, setSelectedFilePath] = useState<string>('bot.py');
  const [copied, setCopied] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  const files: PythonFile[] = generatePythonProjectFiles(config);
  const currentFile = files.find((f) => f.path === selectedFilePath) || files[0];

  const handleCopyCurrentFile = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      await downloadProjectZip(files, 'telegram-gemini-news-bot.zip', avatarSrc);
    } catch (e) {
      console.error('Zip error:', e);
    } finally {
      setIsZipping(false);
    }
  };

  const handleAddChannelTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      const val = e.currentTarget.value.trim().replace('@', '');
      if (!config.channels.includes(val)) {
        setConfig({ ...config, channels: [...config.channels, val] });
      }
      e.currentTarget.value = '';
    }
  };

  const removeChannelTag = (chToRemove: string) => {
    setConfig({
      ...config,
      channels: config.channels.filter((c) => c !== chToRemove),
    });
  };

  return (
    <div id="code-center-container" className="space-y-6">
      
      {/* Code Center Hero / Intro */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl hover:border-white/[0.15] transition-all">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Code2 className="w-5 h-5 text-blue-400" />
              <span>Генератор и кодовая база Python Telegram-бота</span>
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Aiogram 3 + Telethon + Gemini + Edge-TTS
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Готовый модульный проект на Python. Скрипт использует <b>Telethon</b> для чтения публичных и закрытых каналов без прав администратора, <b>Google Gemini API</b> для составления сценария и <b>Edge-TTS</b> для генерации реалистичного голоса.
          </p>
        </div>

        <button
          id="btn-download-full-project-zip"
          onClick={handleDownloadZip}
          disabled={isZipping}
          className="w-full md:w-auto px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xl shadow-emerald-500/25 border border-emerald-400/30 active:scale-95 flex items-center justify-center space-x-2 transition-all shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>{isZipping ? 'Упаковка ZIP...' : 'Скачать весь проект (.ZIP)'}</span>
        </button>
      </div>

      {/* Setup Checklist Component */}
      <SetupChecklist
        config={config}
        onChangeConfig={setConfig}
        onDownloadZip={handleDownloadZip}
        isZipping={isZipping}
      />

      {/* Interactive Configurator */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span>Интерактивная конфигурация кода (автоматически подставляется в файлы)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          
          {/* Target channels */}
          <div className="sm:col-span-2">
            <label className="block text-slate-300 font-semibold mb-1.5">
              Отслеживаемые каналы (без @, нажмите Enter для добавления):
            </label>
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-2.5 flex flex-wrap gap-1.5 items-center backdrop-blur-md">
              {config.channels.map((ch) => (
                <span
                  key={ch}
                  className="px-2.5 py-1 rounded-xl bg-blue-600/20 text-blue-200 border border-blue-400/30 text-xs flex items-center gap-1.5 font-mono"
                >
                  @{ch}
                  <button
                    onClick={() => removeChannelTag(ch)}
                    className="hover:text-rose-300 ml-0.5 font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="+ Добавить канал (Enter)..."
                onKeyDown={handleAddChannelTag}
                className="bg-transparent text-slate-100 placeholder:text-slate-500 text-xs px-2 py-1 focus:outline-none flex-1 min-w-[140px]"
              />
            </div>
          </div>

          {/* Voice selection */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Голос для озвучки (Google TTS):
            </label>
            <select
              value={config.edgeVoice}
              onChange={(e) => {
                const val = e.target.value;
                setConfig({ ...config, edgeVoice: val, ttsEngine: 'gtts' });
              }}
              className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-3.5 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-blue-400/70 focus:bg-white/[0.08] backdrop-blur-md"
            >
              <option value="gtts-ru" className="bg-slate-900 text-slate-100">👩 1. Русский — Женский голос (Google TTS, по умолчанию)</option>
              <option value="gtts-en" className="bg-slate-900 text-slate-100">👩 2. English — Female Voice (Google TTS)</option>
            </select>
          </div>

        </div>
      </div>

      {/* Code Workspace (File Explorer + Code Viewer) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        
        {/* Left: File Tree Explorer */}
        <div className="lg:col-span-4 bg-white/[0.02] border-b lg:border-b-0 lg:border-r border-white/10 p-4 space-y-1.5">
          <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-300">
              <FolderTree className="w-4 h-4 text-blue-400" /> Структура проекта
            </span>
            <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-slate-300">
              {files.length} файлов
            </span>
          </div>

          <div className="space-y-1">
            {files.map((file) => {
              const isSelected = file.path === selectedFilePath;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFilePath(file.path)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-mono flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/30 border border-blue-400/30'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <FileCode className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-blue-400'}`} />
                    <span className="truncate">{file.path}</span>
                  </div>
                  <span className="text-[10px] opacity-70 font-sans ml-2 shrink-0">
                    {file.language}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Code Viewer */}
        <div className="lg:col-span-8 flex flex-col bg-black/40 backdrop-blur-md">
          
          {/* File bar */}
          <div className="bg-white/[0.03] px-5 py-3 border-b border-white/10 flex items-center justify-between backdrop-blur-md">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-blue-300">
                {currentFile.path}
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                — {currentFile.description}
              </span>
            </div>

            <button
              onClick={handleCopyCurrentFile}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-medium border border-white/10 backdrop-blur-md transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
            </button>
          </div>

          {/* Code content box with syntax styling */}
          <div className="p-5 overflow-x-auto max-h-[500px] font-mono text-xs text-slate-200 leading-relaxed selection:bg-blue-600 selection:text-white">
            <pre className="whitespace-pre">
              <code>{currentFile.content}</code>
            </pre>
          </div>

        </div>

      </div>

      {/* Quick Run Instructions Banner */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs shadow-2xl">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-400/30 text-blue-300 flex items-center justify-center shrink-0 shadow-inner">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">Как запустить бота в 3 команды:</h4>
            <p className="text-slate-300 font-mono mt-1 text-xs">
              <code>pip install -r requirements.txt && python bot.py</code>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-slate-300">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Поддерживает Docker и 24/7 VPS</span>
        </div>
      </div>

    </div>
  );
};
