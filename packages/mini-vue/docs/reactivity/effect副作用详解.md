# effect 副作用详解

## 什么是副作用？

副作用（Side Effect）是指函数执行过程中对外部状态产生的变化。在前端开发中，常见的副作用包括：

- 修改 DOM
- 发送网络请求
- 修改全局变量
- 控制台输出

```typescript
// 这是一个有副作用的函数
function render() {
  document.getElementById('app').textContent = 'Hello'
}

// 这是一个纯函数（无副作用）
function add(a: number, b: number) {
  return a + b
}
```

在 Vue 中，组件的渲染函数就是一个副作用，因为它会修改 DOM。当响应式数据变化时，我们需要重新执行这个副作用来更新视图。

## ReactiveEffect 类

`ReactiveEffect` 是 mini-vue 中副作用的核心实现。

### 类定义

```typescript
// packages/reactivity/src/effect.ts

let activeEffect: ReactiveEffect | undefined  // 当前正在执行的 effect

export class ReactiveEffect<T = any> {
  // 标记是否为计算属性的 effect
  computed?: ComputedRefImpl<T>

  // 允许递归调用
  allowRecurse?: boolean

  // 停止标志
  private _stop = false

  // 依赖此 effect 的 Dep 集合（用于清理）
  deps: Dep[] = []

  constructor(
    public fn: () => T,           // 副作用函数
    public scheduler: EffectScheduler | null = null  // 调度器
  ) {}

  run() {
    // 如果已停止，直接执行函数，不收集依赖
    if (this._stop) {
      return this.fn()
    }

    // 保存上一个 activeEffect（处理嵌套 effect）
    const lastActiveEffect = activeEffect

    // 设置当前 activeEffect
    activeEffect = this

    // 清理旧的依赖
    cleanupEffect(this)

    try {
      // 执行副作用函数
      return this.fn()
    } finally {
      // 恢复上一个 activeEffect
      activeEffect = lastActiveEffect
    }
  }

  stop() {
    if (!this._stop) {
      cleanupEffect(this)
      this._stop = true
    }
  }
}
```

### 关键属性解析

#### 1. activeEffect

`activeEffect` 是一个全局变量，指向当前正在执行的副作用。当响应式对象的 getter 被触发时，会将 `activeEffect` 收集为依赖。

```typescript
// 全局变量
let activeEffect: ReactiveEffect | undefined

// 在 run() 中设置
run() {
  activeEffect = this  // 设置当前活跃的 effect
  return this.fn()
}

// 在 getter 中使用
get(target, key) {
  if (activeEffect) {
    track(target, key)  // 收集 activeEffect 作为依赖
  }
  return target[key]
}
```

#### 2. scheduler

调度器允许自定义副作用执行的时机。

```typescript
// 默认行为：同步执行
effect(() => {
  console.log('update')
})

// 使用调度器：异步执行
effect(
  () => {
    console.log('update')
  },
  {
    scheduler(fn) {
      setTimeout(fn, 0)  // 放到下一个事件循环执行
    }
  }
)
```

#### 3. deps

存储所有依赖此 effect 的 Dep 集合。当 effect 停止时，需要从这些 Dep 中移除自己。

```typescript
// cleanupEffect: 从所有依赖中移除这个 effect
function cleanupEffect(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}
```

## effect() 函数

`effect()` 是创建副作用的公开 API。

### 函数签名

```typescript
export interface ReactiveEffectOptions {
  lazy?: boolean        // 是否懒执行
  scheduler?: EffectScheduler  // 调度器
  allowRecurse?: boolean  // 是否允许递归
  onStop?: () => void   // 停止时的回调
}

export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions
): ReactiveEffectRunner<T> {
  // 创建 ReactiveEffect 实例
  const _effect = new ReactiveEffect(fn)

  // 合并选项
  if (options) {
    Object.assign(_effect, options)
  }

  // 非 lazy 模式，立即执行
  if (!options?.lazy) {
    _effect.run()
  }

  // 返回 runner 函数
  const runner = _effect.run.bind(_effect) as ReactiveEffectRunner
  runner.effect = _effect

  return runner
}
```

### 使用示例

```typescript
import { effect, reactive } from 'vue'

const state = reactive({ count: 0 })

// 基本使用
effect(() => {
  console.log('count:', state.count)
})
// 立即输出: count: 0

state.count++
// 自动输出: count: 1

// 获取 runner
const runner = effect(() => {
  console.log('executed')
  return state.count
})
// 立即输出: executed

// 手动执行
runner()  // 输出: executed

// 停止副作用
runner.effect.stop()
state.count++  // 不再输出
```

## 依赖收集：track()

`track()` 函数在响应式对象的 getter 中被调用，用于收集依赖。

### 实现代码

```typescript
// packages/reactivity/src/effect.ts

// 全局依赖映射
const targetMap = new WeakMap<any, KeyToDepMap>()

export function track(target: object, key: unknown) {
  // 没有活跃的 effect，不需要收集
  if (!activeEffect) return

  // 获取 target 对应的依赖映射
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()))
  }

  // 获取 key 对应的 Dep
  let dep = depsMap.get(key)
  if (!dep) {
    depsMap.set(key, (dep = new Set()))
  }

  // 将 activeEffect 添加到 Dep
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect)
    // 反向记录：effect 记住它依赖的 Dep
    activeEffect.deps.push(dep)
  }
}
```

### 数据结构

```
targetMap (WeakMap)
├── target1 (响应式对象)
│   └── depsMap (Map)
│       ├── "count" → dep (Set<ReactiveEffect>)
│       │              ├── effect1
│       │              └── effect2
│       └── "name" → dep (Set<ReactiveEffect>)
│                      └── effect3
│
└── target2 (另一个响应式对象)
    └── depsMap (Map)
        └── "value" → dep (Set<ReactiveEffect>)
                         └── effect1
```

### 为什么使用 WeakMap？

`WeakMap` 的键是弱引用，当对象被垃圾回收时，对应的依赖映射也会被自动清理，避免内存泄漏。

## 触发更新：trigger()

`trigger()` 函数在响应式对象的 setter 中被调用，用于触发依赖更新。

### 实现代码

```typescript
// packages/reactivity/src/effect.ts

export function trigger(
  target: object,
  key: unknown,
  newValue?: unknown,
  oldValue?: unknown
) {
  // 获取依赖映射
  const depsMap = targetMap.get(target)
  if (!depsMap) return

  // 获取该 key 对应的所有 effect
  const dep = depsMap.get(key)
  if (!dep) return

  // 复制一份，避免在执行过程中 Set 被修改
  const effects = new Set(dep)

  // 触发所有 effect
  triggerEffects(effects)
}

export function triggerEffects(effects: Set<ReactiveEffect>) {
  // 先执行计算属性的 effect，再执行普通 effect
  // 这样可以确保计算属性先更新，普通 effect 可以获取最新值
  const computedEffects: ReactiveEffect[] = []
  const normalEffects: ReactiveEffect[] = []

  for (const effect of effects) {
    if (effect.computed) {
      computedEffects.push(effect)
    } else {
      normalEffects.push(effect)
    }
  }

  // 先触发计算属性
  for (const effect of computedEffects) {
    triggerEffect(effect)
  }

  // 再触发普通 effect
  for (const effect of normalEffects) {
    triggerEffect(effect)
  }
}

function triggerEffect(effect: ReactiveEffect) {
  // 如果有调度器，使用调度器
  if (effect.scheduler) {
    effect.scheduler(effect.run.bind(effect))
  } else {
    // 否则直接执行
    effect.run()
  }
}
```

### 为什么要区分计算属性？

```typescript
const count = ref(1)
const doubled = computed(() => count.value * 2)

effect(() => {
  console.log('doubled:', doubled.value)
})

count.value = 2
```

如果先执行普通 effect：
1. effect 执行，访问 `doubled.value`
2. doubled 需要重新计算，但还没更新
3. effect 获取到旧值

如果先执行计算属性的 effect：
1. 计算属性的 effect 执行，将 `_dirty` 设为 true
2. 普通 effect 执行，访问 `doubled.value`
3. 因为 `_dirty` 为 true，重新计算，获取新值

## 嵌套 Effect

mini-vue 支持嵌套的 effect，通过保存和恢复 `activeEffect` 实现。

### 示例

```typescript
const state = reactive({ a: 1, b: 2 })

effect(() => {
  console.log('outer:', state.a)

  effect(() => {
    console.log('inner:', state.b)
  })
})

state.a++  // 只触发 outer effect
state.b++  // 只触发 inner effect
```

### 实现原理

```typescript
run() {
  // 保存上一个 activeEffect
  const lastActiveEffect = activeEffect

  // 设置当前 activeEffect
  activeEffect = this

  try {
    // 执行函数（可能包含嵌套的 effect）
    return this.fn()
  } finally {
    // 恢复上一个 activeEffect
    activeEffect = lastActiveEffect
  }
}
```

## 避免无限循环

当一个 effect 修改了自己依赖的值时，可能导致无限循环。

```typescript
const state = reactive({ count: 0 })

effect(() => {
  state.count++  // 修改了依赖的值
})
```

### 解决方案

在 `trigger` 时检查是否是当前正在执行的 effect：

```typescript
function triggerEffect(effect: ReactiveEffect) {
  // 避免无限循环
  if (effect !== activeEffect) {
    if (effect.scheduler) {
      effect.scheduler(effect.run.bind(effect))
    } else {
      effect.run()
    }
  }
}
```

或者使用 `allowRecurse` 标志允许递归：

```typescript
if (effect !== activeEffect || effect.allowRecurse) {
  // 执行 effect
}
```

## effectScope

`effectScope` 用于批量管理多个 effect，可以一次性停止所有 effect。

### 实现代码

```typescript
// packages/reactivity/src/effectScope.ts

let activeEffectScope: EffectScope | undefined

export class EffectScope {
  private _active = true
  private effects: ReactiveEffect[] = []
  private cleanups: (() => void)[] = []

  constructor(public detached = false) {
    // 如果不是独立的，添加到父 scope
    if (!detached && activeEffectScope) {
      activeEffectScope.effects.push(this as any)
    }
  }

  run<T>(fn: () => T): T {
    if (this._active) {
      const currentEffectScope = activeEffectScope
      try {
        activeEffectScope = this
        return fn()
      } finally {
        activeEffectScope = currentEffectScope
      }
    }
  }

  stop() {
    if (this._active) {
      // 停止所有 effect
      for (const effect of this.effects) {
        effect.stop()
      }
      // 执行清理函数
      for (const cleanup of this.cleanups) {
        cleanup()
      }
      this._active = false
    }
  }
}

export function effectScope(detached = false) {
  return new EffectScope(detached)
}
```

### 使用示例

```typescript
import { effectScope, reactive, effect } from 'vue'

const scope = effectScope()

scope.run(() => {
  const state = reactive({ count: 0 })

  effect(() => {
    console.log('effect1:', state.count)
  })

  effect(() => {
    console.log('effect2:', state.count)
  })
})

// 一次性停止所有 effect
scope.stop()
```

## 调度器详解

调度器允许控制副作用执行的时机和方式。

### 同步调度（默认）

```typescript
const state = reactive({ count: 0 })

effect(() => {
  console.log('effect:', state.count)
})

state.count = 1
state.count = 2
// 输出：
// effect: 0  (初始执行)
// effect: 1  (第一次触发)
// effect: 2  (第二次触发)
```

### 异步调度

```typescript
const state = reactive({ count: 0 })

effect(
  () => {
    console.log('effect:', state.count)
  },
  {
    scheduler(fn) {
      setTimeout(fn, 0)
    }
  }
)

state.count = 1
state.count = 2
// 输出：
// effect: 0  (初始执行)
// effect: 2  (只触发一次，因为异步执行时 count 已经是 2)
```

### 批量更新

结合 `queueJob` 实现批量更新：

```typescript
import { queueJob } from '@vue/runtime-core'

const state = reactive({ count: 0 })

effect(
  () => {
    console.log('effect:', state.count)
  },
  {
    scheduler(fn) {
      queueJob(fn)  // 放入队列，去重后执行
    }
  }
)

state.count = 1
state.count = 2
// 只输出一次: effect: 2
```

## 总结

`ReactiveEffect` 是 mini-vue 响应式系统的核心：

1. **依赖收集**：通过 `track()` 在 getter 中收集依赖
2. **触发更新**：通过 `trigger()` 在 setter 中触发更新
3. **调度器**：控制副作用执行的时机
4. **嵌套支持**：通过保存/恢复 `activeEffect` 支持
5. **停止机制**：可以手动停止副作用

## 下一步

- [reactive 响应式对象](./reactive响应式对象.md)：了解 Proxy 如何拦截对象操作
- [ref 响应式引用](./ref响应式引用.md)：理解 ref 的设计与实现