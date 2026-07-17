import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Search, Plus, Trash2, Server, PlayCircle, AlertTriangle } from 'lucide-react';

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
  const [newBox, setNewBox] = useState({
    internal_sn: '',
    mac_address: '',
    ip_address: '',
    location_id: ''
  });

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
  }, []);

  const handleAddBox = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/boxes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBox)
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewBox({ internal_sn: '', mac_address: '', ip_address: '', location_id: '' });
        fetchData();
      } else {
        const errorData = await res.json();
        alert(`Failed to add box: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to add box:', err);
    }
  };

  const handleDeleteBox = async (id: string) => {
    if (!confirm('Are you sure you want to delete this box?')) return;
    try {
      const res = await fetch(`/api/boxes/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to delete box:', err);
    }
  };

  const getStatusBadge = (status: Box['status']) => {
    const badges = {
      NEW: 'bg-zinc-950 text-zinc-500 border-zinc-800',
      STAGING: 'bg-indigo-950/40 text-indigo-400 border-indigo-900/30',
      INSTALLING: 'bg-amber-950/40 text-amber-400 border-amber-900/30',
      ACTIVE: 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30',
      MAINTENANCE: 'bg-rose-950/40 text-rose-450 border-rose-900/30'
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badges[status] || badges.NEW}`}>
        {status}
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
          <p className="text-zinc-400 text-xs mt-1">{t('inventorySub')}</p>
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
              bg: stats.active_alerts > 0 ? 'bg-rose-950/10 border-rose-900/30' : 'bg-zinc-900 border-zinc-800'
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
                <tr key={box.id} className="hover:bg-zinc-900/20 text-zinc-300">
                  <td className="px-6 py-4 font-bold text-zinc-200">{box.internal_sn}</td>
                  <td className="px-6 py-4 font-mono">{box.mac_address}</td>
                  <td className="px-6 py-4 font-mono text-zinc-400">{box.ip_address || '—'}</td>
                  <td className="px-6 py-4">{box.location ? box.location.name : '—'}</td>
                  <td className="px-6 py-4">{getStatusBadge(box.status)}</td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleDeleteBox(box.id)}
                      className="p-1.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 text-rose-450 hover:text-rose-400 rounded transition-all cursor-pointer"
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

      {/* Add Box Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-modal-in">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-200">{t('addBox')}</h3>
              <button 
                onClick={() => setShowAddModal(false)}
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
                  onChange={(e) => setNewBox({...newBox, internal_sn: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="e.g. BOX-001"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('macAddress')}</label>
                <input
                  type="text"
                  required
                  value={newBox.mac_address}
                  onChange={(e) => setNewBox({...newBox, mac_address: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none"
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
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('location')}</label>
                <select
                  value={newBox.location_id}
                  onChange={(e) => setNewBox({...newBox, location_id: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none cursor-pointer"
                >
                  <option value="">None</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-850">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
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
        </div>
      )}
    </div>
  );
}
