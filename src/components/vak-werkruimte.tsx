"use client";

import { useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { ChatPanel } from "@/components/chat-panel";
import { OverhoorPanel } from "@/components/overhoor-panel";
import type { ChatMessage } from "@/lib/types";

export function VakWerkruimte({
  subjectId,
  subjectName,
  initialMessages,
}: {
  subjectId: string;
  subjectName: string;
  initialMessages: ChatMessage[];
}) {
  const [modus, setModus] = useState<"chat" | "overhoren">("chat");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          onClick={() => setModus("chat")}
          className={clsx(
            "flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
            modus === "chat" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          <Icon name="chat" size={16} />
          Chat
        </button>
        <button
          onClick={() => setModus("overhoren")}
          className={clsx(
            "flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
            modus === "overhoren" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          <Icon name="target" size={16} />
          Overhoren
        </button>
      </div>

      {modus === "chat" ? (
        <ChatPanel subjectId={subjectId} subjectName={subjectName} initialMessages={initialMessages} />
      ) : (
        <OverhoorPanel subjectId={subjectId} subjectName={subjectName} />
      )}
    </div>
  );
}
