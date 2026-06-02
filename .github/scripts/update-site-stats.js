const fs = require("fs");
const path = require("path");
const https = require("https");

const siteUrl = process.env.SITE_URL || "https://idcm-svg.github.io/HFTTC.github.io/";
const dataPath = path.join(process.cwd(), "data", "site-stats.json");
const busuanziEndpoint = "https://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback";

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

function formatShanghaiSlot() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type) => parts.find((item) => item.type === type)?.value || "00";
  const hour = Number(get("hour"));
  const slotHour = String(Math.floor(hour / 6) * 6).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")} ${slotHour}:00`;
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

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; SiteStatsBot/1.0)",
        referer: siteUrl,
      },
      timeout: 30000,
    }, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode}`));
        response.resume();
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    }).on("timeout", function onTimeout() {
      this.destroy(new Error("Request timeout"));
    }).on("error", reject);
  });
}

async function readBusuanziSnapshot() {
  const body = await fetchText(busuanziEndpoint);
  const match = body.match(/BusuanziCallback\((.*)\)\s*;?\s*$/s);
  if (!match) {
    throw new Error("Unexpected busuanzi response");
  }

  const payload = JSON.parse(match[1]);
  return {
    views: toNumber(payload.site_pv),
    users: toNumber(payload.site_uv),
  };
}

function loadExisting() {
  if (!fs.existsSync(dataPath)) {
    return {
      source: "busuanzi",
      siteUrl,
      updatedAt: formatShanghaiIso(),
      checkedAt: formatShanghaiIso(),
      total: { views: 0, users: 0 },
      history: [],
    };
  }

  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

async function main() {
  const existing = loadExisting();
  let snapshot;

  try {
    snapshot = await readBusuanziSnapshot();
  } catch (error) {
    const currentViews = toNumber(existing.total?.views);
    const currentUsers = toNumber(existing.total?.users);
    if (currentViews > 0 || currentUsers > 0) {
      const next = {
        ...existing,
        source: "busuanzi",
        siteUrl,
        checkedAt: formatShanghaiIso(),
      };
      fs.mkdirSync(path.dirname(dataPath), { recursive: true });
      fs.writeFileSync(dataPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      console.warn(`Skip stats update: ${error.message}`);
      console.log(`Keep existing stats: PV=${currentViews}, UV=${currentUsers}`);
      return;
    }
    throw error;
  }

  const today = formatShanghaiDate();
  const slot = formatShanghaiSlot();

  const history = Array.isArray(existing.history) ? existing.history.slice() : [];
  const nextEntry = {
    date: slot,
    views: snapshot.views,
    users: snapshot.users,
  };

  const index = history.findIndex((item) => item.date === slot);
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
    checkedAt: formatShanghaiIso(),
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
