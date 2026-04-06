# ref 响应式引用详解

`ref` 是 Vue 3 响应式系统的重要 API，用于创建**响应式引用**，特别适合处理基本类型（字符串、数字、布尔值）的响应式数据。

## 基本用法

### 创建 ref

```javascript
import { ref } from 'mini-vue'

// 基本类型
const count = ref(0)
const name = ref('张三')
const isActive = ref(true)

// 对象
const user = ref({ name: '张三', age: 20 })

// 访问值需要 .value
count.value++
console.log(name.value)
```

### 在模板中使用

```javascript
const count = ref(0)

const App = {
  setup() {
    return { count }
  },
  render() {
    // 模板中自动解包，不需要 .value
    return h('div', count.value)
  }
}
```

## ref 实现原理

### Ref 类

```typescript
// packages/reactivity/src/ref.ts

export class Ref<T> {
  private _value: T
  public readonly __v_isRef = true

  constructor(value: T) {
    this._value = toReactive(value)
  }

  get value() {
    // 收集依赖
    trackRefValue(this)
    return this._value
  }

  set value(newValue) {
    this._value = toReactive(newValue)
    // 触发更新
    triggerRefValue(this)
  }
}
```

### 创建 ref

```typescript
export function ref(value?: any) {
  return new Ref(value)
}
```

## 自动解包

### 在模板中自动解包

```javascript
// 模板编译后
const _count = ref._value

// 自动访问 .value
h('div', _count.value)
```

### ref 嵌套

```javascript
const count = ref(0)

// ref 作为 reactive 对象的属性时自动解包
const state = reactive({
  count
})

console.log(state.count) // 0 - 自动解包
console.log(state.count === count.value) // true
```

### computed 中的 ref

```javascript
const count = ref(0)
const double = computed(() => count.value * 2)

// computed 返回的也是 ref，自动解包
const obj = {
  double // 自动解包
}
```

## 响应式追踪

### trackRefValue

```typescript
// 收集 ref 的依赖
export function trackRefValue(ref) {
  if (activeEffect) {
    // 将当前 effect 添加到 ref 的 dep 中
    if (ref.dep) {
      ref.dep.add(activeEffect)
    } else {
      ref.dep = createDep()
      ref.dep.add(activeEffect)
    }
  }
}
```

### triggerRefValue

```typescript
// 触发 ref 的依赖
export function triggerRefValue(ref) {
  if (ref.dep) {
    triggerEffects(ref.dep)
  }
}
```

## shallowRef

`shallowRef` 创建一个浅层响应式 ref，只监听 `.value` 的替换：

```typescript
export function shallowRef(value) {
  return new ShallowRef(value)
}

export class ShallowRef<T> {
  private _value: T
  public readonly __v_isRef = true

  constructor(value: T) {
    this._value = value // 不转换为响应式
  }

  get value() {
    trackRefValue(this)
    return this._value
  }

  set value(newValue) {
    this._value = newValue
    triggerRefValue(this)
  }
}
```

### ref vs shallowRef

```javascript
const refObj = ref({ count: 0 })
refObj.value.count++ // 响应式

const shallowObj = shallowRef({ count: 0 })
shallowObj.value.count++ // 不是响应式！
shallowObj.value = { count: 1 } // 响应式
```

## toRef 和 toRefs

### toRef

将 reactive 对象的属性转换为 ref：

```javascript
const state = reactive({ count: 0 })

// 创建一个与原响应式对象关联的 ref
const countRef = toRef(state, 'count')

countRef.value++ // 同时更新 state.count
state.count++ // 同时更新 countRef.value
```

### toRefs

将 reactive 对象的所有属性转换为 ref：

```javascript
const state = reactive({ a: 1, b: 2 })

// 转换为普通对象，每个属性都是 ref
const { a, b } = toRefs(state)

console.log(a.value) // 1
```

## 源码解析

### 完整 ref 实现

```typescript
// packages/reactivity/src/ref.ts

// ref 主函数
export function ref(value?: any) {
  return new Ref(value)
}

// Ref 类
export class Ref<T = any> {
  private _value: T

  // 标记为 ref
  public readonly __v_isRef = true

  // 依赖收集器
  dep: Dep = undefined

  constructor(value: T) {
    // 基本类型直接存储，对象转为响应式
    this._value = isObject(value) ? reactive(value) : value
  }

  // 读取值时收集依赖
  get value() {
    trackRefValue(this)
    return this._value
  }

  // 设置值时触发更新
  set value(newValue) {
    this._value = isObject(newValue) ? reactive(newValue) : newValue
    triggerRefValue(this)
  }
}

// 依赖收集
export function trackRefValue(ref) {
  if (activeEffect) {
    if (!ref.dep) {
      ref.dep = createDep()
    }
    ref.dep.add(activeEffect)
  }
}

// 触发更新
export function triggerRefValue(ref) {
  if (ref.dep) {
    triggerEffects(ref.dep)
  }
}
```

## 使用场景

### 1. 基本类型响应式

```javascript
// 字符串
const message = ref('Hello')

// 数字
const count = ref(0)

// 布尔值
const isLoading = ref(false)
```

### 2. 状态管理

```javascript
import { ref } from 'mini-vue'

// 简单的状态管理
const count = ref(0)

function increment() {
  count.value++
}
```

### 3. 模板引用

```javascript
const inputRef = ref(null)

// 在 mounted 后访问 DOM
onMounted(() => {
  console.log(inputRef.value) // <input> 元素
})

// 模板
// <input ref="inputRef">
```

## 与 reactive 的对比

| 特性 | ref | reactive |
|------|-----|----------|
| 数据类型 | 任意类型 | 对象 |
| 访问方式 | .value | 直接属性 |
| 重新赋值 | 替换整个值 | 替换整个对象 |
| 数组操作 | .value.push() | 数组方法 |

```javascript
// ref
const arr = ref([])
arr.value.push(1) // 需要 .value

// reactive
const arr = reactive([])
arr.push(1) // 直接使用
```

## 总结

ref 的核心设计：

1. **对象包装**：将基本类型包装为对象
2. **自动解包**：模板中自动访问 .value
3. **依赖追踪**：通过 trackRefValue 收集依赖
4. **触发更新**：通过 triggerRefValue 触发更新
5. **浅层响应式**：shallowRef 提供浅层响应式
6. **双向绑定**：与 reactive 相互配合
