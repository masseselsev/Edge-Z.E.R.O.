import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Save, Info, Shield, MapPin, Plus, Trash2, Edit, Network, Globe, Sliders } from 'lucide-react';

interface SettingItem {
  key: string;
  value: string;
}

interface Location {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  locale: string;
  keyboard: string;
  gateway: string | null;
  netmask: string | null;
  dns_server: string | null;
  ntp_server: string | null;
  package_mirror: string | null;
  ssh_public_key: string | null;
}

export default function ProfilesTab() {
  const { t } = useTranslation();

  // Active Selection State: 'default' or a location UUID or 'new'
  const [selectedProfileId, setSelectedProfileId] = useState<string>('default');

  // Default Profile (System Settings) State
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Location Profiles State
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);

  // Location Profile Form State
  const [locForm, setLocForm] = useState<Record<string, string>>({
    name: '',
    description: '',
    timezone: 'UTC',
    locale: 'en_US.UTF-8',
    keyboard: 'us',
    gateway: '',
    netmask: '',
    dns_server: '',
    ntp_server: '',
    package_mirror: '',
    ssh_public_key: ''
  });

  const timezoneOptions = React.useMemo(() => {
    let zones: string[] = [];
    try {
      zones = (Intl as any).supportedValuesOf('timeZone') || [];
    } catch (e) {
      zones = [
        'UTC', 'Europe/Kyiv', 'Asia/Tashkent', 'Europe/London', 'Europe/Paris',
        'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo',
        'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Yekaterinburg'
      ];
    }
    return zones;
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/system/settings', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setSettings(await res.json());
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await fetch('/api/locations/');
      if (res.ok) {
        setLocations(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch location profiles:', err);
    } finally {
      setLoadingLocations(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchLocations();
  }, []);

  // System Settings Handlers
  const updateSettingValue = (key: string, value: string) => {
    setSettings(prev => {
      if (prev.some(s => s.key === key)) {
        return prev.map(s => s.key === key ? { ...s, value } : s);
      }
      return [...prev, { key, value }];
    });
  };

  const getSetting = (key: string, fallback: string = '') => {
    return settings.find(s => s.key === key)?.value || fallback;
  };

  const handleSaveDefaultSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/system/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to save: ${errData.detail || res.status}`);
      }
    } catch (err) {
      console.error(err);
      alert('Save failed. Check console.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Location Profile Handlers
  const handleSelectLocation = (loc: Location) => {
    setSelectedProfileId(loc.id);
    setLocForm({
      name: loc.name,
      description: loc.description || '',
      timezone: loc.timezone,
      locale: loc.locale,
      keyboard: loc.keyboard,
      gateway: loc.gateway || '',
      netmask: loc.netmask || '',
      dns_server: loc.dns_server || '',
      ntp_server: loc.ntp_server || '',
      package_mirror: loc.package_mirror || '',
      ssh_public_key: loc.ssh_public_key || ''
    });
  };

  const handleStartCreateLocation = () => {
    setSelectedProfileId('new');
    setLocForm({
      name: '',
      description: '',
      timezone: getSetting('DEFAULT_TIMEZONE', 'UTC'),
      locale: getSetting('DEFAULT_LOCALE', 'en_US.UTF-8'),
      keyboard: getSetting('DEFAULT_KEYBOARD', 'us'),
      gateway: '',
      netmask: '255.255.255.0',
      dns_server: getSetting('DEFAULT_DNS', ''),
      ntp_server: getSetting('DEFAULT_NTP', 'pool.ntp.org'),
      package_mirror: getSetting('DEFAULT_PACKAGE_MIRROR', 'deb.debian.org'),
      ssh_public_key: getSetting('DEFAULT_SSH_PUBLIC_KEY', '')
    });
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanForm = {
      ...locForm,
      description: locForm.description || null,
      gateway: locForm.gateway || null,
      netmask: locForm.netmask || null,
      dns_server: locForm.dns_server || null,
      ntp_server: locForm.ntp_server || null,
      package_mirror: locForm.package_mirror || null,
      ssh_public_key: locForm.ssh_public_key || null
    };

    try {
      const isCreating = selectedProfileId === 'new';
      const url = isCreating ? '/api/locations/' : `/api/locations/${selectedProfileId}`;
      const method = isCreating ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanForm)
      });

      if (res.ok) {
        const savedLoc: Location = await res.json();
        await fetchLocations();
        setSelectedProfileId(savedLoc.id || 'default');
      } else {
        const data = await res.json();
        alert(`Error: ${data.detail || 'Failed to save profile'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Profile? Devices using it will fall back to Default Profile.')) return;
    try {
      const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedProfileId('default');
        fetchLocations();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectedLocObj = locations.find(l => l.id === selectedProfileId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Sliders size={22} className="text-indigo-400" />
            <span>{t('tabProfiles')}</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-1">{t('profilesSub')}</p>
        </div>
        <button
          onClick={handleStartCreateLocation}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md"
        >
          <Plus size={14} />
          <span>Add Custom Profile</span>
        </button>
      </div>

      {/* Main 2-Column Unified Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Left Column: Unified Profiles Selector */}
        <div className="md:col-span-1 border border-zinc-800 bg-zinc-900/40 rounded-2xl overflow-hidden divide-y divide-zinc-850 shadow-sm">
          {/* Default Profile Card */}
          <button
            onClick={() => setSelectedProfileId('default')}
            className={`w-full text-left p-4 flex items-center justify-between text-xs transition-all cursor-pointer ${
              selectedProfileId === 'default'
                ? 'bg-indigo-600/15 border-l-4 border-indigo-500 text-zinc-100'
                : 'hover:bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl border ${selectedProfileId === 'default' ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-zinc-850 border-zinc-750 text-zinc-400'}`}>
                <Shield size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-100">Default OS Profile</span>
                  <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase">Default</span>
                </div>
                <p className="text-zinc-500 text-[10px] mt-0.5">Global fallback settings for all boxes</p>
              </div>
            </div>
          </button>

          {/* Location Profiles List Header */}
          <div className="px-4 py-2.5 bg-zinc-950/60 text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center justify-between">
            <span>Location / Object Profiles ({locations.length})</span>
          </div>

          {loadingLocations ? (
            <div className="p-4 text-center text-zinc-500 italic text-xs animate-pulse">Loading profiles...</div>
          ) : locations.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 italic text-xs">No location profiles created.</div>
          ) : (
            locations.map((loc) => {
              const isSelected = selectedProfileId === loc.id;
              return (
                <button
                  key={loc.id}
                  onClick={() => handleSelectLocation(loc)}
                  className={`w-full text-left p-4 flex items-center justify-between text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/15 border-l-4 border-indigo-500 text-zinc-100'
                      : 'hover:bg-zinc-800/40 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl border ${isSelected ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-zinc-850 border-zinc-750 text-zinc-400'}`}>
                      <MapPin size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-200">{loc.name}</p>
                      <p className="text-zinc-500 text-[10px] mt-0.5 truncate max-w-[170px]">
                        {loc.description || 'Custom location overrides'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono bg-zinc-950 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800">
                    {loc.timezone}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Right Column: Profile Editor Panel */}
        <div className="md:col-span-2">
          {/* Case 1: Default Profile Selected */}
          {selectedProfileId === 'default' && (
            <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800 p-6 rounded-2xl shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">Default OS Profile Configuration</span>
                </div>
                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono">System Fallback</span>
              </div>

              {loadingSettings ? (
                <div className="h-32 flex items-center justify-center text-zinc-500 text-xs">Loading defaults…</div>
              ) : (
                <form onSubmit={handleSaveDefaultSettings} className="space-y-5">
                  <div className="space-y-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Provisioning Network & Localization Defaults</span>
                    <p className="text-[10px] text-zinc-450 leading-relaxed">
                      These settings configure boxes when no location profile overrides are specified.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDefaultTz')}</label>
                        <select
                          value={getSetting('DEFAULT_TIMEZONE', 'UTC')}
                          onChange={(e) => updateSettingValue('DEFAULT_TIMEZONE', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none cursor-pointer"
                        >
                          {timezoneOptions.map(tz => (
                            <option key={tz} value={tz}>{tz}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDefaultLocale')}</label>
                        <select
                          value={getSetting('DEFAULT_LOCALE', 'en_US.UTF-8')}
                          onChange={(e) => updateSettingValue('DEFAULT_LOCALE', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none cursor-pointer"
                        >
                          <option value="en_US.UTF-8">English (en_US.UTF-8)</option>
                          <option value="ru_RU.UTF-8">Russian (ru_RU.UTF-8)</option>
                          <option value="uk_UA.UTF-8">Ukrainian (uk_UA.UTF-8)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDefaultKeyboard')}</label>
                        <select
                          value={getSetting('DEFAULT_KEYBOARD', 'us')}
                          onChange={(e) => updateSettingValue('DEFAULT_KEYBOARD', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none cursor-pointer"
                        >
                          <option value="us">United States (us)</option>
                          <option value="ru">Russian (ru)</option>
                          <option value="ua">Ukrainian (ua)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDefaultMirror')}</label>
                        <input
                          type="text"
                          value={getSetting('DEFAULT_PACKAGE_MIRROR', 'deb.debian.org')}
                          onChange={(e) => updateSettingValue('DEFAULT_PACKAGE_MIRROR', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                          placeholder="e.g. deb.debian.org"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDefaultNtp')}</label>
                        <input
                          type="text"
                          value={getSetting('DEFAULT_NTP', 'pool.ntp.org')}
                          onChange={(e) => updateSettingValue('DEFAULT_NTP', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                          placeholder="e.g. pool.ntp.org"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDefaultGateway')}</label>
                        <input
                          type="text"
                          value={getSetting('DEFAULT_GATEWAY')}
                          onChange={(e) => updateSettingValue('DEFAULT_GATEWAY', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                          placeholder="e.g. 192.168.1.1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDefaultDns')}</label>
                        <input
                          type="text"
                          value={getSetting('DEFAULT_DNS')}
                          onChange={(e) => updateSettingValue('DEFAULT_DNS', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                          placeholder="e.g. 8.8.8.8"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDefaultSsh')}</label>
                      <textarea
                        rows={3}
                        value={getSetting('DEFAULT_SSH_PUBLIC_KEY')}
                        onChange={(e) => updateSettingValue('DEFAULT_SSH_PUBLIC_KEY', e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-200 p-2.5 rounded-lg outline-none font-mono resize-y"
                        placeholder="ssh-rsa AAAA..."
                      />
                    </div>
                  </div>

                  {/* Default Accounts */}
                  <div className="pt-3 border-t border-zinc-850 space-y-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">{t('profilesDefaultAccounts')}</span>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDefaultRootPassword')}</label>
                      <input
                        type="password"
                        value={getSetting('DEFAULT_ROOT_PASSWORD')}
                        onChange={(e) => updateSettingValue('DEFAULT_ROOT_PASSWORD', e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                        placeholder="••••••••"
                      />
                      <p className="text-[9px] text-zinc-500 mt-1">{t('descDefaultRootPassword')}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Default Username</label>
                        <input
                          type="text"
                          value={getSetting('DEFAULT_USER_USERNAME')}
                          onChange={(e) => updateSettingValue('DEFAULT_USER_USERNAME', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                          placeholder="e.g. user (leave blank to disable user creation)"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">User Full Name</label>
                        <input
                          type="text"
                          value={getSetting('DEFAULT_USER_FULLNAME')}
                          onChange={(e) => updateSettingValue('DEFAULT_USER_FULLNAME', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                          placeholder="e.g. Default User"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">User Password</label>
                      <input
                        type="password"
                        value={getSetting('DEFAULT_USER_PASSWORD')}
                        onChange={(e) => updateSettingValue('DEFAULT_USER_PASSWORD', e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                        placeholder="••••••••"
                      />
                      <p className="text-[9px] text-zinc-500 mt-1">Leave blank to keep existing password.</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-850 flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md"
                    >
                      <Save size={14} />
                      <span>{savingSettings ? 'Saving...' : t('save')}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Case 2: Location Profile Selected or Creating New */}
          {selectedProfileId !== 'default' && (
            <form onSubmit={handleSaveLocation} className="bg-zinc-900/40 border border-zinc-800 p-6 rounded-2xl space-y-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <MapPin size={18} className="text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                    {selectedProfileId === 'new' ? 'Create Custom Location Profile' : `Configure Profile: ${selectedLocObj?.name || ''}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedProfileId !== 'new' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteLocation(selectedProfileId)}
                      className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg cursor-pointer transition-colors"
                      title="Delete Profile"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Profile / Location Name</label>
                  <input
                    type="text"
                    required
                    value={locForm.name}
                    onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                    placeholder="e.g. Tashkent Lab"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Description</label>
                  <input
                    type="text"
                    value={locForm.description}
                    onChange={(e) => setLocForm({ ...locForm, description: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                    placeholder="Description or notes"
                  />
                </div>

                {/* Section Header */}
                <div className="sm:col-span-2 pt-2 border-t border-zinc-850 flex items-center gap-1.5 text-zinc-400">
                  <Globe size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Localization Overrides</span>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Timezone</label>
                  <select
                    value={locForm.timezone}
                    onChange={(e) => setLocForm({ ...locForm, timezone: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none cursor-pointer"
                  >
                    {timezoneOptions.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Locale</label>
                  <input
                    type="text"
                    value={locForm.locale}
                    onChange={(e) => setLocForm({ ...locForm, locale: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="e.g. ru_RU.UTF-8"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Keyboard Map</label>
                  <input
                    type="text"
                    value={locForm.keyboard}
                    onChange={(e) => setLocForm({ ...locForm, keyboard: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="e.g. ru"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Package Mirror</label>
                  <input
                    type="text"
                    value={locForm.package_mirror}
                    onChange={(e) => setLocForm({ ...locForm, package_mirror: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="e.g. uz.debian.org"
                  />
                </div>

                {/* Network Profile Section */}
                <div className="sm:col-span-2 pt-2 border-t border-zinc-850 flex items-center gap-1.5 text-zinc-400">
                  <Network size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Network Overrides</span>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Gateway</label>
                  <input
                    type="text"
                    value={locForm.gateway}
                    onChange={(e) => setLocForm({ ...locForm, gateway: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="e.g. 192.168.1.1"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Netmask</label>
                  <input
                    type="text"
                    value={locForm.netmask}
                    onChange={(e) => setLocForm({ ...locForm, netmask: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="e.g. 255.255.255.0"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">DNS Server</label>
                  <input
                    type="text"
                    value={locForm.dns_server}
                    onChange={(e) => setLocForm({ ...locForm, dns_server: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="e.g. 8.8.8.8"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">NTP Server</label>
                  <input
                    type="text"
                    value={locForm.ntp_server}
                    onChange={(e) => setLocForm({ ...locForm, ntp_server: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="e.g. pool.ntp.org"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">SSH Authorized Key</label>
                  <textarea
                    rows={3}
                    value={locForm.ssh_public_key}
                    onChange={(e) => setLocForm({ ...locForm, ssh_public_key: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono resize-y"
                    placeholder="ssh-rsa AAAA..."
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-850 flex items-center justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md"
                >
                  <Save size={14} />
                  <span>Save Profile</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
