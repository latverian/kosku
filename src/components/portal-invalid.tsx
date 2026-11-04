import { Card } from "@/components/ui/card";

export function PortalInvalid() {
  return (
    <Card className="space-y-2 p-6 text-center">
      <p className="text-lg font-semibold">Link tidak berlaku</p>
      <p className="text-sm text-muted-foreground">
        Link portal ini sudah tidak aktif atau salah. Minta link terbaru ke pengelola kos lewat WhatsApp.
      </p>
    </Card>
  );
}
