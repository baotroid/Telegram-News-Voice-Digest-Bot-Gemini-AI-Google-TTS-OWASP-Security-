import logging
import os
import re
import html
from typing import List, Dict, Any, Tuple
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

def is_promotional_or_ad(text: str) -> bool:
    """
    Detects if a post is an advertisement, clickbait spam ('вас упомянул администратор'),
    betting/gambling promo, partner post, casino/slots, or crypto scheme.
    """
    if not text or len(text.strip()) < 10:
        return False
    
    t_lower = text.lower()
    
    # 1. Clickbait mentions / fake admin notifications / channel lock spam
    spam_patterns = [
        "вас упомянул", "вас упомянули", "упомянул администратор", "упомянула администратор",
        "упомянул вас", "вам пришло уведомление", "вход только по ссылке",
        "доступ открыт на 24 часа", "доступ открыт на 48 часов", "доступ открыт на",
        "заявка на вступление", "канал удалят через", "успей подписаться",
        "закрытый канал", "ссылка в закрепе", "переходи в закреп",
        "переходите по ссылке", "ссылка действует", "ссылка активна",
        "только по этой ссылке", "по ссылке выше", "ссылка ниже"
    ]
    if any(p in t_lower for p in spam_patterns):
        return True
        
    # 2. Ads, Partner posts, Sponsorship disclaimers
    ad_disclaimers = [
        "#реклама", "erid:", "erid=", "токен рекламы", "реклама.", "реклама:",
        "партнерский материал", "партнёрский материал", "партнерский пост",
        "партнёрский пост", "партнерский проект", "партнёрский проект",
        "на правах рекламы", "спонсорский контент", "спонсорский пост",
        "рекламная интеграция", "промокод", "промо-код", "скидка по промокоду",
        "по промокоду", "оформить карту", "кэшбэк до", "по вопросам рекламы",
        "реклама и сотрудничество", "рекламный блок"
    ]
    if any(p in t_lower for p in ad_disclaimers):
        return True
        
    # 3. Bookmakers, Sports betting, Gambling & Casinos
    gambling_markers = [
        "букмекер", "букмекерск", "ставки на спорт", "ставка на спорт",
        "поставить ставку", "бк ", "1xbet", "fonbet", "фонбет", "winline",
        "винлайн", "melbet", "мелбет", "париматч", "parimatch", "лига ставок",
        "betboom", "бетбум", "1win", "олимпбет", "olimpbet", "фрибет",
        "бонус к депозиту", "бонус за регистрацию", "депозит от", "коэффициент на матч",
        "прогноз на матч", "экспресс на сегодня", "железобетонный экспресс",
        "казино", "слоты", "casino", "джекпот", "выигрыш в слотах", "онлайн-казино",
        "рулетка", "игровые автоматы", "демо-счет"
    ]
    if any(p in t_lower for p in gambling_markers):
        return True
        
    # 4. Crypto schemes, pump and dump, get-rich-quick scams
    scam_markers = [
        "криптосигналы", "сигналы на крипту", "памп монеты", "схема заработка",
        "доходность от %", "раскрутка депозита", "пассивный доход от", "инвестируй и получай"
    ]
    if any(p in t_lower for p in scam_markers):
        return True

    return False

def clean_boilerplate_and_signatures(text: str) -> str:
    """
    Cleans out channel boilerplate footers, mirror channel notices (e.g. 'Дублируем все посты в MAX...'),
    cross-promotions, social media mirror warnings, and generic marketing noise from Telegram posts.
    """
    if not text:
        return ""
    
    boilerplate_patterns = [
        r'(?i)дублируем\s+(?:все\s+)?посты\s+в\s+max[^\n\.\!]*',
        r'(?i)если\s+(?:у\s+вас\s+)?(?:не\s+грузит|зависает|не\s+работает|заблокирован)\s+(?:telegram|телега|тг)[^\n\.\!]*',
        r'(?i)наш\s+(?:канал|чат|зеркало|резерв|паблик)\s+в\s+(?:max|vk|вконтакте|дзен|telegram|телеге)[^\n]*',
        r'(?i)(?:подписывайтесь|подпишись|подписаться)\s+на\s+(?:наш\s+)?(?:канал|резерв|новости|рассылку|паблик)[^\n]*',
        r'(?i)по\s+вопросам\s+рекламы[^\n]*',
        r'(?i)реклама\s+и\s+сотрудничество[^\n]*',
        r'(?i)(?:прислать|предложить)\s+новость[^\n]*',
        r'(?i)обратная\s+связь[^\n]*',
        r'(?i)связь\s+с\s+редакцией[^\n]*',
        r'(?i)читать\s+далее\s+(?:в|на)[^\n]*',
        r'(?i)переходите\s+по\s+ссылке[^\n]*',
        r'(?i)(?:все\s+)?посты\s+дублируем[^\n]*',
        r'(?i)зеркало\s+канала[^\n]*',
        r'(?i)источник:\s*(?:https?:\/\/\S+|@\w+)',
    ]
    
    cleaned = text
    for pat in boilerplate_patterns:
        cleaned = re.sub(pat, '', cleaned)

    lines = cleaned.split('\n')
    filtered_lines = []
    for line in lines:
        l_str = line.strip()
        if not l_str:
            filtered_lines.append("")
            continue
        l_lower = l_str.lower()
        if any(term in l_lower for term in [
            "дублируем", "не грузит telegram", "не грузит телеграм", "зеркало в max",
            "канал в max", "посты в max", "erid:", "#реклама", "партнерский материал",
            "подпишись на", "подписывайтесь на", "по вопросам рекламы", "вас упомянул"
        ]):
            continue
        filtered_lines.append(line)

    cleaned = "\n".join(filtered_lines)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned

class GeminiDigestService:
    def __init__(self, api_key: str, proxy: str = ""):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        # Apply proxy if provided
        configured_proxy = proxy or os.getenv("HTTPS_PROXY", "") or os.getenv("HTTP_PROXY", "")
        if configured_proxy:
            os.environ["HTTPS_PROXY"] = configured_proxy
            os.environ["HTTP_PROXY"] = configured_proxy
            logger.info(f"Gemini service initialized with proxy: {configured_proxy}")

        self.client = None
        if self.api_key and not self.api_key.startswith("YOUR_"):
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning(f"Note on Gemini Client initialization: {e}")

    async def generate_digest(
        self,
        posts: List[Dict[str, Any]],
        style: str = "podcast",
        user_name: str = "Слушатель",
        lang: str = "ru",
        period_label: str = "сегодняшний день (24 часа)"
    ) -> Tuple[str, str]:
        """
        Generates an AI-summarized digest via Gemini 3.7/2.5 covering all fetched channel posts.
        If Gemini is unavailable (e.g. location restriction 400 FAILED_PRECONDITION or no network),
        automatically and seamlessly generates an intelligent extractive digest with all links intact!
        Returns: (html_formatted_text_with_links, clean_speech_text_for_tts)
        """
        # Pre-filter all incoming posts from any promotional/ad material
        valid_posts = []
        for p in posts:
            raw_text = p.get('text', '')
            if not raw_text or len(raw_text.strip()) < 15 or is_promotional_or_ad(raw_text):
                continue
            cleaned = clean_boilerplate_and_signatures(raw_text)
            if len(cleaned) < 15 or is_promotional_or_ad(cleaned):
                continue
            valid_posts.append(p)

        if not valid_posts:
            if lang == "en":
                return "📭 No substantive news available for digest generation.", "No news available at this time."
            return "📭 Нет содержательных новостей для формирования дайджеста.", "Новостей пока нет."

        posts = valid_posts

        # Attempt Gemini AI generation if client is available
        if self.client:
            try:
                formatted_posts = []
                for idx, p in enumerate(posts, 1):
                    url = p.get('url', f"https://t.me/{p['channel']}")
                    p_text = clean_boilerplate_and_signatures(p.get('text', ''))
                    formatted_posts.append(
                        f"[Новость #{idx}] Канал: @{p['channel']} ({p.get('channel_title', '')}) | Ссылка: {url}\n"
                        f"Текст: {p_text}"
                    )
                
                posts_context = "\n\n---\n\n".join(formatted_posts)
                
                if lang == "en":
                    system_instruction = (
                        f"You are a professional AI news presenter and chief editor of a personalized audio news station.\n"
                        f"Your task is to thoroughly analyze ALL provided Telegram posts for {period_label}, group related topics, "
                        f"remove fluff/ads, and craft an engaging comprehensive news report for listener {user_name}.\n\n"
                        f"MANDATORY RULES:\n"
                        f"1. Cover all key events from all provided channels (structure into clear points 1, 2, 3...).\n"
                        f"2. At the end of EACH news point, add a clickable HTML link: "
                        f"<a href=\"URL\">Read in @channel_name ↗</a> (use the exact URL from the input data).\n"
                        f"3. Start with a warm brief greeting, end with a pleasant closing.\n"
                        f"4. The text must sound engaging, natural, and journalistic in fluent English.\n"
                        f"5. STRICTLY EXCLUDE: advertisements, betting/gambling/bookmakers (1xBet, Winline, Fonbet, etc.), casino/slots, clickbait hooks ('you were mentioned by admin', 'link expires in 24h'), partner/sponsored posts, and channel mirror footers ('Duplicate in MAX...'). Only include real, factual news."
                    )
                    user_prompt = (
                        f"Here are all channel posts for {period_label}:\n\n"
                        f"{posts_context}\n\n"
                        f"Generate a comprehensive news digest with clickable HTML links for each story. Never include channel mirror footers, betting ads, or spam."
                    )
                else:
                    system_instruction = (
                        f"Ты — профессиональный ИИ-диктор и главный редактор персонального новостного радио.\n"
                        f"Твоя задача — внимательно изучить ВСЕ переданные посты из Telegram за {period_label}, объединить связанные темы, "
                        f"отбросить рекламу и спам, и составить подробный итоговый выпуск для слушателя по имени {user_name}.\n\n"
                        f"ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:\n"
                        f"1. Охвати все важные темы из каждого канала, выделив главные новости четкими пунктами (1, 2, 3...).\n"
                        f"2. В конце КАЖДОЙ новости обязательно добавь кликабельную HTML-ссылку: "
                        f"<a href=\"URL\">Читать в @имя_канала ↗</a> (используй точную ссылку из входных данных).\n"
                        f"3. В начале кратко поприветствуй пользователя, а в конце пожелай отличного дня.\n"
                        f"4. Текст должен звучать живо, профессионально и увлекательно на правильном русском языке.\n"
                        f"5. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО включать в дайджест:\n"
                        f"   - Рекламу букмекеров, ставок на спорт и казино (Fonbet, Winline, 1xBet, BetBoom, слоты, фрибеты и т.д.);\n"
                        f"   - Кликбейтные спам-заходы (типа 'вас упомянул администратор', 'вход по ссылке на 24 часа', 'закрытый канал');\n"
                        f"   - Партнерские и рекламные посты (#реклама, erid, промокоды, партнерский материал);\n"
                        f"   - Уведомления каналов о дублировании контента (например: 'Дублируем все посты в MAX, если у вас не грузит Telegram', 'Наш канал в VK/MAX', 'Подписывайтесь на канал', 'По вопросам рекламы').\n"
                        f"Дайджест должен содержать исключительно содержательные новости и факты."
                    )
                    user_prompt = (
                        f"Вот публикации из Telegram-каналов за {period_label}:\n\n"
                        f"{posts_context}\n\n"
                        f"Сгенерируй качественный и подробный итоговый дайджест со всеми ключевыми новостями и кликабельными HTML-ссылками, полностью очищенный от рекламы букмекеров, спама, кликбейта, партнерских постов и подписей про MAX."
                    )

                # Resilient multi-model fallback chain to handle 503 UNAVAILABLE or high demand spikes
                candidate_models = [
                    "gemini-2.5-flash",
                    "gemini-2.0-flash",
                    "gemini-3.7-flash",
                    "gemini-1.5-flash"
                ]

                last_error = None
                for model_name in candidate_models:
                    try:
                        logger.info(f"Requesting digest from Google Gemini API ({model_name})...")
                        response = self.client.models.generate_content(
                            model=model_name,
                            contents=user_prompt,
                            config=types.GenerateContentConfig(
                                system_instruction=system_instruction,
                                temperature=0.6
                            )
                        )

                        full_text = response.text
                        if full_text and len(full_text.strip()) > 30:
                            clean_speech = self._clean_for_speech(full_text)
                            logger.info(f"Successfully generated digest via Gemini AI ({model_name}).")
                            return full_text, clean_speech
                    except Exception as model_err:
                        last_error = model_err
                        err_msg = str(model_err)
                        if "503" in err_msg or "UNAVAILABLE" in err_msg or "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                            logger.warning(f"Model {model_name} busy/unavailable ({model_err}). Trying next fallback model...")
                            continue
                        elif "location is not supported" in err_msg or "FAILED_PRECONDITION" in err_msg:
                            logger.warning("Gemini API location not supported in current network.")
                            break
                        else:
                            logger.warning(f"Model {model_name} error: {model_err}. Trying next fallback model...")
                            continue

                if last_error:
                    logger.warning(f"All Gemini models exhausted. Last error: {last_error}. Using resilient fallback digest...")

            except Exception as e:
                err_str = str(e)
                if "location is not supported" in err_str or "FAILED_PRECONDITION" in err_str:
                    logger.warning(
                        "Gemini API location is not supported in current network. "
                        "Activating intelligent Extractive Fallback Digest with direct post links..."
                    )
                else:
                    logger.warning(f"Gemini API call returned: {e}. Using resilient fallback digest...")

        # Resilient Automatic Fallback: Smart Extractive Digest
        return self._generate_fallback_digest(posts, user_name, lang=lang, period_label=period_label)

    def _generate_fallback_digest(
        self,
        posts: List[Dict[str, Any]],
        user_name: str,
        lang: str = "ru",
        period_label: str = "сегодняшний день"
    ) -> Tuple[str, str]:
        """
        Extractive digest generator that groups and includes ALL collected news across all channels,
        with strict boilerplate and ad filtering applied.
        """
        # 1. Group posts by channel
        channel_groups: Dict[str, List[Dict[str, Any]]] = {}
        for p in posts:
            raw_text = p.get("text", "")
            if is_promotional_or_ad(raw_text):
                continue
            ch = p.get("channel", "default")
            if ch not in channel_groups:
                channel_groups[ch] = []
            channel_groups[ch].append(p)

        # 2. Select available posts per channel
        selected_posts = []
        for ch, ch_posts in channel_groups.items():
            selected_posts.extend(ch_posts[:30])

        if not selected_posts and posts:
            selected_posts = [p for p in posts if not is_promotional_or_ad(p.get("text", ""))]

        if lang == "en":
            digest_lines = [
                f"👋 <b>Good day, {html.escape(user_name)}!</b>\n",
                f"📻 <b>News digest for {period_label} ({len(selected_posts)} stories from {len(channel_groups)} channels):</b>\n"
            ]
            speech_parts = [
                f"Hello, {user_name}! Here is your complete news roundup for {period_label} across your tracked channels, covering all {len(selected_posts)} stories."
            ]
        else:
            digest_lines = [
                f"👋 <b>Добрый день, {html.escape(user_name)}!</b>\n",
                f"📻 <b>Сводка новостей за {period_label} ({len(selected_posts)} постов из {len(channel_groups)} каналов):</b>\n"
            ]
            speech_parts = [
                f"Привет, {user_name}! Вот полный выпуск главных событий за {period_label} из ваших Telegram каналов, включая все {len(selected_posts)} публикаций."
            ]

        for i, post in enumerate(selected_posts, 1):
            ch = post.get("channel", "канал")
            ch_title = post.get("channel_title") or ch
            url = post.get("url", f"https://t.me/{ch}")
            raw_text = clean_boilerplate_and_signatures(post.get("text", "").strip())
            
            # Clean snippet (take first 2-3 sentences or ~280 chars)
            sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', raw_text) if len(s.strip()) > 5]
            snippet = " ".join(sentences[:3]) if len(sentences) >= 2 else raw_text[:250]
            if len(snippet) > 300:
                snippet = snippet[:300] + "..."

            escaped_snippet = html.escape(snippet)
            escaped_title = html.escape(ch_title)
            
            read_label = "Read in" if lang == "en" else "Читать в"
            digest_lines.append(
                f"<b>{i}. {escaped_title}</b> (@{ch}):\n"
                f"{escaped_snippet}\n"
                f"👉 <a href=\"{url}\">{read_label} @{ch} ↗</a>\n"
            )
            
            story_prefix = f"Story number {i}, channel {ch_title}." if lang == "en" else f"Новость номер {i}, канал {ch_title}."
            speech_parts.append(
                f"{story_prefix} {snippet}"
            )

        if lang == "en":
            digest_lines.append("<i>💡 Tip: To enable full Gemini AI synthesis, set GEMINI_API_KEY (and HTTPS_PROXY if in restricted region) in .env</i>")
            speech_parts.append("That concludes the broadcast for today. Have a great and productive day!")
        else:
            digest_lines.append("<i>💡 Совет: Для суммаризации через нейросеть Gemini укажите GEMINI_API_KEY (и HTTPS_PROXY при блокировках) в .env</i>")
            speech_parts.append("На этом выпуск завершен. Желаем вам отличного и продуктивного дня!")

        html_digest = "\n".join(digest_lines)
        clean_speech = " ".join(speech_parts)
        clean_speech = self._clean_for_speech(clean_speech)

        return html_digest, clean_speech

    def _clean_for_speech(self, text: str) -> str:
        """
        Removes HTML, markdown, emojis, telegram markers and raw URLs so TTS speaks pure natural human text.
        Also strips out any mirror/boilerplate channel footer phrases.
        """
        import unicodedata
        # 1. Clean boilerplate signatures
        cleaned = clean_boilerplate_and_signatures(text)
        # 2. Remove HTML tags
        cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
        # 3. Remove URLs
        cleaned = re.sub(r'https?:\/\/\S+', '', cleaned)
        cleaned = re.sub(r't\.me\/\S+', '', cleaned)
        # 4. Strip all Unicode emoji characters, pictograms and symbols
        cleaned = "".join(
            ch for ch in cleaned 
            if not (unicodedata.category(ch) in ("So", "Sk", "Cs") or ord(ch) >= 0x1F000 or ord(ch) in range(0x2600, 0x27BF))
        )
        # 5. Remove UI symbols, arrows, bullet markers
        cleaned = re.sub(r'[↗→➔👉▶◀💡📌🔥⚡🎙️📰📖💬✨✅❌•—–\-\*\_\#\x60\[\]\(\)\{\}\<\>\|\\\/]', ' ', cleaned)
        # 6. Remove @ channel handles if attached to words
        cleaned = re.sub(r'@[A-Za-z0-9_]+', '', cleaned)
        # 7. Normalize whitespaces
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned
