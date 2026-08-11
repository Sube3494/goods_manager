"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, ChevronDown, ChevronUp, KeyRound, Loader2, Send, Trash2, X } from "lucide-react";
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
  function newChat() { setChatId(`${Date.now()}`); setMessages([]); setQuestion(""); }
  function openChat(chat: Chat) { setChatId(chat.id); setMessages(chat.messages); setQuestion(""); }
  function deleteChat(id: string) { const next = history.filter((chat) => chat.id !== id); setHistory(next); localStorage.setItem("overview-ai-chats", JSON.stringify(next)); if (id === chatId) newChat(); }
  async function removeKey() { await fetch("/api/overview-ai", { method: "DELETE" }); setConfigured(false); setMessages([]); }

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
  return createPortal(<>{!collapsed && <div className="fixed inset-0 z-[10000] bg-black/35 backdrop-blur-[2px]" onClick={() => setCollapsed(true)} aria-hidden="true" />}<section className={collapsed ? "fixed right-20 top-2 z-[10001]" : "fixed inset-x-4 top-16 z-[10001] mx-auto flex h-[min(700px,calc(100vh-6rem))] max-w-6xl flex-col overflow-hidden rounded-[28px] border border-black/10 bg-white/95 p-4 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#11151f]/95 sm:inset-x-8 sm:p-5"}>
    <header className="flex items-center justify-between">
      <div>{collapsed ? <button onClick={() => setCollapsed(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-500/30 bg-white shadow-sm text-sky-600 transition hover:scale-105 dark:bg-white/10" aria-label="打开经营数据 AI 助手"><Bot size={19} /></button> : <><h2 className="flex items-center gap-2 text-base font-black sm:text-lg"><Bot size={19} className="text-sky-500" />经营数据 AI 助手</h2><p className="mt-1 text-xs text-muted-foreground">基于账号下全部经营数据回答</p></>}</div>
      {!collapsed && <div className="flex items-center gap-4"><div className="flex gap-3 text-xs text-muted-foreground">{configured && <button onClick={removeKey} className="flex items-center gap-1"><Trash2 size={14} />删除 Key</button>}</div><button onClick={() => setCollapsed(true)} className="rounded-lg p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10" aria-label="收起经营助手"><ChevronUp size={18} /></button></div>}
    </header>
    {!collapsed && (!configured ? <div className="mt-4 flex gap-2"><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="输入 DeepSeek API Key" className="h-10 flex-1 rounded-xl border bg-white px-3 text-sm outline-none focus:outline-none focus:ring-0 dark:bg-white/5" /><CustomSelect value={model} onChange={changeModel} options={modelOptions} className="h-10 w-48" triggerClassName="h-full rounded-xl border bg-white px-3 text-sm dark:bg-white/5" /><button onClick={saveKey} disabled={!apiKey.trim()} className="rounded-xl bg-sky-600 px-4 text-sm font-bold text-white disabled:opacity-50"><KeyRound size={15} /></button></div> : <div className="mt-4 flex min-h-[460px] gap-4"><aside className="hidden w-52 shrink-0 flex-col border-r border-black/8 pr-4 dark:border-white/10 sm:flex"><button onClick={newChat} className="mb-3 rounded-xl border border-dashed border-sky-500/40 px-3 py-2 text-left text-sm text-sky-600">＋ 新建聊天</button>{history.map((chat) => <div key={chat.id} className={`mb-1 flex items-center rounded-lg ${chat.id === chatId ? "bg-sky-500/10 text-sky-600" : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"}`}><button onClick={() => openChat(chat)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-xs">{chat.title}</button><button onClick={() => deleteChat(chat.id)} className="px-2 text-xs hover:text-red-500" aria-label="删除聊天"><X size={13} /></button></div>)}</aside><div className="flex min-w-0 flex-1 flex-col"><div className="mb-3 flex justify-end"><CustomSelect value={model} onChange={changeModel} options={modelOptions} className="h-9 w-48" triggerClassName="h-full rounded-xl border bg-white px-3 text-sm outline-none dark:bg-white/5" /></div><Conversation className="min-h-0 flex-1 rounded-2xl border bg-black/[0.02] outline-none dark:border-white/10 dark:bg-white/[0.02]"><ConversationContent>{messages.length === 0 ? <ConversationEmptyState title="准备好分析你的经营数据" description="例如：最近哪个店铺利润最高？" /> : messages.map((message, index) => <Message key={index} from={message.role}><MessageContent>{message.reasoning && <details className="mb-2 rounded-lg border border-sky-500/20 p-2 text-xs"><summary className="cursor-pointer font-semibold text-sky-600">查看思考过程</summary><div className="mt-2 whitespace-pre-wrap text-muted-foreground">{message.reasoning}</div></details>}<MessageResponse>{message.content}</MessageResponse></MessageContent></Message>)}</ConversationContent></Conversation><div className="mt-3 flex gap-2"><input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} placeholder="输入你的问题，Enter 发送" className="h-11 flex-1 rounded-2xl border bg-white px-4 text-sm outline-none ring-0 focus:outline-none focus:ring-0 dark:bg-white/5" /><button onClick={ask} disabled={loading || !question.trim()} className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 text-sm font-bold text-white disabled:opacity-50">{loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}{loading ? "分析中…" : "提问"}</button></div></div></div>)}
  </section></>, document.body);
}
