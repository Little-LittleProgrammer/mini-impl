console.log('🚀 Mini-Vite HMR 测试...')
import { getCount, increment, decrement } from './counter'

import {createApp, reactive, h} from 'mini-vue';

const APP = {
    setup() {
        const count = reactive({
            count: getCount()
        })
        return () => h('div', {
            style: {
                textAlign: 'center'
            }
        }, [
            h('h2', 'HMR 测试'),
            h('p', `Count: ${count.count}`),
            h('button', {
                onClick: () => {
                    count.count++
                }
            }, '+'),
            h('button', {
                onClick: () => {
                    count.count--
                }
            }, '-')
        ])
    }
}



// 创建一个简单的计数器来测试HMR
const app = createApp(APP);
app.mount('#app')
// HMR 测试
if (import.meta.hot) {
  console.log('HMR is enabled')
  
  // 接受自身更新
  import.meta.hot.accept((newModule) => {
    console.log('Module updated')
  })
  
  // 注册清理回调
  import.meta.hot.dispose(() => {
    console.log('Module disposed');
    app.unmount('#app')
  })
}