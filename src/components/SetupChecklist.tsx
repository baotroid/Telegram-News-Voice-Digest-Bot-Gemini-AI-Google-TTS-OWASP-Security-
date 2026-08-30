import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  ExternalLink, 
  KeyRound, 
  Bot, 
  Sparkles, 
  ShieldCheck, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check,
  Lock,
  Eye,
  EyeOff,
  Download
} from 'lucide-react';
import { PythonProjectConfig } from '../types';

interface SetupChecklistProps {
  config: PythonProjectConfig;
  onChangeConfig: (newConfig: PythonProjectConfig) => void;
  onDownloadZip: () => void;
  isZipping?: boolean;
}

export const SetupChecklist: React.FC<SetupChecklistProps> = ({
  config,
  onChangeConfig,
  onDownloadZip,
  isZipping = false,
}) => {
  const [expandedStep, setExpandedStep] = useState<number | null>(1);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Status checks
  const isBotTokenValid = Boolean(config.botToken && config.botToken.trim().length > 15 && config.botToken.includes(':'));
  const isApiIdValid = Boolean(config.telegramApiId && /^\d+$/.test(config.telegramApiId.trim()));
  const isApiHashValid = Boolean(config.telegramApiHash && config.telegramApiHash.trim().length >= 16);
  const isGeminiValid = Boolean(config.geminiApiKey && config.geminiApiKey.trim().length > 10);

  const completedCount = [
    isBotTokenValid,
    isApiIdValid && isApiHashValid,
    isGeminiValid,
  ].filter(Boolean).length;

  const totalSteps = 3;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  const toggleShow = (field: string) => {
    setShowTokens((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleCopyValue = (val: string, keyName: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div id="setup-checklist-card" className="bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl transition-all">
      
      {/* Header & Progress Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Чек-лист подготовки Telegram API и ключей перед запуском</span>
              </h3>
              <p className="text-xs text-slate-400">
                Заполните данные здесь — они автоматически подставятся в <code>.env</code> и <code>config.py</code> перед скачиванием архива.
              </p>
            </div>
          </div>
        </div>

        {/* Progress pill */}
        <div className="flex items-center space-x-3 bg-white/[0.03] border border-white/10 px-3.5 py-1.5 rounded-2xl shrink-0 self-start sm:self-auto">
          <div className="text-right">
            <div className="text-[11px] font-bold text-slate-200">
              {completedCount} из {totalSteps} готово
            </div>
            <div className="text-[10px] text-slate-400">
              {completedCount === totalSteps ? '🎉 Все ключи готовы!' : 'Остались шаги'}
            </div>
          </div>
          <div className="w-12 h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                completedCount === totalSteps ? 'bg-emerald-400' : 'bg-blue-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-3">
        
        {/* Step 1: Telegram Bot Token from @BotFather */}
        <div 
          className={`rounded-2xl border transition-all overflow-hidden ${
            isBotTokenValid 
              ? 'bg-emerald-950/15 border-emerald-500/30' 
              : 'bg-white/[0.02] border-white/10 hover:border-white/20'
          }`}
        >
          <div 
            onClick={() => setExpandedStep(expandedStep === 1 ? null : 1)}
            className="p-4 flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center space-x-3">
              {isBotTokenValid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-slate-500 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                  1
                </div>
              )}
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Шаг 1: Telegram Bot Token (от @BotFather)</span>
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-normal">
                    Обязательно
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {isBotTokenValid 
                    ? `Токен добавлен: ${config.botToken.slice(0, 8)}...${config.botToken.slice(-4)}` 
                    : 'Нужен для управления ботом, отправки голосовых и текстовых сообщений.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-2.5 py-1 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-[11px] font-semibold border border-blue-400/30 flex items-center gap-1 transition-all"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Открыть @BotFather</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button className="text-slate-400 hover:text-white p-1">
                {expandedStep === 1 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {expandedStep === 1 && (
            <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3 bg-black/20 text-xs">
              <div className="bg-blue-950/20 border border-blue-500/20 rounded-xl p-3 text-slate-300 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-blue-200">📖 Инструкция получения токена:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px]">
                  <li>Откройте чат с <b>@BotFather</b> в Telegram.</li>
                  <li>Отправьте команду <code>/newbot</code>.</li>
                  <li>Введите название бота (например: <i>My News AI Voice</i>) и юзернейм (например: <i>my_news_voice_bot</i>).</li>
                  <li>Скопируйте полученный <b>HTTP API Token</b> и вставьте в поле ниже:</li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold text-[11px]">
                  BOT_TOKEN:
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showTokens['botToken'] ? 'text' : 'password'}
                    placeholder="Например: 7123456789:AAHAbcdefghijk..."
                    value={config.botToken}
                    onChange={(e) => onChangeConfig({ ...config, botToken: e.target.value })}
                    className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-3.5 py-2.5 text-slate-100 text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-blue-400 focus:bg-white/[0.09] pr-20"
                  />
                  <div className="absolute right-2 flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => toggleShow('botToken')}
                      className="p-1 text-slate-400 hover:text-slate-200"
                      title={showTokens['botToken'] ? 'Скрыть' : 'Показать'}
                    >
                      {showTokens['botToken'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    {config.botToken && (
                      <button
                        type="button"
                        onClick={() => handleCopyValue(config.botToken, 'botToken')}
                        className="p-1 text-slate-400 hover:text-slate-200"
                        title="Скопировать"
                      >
                        {copiedKey === 'botToken' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Telegram User API ID & API Hash from my.telegram.org */}
        <div 
          className={`rounded-2xl border transition-all overflow-hidden ${
            isApiIdValid && isApiHashValid 
              ? 'bg-emerald-950/15 border-emerald-500/30' 
              : 'bg-white/[0.02] border-white/10 hover:border-white/20'
          }`}
        >
          <div 
            onClick={() => setExpandedStep(expandedStep === 2 ? null : 2)}
            className="p-4 flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center space-x-3">
              {isApiIdValid && isApiHashValid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-slate-500 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                  2
                </div>
              )}
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Шаг 2: Telegram API ID и API Hash (от my.telegram.org)</span>
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-normal">
                    Для чтения каналов
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {isApiIdValid && isApiHashValid
                    ? `API_ID: ${config.telegramApiId} | API_HASH: ${config.telegramApiHash.slice(0, 6)}...`
                    : 'Нужно библиотеке Telethon, чтобы читать посты из Telegram-каналов без прав админа.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <a
                href="https://my.telegram.org"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-2.5 py-1 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-[11px] font-semibold border border-indigo-400/30 flex items-center gap-1 transition-all"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>my.telegram.org</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button className="text-slate-400 hover:text-white p-1">
                {expandedStep === 2 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {expandedStep === 2 && (
            <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3 bg-black/20 text-xs">
              <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-3 text-slate-300 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-indigo-200">📖 Как получить API ID и Hash за 2 минуты:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px]">
                  <li>Перейдите на официальный портал <b><a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="underline text-indigo-300 hover:text-indigo-200">my.telegram.org</a></b>.</li>
                  <li>Авторизуйтесь по вашему номеру телефона (код подтверждения придет прямо в Telegram).</li>
                  <li>Нажмите на раздел <b>API development tools</b>.</li>
                  <li>Заполните поля <i>App title</i> и <i>Short name</i> (любые названия, например <i>NewsReader</i>).</li>
                  <li>Скопируйте <code>api_id</code> (число) и <code>api_hash</code> (32-значная строка) в поля ниже:</li>
                </ol>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-semibold text-[11px]">
                    TELEGRAM_API_ID (только цифры):
                  </label>
                  <input
                    type="text"
                    placeholder="Например: 12345678"
                    value={config.telegramApiId}
                    onChange={(e) => onChangeConfig({ ...config, telegramApiId: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-3.5 py-2.5 text-slate-100 text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:bg-white/[0.09]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-semibold text-[11px]">
                    TELEGRAM_API_HASH (32 символа):
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showTokens['apiHash'] ? 'text' : 'password'}
                      placeholder="Например: abcdef0123456789abcdef..."
                      value={config.telegramApiHash}
                      onChange={(e) => onChangeConfig({ ...config, telegramApiHash: e.target.value.trim() })}
                      className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-3.5 py-2.5 text-slate-100 text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:bg-white/[0.09] pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShow('apiHash')}
                      className="absolute right-3 text-slate-400 hover:text-slate-200"
                    >
                      {showTokens['apiHash'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Google Gemini API Key from Google AI Studio */}
        <div 
          className={`rounded-2xl border transition-all overflow-hidden ${
            isGeminiValid 
              ? 'bg-emerald-950/15 border-emerald-500/30' 
              : 'bg-white/[0.02] border-white/10 hover:border-white/20'
          }`}
        >
          <div 
            onClick={() => setExpandedStep(expandedStep === 3 ? null : 3)}
            className="p-4 flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center space-x-3">
              {isGeminiValid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-slate-500 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                  3
                </div>
              )}
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Шаг 3: Google Gemini API Key (от AI Studio)</span>
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-normal">
                    ИИ-фильтрация
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {isGeminiValid 
                    ? `Ключ добавлен: ${config.geminiApiKey.slice(0, 8)}...` 
                    : 'Необходим для суммаризации постов, удаления рекламного спама и генерации сценария.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <a
                href="https://aistudio.google.com"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-2.5 py-1 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-[11px] font-semibold border border-amber-400/30 flex items-center gap-1 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button className="text-slate-400 hover:text-white p-1">
                {expandedStep === 3 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {expandedStep === 3 && (
            <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3 bg-black/20 text-xs">
              <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-3 text-slate-300 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-amber-200">📖 Как получить бесплатный Gemini API Key:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px]">
                  <li>Откройте <b><a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="underline text-amber-300 hover:text-amber-200">Google AI Studio</a></b>.</li>
                  <li>Нажмите на кнопку <b>Get API key</b> в левом меню.</li>
                  <li>Создайте новый ключ (Create API key in new project).</li>
                  <li>Вставьте полученный ключ (начинается на <code>AIzaSy...</code>) в поле ниже:</li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold text-[11px]">
                  GEMINI_API_KEY:
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showTokens['gemini'] ? 'text' : 'password'}
                    placeholder="Например: AIzaSyD..."
                    value={config.geminiApiKey}
                    onChange={(e) => onChangeConfig({ ...config, geminiApiKey: e.target.value.trim() })}
                    className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-3.5 py-2.5 text-slate-100 text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:bg-white/[0.09] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow('gemini')}
                    className="absolute right-3 text-slate-400 hover:text-slate-200"
                  >
                    {showTokens['gemini'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Summary Footer with Download Button */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="text-slate-400 text-[11px]">
          {completedCount === totalSteps ? (
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Все 3 параметра заполнены. Скачанный архив сразу готов к запуску!
            </span>
          ) : (
            <span>
              💡 <i>Вы также можете скачать архив прямо сейчас и вписать ключи позже в созданный файл <code>.env</code>.</i>
            </span>
          )}
        </div>

        <button
          id="btn-download-from-checklist"
          onClick={onDownloadZip}
          disabled={isZipping}
          className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center space-x-2 shrink-0 ${
            completedCount === totalSteps
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25 border border-emerald-400/30'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25 border border-blue-400/30'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>{isZipping ? 'Упаковка ZIP...' : 'Скачать готовый проект (.ZIP)'}</span>
        </button>
      </div>

    </div>
  );
};
