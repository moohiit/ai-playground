import { Suspense, type ReactNode } from "react";
import { AuthGate } from "@/components/shared/AuthGate";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}
