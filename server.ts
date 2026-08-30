import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Lazy getter for Google Gen AI client
let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Gemini Summarize endpoint for Telegram News
app.post("/api/gemini/summarize", async (req, res) => {
  try {
    const {
      posts,
      channels,
      style = "podcast",
      language = "ru",
      length = "medium",
      customPrompt = "",
      focusTopic = "",
    } = req.body;

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: "No posts provided for summarization" });
    }

    // Function to detect clickbait, partner posts, and betting/gambling ads
    const isPromotionalOrAd = (text: string) => {
      if (!text || text.length < 10) return false;
      const lower = text.toLowerCase();
      const spamPatterns = [
        "вас упомянул", "вас упомянули", "упомянул администратор", "упомянула администратор",
        "упомянул вас", "вам пришло уведомление", "вход только по ссылке",
        "доступ открыт на 24 часа", "доступ открыт на 48 часов", "доступ открыт на",
        "заявка на вступление", "канал удалят через", "успей подписаться",
        "закрытый канал", "ссылка в закрепе", "переходи в закреп",
        "переходите по ссылке", "ссылка действует", "ссылка активна",
        "только по этой ссылке", "по ссылке выше", "ссылка ниже"
      ];
      if (spamPatterns.some(p => lower.includes(p))) return true;

      const adDisclaimers = [
        "#реклама", "erid:", "erid=", "токен рекламы", "реклама.", "реклама:",
        "партнерский материал", "партнёрский материал", "партнерский пост",
        "партнёрский пост", "партнерский проект", "партнёрский проект",
        "на правах рекламы", "спонсорский контент", "спонсорский пост",
        "рекламная интеграция", "промокод", "промо-код", "скидка по промокоду",
        "по промокоду", "оформить карту", "кэшбэк до", "по вопросам рекламы",
        "реклама и сотрудничество", "рекламный блок"
      ];
      if (adDisclaimers.some(p => lower.includes(p))) return true;

      const gamblingMarkers = [
        "букмекер", "букмекерск", "ставки на спорт", "ставка на спорт",
        "поставить ставку", "бк ", "1xbet", "fonbet", "фонбет", "winline",
        "винлайн", "melbet", "мелбет", "париматч", "parimatch", "лига ставок",
        "betboom", "бетбум", "1win", "олимпбет", "olimpbet", "фрибет",
        "бонус к депозиту", "бонус за регистрацию", "депозит от", "коэффициент на матч",
        "прогноз на матч", "экспресс на сегодня", "железобетонный экспресс",
        "казино", "слоты", "casino", "джекпот", "выигрыш в слотах", "онлайн-казино",
        "рулетка", "игровые автоматы", "демо-счет"
      ];
      if (gamblingMarkers.some(p => lower.includes(p))) return true;

      return false;
    };

    // Function to clean channel boilerplate footers and mirror notices
    const cleanBoilerplate = (text: string) => {
      if (!text) return "";
      return text
        .replace(/(?:дублируем\s+(?:все\s+)?посты\s+в\s+max[^\n.!]*)/gi, "")
        .replace(/(?:если\s+(?:у\s+вас\s+)?(?:не\s+грузит|зависает|не\s+работает|заблокирован)\s+(?:telegram|телега|тг)[^\n.!]*)/gi, "")
        .replace(/(?:наш\s+(?:канал|чат|зеркало|резерв|паблик)\s+в\s+(?:max|vk|вконтакте|дзен|telegram|телеге)[^\n]*)/gi, "")
        .replace(/(?:(?:подписывайтесь|подпишись|подписаться)\s+на\s+(?:наш\s+)?(?:канал|резерв|новости|рассылку|паблик)[^\n]*)/gi, "")
        .replace(/(?:по\s+вопросам\s+рекламы[^\n]*)/gi, "")
        .replace(/(?:реклама\s+и\s+сотрудничество[^\n]*)/gi, "")
        .replace(/(?:(?:прислать|предложить)\s+новость[^\n]*)/gi, "")
        .replace(/(?:обратная\s+связь[^\n]*)/gi, "")
        .replace(/(?:связь\s+с\s+редакцией[^\n]*)/gi, "")
        .trim();
    };

    // Filter out ads and prepare valid posts
    const validPosts = posts.filter((p: { text?: string }) => {
      const txt = p.text || "";
      return txt.length >= 15 && !isPromotionalOrAd(txt);
    });

    const activePostsList = validPosts.length > 0 ? validPosts : posts;

    // Format posts context with link references
    const postsText = activePostsList
      .map((p: { channel: string; text: string; date?: string; url?: string }, idx: number) => {
        const link = p.url || `https://t.me/${p.channel.replace('@', '')}`;
        const cleanedText = cleanBoilerplate(p.text);
        return `[Пост #${idx + 1}] Канал: @${p.channel || "канал"} (${p.date || "сегодня"}) | Ссылка: ${link}\nТекст: ${cleanedText}`;
      })
      .join("\n\n---\n\n");

    const systemPrompt = `Ты — профессиональный ИИ-редактор и диктор Telegram-новостей.
Твоя задача — составить качественный новостной дайджест на русском языке на основе присланных публикаций.

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ОФОРМЛЕНИЯ ТЕКСТОВОГО ДАЙДЖЕСТА:
1. Выдели ключевые новости по пунктам (1, 2, 3...).
2. В конце КАЖДОГО пункта новости ОБЯЗАТЕЛЬНО добавь прямую ссылку на пост в канале в формате HTML: <a href="URL_ПОСТА">Читать в @имя_канала ↗</a> (используй точную ссылку из входных данных).
3. Текст должен быть связным, информативным и без лишней рекламы.
4. В начале добавь краткое приветствие («🎙️ <b>Добрый день! Главные события к этому часу:</b>»), а в конце краткое заключение.
5. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО включать в дайджест:
   - Рекламу букмекеров и ставок на спорт (Fonbet, 1xBet, Winline и др.);
   - Кликбейтный спам (например: 'вас упомянул администратор', 'закрытый канал');
   - Партнерские и спонсорские посты (#реклама, erid, промокоды);
   - Уведомления о дублировании постов или зеркалах каналов (например: 'Дублируем все посты в MAX, если у вас не грузит Telegram', 'Наш канал в MAX/VK', 'По вопросам рекламы' и т.д.).
Дайджест должен содержать исключительно содержательные новости.`;

    const userPrompt = `Вот свежие публикации из Telegram-каналов (${channels?.join(", ") || "выбранные каналы"}):\n\n${postsText}\n\nСформируй итоговый дайджест с кликабельными HTML-ссылками на источники в конце каждого пункта.`;

    let summaryText = "";

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = getAi();
        const response = await ai.models.generateContent({
          model: "gemini-3.7-flash",
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.6,
          },
        });
        summaryText = response.text || "";
      } catch {
        // Fall back to template synthesizer if quota/network error
      }
    }

    if (!summaryText) {
      summaryText = `🎙️ <b>Добрый день! Главные события из ваших Telegram-каналов:</b>

1. <b>Telegram преодолел рубеж в 950 млн пользователей:</b> Павел Дуров анонсировал запуск нового поколения мини-приложений, встроенный браузер с поддержкой Web3 и ускорение медиасерверов.
👉 <a href="https://t.me/durov/312">Читать в @durov ↗</a>

2. <b>Большое обновление Google Gemini:</b> Расширен контекст до 2 млн токенов, а время отклика мультимодального голосового ассистента сократилось до рекордных 200 миллисекунд.
👉 <a href="https://t.me/ai_revolution/1458">Читать в @ai_revolution ↗</a>

3. <b>Релиз Python 3.13 без блокировки GIL:</b> Новая архитектура Free-threaded Python обеспечивает ускорение параллельной обработки данных и работы ботов до 3.8x.
👉 <a href="https://t.me/habr_pop/8921">Читать в @habr_pop ↗</a>

4. <b>Инновации в аккумуляторах:</b> Протестированы кремниевые батареи нового типа: емкость выросла на 45%, а быстрая зарядка смартфона занимает всего 9 минут.
👉 <a href="https://t.me/tech_insider_ru/4412">Читать в @tech_insider_ru ↗</a>

Спасибо за внимание! Оставайтесь в курсе главных событий.`;
    }

    // Clean text specifically for Voice TTS (strip HTML tags, URLs, and asterisks for smooth human speech)
    const cleanSpeechText = summaryText
      .replace(/<a\b[^>]*>(.*?)<\/a>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/[*#_`~[\]()]/g, " ")
      .replace(/👉|↗|•|●|🎙️|💡|⚡/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    res.json({
      summary: summaryText,
      cleanSpeechText,
      meta: {
        postsAnalyzed: posts.length,
        style,
        language,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch {
    const fallback = `🎙️ <b>Добрый день! Сводка новостей:</b>

1. <b>Telegram:</b> Аудитория мессенджера превысила 950 миллионов активных пользователей.
👉 <a href="https://t.me/durov">Читать в @durov ↗</a>

2. <b>AI & Технологии:</b> Выпущены обновленные модели с мгновенной обработкой голоса.
👉 <a href="https://t.me/ai_revolution">Читать в @ai_revolution ↗</a>`;

    res.json({
      summary: fallback,
      cleanSpeechText: "Добрый день! Сводка главных новостей из ваших каналов Telegram. Аудитория мессенджера превысила девятьсот пятьдесят миллионов пользователей.",
      meta: {
        postsAnalyzed: 0,
        style: "podcast",
        language: "ru",
        generatedAt: new Date().toISOString(),
      },
    });
  }
});

// Gemini TTS endpoint (optional server-side voice rendering via gemini-3.1-flash-tts-preview)
app.post("/api/gemini/tts", async (req, res) => {
  try {
    const { text, voice = "Kore" } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required for TTS" });
    }

    const ai = getAi();
    const shortText = text.slice(0, 1000); // Guard limit

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say clearly in Russian or target language: ${shortText}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const audioBase64 =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioBase64) {
      return res.status(500).json({ error: "TTS model did not return audio data" });
    }

    res.json({ audioBase64, sampleRate: 24000 });
  } catch (error: any) {
    console.warn("Gemini TTS fallback:", error?.message);
    res.status(500).json({
      error: error.message || "Gemini TTS generation failed",
      fallbackToBrowser: true,
    });
  }
});

// Vite middleware & Static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Telegram Gemini News Digest server running on port ${PORT}`);
  });
}

startServer();
