/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    // 如果是一个渲染 Watcher
    if (isRenderWatcher) {
      // 将当前实例赋值给 vm._watcher
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    // computed watcher
    this.dirty = this.lazy // for lazy watchers
    // 一些 Dep 相关的属性
    // deps 和 newDeps 表示 Watcher 实例持有的 Dep 实例的数组
    this.deps = []
    this.newDeps = []
    // depIds 和 newDepIds 分别代表 deps 和 newDeps 的id
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 当实例化一个渲染 watcher 的时候 首先会进入 watcher 的构造函数逻辑
    // 然后会执行 this.get 方法
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // 把 Dep.target 赋值为当前的 watcher 并压栈
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 深度观测
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      // 依赖清空
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 做一些逻辑判断(保证同一数据不会被添加多次)
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 把当前的 watcher 订阅到这个数据持有的 dep 的 subs 中
        // 为后续数据变化时候能通知那些 subs 做准备
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  /**
   * 考虑到 Vue 是数据驱动的，所以每次数据变化都会重新 render，
   * 那么 vm._render() 方法又会再次执行，并再次触发数据的 getters，
   * 所以 Wathcer 在构造函数中会初始化 2 个 Dep 实例数组，
   * newDeps 表示新添加的 Dep 实例数组，
   * 而 deps 表示上一次添加的 Dep 实例数组。
   */
   cleanupDeps () {
    let i = this.deps.length
    /**
     * 在执行 cleanupDeps 函数的时候，
     * 会首先遍历 deps 移除对 dep.subs 数组中 Wathcer 的订阅，
     * 然后把 newDepIds 和 depIds 交换，newDeps 和 deps 交换，
     * 并把 newDepIds 和 newDeps 清空。
     */
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      // 设置了 sync 就会在当前 tick 中同步执行 watcher 的回调函数
      // 只有当需要 watch 的值的变化到之心 watcher 的回调函数是一个同步过程的时候 才会去设置该属性
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      const value = this.get()
      // 如果满足新旧值不等、新值是对象类型、deep 模式任何一个条件，则执行 watcher 的回调
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          try {
            // 回调函数执行的时候会把第一个和第二个参数传入新值 value 和旧值 oldValue，
            // 这就是当我们添加自定义 watcher 的时候能在回调函数的参数中拿到新旧值的原因。
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
