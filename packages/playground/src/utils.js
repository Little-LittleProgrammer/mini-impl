// CommonJS 模块示例 - 工具函数
// utils.js

// 导出格式化数字的函数
exports.formatNumber = function(num) {
    return Number(num).toFixed(2);
};

// 导出生成随机数的函数
exports.random = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

module.exports = {
    formatNumber: exports.formatNumber,
    random: exports.random
};