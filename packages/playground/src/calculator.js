// CommonJS 模块示例 - 使用 module.exports

function Calculator() {
    this.result = 0;
}

Calculator.prototype.add = function(value) {
    this.result += value;
    return this;
};

Calculator.prototype.subtract = function(value) {
    this.result -= value;
    return this;
};

Calculator.prototype.multiply = function(value) {
    this.result *= value;
    return this;
};

Calculator.prototype.divide = function(value) {
    if (value === 0) {
        throw new Error('除数不能为零');
    }
    this.result /= value;
    return this;
};

Calculator.prototype.clear = function() {
    this.result = 0;
    return this;
};

Calculator.prototype.getValue = function() {
    return this.result;
};

// 工具函数
function createCalculator() {
    return new Calculator();
}

// 使用 module.exports 导出
module.exports = {  Calculator: Calculator, createCalculator: createCalculator};

console.log('Calculator 模块已加载');