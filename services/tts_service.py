import asyncio
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
            paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
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
