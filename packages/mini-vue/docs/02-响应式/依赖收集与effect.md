# 依赖收集与 effect

这一篇解释 `effect.ts` 中的核心机制：`ReactiveEffect`、`activeEffect`、`track`、`trigger`。

## 核心对象

```ts
export class ReactiveEffect<T = any> {
  computed?: ComputedRefImpl<T>

  constructor(
    public fn: () => T,
    public scheduler: EffectScheduler | null = null
  ) {}

  run() {
    activeEffect = this
    return this.fn()
  }

  stop() {}
}
```

当前 `ReactiveEffect` 只是一个副作用函数包装器：

- `fn` 是真正要执行的函数。
- `scheduler` 用来把执行权交给外部队列。
- `computed` 用来标记这是 computed 内部 effect。
- `run()` 设置全局 `activeEffect`，再执行 `fn`。

## `effect(fn, options)` 做了什么

```text
effect(fn, options)
  -> new ReactiveEffect(fn)
  -> extend(_effect, options)
  -> 如果不是 lazy，立即 _effect.run()
```

当前实现没有返回 runner，这一点和完整 Vue 不同。完整 Vue 的 `effect` 会返回一个可手动调用的 runner，并且 runner 上能访问内部 effect。

## `track(target, key)`

`track` 发生在 `Proxy.get` 里。

```text
track(target, key)
  -> 如果没有 activeEffect，返回
  -> targetMap.get(target)
  -> depsMap.get(key)
  -> dep.add(activeEffect)
```

第一次读取某个 `target/key` 时，会逐层创建：

```text
WeakMap targetMap
  -> Map depsMap
    -> Set dep
```

## `trigger(target, key)`

`trigger` 发生在 `Proxy.set` 里。

```text
trigger(target, key)
  -> targetMap.get(target)
  -> depsMap.get(key)
  -> triggerEffects(dep)
```

`triggerEffects` 会先把 dep 转成数组，再分两轮执行：

1. 先触发 `effect.computed`。
2. 再触发普通 effect。

这么做的目的是让 computed 在普通渲染 effect 读取它之前先变成“脏”，避免普通 effect 读到旧缓存。

## `scheduler` 的意义

没有 scheduler 时：

```text
trigger -> effect.run()
```

有 scheduler 时：

```text
trigger -> effect.scheduler()
```

组件更新就是第二种。组件 effect 的 scheduler 会调用：

```text
queuePreFlushCb(update)
```

这样连续多次状态变化不会同步重复渲染，而是进入微任务队列统一刷新。

## 当前实现的风险点

### `activeEffect` 没有栈

如果 effect 内部再执行另一个 effect，内层 effect 会覆盖全局 `activeEffect`。完整实现需要 effect stack 来恢复父 effect。

### 没有依赖清理

例如：

```ts
effect(() => {
  if (state.ok) {
    state.a
  } else {
    state.b
  }
})
```

当 `ok` 从 true 变 false 后，完整实现应该把这个 effect 从 `a` 的 dep 中清掉。当前版本没有记录 effect 反向依赖，也没有 cleanup。

### `stop()` 是空实现

`ReactiveEffect.stop()` 目前没有任何行为。因此：

- 手动停止 effect 不生效。
- `watch` 返回的 stop 函数不生效。
- 组件卸载时也无法清理渲染 effect。

## 和完整 Vue 的关键差距

完整 Vue 的响应式 effect 至少还要处理：

- effect 栈。
- 依赖 cleanup。
- effect active 状态。
- `onStop`。
- 递归触发保护。
- 调试钩子 `onTrack/onTrigger`。
- 批量追踪优化。

mini-vue 这里保留的是最小可读模型：先理解 dep 图，再理解完整 Vue 的工程化优化。
