'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { FileSignature, Loader2, Plus, MoreHorizontal, Download, Send, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { uploadAccountMedia, MEDIA_MAX_BYTES } from '@/lib/storage/upload-media';
import { useCan } from '@/hooks/use-can';

interface Contract {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'signed' | 'declined';
  signer_name: string | null;
  signer_email: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<Contract['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-amber-500/15 text-amber-500',
  signed: 'bg-primary/10 text-primary',
  declined: 'bg-red-500/15 text-red-500',
};

export default function ContractsPage() {
  const canEdit = useCan('send-messages');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/contracts');
    const json = await res.json().catch(() => ({}));
    if (res.ok) setContracts(json.contracts ?? []);
    else toast.error(json.error ?? 'Failed to load contracts');
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  function resetForm() {
    setTitle('');
    setSignerName('');
    setSignerEmail('');
    setFile(null);
  }

  async function createContract(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (!file) { toast.error('Attach a file'); return; }
    if (file.size > MEDIA_MAX_BYTES) { toast.error('File is too large (max 16MB)'); return; }

    setSaving(true);
    try {
      const { path } = await uploadAccountMedia('contracts', file);
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          file_path: path,
          signer_name: signerName.trim() || undefined,
          signer_email: signerEmail.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? 'Failed to create contract'); setSaving(false); return; }
      toast.success('Contract added');
      setFormOpen(false);
      resetForm();
      fetchContracts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
    setSaving(false);
  }

  async function updateStatus(id: string, status: Contract['status']) {
    const res = await fetch(`/api/contracts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? 'Update failed'); return; }
    toast.success(`Marked as ${status}`);
    fetchContracts();
  }

  async function downloadContract(id: string) {
    const res = await fetch(`/api/contracts/${id}/signed-url`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? 'Could not generate link'); return; }
    window.open(json.url, '_blank', 'noopener,noreferrer');
  }

  async function deleteContract(id: string) {
    const res = await fetch(`/api/contracts/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? 'Delete failed'); return; }
    toast.success('Contract deleted');
    fetchContracts();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contracts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload, send, and track signature status for client agreements.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setFormOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1.5" />New Contract
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-muted/50">
              <TableHead className="text-muted-foreground">Title</TableHead>
              <TableHead className="text-muted-foreground">Signer</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
              </TableCell></TableRow>
            ) : contracts.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12">
                <FileSignature className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No contracts yet.</p>
              </TableCell></TableRow>
            ) : (
              contracts.map((c) => (
                <TableRow key={c.id} className="border-border">
                  <TableCell className="text-foreground font-medium">{c.title}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {c.signer_name || c.signer_email || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[c.status]}`}>
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(c.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" />}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => downloadContract(c.id)}>
                          <Download className="h-3.5 w-3.5 mr-2" />Download
                        </DropdownMenuItem>
                        {canEdit && c.status === 'draft' && (
                          <DropdownMenuItem onClick={() => updateStatus(c.id, 'sent')}>
                            <Send className="h-3.5 w-3.5 mr-2" />Mark sent
                          </DropdownMenuItem>
                        )}
                        {canEdit && c.status === 'sent' && (
                          <>
                            <DropdownMenuItem onClick={() => updateStatus(c.id, 'signed')}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-2" />Mark signed
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateStatus(c.id, 'declined')}>
                              <XCircle className="h-3.5 w-3.5 mr-2" />Mark declined
                            </DropdownMenuItem>
                          </>
                        )}
                        {canEdit && (
                          <DropdownMenuItem onClick={() => deleteContract(c.id)} className="text-red-500">
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Contract</DialogTitle>
            <DialogDescription>Upload a document and track it through signature.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createContract} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Service Agreement — Acme Co" className="border-border bg-muted text-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Signer name</Label>
                <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Signer email</Label>
                <Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">File (PDF/doc, max 16MB)</Label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
