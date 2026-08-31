import asyncio
import json
import logging
import os
from typing import List, Tuple, Dict, Any, Optional
from security import DataSecurityVault

logger = logging.getLogger(__name__)

DEFAULT_CHANNELS = ["zaPEACEki"]
DEFAULT_VOICE = "gtts-ru"
DEFAULT_ENGINE = "gtts"

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
