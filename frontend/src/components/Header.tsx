import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import LanguageSelector from './LanguageSelector';
import { Cpu, HardDrive, Sun, Moon } from 'lucide-react';

interface BandwidthInfo {
  cpu_utilization: number;
  ram_utilization: number;
  rx_speed: number;
  tx_speed: number;
  rx_percent: number;
  tx_percent: number;
}

export default function Header() {
  const { t } = useTranslation();
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

  // Poll system diagnostics
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/system/bandwidth');
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

  return (
    <header className="sticky top-0 bg-zinc-950/80 backdrop-blur border-b border-zinc-800/80 z-30 px-6 py-3 transition-colors duration-200">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Left: Brand logo */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-black tracking-widest text-indigo-400">edge.OVERWATCH</span>
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="System Connected"></span>
        </div>

        {/* Center: System Performance Metrics */}
        <div className="flex items-center gap-6 text-zinc-400 text-xs">
          {/* CPU Metric */}
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-zinc-500" />
            <span>CPU:</span>
            <span className={`font-mono font-bold ${metrics.cpu_utilization > 80 ? 'text-rose-450' : 'text-zinc-300'}`}>
              {metrics.cpu_utilization.toFixed(1)}%
            </span>
          </div>

          {/* RAM Metric */}
          <div className="flex items-center gap-2">
            <HardDrive size={14} className="text-zinc-500" />
            <span>RAM:</span>
            <span className={`font-mono font-bold ${metrics.ram_utilization > 85 ? 'text-rose-450' : 'text-zinc-300'}`}>
              {metrics.ram_utilization.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Right: Controllers */}
        <div className="flex items-center gap-3">
          <LanguageSelector />
          <button
            onClick={toggleTheme}
            className="p-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer flex items-center justify-center"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>
    </header>
  );
}
