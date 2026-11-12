/**
 * Offline evaluation of the deterministic parts of the AI layer (no network, no API key, no database).
 *   npm run eval            human-readable scorecard, exit code 1 if a threshold is missed
 *   npm run eval -- --json  machine-readable
 * It cannot measure Gemini's own answer quality; it measures the guard rails and routers around it.
 */
process.env.RAG_EMBEDDINGS = "local";
const C = require("./cases");
const supervisor = require("../services/agents/supervisor");
const rag = require("../services/rag/rag");
const guard = require("../services/security/guard");
const { numbersAreGrounded } = require("../services/prediction/explain");

const rate = (ok, n) => (n ? ok / n : 1);

const suites = {
    async router() {
        const misses = [];
        let ok = 0;
        for (const [goal, need] of C.ROUTER) {
            const got = supervisor.rulePlan(goal).agents;
            need.every((a) => got.includes(a)) ? ok++ : misses.push({ input: goal, expected: need, got });
        }
        return { name: "Supervisor routing (keyword router)", metric: "accuracy", score: rate(ok, C.ROUTER.length), n: C.ROUTER.length, threshold: 0.85, misses };
    },
    async retrieval() {
        const misses = [];
        let top1 = 0, top3 = 0;
        for (const [q, id] of C.RAG) {
            const ids = (await rag.retrieve(q, 3)).results.map((r) => r.id);
            if (ids[0] === id) top1++;
            ids.includes(id) ? top3++ : misses.push({ input: q, expected: id, got: ids });
        }
        return [
            { name: "RAG retrieval, local embeddings", metric: "hit@3", score: rate(top3, C.RAG.length), n: C.RAG.length, threshold: 0.8, misses },
            { name: "RAG retrieval, local embeddings", metric: "hit@1", score: rate(top1, C.RAG.length), n: C.RAG.length, threshold: null, misses: [] },
        ];
    },
    async injection() {
        const missed = C.INJECTION_BAD.filter((t) => !guard.looksLikeInjection(t));
        const falsePos = C.INJECTION_GOOD.filter((t) => guard.looksLikeInjection(t));
        return [
            { name: "Prompt-injection detection", metric: "recall", score: rate(C.INJECTION_BAD.length - missed.length, C.INJECTION_BAD.length), n: C.INJECTION_BAD.length, threshold: 0.85, misses: missed.map((input) => ({ input })) },
            { name: "Prompt-injection detection", metric: "no false alarms", score: rate(C.INJECTION_GOOD.length - falsePos.length, C.INJECTION_GOOD.length), n: C.INJECTION_GOOD.length, threshold: 1, misses: falsePos.map((input) => ({ input })) },
        ];
    },
    async grounding() {
        const misses = C.GROUNDING.filter(([t, want]) => numbersAreGrounded(t, C.FINDINGS) !== want).map(([input, want]) => ({ input, expected: want }));
        return { name: "Number grounding check (hallucinated figures rejected)", metric: "accuracy", score: rate(C.GROUNDING.length - misses.length, C.GROUNDING.length), n: C.GROUNDING.length, threshold: 1, misses };
    },
    async leaks() {
        const misses = C.LEAKS.filter(([t, want]) => guard.leaksPrompt(t) !== want).map(([input, want]) => ({ input, expected: want }));
        return { name: "Prompt/secret leak guard", metric: "accuracy", score: rate(C.LEAKS.length - misses.length, C.LEAKS.length), n: C.LEAKS.length, threshold: 1, misses };
    },
};

const runAll = async () => {
    const results = [];
    for (const fn of Object.values(suites)) results.push(...[].concat(await fn()));
    const failed = results.filter((r) => r.threshold != null && r.score < r.threshold);
    return { results, failed: failed.length, passed: failed.length === 0 };
};

module.exports = { runAll };

if (require.main === module) {
    runAll().then((rep) => {
        if (process.argv.includes("--json")) return console.log(JSON.stringify(rep, null, 2));
        for (const r of rep.results) {
            const flag = r.threshold == null ? "info" : r.score >= r.threshold ? "PASS" : "FAIL";
            console.log(`${flag.padEnd(5)} ${r.name} - ${r.metric}: ${(r.score * 100).toFixed(0)}% (${r.n} cases${r.threshold != null ? `, need ${(r.threshold * 100).toFixed(0)}%` : ""})`);
            for (const m of r.misses) console.log(`        miss: ${JSON.stringify(m)}`);
        }
        console.log(rep.passed ? "\nAll thresholds met." : `\n${rep.failed} threshold(s) missed.`);
        process.exit(rep.passed ? 0 : 1);
    });
}
