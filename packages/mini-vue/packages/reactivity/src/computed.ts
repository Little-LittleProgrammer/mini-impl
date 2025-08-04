import { isFunction } from '@vue/shared'
import { Dep } from './dep'
import { ReactiveEffect } from './effect'
import { trackRefValue, triggerRefValue } from './ref'

/**
 * 计算属性类
 */
export class ComputedRefImpl<T> {
	public dep?: Dep = undefined
	private _value!: T

	public readonly effect: ReactiveEffect<T>

	public readonly __v_isRef = true

	/**
	 * _dirty 属性用于标记当前计算属性的缓存值是否“脏”。
	 * 
	 * 具体作用如下：
	 * - 当 _dirty 为 true 时，表示依赖的响应式数据发生了变化，计算属性需要重新执行 getter 进行求值，并更新缓存的值。
	 * - 当 _dirty 为 false 时，表示依赖的数据没有变化，可以直接返回上一次缓存的计算结果，无需重新计算。
	 * 
	 * 工作流程：
	 * 1. 计算属性初始时 _dirty 为 true，首次访问 value 时会执行 getter，并将 _dirty 置为 false，缓存结果。
	 * 2. 当依赖的响应式数据发生变化时，会触发调度器，将 _dirty 重新置为 true，表示下次访问 value 时需要重新计算。
	 * 3. 这样可以实现“懒计算+缓存”，只有依赖变更时才重新计算，提升性能。
	 */
	public _dirty = true

	constructor(getter) {
		this.effect = new ReactiveEffect(getter, () => {
			// 判断当前脏的状态，如果为 false，表示需要触发依赖
			if (!this._dirty) {
				// 将脏置为 true，表示需要重新执行 run 方法，获取数据
				this._dirty = true
				triggerRefValue(this)
			}
		})
		this.effect.computed = this
	}

	get value() {
		// 收集依赖
		trackRefValue(this)
		// 判断当前脏的状态，如果为 true ，则表示需要重新执行 run，获取最新数据
		if (this._dirty) {
			this._dirty = false
			// 执行 run 函数
			this._value = this.effect.run()!
		}

		// 返回计算之后的真实值
		return this._value
	}
}

/**
 * 计算属性
 */
export function computed(getterOrOptions) {
	let getter

	// 判断传入的参数是否为一个函数
	const onlyGetter = isFunction(getterOrOptions)
	if (onlyGetter) {
		// 如果是函数，则赋值给 getter
		getter = getterOrOptions
	}

	const cRef = new ComputedRefImpl(getter)

	return cRef as any
}
