/** Bentuk state yang dikembalikan server action ke form (useActionState). */
export type FormState =
  | {
      ok?: boolean;
      message?: string;
      error?: string;
      fieldErrors?: Record<string, string>;
      /** nilai yang dikirim, agar form tidak kosong lagi saat ada error */
      values?: Record<string, string>;
    }
  | undefined;
