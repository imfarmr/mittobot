import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Bot, User, Loader2, AlertCircle, Trash2, RotateCcw } from "lucide-react";
import { getToken, BASE } from "@/lib/api";
import { FadeIn } from "@/components/animations/FadeIn";

interface Message { role: "user" | "assistant"; content: string; }

// Lightweight markdown-like renderer for the AI test chat.
// Supports: code blocks, inline code, bold, italic, spoiler, strikethrough, links.
function formatContent(text: string) {
  if (!text) return text;
  // Escape HTML to prevent XSS from streamed content. We escape once, then
  // restore code blocks (whose content is already escaped) without re-escaping.
  const escape = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Extract code blocks first so their inner markdown isn't processed.
  const codeBlocks: { placeholder: string; html: string }[] = [];
  const token = Math.random().toString(36).slice(2);
  let html = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const placeholder = `__CB_${token}_${codeBlocks.length}__`;
    codeBlocks.push({
      placeholder,
      html: `<pre class="my-2 p-3 rounded bg-black/80 text-xs font-mono text-primary-foreground overflow-x-auto"><code>${escape(code.trim())}</code></pre>`,
    });
    return placeholder;
  });

  html = escape(html);

  // Inline code (only outside code blocks)
  html = html.replace(/`([^`]+)`/g, (_, code) => `<code class="px-1 py-0.5 rounded bg-muted text-xs font-mono">${code}</code>`);
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/(?<![*_])\*([^*]+)\*(?![*_])/g, "<em>$1</em>");
  html = html.replace(/(?<!\w)_([^_]+)_(?!\w)/g, "<em>$1</em>");
  // Spoiler
  html = html.replace(/\|\|([^|]+)\|\|/g, "<span class=\"spoiler\">$1</span>");
  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // Links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, linkText, url) => {
    const safeUrl = String(url).replace(/"/g, "%22").replace(/'/g, "%27");
    return `<a href="${safeUrl}" target="_blank" rel="noreferrer" class="text-primary underline hover:text-primary/80">${linkText}</a>`;
  });
  // Line breaks
  html = html.replace(/\n/g, "<br/>");

  // Restore code blocks
  for (const block of codeBlocks) {
    html = html.replace(block.placeholder, block.html);
  }
  return html;
}

export default function AiChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    const userMsg = text;
    setInput("");
    setError("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setStreaming(true);

    try {
      const token = getToken();
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(BASE + "/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: userMsg, history, thinkingEnabled: false }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || `HTTP ${res.status}`); }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === "token") {
              fullText += parsed.text;
              setMessages(prev => { const next = [...prev]; next[next.length - 1] = { role: "assistant", content: fullText }; return next; });
            } else if (parsed.type === "error") {
              setError(parsed.error);
            } else if (parsed.type === "done") {
              setMessages(prev => { const next = [...prev]; next[next.length - 1] = { role: "assistant", content: parsed.fullText || fullText }; return next; });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setError(err.message || "Chat failed");
      // Keep the user message so they can retry; remove only the empty assistant placeholder.
      setMessages(prev => prev.filter((m, i) => i !== prev.length - 1 || m.content.trim() !== ""));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <FadeIn>
      <Card className="border-border/40 bg-card/40 flex flex-col min-h-[500px]">
        <CardHeader className="pb-3 shrink-0 border-b border-border/20 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Test Chat</CardTitle>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => setMessages([])}>
                <Trash2 className="size-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16 space-y-3">
                <Bot className="size-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">AI test playground. Type a message to start chatting.</p>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0"><Bot className="size-4 text-primary" /></div>}
                  <div className={`max-w-[80%] rounded-lg px-4 py-2.5 ${msg.role === "user" ? "bg-primary/20 border border-primary/20" : "bg-card/30 border border-border/40"}`}>
                    {msg.role === "assistant" ? (
                      <div
                        className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none"
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: formatContent(msg.content) || (streaming && i === messages.length - 1 ? "<span class=\"animate-pulse\">...</span>" : "") }}
                      />
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && <div className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><User className="size-4 text-muted-foreground" /></div>}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-t border-destructive/20 text-destructive text-xs">
              <AlertCircle className="size-3.5" /><span>{error}</span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => {
                const lastUser = [...messages].reverse().find(m => m.role === "user");
                if (lastUser) send(lastUser.content);
              }}>
                <RotateCcw className="size-3.5 mr-1" /> Retry
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 p-4 border-t border-border/20">
            <Input className="flex-1 text-sm" placeholder={streaming ? "Waiting for response..." : "Send a message..."} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} disabled={streaming} />
            <Button size="icon" onClick={() => send()} disabled={streaming || !input.trim()}>
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FadeIn>
  );
}
