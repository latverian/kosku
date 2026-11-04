/**
 * Penyedia WhatsApp (specs/05-architecture.md § 4). Logika bisnis hanya
 * mengenal interface ini, sehingga Fonnte bisa diganti WhatsApp Cloud API.
 */
export type SendResult =
  { ok: true; providerMessageId: string | null } | { ok: false; error: string; retryable: boolean };

export interface WhatsAppProvider {
  readonly name: string;
  send(input: { to: string; body: string }): Promise<SendResult>;
}

/** Development & tes: tidak mengirim apa pun, hanya mencatat. */
export class ConsoleProvider implements WhatsAppProvider {
  readonly name = "console";
  readonly sent: { to: string; body: string }[] = [];
  constructor(private readonly log = true) {}
  async send(input: { to: string; body: string }): Promise<SendResult> {
    this.sent.push(input);
    if (this.log) console.info(`[WA → ${input.to}]\n${input.body}\n`);
    return { ok: true, providerMessageId: `console-${this.sent.length}` };
  }
}

/** Provider yang selalu gagal — dipakai bila WhatsApp belum dikonfigurasi di production. */
export class UnconfiguredProvider implements WhatsAppProvider {
  readonly name = "unconfigured";
  async send(): Promise<SendResult> {
    return { ok: false, error: "WhatsApp belum dikonfigurasi (FONNTE_TOKEN kosong).", retryable: false };
  }
}

/**
 * Fonnte: POST https://api.fonnte.com/send, header Authorization: <token>,
 * body form (target, message). Respons: { status: true, id: [...] } atau
 * { status: false, reason: "..." }.
 */
export class FonnteProvider implements WhatsAppProvider {
  readonly name = "fonnte";
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoint = "https://api.fonnte.com/send",
  ) {}

  async send(input: { to: string; body: string }): Promise<SendResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { Authorization: this.token },
        body: new URLSearchParams({ target: input.to, message: input.body, countryCode: "62" }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      return { ok: false, error: `Gagal menghubungi Fonnte: ${(error as Error).message}`, retryable: true };
    }

    if (response.status >= 500 || response.status === 429) {
      return { ok: false, error: `Fonnte HTTP ${response.status}`, retryable: true };
    }
    let data: { status?: boolean; reason?: string; detail?: string; id?: unknown } | null = null;
    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        error: `Respons Fonnte tidak valid (HTTP ${response.status})`,
        retryable: response.ok,
      };
    }
    if (data?.status === true) {
      const id = Array.isArray(data.id) ? String(data.id[0] ?? "") : data.id != null ? String(data.id) : "";
      return { ok: true, providerMessageId: id || null };
    }
    const reason = data?.reason ?? data?.detail ?? `HTTP ${response.status}`;
    // Kuota/perangkat terputus bisa pulih; token/nomor salah tidak.
    const retryable = /disconnect|quota|limit|timeout|busy/i.test(reason);
    return { ok: false, error: `Fonnte: ${reason}`, retryable };
  }
}

/** Provider sesuai environment. */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): WhatsAppProvider {
  if (env.FONNTE_TOKEN) return new FonnteProvider(env.FONNTE_TOKEN);
  if (env.NODE_ENV === "production") return new UnconfiguredProvider();
  return new ConsoleProvider();
}
