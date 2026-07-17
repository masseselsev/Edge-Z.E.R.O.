import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Upload, Plus, Trash2, Library, Disc, Layers } from 'lucide-react';

interface OsImage {
  id: string;
  filename: string;
  os_type: string;
  is_active: boolean;
  status: string;
}

interface ComponentDefinition {
  id: string;
  name: string;
  model: string;
  description: string;
}

interface ComponentGroup {
  id: string;
  name: string;
  description: string;
}

export default function LibraryTab() {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<'images' | 'components' | 'templates'>('images');
  
  // Data State
  const [images, setImages] = useState<OsImage[]>([]);
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [osType, setOsType] = useState('DEBIAN');
  const [isActive, setIsActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [newComponent, setNewComponent] = useState({
    name: '',
    model: '',
    description: ''
  });

  const [newGroup, setNewGroup] = useState({
    name: '',
    description: ''
  });

  const fetchData = async () => {
    try {
      const [imgRes, compRes, grpRes] = await Promise.all([
        fetch('/api/library/images'),
        fetch('/api/library/components'),
        fetch('/api/library/groups')
      ]);
      if (imgRes.ok) setImages(await imgRes.json());
      if (compRes.ok) setComponents(await compRes.json());
      if (grpRes.ok) setGroups(await grpRes.json());
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Upload ISO
  const handleUploadIso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('os_type', osType);
    formData.append('is_active', String(isActive));

    try {
      const res = await fetch('/api/library/images', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setUploadFile(null);
        fetchData();
      } else {
        alert('Failed to upload ISO image.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // Add Component Definition
  const handleAddComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/library/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newComponent)
      });
      if (res.ok) {
        setNewComponent({ name: '', model: '', description: '' });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Template Group
  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/library/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newGroup, items: [] })
      });
      if (res.ok) {
        setNewGroup({ name: '', description: '' });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteImage = async (id: string) => {
    if (!confirm('Delete this image?')) return;
    await fetch(`/api/library/images/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleDeleteComponent = async (id: string) => {
    if (!confirm('Delete this component definition?')) return;
    await fetch(`/api/library/components/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Delete this template group?')) return;
    await fetch(`/api/library/groups/${id}`, { method: 'DELETE' });
    fetchData();
  };

  if (loading) {
    return <div className="text-zinc-500 text-sm animate-pulse">{t('loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('tabLibrary')}</h1>
      </div>

      {/* Sub-tabs Row */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setSubTab('images')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'images' ? 'bg-zinc-900 border border-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Disc size={13} />
          <span>OS ISO Images</span>
        </button>
        <button
          onClick={() => setSubTab('components')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'components' ? 'bg-zinc-900 border border-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Layers size={13} />
          <span>Components</span>
        </button>
        <button
          onClick={() => setSubTab('templates')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'templates' ? 'bg-zinc-900 border border-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Library size={13} />
          <span>Templates</span>
        </button>
      </div>

      {/* OS Images panel */}
      {subTab === 'images' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Available Images</h3>
            <div className="overflow-hidden border border-zinc-800 bg-zinc-950/40 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-bold">
                    <th className="p-3">Filename</th>
                    <th className="p-3">OS Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {images.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-zinc-500 italic">No ISO images uploaded.</td>
                    </tr>
                  ) : (
                    images.map(img => (
                      <tr key={img.id} className="hover:bg-zinc-900/20 text-zinc-300">
                        <td className="p-3 font-bold text-zinc-200">{img.filename}</td>
                        <td className="p-3">{img.os_type}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            img.status === 'SUCCESS' ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-900/30' : 'bg-zinc-900 text-zinc-400'
                          }`}>{img.status}</span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteImage(img.id)}
                            className="p-1.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 text-rose-450 rounded cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Upload Form */}
          <div className="bg-zinc-900/30 border border-zinc-800 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Upload new ISO</h3>
            <form onSubmit={handleUploadIso} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Select ISO File</label>
                <input
                  type="file"
                  required
                  accept=".iso,.ISO"
                  onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-850 p-2.5 rounded-lg text-zinc-400"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">OS Type</label>
                <select
                  value={osType}
                  onChange={(e) => setOsType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none cursor-pointer"
                >
                  <option value="DEBIAN">Debian</option>
                  <option value="UBUNTU">Ubuntu</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                <Upload size={14} />
                <span>{uploading ? 'Uploading...' : 'Upload Image'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Components panel */}
      {subTab === 'components' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Component Definitions</h3>
            <div className="overflow-hidden border border-zinc-800 bg-zinc-950/40 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-bold">
                    <th className="p-3">Name</th>
                    <th className="p-3">Model</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {components.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-zinc-500 italic">No component definitions found.</td>
                    </tr>
                  ) : (
                    components.map(comp => (
                      <tr key={comp.id} className="hover:bg-zinc-900/20 text-zinc-300">
                        <td className="p-3 font-bold text-zinc-200">{comp.name}</td>
                        <td className="p-3">{comp.model}</td>
                        <td className="p-3 text-zinc-450">{comp.description || '—'}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteComponent(comp.id)}
                            className="p-1.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 text-rose-450 rounded cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Component Form */}
          <div className="bg-zinc-900/30 border border-zinc-800 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Add component type</h3>
            <form onSubmit={handleAddComponent} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newComponent.name}
                  onChange={(e) => setNewComponent({...newComponent, name: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="e.g. HDD 2TB"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Model</label>
                <input
                  type="text"
                  required
                  value={newComponent.model}
                  onChange={(e) => setNewComponent({...newComponent, model: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="e.g. Seagate ST2000LM015"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Description</label>
                <textarea
                  value={newComponent.description}
                  onChange={(e) => setNewComponent({...newComponent, description: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="Optional details"
                />
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                <Plus size={14} />
                <span>Create Component</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Templates panel */}
      {subTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Template Groups</h3>
            <div className="overflow-hidden border border-zinc-800 bg-zinc-950/40 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-bold">
                    <th className="p-3">Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-zinc-500 italic">No template groups found.</td>
                    </tr>
                  ) : (
                    groups.map(grp => (
                      <tr key={grp.id} className="hover:bg-zinc-900/20 text-zinc-300">
                        <td className="p-3 font-bold text-zinc-200">{grp.name}</td>
                        <td className="p-3 text-zinc-450">{grp.description || '—'}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteGroup(grp.id)}
                            className="p-1.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 text-rose-450 rounded cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Group Form */}
          <div className="bg-zinc-900/30 border border-zinc-800 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Create Template Group</h3>
            <form onSubmit={handleAddGroup} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({...newGroup, name: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="e.g. Standard Video-Box"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Description</label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({...newGroup, description: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="Optional details"
                />
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                <Plus size={14} />
                <span>Create Group</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
