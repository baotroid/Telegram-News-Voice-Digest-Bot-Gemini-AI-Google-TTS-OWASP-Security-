[README.md](https://github.com/user-attachments/files/31622140/README.md)
# 🎙️ Telegram News Voice Digest Bot (Gemini AI + Edge-TTS & OWASP Security)

Персональный Telegram-бот для создания аудио-дайджестов новостей с комплексной защитой от взломов и утечек данных.

---

## 🛡️ Архитектура безопасности:
1. **Шифрование данных (PII Vault)**: `cryptography.fernet` (AES) шифрует пользовательские данные.
2. **Rate Limiting Middleware**: Защита от флуда, DDoS и перебора.
3. **Anti-Injection Sanitizer**: Экранирование HTML и строгая валидация входящих данных.
4. **Log Masking**: Автоматическое скрытие токенов и телефонов в логах.
5. **RBAC & Private Chats**: Доступ администраторов по ID и изоляция личных данных от групп.

---

## ⚡ Быстрый старт:

### 1. Установите зависимости:
```bash
pip install -r requirements.txt
```

### 2. Заполните .env:
```env
BOT_TOKEN="123456789:ABCdef..."
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH="abcdef..."
GEMINI_API_KEY="AIzaSy..."
ENCRYPTION_KEY="ваш_32_байтный_ключ"
ADMIN_IDS=[123456789]
```

### 3. Запустите бота:
```bash
python bot.py
```
