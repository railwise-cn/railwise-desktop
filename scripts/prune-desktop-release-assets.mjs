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

  if (response.status === 404 && allowMissing) {
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

function newestAsset(assets) {
  return [...assets].sort((left, right) => {
    return (
      new Date(right.updated_at ?? right.created_at ?? 0) -
      new Date(left.updated_at ?? left.created_at ?? 0)
    );
  })[0];
}

const release = await findReleaseByTag();

if (!release) {
  throw new Error(`release ${tag} was not found`);
}
const groups = new Map();
const unwantedAssets = [];

for (const asset of release.assets) {
  const classification = classifyAsset(asset.name);

  if (!classification.keep) {
    unwantedAssets.push(asset);
    continue;
  }

  const group = groups.get(classification.desiredName) ?? {
    label: classification.label,
    desiredName: classification.desiredName,
    assets: [],
  };
  group.assets.push(asset);
  groups.set(classification.desiredName, group);
}

const kept = [];

for (const asset of unwantedAssets) {
  console.log(`delete ${asset.name}`);
  if (!dryRun) {
    await githubJson(asset.url, { method: "DELETE" });
  }
}

for (const group of groups.values()) {
  const uploadedAssets = group.assets.filter((asset) => asset.name !== group.desiredName);
  const preferred = newestAsset(uploadedAssets.length > 0 ? uploadedAssets : group.assets);

  for (const asset of group.assets) {
    if (asset.id === preferred.id) {
      continue;
    }

    console.log(`delete duplicate ${asset.name}`);
    if (!dryRun) {
      await githubJson(asset.url, { method: "DELETE" });
    }
  }

  kept.push(group.label);

  if (preferred.name !== group.desiredName) {
    console.log(`rename ${preferred.name} -> ${group.desiredName}`);
    if (!dryRun) {
      await githubJson(preferred.url, {
        method: "PATCH",
        body: JSON.stringify({ name: group.desiredName }),
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    console.log(`keep ${preferred.name}`);
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
