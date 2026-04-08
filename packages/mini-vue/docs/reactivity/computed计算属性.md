# computed 计算属性

## computed() 是什么？

`computed()` 创建一个计算属性，它根据其他响应式数据派生新值，具有以下特性：

- **懒计算**：只有在访问时才计算
- **缓存**：只有依赖变化时才重新计算
- **响应式**：可以触发其他副作用

```typescript
import { ref, computed } from 'vue'

const count = ref(1)
const doubled = computed(() => count.value * 2)

console.log(doubled.value)  // 2
count.value = 2
console.log(doubled.value)  // 4
```

## 为什么需要 computed？

### 1. 避免重复计算

```typescript
// 没有 computed
const count = ref(1)

function getDoubled() {
  console.log('calculating...')
  return count.value * 2
}

// 每次调用都会重新计算
getDoubled()  // calculating...
getDoubled()  // calculating...
getDoubled()  // calculating...

// 使用 computed
const doubled = computed(() => {
  console.log('calculating...')
  return count.value * 2
})

// 只计算一次，后续使用缓存
doubled.value  // calculating...
doubled.value  // 使用缓存
doubled.value  // 使用缓存
```

### 2. 自动追踪依赖

```typescript
const a = ref(1)
const b = ref(2)
const c = ref(3)

const result = computed(() => {
  // 自动追踪 a 和 b 的依赖
  return a.value + b.value
})

// c 变化不会触发重新计算
c.value = 4  // result 不会重新计算

// a 变化会触发重新计算
a.value = 10  // result 会重新计算
```

### 3. 响应式链式更新

```typescript
const count = ref(1)
const doubled = computed(() => count.value * 2)
const quadrupled = computed(() => doubled.value * 2)

console.log(quadrupled.value)  // 4
count.value = 2
console.log(quadrupled.value)  // 8
```

## ComputedRefImpl 类

`computed()` 返回的是 `ComputedRefImpl` 类实例。

### 类定义

```typescript
// packages/reactivity/src/computed.ts

export class ComputedRefImpl<T> {
  // 依赖集合
  public dep?: Dep = undefined

  // 计算结果缓存
  private _value!: T

  // 标记是否需要重新计算
  public _dirty = true

  // 标记为 ref
  public readonly __v_isRef = true

  // 内部 effect
  public effect: ReactiveEffect<T>

  constructor(getter: ComputedGetter<T>) {
    // 创建 effect，使用 scheduler
    this.effect = new ReactiveEffect(getter, () => {
      // 当依赖变化时，标记为脏
      if (!this._dirty) {
        this._dirty = true
        // 触发依赖此 computed 的 effect
        triggerRefValue(this)
      }
    })
    // 标记这是一个计算属性的 effect
    this.effect.computed = this
  }

  get value() {
    // 依赖收集
    trackRefValue(this)

    // 如果是脏的，重新计算
    if (this._dirty) {
      this._dirty = false
      this._value = this.effect.run()!
    }

    return this._value
  }

  set value(newValue: T) {
    // 只读计算属性不支持设置
    console.warn('Write operation failed: computed value is readonly')
  }
}
```

### 核心机制

```
┌─────────────────────────────────────────────────────────────────┐
│                     ComputedRefImpl 工作流程                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  首次访问 .value                                                 │
│  ─────────────────                                              │
│  1. _dirty = true，需要计算                                      │
│  2. 执行 effect.run() → getter()                                │
│  3. getter 执行时，收集 getter 内的依赖                          │
│  4. 将 _dirty 设为 false，缓存结果                               │
│  5. 返回 _value                                                  │
│                                                                  │
│  再次访问 .value                                                 │
│  ─────────────────                                              │
│  1. _dirty = false，使用缓存                                     │
│  2. 直接返回 _value                                              │
│                                                                  │
│  依赖变化                                                        │
│  ─────────────────                                              │
│  1. 响应式数据的 set 触发 trigger                                │
│  2. computed 的 effect.scheduler 被调用                          │
│  3. scheduler 将 _dirty 设为 true                               │
│  4. scheduler 触发依赖此 computed 的 effect                       │
│  5. 下次访问 .value 时重新计算                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## computed() 函数

```typescript
// packages/reactivity/src/computed.ts

export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions
): ComputedRef<T> {
  return new ComputedRefImpl(getter) as any
}

// 类型定义
export interface ComputedRef<T> extends Ref<T> {
  readonly value: T
}

export type ComputedGetter<T> = (oldValue?: T) => T
```

## 懒计算与缓存

### 脏标记机制

```typescript
public _dirty = true  // 初始为 true，表示需要计算

get value() {
  trackRefValue(this)

  if (this._dirty) {
    this._dirty = false  // 标记为干净
    this._value = this.effect.run()!  // 计算
  }

  return this._value
}
```

### 为什么是懒计算？

```typescript
const expensiveValue = computed(() => {
  console.log('expensive calculation...')
  // 假设这里有大量计算
  return heavyCalculation()
})

// 如果不访问，永远不会执行计算
// 只有访问时才会计算
console.log(expensiveValue.value)  // expensive calculation...
```

### 缓存效果

```typescript
const count = ref(1)
const doubled = computed(() => {
  console.log('computing...')
  return count.value * 2
})

// 首次访问，执行计算
doubled.value  // computing... → 2

// 再次访问，使用缓存
doubled.value  // → 2 (无输出)

// 依赖变化，重新计算
count.value = 2
doubled.value  // computing... → 4
```

## 依赖收集

### getter 内的依赖收集

```typescript
const a = ref(1)
const b = ref(2)

const sum = computed(() => {
  // 访问 a.value 和 b.value 时，自动收集依赖
  return a.value + b.value
})
```

### 收集过程

```
1. computed(() => a.value + b.value)
   │
   ▼
2. 创建 ComputedRefImpl
   │
   ▼
3. 创建 ReactiveEffect(getter, scheduler)
   │
   ▼
4. 首次访问 sum.value
   │
   ▼
5. effect.run() 执行 getter
   │
   ▼
6. getter 内访问 a.value
   │
   ▼
7. a.value 的 getter 触发 track
   │
   ▼
8. 将 computed 的 effect 收集为 a 的依赖
   │
   ▼
9. 同样收集 b 的依赖
```

## 触发更新

### scheduler 的作用

```typescript
this.effect = new ReactiveEffect(getter, () => {
  // 这个 scheduler 在依赖变化时被调用
  if (!this._dirty) {
    this._dirty = true
    triggerRefValue(this)
  }
})
```

### 更新流程

```
count.value = 2
│
▼
trigger(count, 'value')
│
▼
触发所有依赖 count 的 effects
│
▼
其中一个是 computed 的 effect
│
▼
调用 effect.scheduler
│
▼
scheduler 将 _dirty 设为 true
│
▼
scheduler 调用 triggerRefValue(computed)
│
▼
触发所有依赖此 computed 的 effects
│
▼
这些 effect 重新执行，访问 computed.value
│
▼
computed.value 发现 _dirty = true，重新计算
```

## 可写的 computed

`computed()` 也支持 getter/setter 形式。

```typescript
const firstName = ref('John')
const lastName = ref('Doe')

const fullName = computed({
  get() {
    return `${firstName.value} ${lastName.value}`
  },
  set(newValue: string) {
    const [first, last] = newValue.split(' ')
    firstName.value = first
    lastName.value = last
  }
})

console.log(fullName.value)  // John Doe

fullName.value = 'Jane Smith'
console.log(firstName.value)  // Jane
console.log(lastName.value)   // Smith
```

### 实现

```typescript
export class ComputedRefImpl<T> {
  constructor(
    getter: ComputedGetter<T>,
    private readonly _setter: ComputedSetter<T>
  ) {
    // ...
  }

  set value(newValue: T) {
    this._setter(newValue)
  }
}

export function computed<T>(
  options: {
    get: ComputedGetter<T>
    set: ComputedSetter<T>
  }
): WritableComputedRef<T> {
  return new ComputedRefImpl(options.get, options.set) as any
}
```

## 计算属性的优先执行

当触发更新时，计算属性的 effect 会先于普通 effect 执行。

### 为什么需要优先执行？

```typescript
const count = ref(1)
const doubled = computed(() => count.value * 2)

effect(() => {
  console.log('effect:', doubled.value)
})

count.value = 2
```

如果先执行普通 effect：

1. effect 执行，访问 `doubled.value`
2. `doubled._dirty` 仍然是 false（因为 scheduler 还没执行）
3. 返回旧的缓存值

如果先执行 computed 的 scheduler：

1. scheduler 执行，将 `_dirty` 设为 true
2. effect 执行，访问 `doubled.value`
3. 因为 `_dirty` 为 true，重新计算
4. 返回新值

### 实现

```typescript
export function triggerEffects(effects: Set<ReactiveEffect>) {
  // 分离计算属性和普通 effect
  const computedEffects: ReactiveEffect[] = []
  const normalEffects: ReactiveEffect[] = []

  for (const effect of effects) {
    if (effect.computed) {
      computedEffects.push(effect)
    } else {
      normalEffects.push(effect)
    }
  }

  // 先执行计算属性的 effect（触发 scheduler）
  for (const effect of computedEffects) {
    triggerEffect(effect)
  }

  // 再执行普通 effect
  for (const effect of normalEffects) {
    triggerEffect(effect)
  }
}
```

## computed vs method


| 特性   | computed | method |
| ---- | -------- | ------ |
| 缓存   | 有        | 无      |
| 响应式  | 自动追踪     | 手动处理   |
| 执行时机 | 访问时      | 调用时    |
| 性能   | 更好（缓存）   | 每次执行   |


### 选择建议

使用 computed 当：

- 需要根据其他数据派生值
- 计算开销较大
- 需要缓存

使用 method 当：

- 每次调用都需要重新计算
- 有副作用（如修改其他状态）

## computed vs watch


| 特性  | computed | watch |
| --- | -------- | ----- |
| 返回值 | 返回派生值    | 执行副作用 |
| 用途  | 数据派生     | 响应变化  |
| 缓存  | 有        | 无     |
| 异步  | 不支持      | 支持    |


### 选择建议

使用 computed 当：

- 需要根据其他数据计算新值

使用 watch 当：

- 需要在数据变化时执行异步操作
- 需要在数据变化时执行副作用

## 调试 computed

### onTrack 和 onTrigger

```typescript
const doubled = computed(
  () => count.value * 2,
  {
    onTrack(e) {
      console.log('tracked:', e)  // 依赖被收集时
    },
    onTrigger(e) {
      console.log('triggered:', e)  // 依赖变化时
    }
  }
)
```

### 实现

```typescript
export class ComputedRefImpl<T> {
  constructor(
    getter: ComputedGetter<T>,
    private readonly _setter: ComputedSetter<T>,
    debugOptions?: DebuggerOptions
  ) {
    this.effect = new ReactiveEffect(getter, () => {
      // ...
    })

    // 保存调试选项
    if (debugOptions) {
      this.effect.onTrack = debugOptions.onTrack
      this.effect.onTrigger = debugOptions.onTrigger
    }
  }
}
```

## 性能优化

### 避免在 computed 中执行副作用

```typescript
// 错误：在 computed 中执行副作用
const fullName = computed(() => {
  console.log('side effect')  // 副作用
  return firstName.value + ' ' + lastName.value
})

// 正确：使用 watch 处理副作用
watch([firstName, lastName], () => {
  console.log('side effect')
})
```

### 避免在 computed 中修改其他响应式数据

```typescript
// 错误：在 computed 中修改其他数据
const count = ref(0)
const doubled = computed(() => {
  otherData.value++  // 修改其他数据
  return count.value * 2
})

// 正确：保持 computed 是纯函数
const doubled = computed(() => count.value * 2)
```

## 总结

`computed()` 的核心特性：


| 特性   | 说明               |
| ---- | ---------------- |
| 懒计算  | 只有访问时才计算         |
| 缓存   | 只有依赖变化时才重新计算     |
| 响应式  | 可以被其他 effect 依赖  |
| 自动追踪 | 自动收集 getter 内的依赖 |
| 优先执行 | 更新时优先于普通 effect  |


## 下一步

- [watch 监听器](./watch监听器.md)：掌握监听器的实现

