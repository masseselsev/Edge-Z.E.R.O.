import React, { useState } from 'react';
import { Lock, User, Loader2, ShieldAlert, Eye } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const { t, language } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || t('loginError'));
      }

      onLoginSuccess(data);
    } catch (err: any) {
      setError(err.message || t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  const getSubtitle = () => {
    if (language === 'ru') return 'Центр автоматического подключения';
    if (language === 'uk') return 'Центр автоматичного підключення';
    return 'Zero-Touch Onboarding Hub';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md p-8 bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-2xl space-y-6 animate-modal-in">
        
        {/* Header Identity */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative p-2.5 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl shadow-xl flex items-center justify-center w-14 h-14 text-indigo-400">
            <Eye size={28} className="animate-pulse filter drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-50 tracking-tight flex items-center justify-center gap-2">
              <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded font-mono font-bold text-xs uppercase tracking-wider">Edge Z.E.R.O.</span>
            </h2>
            <p className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider mt-1.5 font-mono">
              {getSubtitle()}
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-xl text-xs font-semibold animate-fade-in leading-relaxed">
            <ShieldAlert size={16} className="shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="username" className="block text-xs font-bold text-zinc-400 uppercase tracking-wider pl-1">{t('loginUsername')}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                <User size={16} />
              </span>
              <input
                type="text"
                id="username"
                name="username"
                autoComplete="username"
                required
                disabled={loading}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 focus:border-indigo-500 rounded-xl text-zinc-100 text-sm focus:outline-none transition-all duration-200"
                placeholder="e.g. admin"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-bold text-zinc-400 uppercase tracking-wider pl-1">{t('loginPassword')}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                <Lock size={16} />
              </span>
              <input
                type="password"
                id="password"
                name="password"
                autoComplete="current-password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 focus:border-indigo-500 rounded-xl text-zinc-100 text-sm focus:outline-none transition-all duration-200"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer outline-none"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin text-white" />
            ) : (
              t('loginSubmit')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
