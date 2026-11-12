/** Strips control characters and extra whitespace from tool input. */
const clean = (s) => String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
module.exports = { clean };
