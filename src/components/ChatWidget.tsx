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

const PANEL_WIDTH = 360;

export { PANEL_WIDTH as CHAT_PANEL_WIDTH };

export default function ChatWidget() {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [initialSuggestions, setInitialSuggestions] = useState<string[] | null>(null);
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

  useEffect(() => {
    if (open && initialSuggestions === null) {
      fetch("/api/chat/suggestions")
        .then((r) => r.json())
        .then((d) => {
          if (d.suggestions && Array.isArray(d.suggestions)) setInitialSuggestions(d.suggestions);
          else setInitialSuggestions(defaultSuggestions);
        })
        .catch(() => setInitialSuggestions(defaultSuggestions));
    }
  }, [open, initialSuggestions]);

  // Dispatch custom event so page layouts can react to open/close
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("copilot-toggle", { detail: { open } }));
    document.documentElement.style.setProperty("--copilot-width", open ? `${PANEL_WIDTH}px` : "0px");
  }, [open]);

  // Set initial CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty("--copilot-width", `${PANEL_WIDTH}px`);
  }, []);

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

  const defaultSuggestions = [
    "What are the biggest safety concerns today?",
    "Summarize recent regulatory activity",
    "Any guidance relevant to my focus?",
  ];
  const displaySuggestions = initialSuggestions ?? defaultSuggestions;

  return (
    <>
      {/* Toggle button — only when closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 1000,
            width: 48, height: 48, borderRadius: "50%",
            background: "var(--color-primary-solid, var(--primary-600))", color: "#fff",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            transition: "transform 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Panel — sits under the header, right edge */}
      <div style={{
        position: "fixed",
        top: "var(--topbar-height, 56px)",
        right: 0,
        bottom: 0,
        zIndex: 50,
        width: PANEL_WIDTH,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)",
        background: "var(--glass-bg, rgba(32, 31, 29, 0.96))",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderLeft: "1px solid var(--color-border)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          height: 52, padding: "0 16px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex", alignItems: "center", gap: 10,
          flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, var(--primary-500))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--color-fg)", letterSpacing: "0.01em" }}>
              Copilot
            </div>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
              Mahogany AI
            </div>
          </div>
          <button onClick={() => { setOpen(false); setInitialSuggestions(null); }} aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-fg-muted)", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-md)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-fg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-fg-muted)"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="hide-scrollbar" style={{
          flex: 1, overflowY: "auto", padding: "16px 14px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {/* Empty state */}
          {messages.length === 0 && !loading && (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 14, padding: "0 4px" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", lineHeight: 1.5, margin: 0 }}>
                  Ask about today&apos;s regulatory developments, compare policies, or get quick answers.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {displaySuggestions.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    style={{
                      fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)", color: "var(--color-fg-secondary)",
                      background: "var(--color-surface-raised)", border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)", padding: "10px 12px",
                      cursor: "pointer", textAlign: "left", transition: "border-color 0.1s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 8 }}>
              {msg.role === "assistant" && (
                <div style={{
                  width: 22, height: 22, borderRadius: "var(--radius-full)", flexShrink: 0, marginTop: 2,
                  background: "var(--color-primary-subtle)", color: "var(--color-primary)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                  </svg>
                </div>
              )}
              <div style={{
                maxWidth: "82%", padding: "8px 12px",
                borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                background: msg.role === "user" ? "var(--color-primary-solid, var(--primary-600))" : "var(--color-surface-raised)",
                color: msg.role === "user" ? "#fff" : "var(--color-fg)",
                fontSize: "var(--text-sm)", lineHeight: 1.55,
                fontFamily: "var(--font-sans)",
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
                width: 22, height: 22, borderRadius: "var(--radius-full)", flexShrink: 0,
                background: "var(--color-primary-subtle)", color: "var(--color-primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div style={{ padding: "8px 12px", borderRadius: "12px 12px 12px 4px", background: "var(--color-surface-raised)", display: "flex", gap: 5 }}>
                <span className="chat-dot" style={{ animationDelay: "0ms" }} />
                <span className="chat-dot" style={{ animationDelay: "200ms" }} />
                <span className="chat-dot" style={{ animationDelay: "400ms" }} />
              </div>
            </div>
          )}

          {/* Suggestion pills */}
          {!loading && suggestions.length > 0 && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 30, marginTop: 2 }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)}
                  style={{
                    fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", color: "var(--color-primary)",
                    background: "var(--color-primary-subtle)",
                    border: "1px solid var(--color-primary-muted)",
                    borderRadius: "var(--radius-full)", padding: "4px 10px",
                    cursor: "pointer", transition: "background 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(134, 43, 0, 0.2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-primary-subtle)"; }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--color-border)", flexShrink: 0 }}>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your briefing..."
              disabled={loading}
              style={{
                flex: 1, padding: "9px 12px", fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)",
                border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
                background: "var(--color-surface)", color: "var(--color-fg)", outline: "none",
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
            />
            <button type="submit" disabled={loading || !input.trim()}
              style={{
                width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                background: input.trim() ? "var(--color-primary-solid, var(--primary-600))" : "var(--color-surface-raised)",
                color: input.trim() ? "#fff" : "var(--color-fg-muted)",
                border: "none", cursor: input.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s ease",
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .chat-dot {
          width: 5px; height: 5px; border-radius: 50%;
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
