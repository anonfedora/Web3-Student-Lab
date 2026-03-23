"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_routes_1 = __importDefault(require("./routes/auth/auth.routes"));
const learning_routes_1 = __importDefault(require("./routes/learning/learning.routes"));
dotenv_1.default.config();
exports.app = (0, express_1.default)();
const port = process.env.PORT || 8080;
exports.app.use((0, cors_1.default)());
exports.app.use(express_1.default.json());
exports.app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Web3 Student Lab Backend is running' });
});
// API Routes
exports.app.use('/api/auth', auth_routes_1.default);
exports.app.use('/api/learning', learning_routes_1.default);
if (process.env.NODE_ENV !== 'test') {
    exports.app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}
//# sourceMappingURL=index.js.map