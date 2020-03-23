/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// 继承了 Array
export const arrayMethods = Object.create(arrayProto)

// 数组中 7 个能改变数组自身的方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
// 遍历 对这些方法进行重写
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    // 首先会进行本身原有的逻辑
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    // 并对能增加数组长度的3个方法进行判断
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 获取到新插入的值 然后将新添加的值变为一个响应式对象
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 并且再调用 ob.dep.notify() 方法手动触发依赖通知
    ob.dep.notify()
    return result
  })
})
