// CommonJS 模块示例
// 使用 exports.xxx 导出

// 基础数学运算
exports.add = function(a, b) {
    return a + b;
};

exports.subtract = function(a, b) {
    return a - b;
};

exports.multiply = function(a, b) {
    return a * b;
};

exports.divide = function(a, b) {
    if (b === 0) {
        throw new Error('除数不能为零');
    }
    return a / b;
};

// 常量导出
exports.PI = 3.14159;
exports.E = 2.71828;

console.log('CommonJS math 模块已加载');