import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "@/components/chat-panel";
import { MateriaalForm } from "@/components/materiaal-form";
import { Icon } from "@/components/icon";

export default async function KindVakDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: subject } = await supabase.from("subjects").select("*").eq("id", id).single();
  if (!subject) notFound();

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("subject_id", id)
    .eq("user_id", user!.id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Icon name={subject.icon} size={22} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{subject.name}</h1>
          <p className="text-sm text-slate-500">Chat met je persoonlijke vakdocent.</p>
        </div>
      </div>

      <ChatPanel subjectId={id} subjectName={subject.name} initialMessages={messages ?? []} />

      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-500">
          Heb je eigen aantekeningen of extra uitleg die kunnen helpen? Voeg ze toe.
        </p>
        <div>
          <MateriaalForm subjectId={id} />
        </div>
      </div>
    </div>
  );
}
