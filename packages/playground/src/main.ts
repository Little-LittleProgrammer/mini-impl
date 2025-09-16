import './style.css'
import { getCount, increment, decrement } from './counter.js'

console.log('🚀 Mini-Vite HMR 测试...')

// 创建一个简单的计数器来测试HMR
const counter = document.createElement('div')
counter.id = 'counter'
counter.innerHTML = `
  <h2>HMR 测试</h2>
  <p>Count: <span id="count">${getCount()}</span></p>
  <button id="increment">+</button>
  <button id="decrement">-</button>
`

document.body.appendChild(counter)

const countEl = document.getElementById('count')
const incrementBtn = document.getElementById('increment')
const decrementBtn = document.getElementById('decrement')

incrementBtn.addEventListener('click', () => {
  const newCount = increment()
  countEl.textContent = newCount.toString()
  console.log('Count incremented:', newCount)
})

decrementBtn.addEventListener('click', () => {
  const newCount = decrement()
  countEl.textContent = newCount.toString()
  console.log('Count decremented:', newCount)
})

// HMR 测试
if (import.meta.hot) {
  console.log('HMR is enabled')
  
  // 接受自身更新
  import.meta.hot.accept((newModule) => {
    console.log('Module updated')
  })
  
  // 注册清理回调
  import.meta.hot.dispose(() => {
    console.log('Module disposed')
  })
}