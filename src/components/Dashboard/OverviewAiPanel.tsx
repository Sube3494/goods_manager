"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Bot, ChevronDown, ChevronUp, KeyRound, Loader2, Send, Settings, X } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Conversation, ConversationContent, ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

const modelOptions = [
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
];
type ChatMessage = { role: "user" | "assistant"; content: string; reasoning?: string };
type Chat = { id: string; title: string; messages: ChatMessage[] };

export function OverviewAiPanel() {
  const [configured, setConfigured] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState("default");
  const [loading, setLoading] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChatList, setShowChatList] = useState(false);

  useEffect(() => { fetch("/api/overview-ai").then((r) => r.json()).then((v) => { setConfigured(Boolean(v.configured)); setModel(v.model || "deepseek-v4-flash"); }).catch(() => {}); }, []);
  useEffect(() => { setPortalReady(true); }, []);
  useEffect(() => { const open = () => setCollapsed(false); window.addEventListener("overview-ai-open", open); return () => window.removeEventListener("overview-ai-open", open); }, []);
  useEffect(() => {
    if (collapsed) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [collapsed]);
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem("overview-ai-chats") || "[]"); if (Array.isArray(saved)) { setHistory(saved); if (saved[0]) { setChatId(saved[0].id); setMessages(saved[0].messages || []); } } } catch {} }, []);
  useEffect(() => { if (!messages.length) return; setHistory((current) => { const next = [{ id: chatId, title: messages.find((m) => m.role === "user")?.content.slice(0, 24) || "新对话", messages }, ...current.filter((c) => c.id !== chatId)].slice(0, 30); localStorage.setItem("overview-ai-chats", JSON.stringify(next)); return next; }); }, [chatId, messages]);

  async function saveKey() { const r = await fetch("/api/overview-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey, model }) }); if (r.ok) { setConfigured(true); setApiKey(""); } }
  async function changeModel(value: string) { setModel(value); if (configured) await fetch("/api/overview-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: "keep-current-key", model: value }) }); }
  function newChat() { setChatId(`${Date.now()}`); setMessages([]); setQuestion(""); setShowChatList(false); }
  function openChat(chat: Chat) { setChatId(chat.id); setMessages(chat.messages); setQuestion(""); setShowChatList(false); }
  function deleteChat(id: string) { const next = history.filter((chat) => chat.id !== id); setHistory(next); localStorage.setItem("overview-ai-chats", JSON.stringify(next)); if (id === chatId) newChat(); }
  async function ask() {
    if (!question.trim() || loading) return;
    const text = question.trim(); setQuestion(""); setLoading(true);
    setMessages((current) => [...current, { role: "user", content: text }, { role: "assistant", content: "", reasoning: "" }]);
    try {
      const response = await fetch("/api/overview-ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) });
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (!line.trim()) continue; const item = JSON.parse(line); setMessages((current) => { const next = [...current]; const last = next[next.length - 1]; if (last?.role === "assistant") next[next.length - 1] = { ...last, content: item.type === "answer" ? last.content + item.delta : last.content, reasoning: item.type === "reasoning" ? (last.reasoning || "") + item.delta : last.reasoning }; return next; }); } }
    } catch { setMessages((current) => [...current, { role: "assistant", content: "请求失败，请检查网络或 API Key。" }]); } finally { setLoading(false); }
  }

  if (!portalReady || collapsed) return null;

  const activeChatTitle = history.find((chat) => chat.id === chatId)?.title || "新对话";

  const chatList = (
    <>
      <button
        onClick={newChat}
        className="shrink-0 rounded-xl border border-dashed border-sky-500/45 px-3 py-2 text-left text-sm text-sky-600 transition hover:bg-sky-500/10 sm:mb-3 sm:w-full"
      >
        ＋ 新建聊天
      </button>
      {history.map((chat) => (
        <div
          key={chat.id}
          className={`flex shrink-0 items-center rounded-xl sm:w-full ${
            chat.id === chatId
              ? "bg-sky-500/12 text-sky-500"
              : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <button onClick={() => openChat(chat)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-xs">
            {chat.title}
          </button>
          <button onClick={() => deleteChat(chat.id)} className="px-2 text-xs hover:text-red-500" aria-label="删除聊天">
            <X size={13} />
          </button>
        </div>
      ))}
    </>
  );

  const mobileChatSelector = (
    <div className="relative shrink-0 sm:hidden">
      <button
        onClick={() => setShowChatList((value) => !value)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-black/10 bg-black/[0.03] px-3 text-left text-sm dark:border-white/10 dark:bg-white/[0.05]"
      >
        <span className="min-w-0 truncate text-muted-foreground">当前聊天：<span className="text-foreground">{activeChatTitle}</span></span>
        <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition ${showChatList ? "rotate-180" : ""}`} />
      </button>
      {showChatList && (
        <div className="absolute left-0 right-0 top-12 z-30 max-h-64 overflow-y-auto rounded-2xl border border-black/10 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#171c28]">
          <button
            onClick={newChat}
            className="mb-1 flex w-full items-center rounded-xl border border-dashed border-sky-500/45 px-3 py-2 text-left text-sm text-sky-600 transition hover:bg-sky-500/10"
          >
            ＋ 新建聊天
          </button>
          {history.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">暂无历史聊天</div>
          ) : (
            history.map((chat) => (
              <div
                key={chat.id}
                className={`mb-1 flex items-center rounded-xl ${
                  chat.id === chatId
                    ? "bg-sky-500/12 text-sky-500"
                    : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <button onClick={() => openChat(chat)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm">
                  {chat.title}
                </button>
                <button onClick={() => deleteChat(chat.id)} className="px-2 text-xs hover:text-red-500" aria-label="删除聊天">
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const messageList = messages.length === 0 ? (
    <ConversationEmptyState title="准备好分析你的经营数据" description="例如：最近哪个店铺利润最高？" />
  ) : (
    messages.map((message, index) => (
      <Message key={index} from={message.role}>
        <MessageContent>
          {message.reasoning && (
            <details className="mb-2 rounded-lg border border-sky-500/20 p-2 text-xs">
              <summary className="cursor-pointer font-semibold text-sky-600">
                查看思考过程{loading && index === messages.length - 1 ? " ..." : ""}
              </summary>
              <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{message.reasoning}</div>
            </details>
          )}
          <MessageResponse>{message.content}</MessageResponse>
        </MessageContent>
      </Message>
    ))
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-md" onClick={() => setCollapsed(true)} aria-hidden="true" />
      <section className="fixed inset-x-2 bottom-3 top-3 z-[10001] mx-auto flex max-w-6xl flex-col overflow-hidden rounded-[28px] sm:rounded-[32px] border border-border/70 bg-white dark:bg-zinc-900 p-4 shadow-2xl shadow-black/10 dark:shadow-black/50 backdrop-blur-xl sm:inset-x-8 sm:bottom-auto sm:top-16 sm:h-[min(720px,calc(100vh-6rem))] sm:p-6">
        <header className="shrink-0 border-b border-border/50 pb-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2.5 text-base font-black leading-tight sm:text-lg text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/20">
                  <Bot size={18} />
                </div>
                <span>经营数据 AI 助手</span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground font-medium">基于账号下全部经营指标与趋势实时分析</p>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="h-8 w-8 rounded-full border border-border/70 bg-white text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-800 dark:hover:bg-zinc-700 flex items-center justify-center transition-all shadow-2xs cursor-pointer"
              aria-label="收起经营助手"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-3 flex justify-end">
            <CustomSelect value={model} onChange={changeModel} options={modelOptions} className="h-9 w-full sm:w-56" triggerClassName="h-full rounded-full border border-border/70 bg-white px-3.5 text-xs font-bold shadow-2xs dark:border-white/10 dark:bg-zinc-800" />
          </div>
        </header>

        {!configured ? (
          <div className="mt-5 flex shrink-0 gap-2">
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="输入 DeepSeek API Key" className="h-11 min-w-0 flex-1 rounded-full border border-border/70 bg-zinc-50 dark:bg-zinc-800/80 px-4 text-xs font-mono outline-none shadow-2xs focus:ring-2 focus:ring-sky-500/20" />
            <button onClick={saveKey} disabled={!apiKey.trim()} className="flex h-11 px-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white shadow-md shadow-sky-600/20 hover:bg-sky-500 disabled:opacity-50 active:scale-95 cursor-pointer">
              <KeyRound size={15} className="mr-1.5" />
              验证并绑定
            </button>
          </div>
        ) : (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 sm:mt-4 sm:flex-row sm:gap-4">
            {mobileChatSelector}
            <aside className="hidden shrink-0 gap-1.5 dark:border-white/10 sm:flex sm:w-52 sm:flex-col sm:border-r border-border/60 sm:pr-4">
              <button
                onClick={newChat}
                className="shrink-0 rounded-full border border-dashed border-sky-500/50 bg-sky-500/5 px-4 py-2 text-left text-xs font-bold text-sky-600 transition hover:bg-sky-500/10 active:scale-95 sm:mb-2 sm:w-full cursor-pointer"
              >
                ＋ 新建聊天
              </button>
              {history.map((chat) => (
                <div
                  key={chat.id}
                  className={`flex shrink-0 items-center rounded-full sm:w-full transition-all ${
                    chat.id === chatId
                      ? "bg-sky-500/12 text-sky-600 dark:text-sky-400 font-bold border border-sky-500/20"
                      : "text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <button onClick={() => openChat(chat)} className="min-w-0 flex-1 truncate px-3.5 py-1.5 text-left text-xs">
                    {chat.title}
                  </button>
                  <button onClick={() => deleteChat(chat.id)} className="px-2.5 text-xs text-muted-foreground hover:text-rose-500 cursor-pointer" aria-label="删除聊天">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </aside>
            <main className="flex min-h-0 flex-1 flex-col">
              <Conversation className="min-h-0 flex-1 rounded-2xl border border-border/60 bg-zinc-50/60 dark:bg-white/[0.01] outline-none">
                <ConversationContent>{messageList}</ConversationContent>
              </Conversation>
              <div className="mt-3 flex shrink-0 gap-2">
                <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} placeholder="输入你的问题，Enter 发送" className="h-11 min-w-0 flex-1 rounded-full border border-border/70 bg-zinc-50 dark:bg-zinc-800/80 px-4 text-xs outline-none shadow-2xs focus:ring-2 focus:ring-sky-500/20" />
                <button onClick={ask} disabled={loading || !question.trim()} className="flex h-11 shrink-0 items-center justify-center rounded-full bg-sky-600 px-5 text-xs font-bold text-white shadow-md shadow-sky-600/20 hover:bg-sky-500 disabled:opacity-50 active:scale-95 cursor-pointer">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  <span className="ml-1.5">{loading ? "分析中…" : "发送"}</span>
                </button>
              </div>
            </main>
          </div>
        )}

        {configured && (
          <div className="mt-3 shrink-0">
            <button onClick={() => setShowSettings((value) => !value)} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition hover:text-sky-500 cursor-pointer">
              <Settings size={14} />
              {showSettings ? "返回对话" : "AI 设置"}
            </button>
          </div>
        )}
        {configured && showSettings && (
          <div className="absolute inset-3 top-[118px] z-20 flex flex-col rounded-2xl border border-border/70 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-zinc-900 sm:inset-y-4 sm:left-[236px] sm:right-4 sm:top-20 sm:p-6">
            <button onClick={() => setShowSettings(false)} className="mb-5 flex w-fit items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-500 cursor-pointer">
              <ArrowLeft size={16} />
              返回对话
            </button>
            <div>
              <h3 className="text-base font-black text-foreground">AI 设置</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">配置与修改经营数据助手使用的 DeepSeek API Key</p>
            </div>
            <div className="mt-5 max-w-2xl space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">DeepSeek API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="输入新的 DeepSeek API Key" className="h-11 w-full rounded-full border border-border/70 bg-zinc-50 dark:bg-zinc-800/80 px-4 text-xs font-mono outline-none shadow-2xs focus:ring-2 focus:ring-sky-500/20" />
              <div className="pt-2">
                <button onClick={saveKey} disabled={!apiKey.trim()} className="rounded-full bg-sky-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-600/20 hover:bg-sky-500 disabled:opacity-50 active:scale-95 cursor-pointer">保存配置</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>,
    document.body,
  );
}
