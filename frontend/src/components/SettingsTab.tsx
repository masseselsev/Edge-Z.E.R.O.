import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Save } from 'lucide-react';

interface SettingItem {
  key: string;
  value: string;
}

export default function SettingsTab() {
  const { t, language, setLanguage } = useTranslation();
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/system/settings');
        if (res.ok) {
          setSettings(await res.json());
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert('Settings updated successfully!');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const updateSettingValue = (key: string, value: string) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  if (loading) {
    return <div className="text-zinc-500 text-sm animate-pulse">{t('loading')}</div>;
  }

  // Find or default some common settings
  const project_name = settings.find(s => s.key === 'PROJECT_NAME')?.value || 'Overwatch';
  const api_host = settings.find(s => s.key === 'API_HOST')?.value || '192.168.222.2';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('settingsTitle')}</h1>
        <p className="text-zinc-400 text-xs mt-1">{t('settingsSub')}</p>
      </div>

      <div className="max-w-xl bg-zinc-900/30 border border-zinc-800 p-6 rounded-xl shadow-sm">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Project Name</label>
            <input
              type="text"
              value={project_name}
              onChange={(e) => updateSettingValue('PROJECT_NAME', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">API Host Address</label>
            <input
              type="text"
              value={api_host}
              onChange={(e) => updateSettingValue('API_HOST', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('language')}</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none cursor-pointer"
            >
              <option value="en">English</option>
              <option value="uk">Українська</option>
              <option value="ru">Русский</option>
            </select>
          </div>

          <div className="pt-4 border-t border-zinc-850 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-md"
            >
              <Save size={14} />
              <span>{saving ? 'Saving...' : t('save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
