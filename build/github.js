// Build-time fetcher: pulls each skill folder from the live mattpocock/skills repo.
// One tree API call (cached), then raw downloads (not API-rate-limited).
const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

function headers() {
  const h = { "User-Agent": "create-usine-build" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function fetchTree(repo, ref) {
  const res = await fetch(`${API}/repos/${repo}/git/trees/${ref}?recursive=1`, { headers: headers() });
  if (!res.ok) throw new Error(`GitHub tree ${repo}@${ref}: ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data.truncated) throw new Error(`GitHub tree ${repo}@${ref} truncated`);
  return data.tree;
}

async function fetchRaw(repo, ref, path) {
  const res = await fetch(`${RAW}/${repo}/${ref}/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GitHub raw ${path}: ${res.status} ${res.statusText}`);
  return res.text();
}

export function createGithubFetcher({ repo = "mattpocock/skills", ref = "main" } = {}) {
  let treePromise;
  return async function fetchSkill(category, name) {
    treePromise ??= fetchTree(repo, ref);
    const entries = await treePromise;
    const prefix = `skills/${category}/${name}/`;
    const blobs = entries.filter((e) => e.type === "blob" && e.path.startsWith(prefix));
    if (blobs.length === 0) {
      throw new Error(`${name}: introuvable dans ${repo} (${prefix})`);
    }
    const files = [];
    for (const blob of blobs) {
      files.push({ path: blob.path.slice(prefix.length), content: await fetchRaw(repo, ref, blob.path) });
    }
    return files;
  };
}
