const { cosine } = require("./embeddings");

/** Highest-scoring items by cosine similarity. Items need { vector }. */
const topK = (queryVector, items, k = 4, minScore = 0) =>
    items
        .map((item) => ({ item, score: cosine(queryVector, item.vector) }))
        .filter((r) => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);

module.exports = { topK };
