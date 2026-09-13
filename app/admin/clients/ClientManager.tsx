'use client';

import { useState } from 'react';
import { inviteClient } from './actions';

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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <button
          onClick={() => setIsOpen(true)}
          style={{
            background: 'var(--c900)', color: 'var(--white)',
            border: 'none', padding: '10px 20px', borderRadius: 'var(--r-md)',
            fontFamily: 'var(--fh)', fontSize: '0.875rem', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            boxShadow: 'var(--sh-sm)'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Client
        </button>
      </div>

      {isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '1rem'
        }}>
          <div style={{
            background: 'var(--white)', borderRadius: 'var(--r-lg)',
            width: '100%', maxWidth: '480px', overflow: 'hidden',
            boxShadow: 'var(--sh-xl)'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--c200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--fh)', fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--c900)' }}>
                Invite New Client
              </h3>
              <button 
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c500)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
              {error && (
                <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '0.75rem 1rem', borderRadius: 'var(--r-md)', marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  {error}
                </div>
              )}
              {success && (
                <div style={{ background: '#ECFDF5', color: '#047857', padding: '0.75rem 1rem', borderRadius: 'var(--r-md)', marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  {success}
                </div>
              )}

              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="businessName" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--c700)' }}>Business Name</label>
                <input 
                  type="text" id="businessName" name="businessName" required
                  style={{ width: '100%', padding: '0.625rem 0.75rem', border: '1px solid var(--c300)', borderRadius: 'var(--r-md)', fontSize: '0.875rem', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="contactName" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--c700)' }}>Contact Name</label>
                <input 
                  type="text" id="contactName" name="contactName" required
                  style={{ width: '100%', padding: '0.625rem 0.75rem', border: '1px solid var(--c300)', borderRadius: 'var(--r-md)', fontSize: '0.875rem', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <label htmlFor="email" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--c700)' }}>Email Address</label>
                <input 
                  type="email" id="email" name="email" required
                  style={{ width: '100%', padding: '0.625rem 0.75rem', border: '1px solid var(--c300)', borderRadius: 'var(--r-md)', fontSize: '0.875rem', outline: 'none' }}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--c500)', marginTop: '0.5rem' }}>
                  An invitation link will be sent to this email address.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button 
                  type="button" 
                  onClick={() => setIsOpen(false)}
                  style={{ background: 'var(--c100)', color: 'var(--c700)', border: 'none', padding: '0.625rem 1rem', borderRadius: 'var(--r-md)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  style={{ background: 'var(--orange-500)', color: 'var(--white)', border: 'none', padding: '0.625rem 1rem', borderRadius: 'var(--r-md)', fontSize: '0.875rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  {loading ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
