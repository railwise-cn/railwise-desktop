#!/usr/bin/env node

const { GITHUB_REPOSITORY: repository, GITHUB_TOKEN: token, RELEASE_TAG: tag } = process.env;

const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required");
}

if (!tag) {
  throw new Error("RELEASE_TAG is required");
}

if (!token && !dryRun) {
  throw new Error("GITHUB_TOKEN is required unless --dry-run is set");
}

const version = tag.replace(/^desktop-v/, "");
const releasesApi = `https://api.github.com/repos/${repository}/releases`;
const releaseByTagApi = `${releasesApi}/tags/${tag}`;

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (token) {
  headers.Authorization = `Bearer ${token}`;
}

async function githubJson(url, init = {}) {
  const { allowMissing, ...fetchInit } = init;
  const response = await fetch(url, {
    ...fetchInit,
    headers: {
      ...headers,
      ...fetchInit.headers,
    },
  });

  if (response.status === 404 && init.allowMissing) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init.method ?? "GET"} ${url} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function findReleaseByTag() {
  const releaseByTag = await githubJson(releaseByTagApi, { allowMissing: true });

  if (releaseByTag) {
    return releaseByTag;
  }

  for (let page = 1; page <= 5; page += 1) {
    const releases = await githubJson(`${releasesApi}?per_page=100&page=${page}`);
    const release = releases.find((candidate) => {
      return candidate.tag_name === tag || candidate.name?.includes(tag);
    });

    if (release) {
      return release;
    }

    if (releases.length < 100) {
      break;
    }
  }

  return null;
}

function isPrimaryDownload(name) {
  return [
    `Railwise-Windows-64bit-Setup-${version}.exe`,
    `Railwise-macOS-Apple-Silicon-${version}.dmg`,
    `Railwise-macOS-Intel-${version}.dmg`,
  ].includes(name);
}

const release = await findReleaseByTag();

if (!release) {
  console.log(`release ${tag} does not exist yet; nothing to delete`);
  process.exit(0);
}

const uploadAssets = release.assets.filter((asset) => !isPrimaryDownload(asset.name));

if (uploadAssets.length === 0) {
  console.log(`release ${tag} has no stale upload assets`);
  process.exit(0);
}

for (const asset of uploadAssets) {
  console.log(`delete stale upload asset ${asset.name}`);
  if (!dryRun) {
    await githubJson(asset.url, { method: "DELETE" });
  }
}

console.log(`deleted ${uploadAssets.length} stale upload assets from ${tag}`);
