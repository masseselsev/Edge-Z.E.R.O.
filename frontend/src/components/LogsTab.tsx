import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Terminal, Shield, RefreshCw } from 'lucide-react';

interface SystemLog {
  id: number;
  level: string;
  message: string;
  created_at: string;
}

interface AuditLog {
  id: number;
  username: string;
  action: string;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export default function LogsTab() {
  const { t } = useTranslation();
  const [logType, setLogType] = useState<'debug' | 'audit'>('debug');
  
  // Data State
  const [debugLogs, setDebugLogs] = useState<SystemLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      if (logType === 'debug') {
        const res = await fetch('/api/system/debug-logs');
        if (res.ok) {
          const data = await res.json();
          // Reverse to show chronological order inside terminal
          setDebugLogs([...data].reverse());
        }
      } else {
        const res = await fetch('/api/system/audit-logs');
        if (res.ok) {
          setAuditLogs(await res.json());
        }
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    
    // Auto refresh logs
    const interval = setInterval(fetchLogs, logType === 'debug' ? 3000 : 8000);
    return () => clearInterval(interval);
  }, [logType]);

  // Auto-scroll to bottom of terminal (only if already at the bottom)
  useEffect(() => {
    const container = containerRef.current;
    if (logType === 'debug' && container && terminalEndRef.current) {
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      if (isAtBottom) {
        terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [debugLogs, logType]);

  const getLogLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return 'text-rose-450 font-bold';
      case 'WARNING':
        return 'text-amber-400 font-bold';
      case 'DEBUG':
        return 'text-zinc-500';
      default:
        return 'text-emerald-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Toggle Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">{t('tabLogs')}</h2>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800/80 shadow-inner">
          <button
            onClick={() => setLogType('debug')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              logType === 'debug' ? 'bg-zinc-900 border border-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-400'
            }`}
          >
            <Terminal size={13} />
            <span>{t('debugLogs')}</span>
          </button>
          <button
            onClick={() => setLogType('audit')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              logType === 'audit' ? 'bg-zinc-900 border border-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-400'
            }`}
          >
            <Shield size={13} />
            <span>{t('auditLogs')}</span>
          </button>
        </div>
      </div>

      {/* Debug Logs (Terminal View) */}
      {logType === 'debug' && (
        <div className="relative border border-zinc-800 rounded-xl overflow-hidden shadow-inner flex flex-col bg-zinc-950 h-[480px]">
          <div className="bg-zinc-900/60 px-4 py-2 border-b border-zinc-800 flex items-center justify-between text-zinc-500 text-[10px] uppercase font-bold">
            <span>Terminal console</span>
            <button onClick={fetchLogs} className="hover:text-zinc-350 transition-colors">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div ref={containerRef} className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed space-y-1 select-text">
            {debugLogs.length === 0 ? (
              <div className="text-zinc-650 italic text-center py-12">No system logs logged yet.</div>
            ) : (
              debugLogs.map((log) => (
                <div key={log.id} className="flex gap-2">
                  <span className="text-zinc-600">[{new Date(log.created_at).toLocaleString()}]</span>
                  <span className={`font-bold ${getLogLevelColor(log.level)}`}>[{log.level}]</span>
                  <span className="text-zinc-300">{log.message}</span>
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      )}

      {/* Audit Logs (Table View) */}
      {logType === 'audit' && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm">
          <table className="min-w-full divide-y divide-zinc-800 text-left text-sm text-zinc-300">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
              <tr className="border-b border-zinc-800 text-zinc-400 font-bold">
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">Details</th>
                <th className="px-6 py-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500 italic">No audit trail records found.</td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                   <tr key={log.id} className="hover:bg-row-hover text-zinc-300 transition-colors">
                    <td className="px-6 py-4 font-mono text-zinc-500">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 font-bold text-zinc-200">{log.username}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-zinc-800 text-zinc-300 whitespace-nowrap">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-450">{log.details || '—'}</td>
                    <td className="px-6 py-4 font-mono text-zinc-500">{log.ip_address || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
