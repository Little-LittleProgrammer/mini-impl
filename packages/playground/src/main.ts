import './style.css'
import math from './math.js'

// 测试 cjs 模块

math.add(1, 2)
console.log('🚀 Mini-Vite cjs模块 插件测试...', math.add(1, 2))

// 测试 css 插件
console.log('🚀 Mini-Vite css 插件测试...')
import './style.css'

// 测试预构建
import {add} from 'lodash-es'
console.log('🚀 Mini-Vite 预构建测试...', add(1, 2))

// 测试 hmr 
import './hmr'