// AskBlueprint — post-purchase Q&A interface. Streams responses from
// /api/ask-blueprint, which is grounded in the user's calculator inputs.
// Designed to sit inside the dark Blueprint panel; matches the existing
// violet/zinc aesthetic.

import { useEffect, useRef, useState } from "react";

interface UserContext {
  userName?: string;
  age: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  investedStart: number;
  cashStart: number;
  monthlyInvest: number;
  bufferTarget: number;
  target: number;
  leverageScore: number;
  leverageLabel: string;
  bottleneckKey: string;
  bottleneckLabel: string;
  runwayMonths: number;
  yearsToFreedom: number | null;
  freedomNumber: number;
  savingsRatePct: number;
  surplus: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// UIMessage shape the API expects — mirrors the AI SDK UIMessage type with
// the `parts` array. Kept inline to avoid importing `ai` on the client.
interface UIMessageForApi {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
}

const toApiMessages = (msgs: Message[]): UIMessageForApi[] =>
  msgs.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text", text: m.content }],
  }));

const SUGGESTIONS = [
  "What's the single most impactful move I could make this quarter?",
  "If I took a 6-month sabbatical, how would that affect my timeline?",
  "Should I prioritise paying down debt or increasing investments?",
  "What would it take to shave 3 years off my timeline?",
];

export default function AskBlueprint({ userContext }: { userContext: UserContext }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom on new message / stream chunk
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) return;
    setError("");
    setExpanded(true);

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ask-blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: toApiMessages(nextMessages),
          userContext,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: assistantContent } : m
          )
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message || "Something went wrong.");
      // Remove the empty assistant placeholder on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const clear = () => {
    if (isStreaming) return;
    setMessages([]);
    setError("");
    setExpanded(false);
  };

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-violet-800/40 bg-gradient-to-br from-violet-950/30 via-zinc-950 to-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-500/40">
            <svg className="h-4 w-4 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Ask Your Blueprint</div>
            <div className="text-[11px] text-zinc-500">Answers grounded in your actual numbers</div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clear}
            disabled={isStreaming}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>

      {/* Thread / Suggestions */}
      {messages.length === 0 ? (
        <div className="px-5 py-5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-violet-400">
            Start with a question
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-left text-xs leading-snug text-zinc-300 transition hover:border-violet-600/60 hover:bg-zinc-900 hover:text-white"
              >
                <span className="text-violet-400 group-hover:text-violet-300">→</span>{" "}
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={threadRef}
          className="max-h-[480px] overflow-y-auto px-5 py-4 space-y-4"
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} streaming={isStreaming && !m.content && m.role === "assistant"} />
          ))}
        </div>
      )}

      {error && (
        <div className="mx-5 mb-3 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          ✗ {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-zinc-800 bg-zinc-950/60 px-4 py-3">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder={messages.length === 0 ? "Or type your own question..." : "Follow up..."}
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-violet-600 transition disabled:opacity-60"
            style={{ minHeight: 40, maxHeight: 120 }}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="shrink-0 rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="shrink-0 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_16px_rgba(139,92,246,0.4)] transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Send
            </button>
          )}
        </form>
        <div className="mt-2 text-[10px] text-zinc-600 leading-snug">
          Educational only — not personal financial advice. Answers use the numbers currently in your calculator.
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600/20 border border-violet-700/40 px-4 py-2.5 text-sm text-violet-50 whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-zinc-900/70 border border-zinc-800 px-4 py-3 text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">
        {content || (streaming ? "…" : "")}
        {streaming && content && (
          <span className="ml-0.5 inline-block h-3.5 w-[6px] align-middle bg-violet-400 animate-pulse" />
        )}
      </div>
    </div>
  );
}
