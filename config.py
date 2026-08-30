import os
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # Telegram Bot API (from @BotFather)
    BOT_TOKEN: str = "YOUR_BOT_TOKEN_FROM_BOTFATHER"
    
    # Telegram Client API (from https://my.telegram.org)
    TELEGRAM_API_ID: int = 12345678
    TELEGRAM_API_HASH: str = "your_telegram_api_hash_here"
    
    # Google Gemini API Key (from https://aistudio.google.com)
    GEMINI_API_KEY: str = "YOUR_GEMINI_API_KEY"
    
    # Optional: HTTP/HTTPS or SOCKS5 Proxy for Gemini API & Telegram (e.g. http://127.0.0.1:10809)
    HTTPS_PROXY: str = ""
    HTTP_PROXY: str = ""
    
    # Security: Master Fernet Encryption Key for PII (32 bytes url-safe base64)
    ENCRYPTION_KEY: str = "GENERATE_FERNET_KEY_HERE_OR_USE_AUTO"
    
    # RBAC: List of Admin Telegram User IDs
    ADMIN_IDS: List[int] = [123456789]
    
    # Default fallback channels
    DEFAULT_CHANNELS: List[str] = ["zaPEACEki"]
    
    # Time window for posts (e.g. 24 hours)
    HOURS_LIMIT: int = 24
    MAX_POSTS_PER_CHANNEL: int = 30
    
    # Default TTS settings
    DEFAULT_TTS_VOICE: str = "gtts-ru"
    DEFAULT_TTS_ENGINE: str = "gtts"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
