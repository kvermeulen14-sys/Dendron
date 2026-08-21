// Kennisbank voor Getal & Ruimte 2 havo/vwo, editie 13 (deel 1 en 2).
//
// Inhoudelijke basis: een methodegerichte reconstructie (geen letterlijke
// Noordhoff-transcriptie) opgebouwd uit de officiele inhoudsopgaven,
// JoJoschool-lessen, Wolfert College-leerdoelen en Wisconst-koppelingen.
//
// Let op: de aangeleverde kennisdatabase/locator-bestanden misten de
// paragrafen 1.6 en 2.6 (een gat tussen de losse bestanden onderling -
// het dekkingsrapport noemt ze wel, de JSONL-routeringsbestanden niet).
// Deze dataset gebruikt daarom het volledige bronbestand als leidend, zodat
// alle 41 paragrafen van deel 1 en 2 zijn opgenomen.
//
// `bewijsniveau`/`bladzijden`/`opdrachten`/`fotoAdvies` zijn uitsluitend
// bedoeld om de AI-vakdocent intern te laten inschatten hoe zeker hij mag
// klinken en wanneer hij om een foto moet vragen - nooit om aan de
// leerling voor te lezen (zie de instructie in de systeemprompt van de
// chat-route).

export interface ParagraafRecord {
  id: string; // bv "1.1"
  titel: string;
  hoofdstukNr: number;
  hoofdstukNaam: string;
  deel: 1 | 2;
  leerdoelen: string;
  begrippenRegels: string;
  stappen: string;
  fouten: string;
  voorkennis: string;
  tutorTip: string;
  bewijsniveau: string;
  opmerking?: string;
  fotoAdvies?: string;
  bladzijden: number[];
  bladzijdenBevestigd: boolean;
  opdrachten: string | null;
}

const HOOFDSTUKKEN: Record<number, { naam: string; deel: 1 | 2 }> = {
  1: { naam: "Rekenen met letters", deel: 1 },
  2: { naam: "Afstand en oppervlakte", deel: 1 },
  3: { naam: "Lineaire formules en vergelijkingen", deel: 1 },
  4: { naam: "Procenten en diagrammen", deel: 1 },
  5: { naam: "Kwadraten en wortels", deel: 2 },
  6: { naam: "De stelling van Pythagoras", deel: 2 },
  7: { naam: "Kwadratische vergelijkingen", deel: 2 },
  8: { naam: "Inhoud en vergroten", deel: 2 },
};

function p(
  id: string,
  titel: string,
  velden: Omit<ParagraafRecord, "id" | "titel" | "hoofdstukNr" | "hoofdstukNaam" | "deel">
): ParagraafRecord {
  const hoofdstukNr = Number(id.split(".")[0]);
  const { naam, deel } = HOOFDSTUKKEN[hoofdstukNr];
  return { id, titel, hoofdstukNr, hoofdstukNaam: naam, deel, ...velden };
}

export const GETAL_EN_RUIMTE_2HV13: ParagraafRecord[] = [
  // Hoofdstuk 1 - Rekenen met letters
  p("1.1", "Haakjes wegwerken", {
    leerdoelen:
      "Enkele en dubbele haakjes correct wegwerken; gelijksoortige termen herkennen en samenvoegen; rekenvolgorde en tekens bewaken.",
    begrippenRegels:
      "term, factor, coefficient, gelijksoortige termen, distributieve eigenschap; a(b+c)=ab+ac; (a+b)(c+d)=ac+ad+bc+bd; een losse min voor haakjes werkt als vermenigvuldigen met -1.",
    stappen:
      "(1) vermenigvuldig iedere term met iedere vereiste term; (2) schrijf producten overzichtelijk, letters bij voorkeur alfabetisch; (3) verzamel alleen exact gelijksoortige termen; (4) controleer mintekens.",
    fouten:
      "slechts de eerste term vermenigvuldigen; min niet over alle termen verdelen; a+b tot ab maken; niet-gelijksoortige termen samenvoegen.",
    voorkennis: "negatieve getallen, rekenvolgorde, eenvoudige letterproducten.",
    tutorTip: "laat bogen/pijlen tekenen; vraag vooraf welke termen gelijksoortig zijn.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    opmerking:
      "een gekoppelde les over 'rekenen met letters deel 2' behandelt ook merkwaardige producten - die drie formules zijn niet als kernstof van 1.1 bevestigd en worden hier niet als leerdoel aangeboden.",
    fotoAdvies: "regelblok p. 12-17, om vast te stellen of dubbele haakjes/bijzondere patronen precies zo benoemd worden.",
    bladzijden: [12, 13, 14, 15, 17],
    bladzijdenBevestigd: true,
    opdrachten: "O1-O14, A6-A19, E15-E21, L1-L3",
  }),
  p("1.2", "Breuken optellen", {
    leerdoelen: "Letterbreuken vereenvoudigen; gelijknamige en ongelijknamige letterbreuken optellen/aftrekken.",
    begrippenRegels:
      "alleen factoren mogen tegen elkaar worden weggedeeld; bij optellen/aftrekken eerst een gemeenschappelijke noemer maken; tellerbewerkingen tussen haakjes houden.",
    stappen:
      "(1) ontbind teller/noemer zo nodig in factoren; (2) vereenvoudig gemeenschappelijke factoren (noemer mag niet nul zijn); (3) bepaal kleinste bruikbare gemeenschappelijke noemer; (4) vermenigvuldig teller en noemer met dezelfde factor; (5) voeg tellers samen en vereenvoudig opnieuw.",
    fouten: "termen 'wegstrepen' in een som; alleen de noemer aanpassen; noemers optellen; domeinvoorwaarde vergeten.",
    voorkennis: "gewone breuken, factoren, haakjes (1.1).",
    tutorTip: "vraag steeds: 'Is dit een term of een factor?'",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel regelblok p. 18-21, voor exacte notatie van voorwaarden.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("1.3", "Breuken vermenigvuldigen en delen", {
    leerdoelen: "Letterbreuken vermenigvuldigen en delen; het omgekeerde gebruiken; zo efficient mogelijk vereenvoudigen.",
    begrippenRegels:
      "(a/b)*(c/d)=ac/bd; delen door c/d is vermenigvuldigen met d/c; noemers en de deler zijn niet nul.",
    stappen:
      "zet delen om in maal het omgekeerde -> factoriseer -> vereenvoudig kruisgewijs tussen factoren -> vermenigvuldig resterende factoren -> herleid.",
    fouten: "eerste breuk omkeren; delen over teller en noemer verkeerd uitvoeren; wegstrepen over plus/min; nulbeperkingen negeren.",
    voorkennis: "1.2 en gewone breuken.",
    tutorTip: "laat de leerling voor het vermenigvuldigen alle factoren markeren.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "niet noodzakelijk; optioneel p. 22-25 voor voorkeur tussenstappen.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("1.4", "Machten vermenigvuldigen, optellen en aftrekken", {
    leerdoelen: "Producten van machten herleiden en sommen/verschillen van gelijksoortige machtstermen vereenvoudigen.",
    begrippenRegels:
      "bij hetzelfde grondtal a^m*a^n=a^(m+n); bij optellen/aftrekken veranderen exponenten niet en mogen alleen gelijksoortige termen worden samengenomen, bv 3a^2+5a^2=8a^2 maar a^2+a^3 niet.",
    stappen: "bepaal eerst of de bewerking vermenigvuldigen of optellen is -> pas alleen de bijbehorende regel toe -> werk coefficienten apart uit.",
    fouten: "exponenten optellen bij een som; grondtallen/exponenten willekeurig combineren; a^2+a^2=a^4.",
    voorkennis: "betekenis grondtal/exponent, 1.1.",
    tutorTip: "laat bij twijfel een macht als herhaalde vermenigvuldiging uitschrijven.",
    bewijsniveau: "A voor de kernregels, B voor grensgevallen (exacte scheidslijn met 1.5 nog niet fotobevestigd)",
    opmerking: "deze stof wordt in een bron gecombineerd met 1.5 en met merkwaardige producten; houd de paragrafen methodisch gescheiden.",
    fotoAdvies: "theorieblokken p. 26-28, om de exacte scheidslijn tussen 1.4 en 1.5 te bevestigen.",
    bladzijden: [26, 27],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("1.5", "Machten herleiden", {
    leerdoelen: "Macht van een macht, macht van een product en quotient van machten herleiden.",
    begrippenRegels:
      "(a^m)^n=a^(mn); (ab)^n=a^n*b^n; a^m/a^n=a^(m-n) voor a =/= 0, binnen niet-negatieve exponenten; coefficienten apart behandelen.",
    stappen: "herken de buitenste bewerking -> pas een machtsregel toe -> combineer daarna overige producten/quotienten -> controleer door eventueel uit te schrijven.",
    fouten: "exponenten optellen bij macht-van-een-macht; (a+b)^n behandelen als a^n+b^n; exponentregel toepassen op verschillende grondtallen.",
    voorkennis: "1.4.",
    tutorTip: "benoem de structuur ('macht van product' versus 'product van machten') voor de regel.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    opmerking:
      "negatieve exponenten zijn alleen bevestigd voor het aparte 2-vwo-programma, niet voor dit gecombineerde havo/vwo-boek - bied dit niet als kernstof aan zonder foto/leraarinstructie.",
    fotoAdvies: "p. 29-33 (vooral laatste regelblok), om te checken of een negatieve exponent incidenteel voorkomt.",
    bladzijden: [29, 30, 31, 32],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("1.6", "De wetenschappelijke notatie", {
    leerdoelen: "Zeer grote en kleine getallen schrijven als a*10^n met 1<=|a|<10; notatie op de rekenmachine lezen/invoeren.",
    begrippenRegels: "plaats de komma achter het eerste niet-nulcijfer; links verplaatsen geeft een positieve exponent, rechts verplaatsen een negatieve.",
    stappen: "plaats komma achter eerste niet-nulcijfer -> tel verplaatsingen -> bepaal teken exponent -> controleer orde van grootte.",
    fouten: "voorgetal buiten [1,10); teken exponent verwisselen; E/EXP als gewone vermenigvuldiging typen; te vroeg afronden.",
    voorkennis: "machten van 10 en decimalen.",
    tutorTip: "laat terugrekenen naar gewone notatie als controle.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    opmerking: "negatieve exponenten horen hier functioneel bij kleine getallen, ook al zijn algemene algebraische regels met negatieve exponenten niet als kern van 1.5 bevestigd.",
    fotoAdvies: "optioneel p. 34-37 voor rekenmachinemodel en afrondafspraken.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),

  // Hoofdstuk 2 - Afstand en oppervlakte
  p("2.1", "Afstanden", {
    leerdoelen: "Punten construeren die een vaste afstand tot een punt of lijn hebben; binnen- en buitengebied interpreteren.",
    begrippenRegels:
      "afstand, cirkel, middelpunt, straal, loodrechte afstand, evenwijdige lijnen, binnengebied/buitengebied; punten op een cirkel liggen even ver van het middelpunt; punten op twee evenwijdige grenslijnen liggen op vaste afstand van een gegeven lijn.",
    stappen: "vertaal de voorwaarde (PA=r, PA<r, PA>r) naar rand/binnen/buiten -> construeer nauwkeurig -> arceer alleen het gevraagde gebied.",
    fouten: "schuin meten tot een lijn; cirkelschijf en cirkelrand verwarren; strikte en niet-strikte ongelijkheid verwarren.",
    voorkennis: "passer, geodriehoek, coordinaten.",
    tutorTip: "laat de voorwaarde eerst in woorden uitspreken.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 53-59 aanbevolen voor exacte conventies bij grenslijnen en arcering.",
    bladzijden: [53, 54, 55, 57, 58, 59],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("2.2", "Middelloodlijn en omgeschreven cirkel", {
    leerdoelen: "Middelloodlijn construeren; meetkundige plaats van punten even ver van twee punten gebruiken; omgeschreven cirkel tekenen.",
    begrippenRegels:
      "ieder punt op de middelloodlijn van AB heeft gelijke afstand tot A en B; het snijpunt van de middelloodlijnen is het middelpunt van de omgeschreven cirkel.",
    stappen: "maak vanuit A en B gelijke passerbogen groter dan de halve AB -> verbind de boogsnijpunten -> herhaal voor een tweede zijde -> trek de cirkel door de hoekpunten.",
    fouten: "lijn alleen door het midden tekenen zonder loodrecht; passerwijdte veranderen; bissectrices gebruiken voor de omgeschreven cirkel.",
    voorkennis: "2.1, loodrecht/midden.",
    tutorTip: "vraag waarom twee middelloodlijnen voldoende zijn en gebruik de derde als controle.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "niet noodzakelijk; optioneel p. 60-65 voor constructienotatie.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("2.3", "Bissectrice en ingeschreven cirkel", {
    leerdoelen: "Bissectrice construeren; punten op gelijke afstand van hoekbenen bepalen; ingeschreven cirkel tekenen.",
    begrippenRegels: "ieder punt op de bissectrice ligt even ver van beide benen; het snijpunt van de bissectrices is het middelpunt van de ingeschreven cirkel; de straal is de loodrechte afstand tot een zijde.",
    stappen: "boog vanuit hoekpunt snijdt de benen -> gelijke bogen vanuit de snijpunten -> verbind hoekpunt met boogsnijpunt -> herhaal in de driehoek -> loodlijn naar een zijde als straal.",
    fouten: "afstand naar een been niet loodrecht meten; middelloodlijnen gebruiken; de straal tot het hoekpunt nemen.",
    voorkennis: "2.1-2.2.",
    tutorTip: "vergelijk expliciet de omgeschreven met de ingeschreven cirkel.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel p. 66-70.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("2.4", "Zwaartelijn en hoogtelijn", {
    leerdoelen: "Zwaartelijnen/zwaartepunt en hoogtelijnen/hoogtepunt tekenen, ook bij stomphoekige driehoeken.",
    begrippenRegels: "zwaartelijn: van een hoekpunt naar het midden van de overstaande zijde. hoogtelijn: loodlijn vanuit een hoekpunt op (eventueel de verlengde) overstaande zijde.",
    stappen: "bepaal eerst het midden of de loodrechte richting -> teken vanuit het juiste hoekpunt -> herhaal en controleer het gemeenschappelijke snijpunt.",
    fouten: "zwaartelijn en middelloodlijn verwarren; de hoogte altijd binnen de driehoek zoeken; de zijde niet verlengen bij een stompe driehoek.",
    voorkennis: "midden, loodrecht, soorten driehoeken.",
    tutorTip: "laat per lijn benoemen: startpunt, doel en eigenschap.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 71-75 aanbevolen voor methodefiguren bij een stomphoekige driehoek.",
    bladzijden: [71, 72, 73, 74, 75],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("2.5", "De oppervlakte van een driehoek", {
    leerdoelen: "Oppervlakte berekenen met elke bruikbare basis en bijbehorende loodrechte hoogte, ook bij stomphoekige driehoeken.",
    begrippenRegels: "A = 1/2 * b * h.",
    stappen: "kies een basis -> bepaal de bijbehorende loodrechte hoogte (zijde zo nodig verlengen) -> maak eenheden gelijk -> vul de formule in -> noteer de kwadraateenheid.",
    fouten: "schuine zijde als hoogte; niet-bijbehorende hoogte; factor 1/2 vergeten; lineaire eenheid als antwoord geven.",
    voorkennis: "2.4, oppervlakte van een rechthoek.",
    tutorTip: "laat basis en hoogte met kleuren koppelen.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "niet noodzakelijk; optioneel p. 76-80 voor notatie.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("2.6", "De oppervlakte van een vierhoek", {
    leerdoelen: "Parallellogram en trapezium berekenen; een samengestelde vierhoek verdelen.",
    begrippenRegels: "parallellogram A = b*h; trapezium A = 1/2*(a+b)*h (a en b zijn de evenwijdige zijden).",
    stappen: "herken de figuur en de evenwijdige zijden -> kies de formule of verdeel in bekende figuren -> gebruik de loodrechte hoogte -> tel deeloppervlakten op -> noteer eenheden.",
    fouten: "schuine zijde als hoogte; willekeurige twee zijden in de trapeziumformule; deeloppervlakten dubbel tellen.",
    voorkennis: "2.5.",
    tutorTip: "laat eerst een verdelingsschets maken als de formuleherkenning onzeker is.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 81-87 aanbevolen om te bepalen welke samengestelde figuren de methode benadrukt.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),

  // Hoofdstuk 3 - Lineaire formules en vergelijkingen
  p("3.1", "Grafieken van lineaire formules", {
    leerdoelen: "Grafiek van een lineaire formule tekenen; met een berekening testen of een punt op de grafiek ligt.",
    begrippenRegels: "lineair verband, rechte lijn, y=ax+b, richtingscoefficient a, startwaarde/y-as-afsnede b.",
    stappen:
      "grafiek: kies minstens twee geschikte x-waarden (vaak x=0) -> bereken y -> zet de punten -> trek een rechte lijn. puntcontrole: vul de x-coordinaat in en vergelijk de uitkomst met de gegeven y.",
    fouten: "assen/schaal niet labelen; een kromme door de punten tekenen; x en y verwisselen; alleen visueel controleren.",
    voorkennis: "assenstelsel en substitueren.",
    tutorTip: "laat de betekenis van het teken van a voorspellen voor het tekenen.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel p. 107-110 voor tabel- en tekenconventies.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("3.2", "De formule van een lijn opstellen", {
    leerdoelen: "a en b uit een grafiek of twee punten bepalen; formule van een evenwijdige lijn opstellen.",
    begrippenRegels: "a = delta_y/delta_x; b is y bij x=0; evenwijdige lijnen hebben een gelijke richtingscoefficient.",
    stappen:
      "kies twee roosterpunten -> bereken de verticale/horizontale verandering met tekens -> bepaal a -> lees b af of vul een punt in -> controleer met het tweede punt. Voor een evenwijdige lijn: neem a over, vul het gegeven punt in om b te vinden.",
    fouten: "delta_x/delta_y verwisselen; onbetrouwbare afleespunten; het teken van een daling missen; gelijke b in plaats van gelijke a bij evenwijdigheid gebruiken.",
    voorkennis: "3.1, breuken.",
    tutorTip: "laat een hellingsdriehoek tekenen.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 111-119 aanbevolen voor het exacte werkschema en de terminologie.",
    bladzijden: [111, 112, 113, 114, 115, 116, 117, 118, 119],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("3.3", "De balansmethode", {
    leerdoelen: "Lineaire vergelijking oplossen door aan beide kanten dezelfde bewerking uit te voeren.",
    begrippenRegels: "vergelijking, linker-/rechterlid, oplossing, balans.",
    stappen:
      "vereenvoudig beide leden indien nodig -> verwijder de constante term aan de x-zijde -> verzamel de x-termen aan een kant -> deel door de coefficient -> controleer door in te vullen. Schrijf de bewerking aan beide kanten zichtbaar.",
    fouten: "teken verandert zonder geldige bewerking; bewerking slechts aan een kant; delen door een term in plaats van de coefficient; controle overslaan.",
    voorkennis: "negatieve getallen, gelijksoortige termen.",
    tutorTip: "gebruik de weegschaalmetafoor alleen totdat de formele symmetrische stappen begrepen zijn.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel p. 120-126.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("3.4", "Vergelijkingen oplossen", {
    leerdoelen: "Vergelijkingen met haakjes en breuken oplossen; een passend werkschema gebruiken.",
    begrippenRegels: "haakjes eerst wegwerken; breuken wegwerken door alle termen met een geschikte gemeenschappelijke noemer te vermenigvuldigen.",
    stappen: "(1) werk haakjes correct weg; (2) werk breuken zo nodig weg; (3) herleid beide leden; (4) pas de balansmethode toe; (5) controleer.",
    fouten: "noemer niet over alle termen verdelen; een min voor haakjes missen; te vroeg afronden; x in de noemer met een ongeldige 'overbrengtruc' behandelen.",
    voorkennis: "hoofdstuk 1 en 3.3.",
    tutorTip: "laat voor elke regel benoemen welk obstakel wordt verwijderd.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 127-133 aanbevolen voor het officiele werkschema en de moeilijkste toegestane vergelijkingstypen.",
    bladzijden: [127, 128, 129, 130, 131, 132, 133],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("3.5", "Paragraaf 3.5", {
    leerdoelen: "Vervolg op lineaire vergelijkingen (toepassen en combineren van de balansmethode); exacte invulling nog niet fotobevestigd.",
    begrippenRegels: "zie 3.3-3.4; geen aanvullende, exclusief aan 3.5 toe te schrijven regels bevestigd.",
    stappen: "gebruik dezelfde balansmethode-stappen als 3.3-3.4, toegepast op de context van deze paragraaf.",
    fouten: "zie 3.3-3.4.",
    voorkennis: "3.1-3.4.",
    tutorTip: "vraag bij twijfel over de precieze insteek van deze paragraaf om een foto van de paragraafkop en de eerste theoriealinea.",
    bewijsniveau: "C (structuur bevestigd, exacte inhoud van deze paragraaf niet fotobevestigd - wees extra terughoudend)",
    fotoAdvies: "sterk aanbevolen: theoriepagina van 3.5, om de exacte insteek vast te stellen.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),

  // Hoofdstuk 4 - Procenten en diagrammen
  p("4.1", "Rekenen met procentuele toe- en afname", {
    leerdoelen: "Nieuwe waarde na een procentuele stijging of daling berekenen.",
    begrippenRegels: "factor toename = 1+p/100; factor afname = 1-p/100; nieuw = oud * factor.",
    stappen: "bepaal oud/nieuw en de richting -> zet het percentage om in een factor -> vermenigvuldig -> controleer of de uitkomst groter/kleiner hoort te zijn.",
    fouten: "percentage als factor gebruiken (20 i.p.v. 1,20); een daling met 0,20 in plaats van 0,80 berekenen; de verkeerde basiswaarde gebruiken.",
    voorkennis: "procenten en decimalen.",
    tutorTip: "laat eerst voorspellen of het antwoord boven of onder de oude waarde ligt.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel p. 150-153.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("4.2", "Procentuele verandering", {
    leerdoelen: "Procentuele toe- of afname uit een oude en nieuwe waarde bepalen.",
    begrippenRegels: "verandering = nieuw-oud; percentage verandering = (nieuw-oud)/oud * 100%; factor = nieuw/oud.",
    stappen: "identificeer de oude waarde als noemer -> bereken het verschil of de factor -> zet om naar een percentage -> label stijging of daling.",
    fouten: "delen door de nieuwe waarde; absolute en relatieve verandering verwarren; een minteken zonder duiding laten staan.",
    voorkennis: "4.1.",
    tutorTip: "vraag expliciet 'waarvan is dit percentage?'",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 154-158 aanbevolen voor de voorkeursformule/het werkschema.",
    bladzijden: [155, 156],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("4.3", "Staaf-, lijn- en cirkeldiagram", {
    leerdoelen: "Staaf- en lijndiagram lezen; cirkeldiagram maken en interpreteren.",
    begrippenRegels: "categorie, frequentie, sector, absolute/relatieve frequentie; sectorhoek = deel/totaal * 360 graden (of percentage * 3,6 graden).",
    stappen: "controleer het totaal -> bereken relatieve aandelen/hoeken -> rond consistent af zodat het totaal 360 graden blijft -> teken met een gradenboog -> voeg legenda/titel toe.",
    fouten: "een lijndiagram gebruiken voor losse categorieen; een misleidende schaal niet zien; afgeronde sectoren die niet optellen tot 360 graden.",
    voorkennis: "verhoudingen/procenten, graden.",
    tutorTip: "laat de keuze van het diagramtype motiveren.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 159-167 aanbevolen voor het werkschema van het cirkeldiagram.",
    bladzijden: [159, 160, 164, 165],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("4.4", "Histogram", {
    leerdoelen: "Frequentietabel en histogram lezen/maken; histogram van staafdiagram onderscheiden.",
    begrippenRegels: "waarnemingsgetal, frequentie, klasse, klassengrens, absoluut/relatief; bij aaneengesloten klassen raken de staven elkaar.",
    stappen: "bepaal klassen en grenzen -> tel frequenties -> kies een schaal -> teken aaneengesloten staven -> label de assen.",
    fouten: "open ruimtes tussen histogramstaven; categorieen als klassen behandelen; klassengrenzen/eenheden negeren.",
    voorkennis: "tabellen en diagrammen.",
    tutorTip: "vraag wat een enkele staaf precies omvat.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    opmerking: "een eenvoudig voorbeeld met discrete aantallen kan didactisch makkelijker lijken dan de formele klassebenadering - houd bij twijfel de klassebenadering aan als kern.",
    fotoAdvies: "p. 168-171 sterk aanbevolen om de boekdefinitie en klassennotatie vast te leggen.",
    bladzijden: [168, 169, 170, 171],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("4.5", "Centrummaten", {
    leerdoelen: "Gemiddelde, mediaan en modus uit een lijst of frequentietabel berekenen.",
    begrippenRegels:
      "gemiddelde = som waarnemingen/aantal; bij een frequentietabel som(waarde*frequentie)/som(frequentie); mediaan is de middelste waarde na ordenen (bij een even aantal het gemiddelde van de twee middelste); modus is de meest voorkomende waarde.",
    stappen: "orden de gegevens of gebruik cumulatieve posities -> kies de gevraagde centrummaat -> reken -> rond pas aan het einde af.",
    fouten: "gemiddelde nemen zonder frequentieweging; mediaan van een ongesorteerde lijst nemen; de frequentie als modus geven in plaats van de waarde.",
    voorkennis: "4.4, breuken/decimalen.",
    tutorTip: "laat bij uitschieters vergelijken welke centrummaat representatief is.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel p. 172-181 voor eventuele Excel-stof (dit staat elders als onderzoek, niet als kern van 4.5).",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),

  // Hoofdstuk 5 - Kwadraten en wortels
  p("5.1", "Kwadratische formules", {
    leerdoelen:
      "Grafiek bij een kwadratische formule tekenen; herkennen dat x^2 een parabool veroorzaakt; controleren of een punt op de parabool ligt; uit het teken van de coefficient een dal- of bergparabool voorspellen.",
    begrippenRegels: "waarschijnlijk boekniveau: formules van het eenvoudige type y=a*x^2+b (de exacte vorm is niet met zekerheid vastgesteld - zie bewijsniveau).",
    stappen: "kies symmetrische x-waarden -> bereken eerst x^2, dan vermenigvuldigen/optellen -> plot de punten -> teken een vloeiende symmetrische parabool -> controleer top/as waar zichtbaar.",
    fouten: "-x^2 lezen als (-x)^2; punten met een rechte lijn verbinden; symmetrie missen; oplosmethoden uit hoofdstuk 7 gebruiken terwijl alleen grafiek/puntcontrole gevraagd is.",
    voorkennis: "kwadraten en de lineaire grafieken uit hoofdstuk 3.",
    tutorTip: "houd de uitleg bij tabel, rekenvolgorde, vorm en puntcontrole; introduceer geen nulproduct/product-som hier.",
    bewijsniveau: "C voor het exacte detail (formulevorm, terminologie top/symmetrieas) - kern van het onderwerp is wel A via meerdere bronnen bevestigd.",
    opmerking: "een gekoppelde les noemt hier ook 'kwadratische vergelijkingen oplossen', wat inhoudelijk vooral bij 7.3-7.4 hoort. Die oplosmethoden zijn hier bewust uitgesloten.",
    fotoAdvies: "p. 11-15 verplicht aanbevolen (prioriteit 1) - dit is de grootste resterende onzekerheid: vraag hier bij twijfel altijd om een foto van het theorieblok voordat je de exacte formulevorm of terminologie stellig gebruikt.",
    bladzijden: [11, 12, 13, 14, 15],
    bladzijdenBevestigd: true,
    opdrachten: "O1-O5, A6-A13, E9, L1",
  }),
  p("5.2", "Wortels en wortelformules", {
    leerdoelen: "Worteltrekken als omgekeerde van kwadrateren; rekenvolgorde met wortels; rekenmachine gebruiken; grafiek van een wortelformule tekenen en domein herkennen.",
    begrippenRegels: "sqrt(a) is de niet-negatieve hoofdwortel, gedefinieerd voor a>=0; (sqrt(a))^2=a; bij x^2=a horen voor a>0 twee oplossingen, maar sqrt(a) zelf is niet plus-min.",
    stappen: "bepaal voor welke x het getal onder de wortel niet-negatief is -> kies waarden die liefst mooie wortels geven -> bereken een tabel -> teken een vloeiende grafiek vanaf het randpunt.",
    fouten: "een wortel uit een negatief getal nemen; sqrt(9)=plusmin 3 denken; kwadraten/wortels te laat in de rekenvolgorde nemen; ongeldige x-waarden tekenen.",
    voorkennis: "kwadraten, rekenvolgorde, grafieken.",
    tutorTip: "onderscheid steeds 'waarde van een wortel' van 'oplossingen van een vergelijking'.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 16-23 aanbevolen voor de exacte familie wortelformules en de randpuntterminologie.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("5.3", "Wortels herleiden", {
    leerdoelen: "Kwadrateren met wortels; gelijksoortige wortels optellen/aftrekken; producten en quotienten van wortels; factoren voor het wortelteken brengen; wortel van een breuk herleiden.",
    begrippenRegels:
      "sqrt(a)*sqrt(b)=sqrt(ab); sqrt(a)/sqrt(b)=sqrt(a/b) met b>0; sqrt(k^2*a)=k*sqrt(a) voor k>=0; p*sqrt(a) plusmin q*sqrt(a) = (p plusmin q)*sqrt(a).",
    stappen: "factoriseer het getal onder de wortel -> zoek de grootste kwadraatfactor -> breng die wortel naar voren -> verzamel alleen gelijksoortige wortels -> controleer door kwadrateren/benaderen.",
    fouten: "sqrt(a+b)=sqrt(a)+sqrt(b) denken; ongelijksoortige wortels optellen; een factor zonder kwadrateren buiten de wortel zetten; te vroeg decimaal rekenen.",
    voorkennis: "1.4-1.5 en 5.2.",
    tutorTip: "houd de exacte wortelvorm zo lang mogelijk aan; laat de kwadraatfactor expliciet aanwijzen.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 24-33 sterk aanbevolen voor de exacte volgorde en toegestane wortelregels.",
    bladzijden: [25, 27, 28, 29, 30, 31, 32, 33],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("5.4", "Soorten getallen", {
    leerdoelen: "Natuurlijke, gehele, rationale en irrationale getallen herkennen/ordenen; repeterende decimalen met streepnotatie schrijven.",
    begrippenRegels:
      "N natuurlijke getallen, Z gehele getallen, Q rationale getallen, irrationale en reele getallen; eindige en repeterende decimalen zijn rationaal; N subset Z subset Q subset R; irrationale reele getallen zijn niet als breuk van gehele getallen te schrijven, bv sqrt(2) en pi.",
    stappen: "vereenvoudig het getal -> bepaal de kleinste passende verzameling -> controleer het decimaalgedrag -> plaats/orden eventueel op een getallenlijn.",
    fouten: "elke wortel irrationaal noemen (sqrt(9)=3 is rationaal); een repeterend decimaal irrationaal noemen; 0 zonder duidelijke afspraak indelen.",
    voorkennis: "geen specifieke, dit is een introducerende paragraaf.",
    tutorTip: "vraag om de kleinste verzameling en laat inclusies benoemen.",
    bewijsniveau: "A voor de hoofdcategorieen, B voor de exacte notatiegrenzen (hoort 0 bij N, welke symbolen/streepnotatie precies).",
    fotoAdvies: "p. 34-37 verplicht aanbevolen (prioriteit 2) - vraag bij twijfel om een foto voordat je stellig zegt of 0 wel/niet bij N hoort of welke streepnotatie gebruikt wordt.",
    bladzijden: [34, 35, 36, 37],
    bladzijdenBevestigd: true,
    opdrachten: "O72-O81, A77-A82, E78-E84, L10",
  }),
  p("5.5", "Paragraaf 5.5", {
    leerdoelen: "Vervolg/verdieping op getalsoorten en wortels (exacte invulling nog niet fotobevestigd).",
    begrippenRegels: "zie 5.2-5.4; geen aanvullende, exclusief aan 5.5 toe te schrijven regels bevestigd.",
    stappen: "gebruik de wortelregels (5.2-5.3) en de classificatie van getalsoorten (5.4), toegepast op de context van deze paragraaf.",
    fouten: "zie 5.2-5.4.",
    voorkennis: "5.1-5.4.",
    tutorTip: "vraag bij twijfel over de precieze insteek van deze paragraaf om een foto van de paragraafkop en de eerste theoriealinea.",
    bewijsniveau: "C (structuur bevestigd, exacte inhoud van deze paragraaf niet fotobevestigd - wees extra terughoudend)",
    fotoAdvies: "sterk aanbevolen: theoriepagina van 5.5, om de exacte insteek vast te stellen.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),

  // Hoofdstuk 6 - De stelling van Pythagoras
  p("6.1", "Rechthoekige driehoeken", {
    leerdoelen: "Rechthoekszijden en schuine zijde/hypotenusa herkennen; de stelling bij een gelabelde driehoek correct opschrijven.",
    begrippenRegels: "kwadraat schuine zijde = som van de kwadraten van de rechthoekszijden; de letters hangen af van de figuur, dus niet blind a^2+b^2=c^2 zonder eerst de schuine zijde te bepalen.",
    stappen: "markeer de 90 graden hoek -> wijs de overstaande/langste zijde aan -> schrijf de vergelijking met lijnstuknamen -> controleer via de oppervlakten van de vierkanten.",
    fouten: "de langste getekende zijde kiezen zonder de hoek te checken; zijdeletters verkeerd toewijzen; de stelling bij een niet-rechthoekige driehoek toepassen.",
    voorkennis: "kwadraten/wortels.",
    tutorTip: "laat altijd eerst de schuine zijde hardop benoemen.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel p. 53-55.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("6.2", "Schuine zijden berekenen", {
    leerdoelen: "Schuine zijde uit twee rechthoekszijden berekenen, ook praktisch en in een assenstelsel.",
    begrippenRegels: "schuin^2 = rechthoek1^2 + rechthoek2^2.",
    stappen: "schets/markeer de rechte hoek -> schrijf de formule met lijnstuknamen -> vul in -> tel de kwadraten op -> trek de wortel -> rond pas aan het eind af en noteer de eenheid.",
    fouten: "kwadrateren na het optellen; een min gebruiken; tussentijds afronden; een antwoord zonder lengte-eenheid geven.",
    voorkennis: "5.2 en 6.1.",
    tutorTip: "controleer of de schuine zijde langer is dan elke rechthoekszijde.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "niet noodzakelijk; optioneel p. 56-61 voor afrondafspraken.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("6.3", "Rechthoekszijden berekenen", {
    leerdoelen: "Ontbrekende rechthoekszijde berekenen uit de schuine zijde en de andere rechthoekszijde.",
    begrippenRegels: "rechthoek^2 = schuin^2 - andere_rechthoek^2.",
    stappen: "identificeer de schuine zijde -> schrijf de formule met lijnstuknamen -> isoleer het onbekende kwadraat door aftrekken -> trek de wortel -> controleer de grootte.",
    fouten: "twee kwadraten optellen in plaats van aftrekken; de verkeerde zijde als schuine zijde nemen; de wortel voor het aftrekken trekken; een negatieve uitkomst niet als foutsignaal zien.",
    voorkennis: "6.1-6.2, balansmethode.",
    tutorTip: "laat eerst voorspellen dat de rechthoekszijde korter is dan de schuine zijde.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel p. 62-66.",
    bladzijden: [],
    bladzijdenBevestigd: false,
    opdrachten: null,
  }),
  p("6.4", "De stelling van Pythagoras toepassen", {
    leerdoelen: "Afstand tussen twee punten; onderzoeken of een driehoek rechthoekig is; hulplijnen kiezen in praktische figuren.",
    begrippenRegels: "omgekeerde toets: neem de langste zijde c; alleen als a^2+b^2=c^2 is de driehoek rechthoekig.",
    stappen: "maak een schets -> zoek/teken een rechthoekige driehoek -> schrijf de lengtes op -> kies som, verschil of de omgekeerde toets -> reken -> interpreteer en rond af.",
    fouten: "alleen 'ongeveer gelijk' concluderen na vroeg afronden; niet de langste zijde als c nemen; een verborgen rechthoekige driehoek niet tekenen.",
    voorkennis: "6.1-6.3, coordinaten.",
    tutorTip: "vraag welke drie punten/segmenten de gebruikte driehoek vormen.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 67-71 aanbevolen voor de precieze mix van toepassingen.",
    bladzijden: [67, 68, 69, 71],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),
  p("6.5", "Pythagoras in de ruimte", {
    leerdoelen: "Diagonaalvlak en lichaamsdiagonaal herkennen; een lijnstuk in een balk/ruimtefiguur berekenen via een of twee rechthoekige driehoeken.",
    begrippenRegels:
      "vlakdiagonaal, diagonaalvlak, lichaamsdiagonaal; voor een balk kan uiteindelijk d=sqrt(l^2+b^2+h^2), maar methodegetrouw liever in twee Pythagoras-stappen zolang dat de boekopbouw volgt.",
    stappen: "teken/markeer een geschikt vlak -> bereken eerst de vlakdiagonaal -> gebruik die met de derde afmeting in een tweede rechthoekige driehoek -> noteer eenheid/afronding.",
    fouten: "lijnstukken gebruiken die niet samen in een rechthoekige driehoek liggen; een perspectieftekening als maatgetrouw zien; een tussenresultaat te vroeg afronden.",
    voorkennis: "6.2-6.4 en ruimtefiguren.",
    tutorTip: "laat elk lijnstuk aan een concreet vlak koppelen.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 72-79 aanbevolen voor hoekpuntconventies en de toegestane directe formule.",
    bladzijden: [72, 73, 74, 77, 78],
    bladzijdenBevestigd: true,
    opdrachten: null,
  }),

  // Hoofdstuk 7 - Kwadratische vergelijkingen
  p("7.1", "Buiten haakjes brengen", {
    leerdoelen: "Delers/veelvouden/priemfactoren gebruiken; de grootste gemeenschappelijke factor uit een algebraische som halen.",
    begrippenRegels: "ab+ac=a(b+c); haal een factor uit alle termen en controleer door terug uit te werken.",
    stappen: "ontbind de coefficienten in factoren -> bepaal de gemeenschappelijke letterfactor met de laagste exponent -> zet die buiten haakjes -> deel elke term door de factor voor de inhoud van de haakjes -> controleer.",
    fouten: "de factor niet uit alle termen halen; een te kleine factor kiezen terwijl 'zoveel mogelijk' gevraagd is; een tekenfout bij een negatieve factor.",
    voorkennis: "hoofdstuk 1, delers/priemgetallen.",
    tutorTip: "laat een factorentabel maken.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 95-100 aanbevolen voor de nadruk op priemfactoren en negatieve factoren.",
    bladzijden: [95, 97, 98, 99, 100],
    bladzijdenBevestigd: true,
    opdrachten: "O1-O18, A11-A19, L2-L4",
  }),
  p("7.2", "De product-som-methode", {
    leerdoelen: "x^2+sx+p ontbinden als (x+m)(x+n) met m+n=s en m*n=p.",
    begrippenRegels:
      "noteer het somgetal en productgetal inclusief tekens; tekenstrategie: product positief -> gelijke tekens; product negatief -> verschillende tekens; de som bepaalt welke groter is/wat het teken wordt.",
    stappen: "noteer somgetal en productgetal -> zoek een factorpaar van p -> controleer de som -> schrijf de factoren -> werk terug uit om te controleren.",
    fouten: "som en product verwisselen; het teken van het product negeren; de methode toepassen op een vorm met een voorcoefficient ongelijk aan 1 zonder bevestigde uitbreiding.",
    voorkennis: "dubbele haakjes (1.1), factoren (7.1).",
    tutorTip: "laat altijd terugvermenigvuldigen ter controle.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 101-105 aanbevolen om exact te bepalen of alleen monische drietermen (x^2+...) voorkomen.",
    bladzijden: [101, 102, 103, 104],
    bladzijdenBevestigd: true,
    opdrachten: "O20-O31, A27-A36, E34-E37, L5-L6",
  }),
  p("7.3", "Kwadratische vergelijkingen", {
    leerdoelen: "Vergelijkingen van de vormen x^2=c, ax^2+bx=0 en ontbindbare x^2+sx+p=0 oplossen.",
    begrippenRegels:
      "nulproduct: als A*B=0, dan A=0 of B=0; bij x^2=c: voor c>0 twee oplossingen plusmin sqrt(c), bij c=0 een oplossing, bij c<0 geen reele oplossing.",
    stappen: "breng de vergelijking naar '...=0' als factoriseren nodig is -> kies factor-buiten-haakjes of product-som -> gebruik het nulproduct -> los de lineaire factoren op -> controleer.",
    fouten: "een oplossing vergeten; het nulproduct toepassen als het rechterlid niet nul is; delen door x waardoor de oplossing x=0 verloren gaat; sqrt(c) en plusmin sqrt(c) verwarren.",
    voorkennis: "5.2, 7.1-7.2, 3.3.",
    tutorTip: "verbied 'delen door x' voordat x=0 apart is onderzocht.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 106-111 aanbevolen voor de exacte drie typen.",
    bladzijden: [106, 107, 108, 109, 110],
    bladzijdenBevestigd: true,
    opdrachten: "O38-O59, A55-A62, E50-E62, L7-L9",
  }),
  p("7.4", "Oplosmethoden", {
    leerdoelen: "Passende methode kiezen; snijpunten van een parabool en een lijn algebraisch bepalen.",
    begrippenRegels:
      "beslisroute: vereenvoudig en zet de leden passend -> x^2=c: wortelmethode; gemeenschappelijke x/factor: buiten haakjes + nulproduct; monische drieterm: product-som + nulproduct; grafieksnijpunt: stel de y-formules gelijk, los de vergelijking op, bereken daarna y.",
    stappen: "herken de vorm -> kies de bijbehorende methode uit de beslisroute -> los op -> controleer -> geef bij een snijpuntvraag zowel x als y.",
    fouten: "product-som forceren voordat alles naar nul is gebracht; alleen x-coordinaten geven bij een gevraagd snijpunt; de abc-formule invoeren zonder dat die in het boek staat; de oplossingsmethode niet controleren.",
    voorkennis: "heel hoofdstuk 7 plus hoofdstuk 3 en 5.",
    tutorTip: "vraag eerst 'welke vorm zie je?' en laat de keuze motiveren.",
    bewijsniveau: "A voor het leerdoel, C voor de exacte beslisboom/formulering.",
    opmerking: "de abc-formule, hogere functienotatie en formele domeintheorie zijn niet als kernstof van dit hoofdstuk bevestigd - gebruik ze niet, tenzij de leerling een foto laat zien waaruit blijkt dat het boek dit hier wel behandelt.",
    fotoAdvies: "p. 112-117 verplicht aanbevolen (prioriteit 3), met name het methode-overzicht en een snijpuntvoorbeeld.",
    bladzijden: [112, 113, 114, 115, 116, 117],
    bladzijdenBevestigd: true,
    opdrachten: "O63-O80, A66-A80, E70-E81, L10-L13",
  }),

  // Hoofdstuk 8 - Inhoud en vergroten
  p("8.1", "Inhoud prisma en cilinder", {
    leerdoelen: "Grondvlak/hoogte herkennen; inhoud van prisma en cilinder berekenen, ook samengesteld.",
    begrippenRegels: "V_prisma = A_grondvlak * h; V_cilinder = pi * r^2 * h.",
    stappen: "kies twee congruente evenwijdige vlakken als grond-/bovenvlak -> bereken het grondvlak -> bepaal de loodrechte hoogte tussen de vlakken -> vermenigvuldig -> gebruik een kubieke eenheid.",
    fouten: "oppervlakte en inhoud verwarren; een schuine ribbe als hoogte nemen; diameter als straal gebruiken; pi te vroeg afronden.",
    voorkennis: "oppervlaktes en de cirkel.",
    tutorTip: "laat het grondvlak inkleuren en de formule in twee regels opschrijven.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 134-139 aanbevolen voor welke prismatypen en samengestelde lichamen voorkomen.",
    bladzijden: [134, 135, 138],
    bladzijdenBevestigd: true,
    opdrachten: "O1-O12, A12-A15, R2",
  }),
  p("8.2", "Inhoud piramide en kegel", {
    leerdoelen: "Grondvlak/loodrechte hoogte herkennen; inhoud van piramide/kegel berekenen.",
    begrippenRegels: "V_piramide = 1/3 * A_grondvlak * h; V_kegel = 1/3 * pi * r^2 * h.",
    stappen: "identificeer het grondvlak -> bereken de oppervlakte -> vind de loodrechte hoogte tot de top (niet de schuine ribbe) -> vermenigvuldig met 1/3 -> gebruik eenheid/afronding.",
    fouten: "de factor 1/3 vergeten; de schuine hoogte gebruiken; diameter/straal verwarren; de kubieke eenheid weglaten.",
    voorkennis: "8.1, oppervlaktes.",
    tutorTip: "vergelijk met een prisma/cilinder met hetzelfde grondvlak en dezelfde hoogte.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 140-145 aanbevolen voor niet-rechte figuren en terminologie.",
    bladzijden: [140, 141, 143],
    bladzijdenBevestigd: true,
    opdrachten: "O16-O24",
  }),
  p("8.3", "Vergroten en verkleinen", {
    leerdoelen: "Vergrotingsfactor uit overeenkomstige lengtes berekenen en gebruiken.",
    begrippenRegels: "k = lengte_beeld/lengte_origineel; beeldlengte = k * origineel; bij 0<k<1 is sprake van verkleinen.",
    stappen: "koppel overeenkomstige maten -> schrijf beeld/origineel in vaste volgorde -> bereken k -> pas dezelfde k op alle lengtes toe -> controleer de proporties.",
    fouten: "de verhouding omdraaien; niet-overeenkomstige lengtes vergelijken; k voortijdig afronden; denken dat k altijd groter dan 1 moet zijn.",
    voorkennis: "verhoudingen en schaal.",
    tutorTip: "laat origineel en beeld consequent labelen.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel p. 146-151.",
    bladzijden: [146, 147, 148, 149],
    bladzijdenBevestigd: true,
    opdrachten: "O31-O35, R34",
  }),
  p("8.4", "Oppervlakte bij vergroten", {
    leerdoelen: "Oppervlaktefactor k^2 gebruiken; de lineaire factor uit twee oppervlakten terugvinden.",
    begrippenRegels: "A_beeld = k^2 * A_origineel; k = sqrt(A_beeld/A_origineel).",
    stappen: "bepaal of de gegeven factor lineair of oppervlakkig is -> kwadrateer of trek de wortel -> pas toe op de oppervlakte -> controleer de richting.",
    fouten: "oppervlakte met k in plaats van k^2 berekenen; k^2 met 2k verwarren; de verhouding omdraaien; eenheden niet kwadratisch omrekenen.",
    voorkennis: "8.3, wortels.",
    tutorTip: "gebruik eerst een rechthoek/raster om het kwadraat intuitief te maken.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "optioneel p. 152-158.",
    bladzijden: [152, 153, 156],
    bladzijdenBevestigd: true,
    opdrachten: "O42-O50",
  }),
  p("8.5", "Inhoud bij vergroten", {
    leerdoelen: "Inhoudsfactor k^3 gebruiken; de lineaire factor uit twee inhouden terugvinden.",
    begrippenRegels: "V_beeld = k^3 * V_origineel; k = derdemachtswortel(V_beeld/V_origineel).",
    stappen: "bepaal de richting beeld/origineel -> bereken de inhoudsverhouding -> gebruik de derde macht of derdemachtswortel -> reken eenheden consistent om -> interpreteer.",
    fouten: "k^2 gebruiken in plaats van k^3; 3k in plaats van k^3 nemen; een gewone wortel nemen; liters en kubieke centimeters fout omrekenen (1 L = 1000 cm^3, 1 mL = 1 cm^3).",
    voorkennis: "8.3-8.4, machten.",
    tutorTip: "laat lengte, breedte en hoogte elk een factor k leveren.",
    bewijsniveau: "A (structuur en kerninhoud breed bevestigd)",
    fotoAdvies: "p. 159-165 aanbevolen voor de gebruikte notatie van de derdemachtswortel en de toegestane rekenmachine-aanpak.",
    bladzijden: [159, 160, 163, 164],
    bladzijdenBevestigd: true,
    opdrachten: "O57-O68, A69-A70, L8",
  }),
];

function bladzijdenTekst(paragraaf: ParagraafRecord) {
  if (paragraaf.bladzijden.length === 0) {
    return "geen bladzijden fotobevestigd - vraag bij een concrete boekopgave altijd om een foto in plaats van te gokken.";
  }
  const status = paragraaf.bladzijdenBevestigd ? "fotobevestigd" : "niet fotobevestigd";
  return `deel ${paragraaf.deel}, blz. ${paragraaf.bladzijden.join(", ")} (${status})`;
}

/** Zet een paragraafrecord om naar de tekst voor het `content`-veld van een material. */
export function bouwMateriaalContent(paragraaf: ParagraafRecord): string {
  const regels = [
    `Leerdoelen: ${paragraaf.leerdoelen}`,
    `Begrippen/regels: ${paragraaf.begrippenRegels}`,
    `Stappen: ${paragraaf.stappen}`,
    `Veelgemaakte fouten: ${paragraaf.fouten}`,
    `Voorkennis: ${paragraaf.voorkennis}`,
    `Tutor-tip: ${paragraaf.tutorTip}`,
  ];
  if (paragraaf.opmerking) regels.push(`Opmerking: ${paragraaf.opmerking}`);

  const intern = [
    "",
    "[INTERN - dit stuk is alleen voor jou als AI-vakdocent, nooit letterlijk of samengevat aan de leerling voorlezen]",
    `Bewijsniveau: ${paragraaf.bewijsniveau}. Dit bronbestand is een inhoudelijke reconstructie, geen letterlijke tekst uit het boek.`,
    `Bladzijden: ${bladzijdenTekst(paragraaf)}`,
  ];
  if (paragraaf.fotoAdvies) intern.push(`Foto-advies: ${paragraaf.fotoAdvies}`);
  intern.push(
    "Verzin nooit de exacte tekst van een boekopgave. Vraag bij een concrete opgave altijd om een foto of volledige overgetypte opgave."
  );

  return [...regels, ...intern].join("\n");
}

export function materiaalTitel(paragraaf: ParagraafRecord) {
  return `${paragraaf.id} - ${paragraaf.titel}`;
}

export function hoofdstukLabel(paragraaf: ParagraafRecord) {
  return `Hoofdstuk ${paragraaf.hoofdstukNr} (deel ${paragraaf.deel}) - ${paragraaf.hoofdstukNaam}`;
}
