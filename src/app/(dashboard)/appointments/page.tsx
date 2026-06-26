'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Calendar, Clock, X, CheckCircle, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  description: string | null;
  active: boolean;
}

interface Appointment {
  id: string;
  status: string;
  notes: string | null;
  created_at: string;
  slot: { start_at: string; end_at: string } | null;
  contact: { name: string | null; phone: string } | null;
  service: { name: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  confirmed: 'border-primary/30 bg-primary/10 text-primary',
  completed: 'border-green-500/30 bg-green-500/10 text-green-400',
  cancelled: 'border-red-500/30 bg-red-500/10 text-red-400',
};

export default function AppointmentsPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // New service form
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [svcName, setSvcName] = useState('');
  const [svcDuration, setSvcDuration] = useState(30);
  const [svcDesc, setSvcDesc] = useState('');
  const [svcSaving, setSvcSaving] = useState(false);

  // New appointment form
  const [showApptForm, setShowApptForm] = useState(false);
  const [apptService, setApptService] = useState('');
  const [apptContact, setApptContact] = useState('');
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [apptSaving, setApptSaving] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; name: string | null; phone: string }[]>([]);

  async function load() {
    const db = createClient();
    const [svc, appts, ctcs] = await Promise.all([
      db.from('booking_services').select('*').eq('active', true).order('name'),
      db.from('appointments').select('*, slot:booking_slots(start_at,end_at), contact:contacts(name,phone), service:booking_services(name)').order('created_at', { ascending: false }).limit(50),
      db.from('contacts').select('id, name, phone').order('name').limit(200),
    ]);
    setServices((svc.data ?? []) as Service[]);
    setAppointments((appts.data ?? []) as Appointment[]);
    setContacts(ctcs.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createService(e: React.FormEvent) {
    e.preventDefault();
    setSvcSaving(true);
    const db = createClient();
    const { error } = await db.from('booking_services').insert({ name: svcName.trim(), duration_minutes: svcDuration, description: svcDesc.trim() || null });
    setSvcSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Service added');
    setSvcName(''); setSvcDuration(30); setSvcDesc('');
    setShowServiceForm(false);
    load();
  }

  async function createAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!apptService || !apptContact || !apptDate || !apptTime) { toast.error('All fields required'); return; }
    setApptSaving(true);
    const db = createClient();

    const svc = services.find(s => s.id === apptService);
    const startAt = new Date(`${apptDate}T${apptTime}:00`);
    const endAt = new Date(startAt.getTime() + (svc?.duration_minutes ?? 30) * 60000);

    // Create slot first
    const { data: slot, error: slotErr } = await db.from('booking_slots').insert({
      service_id: apptService,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      booked_count: 1,
    }).select().single();

    if (slotErr || !slot) { toast.error('Failed to create slot'); setApptSaving(false); return; }

    const { error } = await db.from('appointments').insert({
      slot_id: slot.id,
      contact_id: apptContact,
      service_id: apptService,
      notes: apptNotes.trim() || null,
      status: 'confirmed',
    });
    setApptSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Appointment booked');
    setApptService(''); setApptContact(''); setApptDate(''); setApptTime(''); setApptNotes('');
    setShowApptForm(false);
    load();
  }

  async function updateStatus(id: string, status: string) {
    const db = createClient();
    await db.from('appointments').update({ status }).eq('id', id);
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage bookings for your services.</p>
        </div>
        <Button onClick={() => setShowApptForm(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />Book Appointment
        </Button>
      </div>

      {/* Services */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Services ({services.length})</p>
          <Button variant="outline" size="sm" onClick={() => setShowServiceForm(v => !v)} className="border-border bg-transparent text-muted-foreground hover:text-foreground text-xs">
            <Plus className="h-3 w-3 mr-1" />Add Service
          </Button>
        </div>

        {showServiceForm && (
          <form onSubmit={createService} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Service name</Label>
                <Input value={svcName} onChange={e => setSvcName(e.target.value)} placeholder="Consultation call" className="border-border bg-muted text-foreground" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Duration (mins)</Label>
                <Input type="number" value={svcDuration} onChange={e => setSvcDuration(parseInt(e.target.value) || 30)} min={5} max={480} className="border-border bg-muted text-foreground" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Description (optional)</Label>
              <Input value={svcDesc} onChange={e => setSvcDesc(e.target.value)} placeholder="Brief description..." className="border-border bg-muted text-foreground" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={svcSaving || !svcName.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {svcSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Service'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowServiceForm(false)} className="border-border bg-transparent text-muted-foreground">Cancel</Button>
            </div>
          </form>
        )}

        {services.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {services.map(s => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">{s.name}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {s.duration_minutes} min
                </div>
                {s.description && <p className="mt-1.5 text-xs text-muted-foreground">{s.description}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">No services yet. Add one above.</p>
        )}
      </div>

      {/* Appointments list */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Appointments ({appointments.length})</p>
        {appointments.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No appointments yet</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {appointments.map(a => {
              const slot = Array.isArray(a.slot) ? a.slot[0] : a.slot;
              const contact = Array.isArray(a.contact) ? a.contact[0] : a.contact;
              const service = Array.isArray(a.service) ? a.service[0] : a.service;
              return (
                <div key={a.id} className="flex items-center gap-4 px-4 py-3 bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{contact?.name ?? contact?.phone ?? '—'}</p>
                      {service && <span className="text-xs text-muted-foreground">· {service.name}</span>}
                    </div>
                    {slot && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(slot.start_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' '}at {new Date(slot.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {a.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{a.notes}</p>}
                  </div>
                  <Badge variant="outline" className={cn('text-xs capitalize shrink-0', STATUS_COLOR[a.status] ?? '')}>
                    {a.status}
                  </Badge>
                  <div className="flex items-center gap-1 shrink-0">
                    {a.status === 'confirmed' && (
                      <>
                        <button onClick={() => updateStatus(a.id, 'completed')} title="Mark completed" className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted">
                          <CheckCircle className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => updateStatus(a.id, 'cancelled')} title="Cancel" className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-muted">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Book appointment modal */}
      {showApptForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowApptForm(false)}>
          <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Book Appointment</h2>
              <button onClick={() => setShowApptForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={createAppointment} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Service</Label>
                <select value={apptService} onChange={e => setApptService(e.target.value)} required className="w-full h-10 rounded-lg border border-border bg-muted text-foreground text-sm px-3">
                  <option value="">Select service...</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes}min)</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Contact</Label>
                <select value={apptContact} onChange={e => setApptContact(e.target.value)} required className="w-full h-10 rounded-lg border border-border bg-muted text-foreground text-sm px-3">
                  <option value="">Select contact...</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name ?? c.phone}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)} required className="border-border bg-muted text-foreground" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Time</Label>
                  <Input type="time" value={apptTime} onChange={e => setApptTime(e.target.value)} required className="border-border bg-muted text-foreground" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                <Input value={apptNotes} onChange={e => setApptNotes(e.target.value)} placeholder="Any notes..." className="border-border bg-muted text-foreground" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowApptForm(false)} className="flex-1 border-border bg-transparent text-muted-foreground">Cancel</Button>
                <Button type="submit" disabled={apptSaving} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                  {apptSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Book
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
