import React, { useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Sparkles, Send, Bot, Cpu, Zap, Settings } from "lucide-react";

export default function AiAssistancePage() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hello! I am your Zoiko AI Assistant. How can I help you manage your business operations today?" }
  ]);
  const [input, setInput] = useState("");

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: "user", text: input };
    const botResponse = { 
      role: "assistant", 
      text: `Sure, I can help you with that! (Simulated response to: "${input}"). I can pull up HR profiles, generate billing invoices, and summarize security audit trails.` 
    };

    setMessages((prev) => [...prev, userMessage, botResponse]);
    setInput("");
  };

  const systems = [
    { name: "Core LLM Model", val: "Zoiko-Gen-3.5" },
    { name: "Active Token Usage", val: "14,248 tokens" },
    { name: "Default Temperature", val: "0.2 (focused)" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="AI Assistance" 
        description="Interact with Zoiko GenAI modules to automate report compilation, profile queries, and business summaries."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chat box */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col h-[520px] justify-between">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Bot className="h-5 w-5 text-[#FF7A00]" /> Copilot Assistant
            </h3>
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full font-bold">Online</span>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 text-sm scrollbar-thin">
            {messages.map((m, idx) => (
              <div 
                key={idx} 
                className={`flex gap-3 max-w-[85%] ${m.role === "user" ? "ml-auto flex-row-reverse" : ""}`}
              >
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
                  m.role === "user" ? "bg-[#FF7A00] text-white" : "bg-slate-100 text-[#FF7A00]"
                }`}>
                  {m.role === "user" ? "U" : <Sparkles className="h-4.5 w-4.5" />}
                </div>
                <div className={`p-3.5 rounded-2xl ${
                  m.role === "user" ? "bg-[#FF7A00] text-white rounded-tr-none" : "bg-slate-50 border border-slate-100 text-slate-800 rounded-tl-none"
                }`}>
                  <p className="leading-relaxed">{m.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSend} className="relative">
            <input 
              type="text" 
              placeholder="Ask anything (e.g. 'Summarize leave request approvals')..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-3.5 pl-5 pr-14 text-sm text-slate-800 placeholder-slate-450 outline-none focus:bg-white focus:border-[#FF7A00]"
            />
            <button 
              type="submit" 
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white shadow-sm transition"
              aria-label="Send query"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* AI Config info */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between h-[520px]">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Settings className="h-5 w-5 text-[#FF7A00]" /> Model Configuration
            </h3>
            <div className="space-y-4">
              {systems.map((s, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{s.name}</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{s.val}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#FF7A00]/5 border border-[#FF7A00]/10 flex gap-2.5 items-start">
            <Zap className="h-5 w-5 text-[#FF7A00] flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-600 leading-relaxed">
              AI assistant uses Retrieval-Augmented Generation (RAG) to query authorized data subsets from the Zoiko Hub.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
