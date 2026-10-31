"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./ui";

export function PendingSignOut() {
  const router = useRouter();
  return (
    <div className="flex justify-center gap-2">
      <Button variant="secondary" onClick={() => router.refresh()}>Ya me aprobaron</Button>
      <Button
        variant="ghost"
        onClick={async () => {
          await createClient().auth.signOut();
          router.replace("/login");
        }}
      >
        Cerrar sesión
      </Button>
    </div>
  );
}
