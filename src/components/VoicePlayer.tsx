import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Gauge, 
  Sparkles,
  Radio,
  Sliders,
  Check,
  User
} from 'lucide-react';
import { speechController, FOUR_OFFICIAL_VOICES, PresetVoiceConfig } from '../utils/speech';

interface VoicePlayerProps {
  text: string;
  cleanSpeechText?: string;
  onSentenceHighlight?: (sentenceIndex: number, sentenceText: string) => void;
  title?: string;
  channelTags?: string[];
  autoPlay?: boolean;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({
  text,
  cleanSpeechText,
  onSentenceHighlight,
  title = 'Аудио-дайджест новостей',
  channelTags = [],
  autoPlay = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(-1);
  const [currentSentenceText, setCurrentSentenceText] = useState<string>('');
  
  const [selectedPreset, setSelectedPreset] = useState<PresetVoiceConfig>(FOUR_OFFICIAL_VOICES[0]);
  const [rate, setRate] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const activeText = cleanSpeechText || text;

  // Words and time estimation
  const wordCount = activeText.split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round((wordCount / (130 * rate)) * 60);
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Load voices on mount
  useEffect(() => {
    const updateVoices = () => {
      const v = speechController.loadVoices();
      setVoices(v);
    };

    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.onvoiceschanged = updateVoices;
      } catch {
        // Safe ignore
      }
    }

    return () => {
      speechController.stop();
    };
  }, []);

  const handleSelectPreset = (preset: PresetVoiceConfig) => {
    setSelectedPreset(preset);
    setPitch(preset.recommendedPitch);
    setRate(preset.recommendedRate);
    if (isPlaying) {
      handleStop();
    }
  };

  const handlePlay = () => {
    if (isPaused) {
      speechController.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    setIsPlaying(true);
    setIsPaused(false);

    speechController.speak(activeText, {
      voiceGender: selectedPreset.gender,
      voiceLang: selectedPreset.lang,
      rate: rate,
      pitch: pitch,
      volume: isMuted ? 0 : volume,
      onStart: () => {
        setIsPlaying(true);
        setIsPaused(false);
      },
      onSentence: (idx, sText) => {
        setCurrentSentenceIndex(idx);
        setCurrentSentenceText(sText);
        if (onSentenceHighlight) onSentenceHighlight(idx, sText);
      },
      onEnd: () => {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentSentenceIndex(-1);
        setCurrentSentenceText('');
      },
      onError: () => {
        setIsPlaying(false);
        setIsPaused(false);
      },
    });
  };

  const handlePause = () => {
    speechController.pause();
    setIsPaused(true);
  };

  const handleStop = () => {
    speechController.stop();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentSentenceIndex(-1);
    setCurrentSentenceText('');
  };

  const handleReplay = () => {
    handleStop();
    setTimeout(() => {
      handlePlay();
    }, 150);
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div id="voice-player-container" className="bg-white/[0.04] backdrop-blur-2xl border border-white/15 rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden">
      
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-48 h-48 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Info */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center space-x-3.5">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
            isPlaying && !isPaused
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-400/40 border border-blue-400/40'
              : 'bg-white/5 border border-white/10 text-slate-400'
          }`}>
            <Radio className={`w-4 h-4 ${isPlaying && !isPaused ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              {title}
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                {selectedPreset.name}
              </span>
            </h4>
            <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
              <span>~{formatTime(estimatedSeconds)} мин</span>
              <span>•</span>
              <span>{wordCount} слов</span>
              {channelTags.length > 0 && (
                <>
                  <span>•</span>
                  <span>{channelTags.map(c => `@${c}`).join(', ')}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Settings Toggle */}
        <button
          id="btn-voice-settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
          className={`px-3.5 py-2 rounded-2xl border text-xs font-medium transition-all flex items-center gap-1.5 backdrop-blur-md ${
            showSettings 
              ? 'bg-blue-600/20 border-blue-400/40 text-blue-300' 
              : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">4 Голоса & Параметры</span>
        </button>
      </div>

      {/* 4 Official Voice Quick Selector Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 relative z-10">
        {FOUR_OFFICIAL_VOICES.map((preset) => {
          const isSelected = selectedPreset.id === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={`p-2.5 rounded-2xl text-left border transition-all flex items-center gap-2.5 backdrop-blur-md ${
                isSelected
                  ? 'bg-blue-600/25 border-blue-400/60 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-blue-500 text-white' : 'bg-white/10 text-slate-400'
              }`}>
                {preset.gender === 'male' ? '👨' : '👩'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold truncate flex items-center gap-1">
                  <span>{preset.name}</span>
                  {isSelected && <Check className="w-3 h-3 text-blue-400 shrink-0" />}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {preset.lang === 'ru' ? 'Русский' : 'English'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Animated Waveform Visualizer */}
      <div className="bg-black/35 backdrop-blur-md border border-white/10 rounded-2xl p-4 mb-5 relative z-10 shadow-inner">
        <div className="flex items-center justify-between gap-1 h-14 px-2">
          {Array.from({ length: 32 }).map((_, i) => {
            const seed = (i * 17) % 10;
            let barHeight = 15;
            if (isPlaying && !isPaused) {
              barHeight = Math.max(20, Math.min(95, (Math.sin(i * 0.5 + Date.now() * 0.005) * 40 + 50) + seed * 2));
            }

            return (
              <div
                key={i}
                className={`flex-1 rounded-full transition-all duration-150 ${
                  isPlaying && !isPaused
                    ? 'bg-gradient-to-t from-blue-500 via-cyan-400 to-indigo-400 shadow-sm shadow-blue-500/40'
                    : 'bg-white/10'
                }`}
                style={{
                  height: `${barHeight}%`,
                  opacity: isPlaying && !isPaused ? 0.75 + (seed % 4) * 0.08 : 0.35,
                }}
              />
            );
          })}
        </div>

        {/* Active sentence readout preview */}
        {isPlaying && currentSentenceText && (
          <div className="mt-2.5 pt-2.5 border-t border-white/10 text-xs text-blue-200/95 font-medium italic flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping shrink-0" />
            <span className="line-clamp-1">{currentSentenceText}</span>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3.5 relative z-10">
        {/* Play / Pause / Stop Buttons */}
        <div className="flex items-center space-x-2.5">
          {!isPlaying || isPaused ? (
            <button
              id="btn-voice-play"
              onClick={handlePlay}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-xl shadow-blue-600/30 border border-blue-400/30 active:scale-95 transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{isPaused ? 'Продолжить' : 'Слушать дайджест'}</span>
            </button>
          ) : (
            <button
              id="btn-voice-pause"
              onClick={handlePause}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm shadow-xl shadow-amber-500/30 active:scale-95 transition-all"
            >
              <Pause className="w-4 h-4 fill-slate-950" />
              <span>Пауза</span>
            </button>
          )}

          {isPlaying && (
            <button
              id="btn-voice-stop"
              onClick={handleStop}
              title="Остановить воспроизведение"
              className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition-all"
            >
              <Square className="w-4 h-4 fill-slate-300" />
            </button>
          )}

          <button
            id="btn-voice-replay"
            onClick={handleReplay}
            title="Воспроизвести сначала"
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Speed presets */}
        <div className="flex items-center space-x-1 bg-white/5 backdrop-blur-md p-1 rounded-2xl border border-white/10">
          {[1.0, 1.25, 1.5].map((speedVal) => (
            <button
              key={speedVal}
              onClick={() => {
                setRate(speedVal);
                if (isPlaying) {
                  handleStop();
                  setTimeout(() => handlePlay(), 100);
                }
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                rate === speedVal
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {speedVal}x
            </button>
          ))}
        </div>

        {/* Mute toggle */}
        <button
          onClick={handleToggleMute}
          className={`p-2.5 rounded-2xl border backdrop-blur-md transition-all ${
            isMuted 
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' 
              : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
          }`}
          title={isMuted ? 'Включить звук' : 'Выключить звук'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Voice Configuration Drawer */}
      {showSettings && (
        <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs relative z-10 animate-in fade-in slide-in-from-top-2 duration-200">
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Текущий профиль голоса:
            </label>
            <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-3 text-slate-200 text-xs">
              <div className="font-bold text-white mb-0.5">{selectedPreset.label}</div>
              <div className="text-slate-400 text-[11px] mb-2">{selectedPreset.description}</div>
              <div className="text-[11px] text-blue-300/90 italic bg-blue-500/10 p-2 rounded-xl border border-blue-500/20">
                «{selectedPreset.samplePhrase}»
              </div>
            </div>
          </div>

          {/* Pitch & Rate Sliders */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Скорость чтения (Rate):</span>
                <span className="font-bold text-blue-400">{rate}x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.5"
                step="0.05"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Тон голоса (Pitch):</span>
                <span className="font-bold text-purple-400">{pitch}</span>
              </div>
              <input
                type="range"
                min="0.85"
                max="1.25"
                step="0.02"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
