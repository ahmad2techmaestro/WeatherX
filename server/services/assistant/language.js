/** Reply language: 'hi' for Hindi (Devanagari) or Hinglish (Hindi in Roman letters), otherwise 'en'. */
const DEVANAGARI = /[ऀ-ॿ]/;
const HINGLISH = /\b(kya|aaj|aj|kal|barish|baarish|mausam|hai|hain|mujhe|mera|meri|kaise|kab|nahi|nhi|chhata|chata|garmi|sardi|thanda|dhoop|hawa|kitna|kitni|kyun|kyu|bahar|jaana|jana|chahiye|batao|bataiye|ghar|abhi|aane|sakta|sakti|karun|karu|pehno|pahne|kapde)\b/i;

const detectLanguage = (text, preference) => {
    if (preference === "hi" || preference === "en") return preference;
    const t = String(text || "");
    if (DEVANAGARI.test(t)) return "hi";
    return (t.match(new RegExp(HINGLISH.source, "gi")) || []).length >= 1 ? "hi" : "en";
};

/** Hinglish in = Hinglish out: if the user typed Roman letters, don't answer in Devanagari. */
const scriptOf = (text) => (DEVANAGARI.test(String(text || "")) ? "devanagari" : "roman");

module.exports = { detectLanguage, scriptOf };
