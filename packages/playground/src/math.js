// CommonJS 模块示例
// math.js

// 导出加法函数
exports.add = function(a, b) {
    return a + b;
};

// 导出减法函数
exports.subtract = function(a, b) {
    return a - b;
};

// 导出乘法函数
exports.multiply = function(a, b) {
    return a * b;
};

// 导出除法函数
exports.divide = function(a, b) {
    if (b === 0) {
        throw new Error("Division by zero");
    }
    return a / b;
};

// 默认导出一个包含所有函数的对象
module.exports = {
    add: exports.add,
    subtract: exports.subtract,
    multiply: exports.multiply,
    divide: exports.divide
};