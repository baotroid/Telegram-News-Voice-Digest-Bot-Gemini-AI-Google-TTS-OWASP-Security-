import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Radio, 
  Check, 
  X, 
  Search, 
  Sparkles, 
  ExternalLink,
  Shield,
  Layers
} from 'lucide-react';
import { TelegramChannel } from '../types';

interface ChannelManagerProps {
  channels: TelegramChannel[];
  setChannels: React.Dispatch<React.SetStateAction<TelegramChannel[]>>;
}

export const ChannelManager: React.FC<ChannelManagerProps> = ({ channels, setChannels }) => {
  const [newUsername, setNewUsername] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newCategory, setNewCategory] = useState<TelegramChannel['category']>('tech');
  const [newDesc, setNewDesc] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    const cleanUsername = newUsername.trim().replace('@', '');
    const newChan: TelegramChannel = {
      id: `ch-${Date.now()}`,
      username: cleanUsername,
      title: newTitle.trim() || `@${cleanUsername}`,
      category: newCategory,
      description: newDesc.trim() || 'Пользовательский канал',
      enabled: true,
    };

    setChannels([...channels, newChan]);
    setNewUsername('');
    setNewTitle('');
    setNewDesc('');
  };

  const handleToggle = (id: string) => {
    setChannels(
      channels.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const handleDelete = (id: string) => {
    setChannels(channels.filter((c) => c.id !== id));
  };

  const filteredChannels = channels.filter(
    (c) =>
      c.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="channel-manager-container" className="space-y-6">
      
      {/* Header & Stats */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xl hover:border-white/[0.15] transition-all">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-400" />
            <span>Управление каналами и источниками</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Подключайте ваши любимые каналы для автоматического чтения и озвучки новостей.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="px-3.5 py-1.5 rounded-2xl bg-white/5 border border-white/10 text-slate-300 font-semibold backdrop-blur-md">
            Всего: {channels.length}
          </span>
          <span className="px-3.5 py-1.5 rounded-2xl bg-blue-600/20 text-blue-300 border border-blue-400/30 font-semibold backdrop-blur-md">
            Активно: {channels.filter((c) => c.enabled).length}
          </span>
        </div>
      </div>

      {/* Add New Channel Card */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 space-y-4 shadow-2xl">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-400" />
          <span>Добавить новый Telegram-канал</span>
        </h3>

        <form onSubmit={handleAddChannel} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Юзернейм канала (@handle):
            </label>
            <input
              type="text"
              placeholder="например: durov или tabor_news"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-400/70 focus:bg-white/[0.08] backdrop-blur-md"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Название канала:
            </label>
            <input
              type="text"
              placeholder="например: Pavel Durov"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-400/70 focus:bg-white/[0.08] backdrop-blur-md"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Категория:
            </label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as any)}
              className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-blue-400/70 focus:bg-white/[0.08] backdrop-blur-md"
            >
              <option value="tech" className="bg-slate-900 text-slate-100">Технологии & IT</option>
              <option value="ai" className="bg-slate-900 text-slate-100">Искусственный интеллект</option>
              <option value="news" className="bg-slate-900 text-slate-100">Мировые новости</option>
              <option value="business" className="bg-slate-900 text-slate-100">Бизнес & Финансы</option>
              <option value="crypto" className="bg-slate-900 text-slate-100">Крипта & Web3</option>
              <option value="custom" className="bg-slate-900 text-slate-100">Другое</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xl shadow-blue-500/25 border border-blue-400/30 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Добавить канал
            </button>
          </div>
        </form>
      </div>

      {/* Search & Channel List */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 space-y-4 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>Список подключенных каналов ({filteredChannels.length})</span>
          </h3>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Поиск по названию или @..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/10 rounded-2xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-400/70 focus:bg-white/[0.08] backdrop-blur-md"
            />
          </div>
        </div>

        {/* Channel Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredChannels.map((ch) => (
            <div
              key={ch.id}
              className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between backdrop-blur-md ${
                ch.enabled
                  ? 'bg-white/[0.05] border-blue-400/40 shadow-lg shadow-blue-500/10'
                  : 'bg-white/[0.02] border-white/10 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h4 className="font-bold text-xs text-white flex items-center gap-1.5">
                      <span>{ch.title}</span>
                      {ch.subscriberCount && (
                        <span className="text-[10px] text-slate-400 font-normal">
                          • {ch.subscriberCount}
                        </span>
                      )}
                    </h4>
                    <span className="text-xs text-blue-300 font-mono">@{ch.username}</span>
                  </div>

                  <button
                    onClick={() => handleToggle(ch.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold backdrop-blur-md transition-all ${
                      ch.enabled
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/5 border border-white/10 text-slate-400'
                    }`}
                  >
                    {ch.enabled ? 'Активен' : 'Отключен'}
                  </button>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-2 mb-3">
                  {ch.description || 'Канал новостей'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/10 text-[11px]">
                <span className="px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 uppercase text-[9px] font-bold">
                  {ch.category}
                </span>

                <button
                  onClick={() => handleDelete(ch.id)}
                  className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
