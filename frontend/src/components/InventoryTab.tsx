import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../context/TranslationContext';
import { Search, Plus, Trash2, Server, PlayCircle, AlertTriangle, Terminal } from 'lucide-react';
import ConsoleDrawer from './ConsoleDrawer';
import BoxDetailsModal from './BoxDetailsModal';

interface Location {
  id: string;
  name: string;
}

interface Box {
  id: string;
  internal_sn: string;
  mac_address: string;
  ip_address: string | null;
  status: 'NEW' | 'STAGING' | 'INSTALLING' | 'ACTIVE' | 'MAINTENANCE';
  location: Location | null;
  installation_progress: number;
  hardware_inventory: any;
  hardware_baseline: any;
  last_seen: string | null;
  components: any[];
}

interface UnregisteredDevice {
  mac: string;
  ip: string;
}

export default function InventoryTab() {
  const { t } = useTranslation();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({
    total_boxes: 0,
    pending_provision: 0,
    active_alerts: 0
  });
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [consoleBox, setConsoleBox] = useState<{ id: string; sn: string; status: string; progress: number } | null>(null);
  const [newBox, setNewBox] = useState({
    internal_sn: '',
    mac_address: '',
    ip_address: '',
    location_id: ''
  });

  const [unregisteredDevices, setUnregisteredDevices] = useState<UnregisteredDevice[]>([]);
  const [isMacLocked, setIsMacLocked] = useState(false);

  const fetchUnregistered = async () => {
    try {
      const res = await fetch('/api/boxes/unregistered');
      if (res.ok) {
        const data = await res.json();
        const parsed = data.map((item: any) => typeof item === 'string' ? { mac: item, ip: '' } : item);
        setUnregisteredDevices(parsed);
      }
    } catch (err) {
      console.error('Failed to fetch unregistered devices:', err);
    }
  };

  useEffect(() => {
    fetchUnregistered();
    const interval = setInterval(fetchUnregistered, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRegisterUnregistered = (dev: UnregisteredDevice) => {
    setNewBox({
      internal_sn: '',
      mac_address: dev.mac,
      ip_address: dev.ip || '',
      location_id: ''
    });
    setIsMacLocked(true);
    setShowAddModal(true);
  };

  const fetchData = async () => {
    try {
      const [boxRes, locRes, statsRes] = await Promise.all([
        fetch('/api/boxes/'),
        fetch('/api/locations/'),
        fetch('/api/boxes/stats')
      ]);
      if (boxRes.ok) setBoxes(await boxRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll every 5 s while any box is in INSTALLING status
    const interval = setInterval(() => {
      if (boxes.some(b => b.status === 'INSTALLING')) fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [boxes]);

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setIsMacLocked(false);
    setNewBox({
      internal_sn: '',
      mac_address: '',
      ip_address: '',
      location_id: ''
    });
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const handleAddBox = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/boxes/', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newBox)
      });
      if (res.ok) {
        handleCloseAddModal();
        fetchData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to add box: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to add box:', err);
    }
  };

  const handleStartProvisioning = async (id: string) => {
    try {
      const res = await fetch('/api/boxes/batch/provision', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify([id])
      });
      if (res.ok) {
        fetchData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to start provisioning: ${errorData.detail || res.statusText}`);
      }
    } catch (err) {
      console.error('Failed to start provisioning:', err);
    }
  };

  const handleDeleteBox = async (id: string) => {
    if (!confirm('Are you sure you want to delete this box?')) return;
    try {
      const res = await fetch(`/api/boxes/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        fetchData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to delete box: ${errorData.detail || res.statusText}`);
      }
    } catch (err) {
      console.error('Failed to delete box:', err);
    }
  };

  const getStatusBadge = (box: Box) => {
    if (box.status === 'INSTALLING') {
      return (
        <button
          onClick={() => setConsoleBox({ id: box.id, sn: box.internal_sn, status: box.status, progress: box.installation_progress })}
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer"
          title="Click to open installation console"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
          {box.installation_progress > 0 ? `Installing (${box.installation_progress}%)` : 'Installing…'}
        </button>
      );
    }
    const badges: Record<string, string> = {
      NEW: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      STAGING: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      MAINTENANCE: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    };
    if (box.status === 'ACTIVE' || box.status === 'MAINTENANCE') {
      return (
        <button
          onClick={() => setConsoleBox({ id: box.id, sn: box.internal_sn, status: box.status, progress: box.installation_progress })}
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border hover:brightness-125 transition-all cursor-pointer ${badges[box.status]}`}
          title="Click to open SSH terminal"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
          {box.status}
        </button>
      );
    }
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badges[box.status] || badges.NEW}`}>
        {box.status}
      </span>
    );
  };

  const filteredBoxes = boxes.filter(box => 
    box.internal_sn.toLowerCase().includes(search.toLowerCase()) ||
    box.mac_address.toLowerCase().includes(search.toLowerCase()) ||
    (box.ip_address && box.ip_address.includes(search))
  );

  return (
    <div className="space-y-6">
      {/* Title & Actions Row with integrated Stats Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Title */}
        <div className="flex-shrink-0">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">{t('inventoryTitle')}</h2>
        </div>

        {/* Overview Stats Header in the middle */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3 lg:mx-8 max-w-xl w-full">
          {[
            {
              label: t('totalDevices'),
              value: stats.total_boxes,
              icon: <Server className="text-indigo-400" size={14} />,
              bg: 'bg-zinc-900 border-zinc-800'
            },
            {
              label: t('pendingProvision'),
              value: stats.pending_provision,
              icon: <PlayCircle className="text-amber-400" size={14} />,
              bg: 'bg-zinc-900 border-zinc-800'
            },
            {
              label: t('activeAlerts'),
              value: stats.active_alerts,
              icon: <AlertTriangle className="text-rose-400" size={14} />,
              bg: stats.active_alerts > 0 ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-zinc-900 border-zinc-800'
            }
          ].map((item, idx) => (
            <div key={idx} className={`p-2.5 rounded-xl border flex items-center justify-between shadow-sm transition-all hover:scale-[1.01] ${item.bg}`}>
              <div>
                <p className="text-zinc-400 text-[8px] font-bold uppercase tracking-wider">{item.label}</p>
                <p className="text-base font-black mt-0.5 text-zinc-100">{item.value}</p>
              </div>
              <div className="p-1.5 bg-zinc-950/60 rounded-lg border border-zinc-800/40">
                {item.icon}
              </div>
            </div>
          ))}
        </div>

        {/* Actions Button */}
        <div className="flex-shrink-0 flex items-center gap-2 self-stretch lg:self-auto justify-end">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs transition-colors self-stretch lg:self-auto justify-center cursor-pointer shadow-md"
          >
            <Plus size={16} />
            <span>{t('addBox')}</span>
          </button>
        </div>
      </div>

      {/* Unregistered Devices Banner */}
      {unregisteredDevices.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col gap-3 animate-fade-in mb-4">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
            <AlertTriangle size={14} className="animate-pulse" />
            <span>Unregistered Devices Detected</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unregisteredDevices.map(dev => (
              <div key={dev.mac} className="flex justify-between items-center p-2.5 bg-zinc-950/40 border border-zinc-900 rounded-lg gap-3">
                <div className="flex items-center gap-2 font-mono text-xs text-zinc-300">
                  <span>{dev.mac}</span>
                  {dev.ip && <span className="text-zinc-500 font-normal">({dev.ip})</span>}
                </div>
                <button
                  onClick={() => handleRegisterUnregistered(dev)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-md"
                >
                  [+] Register Box
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm text-zinc-300">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-6 py-3 font-semibold">Internal SN</th>
              <th className="px-6 py-3 font-semibold">{t('macAddress')}</th>
              <th className="px-6 py-3 font-semibold">{t('ipAddress')}</th>
              <th className="px-6 py-3 font-semibold">{t('location')}</th>
              <th className="px-6 py-3 font-semibold">{t('status')}</th>
              <th className="px-6 py-3 text-right font-semibold">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-zinc-500 italic animate-pulse">{t('loading')}</td>
              </tr>
            ) : filteredBoxes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-zinc-500 italic">No devices found.</td>
              </tr>
            ) : (
              filteredBoxes.map((box) => (
                <tr key={box.id} className="hover:bg-zinc-800/30 text-zinc-300 transition-colors">
                  <td 
                    className="px-6 py-4 font-bold text-zinc-200 cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() => setSelectedBoxId(box.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span 
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          box.last_seen && (new Date().getTime() - new Date(box.last_seen).getTime()) / 1000 < 300 
                            ? 'bg-emerald-500 animate-pulse' 
                            : 'bg-zinc-600'
                        }`}
                        title={box.last_seen ? `Last seen: ${new Date(box.last_seen).toLocaleString()}` : 'Never seen'}
                      />
                      <span>{box.internal_sn}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono">{box.mac_address}</td>
                  <td className="px-6 py-4 font-mono text-zinc-400">{box.ip_address || '—'}</td>
                  <td className="px-6 py-4">{box.location ? box.location.name : '—'}</td>
                  <td className="px-6 py-4">{getStatusBadge(box)}</td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleStartProvisioning(box.id)}
                      className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                      title="Start Provisioning / Install OS"
                    >
                      <PlayCircle size={14} />
                      <span>{box.status === 'INSTALLING' ? 'Re-install' : 'Install'}</span>
                    </button>
                    <button
                      onClick={() => setConsoleBox({ id: box.id, sn: box.internal_sn, status: box.status, progress: box.installation_progress })}
                      className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded transition-all cursor-pointer flex items-center gap-1"
                      title="Open Live Console / Logs"
                    >
                      <Terminal size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteBox(box.id)}
                      className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded transition-all cursor-pointer"
                      title={t('delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Fleet Footer Note */}
      <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500 px-2 py-2 border-t border-zinc-850">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500/80 inline-block animate-pulse"></span>
          <span>Unregistered device auto-discovery scans DHCP/PXE activity within the last 10 minutes.</span>
        </div>
        <div className="text-zinc-600 font-mono">
          Edge-Z.E.R.O. Provisioning Engine
        </div>
      </div>

      {/* Add Box Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-modal-in">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-200">{t('addBox')}</h3>
              <button 
                onClick={handleCloseAddModal}
                className="text-zinc-500 hover:text-zinc-300 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddBox} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Internal SN</label>
                <input
                  type="text"
                  required
                  value={newBox.internal_sn}
                  onChange={(e) => setNewBox({...newBox, internal_sn: e.target.value.replace(/[^\x00-\x7F]/g, '')})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="e.g. BOX-001"
                />
                <p className="text-[10px] text-zinc-500 mt-1">Latin characters, numbers, and hyphens only</p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('macAddress')}</label>
                <input
                  type="text"
                  required
                  disabled={isMacLocked}
                  value={newBox.mac_address}
                  onChange={(e) => setNewBox({...newBox, mac_address: e.target.value})}
                  className={`w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none ${isMacLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  placeholder="e.g. 00:11:22:33:44:55"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('ipAddress')}</label>
                <input
                  type="text"
                  value={newBox.ip_address}
                  onChange={(e) => setNewBox({...newBox, ip_address: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="e.g. 192.168.1.100"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Provision Profile</label>
                <select
                  value={newBox.location_id}
                  onChange={(e) => setNewBox({...newBox, location_id: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none cursor-pointer font-semibold"
                >
                  <option value="">Default OS Profile (System Defaults)</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name} Profile</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-850">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 cursor-pointer"
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
      {/* ConsoleDrawer — opens when an INSTALLING box is clicked */}
      {consoleBox && (
        <ConsoleDrawer
          boxId={consoleBox.id}
          boxSn={consoleBox.sn}
          boxStatus={consoleBox.status}
          progress={consoleBox.progress}
          onClose={() => setConsoleBox(null)}
        />
      )}
      {/* BoxDetailsModal — opens when box serial number is clicked */}
      {selectedBoxId && (() => {
        const box = boxes.find(b => b.id === selectedBoxId);
        return box ? (
          <BoxDetailsModal
            box={box}
            onClose={() => setSelectedBoxId(null)}
            onUpdateBox={(updatedBox) => {
              setBoxes(prev => prev.map(b => b.id === updatedBox.id ? updatedBox : b));
            }}
          />
        ) : null;
      })()}
    </div>
  );
}
