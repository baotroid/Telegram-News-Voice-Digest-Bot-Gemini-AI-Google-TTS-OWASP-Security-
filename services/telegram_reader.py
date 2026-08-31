import logging
import re
import aiohttp
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from telethon import TelegramClient

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

class TelegramReaderService:
    """
    Dual-engine Telegram Reader:
    1. Primary: Telethon MTProto Client (when session is authorized).
    2. Resilient Fallback: Direct public web feed scraping (https://t.me/s/{channel})
       which works immediately without requiring interactive terminal 2FA auth.
    """
    def __init__(self, api_id: int, api_hash: str, session_name: str = "user_session"):
        self.api_id = api_id
        self.api_hash = api_hash
        self.session_name = session_name
        self.client = TelegramClient(self.session_name, self.api_id, self.api_hash)
        self._is_authorized = False

    async def start(self):
        """Attempts to start Telethon client. If not authorized, logs info and uses fallback web reader."""
        try:
            await self.client.connect()
            self._is_authorized = await self.client.is_user_authorized()
            if self._is_authorized:
                logger.info("Telethon MTProto client successfully connected and authorized.")
            else:
                logger.info("Telethon client connected (unauthorized). Fallback public web reader is ACTIVE.")
        except Exception as e:
            logger.warning(f"Telethon start note: {e}. Public web reader will be used for channels.")

    async def stop(self):
        try:
            if self.client and self.client.is_connected():
                await self.client.disconnect()
        except Exception:
            pass

    async def fetch_latest_posts(
        self,
        channels: List[str],
        hours_limit: int = 24,
        max_posts_per_channel: int = 30
    ) -> List[Dict[str, Any]]:
        all_posts = []

        # Check if Telethon MTProto is available
        if self._is_authorized and self.client.is_connected():
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours_limit)
            for channel_name in channels:
                clean_name = channel_name.replace("@", "").strip()
                try:
                    entity = await self.client.get_entity(clean_name)
                    channel_title = getattr(entity, "title", clean_name)
                    logger.info(f"[Telethon] Reading channel: @{clean_name} ({channel_title}) for {hours_limit}h...")
                    
                    count = 0
                    async for message in self.client.iter_messages(entity, limit=max_posts_per_channel):
                        if not message.text or len(message.text.strip()) < 15:
                            continue
                        if message.date < cutoff_time:
                            break
                        
                        # Strict Ad & Promo filter
                        if is_promotional_or_ad(message.text.strip()):
                            logger.info(f"[Telethon] Filtered out promo/ad post from @{clean_name}")
                            continue

                        text = clean_boilerplate_and_signatures(message.text.strip())
                        if len(text) < 15 or is_promotional_or_ad(text):
                            continue
                        
                        all_posts.append({
                            "channel": clean_name,
                            "channel_title": channel_title,
                            "text": text,
                            "date": message.date.strftime("%d.%m %H:%M"),
                            "timestamp": message.date.timestamp(),
                            "url": f"https://t.me/{clean_name}/{message.id}",
                            "views": getattr(message, "views", 0),
                            "id": message.id
                        })
                        count += 1
                    logger.info(f"[Telethon] Retrieved {count} posts from @{clean_name}")
                except Exception as e:
                    logger.warning(f"Telethon fetch for @{clean_name} failed: {e}. Trying web reader...")
                    web_posts = await self._fetch_via_web(clean_name, hours_limit=hours_limit, max_posts=max_posts_per_channel)
                    all_posts.extend(web_posts)
        else:
            # Fallback: Read via public Telegram web preview
            for channel_name in channels:
                clean_name = channel_name.replace("@", "").strip()
                web_posts = await self._fetch_via_web(clean_name, hours_limit=hours_limit, max_posts=max_posts_per_channel)
                all_posts.extend(web_posts)

        return all_posts

    async def _fetch_via_web(self, channel: str, hours_limit: int = 24, max_posts: int = 30) -> List[Dict[str, Any]]:
        """Scrapes all public posts from https://t.me/s/{channel} without requiring credentials."""
        posts = []
        url = f"https://t.me/s/{channel}"
        logger.info(f"[WebReader] Fetching public channel @{channel} (limit {max_posts} posts, window {hours_limit}h)...")
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
        }
        
        try:
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status != 200:
                        logger.warning(f"[WebReader] Could not load @{channel}: HTTP {resp.status}")
                        return posts
                    html_content = await resp.text()

            # Extract channel title
            title_match = re.search(r'<div class="tgme_channel_info_title"[^>]*><span[^>]*>(.*?)</span>', html_content)
            channel_title = title_match.group(1) if title_match else channel
            channel_title = re.sub(r'<[^>]+>', '', channel_title).strip()

            # Extract message blocks with their exact data-post id and message text
            message_matches = re.findall(
                r'data-post="([^"]+)".*?<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
                html_content,
                re.DOTALL
            )
            
            for post_id_str, raw_text in message_matches[-max_posts:]:
                clean_text = re.sub(r'<brs*/?>', '\n', raw_text)
                clean_text = re.sub(r'<[^>]+>', '', clean_text).strip()
                
                # Strict Ad & Promo filter
                if is_promotional_or_ad(clean_text):
                    logger.info(f"[WebReader] Filtered out promo/ad post from @{channel}")
                    continue

                clean_text = clean_boilerplate_and_signatures(clean_text)
                if len(clean_text) < 15 or is_promotional_or_ad(clean_text):
                    continue

                post_url = f"https://t.me/{post_id_str}"
                posts.append({
                    "channel": channel,
                    "channel_title": channel_title,
                    "text": clean_text,
                    "date": datetime.now().strftime("%d.%m %H:%M"),
                    "timestamp": datetime.now().timestamp(),
                    "url": post_url,
                    "views": 100,
                    "id": post_id_str
                })

            logger.info(f"[WebReader] Successfully parsed {len(posts)} posts from @{channel}")
        except Exception as e:
            logger.error(f"[WebReader] Error fetching @{channel}: {e}")

        return posts
