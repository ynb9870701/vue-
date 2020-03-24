/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */

//  整个 optimize 的过程实际上就干2件事
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  
  // 标记静态节点
  markStatic(root)
  // second pass: mark static roots.

  // 标记静态根
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

function markStatic (node: ASTNode) {
  // isStatic 对一个 AST 元素节点是否是静态的一个判断
  node.static = isStatic(node)

  // 如果这个节点是一个普通元素
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }

    // 遍历它的所 children 递归执行 markStatic
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        node.static = false
      }
    }

    // 如果 ifConditions 不为空 则遍历 ifConditions 拿到所有条件中的 block
    // 也就是他们对应的 AST 节点 递归执行 markStatic 
    // 在这些递归过程中 一旦有子节点不是 static 的情况 则它的父节点的 static 均变成 false
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    // 对于已经是 static 的节点或者是 v-once 指令的节点，node.staticInFor = isInFor
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.

    // 对于 staticRoot 的判断逻辑
    // 从注释中可以看到，对于有资格成为 staticRoot 的节点，
    // 除了本身是一个静态节点外，必须满足拥有 children，并且 children 不能只是一个文本节点
    // 不然的话把它标记成静态根节点的收益就很小了。
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }

    // 遍历 children 以及 ifConditions，递归执行 markStaticRoots。
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

function isStatic (node: ASTNode): boolean {

  // 如果是表达式 就是非静态的
  if (node.type === 2) { // expression
    return false
  }

  // 如果是纯文本 就是静态的
  if (node.type === 3) { // text
    return true
  }

  // 对于一个普通元素 如果有 pre 属性，那么它使用了 v-pre 指令 是静态
  // 否则要同时满足以下条件：
  // 没有使用 v-if、v-for、没有使用其他指令、非内置组件，是平台保留的标签
  // 非带有 v-for 的 template 标签的直接子节点、节点的所有属性的 key 都满足静态 key
  // 以上都满足 则这个 AST 节点是一个静态节点
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
