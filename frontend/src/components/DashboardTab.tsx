import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Server, AlertTriangle, PlayCircle } from 'lucide-react';

interface Stats {
  total_boxes: number;
  pending_provision: number;
  active_alerts: number;
}

export default function DashboardTab() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats>({
    total_boxes: 0,
    pending_provision: 0,
    active_alerts: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/boxes/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return <div className="text-zinc-500 text-sm animate-pulse">{t('loading')}</div>;
  }

  const statItems = [
    {
      label: t('totalDevices'),
      value: stats.total_boxes,
      icon: <Server className="text-indigo-400" size={24} />,
      bg: 'bg-zinc-900 border-zinc-800'
    },
    {
      label: t('pendingProvision'),
      value: stats.pending_provision,
      icon: <PlayCircle className="text-amber-400" size={24} />,
      bg: 'bg-zinc-900 border-zinc-800'
    },
    {
      label: t('activeAlerts'),
      value: stats.active_alerts,
      icon: <AlertTriangle className="text-rose-400" size={24} />,
      bg: stats.active_alerts > 0 ? 'bg-rose-950/10 border-rose-900/30' : 'bg-zinc-900 border-zinc-800'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('dashboardTitle')}</h1>
        <p className="text-zinc-400 text-xs mt-1">{t('dashboardSub')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statItems.map((item, idx) => (
          <div key={idx} className={`p-6 rounded-xl border flex items-center justify-between shadow-sm transition-all hover:scale-[1.01] ${item.bg}`}>
            <div>
              <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider">{item.label}</p>
              <p className="text-3xl font-black mt-2 text-zinc-100">{item.value}</p>
            </div>
            <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/40">
              {item.icon}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
