// import Vue from 'mini-vue'
import './style.css'
// import * as  _ from 'lodash-es'
// import App from './App.vue'

// CommonJS 模块使用示例
const math = require('./math.js');
const calculator = require('./calculator.js');

// console.log(_.merge([1], [2, 3]));

console.log('Addition: 5 + 3 =', math.add(5, 3));
console.log('Subtraction: 5 - 3 =', math.subtract(5, 3));
console.log('Multiplication: 5 * 3 =', math.multiply(5, 3));
console.log('Division: 6 / 3 =', math.divide(6, 3));

// 使用更复杂的计算器模块
console.log('Formatted Addition: 5.5 + 3.7 =', calculator.addFormatted(5.5, 3.7));
console.log('Formatted Subtraction: 10.9 - 3.2 =', calculator.subtractFormatted(10.9, 3.2));
console.log('Formatted Multiplication: 4.5 * 2.2 =', calculator.multiplyFormatted(4.5, 2.2));
console.log('Formatted Division: 15.8 / 3.3 =', calculator.divideFormatted(15.8, 3.3));

// 随机计算示例
console.log('Random calculation:', calculator.randomCalc());
console.log('Random calculation:', calculator.randomCalc());
console.log('Random calculation:', calculator.randomCalc());

// Vue.createApp()
