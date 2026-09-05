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
    Asynchronous user storage supporting both PostgreSQL (Cloud DB) and JSON file.
    If DATABASE_URL is provided (e.g. on Render PostgreSQL), it automatically persists
    data in the cloud database, surviving any code updates or container restarts.
    """
    def __init__(self, db_path: Optional[str] = None, encryption_key: str = ""):
        env_db_path = os.environ.get("STORAGE_DB_PATH") or os.environ.get("DATA_PATH")
        self.db_path = db_path or env_db_path or "data/user_storage.json"
        self.database_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""
        self._data: Dict[str, Any] = {"users": {}}
        self._lock = asyncio.Lock()
        self._pg_pool = None
        self.vault = DataSecurityVault(master_key=encryption_key or os.environ.get("ENCRYPTION_KEY", ""))
        
    async def init_db(self):
        # 1. First attempt to connect to PostgreSQL if DATABASE_URL is configured
        if self.database_url:
            try:
                import asyncpg
                # Normalize URL for asyncpg (postgres:// -> postgresql://)
                pg_url = self.database_url
                if pg_url.startswith("postgres://"):
                    pg_url = pg_url.replace("postgres://", "postgresql://", 1)
                
                self._pg_pool = await asyncpg.create_pool(dsn=pg_url, min_size=1, max_size=5, timeout=10)
                async with self._pg_pool.acquire() as conn:
                    await conn.execute("""
                        CREATE TABLE IF NOT EXISTS bot_storage (
                            id VARCHAR(64) PRIMARY KEY,
                            data JSONB NOT NULL,
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                        );
                    """)
                    row = await conn.fetchrow("SELECT data FROM bot_storage WHERE id = 'main'")
                    if row and row["data"]:
                        pg_data = row["data"]
                        if isinstance(pg_data, str):
                            self._data = json.loads(pg_data)
                        elif isinstance(pg_data, dict):
                            self._data = pg_data
                        logger.info("Successfully loaded bot data from cloud PostgreSQL!")
                    else:
                        logger.info("PostgreSQL storage initialized (fresh table).")
            except Exception as e:
                logger.error(f"Failed to connect to PostgreSQL: {e}. Falling back to local file storage.")
                self._pg_pool = None

        # 2. If PostgreSQL was not available or empty, check local file
        if not self._data.get("users"):
            os.makedirs(os.path.dirname(self.db_path) if os.path.dirname(self.db_path) else ".", exist_ok=True)
            if os.path.exists(self.db_path):
                try:
                    with open(self.db_path, "r", encoding="utf-8") as f:
                        self._data = json.load(f)
                        logger.info(f"Loaded storage data from local file {self.db_path}")
                except Exception as e:
                    logger.warning(f"Error reading storage file: {e}. Starting fresh.")
                    self._data = {"users": {}}
            else:
                await self._save_unlocked()

        # If data was loaded from file and PostgreSQL is active, push file data to cloud
        if self._pg_pool and self._data.get("users"):
            try:
                await self._save_to_postgres(self._data)
            except Exception:
                pass

        logger.info(f"Storage service ready (PostgreSQL: {'Enabled' if self._pg_pool else 'Disabled'}, Local file: {self.db_path})")

    async def _save_to_postgres(self, data: dict):
        if not self._pg_pool:
            return
        try:
            payload = json.dumps(data, ensure_ascii=False)
            async with self._pg_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO bot_storage (id, data, updated_at)
                    VALUES ('main', $1::jsonb, NOW())
                    ON CONFLICT (id) DO UPDATE 
                    SET data = EXCLUDED.data, updated_at = NOW();
                """, payload)
        except Exception as e:
            logger.error(f"Error persisting data to PostgreSQL: {e}")

    async def _save_unlocked(self):
        # 1. Save to local file as immediate snapshot
        try:
            os.makedirs(os.path.dirname(self.db_path) if os.path.dirname(self.db_path) else ".", exist_ok=True)
            with open(self.db_path, "w", encoding="utf-8") as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save storage data to {self.db_path}: {e}")

        # 2. Save to PostgreSQL if connected
        if self._pg_pool:
            try:
                await self._save_to_postgres(self._data)
            except Exception as e:
                logger.error(f"Failed async update to PostgreSQL: {e}")

    def _get_or_create_user(self, user_id: int) -> Dict[str, Any]:
        uid = str(user_id)
        if uid not in self._data["users"]:
            self._data["users"][uid] = {
                "channels": list(DEFAULT_CHANNELS),
                "encrypted_channels": self.vault.encrypt_text(json.dumps(DEFAULT_CHANNELS)),
                "voice": DEFAULT_VOICE,
                "engine": DEFAULT_ENGINE,
                "lang": "ru",
                "style": "podcast",
                "history": []
            }
        return self._data["users"][uid]

    def _get_user_channels_unlocked(self, user: Dict[str, Any]) -> List[str]:
        # 1. Primary source: unencrypted list (guarantees channels are NEVER lost due to encryption key rotation)
        raw_channels = user.get("channels")
        if isinstance(raw_channels, list) and len(raw_channels) > 0:
            return [str(c).strip() for c in raw_channels if str(c).strip()]

        # 2. Secondary source: decrypt encrypted_channels for backward compatibility
        enc = user.get("encrypted_channels")
        if enc:
            decrypted_json = self.vault.decrypt_text(enc)
            try:
                res = json.loads(decrypted_json)
                if isinstance(res, list) and len(res) > 0:
                    cleaned = [str(c).strip() for c in res if str(c).strip()]
                    user["channels"] = list(cleaned)
                    return cleaned
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
                user["channels"] = list(current_channels)
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
                user["channels"] = list(new_channels)
                user["encrypted_channels"] = self.vault.encrypt_text(json.dumps(new_channels))
                await self._save_unlocked()
                return True
            return False

    async def reset_user_channels(self, user_id: int) -> List[str]:
        async with self._lock:
            user = self._get_or_create_user(user_id)
            user["channels"] = list(DEFAULT_CHANNELS)
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

    async def get_storage_stats(self) -> Dict[str, Any]:
        """Returns high-level statistics for bot administrator/diagnostics."""
        import time
        now = time.time()
        async with self._lock:
            users = self._data.get("users", {})
            total_users = len(users)
            total_digests = 0
            active_users_24h = 0
            for u in users.values():
                hist = u.get("history", [])
                total_digests += len(hist)
                if hist and (now - hist[-1].get("created_at", 0) < 86400):
                    active_users_24h += 1
            return {
                "total_users": total_users,
                "total_digests": total_digests,
                "active_users_24h": active_users_24h
            }

    async def get_user_seen_post_keys(self, user_id: int) -> set:
        """
        Returns a set of all canonical post keys already included in any previous digest
        for this user (retaining history for up to 14 days). Prevents duplicate news across 24h/48h periods.
        """
        import time
        cutoff_time = time.time() - (14 * 86400)
        async with self._lock:
            user = self._get_or_create_user(user_id)
            seen_set = set()

            # 1. New persistent seen_posts dict: {post_key: timestamp}
            seen_dict = user.get("seen_posts", {})
            for k, ts in seen_dict.items():
                if isinstance(ts, (int, float)) and ts >= cutoff_time:
                    seen_set.add(k)
                elif isinstance(ts, str):
                    seen_set.add(k)

            # 2. Legacy seen_posts_by_date support (date strings e.g. "2026-09-03")
            legacy_dict = user.get("seen_posts_by_date", {})
            for date_key, posts_list in legacy_dict.items():
                if isinstance(posts_list, list):
                    seen_set.update(posts_list)

            return seen_set

    async def mark_posts_seen(self, user_id: int, post_keys: List[str]):
        """
        Marks post keys as permanently seen for this user with current timestamp.
        Automatically prunes records older than 14 days or keeping up to 2000 keys.
        """
        import time
        now = time.time()
        cutoff_time = now - (14 * 86400)
        async with self._lock:
            user = self._get_or_create_user(user_id)
            if "seen_posts" not in user:
                user["seen_posts"] = {}

            # Add newly processed post keys with timestamp
            for pk in post_keys:
                if pk:
                    user["seen_posts"][pk] = now

            # Prune posts older than 14 days or beyond 2000 items
            if len(user["seen_posts"]) > 2000:
                user["seen_posts"] = {
                    k: v for k, v in user["seen_posts"].items()
                    if isinstance(v, (int, float)) and v >= cutoff_time
                }
                # If still over 2000, keep latest 2000
                if len(user["seen_posts"]) > 2000:
                    sorted_items = sorted(user["seen_posts"].items(), key=lambda x: x[1], reverse=True)[:2000]
                    user["seen_posts"] = dict(sorted_items)

            await self._save_unlocked()

    async def clear_user_seen_posts(self, user_id: int):
        """Clears all seen posts tracking for the user."""
        async with self._lock:
            user = self._get_or_create_user(user_id)
            user["seen_posts"] = {}
            user["seen_posts_by_date"] = {}
            await self._save_unlocked()

    # Backward compatibility aliases
    async def get_user_seen_posts_today(self, user_id: int) -> set:
        return await self.get_user_seen_post_keys(user_id)

    async def mark_posts_seen_today(self, user_id: int, post_keys: List[str]):
        await self.mark_posts_seen(user_id, post_keys)

    async def clear_user_seen_posts_today(self, user_id: int):
        await self.clear_user_seen_posts(user_id)

    async def close(self):
        """Cleanly closes PostgreSQL pool connection if open."""
        if self._pg_pool:
            try:
                await self._pg_pool.close()
                logger.info("PostgreSQL storage connection closed.")
            except Exception as e:
                logger.warning(f"Error closing PostgreSQL connection: {e}")

storage_service = StorageService()
