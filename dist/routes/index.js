"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
exports.router = (0, express_1.Router)();
const pitcher_1 = __importDefault(require("./pitcher"));
const hitter_1 = __importDefault(require("./hitter"));
const game_1 = __importDefault(require("./game"));
exports.router.use('/pitcher', pitcher_1.default);
exports.router.use('/hitter', hitter_1.default);
exports.router.use('/game', game_1.default);
