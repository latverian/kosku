import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { PropertySwitcher } from "./property-switcher";
import { ThemeToggle } from "./theme-toggle";

export function TopBar({
  properties,
  activeId,
  periodLabel,
  userName,
}: {
  properties: { id: string; name: string }[];
  activeId: string | null;
  periodLabel: string;
  userName: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <div className="min-w-0 flex-1">
        <PropertySwitcher properties={properties} activeId={activeId} />
        <p className="text-xs text-muted-foreground">{periodLabel}</p>
      </div>
      <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
      <ThemeToggle />
      <form action={signOut}>
        <Button variant="ghost" size="icon" aria-label="Keluar" type="submit">
          <LogOut aria-hidden />
        </Button>
      </form>
    </header>
  );
}
