import { defineStore } from 'pinia'
import { ref } from 'vue'

// Factory: returns a store scoped by persist-key
export function useCounterStore(persistKey?: string) {
  const storeId = persistKey ? `counter:${persistKey}` : 'counter'

  return defineStore(storeId, () => {
    const count = ref(0)
    const history = ref<number[]>([])

    function increment() {
      count.value++
      history.value.push(count.value)
    }

    function decrement() {
      count.value--
      history.value.push(count.value)
    }

    function reset() {
      count.value = 0
      history.value = []
    }

    return { count, history, increment, decrement, reset }
  }, {
    wippyPersist: persistKey ? { scope: persistKey } : true,
  })()
}
