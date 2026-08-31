"""
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
from aiogram.client.session.aiohttp import AiohttpSession
from aiohttp import web

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

    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = ""

    for p in paragraphs:
        if len(current_chunk) + len(p) + 2 < MAX_LEN:
            current_chunk = f"{current_chunk}\n\n{p}" if current_chunk else p
        else:
            if current_chunk:
                chunks.append(current_chunk)
            if len(p) > MAX_LEN:
                lines = p.split("\n")
                sub_chunk = ""
                for line in lines:
                    if len(sub_chunk) + len(line) + 1 < MAX_LEN:
                        sub_chunk = f"{sub_chunk}\n{line}" if sub_chunk else line
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
            f"👋 <b>Welcome, {user_name}!</b>\n\n"
            "I am your <b>personal AI News Broadcaster</b> powered by <b>Google Gemini AI</b> and <b>Google TTS</b> neural voices.\n\n"
            f"📋 <b>Your active channels:</b> {InputSanitizer.escape_html(channels_str)}\n\n"
            "⚡ <b>Capabilities:</b>\n"
            "• Read posts from your selected channels\n"
            "• Filter out spam and ads via Gemini AI\n"
            "• Voice out a lively news digest in natural audio\n\n"
            "Choose an action below or send <code>/news</code>:"
        )
    else:
        welcome_text = (
            f"👋 <b>Добро пожаловать, {user_name}!</b>\n\n"
            "Я — ваш <b>персональный ИИ-диктор новостей</b> на базе <b>Google Gemini AI</b> и нейросетевых голосов <b>Google TTS</b>.\n\n"
            f"📋 <b>Ваши активные каналы:</b> {InputSanitizer.escape_html(channels_str)}\n\n"
            "⚡ <b>Что я умею:</b>\n"
            "• Читать посты из ваших выбранных каналов\n"
            "• Отфильтровывать спам, воду и рекламу через Gemini\n"
            "• Озвучивать живой радио-дайджест естественным голосом\n\n"
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
            "📅 <b>Select Digest Timeframe:</b>\n\n"
            "Would you like to prepare the digest for <b>today only (last 24 hours)</b> "
            "or for <b>today and yesterday (last 48 hours)</b>?\n\n"
            "<i>(The bot will gather all posts from your channels for the selected period)</i>"
        )
    else:
        prompt_text = (
            "📅 <b>Выберите период для формирования дайджеста:</b>\n\n"
            "Подготовить дайджест только на <b>сегодняшний день</b> (за 24 часа) "
            "или на <b>сегодняшний и вчерашний день</b> (за 48 часов)?\n\n"
            "<i>(Бот охватит все новости из ваших каналов за выбранное время)</i>"
        )
    await message.answer(prompt_text, reply_markup=get_period_keyboard(with_audio=True, lang=lang))

@dp.message(Command("text"), PrivateChatOnlyFilter())
async def cmd_text(message: types.Message):
    user_id = message.from_user.id
    lang = await storage_service.get_user_lang(user_id)
    if lang == "en":
        prompt_text = (
            "📅 <b>Select Text Digest Timeframe:</b>\n\n"
            "Prepare text summary for <b>today only (24h)</b> or <b>today and yesterday (48h)</b>?"
        )
    else:
        prompt_text = (
            "📅 <b>Выберите период для текстового дайджеста:</b>\n\n"
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
        "🌐 <b>Выберите язык интерфейса и дайджеста:</b>\n"
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
            "📖 <b>Your digest history is currently empty.</b>\n\nRun <code>/news</code> to generate your first broadcast!"
            if lang == "en" else
            "📖 <b>История ваших выпусков пуста.</b>\n\nЗапустите генерацию первого дайджеста командой <code>/news</code>!"
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
            "📋 <b>Your channel list is empty!</b>\n\nAdd a channel using <code>/add @username</code>"
            if lang == "en" else
            "📋 <b>Ваш список каналов пуст!</b>\n\nДобавьте канал командой <code>/add @username</code>"
        )
        await message.answer(
            empty_text,
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="➕ Add" if lang == "en" else "➕ Добавить", callback_data="prompt_add_channel")
            ]])
        )
        return
        
    channels_str = "\n".join([f"• <b>@{InputSanitizer.escape_html(c)}</b>" for c in channels])
    title_text = (
        f"📋 <b>Your tracked channels ({len(channels)}):</b>\n\n{channels_str}"
        if lang == "en" else
        f"📋 <b>Ваши отслеживаемые каналы ({len(channels)}):</b>\n\n{channels_str}"
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
            "✍️ <b>Enter username or link of a Telegram channel:</b>\n\n"
            "Example: <code>@habr_pop</code>, <code>zaPEACEki</code> or <code>https://t.me/habr_pop</code>"
            if lang == "en" else
            "✍️ <b>Введите username или ссылку на Telegram-канал:</b>\n\n"
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
                f"✅ Channel <b>@{InputSanitizer.escape_html(cleaned)}</b> removed.\nRemaining: {len(channels)}."
                if lang == "en" else
                f"✅ Канал <b>@{InputSanitizer.escape_html(cleaned)}</b> удален из списка!\nОсталось каналов: {len(channels)}."
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
            f"🗣️ <b>Voice Settings (Google TTS)</b>\n\n"
            f"Current Voice: <b>{InputSanitizer.escape_html(voice_info.get('name', 'Google TTS'))}</b>\n"
            f"Engine: <b>{engine}</b>\n\n"
            "Select voice below or tap 🎧 for an audio preview:"
        )
    else:
        text = (
            f"🗣️ <b>Настройка голоса диктора (Google TTS)</b>\n\n"
            f"Текущий голос: <b>{InputSanitizer.escape_html(voice_info.get('name', 'Google TTS (Женский)'))}</b>\n"
            f"Движок: <b>{engine}</b>\n\n"
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
            f"📋 <b>Последние записи журнала (bot.log):</b>\n<pre>{escaped_tail}</pre>",
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
        f"🛡️ <b>Панель администратора</b>\n\n"
        f"• Всего зарегистрированных пользователей: <b>{total_users}</b>\n"
        f"• Хеш вашей сессии: <code>{vault.hash_identifier(message.from_user.id)}</code>\n"
        f"• Лог-файл: <code>logs/bot.log</code> (команда /logs)\n"
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
            "❌ <b>Некорректный формат имени канала!</b>\n"
            "Имя может содержать латинские буквы, цифры и подчеркивания (3-32 символа).\n"
            "<i>Примеры: @habr_pop, zaPEACEki, https://t.me/habr_pop</i>"
        )
        return

    added = await storage_service.add_user_channel(message.from_user.id, cleaned)
    channels = await storage_service.get_user_channels(message.from_user.id)
    
    if added:
        await message.answer(
            f"✅ Канал <b>@{InputSanitizer.escape_html(cleaned)}</b> успешно добавлен в ваш список!\n"
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
                "📅 <b>Select Digest Timeframe:</b>\n\n"
                "Prepare digest for <b>today only (24h)</b> or <b>today and yesterday (48h)</b>?"
                if lang == "en" else
                "📅 <b>Выберите период для формирования дайджеста:</b>\n\n"
                "Подготовить дайджест только на <b>сегодняшний день</b> (24ч) "
                "или на <b>сегодняшний и вчерашний день</b> (48ч)?"
            )
            await callback.message.answer(prompt_text, reply_markup=get_period_keyboard(with_audio=True, lang=lang))
            await callback.answer()

        elif data == "get_text_digest":
            lang = await storage_service.get_user_lang(user_id)
            prompt_text = (
                "📅 <b>Select Text Digest Timeframe:</b>\n\n"
                "Prepare text summary for <b>today only (24h)</b> or <b>today and yesterday (48h)</b>?"
                if lang == "en" else
                "📅 <b>Выберите период для текстового дайджеста:</b>\n\n"
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
                "🌐 <b>Выберите язык интерфейса и дайджеста:</b>\n"
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
                msg_text = "✅ <b>Language switched to English!</b>\n\nChoose an action from the menu:"
            else:
                await callback.answer("Язык изменен на Русский", show_alert=True)
                msg_text = "✅ <b>Язык переключен на русский!</b>\n\nВыберите действие в меню:"
            try:
                await callback.message.edit_text(msg_text, reply_markup=get_main_keyboard(new_lang))
            except Exception:
                await callback.message.answer(msg_text, reply_markup=get_main_keyboard(new_lang))

        elif data == "list_channels":
            await callback.answer()
            lang = await storage_service.get_user_lang(user_id)
            channels = await storage_service.get_user_channels(user_id)
            empty_str = "<i>No channels configured</i>" if lang == "en" else "<i>Список пуст</i>"
            channels_str = "\n".join([f"• <b>@{InputSanitizer.escape_html(c)}</b>" for c in channels]) if channels else empty_str
            text = (
                f"📋 <b>Your tracked channels ({len(channels)}):</b>\n\n{channels_str}"
                if lang == "en" else
                f"📋 <b>Ваши отслеживаемые каналы ({len(channels)}):</b>\n\n{channels_str}"
            )
            try:
                await callback.message.edit_text(text, reply_markup=get_channels_keyboard(channels, lang))
            except Exception:
                await callback.message.answer(text, reply_markup=get_channels_keyboard(channels, lang))

        elif data == "reset_channels":
            lang = await storage_service.get_user_lang(user_id)
            await callback.answer("Channels reset to (@zaPEACEki)" if lang == "en" else "Список сброшен к (@zaPEACEki)")
            channels = await storage_service.reset_user_channels(user_id)
            channels_str = "\n".join([f"• <b>@{InputSanitizer.escape_html(c)}</b>" for c in channels])
            text = (
                f"🔄 <b>Channel list reset to default:</b>\n\n{channels_str}"
                if lang == "en" else
                f"🔄 <b>Список каналов сброшен к начальному:</b>\n\n{channels_str}"
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
            channels_str = "\n".join([f"• <b>@{InputSanitizer.escape_html(c)}</b>" for c in channels]) if channels else empty_str
            text = (
                f"📋 <b>Your tracked channels ({len(channels)}):</b>\n\n{channels_str}"
                if lang == "en" else
                f"📋 <b>Ваши отслеживаемые каналы ({len(channels)}):</b>\n\n{channels_str}"
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
                "✍️ <b>Enter username or link of a Telegram channel:</b>\n\n"
                "Example: <code>@habr_pop</code>, <code>zaPEACEki</code> or <code>https://t.me/habr_pop</code>"
                if lang == "en" else
                "✍️ <b>Введите username или ссылку на Telegram-канал:</b>\n\n"
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
                    "📖 <b>Your digest history is currently empty.</b>\n\nStart your first digest with <code>/news</code>!"
                    if lang == "en" else
                    "📖 <b>История ваших выпусков пуста.</b>\n\nЗапустите генерацию первого дайджеста командой <code>/news</code> или кнопкой ниже!"
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
            if callback.message and callback.message.text:
                try:
                    await callback.message.edit_text(text, reply_markup=get_voice_keyboard(current_voice, lang))
                except Exception:
                    await bot.send_message(chat_id, text, reply_markup=get_voice_keyboard(current_voice, lang))
            else:
                await bot.send_message(chat_id, text, reply_markup=get_voice_keyboard(current_voice, lang))

        elif data.startswith("set_voice:"):
            lang = await storage_service.get_user_lang(user_id)
            new_voice = data.split(":", 1)[1]
            engine = "gtts" if new_voice.startswith("gtts") else "edge-tts"
            await storage_service.set_user_voice(user_id=user_id, voice_id=new_voice, engine=engine)
            v_info = AVAILABLE_VOICES.get(new_voice, {"name": new_voice})
            toast = f"Voice updated to: {v_info.get('name')}" if lang == "en" else f"Голос изменен на: {v_info.get('name')}"
            await callback.answer(toast, show_alert=True)
            if callback.message and callback.message.reply_markup:
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
                    f"🏠 <b>Personal AI Radio Main Menu:</b>\n\n"
                    f"Listener: <b>{user_name}</b>\n"
                    f"Choose an option below or send <code>/news</code>:"
                )
            else:
                text = (
                    f"🏠 <b>Главное меню персонального ИИ-радио:</b>\n\n"
                    f"Слушатель: <b>{user_name}</b>\n"
                    f"Выберите действие ниже или введите команду <code>/news</code>:"
                )
            if callback.message and callback.message.text:
                try:
                    await callback.message.edit_text(text, reply_markup=get_main_keyboard(lang))
                except Exception:
                    await bot.send_message(chat_id, text, reply_markup=get_main_keyboard(lang))
            else:
                await bot.send_message(chat_id, text, reply_markup=get_main_keyboard(lang))

        elif data == "cancel_fsm":
            await state.clear()
            await callback.answer("Действие отменено")
            try:
                await callback.message.delete()
            except Exception:
                pass
    except Exception as e:
        logger.error(f"Callback query exception ({data}): {e}", exc_info=True)
        try:
            await callback.answer("⚠️ Произошла ошибка при обработке клика.", show_alert=True)
        except Exception:
            pass

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
        f"⏳ <b>Подготовка:</b> Получаем публикации из ваших каналов за {'24 часа' if hours_limit == 24 else '48 часов (сегодня + вчера)'}..."
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
                "⚠️ <b>You have no channels added!</b>\n\nAdd at least one channel using <code>/add @channel</code>."
                if lang == "en" else
                "⚠️ <b>У вас нет добавленных каналов!</b>\n\nДобавьте хотя бы один канал через команду <code>/add @channel</code>."
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
            max_posts_per_channel=40
        )

        if not posts:
            no_posts_text = (
                f"📭 <b>No fresh publications found for the last {hours_limit} hours.</b>\n"
                "Please try again later or add more active channels via <code>/add @channel</code>."
                if lang == "en" else
                f"📭 <b>Свежих публикаций за последние {hours_limit}ч не найдено.</b>\n"
                "Попробуйте позже или добавьте больше каналов через <code>/add @channel</code>."
            )
            await status_msg.edit_text(no_posts_text, reply_markup=get_main_keyboard(lang))
            return

        # Pre-filter all incoming posts from advertising, scams and boilerplate
        from services.gemini_service import is_promotional_or_ad, clean_boilerplate_and_signatures
        clean_posts = []
        for p in posts:
            raw_text = p.get('text', '')
            if not raw_text or len(raw_text.strip()) < 15 or is_promotional_or_ad(raw_text):
                continue
            cleaned = clean_boilerplate_and_signatures(raw_text)
            if len(cleaned) < 15 or is_promotional_or_ad(cleaned):
                continue
            p_copy = dict(p)
            p_copy['text'] = cleaned
            clean_posts.append(p_copy)

        posts = clean_posts

        if not posts:
            no_subst_text = (
                f"📭 <b>No substantive news found for the last {hours_limit} hours</b> (all posts were filtered as promotional or boilerplate).\n"
                "Please try again later or add more active news channels."
                if lang == "en" else
                f"📭 <b>Не найдено содержательных новостей за последние {hours_limit}ч</b> (все публикации были отфильтрованы как реклама или служебные).\n"
                "Попробуйте позже или добавьте новые новостные каналы."
            )
            await status_msg.edit_text(no_subst_text, reply_markup=get_main_keyboard(lang))
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
                f"✨ <b>All caught up!</b>\n\n"
                f"No new posts in your tracked channels ({len(channels)}) since your previous digest today.\n"
                f"All {len(posts)} publications from today were already included in your earlier digests.\n\n"
                f"💡 <i>Tip: You can re-listen to previous digests in 📚 <b>Archive</b> or request again later when fresh news arrives.</i>"
                if lang == "en" else
                f"✨ <b>Вы уже в курсе всех новостей за сегодня!</b>\n\n"
                f"В ваших каналах ({len(channels)} шт.) нет новых публикаций с момента предыдущего дайджеста за сегодня.\n"
                f"Все публикации ({len(posts)} шт.) уже вошли в ваши более ранние выпуски.\n\n"
                f"💡 <i>Совет: Вы можете прослушать предыдущие выпуски в 📚 <b>Архиве</b> или запросить новый дайджест позже, когда появятся свежие публикации.</i>"
            )
            await status_msg.edit_text(all_caught_up_text, reply_markup=get_main_keyboard(lang))
            return

        posts = unseen_posts

        # Dynamic Batching: Split into issues if total news > 24
        MAX_POSTS_PER_PART = 24
        chunks = [posts[i:i + MAX_POSTS_PER_PART] for i in range(0, len(posts), MAX_POSTS_PER_PART)]
        total_parts = len(chunks)
        total_posts_count = len(posts)

        period_label = "последние 48 часов (сегодня и вчера)" if hours_limit == 48 else "сегодняшний день (24 часа)"
        period_label_en = "the last 48 hours (today & yesterday)" if hours_limit == 48 else "today (24 hours)"
        active_period_label = period_label_en if lang == "en" else period_label

        for part_idx, chunk in enumerate(chunks, 1):
            start_num = (part_idx - 1) * MAX_POSTS_PER_PART + 1
            end_num = start_num + len(chunk) - 1

            part_info = {
                "part": part_idx,
                "total_parts": total_parts,
                "start_idx": start_num,
                "end_idx": end_num,
                "total_posts": total_posts_count
            }

            if total_parts > 1:
                step2_text = (
                    f"🧠 <b>Issue {part_idx}/{total_parts}:</b> Gemini AI is analyzing stories {start_num}–{end_num} of {total_posts_count}..."
                    if lang == "en" else
                    f"🧠 <b>Выпуск {part_idx}/{total_parts}:</b> Gemini формирует выпуск (новости {start_num}–{end_num} из {total_posts_count})..."
                )
            else:
                step2_text = (
                    f"🧠 <b>Step 2/3:</b> Gemini AI is analyzing {len(chunk)} new posts from all channels..."
                    if lang == "en" else
                    f"🧠 <b>Шаг 2/3:</b> Gemini анализирует {len(chunk)} новых постов и формирует сценарий..."
                )
            await status_msg.edit_text(step2_text)

            digest_text, clean_speech_text = await gemini_service.generate_digest(
                posts=chunk,
                style="podcast",
                user_name=user_name,
                lang=lang,
                period_label=active_period_label,
                part_info=part_info
            )

            # Save to user session history
            history_title_prefix = f"[Выпуск {part_idx}/{total_parts}] " if total_parts > 1 else ""
            history_idx = await storage_service.save_user_digest(
                user_id=user_id,
                summary=f"{history_title_prefix}{digest_text}",
                clean_speech=clean_speech_text,
                voice_id=voice_id,
                voice_name=voice_display_name,
                channels=channels
            )
            total_history = len(await storage_service.get_user_history(user_id))

            # Mark processed chunk posts as seen for today
            chunk_keys = [p.get("url") or f"{p.get('channel')}_{p.get('id')}" for p in chunk]
            await storage_service.mark_posts_seen_today(user_id, chunk_keys)

            part_header_tag_en = f"Part {part_idx}/{total_parts} (stories {start_num}–{end_num} of {total_posts_count})" if total_parts > 1 else f"{len(chunk)} posts from {len(channels)} channels"
            part_header_tag_ru = f"Выпуск {part_idx}/{total_parts} (новости {start_num}–{end_num} из {total_posts_count})" if total_parts > 1 else f"{len(chunk)} постов из {len(channels)} каналов"

            if with_audio:
                if total_parts > 1:
                    step3_text = (
                        f"🎙️ <b>Issue {part_idx}/{total_parts}:</b> Synthesizing voice using <b>{InputSanitizer.escape_html(voice_display_name)}</b>..."
                        if lang == "en" else
                        f"🎙️ <b>Выпуск {part_idx}/{total_parts}:</b> Озвучиваем голосом <b>{InputSanitizer.escape_html(voice_display_name)}</b>..."
                    )
                else:
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
                    f"📰 <b>News Digest — {part_header_tag_en}:</b>\n\n{digest_text}"
                    if lang == "en" else
                    f"📰 <b>Сводка новостей — {part_header_tag_ru}:</b>\n\n{digest_text}"
                )
                await send_smart_long_message(bot, chat_id, header_str)

                voice_file = FSInputFile(audio_path)
                part_caption_badge = f"Issue {part_idx}/{total_parts} • " if total_parts > 1 else ""
                caption_str = (
                    f"🎙️ <i>{part_caption_badge}Voiced by {InputSanitizer.escape_html(voice_display_name)}</i>"
                    if lang == "en" else
                    f"🎙️ <i>{part_caption_badge}Озвучено голосом {InputSanitizer.escape_html(voice_display_name)}</i>"
                )
                await bot.send_voice(
                    chat_id,
                    voice=voice_file,
                    caption=caption_str,
                    reply_markup=get_digest_nav_keyboard(history_idx, total_history, lang)
                )

                if os.path.exists(audio_path):
                    os.remove(audio_path)
            else:
                header_str = (
                    f"📰 <b>News Digest — {part_header_tag_en}:</b>\n\n{digest_text}"
                    if lang == "en" else
                    f"📰 <b>Сводка новостей — {part_header_tag_ru}:</b>\n\n{digest_text}"
                )
                await send_smart_long_message(
                    bot,
                    chat_id,
                    header_str,
                    reply_markup=get_digest_nav_keyboard(history_idx, total_history, lang)
                )

        try:
            await status_msg.delete()
        except Exception:
            pass

        if total_parts > 1:
            done_msg = (
                f"✅ <b>All {total_parts} editions for {active_period_label} completed!</b>\n"
                f"Processed {total_posts_count} publications across your channels."
                if lang == "en" else
                f"✅ <b>Все {total_parts} выпуска дайджеста за {active_period_label} готовы!</b>\n"
                f"Обработано {total_posts_count} публикаций из ваших каналов."
            )
            await bot.send_message(chat_id, done_msg, reply_markup=get_main_keyboard(lang))
            
    except Exception as e:
        error_id = uuid.uuid4().hex[:8].upper()
        logger.error(f"[ERR-{error_id}] Error processing digest for user {vault.hash_identifier(user_id)}: {e}", exc_info=True)
        err_msg = (
            f"⚠️ <b>An error occurred while processing the digest.</b>\n"
            f"Reference code: <code>REF-{error_id}</code>.\n\n"
            f"Details recorded to <code>logs/bot.log</code> (command <code>/logs</code>)."
            if lang == "en" else
            f"⚠️ <b>Произошла ошибка при обработке запроса.</b>\n"
            f"Код инцидента: <code>REF-{error_id}</code>.\n\n"
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
        f"📖 <b>Архив выпусков: Выпуск #{index + 1} из {total_count}</b> <i>({time_str})</i>:\n\n"
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

async def start_healthcheck_server(port: int = 10000):
    """
    Lightweight HTTP health-check server for cloud platforms (Render, Railway, Fly.io, Cloud Run).
    Render Web Services require listening on $PORT to pass health checks and prevent SIGTERM timeouts.
    """
    async def handle_health(request):
        return web.Response(
            text="Telegram News Voice Digest Bot is LIVE and Healthy! 🎙️",
            content_type="text/plain",
            status=200
        )

    app = web.Application()
    app.router.add_get("/", handle_health)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/healthz", handle_health)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logger.info(f"Render/Cloud HTTP Health Check server successfully started on port {port} (0.0.0.0:{port})")
    return runner

async def main():
    # Detect port from Render/Cloud environment (default: 10000 on Render)
    port = int(os.environ.get("PORT", 10000))
    runner = None
    try:
        runner = await start_healthcheck_server(port=port)
    except Exception as e:
        logger.warning(f"Could not start HTTP healthcheck server on port {port}: {e}")

    logger.info("Initializing encrypted storage...")
    await storage_service.init_db()
    
    logger.info("Starting Telegram reader service...")
    await reader_service.start()
    
    logger.info("Starting Aiogram bot polling with OWASP Security Middlewares active...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot, drop_pending_updates=True)
    finally:
        await reader_service.stop()
        await bot.session.close()
        if runner:
            await runner.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
