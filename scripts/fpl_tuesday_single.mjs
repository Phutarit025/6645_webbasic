import fs from "node:fs";
import path from "node:path";

/* ================= FPL endpoints + กันแคช ================= */
const stamp = () => `t=${Date.now()}`;
const FPL_BOOT = `https://fantasy.premierleague.com/api/bootstrap-static/?${stamp()}`;
const FPL_LIVE = (gw) => `https://fantasy.premierleague.com/api/event/${gw}/live/?${stamp()}`;
const FPL_FIX  = (gw) => `https://fantasy.premierleague.com/api/fixtures/?event=${gw}&${stamp()}`;

/* ================= helpers ================= */
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, +v || 0));
const per90  = (v, mins) => ((+v || 0) * 90) / Math.max(1, +mins || 0);
const roleBy = (t) => ({ 1: "Goalkeeper", 2: "Defender", 3: "Midfielder", 4: "Attacker" }[t] || "Attacker");

/**
 * ดึง JSON พร้อม retry/backoff และรองรับ 429 (Retry-After)
 */
async function fetchJson(url, tries = 5) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          "cache-control": "no-cache",
          // UA เฉพาะกิจ เพื่อหลีกเลี่ยงบางเซิร์ฟเวอร์บล็อก UA ว่างๆ
          "user-agent": "gh-actions-fpl-snapshot/1.0 (+github)"
        }
      });

      // ถูก rate-limit: เคารพ Retry-After แล้วลองใหม่
      if (r.status === 429) {
        const ra = r.headers.get("retry-after");
        const wait = Math.min(30000, (ra ? (+ra * 1000) : 0) || 3000 * i);
        console.warn(`429 rate limited, wait ${wait}ms then retry...`);
        await new Promise(res => setTimeout(res, wait));
        continue;
      }

      if (!r.ok) {
        const tx = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status} ${r.statusText} :: ${tx.slice(0, 150)}`);
      }

      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) {
        const tx = await r.text();
        throw new Error(`Non-JSON response: ${tx.slice(0, 120)}`);
      }
      return await r.json();
    } catch (e) {
      lastErr = e;
      if (i < tries) {
        const backoff = Math.min(15000, 500 * i * i); // quadratic backoff
        console.warn(`fetchJson retry ${i}/${tries - 1} after ${backoff}ms :: ${e.message}`);
        await new Promise(res => setTimeout(res, backoff));
      }
    }
  }
  throw lastErr;
}

/* ============ น้ำหนัก TOTAL ตามตำแหน่ง (role-aware) ============ */
const ROLE_TOTAL_WEIGHTS = {
  Goalkeeper: { ATT: 0.10, CRE: 0.10, DEF: 0.45, FIT: 0.25, CTRL: 0.10 },
  Defender:   { ATT: 0.18, CRE: 0.12, DEF: 0.40, FIT: 0.20, CTRL: 0.10 },
  Midfielder: { ATT: 0.28, CRE: 0.27, DEF: 0.15, FIT: 0.20, CTRL: 0.10 },
  Attacker:   { ATT: 0.42, CRE: 0.23, DEF: 0.05, FIT: 0.20, CTRL: 0.10 },
};

/* ============ คำนวณค่าสมรรถนะราย GW จาก /live (0..100) ============ */
function powersFromLive(stats, role = "Attacker") {
  const m    = +stats.minutes || 0;
  const g90  = per90(stats.goals_scored, m);
  const a90  = per90(stats.assists, m);
  const sh90 = per90(stats.total_shots ?? stats.shots ?? 0, m);
  const sv90 = per90(stats.saves, m);
  const gc90 = per90(stats.goals_conceded, m);
  const cs   = +stats.clean_sheets || 0;

  const infl = parseFloat(stats.influence ?? 0);
  const crea = parseFloat(stats.creativity ?? 0);
  const thr  = parseFloat(stats.threat ?? 0);
  const y    = +stats.yellow_cards || 0;
  const r    = +stats.red_cards || 0;
  const pm   = +stats.penalties_missed || 0;
  const og   = +stats.own_goals || 0;
  const penSaved = +stats.penalties_saved || 0; // GK

  const ATT  = clamp(62 * g90 + 26 * a90 + 5 * sh90 + 0.06 * thr);
  const CRE  = clamp(28 * a90 + 0.65 * crea + 0.10 * infl);
  const DEF  = clamp(20 * cs + 11 * sv90 + 6 * penSaved - 7 * gc90 + 0.06 * infl);
  const FIT  = clamp(Math.min(1, m / 90) * 100);
  const CTRL = clamp(95 - (2 * y + 8 * r + 5 * pm + 6 * og));

  const w = ROLE_TOTAL_WEIGHTS[role] || ROLE_TOTAL_WEIGHTS.Attacker;
  const TOTAL = Math.round(ATT * w.ATT + CRE * w.CRE + DEF * w.DEF + FIT * w.FIT + CTRL * w.CTRL);

  return { ATT, CRE, DEF, FIT, CTRL, TOTAL };
}

/* ============ เลือก GW: เอาที่กำลังเล่นก่อน, ไม่งั้นล่าสุดที่ปิด ============ */
function pickGW(events) {
  const cur = (events || []).find((e) => e.is_current);
  if (cur) return cur.id;
  const done = (events || []).filter((e) => e.finished && e.data_checked);
  if (done.length) return done.sort((a, b) => b.id - a.id)[0].id;
  return events?.[0]?.id ?? 1;
}

/* ================= main ================= */
async function main() {
  const boot = await fetchJson(FPL_BOOT);
  const events = boot.events || [];
  const teams  = boot.teams  || [];
  const elems  = boot.elements || [];

  const gw = pickGW(events);
  const gwMeta = events.find((e) => e.id === gw);
  console.log(`ℹ️ Using GW=${gw} (is_current=${!!gwMeta?.is_current}, finished=${!!gwMeta?.finished}, data_checked=${!!gwMeta?.data_checked})`);

  const teamsIdx   = Object.fromEntries(teams.map((t) => [t.id, {
    id: t.id, name: t.name, short_name: t.short_name,
    badge: `https://resources.premierleague.com/premierleague/badges/70/t${t.id}.png`,
  }]));
  const playersIdx = Object.fromEntries(elems.map((p) => [p.id, p]));

  const [live, fixtures] = await Promise.all([
    fetchJson(FPL_LIVE(gw)),
    fetchJson(FPL_FIX(gw)).catch(() => [])
  ]);

  const played = (live.elements || [])
    .filter((e) => +e.stats?.minutes > 0)
    .map((e) => {
      const base = playersIdx[e.id] || {};
      const team = teamsIdx[base.team] || {};
      const role = roleBy(base.element_type);
      const pow  = powersFromLive(e.stats || {}, role);
      return {
        id: e.id,
        code: base.code,
        name: `${base.first_name || ""} ${base.second_name || base.web_name || ""}`.trim(),
        team_id: base.team,
        team: team.name,
        role,
        minutes: +e.stats.minutes || 0,
        photo: `https://resources.premierleague.com/premierleague/photos/players/110x140/p${base.code}.png`,
        gw_stats: {
          goals: +e.stats.goals_scored || 0,
          assists: +e.stats.assists || 0,
          cs: +e.stats.clean_sheets || 0,
          gc: +e.stats.goals_conceded || 0,
          saves: +e.stats.saves || 0,
          yellow: +e.stats.yellow_cards || 0,
          red: +e.stats.red_cards || 0,
          penalties_missed: +e.stats.penalties_missed || 0,
          penalties_saved: +e.stats.penalties_saved || 0,
          own_goals: +e.stats.own_goals || 0,
          influence: parseFloat(e.stats.influence || 0),
          creativity: parseFloat(e.stats.creativity || 0),
          threat: parseFloat(e.stats.threat || 0),
          total_points: +e.stats.total_points || 0,
          bonus: +e.stats.bonus || 0,
        },
        powers_gw: pow,
      };
    });

  // XI ต่อทีมแบบ 4-3-3 จากผู้ที่ลงจริง
  const byTeam = new Map();
  for (const p of played) {
    if (!byTeam.has(p.team_id)) byTeam.set(p.team_id, []);
    byTeam.get(p.team_id).push(p);
  }
  const xiByTeam = {};
  for (const [tid, arr] of byTeam) {
    const by = (want) => arr.filter((p) => p.role === want).sort((a, b) => b.minutes - a.minutes);
    const gk = by("Goalkeeper").slice(0, 1);
    const df = by("Defender").slice(0, 4);
    const mf = by("Midfielder").slice(0, 3);
    const fw = by("Attacker").slice(0, 3);
    let xi = [...gk, ...df, ...mf, ...fw];
    if (xi.length < 11) {
      const rest = arr.filter((p) => !xi.includes(p)).sort((a, b) => b.minutes - a.minutes);
      xi = xi.concat(rest.slice(0, 11 - xi.length));
    }
    xiByTeam[tid] = xi.map((p) => p.id);
  }

  const payload = {
    generated_at: new Date().toISOString(),
    note: "Current snapshot (auto run).",
    gw,
    teams: Object.values(teamsIdx),
    players_played: played,
    xiByTeam,
    fixtures,
  };

  const outDir = path.join(process.cwd(), "public", "data");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "fpl_current.json"), JSON.stringify(payload, null, 2));
  console.log("✅ Wrote public/data/fpl_current.json");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
