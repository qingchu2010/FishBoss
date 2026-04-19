import { ref } from 'vue'
import type { Ref } from 'vue'

export interface UseAsyncStateOptions<T> {
  immediate?: boolean
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
}

export function useAsyncState<T>(
  asyncFn: () => Promise<T>,
  options: UseAsyncStateOptions<T> = {}
) {
  const data: Ref<T | null> = ref(null)
  const error: Ref<Error | null> = ref(null)
  const isLoading: Ref<boolean> = ref(false)

  async function execute() {
    isLoading.value = true
    error.value = null
    try {
      const result = await asyncFn()
      data.value = result
      options.onSuccess?.(result)
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      options.onError?.(error.value)
    } finally {
      isLoading.value = false
    }
  }

  if (options.immediate) {
    execute()
  }

  return {
    data,
    error,
    isLoading,
    execute
  }
}
