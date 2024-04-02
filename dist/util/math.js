"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customRound = void 0;
function customRound(num, decimalPlaces = 0) {
    var p = Math.pow(10, decimalPlaces);
    var n = (num * p) * (1 + Number.EPSILON);
    return Math.round(n) / p;
}
exports.customRound = customRound;
;
