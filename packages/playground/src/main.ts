// import Vue from 'mini-vue'
// import './style.css'
// import * as  _ from 'lodash-es'
// import App from './App.vue'
// import { createApp, reactive, h } from 'mini-vue'

// console.log('🚀 测试 Vue 模块支持...');
// const APP = {
//     setup() {
//       const obj = reactive({
//         name: 'this is mini-vue, count: ',
//         count: 0
//       })

//       return () => h('div', [
//         h('span', obj.name),
//         h('span', obj.count),
//         h('div', h('button', {
//             onClick: () => {
//                 obj.count++;
//             }
//         }, 'click me'))
//       ])
//     }
// }
// // 通过 createAPP 标记挂载组件
// const app = createApp(APP)
// // 挂载位置
// app.mount('#app')
// console.log(`app 挂载成功`)

// console.log('🚀 测试 ESM 模块支持...');
// console.log(_.merge([1], [2, 3]));

// console.log('🚀 测试 CommonJS 模块支持...');
// 测试 1: ES 模块导入 CommonJS (exports.xxx)
import * as math from './math.js';
console.log('📊 数学模块测试:');
console.log('Addition: 5 + 3 =', math.add(5, 3));
console.log('Subtraction: 5 - 3 =', math.subtract(5, 3));
console.log('Multiplication: 5 * 3 =', math.multiply(5, 3));
console.log('Division: 6 / 3 =', math.divide(6, 3));
console.log('Constants - PI:', math.PI, 'E:', math.E);

// // 测试 2: ES 模块导入 CommonJS (module.exports)
// import calculatorModule from './calculator.js';
// const { Calculator, createCalculator } = calculatorModule;

// console.log('\n🧮 计算器模块测试:');

// const calc = createCalculator();
// const result = calc.add(10).multiply(2).subtract(5).divide(3).getValue();
// console.log('链式计算 (10 * 2 - 5) / 3 =', result);

// // 测试 3: 使用构造函数
// const calc2 = new Calculator();
// calc2.add(100).multiply(0.1);
// console.log('构造函数测试: 100 * 0.1 =', calc2.getValue());

// // 测试 4: 模拟 require() 调用（如果支持的话）
// try {
//     console.log('\n📦 测试 require() 支持（实验性）:');
//     // 注意：这里的 require 是我们在 CommonJS 插件中提供的 polyfill
//     // const mathRequired = require('./math.js');
//     // console.log('require() test - math.add(1, 2):', mathRequired.add ? mathRequired.add(1, 2) : 'require() polyfill 激活');
// } catch (e) {
//     console.log('require() 测试失败:', e.message);
// }

// console.log('\n✅ CommonJS 模块测试完成!');

// // Vue.createApp()
