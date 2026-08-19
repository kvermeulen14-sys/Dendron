# Dendron - samen plannen en leren

Een kleine webapp voor een gezin: een ouder-dashboard om de agenda/planning van je
kind te overzien en lesstof te beheren, en een omgeving voor je kind om samen te
plannen, huiswerk/toetsen bij te houden en per vak met een AI-vakdocent te chatten.

Dit is een **eerste versie (MVP)**: 1 gezin, 1 ouder-account, 1 of meer kind-accounts,
en te beginnen met 1 proefvak. De opzet (database, rollen) is al voorbereid om later
uit te breiden naar meer vakken en meer kinderen.

## Wat zit erin

- **Agenda & samen plannen**: huiswerk, toetsen, prive-activiteiten en "leermomenten".
  Bij het aanmaken van een toets worden automatisch een paar gespreide leermomenten
  voorgesteld (spaced learning) - je kind bevestigt of past deze samen met jou aan,
  in plaats van dat de app het volledig overneemt.
- **Ouder-dashboard (CMS)**: vakken aanmaken, lesstof toevoegen (tekst) die de
  AI-vakdocent mag gebruiken, inzicht in de agenda en voortgang van je kind.
- **Kind-omgeving**: eigen agenda, eigen planning, en per vak een chat met een
  AI-vakdocent die dicht bij de aangeleverde lesstof blijft en liever vragen terug
  stelt dan meteen het antwoord geeft.

## Techniek

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [Supabase](https://supabase.com) voor database, authenticatie (ouder/kind-rollen
  via Row Level Security) en bestandsopslag
- [Gemini API](https://ai.google.dev) voor de AI-vakdocenten
- Bedoeld om te hosten op [Netlify](https://netlify.com)

## 1. Supabase-project opzetten

1. Maak een gratis project aan op [supabase.com](https://supabase.com).
2. Open **SQL Editor** in het Supabase-dashboard en plak de inhoud van
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Voer uit.
   Dit maakt alle tabellen, rollen-logica en beveiliging (Row Level Security) aan.
3. Ga naar **Authentication -> Providers -> Email** en overweeg "Confirm email"
   uit te zetten voor het gemak (het is een besloten gezinsapp). Laat je dit aan
   staan, dan moet de ouder eerst de bevestigingsmail openen voordat inloggen werkt.
   Kind-accounts worden door de ouder aangemaakt en hebben dit niet nodig.
4. Ga naar **Project Settings -> API** en noteer:
   - `Project URL`
   - `anon public` key
   - `service_role` key (geheim! nooit delen of in git zetten)

## 2. Gemini API key

Maak een gratis API key aan via [Google AI Studio](https://aistudio.google.com/app/apikey).

## 3. Environment variables

Kopieer `.env.local.example` naar `.env.local` en vul in:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
```

`.env*` staat in `.gitignore` - zet deze waarden nooit in git.

## 4. Lokaal draaien

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. Klik op **Account aanmaken (ouder)** en maak jouw ouder-account aan.
2. Log in en ga naar **Kind-account** om een account voor je kind aan te maken
   (jullie bedenken samen een e-mailadres en wachtwoord).
3. Ga naar **Vakken & lesstof** en maak het eerste proefvak aan, met wat lesstof
   (samenvattingen, uitleg, opgaven als platte tekst).
4. Log uit en log in met het kind-account om de agenda en de vakdocent-chat te
   proberen.

## 5. Deployen op Netlify

1. Push deze repository naar GitHub (of gebruik de repository die al gekoppeld is).
2. Maak een nieuwe Netlify-site vanuit deze repository (Netlify herkent Next.js
   automatisch via de officiele Next.js runtime).
3. Zet dezelfde environment variables als hierboven in **Site settings ->
   Environment variables** (inclusief de geheime `SUPABASE_SERVICE_ROLE_KEY` en
   `GEMINI_API_KEY` - deze worden nooit naar de browser gestuurd, alleen
   server-side gebruikt).
4. Deploy.

## Privacy

Dit is bedoeld als besloten gezinsapp voor eigen gebruik, niet als publieke dienst.
- De ouder ziet uit veiligheidsoverwegingen ook de chatgeschiedenis met de
  AI-vakdocent (zie `supabase/migrations/0001_init.sql`, policy "chat: select own
  or ouder"). Wil je dat niet, pas die policy aan.
- Chatberichten worden doorgestuurd naar Google's Gemini API om een antwoord te
  genereren - lees Google's voorwaarden voordat je hier gevoelige informatie in zet.
- Maak geen accounts aan met echte, unieke wachtwoorden die je kind ook elders
  gebruikt.

## Volgende stappen (na deze MVP)

- Meer vakken toevoegen (de datamodellen ondersteunen dit al).
- PDF-lesstof automatisch laten uitlezen in plaats van tekst plakken.
- Weekoverzicht/kalenderweergave naast de lijstweergave.
- Meerdere kinderen per gezin in de UI (database ondersteunt dit al).
