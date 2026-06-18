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
      { text: "Mendoza is out of the league within 2 years", status: "pending" },
      { text: "Packers win the Super Bowl by 2029", status: "pending" }
    ]
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
