import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../context/TranslationContext';
import LanguageSelector from './LanguageSelector';
import { Sun, Moon, User, ArrowDown, ArrowUp, LayoutDashboard, Server, Library, ScrollText, Terminal, Settings, Eye, Database, Sliders, Cpu } from 'lucide-react';

declare const __APP_VERSION__: string;

interface BandwidthInfo {
  cpu_utilization: number;
  ram_utilization: number;
  rx_speed: number;
  tx_speed: number;
  rx_percent: number;
  tx_percent: number;
}

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: any;
  onLogout: () => void;
  onEditProfile: () => void;
}

export default function Header({ activeTab, setActiveTab, currentUser, onLogout, onEditProfile }: HeaderProps) {
  const { t, language } = useTranslation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [metrics, setMetrics] = useState<BandwidthInfo>({
    cpu_utilization: 0,
    ram_utilization: 0,
    rx_speed: 0,
    tx_speed: 0,
    rx_percent: 0,
    tx_percent: 0
  });

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Toggle Theme
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    if (next === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  };

  // Sync theme class on load
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Poll system diagnostics
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/system/bandwidth', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (err) {
        console.error('Failed to fetch diagnostics:', err);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec >= 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  };

  const getUsageColorClass = (val: number) => {
    if (val > 80) return 'text-rose-450 font-bold';
    if (val > 50) return 'text-amber-400 font-bold';
    return 'text-emerald-400';
  };

  const navItems = [
    { id: 'inventory', label: t('tabInventory'), icon: <Server size={14} /> },
    { id: 'profiles', label: t('tabProfiles'), icon: <Sliders size={14} /> },
    { id: 'library', label: t('tabLibrary'), icon: <Library size={14} /> },
    { id: 'logs', label: t('tabLogs'), icon: <Terminal size={14} /> },
    { id: 'settings', label: t('tabSettings'), icon: <Settings size={14} /> },
    { id: 'vsm2flasher', label: t('tabVsm2Flasher'), icon: <Cpu size={14} /> },
    { 
      id: 'edgebro', 
      label: t('tabEdgeBro'), 
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    }
  ];

  const getSubtitle = () => {
    return 'Zero-Touch Onboarding Hub';
  };

  return (
    <header className="bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800/80 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 py-3 space-y-3">
        {/* Row 1: Brand | Metrics | Controllers */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Left Brand Shield Identity */}
          <div className="flex-1 flex items-center gap-3 justify-center md:justify-start">
            <div className="relative p-2 bg-indigo-600/15 border border-indigo-500/30 rounded-lg shadow-lg flex items-center justify-center w-10 h-10 text-indigo-400">
              <Eye size={20} className="animate-pulse filter drop-shadow-[0_0_4px_rgba(99,102,241,0.6)]" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
            </div>
            <div>
              <h1 className="text-base font-bold text-zinc-50 tracking-tight leading-none flex items-center gap-2">
                <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-mono font-bold text-xs uppercase tracking-wider">Edge-Z.E.R.O.</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono font-bold">v{__APP_VERSION__}</span>
              </h1>
              <p className="text-[9px] text-zinc-500 font-semibold mt-1.5 uppercase tracking-wider">
                {getSubtitle()}
              </p>
            </div>
          </div>

          {/* Center Metrics Widget */}
          <div className="flex-shrink-0 flex items-center gap-3 bg-zinc-950/40 border border-zinc-800/60 rounded-xl px-3 py-1.5 shadow-inner transition-all duration-300">
            <div className="flex items-center gap-1.5" title="CPU Utilization">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold font-mono">CPU</span>
              <span className={`text-[11px] font-mono font-semibold transition-colors duration-500 ${getUsageColorClass(metrics.cpu_utilization)}`}>
                {metrics.cpu_utilization.toFixed(0)}%
              </span>
            </div>
            
            <div className="w-px h-3 bg-zinc-800" />

            <div className="flex items-center gap-1.5" title="RAM Utilization">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold font-mono">RAM</span>
              <span className={`text-[11px] font-mono font-semibold transition-colors duration-500 ${getUsageColorClass(metrics.ram_utilization)}`}>
                {metrics.ram_utilization.toFixed(0)}%
              </span>
            </div>

            <div className="w-px h-3 bg-zinc-800" />

            <div className="flex items-center gap-1.5" title="Bandwidth Download">
              <ArrowDown size={12} className={metrics.rx_speed > 1024 ? 'text-emerald-400 animate-pulse' : 'text-zinc-600'} />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold font-mono">RX</span>
              <span className={`text-[11px] font-mono font-semibold transition-colors duration-500 ${getUsageColorClass(metrics.rx_percent)}`}>
                {formatSpeed(metrics.rx_speed)}
              </span>
              <span className={`text-[9px] font-mono ${getUsageColorClass(metrics.rx_percent)}`}>({metrics.rx_percent.toFixed(1)}%)</span>
            </div>

            <div className="w-px h-3 bg-zinc-800" />

            <div className="flex items-center gap-1.5" title="Bandwidth Upload">
              <ArrowUp size={12} className={metrics.tx_speed > 1024 ? 'text-emerald-400 animate-pulse' : 'text-zinc-600'} />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold font-mono">TX</span>
              <span className={`text-[11px] font-mono font-semibold transition-colors duration-500 ${getUsageColorClass(metrics.tx_percent)}`}>
                {formatSpeed(metrics.tx_speed)}
              </span>
              <span className={`text-[9px] font-mono ${getUsageColorClass(metrics.tx_percent)}`}>({metrics.tx_percent.toFixed(1)}%)</span>
            </div>
          </div>

          {/* Right Controllers Dropdown & Switches */}
          <div className="flex-1 flex flex-wrap items-center justify-center md:justify-end gap-3">
            <div className="flex items-center gap-2">
              
              {/* User Dropdown Selector */}
              {currentUser && (
                <div className="relative mr-1" ref={profileDropdownRef}>
                  <button
                    onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-bold transition-all duration-200 cursor-pointer outline-none"
                  >
                    <User size={13} className="text-zinc-400" />
                    <span className="capitalize">{currentUser.username}</span>
                    <svg className={`w-3 h-3 text-zinc-500 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {profileDropdownOpen && (
                    <div className="absolute right-0 mt-1.5 w-44 rounded-lg bg-zinc-900 border border-zinc-800 shadow-2xl p-1 z-50 origin-top-right animate-dropdown-in">
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onEditProfile();
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold rounded-md text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        Edit Profile
                      </button>
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onLogout();
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold rounded-md text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors border-t border-zinc-800 mt-1 pt-2 cursor-pointer"
                      >
                        {t('logoutButton')}
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              <LanguageSelector />
              
              <button
                onClick={toggleTheme}
                className="p-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer flex items-center justify-center outline-none"
                title="Toggle Theme"
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
          </div>

        </div>

        {/* Row 2: Tab Navigation row integrated under dividers */}
        <div className="border-t border-zinc-800/60 pt-2 flex justify-center w-full">
          <nav className="w-full flex flex-wrap items-center justify-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/60">
            {navItems.map((item) => {
              const isSpecial = item.id === 'edgebro' || item.id === 'vsm2flasher';
              let btnClass = '';
              let iconClass = '';
              
              if (isSpecial) {
                btnClass = activeTab === item.id
                  ? 'bg-indigo-600 text-white shadow-sm border border-indigo-500 hover:bg-indigo-500 ml-1'
                  : 'bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 dark:text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/50 ml-1';
                iconClass = activeTab === item.id ? 'text-white' : 'text-indigo-400 dark:text-indigo-300';
              } else {
                btnClass = activeTab === item.id
                  ? 'bg-zinc-900 text-zinc-100 shadow-sm border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-100';
                iconClass = 'text-indigo-400';
              }

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${btnClass}`}
                >
                  <span className={iconClass}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

      </div>
    </header>
  );
}
