import React from 'react';
import Header from './Header';
import { useTranslation } from '../context/TranslationContext';
import { LayoutDashboard, Server, Library, ScrollText, Terminal, Settings } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const { t } = useTranslation();

  const navItems = [
    { id: 'dashboard', label: t('tabDashboard'), icon: <LayoutDashboard size={14} /> },
    { id: 'inventory', label: t('tabInventory'), icon: <Server size={14} /> },
    { id: 'library', label: t('tabLibrary'), icon: <Library size={14} /> },
    { id: 'scripts', label: t('tabInitScripts'), icon: <ScrollText size={14} /> },
    { id: 'logs', label: t('tabLogs'), icon: <Terminal size={14} /> },
    { id: 'settings', label: t('tabSettings'), icon: <Settings size={14} /> }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col transition-colors duration-200">
      <Header />
      
      {/* Tab Navigation Row */}
      <div className="max-w-7xl w-full mx-auto px-6 pt-6">
        <nav className="flex flex-wrap items-center justify-center gap-1 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800/80 shadow-md">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === item.id
                  ? 'bg-zinc-900 text-zinc-100 shadow-sm border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <span className="text-indigo-400">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <div key={activeTab} className="animate-tab-in">
          {children}
        </div>
      </main>
    </div>
  );
}
