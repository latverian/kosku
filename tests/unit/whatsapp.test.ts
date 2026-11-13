import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider, FonnteProvider, providerFromEnv, UnconfiguredProvider } from "@/services/whatsapp";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Fonnte", () => {
  it("mengirim form target & message dengan header token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(200, { status: true, id: ["80367170"], detail: "success! message in queue" }));
    const result = await new FonnteProvider("TOKEN", fetchMock).send({ to: "6281234567890", body: "Halo" });
    expect(result).toEqual({ ok: true, providerMessageId: "80367170" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.fonnte.com/send");
    expect(init.headers).toEqual({ Authorization: "TOKEN" });
    expect(Object.fromEntries(init.body as URLSearchParams)).toMatchObject({
      target: "6281234567890",
      message: "Halo",
    });
  });

  it("token salah → gagal tanpa retry; perangkat terputus / 5xx / jaringan → retry", async () => {
    const send = (res: Response | Error) =>
      new FonnteProvider(
        "T",
        (res instanceof Error
          ? vi.fn().mockRejectedValue(res)
          : vi.fn().mockResolvedValue(res)) as typeof fetch,
      ).send({ to: "62", body: "x" });
    expect(await send(json(200, { status: false, reason: "invalid token" }))).toMatchObject({
      ok: false,
      retryable: false,
    });
    expect(await send(json(200, { status: false, reason: "device disconnected" }))).toMatchObject({
      ok: false,
      retryable: true,
    });
    expect(await send(json(502, {}))).toMatchObject({ ok: false, retryable: true });
    expect(await send(new Error("ECONNRESET"))).toMatchObject({ ok: false, retryable: true });
  });
});

describe("pemilihan provider", () => {
  it("Fonnte bila token ada; Console di development; gagal jelas di production", () => {
    expect(providerFromEnv({ FONNTE_TOKEN: "x" })).toBeInstanceOf(FonnteProvider);
    expect(providerFromEnv({ NODE_ENV: "development" })).toBeInstanceOf(ConsoleProvider);
    expect(providerFromEnv({ NODE_ENV: "production" })).toBeInstanceOf(UnconfiguredProvider);
  });

  it("FONNTE_API_URL mengarahkan Fonnte ke simulator", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: true, id: ["9"] }), { status: 200 }));
    try {
      const provider = providerFromEnv({
        FONNTE_TOKEN: "x",
        FONNTE_API_URL: "http://localhost:3200/fonnte/send",
      });
      expect(await provider.send({ to: "62812", body: "Halo" })).toEqual({
        ok: true,
        providerMessageId: "9",
      });
      expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3200/fonnte/send");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
