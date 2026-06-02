const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const siteUrl = process.env.SITE_URL || "https://idcm-svg.github.io/HFTTC.github.io/";
const dataPath = path.join(process.cwd(), "data", "site-stats.json");

function toNumber(value) {
  const text = String(value || "").replace(/[^\d]/g, "");
  return text ? Number(text) : 0;
}

function formatShanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatShanghaiIso() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type) => parts.find((item) => item.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+08:00`;
}

async function readBusuanziSnapshot() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      const pv = document.querySelector("#busuanzi_value_site_pv")?.textContent?.trim();
      const uv = document.querySelector("#busuanzi_value_site_uv")?.textContent?.trim();
      return Boolean(pv && uv);
    }, { timeout: 60000 });

    const values = await page.evaluate(() => ({
      views: document.querySelector("#busuanzi_value_site_pv")?.textContent?.trim() || "",
      users: document.querySelector("#busuanzi_value_site_uv")?.textContent?.trim() || "",
    }));

    return {
      views: toNumber(values.views),
      users: toNumber(values.users),
    };
  } finally {
    await browser.close();
  }
}

function loadExisting() {
  if (!fs.existsSync(dataPath)) {
    return {
      source: "busuanzi",
      siteUrl,
      updatedAt: formatShanghaiIso(),
      total: { views: 0, users: 0 },
      history: [],
    };
  }

  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

async function main() {
  const snapshot = await readBusuanziSnapshot();
  const existing = loadExisting();
  const today = formatShanghaiDate();

  const history = Array.isArray(existing.history) ? existing.history.slice() : [];
  const nextEntry = {
    date: today,
    views: snapshot.views,
    users: snapshot.users,
  };

  const index = history.findIndex((item) => item.date === today);
  if (index >= 0) {
    history[index] = nextEntry;
  } else {
    history.push(nextEntry);
  }

  history.sort((a, b) => a.date.localeCompare(b.date));

  const next = {
    source: "busuanzi",
    siteUrl,
    updatedAt: formatShanghaiIso(),
    total: {
      views: snapshot.views,
      users: snapshot.users,
    },
    history,
  };

  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`Updated stats: PV=${snapshot.views}, UV=${snapshot.users}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
