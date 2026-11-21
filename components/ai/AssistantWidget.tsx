'use client';
import './assistant.css';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { poppins } from '@/components/brand/fonts';
import RichText from './RichText';

type Role = 'super_admin' | 'admin' | 'client';

const CLIENT_SUGGESTIONS = [
  'How is my campaign doing in the last 7 days?',
  'What is my cost per result this month?',
  'আমার ক্যাম্পেইনে গত সপ্তাহে কতগুলো রেজাল্ট এসেছে?',
  'Which of my campaigns performed best?',
];
const ADMIN_SUGGESTIONS = [
  'Which clients have active campaigns right now?',
  'Show spend by campaign for the last 7 days',
  'Any campaigns completed or paused recently?',
  'কোন ক্লায়েন্টের রেজাল্ট সবচেয়ে ভালো?',
];

function parseError(err: Error | undefined): string | null {
  if (!err) return null;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed?.error) return String(parsed.error);
  } catch {
    /* not JSON */
  }
  return err.message || 'Something went wrong. Please try again.';
}

function SparkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" fill="currentColor" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" fill="currentColor" opacity=".7" />
    </svg>
  );
}

export default function AssistantWidget({
  role = 'client',
  firstName,
  defaultOpen = false,
}: {
  role?: Role;
  firstName?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const searchParams = useSearchParams();
  const campaignId = searchParams.get('campaignId');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/ai/chat' }), []);
  const { messages, sendMessage, status, stop, error, clearError, setMessages } = useChat({ transport });
  const busy = status === 'submitted' || status === 'streaming';
  const suggestions = role === 'client' ? CLIENT_SUGGESTIONS : ADMIN_SUGGESTIONS;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Lock page scroll behind the full-screen sheet on phones.
  useEffect(() => {
    if (!open || window.innerWidth > 640) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    if (error) clearError();
    sendMessage({ text: t }, { body: { campaignId } });
    setInput('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const last = messages.at(-1);
  const waitingForText =
    busy && (!last || last.role === 'user' || !last.parts.some((p) => p.type === 'text' && p.text.length > 0));
  const usingTools = busy && last?.role === 'assistant' && last.parts.some((p) => isToolUIPart(p));

  return (
    <div className={`${poppins.variable} mk-ai-root`}>
      <button
        type="button"
        className={`mk-ai-fab ${open ? 'is-open' : ''}`}
        aria-label={open ? 'Close assistant' : 'Ask the Marketivity assistant'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
        ) : (
          <>
            <SparkIcon size={20} />
            <span className="mk-ai-fab-label">Ask AI</span>
          </>
        )}
      </button>

      <section className={`mk-ai-panel ${open ? 'is-open' : ''}`} role="dialog" aria-label="Marketivity campaign assistant" aria-hidden={!open}>
        <header className="mk-ai-head">
          <div className="mk-ai-avatar"><SparkIcon size={18} /></div>
          <div className="mk-ai-head-text">
            <div className="mk-ai-title">Campaign Assistant <span className="mk-ai-badge">AI</span></div>
            <div className="mk-ai-sub">Answers from your live campaign data</div>
          </div>
          {messages.length > 0 && (
            <button type="button" className="mk-ai-icon-btn" onClick={() => { stop(); setMessages([]); clearError(); }} title="New chat" aria-label="Start a new chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 9 9 9" /></svg>
            </button>
          )}
          <button type="button" className="mk-ai-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </button>
        </header>

        <div className="mk-ai-body" ref={listRef}>
          {messages.length === 0 ? (
            <div className="mk-ai-empty">
              <div className="mk-ai-hello">Hi{firstName ? ` ${firstName}` : ''} 👋</div>
              <p>Ask me anything about your campaigns: results, spend, cost per result or trends. You can write in English or বাংলা.</p>
              <div className="mk-ai-suggest">
                {suggestions.map((s) => (
                  <button type="button" key={s} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`mk-ai-msg ${m.role === 'user' ? 'is-user' : 'is-bot'}`}>
                <div className="mk-ai-bubble">
                  {m.parts.map((p, i) =>
                    p.type === 'text' ? (
                      m.role === 'user' ? <p key={i}>{p.text}</p> : <RichText key={i} text={p.text} />
                    ) : null
                  )}
                </div>
              </div>
            ))
          )}

          {waitingForText && (
            <div className="mk-ai-msg is-bot">
              <div className="mk-ai-bubble mk-ai-typing">
                <span className="mk-ai-dots"><i /><i /><i /></span>
                <span>{usingTools ? 'Checking your campaign data…' : 'Thinking…'}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mk-ai-error" role="alert">
              {parseError(error)}
            </div>
          )}
        </div>

        <form className="mk-ai-input" onSubmit={onSubmit}>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={2000}
            placeholder="Ask about your campaigns…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Message"
          />
          {busy ? (
            <button type="button" className="mk-ai-send is-stop" onClick={() => stop()} aria-label="Stop">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          ) : (
            <button type="submit" className="mk-ai-send" disabled={!input.trim()} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
            </button>
          )}
        </form>
        <div className="mk-ai-foot">AI can make mistakes. Figures come from your synced Meta data.</div>
      </section>
    </div>
  );
}
