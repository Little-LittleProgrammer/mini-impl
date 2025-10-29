// 对应 promise 的 pending 状态
let isFlushPending = false

/**
 * promise.resolve()
 */
const resolvedPromise = Promise.resolve() as Promise<any>
/**
 * 当前的执行任务
 */
let currentFlushPromise: Promise<void> | null = null

/**
 * 待执行的任务队列
 */
const pendingPreFlushCbs: Function[] = []

/**
 * 队列预处理函数
 * 将 job 加入微任务队列中,保证同一个时间段多个副作用只执行1次，避免重复计算和渲染
 * ```javascript
    const count = ref(0)
    const double = computed(() => count.value * 2)

    // 在一个函数里连续修改多次
    count.value++ // 变化1
    count.value++ // 变化2
    count.value++ // 变化3
    // 我们希望 double 只重新计算一次，而不是三次
    count.value++
    ```
 */
export function queuePreFlushCb(cb: Function) {
	queueCb(cb, pendingPreFlushCbs)
}

/**
 * 队列处理函数
 */
function queueCb(cb: Function, pendingQueue: Function[]) {
	// 将所有的回调函数，放入队列中
	pendingQueue.push(cb)
	queueFlush()
}

/**
 * 依次处理队列中执行函数
 */
function queueFlush() {
	if (!isFlushPending) {
		isFlushPending = true
		currentFlushPromise = resolvedPromise.then(flushJobs)
	}
}

/**
 * 处理队列
 */
function flushJobs() {
	isFlushPending = false
	flushPreFlushCbs()
}

/**
 * 依次处理队列中的任务
 */
export function flushPreFlushCbs() {
	if (pendingPreFlushCbs.length) {
		// 去重
		let activePreFlushCbs = [...new Set(pendingPreFlushCbs)]
		// 清空就数据
		pendingPreFlushCbs.length = 0
		// 循环处理
		for (let i = 0; i < activePreFlushCbs.length; i++) {
			activePreFlushCbs[i]()
		}
	}
}
