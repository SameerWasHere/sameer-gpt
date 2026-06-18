/* ============================================================
   BET TRACKER — shared data + helpers
   Loaded by both bettracker.html (home feed) and
   bettracker-view.html (individual bet detail page).

   To add a bet: append an object to BETTRACKER_BETS.
   - slug:   unique URL slug -> /bettracker/{slug}
   - legs[].status: "hit" | "impossible" | "pending"
   - winThreshold: how many legs must hit for the bet to be won
   ============================================================ */
window.BETTRACKER_BETS = [
  {
    slug: "sea-dweller",
    id: "QPL-0001",
    title: "Q's Parlay: Sea Dweller Edition",
    type: "4 Legs · Any 1 Hits",
    expires: "2029-01-01T00:00:00",
    winThreshold: 1,
    winnerName: "Q",
    winRule: "Q WINS IF ANY 1 OF 4 HITS",
    playerA: { name: "Q", initials: "Q", role: "The Believer" },
    playerB: { name: "Mitch", initials: "M", role: "The Fader" },
    stakeA: {
      who: "If Q loses",
      text: "Sells Mitch a Rolex Sea-Dweller at a 20% discount.",
      caption: "Q's collateral"
    },
    stakeB: {
      who: "If Mitch loses",
      text: "Wears a Packers jersey to Football Sunday — 4 weeks straight.",
      caption: "Mitch's collateral"
    },
    legs: [
      { text: "Wembanyama wins a unanimous MVP before 2029", status: "pending" },
      { text: "Orioles take zero shutout losses in 2026", status: "impossible" },
      { text: "Fernando Mendoza out of the NFL within 2 years", status: "pending" },
      { text: "Packers win the Super Bowl by 2029", status: "pending" }
    ],
    odds: {
      overall: "-105",
      overallPct: "~51%",
      overallNote: "Q to win the bet",
      legs: [
        {
          pct: "25%",
          status: "pending",
          title: "Wemby — Unanimous MVP before 2029",
          analysis: "The alien is already the 2027 MVP favorite at +200 after dragging the Spurs to the Finals in year 3. But UNANIMOUS? Only Steph (2016) has done it in the modern era. Wemby's the best bet to do it again, but he needs zero vote defectors across 3 shots at it. The talent is there. The voters' egos might not be."
        },
        {
          pct: "BUSTED",
          status: "impossible",
          title: "Orioles — Zero Shutout Losses 2026",
          analysis: "This leg died on June 16, 2026. Poured one out for Q's most ambitious leg. In hindsight, betting that a baseball team wouldn't get shut out for an entire 162-game season was always unhinged. Very on-brand for Q."
        },
        {
          pct: "7%",
          status: "pending",
          title: "Mendoza — Out of the NFL in 2 Years",
          analysis: "Q is betting against a Heisman-winning, undefeated national champion who went #1 overall to the Raiders. Even JaMarcus Russell — the gold standard for QB busts — lasted 3 years. For Mendoza to be OUT of the league by 2028, he'd need to make JaMarcus look like a success story. Raiders gonna Raider, but this is a reach."
        },
        {
          pct: "30%",
          status: "pending",
          title: "Packers — Win Super Bowl by 2029",
          analysis: "Green Bay is +1400 for the 2027 Super Bowl — tied for 7th best. Jordan Love has the weapons, the division is winnable, and they get 3 shots at it (2027, 2028, 2029 seasons). Historically, any top-10 team has roughly a 10-12% shot per year. Over 3 years that compounds to about 30%. This is Q's best live leg."
        }
      ],
      verdict: "With one leg already dead, Q needs to hit 1 of 3. The Packers carry him at ~30% and Wemby adds another 25%, but the Mendoza leg has quietly collapsed — betting a #1 overall Heisman QB washes out in two years is worth maybe 7%. Combined probability of hitting at least one: roughly 51%. Q is still the favorite, but this has slipped from a comfortable -150 to basically a coin flip. Mitch is right back in it."
    }
  }
];

window.BetTracker = {
  ICONS: {
    hit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    impossible: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  },
  TROPHY: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  TAG: { hit: "HIT", impossible: "IMPOSSIBLE", pending: "PENDING" },

  escapeHtml: function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  },

  // Win rule: the bet is WON the moment `threshold` legs hit (default: any 1 of N).
  // It's only LOST once it's impossible to reach the threshold — i.e. there
  // aren't enough non-dead legs left to get there.
  betState: function (legs, threshold) {
    var need = threshold || 1;
    var hits = legs.filter(function (l) { return l.status === "hit"; }).length;
    var stillAlive = legs.filter(function (l) { return l.status !== "impossible"; }).length;
    if (hits >= need) return "won";
    if (stillAlive < need) return "lost";
    return "live";
  },

  stateLabel: function (state) {
    return state === "won" ? "CASHED" : state === "lost" ? "BUSTED" : "LIVE";
  },

  fmtDate: function (iso) {
    var d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
  },

  bySlug: function (slug) {
    return window.BETTRACKER_BETS.filter(function (b) { return b.slug === slug; })[0] || null;
  },

  // Returns { d, h, m, s, done } for a target ISO date relative to now.
  remaining: function (iso) {
    var diff = Math.max(0, new Date(iso).getTime() - Date.now());
    var d = Math.floor(diff / 86400000); diff -= d * 86400000;
    var h = Math.floor(diff / 3600000); diff -= h * 3600000;
    var m = Math.floor(diff / 60000); diff -= m * 60000;
    var s = Math.floor(diff / 1000);
    return { d: d, h: h, m: m, s: s, done: new Date(iso).getTime() <= Date.now() };
  }
};
