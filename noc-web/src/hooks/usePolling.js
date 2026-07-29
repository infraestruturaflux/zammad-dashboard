import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Faz polling de uma fetchFn com intervalo em ms.
 * - intervalMs = 0  → busca uma vez, sem polling automático (datas históricas)
 * - intervalMs > 0  → busca + repete no intervalo dado
 *
 * Quando fetchFn muda (ex: troca de data) a busca roda novamente, mas
 * os dados anteriores ficam visíveis até a resposta chegar — sem flash.
 */
export function usePolling(fetchFn, intervalMs = 30_000) {
  // null ou 0 = sem polling (uma só busca)
  intervalMs = intervalMs || 0
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const timerRef  = useRef(null)
  const prevFnRef = useRef(null)

  const fetch = useCallback(async () => {
    try {
      const result = await fetchFn()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [fetchFn])

  useEffect(() => {
    // Limpa intervalo anterior
    if (timerRef.current) clearInterval(timerRef.current)

    // Se a fetchFn mudou (troca de data) mas já tínhamos dados,
    // mostra indicador de loading sutil sem apagar o conteúdo
    if (prevFnRef.current !== null && prevFnRef.current !== fetchFn) {
      setLoading(true)
    }
    prevFnRef.current = fetchFn

    // Busca imediata
    fetch()

    // Polling contínuo apenas quando intervalMs > 0
    if (intervalMs > 0) {
      timerRef.current = setInterval(fetch, intervalMs)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetch, intervalMs])

  return { data, loading, error }
}
