"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const morgan_1 = __importDefault(require("morgan"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT;
app.use((0, morgan_1.default)('dev'));
app.get("/ping", (req, res, next) => {
    res.json("Pong!");
});
const routes_1 = require("./routes");
app.use("/api", routes_1.router);
app.use((req, res, next) => {
    console.error(`Page not found. "${req.path}" does not exist`);
    res.status(404).json({
        error: "Page not found",
        message: `"${req.path}" does not exist`
    });
});
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({
        error: err.name,
        message: err.message,
        stack: err.stack
    });
});
app.listen(port, () => {
    return console.log(`Express is listening at http://localhost:${port}`);
});
