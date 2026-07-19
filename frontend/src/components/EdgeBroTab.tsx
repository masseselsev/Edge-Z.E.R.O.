import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { ShieldAlert, RefreshCw, CloudUpload, CheckCircle, Database } from 'lucide-react';

interface BroNode {
  id: string;
  internal_sn: string;
  mac_address: string;
  ip_address: string;
  overwatch_status: string;
  edge_bro_status: string;
  last_backup: string | null;
}

export default function EdgeBroTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [nodes, setNodes] = useState<BroNode[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const [edgeBroUrl, setEdgeBroUrl] = useState('');

  const fetchStatus = async () => {
    setStatus('loading');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/system/edge-bro/status', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setEdgeBroUrl(data.url || '');
        if (data.status === 'connected') {
          setStatus('connected');
          setNodes(data.nodes);
        } else {
          setStatus('error');
          setErrorMsg(data.message || 'Unknown error');
        }
      } else {
        setStatus('error');
        setErrorMsg('Failed to fetch status from Overwatch server');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Connection failed');
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSync = async (ids: string[]) => {
    setSyncingIds(prev => [...prev, ...ids]);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/system/edge-bro/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ box_ids: ids })
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncingIds(prev => prev.filter(x => !ids.includes(x)));
    }
  };

  const getStatusPill = (status: string) => {
    switch (status) {
      case 'READY':
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Ready</span>;
      case 'NEEDS_BOOTSTRAP':
        return <span className="bg-blue-500/10 text-blue-400 border border-blue-500/25 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Needs Bootstrap</span>;
      case 'OFFLINE':
        return <span className="bg-zinc-800 text-zinc-400 border border-zinc-700/50 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Offline</span>;
      case 'NOT_REGISTERED':
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Not Registered</span>;
      default:
        return <span className="bg-rose-500/10 text-rose-400 border border-rose-500/25 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{status}</span>;
    }
  };

  const unregistered = nodes.filter(n => n.edge_bro_status === 'NOT_REGISTERED');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-50 leading-none flex items-center gap-2">
            <svg className="w-[18px] h-[18px] text-indigo-400 filter drop-shadow-[0_0_4px_rgba(99,102,241,0.6)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Edge B.R.O. Backup Integration</span>
          </h2>
          <p className="text-xs text-zinc-450 mt-2">Manage backup replication and node enrollment in Edge B.R.O. backup cluster.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatus}
            className="p-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer outline-none transition-all"
          >
            <RefreshCw size={14} className={status === 'loading' ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          {unregistered.length > 0 && (
            <button
              onClick={() => handleSync(unregistered.map(n => n.id))}
              disabled={syncingIds.length > 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
            >
              <CloudUpload size={14} />
              <span>Sync All Unregistered ({unregistered.length})</span>
            </button>
          )}
        </div>
      </div>

      {status === 'error' && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
          <ShieldAlert size={20} className="text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-rose-300 block">Connection to Edge B.R.O. Failed</span>
            <p className="text-[11px] text-rose-400/80 leading-relaxed mt-1">
              Could not connect to Edge B.R.O. API at <code className="bg-rose-950/40 px-1 py-0.5 rounded font-mono">{edgeBroUrl}</code>. Check your Settings in System Preferences.
            </p>
            <p className="text-[10px] text-rose-500 font-mono mt-1.5">{errorMsg}</p>
          </div>
        </div>
      )}

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shadow-inner">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800/80 bg-zinc-950/20 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
              <th className="px-6 py-3.5">Device SN (Hostname)</th>
              <th className="px-6 py-3.5">MAC Address</th>
              <th className="px-6 py-3.5">IP Address</th>
              <th className="px-6 py-3.5">Overwatch Status</th>
              <th className="px-6 py-3.5">B.R.O. Backup Status</th>
              <th className="px-6 py-3.5">Last Backup</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {nodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 italic text-xs">
                  {status === 'loading' ? 'Checking backup node status...' : 'No active boxes available for backup integration.'}
                </td>
              </tr>
            ) : (
              nodes.map((node) => (
                <tr key={node.id} className="hover:bg-zinc-800/20 text-zinc-300 text-xs transition-colors">
                  <td className="px-6 py-4 font-bold text-zinc-200">{node.internal_sn}</td>
                  <td className="px-6 py-4 font-mono">{node.mac_address}</td>
                  <td className="px-6 py-4 font-mono text-zinc-400">{node.ip_address || '—'}</td>
                  <td className="px-6 py-4">
                    <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase">{node.overwatch_status}</span>
                  </td>
                  <td className="px-6 py-4">{getStatusPill(node.edge_bro_status)}</td>
                  <td className="px-6 py-4 text-zinc-450">{node.last_backup ? new Date(node.last_backup).toLocaleString() : 'Never'}</td>
                  <td className="px-6 py-4 text-right">
                    {node.edge_bro_status === 'NOT_REGISTERED' ? (
                      <button
                        onClick={() => handleSync([node.id])}
                        disabled={syncingIds.includes(node.id)}
                        className="px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 hover:border-indigo-500/40 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all cursor-pointer inline-flex items-center gap-1"
                      >
                        <CloudUpload size={12} className={syncingIds.includes(node.id) ? 'animate-bounce' : ''} />
                        <span>{syncingIds.includes(node.id) ? 'Syncing...' : 'Register'}</span>
                      </button>
                    ) : (
                      <span className="text-zinc-500 inline-flex items-center gap-1 select-none text-[10px] uppercase font-bold pr-2">
                        <CheckCircle size={12} className="text-emerald-500" />
                        <span>Enrolled</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
