# computed 与 watch

`computed` 和 `watch` 都建立在 `ReactiveEffect` 上，但目标不同：`computed` 产出一个可缓存的派生值，`watch` 在 source 变化后执行回调。

## computed

入口在 `packages/mini-vue/packages/reactivity/src/computed.ts`。

### 创建过程

```text
computed(getter)
  -> new ComputedRefImpl(getter)
  -> new ReactiveEffect(getter, scheduler)
  -> effect.computed = this
```

当前只支持函数 getter，不支持 `{ get, set }`。

### `_dirty`

`ComputedRefImpl` 有一个 `_dirty` 标记：

- 初始为 `true`。
- 第一次读取 `value` 时执行 getter，并缓存到 `_value`。
- 执行后 `_dirty = false`。
- 依赖变化时 scheduler 把 `_dirty` 改回 `true`。

### 读取 `.value`

```text
get value
  -> trackRefValue(this)
  -> 如果 _dirty，effect.run() 重新求值
  -> 返回 _value
```

computed 本身也像 ref 一样有 `dep`，所以别的 effect 读取 computed 时，也会依赖 computed 的 `.value`。

### 依赖变化时

computed 内部 effect 的 scheduler 是：

```text
如果当前不是 dirty
  -> _dirty = true
  -> triggerRefValue(this)
```

这说明依赖变更时不会立刻重新计算，而是先标脏。下一次有人读 `.value` 时才重新求值。

## watch

入口在 `packages/runtime-core/src/apiWatch.ts`。它放在 `runtime-core` 里，而不是 `reactivity` 包里。

### 当前支持的 source

稳定支持的是 reactive 对象：

```text
if (isReactive(source)) {
  getter = () => source
  deep = true
}
```

如果不是 reactive，对应 `getter = () => {}`。因此当前版本不要把它理解成完整 Vue 的 `watch`。

### deep 的实现

如果 `deep` 为 true，会把 getter 包一层：

```text
getter = () => traverse(baseGetter())
```

`traverse` 会递归访问对象、数组、Map、Set 的内部值。它的目的不是做深比较，而是主动读取每一层属性，让这些属性的 getter 触发 `track`。

### immediate

有 `immediate` 时：

```text
job()
```

没有 `immediate` 时：

```text
oldValue = effect.run()
```

也就是说非 immediate 情况会先执行一次 getter 收集依赖，但不会调用回调。

### 调度

watch 的 scheduler 是：

```text
queuePreFlushCb(job)
```

source 变化后不会同步调用回调，而是进入微任务队列。

## 关键边界

`computed` 缺少：

- writable computed。
- getter/setter options。
- debug options。
- 更完整的依赖传播优化。

`watch` 缺少：

- `ref` source。
- getter source。
- 多 source 数组。
- `watchEffect`。
- `flush: 'pre' | 'post' | 'sync'`。
- cleanup / `onInvalidate`。
- 真正有效的 stop。

最后一点尤其重要：`watch` 返回的函数会调用 `effect.stop()`，但 `ReactiveEffect.stop()` 目前是空实现，所以停止监听并未真正完成。
