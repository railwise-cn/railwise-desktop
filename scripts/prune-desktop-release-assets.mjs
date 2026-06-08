#!/usr/bin/env node

const {
  GITHUB_REPOSITORY: repository,
  GITHUB_TOKEN: token,
  RELEASE_TAG: tag,
} = process.env;

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
const releaseApi = `https://api.github.com/repos/${repository}/releases/tags/${tag}`;

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (token) {
  headers.Authorization = `Bearer ${token}`;
}

async function githubJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init.method ?? "GET"} ${url} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function classifyAsset(name) {
  if (/\.exe$/i.test(name) && /setup/i.test(name)) {
    return {
      keep: true,
      label: "Windows 64位",
      desiredName: `Railwise-Windows-64bit-Setup-${version}.exe`,
    };
  }

  if (/_aarch64\.dmg$/i.test(name) || /Apple-Silicon.*\.dmg$/i.test(name)) {
    return {
      keep: true,
      label: "macOS Apple 芯片",
      desiredName: `Railwise-macOS-Apple-Silicon-${version}.dmg`,
    };
  }

  if (/_x64\.dmg$/i.test(name) || /Intel.*\.dmg$/i.test(name)) {
    return {
      keep: true,
      label: "macOS Intel 芯片",
      desiredName: `Railwise-macOS-Intel-${version}.dmg`,
    };
  }

  return { keep: false };
}

function releaseNotes() {
  return [
    "## 下载说明",
    "",
    `- Windows 64位：\`Railwise-Windows-64bit-Setup-${version}.exe\``,
    `- macOS Apple 芯片：\`Railwise-macOS-Apple-Silicon-${version}.dmg\``,
    `- macOS Intel 芯片：\`Railwise-macOS-Intel-${version}.dmg\``,
    "",
    "Linux 包、签名文件和自动更新内部包不放在发布页，避免普通用户下载时混淆。",
  ].join("\n");
}

const release = await githubJson(releaseApi);
const kept = [];

for (const asset of release.assets) {
  const classification = classifyAsset(asset.name);

  if (!classification.keep) {
    console.log(`delete ${asset.name}`);
    if (!dryRun) {
      await githubJson(asset.url, { method: "DELETE" });
    }
    continue;
  }

  kept.push(classification.label);

  if (asset.name !== classification.desiredName) {
    console.log(`rename ${asset.name} -> ${classification.desiredName}`);
    if (!dryRun) {
      await githubJson(asset.url, {
        method: "PATCH",
        body: JSON.stringify({ name: classification.desiredName }),
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    console.log(`keep ${asset.name}`);
  }
}

console.log(`kept ${kept.length} assets: ${kept.join(", ")}`);

if (!dryRun) {
  await githubJson(release.url, {
    method: "PATCH",
    body: JSON.stringify({ body: releaseNotes() }),
    headers: { "Content-Type": "application/json" },
  });
}
