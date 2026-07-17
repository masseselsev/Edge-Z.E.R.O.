import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Upload, Trash2, FileCode } from 'lucide-react';

interface InitScript {
  id: string;
  filename: string;
  hardware_comment: string | null;
}

export default function InitScriptsTab() {
  const { t } = useTranslation();
  const [scripts, setScripts] = useState<InitScript[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);

  const fetchScripts = async () => {
    try {
      const res = await fetch('/api/init-scripts/');
      if (res.ok) {
        setScripts(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch scripts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScripts();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);

    const formData = new FormData();
    formData.append('file', uploadFile);
    if (comment) {
      formData.append('hardware_comment', comment);
    }

    try {
      const res = await fetch('/api/init-scripts/', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setUploadFile(null);
        setComment('');
        fetchScripts();
      } else {
        alert('Failed to upload script file.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this script?')) return;
    try {
      const res = await fetch(`/api/init-scripts/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) fetchScripts();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="text-zinc-500 text-sm animate-pulse">{t('loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('tabInitScripts')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scripts list */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Uploaded Init Scripts</h3>
          <div className="overflow-hidden border border-zinc-800 bg-zinc-950/40 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-bold">
                  <th className="p-3">Filename</th>
                  <th className="p-3">Hardware Compatibility / Comment</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {scripts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-zinc-500 italic">No init scripts found.</td>
                  </tr>
                ) : (
                  scripts.map((script) => (
                    <tr key={script.id} className="hover:bg-zinc-900/20 text-zinc-300">
                      <td className="p-3 font-mono font-semibold text-indigo-400 flex items-center gap-2">
                        <FileCode size={13} className="text-zinc-500" />
                        <span>{script.filename}</span>
                      </td>
                      <td className="p-3 text-zinc-450">{script.hardware_comment || '—'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDelete(script.id)}
                          className="p-1.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 text-rose-450 rounded cursor-pointer"
                          title="Delete Script"
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
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Upload Script</h3>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Select Script File</label>
              <input
                type="file"
                required
                onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                className="w-full text-xs bg-zinc-950 border border-zinc-850 p-2.5 rounded-lg text-zinc-400"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Hardware / Compatibility Comment</label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                placeholder="e.g. For NVIDIA Jetson Box templates"
              />
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
            >
              <Upload size={14} />
              <span>{uploading ? 'Uploading...' : 'Upload Script'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
