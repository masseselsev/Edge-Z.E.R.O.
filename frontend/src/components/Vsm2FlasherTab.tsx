import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Play, Terminal, Database, Sliders, RefreshCw, Trash2, Clipboard, Download, Check, HelpCircle, HardDrive } from 'lucide-react';

interface RepoInfo {
  exists: boolean;
  commit?: string;
  author?: string;
  date?: string;
  message?: string;
  branch?: string;
  last_synced?: string;
}

interface CommandItem {
  value: string;
  label: string;
  desc: string;
}

export default function Vsm2FlasherTab() {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<'console' | 'logs'>('console');
  const [ips, setIps] = useState('');
  const [sshUser, setSshUser] = useState('user');
  const [sshPass, setSshPass] = useState('admin');
  const [sshPort, setSshPort] = useState(2222);
  const [advertisedIp, setAdvertisedIp] = useState('');
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [syncingRepo, setSyncingRepo] = useState(false);
  
  // Console state
  const [targetConsoleIp, setTargetConsoleIp] = useState('');
  const [consoleCommands, setConsoleCommands] = useState<CommandItem[]>([]);
  const [consoleConnected, setConsoleConnected] = useState(false);
  const [consoleBanner, setConsoleBanner] = useState('');
  const [consoleInput, setConsoleInput] = useState('');
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [sendingCmd, setSendingCmd] = useState(false);

  // Quick actions
  const [quickActions, setQuickActions] = useState<string[]>([]);
  const [newShortcut, setNewShortcut] = useState('');
  
  // Batch Parameters Modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [dumpResults, setDumpResults] = useState<Record<string, string> | null>(null);
  const [dumping, setDumping] = useState(false);
  const [copied, setCopied] = useState(false);

  // Logs state
  const [liveLogs, setLiveLogs] = useState<string[]>([]);

  useEffect(() => {
    fetchRepoStatus();
    fetchConsoleCommands();
    detectHostIps();
    fetchShortcuts();
    
    const sse = new EventSource('/api/vsm2-flasher/stream');
    sse.onmessage = (e) => {
      setLiveLogs(prev => [...prev, e.data].slice(-500));
    };
    return () => sse.close();
  }, []);

  const detectHostIps = async () => {
    // Setup Host auto detect logic
    try {
      const res = await fetch('/api/system/settings');
      if (res.ok) {
        const settings = await res.json();
        const apiHost = settings.find((s: any) => s.key === 'API_HOST')?.value;
        if (apiHost) setAdvertisedIp(apiHost);
      }
    } catch (e) {
      setAdvertisedIp('192.168.222.2');
    }
  };

  const fetchRepoStatus = async () => {
    try {
      const res = await fetch('/api/vsm2-flasher/repo-status');
      if (res.ok) setRepoInfo(await res.json());
    } catch (err) { console.error(err); }
  };


  const fetchConsoleCommands = async () => {
    try {
      const res = await fetch('/api/vsm2-flasher/console/commands');
      if (res.ok) setConsoleCommands(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchShortcuts = async () => {
    try {
      const res = await fetch('/api/vsm2-flasher/console/shortcuts');
      if (res.ok) setQuickActions(await res.json());
    } catch (err) { console.error(err); }
  };

  const saveShortcuts = async (updated: string[]) => {
    setQuickActions(updated);
    try {
      await fetch('/api/vsm2-flasher/console/shortcuts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcuts: updated })
      });
    } catch (err) { console.error(err); }
  };

  const handleAddShortcut = () => {
    const val = newShortcut.trim();
    if (val && !quickActions.includes(val)) {
      const updated = [...quickActions, val];
      saveShortcuts(updated);
    }
    setNewShortcut('');
  };

  const handleSyncRepo = async () => {
    setSyncingRepo(true);
    try {
      const res = await fetch('/api/vsm2-flasher/repo-sync', { method: 'POST' });
      if (res.ok) fetchRepoStatus();
    } catch (err) { console.error(err); }
    setSyncingRepo(false);
  };

  const handleStartFlash = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/vsm2-flasher/flash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips, username: sshUser, password: sshPass, port: sshPort, advertised_ip: advertisedIp })
      });
      if (res.ok) {
        alert('Flasher threads spawned! View progress in Live Logs tab.');
        setSubTab('logs');
      } else {
        const err = await res.json();
        alert(`Flasher failed: ${err.detail}`);
      }
    } catch (err) { console.error(err); }
  };

  const handleConsoleConnect = async () => {
    setConnecting(true);
    setConsoleOutput([]);
    try {
      const res = await fetch('/api/vsm2-flasher/console/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: targetConsoleIp, ssh_port: sshPort, username: sshUser, password: sshPass })
      });
      if (res.ok) {
        const data = await res.json();
        setConsoleBanner(data.banner);
        const initialOutput = [];
        if (data.scan_logs) {
          initialOutput.push(...data.scan_logs);
          initialOutput.push("");
        }
        initialOutput.push(data.banner);
        setConsoleOutput(initialOutput);
        setConsoleConnected(true);
      } else {
        const err = await res.json();
        alert(`Console connection failed: ${err.detail}`);
      }
    } catch (err) { console.error(err); }
    setConnecting(false);
  };

  const handleConsoleSend = async (cmdToSend?: string) => {
    const cmd = cmdToSend || consoleInput;
    if (!cmd.trim()) return;
    setSendingCmd(true);
    try {
      const res = await fetch('/api/vsm2-flasher/console/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      if (res.ok) {
        const data = await res.json();
        setConsoleOutput(prev => [...prev, `> ${cmd}`, data.output]);
        if (!cmdToSend) setConsoleInput('');
      }
    } catch (err) { console.error(err); }
    setSendingCmd(false);
  };

  const handleConsoleDisconnect = async () => {
    try {
      await fetch('/api/vsm2-flasher/console/disconnect', { method: 'POST' });
      setConsoleConnected(false);
      setConsoleOutput([]);
    } catch (err) { console.error(err); }
  };

  const runBatchDump = async () => {
    if (selectedParams.length === 0) {
      alert('Please select at least one parameter to dump.');
      return;
    }
    setDumping(true);
    setDumpResults(null);
    try {
      const res = await fetch('/api/vsm2-flasher/console/batch_read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: targetConsoleIp, ssh_port: sshPort, username: sshUser, password: sshPass,
          params: selectedParams
        })
      });
      if (res.ok) {
        const data = await res.json();
        setDumpResults(data.results);
      } else {
        const err = await res.json();
        alert(`Batch read failed: ${err.detail}`);
      }
    } catch (e) { console.error(e); }
    setDumping(false);
  };

  const copyDumpToClipboard = () => {
    if (!dumpResults) return;
    const text = Object.entries(dumpResults).map(([k, v]) => `${k}: ${v}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadDumpTxt = () => {
    if (!dumpResults) return;
    const text = Object.entries(dumpResults).map(([k, v]) => `${k}: ${v}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vsm2_dump_${targetConsoleIp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <HardDrive className="text-indigo-400" size={24} />
            <span>VSM2 Flasher</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-1">Deploy, flash, and troubleshoot VSM2 controller firmware over SSH.</p>
        </div>
        <div className="flex gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/60 w-full md:w-auto">
          <button onClick={() => setSubTab('console')} className={`flex-1 md:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${subTab === 'console' ? 'bg-zinc-900 text-zinc-100 border border-zinc-800' : 'text-zinc-400 hover:text-zinc-100'}`}>Console Control</button>
          <button onClick={() => setSubTab('logs')} className={`flex-1 md:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${subTab === 'logs' ? 'bg-zinc-900 text-zinc-100 border border-zinc-800' : 'text-zinc-400 hover:text-zinc-100'}`}>Live Logs</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left config column */}
        <div className="lg:col-span-4 space-y-6">
          <form onSubmit={handleStartFlash} className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Flasher Target Configuration</h3>
            
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Target Device IPs / Ranges</label>
              <textarea value={ips} onChange={(e) => setIps(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg font-mono min-h-[90px] outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. 192.168.1.10, 192.168.1.20-30" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">SSH Username</label>
                <input type="text" value={sshUser} onChange={(e) => setSshUser(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none focus:border-indigo-500 transition-colors font-semibold" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">SSH Password</label>
                <input type="password" value={sshPass} onChange={(e) => setSshPass(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none focus:border-indigo-500 transition-colors" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">SSH Port</label>
                <input type="number" value={sshPort} onChange={(e) => setSshPort(parseInt(e.target.value) || 22)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none focus:border-indigo-500 transition-colors font-mono" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Flasher Server IP</label>
                <input type="text" value={advertisedIp} onChange={(e) => setAdvertisedIp(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none focus:border-indigo-500 transition-colors font-mono" />
              </div>
            </div>

            <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md">
              <Play size={14} /> Start Mass Flash & Reboot
            </button>
          </form>

          {/* Repo status card */}
          <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl space-y-4 shadow-sm">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-850">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Flasher Code Repository</h3>
              <button onClick={handleSyncRepo} disabled={syncingRepo} className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-50">
                <RefreshCw size={14} className={syncingRepo ? 'animate-spin' : ''} />
              </button>
            </div>
            {repoInfo?.exists ? (
              <div className="space-y-2 text-[11px] font-mono text-zinc-350">
                <div className="flex justify-between"><span className="text-zinc-500">Branch:</span> <span className="font-bold text-indigo-400">{repoInfo.branch}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Commit:</span> <span className="font-bold text-zinc-200">{repoInfo.commit}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Last Synced:</span> <span>{repoInfo.last_synced?.split('T')[0] || 'Never'}</span></div>
              </div>
            ) : (
              <p className="text-zinc-500 italic text-xs">Fetching repository metadata...</p>
            )}
          </div>
        </div>

        {/* Right Tab panels */}
        <div className="lg:col-span-8">
          {subTab === 'console' && (
            <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl space-y-4 min-h-[500px] flex flex-col shadow-sm">
              <div className="flex flex-wrap items-center gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-850">
                <input type="text" value={targetConsoleIp} onChange={(e) => setTargetConsoleIp(e.target.value)} className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none max-w-[150px] font-semibold" placeholder="Target Box IP" />
                
                
                {!consoleConnected ? (
                  <button onClick={handleConsoleConnect} disabled={connecting || !targetConsoleIp} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-all cursor-pointer">
                    {connecting ? 'Connecting...' : 'Connect Console'}
                  </button>
                ) : (
                  <>
                    <button onClick={handleConsoleDisconnect} className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-all">Disconnect</button>
                    <button onClick={() => setShowBatchModal(true)} className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                      <Database size={13} /> Batch Read
                    </button>
                  </>
                )}
              </div>

              {connecting ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border border-zinc-800 rounded-xl mt-2 bg-black/40">
                  <RefreshCw className="animate-spin text-indigo-500 mb-3" size={32} />
                  <h4 className="text-zinc-200 font-bold text-sm">Establishing Connection</h4>
                  <p className="text-zinc-500 text-xs mt-1 max-w-sm">
                    Connecting to the box, verifying Python environment, and scanning serial ports for active controllers...
                  </p>
                </div>
              ) : consoleConnected ? (
                <div className="flex-1 flex flex-col mt-2 space-y-3">
                  <div className="flex-1 p-4 border border-zinc-800 rounded-xl bg-black font-mono text-xs overflow-y-auto max-h-[300px] min-h-[250px] space-y-1.5 scrollbar-thin select-text">
                    {consoleOutput.map((l, i) => (
                      <div key={i} className={l.startsWith('>') ? 'text-indigo-300 font-bold mt-2' : 'text-zinc-300 whitespace-pre-wrap font-mono'}>
                        {l}
                      </div>
                    ))}
                  </div>

                  <form onSubmit={(e) => { e.preventDefault(); handleConsoleSend(); }} className="flex border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
                    <input type="text" list="console-commands" value={consoleInput} onChange={(e) => setConsoleInput(e.target.value)} disabled={sendingCmd} className="flex-1 bg-transparent text-xs text-zinc-200 p-3 outline-none focus:bg-zinc-900 transition-colors" placeholder="Type a command (e.g., read temp) and press Enter..." />
                    <datalist id="console-commands">
                      {consoleCommands.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </datalist>
                    <button type="submit" disabled={sendingCmd || !consoleInput} className="px-6 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer disabled:opacity-40 transition-colors">Send</button>
                  </form>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-zinc-800 rounded-xl mt-2 text-zinc-500">
                  <Terminal size={32} className="mb-2 text-zinc-650" />
                  <p className="text-xs">Select a Target Box IP, specify the serial interface, and click Connect to start debugging.</p>
                </div>
              )}

              {consoleConnected && (
                <div className="pt-2 space-y-2">
                  <h4 className="text-[10px] uppercase font-bold text-zinc-500">Quick Command Shortcuts</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {quickActions.map(action => (
                      <button
                        key={action}
                        onClick={() => handleConsoleSend(action)}
                        disabled={sendingCmd}
                        className="group flex items-center px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[11px] font-mono text-zinc-300 rounded hover:text-indigo-400 transition-all cursor-pointer"
                      >
                        <span>{action}</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            const updated = quickActions.filter(a => a !== action);
                            saveShortcuts(updated);
                          }}
                          className="ml-2 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete shortcut"
                        >
                          ✕
                        </span>
                      </button>
                    ))}
                    
                    <input
                      type="text"
                      value={newShortcut}
                      onChange={(e) => setNewShortcut(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddShortcut();
                      }}
                      onBlur={handleAddShortcut}
                      placeholder="+ Add Command"
                      className="px-3 py-1 bg-zinc-950 border border-dashed border-zinc-800 text-[11px] font-mono text-zinc-400 rounded outline-none focus:border-indigo-500 focus:border-solid transition-colors max-w-[130px]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {subTab === 'logs' && (
            <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl space-y-4 min-h-[500px] flex flex-col shadow-sm">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Live Flasher Operations Logs</h3>
                <button onClick={async () => { await fetch('/api/vsm2-flasher/logs/clear', { method: 'POST' }); setLiveLogs([]); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-850 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm">
                  <Trash2 size={13} /> Clear Logs
                </button>
              </div>
              <div className="flex-1 bg-black border border-zinc-850 p-4 rounded-xl font-mono text-xs overflow-y-auto max-h-[380px] min-h-[300px] whitespace-pre-wrap text-zinc-300 select-text scrollbar-thin">
                {liveLogs.length === 0 ? (
                  <p className="text-zinc-650 italic text-center py-12 font-sans">No live flashing operations logs received. Spawning a flasher thread will display output here.</p>
                ) : (
                  liveLogs.map((log, i) => <div key={i} className="py-0.5 border-b border-zinc-950 last:border-none font-mono">{log}</div>)
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Batch Parameter read Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-200">VSM2 Parameters Batch Readout</h3>
              <button onClick={() => { setShowBatchModal(false); setDumpResults(null); }} className="text-zinc-500 hover:text-zinc-350 font-bold cursor-pointer">✕</button>
            </div>
            
            <div className="p-5 space-y-4 max-h-[400px] overflow-y-auto scrollbar-thin select-text">
              {!dumpResults ? (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">Select registers to dump in sequence from the connected controller:</p>
                  <div className="grid grid-cols-2 gap-2 p-2 bg-zinc-900/50 rounded-lg border border-zinc-850">
                    {['temp', 'version', 'tech_data', 'voltage', 'current', 'humidity'].map(param => (
                      <label key={param} className="flex items-center gap-2 text-xs font-mono text-zinc-300 p-1 cursor-pointer">
                        <input type="checkbox" checked={selectedParams.includes(param)} onChange={(e) => {
                          if (e.target.checked) setSelectedParams(prev => [...prev, param]);
                          else setSelectedParams(prev => prev.filter(x => x !== param));
                        }} className="rounded bg-zinc-950 border-zinc-800 text-indigo-600 focus:ring-0 cursor-pointer" />
                        <span>{param}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedParams(['temp', 'version', 'tech_data', 'voltage', 'current', 'humidity'])} className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[10px] font-bold text-zinc-300 rounded cursor-pointer">Select All</button>
                    <button onClick={() => setSelectedParams([])} className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[10px] font-bold text-zinc-300 rounded cursor-pointer">Deselect All</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-indigo-400">Readout Completed successfully!</span>
                    <div className="flex gap-2">
                      <button onClick={copyDumpToClipboard} className="p-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer" title="Copy to clipboard">
                        {copied ? <Check size={12} className="text-emerald-400" /> : <Clipboard size={12} />}
                      </button>
                      <button onClick={downloadDumpTxt} className="p-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer" title="Download text report">
                        <Download size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="border border-zinc-800 rounded-lg overflow-hidden bg-black p-3 font-mono text-[11px] space-y-2">
                    {Object.entries(dumpResults).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-1 border-b border-zinc-900/60 last:border-none">
                        <span className="text-zinc-500 font-mono">{k}:</span>
                        <span className="text-zinc-300 font-bold font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-900 bg-zinc-900/30 flex justify-end gap-3">
              <button onClick={() => { setShowBatchModal(false); setDumpResults(null); }} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-200 cursor-pointer">Close</button>
              {!dumpResults && (
                <button onClick={runBatchDump} disabled={dumping || selectedParams.length === 0} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-40">
                  {dumping ? 'Dumping...' : 'Execute Dump'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
