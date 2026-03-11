"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function renderMd(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(\/stories\/([^)]+)\)/g, '<a href="/stories/$2" style="color:var(--color-primary);font-weight:600;text-decoration:underline;text-underline-offset:2px;">$1</a>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--color-primary);text-decoration:underline;text-underline-offset:2px;font-size:0.85em;">$1 ↗</a>')
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, suggestions]);

  useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = useCallback(async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    const userMsg: Message = { role: "user", content: q };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setSuggestions([]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.reply || "Sorry, I couldn\u2019t process that." }]);
      if (data.suggestions && Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Something went wrong. Please try again." }]);
      setSuggestions([]);
    }
    setLoading(false);
  }, [input, loading, messages]);

  const initialSuggestions = [
    "What are the biggest safety concerns today?",
    "Summarize EU regulatory activity",
    "Any updates relevant to oncology?",
  ];

  return (
    <>
      {/* Toggle button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 1000,
            width: 52, height: 52, borderRadius: "50%",
            background: "var(--color-fg)", color: "var(--color-fg-inverse)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(26,24,22,0.2), 0 1px 4px rgba(26,24,22,0.1)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(26,24,22,0.25)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(26,24,22,0.2), 0 1px 4px rgba(26,24,22,0.1)"; }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Sidebar panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 1100,
        width: 400,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)",
        boxShadow: "none",
        background: "var(--color-bg)",
        borderLeft: "1px solid var(--color-border)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          height: 52, padding: "0 16px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--color-bg)", flexShrink: 0,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "var(--radius-full)",
            background: "var(--color-fg)", color: "var(--color-fg-inverse)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, fontFamily: "var(--font-sans)", flexShrink: 0,
          }}>M</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--color-fg)" }}>
              Mahogany AI
            </div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-fg-muted)", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-md)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: "auto", padding: "20px 16px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {/* Empty state */}
          {messages.length === 0 && !loading && (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 16, padding: "0 8px" }}>
              <div style={{ textAlign: "center" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-placeholder)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", lineHeight: 1.5, margin: 0 }}>
                  Ask about today&apos;s regulatory developments, compare policies, or get quick answers.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {initialSuggestions.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    style={{
                      fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)", color: "var(--color-fg-secondary)",
                      background: "var(--color-surface-raised)", border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)", padding: "10px 14px",
                      cursor: "pointer", textAlign: "left", transition: "border-color 0.1s ease, background 0.1s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; e.currentTarget.style.background = "var(--color-bg)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface-raised)"; }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.role === "assistant" && (
                <div style={{
                  width: 24, height: 24, borderRadius: "var(--radius-full)", flexShrink: 0, marginRight: 8, marginTop: 2,
                  background: "var(--color-fg)", color: "var(--color-fg-inverse)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 700, fontFamily: "var(--font-sans)",
                }}>M</div>
              )}
              <div style={{
                maxWidth: "80%", padding: "10px 14px",
                borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: msg.role === "user" ? "var(--color-fg)" : "var(--color-surface-raised)",
                color: msg.role === "user" ? "var(--color-fg-inverse)" : "var(--color-fg)",
                fontSize: "var(--text-sm)", lineHeight: 1.6,
                fontFamily: msg.role === "user" ? "var(--font-sans)" : "var(--font-serif)",
              }}>
                {msg.role === "assistant" ? (
                  <span dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
                ) : msg.content}
              </div>
            </div>
          ))}

          {/* Loading dots */}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "var(--radius-full)", flexShrink: 0,
                background: "var(--color-fg)", color: "var(--color-fg-inverse)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, fontFamily: "var(--font-sans)",
              }}>M</div>
              <div style={{ padding: "10px 14px", borderRadius: "14px 14px 14px 4px", background: "var(--color-surface-raised)", display: "flex", gap: 5 }}>
                <span className="chat-dot" style={{ animationDelay: "0ms" }} />
                <span className="chat-dot" style={{ animationDelay: "200ms" }} />
                <span className="chat-dot" style={{ animationDelay: "400ms" }} />
              </div>
            </div>
          )}

          {/* Suggestion pills — shown after every assistant response */}
          {!loading && suggestions.length > 0 && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 32, marginTop: 2 }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)}
                  style={{
                    fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", color: "var(--color-primary)",
                    background: "var(--color-primary-subtle, rgba(158,59,30,0.06))",
                    border: "1px solid var(--color-primary-muted, rgba(158,59,30,0.15))",
                    borderRadius: "var(--radius-full)", padding: "5px 12px",
                    cursor: "pointer", transition: "background 0.15s ease, border-color 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(158,59,30,0.1)"; e.currentTarget.style.borderColor = "rgba(158,59,30,0.25)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-primary-subtle, rgba(158,59,30,0.06))"; e.currentTarget.style.borderColor = "var(--color-primary-muted, rgba(158,59,30,0.15))"; }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--color-border)", background: "var(--color-bg)", flexShrink: 0 }}>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your briefing..."
              disabled={loading}
              style={{
                flex: 1, padding: "10px 14px", fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)",
                border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
                background: "var(--color-bg)", color: "var(--color-fg)", outline: "none",
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
            />
            <button type="submit" disabled={loading || !input.trim()}
              style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: input.trim() ? "var(--color-fg)" : "var(--color-surface-raised)",
                color: input.trim() ? "var(--color-fg-inverse)" : "var(--color-fg-muted)",
                border: "none", cursor: input.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s ease",
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .chat-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--color-fg-muted);
          animation: chatPulse 1.2s infinite;
        }
        @keyframes chatPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
