'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Plus, QrCode, Download, Trash2, X, Tag } from 'lucide-react';
import QRCode from 'qrcode';

interface QREntry {
  id: string;
  name: string;
  phone: string;
  prefill_message: string;
  campaign_tag: string | null;
  scan_count: number;
  created_at: string;
}

function buildWaLink(phone: string, msg: string) {
  const num = phone.replace(/\D/g, '');
  const text = encodeURIComponent(msg);
  return `https://wa.me/${num}${text ? `?text=${text}` : ''}`;
}

export default function QRCodesPage() {
  const [entries, setEntries] = useState<QREntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [tag, setTag] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [canvasSrc, setCanvasSrc] = useState<Record<string, string>>({});
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  async function load() {
    const db = createClient();
    const { data } = await db.from('qr_codes').select('*').order('created_at', { ascending: false });
    setEntries((data ?? []) as QREntry[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const link = buildWaLink(phone, msg);
    setPreviewUrl(link);
  }, [phone, msg]);

  async function renderQR(id: string, link: string): Promise<string> {
    if (canvasSrc[id]) return canvasSrc[id];
    try {
      const dataUrl = await QRCode.toDataURL(link, {
        width: 300,
        margin: 2,
        color: { dark: '#0a0a0a', light: '#ffffff' },
      });
      setCanvasSrc(prev => ({ ...prev, [id]: dataUrl }));
      return dataUrl;
    } catch {
      return '';
    }
  }

  useEffect(() => {
    entries.forEach(e => {
      renderQR(e.id, buildWaLink(e.phone, e.prefill_message));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    const db = createClient();
    const { error } = await db.from('qr_codes').insert({
      name: name.trim(),
      phone: phone.trim(),
      prefill_message: msg.trim(),
      campaign_tag: tag.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('QR code created');
    setName(''); setPhone(''); setMsg(''); setTag('');
    setShowForm(false);
    load();
  }

  async function del(id: string) {
    const db = createClient();
    await db.from('qr_codes').delete().eq('id', id);
    setEntries(prev => prev.filter(e => e.id !== id));
    toast.success('Deleted');
  }

  async function download(entry: QREntry) {
    const link = buildWaLink(entry.phone, entry.prefill_message);
    const dataUrl = await QRCode.toDataURL(link, { width: 800, margin: 3, color: { dark: '#0a0a0a', light: '#ffffff' } });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${entry.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">QR Codes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Generate WhatsApp QR codes for campaigns. Print on menus, cards, or ads.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />New QR Code
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Create QR Code</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Name / Label</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Menu Card QR, Reception Desk..." required className="border-border bg-muted text-foreground" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">WhatsApp number (with country code)</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="971501234567" required className="border-border bg-muted text-foreground" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Pre-filled message (optional)</Label>
                <Input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Hi! I'd like to know more..." className="border-border bg-muted text-foreground" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Campaign tag (optional)</Label>
                <Input value={tag} onChange={e => setTag(e.target.value)} placeholder="e.g. summer-promo, menu-2024..." className="border-border bg-muted text-foreground" />
              </div>
              {previewUrl && phone && (
                <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1">
                    <QRCodePreview url={previewUrl} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground mb-0.5">Preview</p>
                    <p className="text-xs text-muted-foreground break-all">{previewUrl}</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1 border-border bg-transparent text-muted-foreground">Cancel</Button>
                <Button type="submit" disabled={saving || !name.trim() || !phone.trim()} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16">
          <QrCode className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No QR codes yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create one to start tracking scans</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(e => {
            const link = buildWaLink(e.phone, e.prefill_message);
            return (
              <div key={e.id} className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">+{e.phone.replace(/\D/g, '')}</p>
                    {e.campaign_tag && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Tag className="h-2.5 w-2.5" />{e.campaign_tag}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => download(e)} title="Download PNG" className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => del(e.id)} title="Delete" className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-muted">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-center rounded-xl border border-border bg-white p-4">
                  {canvasSrc[e.id] ? (
                    <img src={canvasSrc[e.id]} alt={`QR for ${e.name}`} className="w-36 h-36 object-contain" />
                  ) : (
                    <div className="w-36 h-36 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  )}
                </div>
                {e.prefill_message && (
                  <p className="text-xs text-muted-foreground italic truncate">&ldquo;{e.prefill_message}&rdquo;</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QRCodePreview({ url }: { url: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { width: 96, margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then(setSrc).catch(() => {});
  }, [url]);
  if (!src) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return <img src={src} alt="QR preview" className="w-full h-full object-contain" />;
}
