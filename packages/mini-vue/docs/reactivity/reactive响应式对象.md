# reactive 响应式对象

## reactive() 是什么？

`reactive()` 返回对象的响应式代理。响应式转换是"深层"的——它影响所有嵌套对象。

```typescript
import { reactive } from 'vue'

const state = reactive({
  count: 0,
  nested: {
    value: 'hello'
  }
})

// 触发更新
state.count++
state.nested.value = 'world'  // 深层响应式
```

## 为什么使用 Proxy？

在 Vue 2 中，使用 `Object.defineProperty` 实现响应式，有以下限制：

1. **无法检测对象属性的添加或删除**
2. **无法检测数组索引赋值**
3. **需要遍历对象的每个属性进行转换**

Vue 3 使用 `Proxy` 解决了这些问题：

```typescript
// Vue 2 的问题
const obj = {}
Object.defineProperty(obj, 'count', {
  get() { return this._count },
  set(val) { this._count = val }
})
obj.newProp = 'value'  // 不是响应式的

// Vue 3 的解决方案
const state = reactive({})
state.newProp = 'value'  // 响应式的！
```

## Proxy 基础

### Proxy 语法

```typescript
const proxy = new Proxy(target, handler)

// target: 要代理的原始对象
// handler: 定义拦截操作的陷阱（trap）
```

### 常用陷阱

```typescript
const obj = { count: 0 }

const proxy = new Proxy(obj, {
  // 拦截属性读取
  get(target, key, receiver) {
    console.log(`读取 ${String(key)}`)
    return Reflect.get(target, key, receiver)
  },

  // 拦截属性设置
  set(target, key, value, receiver) {
    console.log(`设置 ${String(key)} = ${value}`)
    return Reflect.get(target, key, value, receiver)
  },

  // 拦截属性检查
  has(target, key) {
    console.log(`检查 ${String(key)} 是否存在`)
    return Reflect.has(target, key)
  },

  // 拦截属性删除
  deleteProperty(target, key) {
    console.log(`删除 ${String(key)}`)
    return Reflect.deleteProperty(target, key)
  }
})
```

## reactive() 实现

### 核心代码

```typescript
// packages/reactivity/src/reactive.ts

// 响应式标记
export const enum ReactiveFlags {
  IS_REACTIVE = '__v_isReactive',
  IS_READONLY = '__v_isReadonly',
  RAW = '__v_raw'
}

// 缓存：避免重复代理
const reactiveMap = new WeakMap<any, any>()

export function reactive<T extends object>(target: T): T {
  // 只能代理对象
  if (!isObject(target)) {
    return target
  }

  // 如果已经是响应式的，直接返回
  if (target[ReactiveFlags.IS_REACTIVE]) {
    return target
  }

  // 检查缓存
  const existingProxy = reactiveMap.get(target)
  if (existingProxy) {
    return existingProxy
  }

  // 创建代理
  const proxy = new Proxy(target, mutableHandlers)

  // 存入缓存
  reactiveMap.set(target, proxy)

  return proxy
}
```

### mutableHandlers

```typescript
// packages/reactivity/src/baseHandlers.ts

export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}
```

### get 拦截器

```typescript
function get(
  target: object,
  key: string | symbol,
  receiver: object
) {
  // 处理 ReactiveFlags
  if (key === ReactiveFlags.IS_REACTIVE) {
    return true
  }
  if (key === ReactiveFlags.RAW) {
    return target
  }

  // 获取值
  const result = Reflect.get(target, key, receiver)

  // 依赖收集
  track(target, key)

  // 深层响应式
  if (isObject(result)) {
    return reactive(result)
  }

  return result
}
```

### set 拦截器

```typescript
function set(
  target: object,
  key: string | symbol,
  value: unknown,
  receiver: object
) {
  const oldValue = (target as any)[key]

  // 判断是添加还是修改
  const hadKey = Array.isArray(target)
    ? Number(key) < target.length
    : Object.prototype.hasOwnProperty.call(target, key)

  // 设置值
  const result = Reflect.set(target, key, value, receiver)

  // 触发更新
  if (!hadKey) {
    // 添加属性
    trigger(target, TriggerOpTypes.ADD, key, value)
  } else if (hasChanged(value, oldValue)) {
    // 修改属性
    trigger(target, TriggerOpTypes.SET, key, value, oldValue)
  }

  return result
}
```

### deleteProperty 拦截器

```typescript
function deleteProperty(
  target: object,
  key: string | symbol
): boolean {
  const hadKey = Object.prototype.hasOwnProperty.call(target, key)
  const oldValue = (target as any)[key]

  // 删除属性
  const result = Reflect.deleteProperty(target, key)

  if (result && hadKey) {
    // 触发更新
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }

  return result
}
```

## 深层响应式

当访问嵌套对象时，`get` 拦截器会自动将其转换为响应式。

```typescript
const state = reactive({
  nested: {
    value: 'hello'
  }
})

// 访问 state.nested 时
// get 拦截器检测到 nested 是对象
// 自动调用 reactive(nested) 返回代理
state.nested.value = 'world'
```

### 为什么是懒加载？

深层响应式是"懒加载"的，只有访问到嵌套对象时才转换为响应式。这样可以：
1. 减少初始化开销
2. 只代理实际用到的属性

## 避免重复代理

### 问题

```typescript
const original = { count: 0 }
const proxy1 = reactive(original)
const proxy2 = reactive(proxy1)  // 应该返回 proxy1

console.log(proxy1 === proxy2)  // 应该是 true
```

### 解决方案

```typescript
function get(target, key, receiver) {
  // 如果访问 IS_REACTIVE 标记，返回 true
  if (key === ReactiveFlags.IS_REACTIVE) {
    return true
  }
  // ...
}

function reactive(target) {
  // 如果已经是响应式对象，直接返回
  if (target[ReactiveFlags.IS_REACTIVE]) {
    return target
  }
  // ...
}
```

## 获取原始对象

使用 `toRaw()` 获取代理的原始对象。

```typescript
import { reactive, toRaw } from 'vue'

const original = { count: 0 }
const proxy = reactive(original)

console.log(toRaw(proxy) === original)  // true
```

### 实现

```typescript
export function toRaw<T>(observed: T): T {
  // 如果有 RAW 标记，返回原始对象
  const raw = observed && (observed as any)[ReactiveFlags.RAW]
  return raw ? toRaw(raw) : observed
}
```

### 使用场景

1. **比较两个对象是否相同**

```typescript
const obj1 = reactive({ count: 0 })
const obj2 = reactive({ count: 0 })

// 错误：proxy !== proxy
console.log(obj1 === obj2)  // false

// 正确：比较原始对象
console.log(toRaw(obj1) === toRaw(obj2))  // false，但原始对象不同
```

2. **避免响应式污染**

```typescript
const state = reactive({ list: [] })

// 添加元素时，确保不是响应式对象
function addItem(item) {
  state.list.push(toRaw(item))
}
```

## 只读代理

使用 `readonly()` 创建只读代理。

```typescript
import { readonly } from 'vue'

const original = { count: 0 }
const readonlyState = readonly(original)

readonlyState.count++  // 警告：Set operation on key "count" failed
```

### 实现

```typescript
export function readonly<T extends object>(target: T): T {
  return createReactiveObject(target, readonlyHandlers, readonlyMap)
}

const readonlyHandlers: ProxyHandler<object> = {
  get(target, key, receiver) {
    if (key === ReactiveFlags.IS_READONLY) {
      return true
    }
    return Reflect.get(target, key, receiver)
  },

  set(target, key, value) {
    console.warn(`Set operation on key "${String(key)}" failed: target is readonly.`)
    return true
  },

  deleteProperty(target, key) {
    console.warn(`Delete operation on key "${String(key)}" failed: target is readonly.`)
    return true
  }
}
```

## shallowReactive

创建浅层响应式代理，只有根级别是响应式的。

```typescript
import { shallowReactive } from 'vue'

const state = shallowReactive({
  count: 0,
  nested: {
    value: 'hello'
  }
})

state.count++  // 响应式
state.nested.value = 'world'  // 不是响应式！
```

### 实现

```typescript
export function shallowReactive<T extends object>(target: T): T {
  return createReactiveObject(target, shallowReactiveHandlers, shallowReactiveMap)
}

const shallowReactiveHandlers = {
  get(target, key, receiver) {
    track(target, key)
    return Reflect.get(target, key, receiver)
    // 注意：不再递归转换为响应式
  },
  set(target, key, value, receiver) {
    // ...
  }
}
```

## 数组的响应式

Vue 3 对数组有特殊处理。

### 索引访问

```typescript
const arr = reactive([1, 2, 3])

arr[0] = 10  // 响应式（Vue 2 不支持）
console.log(arr[0])  // 10
```

### 长度修改

```typescript
const arr = reactive([1, 2, 3])

arr.length = 1  // 响应式，触发更新
```

### 数组方法

数组的方法（push、pop、splice 等）都能正确触发更新。

```typescript
const arr = reactive([1, 2, 3])

arr.push(4)   // 响应式
arr.pop()     // 响应式
arr.splice(0, 1)  // 响应式
```

## Map 和 Set 的响应式

对于 `Map` 和 `Set`，需要使用 `collectionHandlers`。

```typescript
const map = reactive(new Map([['key', 'value']]))
map.set('newKey', 'newValue')  // 响应式

const set = reactive(new Set([1, 2, 3]))
set.add(4)  // 响应式
```

### 为什么需要特殊处理？

`Map` 和 `Set` 的方法调用方式不同，Proxy 的默认拦截器无法正确拦截。

```typescript
// Map 的方法调用方式
map.set('key', 'value')  // 需要拦截方法调用
map.get('key')

// 普通对象
obj.key = 'value'  // set 拦截器
obj.key  // get 拦截器
```

### 实现原理

对于 `Map` 和 `Set`，`get` 拦截器返回绑定到原始对象的方法：

```typescript
function get(target, key, receiver) {
  // 获取原始值
  const rawTarget = toRaw(target)

  // 如果是 Map/Set 的方法
  if (key === 'get' || key === 'set' || key === 'has' || key === 'delete') {
    // 返回绑定到原始对象的方法
    return function(...args) {
      // 执行操作并触发依赖
      const result = rawTarget[key](...args)
      track(target, key)
      return result
    }
  }

  // ...
}
```

## 响应式判断

### isReactive()

```typescript
import { reactive, isReactive } from 'vue'

const state = reactive({ count: 0 })
console.log(isReactive(state))  // true

const plain = { count: 0 }
console.log(isReactive(plain))  // false
```

### isReadonly()

```typescript
import { readonly, isReadonly } from 'vue'

const state = readonly({ count: 0 })
console.log(isReadonly(state))  // true
```

### isProxy()

```typescript
import { reactive, readonly, isProxy } from 'vue'

const state1 = reactive({ count: 0 })
const state2 = readonly({ count: 0 })

console.log(isProxy(state1))  // true
console.log(isProxy(state2))  // true
```

## 总结

`reactive()` 的核心特性：

| 特性 | 说明 |
|------|------|
| 深层响应式 | 嵌套对象自动转换为响应式 |
| 懒转换 | 访问时才转换嵌套对象 |
| 缓存 | 避免重复代理同一对象 |
| 数组支持 | 支持索引赋值和长度修改 |
| 类型判断 | isReactive, isReadonly, isProxy |

## 下一步

- [ref 响应式引用](./ref响应式引用.md)：了解 ref 的设计与实现
- [computed 计算属性](./computed计算属性.md)：学习缓存和懒计算