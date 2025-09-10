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

// console.log('\n🔥 测试 HMR 热更新功能...');

// 导入HMR样式 - 测试CSS热更新
// import './hmr-styles.css';

// 导入HMR示例模块
import { createCounter, getMessage, updateMessage } from './hmr-example.js';

// 创建UI元素
const app = document.getElementById('app');
if (app) {
    // 清空现有内容但保留标题
    const title = app.querySelector('h1');
    app.innerHTML = '';
    if (title) {
        app.appendChild(title);
    }
    
    // 创建HMR演示区域
    const hmrDemo = document.createElement('div');
    hmrDemo.className = 'hmr-demo';
    
    const hmrTitle = document.createElement('h2');
    hmrTitle.className = 'hmr-title';
    hmrTitle.textContent = '🔥 HMR 热更新演示';
    hmrDemo.appendChild(hmrTitle);
    
    // 添加说明
    const instructions = document.createElement('div');
    instructions.className = 'hmr-instructions';
    instructions.innerHTML = `
        <p><strong>使用说明:</strong></p>
        <ol>
            <li>点击下面的按钮来增加计数</li>
            <li>修改 <code>src/hmr-example.js</code> 文件中的JavaScript代码</li>
            <li>修改 <code>src/hmr-styles.css</code> 文件中的CSS样式</li>
            <li>保存文件后观察页面的热更新效果</li>
            <li>注意计数状态在热更新后会被保留</li>
        </ol>
        <p><strong>🎨 CSS热更新提示:</strong> 尝试修改 hmr-styles.css 中的颜色、大小或动画效果！</p>
    `;
    hmrDemo.appendChild(instructions);
    
    // 添加计数器
    const counter = createCounter();
    counter.className = 'hmr-counter';
    counter.setAttribute('data-hmr-counter', 'true');
    hmrDemo.appendChild(counter);
    
    // 添加消息显示
    const messageDiv = document.createElement('div');
    messageDiv.className = 'hmr-message';
    messageDiv.innerHTML = `<strong>消息:</strong> ${getMessage()}`;
    hmrDemo.appendChild(messageDiv);
    
    // 添加更新消息的按钮
    const updateBtn = document.createElement('button');
    updateBtn.textContent = '更新消息';
    updateBtn.style.marginTop = '10px';
    updateBtn.style.padding = '8px 16px';
    updateBtn.style.backgroundColor = '#2196F3';
    updateBtn.style.color = 'white';
    updateBtn.style.border = 'none';
    updateBtn.style.borderRadius = '4px';
    updateBtn.style.cursor = 'pointer';
    
    updateBtn.addEventListener('click', () => {
        const newMessage = `随机消息 ${Math.floor(Math.random() * 1000)}`;
        updateMessage(newMessage);
        messageDiv.innerHTML = `<strong>消息:</strong> ${getMessage()}`;
    });
    hmrDemo.appendChild(updateBtn);
    
    app.appendChild(hmrDemo);
    
    // 全局状态更新处理器
    window.hmrStateUpdate = (state) => {
        messageDiv.innerHTML = `<strong>消息 (HMR更新):</strong> ${getMessage()}`;
        console.log('📊 [HMR] 状态已更新:', state);
    };
}

// HMR API使用示例 - 主模块
if (import.meta.hot) {
    console.log('🔥 [HMR] main.ts 支持热更新');
    
    // 接受自身更新
    import.meta.hot.accept(() => {
        console.log('🔄 [HMR] main.ts 已热更新');
    });
    
    // 接受依赖模块的更新
    import.meta.hot.accept(['./hmr-example.js'], ([newHmrModule]) => {
        console.log('📦 [HMR] hmr-example.js 依赖已更新');
        if (newHmrModule) {
            // 可以在这里处理依赖更新
            console.log('新模块已加载:', newHmrModule);
        }
    });
}

console.log('✅ HMR 功能演示已加载完成!');
