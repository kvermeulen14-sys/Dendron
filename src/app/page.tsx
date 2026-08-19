import Link from "next/link";
import { Icon } from "@/components/icon";
import { LinkButton } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
          <Icon name="book-open" size={32} />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Dendron</h1>
        <p className="mt-2 text-slate-600">
          Samen plannen, op tijd leren en per vak hulp vragen - overzichtelijk voor het
          hele gezin.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <LinkButton href="/login" size="lg" variant="primary" className="w-full">
            Inloggen
          </LinkButton>
          <LinkButton href="/registreren" size="lg" variant="secondary" className="w-full">
            Account aanmaken (ouder)
          </LinkButton>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Ben je een leerling? Vraag je ouder om voor jou een account aan te maken via het
          ouder-dashboard.{" "}
          <Link href="/login" className="underline">
            Al een account? Log in.
          </Link>
        </p>
      </div>
    </div>
  );
}
