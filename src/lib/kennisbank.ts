// Gedeelde helpers om lesstof te bouwen voor de AI-routes (vakdocent-chat,
// overhoren) uit de kennisbank (kennis_onderdelen/-paragraaf_context/
// -woordenlijsten) - de enige bron van waarheid voor lesstof sinds de
// "1 methode"-consolidatie (materials-tabel is verwijderd).

export interface KennisOnderdeelRij {
  paragraaf_id: string;
  naam: string;
  regel: string;
  voorbeelden: string[];
  gecombineerd_voorbeeld: string | null;
  tip: string | null;
  uitzondering: string | null;
  fout_voorbeeld: string | null;
}

export interface KennisParagraafContextRij {
  paragraaf_id: string;
  titel: string;
  leerdoelen?: string | null;
  voorkennis?: string | null;
  kernbegrippen?: string | null;
}

export interface KennisWoordenlijstRij {
  paragraaf_id: string;
  titel: string;
  categorie?: "woordenschat" | "zinnen";
  woorden: { bron: string; doel: string; voorbeeldzin: string | null }[];
}

/** Bouwt leesbare lesstof-tekst uit de gepubliceerde kennisonderdelen + paragraafcontext (+ evt. woordenlijsten voor taalvakken). */
export function bouwKennisbankUitOnderdelen(
  onderdelen: KennisOnderdeelRij[],
  contexten: KennisParagraafContextRij[],
  woordenlijsten: KennisWoordenlijstRij[] = []
): string {
  const paragraafIds = Array.from(
    new Set([...onderdelen.map((o) => o.paragraaf_id), ...contexten.map((c) => c.paragraaf_id), ...woordenlijsten.map((w) => w.paragraaf_id)])
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return paragraafIds
    .map((pid) => {
      const context = contexten.find((c) => c.paragraaf_id === pid);
      const onderdelenVanParagraaf = onderdelen.filter((o) => o.paragraaf_id === pid);
      const woordenlijstenVanParagraaf = woordenlijsten.filter((w) => w.paragraaf_id === pid);
      const titel = context?.titel ?? onderdelenVanParagraaf[0]?.naam ?? woordenlijstenVanParagraaf[0]?.titel ?? pid;

      const regels = [`## ${pid} - ${titel}`];
      if (context?.leerdoelen) regels.push(`Leerdoelen: ${context.leerdoelen}`);
      if (context?.voorkennis) regels.push(`Voorkennis: ${context.voorkennis}`);
      if (context?.kernbegrippen) regels.push(`Kernbegrippen: ${context.kernbegrippen}`);

      for (const o of onderdelenVanParagraaf) {
        regels.push(`\n### ${o.naam}`);
        regels.push(o.regel);
        regels.push(`Voorbeelden: ${o.voorbeelden.join("; ")}`);
        if (o.gecombineerd_voorbeeld) regels.push(`Gecombineerd voorbeeld: ${o.gecombineerd_voorbeeld}`);
        if (o.tip) regels.push(`Tip: ${o.tip}`);
        if (o.uitzondering) regels.push(`Let op: ${o.uitzondering}`);
        if (o.fout_voorbeeld) regels.push(`Veelgemaakte fout: ${o.fout_voorbeeld}`);
      }

      // Woordenlijsten letterlijk als tabel meegeven - niet parafraseren, dit
      // zijn de exact overgenomen officiële woordparen/zinnen uit de bron.
      // Categorie in de kop, zodat de tutor woordenschat (losse termen,
      // stampwerk) en zinnen/uitdrukkingen (letterlijk complete zinnen leren)
      // niet door elkaar behandelt.
      for (const w of woordenlijstenVanParagraaf) {
        const soort = w.categorie === "zinnen" ? "Zinnen & uitdrukkingen" : "Woordenschat";
        regels.push(`\n### ${soort}: ${w.titel}`);
        regels.push("| Bron | Doel | Voorbeeldzin |");
        regels.push("| --- | --- | --- |");
        for (const woord of w.woorden) {
          regels.push(`| ${woord.bron} | ${woord.doel} | ${woord.voorbeeldzin ?? ""} |`);
        }
      }
      return regels.join("\n");
    })
    .join("\n\n");
}
