'use client';

import { useState } from 'react';
import { inviteClient } from './actions';
import { Alert, Button, Field, Input } from '@/components/ui';
import Modal from '@/components/ui/Modal';

export default function ClientManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    
    try {
      const result = await inviteClient(formData);

      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setSuccess('Client successfully invited. They will receive an email shortly.');
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(null);
        }, 2000);
      } else {
        setError("An unexpected response was received.");
      }
    } catch (err: any) {
      console.error("Client Action Error:", err);
      setError("A network error occurred or the request timed out. Please check the client list before retrying.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button variant="primary" onClick={() => setIsOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Client
      </Button>

      {isOpen && (
        <Modal onClose={() => setIsOpen(false)} labelledBy="invite-title">
            <div className="gx-card__head">
              <div>
                <div className="gx-card__title" id="invite-title" style={{ fontSize: '1.125rem' }}>Invite new client</div>
                <div className="gx-card__sub">They&apos;ll get a secure link to set up portal access.</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </Button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
              {error && <Alert>{error}</Alert>}
              {success && <Alert tone="success">{success}</Alert>}

              <Field label="Business name" htmlFor="businessName">
                <Input type="text" id="businessName" name="businessName" required />
              </Field>
              <Field label="Contact name" htmlFor="contactName">
                <Input type="text" id="contactName" name="contactName" required />
              </Field>
              <Field label="Email address" htmlFor="email" hint="An invitation link will be sent to this email address.">
                <Input type="email" id="email" name="email" required />
              </Field>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
                <Button onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary" loading={loading}>
                  {loading ? 'Sending…' : 'Send invitation'}
                </Button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
}
