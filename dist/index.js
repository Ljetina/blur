"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const auth_1 = require("./lib/auth");
const app = (0, express_1.default)();
(0, auth_1.addAuthRoutes)(app);
app.listen(3001);
//# sourceMappingURL=index.js.map