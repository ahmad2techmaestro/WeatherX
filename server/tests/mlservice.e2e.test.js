// Starts the REAL Python ML service and talks to it through the Node client.
// Skipped automatically when python3/fastapi/uvicorn are not installed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const dir = path.join(__dirname, "..", "..", "ml-service");
const have = spawnSync("python3", ["-c", "import fastapi, uvicorn, sklearn, PIL, numpy"], { cwd: dir }).status === 0;
const PORT = 18991;

test("ML service e2e (real Python process)", { skip: !have && "python3 + ml-service requirements not installed" }, async (t) => {
    const proc = spawn("python3", ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(PORT)], { cwd: dir, stdio: "ignore" });
    t.after(() => proc.kill());
    const prev = process.env.ML_SERVICE_URL;
    process.env.ML_SERVICE_URL = `http://127.0.0.1:${PORT}`;
    t.after(() => { if (prev === undefined) delete process.env.ML_SERVICE_URL; else process.env.ML_SERVICE_URL = prev; });
    const client = require("../services/ml/client");

    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
        up = (await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.ok).catch(() => false));
        if (!up) await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(up, "service did not start");

    const history = Array.from({ length: 120 }, (_, i) => ({ date: `2024-06-${String((i % 28) + 1).padStart(2, "0")}`, tmax: 33 + ((i * 7) % 5) - 2, tmin: 24 + ((i * 3) % 4) - 1.5 }));
    const out = await client.anomaly({ history, days: [{ date: "2025-06-10", tmax: 33, tmin: 24 }, { date: "2025-06-11", tmax: 47, tmin: 33 }] });
    assert.equal(out.days.length, 2);
    assert.doesNotMatch(JSON.stringify(out), /NaN/);
    assert.equal(out.days[1].level, "extreme");
});
