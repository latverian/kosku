import { NextResponse, type NextRequest } from "next/server";
import type { Bucket } from "@/lib/uploads";
import { LocalStorage, storageFromEnv } from "@/services/storage";

const BUCKETS: Bucket[] = ["payment-proofs", "complaint-photos", "id-cards", "receipts"];
const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** Hanya untuk penyimpanan lokal (development). Di production file dilayani Supabase. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/files/[...path]">) {
  const storage = storageFromEnv();
  if (!(storage instanceof LocalStorage)) return new NextResponse(null, { status: 404 });
  const [bucket, ...rest] = (await params).path;
  if (!BUCKETS.includes(bucket as Bucket)) return new NextResponse(null, { status: 404 });
  const path = rest.join("/");
  const exp = Number(request.nextUrl.searchParams.get("exp"));
  const sig = request.nextUrl.searchParams.get("sig") ?? "";
  const data = await storage.read(bucket as Bucket, path, exp, sig);
  if (!data) return new NextResponse("Link tidak berlaku", { status: 403 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
