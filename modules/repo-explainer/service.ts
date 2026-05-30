import { completeJSON } from "@/lib/llm";
import {
  parseRepoUrl,
  geminiRepoSchema,
  repoAnalysisSchema,
  type RepoAnalysis,
} from "./schemas";
import { SYSTEM_PROMPT, buildAnalyzePrompt } from "./prompts";

const GITHUB_API = "https://api.github.com";

const KEY_FILE_PATTERNS = [
  /^readme\.md$/i,
  /^package\.json$/,
  /^requirements\.txt$/,
  /^pyproject\.toml$/,
  /^go\.mod$/,
  /^cargo\.toml$/,
  /^docker-compose\.ya?ml$/,
  /^dockerfile$/i,
  /^\.env\.example$/,
  /^next\.config\./,
  /^tsconfig\.json$/,
  /^app\.(?:ts|js|py)$/,
  /^main\.(?:ts|js|py|go|rs)$/,
  /^index\.(?:ts|js|py)$/,
  /^server\.(?:ts|js)$/,
  /^manage\.py$/,
  /^src\/(?:index|main|app)\./,
  /^app\/layout\./,
  /^app\/page\./,
  /^lib\//,
  /^src\/lib\//,
  /^config\//,
  /routes\./,
  /schema\./,
  /model/,
];

type TreeItem = { path: string; type: string; size?: number };

async function githubFetch(url: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "ai-playground",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded. Try again later.");
    if (res.status === 404) throw new Error("Repository not found or is private.");
    throw new Error(`GitHub API error: ${res.status}`);
  }
  return res.json();
}

async function fetchTree(owner: string, repo: string): Promise<TreeItem[]> {
  const data = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`
  );
  return (data.tree ?? [])
    .filter((t: any) => t.type === "blob")
    .map((t: any) => ({ path: t.path, type: t.type, size: t.size }));
}

function selectKeyFiles(tree: TreeItem[]): string[] {
  const selected: string[] = [];
  const maxFiles = 15;
  const maxSize = 50_000;

  for (const item of tree) {
    if (selected.length >= maxFiles) break;
    if (item.size && item.size > maxSize) continue;

    const filename = item.path.split("/").pop() ?? "";
    const isKey = KEY_FILE_PATTERNS.some(
      (p) => p.test(filename) || p.test(item.path)
    );
    if (isKey) selected.push(item.path);
  }

  return selected;
}

async function fetchFileContent(
  owner: string,
  repo: string,
  path: string
): Promise<string> {
  try {
    const data = await githubFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`
    );
    if (data.encoding === "base64" && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return "";
  } catch {
    return "";
  }
}

function buildTreeString(tree: TreeItem[]): string {
  return tree
    .map((t) => t.path)
    .slice(0, 200)
    .join("\n");
}

export async function analyzeRepo(repoUrl: string): Promise<{
  analysis: RepoAnalysis;
  meta: { owner: string; repo: string; fileCount: number; analyzedFiles: string[] };
}> {
  const { owner, repo } = parseRepoUrl(repoUrl);

  const tree = await fetchTree(owner, repo);
  const keyFiles = selectKeyFiles(tree);

  const contents = await Promise.all(
    keyFiles.map(async (path) => {
      const content = await fetchFileContent(owner, repo, path);
      if (!content) return "";
      const truncated = content.length > 3000 ? content.slice(0, 3000) + "\n... (truncated)" : content;
      return `--- ${path} ---\n${truncated}\n`;
    })
  );

  const fileContents = contents.filter(Boolean).join("\n");
  const treeString = buildTreeString(tree);

  const raw = await completeJSON<unknown>(
    buildAnalyzePrompt(owner, repo, treeString, fileContents),
    geminiRepoSchema,
    { system: SYSTEM_PROMPT, maxOutputTokens: 8192 }
  );

  const parsed = repoAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Analysis parsing failed: ${parsed.error.message}`);
  }

  return {
    analysis: parsed.data,
    meta: {
      owner,
      repo,
      fileCount: tree.length,
      analyzedFiles: keyFiles,
    },
  };
}
