"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { logInAlsKind } from "@/lib/actions/impersonate";

export function LogInAlsKindKnop({ kindId, naam }: { kindId: string; naam: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div>
      <form
        action={async () => {
          setError(null);
          setPending(true);
          const res = await logInAlsKind(kindId);
          setPending(false);
          if (res?.error) setError(res.error);
        }}
      >
        <Button type="submit" size="lg" variant="secondary" icon={<Icon name="log-in" size={18} />} loading={pending} className="w-full">
          {pending ? "Bezig..." : `Inloggen als ${naam}`}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
