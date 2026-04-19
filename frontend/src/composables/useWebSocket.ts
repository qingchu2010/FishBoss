import { ref, onUnmounted, type Ref } from 'vue'

export interface UseWebSocketOptions {
  onMessage?: (data: unknown) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const socket: Ref<WebSocket | null> = ref(null)
  const isConnected = ref(false)

  function connect() {
    socket.value = new WebSocket(url)

    socket.value.onopen = () => {
      isConnected.value = true
      options.onOpen?.()
    }

    socket.value.onclose = () => {
      isConnected.value = false
      options.onClose?.()
    }

    socket.value.onerror = (error: Event) => {
      options.onError?.(error)
    }

    socket.value.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        options.onMessage?.(data)
      } catch {
        options.onMessage?.(event.data)
      }
    }
  }

  function disconnect() {
    socket.value?.close()
  }

  function send(data: unknown) {
    if (socket.value && isConnected.value) {
      socket.value.send(typeof data === 'string' ? data : JSON.stringify(data))
    }
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    socket,
    isConnected,
    connect,
    disconnect,
    send
  }
}
