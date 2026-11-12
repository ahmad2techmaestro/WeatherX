/** Recent agent runs, kept in memory (cleared on restart) so the Agent Center can show what each agent did. */
const MAX = 60;
const runs = [];

const record = (run) => {
    runs.unshift(run);
    if (runs.length > MAX) runs.length = MAX;
    return run;
};
const recent = (user, n = 12) => runs.filter((r) => r.user === user).slice(0, n).map(({ user: _u, ...r }) => r);
const stats = (user) => {
    const mine = runs.filter((r) => r.user === user);
    const by = {};
    for (const r of mine) for (const s of r.steps) if (s.agent !== "supervisor") { const a = (by[s.agent] ||= { runs: 0, errors: 0, ms: 0 }); a.runs++; a.ms += s.ms; if (s.status === "error") a.errors++; }
    return { runs: mine.length, agents: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { runs: v.runs, errors: v.errors, avgMs: Math.round(v.ms / v.runs) }])) };
};
const __clear = () => { runs.length = 0; };

module.exports = { record, recent, stats, __clear };
