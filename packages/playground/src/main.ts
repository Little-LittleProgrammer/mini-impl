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
// import * as math from './math.js';
// console.log('📊 数学模块测试:');
// console.log('Addition: 5 + 3 =', math.add(5, 3));
// console.log('Subtraction: 5 - 3 =', math.subtract(5, 3));
// console.log('Multiplication: 5 * 3 =', math.multiply(5, 3));
// console.log('Division: 6 / 3 =', math.divide(6, 3));
// console.log('Constants - PI:', math.PI, 'E:', math.E);