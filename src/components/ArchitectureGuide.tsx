import React, { useState } from 'react';
import { 
  BookOpen, 
  ArrowRight, 
  Key, 
  Bot, 
  Sparkles, 
  Volume2, 
  Server, 
  Smartphone, 
  HelpCircle, 
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Cpu,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export const ArchitectureGuide: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const steps = [
    {
      step: 1,
      title: 'Получение Telegram API ID & Hash',
      badge: 'Telethon Userbot',
      desc: 'Зачем это нужно: обычный Bot API Telegram не может читать посты из произвольных каналов, если бот не добавлен администратором. Библиотека Telethon подключается от лица вашего аккаунта (в режиме чтения) и может читать любые публичные или закрытые каналы, на которые вы подписаны.',
      instructions: [
        'Перейдите на официальный сайт https://my.telegram.org и авторизуйтесь по номеру телефона.',
        'Откройте раздел «API development tools».',
        'Создайте новое приложение (App title и Short name можно указать любые, например `NewsDigestBot`).',
        'Скопируйте `api_id` (число) и `api_hash` (строка из 32 символов).',
      ],
      codeSnippet: `TELEGRAM_API_ID=12345678\nTELEGRAM_API_HASH="0123456789abcdef0123456789abcdef"`,
    },
    {
      step: 2,
      title: 'Создание Telegram-бота через @BotFather',
      badge: 'Aiogram 3 API',
      desc: 'Создаем бота, который будет принимать от вас команды (/news) и отправлять голосовые сообщения в чат.',
      instructions: [
        'Откройте Telegram и найдите официального бота @BotFather.',
        'Отправьте команду /newbot и следуйте подсказкам (задайте имя и юзернейм с окончанием _bot).',
        'Скопируйте полученный HTTP API Token (например: 712345678:AAH...).\nВставьте его в переменную `BOT_TOKEN` в файле `.env`.',
      ],
      codeSnippet: `BOT_TOKEN="712345678:AAHabcdefghij123456789"`,
    },
    {
      step: 3,
      title: 'Получение бесплатного ключа Gemini API',
      badge: 'Google AI Studio',
      desc: 'Gemini 3.7 / 2.5 Flash обеспечивает глубокий контекстный анализ постов, удаление рекламного спама и формирование живого дикторского сценария.',
      instructions: [
        'Перейдите на https://aistudio.google.com/app/apikey',
        'Войдите в аккаунт Google и нажмите кнопку «Create API Key».',
        'Скопируйте ключ и вставьте в `.env` в поле `GEMINI_API_KEY`.',
      ],
      codeSnippet: `GEMINI_API_KEY="AIzaSyA..."`,
    },
    {
      step: 4,
      title: 'Первый запуск и авторизация сессии',
      badge: 'Авторизация Telethon',
      desc: 'При первом запуске скрипта Telethon создаст зашифрованный файл пользовательской сессии `user_session.session`.',
      instructions: [
        'Установите зависимости: `pip install -r requirements.txt`',
        'Запустите бота: `python bot.py`',
        'В консоли введите ваш номер телефона и код подтверждения из Telegram.',
        'После успешного входа сессия сохранится, и повторный ввод номера больше не потребуется!',
      ],
      codeSnippet: `pip install -r requirements.txt\npython bot.py`,
    },
    {
      step: 5,
      title: 'Развертывание 24/7 (Render, Railway, VPS или Docker)',
      badge: 'Хостинг & Облако',
      desc: 'Бот может работать круглосуточно на Render.com, Railway, VPS (Ubuntu/Debian) или прямо в Docker контейнере.',
      instructions: [
        'Вариант 1 (Render.com / Railway): Создайте Web Service или Background Worker. В проект уже встроен легковесный HTTP health-сервер на $PORT для успешного прохождения Port Scan на Render!',
        'Вариант 2 (Docker Compose): `docker-compose up -d --build`',
        'Вариант 3 (Systemd служба на VPS): настройте автозапуск через systemctl',
        'Вариант 4 (Смартфон Android): можно запускать через Termux с Python 3.11!',
      ],
      codeSnippet: `# Запуск в фоне через Docker Compose:\ndocker-compose up -d --build\n\n# Запуск на Render/Railway (Start Command):\npython bot.py`,
    },
  ];

  const faqs = [
    {
      q: 'Что делать при ошибке «TelegramConflictError: Conflict: terminated by other getUpdates request»?',
      a: 'Telegram разрешает только одному процессу опрашивать бота по getUpdates. Эта ошибка означает, что бот запущен одновременно в двух местах (например: на локальном компьютере в терминале и на сервере Render/VPS, либо старый контейнер на Render еще не остановился). Остановите локальный запуск (`Ctrl+C`), и бот на сервере автоматически подключится без конфликта.',
    },
    {
      q: 'Почему Render писал «No open ports detected» и перезагружал контейнер?',
      a: 'Если на Render выбран тип «Web Service», платформа сканирует открытый порт ($PORT). Если бот не слушает HTTP-порт, Render считает сервис зависшим и присылает SIGTERM. В наш шаблон bot.py уже встроен легкий встроенный aiohttp HTTP health-check сервер, который автоматически открывает порт при наличии переменной $PORT, обеспечивая 100% стабильность на Render и Railway.',
    },
    {
      q: 'Как передать авторизованную сессию Telethon (user_session.session) на Render / VPS?',
      a: '1) Запустите бота один раз локально на компьютере (`python bot.py`) и пройдите ввод кода из Telegram. 2) Создастся файл `user_session.session`. 3) Загрузите этот файл на сервер (в git-репозиторий как секрет или в папку бота) — и бот на сервере запустится сразу без запроса кода из SMS!',
    },
    {
      q: 'Можно ли читать закрытые (приватные) Telegram-каналы?',
      a: 'Да! Поскольку Telethon использует клиентский Telegram API (MTProto), он имеет доступ ко всем каналам и чатам, в которых состоит ваш личный Telegram-аккаунт, включая приватные каналы по инвайт-ссылкам.',
    },
    {
      q: 'Какой движок озвучивания используется по умолчанию?',
      a: 'По умолчанию используется надежный Google TTS (gTTS), который работает стабильно без блокировок и сетевых сбоев, озвучивая текст на русском и английском языках. Файлы сохраняются в MP3 и воспроизводятся в Telegram как нативные голосовые сообщения.',
    },
    {
      q: 'Как слушать новости за рулем или в наушниках?',
      a: 'Вы можете настроить расписание (например, каждое утро в 08:30 через APScheduler) или просто нажать на голосовое сообщение в Telegram. Telegram поддерживает фоновое воспроизведение даже при заблокированном экране смартфона и управление с кнопок гарнитуры / Bluetooth в автомобиле!',
    },
    {
      q: 'Безопасно ли использовать Telethon?',
      a: 'Да, Telethon является официальным клиентом Telegram на протоколе MTProto. Для чтения новостей создаются стандартные безопасные запросы на чтение сообщений (read-only), что не нарушает лимиты платформы.',
    },
  ];

  return (
    <div id="architecture-guide-container" className="space-y-8">
      
      {/* Visual Flow Diagram */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl hover:border-white/[0.15] transition-all">
        <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-400" />
          <span>Архитектура работы системы: от Telegram до озвучки</span>
        </h2>
        <p className="text-xs text-slate-400 mb-6">
          Полная цепочка обработки: как посты превращаются в связный голосовой дайджест
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          
          {/* Node 1 */}
          <div className="bg-white/[0.04] border border-blue-400/30 rounded-2xl p-4 sm:p-5 space-y-2 relative backdrop-blur-md hover:border-blue-400/50 transition-all shadow-lg shadow-blue-500/5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-300 border border-blue-400/30 flex items-center justify-center font-bold text-sm">
              1
            </div>
            <h4 className="font-bold text-xs text-white">Каналы & Чтение</h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              <b>Telethon User Client</b> подключается к Telegram и забирает свежие посты за последние 24 часа.
            </p>
            <span className="inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-blue-600/20 text-blue-200 border border-blue-400/30">
              telethon / MTProto
            </span>
          </div>

          {/* Node 2 */}
          <div className="bg-white/[0.04] border border-indigo-400/30 rounded-2xl p-4 sm:p-5 space-y-2 relative backdrop-blur-md hover:border-indigo-400/50 transition-all shadow-lg shadow-indigo-500/5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-400/30 flex items-center justify-center font-bold text-sm">
              2
            </div>
            <h4 className="font-bold text-xs text-white">ИИ-Анализ & Сценарий</h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              <b>Google Gemini 3.7 Flash</b> фильтрует спам, объединяет темы и пишет разговорный сценарий для диктора.
            </p>
            <span className="inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-600/20 text-indigo-200 border border-indigo-400/30">
              google-genai SDK
            </span>
          </div>

          {/* Node 3 */}
          <div className="bg-white/[0.04] border border-purple-400/30 rounded-2xl p-4 sm:p-5 space-y-2 relative backdrop-blur-md hover:border-purple-400/50 transition-all shadow-lg shadow-purple-500/5">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-400/30 flex items-center justify-center font-bold text-sm">
              3
            </div>
            <h4 className="font-bold text-xs text-white">Озвучка (Google TTS)</h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              <b>Google TTS</b> синтезирует голос диктора и конвертирует в MP3 аудио для голосовых сообщений.
            </p>
            <span className="inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-purple-600/20 text-purple-200 border border-purple-400/30">
              gTTS / audio
            </span>
          </div>

          {/* Node 4 */}
          <div className="bg-white/[0.04] border border-emerald-400/30 rounded-2xl p-4 sm:p-5 space-y-2 relative backdrop-blur-md hover:border-emerald-400/50 transition-all shadow-lg shadow-emerald-500/5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-400/30 flex items-center justify-center font-bold text-sm">
              4
            </div>
            <h4 className="font-bold text-xs text-white">Доставка в чат</h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              <b>Aiogram 3 Bot</b> отправляет текстовую выжимку и голосовое сообщение с кнопками управления.
            </p>
            <span className="inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-600/20 text-emerald-200 border border-emerald-400/30">
              aiogram 3.x
            </span>
          </div>

        </div>
      </div>

      {/* Step-by-Step Walkthrough */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-400" />
          <span>Пошаговая инструкция по настройке и запуску</span>
        </h3>

        {/* Step Tabs Header */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
          {steps.map((s) => (
            <button
              key={s.step}
              onClick={() => setActiveStep(s.step)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-2xl text-xs font-semibold backdrop-blur-md transition-all ${
                activeStep === s.step
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40 ring-1 ring-blue-400/30'
                  : 'bg-white/[0.03] border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                activeStep === s.step ? 'bg-white text-blue-600 font-bold' : 'bg-white/10 text-slate-400'
              }`}>
                {s.step}
              </span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>

        {/* Active Step Content */}
        {(() => {
          const s = steps.find((item) => item.step === activeStep) || steps[0];
          return (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Шаг {s.step}: {s.title}</span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-400/30">
                    {s.badge}
                  </span>
                </h4>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-white/[0.03] p-4 rounded-2xl border border-white/10 backdrop-blur-md">
                {s.desc}
              </p>

              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-slate-200">Действия:</h5>
                <ul className="space-y-2 text-xs text-slate-300">
                  {s.instructions.map((inst, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{inst}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {s.codeSnippet && (
                <div className="mt-3.5">
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                    Пример конфигурации / Команда:
                  </span>
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 font-mono text-xs text-blue-300 backdrop-blur-md shadow-inner">
                    <pre className="whitespace-pre"><code>{s.codeSnippet}</code></pre>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* FAQ & Recommendations */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-amber-400" />
          <span>Частые вопросы и тонкости реализации (FAQ)</span>
        </h3>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 sm:p-5 transition-all backdrop-blur-md hover:border-white/20"
            >
              <button
                onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                className="w-full flex items-center justify-between text-left font-bold text-xs sm:text-sm text-slate-200 hover:text-white"
              >
                <span>{faq.q}</span>
                {expandedFaq === idx ? (
                  <ChevronUp className="w-4 h-4 text-blue-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {expandedFaq === idx && (
                <p className="text-xs text-slate-300 mt-3 pt-3 border-t border-white/10 leading-relaxed animate-in fade-in duration-150">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
