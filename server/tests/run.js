// Runs every *.test.js in this folder with Node's built-in test runner
// (no extra dependency, works on Node 18+ and on Windows without glob support).
const fs = require("fs");
const path = require("path");

fs.readdirSync(__dirname)
    .filter((file) => file.endsWith(".test.js"))
    .sort()
    .forEach((file) => require(path.join(__dirname, file)));
