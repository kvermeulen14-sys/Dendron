/** Geeft de maandag van de week van `datum` (standaard vandaag) als lokale ISO-datum (YYYY-MM-DD). */
export function huidigeWeekMaandag(datum: Date = new Date()): string {
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  const dag = d.getDay(); // 0 = zondag
  const verschil = dag === 0 ? -6 : 1 - dag;
  d.setDate(d.getDate() + verschil);
  const jaar = d.getFullYear();
  const maand = String(d.getMonth() + 1).padStart(2, "0");
  const dagVanMaand = String(d.getDate()).padStart(2, "0");
  return `${jaar}-${maand}-${dagVanMaand}`;
}
