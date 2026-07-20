import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../context/TranslationContext';
import { Save, Plus, Trash2, Users, Shield, Edit, Info } from 'lucide-react';
import LocationsManagement from './LocationsManagement';

interface SettingItem {
  key: string;
  value: string;
}

interface UserAccount {
  id: string;
  username: string;
  role: string;
  telegram_id: string | null;
}

export default function SettingsTab() {
  const { t } = useTranslation();
  
  // Sub-tabs State
  const [subTab, setSubTab] = useState<'preferences' | 'users' | 'locations'>('preferences');

  // Settings State
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Users State
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'administrator',
    telegram_id: ''
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
      const res = await fetch('/api/system/settings');
      if (res.ok) {
        setSettings(await res.json());
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/system/users', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchUsers();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      // Exclude Project Name and language keys if they happen to remain in frontend state
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
      setSavingSettings(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      if (isEditingUser && editingUserId) {
        const res = await fetch(`/api/system/users/${editingUserId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            role: newUser.role,
            telegram_id: newUser.telegram_id || null,
            password: newUser.password || null
          })
        });
        if (res.ok) {
          setShowAddUserModal(false);
          setIsEditingUser(false);
          setEditingUserId(null);
          setNewUser({ username: '', password: '', role: 'administrator', telegram_id: '' });
          fetchUsers();
        } else {
          const errData = await res.json();
          alert(`Failed to update user: ${errData.detail || 'Unknown error'}`);
        }
      } else {
        const res = await fetch('/api/system/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            username: newUser.username,
            password: newUser.password,
            role: newUser.role,
            telegram_id: newUser.telegram_id || null
          })
        });
        if (res.ok) {
          setShowAddUserModal(false);
          setNewUser({ username: '', password: '', role: 'administrator', telegram_id: '' });
          fetchUsers();
        } else {
          const errData = await res.json();
          alert(`Failed to create user: ${errData.detail || 'Unknown error'}`);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartEditUser = (user: UserAccount) => {
    setNewUser({
      username: user.username,
      password: '',
      role: user.role,
      telegram_id: user.telegram_id || ''
    });
    setEditingUserId(user.id);
    setIsEditingUser(true);
    setShowAddUserModal(true);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user account?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/system/users/${userId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const errData = await res.json();
        alert(`Failed to delete user: ${errData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Page Header and Sub-tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">{t('settingsTitle')}</h2>
          <p className="text-zinc-400 text-xs mt-1">{t('settingsSub')}</p>
        </div>
        
        <div className="flex gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/60 w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setSubTab('preferences')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'preferences'
                ? 'bg-zinc-900 text-zinc-100 shadow-sm border border-zinc-800'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {t('settingsSubTabPreferences')}
          </button>
          <button
            onClick={() => setSubTab('users')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'users'
                ? 'bg-zinc-900 text-zinc-100 shadow-sm border border-zinc-800'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {t('settingsSubTabUsers')}
          </button>
          <button
            onClick={() => setSubTab('locations')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'locations'
                ? 'bg-zinc-900 text-zinc-100 shadow-sm border border-zinc-800'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {t('settingsSubTabLocations')}
          </button>
        </div>
      </div>

      {/* Sub-tab: Preferences */}
      {subTab === 'preferences' && (
        <div className="w-full space-y-4">
          <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-zinc-850">
              <Info size={16} className="text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">{t('settingsSystemConfig')}</span>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsApiHost')}</label>
                  <input
                    type="text"
                    value={getSetting('API_HOST', '192.168.222.2')}
                    onChange={(e) => updateSettingValue('API_HOST', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="e.g. 192.168.222.2"
                  />
                  <p className="text-[9px] text-zinc-500 mt-1">{t('descApiHost')}</p>
                </div>

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
                  <p className="text-[9px] text-zinc-500 mt-1">{t('descDefaultTz')}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-850 space-y-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">{t('settingsProvisionDefaults')}</span>
                <p className="text-[10px] text-zinc-450 leading-relaxed">
                  {t('descProvisionDefaults')}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-zinc-850/50">
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>

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

                <div className="pt-3 border-t border-zinc-850/50 space-y-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Default Normal User Account</span>
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
              </div>

              {/* DHCP settings section */}
              <div className="pt-3 border-t border-zinc-850 space-y-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">{t('settingsDhcpTitle')}</span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDhcpMode')}</label>
                    <select
                      value={getSetting('DHCP_MODE', 'full')}
                      onChange={(e) => updateSettingValue('DHCP_MODE', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none cursor-pointer"
                    >
                      <option value="full">Full DHCP Server</option>
                      <option value="proxy">Proxy DHCP (Co-exists with existing router)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDhcpInterface')}</label>
                    <input
                      type="text"
                      value={getSetting('DHCP_INTERFACE', 'enp88s0')}
                      onChange={(e) => updateSettingValue('DHCP_INTERFACE', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                      placeholder="e.g. enp88s0"
                    />
                  </div>
                </div>

                {getSetting('DHCP_MODE', 'full') === 'full' && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDhcpStart')}</label>
                        <input
                          type="text"
                          value={getSetting('DHCP_RANGE_START', '192.168.222.100')}
                          onChange={(e) => updateSettingValue('DHCP_RANGE_START', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDhcpEnd')}</label>
                        <input
                          type="text"
                          value={getSetting('DHCP_RANGE_END', '192.168.222.200')}
                          onChange={(e) => updateSettingValue('DHCP_RANGE_END', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsDhcpNetmask')}</label>
                        <input
                          type="text"
                          value={getSetting('DHCP_NETMASK', '255.255.255.0')}
                          onChange={(e) => updateSettingValue('DHCP_NETMASK', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Edge B.R.O. Integration credentials card */}
              <div className="pt-3 border-t border-zinc-850 space-y-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Edge B.R.O. Integration</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Edge B.R.O. Server URL</label>
                    <input
                      type="text"
                      value={getSetting('EDGE_BRO_URL', 'http://localhost:8000')}
                      onChange={(e) => updateSettingValue('EDGE_BRO_URL', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                      placeholder="e.g. http://192.168.222.3:8000"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">B.R.O. API Username</label>
                    <input
                      type="text"
                      value={getSetting('EDGE_BRO_USER', 'admin')}
                      onChange={(e) => updateSettingValue('EDGE_BRO_USER', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                      placeholder="e.g. admin"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">B.R.O. API Password</label>
                    <input
                      type="password"
                      value={getSetting('EDGE_BRO_PASSWORD', 'admin')}
                      onChange={(e) => updateSettingValue('EDGE_BRO_PASSWORD', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                      placeholder="e.g. admin_password"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-850 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-md"
                >
                  <Save size={14} />
                  <span>{savingSettings ? 'Saving...' : t('save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-tab: Users */}
      {subTab === 'users' && (
        <div className="space-y-4 w-full">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Users size={14} className="text-zinc-500" />
              <span>{t('settingsUserAccounts')}</span>
            </h3>
            <button
              onClick={() => {
                setIsEditingUser(false);
                setEditingUserId(null);
                setNewUser({ username: '', password: '', role: 'administrator', telegram_id: '' });
                setShowAddUserModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-100 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              <Plus size={14} />
              <span>{t('settingsAddUser')}</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md shadow-sm">
            <table className="min-w-full divide-y divide-zinc-850 text-left text-sm text-zinc-300">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-450">
                <tr className="border-b border-zinc-850 font-bold">
                  <th className="px-6 py-3.5">Username</th>
                  <th className="px-6 py-3.5">Role / Access Level</th>
                  <th className="px-6 py-3.5">Telegram ID (Individual Alerts)</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850 bg-zinc-900/10">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic animate-pulse">Loading users...</td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic">No user accounts registered.</td>
                  </tr>
                ) : (
                  users.map(u => (
                    <tr key={u.id} className="hover:bg-zinc-800/30 text-zinc-300 transition-colors">
                      <td className="px-6 py-4 font-bold text-zinc-200">{u.username}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          u.role === 'administrator' 
                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
                            : 'bg-zinc-500/10 text-zinc-450 border-zinc-500/20'
                        }`}>
                          <Shield size={10} />
                          <span className="capitalize">{u.role}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-zinc-350">{u.telegram_id || '—'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleStartEditUser(u)}
                            className="p-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/80 rounded transition-all cursor-pointer"
                            title="Edit Account Properties"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 border border-rose-500/20 rounded transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Delete Account"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Telegram Bot Configuration Card */}
          <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-zinc-850">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">{t('settingsTgBotConfig')}</span>
            </div>
            
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsTgBotToken')}</label>
                  <input
                    type="password"
                    value={getSetting('TELEGRAM_BOT_TOKEN')}
                    onChange={(e) => updateSettingValue('TELEGRAM_BOT_TOKEN', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="Token from @BotFather"
                  />
                  <p className="text-[9px] text-zinc-500 mt-1">{t('descTgBotToken')}</p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{t('settingsTgChatId')}</label>
                  <input
                    type="text"
                    value={getSetting('TELEGRAM_CHAT_ID')}
                    onChange={(e) => updateSettingValue('TELEGRAM_CHAT_ID', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none font-mono"
                    placeholder="Default alert chat/group"
                  />
                  <p className="text-[9px] text-zinc-500 mt-1">{t('descTgChatId')}</p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-md"
                >
                  <Save size={13} />
                  <span>{savingSettings ? 'Saving...' : t('save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-tab: Locations (Provision Profiles) */}
      {subTab === 'locations' && (
        <div className="space-y-4">
          <LocationsManagement />
        </div>
      )}

      {/* Add / Edit User Modal */}
      {showAddUserModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-modal-in">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-200">
                {isEditingUser ? 'Edit User Account Properties' : 'Register New User Account'}
              </h3>
              <button 
                onClick={() => {
                  setShowAddUserModal(false);
                  setIsEditingUser(false);
                  setEditingUserId(null);
                  setNewUser({ username: '', password: '', role: 'administrator', telegram_id: '' });
                }}
                className="text-zinc-500 hover:text-zinc-300 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Username</label>
                <input
                  type="text"
                  required
                  disabled={isEditingUser}
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none disabled:opacity-50 font-bold"
                  placeholder="e.g. system_operator"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Password {isEditingUser && '(leave blank to keep current)'}
                </label>
                <input
                  type="password"
                  required={!isEditingUser}
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Telegram ID (Optional)</label>
                <input
                  type="text"
                  value={newUser.telegram_id}
                  onChange={(e) => setNewUser({...newUser, telegram_id: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="e.g. 123456789"
                />
                <p className="text-[9px] text-zinc-500 mt-1">Used to alert this administrator individually via Telegram when a box installation transitions to active status.</p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Role / Access Level</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none cursor-pointer"
                >
                  <option value="administrator">Administrator</option>
                  <option value="operator">Operator</option>
                  <option value="viewer">Viewer</option>
                </select>
                <p className="text-[9px] text-zinc-500 mt-1">Pre-configures user level access bounds for orchestrator nodes and settings.</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-850">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUserModal(false);
                    setIsEditingUser(false);
                    setEditingUserId(null);
                    setNewUser({ username: '', password: '', role: 'administrator', telegram_id: '' });
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-zinc-450 hover:text-zinc-200 cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-md"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
