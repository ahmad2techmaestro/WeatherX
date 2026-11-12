/** Workflow persistence. Mongo by default; tests swap in an in-memory store with the same methods. */
const MAX_PER_USER = 8;

const mongoStore = () => {
    const Workflow = require("../../models/Workflow");
    const plain = (d) => d && { ...d, id: String(d._id), user: String(d.user) };
    return {
        async list(user) { return (await Workflow.find({ user }).sort({ createdAt: 1 }).lean()).map(plain); },
        async listEnabled(limit = 200) { return (await Workflow.find({ enabled: true }).sort({ lastRunAt: 1 }).limit(limit).lean()).map(plain); },
        async get(user, id) { return /^[0-9a-f]{24}$/i.test(id) ? plain(await Workflow.findOne({ _id: id, user }).lean()) : null; },
        async create(doc) { return plain((await Workflow.create(doc)).toObject()); },
        async update(user, id, patch) { return plain(await Workflow.findOneAndUpdate({ _id: id, user }, { $set: patch }, { new: true }).lean()); },
        async remove(user, id) { return /^[0-9a-f]{24}$/i.test(id) && (await Workflow.deleteOne({ _id: id, user })).deletedCount > 0; },
    };
};
let store = null;
const getStore = () => store || (store = mongoStore());
const __setStoreForTests = (s) => { store = s; };

module.exports = { getStore, __setStoreForTests, MAX_PER_USER };
