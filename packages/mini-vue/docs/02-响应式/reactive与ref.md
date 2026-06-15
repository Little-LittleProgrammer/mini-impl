# reactive 与 ref

`reactive` 负责对象代理，`ref` 负责把一个值包成可追踪的 `.value` 容器。

## `reactive`

入口在 `packages/mini-vue/packages/reactivity/src/reactive.ts`：

```text
reactive(target)
  -> createReactiveObject(target, mutableHandlers, reactiveMap)
  -> 如果 target 已有 proxy，复用
  -> new Proxy(target, mutableHandlers)
  -> 缓存 target -> proxy
```

### `get`

`baseHandlers.ts` 中的 `get` 做三件事：

```text
Reflect.get(target, key, receiver)
track(target, key)
如果结果是对象，toReactive(res)
```

因此深层响应式不是初始化时一次性递归完成，而是访问到嵌套对象时再包装。

### `set`

`set` 做三件事：

```text
Reflect.set(target, key, value, receiver)
trigger(target, key)
return result
```

当前没有区分新增属性和修改属性，也没有判断新旧值是否真正变化。只要经过 setter，就会触发对应 key 的依赖。

### `ReactiveFlags.IS_REACTIVE`

创建 proxy 后代码会写入：

```ts
proxy[ReactiveFlags.IS_REACTIVE] = true
```

`isReactive(value)` 就通过这个标记判断。这个实现简单，但也意味着它会触发一次 proxy 的 set 逻辑，属于教学实现里的简化写法。

## `ref`

`ref(value)` 会创建 `RefImpl`：

```text
ref(value)
  -> createRef(value, false)
  -> new RefImpl(value, false)
```

`RefImpl` 内部保存两个值：

- `_rawValue`：原始值，用于比较是否变化。
- `_value`：对外读取的值，如果是对象会转成 reactive。

### 读取 `.value`

```text
get value
  -> trackRefValue(this)
  -> return _value
```

`ref` 不走 `targetMap`，而是每个 `RefImpl` 自己持有一个 `dep`。

### 写入 `.value`

```text
set value(newVal)
  -> hasChanged(newVal, _rawValue)
  -> 更新 _rawValue
  -> 更新 _value
  -> triggerRefValue(this)
```

和 `reactive.set` 不同，`ref` 写入时会用 `Object.is` 语义判断是否变化，没变则不触发。

## `reactive` 和 `ref` 的选择

在当前实现里：

- 对象状态用 `reactive`。
- 原始值或独立值容器用 `ref`。
- `ref` 里如果放对象，非浅层模式下仍会通过 `toReactive` 变成 reactive。

## 当前边界

`reactive` 缺少：

- `readonly`
- `shallowReactive`
- `shallowReadonly`
- `markRaw`
- `toRaw`
- 数组方法追踪优化
- Map/Set/WeakMap/WeakSet 专门处理
- `deleteProperty`、`has`、`ownKeys` 追踪
- 新增和删除属性的不同触发类型

`ref` 缺少：

- `shallowRef`
- `triggerRef`
- `customRef`
- `toRef`
- `toRefs`
- `unref`
- `proxyRefs`

## 易混点

`ref` 的依赖挂在 `ref.dep` 上，`reactive` 的依赖挂在全局 `targetMap` 上。这是两套不同的收集入口，但最终 dep 都是 `Set<ReactiveEffect>`，触发时都走 `triggerEffects(dep)`。
