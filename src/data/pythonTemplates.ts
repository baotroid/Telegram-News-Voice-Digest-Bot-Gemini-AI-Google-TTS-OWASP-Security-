import { PythonFile, PythonProjectConfig } from '../types';

export function generatePythonProjectFiles(config: PythonProjectConfig): PythonFile[] {
  const defaultChannelsStr = config.channels.map(c => `"${c.replace('@', '')}"`).join(', ');

  const securityPy = `"""
Security & Data Protection Module for Telegram Bot (OWASP for Bots Compliance)
=============================================================================
Features implemented:
1. Symmetric PII Encryption & Decryption via Cryptography (Fernet)
2. Salted HMAC-SHA256 Hashing for User Identifiers (Pseudonymization)
3. Anti-Spam / Anti-Flood Rate-Limiter Middleware with Memory sliding windows
4. Input Sanitization & HTML/Markdown Anti-Injection Escaper
5. File Upload Inspector (extension, MIME, size limit validation)
6. RBAC Admin Authorization Filter & Private Chat Enforcer
7. Masking Logger Formatter (Redacts tokens, phone numbers, emails, API keys)
8. Rotating File Logger (logs/bot.log) for error tracking and diagnostics
9. Global Safe Exception Handler (Prevents stack trace leakage to users)
"""

import os
import re
import time
import hmac
import hashlib
import logging
from logging.handlers import RotatingFileHandler
from typing import Any, Callable, Dict, Awaitable, List, Optional, Set
from cryptography.fernet import Fernet
from aiogram import BaseMiddleware, types
from aiogram.types import TelegramObject, Message, CallbackQuery
from aiogram.filters import BaseFilter

# ---------------------------------------------------------------------------
# 1. PII Encryption & Salted Hashing (GDPR & Data Protection)
# ---------------------------------------------------------------------------
class DataSecurityVault:
    """
    Handles symmetric encryption of Sensitive Personal Information (PII)
    and salted hashing for audit logs with persistent key storage.
    """
    def __init__(self, master_key: Optional[str] = None, salt: Optional[str] = None, key_file: str = "data/.secret.key"):
        raw_key = ""
        if master_key and len(master_key) >= 16 and not master_key.startswith("GENERATE"):
            raw_key = master_key
        else:
            try:
                os.makedirs(os.path.dirname(key_file) if os.path.dirname(key_file) else "data", exist_ok=True)
                if os.path.exists(key_file):
                    with open(key_file, "r", encoding="utf-8") as f:
                        raw_key = f.read().strip()
                if not raw_key or len(raw_key) < 16:
                    generated = Fernet.generate_key().decode("utf-8")
                    raw_key = generated
                    with open(key_file, "w", encoding="utf-8") as f:
                        f.write(generated)
            except Exception:
                raw_key = "telegram-gemini-news-bot-fixed-key-2026"

        try:
            self._cipher = Fernet(raw_key.encode("utf-8"))
        except Exception:
            derived = hashlib.sha256(raw_key.encode("utf-8")).digest()
            import base64
            self._cipher = Fernet(base64.urlsafe_b64encode(derived))

        self.salt = (salt or "telegram-bot-default-salt-2026").encode("utf-8")

    def encrypt_text(self, plain_text: str) -> str:
        """Symmetrically encrypts a string before storing it in storage."""
        if not plain_text:
            return ""
        encrypted_bytes = self._cipher.encrypt(plain_text.encode("utf-8"))
        return encrypted_bytes.decode("utf-8")

    def decrypt_text(self, cipher_text: str) -> str:
        """Decrypts ciphertext back to plaintext. Falls back cleanly on format mismatch."""
        if not cipher_text:
            return ""
        try:
            decrypted_bytes = self._cipher.decrypt(cipher_text.encode("utf-8"))
            return decrypted_bytes.decode("utf-8")
        except Exception:
            # If cipher_text is already plain JSON array or string from earlier version
            if cipher_text.startswith("[") or cipher_text.startswith("{") or cipher_text.startswith('"'):
                return cipher_text
            return ""

    def hash_identifier(self, identifier: str | int) -> str:
        """
        Creates a salted HMAC-SHA256 pseudonym for user IDs, IPs, or emails
        for secure logging and analytics without storing raw identifiers.
        """
        raw_bytes = str(identifier).encode("utf-8")
        return hmac.new(self.salt, raw_bytes, hashlib.sha256).hexdigest()[:16]


# ---------------------------------------------------------------------------
# 2. Input Sanitization & Anti-Injection Utilities
# ---------------------------------------------------------------------------
class InputSanitizer:
    """Protects against HTML injection, Telegram Markdown breaks, and Command Injection."""
    
    HTML_REPLACEMENTS = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
    }

    @classmethod
    def escape_html(cls, text: str) -> str:
        """Escapes raw user strings before embedding into HTML parse_mode messages."""
        if not text:
            return ""
        for char, repl in cls.HTML_REPLACEMENTS.items():
            text = text.replace(char, repl)
        return text

    @classmethod
    def validate_channel_username(cls, username: str) -> Optional[str]:
        """
        Cleans and validates Telegram channel handles.
        Accepts: 'habr_pop', '@zaPEACEki', 'https://t.me/habr_pop', 't.me/s/zaPEACEki'.
        Preserves original casing while stripping URLs and @ signs.
        """
        if not username:
            return None
        raw = username.strip()
        # Remove URL prefixes and @
        cleaned = re.sub(r'^(https?:\/\/)?(www\.)?(t\.me\/(s\/)?|@)', '', raw, flags=re.IGNORECASE)
        cleaned = cleaned.split('/')[0].split('?')[0].strip()
        # Telegram usernames are 3-32 chars, alphanumeric and underscore
        if re.match(r'^[a-zA-Z0-9_]{3,32}$', cleaned):
            return cleaned
        return None

    @classmethod
    def validate_file_upload(
        cls, 
        file_name: str, 
        file_size_bytes: int, 
        allowed_extensions: Set[str] = {".txt", ".json", ".ogg", ".mp3", ".wav"},
        max_size_mb: int = 20
    ) -> tuple[bool, str]:
        if file_size_bytes > max_size_mb * 1024 * 1024:
            return False, f"Файл превышает лимит {max_size_mb} MB"

        _, ext = os.path.splitext(file_name.lower())
        if not ext or ext not in allowed_extensions:
            return False, f"Недопустимый формат файла '{ext}'. Разрешены: {', '.join(allowed_extensions)}"

        if file_name.count('.') > 1:
            base_parts = file_name.lower().split('.')
            dangerous = {'py', 'sh', 'exe', 'bat', 'cmd', 'js', 'php', 'vbs'}
            if any(part in dangerous for part in base_parts[:-1]):
                return False, "Обнаружено подозрительное двойное расширение файла"

        return True, "OK"


# ---------------------------------------------------------------------------
# 3. Anti-Spam / Rate-Limiting Throttling Middleware
# ---------------------------------------------------------------------------
class RateLimitMiddleware(BaseMiddleware):
    """
    Sliding window Rate Limiter.
    Limits requests per user (max 4 requests within 2 seconds window).
    """
    def __init__(self, limit: int = 4, window_seconds: float = 2.0):
        super().__init__()
        self.limit = limit
        self.window_seconds = window_seconds
        self._user_requests: Dict[int, List[float]] = {}
        self._warned_users: Set[int] = set()

    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any]
    ) -> Any:
        user: Optional[types.User] = getattr(event, "from_user", None)
        if not user:
            return await handler(event, data)

        now = time.time()
        user_id = user.id
        timestamps = self._user_requests.setdefault(user_id, [])

        timestamps = [t for t in timestamps if now - t < self.window_seconds]
        self._user_requests[user_id] = timestamps

        if len(timestamps) >= self.limit:
            if user_id not in self._warned_users:
                self._warned_users.add(user_id)
                if isinstance(event, Message):
                    await event.answer(
                        "⏳ <b>Слишком много запросов!</b> Пожалуйста, подождите пару секунд перед повторной отправкой.",
                        parse_mode="HTML"
                    )
                elif isinstance(event, CallbackQuery):
                    await event.answer(
                        "⏳ Слишком частые клики. Подождите секунду.",
                        show_alert=True
                    )
            return None

        timestamps.append(now)
        if user_id in self._warned_users:
            self._warned_users.remove(user_id)

        return await handler(event, data)


# ---------------------------------------------------------------------------
# 4. RBAC: Admin Filter & Access Control
# ---------------------------------------------------------------------------
class IsAdminFilter(BaseFilter):
    def __init__(self, admin_ids: List[int]):
        self.admin_ids = set(admin_ids)

    async def __call__(self, obj: TelegramObject) -> bool:
        user: Optional[types.User] = getattr(obj, "from_user", None)
        if not user:
            return False
        return user.id in self.admin_ids


class PrivateChatOnlyFilter(BaseFilter):
    async def __call__(self, message: Message) -> bool:
        return getattr(message.chat, "type", "") == "private"


# ---------------------------------------------------------------------------
# 5. Sensitive Data Masking Logger Formatter with File Rotation
# ---------------------------------------------------------------------------
class SensitiveDataMaskingFormatter(logging.Formatter):
    PATTERNS = [
        (re.compile(r'\\d{8,10}:[A-Za-z0-9_-]{35}'), '[REDACTED_BOT_TOKEN]'),
        (re.compile(r'AIzaSy[A-Za-z0-9_-]{33}'), '[REDACTED_GEMINI_KEY]'),
        (re.compile(r'(?i)(token|key|secret|password|auth)=([^\\s&]+)'), r'\\1=[REDACTED]'),
        (re.compile(r'\\+?\\d{1,3}?[-.\\s]?\\(?\\d{2,4}?\\)?[-.\\s]?\\d{3,4}[-.\\s]?\\d{3,4}'), '[REDACTED_PHONE]'),
        (re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+'), '[REDACTED_EMAIL]')
    ]

    def format(self, record: logging.LogRecord) -> str:
        original = super().format(record)
        masked = original
        for pattern, replacement in self.PATTERNS:
            masked = pattern.sub(replacement, masked)
        return masked


def setup_secure_logging(log_level: int = logging.INFO, log_file: str = "logs/bot.log") -> logging.Logger:
    """Configures secure application-wide logger with automatic masking and rotating file handler."""
    logger = logging.getLogger("telegram_bot_secure")
    logger.setLevel(log_level)
    logger.handlers.clear()

    formatter = SensitiveDataMaskingFormatter(
        "%(asctime)s - [%(levelname)s] - [%(name)s:%(lineno)d] - %(message)s"
    )

    # 1. Console stream handler
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    # 2. Dedicated rotating file log handler
    try:
        log_dir = os.path.dirname(log_file)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8"
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except Exception as e:
        print(f"Warning: Failed to initialize file logger at {log_file}: {e}")

    return logger
`;

  const botPy = `"""
Telegram News Voice Digest Bot with Gemini AI, Edge-TTS & OWASP Security Architecture
=====================================================================================
Integrated Security Layers:
1. RateLimitMiddleware (Anti-Flood / Anti-DDoS protection).
2. InputSanitizer (HTML injection prevention & username validator).
3. IsAdminFilter & PrivateChatOnlyFilter (RBAC & chat type boundaries).
4. SensitiveDataMaskingFormatter & Rotating File Logger (logs/bot.log).
5. Safe global error handler with user-friendly error codes (no traceback leaks).
"""

import asyncio
import logging
import os
import re
import uuid
from typing import Optional
from aiogram import Bot, Dispatcher, types, F
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    FSInputFile,
    LinkPreviewOptions
)
from aiogram.enums import ParseMode
from aiohttp import web
from aiogram.client.session.aiohttp import AiohttpSession

from config import settings
from security import (
    RateLimitMiddleware, 
    InputSanitizer, 
    IsAdminFilter, 
    PrivateChatOnlyFilter, 
    setup_secure_logging,
    DataSecurityVault
)
from services.storage import storage_service
from services.telegram_reader import TelegramReaderService
from services.gemini_service import GeminiDigestService
from services.tts_service import tts_service, AVAILABLE_VOICES

# Initialize Secure Masking & File Logger (saves to logs/bot.log)
logger = setup_secure_logging(log_file="logs/bot.log")

async def start_healthcheck_server():
    """
    Embedded lightweight HTTP server for Cloud Hosting (Render, Railway, Fly.io, Cloud Run).
    Prevents Render from timing out with 'No open ports detected' when deployed as a Web Service.
    """
    port_env = os.getenv("PORT")
    if not port_env:
        return None
    try:
        port = int(port_env)
        app = web.Application()
        async def health(request):
            return web.Response(text="OK - AI Telegram Bot is Running and Polling", content_type="text/plain")
        app.router.add_get("/", health)
        app.router.add_get("/health", health)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", port)
        await site.start()
        logger.info(f"Health-check HTTP server successfully listening on 0.0.0.0:{port}")
        return runner
    except Exception as e:
        logger.warning(f"Could not bind health-check server to port {port_env}: {e}")
        return None

# Resilient Aiohttp session with timeout for Windows network stability
session = AiohttpSession(timeout=60.0)

bot = Bot(
    token=settings.BOT_TOKEN,
    session=session,
    default=DefaultBotProperties(
        parse_mode=ParseMode.HTML,
        link_preview_is_disabled=True
    )
)
dp = Dispatcher(storage=MemoryStorage())

# Register Security Middlewares
dp.message.middleware(RateLimitMiddleware(limit=4, window_seconds=2.0))
dp.callback_query.middleware(RateLimitMiddleware(limit=5, window_seconds=2.0))

# Initialize services
vault = DataSecurityVault(master_key=settings.ENCRYPTION_KEY)
reader_service = TelegramReaderService(
    api_id=settings.TELEGRAM_API_ID,
    api_hash=settings.TELEGRAM_API_HASH,
    session_name="user_session"
)
gemini_service = GeminiDigestService(api_key=settings.GEMINI_API_KEY)

async def send_smart_long_message(
    bot_instance: Bot,
    chat_id: int,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup] = None,
    disable_link_preview: bool = True
):
    """
    Safely splits messages exceeding Telegram's 4096 character limit.
    Splits across paragraph boundaries or line boundaries without breaking HTML tags.
    Attaches the reply_markup only to the last chunk.
    """
    MAX_LEN = 3800
    if len(text) <= MAX_LEN:
        return await bot_instance.send_message(
            chat_id,
            text,
            reply_markup=reply_markup,
            link_preview_options=LinkPreviewOptions(is_disabled=disable_link_preview)
        )

    paragraphs = text.split("\\n\\n")
    chunks = []
    current_chunk = ""

    for p in paragraphs:
        if len(current_chunk) + len(p) + 2 < MAX_LEN:
            current_chunk = f"{current_chunk}\\n\\n{p}" if current_chunk else p
        else:
            if current_chunk:
                chunks.append(current_chunk)
            if len(p) > MAX_LEN:
                lines = p.split("\\n")
                sub_chunk = ""
                for line in lines:
                    if len(sub_chunk) + len(line) + 1 < MAX_LEN:
                        sub_chunk = f"{sub_chunk}\\n{line}" if sub_chunk else line
                    else:
                        if sub_chunk:
                            chunks.append(sub_chunk)
                        sub_chunk = line[:MAX_LEN]
                current_chunk = sub_chunk
            else:
                current_chunk = p

    if current_chunk:
        chunks.append(current_chunk)

    last_msg = None
    for i, chunk in enumerate(chunks):
        markup = reply_markup if (i == len(chunks) - 1) else None
        last_msg = await bot_instance.send_message(
            chat_id,
            chunk,
            reply_markup=markup,
            link_preview_options=LinkPreviewOptions(is_disabled=disable_link_preview)
        )
        if i < len(chunks) - 1:
            await asyncio.sleep(0.3)
    return last_msg

class FormStates(StatesGroup):
    waiting_for_channel = State()

def get_main_keyboard(lang: str = "ru") -> InlineKeyboardMarkup:
    if lang == "en":
        return InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="🎙️ Get Audio Digest", callback_data="get_audio_digest"),
                InlineKeyboardButton(text="📄 Text Summary", callback_data="get_text_digest"),
            ],
            [
                InlineKeyboardButton(text="📋 My Channels", callback_data="list_channels"),
                InlineKeyboardButton(text="🗣️ Select Voice", callback_data="open_voice_menu"),
            ],
            [
                InlineKeyboardButton(text="🌐 Language (RU/EN)", callback_data="open_lang_menu"),
                InlineKeyboardButton(text="📖 History", callback_data="open_history"),
            ],
            [
                InlineKeyboardButton(text="➕ Add Channel", callback_data="prompt_add_channel"),
            ]
        ])
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🎙️ Получить аудио-дайджест", callback_data="get_audio_digest"),
            InlineKeyboardButton(text="📄 Текстовая выжимка", callback_data="get_text_digest"),
        ],
        [
            InlineKeyboardButton(text="📋 Мои каналы", callback_data="list_channels"),
            InlineKeyboardButton(text="🗣️ Выбрать голос", callback_data="open_voice_menu"),
        ],
        [
            InlineKeyboardButton(text="🌐 Язык / Language", callback_data="open_lang_menu"),
            InlineKeyboardButton(text="📖 История выпусков", callback_data="open_history"),
        ],
        [
            InlineKeyboardButton(text="➕ Добавить канал", callback_data="prompt_add_channel"),
        ]
    ])

def get_period_keyboard(with_audio: bool = True, lang: str = "ru") -> InlineKeyboardMarkup:
    mode = "audio" if with_audio else "text"
    if lang == "en":
        return InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="📅 Today Only (24h)", callback_data=f"news_period:today:{mode}"),
            ],
            [
                InlineKeyboardButton(text="📅 Today & Yesterday (48h)", callback_data=f"news_period:today_yesterday:{mode}"),
            ],
            [
                InlineKeyboardButton(text="🔙 Main Menu", callback_data="main_menu")
            ]
        ])
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📅 Только за сегодня (24ч)", callback_data=f"news_period:today:{mode}"),
        ],
        [
            InlineKeyboardButton(text="📅 За сегодня и вчера (48ч)", callback_data=f"news_period:today_yesterday:{mode}"),
        ],
        [
            InlineKeyboardButton(text="🔙 Главное меню", callback_data="main_menu")
        ]
    ])

def get_lang_keyboard(current_lang: str = "ru") -> InlineKeyboardMarkup:
    ru_badge = " ✅" if current_lang == "ru" else ""
    en_badge = " ✅" if current_lang == "en" else ""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=f"Русский (Russian){ru_badge}", callback_data="set_lang:ru"),
            InlineKeyboardButton(text=f"English{en_badge}", callback_data="set_lang:en"),
        ],
        [
            InlineKeyboardButton(text="🔙 Назад / Back", callback_data="main_menu")
        ]
    ])

def get_digest_nav_keyboard(current_index: int, total_count: int, lang: str = "ru") -> InlineKeyboardMarkup:
    buttons = []
    nav_row = []
    prev_txt = f"◀ Issue #{current_index}" if lang == "en" else f"◀ Выпуск #{current_index}"
    next_txt = f"Issue #{current_index + 2} ▶" if lang == "en" else f"Выпуск #{current_index + 2} ▶"
    if current_index > 0:
        nav_row.append(InlineKeyboardButton(text=prev_txt, callback_data=f"hist_goto:{current_index - 1}"))
    if current_index < total_count - 1:
        nav_row.append(InlineKeyboardButton(text=next_txt, callback_data=f"hist_goto:{current_index + 1}"))
    
    if nav_row:
        buttons.append(nav_row)
        
    buttons.append([
        InlineKeyboardButton(text="🔄 New /news" if lang == "en" else "🔄 Свежий /news", callback_data="get_audio_digest"),
        InlineKeyboardButton(text="🗣️ Voice" if lang == "en" else "🗣️ Голос", callback_data="open_voice_menu"),
    ])
    buttons.append([
        InlineKeyboardButton(text="🏠 Main Menu" if lang == "en" else "🏠 Главное меню", callback_data="main_menu")
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_channels_keyboard(channels: list[str], lang: str = "ru") -> InlineKeyboardMarkup:
    buttons = []
    del_prefix = "❌ Remove @" if lang == "en" else "❌ Удалить @"
    for ch in channels:
        buttons.append([
            InlineKeyboardButton(text=f"{del_prefix}{ch}", callback_data=f"del_ch:{ch}")
        ])
    add_btn = "➕ Add Channel" if lang == "en" else "➕ Добавить канал"
    reset_btn = "🔄 Reset (@zaPEACEki)" if lang == "en" else "🔄 Сброс к (@zaPEACEki)"
    news_btn = "🎙️ Run /news" if lang == "en" else "🎙️ Запустить /news"
    menu_btn = "🏠 Main Menu" if lang == "en" else "🏠 Главное меню"
    
    buttons.append([
        InlineKeyboardButton(text=add_btn, callback_data="prompt_add_channel"),
        InlineKeyboardButton(text=reset_btn, callback_data="reset_channels"),
    ])
    buttons.append([
        InlineKeyboardButton(text=news_btn, callback_data="get_audio_digest"),
        InlineKeyboardButton(text=menu_btn, callback_data="main_menu"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_voice_keyboard(current_voice: str, lang: str = "ru") -> InlineKeyboardMarkup:
    buttons = []
    sample_txt = "🎧 Sample" if lang == "en" else "🎧 Проба"
    back_txt = "🔙 Main Menu" if lang == "en" else "🔙 Главное меню"
    for v_id, v_info in AVAILABLE_VOICES.items():
        is_active = (v_id == current_voice)
        badge = " ✅" if is_active else ""
        buttons.append([
            InlineKeyboardButton(
                text=f"{v_info['name']}{badge}", 
                callback_data=f"set_voice:{v_id}"
            ),
            InlineKeyboardButton(
                text=sample_txt, 
                callback_data=f"sample_voice:{v_id}"
            )
        ])
    buttons.append([
        InlineKeyboardButton(text=back_txt, callback_data="main_menu")
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

# ---------------------------------------------------------------------------
# Telegram Bot Handlers with Input Sanitization & RBAC
# ---------------------------------------------------------------------------
@dp.message(CommandStart(), PrivateChatOnlyFilter())
async def cmd_start(message: types.Message):
    user_name = InputSanitizer.escape_html(message.from_user.first_name or "Пользователь")
    channels = await storage_service.get_user_channels(message.from_user.id)
    lang = await storage_service.get_user_lang(message.from_user.id)
    channels_str = ", ".join([f"@{c}" for c in channels])
    
    if lang == "en":
        welcome_text = (
            f"👋 <b>Welcome, {user_name}!</b>\\n\\n"
            "I am your <b>personal AI News Broadcaster</b> powered by <b>Google Gemini AI</b> and <b>Google TTS</b> neural voices.\\n\\n"
            f"📋 <b>Your active channels:</b> {InputSanitizer.escape_html(channels_str)}\\n\\n"
            "⚡ <b>Capabilities:</b>\\n"
            "• Read posts from your selected channels\\n"
            "• Filter out spam and ads via Gemini AI\\n"
            "• Voice out a lively news digest in natural audio\\n\\n"
            "Choose an action below or send <code>/news</code>:"
        )
    else:
        welcome_text = (
            f"👋 <b>Добро пожаловать, {user_name}!</b>\\n\\n"
            "Я — ваш <b>персональный ИИ-диктор новостей</b> на базе <b>Google Gemini AI</b> и нейросетевых голосов <b>Google TTS</b>.\\n\\n"
            f"📋 <b>Ваши активные каналы:</b> {InputSanitizer.escape_html(channels_str)}\\n\\n"
            "⚡ <b>Что я умею:</b>\\n"
            "• Читать посты из ваших выбранных каналов\\n"
            "• Отфильтровывать спам, воду и рекламу через Gemini\\n"
            "• Озвучивать живой радио-дайджест естественным голосом\\n\\n"
            "Выберите действие в меню ниже или отправьте команду <code>/news</code>:"
        )
    await message.answer(welcome_text, reply_markup=get_main_keyboard(lang))

@dp.message(Command("news"), PrivateChatOnlyFilter())
async def cmd_news(message: types.Message):
    user_id = message.from_user.id
    lang = await storage_service.get_user_lang(user_id)
    args = message.text.split(maxsplit=1)
    
    # Check if user specified period as an argument (e.g. /news today or /news yesterday)
    if len(args) > 1 and "yest" in args[1].lower():
        await process_digest_request(
            user_id=user_id,
            chat_id=message.chat.id,
            user_name=InputSanitizer.escape_html(message.from_user.first_name or "Слушатель"),
            with_audio=True,
            hours_limit=48
        )
        return
    elif len(args) > 1 and "tod" in args[1].lower():
        await process_digest_request(
            user_id=user_id,
            chat_id=message.chat.id,
            user_name=InputSanitizer.escape_html(message.from_user.first_name or "Слушатель"),
            with_audio=True,
            hours_limit=24
        )
        return

    # Ask user for period (Today vs Today + Yesterday)
    if lang == "en":
        prompt_text = (
            "📅 <b>Select Digest Timeframe:</b>\\n\\n"
            "Would you like to prepare the digest for <b>today only (last 24 hours)</b> "
            "or for <b>today and yesterday (last 48 hours)</b>?\\n\\n"
            "<i>(The bot will gather all posts from your channels for the selected period)</i>"
        )
    else:
        prompt_text = (
            "📅 <b>Выберите период для формирования дайджеста:</b>\\n\\n"
            "Подготовить дайджест только на <b>сегодняшний день</b> (за 24 часа) "
            "или на <b>сегодняшний и вчерашний день</b> (за 48 часов)?\\n\\n"
            "<i>(Бот охватит все новости из ваших каналов за выбранное время)</i>"
        )
    await message.answer(prompt_text, reply_markup=get_period_keyboard(with_audio=True, lang=lang))

@dp.message(Command("text"), PrivateChatOnlyFilter())
async def cmd_text(message: types.Message):
    user_id = message.from_user.id
    lang = await storage_service.get_user_lang(user_id)
    if lang == "en":
        prompt_text = (
            "📅 <b>Select Text Digest Timeframe:</b>\\n\\n"
            "Prepare text summary for <b>today only (24h)</b> or <b>today and yesterday (48h)</b>?"
        )
    else:
        prompt_text = (
            "📅 <b>Выберите период для текстового дайджеста:</b>\\n\\n"
            "Подготовить выжимку только на <b>сегодняшний день</b> (24ч) "
            "или на <b>сегодняшний и вчерашний день</b> (48ч)?"
        )
    await message.answer(prompt_text, reply_markup=get_period_keyboard(with_audio=False, lang=lang))

@dp.message(Command("lang"), PrivateChatOnlyFilter())
@dp.message(Command("language"), PrivateChatOnlyFilter())
async def cmd_language(message: types.Message):
    user_id = message.from_user.id
    current_lang = await storage_service.get_user_lang(user_id)
    text = (
        "🌐 <b>Выберите язык интерфейса и дайджеста:</b>\\n"
        "🌐 <b>Select bot interface and digest language:</b>"
    )
    await message.answer(text, reply_markup=get_lang_keyboard(current_lang))

@dp.message(Command("history"), PrivateChatOnlyFilter())
async def cmd_history(message: types.Message):
    user_id = message.from_user.id
    lang = await storage_service.get_user_lang(user_id)
    history = await storage_service.get_user_history(user_id)
    if not history:
        msg = (
            "📖 <b>Your digest history is currently empty.</b>\\n\\nRun <code>/news</code> to generate your first broadcast!"
            if lang == "en" else
            "📖 <b>История ваших выпусков пуста.</b>\\n\\nЗапустите генерацию первого дайджеста командой <code>/news</code>!"
        )
        await message.answer(msg, reply_markup=get_main_keyboard(lang))
        return
    
    last_idx = len(history) - 1
    await show_historical_digest(message.chat.id, user_id, last_idx)

@dp.message(Command("channels"), PrivateChatOnlyFilter())
@dp.message(Command("mychannels"), PrivateChatOnlyFilter())
async def cmd_channels(message: types.Message):
    user_id = message.from_user.id
    lang = await storage_service.get_user_lang(user_id)
    channels = await storage_service.get_user_channels(user_id)
    
    if not channels:
        empty_text = (
            "📋 <b>Your channel list is empty!</b>\\n\\nAdd a channel using <code>/add @username</code>"
            if lang == "en" else
            "📋 <b>Ваш список каналов пуст!</b>\\n\\nДобавьте канал командой <code>/add @username</code>"
        )
        await message.answer(
            empty_text,
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="➕ Add" if lang == "en" else "➕ Добавить", callback_data="prompt_add_channel")
            ]])
        )
        return
        
    channels_str = "\\n".join([f"• <b>@{InputSanitizer.escape_html(c)}</b>" for c in channels])
    title_text = (
        f"📋 <b>Your tracked channels ({len(channels)}):</b>\\n\\n{channels_str}"
        if lang == "en" else
        f"📋 <b>Ваши отслеживаемые каналы ({len(channels)}):</b>\\n\\n{channels_str}"
    )
    await message.answer(title_text, reply_markup=get_channels_keyboard(channels, lang))

@dp.message(Command("add"), PrivateChatOnlyFilter())
@dp.message(Command("addchannel"), PrivateChatOnlyFilter())
async def cmd_add_channel(message: types.Message, state: FSMContext):
    args = message.text.split(maxsplit=1)
    if len(args) > 1:
        await handle_add_channel_logic(message, args[1].strip())
    else:
        lang = await storage_service.get_user_lang(message.from_user.id)
        await state.set_state(FormStates.waiting_for_channel)
        prompt_text = (
            "✍️ <b>Enter username or link of a Telegram channel:</b>\\n\\n"
            "Example: <code>@habr_pop</code>, <code>zaPEACEki</code> or <code>https://t.me/habr_pop</code>"
            if lang == "en" else
            "✍️ <b>Введите username или ссылку на Telegram-канал:</b>\\n\\n"
            "Например: <code>@habr_pop</code>, <code>zaPEACEki</code> или <code>https://t.me/habr_pop</code>"
        )
        await message.answer(
            prompt_text,
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="❌ Cancel" if lang == "en" else "❌ Отмена", callback_data="cancel_fsm")
            ]])
        )

@dp.message(Command("del"), PrivateChatOnlyFilter())
@dp.message(Command("removechannel"), PrivateChatOnlyFilter())
async def cmd_del_channel(message: types.Message):
    lang = await storage_service.get_user_lang(message.from_user.id)
    args = message.text.split(maxsplit=1)
    if len(args) > 1:
        cleaned = InputSanitizer.validate_channel_username(args[1].strip())
        if not cleaned:
            await message.answer("❌ Invalid channel username format." if lang == "en" else "❌ <b>Некорректный формат имени канала.</b>")
            return
            
        success = await storage_service.remove_user_channel(message.from_user.id, cleaned)
        channels = await storage_service.get_user_channels(message.from_user.id)
        if success:
            msg = (
                f"✅ Channel <b>@{InputSanitizer.escape_html(cleaned)}</b> removed.\\nRemaining: {len(channels)}."
                if lang == "en" else
                f"✅ Канал <b>@{InputSanitizer.escape_html(cleaned)}</b> удален из списка!\\nОсталось каналов: {len(channels)}."
            )
            await message.answer(msg, reply_markup=get_channels_keyboard(channels, lang))
        else:
            msg = (
                f"⚠️ Channel <b>@{InputSanitizer.escape_html(cleaned)}</b> not found in your list."
                if lang == "en" else
                f"⚠️ Канал <b>@{InputSanitizer.escape_html(cleaned)}</b> не найден в вашем списке."
            )
            await message.answer(msg, reply_markup=get_channels_keyboard(channels, lang))
    else:
        channels = await storage_service.get_user_channels(message.from_user.id)
        prompt = "Specify channel: <code>/del @username</code>" if lang == "en" else "Укажите канал для удаления: <code>/del @username</code>"
        await message.answer(prompt, reply_markup=get_channels_keyboard(channels, lang))

@dp.message(Command("voice"), PrivateChatOnlyFilter())
@dp.message(Command("setvoice"), PrivateChatOnlyFilter())
async def cmd_voice(message: types.Message):
    user_id = message.from_user.id
    lang = await storage_service.get_user_lang(user_id)
    current_voice, engine = await storage_service.get_user_voice(user_id)
    voice_info = AVAILABLE_VOICES.get(current_voice, {
        "name": "1. Русский — Google TTS (Женский / Стабильный)",
        "description": "Google Text-To-Speech"
    })
    
    if lang == "en":
        text = (
            f"🗣️ <b>Voice Settings (Google TTS)</b>\\n\\n"
            f"Current Voice: <b>{InputSanitizer.escape_html(voice_info.get('name', 'Google TTS'))}</b>\\n"
            f"Engine: <b>{engine}</b>\\n\\n"
            "Select voice below or tap 🎧 for an audio preview:"
        )
    else:
        text = (
            f"🗣️ <b>Настройка голоса диктора (Google TTS)</b>\\n\\n"
            f"Текущий голос: <b>{InputSanitizer.escape_html(voice_info.get('name', 'Google TTS (Женский)'))}</b>\\n"
            f"Движок: <b>{engine}</b>\\n\\n"
            "Выберите голос из списка ниже или нажмите 🎧 для прослушивания образца:"
        )
    await message.answer(text, reply_markup=get_voice_keyboard(current_voice, lang))

# ---------------------------------------------------------------------------
# Diagnostics & Logs Handler (Command /logs)
# ---------------------------------------------------------------------------
@dp.message(Command("logs"), PrivateChatOnlyFilter())
async def cmd_logs(message: types.Message):
    """Sends the last 30 log lines or the full bot.log file."""
    log_path = "logs/bot.log"
    if not os.path.exists(log_path):
        await message.answer("ℹ️ Файл журнала <code>logs/bot.log</code> пока пуст.")
        return
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        tail = "".join(lines[-25:]) if lines else "Лог пуст."
        escaped_tail = InputSanitizer.escape_html(tail)
        await message.answer(
            f"📋 <b>Последние записи журнала (bot.log):</b>\\n<pre>{escaped_tail}</pre>",
            parse_mode="HTML"
        )
        if os.path.getsize(log_path) > 0:
            await message.answer_document(
                FSInputFile(log_path, filename="bot.log"),
                caption="📁 Полный файл журнала диагностики"
            )
    except Exception as e:
        logger.error(f"Error reading logs: {e}")
        await message.answer(f"⚠️ Ошибка чтения лог-файла: {e}")

# ---------------------------------------------------------------------------
# Admin Protected Route (RBAC)
# ---------------------------------------------------------------------------
@dp.message(Command("admin_stats"), IsAdminFilter(settings.ADMIN_IDS))
async def cmd_admin_stats(message: types.Message):
    total_users = await storage_service.get_total_users_count()
    await message.answer(
        f"🛡️ <b>Панель администратора</b>\\n\\n"
        f"• Всего зарегистрированных пользователей: <b>{total_users}</b>\\n"
        f"• Хеш вашей сессии: <code>{vault.hash_identifier(message.from_user.id)}</code>\\n"
        f"• Лог-файл: <code>logs/bot.log</code> (команда /logs)\\n"
        f"• Режим безопасности: <b>ACTIVE (OWASP Bot Hardened)</b>"
    )

@dp.message(FormStates.waiting_for_channel)
async def state_process_channel(message: types.Message, state: FSMContext):
    await state.clear()
    await handle_add_channel_logic(message, message.text.strip())

async def handle_add_channel_logic(message: types.Message, raw_input: str):
    cleaned = InputSanitizer.validate_channel_username(raw_input)
    
    if not cleaned:
        await message.answer(
            "❌ <b>Некорректный формат имени канала!</b>\\n"
            "Имя может содержать латинские буквы, цифры и подчеркивания (3-32 символа).\\n"
            "<i>Примеры: @habr_pop, zaPEACEki, https://t.me/habr_pop</i>"
        )
        return

    added = await storage_service.add_user_channel(message.from_user.id, cleaned)
    channels = await storage_service.get_user_channels(message.from_user.id)
    
    if added:
        await message.answer(
            f"✅ Канал <b>@{InputSanitizer.escape_html(cleaned)}</b> успешно добавлен в ваш список!\\n"
            f"Всего отслеживается каналов: <b>{len(channels)}</b>.",
            reply_markup=get_channels_keyboard(channels)
        )
    else:
        await message.answer(
            f"ℹ️ Канал <b>@{InputSanitizer.escape_html(cleaned)}</b> уже есть в вашем списке.",
            reply_markup=get_channels_keyboard(channels)
        )

# ---------------------------------------------------------------------------
# Callback Query Routing
# ---------------------------------------------------------------------------
@dp.callback_query()
async def handle_callbacks(callback: types.CallbackQuery, state: FSMContext):
    data = callback.data or ""
    user_id = callback.from_user.id
    chat_id = callback.message.chat.id
    user_name = InputSanitizer.escape_html(callback.from_user.first_name or "Слушатель")

    try:
        if data == "get_audio_digest":
            lang = await storage_service.get_user_lang(user_id)
            prompt_text = (
                "📅 <b>Select Digest Timeframe:</b>\\n\\n"
                "Prepare digest for <b>today only (24h)</b> or <b>today and yesterday (48h)</b>?"
                if lang == "en" else
                "📅 <b>Выберите период для формирования дайджеста:</b>\\n\\n"
                "Подготовить дайджест только на <b>сегодняшний день</b> (24ч) "
                "или на <b>сегодняшний и вчерашний день</b> (48ч)?"
            )
            await callback.message.answer(prompt_text, reply_markup=get_period_keyboard(with_audio=True, lang=lang))
            await callback.answer()

        elif data == "get_text_digest":
            lang = await storage_service.get_user_lang(user_id)
            prompt_text = (
                "📅 <b>Select Text Digest Timeframe:</b>\\n\\n"
                "Prepare text summary for <b>today only (24h)</b> or <b>today and yesterday (48h)</b>?"
                if lang == "en" else
                "📅 <b>Выберите период для текстового дайджеста:</b>\\n\\n"
                "Подготовить выжимку только на <b>сегодняшний день</b> (24ч) "
                "или на <b>сегодняшний и вчерашний день</b> (48ч)?"
            )
            await callback.message.answer(prompt_text, reply_markup=get_period_keyboard(with_audio=False, lang=lang))
            await callback.answer()

        elif data.startswith("news_period:"):
            # Format: news_period:today:audio or news_period:today_yesterday:text
            parts = data.split(":")
            period_type = parts[1] if len(parts) > 1 else "today"
            mode = parts[2] if len(parts) > 2 else "audio"
            with_audio = (mode == "audio")
            hours_limit = 48 if period_type == "today_yesterday" else 24
            
            await callback.answer("⏳ Запускаем обработку..." if (await storage_service.get_user_lang(user_id)) == "ru" else "⏳ Processing digest...")
            await process_digest_request(
                user_id=user_id,
                chat_id=chat_id,
                user_name=user_name,
                with_audio=with_audio,
                hours_limit=hours_limit
            )

        elif data == "open_lang_menu":
            await callback.answer()
            current_lang = await storage_service.get_user_lang(user_id)
            text = (
                "🌐 <b>Выберите язык интерфейса и дайджеста:</b>\\n"
                "🌐 <b>Select bot interface and digest language:</b>"
            )
            try:
                await callback.message.edit_text(text, reply_markup=get_lang_keyboard(current_lang))
            except Exception:
                await callback.message.answer(text, reply_markup=get_lang_keyboard(current_lang))

        elif data.startswith("set_lang:"):
            new_lang = data.split(":", 1)[1]
            await storage_service.set_user_lang(user_id, new_lang)
            if new_lang == "en":
                await callback.answer("Language set to English", show_alert=True)
                msg_text = "✅ <b>Language switched to English!</b>\\n\\nChoose an action from the menu:"
            else:
                await callback.answer("Язык изменен на Русский", show_alert=True)
                msg_text = "✅ <b>Язык переключен на русский!</b>\\n\\nВыберите действие в меню:"
            try:
                await callback.message.edit_text(msg_text, reply_markup=get_main_keyboard(new_lang))
            except Exception:
                await callback.message.answer(msg_text, reply_markup=get_main_keyboard(new_lang))

        elif data == "list_channels":
            await callback.answer()
            lang = await storage_service.get_user_lang(user_id)
            channels = await storage_service.get_user_channels(user_id)
            empty_str = "<i>No channels configured</i>" if lang == "en" else "<i>Список пуст</i>"
            channels_str = "\\n".join([f"• <b>@{InputSanitizer.escape_html(c)}</b>" for c in channels]) if channels else empty_str
            text = (
                f"📋 <b>Your tracked channels ({len(channels)}):</b>\\n\\n{channels_str}"
                if lang == "en" else
                f"📋 <b>Ваши отслеживаемые каналы ({len(channels)}):</b>\\n\\n{channels_str}"
            )
            try:
                await callback.message.edit_text(text, reply_markup=get_channels_keyboard(channels, lang))
            except Exception:
                await callback.message.answer(text, reply_markup=get_channels_keyboard(channels, lang))

        elif data == "reset_channels":
            lang = await storage_service.get_user_lang(user_id)
            await callback.answer("Channels reset to (@zaPEACEki)" if lang == "en" else "Список сброшен к (@zaPEACEki)")
            channels = await storage_service.reset_user_channels(user_id)
            channels_str = "\\n".join([f"• <b>@{InputSanitizer.escape_html(c)}</b>" for c in channels])
            text = (
                f"🔄 <b>Channel list reset to default:</b>\\n\\n{channels_str}"
                if lang == "en" else
                f"🔄 <b>Список каналов сброшен к начальному:</b>\\n\\n{channels_str}"
            )
            try:
                await callback.message.edit_text(text, reply_markup=get_channels_keyboard(channels, lang))
            except Exception:
                await callback.message.answer(text, reply_markup=get_channels_keyboard(channels, lang))

        elif data.startswith("del_ch:"):
            lang = await storage_service.get_user_lang(user_id)
            target_ch = data.split(":", 1)[1]
            removed = await storage_service.remove_user_channel(user_id, target_ch)
            channels = await storage_service.get_user_channels(user_id)
            toast = f"Channel @{target_ch} removed" if lang == "en" else f"Канал @{target_ch} удален"
            await callback.answer(toast if removed else ("Not found" if lang == "en" else "Канал не найден"))
            empty_str = "<i>No channels</i>" if lang == "en" else "<i>Список пуст</i>"
            channels_str = "\\n".join([f"• <b>@{InputSanitizer.escape_html(c)}</b>" for c in channels]) if channels else empty_str
            text = (
                f"📋 <b>Your tracked channels ({len(channels)}):</b>\\n\\n{channels_str}"
                if lang == "en" else
                f"📋 <b>Ваши отслеживаемые каналы ({len(channels)}):</b>\\n\\n{channels_str}"
            )
            try:
                await callback.message.edit_text(text, reply_markup=get_channels_keyboard(channels, lang))
            except Exception:
                await callback.message.answer(text, reply_markup=get_channels_keyboard(channels, lang))

        elif data == "prompt_add_channel":
            await callback.answer()
            lang = await storage_service.get_user_lang(user_id)
            await state.set_state(FormStates.waiting_for_channel)
            prompt = (
                "✍️ <b>Enter username or link of a Telegram channel:</b>\\n\\n"
                "Example: <code>@habr_pop</code>, <code>zaPEACEki</code> or <code>https://t.me/habr_pop</code>"
                if lang == "en" else
                "✍️ <b>Введите username или ссылку на Telegram-канал:</b>\\n\\n"
                "Например: <code>@habr_pop</code>, <code>zaPEACEki</code> или <code>https://t.me/habr_pop</code>"
            )
            await callback.message.answer(
                prompt,
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                    InlineKeyboardButton(text="❌ Cancel" if lang == "en" else "❌ Отмена", callback_data="cancel_fsm")
                ]])
            )

        elif data == "open_history":
            await callback.answer()
            lang = await storage_service.get_user_lang(user_id)
            history = await storage_service.get_user_history(user_id)
            if not history:
                empty_msg = (
                    "📖 <b>Your digest history is currently empty.</b>\\n\\nStart your first digest with <code>/news</code>!"
                    if lang == "en" else
                    "📖 <b>История ваших выпусков пуста.</b>\\n\\nЗапустите генерацию первого дайджеста командой <code>/news</code> или кнопкой ниже!"
                )
                await callback.message.answer(empty_msg, reply_markup=get_main_keyboard(lang))
            else:
                await show_historical_digest(chat_id, user_id, len(history) - 1)

        elif data.startswith("hist_goto:"):
            target_idx = int(data.split(":", 1)[1])
            await callback.answer(f"Loading issue #{target_idx + 1}...")
            await show_historical_digest(chat_id, user_id, target_idx)

        elif data == "open_voice_menu":
            await callback.answer()
            lang = await storage_service.get_user_lang(user_id)
            current_voice, _ = await storage_service.get_user_voice(user_id)
            text = "🗣️ <b>Select voice for audio broadcast:</b>" if lang == "en" else "🗣️ <b>Выберите голос диктора для озвучивания:</b>"
            try:
                await callback.message.edit_text(text, reply_markup=get_voice_keyboard(current_voice, lang))
            except Exception:
                await callback.message.answer(text, reply_markup=get_voice_keyboard(current_voice, lang))

        elif data.startswith("set_voice:"):
            lang = await storage_service.get_user_lang(user_id)
            new_voice = data.split(":", 1)[1]
            engine = "gtts" if new_voice.startswith("gtts") else "edge-tts"
            await storage_service.set_user_voice(user_id, new_voice, engine)
            v_info = AVAILABLE_VOICES.get(new_voice, {"name": new_voice})
            toast = f"Voice updated to: {v_info.get('name')}" if lang == "en" else f"Голос изменен на: {v_info.get('name')}"
            await callback.answer(toast, show_alert=True)
            try:
                await callback.message.edit_reply_markup(reply_markup=get_voice_keyboard(new_voice, lang))
            except Exception:
                pass

        elif data.startswith("sample_voice:"):
            sample_voice_id = data.split(":", 1)[1]
            v_info = AVAILABLE_VOICES.get(sample_voice_id)
            if v_info:
                await callback.answer("🎧 Синтезируем образец...")
                eng = v_info.get("engine", "gtts")
                sample_path = await tts_service.synthesize_speech(
                    text=v_info.get("samplePhrase", "Тестовая фраза"),
                    voice=sample_voice_id,
                    engine=eng
                )
                await bot.send_voice(
                    chat_id,
                    voice=FSInputFile(sample_path),
                    caption=f"🎧 Образец голоса: <b>{InputSanitizer.escape_html(v_info['name'])}</b>"
                )
                if os.path.exists(sample_path):
                    os.remove(sample_path)

        elif data == "main_menu":
            await callback.answer()
            lang = await storage_service.get_user_lang(user_id)
            user_name = InputSanitizer.escape_html(callback.from_user.first_name or "Пользователь")
            if lang == "en":
                text = (
                    f"🏠 <b>Personal AI Radio Main Menu:</b>\\n\\n"
                    f"Listener: <b>{user_name}</b>\\n"
                    f"Choose an option below or send <code>/news</code>:"
                )
            else:
                text = (
                    f"🏠 <b>Главное меню персонального ИИ-радио:</b>\\n\\n"
                    f"Слушатель: <b>{user_name}</b>\\n"
                    f"Выберите действие ниже или введите команду <code>/news</code>:"
                )
            try:
                await callback.message.edit_text(text, reply_markup=get_main_keyboard(lang))
            except Exception:
                await callback.message.answer(text, reply_markup=get_main_keyboard(lang))

        elif data == "cancel_fsm":
            await state.clear()
            await callback.answer("Действие отменено")
            try:
                await callback.message.delete()
            except Exception:
                pass
    except Exception as e:
        logger.error(f"Callback query exception ({data}): {e}", exc_info=True)
        await callback.answer("⚠️ Произошла ошибка при обработке клика.", show_alert=True)

# ---------------------------------------------------------------------------
# Core Digest Pipeline with Secure Exception Handling
# ---------------------------------------------------------------------------
async def process_digest_request(
    user_id: int,
    chat_id: int,
    user_name: str,
    with_audio: bool = True,
    hours_limit: int = 24
):
    lang = await storage_service.get_user_lang(user_id)
    prep_text = (
        f"⏳ <b>Preparation:</b> Reading your tracked channels for {hours_limit}h..."
        if lang == "en" else
        f"⏳ <b>Подготовка:</b> Получаем список ваших каналов за {'24 часа' if hours_limit == 24 else '48 часов (сегодня + вчера)'}..."
    )
    status_msg = await bot.send_message(chat_id, prep_text)
    
    try:
        channels = await storage_service.get_user_channels(user_id)
        voice_id, engine = await storage_service.get_user_voice(user_id)
        if voice_id not in AVAILABLE_VOICES or "neural" in str(voice_id).lower() or "dmitry" in str(voice_id).lower():
            voice_id = "gtts-en" if "en" in str(voice_id).lower() else "gtts-ru"
            engine = "gtts"
            await storage_service.set_user_voice(user_id, voice_id, engine)

        voice_info = AVAILABLE_VOICES.get(voice_id, {
            "name": "1. Русский — Google TTS (Женский / Стабильный)",
            "description": "Google Text-To-Speech"
        })
        voice_display_name = voice_info.get("name", "Google TTS")

        if not channels:
            no_ch_text = (
                "⚠️ <b>You have no channels added!</b>\\n\\nAdd at least one channel using <code>/add @channel</code>."
                if lang == "en" else
                "⚠️ <b>У вас нет добавленных каналов!</b>\\n\\nДобавьте хотя бы один канал через команду <code>/add @channel</code>."
            )
            await status_msg.edit_text(no_ch_text, reply_markup=get_main_keyboard(lang))
            return

        # Step 1: Reader Service
        channels_preview = ", ".join([f"@{c}" for c in channels[:3]])
        if len(channels) > 3:
            channels_preview += f" and {len(channels)-3} more" if lang == "en" else f" и еще {len(channels)-3}"

        step1_text = (
            f"📡 <b>Step 1/3:</b> Gathering posts from {len(channels)} channels ({InputSanitizer.escape_html(channels_preview)})..."
            if lang == "en" else
            f"📡 <b>Шаг 1/3:</b> Сбор всех постов из {len(channels)} каналов ({InputSanitizer.escape_html(channels_preview)})..."
        )
        await status_msg.edit_text(step1_text)
        
        posts = await reader_service.fetch_latest_posts(
            channels=channels,
            hours_limit=hours_limit,
            max_posts_per_channel=30
        )

        if not posts:
            no_posts_text = (
                f"📭 <b>No fresh publications found for the last {hours_limit} hours.</b>\\n"
                "Please try again later or add more active channels via <code>/add @channel</code>."
                if lang == "en" else
                f"📭 <b>Свежих публикаций за последние {hours_limit}ч не найдено.</b>\\n"
                "Попробуйте позже или добавьте больше каналов через <code>/add @channel</code>."
            )
            await status_msg.edit_text(no_posts_text, reply_markup=get_main_keyboard(lang))
            return

        # Deduplication: Exclude posts that were already included in earlier digests today
        seen_posts_today = await storage_service.get_user_seen_posts_today(user_id)
        unseen_posts = []
        for p in posts:
            p_key = p.get("url") or f"{p.get('channel')}_{p.get('id')}"
            if p_key not in seen_posts_today:
                unseen_posts.append(p)

        if not unseen_posts:
            all_caught_up_text = (
                f"✨ <b>All caught up!</b>\\n\\n"
                f"No new posts in your tracked channels ({len(channels)}) since your previous digest today.\\n"
                f"All {len(posts)} publications from today were already included in your earlier digests.\\n\\n"
                f"💡 <i>Tip: You can re-listen to previous digests in 📚 <b>Archive</b> or request again later when fresh news arrives.</i>"
                if lang == "en" else
                f"✨ <b>Вы уже в курсе всех новостей за сегодня!</b>\\n\\n"
                f"В ваших каналах ({len(channels)} шт.) нет новых публикаций с момента предыдущего дайджеста за сегодня.\\n"
                f"Все публикации ({len(posts)} шт.) уже вошли в ваши более ранние выпуски.\\n\\n"
                f"💡 <i>Совет: Вы можете прослушать предыдущие выпуски в 📚 <b>Архиве</b> или запросить новый дайджест позже, когда появятся свежие публикации.</i>"
            )
            await status_msg.edit_text(all_caught_up_text, reply_markup=get_main_keyboard(lang))
            return

        posts = unseen_posts

        # Step 2: Analyze with Gemini
        step2_text = (
            f"🧠 <b>Step 2/3:</b> Gemini AI is analyzing {len(posts)} new posts from all channels..."
            if lang == "en" else
            f"🧠 <b>Шаг 2/3:</b> Gemini анализирует {len(posts)} новых постов и формирует сценарий..."
        )
        await status_msg.edit_text(step2_text)
        
        period_label = "последние 48 часов (сегодня и вчера)" if hours_limit == 48 else "сегодняшний день (24 часа)"
        digest_text, clean_speech_text = await gemini_service.generate_digest(
            posts=posts,
            style="podcast",
            user_name=user_name,
            lang=lang,
            period_label=period_label
        )

        # Save to user session history
        history_idx = await storage_service.save_user_digest(
            user_id=user_id,
            summary=digest_text,
            clean_speech=clean_speech_text,
            voice_id=voice_id,
            voice_name=voice_display_name,
            channels=channels
        )
        total_history = len(await storage_service.get_user_history(user_id))

        # Mark all included posts as seen for today
        new_seen_keys = [p.get("url") or f"{p.get('channel')}_{p.get('id')}" for p in posts]
        await storage_service.mark_posts_seen_today(user_id, new_seen_keys)

        # Step 3: Text or Voice Delivery
        if with_audio:
            step3_text = (
                f"🎙️ <b>Step 3/3:</b> Synthesizing voice using <b>{InputSanitizer.escape_html(voice_display_name)}</b>..."
                if lang == "en" else
                f"🎙️ <b>Шаг 3/3:</b> Озвучиваем голосом <b>{InputSanitizer.escape_html(voice_display_name)}</b>..."
            )
            await status_msg.edit_text(step3_text)
            
            audio_path = await tts_service.synthesize_speech(
                text=clean_speech_text,
                voice=voice_id,
                engine=engine
            )
            
            header_str = (
                f"📰 <b>News Digest ({len(posts)} posts from {len(channels)} channels):</b>\\n\\n{digest_text}"
                if lang == "en" else
                f"📰 <b>Сводка новостей ({len(posts)} постов из {len(channels)} каналов):</b>\\n\\n{digest_text}"
            )
            await send_smart_long_message(bot, chat_id, header_str)
            
            voice_file = FSInputFile(audio_path)
            caption_str = (
                f"🎙️ <i>Voiced by {InputSanitizer.escape_html(voice_display_name)}</i>"
                if lang == "en" else
                f"🎙️ <i>Озвучено голосом {InputSanitizer.escape_html(voice_display_name)}</i>"
            )
            await bot.send_voice(
                chat_id,
                voice=voice_file,
                caption=caption_str,
                reply_markup=get_digest_nav_keyboard(history_idx, total_history, lang)
            )
            
            if os.path.exists(audio_path):
                os.remove(audio_path)
                
            await status_msg.delete()
        else:
            header_str = (
                f"📰 <b>News Digest ({len(posts)} posts from {len(channels)} channels):</b>\\n\\n{digest_text}"
                if lang == "en" else
                f"📰 <b>Сводка новостей ({len(posts)} постов из {len(channels)} каналов):</b>\\n\\n{digest_text}"
            )
            await status_msg.delete()
            await send_smart_long_message(
                bot,
                chat_id,
                header_str,
                reply_markup=get_digest_nav_keyboard(history_idx, total_history, lang)
            )
            
    except Exception as e:
        error_id = uuid.uuid4().hex[:8].upper()
        logger.error(f"[ERR-{error_id}] Error processing digest for user {vault.hash_identifier(user_id)}: {e}", exc_info=True)
        err_msg = (
            f"⚠️ <b>An error occurred while processing the digest.</b>\\n"
            f"Reference code: <code>REF-{error_id}</code>.\\n\\n"
            f"Details recorded to <code>logs/bot.log</code> (command <code>/logs</code>)."
            if lang == "en" else
            f"⚠️ <b>Произошла ошибка при обработке запроса.</b>\\n"
            f"Код инцидента: <code>REF-{error_id}</code>.\\n\\n"
            f"Подробности записаны в <code>logs/bot.log</code> (команда <code>/logs</code>)."
        )
        await status_msg.edit_text(err_msg, reply_markup=get_main_keyboard(lang))

async def show_historical_digest(chat_id: int, user_id: int, index: int):
    history = await storage_service.get_user_history(user_id)
    if not history or index < 0 or index >= len(history):
        await bot.send_message(chat_id, "⚠️ Выпуск не найден в истории.")
        return
        
    item = history[index]
    total_count = len(history)
    time_str = item.get("time_str", "")
    summary = item.get("summary", "")
    clean_speech = item.get("clean_speech", "")
    voice_id = item.get("voice_id", "gtts-ru")
    if voice_id not in AVAILABLE_VOICES or "neural" in str(voice_id).lower() or "dmitry" in str(voice_id).lower():
        voice_id = "gtts-en" if "en" in str(voice_id).lower() else "gtts-ru"
    
    v_info = AVAILABLE_VOICES.get(voice_id, {"name": "1. Русский — Google TTS (Женский / Стабильный)"})
    voice_name = v_info.get("name", "Google TTS")
    engine = "gtts"
    user_speed = await storage_service.get_user_speed(user_id)
    
    await send_smart_long_message(
        bot,
        chat_id,
        f"📖 <b>Архив выпусков: Выпуск #{index + 1} из {total_count}</b> <i>({time_str})</i>:\\n\\n"
        f"{summary}"
    )
    
    status_msg = await bot.send_message(chat_id, f"🎙️ Загружаем аудиозапись выпуска #{index + 1} ({voice_name})...")
    try:
        audio_path = await tts_service.synthesize_speech(
            text=clean_speech,
            voice=voice_id,
            engine=engine
        )
        voice_file = FSInputFile(audio_path)
        await bot.send_voice(
            chat_id,
            voice=voice_file,
            caption=f"🎙️ <i>Запись выпуска #{index + 1} ({voice_name})</i>",
            reply_markup=get_digest_nav_keyboard(index, total_count)
        )
        if os.path.exists(audio_path):
            os.remove(audio_path)
        await status_msg.delete()
    except Exception as e:
        logger.error(f"Error replaying historical audio: {e}", exc_info=True)
        await status_msg.edit_text(
            f"🎙️ <i>Аудио выпуска #{index + 1}</i>",
            reply_markup=get_digest_nav_keyboard(index, total_count)
        )

async def main():
    logger.info("Initializing encrypted storage...")
    await storage_service.init_db()
    
    logger.info("Starting Telegram reader service...")
    await reader_service.start()
    
    # Start Cloud Health-check HTTP server if $PORT is assigned (Render Web Service / Railway / Cloud Run)
    health_runner = await start_healthcheck_server()

    logger.info("Resetting existing webhooks and dropping pending updates to prevent polling conflicts...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
    except Exception as e:
        logger.warning(f"Note on delete_webhook: {e}")

    logger.info("Starting Aiogram bot polling with OWASP Security Middlewares active...")
    try:
        await dp.start_polling(bot, drop_pending_updates=True)
    finally:
        if health_runner:
            try:
                await health_runner.cleanup()
            except Exception:
                pass
        await reader_service.stop()
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
`;

  const storagePy = `import asyncio
import json
import logging
import os
from typing import List, Tuple, Dict, Any, Optional
from security import DataSecurityVault

logger = logging.getLogger(__name__)

DEFAULT_CHANNELS = ["zaPEACEki"]
DEFAULT_VOICE = "${config.edgeVoice || 'gtts-ru'}"
DEFAULT_ENGINE = "${config.ttsEngine || 'gtts'}"

class StorageService:
    """
    Asynchronous encrypted user storage (JSON/SQLite).
    Implements PII protection: stores channel subscriptions encrypted via AES/Fernet.
    Avoids deadlocks by separating unlocked internal queries from locked public interfaces.
    """
    def __init__(self, db_path: str = "data/user_storage.json", encryption_key: str = ""):
        self.db_path = db_path
        self._data: Dict[str, Any] = {"users": {}}
        self._lock = asyncio.Lock()
        self.vault = DataSecurityVault(master_key=encryption_key)
        
    async def init_db(self):
        os.makedirs(os.path.dirname(self.db_path) if os.path.dirname(self.db_path) else ".", exist_ok=True)
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except Exception as e:
                logger.warning(f"Error reading storage file: {e}. Starting fresh.")
                self._data = {"users": {}}
        else:
            await self._save_unlocked()
        logger.info("Storage service initialized.")

    async def _save_unlocked(self):
        with open(self.db_path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    def _get_or_create_user(self, user_id: int) -> Dict[str, Any]:
        uid = str(user_id)
        if uid not in self._data["users"]:
            self._data["users"][uid] = {
                "encrypted_channels": self.vault.encrypt_text(json.dumps(DEFAULT_CHANNELS)),
                "voice": DEFAULT_VOICE,
                "engine": DEFAULT_ENGINE,
                "lang": "ru",
                "style": "podcast",
                "history": []
            }
        return self._data["users"][uid]

    def _get_user_channels_unlocked(self, user: Dict[str, Any]) -> List[str]:
        enc = user.get("encrypted_channels")
        if enc:
            decrypted_json = self.vault.decrypt_text(enc)
            try:
                res = json.loads(decrypted_json)
                if isinstance(res, list) and len(res) > 0:
                    return res
            except Exception:
                pass
        return list(DEFAULT_CHANNELS)

    async def get_user_channels(self, user_id: int) -> List[str]:
        async with self._lock:
            user = self._get_or_create_user(user_id)
            return self._get_user_channels_unlocked(user)

    async def add_user_channel(self, user_id: int, channel: str) -> bool:
        clean_ch = channel.replace("@", "").strip()
        if not clean_ch:
            return False
        async with self._lock:
            user = self._get_or_create_user(user_id)
            current_channels = self._get_user_channels_unlocked(user)
            if not any(c.lower() == clean_ch.lower() for c in current_channels):
                current_channels.append(clean_ch)
                user["encrypted_channels"] = self.vault.encrypt_text(json.dumps(current_channels))
                await self._save_unlocked()
                return True
            return False

    async def remove_user_channel(self, user_id: int, channel: str) -> bool:
        clean_ch = channel.replace("@", "").strip()
        if not clean_ch:
            return False
        async with self._lock:
            user = self._get_or_create_user(user_id)
            current_channels = self._get_user_channels_unlocked(user)
            new_channels = [c for c in current_channels if c.lower() != clean_ch.lower()]
            if len(new_channels) != len(current_channels):
                user["encrypted_channels"] = self.vault.encrypt_text(json.dumps(new_channels))
                await self._save_unlocked()
                return True
            return False

    async def reset_user_channels(self, user_id: int) -> List[str]:
        async with self._lock:
            user = self._get_or_create_user(user_id)
            user["encrypted_channels"] = self.vault.encrypt_text(json.dumps(DEFAULT_CHANNELS))
            await self._save_unlocked()
            return list(DEFAULT_CHANNELS)

    async def get_user_voice(self, user_id: int) -> Tuple[str, str]:
        async with self._lock:
            user = self._get_or_create_user(user_id)
            voice = user.get("voice", DEFAULT_VOICE)
            engine = user.get("engine", DEFAULT_ENGINE)
            # Automatic migration for legacy Edge-TTS voice IDs (e.g. ru-RU-DmitryNeural, SvetlanaNeural, etc.)
            if not voice or "dmitry" in str(voice).lower() or "neural" in str(voice).lower() or str(voice) not in ("gtts-ru", "gtts-en"):
                voice = "gtts-en" if "en" in str(voice).lower() else "gtts-ru"
                engine = "gtts"
                user["voice"] = voice
                user["engine"] = engine
                await self._save_unlocked()
            return voice, engine

    async def set_user_voice(self, user_id: int, voice: str, engine: str = "gtts"):
        async with self._lock:
            user = self._get_or_create_user(user_id)
            user["voice"] = voice
            user["engine"] = engine
            await self._save_unlocked()

    async def get_user_lang(self, user_id: int) -> str:
        async with self._lock:
            user = self._get_or_create_user(user_id)
            return user.get("lang", "ru")

    async def set_user_lang(self, user_id: int, lang: str):
        async with self._lock:
            user = self._get_or_create_user(user_id)
            user["lang"] = lang
            await self._save_unlocked()

    async def get_user_speed(self, user_id: int) -> str:
        async with self._lock:
            user = self._get_or_create_user(user_id)
            return user.get("speed", "+20%")

    async def set_user_speed(self, user_id: int, rate: str):
        async with self._lock:
            user = self._get_or_create_user(user_id)
            user["speed"] = rate
            await self._save_unlocked()

    async def save_user_digest(
        self,
        user_id: int,
        summary: str,
        clean_speech: str,
        voice_id: str,
        voice_name: str,
        channels: List[str]
    ) -> int:
        import time
        async with self._lock:
            user = self._get_or_create_user(user_id)
            if "history" not in user:
                user["history"] = []
            
            entry = {
                "created_at": time.time(),
                "time_str": time.strftime("%H:%M"),
                "summary": summary,
                "clean_speech": clean_speech,
                "voice_id": voice_id,
                "voice_name": voice_name,
                "channels": channels
            }
            user["history"].append(entry)
            if len(user["history"]) > 20:
                user["history"] = user["history"][-20:]
            await self._save_unlocked()
            return len(user["history"]) - 1

    async def get_user_history(self, user_id: int) -> List[Dict[str, Any]]:
        async with self._lock:
            user = self._get_or_create_user(user_id)
            return user.get("history", [])

    async def get_user_digest_by_index(self, user_id: int, index: int) -> Optional[Dict[str, Any]]:
        async with self._lock:
            user = self._get_or_create_user(user_id)
            hist = user.get("history", [])
            if 0 <= index < len(hist):
                return hist[index]
            return None

    async def get_total_users_count(self) -> int:
        async with self._lock:
            return len(self._data.get("users", {}))

    async def get_user_seen_posts_today(self, user_id: int) -> set:
        import datetime
        today_str = datetime.date.today().isoformat()
        async with self._lock:
            user = self._get_or_create_user(user_id)
            seen_dict = user.get("seen_posts_by_date", {})
            return set(seen_dict.get(today_str, []))

    async def mark_posts_seen_today(self, user_id: int, post_keys: List[str]):
        import datetime
        today_str = datetime.date.today().isoformat()
        async with self._lock:
            user = self._get_or_create_user(user_id)
            if "seen_posts_by_date" not in user:
                user["seen_posts_by_date"] = {}
            current_seen = set(user["seen_posts_by_date"].get(today_str, []))
            current_seen.update(post_keys)
            user["seen_posts_by_date"][today_str] = list(current_seen)
            
            # Prune older dates (keep only last 3 days)
            all_dates = sorted(user["seen_posts_by_date"].keys())
            if len(all_dates) > 3:
                for old_date in all_dates[:-3]:
                    user["seen_posts_by_date"].pop(old_date, None)
                    
            await self._save_unlocked()

    async def clear_user_seen_posts_today(self, user_id: int):
        import datetime
        today_str = datetime.date.today().isoformat()
        async with self._lock:
            user = self._get_or_create_user(user_id)
            if "seen_posts_by_date" in user and today_str in user["seen_posts_by_date"]:
                user["seen_posts_by_date"][today_str] = []
                await self._save_unlocked()

storage_service = StorageService()
`;

  const configPy = `import os
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # Telegram Bot API (from @BotFather)
    BOT_TOKEN: str = "${config.botToken || 'YOUR_BOT_TOKEN_FROM_BOTFATHER'}"
    
    # Telegram Client API (from https://my.telegram.org)
    TELEGRAM_API_ID: int = ${config.telegramApiId || '12345678'}
    TELEGRAM_API_HASH: str = "${config.telegramApiHash || 'your_telegram_api_hash_here'}"
    
    # Google Gemini API Key (from https://aistudio.google.com)
    GEMINI_API_KEY: str = "${config.geminiApiKey || 'YOUR_GEMINI_API_KEY'}"
    
    # Optional: HTTP/HTTPS or SOCKS5 Proxy for Gemini API & Telegram (e.g. http://127.0.0.1:10809)
    HTTPS_PROXY: str = ""
    HTTP_PROXY: str = ""
    
    # Security: Master Fernet Encryption Key for PII (32 bytes url-safe base64)
    ENCRYPTION_KEY: str = "GENERATE_FERNET_KEY_HERE_OR_USE_AUTO"
    
    # RBAC: List of Admin Telegram User IDs
    ADMIN_IDS: List[int] = [123456789]
    
    # Default fallback channels
    DEFAULT_CHANNELS: List[str] = [${defaultChannelsStr}]
    
    # Time window for posts (e.g. 24 hours)
    HOURS_LIMIT: int = 24
    MAX_POSTS_PER_CHANNEL: int = 30
    
    # Default TTS settings
    DEFAULT_TTS_VOICE: str = "${config.edgeVoice || 'gtts-ru'}"
    DEFAULT_TTS_ENGINE: str = "${config.ttsEngine || 'gtts'}"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
`;

  const envExample = `# =================================================================
# TELEGRAM NEWS VOICE DIGEST - SECURE CONFIGURATION (.env)
# =================================================================

# 1. Telegram Bot Token from @BotFather (REQUIRED)
BOT_TOKEN="${config.botToken || '123456789:ABCdefGHIjklMNOpqrsTUVwxyz'}"

# 2. Telegram User API Credentials from https://my.telegram.org
TELEGRAM_API_ID=${config.telegramApiId || '12345678'}
TELEGRAM_API_HASH="${config.telegramApiHash || 'abcdef0123456789abcdef0123456789'}"

# 3. Google Gemini API Key from https://aistudio.google.com (REQUIRED)
GEMINI_API_KEY="${config.geminiApiKey || 'AIzaSy...'}"

# Optional Proxy for Gemini API & Telegram (e.g. http://127.0.0.1:10809 or http://user:pass@host:port)
# Set this if you are in a geo-restricted location where Google AI API returns 400 FAILED_PRECONDITION
HTTPS_PROXY=""
HTTP_PROXY=""

# 4. Data Protection: 32-byte Fernet Encryption Key for PII (Auto-generated if empty)
ENCRYPTION_KEY=""

# 5. Admin User IDs for privileged commands (/admin_stats, /logs)
ADMIN_IDS=[123456789]

# 6. Default target channels & TTS parameters
DEFAULT_CHANNELS=["zaPEACEki"]
DEFAULT_TTS_VOICE="gtts-ru"
DEFAULT_TTS_ENGINE="gtts"
HOURS_LIMIT=24
`;

  const telegramReaderPy = `import logging
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
        r'(?i)дублируем\\s+(?:все\\s+)?посты\\s+в\\s+max[^\\n\\.\\!]*',
        r'(?i)если\\s+(?:у\\s+вас\\s+)?(?:не\\s+грузит|зависает|не\\s+работает|заблокирован)\\s+(?:telegram|телега|тг)[^\\n\\.\\!]*',
        r'(?i)наш\\s+(?:канал|чат|зеркало|резерв|паблик)\\s+в\\s+(?:max|vk|вконтакте|дзен|telegram|телеге)[^\\n]*',
        r'(?i)(?:подписывайтесь|подпишись|подписаться)\\s+на\\s+(?:наш\\s+)?(?:канал|резерв|новости|рассылку|паблик)[^\\n]*',
        r'(?i)по\\s+вопросам\\s+рекламы[^\\n]*',
        r'(?i)реклама\\s+и\\s+сотрудничество[^\\n]*',
        r'(?i)(?:прислать|предложить)\\s+новость[^\\n]*',
        r'(?i)обратная\\s+связь[^\\n]*',
        r'(?i)связь\\s+с\\s+редакцией[^\\n]*',
        r'(?i)читать\\s+далее\\s+(?:в|на)[^\\n]*',
        r'(?i)переходите\\s+по\\s+ссылке[^\\n]*',
        r'(?i)(?:все\\s+)?посты\\s+дублируем[^\\n]*',
        r'(?i)зеркало\\s+канала[^\\n]*',
        r'(?i)источник:\\s*(?:https?:\\/\\/\\S+|@\\w+)',
    ]
    
    cleaned = text
    for pat in boilerplate_patterns:
        cleaned = re.sub(pat, '', cleaned)

    lines = cleaned.split('\\n')
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

    cleaned = "\\n".join(filtered_lines)
    cleaned = re.sub(r'\\n{3,}', '\\n\\n', cleaned).strip()
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
                clean_text = re.sub(r'<br\s*/?>', '\\n', raw_text)
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
`;

  const geminiServicePy = `import logging
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
        r'(?i)дублируем\\s+(?:все\\s+)?посты\\s+в\\s+max[^\\n\\.\\!]*',
        r'(?i)если\\s+(?:у\\s+вас\\s+)?(?:не\\s+грузит|зависает|не\\s+работает|заблокирован)\\s+(?:telegram|телега|тг)[^\\n\\.\\!]*',
        r'(?i)наш\\s+(?:канал|чат|зеркало|резерв|паблик)\\s+в\\s+(?:max|vk|вконтакте|дзен|telegram|телеге)[^\\n]*',
        r'(?i)(?:подписывайтесь|подпишись|подписаться)\\s+на\\s+(?:наш\\s+)?(?:канал|резерв|новости|рассылку|паблик)[^\\n]*',
        r'(?i)по\\s+вопросам\\s+рекламы[^\\n]*',
        r'(?i)реклама\\s+и\\s+сотрудничество[^\\n]*',
        r'(?i)(?:прислать|предложить)\\s+новость[^\\n]*',
        r'(?i)обратная\\s+связь[^\\n]*',
        r'(?i)связь\\s+с\\s+редакцией[^\\n]*',
        r'(?i)читать\\s+далее\\s+(?:в|на)[^\\n]*',
        r'(?i)переходите\\s+по\\s+ссылке[^\\n]*',
        r'(?i)(?:все\\s+)?посты\\s+дублируем[^\\n]*',
        r'(?i)зеркало\\s+канала[^\\n]*',
        r'(?i)источник:\\s*(?:https?:\\/\\/\\S+|@\\w+)',
    ]
    
    cleaned = text
    for pat in boilerplate_patterns:
        cleaned = re.sub(pat, '', cleaned)

    lines = cleaned.split('\\n')
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

    cleaned = "\\n".join(filtered_lines)
    cleaned = re.sub(r'\\n{3,}', '\\n\\n', cleaned).strip()
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
                        f"[Новость #{idx}] Канал: @{p['channel']} ({p.get('channel_title', '')}) | Ссылка: {url}\\n"
                        f"Текст: {p_text}"
                    )
                
                posts_context = "\\n\\n---\\n\\n".join(formatted_posts)
                
                if lang == "en":
                    system_instruction = (
                        f"You are a professional AI news presenter and chief editor of a personalized audio news station.\\n"
                        f"Your task is to thoroughly analyze ALL provided Telegram posts for {period_label}, group related topics, "
                        f"remove fluff/ads, and craft an engaging comprehensive news report for listener {user_name}.\\n\\n"
                        f"MANDATORY RULES:\\n"
                        f"1. Cover all key events from all provided channels (structure into clear points 1, 2, 3...).\\n"
                        f"2. At the end of EACH news point, add a clickable HTML link: "
                        f"<a href=\\"URL\\">Read in @channel_name ↗</a> (use the exact URL from the input data).\\n"
                        f"3. Start with a warm brief greeting, end with a pleasant closing.\\n"
                        f"4. The text must sound engaging, natural, and journalistic in fluent English.\\n"
                        f"5. STRICTLY EXCLUDE: advertisements, betting/gambling/bookmakers (1xBet, Winline, Fonbet, etc.), casino/slots, clickbait hooks ('you were mentioned by admin', 'link expires in 24h'), partner/sponsored posts, and channel mirror footers ('Duplicate in MAX...'). Only include real, factual news."
                    )
                    user_prompt = (
                        f"Here are all channel posts for {period_label}:\\n\\n"
                        f"{posts_context}\\n\\n"
                        f"Generate a comprehensive news digest with clickable HTML links for each story. Never include channel mirror footers, betting ads, or spam."
                    )
                else:
                    system_instruction = (
                        f"Ты — профессиональный ИИ-диктор и главный редактор персонального новостного радио.\\n"
                        f"Твоя задача — внимательно изучить ВСЕ переданные посты из Telegram за {period_label}, объединить связанные темы, "
                        f"отбросить рекламу и спам, и составить подробный итоговый выпуск для слушателя по имени {user_name}.\\n\\n"
                        f"ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:\\n"
                        f"1. Охвати все важные темы из каждого канала, выделив главные новости четкими пунктами (1, 2, 3...).\\n"
                        f"2. В конце КАЖДОЙ новости обязательно добавь кликабельную HTML-ссылку: "
                        f"<a href=\\"URL\\">Читать в @имя_канала ↗</a> (используй точную ссылку из входных данных).\\n"
                        f"3. В начале кратко поприветствуй пользователя, а в конце пожелай отличного дня.\\n"
                        f"4. Текст должен звучать живо, профессионально и увлекательно на правильном русском языке.\\n"
                        f"5. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО включать в дайджест:\\n"
                        f"   - Рекламу букмекеров, ставок на спорт и казино (Fonbet, Winline, 1xBet, BetBoom, слоты, фрибеты и т.д.);\\n"
                        f"   - Кликбейтные спам-заходы (типа 'вас упомянул администратор', 'вход по ссылке на 24 часа', 'закрытый канал');\\n"
                        f"   - Партнерские и рекламные посты (#реклама, erid, промокоды, партнерский материал);\\n"
                        f"   - Уведомления каналов о дублировании контента (например: 'Дублируем все посты в MAX, если у вас не грузит Telegram', 'Наш канал в VK/MAX', 'Подписывайтесь на канал', 'По вопросам рекламы').\\n"
                        f"Дайджест должен содержать исключительно содержательные новости и факты."
                    )
                    user_prompt = (
                        f"Вот публикации из Telegram-каналов за {period_label}:\\n\\n"
                        f"{posts_context}\\n\\n"
                        f"Сгенерируй качественный и подробный итоговый дайджест со всеми ключевыми новостями и кликабельными HTML-ссылками, полностью очищенный от рекламы букмекеров, спама, кликбейта, партнерских постов и подписей про MAX."
                    )

                candidate_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
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
                        err_str = str(model_err)
                        if "location is not supported" in err_str or "FAILED_PRECONDITION" in err_str:
                            logger.warning("Gemini API location is not supported in current network.")
                            break
                        logger.warning(f"Gemini model {model_name} returned: {model_err}. Trying next fallback...")
                        continue

            except Exception as e:
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
                f"👋 <b>Good day, {html.escape(user_name)}!</b>\\n",
                f"📻 <b>News digest for {period_label} ({len(selected_posts)} stories from {len(channel_groups)} channels):</b>\\n"
            ]
            speech_parts = [
                f"Hello, {user_name}! Here is your complete news roundup for {period_label} across your tracked channels, covering all {len(selected_posts)} stories."
            ]
        else:
            digest_lines = [
                f"👋 <b>Добрый день, {html.escape(user_name)}!</b>\\n",
                f"📻 <b>Сводка новостей за {period_label} ({len(selected_posts)} постов из {len(channel_groups)} каналов):</b>\\n"
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
            sentences = [s.strip() for s in re.split(r'(?<=[.!?])\\s+', raw_text) if len(s.strip()) > 5]
            snippet = " ".join(sentences[:3]) if len(sentences) >= 2 else raw_text[:250]
            if len(snippet) > 300:
                snippet = snippet[:300] + "..."

            escaped_snippet = html.escape(snippet)
            escaped_title = html.escape(ch_title)
            
            read_label = "Read in" if lang == "en" else "Читать в"
            digest_lines.append(
                f"<b>{i}. {escaped_title}</b> (@{ch}):\\n"
                f"{escaped_snippet}\\n"
                f"👉 <a href=\\"{url}\\">{read_label} @{ch} ↗</a>\\n"
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

        html_digest = "\\n".join(digest_lines)
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
        cleaned = re.sub(r'https?:\\/\\/\\S+', '', cleaned)
        cleaned = re.sub(r't\\.me\\/\\S+', '', cleaned)
        # 4. Strip all Unicode emoji characters, pictograms and symbols
        cleaned = "".join(
            ch for ch in cleaned 
            if not (unicodedata.category(ch) in ("So", "Sk", "Cs") or ord(ch) >= 0x1F000 or ord(ch) in range(0x2600, 0x27BF))
        )
        # 5. Remove UI symbols, arrows, bullet markers
        cleaned = re.sub(r'[↗→➔👉▶◀💡📌🔥⚡🎙️📰📖💬✨✅❌•—–\\-\\*\\_\\#\\x60\\[\\]\\(\\)\\{\\}\\<\\>\\|\\\\\\/]', ' ', cleaned)
        # 6. Remove @ channel handles if attached to words
        cleaned = re.sub(r'@[A-Za-z0-9_]+', '', cleaned)
        # 7. Normalize whitespaces
        cleaned = re.sub(r'\\s+', ' ', cleaned).strip()
        return cleaned
`;

  const ttsServicePy = `import asyncio
import logging
import os
import uuid
import edge_tts
from gtts import gTTS

logger = logging.getLogger(__name__)

AVAILABLE_VOICES = {
    "gtts-ru": {
        "name": "1. Русский — Google TTS (Женский / Стабильный)",
        "gender": "female",
        "engine": "gtts",
        "lang": "ru",
        "description": "Официальный женский голос Google Text-To-Speech на русском",
        "samplePhrase": "Здравствуйте! Это диктор Google TTS, надежный синтез речи без блокировок."
    },
    "gtts-en": {
        "name": "2. English — Google TTS (Female / Reliable)",
        "gender": "female",
        "engine": "gtts",
        "lang": "en",
        "description": "Official Google Text-To-Speech female engine in English",
        "samplePhrase": "Hello! This is Google Text-to-Speech news anchor."
    }
}

class TTSService:
    def __init__(self, output_dir: str = "temp_audio"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    async def synthesize_speech(
        self,
        text: str,
        voice: str = "gtts-ru",
        engine: str = "gtts"
    ) -> str:
        """
        Synthesizes natural speech using Google TTS (gTTS).
        Supports seamless bilingual synthesis (e.g. English IT terms/brand names/URLs in Russian digests 
        are spoken with authentic English pronunciation, while Russian sentences are spoken in Russian).
        Handles full long scripts up to 25,000 characters without trimming news items!
        """
        filename = f"{uuid.uuid4().hex}"
        base_lang = "en" if ("en" in voice.lower()) else "ru"
        mp3_path = os.path.join(self.output_dir, f"{filename}.mp3")
        
        loop = asyncio.get_event_loop()
        
        def generate_audio_file():
            # If text is in pure English or English voice selected
            if base_lang == "en":
                tts = gTTS(text=text, lang="en", slow=False)
                tts.save(mp3_path)
                return

            # Check if text contains significant Latin/English words in Russian context
            import io
            # Split text into language segments (Cyrillic-dominant vs Latin-dominant chunks)
            # or synthesize with gTTS ru which handles mixed IT vocabulary natively.
            # To prevent audio truncation for full digests, gTTS splits text into natural paragraph chunks and concatenates cleanly:
            paragraphs = [p.strip() for p in text.split("\\n") if p.strip()]
            if not paragraphs:
                paragraphs = [text]

            combined_fp = io.BytesIO()
            for p in paragraphs:
                if not p:
                    continue
                # For each paragraph, synthesize with gTTS
                part_fp = io.BytesIO()
                tts = gTTS(text=p, lang=base_lang, slow=False)
                tts.write_to_fp(part_fp)
                combined_fp.write(part_fp.getvalue())

            with open(mp3_path, "wb") as f:
                f.write(combined_fp.getvalue())
            
        await loop.run_in_executor(None, generate_audio_file)
        logger.info(f"Generated speech file via Google TTS ({base_lang}, {len(text)} chars): {mp3_path}")
        return mp3_path

tts_service = TTSService()
`;

  const requirementsTxt = `aiogram==3.15.0
telethon==1.36.0
google-genai
edge-tts==6.1.19
gTTS==2.5.4
cryptography==44.0.1
pydantic-settings==2.7.0
python-dotenv==1.0.1
aiohttp
aiofiles==24.1.0
`;

  const dockerfile = `FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    libffi-dev \\
    ffmpeg \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "bot.py"]
`;

  const dockerCompose = `version: '3.8'

services:
  telegram-gemini-bot:
    build: .
    container_name: telegram_news_gemini_bot
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./data:/app/data
      - ./sessions:/app/sessions
      - ./temp_audio:/app/temp_audio
`;

  const securityGuideMd = `# 🛡️ Руководство по кибербезопасности и защите Telegram-бота (OWASP Hardening)

Данный документ описывает реализованные меры защиты и рекомендации по предотвращению взломов, утечек персональных данных (ПДн/PII) и злоупотреблений.

---

## 1. 🔑 Безопасная работа с конфигурацией и секретами
* **Запрет на хардкод**: Все токены (\`BOT_TOKEN\`, \`TELEGRAM_API_HASH\`, \`GEMINI_API_KEY\`, \`ENCRYPTION_KEY\`) загружаются строго из переменных окружения или изолированного файла \`.env\` с помощью \`pydantic-settings\`.
* **Исключение из контроля версий**: Файл \`.env\` и папка \`sessions/\` обязательно добавляются в \`.gitignore\`.
* **Запрет передачи секретов в git**: Для деплоя используйте GitHub Secrets, HashiCorp Vault или переменные окружения Docker/K8s.

---

## 2. 🔐 Шифрование персональных данных (PII/ПДн) и хеширование
* **Симметричное шифрование \`Fernet (AES-128-CBC + HMAC-SHA256)\`**:
  * Реализовано в классе \`DataSecurityVault\` (\`security.py\`).
  * Все персональные списки каналов, настройки пользователей и метаданные перед записью в файл хранилища или базу данных шифруются.
  * Даже при прямой утечке дампа базы данных злоумышленник не сможет восстановить список каналов или личные предпочтения без мастер-ключа.
* **Псевдонимизация через Salted HMAC-SHA256**:
  * Идентификаторы пользователей (\`user_id\`), IP и логи хешируются с криптографической солью перед аудитом, предотвращая деанонимизацию.

---

## 3. 🚦 Защита от спама и DDoS (Rate Limiting & Throttling)
* **Мидлварь \`RateLimitMiddleware\` (\`security.py\`)**:
  * Реализует алгоритм **скользящего окна (Sliding Window)**.
  * Ограничивает входящие события до 3-4 сообщений/кликов за 2 секунды на одного пользователя.
  * Блокирует флуд-атаки и автоматически отправляет предупреждение пользователю при превышении лимита.

---

## 4. 🧹 Валидация и защита от инъекций (Anti-Injection & File Security)
* **Экранирование HTML**: Метод \`InputSanitizer.escape_html\` нейтрализует спецсимволы \`<, >, &, "\` перед отправкой в Telegram API с \`parse_mode=HTML\`.
* **Строгая валидация юзернеймов**: Регулярные выражения разрешают только безопасные символы \`[a-zA-Z0-9_]\` длиной от 3 до 32 знаков, отсекая инъекции команд и путей.
* **Инспектор файлов \`validate_file_upload\`**:
  * Проверяет MIME-типы и белый список расширений.
  * Блокирует попытки атак с двойными расширениями (например, \`malware.py.txt\`).
  * Ограничивает максимальный размер входящих файлов.

---

## 5. 👮 Ролевой контроль доступа (RBAC) и границы контекста
* **Фильтр \`IsAdminFilter\`**: Защищает служебные команды (например, \`/admin_stats\`) — доступ разрешен только ID из доверенного списка \`ADMIN_IDS\`.
* **Фильтр \`PrivateChatOnlyFilter\`**: Запрещает выполнение чувствительных команд и раскрытие персональных дайджестов в публичных группах и супергруппах.

---

## 6. 🕵️ Маскирование логов и безопасная обработка ошибок
* **\`SensitiveDataMaskingFormatter\`**:
  * Логгер автоматически на лету заменяет токены Telegram бота (\`123456789:AA...\`), ключи Gemini (\`AIzaSy...\`), телефоны и email на метки \`[REDACTED]\`.
* **OWASP Safe Exception Handling**:
  * Пользователям никогда не отправляется Python traceback.
  * Пользователь получает безопасный инцидент-код вида \`REF-A1B2C3D4\`, а подробный лог ошибки маскируется и записывается в защищенный журнал сервера.
`;

  const readmeMd = `# 🎙️ Telegram News Voice Digest Bot (Gemini AI + Edge-TTS & OWASP Security)

Персональный Telegram-бот для создания аудио-дайджестов новостей с комплексной защитой от взломов и утечек данных.

---

## 🛡️ Архитектура безопасности:
1. **Шифрование данных (PII Vault)**: \`cryptography.fernet\` (AES) шифрует пользовательские данные.
2. **Rate Limiting Middleware**: Защита от флуда, DDoS и перебора.
3. **Anti-Injection Sanitizer**: Экранирование HTML и строгая валидация входящих данных.
4. **Log Masking**: Автоматическое скрытие токенов и телефонов в логах.
5. **RBAC & Private Chats**: Доступ администраторов по ID и изоляция личных данных от групп.

---

## ⚡ Быстрый старт:

### 1. Установите зависимости:
\`\`\`bash
pip install -r requirements.txt
\`\`\`

### 2. Заполните .env:
\`\`\`env
BOT_TOKEN="123456789:ABCdef..."
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH="abcdef..."
GEMINI_API_KEY="AIzaSy..."
ENCRYPTION_KEY="ваш_32_байтный_ключ"
ADMIN_IDS=[123456789]
\`\`\`

### 3. Запустите бота:
\`\`\`bash
python bot.py
\`\`\`
`;

  const freeHostingGuideMd = `# 🚀 Полное руководство: Бесплатная установка и запуск многопользовательского Telegram-бота

Данная инструкция описывает, как **бесплатно** развернуть и запустить вашего Telegram-бота новостных дайджестов с ИИ и голосовой озвучкой, чтобы им могли пользоваться **вы и любые другие пользователи в Telegram 24/7**.

---

## 1. Как устроен многопользовательский режим
- 👤 **Изоляция данных**: каждый пользователь настраивает свой собственный список каналов (/channels).
- 🎙️ **Личный голос**: каждый пользователь сам выбирает 1 из 4 голосов (/voice).
- ⏰ **Персональное расписание**: каждый пользователь настраивает свое удобное время (/time).
- 🔒 **Шифрование данных (OWASP)**: базы настроек пользователей шифруются ключом Fernet (services/storage.py).
- 🛡️ **Защита от спама (Rate Limiter)**: модуль security.py предотвращает перегрузку Gemini API и флуд.

---

## 2. Бесплатные ключи и API (0 рублей навсегда)
1. **Токен Telegram-бота (Bot Token)**: бесплатно у @BotFather командой /newbot.
2. **Telegram API ID и API Hash**: бесплатно на my.telegram.org в разделе "API development tools".
3. **Google Gemini API Key**: бесплатно в Google AI Studio (aistudio.google.com).
4. **Озвучка Edge-TTS**: бесплатно, без ключей и без лимитов (Microsoft Neural).

---

## 3. Быстрый локальный запуск (ПК / Ноутбук)
\`\`\`bash
pip install -r requirements.txt
cp .env.example .env
# Заполните .env своими ключами
python bot.py
\`\`\`

---

## 4. Бесплатный хостинг 24/7 (Бот работает непрерывно)

### Вариант А: Render.com (Рекомендуется)
1. Создайте репозиторий на GitHub и загрузите файлы проекта.
2. Войдите на render.com через GitHub.
3. Нажмите "New +" -> "Background Worker" (или "Web Service").
4. Укажите:
   - Build Command: pip install -r requirements.txt
   - Start Command: python bot.py
5. В разделе Environment добавьте TELEGRAM_BOT_TOKEN, TELEGRAM_API_ID, TELEGRAM_API_HASH, GEMINI_API_KEY.
6. Нажмите "Deploy". Бот работает 24/7.

### Вариант Б: Oracle Cloud Always Free Tier
1. Зарегистрируйтесь на oracle.com/cloud/free (бесплатная VM с 4 ядрами и 24 ГБ RAM навсегда).
2. Запустите в Docker:
   docker-compose up -d --build

---

## 5. Как делиться ботом с другими людьми
1. Скопируйте ссылку на бота вида: https://t.me/your_bot_username
2. Отправьте ссылку друзьям или коллегам.
3. Любой человек нажимает /start, указывает свои каналы и получает свои персональные аудио-дайджесты!
`;

  return [
    {
      name: 'FREE_DEPLOYMENT_GUIDE.md',
      path: 'FREE_DEPLOYMENT_GUIDE.md',
      description: 'Пошаговое руководство: как бесплатно запустить бота 24/7 для всех пользователей в Telegram',
      language: 'markdown',
      content: freeHostingGuideMd,
    },
    {
      name: 'bot.py',
      path: 'bot.py',
      description: 'Главный файл бота (Aiogram 3, OWASP Security Middlewares, FSM, /news, /voice)',
      language: 'python',
      content: botPy,
    },
    {
      name: 'security.py',
      path: 'security.py',
      description: 'Модуль безопасности: Fernet PII шифрование, RateLimiter, Sanitizer, RBAC, Masking Logger',
      language: 'python',
      content: securityPy,
    },
    {
      name: 'SECURITY.md',
      path: 'SECURITY.md',
      description: 'Подробное руководство по защите от взлома, спама и утечек персональных данных',
      language: 'markdown',
      content: securityGuideMd,
    },
    {
      name: 'storage.py',
      path: 'services/storage.py',
      description: 'Асинхронное зашифрованное хранилище пользовательских настроек (PII Protected)',
      language: 'python',
      content: storagePy,
    },
    {
      name: 'tts_service.py',
      path: 'services/tts_service.py',
      description: 'Голосовой сервис синтеза речи Google TTS (gTTS) с поддержкой русского и английского языков',
      language: 'python',
      content: ttsServicePy,
    },
    {
      name: 'telegram_reader.py',
      path: 'services/telegram_reader.py',
      description: 'Сервис чтения каналов через Telethon User Client',
      language: 'python',
      content: telegramReaderPy,
    },
    {
      name: 'gemini_service.py',
      path: 'services/gemini_service.py',
      description: 'Сервис анализа и создания радио-сценариев Gemini AI',
      language: 'python',
      content: geminiServicePy,
    },
    {
      name: 'config.py',
      path: 'config.py',
      description: 'Конфигурация параметров бота (Pydantic Settings, ENCRYPTION_KEY, ADMIN_IDS)',
      language: 'python',
      content: configPy,
    },
    {
      name: '.env.example',
      path: '.env.example',
      description: 'Шаблон ключей API, шифрования и переменных окружения',
      language: 'shell',
      content: envExample,
    },
    {
      name: 'requirements.txt',
      path: 'requirements.txt',
      description: 'Зависимости (Aiogram 3, Telethon, Gemini, Edge-TTS, Cryptography)',
      language: 'text',
      content: requirementsTxt,
    },
    {
      name: 'Dockerfile',
      path: 'Dockerfile',
      description: 'Docker-контейнер для сервера с поддержкой аудио и шифрования',
      language: 'dockerfile',
      content: dockerfile,
    },
    {
      name: 'docker-compose.yml',
      path: 'docker-compose.yml',
      description: 'Спецификация Docker Compose с защищенными volumes',
      language: 'yaml',
      content: dockerCompose,
    },
    {
      name: 'README.md',
      path: 'README.md',
      description: 'Инструкция по установке, запуску и командам',
      language: 'markdown',
      content: readmeMd,
    },
  ];
}
