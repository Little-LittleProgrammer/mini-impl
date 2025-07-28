// calculator.js - 使用其他模块的 CommonJS 示例

// 引入我们自己创建的模块
const math = require('./math.js');
const utils = require('./utils.js');

// 创建计算器对象
const calculator = {
    // 带格式化的加法
    addFormatted: function(a, b) {
        const result = math.add(a, b);
        return utils.formatNumber(result);
    },
    
    // 带格式化的减法
    subtractFormatted: function(a, b) {
        const result = math.subtract(a, b);
        return utils.formatNumber(result);
    },
    
    // 带格式化的乘法
    multiplyFormatted: function(a, b) {
        const result = math.multiply(a, b);
        return utils.formatNumber(result);
    },
    
    // 带格式化的除法
    divideFormatted: function(a, b) {
        const result = math.divide(a, b);
        return utils.formatNumber(result);
    },
    
    // 随机计算
    randomCalc: function() {
        const a = utils.random(1, 100);
        const b = utils.random(1, 100);
        const ops = ['+', '-', '*', '/'];
        const op = ops[utils.random(0, 3)];
        
        let result;
        switch(op) {
            case '+': result = math.add(a, b); break;
            case '-': result = math.subtract(a, b); break;
            case '*': result = math.multiply(a, b); break;
            case '/': result = math.divide(a, b); break;
        }
        
        return `${a} ${op} ${b} = ${utils.formatNumber(result)}`;
    }
};

// 导出计算器
module.exports = calculator;