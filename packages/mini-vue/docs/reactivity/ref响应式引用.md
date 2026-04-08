# ref 响应式引用

## ref() 是什么？

`ref()` 将值包装为一个响应式引用对象，通过 `.value` 属性访问和修改值。

```typescript
import { ref } from 'vue'

const count = ref(0)

console.log(count.value)  // 0
count.value++             // 响应式更新
console.log(count.value)  // 1
```

## 为什么需要 ref？

### 1. 基本类型的响应式

`reactive()` 只能用于对象类型，对于基本类型（number、string、boolean）需要使用 `ref()`。

```typescript
// 错误：reactive 不支持基本类型
const count = reactive(0)  // 无效

// 正确：使用 ref
const count = ref(0)
```

### 2. 替换整个对象

当需要替换整个对象时，`reactive()` 会丢失响应性，而 `ref()` 可以正常工作。

```typescript
// 使用 reactive
const state = reactive({ count: 0 })
state = { count: 1 }  // 失去响应性！

// 使用 ref
const state = ref({ count: 0 })
state.value = { count: 1 }  // 保持响应性
```

### 3. 从组合式函数返回响应式状态

```typescript
function useCounter() {
  const count = ref(0)

  function increment() {
    count.value++
  }

  return { count, increment }
}

const { count, increment } = useCounter()
```

## RefImpl 类

`ref()` 返回的是 `RefImpl` 类实例。

### 类定义

```typescript
// packages/reactivity/src/ref.ts

export class RefImpl<T> {
  private _value: T
  private _rawValue: T

  // 依赖集合
  public dep?: Dep = undefined

  // 标记为 ref
  public readonly __v_isRef = true

  // 脏标记（用于 shallow ref）
  public _dirty = true

  constructor(value: T) {
    // 保存原始值
    this._rawValue = toRaw(value)
    // 如果是对象，转换为 reactive
    this._value = toReactive(value)
  }

  get value() {
    // 依赖收集
    trackRefValue(this)
    return this._value
  }

  set value(newValue: T) {
    // 使用原始值比较
    if (hasChanged(newValue, this._rawValue)) {
      // 更新原始值
      this._rawValue = toRaw(newValue)
      // 更新响应式值
      this._value = toReactive(newValue)
      // 触发更新
      triggerRefValue(this)
    }
  }
}
```

### 关键属性

| 属性 | 说明 |
|------|------|
| `_value` | 当前值，如果是对象则为响应式代理 |
| `_rawValue` | 原始值，未经代理 |
| `dep` | 依赖此 ref 的 effect 集合 |
| `__v_isRef` | 标记这是一个 ref |

### 为什么需要 _rawValue？

```typescript
const state = ref({ count: 0 })

// 如果不保存原始值
state.value = toRaw(state.value)  // 会误判为变化

// 使用原始值比较
state.value = state.value  // 正确判断为未变化
```

## toReactive 函数

当 ref 的值是对象时，自动转换为 `reactive`。

```typescript
export const toReactive = <T extends unknown>(value: T): T => {
  return isObject(value) ? reactive(value as object) : value
}
```

### 效果

```typescript
const objRef = ref({ count: 0 })

// objRef.value 是一个 reactive 对象
console.log(isReactive(objRef.value))  // true

// 深层响应式
objRef.value.count++  // 触发更新
```

## ref() 函数

```typescript
export function ref<T>(value: T): Ref<T> {
  return new RefImpl(value) as any
}

// 类型定义
export interface Ref<T = any> {
  value: T
  dep?: Dep
  __v_isRef: true
}
```

## 依赖收集与触发

### trackRefValue

```typescript
export function trackRefValue(ref: RefImpl<any>) {
  if (activeEffect) {
    // 收集依赖到 ref.dep
    if (!ref.dep) {
      ref.dep = new Set()
    }
    if (!ref.dep.has(activeEffect)) {
      ref.dep.add(activeEffect)
      activeEffect.deps.push(ref.dep)
    }
  }
}
```

### triggerRefValue

```typescript
export function triggerRefValue(ref: RefImpl<any>) {
  if (ref.dep) {
    triggerEffects(ref.dep)
  }
}
```

## shallowRef

`shallowRef()` 创建浅层响应式引用，不会自动转换为 `reactive`。

```typescript
import { shallowRef } from 'vue'

const state = shallowRef({ count: 0 })

// 不会触发更新（因为内部对象不是响应式的）
state.value.count++

// 会触发更新（因为直接修改 value）
state.value = { count: 1 }
```

### 实现

```typescript
export class ShallowRefImpl extends RefImpl {
  constructor(value: T) {
    super(value)
    this._rawValue = value
    this._value = value  // 不调用 toReactive
  }
}

export function shallowRef<T>(value: T): ShallowRef<T> {
  return new ShallowRefImpl(value)
}
```

### 使用场景

1. **大型不可变数据结构**

```typescript
const bigData = shallowRef(loadHugeDataSet())
bigData.value = transform(bigData.value)  // 替换整体
```

2. **与外部状态管理系统集成**

```typescript
const externalState = shallowRef(store.getState())
store.subscribe(state => {
  externalState.value = state  // 直接替换
})
```

## triggerRef

手动触发 `shallowRef` 的更新。

```typescript
import { shallowRef, triggerRef } from 'vue'

const state = shallowRef({ count: 0 })

// 修改内部对象
state.value.count++

// 手动触发更新
triggerRef(state)
```

### 实现

```typescript
export function triggerRef(ref: Ref) {
  if (ref.dep) {
    triggerEffects(ref.dep)
  }
}
```

## unref

如果参数是 ref，返回其值；否则返回参数本身。

```typescript
import { ref, unref } from 'vue'

const count = ref(0)
console.log(unref(count))  // 0
console.log(unref(1))      // 1
```

### 实现

```typescript
export function unref<T>(ref: T | Ref<T>): T {
  return isRef(ref) ? ref.value : ref
}
```

## toRef

为响应式对象的某个属性创建一个 ref。

```typescript
import { reactive, toRef } from 'vue'

const state = reactive({ count: 0 })
const countRef = toRef(state, 'count')

countRef.value++
console.log(state.count)  // 1

state.count = 10
console.log(countRef.value)  // 10
```

### 实现

```typescript
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): ToRef<T[K]> {
  return {
    get value() {
      return object[key]
    },
    set value(newValue) {
      object[key] = newValue
    }
  } as any
}
```

### 使用场景

将 props 的属性传递给组合式函数：

```typescript
export default {
  props: ['count'],
  setup(props) {
    // 将 props.count 转换为 ref
    const countRef = toRef(props, 'count')

    // 可以传递给其他函数
    useCounter(countRef)
  }
}
```

## toRefs

将响应式对象转换为普通对象，每个属性都是 ref。

```typescript
import { reactive, toRefs } from 'vue'

const state = reactive({
  count: 0,
  name: 'Vue'
})

const { count, name } = toRefs(state)

count.value++
console.log(state.count)  // 1
```

### 实现

```typescript
export function toRefs<T extends object>(object: T): ToRefs<T> {
  const result: any = {}

  for (const key in object) {
    result[key] = toRef(object, key)
  }

  return result
}
```

### 使用场景

解构响应式对象时保持响应性：

```typescript
export default {
  setup() {
    const state = reactive({
      count: 0,
      name: 'Vue'
    })

    // 错误：失去响应性
    // const { count, name } = state

    // 正确：使用 toRefs
    const { count, name } = toRefs(state)

    return { count, name }
  }
}
```

## isRef

判断值是否为 ref。

```typescript
import { ref, isRef } from 'vue'

const count = ref(0)
console.log(isRef(count))   // true
console.log(isRef(0))       // false
```

### 实现

```typescript
export function isRef<T>(value: any): value is Ref<T> {
  return value && value.__v_isRef === true
}
```

## customRef

创建自定义 ref，可以精确控制依赖收集和触发时机。

```typescript
import { customRef } from 'vue'

// 带防抖的 ref
function useDebouncedRef<T>(value: T, delay = 200) {
  let timeout: number | undefined

  return customRef<T>((track, trigger) => ({
    get() {
      track()  // 收集依赖
      return value
    },
    set(newValue: T) {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        value = newValue
        trigger()  // 触发更新
      }, delay)
    }
  }))
}

const text = useDebouncedRef('hello')
```

### 实现

```typescript
export function customRef<T>(factory: CustomRefFactory<T>): Ref<T> {
  const dep = new Set<ReactiveEffect>()

  const { get, set } = factory(
    () => trackEffects(dep),
    () => triggerEffects(dep)
  )

  return {
    __v_isRef: true,
    get value() {
      get()
      return this._value
    },
    set value(newValue) {
      set(newValue)
    }
  } as any
}
```

## ref vs reactive

| 特性 | ref | reactive |
|------|-----|----------|
| 支持类型 | 所有类型 | 仅对象类型 |
| 访问方式 | `.value` | 直接访问 |
| 深层响应式 | 自动（对象） | 自动 |
| 替换对象 | 保持响应性 | 失去响应性 |
| 解构 | 直接解构 `.value` | 需要 `toRefs` |
| 类型推断 | 更好 | 需要额外处理 |

### 选择建议

1. **使用 ref 当：**
   - 需要基本类型的响应式
   - 需要替换整个对象
   - 从组合式函数返回状态

2. **使用 reactive 当：**
   - 需要复杂的嵌套对象
   - 不需要替换整个对象

## ref 的自动解包

在模板中，ref 会自动解包，不需要 `.value`。

```vue
<template>
  <!-- 自动解包 -->
  <div>{{ count }}</div>
</template>

<script>
import { ref } from 'vue'

export default {
  setup() {
    const count = ref(0)
    return { count }
  }
}
</script>
```

### 在 reactive 中的自动解包

当 ref 作为 `reactive` 对象的属性时，会自动解包。

```typescript
const count = ref(0)
const state = reactive({ count })

// 不需要 .value
state.count  // 0
state.count = 1  // 自动设置 ref.value
```

### 实现原理

在 `reactive` 的 `get` 拦截器中：

```typescript
function get(target, key, receiver) {
  const result = Reflect.get(target, key, receiver)

  // 如果是 ref，自动解包
  if (isRef(result)) {
    return result.value
  }

  return result
}
```

### 在 set 拦截器中

```typescript
function set(target, key, value, receiver) {
  const oldValue = target[key]

  // 如果旧值是 ref，新值不是 ref
  if (isRef(oldValue) && !isRef(value)) {
    oldValue.value = value
    return true
  }

  return Reflect.set(target, key, value, receiver)
}
```

## 总结

`ref()` 的核心特性：

| 特性 | 说明 |
|------|------|
| 通用性 | 支持所有类型的值 |
| `.value` 访问 | 明确的读写操作 |
| 自动转换 | 对象自动转换为 `reactive` |
| 自动解包 | 在模板和 reactive 中自动解包 |
| shallowRef | 浅层响应式 |

## 下一步

- [computed 计算属性](./computed计算属性.md)：学习缓存和懒计算
- [watch 监听器](./watch监听器.md)：掌握监听器的实现