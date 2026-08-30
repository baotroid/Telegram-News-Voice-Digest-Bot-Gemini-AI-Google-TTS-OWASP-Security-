import React, { useState } from 'react';
import { BOT_ICON_VARIANTS, BotIconOption } from '../data/botIcons';
import { 
  X, 
  Check, 
  Download, 
  Image as ImageIcon, 
  Sparkles, 
  Copy, 
  ExternalLink,
  ShieldCheck,
  FileCheck
} from 'lucide-react';
import { 
  downloadImageAsFile, 
  copyImageBlobToClipboard, 
  openImageInNewTab 
} from '../utils/imageUtils';

interface BotIconModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIconId: string;
  onSelectIcon: (id: string) => void;
}

export const BotIconModal: React.FC<BotIconModalProps> = ({
  isOpen,
  onClose,
  selectedIconId,
  onSelectIcon,
}) => {
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownload = async (icon: BotIconOption, format: 'image/jpeg' | 'image/png') => {
    const ext = format === 'image/jpeg' ? 'jpg' : 'png';
    const key = `${icon.id}-${ext}`;
    setDownloadingFormat(key);

    const safeName = `telegram_bot_avatar_${icon.id}.${ext}`;
    const success = await downloadImageAsFile(icon.src, safeName, format);

    if (success) {
      setSuccessMsg(`✅ Файл ${safeName} (${ext.toUpperCase()}) успешно сохранен в загрузки!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
    setDownloadingFormat(null);
  };

  const handleCopy = async (icon: BotIconOption) => {
    const success = await copyImageBlobToClipboard(icon.src);
    if (success) {
      setCopiedId(icon.id);
      setSuccessMsg('📋 Изображение скопировано в буфер обмена! Вы можете вставить его в Telegram сочетанием Ctrl+V.');
      setTimeout(() => {
        setCopiedId(null);
        setSuccessMsg(null);
      }, 4000);
    } else {
      // Fallback: open in new tab
      openImageInNewTab(icon.src);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 border border-white/15 rounded-3xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl relative overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between mb-5 relative z-10 shrink-0">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-400">
                <ImageIcon className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">Аватарка для Telegram-бота</h3>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" /> 100% совместимо с Windows & Mac
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Специально сгенерированные иконки высокого разрешения (квадрат 1:1) в винтажном дикторском стиле.
              Скачайте в формате <b>JPG</b> или <b>PNG</b> и отправьте боту <b>@BotFather</b> через команду <code>/setuserpic</code>.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/10 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success toast notification inside modal */}
        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs rounded-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 relative z-10 shrink-0">
            <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 3 Variants Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 relative z-10 overflow-y-auto pr-1">
          {BOT_ICON_VARIANTS.map((variant) => {
            const isSelected = selectedIconId === variant.id;
            const isDownloadingJpg = downloadingFormat === `${variant.id}-jpg`;
            const isDownloadingPng = downloadingFormat === `${variant.id}-png`;
            const isCopied = copiedId === variant.id;

            return (
              <div
                key={variant.id}
                onClick={() => onSelectIcon(variant.id)}
                className={`group relative rounded-2xl p-3.5 border transition-all cursor-pointer flex flex-col ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500 shadow-xl shadow-blue-500/20 ring-1 ring-blue-500'
                    : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.08]'
                }`}
              >
                {/* Image Preview Container */}
                <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-slate-950 border border-white/10 group-hover:border-blue-400/40 transition-colors">
                  <img
                    src={variant.src}
                    alt={variant.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-600 text-white p-1.5 rounded-full shadow-lg border border-white/30">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>
                  )}
                  
                  {/* Top-left style pill */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-md rounded-lg text-[10px] font-medium text-slate-200 border border-white/15">
                    1024×1024
                  </div>

                  {/* Open in new tab overlay button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openImageInNewTab(variant.src);
                    }}
                    title="Открыть изображение в полном размере"
                    className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-slate-300 hover:text-white border border-white/15 backdrop-blur-md transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Details */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-1">
                      {variant.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {variant.description}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2">
                    {/* Primary Select & Copy Row */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectIcon(variant.id);
                        }}
                        className={`flex-1 text-xs py-1.5 px-3 rounded-xl font-medium transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                            : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
                        }`}
                      >
                        {isSelected ? '✓ Выбрано' : 'Выбрать'}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(variant);
                        }}
                        title="Скопировать картинку для вставки через Ctrl+V в Telegram"
                        className="text-xs px-2.5 py-1.5 rounded-xl font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 flex items-center gap-1 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isCopied ? 'Скопировано!' : 'Копия'}</span>
                      </button>
                    </div>

                    {/* Download Buttons (JPG & PNG) */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(variant, 'image/jpeg');
                        }}
                        title="Скачать настоящий файл JPG (высокая совместимость с Windows Photo Viewer)"
                        className="text-xs py-1.5 px-2 rounded-xl font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 flex items-center justify-center gap-1 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        <span>{isDownloadingJpg ? 'Сохранение...' : 'Скачать JPG'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(variant, 'image/png');
                        }}
                        title="Скачать чистый файл PNG (без сжатия)"
                        className="text-xs py-1.5 px-2 rounded-xl font-medium bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 flex items-center justify-center gap-1 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        <span>{isDownloadingPng ? 'Сохранение...' : 'Скачать PNG'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Instructions Footer */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-300 relative z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <b>Как установить в Telegram:</b> В диалоге с <b>@BotFather</b> отправьте <code>/setuserpic</code>, выберите вашего бота и отправьте скачанный файл (JPG или PNG) как фотографию.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors shadow-md ml-auto shrink-0"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};

