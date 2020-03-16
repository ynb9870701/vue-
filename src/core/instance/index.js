import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'
// Vue的定义 用Function实现的一个类 只能通过new Vue去实例化它
// 用Function实现的类 方便利于在 prototype 上扩展一些方法 这种方式用Class比较难实现
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 通过 new 关键字初始化，然后调用this._init方法
  // 该方法定义在 src/core/instance/init.js中
  this._init(options)
}

initMixin(Vue)
stateMixin(Vue)
eventsMixin(Vue)
lifecycleMixin(Vue)
renderMixin(Vue)

export default Vue
