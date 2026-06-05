import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

type Fetcher = (path: string, opts?: RequestInit) => Promise<Response>;

/**
 * Fetch the server-rendered CSV for the current expense filters, write it to a
 * cache file, and open the native share sheet. The CSV is built server-side
 * (modules/expense-tracker/service.ts) so web and mobile produce identical output.
 */
export async function exportExpensesCsv(opts: {
  authFetch: Fetcher;
  params: URLSearchParams;
}): Promise<void> {
  const { authFetch, params } = opts;
  const res = await authFetch(
    `/api/projects/expense-tracker/expenses/export?${params}`
  );
  if (!res.ok) throw new Error("Export failed");
  const csv = await res.text();

  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `expenses-${stamp}.csv`);
  file.create({ overwrite: true });
  file.write(csv);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      dialogTitle: "Export expenses CSV",
      UTI: "public.comma-separated-values-text",
    });
  }
}
