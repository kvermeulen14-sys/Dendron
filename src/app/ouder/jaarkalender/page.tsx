import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { JAAR_EVENT_META } from "@/lib/jaarkalender";
import { VerwijderJaarEventKnop } from "@/components/verwijder-jaar-event-knop";
import type { JaarEvent } from "@/lib/types";
import { JaarOverzicht } from "@/components/jaar-overzicht";
import { JaarEventForm } from "./jaar-event-form";
import { JaarkalenderAIImport } from "./jaarkalender-ai-import";

export default async function JaarkalenderPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const { data: events } = await supabase
    .from("jaar_events")
    .select("*")
    .eq("family_id", profile!.family_id)
    .order("start_datum", { ascending: true });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Jaarkalender</h1>
          <p className="mt-1 text-sm text-slate-500">
            Vakanties, toetsweken en andere belangrijke periodes - het hele jaar in 1 keer.
          </p>
        </div>
        <div className="flex gap-2">
          <JaarkalenderAIImport />
          <JaarEventForm />
        </div>
      </div>

      <JaarOverzicht events={(events ?? []) as JaarEvent[]} />

      {events && events.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Alles beheren</h2>
          <div className="flex flex-col gap-2">
            {(events as JaarEvent[]).map((e) => (
              <Card key={e.id} className="flex items-center gap-3 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JAAR_EVENT_META[e.type].dotClass}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{e.titel}</p>
                  <p className="text-xs text-slate-500">
                    {JAAR_EVENT_META[e.type].label} -{" "}
                    {new Date(e.start_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                    {e.eind_datum !== e.start_datum &&
                      ` t/m ${new Date(e.eind_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`}
                  </p>
                </div>
                <VerwijderJaarEventKnop id={e.id} />
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
