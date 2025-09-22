// counter.js - 一个简单的计数器模块，用于测试HMR

let count = 0

export function getCount() {
    console.log('🚀 Mini-Vite getCount...', count)
  return count
}

export function increment() {
  count++
  return count
}

export function decrement() {
  count--
  return count
}

// HMR支持
if (import.meta.hot) {
  // 保存模块状态
  import.meta.hot.data = import.meta.hot.data || {}
  import.meta.hot.data.count = count
  
  // 接受自身更新
  import.meta.hot.accept((newModule) => {
    console.log('[counter.js] 模块已更新')
    // 恢复状态
    if (import.meta.hot && import.meta.hot.data) {
      count = import.meta.hot.data.count || 0
    }
  })
  
  // 注册清理回调
  import.meta.hot.dispose(() => {
    console.log('[counter.js] 模块被清理')
    // 保存状态
    if (import.meta.hot) {
      import.meta.hot.data = import.meta.hot.data || {}
      import.meta.hot.data.count = count
    }
  })
}