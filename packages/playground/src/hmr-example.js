// HMR示例文件 - 展示如何使用热更新功能

let count = 0;

export function createCounter() {
    const button = document.createElement('button');
    button.textContent = `点击次数: ${count}`;
    button.style.padding = '10px 20px';
    button.style.margin = '10px';
    button.style.fontSize = '16px';
    button.style.backgroundColor = '#4CAF50';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    
    button.addEventListener('click', () => {
        count++;
        button.textContent = `点击次数: ${count}`;
        console.log(`计数器被点击了 ${count} 次`);
    });
    
    return button;
}

// 状态存储
let state = {
    message: 'Hello HMR! 🔥',
    timestamp: new Date().toLocaleTimeString()
};

export function getMessage() {
    return `${state.message} (更新时间: ${state.timestamp})`;
}

export function updateMessage(newMessage) {
    state.message = newMessage;
    state.timestamp = new Date().toLocaleTimeString();
}

// HMR API使用示例
if (import.meta.hot) {
    // 方式1: 接受自身模块的更新，并提供更新回调
    import.meta.hot.accept((newModule) => {
        console.log('🔥 [HMR] hmr-example.js 模块已热更新!', newModule);
        
        // 保存当前状态
        const currentState = { count, ...state };
        
        // 更新 DOM
        const existingButtons = document.querySelectorAll('button[data-hmr-counter]');
        existingButtons.forEach(button => {
            button.textContent = `点击次数: ${count} (已热更新111)`;
            button.style.backgroundColor = '#FF6B6B'; // 改变颜色表示更新
            
            // 2秒后恢复原色
            setTimeout(() => {
                button.style.backgroundColor = '#4CAF50';
            }, 2000);
        });
        
        // 通知其他模块状态已更新
        if (window.hmrStateUpdate) {
            window.hmrStateUpdate(currentState);
        }
        
        // 如果有新的模块内容，可以在这里处理
        if (newModule && newModule.getMessage) {
            console.log('📦 [HMR] 新模块的消息:', newModule.getMessage());
        }
    });
    
    // 其他 accept 方法使用示例（注释演示）:
    /*
    // 方式1: import.meta.hot.accept() - 接受自身更新，无回调
    import.meta.hot.accept();
    
    // 方式2: import.meta.hot.accept(callback) - 接受自身更新，有回调 (上面已使用)
    import.meta.hot.accept((newModule) => {
        console.log('自身模块更新', newModule);
    });
    
    // 方式3: import.meta.hot.accept(dep, callback) - 接受单个依赖更新
    import.meta.hot.accept('./utils.js', (newUtilsModule) => {
        console.log('utils.js 依赖更新', newUtilsModule);
        // 处理依赖更新逻辑
    });
    
    // 方式4: import.meta.hot.accept([deps], callback) - 接受多个依赖更新
    import.meta.hot.accept(['./utils.js', './helpers.js'], ([newUtils, newHelpers]) => {
        console.log('多个依赖更新', { newUtils, newHelpers });
        // 处理多个依赖更新逻辑
    });
    */
    
    // 模块被卸载时的清理工作
    import.meta.hot.dispose(() => {
        console.log('🧹 [HMR] 清理 hmr-example.js 模块');
        
        // 保存状态到热更新数据中
        if (import.meta.hot.data) {
            import.meta.hot.data.count = count;
            import.meta.hot.data.state = state;
        }
    });
    
    // 从上次热更新中恢复状态
    if (import.meta.hot.data) {
        if (typeof import.meta.hot.data.count === 'number') {
            count = import.meta.hot.data.count;
        }
        if (import.meta.hot.data.state) {
            state = { ...state, ...import.meta.hot.data.state };
        }
        console.log('📦 [HMR] 状态已从热更新数据中恢复:', { count, state });
    }
}

// 导出当前状态供其他模块使用
export { count, state };

console.log('✨ hmr-example.js 模块已加载，当前计数:', count);
