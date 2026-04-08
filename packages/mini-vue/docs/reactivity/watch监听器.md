# watch 监听器

## watch() 是什么？

`watch()` 用于监听响应式数据的变化，并在变化时执行回调函数。

```typescript
import { ref, watch } from 'vue'

const count = ref(0)

watch(count, (newValue, oldValue) => {
  console.log(`count changed: ${oldValue} → ${newValue}`)
})

count.value = 1  // count changed: 0 → 1
```

## 基本用法

### 监听 ref

```typescript
const count = ref(0)

watch(count, (newValue, oldValue) => {
  console.log(`count: ${newValue}`)
})
```

### 监听 reactive 对象

```typescript
const state = reactive({ count: 0 })

// 监听整个对象（自动 deep）
watch(state, (newValue, oldValue) => {
  // 注意：newValue 和 oldValue 是同一个对象
  console.log('state changed')
})

// 监听某个属性（需要 getter）
watch(
  () => state.count,
  (newValue, oldValue) => {
    console.log(`count: ${newValue}`)
  }
)
```

### 监听多个源

```typescript
const firstName = ref('John')
const lastName = ref('Doe')

watch([firstName, lastName], ([newFirst, newLast], [oldFirst, oldLast]) => {
  console.log(`Name: ${newFirst} ${newLast}`)
})
```

### 监听嵌套属性

```typescript
const state = reactive({
  nested: {
    count: 0
  }
})

// 需要 getter 函数
watch(
  () => state.nested.count,
  (newValue) => {
    console.log(`count: ${newValue}`)
  }
)
```

## watch 选项

### deep

深度监听对象内部的变化。

```typescript
const state = reactive({
  nested: {
    count: 0
  }
})

watch(
  () => state.nested,
  (newValue) => {
    console.log('nested changed')
  },
  { deep: true }
)

state.nested.count++  // 触发回调
```

### immediate

立即执行一次回调。

```typescript
const count = ref(0)

watch(
  count,
  (newValue, oldValue) => {
    console.log(`count: ${newValue}`)
  },
  { immediate: true }
)
// 立即输出: count: 0
```

### flush

控制回调的执行时机。

```typescript
// 'pre'（默认）：组件更新前
// 'post'：组件更新后
// 'sync'：同步执行

watch(count, () => {}, { flush: 'sync' })
```

### once

只触发一次。

```typescript
watch(count, () => {
  console.log('triggered once')
}, { once: true })

count.value = 1  // 触发
count.value = 2  // 不触发
```

## doWatch 实现

`watch()` 和 `watchEffect()` 都基于 `doWatch()` 实现。

### 核心代码

```typescript
// packages/runtime-core/src/apiWatch.ts

export function watch<T>(
  source: WatchSource<T> | WatchSource<T>[],
  cb: WatchCallback<T>,
  options?: WatchOptions
): WatchStopHandle {
  return doWatch(source, cb, options)
}

function doWatch<T>(
  source: WatchSource<T> | WatchSource<T>[],
  cb: WatchCallback<T> | null,
  { immediate, deep, flush, once }: WatchOptions = {}
): WatchStopHandle {
  // 1. 确定 getter 函数
  let getter: () => any

  if (isRef(source)) {
    // ref: () => source.value
    getter = () => source.value
  } else if (isReactive(source)) {
    // reactive 对象: 直接返回，配合 deep
    getter = () => source
    deep = true
  } else if (isArray(source)) {
    // 数组: 映射每个元素
    getter = () => source.map(s =>
      isRef(s) ? s.value : isReactive(s) ? s : s()
    )
  } else if (isFunction(source)) {
    // 函数: 直接使用
    getter = source
  }

  // 2. 深度监听
  if (deep) {
    const baseGetter = getter
    getter = () => traverse(baseGetter())
  }

  // 3. 保存旧值
  let oldValue: any

  // 4. 定义调度器
  const job = () => {
    if (cb) {
      const newValue = effect.run()

      // 值是否变化
      if (deep || hasChanged(newValue, oldValue)) {
        // 执行回调
        cb(newValue, oldValue)
        oldValue = newValue
      }
    }
  }

  // 5. 创建 effect
  const effect = new ReactiveEffect(getter, job)

  // 6. 初始执行
  if (immediate) {
    job()
  } else {
    oldValue = effect.run()
  }

  // 7. 返回停止函数
  return () => {
    effect.stop()
  }
}
```

### 流程图

```
watch(source, cb, options)
│
▼
1. 根据 source 类型确定 getter
│
▼
2. 如果 deep，包装 traverse
│
▼
3. 创建 scheduler 函数
│
▼
4. 创建 ReactiveEffect(getter, scheduler)
│
▼
5. 如果 immediate，立即执行回调
   否则，执行 getter 获取初始值
│
▼
6. 返回 stop 函数
```

## traverse 函数

`traverse()` 递归访问对象的所有属性，触发依赖收集。

```typescript
export function traverse(value: unknown, seen?: Set<unknown>) {
  if (!isObject(value)) {
    return value
  }

  seen = seen || new Set()

  // 避免循环引用
  if (seen.has(value)) {
    return value
  }
  seen.add(value)

  // 递归访问所有属性
  if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], seen)
    }
  } else {
    for (const key in value) {
      traverse(value[key], seen)
    }
  }

  return value
}
```

### 为什么需要 traverse？

```typescript
const state = reactive({
  nested: {
    count: 0
  }
})

// 不使用 traverse
watch(
  () => state.nested,
  () => console.log('changed')
)
// state.nested.count++ 不会触发，因为 getter 只访问了 state.nested

// 使用 deep
watch(
  () => state.nested,
  () => console.log('changed'),
  { deep: true }
)
// state.nested.count++ 会触发，因为 traverse 访问了所有嵌套属性
```

## watchEffect

`watchEffect()` 立即执行副作用，并自动追踪依赖。

```typescript
import { watchEffect } from 'vue'

const count = ref(0)

watchEffect(() => {
  console.log(`count is ${count.value}`)
})
// 立即输出: count is 0

count.value = 1
// 输出: count is 1
```

### 与 watch 的区别

| 特性 | watch | watchEffect |
|------|-------|-------------|
| 立即执行 | 需要 immediate | 自动立即执行 |
| 依赖追踪 | 手动指定 | 自动追踪 |
| 旧值 | 可以获取 | 无法获取 |

### 实现

```typescript
export function watchEffect(
  effect: WatchEffect,
  options?: WatchOptions
): WatchStopHandle {
  return doWatch(effect, null, options)
}
```

`doWatch` 中 `cb` 为 `null` 时的处理：

```typescript
const job = () => {
  if (cb) {
    // watch: 执行回调
    // ...
  } else {
    // watchEffect: 重新执行 effect
    effect.run()
  }
}
```

## 清理副作用

### onCleanup

在回调中注册清理函数，在下次执行前调用。

```typescript
watch(id, (newId, oldId, onCleanup) => {
  const { response, cancel } = fetchApi(newId)

  onCleanup(() => {
    cancel()  // 取消上一次请求
  })

  response.then(data => {
    // ...
  })
})
```

### 实现

```typescript
let cleanup: (() => void) | undefined

const job = () => {
  // 执行清理函数
  if (cleanup) {
    cleanup()
    cleanup = undefined
  }

  if (cb) {
    const onCleanup = (fn: () => void) => {
      cleanup = fn
    }

    const newValue = effect.run()
    cb(newValue, oldValue, onCleanup)
    oldValue = newValue
  }
}
```

## 停止监听

`watch()` 返回一个停止函数。

```typescript
const stop = watch(count, () => {
  console.log('changed')
})

// 停止监听
stop()

count.value++  // 不再触发回调
```

## 调度时机

### flush: 'pre'（默认）

在组件更新前执行。

```typescript
watch(count, () => {
  // 此时 DOM 还未更新
}, { flush: 'pre' })
```

### flush: 'post'

在组件更新后执行。

```typescript
watch(count, () => {
  // 此时 DOM 已更新
}, { flush: 'post' })
```

### flush: 'sync'

同步执行，数据变化时立即执行。

```typescript
watch(count, () => {
  // 立即执行
}, { flush: 'sync' })
```

### 实现

```typescript
let scheduler: EffectScheduler

if (flush === 'sync') {
  // 同步执行
  scheduler = job
} else if (flush === 'post') {
  // 组件更新后执行
  scheduler = () => queuePostFlushCb(job)
} else {
  // 默认：组件更新前执行
  scheduler = () => queuePreFlushCb(job)
}

const effect = new ReactiveEffect(getter, scheduler)
```

## 调试

### onTrack 和 onTrigger

```typescript
watch(
  count,
  () => console.log('changed'),
  {
    onTrack(e) {
      console.log('tracked:', e)  // 依赖被收集时
    },
    onTrigger(e) {
      console.log('triggered:', e)  // 触发更新时
    }
  }
)
```

## 最佳实践

### 1. 避免监听整个 reactive 对象

```typescript
const state = reactive({ count: 0, name: 'Vue' })

// 不推荐：任何属性变化都会触发
watch(state, () => {})

// 推荐：只监听需要的属性
watch(() => state.count, () => {})
```

### 2. 使用 getter 监听特定属性

```typescript
const state = reactive({ nested: { count: 0 } })

// 正确：使用 getter
watch(() => state.nested.count, () => {})

// 错误：直接使用值
watch(state.nested.count, () => {})  // 失去响应性
```

### 3. 合理使用 deep

```typescript
// 只在需要时使用 deep
watch(
  () => state.nested,
  () => {},
  { deep: true }
)

// 对于扁平对象不需要 deep
watch(
  () => state.count,
  () => {}
)
```

### 4. 清理副作用

```typescript
watch(id, (newId, oldId, onCleanup) => {
  const controller = new AbortController()

  onCleanup(() => {
    controller.abort()
  })

  fetch(`/api/${newId}`, { signal: controller.signal })
})
```

### 5. 使用 watchEffect 自动追踪

```typescript
// 当有多个依赖时，使用 watchEffect 更简洁
watchEffect(() => {
  console.log(firstName.value, lastName.value)
})

// 等价于
watch(
  [firstName, lastName],
  () => {
    console.log(firstName.value, lastName.value)
  },
  { immediate: true }
)
```

## 总结

`watch()` 的核心特性：

| 特性 | 说明 |
|------|------|
| 多种数据源 | ref、reactive、getter、数组 |
| deep | 深度监听对象 |
| immediate | 立即执行 |
| flush | 控制执行时机 |
| once | 只触发一次 |
| 清理函数 | onCleanup |
| 停止监听 | 返回 stop 函数 |

## 下一步

- [编译器原理概述](../compiler/编译器原理概述.md)：开始学习编译器