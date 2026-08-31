import asyncio
import logging
import os
import re
import html
import unicodedata
from typing import List, Dict, Any, Tuple
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

def is_promotional_or_ad(text: str) -> bool:
    """
    Detects if a post is an advertisement, clickbait spam ('вас упомянул администратор'),
    betting/gambling promo, card transfer solicitation ('сбрасывайте на карту'),
    limited seats FOMO ('осталось одно место'), casino/slots, or crypto scam.
    """
    if not text or len(text.strip()) < 10:
        return False
    
    t_lower = text.lower()
    
    # 1. Card numbers, transfers, payment spam & financial solicitations
    card_and_payment_patterns = [
        "сбрасывайте на карту", "сбросьте на карту", "перевод на карту", "переводите на карту",
        "номер карты", "реквизиты карты", "сбербанк", "на сбер", "на тинькофф", "на т-банк",
        "оплата на карту", "донат на карту", "сбор средств", "по номеру карты", "кидайте на карту"
    ]
    if any(p in t_lower for p in card_and_payment_patterns):
        return True

    # 2. Scarcity & FOMO sales tricks / seat limits
    fomo_patterns = [
        "осталось одно место", "осталось 1 место", "осталось 2 места", "осталось 3 места",
        "осталось всего", "последнее место", "мест ограничено", "количество мест ограничено",
        "занять место", "забронировать место", "бронь места", "успей занять", "вход закрывается",
        "вход платный", "доступ платный", "вход строго по", "платная подписка", "складчина",
        "бронируй место", "забирай доступ"
    ]
    if any(p in t_lower for p in fomo_patterns):
        return True

    # 3. Clickbait mentions / fake admin notifications / channel lock spam
    spam_patterns = [
        "вас упомянул", "вас упомянули", "упомянул администратор", "упомянула администратор",
        "упомянул вас", "вам пришло уведомление", "вход только по ссылке",
        "доступ открыт на 24 часа", "доступ открыт на 48 часов", "доступ открыт на",
        "заявка на вступление", "канал удалят через", "успей подписаться",
        "закрытый канал", "ссылка в закрепе", "переходи в закреп",
        "переходите по ссылке", "ссылка действует", "ссылка активна",
        "только по этой ссылке", "по ссылке выше", "ссылка ниже",
        "пиши в лс", "пиши мне в лс", "пишите менеджеру", "личные сообщения",
        "по ссылке в описании", "канал спонсора", "спонсор канала"
    ]
    if any(p in t_lower for p in spam_patterns):
        return True
        
    # 4. Ads, Partner posts, Sponsorship disclaimers
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
        
    # 5. Bookmakers, Sports betting, Gambling & Casinos
    gambling_markers = [
        "букмекер", "букмекерск", "букмекерская контора", "ставки на спорт", "ставка на спорт",
        "поставить ставку", "бк ", "1xbet", "fonbet", "фонбет", "winline",
        "винлайн", "melbet", "мелбет", "париматч", "parimatch", "лига ставок",
        "betboom", "бетбум", "1win", "олимпбет", "olimpbet", "фрибет", "freebet",
        "бонус к депозиту", "бонус за регистрацию", "депозит от", "коэффициент на матч",
        "кэф ", "кэфы", "прогноз на матч", "экспресс на сегодня", "железобетонный экспресс",
        "бетон на сегодня", "договорной матч", "инсайд на матч", "проходимость 100%",
        "казино", "слоты", "casino", "джекпот", "выигрыш в слотах", "онлайн-казино",
        "рулетка", "игровые автоматы", "демо-счет", "занос в слотах", "крутить слоты",
        "вулкан", "joycasino", "джойказино", "забрать бонус", "забирай бонус", "получи бонус"
    ]
    if any(p in t_lower for p in gambling_markers):
        return True
        
    # 6. Crypto schemes, pump and dump, get-rich-quick scams
    scam_markers = [
        "криптосигналы", "сигналы на крипту", "памп монеты", "схема заработка",
        "доходность от %", "раскрутка депозита", "пассивный доход", "инвестируй и получай",
        "арбитраж крипты", "связка p2p", "p2p связка", "аирдроп", "airdrop",
        "тапалка", "hamster kombat", "notcoin", "легкие деньги", "заработок без вложений",
        "работа на дому от"
    ]
    if any(p in t_lower for p in scam_markers):
        return True

    return False

def clean_boilerplate_and_signatures(text: str) -> str:
    """
    Cleans out channel boilerplate footers, mirror channel notices (e.g. 'Дублируем все посты в MAX...'),
    cross-promotions, HTML entities (&nbsp;, &quot;, &nbs), social media mirror warnings, and generic marketing noise.
    """
    if not text:
        return ""
    
    # Unescape HTML entities first
    text = html.unescape(text)
    # Strip any lingering HTML entity artifacts like &nbsp;, &nbs, &quot;, &#160;, etc.
    text = re.sub(r'&(?:nbsp|quot|amp|lt|gt|apos|[a-zA-Z]+|\#\d+|\#x[0-9a-fA-F]+);?', ' ', text)
    text = re.sub(r'&nbs\b', ' ', text)
    text = re.sub(r'&[a-zA-Z0-9#]+;?', ' ', text)
    
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
            "подпишись на", "подписывайтесь на", "по вопросам рекламы", "вас упомянул",
            "сбрасывайте на карту", "осталось одно место", "осталось 1 место"
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
        period_label: str = "сегодняшний день (24 часа)",
        part_info: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, str]:
        """
        Generates an AI-summarized digest via Gemini 2.5/2.0 Flash covering the provided batch of channel posts.
        If Gemini is unavailable or times out, seamlessly falls back to a clean extractive digest.
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
            p_copy = dict(p)
            p_copy['text'] = cleaned
            valid_posts.append(p_copy)

        if not valid_posts:
            if lang == "en":
                return "📭 No substantive news available for digest generation.", "No news available at this time."
            return "📭 Нет содержательных новостей для формирования дайджеста.", "Новостей пока нет."

        posts = valid_posts
        part_num = part_info.get("part", 1) if part_info else 1
        total_parts = part_info.get("total_parts", 1) if part_info else 1
        start_idx = part_info.get("start_idx", 1) if part_info else 1
        end_idx = part_info.get("end_idx", len(posts)) if part_info else len(posts)
        total_posts_all = part_info.get("total_posts", len(posts)) if part_info else len(posts)

        # Attempt Gemini AI generation if client is available
        if self.client:
            try:
                formatted_posts = []
                for idx, p in enumerate(posts, 1):
                    url = p.get('url', f"https://t.me/{p['channel']}")
                    p_text = p.get('text', '')
                    if len(p_text) > 450:
                        p_text = p_text[:450] + "..."
                    formatted_posts.append(
                        f"[Новость #{idx}] Канал: @{p['channel']} ({p.get('channel_title', '')}) | Ссылка: {url}\n"
                        f"Текст: {p_text}"
                    )
                
                posts_context = "\n\n---\n\n".join(formatted_posts)
                
                part_context_en = f" (Part {part_num} of {total_parts}, stories {start_idx}–{end_idx} of {total_posts_all})" if total_parts > 1 else ""
                part_context_ru = f" (Выпуск {part_num} из {total_parts}, новости {start_idx}–{end_idx} из {total_posts_all})" if total_parts > 1 else ""

                if lang == "en":
                    system_instruction = (
                        f"You are a professional AI news anchor and chief editor of a concise audio news bulletin.\n"
                        f"Analyze the provided Telegram posts for {period_label}{part_context_en}, combine related topics, "
                        f"strip ALL advertising/promotional noise, and craft a clear news summary for listener {user_name}.\n\n"
                        f"MANDATORY RULES:\n"
                        f"1. Structure key events into clear numbered points (1, 2, 3...).\n"
                        f"2. At the end of EACH news point, add a clickable HTML link: "
                        f"<a href=\"URL\">Read in @channel_name ↗</a> (use the exact URL provided).\n"
                        f"3. Start with a warm greeting{' mentioning part ' + str(part_num) + ' of ' + str(total_parts) if total_parts > 1 else ''}, end with a brief closing.\n"
                        f"4. Never output HTML entity artifacts like &nbsp;, &quot;, &amp; in the text.\n"
                        f"5. STRICTLY EXCLUDE: advertisements, betting/gambling/bookmakers (1xBet, Fonbet, Winline), card transfers/payment requests ('сбрасывайте на карту', 'оплата на карту'), scarcity tactics ('осталось одно место', 'осталось 1 место'), clickbait spam, and channel mirror footers ('Duplicate in MAX...')."
                    )
                    user_prompt = (
                        f"Here are the channel posts for {period_label}{part_context_en}:\n\n"
                        f"{posts_context}\n\n"
                        f"Generate a concise, engaging news digest with clickable HTML links for each story."
                    )
                else:
                    system_instruction = (
                        f"Ты — профессиональный ИИ-диктор и главный редактор персонального новостного радио.\n"
                        f"Твоя задача — изучить переданные посты из Telegram за {period_label}{part_context_ru}, объединить связанные темы, "
                        f"отбросить любую рекламу, и составить емкий выпуск для слушателя по имени {user_name}.\n\n"
                        f"ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:\n"
                        f"1. Выдели главные новости четкими нумерованными пунктами (1, 2, 3...).\n"
                        f"2. В конце КАЖДОЙ новости обязательно добавь кликабельную HTML-ссылку: "
                        f"<a href=\"URL\">Читать в @имя_канала ↗</a> (используй точную ссылку из входных данных).\n"
                        f"3. В начале кратко поприветствуй пользователя{' (отметь, что это ' + str(part_num) + '-й выпуск из ' + str(total_parts) + ')' if total_parts > 1 else ''}, в конце пожелай хорошего дня.\n"
                        f"4. Никаких HTML-сущностей типа &nbsp;, &quot;, &amp; в тексте быть не должно.\n"
                        f"5. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО включать в дайджест:\n"
                        f"   - Переводы на карту, сборы денег, оплату ('сбрасывайте на карту', 'перевод на карту');\n"
                        f"   - Призывы занять ограниченные места ('осталось одно место', 'осталось 1 место', 'мест ограничено');\n"
                        f"   - Рекламу букмекеров, ставок на спорт и казино (Fonbet, Winline, 1xBet, BetBoom, слоты, фрибеты);\n"
                        f"   - Кликбейтный спам ('вас упомянул администратор', 'вход по ссылке');\n"
                        f"   - Партнерские материалы, erid, промокоды;\n"
                        f"   - Служебные подписи каналов ('Дублируем все посты в MAX', 'Зеркало в VK', 'По вопросам рекламы')."
                    )
                    user_prompt = (
                        f"Вот публикации из Telegram-каналов за {period_label}{part_context_ru}:\n\n"
                        f"{posts_context}\n\n"
                        f"Сгенерируй качественный и емкий новостной дайджест со ссылками на посты, очищенный от рекламы, переводов на карту и спама."
                    )

                # Prioritize fast models first
                candidate_models = [
                    "gemini-2.5-flash",
                    "gemini-2.0-flash",
                    "gemini-1.5-flash",
                    "gemini-3.7-flash"
                ]

                last_error = None
                for model_name in candidate_models:
                    try:
                        logger.info(f"Requesting fast digest from Google Gemini API ({model_name})...")
                        
                        def call_gemini():
                            return self.client.models.generate_content(
                                model=model_name,
                                contents=user_prompt,
                                config=types.GenerateContentConfig(
                                    system_instruction=system_instruction,
                                    temperature=0.4
                                )
                            )

                        # Set 16s timeout to prevent long hangs and maintain fast response
                        response = await asyncio.wait_for(
                            asyncio.to_thread(call_gemini),
                            timeout=16.0
                        )

                        full_text = response.text
                        if full_text and len(full_text.strip()) > 30:
                            # Clean any HTML entity residues from AI response
                            full_text = html.unescape(full_text)
                            full_text = re.sub(r'&(?:nbsp|quot|amp|lt|gt|apos|[a-zA-Z]+|\#\d+|\#x[0-9a-fA-F]+);?', ' ', full_text)
                            full_text = re.sub(r'&nbs\b', ' ', full_text)
                            
                            clean_speech = self._clean_for_speech(full_text)
                            logger.info(f"Successfully generated digest via Gemini AI ({model_name}).")
                            return full_text, clean_speech
                    except asyncio.TimeoutError:
                        logger.warning(f"Model {model_name} timed out after 16s. Trying next candidate...")
                        continue
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
                    logger.warning(f"All Gemini models exhausted or timed out. Using resilient fallback digest...")

            except Exception as e:
                logger.warning(f"Gemini API error: {e}. Using resilient fallback digest...")

        # Resilient Automatic Fallback: Smart Extractive Digest
        return self._generate_fallback_digest(posts, user_name, lang=lang, period_label=period_label, part_info=part_info)

    def _generate_fallback_digest(
        self,
        posts: List[Dict[str, Any]],
        user_name: str,
        lang: str = "ru",
        period_label: str = "сегодняшний день",
        part_info: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, str]:
        """
        Extractive digest generator that groups and includes all collected news across all channels,
        with strict boilerplate, HTML entity, and ad filtering applied.
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

        part_num = part_info.get("part", 1) if part_info else 1
        total_parts = part_info.get("total_parts", 1) if part_info else 1
        part_label_en = f" — Part {part_num}/{total_parts}" if total_parts > 1 else ""
        part_label_ru = f" — Выпуск {part_num}/{total_parts}" if total_parts > 1 else ""

        if lang == "en":
            digest_lines = [
                f"👋 <b>Good day, {html.escape(user_name)}!</b>\n",
                f"📻 <b>News digest{part_label_en} for {period_label} ({len(selected_posts)} stories from {len(channel_groups)} channels):</b>\n"
            ]
            speech_parts = [
                f"Hello, {user_name}! Here is your news roundup{part_label_en} for {period_label} across your tracked channels, covering {len(selected_posts)} stories."
            ]
        else:
            digest_lines = [
                f"👋 <b>Добрый день, {html.escape(user_name)}!</b>\n",
                f"📻 <b>Сводка новостей{part_label_ru} за {period_label} ({len(selected_posts)} постов из {len(channel_groups)} каналов):</b>\n"
            ]
            speech_parts = [
                f"Привет, {user_name}! Вот выпуск главных событий{part_label_ru} за {period_label} из ваших Telegram каналов, включая {len(selected_posts)} публикаций."
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
        Also strips out any mirror/boilerplate channel footer phrases and HTML entity artifacts like &nbsp;.
        """
        # 1. Unescape and strip HTML entity artifacts
        cleaned = html.unescape(text)
        cleaned = re.sub(r'&(?:nbsp|quot|amp|lt|gt|apos|[a-zA-Z]+|\#\d+|\#x[0-9a-fA-F]+);?', ' ', cleaned)
        cleaned = re.sub(r'&nbs\b', ' ', cleaned)
        cleaned = re.sub(r'&[a-zA-Z0-9#]+;?', ' ', cleaned)
        
        # 2. Clean boilerplate signatures
        cleaned = clean_boilerplate_and_signatures(cleaned)
        # 3. Remove HTML tags
        cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
        # 4. Remove URLs
        cleaned = re.sub(r'https?:\/\/\S+', '', cleaned)
        cleaned = re.sub(r't\.me\/\S+', '', cleaned)
        # 5. Strip all Unicode emoji characters, pictograms and symbols
        cleaned = "".join(
            ch for ch in cleaned 
            if not (unicodedata.category(ch) in ("So", "Sk", "Cs") or ord(ch) >= 0x1F000 or ord(ch) in range(0x2600, 0x27BF))
        )
        # 6. Remove UI symbols, arrows, bullet markers
        cleaned = re.sub(r'[↗→➔👉▶◀💡📌🔥⚡🎙️📰📖💬✨✅❌•—–\-\*\_\#\x60\[\]\(\)\{\}\<\>\|\\\/]', ' ', cleaned)
        # 7. Remove @ channel handles if attached to words
        cleaned = re.sub(r'@[A-Za-z0-9_]+', '', cleaned)
        # 8. Normalize whitespaces
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned
